# q-cli

A CLI tool that converts natural language into terminal commands using an LLM.

## Installation

```bash
bun install
```

## Usage

```bash
bun run src/index.ts "your natural language query"
```

Example:

```bash
bun run src/index.ts "list all files in the current directory sorted by size"
```

The generated command is displayed, and you can press **Enter** to copy it to your clipboard or **Ctrl+C** to exit.

## Logging

All prompts and responses are automatically logged to a SQLite database at `~/.local/share/q-cli/logs.db`.

### View logs

```bash
# Show last 10 logs
bun run src/index.ts logs

# Show last N logs
bun run src/index.ts logs -n 20

# Show specific log details
bun run src/index.ts logs 42

# Print database path
bun run src/index.ts logs --path
```

### Logged data

-  Prompt text
-  Generated response
-  Model used
-  Duration (ms)
-  Token usage (input/output/total)
-  Whether the command was copied

## Requirements

-  [Bun](https://bun.sh) v1.0+
-  OpenAI API key (set `OPENAI_API_KEY` environment variable)
