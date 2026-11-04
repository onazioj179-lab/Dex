// =============================================================================
// DEX Tauri — App Store data surface (port of the read-only `store:*` IPC
// handlers in src/main/services/AppStoreService.ts).
//
// Pure-data, JSON-file tier. Despite the porting brief naming the source as
// "src/main/store/Store.ts" with an "electron-store:app" backing, the actual
// `store:` namespace in this repo is the App Store / installer service, and it
// does NOT use electron-store: it persists raw JSON files via std `fs` under
// <userData>/store/. We mirror that EXACTLY under <appData>/store/:
//   - catalog.json   : CatalogEntry[]   (the storefront catalog)
//   - installed.json : InstalledApp[]   (locally installed apps)
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged (getCatalog/getInstalled each return a shallow copy of the array).
//
// Channels ported (the brief's "list" + "get" map onto the two read-only data
// channels of this subsystem):
//   - store:list      -> CatalogEntry[]   (getCatalog)
//   - store:installed -> InstalledApp[]   (getInstalled)   [the "get" surface]
//
// DIVERGENCES (documented):
//   - Storage backend: brief said electron-store key "app"; the real subsystem
//     uses fs-json files (catalog.json / installed.json). We reproduce the real
//     files and relative path (store/<name>.json) under app_data_dir, not an
//     electron-store wrapper. There is no top-level key wrapper — both files are
//     bare JSON arrays, exactly as AppStoreService writes them.
//   - Bundled-catalog fallback: Electron's loadCatalog() falls back to a
//     ship-with-the-app default (assets/config/dex-store-catalog.json, resolved
//     via __dirname / process.resourcesPath) when catalog.json is missing or
//     empty. Resolving Tauri's bundled-resource dir is out of scope for this
//     data module (it would need resource-dir / capabilities wiring), so on a
//     missing/empty/non-array catalog we honestly return [] rather than fake a
//     catalog. The renderer already treats an empty catalog as a valid state.
//   - In-process caches (catalogCache / installedCache) are a single-process
//     Electron optimization with no observable effect on the returned value;
//     each dispatch reads the file fresh. The data the renderer receives is
//     identical.
//
// Heavy channels NOW ported here, the safe native subset:
//   - store:plan(id)             -> PlanResult | null   (pure planInstall port)
//   - store:app:capabilities(id) -> CapabilityExplanation[] (pure mapping)
//   - store:uninstall(id)        -> boolean (fs-only removal + scoped cleanup)
//
// Honest degrades (return { success:false, error:"not ported (needs native
// runtime)" }) — these need an Ed25519 verify primitive against the trust
// store + publisher registry (NOT reachable with the allowed deps; only sha256
// exists) or a native OS file dialog, and the validation gate is fail-closed by
// contract so a pass must never be faked:
//   - store:install              (verify-signatures step is unsatisfiable)
//   - store:local:validate / :validateFile (signature/publisher block checks)
//   - store:local:install / :installEnvelope (require gate == approved)
//   - store:local:pick           (native file-open dialog)
//
// NOTE on routing: main.rs currently routes only `store:list | store:installed`
// to this dispatch. The arms below are implemented so that when the prefix
// routing is widened for the new channels they behave correctly; this module is
// edited in isolation per the task contract (main.rs is owned elsewhere).
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;

const CATALOG_FILE: &str = "catalog.json";
const INSTALLED_FILE: &str = "installed.json";

/// Honest degrade payload for object-returning channels whose Electron behaviour
/// genuinely needs a native runtime we cannot stand up with the allowed deps
/// (Ed25519 signature verification + trust-store/publisher resolution, or a
/// native OS file-open dialog). Faking a pass here would be a security hole —
/// the gate is fail-closed by design — so we surface the inability honestly.
fn not_ported() -> Value {
    json!({ "success": false, "error": "not ported (needs native runtime)" })
}

// <appData>/store/<name> — mirrors STORE_DIR() = userData/store in Electron.
fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("store");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// Read a bare JSON array file; any read/parse failure or non-array yields [].
fn read_array(app: &tauri::AppHandle, name: &str) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(Value::Array(a)) => a,
            _ => Vec::new(),
        },
        Err(_) => Vec::new(),
    }
}

// getCatalog() -> CatalogEntry[]. See the bundled-fallback divergence above: an
// absent/empty/non-array catalog returns [] (no bundled-resource resolution).
fn get_catalog(app: &tauri::AppHandle) -> Vec<Value> {
    read_array(app, CATALOG_FILE)
}

// getInstalled() -> InstalledApp[].
fn get_installed(app: &tauri::AppHandle) -> Vec<Value> {
    read_array(app, INSTALLED_FILE)
}

// Write a bare JSON array back to <appData>/store/<name> (2-space pretty, the
// same format AppStoreService.persistInstalled used). Best-effort: a write
// failure is swallowed exactly as the Electron `log.warn` path did.
fn write_array(app: &tauri::AppHandle, name: &str, arr: &[Value]) {
    if let Ok(raw) = serde_json::to_string_pretty(&Value::Array(arr.to_vec())) {
        let _ = std::fs::write(store_path(app, name), raw);
    }
}

// ---------------------------------------------------------------------------
// Pure planner port (src/shared/dexpkg/manifestV2.ts + src/shared/store/catalog.ts).
// Reproduces planInstall() exactly: same step kinds, same pathway labels, same
// `{ ok:false, reason }` shape. No I/O beyond reading installed.json for context.
// ---------------------------------------------------------------------------

// Host runtime version reported to the planner: the version of this build
// (Cargo.toml, kept in step with package.json and tauri.conf.json), so a
// package's minRuntime is checked against what is actually installed.
const HOST_RUNTIME: &str = env!("CARGO_PKG_VERSION");

fn semver_parts(v: &str) -> [i64; 3] {
    let mut out = [0i64; 3];
    for (i, seg) in v.split('.').take(3).enumerate() {
        // parseInt(seg, 10) semantics: leading digits only, NaN -> 0.
        let digits: String = seg.chars().take_while(|c| c.is_ascii_digit()).collect();
        out[i] = digits.parse::<i64>().unwrap_or(0);
    }
    out
}

// semverCompare(a, b): -1 / 0 / 1 over the first three numeric components.
fn semver_compare(a: &str, b: &str) -> i32 {
    let pa = semver_parts(a);
    let pb = semver_parts(b);
    for i in 0..3 {
        if pa[i] != pb[i] {
            return if pa[i] < pb[i] { -1 } else { 1 };
        }
    }
    0
}

// satisfiesRange(version, range): the minimal ^ / ~ / exact subset the TS uses.
fn satisfies_range(version: &str, range: &str) -> bool {
    let r = range.trim();
    if let Some(base) = r.strip_prefix('^') {
        if semver_compare(version, base) < 0 {
            return false;
        }
        let major = base.split('.').next().unwrap_or("");
        return version.split('.').next().unwrap_or("") == major;
    }
    if let Some(base) = r.strip_prefix('~') {
        if semver_compare(version, base) < 0 {
            return false;
        }
        let mut bp = base.split('.');
        let (maj, min) = (bp.next().unwrap_or(""), bp.next().unwrap_or(""));
        let mut vp = version.split('.');
        let (vm, vn) = (vp.next().unwrap_or(""), vp.next().unwrap_or(""));
        return vm == maj && vn == min;
    }
    version == r
}

const HEX64: &str = "0123456789abcdef";

fn is_hex_len(s: &str, len: usize) -> bool {
    s.len() == len && s.chars().all(|c| HEX64.contains(c))
}

fn is_semver(s: &str) -> bool {
    // ^\d+\.\d+\.\d+(-...)?(+...)? — the SEMVER regex in manifestV2.ts.
    let core = s.split(['-', '+']).next().unwrap_or("");
    let parts: Vec<&str> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
}

fn is_revdns(s: &str) -> bool {
    // ^[a-z0-9-]+(\.[a-z0-9-]+)+$ — at least one dot, each label non-empty.
    let labels: Vec<&str> = s.split('.').collect();
    labels.len() >= 2
        && labels
            .iter()
            .all(|l| !l.is_empty() && l.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'))
}

// validateManifestV2(m) -> issue strings (empty = valid). Port of the TS, in the
// same order so the planner surfaces an identical first-issue reason.
fn validate_manifest_v2(m: &Value) -> Vec<String> {
    let mut issues: Vec<String> = Vec::new();
    let x = match m.as_object() {
        Some(o) => o,
        None => return vec!["manifest is not an object".into()],
    };
    if x.get("formatVersion").and_then(|v| v.as_i64()) != Some(2) {
        issues.push("formatVersion must be 2".into());
    }
    match x.get("packageId").and_then(|v| v.as_str()) {
        Some(s) if is_revdns(s) => {}
        _ => issues.push("packageId must be reverse-DNS".into()),
    }
    match x.get("packageVersion").and_then(|v| v.as_str()) {
        Some(s) if is_semver(s) => {}
        _ => issues.push("packageVersion must be semver".into()),
    }
    match x.get("minRuntime").and_then(|v| v.as_str()) {
        Some(s) if is_semver(s) => {}
        _ => issues.push("minRuntime must be semver".into()),
    }
    for (key, label) in [
        ("capabilities", "capabilities must be array"),
        ("dependencies", "dependencies must be array"),
        ("signatures", "signatures must be array"),
        ("deltas", "deltas must be array"),
        ("categories", "categories must be array"),
    ] {
        if !x.get(key).map(|v| v.is_array()).unwrap_or(false) {
            issues.push(label.into());
        }
    }
    if let Some(sigs) = x.get("signatures").and_then(|v| v.as_array()) {
        for s in sigs {
            let pk = s.get("publicKey").and_then(|v| v.as_str()).unwrap_or("");
            let sg = s.get("signature").and_then(|v| v.as_str()).unwrap_or("");
            if !is_hex_len(pk, 64) {
                issues.push("signature.publicKey must be 64 hex".into());
            }
            if !is_hex_len(sg, 128) {
                issues.push("signature.signature must be 128 hex".into());
            }
        }
    }
    if let Some(deltas) = x.get("deltas").and_then(|v| v.as_array()) {
        for d in deltas {
            let ps = d.get("payloadSha256").and_then(|v| v.as_str()).unwrap_or("");
            let fv = d.get("fromVersion").and_then(|v| v.as_str()).unwrap_or("");
            if !is_hex_len(ps, 64) {
                issues.push("delta.payloadSha256 must be 64 hex".into());
            }
            if !is_semver(fv) {
                issues.push("delta.fromVersion must be semver".into());
            }
        }
    }
    issues
}

fn mstr<'a>(m: &'a Value, key: &str) -> &'a str {
    m.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

// planInstall(entry, ctx) -> PlanResult. Mirrors catalog.ts step-for-step.
fn plan_install(app: &tauri::AppHandle, entry: &Value) -> Value {
    let manifest = entry.get("manifest").cloned().unwrap_or(Value::Null);
    let issues = validate_manifest_v2(&manifest);
    if let Some(first) = issues.first() {
        return json!({ "ok": false, "reason": format!("manifest invalid: {first}") });
    }

    let min_runtime = mstr(&manifest, "minRuntime");
    if semver_compare(HOST_RUNTIME, min_runtime) < 0 {
        return json!({ "ok": false, "reason": format!("host {HOST_RUNTIME} < required {min_runtime}") });
    }

    let installed = get_installed(app);
    let pkg_id = mstr(&manifest, "packageId");
    let pkg_ver = mstr(&manifest, "packageVersion");

    // Dependency check (skip optional; missing OR out-of-range counts).
    let mut missing: Vec<Value> = Vec::new();
    if let Some(deps) = manifest.get("dependencies").and_then(|v| v.as_array()) {
        for d in deps {
            if d.get("optional").and_then(|v| v.as_bool()).unwrap_or(false) {
                continue;
            }
            let id = mstr(d, "id");
            let range = mstr(d, "range");
            let inst = installed
                .iter()
                .find(|i| mstr(i, "packageId") == id);
            let satisfied = inst
                .map(|i| satisfies_range(mstr(i, "version"), range))
                .unwrap_or(false);
            if !satisfied {
                missing.push(json!({ "id": id, "range": range }));
            }
        }
    }

    let existing = installed.iter().find(|i| mstr(i, "packageId") == pkg_id);

    let mut steps: Vec<Value> = vec![json!({ "kind": "verify-host", "minRuntime": min_runtime })];
    if !missing.is_empty() {
        steps.push(json!({ "kind": "verify-deps", "deps": missing }));
    }

    let mut pathway = "fresh";
    let empty: Vec<Value> = Vec::new();
    let deltas = manifest.get("deltas").and_then(|v| v.as_array()).unwrap_or(&empty);
    let delta_urls = entry.get("deltaUrls").and_then(|v| v.as_array());

    if let Some(ex) = existing {
        let ex_ver = mstr(ex, "version");
        if semver_compare(ex_ver, pkg_ver) >= 0 {
            return json!({ "ok": true, "steps": [], "pathway": "skip" });
        }
        // Prefer a delta whose fromVersion matches the installed version AND has
        // a download URL at the same index in deltaUrls.
        let delta_idx = deltas.iter().position(|d| mstr(d, "fromVersion") == ex_ver);
        let delta_url = delta_idx
            .and_then(|i| delta_urls.and_then(|u| u.get(i)))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());
        if let (Some(i), Some(url)) = (delta_idx, delta_url) {
            let delta = &deltas[i];
            pathway = "delta";
            steps.push(json!({ "kind": "snapshot-existing", "packageId": pkg_id }));
            steps.push(json!({
                "kind": "download",
                "url": url,
                "bytes": delta.get("bytes").cloned().unwrap_or(json!(0)),
                "sha256": mstr(delta, "payloadSha256"),
            }));
            steps.push(json!({
                "kind": "apply-delta",
                "from": mstr(delta, "fromVersion"),
                "payloadSha256": mstr(delta, "payloadSha256"),
            }));
        } else {
            pathway = "full-update";
            steps.push(json!({ "kind": "snapshot-existing", "packageId": pkg_id }));
            steps.push(json!({
                "kind": "download",
                "url": mstr(entry, "bundleUrl"),
                "bytes": entry.get("bundleBytes").cloned().unwrap_or(json!(0)),
                "sha256": mstr(entry, "bundleSha256"),
            }));
        }
    } else {
        steps.push(json!({
            "kind": "download",
            "url": mstr(entry, "bundleUrl"),
            "bytes": entry.get("bundleBytes").cloned().unwrap_or(json!(0)),
            "sha256": mstr(entry, "bundleSha256"),
        }));
    }

    // Capabilities not yet granted by the existing install.
    let granted: Vec<&str> = existing
        .and_then(|e| e.get("grantedCaps"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|c| c.as_str()).collect())
        .unwrap_or_default();
    let mut new_caps: Vec<Value> = Vec::new();
    if let Some(caps) = manifest.get("capabilities").and_then(|v| v.as_array()) {
        for c in caps {
            if let Some(cs) = c.as_str() {
                if !granted.contains(&cs) {
                    new_caps.push(json!(cs));
                }
            }
        }
    }
    if !new_caps.is_empty() {
        steps.push(json!({ "kind": "request-caps", "caps": new_caps }));
    }

    steps.push(json!({ "kind": "verify-signatures", "required": 1 }));
    steps.push(json!({
        "kind": "unpack",
        "targetDir": format!("apps/{pkg_id}/{pkg_ver}"),
    }));
    steps.push(json!({ "kind": "register", "packageId": pkg_id, "version": pkg_ver }));
    steps.push(json!({ "kind": "rollback-on-fail", "packageId": pkg_id }));

    json!({ "ok": true, "steps": steps, "pathway": pathway })
}

// store:plan(id) -> PlanResult | null. Null when the catalog has no such entry.
fn plan(app: &tauri::AppHandle, package_id: &str) -> Value {
    match get_catalog(app)
        .into_iter()
        .find(|e| mstr(&e.get("manifest").cloned().unwrap_or(Value::Null), "packageId") == package_id)
    {
        Some(entry) => plan_install(app, &entry),
        None => Value::Null,
    }
}

// ---------------------------------------------------------------------------
// Capability awareness port (src/shared/store/capabilityExplain.ts).
// ---------------------------------------------------------------------------

// (title, detail, sensitive) keyed by capability id, identical to the TS CATALOG.
fn explain_one(cap: &str) -> Value {
    let (title, detail, sensitive): (&str, &str, bool) = match cap {
        "files.read" => ("Read files you choose", "Open and read files you explicitly pick.", true),
        "files.write" => ("Save and change files", "Write or modify files you choose.", true),
        "network" => ("Access the internet", "Connect to remote servers to send and receive data.", true),
        "network.local" => ("Access your local network", "Connect to devices on your local network.", true),
        "clipboard" => ("Use the clipboard", "Read and write copied content.", true),
        "capture" => ("Record your screen", "Capture screenshots or screen video.", true),
        "audio.in" => ("Use your microphone", "Record audio input.", true),
        "autostart" => ("Start automatically", "Launch when DEX starts.", true),
        "audio.out" => ("Play audio", "Output sound to your speakers.", false),
        "gpu" => ("Use the GPU", "Hardware-accelerated graphics.", false),
        "gpu.compute" => ("Run GPU compute", "Use the GPU for computation.", false),
        "storage" => ("Store its own data", "Keep local data for this app.", false),
        "notify" => ("Send notifications", "Show desktop notifications.", false),
        "background" => ("Run in the background", "Keep working when not in focus.", false),
        // Unknown cap: title == id, generic detail, not sensitive (TS fallback).
        _ => {
            return json!({
                "capability": cap,
                "title": cap,
                "detail": format!("Capability: {cap}"),
                "sensitive": false,
            });
        }
    };
    json!({ "capability": cap, "title": title, "detail": detail, "sensitive": sensitive })
}

// store:app:capabilities(id) -> CapabilityExplanation[]. De-duplicated, in order.
fn app_capabilities(app: &tauri::AppHandle, package_id: &str) -> Value {
    let entry = get_catalog(app)
        .into_iter()
        .find(|e| mstr(&e.get("manifest").cloned().unwrap_or(Value::Null), "packageId") == package_id);
    let caps: Vec<String> = entry
        .as_ref()
        .and_then(|e| e.get("manifest"))
        .and_then(|m| m.get("capabilities"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|c| c.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let mut seen: Vec<String> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    for c in caps {
        if seen.contains(&c) {
            continue;
        }
        seen.push(c.clone());
        out.push(explain_one(&c));
    }
    Value::Array(out)
}

// ---------------------------------------------------------------------------
// Uninstall port (AppStoreService.uninstall). Drops the installed record,
// deletes the unpacked app dir (strictly scoped to store/apps/<id>), and removes
// a leftover synthetic local catalog entry. fs-only, no network/crypto.
// ---------------------------------------------------------------------------
fn uninstall(app: &tauri::AppHandle, package_id: &str) -> Value {
    let mut installed = get_installed(app);
    let before = installed.len();
    installed.retain(|a| mstr(a, "packageId") != package_id);
    if installed.len() == before {
        return json!(false); // not installed
    }
    write_array(app, INSTALLED_FILE, &installed);

    // Delete the unpacked files, scoped strictly under store/apps so a malformed
    // id can never escape the store dir (mirrors the TS containment check). The
    // id is attacker-influenced, so reject anything with a path separator, a
    // parent-dir token, or a drive/root prefix BEFORE building any path — the
    // load-bearing containment guard.
    let id_safe = !package_id.is_empty()
        && !package_id.contains('/')
        && !package_id.contains('\\')
        && !package_id.contains('\0')
        && package_id != "."
        && package_id != ".."
        && !package_id.contains("..");
    if id_safe {
        let app_dir = app
            .dex_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("store")
            .join("apps")
            .join(package_id);
        if app_dir.exists() {
            let _ = std::fs::remove_dir_all(&app_dir);
        }
    }

    // A local developer sideload has only a synthetic catalog entry (no remote
    // bundle to re-download). The TS reverts to the bundled (coming-soon) tile if
    // one exists, else drops the synthetic entry. Bundled-resource resolution is
    // out of scope for this data module (see the file header divergence note), so
    // we drop the synthetic local entry — the storefront default is restored on
    // next catalog refresh from the bundled fallback path the renderer owns.
    let catalog = get_catalog(app);
    let is_local = catalog
        .iter()
        .find(|e| mstr(&e.get("manifest").cloned().unwrap_or(Value::Null), "packageId") == package_id)
        .and_then(|e| e.get("local"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if is_local {
        let mut next = catalog;
        next.retain(|e| {
            mstr(&e.get("manifest").cloned().unwrap_or(Value::Null), "packageId") != package_id
        });
        write_array(app, CATALOG_FILE, &next);
    }

    json!(true)
}

/// Route a `store:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the two read-only data channels are handled;
/// every other `store:*` channel (the heavy installer / local-dev / publisher /
/// review surfaces) returns Value::Null so the caller degrades honestly rather
/// than receiving a faked result.
///
/// NOTE: the `store:` prefix is shared by other subsystems (store:publisher:*,
/// store:publish:*, store:review:*), so this dispatch must NOT own the whole
/// prefix — route the exact channels below to it, not `channel.starts_with`.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "store:list" => Value::Array(get_catalog(app)),
        "store:installed" => Value::Array(get_installed(app)),

        // --- Native-feasible heavy channels (no crypto/network needed) -------
        // store:plan(id) -> PlanResult | null. Pure planner port.
        "store:plan" => match args.get(0).and_then(|v| v.as_str()) {
            Some(id) => plan(app, id),
            None => Value::Null,
        },
        // store:app:capabilities(id) -> CapabilityExplanation[]. Pure mapping.
        "store:app:capabilities" => match args.get(0).and_then(|v| v.as_str()) {
            Some(id) => app_capabilities(app, id),
            None => Value::Array(Vec::new()),
        },
        // store:uninstall(id) -> boolean. fs-only removal + scoped cleanup.
        "store:uninstall" => match args.get(0).and_then(|v| v.as_str()) {
            Some(id) => uninstall(app, id),
            None => json!(false),
        },

        // --- Honest degrades: genuinely need a native runtime ----------------
        // The remote install pipeline's verify-signatures step and the local
        // gate's signature/publisher checks require Ed25519 verification against
        // the trust store + publisher registry. No Ed25519 primitive is reachable
        // with the allowed deps (serde_json/std/tauri/sysinfo/ureq/flate2 — only
        // sha256 exists), and the gate is fail-closed by contract, so we MUST NOT
        // fake a pass. HTTP download + sha256 integrity are implementable, but an
        // install that can never clear verify-signatures would always throw
        // 'signature-failed' — so the whole channel degrades honestly.
        "store:install" => not_ported(),
        // Local developer sideload: validateEnvelope() depends on the same
        // Ed25519 signature gate + publisher resolution; installLocalEnvelope /
        // installLocalFile require canLocallyInstall() == approved, which is
        // unreachable without it. validateFile/validate would always report a
        // signature-block failure, misrepresenting the gate, so degrade.
        "store:local:validate"
        | "store:local:validateFile"
        | "store:local:install"
        | "store:local:installEnvelope" => not_ported(),
        // store:local:pick opens a native OS file-open dialog (Electron
        // dialog.showOpenDialog). That needs the Tauri dialog plugin + capability
        // wiring, which is out of this data module's scope.
        "store:local:pick" => not_ported(),

        _ => Value::Null,
    }
}
