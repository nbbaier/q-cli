# Cache Feature Specification

## Overview

Add semantic caching to q-cli to avoid redundant API calls when similar queries have been asked before. Uses OpenAI embeddings for similarity matching and sqlite-vec for efficient vector search.

## Core Behavior

### Similarity Matching

- **Method**: Semantic similarity using OpenAI `text-embedding-3-small` embeddings
- **Threshold**: 0.85 (permissive) - queries with cosine similarity >= 0.85 return cached results
- **Multi-match handling**: Return the best (highest similarity) match when multiple entries exceed threshold
- **Storage**: SQLite with sqlite-vec extension for native vector operations
- **Search method**: Brute force cosine similarity (suitable for <10k entries)

### Context Awareness

- **Context-independent queries**: Cache based on query embedding alone
- **Context-dependent queries** (e.g., "run it again", "modify that"):
  - Cache key includes a hash of the context
  - Context hash is generated from **response texts only** (not full context JSON)
  - Matching is **two-stage**: First match query embedding, then verify context hash matches

### Embedding Strategy (Hybrid)

- Generate embeddings via OpenAI API on first occurrence of a query
- Store embeddings in SQLite for instant retrieval on subsequent queries
- No local embedding model - all embeddings come from OpenAI

## Cache Lifecycle

### Expiration

- **Default TTL**: 30 days from creation
- **Manual clearing**: Available via `q cache clear` command
- Expired entries are pruned on query (lazy deletion) or via explicit clear command

### Bypass Options

- `--no-cache` or `--fresh`: Skip cache lookup, force API call, do NOT update cache
- `--refresh`: Skip cache lookup, force API call, UPDATE the cache entry with new result
- `r` key during result display: Regenerate the response with a fresh API call

## User Experience

### Cache Hit Display

- **Default**: Subtle indicator (e.g., "(cached)" suffix or different spinner color)
- **Verbose mode** (`--verbose`): Show full details:
  - Original query that was matched
  - Similarity score
  - Age of cached entry

### Regenerate Flow

When displaying a cached result, show prompt:
```
    <cached command here>

Enter to copy | r to regenerate | Ctrl+C to exit
       ↑ "(cached)" indicator
```

If user presses `r`:
1. Clear the cached output
2. Make fresh API call
3. Display new result with standard prompt (Enter to copy, Ctrl+C to exit)
4. Update cache with new result

### First-Run Experience

- On first query, prompt user:
  ```
  Would you like to enable query caching?
  Caching reduces API calls by reusing responses for similar queries.
  [y/n]:
  ```
- Store preference in config file

## Logging

- Cache hits ARE logged to the responses table
- Cache hit log entries include:
  - `cached: true` flag to distinguish from fresh API calls
  - `cache_source_id`: Reference to the original cached entry
  - `similarity_score`: The match confidence
- **Copy status**: Only the new log entry is marked as copied (original cache source unchanged)

## Storage Schema

### New Table: `cache_entries`

```sql
CREATE TABLE cache_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  query_embedding BLOB NOT NULL,  -- sqlite-vec compatible vector
  context_hash TEXT,              -- NULL for context-independent queries
  response TEXT NOT NULL,
  response_id INTEGER,            -- FK to responses table (original log entry)
  created_at INTEGER NOT NULL,    -- Unix timestamp
  expires_at INTEGER NOT NULL,    -- Unix timestamp (created_at + 30 days)
  hit_count INTEGER DEFAULT 0     -- Track usage for stats
);
```

### Extended `responses` Table

Add columns:
```sql
cached BOOLEAN DEFAULT FALSE,
cache_source_id INTEGER,          -- FK to cache_entries.id when cached=true
similarity_score REAL             -- Similarity score when cached=true
```

## Configuration

### Config File Location

`~/.config/q-cli/config.json`

### Config Schema

```json
{
  "cache": {
    "enabled": true,
    "similarity_threshold": 0.85,
    "expiry_days": 30
  },
  "defaults": {
    "model": "gpt-4.1-mini",
    "context_limit": 3,
    "verbose": false
  },
  "api": {
    "openai_api_key": null  // Falls back to OPENAI_API_KEY env var
  }
}
```

### Precedence

1. CLI flags (highest)
2. Config file
3. Environment variables
4. Hardcoded defaults (lowest)

## CLI Commands

### Cache Management

```bash
# List cached entries
q cache list
# Output: table with id, query (truncated), similarity threshold, created date, expires date, hit count

# Show cache statistics
q cache stats
# Output: total entries, cache hit rate, storage size, oldest/newest entry

# Clear all cache entries
q cache clear

# Clear expired entries only
q cache clear --expired

# Clear specific entry by ID
q cache clear <id>
```

### Query Flags

```bash
# Force fresh API call, don't cache result
q --no-cache "list files"

# Force fresh API call, update cache with result
q --refresh "list files"

# Show verbose cache info on hit
q --verbose "list files"
```

## Dependencies

### New Dependencies

- `sqlite-vec`: SQLite extension for vector operations
- OpenAI embeddings API (already have `@ai-sdk/openai`)

### Integration Notes

- sqlite-vec needs to be loaded as an extension to the existing SQLite connection
- Check bun-sqlite compatibility with sqlite-vec extension loading

## Migration Path

1. Add new `cache_entries` table
2. Add new columns to `responses` table
3. Uncomment and use `kv_store` table or create config file infrastructure
4. Backfill: Optionally generate embeddings for existing log entries to bootstrap cache

## Error Handling

- **Embedding API failure**: Fall back to direct API call (no caching for this query)
- **sqlite-vec unavailable**: Disable caching, warn user, fall back to direct API calls
- **Cache corruption**: Clear cache, continue with fresh queries

## Performance Considerations

- Embedding generation adds ~100-200ms latency on first occurrence
- Cache hits should be near-instant (<10ms)
- Vector search is O(n) but fast for expected dataset sizes (<10k entries)
- Consider adding index on `expires_at` for efficient expired entry pruning
