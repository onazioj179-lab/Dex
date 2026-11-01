# DEX — Remaining Work

**Date:** 2026-11-01 · **Creator:** Onazi Oj

| # | Requirement | Status | Severity | Why incomplete | Components | Required action | Complexity | Dependencies | Priority |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Merge consent/settings fixes | Open PR #61 | High | Awaiting owner merge | Settings, UKI, notifications | Review + merge | Low | — | P0 |
| 2 | Shell open allowlist | Open PR #62 | High | Awaiting owner merge | `src-tauri/src/main.rs` | Review + merge | Low | — | P0 |
| 3 | Accurate Privacy Policy | BLOCKED | High (legal) | Owner declined rewrite | `PRIVACY.md`, `src/shared/policies.ts` | Approve rewrite from `docs/privacy/DATA_FLOWS.md`; bump version | Low–Med | Owner / legal | P0 |
| 4 | Clean-machine install test | NOT TESTED | Medium | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | Low | VM | P1 |
| 5 | Screen-reader pass | NOT TESTED | Medium | Needs interactive session | All shell UI | Narrator/NVDA walkthrough, fix labels | Medium | Tester | P1 |
| 6 | Signed updates + downloadable apps | BLOCKED | Medium | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | High | Owner | P1 |
| 7 | Terms of Service legal review | PARTIAL | Medium | Not a legal reviewer | `TERMS.md` | Legal review | Low | Legal | P2 |
| 8 | App-level radius sweep | PARTIAL (636 left) | Low | Visual risk across 59 apps | `DEXAPPLICATIONS/*` | Snap per app with visual check | Medium | — | P2 |
| 9 | App-level color sweep | PARTIAL | Low | Not started | `DEXAPPLICATIONS/*` | Replace hardcoded hex with tokens | Medium | — | P2 |
| 10 | Control border contrast | PARTIAL | Low | Needs per-component check | inputs/selects | Stronger border token on controls | Low | — | P2 |
| 11 | Notes drawing + handwritten signature | MISSING | Low | Not started | Notes editor | Canvas block + "signature image" (not cryptographic) | Medium | — | P3 |
| 12 | Podcasts, shared albums, captions | MISSING | Low | Need backends/services | New apps | Product decision first | High | Services | P3 |
| 13 | DEX OS image build + boot test | BLOCKED | Medium | Toolchain/VM | `dex-os/` | Build in CI, boot in QEMU; fix `root=/dev/sda2` → PARTUUID | Medium | VM | P2 |
| 14 | Multi-monitor test | NOT TESTED | Low | Single display | Window manager | Test on two displays | Low | Hardware | P3 |
| 15 | Dock/taskbar visual rework | PARTIAL | Low | Not in scope this pass | Shell | Design pass | Medium | — | P3 |

## Release status

**NOT READY** until #1–#3 are done. After that: **READY WITH DOCUMENTED LIMITATIONS** (items 4–15).
