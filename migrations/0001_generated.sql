-- Add cache-related columns to responses table
ALTER TABLE `responses` ADD `cached` integer DEFAULT false;
ALTER TABLE `responses` ADD `cache_source_id` integer;
ALTER TABLE `responses` ADD `similarity_score` real;

-- Create cache_entries table
CREATE TABLE IF NOT EXISTS `cache_entries` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `query` text NOT NULL,
    `query_embedding` blob NOT NULL,
    `context_hash` text,
    `response` text NOT NULL,
    `response_id` integer,
    `created_at` integer NOT NULL,
    `expires_at` integer NOT NULL,
    `hit_count` integer DEFAULT 0
);

-- Create indexes for cache_entries
CREATE INDEX IF NOT EXISTS `idx_cache_expires` ON `cache_entries` (`expires_at`);
CREATE INDEX IF NOT EXISTS `idx_cache_context_hash` ON `cache_entries` (`context_hash`);

-- Create kv_store table for config persistence
CREATE TABLE IF NOT EXISTS `kv_store` (
    `key` text PRIMARY KEY NOT NULL,
    `value` text
);
