# Track B: Design Token Convergence

**Status:** active
**Release target:** v4.60.1
**Owner:** core

## Scope
Migrate the remaining hardcoded color/spacing/font literals onto the existing token set in [design-system.css](../../src/renderer/styles/design-system.css). Brand colors (Spotify green, Apple Music red, etc.) are explicitly kept literal with a `/* brand */` comment.

## Files (primary, top-noisy)
- src/renderer/components/AppManager.tsx
- src/renderer/pages/Settings.tsx
- src/renderer/pages/Browser.tsx
- src/renderer/DEXAPPLICATIONS/imosion/*
- src/renderer/components/ColorPicker.tsx

## Done
- [x] B0 — shadow tokens (`--pg-shadow-*`, wave 1+2, 30 sites) — completed prior sessions
- [x] B1 — translucency scale (`--pg-translucency-1..5`) and motion curves (`--pg-curve-*`) added to design-system.css

## Next
- [ ] B2 — color literal sweep in top 5 noisy files; replace `#xxxxxx` and `rgba(...)` with `var(--color-*)` where they map. Brand colors stay literal with comment.
- [ ] B3 — spacing literal sweep: `padding: 8px 12px` → `padding: var(--space-2) var(--space-3)`; same in margin/gap.
- [ ] B4 — font-size literal sweep: `fontSize: '14px'` → `fontSize: 'var(--text-base)'`. Skip Imosion which has its own sub-system.
- [ ] B5 — verify Imosion sub-system tokens align with global (separate doc).

## Blockers
- None

## Verification
- `grep -nE "padding: '[0-9]+px ?[0-9]*px?'" src/renderer/components/AppManager.tsx | wc -l` drops by ≥80%
- Similar grep for hex literals across the 5 top files drops by ≥80%
- Visual diff (manual): no perceptible change on any page

## Notes
- ColorPicker line ~330 ring composite intentionally uses raw rgba (kept; documented in code comment).
- Settings line ~4654 accent-blue glow literal intentionally retained.
