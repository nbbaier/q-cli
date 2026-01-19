/**
 * Retry utility for handling transient failures
 * Uses exponential backoff with configurable options
 */

export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Initial delay in ms (default: 1000) */
	initialDelayMs?: number;
	/** Maximum delay in ms (default: 10000) */
	maxDelayMs?: number;
	/** Multiplier for exponential backoff (default: 2) */
	backoffMultiplier?: number;
	/** Function to determine if error is retryable (default: network/rate limit errors) */
	isRetryable?: (error: unknown) => boolean;
	/** Called when a retry occurs */
	onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> & {
	onRetry?: RetryOptions["onRetry"];
} = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 10000,
	backoffMultiplier: 2,
	isRetryable: isRetryableError,
};

/**
 * Default implementation for checking if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// Network errors
		if (
			message.includes("network") ||
			message.includes("econnrefused") ||
			message.includes("enotfound") ||
			message.includes("etimedout") ||
			message.includes("econnreset") ||
			message.includes("socket hang up") ||
			message.includes("fetch failed")
		) {
			return true;
		}

		// Rate limit errors (HTTP 429)
		if (message.includes("rate limit") || message.includes("429")) {
			return true;
		}

		// Server errors (5xx)
		if (
			message.includes("500") ||
			message.includes("502") ||
			message.includes("503") ||
			message.includes("504")
		) {
			return true;
		}
	}

	return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let lastError: unknown;
	let delay = opts.initialDelayMs;

	for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			// Don't retry if it's the last attempt or error is not retryable
			if (attempt === opts.maxRetries || !opts.isRetryable(error)) {
				throw error;
			}

			// Calculate delay with jitter (10% randomness)
			const jitter = delay * 0.1 * (Math.random() - 0.5);
			const actualDelay = Math.min(delay + jitter, opts.maxDelayMs);

			opts.onRetry?.(attempt + 1, error, actualDelay);

			await sleep(actualDelay);
			delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError;
}
