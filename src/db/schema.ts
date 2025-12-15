import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
	},
	(t) => [index("idx_responses_model").on(t.model)],
);

// export const kvStore = sqliteTable("kv_store", {
// 	key: text("key").primaryKey(),
// 	value: text("value", { mode: "json" }),
// });

export type InsertLog = typeof responses.$inferInsert;
export type SelectLog = typeof responses.$inferSelect;
