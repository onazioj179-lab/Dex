// =============================================================================
// DEX Tauri — Vinx control surface (port target: namespace `vinx`).
//
// AUDIT NOTE (preserved from the prior round, re-verified this round):
//   The originally-named Electron source `src/main/core/VinxPresentation.ts`
//   DOES NOT EXIST. A full repo sweep (Glob `**/Vinx*.ts`, Grep `vinx:`) found:
//     - The only Vinx main-process manager is `VinxPresentationManager.ts`,
//       exposed over `vinx-presentation:{register,list,launch,close,remove}` and
//       ALREADY ported in `src-tauri/src/vinx_presentation.rs`.
//     - The real `vinx:*` IPC surface is `vinx:import-media`,
//       `vinx:export-progress-set`, `vinx:export-progress-get`
//       (`src/main/services/AudioNativeService.ts`), all backed by the napi
//       native module (blocked in this environment) -> honest null degrade here.
//     - There is NO `vinx:getState`, NO `vinx:present`, NO `vinx:save` handler
//       and NO `vinx-state.json` reader/writer anywhere in renderer or main.
//
// Because no Electron handler defines these three channels, there is no exact
// return shape to mirror and project rules forbid fabricating provider fields.
// What CAN be built with real native code is honest persistence: `getState` and
// `save` are wired to the sanctioned fs-json KV store (`crate::kv_get` /
// `crate::kv_set`, the same key both ways) so the channels actually round-trip
// real on-disk state instead of fabricating an LLM/IoT response. `present` would
// require creating and driving a live OS presentation window from the renderer —
// an explicitly out-of-scope "live OS window" case — so it degrades honestly.
// =============================================================================

use serde_json::{json, Value};

/// KV key for the Vinx presentation/editor state blob. This is the single source
/// of truth read by `getState` and written by `save` (same key both ways), the
/// fs-json store the task description names as `vinx-state.json`.
const STATE_KEY: &str = "vinx-state";

/// Current epoch milliseconds (timestamps convention used across the crate).
fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A well-formed empty Vinx state, returned when nothing has been saved yet.
/// Keys are minimal and self-describing (no Electron schema exists to mirror).
fn empty_state() -> Value {
    json!({
        "id": Value::Null,
        "slides": [],
        "current": 0,
        "updatedAt": 0u64,
    })
}

/// Route a `vinx:*` channel. Real persistence for `getState` / `save`; the napi
/// and live-window channels degrade honestly. Args arrive as the positional JSON
/// array the renderer would send (`args.get(0)` is the first argument).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // ── getState: read the persisted Vinx state blob from the fs-json KV
        //    store. Returns the stored object, or a well-formed empty default
        //    when nothing has been saved. Real on-disk read, no fabrication.
        "vinx:getState" => {
            let stored = crate::kv_get(app, STATE_KEY);
            if stored.is_object() {
                stored
            } else {
                empty_state()
            }
        }

        // ── save: persist the caller-supplied state object to the SAME KV key
        //    getState reads. Mints an `id` if absent, stamps `updatedAt`, writes
        //    via crate::kv_set (real fs-json write), then pushes a
        //    `vinx:state-changed` renderer event (webContents.send precedent).
        //    Returns { success, id, updatedAt } or { success:false, error }.
        "vinx:save" => {
            // Accept the new state as arg 0; merge onto any prior state so a
            // partial save does not clobber unrelated fields.
            let incoming = args.get(0).cloned().unwrap_or(Value::Null);
            if !incoming.is_object() {
                return json!({
                    "success": false,
                    "error": "save expects a state object as the first argument"
                });
            }

            let mut state = match crate::kv_get(app, STATE_KEY) {
                Value::Object(m) => Value::Object(m),
                _ => empty_state(),
            };

            // Merge incoming fields over the existing state.
            if let (Some(dst), Some(src)) = (state.as_object_mut(), incoming.as_object()) {
                for (k, v) in src {
                    dst.insert(k.clone(), v.clone());
                }
            }

            // Ensure id + updatedAt.
            let updated_at = now_ms();
            let id = {
                let obj = state.as_object_mut().expect("state is an object");
                let id = match obj.get("id") {
                    Some(Value::String(s)) if !s.is_empty() => s.clone(),
                    _ => crate::util::pseudo_uuid_v4(),
                };
                obj.insert("id".to_string(), Value::String(id.clone()));
                obj.insert(
                    "updatedAt".to_string(),
                    Value::Number(serde_json::Number::from(updated_at)),
                );
                id
            };

            let write = crate::kv_set(app, STATE_KEY, state.clone());
            let ok = write.get("success").and_then(Value::as_bool).unwrap_or(false);
            if !ok {
                let err = write
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("failed to persist vinx state")
                    .to_string();
                return json!({ "success": false, "error": err });
            }

            // Push the updated state to the renderer (Electron webContents.send).
            crate::native_ops::emit_event(app, "vinx:state-changed", &state);

            json!({ "success": true, "id": id, "updatedAt": updated_at })
        }

        // ── present: would create and drive a live OS presentation window from
        //    the renderer. Creating live OS windows is explicitly out of scope
        //    for a native port; do NOT fake it.
        "vinx:present" => json!({
            "success": false,
            "error": "not ported (needs native runtime)"
        }),

        // Everything else under `vinx:*` (e.g. the napi-backed import-media /
        // export-progress channels) has no no-dep native implementation here ->
        // honest null degrade, the crate's unknown-arm convention.
        _ => Value::Null,
    }
}
