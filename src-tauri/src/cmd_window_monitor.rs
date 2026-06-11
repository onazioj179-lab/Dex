// =============================================================================
// DEX 6.0 — Live window/monitor commands (Tauri port)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Live-display channels that the pure-DB `multi_monitor.rs` slice degrades on,
//! because they require Electron's live `screen` API. This module fulfils them
//! against Tauri v2's monitor APIs, which hang off a live `tauri::Window`:
//!
//!   * multimonitor:get-displays         -> array of Display objects
//!   * multimonitor:get-current-display  -> the current Display object (or null)
//!   * multimonitor:get-scale-factor     -> the window scale factor (number)
//!
//! Display object shape (mirrors Electron's `Display` as closely as the Tauri
//! APIs allow):
//!   { id, label, bounds:{x,y,width,height}, workArea:{x,y,width,height},
//!     size:{width,height}, scaleFactor, rotation, internal }
//!
//! IMPORTANT COORDINATE / APPROXIMATION NOTES:
//!   * `bounds` and `size` are reported in PHYSICAL PIXELS. Tauri's `Monitor`
//!     exposes `position()`/`size()` as physical `Px`, whereas Electron's
//!     `Display.bounds` are DIP (logical) values. Consumers that previously
//!     assumed DIPs should divide by `scaleFactor` if they need logical units.
//!   * `workArea == bounds`: Tauri has no work-area (usable area minus taskbar/
//!     dock) concept, so the full monitor bounds are used as an APPROXIMATION of
//!     Electron's `Display.workArea`.
//!   * `rotation` is always 0 and `internal` is always false: Tauri's `Monitor`
//!     does not expose display rotation or an internal/built-in flag.
//!   * `id` is a STABLE INDEX into `available_monitors()` (not the OS display id,
//!     which Tauri does not surface). The order is stable for a given monitor set.
//!
//! Everything degrades to a sensible default on any API error and NEVER panics:
//! get-displays -> `[]`, get-current-display -> `null`, get-scale-factor -> `1.0`.
//! Only `tauri` + `serde_json` are used; no new crates.

use serde_json::{json, Value};
use tauri::Monitor;

/// Build the Display JSON for one monitor at the given stable index.
///
/// `bounds`/`size` are physical pixels; `workArea` is approximated as `bounds`;
/// `rotation`/`internal` are constants Tauri cannot supply (see module docs).
fn monitor_to_display(index: usize, monitor: &Monitor) -> Value {
    let size = monitor.size();
    let pos = monitor.position();
    let label = monitor.name().map(|s| s.as_str()).unwrap_or("");

    let bounds = json!({
        "x": pos.x,
        "y": pos.y,
        "width": size.width,
        "height": size.height,
    });

    json!({
        "id": index as i64,
        "label": label,
        "bounds": bounds,
        // No work-area concept in Tauri: approximate with the full bounds.
        "workArea": bounds,
        "size": {
            "width": size.width,
            "height": size.height,
        },
        "scaleFactor": monitor.scale_factor(),
        // Tauri exposes neither rotation nor an internal/built-in flag.
        "rotation": 0,
        "internal": false,
    })
}

/// get-displays() -> array of Display objects, one per available monitor.
/// Degrades to `[]` when the monitor list cannot be read.
fn get_displays(window: &tauri::Window) -> Value {
    match window.available_monitors() {
        Ok(monitors) => Value::Array(
            monitors
                .iter()
                .enumerate()
                .map(|(i, m)| monitor_to_display(i, m))
                .collect(),
        ),
        Err(_) => Value::Array(Vec::new()),
    }
}

/// get-current-display() -> the Display the window is currently on, falling back
/// to the primary monitor, then to `null`. The reported `id` is the index of the
/// matching monitor within `available_monitors()` so it lines up with the ids
/// returned by get-displays; if that lookup fails the id falls back to 0.
fn get_current_display(window: &tauri::Window) -> Value {
    // Prefer the monitor the window currently sits on, else the primary monitor.
    let target = match window.current_monitor() {
        Ok(Some(m)) => Some(m),
        _ => match window.primary_monitor() {
            Ok(Some(m)) => Some(m),
            _ => None,
        },
    };

    let monitor = match target {
        Some(m) => m,
        None => return Value::Null,
    };

    // Resolve a stable index matching get-displays by comparing position+size
    // against the available-monitors list; default to 0 if not found.
    let index = window
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors.iter().position(|m| {
                m.position() == monitor.position() && m.size() == monitor.size()
            })
        })
        .unwrap_or(0);

    monitor_to_display(index, &monitor)
}

/// get-scale-factor() -> the live scale factor of this window. Degrades to `1.0`.
fn get_scale_factor(window: &tauri::Window) -> Value {
    let factor = window.scale_factor().unwrap_or(1.0);
    json!(factor)
}

/// Dispatch the three live-display `multimonitor:*` channels against the live
/// `tauri::Window`. Unhandled channels return `Value::Null` so callers can fall
/// back to the pure-DB `multi_monitor::dispatch`.
pub fn dispatch(window: &tauri::Window, channel: &str, _args: &Value) -> Value {
    match channel {
        "multimonitor:get-displays" => get_displays(window),
        "multimonitor:get-current-display" => get_current_display(window),
        "multimonitor:get-scale-factor" => get_scale_factor(window),
        _ => Value::Null,
    }
}
