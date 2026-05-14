# Track O: System-Wide Completion Audit

**Status:** continuous
**Release target:** v4.60.1 + ongoing
**Owner:** core

## Scope
Find what was skipped. Ongoing audit of compositor behavior, shell behavior, missing integrations, perf bottlenecks, memory retainers, recovery paths, workflow interruption handling. Findings become entries in other tracks or new tracks.

## Files
- All. Output is documentation: docs/audit/<date>-<area>.md

## Done
- [ ] none yet

## Next
- [ ] O1 — compositor audit: drag-drop, focus, z-index inconsistencies across pages
- [ ] O2 — shell behavior audit: dock pin, stage, spotlight invocation paths consistent everywhere
- [ ] O3 — missing integrations: which apps don't report to ContextBus (depends on Track H4)
- [ ] O4 — perf bottleneck profile: Chrome DevTools Performance run on each page; capture top 5 long tasks; fix
- [ ] O5 — memory inefficiency profile: heap snapshot per page; identify retainers
- [ ] O6 — recovery audit: verify crashRecovery handles each app's crash; restore state
- [ ] O7 — workflow interruption audit: long ops show progress + cancel + resume

## Blockers
- O3 waits on Track H4 (ContextBus)

## Verification
- Audit findings filed as issues with `track:O` label
- Each finding either resolved in same release or assigned to a future track

## Notes
- This track produces issues, not code. Resolution lives in other tracks.
