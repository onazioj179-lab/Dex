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
// channels plus `navigate` at their exact Electron shapes. `navigate` reproduces
// the VALID_APPS gate, appId resolution and the renderer push event (via
// native_ops::emit_event, the parity of webContents.send); only window
// show/focus and the localStorage title enrichment degrade headless. The
// nonexistent register/unregister/list channels degrade honestly (no fake).
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

// VALID_APPS — mirrors the Electron Set. Gated on by `navigate` to reproduce
// the `{ found:false, displayName:"Unknown app" }` rejection path exactly.
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

/// deeplink:navigate(url) -> DeepLinkResolution
///
/// Native port of DeepLinkRouter.navigate. The portable behaviour is fully
/// reproduced:
///   - parseLink (pure)
///   - VALID_APPS gate -> { found:false, ..., displayName:"Unknown app" }
///   - appId resolution (`vinx`->`videoeditor`, `app`->resourceType||"home")
///   - the renderer push: Electron's `mainWindow.webContents.send(
///     'deeplink:navigate', { app, resourceType, resourceId })` maps 1:1 to
///     crate::native_ops::emit_event(app, "deeplink:navigate", payload).
///
/// DEGRADED (headless, identical shape preserved):
///   - window.show()/focus(): there is no live BrowserWindow handle here; the
///     Tauri shell manages window visibility elsewhere, so this is a no-op.
///   - displayName title enrichment: resolveDisplayName runs executeJavaScript
///     against renderer localStorage (dex-notes/dex-tasks). Unreachable from
///     native Rust, so we return Electron's own catch/no-match fallback
///     `app/type/id` (see resolve_display_name) — the exact value Electron
///     yields whenever the window is gone or the lookup misses. Shape is byte
///     identical to the success path; only best-case title text is unavailable.
fn navigate(app: &tauri::AppHandle, url: &str) -> Value {
    let target = parse_link(url);
    if target.is_null() {
        return json!({
            "found": false,
            "app": "",
            "resourceType": "",
            "resourceId": "",
            "displayName": "Invalid link"
        });
    }

    let app_name = target.get("app").and_then(|v| v.as_str()).unwrap_or("");
    let resource_type = target.get("resourceType").and_then(|v| v.as_str()).unwrap_or("");
    let resource_id = target.get("resourceId").and_then(|v| v.as_str()).unwrap_or("");

    if !VALID_APPS.contains(&app_name) {
        return json!({
            "found": false,
            "app": app_name,
            "resourceType": resource_type,
            "resourceId": resource_id,
            "displayName": "Unknown app"
        });
    }

    // appId resolution mirrors Electron exactly.
    let mut app_id = app_name.to_string();
    if app_id == "vinx" {
        app_id = "videoeditor".to_string();
    }
    if app_id == "app" {
        app_id = if resource_type.is_empty() { "home".to_string() } else { resource_type.to_string() };
    }

    // Renderer push: parity with mainWindow.webContents.send('deeplink:navigate', …).
    crate::native_ops::emit_event(
        app,
        "deeplink:navigate",
        &json!({
            "app": app_id,
            "resourceType": resource_type,
            "resourceId": resource_id,
        }),
    );

    // displayName: headless fallback (see doc comment). Same shape as Electron.
    let display_name = resolve_display_name(&target);

    json!({
        "found": true,
        "app": app_name,
        "resourceType": resource_type,
        "resourceId": resource_id,
        "displayName": display_name,
    })
}

/// Route a `deeplink:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The pure data channels and the heavy `navigate`
/// channel are handled here. The brief also listed `register`, `unregister` and
/// `list`, but DeepLinkRouter.ts defines no such channels and backs them with no
/// registry (see header) — there is nothing real to port, so per the no-fake
/// rule they degrade explicitly. Unknown channels degrade to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "deeplink:navigate" => {
            let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            navigate(app, url)
        }
        // These channels do not exist in DeepLinkRouter.ts and have no backing
        // registry to operate on; implementing them would mean inventing state
        // the real subsystem never had. Degrade honestly rather than fake.
        "deeplink:register" | "deeplink:unregister" | "deeplink:list" => {
            json!({ "success": false, "error": "not ported (channel does not exist in DeepLinkRouter)" })
        }
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
        // Unknown deeplink:* channels degrade to null.
        _ => Value::Null,
    }
}
