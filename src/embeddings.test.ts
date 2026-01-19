import { describe, expect, test } from "bun:test";
import {
	bufferToEmbedding,
	cosineSimilarity,
	embeddingToBuffer,
	generateContextHash,
} from "./embeddings";

describe("embeddings", () => {
	describe("cosineSimilarity", () => {
		test("returns 1 for identical vectors", () => {
			const a = new Float32Array([1, 2, 3, 4, 5]);
			const b = new Float32Array([1, 2, 3, 4, 5]);

			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBeCloseTo(1.0, 5);
		});

		test("returns -1 for opposite vectors", () => {
			const a = new Float32Array([1, 0, 0]);
			const b = new Float32Array([-1, 0, 0]);

			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBeCloseTo(-1.0, 5);
		});

		test("returns 0 for orthogonal vectors", () => {
			const a = new Float32Array([1, 0, 0]);
			const b = new Float32Array([0, 1, 0]);

			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBeCloseTo(0.0, 5);
		});

		test("returns correct similarity for arbitrary vectors", () => {
			const a = new Float32Array([1, 2, 3]);
			const b = new Float32Array([4, 5, 6]);

			// Manual calculation: dot = 1*4 + 2*5 + 3*6 = 32
			// normA = sqrt(1 + 4 + 9) = sqrt(14)
			// normB = sqrt(16 + 25 + 36) = sqrt(77)
			// similarity = 32 / (sqrt(14) * sqrt(77)) ≈ 0.9746
			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBeCloseTo(0.9746, 3);
		});

		test("handles zero vectors", () => {
			const a = new Float32Array([0, 0, 0]);
			const b = new Float32Array([1, 2, 3]);

			const similarity = cosineSimilarity(a, b);
			expect(similarity).toBe(0);
		});

		test("throws error for dimension mismatch", () => {
			const a = new Float32Array([1, 2, 3]);
			const b = new Float32Array([1, 2]);

			expect(() => cosineSimilarity(a, b)).toThrow("dimension mismatch");
		});

		test("is commutative", () => {
			const a = new Float32Array([1, 2, 3, 4]);
			const b = new Float32Array([5, 6, 7, 8]);

			expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
		});
	});

	describe("embeddingToBuffer / bufferToEmbedding", () => {
		test("roundtrip preserves values", () => {
			const original = new Float32Array([1.5, -2.5, Math.PI, 0, -0.001]);

			const buffer = embeddingToBuffer(original);
			const recovered = bufferToEmbedding(buffer);

			expect(recovered.length).toBe(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(recovered[i]).toBeCloseTo(original[i] as number, 5);
			}
		});

		test("handles empty arrays", () => {
			const original = new Float32Array([]);

			const buffer = embeddingToBuffer(original);
			const recovered = bufferToEmbedding(buffer);

			expect(recovered.length).toBe(0);
		});

		test("handles large arrays", () => {
			// Typical embedding dimension (e.g., text-embedding-3-small has 1536 dims)
			const original = new Float32Array(1536);
			for (let i = 0; i < 1536; i++) {
				original[i] = Math.random() * 2 - 1; // Random values between -1 and 1
			}

			const buffer = embeddingToBuffer(original);
			const recovered = bufferToEmbedding(buffer);

			expect(recovered.length).toBe(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(recovered[i]).toBeCloseTo(original[i] as number, 5);
			}
		});
	});

	describe("generateContextHash", () => {
		test("returns empty string for empty array", () => {
			const hash = generateContextHash([]);
			expect(hash).toBe("");
		});

		test("generates consistent hash for same input", () => {
			const responses = ["response 1", "response 2"];

			const hash1 = generateContextHash(responses);
			const hash2 = generateContextHash(responses);

			expect(hash1).toBe(hash2);
		});

		test("generates different hashes for different inputs", () => {
			const hash1 = generateContextHash(["response 1"]);
			const hash2 = generateContextHash(["response 2"]);

			expect(hash1).not.toBe(hash2);
		});

		test("order matters", () => {
			const hash1 = generateContextHash(["a", "b"]);
			const hash2 = generateContextHash(["b", "a"]);

			expect(hash1).not.toBe(hash2);
		});

		test("returns 64-character hex string", () => {
			const hash = generateContextHash(["test response"]);

			expect(hash).toHaveLength(64);
			expect(hash).toMatch(/^[0-9a-f]{64}$/);
		});
	});
});
