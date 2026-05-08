// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ─────────────────────────────────────────────────────────────────────────
// DEX Native — Creator Access Key
//
// Single-owner unlock for the "Creative Full Access" surface. The owner
// (Onazi Treasure OJ) holds the Ed25519 private key offline. The native
// binary embeds only the public key, so a stolen build cannot self-grant.
// Verification is constant-time and isolated in Rust to keep the trust
// boundary outside of the JavaScript runtime.
//
// Flow:
//   1. Renderer requests a challenge: native generates a 32-byte random
//      nonce, prefixes it with `DEX-CREATOR-v1\n<unix_seconds>\n` and
//      returns it as hex.
//   2. Owner signs the challenge offline using their private key.
//   3. Renderer submits the signature; native verifies it against the
//      embedded public key. On success, it returns an unlock token bound
//      to the challenge timestamp (15-minute validity window).
//   4. The unlock token can be re-validated any time without the signing
//      key (HMAC-SHA256 with a process-local secret).
// ─────────────────────────────────────────────────────────────────────────

use napi::bindgen_prelude::*;
use napi_derive::napi;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use parking_lot::Mutex;

// ─────────────────────────────────────────────────────────────────────────
// Embedded creator public key (Ed25519, 32 bytes, hex-encoded)
//
// PLACEHOLDER: replace with the real owner public key produced by
// `cargo run --bin keygen` (see scripts/creator-keygen.md). Until a real
// key is embedded, verification will refuse every signature so the
// surface fails closed.
// ─────────────────────────────────────────────────────────────────────────
const CREATOR_PUBKEY_HEX: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

const CHALLENGE_PREFIX: &str = "DEX-CREATOR-v1";
const CHALLENGE_TTL_SECONDS: u64 = 5 * 60;
const TOKEN_TTL_SECONDS: u64 = 15 * 60;

// Process-local HMAC secret used to bind unlock tokens to the running
// session. Regenerated on every process start, so tokens never survive
// a relaunch.
static SESSION_SECRET: OnceLock<[u8; 32]> = OnceLock::new();

fn session_secret() -> &'static [u8; 32] {
    SESSION_SECRET.get_or_init(|| {
        let mut buf = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut buf);
        buf
    })
}

// In-memory store of issued (but unconsumed) challenges so a renderer
// cannot replay an old random nonce.
static ACTIVE_CHALLENGES: OnceLock<Mutex<Vec<(String, u64)>>> = OnceLock::new();

fn active_challenges() -> &'static Mutex<Vec<(String, u64)>> {
    ACTIVE_CHALLENGES.get_or_init(|| Mutex::new(Vec::new()))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn prune_challenges(now: u64) {
    let mut guard = active_challenges().lock();
    guard.retain(|(_, ts)| now.saturating_sub(*ts) < CHALLENGE_TTL_SECONDS);
}

fn embedded_public_key() -> Option<VerifyingKey> {
    let bytes = hex::decode(CREATOR_PUBKEY_HEX).ok()?;
    if bytes.len() != 32 || bytes.iter().all(|b| *b == 0) {
        return None;
    }
    let arr: [u8; 32] = bytes.try_into().ok()?;
    VerifyingKey::from_bytes(&arr).ok()
}

fn hmac_sha256(secret: &[u8; 32], message: &[u8]) -> [u8; 32] {
    // Lightweight HMAC-SHA256 without bringing in another crate.
    let mut k_pad = [0u8; 64];
    if secret.len() > 64 {
        let h = Sha256::digest(secret);
        k_pad[..32].copy_from_slice(&h);
    } else {
        k_pad[..secret.len()].copy_from_slice(secret);
    }
    let mut o_key = [0x5cu8; 64];
    let mut i_key = [0x36u8; 64];
    for i in 0..64 {
        o_key[i] ^= k_pad[i];
        i_key[i] ^= k_pad[i];
    }
    let mut inner = Sha256::new();
    inner.update(i_key);
    inner.update(message);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(o_key);
    outer.update(inner_hash);
    let out = outer.finalize();
    let mut result = [0u8; 32];
    result.copy_from_slice(&out);
    result
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[napi(object)]
pub struct CreatorChallenge {
    pub challenge: String,
    pub issued_at: i64,
    pub expires_at: i64,
}

#[napi(object)]
pub struct CreatorVerifyResult {
    pub ok: bool,
    pub token: Option<String>,
    pub expires_at: Option<i64>,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct CreatorTokenStatus {
    pub valid: bool,
    pub expires_at: Option<i64>,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct CreatorKeyStatus {
    pub configured: bool,
    pub fingerprint: Option<String>,
}

/// Report whether a creator public key is embedded in this build.
#[napi]
pub fn creator_key_status() -> Result<CreatorKeyStatus> {
    match embedded_public_key() {
        Some(key) => {
            let fp_full = Sha256::digest(key.as_bytes());
            let mut fp = String::with_capacity(16);
            for b in fp_full.iter().take(8) {
                fp.push_str(&format!("{:02x}", b));
            }
            Ok(CreatorKeyStatus {
                configured: true,
                fingerprint: Some(fp),
            })
        }
        None => Ok(CreatorKeyStatus {
            configured: false,
            fingerprint: None,
        }),
    }
}

/// Generate a fresh signing challenge for the creator.
#[napi]
pub fn creator_make_challenge() -> Result<CreatorChallenge> {
    let now = now_secs();
    prune_challenges(now);

    let mut nonce = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut nonce);
    let challenge = format!(
        "{}\n{}\n{}",
        CHALLENGE_PREFIX,
        now,
        hex::encode(nonce)
    );

    let mut guard = active_challenges().lock();
    guard.push((challenge.clone(), now));
    if guard.len() > 64 {
        let drop_n = guard.len() - 64;
        guard.drain(0..drop_n);
    }

    Ok(CreatorChallenge {
        challenge,
        issued_at: now as i64,
        expires_at: (now + CHALLENGE_TTL_SECONDS) as i64,
    })
}

/// Verify a challenge signature against the embedded creator public key.
/// On success returns an HMAC-bound unlock token valid for TOKEN_TTL_SECONDS.
#[napi]
pub fn creator_verify_signature(challenge: String, signature_hex: String) -> Result<CreatorVerifyResult> {
    let now = now_secs();
    prune_challenges(now);

    let public_key = match embedded_public_key() {
        Some(k) => k,
        None => {
            return Ok(CreatorVerifyResult {
                ok: false,
                token: None,
                expires_at: None,
                reason: Some("no-creator-key-embedded".into()),
            });
        }
    };

    // Confirm the challenge was actually issued by us and is unconsumed.
    let consumed = {
        let mut guard = active_challenges().lock();
        match guard.iter().position(|(c, _)| c == &challenge) {
            Some(idx) => {
                guard.remove(idx);
                true
            }
            None => false,
        }
    };
    if !consumed {
        return Ok(CreatorVerifyResult {
            ok: false,
            token: None,
            expires_at: None,
            reason: Some("unknown-or-replayed-challenge".into()),
        });
    }

    let sig_bytes = match hex::decode(signature_hex.trim()) {
        Ok(b) if b.len() == 64 => b,
        _ => {
            return Ok(CreatorVerifyResult {
                ok: false,
                token: None,
                expires_at: None,
                reason: Some("malformed-signature".into()),
            });
        }
    };
    let sig_arr: [u8; 64] = match sig_bytes.try_into() {
        Ok(a) => a,
        Err(_) => {
            return Ok(CreatorVerifyResult {
                ok: false,
                token: None,
                expires_at: None,
                reason: Some("malformed-signature".into()),
            });
        }
    };
    let signature = Signature::from_bytes(&sig_arr);

    if public_key.verify(challenge.as_bytes(), &signature).is_err() {
        return Ok(CreatorVerifyResult {
            ok: false,
            token: None,
            expires_at: None,
            reason: Some("signature-mismatch".into()),
        });
    }

    // Mint an HMAC-bound token: payload = "v1|<expires_at>|<challenge_hash>"
    let expires_at = now + TOKEN_TTL_SECONDS;
    let challenge_hash = Sha256::digest(challenge.as_bytes());
    let payload = format!(
        "v1|{}|{}",
        expires_at,
        hex::encode(&challenge_hash[..16])
    );
    let mac = hmac_sha256(session_secret(), payload.as_bytes());
    let token = format!("{}|{}", payload, hex::encode(mac));

    Ok(CreatorVerifyResult {
        ok: true,
        token: Some(token),
        expires_at: Some(expires_at as i64),
        reason: None,
    })
}

/// Check whether a previously minted unlock token is still valid in this
/// process. Tokens never survive a process restart by design.
#[napi]
pub fn creator_check_token(token: String) -> Result<CreatorTokenStatus> {
    let parts: Vec<&str> = token.split('|').collect();
    if parts.len() != 4 || parts[0] != "v1" {
        return Ok(CreatorTokenStatus {
            valid: false,
            expires_at: None,
            reason: Some("malformed-token".into()),
        });
    }
    let expires_at: u64 = match parts[1].parse() {
        Ok(v) => v,
        Err(_) => {
            return Ok(CreatorTokenStatus {
                valid: false,
                expires_at: None,
                reason: Some("malformed-token".into()),
            });
        }
    };
    let payload = format!("v1|{}|{}", expires_at, parts[2]);
    let expected_mac = hmac_sha256(session_secret(), payload.as_bytes());
    let provided_mac = match hex::decode(parts[3]) {
        Ok(b) => b,
        Err(_) => {
            return Ok(CreatorTokenStatus {
                valid: false,
                expires_at: None,
                reason: Some("malformed-token".into()),
            });
        }
    };
    if !constant_time_eq(&expected_mac, &provided_mac) {
        return Ok(CreatorTokenStatus {
            valid: false,
            expires_at: None,
            reason: Some("token-tampered".into()),
        });
    }
    if now_secs() >= expires_at {
        return Ok(CreatorTokenStatus {
            valid: false,
            expires_at: Some(expires_at as i64),
            reason: Some("token-expired".into()),
        });
    }
    Ok(CreatorTokenStatus {
        valid: true,
        expires_at: Some(expires_at as i64),
        reason: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_has_correct_prefix() {
        let c = creator_make_challenge().unwrap();
        assert!(c.challenge.starts_with(CHALLENGE_PREFIX));
    }

    #[test]
    fn missing_creator_key_refuses_verification() {
        // Default placeholder pubkey is all zeros, so verification must fail.
        let c = creator_make_challenge().unwrap();
        let r = creator_verify_signature(c.challenge, "00".repeat(64)).unwrap();
        assert!(!r.ok);
        assert_eq!(r.reason.as_deref(), Some("no-creator-key-embedded"));
    }

    #[test]
    fn unknown_challenge_is_rejected() {
        let r = creator_verify_signature("not-a-real-challenge".into(), "ab".repeat(64)).unwrap();
        assert!(!r.ok);
    }

    #[test]
    fn malformed_token_rejected() {
        let r = creator_check_token("garbage".into()).unwrap();
        assert!(!r.valid);
    }
}
