# Continuity Ledger: q-cli

## Goal

Explore expansion opportunities and improvements for q-cli, a natural language to terminal command converter focused on personal productivity.

Success criteria:

-  Identify high-value feature additions
-  Propose architectural improvements
-  Prioritize changes based on productivity impact
-  Maintain simplicity and fast execution time

## Constraints

-  Built with Bun (prefer Bun APIs over Node.js)
-  Uses Vercel AI SDK with OpenAI (currently gpt-4.1-mini)
-  SQLite logging via Drizzle ORM
-  CLI tool - must remain fast and lightweight
-  Published as npm package (bin: q)
-  Clean git status, no pending changes

## Current Architecture

**Core Flow:**

1. User types: `q list files modified today`
2. AI generates command (streaming with ora spinner)
3. Command displayed with indentation
4. User presses Enter to copy, Ctrl+C to exit
5. All interactions logged to SQLite (~/.local/share/q-cli/logs.db)

**Key Files:**

-  `/Users/nbbaier/Code/q-cli/src/index.ts` - CLI entry point, Commander setup
-  `/Users/nbbaier/Code/q-cli/src/logger.ts` - AI SDK middleware for logging
-  `/Users/nbbaier/Code/q-cli/src/db/schema.ts` - Drizzle schema (responses table)
-  `/Users/nbbaier/Code/q-cli/src/db/queries.ts` - Database operations
-  `/Users/nbbaier/Code/q-cli/src/format.ts` - Log formatting utilities

**Current Features:**

-  Natural language to command conversion
-  Streaming AI responses with spinner
-  Clipboard integration (copy commands)
-  Comprehensive logging (model, tokens, duration, prompt/response)
-  Log viewing: `q logs`, `q logs --path`, `q logs 123`
-  Few-shot prompting for better command generation

## Expansion Opportunities

### High Impact - Personal Productivity

1. **Context-Aware Commands**

   -  Reference previous commands in new queries
   -  Example: `q modify last command to use verbose output`
   -  Implementation: Fetch last N logs, add to prompt context
   -  Value: Reduces repetition, builds on previous work

2. **Command Execution Mode**

   -  Add `--exec` or `--run` flag to execute generated commands
   -  Optional confirmation prompt before execution
   -  Capture stdout/stderr in logs
   -  Value: Single-step workflow (generate + execute)

3. **Template/Alias System**

   -  Save frequent command patterns with variables
   -  Example: `q save template "docker-logs" as "docker logs -f {{container}}"`
   -  Then: `q template docker-logs web-api`
   -  Value: Personalized shortcuts for your workflow

4. **Shell Integration**

   -  Shell function to execute in place: `q list files`
   -  Fish/Zsh completion for `q` commands
   -  Value: Tighter integration with daily terminal use

5. **Multi-Step Command Chains**
   -  Generate complex pipelines or multiple commands
   -  Example: `q create backup script for postgres database`
   -  Generates full script with multiple steps
   -  Value: Handles complex tasks beyond single commands

### Medium Impact - Enhanced Logging

6. **Analytics Dashboard**

   -  Most used command types
   -  Token usage trends over time
   -  Expensive queries identification
   -  Implementation: Aggregate queries on logs table
   -  Value: Understand your command patterns

7. **Tagging and Favorites**

   -  Tag logs: `q logs tag 123 docker,debugging`
   -  Mark favorites for quick reference
   -  Search by tag: `q logs --tag docker`
   -  Value: Build personal command library

8. **Cost Tracking**
   -  Calculate cost per query based on model pricing
   -  Monthly/weekly cost summaries
   -  Value: Budget awareness for API usage

### Low Impact - Nice-to-Have

9. **Multiple AI Providers**

   - Support Anthropic, Gemini, local models
   - Config file for provider selection
   - Value: Flexibility, cost optimization

10. **Export/Import Logs**
    - Export logs as JSON/CSV
    - Import logs from other machines
    - Value: Sync command history across machines

## Technical Improvements

### Performance

-  **Lazy DB initialization**: Only connect when needed (currently connects on every run)
-  **Streaming improvements**: Show partial commands as they generate (currently shows after spinner)
-  **Caching**: Cache common command patterns to reduce API calls

### Code Quality

-  **Error handling**: Add better error messages for network failures, API errors
-  **Testing**: Add unit tests for core functions (currently no tests)
-  **Configuration**: Add config file (~/.config/q-cli/config.json) for model, temperature, etc.

### Architecture

-  **Plugin system**: Allow custom prompt templates or post-processing
-  **Middleware pipeline**: Extend logger pattern for other cross-cutting concerns

## State

-  Done:
   -  [x] Analyzed current codebase architecture
   -  [x] Identified core functionality and flow
   -  [x] Reviewed database schema and logging implementation
-  Now: [→] Created continuity ledger with expansion opportunities
-  Next: Awaiting user selection of features to implement
-  Remaining:
   -  [ ] Prioritize features based on user feedback
   -  [ ] Create implementation plan for selected features
   -  [ ] Implement chosen expansions

## Key Decisions

1. **Focus on productivity over features**: Tool should remain fast and simple
2. **Leverage existing logs**: Many features can be built on existing log data
3. **Incremental additions**: Each feature should be independently valuable
4. **Maintain backward compatibility**: Don't break existing `q <query>` workflow

## Open Questions

-  UNCONFIRMED: What is the user's most common use case? (command discovery, repetitive tasks, learning new tools?)
-  UNCONFIRMED: Is execution mode (`--exec`) too dangerous or highly valuable?
-  UNCONFIRMED: Would context-aware commands (referencing previous queries) be used frequently?
-  UNCONFIRMED: Is the current model (gpt-4.1-mini) sufficient or should we support other models?

## Recommended Next Steps

Based on personal productivity focus, I recommend starting with:

1. **Context-Aware Commands** (Highest ROI)

   -  Low implementation complexity
   -  High productivity impact
   -  Uses existing log infrastructure

2. **Command Execution Mode** (Streamlines workflow)

   -  Reduces copy/paste/execute cycle
   -  Optional safety with confirmation prompt

3. **Template System** (Long-term value)
   -  Builds personal command library
   -  Reduces repetitive queries

## Working Set

-  Branch: main (clean, no changes)
-  Database: ~/.local/share/q-cli/logs.db
-  Entry point: src/index.ts
-  Build: `bun run build` (outputs to dist/index.mjs)
-  Test install: `bun link` then `q <query>` in another directory

## Notes

-  Current model is `gpt-4.1-mini` - consider if this is optimal for command generation
-  Few-shot examples are hardcoded - could be moved to config or expanded
-  System prompt discourages explanations - works well for command generation
-  Clipboard integration works well for current workflow
-  No tests currently - might want to add for new features
-  Schema includes `copied` field but it's never updated (unused feature?)

## Agent Reports

### onboard (2026-01-06T03:06:33.863Z)

-  Task:
-  Summary:
-  Output: `.claude/cache/agents/onboard/latest-output.md`

### onboard (2026-01-06T03:01:13.012Z)

-  Task:
-  Summary:
-  Output: `.claude/cache/agents/onboard/latest-output.md`

### onboard (2026-01-06T03:00:51.826Z)

-  Task:
-  Summary:
-  Output: `.claude/cache/agents/onboard/latest-output.md`
