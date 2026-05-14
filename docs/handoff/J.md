# Track J: Desktop Workflow & Shell Modernization

**Status:** planned
**Release target:** v4.60.1
**Owner:** core

## Scope
Bring the shell to OS-grade quality: snap layouts, multi-monitor, stage, orbit launcher, semantic spotlight, notification grouping, keyboard-first audit, session continuity, focus profiles. Inspirations: macOS Tahoe, Windows snap layouts, Ubuntu/Linux keyboard-first.

## Files
- src/renderer/components/AppManager.tsx (snap layouts ~L2680)
- src/renderer/components/PictureInPicture.tsx
- src/renderer/shell/SpotlightSearch.tsx (semantic upgrade — depends on H1)
- src/renderer/services/FocusSessionSystem.ts
- src/renderer/services/SessionRestore.ts (new or extend existing)
- src/renderer/components/NotificationCenter.tsx (or equivalent)
- docs/keymap.md (new)

## Done
- [ ] none yet

## Next
- [ ] J1 — adaptive workspace layouts (per-monitor, per-task presets); auto-restore on session resume
- [ ] J2 — floating window upgrade: minimize/maximize/snap-half/snap-corner/PiP polish
- [ ] J3 — finish snap layouts (edge + corner + grid) in AppManager.tsx
- [ ] J4 — multi-monitor: per-monitor active app, wallpaper, dock position, scale
- [ ] J5 — stage strip: drag-to-pin, group-by-project, recents-by-context
- [ ] J6 — orbit launcher: radial command menu around cursor (long-press); UKI-driven actions
- [ ] J7 — spotlight depth: semantic results from UKI vector store; instant-answer cards
- [ ] J8 — notification grouping by app + category; quiet hours; focus-mode awareness
- [ ] J9 — keyboard-first audit; document in docs/keymap.md
- [ ] J10 — session continuity: window positions, scroll states, undo stacks per-app
- [ ] J11 — focus profiles per app (hide chrome, mute notifications, dim background)

## Blockers
- J7 depends on Track H1 (vector DB online)
- J6 depends on Track H4 (ContextBus) for context-aware actions

## Verification
- Multi-monitor session restore reliable across reboots (manual smoke on 2-monitor + 3-monitor rigs)
- Snap layouts work edge + corner + grid
- Keyboard-first audit doc complete; every action ≤2 keystrokes from anywhere
- Notification grouping demo passes manual smoke

## Notes
- Inspirations: read patterns, do not copy UI.
