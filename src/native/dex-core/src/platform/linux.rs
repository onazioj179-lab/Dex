// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Linux platform optimizations.
// io_uring-style async IO, cgroups v2, inotify, PSI, CPU frequency,
// transparent huge pages, realtime thread priorities.

#[cfg(target_os = "linux")]
pub mod linux {
    use serde_json::{json, Value};
    use std::fs;
    use std::io::{self, Read, Write, BufRead, BufReader, BufWriter};
    use std::path::Path;

    // -----------------------------------------------------------------------
    // PSI (Pressure Stall Information) monitoring
    // -----------------------------------------------------------------------

    /// Read pressure stall information for the given resource.
    /// resource: "memory", "cpu", or "io"
    /// Returns avg10, avg60, avg300, total for both 'some' and 'full' lines.
    pub fn read_psi(resource: &str) -> Value {
        let path = format!("/proc/pressure/{}", resource);
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => return json!({"available": false}),
        };

        let mut result = json!({"available": true, "resource": resource});

        for line in content.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            let kind = parts[0]; // "some" or "full"

            let parse_field = |field: &str| -> f64 {
                field.split('=')
                    .nth(1)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0.0)
            };

            let avg10 = parse_field(parts[1]);
            let avg60 = parse_field(parts[2]);
            let avg300 = parse_field(parts[3]);
            let total: u64 = parts[4].split('=')
                .nth(1)
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);

            result[kind] = json!({
                "avg10": avg10,
                "avg60": avg60,
                "avg300": avg300,
                "total": total
            });
        }

        result
    }

    /// Quick check: is PSI available on this kernel?
    pub fn psi_available() -> bool {
        Path::new("/proc/pressure/memory").exists()
    }

    // -----------------------------------------------------------------------
    // cgroups v2 memory info
    // -----------------------------------------------------------------------

    /// Read cgroup v2 memory usage for the current process.
    pub fn get_cgroup_memory_info() -> Value {
        // Find which cgroup the process belongs to
        let cgroup_path = match fs::read_to_string("/proc/self/cgroup") {
            Ok(c) => {
                // cgroup v2 format: "0::/path"
                let line = c.lines().next().unwrap_or("").to_string();
                let path = line.splitn(3, ':').nth(2).unwrap_or("").to_string();
                if path.is_empty() {
                    return json!({"available": false, "reason": "no cgroup path"});
                }
                format!("/sys/fs/cgroup{}", path)
            }
            Err(_) => return json!({"available": false, "reason": "cannot read /proc/self/cgroup"}),
        };

        let read_value = |name: &str| -> Option<u64> {
            let file_path = format!("{}/{}", cgroup_path, name);
            fs::read_to_string(file_path).ok()
                .and_then(|s| s.trim().parse().ok())
        };

        let current = read_value("memory.current");
        let max = read_value("memory.max");
        let high = read_value("memory.high");
        let swap_current = read_value("memory.swap.current");

        json!({
            "available": true,
            "cgroup_path": cgroup_path,
            "memory_current": current,
            "memory_max": max,
            "memory_high": high,
            "swap_current": swap_current
        })
    }

    /// Check if cgroups v2 is available.
    pub fn cgroups_v2_available() -> bool {
        Path::new("/sys/fs/cgroup/cgroup.controllers").exists()
    }

    // -----------------------------------------------------------------------
    // inotify filesystem watcher helper
    // -----------------------------------------------------------------------

    /// Get the maximum number of inotify watches allowed.
    pub fn get_inotify_max_watches() -> u64 {
        fs::read_to_string("/proc/sys/fs/inotify/max_user_watches")
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(8192)
    }

    /// Check if inotify is available.
    pub fn inotify_available() -> bool {
        Path::new("/proc/sys/fs/inotify/max_user_watches").exists()
    }

    // -----------------------------------------------------------------------
    // CPU Frequency Governor
    // -----------------------------------------------------------------------

    /// Read the current CPU frequency governor for a specific core.
    pub fn get_cpu_governor(core: u32) -> Option<String> {
        let path = format!(
            "/sys/devices/system/cpu/cpu{}/cpufreq/scaling_governor",
            core
        );
        fs::read_to_string(path).ok().map(|s| s.trim().to_string())
    }

    /// Get current CPU frequency in KHz for a specific core.
    pub fn get_cpu_frequency_khz(core: u32) -> Option<u64> {
        let path = format!(
            "/sys/devices/system/cpu/cpu{}/cpufreq/scaling_cur_freq",
            core
        );
        fs::read_to_string(path).ok()
            .and_then(|s| s.trim().parse().ok())
    }

    /// Get available CPU governors.
    pub fn get_available_governors(core: u32) -> Vec<String> {
        let path = format!(
            "/sys/devices/system/cpu/cpu{}/cpufreq/scaling_available_governors",
            core
        );
        fs::read_to_string(path).ok()
            .map(|s| s.trim().split_whitespace().map(String::from).collect())
            .unwrap_or_default()
    }

    // -----------------------------------------------------------------------
    // Transparent Huge Pages
    // -----------------------------------------------------------------------

    /// Check if transparent huge pages are enabled.
    pub fn thp_enabled() -> Option<String> {
        fs::read_to_string("/sys/kernel/mm/transparent_hugepage/enabled")
            .ok()
            .and_then(|s| {
                // Format: "always [madvise] never"
                s.split('[')
                    .nth(1)
                    .and_then(|inner| inner.split(']').next())
                    .map(String::from)
            })
    }

    /// Advise the kernel to use huge pages for a memory region via madvise.
    /// Returns true on success.
    pub fn advise_huge_pages(addr: *mut libc::c_void, len: usize) -> bool {
        // SAFETY: madvise with MADV_HUGEPAGE is an advisory hint to the kernel
        // about memory usage patterns. The caller must ensure addr and len
        // refer to a valid mapped region. This does not modify the memory itself.
        let result = unsafe { libc::madvise(addr, len, libc::MADV_HUGEPAGE) };
        result == 0
    }

    // -----------------------------------------------------------------------
    // io_uring availability detection
    // -----------------------------------------------------------------------

    /// Check if io_uring is available on this kernel.
    pub fn io_uring_available() -> bool {
        // io_uring was added in Linux 5.1. Check by trying to read the kernel version.
        match fs::read_to_string("/proc/version") {
            Ok(v) => {
                let parts: Vec<&str> = v.split_whitespace().collect();
                if let Some(version_str) = parts.get(2) {
                    let nums: Vec<u32> = version_str
                        .split('.')
                        .take(2)
                        .filter_map(|s| s.parse().ok())
                        .collect();
                    if nums.len() >= 2 {
                        return nums[0] > 5 || (nums[0] == 5 && nums[1] >= 1);
                    }
                }
                false
            }
            Err(_) => false,
        }
    }

    // -----------------------------------------------------------------------
    // Buffered async file transfer (io_uring fallback -- standard async IO)
    // -----------------------------------------------------------------------

    /// Transfer a file using buffered IO with large buffers.
    /// This is the actual transfer path -- we use 256KB buffers to
    /// minimize syscall overhead, which captures the primary benefit
    /// of io_uring for sequential transfers.
    pub fn transfer_file_buffered(
        source: &str,
        dest: &str,
    ) -> io::Result<u64> {
        let src = fs::File::open(source)?;
        let src_meta = src.metadata()?;
        let total = src_meta.len();

        if let Some(parent) = Path::new(dest).parent() {
            fs::create_dir_all(parent)?;
        }

        let dst = fs::File::create(dest)?;
        let mut reader = BufReader::with_capacity(256 * 1024, src);
        let mut writer = BufWriter::with_capacity(256 * 1024, dst);

        let mut transferred: u64 = 0;
        loop {
            let buf = reader.fill_buf()?;
            if buf.is_empty() {
                break;
            }
            let n = buf.len();
            writer.write_all(buf)?;
            reader.consume(n);
            transferred += n as u64;
        }

        writer.flush()?;
        Ok(transferred)
    }

    // -----------------------------------------------------------------------
    // Realtime thread priority
    // -----------------------------------------------------------------------

    /// Set the current thread to SCHED_FIFO with the given priority (1-99).
    /// Returns true on success. Requires CAP_SYS_NICE or root privileges.
    pub fn set_realtime_priority(priority: i32) -> bool {
        let priority = priority.clamp(1, 99);
        let param = libc::sched_param {
            sched_priority: priority,
        };
        // SAFETY: sched_setscheduler with pid 0 sets the current thread
        // scheduling policy. The sched_param struct is properly initialized.
        let result = unsafe {
            libc::sched_setscheduler(0, libc::SCHED_FIFO, &param)
        };
        result == 0
    }

    /// Reset the current thread to the default CFS scheduler.
    pub fn reset_to_normal_priority() -> bool {
        let param = libc::sched_param {
            sched_priority: 0,
        };
        // SAFETY: Same as set_realtime_priority -- resets to SCHED_OTHER.
        let result = unsafe {
            libc::sched_setscheduler(0, libc::SCHED_OTHER, &param)
        };
        result == 0
    }

    // -----------------------------------------------------------------------
    // Consolidated platform info
    // -----------------------------------------------------------------------

    pub fn get_linux_info() -> Value {
        let kernel_version = fs::read_to_string("/proc/version")
            .ok()
            .and_then(|v| v.split_whitespace().nth(2).map(String::from))
            .unwrap_or_else(|| "unknown".to_string());

        json!({
            "kernel_version": kernel_version,
            "io_uring_available": io_uring_available(),
            "psi_available": psi_available(),
            "cgroups_v2": cgroups_v2_available(),
            "inotify_available": inotify_available(),
            "inotify_max_watches": get_inotify_max_watches(),
            "thp_enabled": thp_enabled(),
            "psi_memory": read_psi("memory"),
            "psi_cpu": read_psi("cpu"),
            "psi_io": read_psi("io"),
            "cgroup_memory": get_cgroup_memory_info()
        })
    }
}

// Stub module for non-Linux platforms
#[cfg(not(target_os = "linux"))]
pub mod linux {
    use serde_json::{json, Value};

    pub fn read_psi(_resource: &str) -> Value { json!({"available": false}) }
    pub fn psi_available() -> bool { false }
    pub fn get_cgroup_memory_info() -> Value { json!({"available": false}) }
    pub fn cgroups_v2_available() -> bool { false }
    pub fn get_inotify_max_watches() -> u64 { 0 }
    pub fn inotify_available() -> bool { false }
    pub fn get_cpu_governor(_core: u32) -> Option<String> { None }
    pub fn get_cpu_frequency_khz(_core: u32) -> Option<u64> { None }
    pub fn get_available_governors(_core: u32) -> Vec<String> { Vec::new() }
    pub fn thp_enabled() -> Option<String> { None }
    pub fn io_uring_available() -> bool { false }
    pub fn set_realtime_priority(_priority: i32) -> bool { false }
    pub fn reset_to_normal_priority() -> bool { false }
    pub fn get_linux_info() -> Value { json!({"platform": "not_linux"}) }
}
