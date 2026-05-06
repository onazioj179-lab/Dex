// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- File transfer with BLAKE3 hashing, LZ4 and Zstd compression.

use blake3;
use lz4_flex;
use std::path::Path;

/// Hash a file using BLAKE3 (streaming, 128KB chunks).
pub async fn hash_file_blake3(path: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let path = path.to_string();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&path)?;
        let mut reader = std::io::BufReader::with_capacity(128 * 1024, file);
        let mut hasher = blake3::Hasher::new();
        std::io::copy(&mut reader, &mut hasher)?;
        Ok(hasher.finalize().to_hex().to_string())
    })
    .await?
}

/// Compress a byte slice using LZ4 block compression.
pub fn compress_lz4(data: &[u8]) -> Vec<u8> {
    lz4_flex::compress_prepend_size(data)
}

/// Decompress LZ4 block compressed data.
pub fn decompress_lz4(data: &[u8]) -> Result<Vec<u8>, lz4_flex::block::DecompressError> {
    lz4_flex::decompress_size_prepended(data)
}

/// Chunked file copy with progress reporting.
/// Returns total bytes transferred.
pub async fn copy_file_chunked(
    source: &str,
    dest: &str,
    chunk_size: usize,
    progress_fn: impl Fn(u64, u64) + Send + 'static,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let source = source.to_string();
    let dest = dest.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write, BufReader, BufWriter};

        let src_file = std::fs::File::open(&source)?;
        let total_size = src_file.metadata()?.len();
        let mut reader = BufReader::with_capacity(chunk_size, src_file);

        // Create parent directories if needed
        if let Some(parent) = Path::new(&dest).parent() {
            std::fs::create_dir_all(parent)?;
        }

        let dst_file = std::fs::File::create(&dest)?;
        let mut writer = BufWriter::with_capacity(chunk_size, dst_file);

        let mut buf = vec![0u8; chunk_size];
        let mut transferred: u64 = 0;

        loop {
            let bytes_read = reader.read(&mut buf)?;
            if bytes_read == 0 {
                break;
            }
            writer.write_all(&buf[..bytes_read])?;
            transferred += bytes_read as u64;
            progress_fn(transferred, total_size);
        }
        writer.flush()?;
        Ok(transferred)
    })
    .await?
}

/// Verify file integrity by comparing BLAKE3 hashes.
pub async fn verify_integrity(path: &str, expected_hash: &str) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let actual = hash_file_blake3(path).await?;
    Ok(actual == expected_hash)
}

/// Compute transfer throughput in bytes/second from duration and size.
pub fn compute_throughput(bytes: u64, duration_ms: f64) -> f64 {
    if duration_ms <= 0.0 {
        return 0.0;
    }
    (bytes as f64 / duration_ms) * 1000.0
}

// ===========================================================================
// Phase 3: Zstd compression -- better ratio than LZ4, streaming support
// ===========================================================================

/// Compress a byte slice using Zstandard.
pub fn compress_zstd(data: &[u8], level: i32) -> Vec<u8> {
    zstd::encode_all(std::io::Cursor::new(data), level).unwrap_or_default()
}

/// Decompress Zstandard-compressed data.
pub fn decompress_zstd(data: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let decoded = zstd::decode_all(std::io::Cursor::new(data))?;
    Ok(decoded)
}

/// Stream-compress a file from disk to disk using Zstd.
/// Returns total bytes written.
pub async fn compress_zstd_stream(
    input_path: &str,
    output_path: &str,
    level: i32,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let input = input_path.to_string();
    let output = output_path.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::{BufReader, BufWriter, Read, Write};

        let src = std::fs::File::open(&input)?;
        let reader = BufReader::with_capacity(128 * 1024, src);

        if let Some(parent) = Path::new(&output).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let dst = std::fs::File::create(&output)?;
        let mut encoder = zstd::Encoder::new(BufWriter::new(dst), level)?;

        let mut buf_reader = reader;
        let mut buf = vec![0u8; 128 * 1024];
        let mut total: u64 = 0;
        loop {
            let n = buf_reader.read(&mut buf)?;
            if n == 0 {
                break;
            }
            encoder.write_all(&buf[..n])?;
            total += n as u64;
        }
        encoder.finish()?;
        Ok(total)
    })
    .await?
}

/// Stream-decompress a Zstd file from disk to disk.
/// Returns total bytes written.
pub async fn decompress_zstd_stream(
    input_path: &str,
    output_path: &str,
) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let input = input_path.to_string();
    let output = output_path.to_string();
    tokio::task::spawn_blocking(move || {
        use std::io::{BufWriter, Read, Write};

        let src = std::fs::File::open(&input)?;
        let mut decoder = zstd::Decoder::new(src)?;

        if let Some(parent) = Path::new(&output).parent() {
            std::fs::create_dir_all(parent)?;
        }
        let dst = std::fs::File::create(&output)?;
        let mut writer = BufWriter::with_capacity(128 * 1024, dst);

        let mut buf = vec![0u8; 128 * 1024];
        let mut total: u64 = 0;
        loop {
            let n = decoder.read(&mut buf)?;
            if n == 0 {
                break;
            }
            writer.write_all(&buf[..n])?;
            total += n as u64;
        }
        writer.flush()?;
        Ok(total)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lz4_roundtrip() {
        let data = b"DEX native transfer compression test data repeated content repeated content";
        let compressed = compress_lz4(data);
        let decompressed = decompress_lz4(&compressed).expect("decompress failed");
        assert_eq!(data.as_slice(), decompressed.as_slice());
    }

    #[test]
    fn zstd_roundtrip() {
        let data = b"DEX Zstandard compression test data with repeated content repeated content";
        let compressed = compress_zstd(data, 3);
        let decompressed = decompress_zstd(&compressed).expect("decompress failed");
        assert_eq!(data.as_slice(), decompressed.as_slice());
    }

    #[test]
    fn throughput_calculation() {
        let tp = compute_throughput(1_000_000, 1000.0);
        assert!((tp - 1_000_000.0).abs() < 0.1);
    }
}
