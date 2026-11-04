# DEX OS 7.0.1 — Verification

**Date:** 2026-11-02 · **Creator:** Onazi Oj · **Branch:** `claude/dex-part4` (contains `main` through PR #71 and #72; reconciled with the parallel 7.0.1 pass from `claude/cranky-hopper-4f196b`)

Statuses: VERIFIED COMPLETE · PARTIAL · BROKEN · MISSING · BLOCKED · NOT APPLICABLE · NOT TESTED. Only VERIFIED COMPLETE counts as done.

**Release verdict: NOT READY.** Builds, tests and the bundle gate pass, but the release gates below are not met: the owner has not merged this branch (#1), the Privacy Policy rewrite is unapproved (#2), the installers are unsigned (#8), and no clean-machine install or screen-reader pass has been run (#6, #7). Nothing was published.

## Part 6 (7.0.1) acceptance

| Requirement | Status | Evidence |
|---|---|---|
| Version 7.0.1 everywhere | VERIFIED COMPLETE | `package.json`, lockfile root, `tauri.conf.json`, `Cargo.toml`/`Cargo.lock`, `PLATFORM_VERSION`; installers named `DEX_7.0.1_*`; About shows the runtime version |
| Creator attribution (Onazi Oj) | VERIFIED COMPLETE | About (creator card + rows), installer `publisher`/`copyright`, crate description; legal copyright line kept |
| No coding-agent branding | VERIFIED COMPLETE | Repo-wide scan for agent/AI-generator strings: none in product code; no AI trailers in the last 200 commits |
| Third-party notices intact | VERIFIED COMPLETE | `NOTICE` + `LICENSE` bundled as installer resources; license page in installer |
| Battery out of the top bar | VERIFIED COMPLETE | Removed from `AppManager` (and its listener); Control Center keeps it and detects battery-less desktops; preview checked |
| Interface Transparency slider (0–100) | VERIFIED COMPLETE (unit) / NOT TESTED (rendered click-through) | Two implementations were built in parallel; the reconcile merge keeps **main's** (PR #71: `InterfaceTransparencyControl`, separate blur strength, default reads 40%, `interfaceTransparency.test.ts`). This branch's engine was dropped; its compact slider now drives main's store from Control Center. The live checks recorded below (70% → 24px blur, 55% default) were on the dropped engine and must be repeated (#33) |
| Light/dark | VERIFIED COMPLETE (shell, Calculator, live activities) / PARTIAL (creative suite) | Glass fills are theme tokens; Calculator computed colours checked in light mode; creative-suite colour pass still open (#18) |
| Calculator | VERIFIED COMPLETE | `calculator-engine.test.ts` (10); live keyboard run: `12+7=19`, repeat `=` → 26, `9÷0` → Error + message, `0.1+0.2=0.3`, backspace, `200+10%=220`, operator highlight; `Function()` eval removed |
| Top bar / DEX Bar | VERIFIED COMPLETE (overlap, hit target) | DEX Bar reserves its strip (apps and maximized windows end above it; checked in preview); Control Center button 28×24 |
| Live activities | VERIFIED COMPLETE (store, UI) / NOT TESTED (real downloads) | One store for all producers; failure/cancel shown honestly; transfer Cancel wired; `live-activity-unified.test.ts` (5); preview: 340×52 cards, Cancel calls the task |
| No forced AI runtime | VERIFIED COMPLETE | No startup Ollama probe; local AI opt-in; `local-ai-optin.test.ts` (4); DEX bundles/installs no runtime |
| Background processes | VERIFIED COMPLETE (renderer) | Thermal monitor: perpetual rAF loop → 1 s burst / 10 s; preview idle Home: 0 frame callbacks/s, 0.2 timer wake-ups/s, thermal `cool` (was `critical`); `thermal-burst.test.ts` |
| Popups | VERIFIED COMPLETE (audit) | Startup: first-run setup only; achievements are silent; no update/promo dialogs found |
| Obsolete goal/philosophy copy | VERIFIED COMPLETE | None left in the product (code comments only); About marketing cards removed (one claimed automatic updates) |
| Production build settings | VERIFIED COMPLETE | Rust: `opt-level 3`, thin LTO, 1 CGU, `.pdb`-only debug info, unwinding panics. Frontend: esbuild minify, no source maps, `console.log/debug/info/trace` marked pure |
| Obfuscation | EVALUATED, NOT ADDED | Minification + identifier mangling only. A JS obfuscator would break dynamic imports/IPC and cost startup time; security-sensitive work (auth, keys, file access) already lives in Rust behind IPC |
| Embedded secrets | VERIFIED COMPLETE | Pattern scan of source, history-tracked files and `dist/renderer`: only test fixtures; `.env.example` holds no secrets |
| Release integrity | VERIFIED COMPLETE (checksums) / BLOCKED (signed updates) | Bundle gate writes `SHA256SUMS-7.0.1.txt`, rejects source maps/env/tests in the frontend, checks the WebView2 loader import, reports Authenticode status. Signed update channel needs the owner's key (#8) |
| Code signing | BLOCKED | No certificate configured; gate reports `NotSigned` for both installers. Not faked |
| Sound effects | FIXED / NOT TESTED (audible playback) | DEX ships no audio files (nothing can go missing). Found: Settings › Notifications › Sound did nothing and Windows toasts were always silent (the WinRT writer mutes toasts with no sound). Now the setting is passed to the native toast (`osToastSound` → system default sound) and Transfers' inline chimes respect it; `settings-wiring.test.ts`. A complete UI sound engine in `utils/ux-depth.ts` is unused (#30) |
| Packaged app smoke test | NOT TESTED for 7.0.1 | Last packaged CDP smoke was the Part 4 build; needs a run on a copy of the profile |
| High-DPI 125/150/200%, multi-monitor | NOT TESTED | Single display here (#21) |
| Old release cleanup | NOT DONE (by design) | Published releases untouched. Local 6.1.0 installers remain in this worktree's `target/` until the owner confirms 7.0.1 installs |
| Deployment | NOT DONE | Nothing published; requires owner approval and signing |

## Tests and builds (7.0.1)

| Check | Result |
|---|---|
| `tsc --noEmit` (after merging `main`) | **0 errors** |
| Full `vitest run` (before merging `main`) | 519 files passed, 2 failed, 2 skipped; 5,427 tests passed. Failures: `ai-connect` (expected by the local-AI opt-in; test updated, 28/28 pass) and `renderer-pages › Achievements` (10 s timeout under load; 23/23 pass alone) |
| Full `vitest run` (after merging `main`, run during the installer build) | 512 files passed, 5 failed, 2 skipped; 5,306 tests passed, 6 failed. Real: `radius-scale-ratchet` and `ui-color-ratchet` (off-scale radii / bare white in Part 5 files from `main`) → fixed in `259b992`, both pass. Load-only: `renderer-pages › Settings`, `component-real › Settings`, `uki-compressed-memory` (2 tests) → 47/47 pass when rerun alone |
| Watermark / attribution check | OK |
| `npm run build:tauri` #1 (before merge) | **Passed** in 36.5 min: NSIS 14.3 MB (6.1.0: 15.1), MSI 17.8 MB (6.1.0: 19.0), loader static, no dev files, checksums written, `NotSigned` |
| `npm run build:tauri` #2 (after merge, at `baf7367`) | **Passed** in 31.9 min: NSIS **14.4 MB**, MSI **17.8 MB**, exe **37.1 MB** (6.1.0: 40.1 MB), loader static, no dev files, `NotSigned`. Only change after this build: `259b992` (three 1–2 px radius snaps and a white→`--color-accent-text` token swap, visually identical) |
| Installers vs final code | The installers above were built at `baf7367`, **before** the reconcile merge with main's 7.0.1 pass. They do not contain the final code; rebuild before any install test |
| `SHA256SUMS-7.0.1.txt` (pre-reconcile build) | `3510ab9a0fc186d9697c403f2f186099e3b51b27d5261c66fa143206f7fd2059  DEX_7.0.1_x64-setup.exe`<br>`be4e2d7babb0376655601cc0aff80296bd65238f4fc9a707c5e262d895d6976b  DEX_7.0.1_x64_en-US.msi` |
| Production bundle | 0 source maps; `console.log` calls 2 (vendor), `console.warn/error` kept for diagnostics |
| Glass (dev preview, before the reconcile merge) | Theme-token fills followed a real theme toggle with no re-apply. Superseded: the shipped engine is now main's (see the slider row) |

Measurements not taken: cold/warm start time, idle memory, theme-switch latency, glass rendering cost (needs a packaged-app trace).

## Carried forward: Part 4 evidence (2026-11-01)

Kept as the record for the assistant work that ships in 7.0.1. Row numbers (#n) refer to `DEX_REMAINING_WORK.md`.

### Stage A — previous work (re-verified, not assumed)

| Area | Status | Evidence / change in this pass |
|---|---|---|
| Part 1: WebView2 detection + static loader, startup hardening, idle CPU, debloat | VERIFIED COMPLETE (from Part 1/3 evidence; code unchanged) | `docs/reports/PART1_SYSTEM_AUDIT_REPORT.md`, `PERFORMANCE_REPORT.md` |
| Part 1: clean-machine WebView2 install | NOT TESTED | No VM (#6) |
| Part 2: storage/cache controls, consent, removable apps | VERIFIED COMPLETE | Part 2 evidence; unchanged |
| Part 2: **data deletion (UKI memory)** | **was BROKEN → VERIFIED COMPLETE** | "Clear All Memory" only cleared the native archive; now clears turns, archives, transcript, reasoning trail + native. Tests: `uki-memory-controls.test.ts` |
| Part 2: radius tokens | **PARTIAL → VERIFIED COMPLETE** | All 636 remaining inline radii snapped; ratchet baseline 0 |
| Part 2/3: colour tokens / macOS Blue Modern | VERIFIED COMPLETE (tokens) / PARTIAL (in-app hex) | Tokens = Part 4 table (light accent AA-adjusted); new AA fill token across 210 sites; `palette-blue-modern.test.ts`. In-app hex sweep #18 |
| Part 2: motion system | VERIFIED COMPLETE | 100/150/220/260/340 ms all inside the Part 4 ranges; `motion-durations.test.ts` |
| Part 2: Privacy Policy | BLOCKED | Owner approval (#2) |
| Part 2: screen reader | NOT TESTED | #7 |
| Part 3: Notes sketch/signature, image + blank-note fixes | VERIFIED COMPLETE | PR #65 merged |
| Part 3: launch-policy hardening | VERIFIED COMPLETE | PR #64 merged |
| Part 3: Canvas boards in folders (IndexedDB, safe migration) | VERIFIED COMPLETE (unit) | `canvas-boards.test.ts` (5) — carried over and committed here |
| Part 3: private Windows toasts while locked | VERIFIED COMPLETE (unit + cargo check) | `settings-wiring.test.ts` |
| Part 3: Linux image build/boot, UKI | BLOCKED / NOT APPLICABLE | `docs/reports/DEX_UKI_INTEGRATION.md` |
| Part 3: podcasts, shared albums, captions, multi-monitor | MISSING / NOT TESTED | #20, #21 |

### Markdown cleanup (Part 4)

- Part 1–3 reports moved from the repo root to `docs/reports/` (renamed `PART*_…`, typo `TUARI` fixed), with an index (`docs/reports/README.md`). All references updated; no content deleted.
- `docs/PR-DESCRIPTION.md` (a stale PR body) moved to `docs/archive/`.
- Unfinished items from the old reports are in `DEX_REMAINING_WORK.md` (the single active backlog).
- Kept untouched: README, LICENSE, NOTICE, PRIVACY, TERMS, SECURITY, CONTRIBUTING, ROADMAP, architecture/API docs. Nothing was permanently deleted, so no deletion approval was needed.

### Stage B — assistant (UKI) acceptance matrix

| Requirement | Status | Evidence |
|---|---|---|
| Modular architecture (UI / orchestrator / runtime / memory / device / agents / safety) | VERIFIED COMPLETE | `docs/reports/DEX_AI_ARCHITECTURE.md` |
| Natural-language interaction, multi-step tool loop | VERIFIED COMPLETE (mocked model) / NOT TESTED (live) | Agent tests; no provider key here (#4) |
| Adaptive reasoning profiles (Fast/Balanced/Deep/Auto) | VERIFIED COMPLETE | `assistantPolicy.ts`; tests; Settings control |
| Model selection + routing + fallback | VERIFIED COMPLETE (logic) | Provider/route tests |
| **Processing modes enforced (Local / Hybrid / Cloud / Manual)** | VERIFIED COMPLETE | Enforced in `chat()` + stream; test proves `fetch` never called for cloud in Local only. Fixed streaming fallback that sent "Offline" requests to a cloud provider |
| Local AI (Ollama) | PARTIAL (opt-in since 7.0.1) | **Fixed: Ollama was unreachable from the packaged app (403 on its origin)**; native proxy verified in the packaged build. Installed-model discovery + keyless routing verified; generation not measured (0 models installed, the download needs approval: #3) |
| Secure API-key storage | VERIFIED COMPLETE (Windows) | New `secrets_ctl.rs` (DPAPI via crypt32, Rust tests); keystore migration tests. UI no longer claims a keychain it didn't use |
| Permissions + risk levels + confirmations | VERIFIED COMPLETE | `DEX_AI_PERMISSIONS.md`; agent tests |
| File operations (find/read/create/rename/move/Recycle Bin), scoped | VERIFIED COMPLETE (fake native) | `fileTools.ts` tests; native handlers pre-existing |
| Prompt-injection defences | PARTIAL | Code-enforced gates + untrusted-data labelling; no adversarial eval suite |
| Audit log (persistent, clearable) | VERIFIED COMPLETE | Security Center; tests |
| Autonomous tasks: pause / resume / cancel | VERIFIED COMPLETE | Store + agent cancel tests; Nexus controls |
| Background tasks persist across restart | PARTIAL | Ledger persists; interrupted runs are marked failed, not resumed (#11) |
| Scheduled jobs | VERIFIED COMPLETE (pre-existing) | `scheduledTasksStore` |
| Memory controls (on/off, retention, view, forget, export, clear) | VERIFIED COMPLETE | Settings; tests. Edit-in-place: NOT APPLICABLE (memories are recorded exchanges) |
| Voice (STT/TTS, visible state, user-started) | PARTIAL | Pre-existing Web Speech path; may use an online service (#14); latency not measured |
| Screen understanding (user-authorised, one frame) | PARTIAL | System-picker capture added (Tauri had no capture handler); unit-tested; needs a human run (#5) |
| Camera understanding | PARTIAL | One-shot frame with an explicit toggle, unit-tested; real camera not tested (#13) |
| Cross-device continuity | MISSING | No sync service (#12) |
| Cost controls | VERIFIED COMPLETE (tokens) / PARTIAL (money) | Daily usage totals + optional daily cloud token cap that blocks before sending and falls back to local (`ai-usage-cap.test.ts`); no currency budget (#10) |
| UKI boot integration | NOT APPLICABLE / BLOCKED | No UKI in `dex-os/`; assistant is never a boot dependency |
| macOS Blue Modern UI + motion | VERIFIED COMPLETE (tokens) | `DEX_UI_UX_FINAL_AUDIT.md`. Light mode checked in the packaged app: fixed the glass-off shell staying near-black, plus 6 hard-coded dark surfaces and 71 low-contrast accent fills |
| Accessibility (new controls labelled, keyboard reachable) | PARTIAL | Screen reader not run (#7) |
| No AI-generator branding; creator Onazi Oj | VERIFIED COMPLETE | No such strings added; commits carry no AI trailers |

### Part 4 tests and checks

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| Full vitest suite (`vitest run`) | **511 files passed, 2 skipped; 5,378 tests passed, 14 skipped, 0 failed** (933 s) |
| Tests added/changed after that run (keystore, Ollama discovery, screen picker, providers, router, policy, agent) | 11 files, all passed (re-run after a keystore fix that the provider tests caught) |
| Rust: `cargo test ollama_proxy secrets_ctl` | 4 passed, including a **real DPAPI round trip** on this machine |
| Watermark / attribution check | OK (2,283+ files) |
| `npm run build:tauri` (MSVC release + bundle gate) | **Passed**: NSIS 14.4 MB, MSI 18.1 MB, WebView2 loader statically linked |
| Packaged-app smoke (CDP, real profile backed up first; read-only) | **Passed**: boots with 0 exceptions; tokens live (`#111215`, fill `#0071E3`); `secrets:status` = DPAPI available; traversal name rejected; Ollama proxy 200 and `/api/pull` refused; Settings › AI Providers renders Processing / Reasoning / Daily limit / DPAPI wording (screenshot). No keys existed, so nothing was migrated or written |
| Interactive screen picker | NOT TESTED (needs a human to pick a window; #5) |
| Live model calls | **NOT TESTED** (no key; Ollama has 0 models — #3, #4) |

New test files: `uki-assistant-policy`, `uki-agent-runner-policy`, `uki-memory-controls`, `ai-provider-settings-modes`, `palette-blue-modern`, `uki-keystore-secure`, `ollama-discovery`, `uki-screen-picker` (+ Rust `secrets_ctl::tests`).

## Reports

`docs/reports/` (index: `docs/reports/README.md`); release notes: `DEX_7.0.1_RELEASE_NOTES.md`; backlog: `DEX_REMAINING_WORK.md`.

## Part 7 checks (2026-11-02, `claude/dex-part7`)

- `tsc --noEmit` 0 · `vite build` 0 (chunk-cycle guard passes) · full unit suite after merging `main` (#73): **521 files / 5,333 tests passed, 0 failed** (2 files skipped) · native tests 6/6 (`browser_view`, `profile_name`, `powercfg`, `process_ranking`).
- Live, debug build with embedded frontend, driven over CDP, isolated WebView2 profile; the owner's `%APPDATA%\com.onazioj.dex` was snapshotted first and restored afterwards (SHA-256 identical, 39 files):
  - `system:getProcesses` returns an array; Power's Energy Use lists real processes.
  - Power Mode shows the real Windows plan (Balanced). A different mode was **not** clicked: it changes the machine's power plan.
  - Launch at Login reads the real `Run` key (not set; the test only read it).
  - Browser: typed `https://example.com` -> child webview loads "Example Domain"; covered -> hidden, uncovered -> visible; app closed -> view released; relaunched -> recreated at the same URL; the page's `dex_ipc` call is refused ("not allowed").
- Not run: packaged installer, click-through of Browser back/forward/find/reader mode, Settings Launch at Login toggle (writes the registry).
- Part 7 continued (PR #75): restored auth engine checked live in a debug build with `DEX_DATA_DIR` set to a throwaway folder: 17/17 checks (enrol, reject, unlock + token, lockout, recovery codes, security-question recovery, change PIN). All writes landed in the test folder; the real `%APPDATA%\com.onazioj.dex` hashed identical before and after (39 files).

## Part 8 checks (2026-11-03, `claude/dex-os-completion-stabilization-93cea6`)

Live checks ran in the Vite preview on an isolated origin (fresh `localStorage`, policy and welcome flags seeded as a test fixture; no real profile touched). Native file operations were tested with Rust unit tests in a temp folder, not against user files.

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** (after each batch) |
| Full `vitest run` (after the first two batches) | **526 files / 5,417 tests passed, 0 failed** (2 files skipped) |
| New tests | `part8-integrity-theme` (11), `recycle-restore` (11), `glass-choice-persists` (2; fails without the fix); Rust `file_mutations` **6/6** |
| Multi-window stress: 10 / 30 / 59 windows (59 = every app; apps are single-instance, so 100 is not reachable) | No crash, 0 error boundaries. Launch p50 48 / 113 / 172 ms with 10 / 30 / 59 already open (grows with open count). Peak 59 windows: ~15.5k DOM nodes, heap ~145–195 MB. Focus p50 167 ms, minimize p50 64 ms (59/59 minimized), restore p50 147 ms. Timings taken while the preview pane was visible except one round marked below |
| Close-all release (3 rounds × 59 windows) | **Before fix:** 12.8k DOM nodes and every closed app still mounted after Close All. **After:** DOM back to 167 (baseline 163), 1 mounted app (Home), heap back to 107–109 MB after rounds 1–2. Round 2 launch p95 10.7 s is background-timer throttling (pane hidden), not the app |
| Console errors during stress | **Before:** "Maximum update depth exceeded" in `AppOverview` (×18). **After:** 0 across 3 × 59 launches |
| Theme switch stress: 100 light/dark toggles, 10 apps open | 0 stale inline colours, 0 errors, heap 111 → 109 MB. Toggle p50 152 ms, p95 240 ms (whole-tree restyle). Resolved tokens: dark text `#F5F5F7` / surface `#1C1C1E`; light text `#1D1D1F` / surface `#FFFFFF` |
| Interface Transparency click-through (#33) | Keyboard on the rendered slider: 40% (default) `rgba(28,28,30,0.74)` + `blur(20px)`; 100% `rgba(28,28,30,0.5)`; 0% opaque `#1C1C1E`, `blur none`, mode `off`; light mode `#FFFFFF`. **Bug found:** on a fresh profile 0% reverted to glass after relaunch (migration flag never set). Fixed; re-verified live: 0% survives relaunch |
| Performance alerts | **Before:** 10 critical alerts in the first minute ("System memory 90–97%" = heapUsed/heapTotal; "0 FPS" while hidden). **After:** 0 alerts after a minute idle; heap now against `jsHeapSizeLimit` |
| System Health panel (Task Manager) | Renders all 6 integrity checks with live results ("All process states are consistent · 22s ago" …); Run checks / Copy diagnostic report |
| File operations (native, temp dir) | Copy into same folder → `a copy.txt`, `a copy 2.txt`, original intact; 200-file nested folder copied recursively and byte-checked; move onto existing name refused, both files intact; folder into itself refused; rename onto existing refused; `../` in a new name stripped; missing source reported |
| Not run here | Packaged installer / upgrade / uninstall; native file ops through the UI (needs the desktop bridge); creative-app stress; FPS under load (pane hidden most of the time); screen reader |

### Part 8, second pass (packaged build)

| Check | Result |
|---|---|
| Launch latency fix (#65) | App bodies memoised: launch p50 with 10 / 30 / 59 open **1 / 7 / 29 ms** (was 48 / 113 / 172 ms), same preview method; apps still render and respond (Calculator keypress) |
| Full `vitest run` | **528 files passed, 0 failed** (2 skipped) |
| `npm run build:tauri` at `db821b0` | **Passed** in 37.9 min: NSIS **14.4 MB**, MSI **17.9 MB**, bundle gate OK, `NotSigned` (no certificate) |
| `SHA256SUMS-7.0.1.txt` | 180689f4e6681dad14f354909f22573924b14ab5a3fa42a54b4189b192c07d00  DEX_7.0.1_x64-setup.exe<br>240f618242e2ff616a959ede831bd691ffe2b8a95e416b225bbd3d9cb4509ece  DEX_7.0.1_x64_en-US.msi |
| Packaged smoke (release exe over CDP, `DEX_DATA_DIR` + `WEBVIEW2_USER_DATA_FOLDER` in a throwaway folder) | **13/13 passed**: boots (store ready 4.6 s cold), copy into same folder → "one copy.txt", move/rename onto existing name refused with both files intact, folder copied recursively, folder into itself refused, rename works; 25 apps open with 0 error boundaries (launch p50 29 ms), Close All leaves 1 mounted app; 0% transparency survives a real relaunch (`#1C1C1E`, blur none); 0 uncaught exceptions; host process 54 MB |
| Real profile untouched | `%APPDATA%\com.onazioj.dex` 39 files SHA-256 identical before/after. `%LOCALAPPDATA%` identical except `logs/startup.log` (+129 bytes): the startup log ignored `DEX_DATA_DIR`. Fixed after this build (`webview2.rs`), 3/3 native tests |
| Not run | Installing the MSI/NSIS (would replace the installed DEX on this machine; needs a VM or your go-ahead), upgrade over 6.x, uninstall |


## Part 9 (spatial UX, multitouch, haptics, search)

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| Full `vitest run` | **530 files passed, 0 failed** (2 skipped); 5444 tests |
| `multitouch-contacts.test.ts` | 13 passed: N-contact translation/scale/rotation; 10 simultaneous contacts tracked by id, an 11th refused; stale contacts dropped on a new primary touch; palm rejection; N-finger camera equals the old 2-finger pinch; haptics never fire on desktop hardware, rate-limited and switchable on mobile hardware; global recognizer fires one desktop pinch per gesture, marks pinches inside an app, and still sees a pointerup an app stopped |
| `part9-spatial-touch-ui.test.tsx` | 6 passed: no toolbar, no minimap by default, overlay top-right not bottom; Windows panel opens from the shortcut, Layout tab has Arrange; desktop menu carries every former toolbar action; minimap migration v1 → off; Touch & Pen reports "No touch screen" honestly with haptics disabled, and on a 10-point screen the pad counts 5 contacts then 4, peak 5 |
| `part9-spotlight-windows.test.ts` | 3 passed: open window found and switched to; on the spatial desktop groups/zones/views found and the camera moved; none when spatial is off |
| `spatial-desktop.test.ts` | 23 passed (unchanged behaviour) |
| `part9-maps-honest-errors.test.ts` | 5 passed: results mapped, malformed rows dropped; empty answer = no results; HTTP 503 / network error = error, not "no places"; blank query makes no request; each geolocation failure explained |
| `part9-nexus-app-phases.test.tsx` | 2 passed: lifecycle `handles()` / `subscribeAll()`; Task Manager renders no governance select, offers Suspend only for an app that listens, Suspend → `suspended`, Resume → `background` |
| `part9-browser-address.test.ts` | 5 passed: URLs kept, bare domains get https (ports/paths kept), localhost/IP/IPv6 open over http, text/numbers searched, 8 dangerous schemes refused, `about:blank` allowed |
| Second pass | `tsc` exit 0; full `vitest run` **533 files passed, 0 failed**; Browser files re-run after the last edit: 3 files / 46 tests passed |
| `part9-app-key-scope.test.ts` | 5 passed: a key typed in another app's editor is not FLUX's; with page focus the last-clicked app gets it; else the current app; apps mounted outside the shell keep their keys; typing-target detection |
| Creative-app regression | 103 test files that mention the changed apps: 1091 tests passed. Third pass: `tsc` exit 0; full `vitest run` **535 files passed, 0 failed** |
| Fourth pass | `tsc` exit 0; full `vitest run` **536 files passed, 0 failed**; Imosion files re-run after the last edit: 25 files / 244 tests passed |
| `part9-app-key-scope-ratchet.test.ts` | 1 passed: every `window`/`document` keydown handler under `DEXAPPLICATIONS/` and `pages/` calls `keyEventForApp`, except 8 listed Escape-closers / one-shot / unmounted handlers |
| Rendered preview | NOT RUN: the preview stops at the Terms & Privacy acceptance, which the owner accepts, not an agent |
| Real multitouch hardware | NOT TESTED: no touch screen here. Mouse/synthetic events cannot prove 5- or 10-point support; use Settings › Touch & Pen on the device |

## Part 10 (permissions, Password Generator+, spatial layout, docs, 2026-11-03, `claude/dex-part10`)

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 (after every batch, including the last edit) |
| Full `vitest run` | **539 files passed, 0 failed** (2 skipped); 5,492 tests. Edits made after this run (wording, About rows) were followed by a re-run of the UKI, Settings, Workflows and clipboard tests: 25 files / 182 tests passed |
| `cargo test --bin dex-tauri` | **96 passed, 0 failed**, including 4 new `webview_permissions` tests: only the bundled origin is trusted (look-alike hosts refused), clipboard allowed and SysEx blocked by default, other permissions left to WebView2, stored choice overrides the default |
| `password-generator-plus.test.ts` | 12 passed: rejection sampling drops the biased tail; every selected class present; only selected classes used; look-alikes excluded; length clamped 8-128; exact search-space entropy; passphrase word count, capitalisation, single digit; 1,179 unique words; strength tiers |
| `spatial-desktop.test.ts` | 26 passed, 3 new: a free spot is kept; a blocked window moves the shortest way (up here, not right); 12 windows placed around one spot never overlap and spread both up and down |
| Watermark gate | `add-watermarks.js --check` OK after stamping 8 Part 9 test files that failed it on `main` |
| Rendered preview (Vite, throwaway localhost profile) | Password Generator: password mode 128 bits "Very strong"; passphrase mode 6 words, 61 bits "Fair", two amber segments; R regenerates; options persist across reload; Save to Vault disabled with "Available in the installed app" (no native vault in a browser). Omni Clipboard: "Include copies from other apps" off by default, persists when turned on (turned off again afterwards). Window title "DEX OS". The preview's own first-run Terms screen was accepted to reach the shell; this is a disposable localhost origin, not the owner's profile |
| GitHub repository metadata | Description and topics updated with `gh repo edit` and read back with `gh repo view` |
| Not run | Installed-app check that the clipboard and MIDI prompts are gone (#87, #88); Settings › Permissions and Save to Vault in the desktop app (#89, #90); 7.0.1 installer build, install test and checksums (#97); frame timing with many windows (#91). Nothing was published to GitHub Releases |

## Part 12 (one installer, release build, full-height apps, 2026-11-04, `claude/dex-os-final-release-27d6d4`)

| Check | Result |
|---|---|
| Release build on `main` | **Was BROKEN** since #78: the chunk-cycle guard failed `vite build` (`app-axl -> dex-app-core -> app-axl`), which also turned CI "Build" red. Cause: `shell/input/appKeyScope.ts` landed in `app-axl`. Fixed by pinning `renderer/shell/input` to `dex-app-core`; `vite build` and `npm run build:tauri` pass |
| One official installer | **VERIFIED**: `bundle.targets` = `nsis` only; the build produces exactly one file, `nsis/DEX_7.0.1_x64-setup.exe` (14.4 MB, MSVC, WebView2 loader statically linked, no source maps/env/tests, `NotSigned`). No `bundle/msi` folder. `release.yml`, `release-checksums.cjs` and `verify-tauri-bundle.js` handle NSIS only; the stale Electron `electron-builder` package/release jobs that ran on every `v*` tag were removed from `ci.yml` |
| Upgrade path | **CHECKED (config), NOT RUN**: 6.1.0 on this machine is a per-user NSIS install at `%LOCALAPPDATA%\DEX`, key `HKCU\...\Uninstall\DEX`, data `%LOCALAPPDATA%\com.onazioj.dex`; 7.0.1 keeps productName `DEX`, identifier `com.onazioj.dex` and per-user mode, so it installs over 6.1.0 in place. The Tauri NSIS template offers to remove a prior MSI install. The setup was not run on this machine, because it would replace the owner's working 6.1.0 |
| SHA-256 | `3088ab70ff4f13faaa2191e87b3b40bbf28bcab6f3eff3bbe6a4813485558cfe  DEX_7.0.1_x64-setup.exe` (local build; a CI build will differ) |
| Packaged smoke (release exe over CDP, `DEX_DATA_DIR` + `WEBVIEW2_USER_DATA_FOLDER` in a throwaway folder) | **6/6 passed**: store ready 4.9 s after launch; `app:getVersion` = `7.0.1`; 31 built-in apps opened one by one (files, browser, notes, tasks, settings, taskmanager, nexus, calculator, calendar, passwordgenerator, workflows, gallery, audio, power, maps, videoeditor, imosion, prism, flux, forge, axl, canvas, creativehub, pixelart, presentation, dexcode, pdfviewer, kanban, recyclebin, store, git) with no crash screen; 0 uncaught exceptions; host working set 97 MB; every write landed in the test folder |
| Single-instance and test isolation | With `DEX_DATA_DIR` set, the single-instance guard is skipped (the profile shares no `dex.db`), so the packaged test ran beside the owner's running DEX instead of focusing it |
| DEX Bar strip | **FIXED (owner request)**: apps no longer stop above a blank band along the bottom. Preview at 1440x900: active app container 66 to 900 px, `padding-bottom: 0`; maximized/snapped windows get `dockReserve: 0`. The bar floats over app content |
| Version | App version constants read `package.json` at build time (`runningApps.ts` was hard-coded, `appSubsystem.ts` still said 3.6.0) |
| `tsc --noEmit` | exit 0 |
| Full `vitest run` | 539 passed, 2 failed while cargo LTO saturated the CPU (10 s import timeouts in `part7-honest-controls` and `renderer-pages`); both files re-run idle: 37/37 passed |
| Not run | Installing the setup (clean VM, over 6.1.0, uninstall/reinstall), because it would replace the owner's working install. `cargo test` was not re-run after the single-instance change (the release build compiled it) |
