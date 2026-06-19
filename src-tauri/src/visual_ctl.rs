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
//   - visual:getTheme -> ThemeConfig object (stored themeConfig, or defaults)
//
// HEAVY channels intentionally NOT ported (no native runtime side-effects faked):
//   - visual:setTheme  : mutates live theme + persists; live-apply side effect.
//   - visual:customize : interactive customization flow.
// Both return Value::Null via the prefix route (honest degrade); they are not
// implemented and not faked.
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

/// Route a `visual:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled here;
/// the ported data channel returns its shaped value, the skipped heavy channels
/// and any unknown channels return Value::Null (honest degrade) so prefix
/// routing of the whole `visual:` namespace to this dispatch is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "visual:getTheme" => get_theme(app),
        // visual:setTheme, visual:customize — heavy/side-effecting, not ported.
        _ => Value::Null,
    }
}
