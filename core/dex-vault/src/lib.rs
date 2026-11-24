// =============================================================================
// DEX 6.0 — Native Vault (GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Encrypted password manager + TOTP authenticator. The vault file holds an
//! AES-256-GCM `Envelope`; the master key is derived (Argon2id) on unlock and
//! kept only in memory. Credentials/authenticators are stored as flexible JSON
//! objects (each gets an injected `id`) so the manager is agnostic to the exact
//! renderer schema.

pub mod crypto;
pub mod password;
pub mod totp;

use crypto::Envelope;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default)]
pub struct VaultData {
    #[serde(default)]
    pub credentials: Vec<Value>,
    #[serde(default)]
    pub authenticators: Vec<Value>,
    #[serde(default)]
    pub settings: Value,
}

pub struct VaultManager {
    path: PathBuf,
    salt: Vec<u8>,
    key: Option<[u8; 32]>,
    data: VaultData,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn new_id() -> String {
    hex(&crypto::random_bytes(12))
}

fn id_of(v: &Value) -> Option<&str> {
    v.get("id").and_then(|x| x.as_str())
}

impl VaultManager {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            salt: Vec::new(),
            key: None,
            data: VaultData::default(),
        }
    }

    pub fn exists(&self) -> bool {
        self.path.exists()
    }

    pub fn is_unlocked(&self) -> bool {
        self.key.is_some()
    }

    /// {exists, unlocked, credentialCount, authenticatorCount}
    pub fn state(&self) -> Value {
        json!({
            "exists": self.exists(),
            "unlocked": self.is_unlocked(),
            "credentialCount": self.data.credentials.len(),
            "authenticatorCount": self.data.authenticators.len(),
        })
    }

    pub fn create(&mut self, master: &str) -> Result<(), String> {
        if self.exists() {
            return Err("vault already exists".into());
        }
        if master.is_empty() {
            return Err("master password required".into());
        }
        let salt = crypto::random_bytes(16);
        self.key = Some(crypto::derive_key(master, &salt)?);
        self.salt = salt;
        self.data = VaultData::default();
        self.save()
    }

    pub fn unlock(&mut self, master: &str) -> Result<(), String> {
        let raw = std::fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
        let env: Envelope = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let plain = crypto::decrypt(master, &env)?;
        self.data = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
        self.salt = crypto::b64_decode(&env.salt)?;
        self.key = Some(crypto::derive_key(master, &self.salt)?);
        Ok(())
    }

    pub fn lock(&mut self) {
        self.key = None;
        self.data = VaultData::default();
    }

    fn require_unlocked(&self) -> Result<&[u8; 32], String> {
        self.key
            .as_ref()
            .ok_or_else(|| "vault is locked".to_string())
    }

    fn save(&self) -> Result<(), String> {
        let key = self.require_unlocked()?;
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let plain = serde_json::to_vec(&self.data).map_err(|e| e.to_string())?;
        let env = crypto::encrypt(key, &self.salt, &plain)?;
        let serialized = serde_json::to_string(&env).map_err(|e| e.to_string())?;
        std::fs::write(&self.path, serialized).map_err(|e| e.to_string())
    }

    // --- Credentials -------------------------------------------------------

    pub fn credentials(&self) -> Value {
        json!(self.data.credentials)
    }

    pub fn credential(&self, id: &str) -> Value {
        self.data
            .credentials
            .iter()
            .find(|c| id_of(c) == Some(id))
            .cloned()
            .unwrap_or(Value::Null)
    }

    pub fn add_credential(&mut self, mut cred: Value) -> Result<Value, String> {
        if !cred.is_object() {
            return Err("credential must be an object".into());
        }
        cred["id"] = json!(new_id());
        self.data.credentials.push(cred.clone());
        self.save()?;
        Ok(cred)
    }

    pub fn update_credential(&mut self, id: &str, updates: &Value) -> Result<bool, String> {
        let found = merge_into(&mut self.data.credentials, id, updates);
        if found {
            self.save()?;
        }
        Ok(found)
    }

    pub fn delete_credential(&mut self, id: &str) -> Result<bool, String> {
        let removed = remove_by_id(&mut self.data.credentials, id);
        if removed {
            self.save()?;
        }
        Ok(removed)
    }

    pub fn search_credentials(&self, query: &str) -> Value {
        let q = query.to_lowercase();
        let keys = ["title", "name", "username", "url", "website", "notes"];
        let matches: Vec<Value> = self
            .data
            .credentials
            .iter()
            .filter(|c| {
                keys.iter().any(|k| {
                    c.get(*k)
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_lowercase().contains(&q))
                        .unwrap_or(false)
                })
            })
            .cloned()
            .collect();
        json!(matches)
    }

    // --- Authenticators (2FA) ---------------------------------------------

    pub fn authenticators(&self) -> Value {
        json!(self.data.authenticators)
    }

    pub fn add_authenticator(&mut self, mut entry: Value) -> Result<Value, String> {
        if !entry.is_object() {
            return Err("authenticator must be an object".into());
        }
        entry["id"] = json!(new_id());
        self.data.authenticators.push(entry.clone());
        self.save()?;
        Ok(entry)
    }

    pub fn update_authenticator(&mut self, id: &str, updates: &Value) -> Result<bool, String> {
        let found = merge_into(&mut self.data.authenticators, id, updates);
        if found {
            self.save()?;
        }
        Ok(found)
    }

    pub fn delete_authenticator(&mut self, id: &str) -> Result<bool, String> {
        let removed = remove_by_id(&mut self.data.authenticators, id);
        if removed {
            self.save()?;
        }
        Ok(removed)
    }

    /// Generate the current TOTP for a stored authenticator.
    pub fn generate_totp(&self, id: &str, unix_seconds: u64) -> Value {
        let entry = self
            .data
            .authenticators
            .iter()
            .find(|a| id_of(a) == Some(id));
        match entry {
            Some(a) => {
                let secret = a.get("secret").and_then(|v| v.as_str()).unwrap_or("");
                let digits = a.get("digits").and_then(|v| v.as_u64()).unwrap_or(6) as u32;
                let period = a.get("period").and_then(|v| v.as_u64()).unwrap_or(30);
                match totp::totp(secret, unix_seconds, digits, period) {
                    Some(code) => {
                        json!({ "code": code, "remaining": totp::seconds_remaining(unix_seconds, period) })
                    }
                    None => Value::Null,
                }
            }
            None => Value::Null,
        }
    }

    // --- Settings ----------------------------------------------------------

    pub fn settings(&self) -> Value {
        self.data.settings.clone()
    }

    pub fn update_settings(&mut self, updates: &Value) -> Result<bool, String> {
        if let Some(upd) = updates.as_object() {
            if !self.data.settings.is_object() {
                self.data.settings = json!({});
            }
            if let Some(obj) = self.data.settings.as_object_mut() {
                for (k, v) in upd {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
        self.save()?;
        Ok(true)
    }

    // --- Master password / export / import --------------------------------

    pub fn change_master_password(&mut self, current: &str, new: &str) -> Result<bool, String> {
        if !self.is_unlocked() {
            self.unlock(current)?;
        }
        if new.is_empty() {
            return Err("new password required".into());
        }
        let salt = crypto::random_bytes(16);
        self.key = Some(crypto::derive_key(new, &salt)?);
        self.salt = salt;
        self.save()?;
        Ok(true)
    }

    /// Encrypt the current data under a separate `export_password`; returns the
    /// envelope as a JSON string the caller can write to a file.
    pub fn export(&self, export_password: &str) -> Result<String, String> {
        self.require_unlocked()?;
        let salt = crypto::random_bytes(16);
        let key = crypto::derive_key(export_password, &salt)?;
        let plain = serde_json::to_vec(&self.data).map_err(|e| e.to_string())?;
        let env = crypto::encrypt(&key, &salt, &plain)?;
        serde_json::to_string(&env).map_err(|e| e.to_string())
    }

    /// Decrypt an exported envelope and replace the current data with it.
    pub fn import(&mut self, data: &str, export_password: &str) -> Result<bool, String> {
        self.require_unlocked()?;
        let env: Envelope = serde_json::from_str(data).map_err(|e| e.to_string())?;
        let plain = crypto::decrypt(export_password, &env)?;
        self.data = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
        self.save()?;
        Ok(true)
    }
}

fn merge_into(list: &mut [Value], id: &str, updates: &Value) -> bool {
    for item in list.iter_mut() {
        if id_of(item) == Some(id) {
            if let (Some(obj), Some(upd)) = (item.as_object_mut(), updates.as_object()) {
                for (k, v) in upd {
                    if k != "id" {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
            return true;
        }
    }
    false
}

fn remove_by_id(list: &mut Vec<Value>, id: &str) -> bool {
    let before = list.len();
    list.retain(|item| id_of(item) != Some(id));
    list.len() != before
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> (tempfile::TempDir, VaultManager) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.dex");
        (dir, VaultManager::new(path))
    }

    #[test]
    fn create_add_lock_unlock_round_trip() {
        let (_dir, mut v) = temp_vault();
        assert!(!v.exists());
        v.create("master-pass").unwrap();
        assert!(v.exists() && v.is_unlocked());

        let cred = v
            .add_credential(json!({ "title": "GitHub", "username": "me", "password": "p" }))
            .unwrap();
        let id = cred["id"].as_str().unwrap().to_string();

        v.lock();
        assert!(!v.is_unlocked());
        // Wrong password fails.
        assert!(v.unlock("nope").is_err());
        // Correct password restores the credential.
        v.unlock("master-pass").unwrap();
        assert_eq!(v.credential(&id)["title"], "GitHub");
        assert_eq!(v.search_credentials("github").as_array().unwrap().len(), 1);

        assert!(v
            .update_credential(&id, &json!({ "password": "new" }))
            .unwrap());
        assert_eq!(v.credential(&id)["password"], "new");
        assert!(v.delete_credential(&id).unwrap());
        assert!(v.credentials().as_array().unwrap().is_empty());
    }

    #[test]
    fn authenticator_totp_round_trip() {
        let (_dir, mut v) = temp_vault();
        v.create("pw").unwrap();
        let a = v
            .add_authenticator(
                json!({ "name": "ACME", "secret": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }),
            )
            .unwrap();
        let id = a["id"].as_str().unwrap().to_string();
        let out = v.generate_totp(&id, 59);
        assert_eq!(out["code"], "287082"); // RFC 6238 SHA-1 vector
    }

    #[test]
    fn export_import_with_separate_password() {
        let (_dir, mut v) = temp_vault();
        v.create("master").unwrap();
        v.add_credential(json!({ "title": "X" })).unwrap();
        let blob = v.export("export-pw").unwrap();

        let (_dir2, mut v2) = temp_vault();
        v2.create("other-master").unwrap();
        assert!(v2.import(&blob, "export-pw").unwrap());
        assert_eq!(v2.search_credentials("x").as_array().unwrap().len(), 1);
        // Wrong export password fails.
        assert!(v2.import(&blob, "wrong").is_err());
    }

    #[test]
    fn change_master_password_then_unlock_with_new() {
        let (_dir, mut v) = temp_vault();
        v.create("old").unwrap();
        v.add_credential(json!({ "title": "keep" })).unwrap();
        assert!(v.change_master_password("old", "brand-new").unwrap());
        v.lock();
        assert!(v.unlock("old").is_err());
        v.unlock("brand-new").unwrap();
        assert_eq!(v.search_credentials("keep").as_array().unwrap().len(), 1);
    }
}
