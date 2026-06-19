// =============================================================================
// DEX Tauri — Prerender subsystem (port of the `prerender:*` IPC handlers in
// src/main/core/RenderingEngine.ts -> OffscreenPreRenderer, Feature 39).
//
// SOURCE NOTE: the migration brief named `src/main/core/Prerender.ts` and a
// `getCache` channel. No such file exists; the real owner is RenderingEngine.ts
// and the actual namespace channels are `prerender:request` (fire-and-forget
// enqueue, ipcMain.on) and `prerender:get` (ipcMain.handle, returns the cached
// pre-render HTML for a route). The DATA channel here ("getCache") maps to
// `prerender:get`, which calls OffscreenPreRenderer.getCachedRender(route).
//
// RETURN SHAPE (exact, from getCachedRender): the cached entry's `html` string,
// or `null` when the route is not in the cache (Electron: `cached?.html || null`,
// so an empty-string html also collapses to null).
//
// STORAGE NOTE: the brief named `datastore-kv:prerender`, but the source keeps
// the render cache in an IN-MEMORY `Map<string, PreRenderRequest>` that is ONLY
// ever populated by the heavy processQueue()/requestPreRender() path. There is
// no electron-store file, no fs-json, and no DataStore-KV key in the Electron
// code. To honour the nominal key (and stay consistent if anything ever writes
// it) this port reads a best-effort cache map from the DataStore-KV `prerender`
// key via crate::kv_get; in a fresh native process that key is absent and the
// only honest result is `null` — which matches Electron exactly for a route that
// was never pre-rendered. The KV value, when present, is expected to be an
// object of { route: html } (the persisted projection of renderedCache).
//
// DIVERGENCES (documented):
//   - The in-memory render cache cannot be reproduced without the SKIPPED heavy
//     render queue (processQueue spins up a BrowserView render). So the cache is
//     effectively always empty here and `prerender:get` returns null, which is
//     identical to Electron's behaviour for any un-prerendered route.
//   - `prerender:request` is a heavy enqueue (drives speculative rendering); it
//     is NOT ported and NOT faked. It returns Value::Null (the renderer treats
//     it as fire-and-forget; Electron's ipcMain.on returns nothing either).
// =============================================================================

use serde_json::Value;

const PRERENDER_KEY: &str = "prerender";

// getCachedRender(route): renderedCache.get(route)?.html || null.
// The persisted KV projection is an object of { route: html }. Absent key,
// absent route, non-string html, or empty-string html all collapse to null
// (mirrors `cached?.html || null`).
fn get_cached_render(app: &tauri::AppHandle, route: &str) -> Value {
    let cache = crate::kv_get(app, PRERENDER_KEY);
    let html = cache
        .get(route)
        .and_then(|entry| {
            // Tolerate either a bare html string or a full PreRenderRequest object.
            if let Some(s) = entry.as_str() {
                Some(s.to_string())
            } else {
                entry.get("html").and_then(|v| v.as_str()).map(String::from)
            }
        })
        .filter(|s| !s.is_empty());
    match html {
        Some(s) => Value::String(s),
        None => Value::Null,
    }
}

/// Route a `prerender:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The single DATA channel is handled; the heavy
/// `prerender:request` enqueue and any unknown channel return Value::Null
/// (honest degrade — never faked).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // "getCache" data channel == the real `prerender:get`.
        "prerender:get" | "prerender:getCache" => {
            let route = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_cached_render(app, route)
        }
        // Heavy enqueue — not ported, not faked. Fire-and-forget => null.
        _ => Value::Null,
    }
}
