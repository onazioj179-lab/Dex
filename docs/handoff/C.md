# Track C: Accessibility Pass

**Status:** planned
**Release target:** v4.60.1
**Owner:** core

## Scope
Bring the renderer to WCAG 2.1 AA on the most-used surfaces: aria-labels on icon-only buttons, full keyboard nav, visible focus rings, live regions for toasts, and `prefers-reduced-motion` compliance throughout `UnifiedMotionSystem`.

## Files
- src/renderer/components/* (top 50 by usage)
- src/renderer/services/UnifiedMotionSystem.ts
- src/renderer/shell/SpotlightSearch.tsx
- src/renderer/shell/EnhancedContextMenu.tsx
- src/renderer/components/ToastManager.tsx (or equivalent)

## Done
- [ ] none yet

## Next
- [ ] C1 — audit top 50 components for missing aria-label / aria-labelledby on icon-only buttons; fix
- [ ] C2 — full keyboard nav for SpotlightSearch + all context menus (arrow keys, Enter, Escape, Home/End)
- [ ] C3 — replace `:focus` with `:focus-visible` everywhere in design-system.css
- [ ] C4 — wire toasts and async status into a single `<div role="status" aria-live="polite">`
- [ ] C5 — verify `UnifiedMotionSystem.ts` short-circuits all transitions when `prefers-reduced-motion: reduce`

## Blockers
- None

## Verification
- Run axe-core on each top-level page; zero serious violations
- Manual keyboard-only smoke: open spotlight, navigate dock, open settings, dismiss modal — all without mouse
- Toggle OS reduce-motion; confirm transitions short-circuit (not just slow)

## Notes
- Target the loudest pages first (Settings, Browser, Files, AppManager).
