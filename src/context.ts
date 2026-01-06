import type { ModelMessage } from "ai";
import { getLogs } from "./db/queries";

const CONTEXT_PATTERNS = [
	/\b(last|previous|earlier|that|those)\s+(command|query|one|time)/i,
	/\b(run|do|execute)\s+(it|that|this)\s+again/i,
	/\bmodify\s+(it|that)/i,
	/\bchange\s+(it|that)/i,
	/\bsame\s+but/i,
];

export function detectsContext(query: string): boolean {
	return CONTEXT_PATTERNS.some((pattern) => pattern.test(query));
}

export async function getContextMessages(
	limit: number = 3,
): Promise<ModelMessage[]> {
	const logs = await getLogs(limit);
	const messages: ModelMessage[] = [];

	// Reverse to get chronological order (oldest first)
	for (const log of logs.reverse()) {
		if (log.prompt) {
			messages.push({ role: "user", content: log.prompt });
		}
		if (log.response) {
			messages.push({ role: "assistant", content: log.response });
		}
	}

	return messages;
}

/**
 * Get only the response texts for context hash generation
 * Used for cache context matching
 */
export async function getContextResponses(
	limit: number = 3,
): Promise<string[]> {
	const logs = await getLogs(limit);
	const responses: string[] = [];

	// Reverse to get chronological order (oldest first)
	for (const log of logs.reverse()) {
		if (log.response) {
			responses.push(log.response);
		}
	}

	return responses;
}
