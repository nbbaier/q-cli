import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { withRetry } from "./retry";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Create the embedding model
const embeddingModel = openai.textEmbeddingModel(EMBEDDING_MODEL);

/**
 * Generate embedding for a single query
 * Includes automatic retry for transient failures
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
	const { embedding } = await withRetry(
		() =>
			embed({
				model: embeddingModel,
				value: text,
			}),
		{
			maxRetries: 3,
			initialDelayMs: 1000,
		},
	);
	return new Float32Array(embedding);
}

/**
 * Generate embeddings for multiple texts (batched)
 * Includes automatic retry for transient failures
 */
export async function generateEmbeddings(
	texts: string[],
): Promise<Float32Array[]> {
	const { embeddings } = await withRetry(
		() =>
			embedMany({
				model: embeddingModel,
				values: texts,
			}),
		{
			maxRetries: 3,
			initialDelayMs: 1000,
		},
	);
	return embeddings.map((e) => new Float32Array(e));
}

/**
 * Convert Float32Array to Buffer for SQLite storage
 */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
	return Buffer.from(embedding.buffer);
}

/**
 * Convert Buffer back to Float32Array for similarity computation
 */
export function bufferToEmbedding(buffer: Buffer): Float32Array {
	return new Float32Array(
		buffer.buffer,
		buffer.byteOffset,
		buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
	);
}

/**
 * Compute cosine similarity between two embeddings
 * Returns a value between -1 and 1, where 1 means identical
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	if (a.length !== b.length) {
		throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		const aVal = a[i] as number;
		const bVal = b[i] as number;
		dotProduct += aVal * bVal;
		normA += aVal * aVal;
		normB += bVal * bVal;
	}

	if (normA === 0 || normB === 0) {
		return 0;
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate a context hash from response texts
 * Used for context-dependent query caching
 */
export function generateContextHash(responseTexts: string[]): string {
	if (responseTexts.length === 0) {
		return "";
	}
	const combined = responseTexts.join("\n---\n");
	return createHash("sha256").update(combined).digest("hex");
}
