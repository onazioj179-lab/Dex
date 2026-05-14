# Track D: Production Hygiene

**Status:** planned
**Release target:** v4.60.1
**Owner:** core

## Scope
Remove debug noise, annotate intentional silence, and prune dead code. No behavior changes.

## Files
- src/main/**/* (console.* gating)
- src/renderer/**/* (console.* gating)
- src/main/utils/Logger.ts (or equivalent)
- tests/** (re-enable creatorKey test)

## Done
- [ ] none yet

## Next
- [ ] D1 — gate ~100 raw `console.*` calls through `Logger`; log level configurable
- [ ] D2 — annotate the 6 known empty `catch {}` blocks with `// intentional: <why>` comments (do not add behavior)
- [ ] D3 — re-enable the skipped creatorKey test (currently in `xtest`/`it.skip`)
- [ ] D4 — `npx ts-prune` sweep; remove unused exports flagged as safe

## Blockers
- None

## Verification
- `grep -rE "^\s*console\.(log|warn|error|info)" src/main src/renderer | wc -l` drops by ≥80%
- No new lint warnings
- Vitest suite stays at 3471 passing (or higher with re-enabled test)

## Notes
- Don't add validation around system boundaries that already exist; D is hygiene, not depth (depth is Track A).
