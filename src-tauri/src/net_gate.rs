// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Settings › Network mode, enforced on the native side.
//!
//! The mode used to be saved and shown, and nothing consulted it: "Offline"
//! left every DEX request going out. Native request sites ask here first
//! (`check_url`, `check_lan`, `check_internet`); the renderer has the same rule
//! in `services/networkGate.ts`.
//!
//! * full       - no restriction
//! * local-only - this PC and the local network
//! * disabled   - this PC only (loopback: local AI, the dev server)
//!
//! It covers DEX's own traffic. Other programs, including commands run in
//! Terminal, are Windows' business.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::atomic::{AtomicU8, Ordering};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Full,
    LocalOnly,
    Disabled,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Reach {
    ThisPc,
    Lan,
    Internet,
}

static MODE: AtomicU8 = AtomicU8::new(0);

pub fn parse(mode: &str) -> Option<Mode> {
    match mode {
        "full" => Some(Mode::Full),
        "local-only" => Some(Mode::LocalOnly),
        "disabled" => Some(Mode::Disabled),
        _ => None,
    }
}

pub fn set(mode: Mode) {
    MODE.store(mode as u8, Ordering::SeqCst);
}

pub fn mode() -> Mode {
    match MODE.load(Ordering::SeqCst) {
        1 => Mode::LocalOnly,
        2 => Mode::Disabled,
        _ => Mode::Full,
    }
}

fn v4_reach(ip: Ipv4Addr) -> Reach {
    if ip.is_loopback() || ip.is_unspecified() {
        Reach::ThisPc
    } else if ip.is_private() || ip.is_link_local() || ip.is_broadcast() || ip.is_multicast() {
        Reach::Lan
    } else {
        Reach::Internet
    }
}

fn v6_reach(ip: Ipv6Addr) -> Reach {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return v4_reach(v4);
    }
    let first = ip.segments()[0];
    if ip.is_loopback() || ip.is_unspecified() {
        Reach::ThisPc
    } else if (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80 || ip.is_multicast() {
        Reach::Lan
    } else {
        Reach::Internet
    }
}

/// How far a host name or address reaches. A dotted public name counts as the
/// internet even if it happens to resolve to a LAN address.
pub fn reach_of_host(host: &str) -> Reach {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']').trim_end_matches('.').to_ascii_lowercase();
    if let Ok(ip) = h.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v) => v4_reach(v),
            IpAddr::V6(v) => v6_reach(v),
        };
    }
    if h == "localhost" || h.ends_with(".localhost") {
        Reach::ThisPc
    } else if h.ends_with(".local") || (!h.is_empty() && !h.contains('.')) {
        Reach::Lan
    } else {
        Reach::Internet
    }
}

pub fn allows(mode: Mode, reach: Reach) -> bool {
    match mode {
        Mode::Full => true,
        Mode::LocalOnly => reach != Reach::Internet,
        Mode::Disabled => reach == Reach::ThisPc,
    }
}

fn refusal(mode: Mode) -> String {
    match mode {
        Mode::Disabled => "DEX is offline (Settings › Network).".into(),
        _ => "DEX is limited to the local network (Settings › Network).".into(),
    }
}

fn check(reach: Reach) -> Result<(), String> {
    let m = mode();
    if allows(m, reach) {
        Ok(())
    } else {
        Err(refusal(m))
    }
}

/// May DEX request this URL now? Non-network schemes (data:, file:) pass.
pub fn check_url(url: &str) -> Result<(), String> {
    if mode() == Mode::Full {
        return Ok(());
    }
    match tauri::Url::parse(url) {
        Ok(u) if matches!(u.scheme(), "http" | "https" | "ws" | "wss" | "ftp") => {
            check(u.host_str().map(reach_of_host).unwrap_or(Reach::Internet))
        }
        Ok(_) => Ok(()),
        // Unparseable: treat as the internet rather than let it through.
        Err(_) => check(Reach::Internet),
    }
}

/// Sharing with other devices on the network (phone share, DEX-to-DEX).
pub fn check_lan() -> Result<(), String> {
    check(Reach::Lan)
}

/// Work that reaches the internet and has no single URL (git push/pull).
pub fn check_internet() -> Result<(), String> {
    check(Reach::Internet)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_are_classed_by_reach() {
        for h in ["localhost", "tauri.localhost", "127.0.0.1", "127.8.8.8", "[::1]", "0.0.0.0", "::ffff:127.0.0.1"] {
            assert_eq!(reach_of_host(h), Reach::ThisPc, "{h}");
        }
        for h in ["10.0.0.4", "172.31.2.2", "192.168.1.9", "169.254.4.4", "nas", "printer.local", "fd00::1", "fe80::2"] {
            assert_eq!(reach_of_host(h), Reach::Lan, "{h}");
        }
        for h in ["example.com", "8.8.8.8", "172.32.0.1", "192.168.example.com", "10.evil.net", "2606:4700::1111", ""] {
            assert_eq!(reach_of_host(h), Reach::Internet, "{h}");
        }
    }

    #[test]
    fn each_mode_allows_only_its_reach() {
        assert!(allows(Mode::Full, Reach::Internet));
        assert!(allows(Mode::LocalOnly, Reach::Lan));
        assert!(!allows(Mode::LocalOnly, Reach::Internet));
        assert!(allows(Mode::Disabled, Reach::ThisPc));
        assert!(!allows(Mode::Disabled, Reach::Lan));
        assert_eq!(parse("local-only"), Some(Mode::LocalOnly));
        assert_eq!(parse("everything"), None);
    }
}
