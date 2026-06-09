# DEX — Roadmap (single source of truth)

> This is the one forward-looking plan. Completed goal/handoff/sprint/audit
> writeups were removed (2026-06-09 cleanup); their work is done and lives in
> git history. Anything still pending is captured here. The detailed, actively
> maintained migration checkpoint is [TAURI-MIGRATION.md](TAURI-MIGRATION.md) —
> start there to resume engineering work.

## Where DEX is

- **Shipping build:** Electron (v5.0.1). It remains the product until the Tauri
  build reaches parity — do not remove Electron source before then.
- **Direction:** full migration to **Tauri** for a lighter (~4 MB vs ~88 MB),
  faster app on the system WebView2. Electron is the temporary bridge.
- **Tauri shell today:** boots, serves the same renderer, ~37 namespaces are
  natively backed (window, files, search, system, shell, clipboard, vault,
  audio analysis, notifications, and 14 SQLite subsystems sharing `dex.db`).
  Unported channels degrade to `null` so the UI never crashes.

## The only goal that matters now: finish the Tauri migration

Work the migration in this order (recipe + live status in
[TAURI-MIGRATION.md](TAURI-MIGRATION.md)):

1. **Remaining `dex.db` subsystems** — keep porting DatabaseManager-backed
   managers with the proven recipe (module with `ensure_schema()` + `dispatch()`,
   register in `setup()`, add a prefix arm to `db_dispatch`). Order by real usage
   via `__dexDegradeReport()`.
2. **Non-DB engines** — native file/folder dialogs (Tauri dialog plugin),
   transfer / device / pairing, audio playback sink, PTY / terminal.
3. **Big controllers** — security, workflow, agents, microservices (the long
   tail), ported by what real usage hits.
4. **Flip default + retire Electron** — once P1–P3 cover real usage: make the
   Tauri build the shipped artifact, point release at `build:tauri`, drop the
   Electron packaging, and remove the now-dead `tauriCompat` `null` fallbacks.

## Definition of done (parity)

- Every channel the renderer actually calls is natively handled (degrade report
  empty in normal use).
- `npm run build:tauri` produces a working installer that boots and runs the
  core apps with persistence intact.
- Electron packaging removed; Tauri is the single shipped artifact.

## Build / run

- `npm run dev:tauri` — live dev window.
- `npm run build:tauri` — installers in `src-tauri/target/release/bundle/`.
- Native core crates: `cd core && cargo test`. Tauri shell: `cd src-tauri && cargo check`.
