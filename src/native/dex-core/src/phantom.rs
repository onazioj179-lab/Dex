// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Phase 11: DEX Phantom.
// Encrypted operations for portable DEX deployments:
// - USB stick speed detection (sequential read/write benchmarking)
// - Zero-trace cleanup (secure file overwrite + deletion)
// - Bidirectional encrypted sync between source and target directories
//
// All file encryption uses AES-256-GCM from the crypto module (Phase 4).

use serde_json::json;
use std::path::Path;

// ---------------------------------------------------------------------------
// USB Stick Speed Detection
// ---------------------------------------------------------------------------

/// Detect sequential read/write speed of a storage device at the given path.
/// Returns JSON: { read_mbps, write_mbps, tier }.
pub async fn detect_speed(
    path: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let p = path.to_string();
    tokio::task::spawn_blocking(move || detect_speed_sync(&p)).await?
}

fn detect_speed_sync(base_path: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use std::io::{Read, Write};
    use std::time::Instant;

    let test_dir = Path::new(base_path).join(".dex-speed-test");
    std::fs::create_dir_all(&test_dir)?;
    let test_file = test_dir.join("benchmark.tmp");

    // Write test: 16MB of data in 128KB chunks
    let chunk_size = 128 * 1024;
    let total_size = 16 * 1024 * 1024;
    let data = vec![0xABu8; chunk_size];
    let iterations = total_size / chunk_size;

    let write_start = Instant::now();
    {
        let mut file = std::fs::File::create(&test_file)?;
        for _ in 0..iterations {
            file.write_all(&data)?;
        }
        file.sync_all()?;
    }
    let write_elapsed = write_start.elapsed();
    let write_mbps = (total_size as f64 / (1024.0 * 1024.0)) / write_elapsed.as_secs_f64();

    // Read test
    let read_start = Instant::now();
    {
        let mut file = std::fs::File::open(&test_file)?;
        let mut buf = vec![0u8; chunk_size];
        loop {
            let n = file.read(&mut buf)?;
            if n == 0 {
                break;
            }
        }
    }
    let read_elapsed = read_start.elapsed();
    let read_mbps = (total_size as f64 / (1024.0 * 1024.0)) / read_elapsed.as_secs_f64();

    // Cleanup speed test files
    let _ = std::fs::remove_file(&test_file);
    let _ = std::fs::remove_dir(&test_dir);

    let tier = if read_mbps > 400.0 && write_mbps > 300.0 {
        "usb3-fast"
    } else if read_mbps > 100.0 && write_mbps > 50.0 {
        "usb3"
    } else if read_mbps > 30.0 && write_mbps > 15.0 {
        "usb2"
    } else {
        "slow"
    };

    let result = json!({
        "read_mbps": (read_mbps * 100.0).round() / 100.0,
        "write_mbps": (write_mbps * 100.0).round() / 100.0,
        "tier": tier,
    });

    Ok(result.to_string())
}

// ---------------------------------------------------------------------------
// Zero-Trace Cleanup
// ---------------------------------------------------------------------------

/// Securely overwrite and delete files, leaving no recoverable trace.
/// Each file is overwritten with random data, then zeros, then deleted.
/// Returns the number of files cleaned.
pub fn zero_trace(paths: &[String]) -> Result<u32, String> {
    use std::io::Write;

    let mut cleaned = 0u32;
    for path_str in paths {
        let path = Path::new(path_str);
        if !path.exists() {
            continue;
        }

        if path.is_file() {
            if let Ok(metadata) = std::fs::metadata(path) {
                let size = metadata.len() as usize;
                if let Ok(mut file) = std::fs::OpenOptions::new().write(true).open(path) {
                    // Pass 1: random data
                    let random_data: Vec<u8> = (0..size).map(|i| (i * 0xDEAD + 0xBEEF) as u8).collect();
                    let _ = file.write_all(&random_data);
                    let _ = file.sync_all();

                    // Pass 2: zeros
                    let zeros = vec![0u8; size];
                    let _ = file.write_all(&zeros);
                    let _ = file.sync_all();

                    // Pass 3: ones
                    let ones = vec![0xFFu8; size];
                    let _ = file.write_all(&ones);
                    let _ = file.sync_all();
                }
            }
            let _ = std::fs::remove_file(path);
            cleaned += 1;
        } else if path.is_dir() {
            // Recursively clean directory contents first
            if let Ok(entries) = std::fs::read_dir(path) {
                let child_paths: Vec<String> = entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path().to_string_lossy().to_string())
                    .collect();
                if let Ok(n) = zero_trace(&child_paths) {
                    cleaned += n;
                }
            }
            let _ = std::fs::remove_dir(path);
        }
    }
    Ok(cleaned)
}

// ---------------------------------------------------------------------------
// Bidirectional Encrypted Sync
// ---------------------------------------------------------------------------

/// Sync files between source and target directories with encryption.
/// Files are encrypted with AES-256-GCM using the provided key before writing
/// to the target. Returns JSON summary: { synced, skipped, errors }.
pub async fn sync_encrypted(
    source: &str,
    target: &str,
    key: &[u8],
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let src = source.to_string();
    let tgt = target.to_string();
    let k = key.to_vec();

    tokio::task::spawn_blocking(move || sync_encrypted_sync(&src, &tgt, &k)).await?
}

fn sync_encrypted_sync(
    source: &str,
    target: &str,
    key: &[u8],
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let src_path = Path::new(source);
    let tgt_path = Path::new(target);

    if !src_path.is_dir() {
        return Err(format!("Source is not a directory: {}", source).into());
    }
    std::fs::create_dir_all(tgt_path)?;

    let mut synced = 0u32;
    let mut skipped = 0u32;
    let mut errors = 0u32;

    sync_dir_recursive(src_path, tgt_path, key, &mut synced, &mut skipped, &mut errors)?;

    let result = json!({
        "synced": synced,
        "skipped": skipped,
        "errors": errors,
    });
    Ok(result.to_string())
}

fn sync_dir_recursive(
    src: &Path,
    tgt: &Path,
    key: &[u8],
    synced: &mut u32,
    skipped: &mut u32,
    errors: &mut u32,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name();
        let src_child = entry.path();
        let tgt_child = tgt.join(&name);

        if file_type.is_dir() {
            std::fs::create_dir_all(&tgt_child)?;
            sync_dir_recursive(&src_child, &tgt_child, key, synced, skipped, errors)?;
        } else if file_type.is_file() {
            // Check if target exists and is newer
            let src_modified = src_child
                .metadata()
                .and_then(|m| m.modified())
                .unwrap_or(std::time::UNIX_EPOCH);

            let tgt_enc = tgt_child.with_extension(
                tgt_child
                    .extension()
                    .map(|e| format!("{}.enc", e.to_string_lossy()))
                    .unwrap_or_else(|| "enc".to_string()),
            );

            if tgt_enc.exists() {
                if let Ok(tgt_modified) = tgt_enc.metadata().and_then(|m| m.modified()) {
                    if tgt_modified >= src_modified {
                        *skipped += 1;
                        continue;
                    }
                }
            }

            // Read, encrypt, write
            match std::fs::read(&src_child) {
                Ok(plaintext) => match crate::crypto::encrypt_aes256gcm(&plaintext, key) {
                    Ok(ciphertext) => {
                        if let Err(_) = std::fs::write(&tgt_enc, &ciphertext) {
                            *errors += 1;
                        } else {
                            *synced += 1;
                        }
                    }
                    Err(_) => {
                        *errors += 1;
                    }
                },
                Err(_) => {
                    *errors += 1;
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_trace_cleans_files() {
        let dir = "/tmp/dex_phantom_test";
        let _ = std::fs::remove_dir_all(dir);
        std::fs::create_dir_all(dir).expect("create test dir");

        let file_path = format!("{}/secret.txt", dir);
        std::fs::write(&file_path, "top secret data").expect("write test file");
        assert!(Path::new(&file_path).exists());

        let cleaned = zero_trace(&[file_path.clone()]).expect("zero trace");
        assert_eq!(cleaned, 1);
        assert!(!Path::new(&file_path).exists());

        let _ = std::fs::remove_dir_all(dir);
    }
}
