/**
 * User-friendly error handling utilities
 */

import chalk from "chalk";

/**
 * Error types that can be displayed to users
 */
export type ErrorType =
	| "api_key_missing"
	| "network_error"
	| "rate_limit"
	| "api_error"
	| "cache_error"
	| "unknown";

/**
 * Structured error information for display
 */
export interface ErrorInfo {
	type: ErrorType;
	message: string;
	suggestion?: string;
}

/**
 * Analyze an error and return user-friendly information
 */
export function analyzeError(error: unknown): ErrorInfo {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		// API key errors
		if (
			message.includes("api key") ||
			message.includes("authentication") ||
			message.includes("401") ||
			message.includes("unauthorized")
		) {
			return {
				type: "api_key_missing",
				message: "OpenAI API key is missing or invalid",
				suggestion:
					"Set OPENAI_API_KEY environment variable or add it to ~/.config/q-cli/config.json",
			};
		}

		// Rate limiting
		if (message.includes("rate limit") || message.includes("429")) {
			return {
				type: "rate_limit",
				message: "API rate limit exceeded",
				suggestion:
					"Wait a moment before trying again, or check your OpenAI usage limits",
			};
		}

		// Network errors
		if (
			message.includes("fetch failed") ||
			message.includes("econnrefused") ||
			message.includes("enotfound") ||
			message.includes("etimedout") ||
			message.includes("network") ||
			message.includes("socket")
		) {
			return {
				type: "network_error",
				message: "Network connection failed",
				suggestion:
					"Check your internet connection and try again. If the problem persists, OpenAI services may be experiencing issues.",
			};
		}

		// Server errors
		if (
			message.includes("500") ||
			message.includes("502") ||
			message.includes("503") ||
			message.includes("504") ||
			message.includes("internal server error")
		) {
			return {
				type: "api_error",
				message: "OpenAI API server error",
				suggestion: "This is usually temporary. Wait a moment and try again.",
			};
		}

		// Quota exceeded
		if (
			message.includes("quota") ||
			message.includes("billing") ||
			message.includes("insufficient")
		) {
			return {
				type: "api_error",
				message: "OpenAI API quota exceeded or billing issue",
				suggestion:
					"Check your OpenAI account billing status at https://platform.openai.com/usage",
			};
		}

		// Generic API error
		if (message.includes("openai") || message.includes("api")) {
			return {
				type: "api_error",
				message: error.message,
				suggestion: "Check the OpenAI status page if this persists.",
			};
		}
	}

	// Unknown error
	return {
		type: "unknown",
		message: error instanceof Error ? error.message : String(error),
	};
}

/**
 * Format an error for display to the user
 */
export function formatError(error: unknown): string {
	const info = analyzeError(error);

	let output = chalk.red(`Error: ${info.message}`);

	if (info.suggestion) {
		output += `\n${chalk.yellow(`Suggestion: ${info.suggestion}`)}`;
	}

	return output;
}

/**
 * Handle an error by displaying it to the user
 */
export function handleError(error: unknown): never {
	console.error(formatError(error));
	process.exit(1);
}

/**
 * Check if the OpenAI API key is configured
 */
export function checkApiKey(): void {
	const apiKey = process.env.OPENAI_API_KEY;

	if (!apiKey) {
		handleError(new Error("API key not found"));
	}
}
