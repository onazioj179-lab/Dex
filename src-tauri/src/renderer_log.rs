// =============================================================================
// DEX Platform: renderer error log (`log:renderer`, `render-error:report`,
// `renderer:memory-critical`)
//
// The packaged app has no devtools console, so renderer crashes, memory alerts
// and warnings used to vanish (these channels were accept-and-discard shims).
// They now land in <logs>/renderer.log beside startup.log: one JSON line per
// entry, info-level noise dropped, each entry capped, file rotated to
// renderer.log.1 past 512 KB.
// =============================================================================

use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_LOG_BYTES: u64 = 512 * 1024;
const MAX_ENTRY_CHARS: usize = 4000;

static LOCK: Mutex<()> = Mutex::new(());

pub fn log_path() -> PathBuf {
    crate::webview2::log_dir().join("renderer.log")
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Build the line to persist, or None when the entry is not worth keeping.
pub fn format_entry(channel: &str, payload: &Value) -> Option<String> {
    let (kind, level) = match channel {
        "log:renderer" => {
            let level = payload.get("level").and_then(|v| v.as_str()).unwrap_or("info");
            if !matches!(level, "warn" | "error") {
                return None;
            }
            ("log", level.to_string())
        }
        "render-error:report" => ("render-error", "error".to_string()),
        "renderer:memory-critical" => ("memory-critical", "warn".to_string()),
        _ => return None,
    };
    let mut text = json!({
        "t": now_ms() as u64,
        "v": env!("CARGO_PKG_VERSION"),
        "kind": kind,
        "level": level,
        "entry": payload,
    })
    .to_string();
    if text.chars().count() > MAX_ENTRY_CHARS {
        text = text.chars().take(MAX_ENTRY_CHARS).collect::<String>() + "…(truncated)";
    }
    Some(text)
}

pub fn append(path: &Path, line: &str) -> std::io::Result<()> {
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    if std::fs::metadata(path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
        let _ = std::fs::rename(path, path.with_extension("log.1"));
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(f, "{line}")
}

pub fn dispatch(channel: &str, args: &Value) -> Value {
    let payload = args.get(0).cloned().unwrap_or(Value::Null);
    let Some(line) = format_entry(channel, &payload) else {
        return json!({ "ok": true, "stored": false });
    };
    match append(&log_path(), &line) {
        Ok(()) => json!({ "ok": true, "stored": true }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_errors_drops_info_and_rotates() {
        assert!(format_entry("log:renderer", &json!({ "level": "info", "message": "x" })).is_none());
        let warn = format_entry("log:renderer", &json!({ "level": "warn", "message": "disk low" })).unwrap();
        assert!(warn.contains("\"disk low\""));
        let crash = format_entry("render-error:report", &json!({ "kind": "boundary", "message": "boom" })).unwrap();
        assert!(crash.contains("render-error"));
        assert!(format_entry("renderer:memory-critical", &json!({ "usedMB": 900 })).unwrap().contains("memory-critical"));
        let huge = format_entry("render-error:report", &json!({ "stack": "y".repeat(10_000) })).unwrap();
        assert!(huge.chars().count() < MAX_ENTRY_CHARS + 20);

        let dir = std::env::temp_dir().join(format!("dex-renderer-log-{}", std::process::id()));
        let path = dir.join("renderer.log");
        let big = "z".repeat(1024);
        for _ in 0..600 {
            append(&path, &big).unwrap();
        }
        assert!(std::fs::metadata(&path).unwrap().len() <= MAX_LOG_BYTES + 2048);
        assert!(path.with_extension("log.1").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
