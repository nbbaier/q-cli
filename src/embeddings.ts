import { createHash } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import { embedMany, embed } from "ai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small produces 1536-dimensional vectors

// Create the embedding model
const embeddingModel = openai.textEmbeddingModel(EMBEDDING_MODEL);

/**
 * Generate embedding for a single query
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
	const { embedding } = await embed({
		model: embeddingModel,
		value: text,
	});
	return new Float32Array(embedding);
}

/**
 * Generate embeddings for multiple texts (batched)
 */
export async function generateEmbeddings(
	texts: string[],
): Promise<Float32Array[]> {
	const { embeddings } = await embedMany({
		model: embeddingModel,
		values: texts,
	});
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
		throw new Error(
			`Embedding dimension mismatch: ${a.length} vs ${b.length}`,
		);
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
	return createHash("sha256").update(combined).digest("hex").slice(0, 16);
}

/**
 * Find the best matching embedding from a list
 * Returns the index and similarity score, or null if no match exceeds threshold
 */
export function findBestMatch(
	queryEmbedding: Float32Array,
	candidates: { embedding: Float32Array; index: number }[],
	threshold: number,
): { index: number; similarity: number } | null {
	let bestMatch: { index: number; similarity: number } | null = null;

	for (const candidate of candidates) {
		const similarity = cosineSimilarity(queryEmbedding, candidate.embedding);
		if (similarity >= threshold) {
			if (!bestMatch || similarity > bestMatch.similarity) {
				bestMatch = { index: candidate.index, similarity };
			}
		}
	}

	return bestMatch;
}
