# q-cli

A CLI tool that converts natural language into terminal commands using an LLM.

## Installation

### Global Installation

```bash
npm install -g q-cli
# or
bun install -g q-cli
```

Then use:

```bash
q "your natural language query"
```

### Development Installation

```bash
bun install
```

Then use:

```bash
bun run src/index.ts "your natural language query"
```

## Usage

```bash
q "your natural language query"
```

Example:

```bash
q "list all files in the current directory sorted by size"
```

The generated command is displayed, and you can press **Enter** to copy it to your clipboard or **Ctrl+C** to exit.

## Logging

All prompts and responses are automatically logged to a SQLite database at `~/.local/share/q-cli/logs.db`.

### View logs

```bash
# Show last 3 logs
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
