// =============================================================================
// DEX Tauri — Games subsystem (port of the data surface of
// src/main/services/GamesService.ts).
//
// Pure-data tier only. GamesService mixes two storage models:
//   - The discovered-games *list* lives ONLY in process memory (`cachedGames`),
//     populated by the heavy `games:scan` disk walk. There is NO persisted
//     library file. `getGames()` returns `cachedGames ? [...] : []`, i.e. an
//     empty array until a scan runs.
//   - Playtime *state* is persisted as a plain JSON object (NOT electron-store,
//     NOT key-wrapped) at <userData>/games-playtime.json, written with
//     JSON.stringify(obj, null, 2). The top level IS the
//     Record<gameId, PlaytimeRecord> map. We mirror the same file name under
//     <appData> and the same unwrapped object shape.
//
// CHANNEL MAPPING (the orchestrator's logical names -> real GamesService IPC):
//   - data  "list"     -> games:list      -> DiscoveredGame[]               (PORTED)
//   - data  "getState" -> games:playtime  -> Record<gameId, PlaytimeRecord> (PORTED)
//   - heavy "launch"   -> games:launch    -> spawns a detached child proc   (SKIPPED)
//   - heavy "stop"/"updateProgress"       -> no such IPC in this service; the
//     analogous heavy/native channels are games:scan (real disk walk) and
//     games:plan-launch (depends on the live scan cache). All skipped.
//
// Return shapes match the Electron handlers exactly so the renderer
// (src/renderer/pages/Games.tsx) is unchanged for the ported channels.
//
// DIVERGENCES (documented):
//   - games:list is in-memory in Electron; a stateless Tauri dispatch has no
//     persisted cache, so it returns [] (identical to the pre-scan / first-run
//     value getGames() yields when cachedGames is null). It does NOT attempt a
//     scan (that is the heavy, skipped path).
//   - games-playtime.json is read/written as a bare object via std::fs (no
//     electron-store key wrapper), matching GamesService.loadPlaytime /
//     persistPlaytime exactly.
//   - For the skipped heavy channels whose results the renderer reads as shaped
//     objects (games:scan -> {games,errors}; games:launch -> {ok,error}), we
//     return the honest "not ported" shaped error rather than null, so the UI
//     degrades cleanly instead of throwing. games:plan-launch (renderer treats
//     null as "no plan") returns null.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const PLAYTIME_FILE: &str = "games-playtime.json";

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// GamesService.loadPlaytime(): JSON.parse of games-playtime.json; only accepts a
// truthy object, else {} (first run / malformed).
fn load_playtime(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, PLAYTIME_FILE)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(v) if v.is_object() => v,
            _ => json!({}),
        },
        Err(_) => json!({}),
    }
}

// getGames(): cachedGames ? [...cachedGames] : []. No persisted list exists, so
// the stateless dispatch always yields the pre-scan value.
fn get_games() -> Value {
    json!([])
}

// getPlaytime(): { ...loadPlaytime() } — a shallow copy of the persisted map.
fn get_playtime(app: &tauri::AppHandle) -> Value {
    load_playtime(app)
}

/// Route a `games:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// NOTE: not every `games:*` channel is data-portable. The heavy channels
/// (scan/plan-launch/launch) need the native runtime and are intentionally not
/// implemented here; they return honest "not ported" results shaped the way the
/// renderer reads them. Because of that, prefix-routing the whole namespace to
/// this dispatch is acceptable ONLY with these explicit fallbacks (it is not a
/// blanket null-return). The orchestrator should treat prefixRouteSafe as false
/// and route only the ported channels, or accept these documented fallbacks.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // --- ported data channels -------------------------------------------
        "games:list" => get_games(),
        "games:playtime" => get_playtime(app),

        // --- skipped heavy channels (honest, renderer-shaped fallbacks) -----
        // Renderer reads r.games / r.errors as arrays.
        "games:scan" => json!({
            "games": [],
            "errors": [],
            "error": "not ported (needs native runtime)"
        }),
        // Renderer reads r.ok / r.error.
        "games:launch" => json!({
            "ok": false,
            "error": "not ported (needs native runtime)"
        }),
        // Renderer treats a null plan as "no plan for <id>".
        "games:plan-launch" => Value::Null,

        _ => Value::Null,
    }
}
