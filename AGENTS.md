# q-cli

CLI (`q "<query>"`) that turns natural language into a shell command via OpenAI and offers to copy it. Code lives in `src/`: `index.ts` is the commander entry, `cache.ts` the embedding-based response cache, `db/` the Drizzle/libSQL log store. Scripts live in `package.json`.

## Runtime
- Develop and test with Bun (`bun install`, `bun run src/index.ts`, `bun test`); tests import `bun:test`.
- The published `q` binary is `tsdown` output for the Node platform, so `src/` uses `node:` APIs and `process.env`. Keep `Bun.*` out of `src/` (`logger.ts` shows the guarded exception).

## Gotchas
- A real CLI run calls the OpenAI API with `OPENAI_API_KEY` and writes to `~/.local/share/q-cli/logs.db` (or `$XDG_DATA_HOME/q-cli`). Point `XDG_DATA_HOME` and `XDG_CONFIG_HOME` at a temp dir when trying it.
- Schema changes: edit `src/db/schema.ts`, then `bun run migrate`, which generates the next `migrations/NNNN_generated.sql` and applies it to that same logs DB. Leave generated migrations unedited; the app applies `migrations/` on startup.
- `CACHE_SPEC.md` predates the code (it describes sqlite-vec); `src/cache.ts` is the truth.
- Lint/format is moving from Biome to oxlint/oxfmt on the `migrate-to-oxc` branch; once merged, `lint` runs oxlint and `fmt`/`fmt:check` run oxfmt.

## Done means
`bun test`, `bun run lint`, and `bunx tsc --noEmit` pass.
