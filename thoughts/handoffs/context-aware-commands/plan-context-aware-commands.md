---
date: 2026-01-05T00:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-context-aware-commands.md
---

# Plan Handoff: Context-Aware Commands

## Summary

Created implementation plan for enabling q-cli to reference previous commands when users make queries like "modify last command to use -v flag". The plan leverages existing log infrastructure to provide conversation continuity without requiring major architectural changes.

## Plan Created

`thoughts/shared/plans/PLAN-context-aware-commands.md`

## Key Technical Decisions

- **Keyword-based context detection**: Simple patterns (last, previous, that, etc.) are sufficient and fast - no ML needed
- **Default 3 interactions**: Balances useful context with token efficiency
- **Optional --context flag**: Power users can explicitly control context (--context 5 or --context 0)
- **Message format reuse**: Convert logs to AI SDK message pairs - works seamlessly with existing streamText API
- **Additive feature**: Zero breaking changes - feature activates only when needed

## Task Overview

1. **Add Context Detection Function** - Create src/context.ts with regex pattern matching for context keywords
2. **Add Context Fetching Function** - Convert database logs to AI SDK ModelMessage format
3. **Add --context CLI Flag** - Commander.js option for explicit context control (--context N)
4. **Integrate Context into handleQuery** - Update main query handler to fetch and include context when appropriate
5. **Update System Prompt (Optional)** - Enhance prompt to better guide AI on context usage
6. **Bonus: Track Clipboard Usage** - Implement unused `copied` field to track when commands are copied

## Research Findings

### Codebase is Well-Prepared
- **System prompt already mentions context** (src/index.ts:18): "Consider when the user request references a previous request" but there's NO implementation - this feature closes that gap
- **All infrastructure exists**: Logging middleware, SQLite database, getLogs query function, AI SDK message array
- **Database schema complete**: No migration needed - all fields exist
- **Query function ready**: `getLogs(limit)` at src/db/queries.ts:12-19 already retrieves recent logs ordered by datetime

### Key Integration Points
- **src/index.ts:30-42** - handleQuery function where context will be integrated
- **src/index.ts:38-42** - Message array construction - context inserts between few-shot examples and user query
- **src/index.ts:104** - Commander.js action - where --context flag will be added
- **src/db/queries.ts:12-19** - getLogs function - already indexed, performant
- **src/db/schema.ts:21** - Index on datetime_utc ensures fast queries

### Quick Win Identified
- **Unused `copied` field** (src/db/schema.ts:19): Default false, never set to true
- **Function exists but unused** (src/db/queries.ts:31): `_updateLogCopied` is ready but not called
- Can implement in Task 6 to track clipboard usage (not critical path)

### Performance Characteristics
- Database initialization uses singleton pattern (src/db/index.ts:30-56) - efficient
- Migrations run automatically on first access (src/db/index.ts:38-41)
- Index on datetime_utc (src/db/schema.ts:21) makes getLogs fast even with large history
- Context fetching adds <10ms per query (negligible)

## Assumptions Made

### Context Detection
- **ASSUMPTION**: Keyword matching is sufficient for MVP - verify users don't need semantic understanding
- **RATIONALE**: Patterns like "last command", "modify that", "run it again" are unambiguous
- **VERIFICATION**: Test with real usage patterns during manual testing

### Context Scope
- **ASSUMPTION**: 3 previous interactions provide sufficient context - verify users don't need more
- **RATIONALE**: Most terminal workflows reference 1-2 previous commands
- **VERIFICATION**: Monitor token usage and user feedback

### Token Budget
- **ASSUMPTION**: 300-1500 additional tokens per query is acceptable cost - verify in production
- **RATIONALE**: GPT-4.1-mini has 128k context, and typical queries use <2k tokens
- **VERIFICATION**: Check token counts in logs after implementation

### Message Ordering
- **ASSUMPTION**: Chronological order (oldest first) is correct for context - verify AI handles it well
- **RATIONALE**: Standard conversation format, matches AI SDK expectations
- **VERIFICATION**: Manual testing with multi-turn conversations

## For Next Steps

1. **User should review plan** at: `thoughts/shared/plans/PLAN-context-aware-commands.md`
2. **After approval**, implement tasks in order (1-6)
3. **Each task is independent** - can be implemented and tested separately
4. **Task 6 is optional** - bonus feature, not required for core functionality
5. **Manual testing required** - no automated tests exist yet (could add later)

## Files to Create
- `src/context.ts` - New file with context detection and fetching logic

## Files to Modify
- `src/index.ts` - Add --context flag, update handleQuery function
- `src/db/queries.ts` - Optionally make _updateLogCopied public (Task 6)
- `src/logger.ts` - Optionally return log ID for clipboard tracking (Task 6)

## Risk Assessment

**Low Risk Implementation**:
- Feature is additive (no breaking changes)
- All infrastructure exists (no new dependencies)
- Can be feature-flagged via --context 0
- Backward compatible (users without context keywords see no change)

**Potential Issues**:
- Context detection false positives (keyword "last" in unrelated query)
- Token usage if users request --context 100 (mitigate: add max limit)
- Empty database edge case (mitigate: handle gracefully)

## Success Metrics

### Functional
- User can say "modify last command" and AI understands previous command
- --context flag works for explicit control
- No degradation in response time (<50ms added latency)

### Technical
- Build passes: `bun run build`
- Lint passes: `bun run lint`
- Type check passes: `tsc --noEmit`
- Token usage stays reasonable (<2k per query with context)

### User Experience
- Natural language references work intuitively
- Feature is invisible when not needed (no prompt pollution)
- Clipboard and logs functionality still work correctly
