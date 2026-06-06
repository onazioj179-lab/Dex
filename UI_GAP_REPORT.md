# DEX UI — Consistency Gap Report

Surgical UI patch. Goal: native OS feel, sharp at any DPI, restrained color, no
emoji in chrome. Working features were left intact; only consistency gaps closed.

## What changed (this patch)

| # | Gap found | How it was closed |
|---|---|---|
| 1 | **No single token file** — values lived across `tokens.ts`, `design-system.css`, `glassMenu.ts`. | Added **`src/renderer/styles/design-tokens.css`** as the canonical layer (loaded **last** in `main.tsx`, so it wins), mirrored in `tokens.ts`. One place for font, color, spacing, radius, motion, focus, icon sizes. |
| 2 | **Web-font risk in chrome** — chrome could inherit non-system fonts. | `--dex-font-ui: -apple-system, "Segoe UI Variable", "Segoe UI", system-ui, Inter, sans-serif` (SF Pro / Segoe UI Variable / Inter fallback). Exposed as `fontStack.ui`. |
| 3 | **Numeric columns not tabular** — counters/timecodes jittered. | `--dex-numeric` + `.dex-tnum { font-variant-numeric: tabular-nums lining-nums }`. |
| 4 | **Motion inconsistency / bounce** — a `spring` easing with overshoot (`cubic-bezier(0.175,…,1.275)`) violated "no bounce". | Canonical motion tokens: **150 / 180 / 220 ms**, all `cubic-bezier(0.4, 0, 0.2, 1)`, **no overshoot**. `prefers-reduced-motion` collapses them to 1ms. Guard test asserts no `>1` control point. |
| 5 | **Heavy shadows / unclear borders.** | `--dex-hairline` (1px @ 8% opacity), `--dex-hairline-strong` (14%), and one restrained `--dex-elevation` instead of heavy drop shadows. |
| 6 | **Focus rings not standardized / not keyboard-only.** | `--dex-focus-ring` + `.dex-focusable:focus-visible` (keyboard-only, never on mouse). |
| 7 | **Off-size icons / mixed stroke.** | Fixed icon-size set **16 / 20 / 24** (`--dex-icon-*`) + `--dex-icon-stroke: 1.75px` (Lucide 1.5–2px), `.dex-icon*` utilities with `shape-rendering: geometricPrecision` for crisp high-DPI. |
| 8 | **No shared chrome language** — title bar / sidebar / panel styled ad-hoc. | `.dex-titlebar` (frameless, `-webkit-app-region: drag`, hairline base), `.dex-sidebar`, `.dex-panel` — one visual language, plus `.dex-vibrancy` (`@supports backdrop-filter`) for macOS vibrancy / Win11 Mica. |
| 9 | **Emoji — full-system sweep.** Scanned **all 1031 renderer files** (excluding the EmojiPicker feature + emoji/PII-handling code). Found **52 non-ASCII glyphs total**, of which **51 are functional symbols** — macOS keyboard keys `⌘`(U+2318) `⌥`(U+2325) `⌫`(U+232B), a CAD diameter sign `⌀`(U+2300 in AxlDrawing), a mirror glyph `⇕` — and exactly **one real dingbat**, a `✓` in `AiProviderSettings.tsx:199`. | Removed the `✓` (`'Saved ✓'` → `'Saved'`). **The UI is now emoji-clean.** The functional keyboard/CAD symbols were intentionally kept — removing `⌘`/`⌥` would break Mac shortcut hints and `⌀` would break CAD dimension labels (that would be the opposite of "no loose ends"). Guard test fails on any real emoji/dingbat. |
| 10 | **Tokens not applied system-wide** — the canonical file existed but only opt-in classes used it. | Added a **global application layer** in `design-tokens.css`: app-root (`html, body, #root`) font → system stack; `:where(...)`-scoped (specificity 0, never overrides components) keyboard `:focus-visible` ring, OS-feel motion transitions on interactive elements, tabular numerals on `time`/`[data-numeric]`, hairline `<hr>`. Cascades to all 20+ inner apps with **zero risk** to existing component styles. |

## Verification

- `tests/unit/design-tokens.test.ts` — 5 assertions: system font stack, no-bounce
  motion, hairline + focus ring + 16/20/24 icon set, tabular nums + shell
  primitives, **no emoji**. All green.
- Tokens load order: `globals.css` → `design-system.css` → **`design-tokens.css`**
  → `print.css` (canonical layer is authoritative).

## Not done here (tracked, larger efforts — ROADMAP-600 §2.L / §R)

- Per-component restyle of all 20+ inner apps onto the new tokens (mechanical
  sweep; the canonical layer + utilities make it incremental and low-risk).
- Full Radix/shadcn re-skinning and the ~247 inline `backdrop-filter` → token
  consolidation (already tracked as ROADMAP #542).
- These are deliberately staged so this patch stays surgical and breaks nothing.
