// =============================================================================
// DEX Tauri — CLI subsystem (port of the `cli:*` IPC handlers in
// cli/DexCLI.ts).
//
// ONLY the pure-data channel is ported. DexCLI is overwhelmingly a headless
// command runner (execute / run-workflow / run-operation / execute-action /
// trigger-scheduled), which is the HEAVY tier and needs the live native
// runtime + ipcMain event bus. None of that is ported here.
//
// Channel & shape (from initializeCLI in DexCLI.ts):
//   - cli:is-headless -> boolean
//     Electron handler: `() => dexCLI.isHeadlessMode()`. isHeadless is a plain
//     in-memory flag that is ONLY ever flipped to true by runCLIMode(), the
//     standalone "dex <command>" entrypoint that runs WITHOUT a GUI window (see
//     main.ts: isCLIMode branch calls runCLIMode and process.exit; it never
//     creates a renderer). Therefore any process that has a renderer asking
//     over IPC is, by construction, the GUI process where isHeadless is still
//     its constructor default of `false`. We return that constant `false`.
//
// STORAGE divergence (documented): DexCLI constructs an electron-store named
// `dex-cli` (-> dex-cli.json; the migration brief calls it cli-state.json). That
// store is touched ONLY by the `config` command, which lives behind the HEAVY
// `execute` channel and is NOT ported. The is-headless channel reads no storage
// at all, so this module intentionally creates/reads no JSON file. If the
// `config` surface is later ported it should use std::fs JSON under
// <appData>/dex-cli.json with bare top-level keys, mirroring electron-store.
//
// SKIPPED (heavy, need native runtime / ipcMain event bus — not faked):
//   - cli:execute            (runs the whole command set incl. live run/exec)
//   - cli:execution-complete (an ipcMain event channel, not a handler/CRUD)
// =============================================================================

use serde_json::{json, Value};

/// Route a `cli:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled here;
/// the heavy/unknown ones return Value::Null (honest degrade) — except none of
/// the skipped channels return a shaped object the renderer reads, so null is
/// safe for the whole namespace.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // isHeadlessMode() is always false in a process that owns a renderer.
        "cli:is-headless" => json!(false),
        _ => Value::Null,
    }
}
