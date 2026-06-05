# DEX 6.0 Goal Phase 6A — Native Core & Tauri Migration

## Mission
Stand up the native operating layer for DEX 6.0: a Tauri shell + Rust `core/`
workspace that hosts the existing React renderer, then progressively move the
heavy systems off Electron into native code — **additively, without breaking the
shipping 5.0 Electron app.**

## Vision mapping
Covers the 6.0 vision's **Phase 1 (Engine Rewrite)** and the **Phase 8 (DEX OS
Layer)** foundation.

## Performance targets
- Cold start < 300 ms
- Search results < 20 ms
- AI response stream first token < 50 ms
- RAM < 250 MB idle

## Scope

### Native engines (Rust crates under `core/`)
Map each vision "Native Core" system to a crate; implement one at a time:
- `dex-smart-router` — model routing policy. **DONE (first slice):** parity port
  of the TS Smart Router, `cargo test` green.
- `dex-search` — Tantivy full-text + semantic index (supersedes
  `shared/search/searchIndex.ts`). *scaffold.*
- `dex-rewind` — capture + session reconstruction (supersedes `shared/rewind/`).
  *scaffold.*
- `dex-scanner` — file traversal/hashing/watch (builds on `contenthash.rs`).
  *scaffold.*
- `dex-ai-runtime` — provider transport + SSE/NDJSON streaming + parallel
  execution (native `orchestrator.ts`/`stream.ts`). *scaffold.*
- Later: notification engine, clipboard engine, audio/screenshot engines.

### Tauri shell (`src-tauri/`)
- Loads the existing Vite renderer (`dist/renderer`); dev URL `:5173`.
- Exposes native commands; first command `smart_router_route` is wired.
- Keep Electron (`src/main`) shipping until Tauri reaches parity.

### Renderer platform bridge (`src/renderer/services/platform/`)
- One seam that dispatches to Tauri `invoke` when present, else the in-renderer
  TS path. **DONE:** `smartRouterRoute` channel. The bulk of GOAL-6A is porting
  the rest of the `window.dex` IPC surface (windows, files, clipboard, system,
  rewind, notifications) behind this seam.

## Rules
- Additive and non-destructive — never break a shipped 5.0 feature.
- Each TS→Rust port is parity-tested (mirror the TS unit expectations in
  `#[cfg(test)]`), following the `contenthash.rs` precedent.
- `cd core && cargo test` stays fast/tauri-free (src-tauri is a separate package).
- Keep `tsc --noEmit` = 0 and `vitest run --maxWorkers=2` green.

## Run notes (deferred, network-heavy)
- `npm install` to fetch `@tauri-apps/cli` + `@tauri-apps/api`.
- First `npm run dev:tauri` / `build:tauri` downloads the `tauri` crate
  (one-time, large). Until then the Electron app and `cargo test` cover the work.

## Success criteria
- Tauri shell boots the real UI; `smart_router_route` returns the same ranking as
  the TS path (parity).
- Native crates land one-by-one, each parity-tested, each behind the bridge.
- Perf targets met on the Tauri build; Electron remains green throughout.
