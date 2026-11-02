# DEX — Remaining Work

**Date:** 2026-11-01 · **Creator:** Onazi Oj

| # | Requirement | Status | Severity | Why incomplete | Components | Required action | Complexity | Dependencies | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Merge launch-policy hardening | DONE (#64 merged) | — | — | `launcher_ctl.rs` | — | — | — | — |
| 2 | Merge Notes sketch/image/blank-note fixes | DONE (#65 merged) | — | — | Notes, controls | — | — | — | — |
| 3 | Accurate Privacy Policy | BLOCKED | High (legal) | Owner declined rewrite | `PRIVACY.md`, `src/shared/policies.ts` | Approve rewrite from `docs/privacy/DATA_FLOWS.md`; bump version | Low–Med | Owner / legal | P0 |
| 4 | Clean-machine install test | NOT TESTED | Medium | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | Low | VM | P1 |
| 5 | Screen-reader pass | NOT TESTED | Medium | Needs interactive session | All shell UI | Narrator/NVDA walkthrough, fix labels | Medium | Tester | P1 |
| 6 | Signed updates + downloadable apps | BLOCKED | Medium | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | High | Owner | P1 |
| 7 | Terms of Service legal review | PARTIAL | Medium | Not a legal reviewer | `TERMS.md` | Legal review | Low | Legal | P2 |
| 8 | App-level radius sweep | DONE | — | All snapped; guard at 0 | — | — | — | — | — |
| 9 | App-level color sweep | PARTIAL | Low | Imosion done (chrome on tokens, green accent → system accent, pinned dark via `.dex-theme-dark`); every green on/off switch OS-wide now uses the accent. Remaining literals are mostly content (track/brush/palette colors) | `DEXAPPLICATIONS/*` (Prism, Flux, CollabHub, Rewind next) | Same treatment per app: chrome → tokens, leave content colors | Medium | — | P2 |
| 10 | Control border contrast | DONE (shared TextInput/Select) | Low | App-local inputs not swept | inputs in apps | Use `--color-border-control` | Low | — | P3 |
| 11 | Notes drawing + handwritten signature | DONE (PR #65) | — | — | — | — | — | — | — |
| 12 | Podcasts, shared albums, captions | MISSING | Low | Need backends/services | New apps | Product decision first | High | Services | P3 |
| 13 | DEX OS image build + boot test | BLOCKED | Medium | Toolchain/VM | `dex-os/` | Build in CI, boot in QEMU; fix `root=/dev/sda2` → PARTUUID | Medium | VM | P2 |
| 14 | Multi-monitor test | NOT TESTED | Low | Single display | Window manager | Test on two displays | Low | Hardware | P3 |
| 15 | Dock/taskbar visual rework | PARTIAL | Low | Not in scope this pass | Shell | Design pass | Medium | — | P3 |

## Part 5 (added 2026-11-01)

| # | Requirement | Status | Severity | Why incomplete | Required action | Priority |
|---|---|---|---|---|---|---|
| 16 | Spatial desktop FPS / GPU measurement, hardware requirements | NOT TESTED | Medium | Preview pane hidden, no frames | Performance-panel trace in the packaged build; one low-end machine | P1 |
| 17 | Spatial: camera update ~20–35 ms with a large on-screen app (50 windows) | PARTIAL | Medium | Dominated by on-screen app content re-style | Profile in packaged build; consider rasterised snapshot only while actively panning, if honest labelling is kept | P2 |
| 18 | Spatial: zones, alignment guides, magnetic snap, distribute, lock, send backward, duplicate view, named viewports, layout export/import, configurable shortcuts, touch-screen gestures | MISSING | Low | Not built yet | Build on `spatialStore` | P2 |
| 19 | Creative suite §7–15 (Design, Photo, Video, Audio, Present, Creative Hub) | NOT STARTED | Medium | Scope; existing apps unchanged | Audit each existing app first, then fill real gaps | P2 |
| 20 | Glass / translucency (§16) | BLOCKED | Low | Conflicts with owner direction "glass is out" | Owner decision | P3 |
| 21 | Markdown cleanup (§1) | BLOCKED | Low | Deleting docs needs approval | Owner approves a list | P3 |
| 22 | Foreign native windows on the canvas | NOT APPLICABLE (Windows host) | — | No supported way to composite other programs' windows into WebView2 | Only via a custom Linux compositor in `dex-os` | — |

## Release status

**NOT READY** until #3 (Privacy Policy) is done and this PR (which also carries #67, which never reached `main`) is merged. After that: **READY WITH DOCUMENTED LIMITATIONS** (items 4–22).
