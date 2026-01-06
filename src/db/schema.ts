import {
	blob,
	index,
	integer,
	real,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const responses = sqliteTable(
	"responses",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		model: text("model"),
		prompt: text("prompt"),
		system: text("system"),
		prompt_json: text("prompt_json", { mode: "json" }),
		options_json: text("options_json", { mode: "json" }),
		response: text("response"),
		response_json: text("response_json", { mode: "json" }),
		duration_ms: integer("duration_ms"),
		datetime_utc: integer("datetime_utc", { mode: "timestamp" }).notNull(),
		input_tokens: integer("input_tokens"),
		output_tokens: integer("output_tokens"),
		total_tokens: integer("total_tokens"),
		copied: integer("copied", { mode: "boolean" }).default(false),
		// Cache-related columns
		cached: integer("cached", { mode: "boolean" }).default(false),
		cache_source_id: integer("cache_source_id"), // FK to cache_entries.id
		similarity_score: real("similarity_score"),
	},
	(t) => [index("idx_responses_model").on(t.model)],
);

export const cacheEntries = sqliteTable(
	"cache_entries",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		query: text("query").notNull(),
		query_embedding: blob("query_embedding", { mode: "buffer" }).notNull(), // Float32Array as buffer
		context_hash: text("context_hash"), // NULL for context-independent queries
		response: text("response").notNull(),
		response_id: integer("response_id"), // FK to responses table (original log entry)
		created_at: integer("created_at", { mode: "timestamp" }).notNull(),
		expires_at: integer("expires_at", { mode: "timestamp" }).notNull(),
		hit_count: integer("hit_count").default(0),
	},
	(t) => [
		index("idx_cache_expires").on(t.expires_at),
		index("idx_cache_context_hash").on(t.context_hash),
	],
);

export const kvStore = sqliteTable("kv_store", {
	key: text("key").primaryKey(),
	value: text("value", { mode: "json" }),
});

export type InsertLog = typeof responses.$inferInsert;
export type SelectLog = typeof responses.$inferSelect;

export type InsertCacheEntry = typeof cacheEntries.$inferInsert;
export type SelectCacheEntry = typeof cacheEntries.$inferSelect;

export type InsertKV = typeof kvStore.$inferInsert;
export type SelectKV = typeof kvStore.$inferSelect;
