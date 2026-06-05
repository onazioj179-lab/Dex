// =============================================================================
// DEX 6.0 — Vault Crypto (GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! AES-256-GCM authenticated encryption with Argon2id key derivation. The vault
//! is stored on disk as a JSON `Envelope` (salt + nonce + ciphertext, all
//! base64); the key never touches disk — it is re-derived from the master
//! password on unlock.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};

/// On-disk encrypted envelope. All binary fields are base64-encoded.
#[derive(Serialize, Deserialize, Clone)]
pub struct Envelope {
    pub v: u8,
    pub salt: String,
    pub nonce: String,
    pub ct: String,
}

/// Cryptographically secure random bytes.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    rand::thread_rng().fill_bytes(&mut b);
    b
}

pub fn b64_encode(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    B64.decode(s).map_err(|e| e.to_string())
}

/// Derive a 32-byte key from `password` + `salt` using Argon2id.
pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// Encrypt `plaintext` under `key` with a fresh random nonce; embeds `salt` so
/// the envelope is self-describing for later key re-derivation.
pub fn encrypt(key: &[u8; 32], salt: &[u8], plaintext: &[u8]) -> Result<Envelope, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce_bytes = random_bytes(12);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| e.to_string())?;
    Ok(Envelope {
        v: 1,
        salt: b64_encode(salt),
        nonce: b64_encode(&nonce_bytes),
        ct: b64_encode(&ct),
    })
}

/// Decrypt an `Envelope` with a key derived from `password`. Returns a generic
/// error on auth-tag failure (wrong password / tampered data) — never leaks why.
pub fn decrypt(password: &str, env: &Envelope) -> Result<Vec<u8>, String> {
    let salt = b64_decode(&env.salt)?;
    let nonce_bytes = b64_decode(&env.nonce)?;
    let ct = b64_decode(&env.ct)?;
    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, ct.as_ref())
        .map_err(|_| "decryption failed (wrong password?)".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_encrypt_decrypt() {
        let salt = random_bytes(16);
        let key = derive_key("correct horse battery staple", &salt).unwrap();
        let env = encrypt(&key, &salt, b"secret data").unwrap();
        let out = decrypt("correct horse battery staple", &env).unwrap();
        assert_eq!(out, b"secret data");
    }

    #[test]
    fn wrong_password_fails() {
        let salt = random_bytes(16);
        let key = derive_key("right", &salt).unwrap();
        let env = encrypt(&key, &salt, b"secret").unwrap();
        assert!(decrypt("wrong", &env).is_err());
    }

    #[test]
    fn key_derivation_is_deterministic_per_salt() {
        let salt = random_bytes(16);
        assert_eq!(derive_key("pw", &salt).unwrap(), derive_key("pw", &salt).unwrap());
        let salt2 = random_bytes(16);
        assert_ne!(derive_key("pw", &salt).unwrap(), derive_key("pw", &salt2).unwrap());
    }
}
