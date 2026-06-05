// =============================================================================
// DEX 6.0 — Vault TOTP (GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! RFC 6238 (TOTP) over RFC 4648 base32 secrets, plus `otpauth://` URI parsing.

use hmac::{Hmac, Mac};
use sha1::Sha1;

type HmacSha1 = Hmac<Sha1>;

/// Decode an RFC 4648 base32 string (case-insensitive, padding/whitespace ok).
pub fn base32_decode(input: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut buffer: u64 = 0;
    let mut bits: u32 = 0;
    let mut out = Vec::new();
    for c in input.chars().filter(|c| !c.is_whitespace() && *c != '=') {
        let upper = c.to_ascii_uppercase() as u8;
        let val = ALPHABET.iter().position(|&a| a == upper)? as u64;
        buffer = (buffer << 5) | val;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}

/// Compute the TOTP code for a base32 `secret` at `unix_seconds`.
pub fn totp(secret_b32: &str, unix_seconds: u64, digits: u32, period: u64) -> Option<String> {
    let key = base32_decode(secret_b32)?;
    if key.is_empty() {
        return None;
    }
    let counter = unix_seconds / period.max(1);
    let mut mac = HmacSha1::new_from_slice(&key).ok()?;
    mac.update(&counter.to_be_bytes());
    let hash = mac.finalize().into_bytes();
    let offset = (hash[hash.len() - 1] & 0x0f) as usize;
    let bin = ((hash[offset] as u32 & 0x7f) << 24)
        | ((hash[offset + 1] as u32) << 16)
        | ((hash[offset + 2] as u32) << 8)
        | (hash[offset + 3] as u32);
    let modulo = 10u32.pow(digits.clamp(1, 9));
    Some(format!("{:0width$}", bin % modulo, width = digits as usize))
}

/// Seconds remaining in the current TOTP window.
pub fn seconds_remaining(unix_seconds: u64, period: u64) -> u64 {
    let p = period.max(1);
    p - (unix_seconds % p)
}

/// Parsed `otpauth://totp/...` URI.
pub struct OtpUri {
    pub label: String,
    pub secret: String,
    pub issuer: String,
    pub digits: u32,
    pub period: u64,
}

/// Parse an `otpauth://totp/<label>?secret=...&issuer=...&digits=...&period=...`.
pub fn parse_otpauth(uri: &str) -> Option<OtpUri> {
    let rest = uri.strip_prefix("otpauth://totp/")?;
    let (label_enc, query) = rest.split_once('?').unwrap_or((rest, ""));
    let mut out = OtpUri {
        label: urldecode(label_enc),
        secret: String::new(),
        issuer: String::new(),
        digits: 6,
        period: 30,
    };
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "secret" => out.secret = v.to_string(),
                "issuer" => out.issuer = urldecode(v),
                "digits" => out.digits = v.parse().unwrap_or(6),
                "period" => out.period = v.parse().unwrap_or(30),
                _ => {}
            }
        }
    }
    if out.secret.is_empty() {
        return None;
    }
    Some(out)
}

fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 3 <= bytes.len() {
            if let Ok(h) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(h);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base32_decodes_known_vector() {
        // "12345678901234567890" is the RFC 6238 SHA-1 test key.
        let decoded = base32_decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").unwrap();
        assert_eq!(decoded, b"12345678901234567890");
    }

    #[test]
    fn totp_matches_rfc6238_vector() {
        // RFC 6238 SHA-1: T=59s, step=30 -> 8 digits "94287082"; 6 digits "287082".
        let secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        assert_eq!(totp(secret, 59, 8, 30).unwrap(), "94287082");
        assert_eq!(totp(secret, 59, 6, 30).unwrap(), "287082");
    }

    #[test]
    fn parses_otpauth_uri() {
        let u = parse_otpauth(
            "otpauth://totp/ACME:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME&digits=6&period=30",
        )
        .unwrap();
        assert_eq!(u.secret, "JBSWY3DPEHPK3PXP");
        assert_eq!(u.issuer, "ACME");
        assert_eq!(u.digits, 6);
        assert!(u.label.contains("alice@example.com"));
    }

    #[test]
    fn window_remaining_is_bounded() {
        assert_eq!(seconds_remaining(59, 30), 1);
        assert_eq!(seconds_remaining(60, 30), 30);
    }
}
