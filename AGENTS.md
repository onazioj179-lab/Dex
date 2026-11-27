# DEX: handoff for every agent and developer

Read this before touching anything. Written 26 November 2026. Creator: Onazi OJ.

## Where the current DEX is

- The one DEX folder is `Documents\DEX`; it was moved to `main` on 26 November 2026.
- **Current code is `main`.** Start every change from a fresh `origin/main`:

  ```powershell
  git fetch origin
  git switch -c <your-branch> origin/main
  ```

- Open pull requests against `main` only.
- **Do not work on `feat/premium-overhaul-glass`** or anything based on it. It stopped at 3 November 2026, hundreds of
  commits behind. Builds from it show the old interface.
- Before building or running, check `git log -1` is recent. If the screen shows an app-grid button in the top bar and
  microphone / camera / location icons that are always visible, you are running old code.

## What DEX is

A paid Windows desktop environment: Tauri 2 + Rust (`src-tauri`, `core`) with a React renderer (`src/renderer`).
Linux / DEX OS image work is parked. Do not restart it.

## State on 26 November 2026

- Version 7.0.3 (build 003a) is the latest release. Only the owner changes the version.
- `main` is ahead of that release (Browser loading, UKI keys, 3D Maps, Activity + Nexus merge, Extensions).
- [PR 188](https://github.com/onazioj179-lab/Dex/pull/188): enforced privacy permissions and Offline mode, keyed phone
  sharing, complete backups, Settings redesign, UKI system commands. CI passed; check whether it has merged.
  Still to try in a packaged build: Offline in Browser tabs and the updater, phone sharing from a real phone,
  back up then restore on a test profile, the permission prompt beside WebView2's own.

## Unported work from the old branch

Work done on the old branch is **not** in `main`: [PR 187](https://github.com/onazioj179-lab/Dex/pull/187) and the
unfinished edits saved on the local branch `backup/gpt-wip-2026-11-26-final`. (The old boot screen's keyboard bug
fixed there does not apply: `main` has no boot overlay.)

- Never merge or rebase either one into `main`: that brings old screens and old code back.
- Port one feature at a time. First check whether `main` already has it (Ledger, media playback and Word export
  already exist there in newer form), then copy only what is missing onto a branch from `origin/main`.

## Rules

- Patch and extend what exists. Do not rewrite or delete a whole feature to change it.
- Every control must do something real. Wire it or remove it; never fake a result or a status.
- New native channels: `npm run abi:update`. Removing one breaks callers.
- Network requests respect Settings > Network (`services/networkGate.ts`, `src-tauri/src/net_gate.rs`).
  Microphone, camera, screen and location go through `services/permissionGate.ts`.
- Never test on the owner's real profile or data. Never permanently delete user data.
- No agent branding or co-author trailers in commits, pull requests or the product.
- No hover tooltips. Sharp, compact, macOS-style interface; accent is system blue.

## Check your work

```powershell
npm run lint
```

```powershell
npm test
```

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

Release builds use `npm run build:tauri` (MSVC toolchain only).

More detail: `docs/ROADMAP.md` (newest notes at the top), `DEX_REMAINING_WORK.md`, `docs/TAURI-MIGRATION.md`.
