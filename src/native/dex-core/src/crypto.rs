// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- Phase 4: Cryptography via the ring crate.
// AES-256-GCM encryption/decryption with hardware AES-NI acceleration,
// PBKDF2 key derivation, and cryptographically secure random bytes.
//
// ring is audited and uses platform hardware acceleration automatically.
// On modern CPUs with AES-NI, encryption is essentially free in CPU cost.

use ring::aead::{self, Aad, BoundKey, Nonce, NonceSequence, NONCE_LEN, UnboundKey};
use ring::pbkdf2;
use ring::rand::{SecureRandom, SystemRandom};
use std::num::NonZeroU32;

// ---------------------------------------------------------------------------
// Nonce generation
// ---------------------------------------------------------------------------

struct CounterNonce {
    nonce_bytes: [u8; NONCE_LEN],
}

impl CounterNonce {
    fn new(bytes: [u8; NONCE_LEN]) -> Self {
        Self {
            nonce_bytes: bytes,
        }
    }
}

impl NonceSequence for CounterNonce {
    fn advance(&mut self) -> Result<Nonce, ring::error::Unspecified> {
        Nonce::try_assume_unique_for_key(&self.nonce_bytes)
    }
}

// ---------------------------------------------------------------------------
// AES-256-GCM Encryption
// ---------------------------------------------------------------------------

/// Encrypt data using AES-256-GCM.
/// Key must be exactly 32 bytes.
/// Returns: nonce (12 bytes) || ciphertext || tag (16 bytes).
pub fn encrypt_aes256gcm(plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if key.len() != 32 {
        return Err("Key must be exactly 32 bytes for AES-256-GCM".to_string());
    }

    let rng = SystemRandom::new();

    // Generate random 12-byte nonce
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| "Failed to generate random nonce".to_string())?;

    let unbound_key =
        UnboundKey::new(&aead::AES_256_GCM, key).map_err(|_| "Invalid AES key".to_string())?;

    let nonce_seq = CounterNonce::new(nonce_bytes);
    let mut sealing_key = aead::SealingKey::new(unbound_key, nonce_seq);

    let mut in_out = plaintext.to_vec();
    sealing_key
        .seal_in_place_append_tag(Aad::empty(), &mut in_out)
        .map_err(|_| "Encryption failed".to_string())?;

    // Prepend nonce to ciphertext+tag
    let mut result = Vec::with_capacity(NONCE_LEN + in_out.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&in_out);
    Ok(result)
}

/// Decrypt data encrypted with AES-256-GCM.
/// Input: nonce (12 bytes) || ciphertext || tag (16 bytes).
/// Key must be exactly 32 bytes.
pub fn decrypt_aes256gcm(ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if key.len() != 32 {
        return Err("Key must be exactly 32 bytes for AES-256-GCM".to_string());
    }
    if ciphertext.len() < NONCE_LEN + aead::AES_256_GCM.tag_len() {
        return Err("Ciphertext too short".to_string());
    }

    // Split nonce from ciphertext+tag
    let (nonce_bytes_slice, ct_and_tag) = ciphertext.split_at(NONCE_LEN);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    nonce_bytes.copy_from_slice(nonce_bytes_slice);

    let unbound_key =
        UnboundKey::new(&aead::AES_256_GCM, key).map_err(|_| "Invalid AES key".to_string())?;

    let nonce_seq = CounterNonce::new(nonce_bytes);
    let mut opening_key = aead::OpeningKey::new(unbound_key, nonce_seq);

    let mut in_out = ct_and_tag.to_vec();
    let plaintext = opening_key
        .open_in_place(Aad::empty(), &mut in_out)
        .map_err(|_| "Decryption failed: invalid key or corrupted data".to_string())?;

    Ok(plaintext.to_vec())
}

// ---------------------------------------------------------------------------
// PBKDF2 Key Derivation
// ---------------------------------------------------------------------------

/// Derive a 32-byte key from a password using PBKDF2-HMAC-SHA256.
pub fn derive_key_pbkdf2(password: &[u8], salt: &[u8], iterations: u32) -> Vec<u8> {
    let mut key = vec![0u8; 32]; // 256-bit key
    let iters = NonZeroU32::new(iterations.max(1)).unwrap();
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        iters,
        salt,
        password,
        &mut key,
    );
    key
}

// ---------------------------------------------------------------------------
// Secure Random
// ---------------------------------------------------------------------------

/// Generate cryptographically secure random bytes.
pub fn random_bytes(len: usize) -> Vec<u8> {
    let rng = SystemRandom::new();
    let mut buf = vec![0u8; len];
    rng.fill(&mut buf).expect("SystemRandom fill failed");
    buf
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = random_bytes(32);
        let plaintext = b"DEX Phantom encrypted data test 2026";

        let ciphertext = encrypt_aes256gcm(plaintext, &key).expect("encrypt");
        assert_ne!(ciphertext.as_slice(), plaintext.as_slice());

        let decrypted = decrypt_aes256gcm(&ciphertext, &key).expect("decrypt");
        assert_eq!(decrypted.as_slice(), plaintext.as_slice());
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = random_bytes(32);
        let key2 = random_bytes(32);
        let plaintext = b"secret";

        let ciphertext = encrypt_aes256gcm(plaintext, &key1).expect("encrypt");
        let result = decrypt_aes256gcm(&ciphertext, &key2);
        assert!(result.is_err());
    }

    #[test]
    fn pbkdf2_deterministic() {
        let password = b"hunter2";
        let salt = b"dex-salt-value";
        let k1 = derive_key_pbkdf2(password, salt, 100_000);
        let k2 = derive_key_pbkdf2(password, salt, 100_000);
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32);
    }

    #[test]
    fn random_bytes_unique() {
        let a = random_bytes(32);
        let b = random_bytes(32);
        assert_ne!(a, b);
    }
}
