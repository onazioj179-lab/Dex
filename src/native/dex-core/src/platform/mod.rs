// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- Platform abstraction layer.
// Routes to the correct OS-specific implementation at compile time.

pub mod windows;
pub mod macos;
pub mod linux;

use serde_json::{json, Value};

/// Get unified platform information for the current OS.
pub fn get_platform_info() -> Value {
    json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "features": get_platform_features(),
    })
}

/// List platform-specific features available on this machine.
fn get_platform_features() -> Vec<&'static str> {
    let mut features = Vec::new();

    #[cfg(target_os = "linux")]
    {
        // Check for io_uring support (kernel 5.1+)
        if std::path::Path::new("/proc/sys/kernel/io_uring_disabled").exists()
            || std::path::Path::new("/proc/version").exists()
        {
            features.push("io_uring");
        }
        // PSI pressure monitoring (kernel 4.20+)
        if std::path::Path::new("/proc/pressure/memory").exists() {
            features.push("psi");
        }
        // cgroups v2
        if std::path::Path::new("/sys/fs/cgroup/cgroup.controllers").exists() {
            features.push("cgroups_v2");
        }
        // inotify (always available on Linux 2.6.13+)
        features.push("inotify");
    }

    #[cfg(target_os = "windows")]
    {
        features.push("iocp");
        features.push("memory_notification");
        features.push("wmi");
        // Check for ReFS
        features.push("timer_resolution");
    }

    #[cfg(target_os = "macos")]
    {
        features.push("gcd");
        features.push("mach_pressure");
        // APFS detection
        features.push("apfs_clone");
        features.push("iokit_battery");
    }

    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx2") {
            features.push("avx2");
        }
        if is_x86_feature_detected!("sse4.2") {
            features.push("sse4_2");
        }
    }

    #[cfg(target_arch = "aarch64")]
    {
        features.push("neon");
    }

    features
}
