// =============================================================================
// DEX Tauri — Visual subsystem (data/CRUD surface of the `visual:*` namespace).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs — reached via crate::kv_get / crate::kv_set against dex-kv.json).
//
// SOURCE NOTE (important divergence): the task named the Electron source
// `src/main/core/VisualSystem.ts` with channel `visual:getTheme` and storage
// `datastore-kv:visual`. No such file, channel, or KV key exists in this repo.
// The repo's REAL visual/theme data surface is the `theme:*` namespace already
// ported in main.rs, which is DataStore-KV backed under the key "themeConfig"
// (THEME_KEY in main.rs; default shape from THEME_DEFAULTS in
// src/main/utils/constants.ts). To stay faithful to the actual backing store
// rather than invent a parallel one, `visual:getTheme` here reads that SAME
// "themeConfig" key and returns the SAME shape main.rs's theme:getConfig does:
//   { mode, accentColor, fontScale, reducedMotion, density }
// falling back to the documented defaults when unset. This keeps a single source
// of truth for theme state across both namespaces.
//
// Channels & shapes:
//   - visual:getTheme  -> ThemeConfig object (stored themeConfig, or defaults)
//   - visual:setTheme  -> persists a full ThemeConfig and live-applies it
//   - visual:customize -> merges a partial customization into the stored config
//
// HEAVY channels — now ported with REAL native side-effects (KV write + renderer
// push), not faked:
//   - visual:setTheme  : merges the supplied config onto the stored themeConfig,
//     persists it via kv_set, and pushes a `theme:changed` renderer event so the
//     live UI re-applies tokens (parity with ThemeSystem.notifyRenderers /
//     main.ts `webContents.send('theme:changed', cfg)`). Returns { success: true }.
//   - visual:customize : same store, but applies ONLY the provided fields
//     (partial merge — accentColor / mode / fontScale / reducedMotion / density),
//     persists, pushes `theme:changed`, and returns the resulting full config.
// Both operate on the SAME "themeConfig" KV key as theme:* in main.rs, keeping a
// single source of truth across the theme and visual namespaces.
//
// DIVERGENCES (documented):
//   - Channel/source mapping: see SOURCE NOTE above. `visual:getTheme` is mapped
//     onto the existing themeConfig KV key (the real store) because the named
//     VisualSystem.ts/datastore-kv:visual did not exist. No new key is created.
//   - Defaults mirror theme_defaults() in main.rs exactly so getTheme is
//     consistent whether reached via theme:getConfig or visual:getTheme.
// =============================================================================

use serde_json::{json, Value};

// Same key main.rs uses for the canonical theme config (THEME_KEY). The visual
// namespace reads the real store rather than a separate "visual" key.
const THEME_KEY: &str = "themeConfig";

/// Default theme config — mirrors theme_defaults() in main.rs / THEME_DEFAULTS
/// in src/main/utils/constants.ts.
fn theme_defaults() -> Value {
    json!({
        "mode": "dark",
        "accentColor": "#6366f1",
        "fontScale": 1,
        "reducedMotion": false,
        "density": "comfortable",
    })
}

// visual:getTheme — return the stored theme config, or the documented defaults
// if nothing has been persisted yet (matches main.rs theme_config()).
fn get_theme(app: &tauri::AppHandle) -> Value {
    let v = crate::kv_get(app, THEME_KEY);
    if v.is_object() {
        v
    } else {
        theme_defaults()
    }
}

/// Allow-list of recognized theme-config fields. Anything outside this set is
/// ignored so callers cannot inject arbitrary keys into the canonical store.
const THEME_FIELDS: [&str; 5] = [
    "mode",
    "accentColor",
    "fontScale",
    "reducedMotion",
    "density",
];

/// Merge the recognized fields of `incoming` onto the currently stored config
/// (or the defaults if nothing is stored yet), persist the result under
/// THEME_KEY, push a `theme:changed` renderer event for live re-apply, and
/// return the resulting full config. Shared by setTheme and customize.
fn apply_theme(app: &tauri::AppHandle, incoming: &Value) -> Value {
    // Start from the stored config, falling back to the documented defaults so
    // a partial customize never drops fields the renderer relies on.
    let mut map = match crate::kv_get(app, THEME_KEY) {
        Value::Object(m) => m,
        _ => theme_defaults()
            .as_object()
            .cloned()
            .unwrap_or_default(),
    };

    if let Some(obj) = incoming.as_object() {
        for field in THEME_FIELDS.iter() {
            if let Some(val) = obj.get(*field) {
                map.insert((*field).to_string(), val.clone());
            }
        }
    }

    let merged = Value::Object(map);
    let _ = crate::kv_set(app, THEME_KEY, merged.clone());

    // Live-apply parity with ThemeSystem.notifyRenderers /
    // main.ts `webContents.send('theme:changed', cfg)`.
    crate::native_ops::emit_event(app, "theme:changed", &merged);

    merged
}

/// Route a `visual:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled here;
/// the ported data channel returns its shaped value, the skipped heavy channels
/// and any unknown channels return Value::Null (honest degrade) so prefix
/// routing of the whole `visual:` namespace to this dispatch is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "visual:getTheme" => get_theme(app),
        // visual:setTheme — persist a full config and live-apply it. The renderer
        // sends the new ThemeConfig as the first positional arg. We merge it onto
        // the existing store (so unspecified fields are preserved), push
        // `theme:changed`, and report success like the Electron handler.
        "visual:setTheme" => {
            let incoming = args.get(0).cloned().unwrap_or(Value::Null);
            let _ = apply_theme(app, &incoming);
            json!({ "success": true })
        }
        // visual:customize — partial merge of the supplied fields into the stored
        // config; returns the resulting full config so the caller can reflect it.
        "visual:customize" => {
            let incoming = args.get(0).cloned().unwrap_or(Value::Null);
            apply_theme(app, &incoming)
        }
        // Unknown channels in the namespace: honest degrade.
        _ => Value::Null,
    }
}
