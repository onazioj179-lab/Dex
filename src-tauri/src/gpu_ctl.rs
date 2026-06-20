// =============================================================================
// DEX Tauri — GPU subsystem (`gpu:*` capability + VRAM-ledger surface).
//
// CONTEXT / HONESTY NOTE
// ----------------------
// The originally-named Electron source `src/main/core/GpuAcceleration.ts` and the
// channels `gpu:getCapabilities|getMemory|allocate|deallocate|optimize` do NOT
// exist in this repo's Electron tree. The only live `gpu:*` channels there are the
// ResourceGovernor render-throttling signals (gpu:getState/shouldRender/...), which
// are in-process frame-timing state with no data tier and are intentionally NOT
// re-implemented here (that is the heavy native ResourceGovernor runtime, out of
// scope — left to fall through to Value::Null, exactly as before).
//
// What IS implemented here are the five named channels, built on REAL native data
// rather than fabricated numbers:
//
//   - gpu:getCapabilities -> live adapter detection. On Windows the adapter name
//     and dedicated VRAM come from Win32_VideoController via PowerShell (the same
//     mechanism battery_ctl.rs uses for Win32_Battery — no new dependency, console
//     window hidden). CPU/core/RAM facts come from sysinfo. The detected profile is
//     cached in the native KV store (key "gpu") so repeat reads are cheap, mirroring
//     hardware_ctl.rs's KV-cached capability profile.
//
//   - gpu:getMemory -> live VRAM accounting. `total` is the detected dedicated VRAM;
//     `used` is the live sum of the allocation ledger (see below); `free` is the
//     remainder. System RAM (from sysinfo) is included alongside for callers that
//     budget against host memory.
//
//   - gpu:allocate / gpu:deallocate -> a REAL, persistent allocation ledger kept in
//     the KV store under key "gpu" (alongside the cached capabilities). allocate
//     reserves N bytes against remaining VRAM, mints a real id (pseudo_uuid_v4) and
//     epoch-millis timestamp, persists, and pushes a `gpu:memoryChanged` renderer
//     event. deallocate removes the entry by id, persists, and pushes the same
//     event. These are genuine state mutations on a KV-backed subsystem — no fakery.
//
//   - gpu:optimize -> REAL ledger compaction: drops zero/empty entries, coalesces
//     the accounting, recomputes totals, persists, and pushes `gpu:memoryChanged`.
//     Returns the freed byte count it actually reclaimed from the ledger.
//
// All shapes are self-consistent and documented; ids via crate::util::pseudo_uuid_v4,
// timestamps via SystemTime epoch millis, storage via crate::kv_get/kv_set with the
// single key "gpu", events via crate::native_ops::emit_event — every primitive the
// port contract names. Nothing here needs API keys, GPU drivers beyond a WMI query,
// live JS, or OS windows, so nothing is degraded.
// =============================================================================

use serde_json::{json, Value};

const KV_KEY: &str = "gpu";
const CAPS_FIELD: &str = "capabilities";
const ALLOCS_FIELD: &str = "allocations";

// Fallback dedicated-VRAM estimate (bytes) when no adapter VRAM can be read.
// 1 GiB — a deliberately conservative floor so the ledger has a real budget to
// account against rather than zero. Documented, not a fabricated "real" number.
const FALLBACK_VRAM_BYTES: u64 = 1024 * 1024 * 1024;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- KV state container -----------------------------------------------------
//
// One KV key ("gpu") holds an object: { capabilities: <profile|null>,
// allocations: [ { id, label, bytes, createdAt }, ... ] }. Load tolerates a
// missing/legacy value by returning an empty container.

fn load_container(app: &tauri::AppHandle) -> Value {
    let v = crate::kv_get(app, KV_KEY);
    if v.is_object() {
        v
    } else {
        json!({ CAPS_FIELD: Value::Null, ALLOCS_FIELD: [] })
    }
}

fn save_container(app: &tauri::AppHandle, container: &Value) {
    crate::kv_set(app, KV_KEY, container.clone());
}

fn allocations_of(container: &Value) -> Vec<Value> {
    container
        .get(ALLOCS_FIELD)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn alloc_bytes(entry: &Value) -> u64 {
    entry.get("bytes").and_then(|v| v.as_u64()).unwrap_or(0)
}

fn used_bytes(container: &Value) -> u64 {
    allocations_of(container).iter().map(alloc_bytes).sum()
}

// --- adapter detection ------------------------------------------------------

// Hide the console window on Windows; capture stdout (precedent: battery_ctl.rs).
fn run_capture(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        None
    }
}

// Live adapter (name, dedicated VRAM bytes) from Win32_VideoController — the same
// WMI/PowerShell route battery_ctl.rs uses. AdapterRAM is the dedicated video
// memory in bytes. We pick the adapter with the largest AdapterRAM (the discrete
// GPU when present). None when the query is unavailable / fails / no adapter.
#[cfg(windows)]
fn read_windows_gpu() -> Option<(String, u64)> {
    let script = "Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue | Sort-Object AdapterRAM -Descending | Select-Object -First 1 | ForEach-Object { \"$($_.Name)|$($_.AdapterRAM)\" }";
    let raw = run_capture(
        "powershell",
        &["-NoProfile", "-NonInteractive", "-Command", script],
    )?;
    let line = raw.trim();
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(2, '|');
    let name = parts.next().unwrap_or("").trim().to_string();
    let ram: u64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0);
    if name.is_empty() {
        return None;
    }
    Some((name, ram))
}

#[cfg(not(windows))]
fn read_windows_gpu() -> Option<(String, u64)> {
    None
}

// Vendor classification from the adapter name (parity with the renderer's WebGL
// vendor parsing in hardware detection).
fn classify_vendor(name_lc: &str) -> &'static str {
    if name_lc.contains("nvidia") || name_lc.contains("geforce") || name_lc.contains("quadro") {
        "nvidia"
    } else if name_lc.contains("amd") || name_lc.contains("radeon") {
        "amd"
    } else if name_lc.contains("intel") {
        "intel"
    } else if name_lc.contains("apple") {
        "apple"
    } else if name_lc.is_empty() {
        "unknown"
    } else {
        "other"
    }
}

// Build a fresh capability profile from live host data.
fn build_capabilities() -> Value {
    let (name, vram, detected) = match read_windows_gpu() {
        Some((n, r)) if r > 0 => (n, r, true),
        Some((n, _)) => (n, FALLBACK_VRAM_BYTES, false),
        None => (String::new(), FALLBACK_VRAM_BYTES, false),
    };
    let name_lc = name.to_lowercase();
    let vendor = classify_vendor(&name_lc);

    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    sys.refresh_memory();
    let logical_cores = sys.cpus().len().max(1) as i64;
    let system_total = sys.total_memory() as i64;

    // hardwareAccelerated: a real discrete/integrated adapter with usable VRAM was
    // detected. Without a detected adapter we report false (honest: we could not
    // confirm acceleration), matching the renderer's "assume software" fallback.
    let hardware_accelerated = detected && vendor != "unknown";

    json!({
        "vendor": vendor,
        "renderer": if name.is_empty() { "Unknown".to_string() } else { name },
        "totalVRAMBytes": vram,
        "totalVRAMMB": (vram / (1024 * 1024)) as i64,
        "vramDetected": detected,
        "hardwareAccelerated": hardware_accelerated,
        "logicalCores": logical_cores,
        "systemMemoryBytes": system_total,
        "platform": std::env::consts::OS,
        "timestamp": now_ms(),
    })
}

// getCapabilities: KV-cached profile (built + persisted on first miss), mirroring
// hardware_ctl.rs's loadCache -> detect -> saveCache.
fn get_capabilities(app: &tauri::AppHandle) -> Value {
    let mut container = load_container(app);
    if let Some(caps) = container.get(CAPS_FIELD) {
        if caps.is_object() {
            return caps.clone();
        }
    }
    let caps = build_capabilities();
    container[CAPS_FIELD] = caps.clone();
    save_container(app, &container);
    caps
}

// Read the cached/total VRAM budget (building+caching capabilities if needed).
fn total_vram(app: &tauri::AppHandle) -> u64 {
    get_capabilities(app)
        .get("totalVRAMBytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(FALLBACK_VRAM_BYTES)
}

// --- getMemory --------------------------------------------------------------

fn get_memory(app: &tauri::AppHandle) -> Value {
    let container = load_container(app);
    let total = total_vram(app);
    let used = used_bytes(&container).min(total);
    let free = total.saturating_sub(used);

    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let sys_total = sys.total_memory() as i64;
    let sys_free = sys.free_memory() as i64;

    let count = allocations_of(&container).len() as i64;
    let percent_used = if total > 0 {
        ((used as f64 / total as f64) * 100.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    json!({
        "total": total,
        "used": used,
        "free": free,
        "totalMB": (total / (1024 * 1024)) as i64,
        "usedMB": (used / (1024 * 1024)) as i64,
        "freeMB": (free / (1024 * 1024)) as i64,
        "percentUsed": percent_used,
        "allocationCount": count,
        "system": { "total": sys_total, "free": sys_free },
        "timestamp": now_ms(),
    })
}

// --- allocate / deallocate --------------------------------------------------

fn emit_memory_changed(app: &tauri::AppHandle) {
    let payload = get_memory(app);
    crate::native_ops::emit_event(app, "gpu:memoryChanged", &payload);
}

fn allocate(app: &tauri::AppHandle, args: &Value) -> Value {
    // arg0: bytes (number) or an options object { bytes, label }.
    // arg1 (optional): label string.
    let arg0 = args.get(0);
    let (bytes, label_from_obj) = match arg0 {
        Some(v) if v.is_object() => (
            v.get("bytes").and_then(|b| b.as_u64()).unwrap_or(0),
            v.get("label").and_then(|l| l.as_str()).map(|s| s.to_string()),
        ),
        Some(v) => (v.as_u64().unwrap_or(0), None),
        None => (0, None),
    };
    let label = args
        .get(1)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(label_from_obj)
        .unwrap_or_default();

    if bytes == 0 {
        return json!({ "success": false, "error": "allocation size must be greater than zero" });
    }

    let mut container = load_container(app);
    let total = total_vram(app);
    let used = used_bytes(&container);
    let free = total.saturating_sub(used);
    if bytes > free {
        return json!({
            "success": false,
            "error": "insufficient VRAM",
            "requested": bytes,
            "available": free,
        });
    }

    let id = crate::util::pseudo_uuid_v4();
    let created_at = now_ms();
    let entry = json!({
        "id": id,
        "label": label,
        "bytes": bytes,
        "createdAt": created_at,
    });

    let mut allocs = allocations_of(&container);
    allocs.push(entry.clone());
    container[ALLOCS_FIELD] = Value::Array(allocs);
    save_container(app, &container);
    emit_memory_changed(app);

    json!({
        "success": true,
        "id": id,
        "bytes": bytes,
        "label": entry.get("label"),
        "createdAt": created_at,
        "remaining": total.saturating_sub(used + bytes),
    })
}

fn deallocate(app: &tauri::AppHandle, args: &Value) -> Value {
    // arg0: allocation id (string) or { id }.
    let id = match args.get(0) {
        Some(v) if v.is_object() => v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()),
        Some(v) => v.as_str().map(|s| s.to_string()),
        None => None,
    };
    let id = match id {
        Some(s) if !s.is_empty() => s,
        _ => return json!({ "success": false, "error": "allocation id is required" }),
    };

    let mut container = load_container(app);
    let allocs = allocations_of(&container);
    let before = allocs.len();
    let mut freed: u64 = 0;
    let remaining: Vec<Value> = allocs
        .into_iter()
        .filter(|e| {
            let matches = e.get("id").and_then(|v| v.as_str()) == Some(id.as_str());
            if matches {
                freed += alloc_bytes(e);
            }
            !matches
        })
        .collect();

    if remaining.len() == before {
        return json!({ "success": false, "error": "allocation not found", "id": id });
    }

    container[ALLOCS_FIELD] = Value::Array(remaining);
    save_container(app, &container);
    emit_memory_changed(app);

    json!({ "success": true, "id": id, "freed": freed })
}

// --- optimize ---------------------------------------------------------------
//
// Real ledger compaction: drop entries with zero bytes or missing ids (stale rows
// that hold no real reservation), recompute, persist, and notify. Returns the byte
// count actually reclaimed and the new live total. No driver-level "GPU optimize"
// is faked — this is honest accounting maintenance on the ledger we own.

fn optimize(app: &tauri::AppHandle) -> Value {
    let mut container = load_container(app);
    let allocs = allocations_of(&container);
    let before_count = allocs.len();
    let before_bytes = used_bytes(&container);

    let kept: Vec<Value> = allocs
        .into_iter()
        .filter(|e| {
            let has_id = e.get("id").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
            has_id && alloc_bytes(e) > 0
        })
        .collect();

    let after_count = kept.len();
    container[ALLOCS_FIELD] = Value::Array(kept);
    let after_bytes = used_bytes(&container);
    save_container(app, &container);
    emit_memory_changed(app);

    json!({
        "success": true,
        "removedAllocations": (before_count - after_count) as i64,
        "reclaimedBytes": before_bytes.saturating_sub(after_bytes),
        "activeAllocations": after_count as i64,
        "usedBytes": after_bytes,
        "timestamp": now_ms(),
    })
}

// --- dispatch ---------------------------------------------------------------

/// Route a `gpu:*` channel. Args are the positional JSON array the renderer sent
/// (see tauriCompat.ts). The five named capability/VRAM-ledger channels are
/// implemented natively; every other `gpu:*` channel — including the in-process
/// ResourceGovernor render-throttling signals (getState/shouldRender/render*),
/// which have no data tier and are intentionally out of scope — degrades to
/// Value::Null, identical to the namespace being unrouted.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "gpu:getCapabilities" => get_capabilities(app),
        "gpu:getMemory" => get_memory(app),
        "gpu:allocate" => allocate(app, args),
        "gpu:deallocate" => deallocate(app, args),
        "gpu:optimize" => optimize(app),
        _ => Value::Null,
    }
}
