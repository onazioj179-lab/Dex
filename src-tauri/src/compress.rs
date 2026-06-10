// =============================================================================
// DEX 6.0 — zlib compression helper (Tauri port support)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Byte-compatible mirror of Node's `zlib.deflateSync` / `zlib.inflateSync`,
//! which several Electron subsystems use to store compressed JSON state as
//! SQLite BLOBs (version history snapshots, project archives, session-replay
//! before/after state). Node's `deflateSync` produces a standard zlib stream
//! (zlib header + DEFLATE body + Adler-32), which is exactly what
//! `flate2::ZlibEncoder` writes and `flate2::ZlibDecoder` reads — so BLOBs
//! written by Electron round-trip here and vice-versa. Centralised so every
//! subsystem touching those BLOB columns agrees on the on-disk format.

use flate2::read::ZlibDecoder;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use std::io::{Read, Write};

/// Compress bytes to a zlib stream (matches `zlib.deflateSync(buf)`).
pub fn deflate(data: &[u8]) -> Vec<u8> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    // Writing to an in-memory Vec never fails; fall back to the raw bytes if it
    // somehow does, so a write path degrades to uncompressed rather than losing data.
    if encoder.write_all(data).is_err() {
        return data.to_vec();
    }
    encoder.finish().unwrap_or_else(|_| data.to_vec())
}

/// Compress a UTF-8 string (the common case: `zlib.deflateSync(JSON.stringify(x))`).
pub fn deflate_str(s: &str) -> Vec<u8> {
    deflate(s.as_bytes())
}

/// Inflate a zlib stream back to bytes (matches `zlib.inflateSync(blob)`).
/// Returns `None` on malformed input rather than panicking.
pub fn inflate(data: &[u8]) -> Option<Vec<u8>> {
    let mut decoder = ZlibDecoder::new(data);
    let mut out = Vec::new();
    decoder.read_to_end(&mut out).ok().map(|_| out)
}

/// Inflate a zlib stream to a UTF-8 string (matches `inflateSync(blob).toString()`).
pub fn inflate_to_string(data: &[u8]) -> Option<String> {
    inflate(data).map(|bytes| String::from_utf8_lossy(&bytes).to_string())
}
