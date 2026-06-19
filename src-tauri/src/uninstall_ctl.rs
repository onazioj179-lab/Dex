// =============================================================================
// DEX Tauri — Uninstall subsystem (port of the `uninstall:*` IPC handlers).
//
// PROMPT-vs-REALITY divergence (documented, important): the porting brief named
// the Electron source `src/main/core/Uninstaller.ts`, a data channel
// `uninstall:getStatus`, and a `datastore-kv:uninstall` storage key. NONE of
// those exist in this repo. The real `uninstall:` namespace is implemented in
// two places, neither KV-backed and neither exposing a `getStatus` channel:
//   - src/main/core/UninstallManager.ts   -> uninstall:get-plan / :execute /
//                                             :verify (all walk the user's data
//                                             directories on the host FS)
//   - src/main/core/CleanUninstallSystem.ts -> uninstall:footprint / :preview /
//                                             :execute / :exportUserData /
//                                             :listFiles / :config / :setConfig /
//                                             :trackFile / :openFootprintLocation
//
// The renderer reaches every one of these through the generic `uninstall:`
// prefix passthrough in preload.ts (line 1933) — there is no typed accessor and
// no persisted store of its own (CleanUninstallSystem keeps an in-memory
// `footprint.json` under userData; UninstallManager is fully stateless).
//
// WHAT IS PORTED (pure-data tier only): the single channel in the namespace that
// returns a deterministic in-memory object with no filesystem scan or mutation —
// `uninstall:config`, which Electron answers with the in-memory UninstallConfig.
// We reproduce its EXACT default shape (DEFAULT_CONFIG in CleanUninstallSystem),
// which is what a fresh process returns since the config is never persisted.
//
// WHAT IS SKIPPED (needs native runtime): every channel that scans or deletes
// host directories, shows OS dialogs, opens Explorer/Finder, or touches the
// Windows registry — get-plan, verify, footprint, preview, execute, cleanup,
// exportUserData, listFiles, setConfig, trackFile, openFootprintLocation. These
// are real host-FS / OS operations, not data CRUD, so they are intentionally not
// implemented and not faked. Unknown / skipped channels return Value::Null so
// the `uninstall:` prefix route degrades honestly.
//
// id/time helpers (per house rules): ids via crate::util::pseudo_uuid_v4(),
// timestamps via SystemTime epoch millis. (Neither is needed by the one ported
// channel, but the helpers are the mandated source if this file grows.)
// =============================================================================

use serde_json::{json, Value};

/// CleanUninstallSystem.DEFAULT_CONFIG — returned verbatim by `uninstall:config`
/// because the config is held in memory and never persisted, so a fresh runtime
/// always answers with these defaults. Field names/types match the TS exactly.
fn default_config() -> Value {
    json!({
        "trackNewFiles": true,
        "exportUserDataOnUninstall": true,
        "showConfirmationDialog": true,
        "removeRegistryEntries": true,
        "removeShortcuts": true,
        "secureDelete": false,
        "secureDeletePasses": 1,
    })
}

/// Route an `uninstall:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the pure-data `uninstall:config`
/// read is ported; every host-FS / OS channel returns Value::Null (honest
/// degrade — these need the native runtime and are not faked).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Pure-data: in-memory default config (CleanUninstallSystem.config).
        "uninstall:config" => default_config(),

        // Host-FS / OS channels — not ported, not faked. Null degrade.
        //   uninstall:get-plan, uninstall:verify          (UninstallManager FS scan)
        //   uninstall:footprint, uninstall:preview,        (CleanUninstallSystem FS scan)
        //   uninstall:listFiles, uninstall:setConfig,
        //   uninstall:trackFile, uninstall:exportUserData,
        //   uninstall:openFootprintLocation
        //   uninstall:execute, uninstall:cleanup           (destructive deletes / dialogs)
        _ => Value::Null,
    }
}
