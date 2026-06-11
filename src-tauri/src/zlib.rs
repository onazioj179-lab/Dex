// =============================================================================
// DEX 6.0 — zlib helpers (Node `zlib.deflateSync`/`inflateSync` parity)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Shared deflate/inflate used by the subsystems whose Electron managers run
//! state through Node's zlib (version-history snapshots, session-replay states,
//! project-archiver `.dex-archive` files). Streams are RFC 1950 zlib-wrapped at
//! the default compression level, byte-compatible with `zlib.deflateSync` /
//! `zlib.inflateSync`, so BLOBs and files written by either shell round-trip in
//! the other.

use flate2::read::ZlibDecoder;
use flate2::write::{GzEncoder, ZlibEncoder};
use flate2::Compression;
use std::io::{Read, Write};

/// zlib-deflate `data` (Node `zlib.deflateSync` equivalent).
pub fn deflate(data: &[u8]) -> Vec<u8> {
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    // Writing to a Vec cannot fail; fall back to the raw bytes on the
    // unreachable error path rather than panicking in the IPC layer.
    if enc.write_all(data).is_err() {
        return data.to_vec();
    }
    enc.finish().unwrap_or_else(|_| data.to_vec())
}

/// zlib-inflate `data` (Node `zlib.inflateSync` equivalent). Errors on streams
/// that are not valid zlib, exactly where the Node call would throw.
pub fn inflate(data: &[u8]) -> std::io::Result<Vec<u8>> {
    let mut dec = ZlibDecoder::new(data);
    let mut out = Vec::new();
    dec.read_to_end(&mut out)?;
    Ok(out)
}

/// zlib-inflate to a UTF-8 string (`inflateSync(blob).toString('utf8')`).
/// Returns `None` on malformed input rather than panicking.
pub fn inflate_to_string(data: &[u8]) -> Option<String> {
    inflate(data)
        .ok()
        .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
}

/// gzip `data` at level 6 (Node `zlib.gzipSync(data, { level: 6 })` parity —
/// the framing the `.dexbak` backup archives use).
pub fn gzip(data: &[u8]) -> Vec<u8> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::new(6));
    if enc.write_all(data).is_err() {
        return data.to_vec();
    }
    enc.finish().unwrap_or_else(|_| data.to_vec())
}

