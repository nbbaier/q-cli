import { describe, expect, test } from "bun:test";
import { detectsContext } from "./context";

describe("detectsContext", () => {
	describe("should detect context references", () => {
		test("last command patterns", () => {
			expect(detectsContext("run last command")).toBe(true);
			expect(detectsContext("show me the last query")).toBe(true);
			expect(detectsContext("modify the previous command")).toBe(true);
			expect(detectsContext("repeat earlier command")).toBe(true);
		});

		test("reference patterns with 'that'", () => {
			expect(detectsContext("run that again")).toBe(true);
			expect(detectsContext("do that again")).toBe(true);
			expect(detectsContext("execute that again")).toBe(true);
			expect(detectsContext("modify that")).toBe(true);
			expect(detectsContext("change that")).toBe(true);
		});

		test("'same but' patterns", () => {
			expect(detectsContext("same but with sudo")).toBe(true);
			expect(detectsContext("same but for python")).toBe(true);
		});

		test("'those' references", () => {
			expect(detectsContext("run those commands")).toBe(true);
		});
	});

	describe("should not detect context in regular queries", () => {
		test("simple commands", () => {
			expect(detectsContext("list all files")).toBe(false);
			expect(detectsContext("show current directory")).toBe(false);
			expect(detectsContext("print hello world")).toBe(false);
		});

		test("queries with partial matches", () => {
			expect(detectsContext("command to list files")).toBe(false);
			expect(detectsContext("that file over there")).toBe(false);
			expect(detectsContext("run the tests")).toBe(false);
		});

		test("edge cases", () => {
			expect(detectsContext("")).toBe(false);
			expect(detectsContext("   ")).toBe(false);
		});
	});

	describe("case insensitivity", () => {
		test("handles uppercase", () => {
			expect(detectsContext("RUN LAST COMMAND")).toBe(true);
			expect(detectsContext("SAME BUT with flags")).toBe(true);
		});

		test("handles mixed case", () => {
			expect(detectsContext("Run That Again")).toBe(true);
			expect(detectsContext("Modify THAT")).toBe(true);
		});
	});
});
