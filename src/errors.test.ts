import { describe, expect, test } from "bun:test";
import { analyzeError } from "./errors";

describe("errors", () => {
	describe("analyzeError", () => {
		test("detects API key errors", () => {
			const cases = [
				new Error("API key not found"),
				new Error("Invalid API key"),
				new Error("401 Unauthorized"),
				new Error("Authentication failed"),
			];

			for (const error of cases) {
				const info = analyzeError(error);
				expect(info.type).toBe("api_key_missing");
				expect(info.suggestion).toBeDefined();
			}
		});

		test("detects rate limit errors", () => {
			const cases = [
				new Error("Rate limit exceeded"),
				new Error("429 Too Many Requests"),
			];

			for (const error of cases) {
				const info = analyzeError(error);
				expect(info.type).toBe("rate_limit");
				expect(info.suggestion).toBeDefined();
			}
		});

		test("detects network errors", () => {
			const cases = [
				new Error("fetch failed"),
				new Error("ECONNREFUSED"),
				new Error("ENOTFOUND"),
				new Error("ETIMEDOUT"),
				new Error("Network error"),
				new Error("socket hang up"),
			];

			for (const error of cases) {
				const info = analyzeError(error);
				expect(info.type).toBe("network_error");
				expect(info.suggestion).toBeDefined();
			}
		});

		test("detects server errors", () => {
			const cases = [
				new Error("500 Internal Server Error"),
				new Error("502 Bad Gateway"),
				new Error("503 Service Unavailable"),
				new Error("504 Gateway Timeout"),
			];

			for (const error of cases) {
				const info = analyzeError(error);
				expect(info.type).toBe("api_error");
				expect(info.suggestion).toBeDefined();
			}
		});

		test("detects quota errors", () => {
			const cases = [
				new Error("Quota exceeded"),
				new Error("Billing issue"),
				new Error("Insufficient credits"),
			];

			for (const error of cases) {
				const info = analyzeError(error);
				expect(info.type).toBe("api_error");
				expect(info.suggestion).toBeDefined();
			}
		});

		test("handles unknown errors", () => {
			const info = analyzeError(new Error("Something unexpected happened"));
			expect(info.type).toBe("unknown");
			expect(info.message).toBe("Something unexpected happened");
		});

		test("handles non-Error values", () => {
			expect(analyzeError("string error").type).toBe("unknown");
			expect(analyzeError(123).type).toBe("unknown");
			expect(analyzeError(null).type).toBe("unknown");
		});

		test("preserves original message", () => {
			const error = new Error("Custom error message");
			const info = analyzeError(error);
			expect(info.message).toContain("Custom error message");
		});
	});
});
