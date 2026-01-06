# Plan: Context-Aware Commands

## Goal

Enable q-cli to reference previous commands when users make queries like "modify last command to use -v flag" or "run that again but for /tmp". This leverages the existing log database to provide conversation continuity within terminal sessions, making the tool feel more intelligent and reducing repetitive typing.

## Technical Choices

- **Context Detection**: Keyword-based detection (patterns like "last", "previous", "that", "earlier") - Simple, fast, no ML required
- **Context Scope**: Default to last 3 interactions when context detected - Balances token usage with useful context
- **CLI Flag**: Add `--context N` flag for explicit context control - Gives power users full control
- **Message Format**: Convert logs to AI SDK message format (user/assistant pairs) - Works seamlessly with existing streamText API
- **Token Management**: Only include context when detected or requested - Keeps costs low for simple queries
- **Backward Compatibility**: Feature is additive, doesn't break existing behavior - Safe rollout

## Current State Analysis

The codebase already has most infrastructure needed:

### Existing Infrastructure:
- **Logging**: All interactions logged via `logger.ts` middleware to SQLite
- **Database Schema**: `responses` table has prompt, response, datetime_utc, id
- **Query Functions**: `getLogs(limit)` already retrieves recent logs ordered by datetime
- **AI SDK Integration**: Uses Vercel AI SDK's `streamText` with messages array
- **System Prompt**: Already mentions "Consider when the user request references a previous request" (src/index.ts:18) but not implemented!

### Gap:
The system prompt tells the AI to consider previous requests, but NO context is actually provided. This feature closes that gap.

### Key Files:
- `src/index.ts` - Main CLI logic, handleQuery function (lines 30-99)
- `src/db/queries.ts` - Database queries, getLogs function (lines 12-19)
- `src/db/schema.ts` - Database schema with responses table
- `src/logger.ts` - Middleware that logs interactions

### Quick Win Opportunity:
The `copied` field exists in schema (line 19) but is never set to true. We could track clipboard usage in handleQuery at line 75 (bonus improvement).

## Tasks

### Task 1: Add Context Detection Function
Create a utility to detect when a query references previous interactions.

- [x] Create `src/context.ts` file
- [x] Implement `detectsContext(query: string): boolean` function
- [x] Add keyword patterns: "last", "previous", "that", "earlier", "again", "same", "modify it", "change it"
- [x] Use case-insensitive regex matching
- [ ] Add unit tests (optional but recommended)

**Files to create:**
- `src/context.ts`

**Example implementation:**
```typescript
const CONTEXT_PATTERNS = [
  /\b(last|previous|earlier|that|those)\s+(command|query|one|time)/i,
  /\b(run|do|execute)\s+(it|that|this)\s+again/i,
  /\bmodify\s+(it|that)/i,
  /\bchange\s+(it|that)/i,
  /\bsame\s+but/i,
];

export function detectsContext(query: string): boolean {
  return CONTEXT_PATTERNS.some(pattern => pattern.test(query));
}
```

### Task 2: Add Context Fetching Function
Convert database logs into AI SDK message format.

- [x] Add `getContextMessages(limit: number): Promise<ModelMessage[]>` to `src/context.ts`
- [x] Fetch logs using existing `getLogs(limit)` from queries.ts
- [x] Convert each log to user/assistant message pair
- [x] Reverse order so oldest is first (chronological)
- [x] Handle edge cases (no logs, null responses)

**Files to modify:**
- `src/context.ts`

**Example implementation:**
```typescript
import type { ModelMessage } from "ai";
import { getLogs } from "./db/queries";

export async function getContextMessages(limit: number = 3): Promise<ModelMessage[]> {
  const logs = await getLogs(limit);
  const messages: ModelMessage[] = [];

  // Reverse to get chronological order (oldest first)
  for (const log of logs.reverse()) {
    if (log.prompt) {
      messages.push({ role: "user", content: log.prompt });
    }
    if (log.response) {
      messages.push({ role: "assistant", content: log.response });
    }
  }

  return messages;
}
```

### Task 3: Add --context CLI Flag
Allow users to explicitly request context.

- [x] Add `--context <number>` option to main command in `src/index.ts`
- [x] Update Commander.js configuration (around line 104)
- [x] Pass context limit to handleQuery function
- [x] Update handleQuery signature to accept optional contextLimit parameter
- [x] Handle edge cases (negative numbers, 0, very large numbers)

**Files to modify:**
- `src/index.ts` (lines 101-112)

**Example changes:**
```typescript
program
  .name("q")
  .description("Terminal AI assistant")
  .argument("[query...]", "Natural language query")
  .option("-c, --context <number>", "Include N previous interactions for context", "0")
  .action(async (queryParts, options) => {
    const query = queryParts.join(" ");
    if (!query) {
      console.error("No query provided");
      process.exit(1);
    }
    const contextLimit = parseInt(options.context, 10);
    await handleQuery(query, contextLimit);
  });
```

### Task 4: Integrate Context into handleQuery
Update the main query handler to include context when appropriate.

- [x] Update `handleQuery` signature to accept `contextLimit?: number`
- [x] Import `detectsContext` and `getContextMessages` from context.ts
- [x] Determine if context should be included (contextLimit > 0 OR detectsContext returns true)
- [x] Fetch context messages when needed
- [x] Insert context messages between few-shot examples and user query
- [x] Update message array construction (around lines 38-42)

**Files to modify:**
- `src/index.ts` (lines 30-42)

**Example changes:**
```typescript
import { detectsContext, getContextMessages } from "./context";

async function handleQuery(query: string, explicitContextLimit?: number): Promise<void> {
  let printedLines = 0;

  function writeAndCount(text: string) {
    printedLines += (text.match(/\n/g) || []).length;
    process.stdout.write(text);
  }

  // Determine context limit
  const shouldIncludeContext = explicitContextLimit !== undefined
    ? explicitContextLimit > 0
    : detectsContext(query);

  const contextLimit = explicitContextLimit ?? (shouldIncludeContext ? 3 : 0);

  // Fetch context if needed
  let contextMessages: ModelMessage[] = [];
  if (contextLimit > 0) {
    contextMessages = await getContextMessages(contextLimit);
  }

  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT_MESSAGES,
    ...contextMessages,  // Insert context here
    { role: "user", content: query },
  ];

  // ... rest of function unchanged
}
```

### Task 5: Update System Prompt (Optional Enhancement)
Improve the system prompt to better handle context.

- [x] Update SYSTEM_PROMPT to explicitly mention context usage
- [x] Add guidance about referencing previous commands vs general questions
- [x] Keep prompt concise to manage token usage

**Files to modify:**
- `src/index.ts` (lines 17-18)

**Example enhancement:**
```typescript
const SYSTEM_PROMPT =
  "You are a terminal assistant. Turn natural language instructions into terminal commands. When the user references previous interactions (e.g., 'modify last command', 'run that again'), use the conversation history to understand the context. By default always only output code, and in a code block. DO NOT OUTPUT ADDITIONAL REMARKS ABOUT THE CODE YOU OUTPUT. Do not repeat the question the users asks. Do not add explanations for your code. Do not output any non-code words at all. Just output the code. Short is better. However, if the user is clearly asking a general question then answer it very briefly and well.";
```

### Task 6: Bonus - Track Clipboard Usage
Implement the unused `copied` field to track when commands are copied.

- [ ] Import `_updateLogCopied` function from queries.ts (make it public by removing underscore)
- [ ] Get the latest log ID after insertLog completes
- [ ] Call updateLogCopied when clipboard write succeeds
- [ ] Update formatLogShort to show copied status visually

**Files to modify:**
- `src/db/queries.ts` (line 31 - remove underscore)
- `src/logger.ts` (return log ID from insertLog)
- `src/index.ts` (track copied status around line 75)

**Note:** This is a nice-to-have bonus feature, not critical for context-aware commands.

## Success Criteria

### Automated Verification:
- [x] Build succeeds: `bun run build`
- [x] Linting passes: `bun run lint`
- [ ] Type checking passes: `tsc --noEmit` (Note: tsc has dependency type errors, but tsdown build succeeds)

### Manual Verification:

**Test 1: Automatic Context Detection**
```bash
$ q list files in current directory
# (AI generates: ls -la)
$ q modify last command to show hidden files
# Should include previous interaction in context
# Expected: ls -la (already shows hidden) or ls -lah (more explicit)
```

**Test 2: Explicit Context Flag**
```bash
$ q find all .ts files
# (AI generates: find . -name "*.ts")
$ q --context 1 now exclude node_modules
# Should reference previous command
# Expected: find . -name "*.ts" -not -path "*/node_modules/*"
```

**Test 3: No Context for New Queries**
```bash
$ q get current time
# Should NOT include context (no reference keywords)
# Expected: date or similar
```

**Test 4: Multiple Turns of Context**
```bash
$ q list processes
# (AI generates: ps aux)
$ q filter for node
# (AI generates: ps aux | grep node)
$ q --context 2 sort by memory usage
# Should see both previous commands in context
# Expected: ps aux | grep node | sort -k 4 -r
```

**Test 5: Context Limit Edge Cases**
```bash
$ q --context 0 list files
# Should explicitly disable context
$ q --context 10 show disk usage
# Should handle limit larger than available history
```

### Integration Checks:
- [ ] Logs command still works: `q logs -n 5`
- [ ] Database path still accessible: `q logs --path`
- [ ] Clipboard copy still works after query
- [ ] Streaming output still displays correctly
- [ ] Token usage is reasonable (check with `q logs <id>`)

## Out of Scope

These features are NOT included in this implementation but could be future enhancements:

- **Semantic Context Detection**: Using LLM to detect context needs (would require extra API call)
- **Session Management**: Tracking terminal session boundaries to auto-clear context
- **Context Summarization**: Compressing old context to reduce tokens
- **Selective Context**: Choosing which past interactions to include based on relevance
- **Context Editing**: Allowing users to manually edit/remove context
- **Context Visualization**: Showing which context is being included in the request
- **Smart Context Window**: Adjusting context size based on query complexity
- **Persistent Sessions**: Saving session state across terminal restarts

## Implementation Notes

### Token Usage Considerations
- Each log adds ~100-500 tokens depending on command complexity
- Default 3 interactions ≈ 300-1500 tokens
- GPT-4.1-mini has 128k context window, so this is minimal impact
- Users can control with `--context` flag

### Error Handling
- If getLogs fails, gracefully continue without context
- If context parsing fails, log error but don't crash
- Handle empty/null responses in logs

### Performance
- getLogs query is already indexed by datetime (schema.ts line 21)
- Context fetching adds <10ms to query time
- Minimal impact on user experience

### Testing Strategy
Since this is a CLI tool without existing tests:
1. Manual testing with various query patterns
2. Test with empty database (fresh install)
3. Test with large history (100+ logs)
4. Verify token usage doesn't explode

### Migration Path
No database migration needed - all required fields exist.
Feature is backward compatible - users without context keywords see no change.
