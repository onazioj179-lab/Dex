// =============================================================================
// DEX Tauri — CorePC subsystem (port of the `corepc:*` IPC surface backed by
// src/main/services/CorePCService.ts).
//
// CorePCService is DEX's integrity / runtime layer: it separates the immutable
// "core" (the shipped binary + its resources) from mutable user data, hashes the
// known-immutable artifacts on demand, and compares them against a persisted
// baseline so tampering / partial-uninstall corruption is detectable, while a
// legitimate version bump silently re-baselines. Electron registered exactly one
// IPC handler for this (`corepc:verify`), plus the house-standard version getter.
//
// This module ports that integrity engine for REAL on Tauri and adds the three
// heavy runtime channels the migration contract assigns to this namespace
// (query / execute / notify), all native:
//
//   corepc:getVersion -> the running DEX version (CARGO_PKG_VERSION), the canonical
//     version-string shape used everywhere (app:getVersion). Unchanged.
//
//   corepc:verify -> verifyCoreIntegrity(): sha256 the immutable core artifacts
//     (the running executable + any sibling resources we can resolve), diff against
//     the KV-persisted baseline, baseline on first run, re-baseline on version
//     change. Returns the exact CoreIntegrityReport interface from CorePCService.ts
//     (status / appVersion / changedFiles / missingFiles / newFiles / durationMs).
//     This is a genuine native re-implementation: in Electron the "core" was the
//     JS bundle under app.getAppPath(); on Tauri there is no JS bundle — the core
//     IS the native binary, so we hash std::env::current_exe() (the precise Tauri
//     analog of the immutable shipped artifact).
//
//   corepc:query -> read-only core/runtime snapshot: version, platform, exe path +
//     size + sha256, the persisted-baseline status, and current OS uptime. Pure
//     native (std::fs + sysinfo). args[0] may be a key string to project a single
//     field ({ value }); otherwise the whole object is returned.
//
//   corepc:execute -> run a named core maintenance action (args[0].action |
//     args[0]): "verify" runs the integrity check; "rebaseline" force-records a
//     fresh baseline from the current artifacts; "status" returns the snapshot.
//     Real native; mutating actions persist via the KV backbone. Unknown actions
//     degrade with { success:false, error }.
//
//   corepc:notify -> raise a core notification: a renderer push event
//     (`corepc:notify` via emit_event, the Tauri analog of webContents.send) plus
//     a best-effort OS toast. Void channel (returns null), matching the fire-and-
//     forget notify semantics. args[0] = { title, body } (or a bare string body).
//
// Storage: the integrity baseline lives in the DataStore-KV bucket under the
// `corepc` key (the namespace's contracted bucket), as a single object mirroring
// the Electron CoreIntegritySnapshot ({ version, recordedAt, hashes }). The
// crate::kv_get / crate::kv_set backbone is the single source of truth; no
// separate core-integrity.json file is written (the KV store subsumes it).
//
// DEGRADED: none of the assigned channels. Every listed channel is implemented
// with real native code. (Electron's process-level boot hashing on launch and the
// renderer's "refuse to load apps" defence are out-of-contract orchestration, not
// IPC channels, and so are not surfaced here.)
// =============================================================================

use serde_json::{json, Value};

/// KV bucket key for the persisted core-integrity snapshot (the namespace's
/// DataStore-KV bucket, matching the contract).
const COREPC_KEY: &str = "corepc";

/// Epoch millis (mirrors Date.now() / recordedAt).
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The set of immutable "core" artifacts to hash, as (relative-label, abs-path).
///
/// On Tauri the shipped core is the native binary (Electron hashed dist/main/*.js;
/// there is no such bundle here). We always include the running executable; when a
/// sibling WebView2/runtime resources dir is resolvable next to it we include any
/// top-level files there too, so the integrity surface tracks the real shipped
/// payload. Paths that cannot be resolved simply contribute nothing (never panic).
fn core_artifacts() -> Vec<(String, std::path::PathBuf)> {
    let mut out: Vec<(String, std::path::PathBuf)> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let label = exe
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "executable".to_string());
        out.push((label, exe.clone()));

        // Sibling top-level resource files (e.g. resources.pak, .bin assets)
        // shipped next to the binary count as part of the immutable core.
        // OS/runtime-managed libraries (WebView2Loader, MSVC redist) are excluded
        // below because they update independently of DEX.
        if let Some(dir) = exe.parent() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                let mut sib: Vec<(String, std::path::PathBuf)> = Vec::new();
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path == exe {
                        continue;
                    }
                    if path.is_file() {
                        if let Some(name) = path.file_name() {
                            let name = name.to_string_lossy().to_string();
                            // Only hash binary/runtime resources, not logs or db files.
                            let lower = name.to_lowercase();
                            // Skip OS/runtime-managed libraries: the WebView2 evergreen
                            // loader and the MSVC/VC++ redistributables are updated
                            // independently of DEX, so hashing them yields false
                            // "changed"/"missing" tamper reports on otherwise-intact
                            // installs.
                            let os_managed = lower.starts_with("webview2loader")
                                || lower.starts_with("vcruntime")
                                || lower.starts_with("msvcp")
                                || lower.starts_with("concrt")
                                || lower.starts_with("vccorlib");
                            if os_managed {
                                continue;
                            }
                            if lower.ends_with(".dll")
                                || lower.ends_with(".pak")
                                || lower.ends_with(".bin")
                                || lower.ends_with(".dat")
                            {
                                sib.push((name, path));
                            }
                        }
                    }
                }
                // Deterministic order so the report's *Files lists are stable.
                sib.sort_by(|a, b| a.0.cmp(&b.0));
                out.extend(sib);
            }
        }
    }
    out
}

/// Hash the current core artifacts. Returns (label -> sha256) for readable files
/// and the labels that could not be read (mirrors collectCurrentHashes / missing).
fn collect_current_hashes() -> (serde_json::Map<String, Value>, Vec<String>) {
    let mut hashes = serde_json::Map::new();
    let mut missing: Vec<String> = Vec::new();
    for (label, path) in core_artifacts() {
        match std::fs::read(&path) {
            Ok(bytes) => {
                hashes.insert(label, Value::String(crate::licensing::sha256_hex(&bytes)));
            }
            Err(_) => missing.push(label),
        }
    }
    (hashes, missing)
}

/// Read the persisted snapshot ({ version, recordedAt, hashes }) from KV, or None
/// when absent / malformed (treated as "no baseline", same as Electron).
fn read_snapshot(app: &tauri::AppHandle) -> Option<Value> {
    let raw = crate::kv_get(app, COREPC_KEY);
    let obj = raw.as_object()?;
    let version_ok = obj.get("version").map(|v| v.is_string()).unwrap_or(false);
    let recorded_ok = obj.get("recordedAt").map(|v| v.is_number()).unwrap_or(false);
    let hashes_ok = obj.get("hashes").map(|v| v.is_object()).unwrap_or(false);
    if version_ok && recorded_ok && hashes_ok {
        Some(raw)
    } else {
        None
    }
}

/// Persist a snapshot under the corepc KV bucket (mirrors writeSnapshot).
fn write_snapshot(app: &tauri::AppHandle, version: &str, hashes: serde_json::Map<String, Value>) {
    let snap = json!({
        "version": version,
        "recordedAt": now_ms(),
        "hashes": Value::Object(hashes),
    });
    let _ = crate::kv_set(app, COREPC_KEY, snap);
}

/// `corepc:verify` -> verifyCoreIntegrity(): returns the CoreIntegrityReport.
/// status is one of baseline-recorded | rebaselined | verified | changed | error.
fn verify(app: &tauri::AppHandle) -> Value {
    let start = now_ms();
    let app_version = env!("CARGO_PKG_VERSION");
    let (current, missing) = collect_current_hashes();

    // First run: record the baseline.
    let snap = match read_snapshot(app) {
        None => {
            write_snapshot(app, app_version, current);
            return json!({
                "status": "baseline-recorded",
                "appVersion": app_version,
                "changedFiles": [],
                "missingFiles": missing,
                "newFiles": [],
                "durationMs": now_ms().saturating_sub(start),
            });
        }
        Some(s) => s,
    };

    // Version bumped: silently re-baseline (legitimate update).
    let snap_version = snap.get("version").and_then(|v| v.as_str()).unwrap_or("");
    if snap_version != app_version {
        write_snapshot(app, app_version, current);
        return json!({
            "status": "rebaselined",
            "appVersion": app_version,
            "changedFiles": [],
            "missingFiles": missing,
            "newFiles": [],
            "durationMs": now_ms().saturating_sub(start),
        });
    }

    // Diff current hashes against the stored baseline.
    let prev = snap
        .get("hashes")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let mut changed: Vec<String> = Vec::new();
    let mut new_files: Vec<String> = Vec::new();
    for (label, hash) in current.iter() {
        match prev.get(label) {
            None => new_files.push(label.clone()),
            Some(p) if p != hash => changed.push(label.clone()),
            _ => {}
        }
    }
    changed.sort();
    new_files.sort();

    let status = if !changed.is_empty() || !missing.is_empty() {
        "changed"
    } else {
        "verified"
    };

    json!({
        "status": status,
        "appVersion": app_version,
        "changedFiles": changed,
        "missingFiles": missing,
        "newFiles": new_files,
        "durationMs": now_ms().saturating_sub(start),
    })
}

/// Build the read-only core/runtime snapshot used by `corepc:query` and the
/// "status" execute action. All fields are real native reads.
fn runtime_snapshot(app: &tauri::AppHandle) -> Value {
    let version = env!("CARGO_PKG_VERSION");
    let exe = std::env::current_exe().ok();
    let exe_path = exe
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let (exe_size, exe_hash) = match exe.as_ref().and_then(|p| std::fs::read(p).ok()) {
        Some(bytes) => (
            Value::from(bytes.len() as u64),
            Value::String(crate::licensing::sha256_hex(&bytes)),
        ),
        None => (Value::Null, Value::Null),
    };

    let snap = read_snapshot(app);
    let baseline_recorded = snap.is_some();
    let baseline_version = snap
        .as_ref()
        .and_then(|s| s.get("version"))
        .cloned()
        .unwrap_or(Value::Null);
    let baseline_recorded_at = snap
        .as_ref()
        .and_then(|s| s.get("recordedAt"))
        .cloned()
        .unwrap_or(Value::Null);
    let tracked_artifacts = snap
        .as_ref()
        .and_then(|s| s.get("hashes"))
        .and_then(|h| h.as_object())
        .map(|h| h.len())
        .unwrap_or(0);

    json!({
        "version": version,
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "exePath": exe_path,
        "exeSizeBytes": exe_size,
        "exeSha256": exe_hash,
        "baselineRecorded": baseline_recorded,
        "baselineVersion": baseline_version,
        "baselineRecordedAt": baseline_recorded_at,
        "trackedArtifacts": tracked_artifacts,
        "osUptimeSecs": sysinfo::System::uptime() as i64,
        "now": now_ms(),
    })
}

/// `corepc:query` — read-only core/runtime state. With a string arg, project a
/// single field as { value }; otherwise return the whole snapshot object.
fn query(app: &tauri::AppHandle, arg: &Value) -> Value {
    let snapshot = runtime_snapshot(app);
    match arg.as_str() {
        Some(key) if !key.is_empty() => {
            let value = snapshot.get(key).cloned().unwrap_or(Value::Null);
            json!({ "value": value })
        }
        _ => snapshot,
    }
}

/// `corepc:execute` — run a named core maintenance action. The action name comes
/// from args[0].action, or args[0] when it is a bare string.
fn execute(app: &tauri::AppHandle, arg: &Value) -> Value {
    let action = arg
        .get("action")
        .and_then(|v| v.as_str())
        .or_else(|| arg.as_str())
        .unwrap_or("")
        .to_string();

    match action.as_str() {
        "verify" => json!({ "success": true, "action": "verify", "report": verify(app) }),
        "status" => json!({ "success": true, "action": "status", "snapshot": runtime_snapshot(app) }),
        "rebaseline" => {
            let (current, missing) = collect_current_hashes();
            let recorded = current.len();
            write_snapshot(app, env!("CARGO_PKG_VERSION"), current);
            // Push a renderer event so any open integrity UI can refresh.
            crate::native_ops::emit_event(
                app,
                "corepc:rebaselined",
                &json!({ "version": env!("CARGO_PKG_VERSION"), "recordedAt": now_ms() }),
            );
            json!({
                "success": true,
                "action": "rebaseline",
                "recordedArtifacts": recorded,
                "missingFiles": missing,
            })
        }
        "" => json!({ "success": false, "error": "missing action" }),
        other => json!({ "success": false, "error": format!("unknown action: {}", other) }),
    }
}

/// `corepc:notify` — raise a core notification. Pushes a renderer `corepc:notify`
/// event (Tauri analog of webContents.send) and a best-effort OS toast. Void.
fn notify(app: &tauri::AppHandle, arg: &Value) -> Value {
    // Accept either { title, body } or a bare string body.
    let (title, body) = match arg {
        Value::String(s) => (String::new(), s.clone()),
        _ => (
            arg.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            arg.get("body")
                .or_else(|| arg.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        ),
    };

    let payload = json!({
        "id": crate::util::pseudo_uuid_v4(),
        "title": title,
        "body": body,
        "timestamp": now_ms(),
    });
    crate::native_ops::emit_event(app, "corepc:notify", &payload);
    crate::native_ops::notify(app, &title, &body);
    Value::Null
}

/// Route a `corepc:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts): query -> args[0] optional field key; execute ->
/// args[0] = { action } or action string; notify -> args[0] = { title, body }.
/// Reads (getVersion / verify) take no args. Unknown channels degrade to
/// Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // app.getVersion() -> version string. Same source as app:getVersion.
        "corepc:getVersion" => json!(env!("CARGO_PKG_VERSION")),
        "corepc:verify" => verify(app),
        "corepc:query" => query(app, &a0),
        "corepc:execute" => execute(app, &a0),
        "corepc:notify" => notify(app, &a0),
        _ => Value::Null,
    }
}
