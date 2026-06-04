// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Fast non-cryptographic content hashing for asset de-duplication. FNV-1a
//! (32- and 64-bit). Mirrors the renderer's `assetHash.ts` so large files can be
//! fingerprinted natively (much faster than JS over big buffers). NOT for
//! security — `crypto.rs` covers cryptographic needs.

const FNV_OFFSET_32: u32 = 0x811c_9dc5;
const FNV_PRIME_32: u32 = 0x0100_0193;
const FNV_OFFSET_64: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME_64: u64 = 0x0000_0100_0000_01b3;

/// FNV-1a 32-bit hash of a byte slice.
#[must_use]
pub fn fnv1a_32(data: &[u8]) -> u32 {
    let mut hash = FNV_OFFSET_32;
    for &byte in data {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME_32);
    }
    hash
}

/// FNV-1a 64-bit hash of a byte slice (lower collision rate for dedup).
#[must_use]
pub fn fnv1a_64(data: &[u8]) -> u64 {
    let mut hash = FNV_OFFSET_64;
    for &byte in data {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(FNV_PRIME_64);
    }
    hash
}

/// A 16-char lowercase hex dedup key from the 64-bit hash.
#[must_use]
pub fn content_hash_hex(data: &[u8]) -> String {
    format!("{:016x}", fnv1a_64(data))
}

#[cfg(test)]
mod tests {
    use super::{content_hash_hex, fnv1a_32};

    #[test]
    fn deterministic_and_distinct() {
        assert_eq!(fnv1a_32(b"hello"), fnv1a_32(b"hello"));
        assert_ne!(fnv1a_32(b"hello"), fnv1a_32(b"world"));
    }

    #[test]
    fn known_fnv1a_32_vectors() {
        // Empty input is the offset basis; "a" is a documented FNV-1a test vector.
        assert_eq!(fnv1a_32(b""), 0x811c_9dc5);
        assert_eq!(fnv1a_32(b"a"), 0xe40c_292c);
    }

    #[test]
    fn hex_key_is_stable_and_16_chars() {
        let key = content_hash_hex(b"some content");
        assert_eq!(key.len(), 16);
        assert_eq!(content_hash_hex(b"some content"), key);
        assert_ne!(content_hash_hex(b"other content"), key);
    }
}
