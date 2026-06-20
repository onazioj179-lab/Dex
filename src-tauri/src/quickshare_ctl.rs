// =============================================================================
// DEX Tauri — QuickShare subsystem (port of the `quickshare:*` IPC handlers).
//
// PORT NOTES (read before extending this module):
//
// The brief-named source `src/main/core/QuickShare.ts` does NOT exist. The only
// QuickShare code in the repo is the in-memory `QuickShareService` inside
// src/main/core/EcosystemIntegration.ts. Its channels are device/discovery and
// transfer oriented: quickshare:get-devices, quickshare:share(targetId,
// files[]), quickshare:accept, quickshare:reject, quickshare:history,
// quickshare:start-discovery, quickshare:stop-discovery. It persists NOTHING:
// all state lives in `Map`s rebuilt from live network discovery, and it exposes
// neither `getLinks` nor `revoke`.
//
// The brief, however, names a LINK-based surface (getLinks / share / revoke).
// That is a coherent, self-consistent share-LINK model that the prior header
// already prescribed wiring through crate::kv_get / crate::kv_set under the SAME
// `quickshare` key. This module implements exactly that, natively and durably:
//
//   - quickshare:getLinks  -> read the persisted `quickshare` array (default
//       []), recomputing the live `expired` flag on read.
//   - quickshare:share     -> create a persisted share-LINK record (id + token +
//       timestamps, best-effort file stat under the app data dir), append to the
//       KV array, emit `quickshare:link-created`, return the record.
//   - quickshare:revoke    -> mark the matching link `revoked` (or report
//       missing), re-store, emit `quickshare:link-revoked`.
//
// IMPORTANT DIVERGENCE (documented honestly):
//   The Electron `quickshare:share(targetId, files[])` is a different beast: its
//   first step is `this.nearbyDevices.get(targetId)` and it THROWS "Device not
//   found or no longer available" unless the target is in the live in-memory
//   discovery map (populated only by the runtime BLE/Wi-Fi discovery loop). That
//   device-to-device byte transfer is genuinely heavy native runtime and is NOT
//   reproduced here; we do not fake live discovery state. What we implement is
//   the LINK model the brief asked for — a durable, self-consistent surface that
//   getLinks/revoke operate over — not the discovery-gated device transfer. The
//   live device/discovery/transfer channels (get-devices, history, accept,
//   reject, start/stop-discovery) are intentionally NOT routed here and must
//   keep flowing to the native runtime; this dispatcher owns only the three
//   link channels listed below.
// =============================================================================

use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// KV key holding the persisted array of share-link records. Same string the
/// renderer/runtime would use, so the store stays a single source of truth.
const KV_KEY: &str = "quickshare";

/// Default link lifetime when the caller does not specify one (24h, in ms).
const DEFAULT_TTL_MS: u64 = 24 * 60 * 60 * 1000;

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Load the persisted link array (always returns a Vec; missing/garbage -> []).
fn load_links(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, KV_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn save_links(app: &tauri::AppHandle, links: Vec<Value>) {
    let _ = crate::kv_set(app, KV_KEY, Value::Array(links));
}

/// Recompute the live `expired` flag for one link record against `now`.
fn with_live_expiry(mut link: Value, now: u64) -> Value {
    if let Some(obj) = link.as_object_mut() {
        let expires = obj.get("expiresAt").and_then(|v| v.as_u64());
        let revoked = obj.get("revoked").and_then(|v| v.as_bool()).unwrap_or(false);
        let expired = matches!(expires, Some(exp) if exp > 0 && now >= exp);
        obj.insert("expired".to_string(), json!(expired));
        // Derive a coarse status the renderer can show without re-deriving.
        let status = if revoked {
            "revoked"
        } else if expired {
            "expired"
        } else {
            "active"
        };
        obj.insert("status".to_string(), json!(status));
    }
    link
}

/// Best-effort native file metadata for a single path. Never fails the call:
/// unreadable / nonexistent paths are still recorded (size 0) so the link is
/// faithful to what the caller asked to share.
fn stat_file(path: &str) -> Value {
    let p = std::path::Path::new(path);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .filter(|e| !e.is_empty())
        .map(|e| e.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    json!({ "name": name, "path": path, "size": size, "type": ext })
}

/// Route a `quickshare:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the three link channels below are
/// owned here; everything else falls through (Value::Null) to the runtime.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- quickshare:getLinks ------------------------------------------
        // Return the persisted link array with live expiry recomputed. Default
        // [] when nothing has been shared yet.
        "quickshare:getLinks" => {
            let now = now_millis();
            let links: Vec<Value> = load_links(app)
                .into_iter()
                .map(|l| with_live_expiry(l, now))
                .collect();
            Value::Array(links)
        }

        // --- quickshare:share ---------------------------------------------
        // Create a durable share-LINK record. Accepts either:
        //   args[0] = files[] (array of path strings), or
        //   args[0] = options object { files?: string[]|object[], label?,
        //             ttlMs?, target? }.
        // Returns the created record (with success:true). Does NOT perform the
        // discovery-gated device byte transfer (see header divergence).
        "quickshare:share" => {
            let now = now_millis();
            let arg0 = args.get(0).cloned().unwrap_or(Value::Null);

            // Normalize the file list + optional metadata from the two shapes.
            let (raw_files, label, ttl_ms, target): (Vec<Value>, Option<String>, u64, Option<String>) =
                match &arg0 {
                    Value::Array(a) => (a.clone(), None, DEFAULT_TTL_MS, None),
                    Value::Object(o) => {
                        let files = match o.get("files") {
                            Some(Value::Array(a)) => a.clone(),
                            _ => Vec::new(),
                        };
                        let label = o
                            .get("label")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let ttl = o
                            .get("ttlMs")
                            .and_then(|v| v.as_u64())
                            .filter(|t| *t > 0)
                            .unwrap_or(DEFAULT_TTL_MS);
                        let target = o
                            .get("target")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        (files, label, ttl, target)
                    }
                    _ => (Vec::new(), None, DEFAULT_TTL_MS, None),
                };

            // Stat each entry. String entries are paths; object entries are
            // passed through (already-described files), defaulting missing
            // fields conservatively.
            let files: Vec<Value> = raw_files
                .into_iter()
                .map(|f| match f {
                    Value::String(p) => stat_file(&p),
                    Value::Object(mut o) => {
                        o.entry("name".to_string())
                            .or_insert_with(|| json!("unknown"));
                        o.entry("size".to_string()).or_insert_with(|| json!(0));
                        o.entry("type".to_string())
                            .or_insert_with(|| json!("unknown"));
                        Value::Object(o)
                    }
                    other => json!({ "name": other, "size": 0, "type": "unknown" }),
                })
                .collect();

            let id = crate::util::pseudo_uuid_v4();
            let token = crate::util::pseudo_uuid_v4().replace('-', "");
            let expires_at = now + ttl_ms;
            let file_count = files.len();

            let record = json!({
                "id": id,
                "token": token,
                "label": label,
                "target": target,
                "files": files,
                "fileCount": file_count,
                "createdAt": now,
                "expiresAt": expires_at,
                "revoked": false,
                "status": "active",
                "expired": false,
            });

            let mut links = load_links(app);
            links.push(record.clone());
            save_links(app, links);

            crate::native_ops::emit_event(app, "quickshare:link-created", &record);

            let mut out = record;
            if let Some(obj) = out.as_object_mut() {
                obj.insert("success".to_string(), json!(true));
            }
            out
        }

        // --- quickshare:revoke --------------------------------------------
        // Mark the matching link revoked (idempotent), re-store, emit. Returns
        // { success, id, revoked, found }.
        "quickshare:revoke" => {
            let id = match args.get(0).and_then(|v| v.as_str()) {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => {
                    return json!({
                        "success": false,
                        "error": "missing link id",
                    });
                }
            };

            let now = now_millis();
            let mut links = load_links(app);
            let mut found = false;
            for link in links.iter_mut() {
                if link.get("id").and_then(|v| v.as_str()) == Some(id.as_str()) {
                    if let Some(obj) = link.as_object_mut() {
                        obj.insert("revoked".to_string(), json!(true));
                        obj.insert("revokedAt".to_string(), json!(now));
                        obj.insert("status".to_string(), json!("revoked"));
                    }
                    found = true;
                    break;
                }
            }

            if found {
                save_links(app, links);
                let payload = json!({ "id": id, "revokedAt": now });
                crate::native_ops::emit_event(app, "quickshare:link-revoked", &payload);
            }

            json!({
                "success": found,
                "id": id,
                "revoked": found,
                "found": found,
            })
        }

        _ => Value::Null,
    }
}
