// =============================================================================
// DEX Tauri — Vinx control surface (REQUESTED port target: namespace `vinx`,
// source `src/main/core/VinxPresentation.ts`, storage `fs-json:vinx-state.json`,
// data channel `getState`, heavy channels `present` / `save`).
//
// IMPORTANT — the described subsystem DOES NOT EXIST in this repo. A full audit
// (Glob + Grep across src/, src-tauri/, dist/) found:
//   - NO `src/main/core/VinxPresentation.ts` — the only Vinx main-process
//     manager is `src/main/core/VinxPresentationManager.ts`.
//   - NO `vinx-state.json` and NO `fs-json` Vinx store anywhere. The real
//     manager is SQLite-backed (`dex.db` table `vinx_presentations`).
//   - NO `vinx:getState`, `vinx:present`, or `vinx:save` IPC channels anywhere
//     in the renderer or main. The real Vinx IPC surface is
//     `vinx-presentation:{register,list,launch,close,remove}`.
//   - That real surface is ALREADY fully ported in
//     `src-tauri/src/vinx_presentation.rs` (CRUD ported; launch/close degrade
//     honestly). Re-porting it here would duplicate an existing, correct module.
//
// Per the project rules (port ONLY real channels at EXACT Electron return shapes;
// NEVER invent fields; DO NOT fake heavy channels), there is no real `getState`
// data channel to port and no JSON shape to mirror. Inventing a shape for a
// `vinx-state.json` that no code reads or writes would be fabrication.
//
// This module is therefore an honest no-op router: every `vinx:*` channel returns
// Value::Null (the codebase's "honest degrade" convention, same as the unknown
// arm in rule_engine::dispatch). It compiles cleanly when added as a `mod` and
// routed, invents nothing, and does not collide with the existing real
// `vinx_presentation` module (which owns the `vinx-presentation:*` namespace).
//
// If a genuine `vinx:getState` / fs-json-backed Vinx state surface is added to
// the Electron side later, port it here against its real shape; until then there
// is nothing to faithfully mirror.
// =============================================================================

use serde_json::Value;

/// Route a `vinx:*` channel. No such data/heavy channels exist in the Electron
/// codebase (see the header audit), so every channel honestly degrades to null.
/// Args arrive as the positional JSON array the renderer would send.
pub fn dispatch(_app: &tauri::AppHandle, _channel: &str, _args: &Value) -> Value {
    // getState: no `vinx:getState` handler and no `vinx-state.json` exist to read
    //   -> null (no shape to invent).
    // present / save: heavy channels, not ported and not faked per the rules
    //   -> null (prefix route returns null; no shaped object is read by any
    //   renderer for these phantom channels).
    Value::Null
}
