import { describe, expect, test } from "bun:test";
import { isRetryableError, withRetry } from "./retry";

describe("retry", () => {
	describe("isRetryableError", () => {
		test("returns true for network errors", () => {
			expect(isRetryableError(new Error("fetch failed"))).toBe(true);
			expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
			expect(isRetryableError(new Error("ENOTFOUND"))).toBe(true);
			expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
			expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
			expect(isRetryableError(new Error("socket hang up"))).toBe(true);
			expect(isRetryableError(new Error("network error occurred"))).toBe(true);
		});

		test("returns true for rate limit errors", () => {
			expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
			expect(isRetryableError(new Error("429 Too Many Requests"))).toBe(true);
		});

		test("returns true for server errors", () => {
			expect(isRetryableError(new Error("500 Internal Server Error"))).toBe(
				true,
			);
			expect(isRetryableError(new Error("502 Bad Gateway"))).toBe(true);
			expect(isRetryableError(new Error("503 Service Unavailable"))).toBe(true);
			expect(isRetryableError(new Error("504 Gateway Timeout"))).toBe(true);
		});

		test("returns false for client errors", () => {
			expect(isRetryableError(new Error("400 Bad Request"))).toBe(false);
			expect(isRetryableError(new Error("401 Unauthorized"))).toBe(false);
			expect(isRetryableError(new Error("403 Forbidden"))).toBe(false);
			expect(isRetryableError(new Error("404 Not Found"))).toBe(false);
		});

		test("returns false for non-Error values", () => {
			expect(isRetryableError("string error")).toBe(false);
			expect(isRetryableError(null)).toBe(false);
			expect(isRetryableError(undefined)).toBe(false);
			expect(isRetryableError(123)).toBe(false);
		});
	});

	describe("withRetry", () => {
		test("returns result on first success", async () => {
			let callCount = 0;
			const result = await withRetry(async () => {
				callCount++;
				return "success";
			});

			expect(result).toBe("success");
			expect(callCount).toBe(1);
		});

		test("retries on retryable errors", async () => {
			let callCount = 0;
			const result = await withRetry(
				async () => {
					callCount++;
					if (callCount < 3) {
						throw new Error("fetch failed");
					}
					return "success after retries";
				},
				{
					maxRetries: 3,
					initialDelayMs: 10, // Short delay for tests
				},
			);

			expect(result).toBe("success after retries");
			expect(callCount).toBe(3);
		});

		test("throws after max retries exceeded", async () => {
			let callCount = 0;

			await expect(
				withRetry(
					async () => {
						callCount++;
						throw new Error("fetch failed");
					},
					{
						maxRetries: 2,
						initialDelayMs: 10,
					},
				),
			).rejects.toThrow("fetch failed");

			expect(callCount).toBe(3); // Initial + 2 retries
		});

		test("does not retry non-retryable errors", async () => {
			let callCount = 0;

			await expect(
				withRetry(
					async () => {
						callCount++;
						throw new Error("400 Bad Request");
					},
					{
						maxRetries: 3,
						initialDelayMs: 10,
					},
				),
			).rejects.toThrow("400 Bad Request");

			expect(callCount).toBe(1); // No retries
		});

		test("calls onRetry callback", async () => {
			const retryAttempts: number[] = [];

			await withRetry(
				async () => {
					if (retryAttempts.length < 2) {
						throw new Error("fetch failed");
					}
					return "success";
				},
				{
					maxRetries: 3,
					initialDelayMs: 10,
					onRetry: (attempt) => {
						retryAttempts.push(attempt);
					},
				},
			);

			expect(retryAttempts).toEqual([1, 2]);
		});

		test("uses custom isRetryable function", async () => {
			let callCount = 0;

			await expect(
				withRetry(
					async () => {
						callCount++;
						throw new Error("custom error");
					},
					{
						maxRetries: 3,
						initialDelayMs: 10,
						isRetryable: (error) =>
							error instanceof Error && error.message === "custom error",
					},
				),
			).rejects.toThrow("custom error");

			expect(callCount).toBe(4); // Initial + 3 retries
		});

		test("respects maxDelayMs", async () => {
			const delays: number[] = [];

			try {
				await withRetry(
					async () => {
						throw new Error("fetch failed");
					},
					{
						maxRetries: 5,
						initialDelayMs: 100,
						maxDelayMs: 150,
						backoffMultiplier: 2,
						onRetry: (_attempt, _error, delay) => {
							delays.push(delay);
						},
					},
				);
			} catch {
				// Expected to throw
			}

			// All delays should be <= maxDelayMs (plus jitter)
			for (const delay of delays) {
				expect(delay).toBeLessThanOrEqual(165); // 150 + 10% jitter
			}
		});
	});
});
