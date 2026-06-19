// =============================================================================
// DEX Tauri — Deep Link subsystem (port of core/DeepLinkRouter.ts).
//
// Pure-function tier. DeepLinkRouter is STATELESS in Electron: it parses
// `dex://app/type/id` URLs and resolves a display name. It holds no store and
// persists nothing, so there is no JSON file and no DataStore-KV key here
// (despite the namespace nominally mapping to `datastore-kv:deeplinks`, the real
// router never reads or writes that key — there is nothing to persist).
//
// Channels & shapes (matched exactly to the ipcMain.handle handlers):
//   - deeplink:resolve(url) ->
//       found=false: { found: false, displayName: "Invalid link" }   (unparseable)
//       found=true : { found: true, displayName, app, resourceType, resourceId }
//   - deeplink:parse(url)        -> DeepLinkTarget | null
//       DeepLinkTarget = { app, resourceType, resourceId }
//   - deeplink:build(a, t, id)   -> "dex://a/t/id"   (String)
//   - deeplink:extractLinks(txt) -> string[]         (matches, [] if none)
//
// NAMING NOTE: the porting brief listed DATA channels as `resolve, list` and
// HEAVY channels as `navigate, register, unregister`. The actual subsystem has
// no `list` / `register` / `unregister` channels and no registry to back them —
// those names do not exist in DeepLinkRouter.ts. The genuine data/pure channels
// are resolve / parse / build / extractLinks (all referentially transparent),
// and the one genuine heavy channel is `navigate`. We port all four pure
// channels at their exact Electron shapes and skip `navigate`.
//
// DIVERGENCES (documented):
//   - deeplink:resolve display-name lookup. Electron's resolveDisplayName runs
//     `executeJavaScript` inside the live renderer to read localStorage
//     (dex-notes / dex-tasks) and return a note/task title. That requires the
//     running webview and is not reachable from native Rust. We return the
//     deterministic fallback `app/type/id` — which is EXACTLY the value
//     Electron yields on its catch path and whenever the lookup misses (no
//     window, no match, or a non-notes/non-tasks target). The shape is
//     identical; only the best-case title enrichment is unavailable headless.
//   - resolve(found=true) omits a `displayName` of "" only when the JS lookup
//     returned empty; Electron then falls back to `app/resourceType`. We mirror
//     that exact fallback string.
// =============================================================================

use serde_json::{json, Value};

// VALID_APPS — mirrors the Electron Set. Unused by the ported pure channels
// (only `navigate`, which is skipped, gates on it), kept here as the faithful
// reference list so the port is self-documenting.
const VALID_APPS: &[&str] = &[
    "home", "files", "browser", "settings", "transfers", "dashboard", "notes", "tasks", "power",
    "workflows", "gallery", "audio", "video", "vinx", "videoeditor", "imosion", "prism", "flux",
    "forge", "calculator", "calendar", "passwordgenerator", "rewind", "kanban", "achievements",
    "app", "automation", "media",
];

/// parseLink(url) -> { app, resourceType, resourceId } | null
fn parse_link(url: &str) -> Value {
    if url.is_empty() || !url.starts_with("dex://") {
        return Value::Null;
    }
    let stripped = url.replacen("dex://", "", 1);
    let parts: Vec<&str> = stripped.split('/').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return Value::Null;
    }
    let app = parts[0].to_lowercase();
    let resource_type = if parts.len() > 1 { parts[1].to_string() } else { String::new() };
    let resource_id = if parts.len() > 2 { parts[2..].join("/") } else { String::new() };
    json!({ "app": app, "resourceType": resource_type, "resourceId": resource_id })
}

// resolveDisplayName(target): headless fallback. The live-renderer localStorage
// lookup (note/task titles) cannot run natively, so we return the same string
// Electron produces on its catch / no-match path: `app/type/id` (id omitted when
// empty, matching the JS `id ? '/' + id : ''`).
fn resolve_display_name(target: &Value) -> String {
    let app = target.get("app").and_then(|v| v.as_str()).unwrap_or("");
    let rtype = target.get("resourceType").and_then(|v| v.as_str()).unwrap_or("");
    let id = target.get("resourceId").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        format!("{}/{}", app, rtype)
    } else {
        format!("{}/{}/{}", app, rtype, id)
    }
}

/// deeplink:resolve(url)
fn resolve(url: &str) -> Value {
    let target = parse_link(url);
    if target.is_null() {
        return json!({ "found": false, "displayName": "Invalid link" });
    }
    let display_name = resolve_display_name(&target);
    json!({
        "found": true,
        "displayName": display_name,
        "app": target.get("app").cloned().unwrap_or(Value::Null),
        "resourceType": target.get("resourceType").cloned().unwrap_or(Value::Null),
        "resourceId": target.get("resourceId").cloned().unwrap_or(Value::Null),
    })
}

/// buildLink(app, resourceType, resourceId) -> "dex://app/type/id"
fn build_link(app: &str, resource_type: &str, resource_id: &str) -> String {
    format!("dex://{}/{}/{}", app, resource_type, resource_id)
}

// extractLinks(text): port of /dex:\/\/[a-z0-9\-_]+(?:\/[a-z0-9\-_]+)*(?:\/[a-zA-Z0-9\-_]+)*/g.
// A hand-rolled scanner (no regex crate). The two suffix groups together accept
// any run of `/segment` where each segment is one or more of [a-zA-Z0-9-_]; the
// first character after `dex://` must be a [a-z0-9-_] segment. This matches the
// same strings the JS regex matches (the lowercase-only first group is a subset
// of the mixed-case later group, so the union accepts a leading segment of
// [a-z0-9-_]+ followed by zero or more [a-zA-Z0-9-_]+ segments).
fn extract_links(text: &str) -> Vec<String> {
    const PREFIX: &str = "dex://";
    let bytes = text.as_bytes();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;
    let lower_seg = |c: u8| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_';
    let mixed_seg = |c: u8| c.is_ascii_alphanumeric() || c == b'-' || c == b'_';
    while i + PREFIX.len() <= bytes.len() {
        if &text[i..i + PREFIX.len()] == PREFIX {
            let start = i;
            let mut j = i + PREFIX.len();
            // First segment: must be lower_seg+ (the leading [a-z0-9-_]+ group).
            let seg0 = j;
            while j < bytes.len() && lower_seg(bytes[j]) {
                j += 1;
            }
            if j == seg0 {
                // No valid first segment; advance past prefix and continue.
                i += PREFIX.len();
                continue;
            }
            // Subsequent `/segment` groups: each segment is mixed_seg+.
            loop {
                if j < bytes.len() && bytes[j] == b'/' {
                    let seg = j + 1;
                    let mut k = seg;
                    while k < bytes.len() && mixed_seg(bytes[k]) {
                        k += 1;
                    }
                    if k == seg {
                        break; // a lone trailing slash is not consumed
                    }
                    j = k;
                } else {
                    break;
                }
            }
            out.push(text[start..j].to_string());
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// Route a `deeplink:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Pure data channels are handled; the heavy
/// `navigate` channel (live BrowserWindow IPC + show/focus + renderer
/// executeJavaScript) is not ported and returns Value::Null. Unknown channels
/// also degrade to Value::Null.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let _ = VALID_APPS; // referenced only by the skipped `navigate` path.
    match channel {
        "deeplink:resolve" => {
            let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            resolve(url)
        }
        "deeplink:parse" => {
            let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            parse_link(url)
        }
        "deeplink:build" => {
            let app_name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let resource_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let resource_id = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
            json!(build_link(app_name, resource_type, resource_id))
        }
        "deeplink:extractLinks" => {
            let text = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            json!(extract_links(text))
        }
        // HEAVY (skipped): deeplink:navigate needs the live window. Not ported.
        _ => Value::Null,
    }
}
