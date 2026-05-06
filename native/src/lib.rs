// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Rust NAPI-RS Entry Point
// Replaces: Python psutil subprocess, JS systeminformation, ps-list
// Provides: system monitoring, process management, file scanning, power control
// ═══════════════════════════════════════════════════════════════════════════

#![deny(clippy::all)]
#![allow(clippy::manual_is_multiple_of)]

mod system;
mod processes;
mod power;
mod files;
mod health;
mod image_processing;
mod audio_processing;
mod video_metadata;
mod creative;
mod kernel;

pub use system::*;
pub use processes::*;
pub use power::*;
pub use files::*;
pub use health::*;
pub use image_processing::*;
pub use audio_processing::*;
pub use video_metadata::*;
pub use creative::*;
pub use kernel::scheduler::*;
pub use kernel::memory::*;
pub use kernel::io_engine::*;
pub use kernel::ipc_bus::*;
pub use kernel::cpu::*;
pub use kernel::startup::*;
pub use kernel::perf::*;
pub use kernel::uki::*;
pub use kernel::dsp::*;
pub use kernel::media::*;
pub use kernel::video::*;
pub use kernel::solid::*;
pub use kernel::compression::*;

// ─────────────────────────────────────────────────────────────────────────
// Structured Error Logging
// ─────────────────────────────────────────────────────────────────────────

use std::sync::atomic::{AtomicBool, Ordering};
use std::io::{Write, BufWriter};
use std::sync::OnceLock;

static LOG_INITIALIZED: AtomicBool = AtomicBool::new(false);

// Persistent buffered log writer — opened once, reused across all native_log calls.
// Using parking_lot::Mutex so it's zero-cost when uncontended.
static LOG_WRITER: OnceLock<parking_lot::Mutex<BufWriter<std::fs::File>>> = OnceLock::new();

fn get_log_writer() -> Option<&'static parking_lot::Mutex<BufWriter<std::fs::File>>> {
    LOG_WRITER.get()
}

/// Initialize structured logging to file. Call once at startup.
#[napi_derive::napi]
pub fn init_native_logging() -> napi::Result<String> {
    if LOG_INITIALIZED.swap(true, Ordering::Relaxed) {
        return Ok("Already initialized".into());
    }

    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("DEX")
        .join("logs");

    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        return Ok(format!("Failed to create log dir: {}", e));
    }

    let log_path = log_dir.join("native.log");

    match std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        Ok(file) => {
            // 8 KB buffer — flushes automatically when full; also on Drop
            let _ = LOG_WRITER.set(parking_lot::Mutex::new(BufWriter::with_capacity(8192, file)));
            Ok(format!("Logging to {}", log_path.display()))
        }
        Err(e) => Ok(format!("Failed to open log file: {}", e)),
    }
}

/// Log a structured message to the native log file.
/// Uses a persistent buffered writer instead of opening the file on every call.
#[napi_derive::napi]
pub fn native_log(level: String, module: String, message: String) -> napi::Result<()> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
    let line = format!("[{}] {} [{}] {}\n", timestamp, level.to_uppercase(), module, message);

    if let Some(writer) = get_log_writer() {
        let mut w = writer.lock();
        let _ = w.write_all(line.as_bytes());
        // Flush on WARN/ERROR so critical logs are never lost on crash
        if matches!(level.to_uppercase().as_str(), "WARN" | "ERROR") {
            let _ = w.flush();
        }
    }
    Ok(())
}
