import { desc, eq, gt, lt, sql } from "drizzle-orm";
import { getConfig } from "./config";
import { getDb } from "./db/index";
import {
	cacheEntries,
	type InsertCacheEntry,
	responses,
	type SelectCacheEntry,
} from "./db/schema";
import {
	bufferToEmbedding,
	cosineSimilarity,
	embeddingToBuffer,
	generateContextHash,
	generateEmbedding,
} from "./embeddings";

/**
 * Represents the result of a cache lookup.
 *
 * The {@link similarity} score reflects how closely the cached entry's
 * query embedding matches the lookup query's embedding, typically using
 * cosine similarity in the range [0, 1], where higher values indicate
 * a closer semantic match.
 *
 * Returned by {@link lookupCache} when a suitable cached response is found.
 */
export interface CacheMatch {
	/**
	 * The cached entry that best matches the lookup query and context.
	 */
	entry: SelectCacheEntry;
	/**
	 * Similarity score between the lookup query and the cached entry.
	 * Used to compare against the configured similarity threshold; higher
	 * values mean a better match.
	 */
	similarity: number;
}

export interface CacheStats {
	totalEntries: number;
	totalHits: number;
	storageSize: number;
	oldestEntry: Date | null;
	newestEntry: Date | null;
	expiredCount: number;
}

/**
 * Look up a cached response for a query
 * Returns the best match if similarity exceeds threshold
 */
export async function lookupCache(
	query: string,
	contextResponses: string[] = [],
): Promise<CacheMatch | null> {
	const config = getConfig();
	const threshold = config.cache.similarity_threshold;

	const db = await getDb();

	// First, prune expired entries (lazy deletion)
	await pruneExpiredEntries();

	// Generate embedding for the query
	let queryEmbedding: Float32Array;
	try {
		queryEmbedding = await generateEmbedding(query);
	} catch (error) {
		// Propagate embedding generation errors to keep behavior consistent with cache storage
		if (error instanceof Error) {
			throw new Error("Failed to generate embedding for cache lookup", {
				cause: error,
			} as ErrorOptions);
		}
		throw new Error("Failed to generate embedding for cache lookup");
	}

	// Generate context hash if we have context
	const contextHash =
		contextResponses.length > 0 ? generateContextHash(contextResponses) : null;

	// Fetch all non-expired cache entries
	const entries = await db
		.select()
		.from(cacheEntries)
		.where(gt(cacheEntries.expires_at, new Date()));

	// If we have context, filter to only entries with matching context hash OR no context
	// If we don't have context, filter to only entries without context hash
	const candidateEntries = entries.filter((entry) => {
		if (contextHash) {
			// Context-dependent query: match entries with same context OR no context
			return entry.context_hash === contextHash || entry.context_hash === null;
		}
		// Context-independent query: only match entries without context
		return entry.context_hash === null;
	});

	// Find best match by computing cosine similarity
	let bestMatch: CacheMatch | null = null;

	for (const entry of candidateEntries) {
		const rawEmbedding = entry.query_embedding;

		let embeddingBuffer: Buffer | null = null;
		if (Buffer.isBuffer(rawEmbedding)) {
			embeddingBuffer = rawEmbedding;
		} else if (rawEmbedding instanceof Uint8Array) {
			embeddingBuffer = Buffer.from(rawEmbedding);
		} else {
			console.error(
				"Unexpected type for cache entry query_embedding; skipping entry",
				{
					id: entry.id,
					type: rawEmbedding === null ? "null" : typeof rawEmbedding,
				},
			);
			continue;
		}

		const entryEmbedding = bufferToEmbedding(embeddingBuffer);
		const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

		if (similarity >= threshold) {
			// For context-dependent queries, prefer exact context match
			const isExactContextMatch =
				contextHash && entry.context_hash === contextHash;
			const bestMatchIsExactContext =
				bestMatch?.entry.context_hash === contextHash;

			if (!bestMatch) {
				// No previous match, use this one
				bestMatch = { entry, similarity };
			} else if (isExactContextMatch && !bestMatchIsExactContext) {
				// Current entry is exact context match, best match is not - always prefer exact match
				bestMatch = { entry, similarity };
			} else if (isExactContextMatch && bestMatchIsExactContext) {
				// Both are exact context matches - prefer higher similarity
				if (similarity > bestMatch.similarity) {
					bestMatch = { entry, similarity };
				}
			} else if (!isExactContextMatch && !bestMatchIsExactContext) {
				// Neither are exact context matches - prefer higher similarity
				if (similarity > bestMatch.similarity) {
					bestMatch = { entry, similarity };
				}
			}
			// If current entry is NOT exact match but bestMatch IS exact match, keep bestMatch
		}
	}

	// Increment hit count if we found a match
	if (bestMatch) {
		await db
			.update(cacheEntries)
			.set({ hit_count: sql`${cacheEntries.hit_count} + 1` })
			.where(eq(cacheEntries.id, bestMatch.entry.id));
	}

	return bestMatch;
}

/**
 * Store a new cache entry
 */
export async function storeCache(
	query: string,
	response: string,
	responseId: number | null,
	contextResponses: string[] = [],
): Promise<SelectCacheEntry> {
	const config = getConfig();
	const db = await getDb();

	// Generate embedding
	let queryEmbedding: Float32Array;
	try {
		queryEmbedding = await generateEmbedding(query);
	} catch (error) {
		throw new Error(`Failed to generate embedding for cache storage: ${error}`);
	}

	// Generate context hash if we have context
	const contextHash =
		contextResponses.length > 0 ? generateContextHash(contextResponses) : null;

	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + config.cache.expiry_days * 24 * 60 * 60 * 1000,
	);

	const entry: InsertCacheEntry = {
		query,
		query_embedding: embeddingToBuffer(queryEmbedding),
		context_hash: contextHash,
		response,
		response_id: responseId,
		created_at: now,
		expires_at: expiresAt,
		hit_count: 0,
	};

	const [inserted] = await db.insert(cacheEntries).values(entry).returning();

	if (!inserted) {
		throw new Error("Failed to insert cache entry");
	}

	return inserted;
}

/**
 * Update an existing cache entry with a new response
 */
export async function updateCache(
	cacheId: number,
	response: string,
	responseId: number | null,
): Promise<void> {
	const config = getConfig();
	const db = await getDb();

	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + config.cache.expiry_days * 24 * 60 * 60 * 1000,
	);

	await db
		.update(cacheEntries)
		.set({
			response,
			response_id: responseId,

			expires_at: expiresAt,
		})
		.where(eq(cacheEntries.id, cacheId));
}

/**
 * Delete expired cache entries
 */
export async function pruneExpiredEntries(): Promise<number> {
	const db = await getDb();
	const result = await db
		.delete(cacheEntries)
		.where(lt(cacheEntries.expires_at, new Date()))
		.returning({ id: cacheEntries.id });

	return result.length;
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<number> {
	const db = await getDb();
	const result = await db
		.delete(cacheEntries)
		.returning({ id: cacheEntries.id });
	return result.length;
}

/**
 * Clear a specific cache entry by ID
 */
export async function clearCacheById(id: number): Promise<boolean> {
	const db = await getDb();
	const result = await db
		.delete(cacheEntries)
		.where(eq(cacheEntries.id, id))
		.returning({ id: cacheEntries.id });
	return result.length > 0;
}

/**
 * Get all cache entries (for listing)
 */
export async function listCacheEntries(
	limit = 50,
): Promise<SelectCacheEntry[]> {
	const db = await getDb();
	return await db
		.select()
		.from(cacheEntries)
		.orderBy(desc(cacheEntries.created_at))
		.limit(limit);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
	const db = await getDb();

	const entries = await db.select().from(cacheEntries);
	const now = new Date();

	const totalEntries = entries.length;
	const totalHits = entries.reduce((sum, e) => sum + (e.hit_count || 0), 0);
	const expiredCount = entries.filter((e) => e.expires_at < now).length;

	// Estimate storage size (query + response + embedding)
	const storageSize = entries.reduce((sum, e) => {
		const embeddingSize = (e.query_embedding as Buffer)?.length || 0;
		return (
			sum + (e.query?.length || 0) + (e.response?.length || 0) + embeddingSize
		);
	}, 0);

	const dates = entries.map((e) => e.created_at).filter(Boolean) as Date[];
	const oldestEntry =
		dates.length > 0
			? new Date(Math.min(...dates.map((d) => d.getTime())))
			: null;
	const newestEntry =
		dates.length > 0
			? new Date(Math.max(...dates.map((d) => d.getTime())))
			: null;

	return {
		totalEntries,
		totalHits,
		storageSize,
		oldestEntry,
		newestEntry,
		expiredCount,
	};
}

/**
 * Log a cache hit to the responses table
 */
export async function logCacheHit(
	originalLogEntry: {
		model: string | null;
		prompt: string | null;
		system: string | null;
		prompt_json: unknown;
		options_json: unknown;
	},
	response: string,
	cacheSourceId: number,
	similarityScore: number,
): Promise<number> {
	const db = await getDb();

	const [inserted] = await db
		.insert(responses)
		.values({
			model: originalLogEntry.model,
			prompt: originalLogEntry.prompt,
			system: originalLogEntry.system,
			prompt_json: originalLogEntry.prompt_json,
			options_json: originalLogEntry.options_json,
			response,
			datetime_utc: new Date(),
			cached: true,
			cache_source_id: cacheSourceId,
			similarity_score: similarityScore,
		})
		.returning({ id: responses.id });

	return inserted?.id ?? -1;
}
