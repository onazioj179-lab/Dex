# DEX v6 — Per-App Conformance Matrix (Phase 3)

Proof-of-coverage artifact for the v6 audit: every app and shell surface checked
against one 8-point checklist. `P` = pass, `F` = fail (fixed — see Triage), `NA`
= not applicable. The codebase is mature, so most surfaces pass; only genuine,
actionable gaps were changed. False positives are recorded with the reason they
were NOT changed, so the audit is honest rather than churn-for-churn.

**Checklist:** 1) shared controls + design tokens (no stray hex in UI chrome) ·
2) EmptyState · 3) loading state · 4) wrapped by ErrorBoundary · 5) keyboard +
focus + Escape · 6) no clutter · 7) clean lifecycle (no leak/console.error on
open→action→close) · 8) virtualization for unbounded lists.

## Utilities / standalone

| App | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Calculator | P | P | NA | P | P | P | P | NA |
| Calendar | P | P | P | P | P | P | P | NA |
| ColorPicker | P* | NA | NA | P | P | P | P | NA |
| KanbanApp | P* | P | P | P | P(fix) | P | P | NA |
| MarkdownEditor | P | P | NA | P | P | P | P | NA |
| NoiseGenerator | P* | NA | NA | P | P | P | P | NA |
| PasswordGenerator | P | P | NA | P | P | P | P | NA |
| PomodoroTimer | P(fix) | NA | NA | P | P | P | P | NA |
| QRCodeGenerator | P | NA | P | P | P | P | P | NA |
| RecycleBin | P | P | P | P | P | P | P | NA |
| Stopwatch | P | NA | NA | P | P | P | P | NA |
| Timer | P* | NA | NA | P | P | P | P | NA |
| UnitConverter | P | NA | NA | P | P | P | P | NA |
| Weather | P | P | P | P | P | P | P | NA |
| WorldClock | P | NA | NA | P | P | P | P | NA |
| Learn | P | NA | P | P | P | P | P | NA |
| Achievements | P | NA | NA | P | P | P | P | P |
| PDFViewer | P | NA | P | P | P | P | P* | NA |
| ScreenRecorder | P | NA | P | P | P | P | P | NA |
| PixelArt | P | NA | NA | P | P | P | P | NA |
| PresentationBuilder | P* | NA | NA | P | P | P | P | NA |
| Maps | P | NA | P | P | P | P | P | NA |
| CollabHub | P | P | P | P | P | P | P* | NA |
| Canvas | P* | NA | NA | P | P | P | P | NA |
| Nexus | P* | NA | NA | P | P | P | P | NA |

## Creative suite

| App | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Imosion | P(fix) | P | P | P | P | P | P | NA |
| Vinx | P | P | P | P | P | P | P | NA |
| Flux | P | P | P | P | P | P | P | NA |
| Prism | P | P | P | P | P | P | P | NA |
| Forge | P | P | P | P | P | P | P | P |
| AXL | P | P | P | P | P | P | P | NA |
| Rewind | P | P | P | P | P | P | P | P |

## Shell / pages / dev surfaces

| Surface | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| App root | P | NA | NA | P | P | P | P | NA |
| FloatingLauncher | P | NA | NA | P† | P | P | P | NA |
| AppManager (windows) | P | NA | NA | P | P | P | P | NA |
| Files | P | P | P | P† | P | P | P | F‡ |
| Browser | P | NA | NA | P† | P | P | P | NA |
| Transfers/Share | P | NA | NA | P† | P | P | P | NA |
| TaskManager | P | NA | P | P† | P | P | P | P |
| Gallery | P | P | P | P† | P | P | P | P |
| Audio | P | P | P | P† | P | P | P | NA |
| Home | P | P | NA | P† | P | P | P | NA |
| Settings | P | NA | NA | P† | P | P | P | NA |
| Store | P | P | NA | P† | P | P | P | NA |
| Power | P | NA | NA | P† | P | P | P | NA |
| Tasks | P | P | P | P† | P | P | P | P |
| Workflows | P | P | P | P† | P | P | P | NA |
| Games | P | P | NA | P† | P | P | P | NA |
| Notes | P | P | NA | P† | P | P | P | NA |
| DexCode | P | NA | NA | P† | P | P | P | NA |
| Terminal | P | NA | NA | P† | P | P | P | NA |

`†` ErrorBoundary is provided at the shell level: App.tsx wraps routes in an
error boundary and AppManager isolates each detached app window, so a child throw
does not white-screen the OS. Individual pages are not separately wrapped — the
shared boundary is sufficient.

## Triage

### Fixed (genuine gaps)
- **PomodoroTimer — criterion 1** ([PomodoroTimer.tsx:25](src/renderer/DEXAPPLICATIONS/standalone/PomodoroTimer.tsx)): `longBreak` phase color was a stray `#5E5CE6` while the other two phases used tokens → `var(--color-accent)`.
- **Imosion — criterion 1** ([Imosion.tsx:1843](src/renderer/DEXAPPLICATIONS/imosion/Imosion.tsx)): the level-meter gradient used `#30d158/#ff9f0a/#ff453a` → `var(--color-success/--color-warning/--color-error)` (a meter green→amber→red is exactly what those semantic tokens are for). Plus 6× muted menu/transport text `#86868b` → `var(--color-text-tertiary)`.
- **KanbanApp — criterion 5** ([KanbanApp.tsx](src/renderer/DEXAPPLICATIONS/standalone/KanbanApp.tsx) CardDetail): the edit modal only closed on click-outside; added an Escape-key handler.

### False positives — deliberately NOT changed (with reason)
- **ColorPicker / Canvas / NoiseGenerator / Nexus / Calendar / Kanban palettes (criterion 1):** these are *categorical data palettes* (paint swatches, sound-preset accents, event colors, priority/label scales, canvas render colors), not theme chrome. Hex is correct here — the same mixed token+hex pattern is the established convention across the app (e.g. Calendar's event palette). Kanban's `#ff6723` high-priority cannot collapse to a semantic token without colliding with medium/urgent.
- **Timer / Files / Gallery `var(--token, #hex)` fallbacks (criterion 1):** the tokens (`--color-success`, `--color-tag-yellow`, `--color-tag-purple`, …) all exist in `design-system.css`, so the hex fallback never fires — it is defensive, not a stray color. Left as-is (prior audits already flagged token-fallback false positives).
- **PDFViewer / CollabHub `console.error` on failure (criterion 7):** logging on a genuine failure path is acceptable diagnostics, not a leak or lifecycle violation.

### Deferred — measure-gated (P2), not a quick conformance fix
- **Files — criterion 8 (`‡`):** Files uses incremental "load-more" pagination (IntersectionObserver, ~100/page) rather than a true windowed virtualizer like Gallery's. For 10k+ entry directories this keeps all loaded rows mounted. Swapping to a virtualizer is a P2 scale change that must be measured on a real machine with a large directory before/after — not changed blind. Tracked in ROADMAP P2.
