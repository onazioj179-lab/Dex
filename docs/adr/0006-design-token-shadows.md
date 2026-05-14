# 0006. Design Token Shadows

Date: 2026-05-13

## Status

Accepted

## Context

Pre-v4.58 the renderer carried hundreds of inline `boxShadow: '0 4px 12px rgba(0,0,0,0.4)'`-style literals. Each component invented its own elevation scale, which made dark-mode tuning (and later, the translucency revamp) a manual sweep across dozens of files. The accessibility audit also flagged inconsistent contrast under the cards-on-cards layouts.

## Decision

Standardise on a tiered shadow token set in [design-system.css](../../src/renderer/styles/design-system.css):

- `--pg-shadow-1` … `--pg-shadow-5` — ambient elevation steps (cards, popovers, modals, drag previews, system overlays).
- `--pg-shadow-glow-*` — focus / brand emphasis glows that compose with the ambient shadow.
- Brand-specific shadows (Spotify green, Apple Music red, etc.) stay literal with a `/* brand */` comment.

Components MUST consume `var(--pg-shadow-N)` and MUST NOT introduce new inline `boxShadow` literals. The Track B sweep removes existing offenders progressively.

## Consequences

Positive:
- Single point of control for elevation rebalancing (handled the v4.58 translucency pass in one file).
- Dark-mode shadows can be retargeted via custom-properties, no JS needed.

Negative:
- Adds a small learning curve for new contributors; mitigated by [docs/PALETTE.md](../PALETTE.md) and the Track B handoff doc.

Neutral:
- Brand shadow literals remain intentionally outside the system.

## Alternatives Considered

- Tailwind elevation utilities — rejected: Tailwind is opt-in only for marketing pages; the app shell is hand-rolled CSS-in-JS.
- Per-component shadow constants — rejected: scatters the system back across the codebase and breaks the single-file dark-mode pass.
