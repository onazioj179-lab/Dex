// =============================================================================
// DEX Tauri — compact (mini, always-on-top) window mode
// `window:enterCompact { width, height, corner }` shrinks the shell window to a
// small always-on-top panel in a corner of the current monitor's work area;
// `window:exitCompact` restores the exact previous bounds (and maximized state).
// =============================================================================

use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{LogicalSize, PhysicalPosition, PhysicalSize};

struct Saved {
    pos: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}

static SAVED: Mutex<Option<Saved>> = Mutex::new(None);

const MARGIN: f64 = 16.0;

/// Top-left of a `w`x`h` (physical) panel in `corner` of the work area.
pub fn corner_origin(area_pos: (i32, i32), area_size: (u32, u32), w: u32, h: u32, corner: &str, margin: i32) -> (i32, i32) {
    let (ax, ay) = area_pos;
    let (aw, ah) = (area_size.0 as i32, area_size.1 as i32);
    let right = ax + aw - w as i32 - margin;
    let bottom = ay + ah - h as i32 - margin;
    match corner {
        "top-left" => (ax + margin, ay + margin),
        "top-right" => (right, ay + margin),
        "bottom-left" => (ax + margin, bottom),
        _ => (right, bottom),
    }
}

pub fn enter(window: &tauri::Window, opts: &Value) -> Value {
    let width = opts.get("width").and_then(|v| v.as_f64()).unwrap_or(380.0).clamp(240.0, 1200.0);
    let height = opts.get("height").and_then(|v| v.as_f64()).unwrap_or(96.0).clamp(64.0, 900.0);
    let corner = opts.get("corner").and_then(|v| v.as_str()).unwrap_or("bottom-right").to_string();

    {
        let mut saved = SAVED.lock().unwrap_or_else(|e| e.into_inner());
        if saved.is_none() {
            let maximized = window.is_maximized().unwrap_or(false);
            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                *saved = Some(Saved { pos, size, maximized });
            }
        }
    }
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.set_always_on_top(true);
    if let Ok(Some(mon)) = window.current_monitor() {
        let scale = mon.scale_factor();
        let area = mon.work_area();
        let (w, h) = ((width * scale).round() as u32, (height * scale).round() as u32);
        let (x, y) = corner_origin(
            (area.position.x, area.position.y),
            (area.size.width, area.size.height),
            w, h, &corner, (MARGIN * scale).round() as i32,
        );
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    json!({ "success": true })
}

pub fn exit(window: &tauri::Window) -> Value {
    let _ = window.set_always_on_top(false);
    let saved = SAVED.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(s) = saved {
        let _ = window.set_size(s.size);
        let _ = window.set_position(s.pos);
        if s.maximized {
            let _ = window.maximize();
        }
    }
    json!({ "success": true })
}

#[cfg(test)]
mod tests {
    use super::corner_origin;

    #[test]
    fn corners_sit_inside_the_work_area() {
        // 1920x1040 work area (taskbar excluded), 400x100 panel, 16 px margin.
        assert_eq!(corner_origin((0, 0), (1920, 1040), 400, 100, "bottom-right", 16), (1504, 924));
        assert_eq!(corner_origin((0, 0), (1920, 1040), 400, 100, "top-left", 16), (16, 16));
        assert_eq!(corner_origin((0, 0), (1920, 1040), 400, 100, "top-right", 16), (1504, 16));
        assert_eq!(corner_origin((0, 0), (1920, 1040), 400, 100, "bottom-left", 16), (16, 924));
        // Second monitor to the left, offset origin.
        assert_eq!(corner_origin((-2560, 0), (2560, 1400), 400, 100, "bottom-right", 16), (-416, 1284));
    }
}
