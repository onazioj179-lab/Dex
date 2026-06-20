// =============================================================================
// DEX Tauri — Prerender subsystem (port of the `prerender:*` IPC handlers in
// src/main/core/RenderingEngine.ts -> OffscreenPreRenderer, Feature 39).
//
// SOURCE NOTE: the migration brief named `src/main/core/Prerender.ts`; no such
// file exists. The real owner is `RenderingEngine.ts` (class OffscreenPreRenderer).
// The actual namespace channels are:
//   - `prerender:request` (ipcMain.on, fire-and-forget) -> requestPreRender()
//   - `prerender:get`     (ipcMain.handle)              -> getCachedRender()
// The brief's three channels map onto this subsystem as:
//   - request -> `prerender:request` : enqueue a speculative render (real)
//   - render  -> `prerender:render`  : process/render a route NOW (real; this is
//                the synchronous form of processQueue's per-tick render step;
//                there is no `prerender:render` ipc handler in Electron, but the
//                rendering is exactly processQueue()'s body for one route)
//   - cache   -> `prerender:cache`   : read the render cache + stats (real;
//                generalises the existing `prerender:get` single-route lookup)
//
// FIDELITY: in Electron there is NO real BrowserView render. processQueue() just
// stamps `<!-- Pre-rendered: <route> at <ISO> -->` into the cache (see lines
// 369-389 of RenderingEngine.ts). That is fully reproducible natively, so these
// channels are implemented for real (not faked). The only Electron behaviour we
// cannot host inside a stateless dispatcher is the 5s setInterval timer that
// drains the queue one item per tick; we reproduce it faithfully with a one-shot
// background thread per enqueue (std::thread::spawn + sleep, precedent:
// native_ops.rs start_reminder_scheduler) that fires the same render after the
// same 5s delay and pushes a renderer event.
//
// STORAGE: the persisted projection of the in-memory state lives in DataStore-KV
// under the `prerender` key as:
//   { "queue": [PreRenderRequest...], "cache": { "<route>": PreRenderRequest } }
// A PreRenderRequest mirrors the TS interface exactly:
//   { id, route, priority, createdAt, renderedAt, html }
// Backward compatibility: the prior port stored a flat `{ route: html }` map at
// this key; get_cached_render() still tolerates that shape (and a bare html
// string) so an old KV file keeps working.
// =============================================================================

use serde_json::{json, Value};

const PRERENDER_KEY: &str = "prerender";
const MAX_CACHE_SIZE: usize = 10; // OffscreenPreRenderer.maxCacheSize
const PROCESS_DELAY_SECS: u64 = 5; // setInterval(processQueue, 5000)

// --- epoch millis (matches Date.now()) -------------------------------------
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ISO-8601 UTC string for the pre-render comment, mirroring
// `new Date(renderedAt).toISOString()` -> "YYYY-MM-DDTHH:MM:SS.sssZ".
fn iso_utc(ms: u64) -> String {
    let secs = (ms / 1000) as i64;
    let millis = (ms % 1000) as u32;
    // Days since the Unix epoch, plus seconds-of-day.
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let (hh, mm, ss) = (sod / 3600, (sod % 3600) / 60, sod % 60);
    // Civil-from-days (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, hh, mm, ss, millis
    )
}

// --- KV state load/save (the persisted projection of the subsystem) --------
// Returns (queue, cache_map). Tolerates: missing key, the new
// { queue, cache } shape, and the legacy flat { route: html } shape.
fn load_state(
    app: &tauri::AppHandle,
) -> (Vec<Value>, serde_json::Map<String, Value>) {
    let raw = crate::kv_get(app, PRERENDER_KEY);
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return (Vec::new(), serde_json::Map::new()),
    };
    // New shape: explicit `cache` object present.
    if let Some(cache) = obj.get("cache").and_then(|v| v.as_object()) {
        let queue = obj
            .get("queue")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        return (queue, cache.clone());
    }
    // Legacy flat shape: the whole object is { route: html }. Promote each entry
    // to a minimal PreRenderRequest so the rest of the code is uniform.
    let mut cache = serde_json::Map::new();
    for (route, html) in obj.iter() {
        let html_str = html.as_str().unwrap_or("");
        if html_str.is_empty() {
            continue;
        }
        cache.insert(
            route.clone(),
            json!({
                "id": format!("prerender-{}", now_ms()),
                "route": route,
                "priority": 0,
                "createdAt": 0,
                "renderedAt": 0,
                "html": html_str,
            }),
        );
    }
    (Vec::new(), cache)
}

fn save_state(
    app: &tauri::AppHandle,
    queue: &[Value],
    cache: &serde_json::Map<String, Value>,
) {
    let _ = crate::kv_set(
        app,
        PRERENDER_KEY,
        json!({ "queue": queue, "cache": Value::Object(cache.clone()) }),
    );
}

// --- core render step (exact body of processQueue for ONE route) -----------
// Stamps the placeholder HTML, sets renderedAt, inserts into cache, and evicts
// the oldest entry when over maxCacheSize. Returns the rendered html string.
fn render_into_cache(
    cache: &mut serde_json::Map<String, Value>,
    request: &Value,
) -> String {
    let route = request.get("route").and_then(|v| v.as_str()).unwrap_or("");
    let rendered_at = now_ms();
    let html = format!(
        "<!-- Pre-rendered: {} at {} -->",
        route,
        iso_utc(rendered_at)
    );

    let mut entry = request.clone();
    if let Some(o) = entry.as_object_mut() {
        o.insert("renderedAt".into(), json!(rendered_at));
        o.insert("html".into(), json!(html.clone()));
    }
    cache.insert(route.to_string(), entry);

    // Evict oldest (smallest renderedAt) when over the limit.
    if cache.len() > MAX_CACHE_SIZE {
        let oldest = cache
            .iter()
            .min_by_key(|(_, v)| v.get("renderedAt").and_then(|x| x.as_u64()).unwrap_or(0))
            .map(|(k, _)| k.clone());
        if let Some(k) = oldest {
            cache.remove(&k);
        }
    }
    html
}

// getCachedRender(route): renderedCache.get(route)?.html || null.
// Absent route, non-string html, or empty html all collapse to null
// (mirrors `cached?.html || null`). Tolerates a bare-string cache entry too.
fn get_cached_render(app: &tauri::AppHandle, route: &str) -> Value {
    let (_, cache) = load_state(app);
    let html = cache.get(route).and_then(|entry| {
        if let Some(s) = entry.as_str() {
            Some(s.to_string())
        } else {
            entry.get("html").and_then(|v| v.as_str()).map(String::from)
        }
    });
    match html.filter(|s| !s.is_empty()) {
        Some(s) => Value::String(s),
        None => Value::Null,
    }
}

// requestPreRender(route, priority): dedup vs cache + queue, push a new
// PreRenderRequest, sort queue by priority DESC. Persists the new queue.
// Returns true if a NEW item was actually enqueued (false on dedup).
fn request_prerender(app: &tauri::AppHandle, route: &str, priority: i64) -> bool {
    let (mut queue, cache) = load_state(app);

    // Deduplicate: already cached, or already queued for this route.
    if cache.contains_key(route) {
        return false;
    }
    if queue
        .iter()
        .any(|r| r.get("route").and_then(|v| v.as_str()) == Some(route))
    {
        return false;
    }

    queue.push(json!({
        "id": format!("prerender-{}", now_ms()),
        "route": route,
        "priority": priority,
        "createdAt": now_ms(),
        "renderedAt": 0,
        "html": Value::Null,
    }));

    // Sort by priority descending (a.priority - b.priority reversed).
    queue.sort_by(|a, b| {
        let pa = a.get("priority").and_then(|v| v.as_i64()).unwrap_or(0);
        let pb = b.get("priority").and_then(|v| v.as_i64()).unwrap_or(0);
        pb.cmp(&pa)
    });

    save_state(app, &queue, &cache);
    true
}

// Background drain: faithfully reproduce the 5s setInterval that pops the
// highest-priority queued item and renders it. One-shot per enqueue (re-reads
// state so concurrent enqueues converge), then emits a renderer event so the UI
// can pick up the freshly available route (analog of webContents.send).
fn spawn_process_tick(app: tauri::AppHandle, route: String) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(PROCESS_DELAY_SECS));

        let (mut queue, mut cache) = load_state(&app);
        if queue.is_empty() {
            return;
        }
        // processQueue shifts the FRONT (queue is kept priority-sorted on push).
        let request = queue.remove(0);
        let html = render_into_cache(&mut cache, &request);
        let rendered_route = request
            .get("route")
            .and_then(|v| v.as_str())
            .unwrap_or(&route)
            .to_string();
        save_state(&app, &queue, &cache);

        crate::native_ops::emit_event(
            &app,
            "prerender:ready",
            &json!({ "route": rendered_route, "html": html }),
        );
    });
}

/// Route a `prerender:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- request: enqueue a speculative render (fire-and-forget) ----------
        // requestPreRender(route, priority=0). ipcMain.on -> returns nothing.
        // We still kick off the 5s background render tick so the queue drains
        // exactly like Electron's setInterval would.
        "prerender:request" => {
            let route = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let priority = args
                .get(1)
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
                .unwrap_or(0);
            if !route.is_empty() && request_prerender(app, route, priority) {
                spawn_process_tick(app.clone(), route.to_string());
            }
            Value::Null
        }

        // --- render: render a route NOW and return its html -------------------
        // Synchronous form of processQueue's per-route render. If the route is
        // already cached, returns the cached html (dedup parity). Otherwise it
        // renders immediately, caches, removes any matching queued entry, and
        // returns the html. This has no exact Electron ipc counterpart but is
        // the same render the queue performs, surfaced on demand.
        "prerender:render" => {
            let route = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            if route.is_empty() {
                return json!({ "success": false, "error": "route required" });
            }
            let priority = args.get(1).and_then(|v| v.as_i64()).unwrap_or(0);

            let (mut queue, mut cache) = load_state(app);

            // Already cached -> return existing html (no re-render).
            if let Some(existing) = cache
                .get(route)
                .and_then(|e| e.get("html"))
                .and_then(|h| h.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
            {
                return json!({ "success": true, "route": route, "html": existing, "cached": true });
            }

            // Drop any queued entry for this route (we're rendering it directly).
            queue.retain(|r| r.get("route").and_then(|v| v.as_str()) != Some(route));

            let request = json!({
                "id": format!("prerender-{}", now_ms()),
                "route": route,
                "priority": priority,
                "createdAt": now_ms(),
                "renderedAt": 0,
                "html": Value::Null,
            });
            let html = render_into_cache(&mut cache, &request);
            save_state(app, &queue, &cache);

            crate::native_ops::emit_event(
                app,
                "prerender:ready",
                &json!({ "route": route, "html": html }),
            );

            json!({ "success": true, "route": route, "html": html, "cached": false })
        }

        // --- cache: read the render cache + stats -----------------------------
        // With a route arg -> getCachedRender(route) (the legacy `prerender:get`
        // single-route lookup: html string or null). With no route arg -> the
        // full cache projection plus getStats() ({ queued, cached }).
        "prerender:cache" | "prerender:getCache" | "prerender:get" => {
            if let Some(route) = args.get(0).and_then(|v| v.as_str()) {
                if !route.is_empty() {
                    return get_cached_render(app, route);
                }
            }
            let (queue, cache) = load_state(app);
            json!({
                "cache": Value::Object(cache.clone()),
                "stats": { "queued": queue.len(), "cached": cache.len() },
            })
        }

        // Unknown -> honest null (never faked).
        _ => Value::Null,
    }
}
