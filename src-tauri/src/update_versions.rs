// =============================================================================
// DEX Platform — Software Update: earlier versions and rollback
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! `update:versions` lists the DEX releases published on GitHub that carry a
//! signed Windows installer. `update:installVersion` reinstalls one of them
//! (an earlier version = rollback): it downloads that release's installer and
//! its `.sig`, verifies the signature with the SAME minisign public key and
//! signed-version check the in-app updater uses, then hands off to the
//! installer in update mode (`/P /UPDATE /R`: passive, keep data, relaunch)
//! and exits. Nothing runs unless the signature checks out.
//!
//! Only this repository's release URLs are ever fetched; the version string is
//! validated before it becomes part of a URL.

use serde_json::{json, Value};
use std::io::Read;

const REPO: &str = "onazioj179-lab/Dex";
const MAX_INSTALLER: u64 = 512 * 1024 * 1024;

fn fail(msg: impl Into<String>) -> Value {
    json!({ "success": false, "error": msg.into() })
}

/// `7.0.3` style versions only (what release.yml tags as `v<version>`).
pub(crate) fn valid_version(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.len() <= 5 && p.bytes().all(|b| b.is_ascii_digit()))
}

pub(crate) fn installer_name(version: &str) -> String {
    format!("DEX_{version}_x64-setup.exe")
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(15))
        .timeout_read(std::time::Duration::from_secs(120))
        .user_agent("DEX-Software-Update")
        .build()
}

/// Release list entry: published, not a draft, with a signed installer.
pub(crate) fn parse_releases(body: &Value) -> Vec<Value> {
    let Some(list) = body.as_array() else { return vec![] };
    list.iter()
        .filter(|r| !r.get("draft").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|r| {
            let tag = r.get("tag_name")?.as_str()?;
            let version = tag.strip_prefix('v')?;
            if !valid_version(version) { return None; }
            let assets: Vec<&str> = r.get("assets")?.as_array()?.iter()
                .filter_map(|a| a.get("name").and_then(Value::as_str)).collect();
            let exe = installer_name(version);
            let sig = format!("{exe}.sig");
            if !assets.contains(&exe.as_str()) || !assets.contains(&sig.as_str()) { return None; }
            Some(json!({
                "version": version,
                "publishedAt": r.get("published_at").cloned().unwrap_or(Value::Null),
                "notes": r.get("body").and_then(Value::as_str).unwrap_or(""),
                "prerelease": r.get("prerelease").and_then(Value::as_bool).unwrap_or(false),
            }))
        })
        .collect()
}

fn list_versions() -> Value {
    if let Err(e) = crate::net_gate::check_internet() {
        return fail(&e);
    }
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=20");
    match agent().get(&url).set("Accept", "application/vnd.github+json").call() {
        Ok(resp) => match resp.into_string().ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
            Some(body) => json!({ "success": true, "versions": parse_releases(&body) }),
            None => fail("the release list could not be read"),
        },
        Err(ureq::Error::Status(code, _)) => fail(format!("GitHub answered {code}")),
        Err(_) => fail("DEX could not reach GitHub. Check your connection and try again."),
    }
}

fn base64_text(s: &str) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(s.trim()).map_err(|_| "bad base64".to_string())?;
    String::from_utf8(bytes).map_err(|_| "bad text".to_string())
}

/// Same checks as tauri-plugin-updater: minisign signature over the file, then
/// the version recorded in the signed trusted comment must be `version`.
pub(crate) fn verify(data: &[u8], sig_b64: &str, pubkey_b64: &str, version: &str) -> Result<(), String> {
    use minisign_verify::{PublicKey, Signature};
    let pk = PublicKey::decode(&base64_text(pubkey_b64)?).map_err(|_| "the update key is unreadable".to_string())?;
    let sig = Signature::decode(&base64_text(sig_b64)?).map_err(|_| "the signature is unreadable".to_string())?;
    pk.verify(data, &sig, true).map_err(|_| "the installer failed its signature check".to_string())?;
    let signed = sig.trusted_comment().split('\t').find_map(|f| f.strip_prefix("version:"));
    match signed {
        Some(v) if v.trim_start_matches('v') == version => Ok(()),
        Some(_) => Err("the signature belongs to a different version".into()),
        None => Err("the signature does not name its version".into()),
    }
}

fn updater_pubkey(app: &tauri::AppHandle) -> Option<String> {
    app.config().plugins.0.get("updater")?.get("pubkey")?.as_str().map(str::to_string)
}

fn download(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    crate::net_gate::check_url(url)?;
    let resp = agent().get(url).call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("GitHub answered {code}"),
        _ => "the download was interrupted".to_string(),
    })?;
    let mut bytes = Vec::new();
    resp.into_reader().take(limit + 1).read_to_end(&mut bytes).map_err(|_| "the download was interrupted".to_string())?;
    if bytes.len() as u64 > limit { return Err("the file is larger than expected".into()); }
    Ok(bytes)
}

fn install_version(app: &tauri::AppHandle, version: &str) -> Value {
    if !valid_version(version) { return fail("not a DEX version"); }
    let Some(pubkey) = updater_pubkey(app) else { return fail("this build has no update key") };
    let exe = installer_name(version);
    let base = format!("https://github.com/{REPO}/releases/download/v{version}/{exe}");
    let sig = match download(&format!("{base}.sig"), 16 * 1024) {
        Ok(b) => String::from_utf8_lossy(&b).to_string(),
        Err(e) => return fail(format!("Couldn't get the signature: {e}. Nothing was changed.")),
    };
    let data = match download(&base, MAX_INSTALLER) {
        Ok(b) => b,
        Err(e) => return fail(format!("Couldn't download DEX {version}: {e}. Nothing was changed.")),
    };
    if let Err(e) = verify(&data, &sig, &pubkey, version) {
        return fail(format!("DEX {version} was not installed: {e}. Your current version is unchanged."));
    }
    let dir = std::env::temp_dir().join("dex-update");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(&exe);
    if std::fs::write(&path, &data).is_err() {
        return fail("Couldn't save the installer. Free some disk space and try again.");
    }
    // Update mode keeps the install folder and your data; /R relaunches DEX.
    match std::process::Command::new(&path).args(["/P", "/UPDATE", "/R"]).spawn() {
        Ok(_) => {
            let handle = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(400));
                handle.exit(0);
            });
            json!({ "success": true, "version": version })
        }
        Err(_) => fail("The installer could not start. Your current version is unchanged."),
    }
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "update:versions" => list_versions(),
        "update:installVersion" => {
            let v = args.get(0).and_then(Value::as_str).unwrap_or("").trim().to_string();
            install_version(app, &v)
        }
        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_are_strict() {
        assert!(valid_version("7.0.3"));
        assert!(valid_version("10.12.0"));
        for bad in ["7.0", "7.0.3.1", "v7.0.3", "7.0.x", "7.0.3/../x", "", "7..3", "7.0.3 "] {
            assert!(!valid_version(bad), "{bad}");
        }
    }

    #[test]
    fn only_signed_installers_are_listed() {
        let body = json!([
            { "tag_name": "v7.0.4", "draft": false, "published_at": "2026-11-26T00:00:00Z", "body": "New",
              "assets": [{ "name": "DEX_7.0.4_x64-setup.exe" }, { "name": "DEX_7.0.4_x64-setup.exe.sig" }] },
            { "tag_name": "v7.0.3", "draft": false, "assets": [{ "name": "DEX_7.0.3_x64-setup.exe" }] },
            { "tag_name": "v7.0.2", "draft": true, "assets": [{ "name": "DEX_7.0.2_x64-setup.exe" }, { "name": "DEX_7.0.2_x64-setup.exe.sig" }] },
            { "tag_name": "magnify-v1.0.0", "draft": false, "assets": [] }
        ]);
        let out = parse_releases(&body);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["version"], "7.0.4");
        assert_eq!(out[0]["notes"], "New");
    }

    #[test]
    fn garbage_signatures_are_refused() {
        assert!(verify(b"x", "not-base64!", "also-not", "7.0.3").is_err());
    }

    /// Real-release check, run by hand: DEX_VERIFY_DIR holds a release's
    /// installer + .sig; the key comes from tauri.conf.json.
    #[test]
    #[ignore]
    fn verifies_a_real_release() {
        let dir = std::path::PathBuf::from(std::env::var("DEX_VERIFY_DIR").unwrap());
        let version = std::env::var("DEX_VERIFY_VERSION").unwrap();
        let conf: Value = serde_json::from_str(&std::fs::read_to_string("tauri.conf.json").unwrap()).unwrap();
        let key = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        let exe = installer_name(&version);
        let data = std::fs::read(dir.join(&exe)).unwrap();
        let sig = std::fs::read_to_string(dir.join(format!("{exe}.sig"))).unwrap();
        verify(&data, &sig, key, &version).expect("genuine release verifies");
        assert!(verify(&data, &sig, key, "7.0.2").is_err(), "wrong version refused");
        let mut tampered = data.clone();
        tampered[data.len() / 2] ^= 1;
        assert!(verify(&tampered, &sig, key, &version).is_err(), "tampered file refused");
    }
}
