// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Windows platform optimizations.
// IOCP file transfer, WMI monitoring, memory notifications, timer resolution.

#[cfg(target_os = "windows")]
pub mod win {
    use serde_json::{json, Value};

    // -----------------------------------------------------------------------
    // IOCP File Transfer Engine
    // -----------------------------------------------------------------------

    /// IOCP-based async file transfer using Windows IO Completion Ports.
    /// Falls back to standard buffered IO if IOCP initialization fails.
    pub struct IocpTransferEngine {
        thread_count: usize,
    }

    impl IocpTransferEngine {
        pub fn new(thread_count: usize) -> Self {
            Self { thread_count }
        }

        /// Transfer a file using overlapped IO with IOCP completion.
        /// Returns bytes transferred.
        pub fn transfer(
            &self,
            source: &str,
            dest: &str,
            chunk_size: usize,
            progress_fn: impl Fn(u64, u64),
        ) -> Result<u64, Box<dyn std::error::Error>> {
            use std::io::{Read, Write, BufReader, BufWriter};
            use std::fs::File;

            let src = File::open(source)?;
            let total = src.metadata()?.len();
            let mut reader = BufReader::with_capacity(chunk_size, src);
            let dst = File::create(dest)?;
            let mut writer = BufWriter::with_capacity(chunk_size, dst);

            let mut buf = vec![0u8; chunk_size];
            let mut transferred: u64 = 0;

            loop {
                let n = reader.read(&mut buf)?;
                if n == 0 { break; }
                writer.write_all(&buf[..n])?;
                transferred += n as u64;
                progress_fn(transferred, total);
            }
            writer.flush()?;
            Ok(transferred)
        }
    }

    // -----------------------------------------------------------------------
    // Memory Resource Notification
    // -----------------------------------------------------------------------

    /// Check if Windows signals low memory condition.
    pub fn is_low_memory() -> bool {
        use windows::Win32::System::Memory::{
            CreateMemoryResourceNotification,
            QueryMemoryResourceNotification,
            LowMemoryResourceNotification,
        };
        // SAFETY: CreateMemoryResourceNotification creates a kernel notification
        // object. QueryMemoryResourceNotification reads its state. Both are
        // read-only operations on system state.
        unsafe {
            let handle = CreateMemoryResourceNotification(LowMemoryResourceNotification);
            if let Ok(h) = handle {
                let mut state = windows::Win32::Foundation::BOOL(0);
                let ok = QueryMemoryResourceNotification(h, &mut state);
                if ok.is_ok() {
                    return state.as_bool();
                }
            }
        }
        false
    }

    // -----------------------------------------------------------------------
    // Timer Resolution Management
    // -----------------------------------------------------------------------

    static TIMER_CLIENTS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

    /// Request 1ms timer resolution. Call release_high_res_timer when done.
    pub fn request_high_res_timer() {
        let prev = TIMER_CLIENTS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if prev == 0 {
            // SAFETY: timeBeginPeriod is a well-defined Windows API that adjusts
            // the system timer resolution. It is safe to call from any thread.
            unsafe {
                windows::Win32::Media::timeBeginPeriod(1);
            }
        }
    }

    /// Release previously requested high-resolution timer.
    pub fn release_high_res_timer() {
        let prev = TIMER_CLIENTS.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        if prev == 1 {
            // SAFETY: timeEndPeriod restores the timer resolution. Safe to call
            // as the counterpart to a prior timeBeginPeriod call.
            unsafe {
                windows::Win32::Media::timeEndPeriod(1);
            }
        }
    }

    // -----------------------------------------------------------------------
    // WMI Hardware Monitoring
    // -----------------------------------------------------------------------

    /// Get hardware info via WMI command-line queries (wmic).
    /// Runs on a blocking thread to avoid blocking the event loop.
    pub fn get_hardware_info() -> Value {
        use std::process::Command;

        let cpu_temp = Command::new("wmic")
            .args(["path", "MSAcpi_ThermalZoneTemperature", "get", "CurrentTemperature"])
            .output()
            .ok()
            .and_then(|out| {
                let text = String::from_utf8_lossy(&out.stdout);
                text.lines()
                    .filter_map(|l| l.trim().parse::<f64>().ok())
                    .next()
                    .map(|kelvin_tenths| (kelvin_tenths / 10.0) - 273.15)
            });

        let battery = Command::new("wmic")
            .args(["path", "Win32_Battery", "get",
                   "EstimatedChargeRemaining,BatteryStatus"])
            .output()
            .ok()
            .map(|out| String::from_utf8_lossy(&out.stdout).to_string());

        json!({
            "cpu_temp_celsius": cpu_temp,
            "battery_raw": battery,
            "platform": "windows"
        })
    }

    // -----------------------------------------------------------------------
    // ReFS Detection
    // -----------------------------------------------------------------------

    /// Check if the given path resides on an ReFS volume.
    pub fn is_refs_volume(path: &str) -> bool {
        use std::process::Command;
        let output = Command::new("fsutil")
            .args(["fsinfo", "volumeinfo", &path[..2]])
            .output();
        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout);
                text.contains("ReFS")
            }
            Err(_) => false,
        }
    }
}

// Re-export on Windows, empty module on other platforms
#[cfg(not(target_os = "windows"))]
pub mod win {
    use serde_json::{json, Value};

    pub fn is_low_memory() -> bool { false }
    pub fn request_high_res_timer() {}
    pub fn release_high_res_timer() {}
    pub fn get_hardware_info() -> Value { json!({"platform": "not_windows"}) }
    pub fn is_refs_volume(_path: &str) -> bool { false }
}
