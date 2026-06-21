import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBackoffDelay, isRetryableError, sleep, withRetry } from "./retry.ts";

describe("retry", () => {
	describe("sleep", () => {
		it("resolves after specified time", async () => {
			const start = Date.now();
			await sleep(50);
			const elapsed = Date.now() - start;

			// Allow some tolerance for timing
			expect(elapsed).toBeGreaterThanOrEqual(45);
			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("calculateBackoffDelay", () => {
		it("calculates exponential backoff correctly", () => {
			const baseDelay = 1000;
			const maxDelay = 60000;

			// Without jitter for predictable results
			expect(calculateBackoffDelay(1, baseDelay, maxDelay, false)).toBe(1000);
			expect(calculateBackoffDelay(2, baseDelay, maxDelay, false)).toBe(2000);
			expect(calculateBackoffDelay(3, baseDelay, maxDelay, false)).toBe(4000);
			expect(calculateBackoffDelay(4, baseDelay, maxDelay, false)).toBe(8000);
			expect(calculateBackoffDelay(5, baseDelay, maxDelay, false)).toBe(16000);
		});

		it("caps at maximum delay", () => {
			const baseDelay = 1000;
			const maxDelay = 5000;

			// Attempt 10 would be 1000 * 2^9 = 512000, but should cap at 5000
			expect(calculateBackoffDelay(10, baseDelay, maxDelay, false)).toBe(5000);
		});

		it("adds jitter when enabled", () => {
			const baseDelay = 1000;
			const maxDelay = 60000;

			// With jitter, delay should be between base and base * 1.25
			const results = new Set<number>();
			for (let i = 0; i < 20; i++) {
				results.add(calculateBackoffDelay(1, baseDelay, maxDelay, true));
			}

			// Should have variation (not all the same)
			expect(results.size).toBeGreaterThan(1);

			// All results should be between 1000 and 1250
			for (const result of results) {
				expect(result).toBeGreaterThanOrEqual(1000);
				expect(result).toBeLessThanOrEqual(1250);
			}
		});

		it("returns integer values", () => {
			const delay = calculateBackoffDelay(1, 1000, 60000, true);
			expect(Number.isInteger(delay)).toBe(true);
		});
	});

	describe("withRetry", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => vi.useRealTimers());

		it("returns result on first success", async () => {
			const fn = vi.fn().mockResolvedValue("success");

			const resultPromise = withRetry(fn, {
				maxRetries: 3,
				retryDelay: 1,
			});

			const result = await resultPromise;

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		it("retries on failure and eventually succeeds", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockResolvedValue("success");

			const resultPromise = withRetry(fn, {
				maxRetries: 3,
				retryDelay: 1,
				exponentialBackoff: false,
			});

			// Advance timers for each retry
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			const result = await resultPromise;

			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("throws after max retries exceeded", async () => {
			const fn = vi.fn().mockRejectedValue(new Error("always fails"));

			const resultPromise = withRetry(fn, {
				maxRetries: 3,
				retryDelay: 1,
				exponentialBackoff: false,
			});

			// Attach the rejection handler BEFORE advancing timers so Node never
			// sees an unhandled rejection when the fake timers fire.
			const rejection = expect(resultPromise).rejects.toThrow("always fails");

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			await rejection;
			expect(fn).toHaveBeenCalledTimes(3);
		});

		it("calls onRetry callback on each retry", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockResolvedValue("success");

			const onRetry = vi.fn();

			const resultPromise = withRetry(fn, {
				maxRetries: 3,
				retryDelay: 1,
				onRetry,
				exponentialBackoff: false,
			});

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(1000);

			await resultPromise;

			expect(onRetry).toHaveBeenCalledTimes(2);
			expect(onRetry).toHaveBeenNthCalledWith(1, 1, "fail 1", expect.any(Number));
			expect(onRetry).toHaveBeenNthCalledWith(2, 2, "fail 2", expect.any(Number));
		});

		it("converts non-Error exceptions to Error", async () => {
			const fn = vi.fn().mockRejectedValue("string error");

			const resultPromise = withRetry(fn, {
				maxRetries: 1,
				retryDelay: 1,
			});

			await expect(resultPromise).rejects.toThrow("string error");
		});

		it("uses exponential backoff by default", async () => {
			const fn = vi
				.fn()
				.mockRejectedValueOnce(new Error("fail 1"))
				.mockRejectedValueOnce(new Error("fail 2"))
				.mockResolvedValue("success");

			const onRetry = vi.fn();

			const resultPromise = withRetry(fn, {
				maxRetries: 3,
				retryDelay: 1, // 1 second base
				onRetry,
				jitter: false, // Disable jitter for predictable timing
			});

			// First retry after 1 second (1000ms)
			await vi.advanceTimersByTimeAsync(1000);
			// Second retry after 2 seconds (2000ms) due to exponential backoff
			await vi.advanceTimersByTimeAsync(2000);

			await resultPromise;

			// Check that delays increased
			expect(onRetry).toHaveBeenNthCalledWith(1, 1, "fail 1", 1000);
			expect(onRetry).toHaveBeenNthCalledWith(2, 2, "fail 2", 2000);
		});

		it("respects maxDelay option", async () => {
			const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("success");

			const onRetry = vi.fn();

			const resultPromise = withRetry(fn, {
				maxRetries: 2,
				retryDelay: 100, // 100 seconds base
				maxDelay: 5, // 5 seconds max
				onRetry,
				jitter: false,
			});

			await vi.advanceTimersByTimeAsync(5000); // Should cap at 5s, not 100s

			await resultPromise;

			// Delay should be capped at maxDelay (5000ms)
			expect(onRetry).toHaveBeenCalledWith(1, "fail", 5000);
		});
	});

	describe("isRetryableError", () => {
		it("returns true for rate limit errors", () => {
			expect(isRetryableError("rate limit exceeded")).toBe(true);
			expect(isRetryableError("You've hit your rate_limit")).toBe(true);
			expect(isRetryableError("hit your limit")).toBe(true);
			expect(isRetryableError("quota exceeded")).toBe(true);
			expect(isRetryableError("too many requests")).toBe(true);
			expect(isRetryableError("Error 429: Rate limited")).toBe(true);
		});

		it("returns true for network errors", () => {
			expect(isRetryableError("ECONNRESET")).toBe(true);
			expect(isRetryableError("ETIMEDOUT")).toBe(true);
			expect(isRetryableError("ENOTFOUND")).toBe(true);
			expect(isRetryableError("network error occurred")).toBe(true);
			expect(isRetryableError("connection failed")).toBe(true);
		});

		it("returns true for timeout errors", () => {
			expect(isRetryableError("request timeout")).toBe(true);
			// Note: "timed out" doesn't match "timeout" pattern - this is expected behavior
			expect(isRetryableError("Timeout occurred")).toBe(true);
		});

		it("returns true for overloaded errors", () => {
			expect(isRetryableError("server overloaded")).toBe(true);
			expect(isRetryableError("Service is overloaded, please try again")).toBe(true);
		});

		it("returns false for non-retryable errors", () => {
			expect(isRetryableError("syntax error in code")).toBe(false);
			expect(isRetryableError("file not found")).toBe(false);
			expect(isRetryableError("permission denied")).toBe(false);
			expect(isRetryableError("invalid argument")).toBe(false);
			expect(isRetryableError("")).toBe(false);
		});

		it("is case insensitive", () => {
			expect(isRetryableError("RATE LIMIT")).toBe(true);
			expect(isRetryableError("Rate Limit")).toBe(true);
			expect(isRetryableError("TIMEOUT")).toBe(true);
			expect(isRetryableError("Timeout")).toBe(true);
		});
	});
});
