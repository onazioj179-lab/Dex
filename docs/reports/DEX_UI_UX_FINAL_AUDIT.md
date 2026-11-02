# DEX: UI/UX Final Audit (macOS Blue Modern)

**Date:** 2026-11-01 · **Creator:** Onazi Oj · Supersedes `PART3_UI_UX_AUDIT.md`

## Colour

| Token | Light | Dark | Matches the Part 4 table |
|---|---|---|---|
| Primary blue (text, links, focus) | **#0066CC** | #0A84FF | Dark yes. Light **adjusted**: the table's #007AFF is 4.02:1 on white and fails AA |
| Filled blue (buttons, toggles, chips) `--color-accent-fill` | #0066CC | **#0071E3** | New. White on #0A84FF is 3.65:1 (fails AA); white on #0071E3 is 4.70:1 |
| Background | #F5F5F7 | #111215 | Yes |
| Surface | #FFFFFF | #1C1C1E | Yes |
| Secondary surface | #F2F2F7 | #2C2C2E | Yes |
| Primary text | #1D1D1F | #F5F5F7 | Yes |
| Secondary text | #636366 | #AEAEB2 | Yes |
| Border | #D1D1D6 | ~#38383A (`rgba(255,255,255,.16)` on base) | Yes |
| Control border | #7E7E83 | #6B6D73 | Added for ≥3:1 on form controls |

Measured contrast (WCAG): dark primary text 17.2:1, secondary 8.5:1 on the base and 6.3:1 on the elevated surface. Light primary 15.5:1, secondary 5.5:1. Light accent 5.1–5.6:1. White on the filled accent: 4.70:1 dark, 5.57:1 light. Control borders: 3.3:1 dark, 3.7:1 light.

Enforced by `tests/unit/palette-blue-modern.test.ts`, which checks the table values, the boot mirror (`index.html`) against the runtime tokens, and the AA pairs. The 210 filled-accent sites in 79 files use the fill token. A custom accent (Dark Knight, Nanite, user colour) drives the fill too.

**Remaining:** 1,143 hard-coded hex values in `DEXAPPLICATIONS/*` and 573 in shell components and pages. Many are canvas or editor colours where hex is correct (colour pickers, AXL renderer, media scopes). A sweep of UI chrome hex to tokens is tracked in `DEX_REMAINING_WORK.md`.

## Radius

Scale 4 / 6 / 10 / 14 / 18 / 24 / full. **Every inline radius in the renderer is on the scale.** The ratchet `radius-scale-ratchet.test.ts` has a baseline of 0, so any new off-scale value fails CI.

## Motion

| Token | ms | Part 4 target | In range |
|---|---|---|---|
| fast (immediate feedback) | 100 | 80–120 | ✓ |
| normal (hover / press) | 150 | 120–180 | ✓ |
| slow (standard transition) | 220 | 180–260 | ✓ |
| panel | 260 | 220–320 | ✓ |
| major | 340 | 280–420 | ✓ |

There is one source, `styles/motionDurations.ts`, mirrored in CSS and checked by `motion-durations.test.ts`. Reduced motion (OS setting or the DEX toggle) collapses durations to 0.01 ms, measured in the packaged app in Part 3. Assistant states use these tokens: the task status pills, the rotating status verbs (`uki/spinnerVerbs.ts`, shown only while a real request is running, never as a fake progress percentage), and the approval card.

## Assistant surfaces

| Surface | Status |
|---|---|
| AI panel (overlay) | Existing; DEX Bar mic mirrors the awake/asleep state |
| Expanded workspace (Uki app) | Existing; "look at my screen" now works in the Tauri build via the system picker |
| Command palette / slash commands | Existing |
| Voice overlay | Existing transcript bubble and listening state |
| Task dashboard | Nexus: Pause / Resume / Cancel added; statuses include paused and cancelled |
| Memory settings | **View saved memory** with Forget per item, **Export memory (JSON)**, honest **Clear All Memory** |
| Model settings | **Processing** (Hybrid / Local only / Cloud only / Manual), **Pinned model**, **Reasoning effort**, live banner. Says plainly when Ollama has no models |
| Permissions center | Existing grant/revoke; the activity log (Security Center) gains Clear log |

## Accessibility

- New controls are native `<select>` or `<button>` elements with labels; the task buttons have `aria-label`s that name the task. The memory list uses `role="list"`, and the toggle reports `aria-expanded`.
- Keyboard: all new controls are in the tab order. No custom key handling was needed.
- **Not tested:** a full screen-reader walkthrough (Narrator/NVDA), RTL layout, and text scaling of the new panels. Tracked.
