// =============================================================================
// DEX Tauri — SSH subsystem (port of SshController.ts, Tier 5/42)
// Profile CRUD (<appData>/ssh-profiles.json), key listing/generation via the
// system ssh-keygen, and connect-command building. Return shapes match Electron.
// The embedded interactive session (PTY) is out of scope on both shells.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

fn profiles_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("ssh-profiles.json")
}
fn keys_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from(".")).join("ssh").join("keys");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_profiles(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(profiles_path(app)) {
        Ok(raw) => serde_json::from_str::<Vec<Value>>(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}
fn write_profiles(app: &tauri::AppHandle, list: &[Value]) -> bool {
    match serde_json::to_string_pretty(list) {
        Ok(s) => std::fs::write(profiles_path(app), s).is_ok(),
        Err(_) => false,
    }
}

/// True if the binary can be launched at all (exit code irrelevant).
fn binary_runs(cmd: &str, args: &[&str]) -> bool {
    match Command::new(cmd).args(args).output() {
        Ok(_) => true,
        Err(e) => e.kind() != std::io::ErrorKind::NotFound,
    }
}

fn safe_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

fn now_millis() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

fn ok(message: &str) -> Value { json!({ "success": true, "message": message }) }
fn fail(message: &str) -> Value { json!({ "success": false, "message": message }) }

fn list_keys(app: &tauri::AppHandle) -> Value {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(home) = app.path().home_dir() { dirs.push(home.join(".ssh")); }
    dirs.push(keys_dir(app));

    let mut keys: Vec<Value> = Vec::new();
    for dir in dirs {
        let entries = match std::fs::read_dir(&dir) { Ok(e) => e, Err(_) => continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("pub") { continue; }
            let full = path.to_string_lossy().to_string();
            let (mut ktype, mut fingerprint, mut comment) = (String::new(), String::new(), String::new());
            if let Ok(out) = Command::new("ssh-keygen").args(["-lf", &full]).output() {
                if out.status.success() {
                    // "256 SHA256:xxxx comment (ED25519)"
                    let line = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    let parts: Vec<&str> = line.split(' ').collect();
                    if parts.len() >= 2 { fingerprint = parts[1].to_string(); }
                    if let (Some(start), Some(end)) = (line.rfind('('), line.rfind(')')) {
                        if end > start { ktype = line[start + 1..end].to_string(); }
                    }
                    if parts.len() > 3 { comment = parts[2..parts.len() - 1].join(" "); }
                }
            }
            keys.push(json!({ "path": full, "type": ktype, "fingerprint": fingerprint, "comment": comment }));
        }
    }
    json!(keys)
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "ssh:check" => json!({
            "ssh": binary_runs("ssh", &["-V"]),
            "keygen": binary_runs("ssh-keygen", &["-l", "-f", "__dex_probe_nonexistent__"]),
        }),

        "ssh:listProfiles" => json!(read_profiles(app)),

        "ssh:saveProfile" => {
            let p = args.get(0).cloned().unwrap_or(Value::Null);
            let host = p.get("host").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let user = p.get("user").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            if host.is_empty() { return fail("Host is required"); }
            if user.is_empty() { return fail("User is required"); }
            let id = p.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from)
                .unwrap_or_else(|| format!("ssh_{}", now_millis()));
            let port = p.get("port").and_then(|v| v.as_u64()).filter(|n| *n > 0 && *n < 65536).unwrap_or(22);
            let name = p.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty())
                .map(|s| s.chars().take(120).collect::<String>())
                .unwrap_or_else(|| format!("{}@{}", user, host));
            let clean = json!({
                "id": id,
                "name": name,
                "host": host.chars().take(255).collect::<String>(),
                "user": user.chars().take(120).collect::<String>(),
                "port": port,
                "keyPath": p.get("keyPath").and_then(|v| v.as_str()),
                "lastConnected": p.get("lastConnected").cloned().unwrap_or(Value::Null),
            });
            let mut list = read_profiles(app);
            let cid = clean["id"].as_str().unwrap_or("");
            if let Some(idx) = list.iter().position(|x| x.get("id").and_then(|v| v.as_str()) == Some(cid)) {
                list[idx] = clean.clone();
            } else {
                list.push(clean.clone());
            }
            if write_profiles(app, &list) {
                json!({ "success": true, "message": "Saved", "profile": clean })
            } else {
                fail("Could not persist")
            }
        }

        "ssh:deleteProfile" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let list: Vec<Value> = read_profiles(app).into_iter()
                .filter(|x| x.get("id").and_then(|v| v.as_str()) != Some(id))
                .collect();
            if write_profiles(app, &list) { ok("Removed") } else { fail("Could not persist") }
        }

        "ssh:listKeys" => list_keys(app),

        "ssh:generateKey" => {
            let opts = args.get(0).cloned().unwrap_or(Value::Null);
            let ktype = if opts.get("type").and_then(|v| v.as_str()) == Some("rsa") { "rsa" } else { "ed25519" };
            let name = opts.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let name = if name.is_empty() { format!("dex_{}", ktype) } else { name };
            if !safe_name(&name) {
                return fail("Key name may only contain letters, digits, dot, dash, underscore");
            }
            let comment = opts.get("comment").and_then(|v| v.as_str())
                .map(|s| s.chars().take(200).collect::<String>())
                .unwrap_or_else(|| "dex".to_string());
            let target = keys_dir(app).join(&name);
            if target.exists() || target.with_extension("pub").exists() {
                return fail("A key with that name already exists");
            }
            let target_str = target.to_string_lossy().to_string();
            let mut a: Vec<&str> = vec!["-t", ktype, "-f", &target_str, "-N", "", "-C", &comment];
            if ktype == "rsa" { a.push("-b"); a.push("4096"); }
            match Command::new("ssh-keygen").args(&a).output() {
                Ok(o) if o.status.success() => json!({ "success": true, "message": format!("Generated {}", name), "path": format!("{}.pub", target_str) }),
                Ok(o) => fail(String::from_utf8_lossy(&o.stderr).trim()),
                Err(e) => fail(&e.to_string()),
            }
        }

        "ssh:connectCommand" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let mut list = read_profiles(app);
            let idx = match list.iter().position(|x| x.get("id").and_then(|v| v.as_str()) == Some(id)) {
                Some(i) => i,
                None => return json!({ "command": "", "message": "Profile not found" }),
            };
            let p = &list[idx];
            let user = p.get("user").and_then(|v| v.as_str()).unwrap_or("");
            let host = p.get("host").and_then(|v| v.as_str()).unwrap_or("");
            let port = p.get("port").and_then(|v| v.as_u64()).unwrap_or(22);
            let mut parts: Vec<String> = vec!["ssh".to_string()];
            if let Some(key) = p.get("keyPath").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                parts.push("-i".to_string());
                parts.push(format!("\"{}\"", key));
            }
            if port != 22 { parts.push("-p".to_string()); parts.push(port.to_string()); }
            parts.push(format!("{}@{}", user, host));
            // stamp last-connected
            list[idx]["lastConnected"] = json!(now_millis() as u64);
            let _ = write_profiles(app, &list);
            json!({ "command": parts.join(" "), "message": "" })
        }

        _ => Value::Null,
    }
}
