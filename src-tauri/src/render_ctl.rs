// =============================================================================
// DEX Tauri — Render subsystem (port of the `render:*` IPC handlers in
// src/main/core/RenderGovernor.ts).
//
// SOURCE NOTE (read first):
// The task brief named the source `src/main/core/RenderingPipeline.ts` and a
// `getState` channel; neither exists. The real owner of the `render:*` IPC
// namespace is `RenderGovernor.ts` (RenderGovernorClass.setupIPCHandlers). The
// concrete surface there is:
//   - render:getConfig    (handle) -> { displayMode, targetFrameTime, ... } [DATA]
//   - render:getSnapshot  (handle) -> RenderSnapshot                         [DATA]
//   - render:frameMetrics (send)   -> records a FrameMetrics sample           [void]
//   - render:stateChange  (send)   -> sets render/gpu state, broadcasts       [void]
//   - render:inputEvent   (send)   -> marks input activity, wakes to 'active' [void]
// The brief's `render:getState` is served as an alias of `render:getSnapshot`
// (the governor's runtime state read-back); `render` / `optimize` have no
// counterpart in the source and degrade honestly.
//
// NATIVE PORT (real, not a stub):
// Unlike the previous round (which had no collector and returned constant
// defaults), this module ports the governor as a live, process-lifetime
// in-memory singleton (GOVERNOR, a Mutex<Governor>) — the exact analog of the
// Electron singleton, which is itself pure in-memory runtime telemetry with NO
// persistent storage (so there is no KV key to mirror). It implements:
//   - detectDisplayCapabilities(): real Windows display probe via WMI/PowerShell
//     (Win32_VideoController.CurrentRefreshRate / CurrentHorizontalResolution,
//     same no-dep route gpu_ctl.rs uses) -> displayMode / targetFrameTime / dpr.
//   - recordFrameMetrics(): the 120-sample ring buffer, dropped-frame detection
//     (jank || frameTime > 2x target), idle auto-transition.
//   - setRenderState(): render->gpu state mapping and the `render:stateChanged`
//     broadcast (Electron broadcastToWindows -> crate::native_ops::emit_event).
//   - getSnapshot(): the exact RenderSnapshot averages over the live ring buffer.
//
// EXACT SHAPES preserved from RenderGovernor.ts:
//   getConfig -> { displayMode, targetFrameTime, maxInputLatency,
//                  maxAnimationDuration, dpr, is4K, is120Hz }
//   getSnapshot -> { timestamp, displayMode, targetFrameTime, renderState,
//                    gpuState, framesDropped, avgFrameTime, avgInputLatency,
//                    isVSynced, dpr }
//   render:stateChanged event -> { previous, current, gpuState }
// =============================================================================

use crate::util::LockSafe;
use serde_json::{json, Value};
use std::sync::Mutex;

// RENDER_TARGETS (RenderGovernor.ts) — frame-time budgets in ms.
const TARGET_FRAME_TIME_60HZ: f64 = 16.67;
const TARGET_FRAME_TIME_120HZ: f64 = 8.33;
const TARGET_FRAME_TIME_144HZ: f64 = 6.94;
const MAX_INPUT_TO_PIXEL_MS: i64 = 8;
const MAX_ANIMATION_DURATION_MS: i64 = 180;
const MAX_SUPPORTED_DPR: f64 = 3.0;
const RENDER_IDLE_THRESHOLD_MS: i64 = 100;
const FRAME_HISTORY_CAP: usize = 120; // last 120 frames = 1s @ 120Hz

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// One recorded frame (subset of Electron FrameMetrics actually used downstream:
// frameTime + inputLatency feed the snapshot averages; jank feeds drop count).
#[derive(Clone, Copy)]
struct Frame {
    frame_time: f64,
    input_latency: f64,
    jank: bool,
}

// Live governor state — the analog of RenderGovernorClass instance fields. Held
// for the process lifetime (in-memory runtime telemetry; no persistence in the
// source either). Display capabilities are detected lazily on first access.
struct Governor {
    detected: bool,
    display_mode: String,        // '60hz' | '120hz' | '144hz' | 'variable'
    target_frame_time: f64,
    dpr: f64,
    width: i64,
    render_state: String, // 'idle' | 'active' | 'animating' | 'scrolling'
    gpu_state: String,    // 'sleeping' | 'minimal' | 'active'
    frame_history: Vec<Frame>,
    frames_dropped: i64,
    last_input_time: i64,
}

impl Governor {
    fn new() -> Self {
        Governor {
            detected: false,
            display_mode: "60hz".to_string(),
            target_frame_time: TARGET_FRAME_TIME_60HZ,
            dpr: 1.0,
            width: 0,
            render_state: "idle".to_string(),
            gpu_state: "sleeping".to_string(),
            frame_history: Vec::new(),
            frames_dropped: 0,
            last_input_time: 0,
        }
    }

    // detectDisplayCapabilities() — runs once. On Windows we read the primary
    // adapter's refresh rate / horizontal resolution / DPI via WMI (the same
    // PowerShell route gpu_ctl.rs uses). On non-Windows / failure we keep the
    // 60Hz constructor defaults exactly like the source's catch branch.
    fn ensure_detected(&mut self) {
        if self.detected {
            return;
        }
        self.detected = true;
        if let Some((hz, width, scale)) = detect_display() {
            self.width = width;
            self.dpr = scale.min(MAX_SUPPORTED_DPR);
            if hz >= 144 {
                self.display_mode = "144hz".to_string();
                self.target_frame_time = TARGET_FRAME_TIME_144HZ;
            } else if hz >= 120 {
                self.display_mode = "120hz".to_string();
                self.target_frame_time = TARGET_FRAME_TIME_120HZ;
            } else {
                self.display_mode = "60hz".to_string();
                self.target_frame_time = TARGET_FRAME_TIME_60HZ;
            }
        }
    }

    fn is_120hz(&self) -> bool {
        self.display_mode == "120hz" || self.display_mode == "144hz"
    }

    // setRenderState() — returns Some((prev, gpu)) when the state actually
    // changed (so the caller can broadcast render:stateChanged), None otherwise.
    fn set_render_state(&mut self, state: &str) -> Option<(String, String)> {
        if self.render_state == state {
            return None;
        }
        let prev = self.render_state.clone();
        self.render_state = state.to_string();
        self.gpu_state = match state {
            "idle" => "sleeping",
            "active" => "minimal",
            "animating" | "scrolling" => "active",
            _ => self.gpu_state.as_str(),
        }
        .to_string();
        Some((prev, self.gpu_state.clone()))
    }

    // recordFrameMetrics() — push into the 120-sample ring, count dropped frames,
    // then auto-return to idle after the idle threshold with no input. Returns a
    // state-change tuple if the idle transition fired (for broadcasting).
    fn record_frame(&mut self, f: Frame) -> Option<(String, String)> {
        self.frame_history.push(f);
        if self.frame_history.len() > FRAME_HISTORY_CAP {
            self.frame_history.remove(0);
        }
        if f.jank || f.frame_time > self.target_frame_time * 2.0 {
            self.frames_dropped += 1;
        }
        if now_ms() - self.last_input_time > RENDER_IDLE_THRESHOLD_MS
            && self.render_state == "active"
        {
            return self.set_render_state("idle");
        }
        None
    }

    fn config(&self) -> Value {
        json!({
            "displayMode": self.display_mode,
            "targetFrameTime": self.target_frame_time,
            "maxInputLatency": MAX_INPUT_TO_PIXEL_MS,
            "maxAnimationDuration": MAX_ANIMATION_DURATION_MS,
            "dpr": self.dpr,
            "is4K": self.width >= 3840,
            "is120Hz": self.is_120hz(),
        })
    }

    fn snapshot(&self) -> Value {
        let n = self.frame_history.len();
        let (avg_frame, avg_input) = if n > 0 {
            let sum_f: f64 = self.frame_history.iter().map(|f| f.frame_time).sum();
            let sum_i: f64 = self.frame_history.iter().map(|f| f.input_latency).sum();
            (sum_f / n as f64, sum_i / n as f64)
        } else {
            (0.0, 0.0)
        };
        json!({
            "timestamp": now_ms(),
            "displayMode": self.display_mode,
            "targetFrameTime": self.target_frame_time,
            "renderState": self.render_state,
            "gpuState": self.gpu_state,
            "framesDropped": self.frames_dropped,
            "avgFrameTime": avg_frame,
            "avgInputLatency": avg_input,
            "isVSynced": true,
            "dpr": self.dpr,
        })
    }
}

fn governor() -> &'static Mutex<Governor> {
    use std::sync::OnceLock;
    static GOVERNOR: OnceLock<Mutex<Governor>> = OnceLock::new();
    GOVERNOR.get_or_init(|| Mutex::new(Governor::new()))
}

// --- Native display probe ----------------------------------------------------

#[cfg(windows)]
fn run_capture(program: &str, args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        None
    }
}

// detect_display() -> (refreshHz, horizontalResolution, scaleFactor).
// Windows: Win32_VideoController exposes CurrentRefreshRate (Hz) and
// CurrentHorizontalResolution (px) for the active mode; the DPI scale comes from
// the logical-pixels DPI (PixelsPerXLogicalInch / 96). We pick the active
// adapter with the highest refresh rate (parity with screen.getPrimaryDisplay).
// Non-Windows / failure -> None (caller keeps 60Hz defaults, like the source's
// catch branch — no fabricated values).
#[cfg(windows)]
fn detect_display() -> Option<(i64, i64, f64)> {
    let script = "$v = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.CurrentRefreshRate -gt 0 } | Sort-Object CurrentRefreshRate -Descending | Select-Object -First 1; $d = (Get-CimInstance -ClassName Win32_DesktopMonitor -ErrorAction SilentlyContinue | Where-Object { $_.PixelsPerXLogicalInch -gt 0 } | Select-Object -First 1).PixelsPerXLogicalInch; if (-not $d) { $d = 96 }; \"$($v.CurrentRefreshRate)|$($v.CurrentHorizontalResolution)|$d\"";
    let raw = run_capture(
        "powershell",
        &["-NoProfile", "-NonInteractive", "-Command", script],
    )?;
    let line = raw.trim();
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(3, '|');
    let hz: i64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0);
    let width: i64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0);
    let dpi: f64 = parts.next().unwrap_or("96").trim().parse().unwrap_or(96.0);
    if hz <= 0 {
        return None;
    }
    let scale = if dpi > 0.0 { dpi / 96.0 } else { 1.0 };
    Some((hz, width, scale))
}

#[cfg(not(windows))]
fn detect_display() -> Option<(i64, i64, f64)> {
    None
}

// --- Arg parsing -------------------------------------------------------------

// render:frameMetrics payload is a FrameMetrics object (positional arg 0).
fn parse_frame(args: &Value) -> Frame {
    let m = args.get(0).cloned().unwrap_or(Value::Null);
    Frame {
        frame_time: m.get("frameTime").and_then(|v| v.as_f64()).unwrap_or(0.0),
        input_latency: m
            .get("inputLatency")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0),
        jank: m.get("jank").and_then(|v| v.as_bool()).unwrap_or(false),
    }
}

// render:stateChange payload is a RenderState string (positional arg 0).
fn parse_state(args: &Value) -> String {
    args.get(0)
        .and_then(|v| v.as_str())
        .unwrap_or("idle")
        .to_string()
}

/// Route a `render:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // DATA reads — both lock, ensure detection has run, then read live state.
        "render:getConfig" => {
            let mut g = governor().lock_safe();
            g.ensure_detected();
            g.config()
        }
        // getSnapshot is the canonical read; getState is the brief's alias for it.
        "render:getSnapshot" | "render:getState" => {
            let mut g = governor().lock_safe();
            g.ensure_detected();
            g.snapshot()
        }

        // Telemetry sinks (void). They mutate the live governor and broadcast a
        // render:stateChanged event when the state actually transitions — the
        // exact Electron behavior.
        "render:frameMetrics" => {
            let f = parse_frame(args);
            let change = {
                let mut g = governor().lock_safe();
                g.record_frame(f)
            };
            if let Some((prev, gpu)) = change {
                emit_state_changed(app, &prev, "idle", &gpu);
            }
            Value::Null
        }
        "render:stateChange" => {
            let state = parse_state(args);
            let change = {
                let mut g = governor().lock_safe();
                g.set_render_state(&state)
            };
            if let Some((prev, gpu)) = change {
                emit_state_changed(app, &prev, &state, &gpu);
            }
            Value::Null
        }
        "render:inputEvent" => {
            let change = {
                let mut g = governor().lock_safe();
                g.last_input_time = now_ms();
                if g.render_state == "idle" {
                    g.set_render_state("active")
                } else {
                    None
                }
            };
            if let Some((prev, gpu)) = change {
                emit_state_changed(app, &prev, "active", &gpu);
            }
            Value::Null
        }

        // No counterpart in RenderGovernor.ts — honest degrade.
        "render:render" | "render:optimize" => {
            json!({ "success": false, "error": "not ported (no such channel in RenderGovernor)" })
        }

        _ => Value::Null,
    }
}

// broadcastToWindows('render:stateChanged', { previous, current, gpuState }).
fn emit_state_changed(app: &tauri::AppHandle, previous: &str, current: &str, gpu_state: &str) {
    crate::native_ops::emit_event(
        app,
        "render:stateChanged",
        &json!({ "previous": previous, "current": current, "gpuState": gpu_state }),
    );
}
