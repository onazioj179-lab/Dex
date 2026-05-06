// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- macOS platform optimizations.
// GCD integration, APFS clonefile, IOKit battery, Mach memory pressure.

#[cfg(target_os = "macos")]
pub mod mac {
    use serde_json::{json, Value};

    // -----------------------------------------------------------------------
    // APFS Clonefile -- instant copy-on-write file cloning
    // -----------------------------------------------------------------------

    /// Clone a file using APFS copy-on-write if the filesystem supports it.
    /// Returns true if clonefile succeeded, false if the caller should
    /// fall back to a standard byte copy.
    pub fn try_clonefile(source: &str, dest: &str) -> bool {
        use std::ffi::CString;
        let src = match CString::new(source) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let dst = match CString::new(dest) {
            Ok(s) => s,
            Err(_) => return false,
        };

        // SAFETY: clonefile is a POSIX-like system call on macOS that creates
        // a copy-on-write clone. Both paths are valid C strings allocated above.
        // The call only reads source metadata and creates a new directory entry.
        let result = unsafe {
            libc::clonefile(src.as_ptr(), dst.as_ptr(), 0)
        };
        result == 0
    }

    /// Check if the path resides on an APFS volume via statfs.
    pub fn is_apfs(path: &str) -> bool {
        use std::ffi::CString;
        let cpath = match CString::new(path) {
            Ok(s) => s,
            Err(_) => return false,
        };
        let mut stat: libc::statfs = unsafe { std::mem::zeroed() };
        // SAFETY: statfs reads filesystem metadata. The struct is properly
        // zeroed and the path is a valid C string.
        let result = unsafe { libc::statfs(cpath.as_ptr(), &mut stat) };
        if result != 0 {
            return false;
        }
        let fstype = unsafe {
            std::ffi::CStr::from_ptr(stat.f_fstypename.as_ptr())
        };
        fstype.to_str().map_or(false, |s| s == "apfs")
    }

    // -----------------------------------------------------------------------
    // IOKit Battery Monitoring
    // -----------------------------------------------------------------------

    /// Get battery information from IOKit via the pmset command.
    pub fn get_battery_info() -> Value {
        use std::process::Command;
        let output = Command::new("pmset").args(["-g", "batt"]).output();
        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout).to_string();
                let charging = text.contains("charging") && !text.contains("discharging");
                let percent: Option<u32> = text.split('%').next()
                    .and_then(|s| s.rsplit('\t').next().or_else(|| s.rsplit(' ').next()))
                    .and_then(|s| s.trim().parse().ok());

                json!({
                    "percent": percent,
                    "charging": charging,
                    "raw": text,
                    "platform": "macos"
                })
            }
            Err(_) => json!({"platform": "macos", "error": "pmset not available"}),
        }
    }

    // -----------------------------------------------------------------------
    // Mach Memory Pressure
    // -----------------------------------------------------------------------

    /// Get memory pressure level from the macOS memory_pressure tool.
    pub fn get_memory_pressure() -> &'static str {
        use std::process::Command;
        let output = Command::new("memory_pressure").arg("-Q").output();
        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout);
                if text.contains("critical") || text.contains("urgent") {
                    "critical"
                } else if text.contains("warn") {
                    "high"
                } else {
                    "normal"
                }
            }
            Err(_) => "normal",
        }
    }

    // -----------------------------------------------------------------------
    // GCD Quality of Service helpers
    // -----------------------------------------------------------------------

    /// QoS class identifiers matching GCD dispatch queue priorities.
    #[derive(Clone, Copy, Debug)]
    pub enum QosClass {
        UserInteractive,
        UserInitiated,
        Utility,
        Background,
    }

    impl QosClass {
        pub fn as_str(&self) -> &'static str {
            match self {
                QosClass::UserInteractive => "user_interactive",
                QosClass::UserInitiated => "user_initiated",
                QosClass::Utility => "utility",
                QosClass::Background => "background",
            }
        }
    }
}

// Stub module for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub mod mac {
    use serde_json::{json, Value};

    pub fn try_clonefile(_source: &str, _dest: &str) -> bool { false }
    pub fn is_apfs(_path: &str) -> bool { false }
    pub fn get_battery_info() -> Value { json!({"platform": "not_macos"}) }
    pub fn get_memory_pressure() -> &'static str { "normal" }
}
