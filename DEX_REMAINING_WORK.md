# DEX: Remaining Work

**Date:** 2026-11-01 · **Creator:** Onazi Oj · This is the active backlog. Items from completed task files were moved here before those files were archived.

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Merge `claude/dex-part5-spatial` (also carries #67, which merged into a feature branch and never reached `main`) | Open PR | Owner merges personally | — | Review + merge | Owner | P0 |
| 2 | Accurate Privacy Policy | **BLOCKED** | Owner has not approved the rewrite | `PRIVACY.md`, `src/shared/policies.ts` | Approve a rewrite from `docs/privacy/DATA_FLOWS.md` + `docs/reports/DEX_AI_PRIVACY.md` (must disclose Web Speech cloud recognition, provider data flow, Ollama check) | Owner / legal | P0 |
| 3 | Local AI measured end to end | BLOCKED | Ollama is installed with 0 models; pulling one is a multi-GB download | Ollama | Approve `ollama pull llama3.2:3b`, then measure first token and tokens/s | Owner approval | P1 |
| 4 | Cloud AI measured end to end | NOT TESTED | No provider key here | Providers | Add a key; run a scripted agent session (web search + file read) | Owner key | P1 |
| 5 | Screen sharing in the packaged app | NOT TESTED | The system picker needs a human to choose a window | `uki/screenCapture.ts` | Click "look at my screen", pick a window, confirm one frame is sent and the indicator clears | Tester | P1 |
| 6 | Clean-machine install test | NOT TESTED | No VM | NSIS/MSI, WebView2 bootstrapper | Install on a VM without WebView2 | VM | P1 |
| 7 | Screen-reader pass | NOT TESTED | Needs an interactive session | Shell + new assistant controls | Narrator/NVDA walkthrough | Tester | P1 |
| 8 | Signed updates + downloadable apps | BLOCKED | Needs signing key + hosting | Updater, Store | Owner creates key; choose hosting | Owner | P1 |
| 9 | Cloud model catalog is dated | PARTIAL | Static lists (`gpt-4o`, `claude-3-5-*`, `gemini-1.5-*`) | `uki/providers/*.ts` | Add current model ids per provider (verify ids against provider docs) | — | P2 |
| 10 | AI spending limits / usage totals | MISSING | Usage counts returned per call are not aggregated | `orchestrator.ts` | Sum `usage` per provider per day; optional cap blocks calls | — | P2 |
| 11 | Agent resume after app restart | MISSING | Interrupted tasks are marked failed (honest), not resumed | `ukiTasksStore.ts` | Persist step checkpoints + replay | — | P3 |
| 12 | Cross-device continuity | MISSING | No sync service exists | — | Product decision + authenticated, encrypted sync backend | Service | P3 |
| 13 | Camera understanding | MISSING | No assistant camera capture (deliberately not continuous) | — | One-shot camera frame via `getUserMedia`, same pattern as the screen picker | — | P3 |
| 14 | Offline speech recognition | MISSING | Web Speech API may use an online service | Voice | Evaluate an on-device ASR (e.g. a small Whisper build) | — | P3 |
| 15 | Live boot image root device | BLOCKED (boot-critical) | Live `grub.cfg` uses `root=/dev/sda2` | `dex-os/boot/grub.cfg` | Use `root=LABEL=DEX_ROOT` (see `docs/reports/DEX_UKI_INTEGRATION.md`) | Owner approval + VM | P2 |
| 16 | Unified Kernel Image, Secure Boot, rollback | MISSING | GRUB + bzImage today; no signing, no previous-kernel entry | `dex-os/` | Design decision; owner-held keys | Owner | P3 |
| 17 | DEX OS image build + boot test | BLOCKED | No Buildroot toolchain/VM here | `dex-os/` | Build in CI, boot in QEMU | VM | P2 |
| 18 | App-level colour sweep | PARTIAL | Imosion done (#67: chrome on tokens, pinned dark); green switches OS-wide now accent. Other apps still have UI-chrome hex (many remaining values are canvas/editor content colours) | `DEXAPPLICATIONS/*`, shell | Same per app: Prism, Flux, CollabHub, Rewind next | — | P2 |
| 19 | Terms of Service legal review | PARTIAL | Not a legal reviewer | `TERMS.md` | Legal review | Legal | P2 |
| 20 | Podcasts, shared albums, live captions | MISSING | Need backends/services | New apps | Product decision first | Services | P3 |
| 21 | Multi-monitor test | NOT TESTED | Single display | Window manager | Test on two displays | Hardware | P3 |
| 22 | Dock/taskbar visual rework | PARTIAL | Not in scope this pass | Shell | Design pass | — | P3 |

## Part 5: spatial desktop and creative suite (2026-11-01)

| # | Requirement | Status | Why incomplete | Components | Next action | Needs | Priority |
|---|---|---|---|---|---|---|---|
| 23 | Spatial desktop FPS / GPU, hardware requirements | NOT TESTED | Preview pane hidden, so no frames | `shell/spatial/*` | Performance-panel trace in the packaged build; one low-end machine | — | P1 |
| 24 | Spatial camera ~20–35 ms per update with a large on-screen app (50 windows) | PARTIAL | Dominated by the on-screen app's restyle | AppManager world layer | Profile in packaged build | — | P2 |
| 25 | Spatial: zones, guides, magnetic snap, align/distribute, lock, send to back, saved views, layout files, rebindable shortcuts, touch pinch | DONE (#70) | — | `spatialStore.ts`, `SpatialHud.tsx` | Duplicate views not applicable: DEX apps are single-instance | — | — |
| 26 | Creative suite §7–15 | PARTIAL | Canvas now has editable whiteboard objects + templates; Creative Hub app added; PRISM shows image metadata. Not done: shared assets library, Video proxy/hardware-decode audit, Audio/Present gap audit | Canvas, CreativeHub, Prism | Audit Vinx, Imosion, Presentation against §12–14 next | — | P2 |
| 27 | Glass / translucency (§16) | DONE | Owner chose refined glass (2026-11-02): theme-aware, 20px blur, chrome only; app windows solid | Shell | — | — | — |
| 28 | Markdown cleanup (§1) | DONE (#70) | Owner approved; 9 files retired, open items carried below, 0 broken links | — | — | — | — |
| 29 | Foreign native windows on the canvas | NOT APPLICABLE on Windows | No supported way to composite other programs' windows into WebView2 | — | Only via a custom compositor in `dex-os` | — | — |
| 30 | Packaged app exits with `thread '<unknown>' has overflowed its stack` | OPEN | Seen 3× right after CDP tracing with gpu/viz/cc categories and 50 windows; 0 DEX native calls in the window before; not reproduced without tracing (4+ min, 50 apps) | Host process / WebView2 | Reproduce without tracing on a quiet machine; if it recurs, capture a minidump | — | P1 |
| 31 | Test isolation: packaged-app tests write the native `dex-kv.json` mirror even with a separate WebView2 profile | OPEN (process) | DEX mirrors localStorage into `%APPDATA%\com.onazioj.dex` | Test tooling | Add a `DEX_DATA_DIR` override for test runs; until then snapshot → run → restore (done for every run so far) | — | P2 |
