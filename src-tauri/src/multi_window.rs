// =============================================================================
// DEX 6.0 — Multi Window Manager (Tauri-native port of MultiWindowManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Detach-any-inner-app-into-a-standalone OS window (`multiwindow:*` channels).
//!
//! The Electron manager drove `BrowserWindow`s. Under Tauri we create REAL OS
//! windows with `WebviewWindowBuilder`, each loading the same renderer bundle
//! with a `?detached=<appId>` query so the renderer boots in single-app
//! "detached" mode (see `main.tsx`). The set of live windows whose label starts
//! with `dex-detached-` IS the source of truth for which apps are detached — no
//! separate in-memory map to drift. Window bounds are persisted to the shared
//! `dex-kv.json` under `detached:bounds:<appId>` so a re-detach restores size +
//! position, mirroring the Electron `getSavedBounds`/`saveBounds` helpers.
//!
//! This replaces the previous honest-degrade stub: live OS windows are no longer
//! an unbuildable gap — Tauri provides exactly the native surface Electron had.

use rusqlite::Connection;
use serde_json::{json, Value};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL_PREFIX: &str = "dex-detached-";

/// Create the detached_windows table (kept verbatim so the shared `dex.db`
/// schema stays identical to Electron's; bounds now live in KV, but the table
/// is ensured regardless for schema parity).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS detached_windows (
            app_id TEXT PRIMARY KEY,
            x INTEGER DEFAULT -1,
            y INTEGER DEFAULT -1,
            width INTEGER DEFAULT 800,
            height INTEGER DEFAULT 600,
            maximized INTEGER DEFAULT 0
        );",
    );
}

/// Tauri-safe label characters only (alnum / `-` / `/` / `:` / `_` / `.`).
/// App ids are simple slugs, but sanitise defensively so a bad id can never
/// produce an invalid (panicking) window label.
fn label_for(app_id: &str) -> String {
    let safe: String = app_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    format!("{}{}", LABEL_PREFIX, safe)
}

fn bounds_key(app_id: &str) -> String {
    format!("detached:bounds:{}", app_id)
}

/// The appId for every currently-open detached window (label prefix stripped).
fn detached_app_ids(app: &tauri::AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter_map(|label| label.strip_prefix(LABEL_PREFIX).map(|s| s.to_string()))
        .collect()
}

/// Persist a detached window's current outer position + inner size to KV so the
/// next detach restores it. Best-effort: a failure to read geometry is ignored.
fn save_bounds(app: &tauri::AppHandle, app_id: &str) {
    if let Some(win) = app.get_webview_window(&label_for(app_id)) {
        let pos = win.outer_position().ok();
        let size = win.inner_size().ok();
        if let (Some(p), Some(s)) = (pos, size) {
            let _ = crate::kv_set(
                app,
                &bounds_key(app_id),
                json!({ "x": p.x, "y": p.y, "width": s.width, "height": s.height }),
            );
        }
    }
}

/// `multiwindow:detach(appId)` -> bool. Focus an existing detached window, or
/// build a new OS window loading the renderer in `?detached=<appId>` mode with
/// any saved bounds restored.
fn detach(app: &tauri::AppHandle, app_id: &str) -> Value {
    if app_id.is_empty() {
        return json!(false);
    }
    let label = label_for(app_id);

    // Already detached -> just focus it (idempotent, matches Electron).
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return json!(true);
    }

    let url = WebviewUrl::App(format!("index.html?detached={}", app_id).into());
    let mut builder = WebviewWindowBuilder::new(app, &label, url)
        .title(format!("DEX — {}", app_id))
        .min_inner_size(360.0, 280.0)
        // Tauri's own file-drop handler swallows HTML5 drag and drop on Windows
        // (files dropped on apps, in-page drags). DEX uses only HTML5 drops.
        .disable_drag_drop_handler();

    // Restore saved bounds if present, else a sensible default size.
    let saved = crate::kv_get(app, &bounds_key(app_id));
    if let Some(obj) = saved.as_object() {
        let w = obj.get("width").and_then(|v| v.as_f64()).unwrap_or(900.0).max(360.0);
        let h = obj.get("height").and_then(|v| v.as_f64()).unwrap_or(680.0).max(280.0);
        builder = builder.inner_size(w, h);
        if let (Some(x), Some(y)) = (
            obj.get("x").and_then(|v| v.as_f64()),
            obj.get("y").and_then(|v| v.as_f64()),
        ) {
            // Ignore the Electron "-1 == center" sentinel.
            if x >= 0.0 && y >= 0.0 {
                builder = builder.position(x, y);
            } else {
                builder = builder.center();
            }
        } else {
            builder = builder.center();
        }
    } else {
        builder = builder.inner_size(900.0, 680.0).center();
    }

    // Contract is Promise<boolean>; a truthy error object would wrongly mark the
    // app as detached in the store, so report failures as a plain `false`.
    match builder.build() {
        Ok(_) => json!(true),
        Err(e) => {
            eprintln!("[multiwindow] detach build failed for {}: {}", app_id, e);
            json!(false)
        }
    }
}

/// `multiwindow:reattach(appId)` -> bool. Save the window's bounds, then close
/// it (the app returns to the main shell on the renderer side).
fn reattach(app: &tauri::AppHandle, app_id: &str) -> Value {
    let label = label_for(app_id);
    match app.get_webview_window(&label) {
        Some(win) => {
            save_bounds(app, app_id);
            match win.close() {
                Ok(()) => json!(true),
                Err(e) => {
                    eprintln!("[multiwindow] reattach close failed for {}: {}", app_id, e);
                    json!(false)
                }
            }
        }
        // Not open — nothing to reattach, but report success so the store's
        // optimistic state converges (the app is, in effect, not detached).
        None => json!(true),
    }
}

/// `multiwindow:broadcastState(appId, channel, data)` -> bool. Relay a state
/// payload to the detached window via a Tauri event it can listen for
/// (`dex://detached-state`), plus emit globally so the main window sees it too.
fn broadcast_state(app: &tauri::AppHandle, args: &Value) -> Value {
    let app_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let inner_channel = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let data = args.get(2).cloned().unwrap_or(Value::Null);
    if app_id.is_empty() {
        return json!(false);
    }
    let payload = json!({ "appId": app_id, "channel": inner_channel, "data": data });

    let mut delivered = false;
    if let Some(win) = app.get_webview_window(&label_for(app_id)) {
        delivered = win.emit("dex://detached-state", payload.clone()).is_ok();
    }
    // Also notify the main window / any listener (best-effort).
    let _ = app.emit("dex://detached-state", payload);
    json!(delivered)
}

/// Route a `multiwindow:*` channel against the live Tauri window set. Replaces
/// the old pure-DB stub; called from the top-level dispatcher with the AppHandle.
pub fn dispatch_native(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let app_id = || args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "multiwindow:detach" => detach(app, &app_id()),
        "multiwindow:reattach" => reattach(app, &app_id()),
        "multiwindow:isDetached" => {
            json!(app.get_webview_window(&label_for(&app_id())).is_some())
        }
        "multiwindow:getDetachedApps" => json!(detached_app_ids(app)),
        "multiwindow:broadcastState" => broadcast_state(app, args),
        _ => Value::Null,
    }
}
