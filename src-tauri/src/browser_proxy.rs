// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Browse through Tor or a proxy, so sites see the proxy's address, not yours.
//!
//! No app can hide an IP address by itself; the traffic has to leave through
//! another network. DEX routes its Browser tabs through one the user runs:
//!   - Tor (the Tor service on 127.0.0.1:9050, or Tor Browser on 9150);
//!   - any SOCKS5 or HTTP proxy (a VPN provider's proxy, a company proxy).
//! A proxy cannot be switched on inside a running Edge engine, and DEX's own UI
//! shares that engine, so proxied tabs get their own engine and profile
//! (<data>/browser-proxy-<hash>): cookies there are separate from normal
//! browsing. DNS goes through SOCKS5 proxies too, and WebRTC is limited to the
//! proxy so it cannot leak the real address.
//!
//! Channels: browserProxy:get, browserProxy:set {enabled, kind, host, port},
//! browserProxy:test {kind?, host?, port?}.

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const STORE_FILE: &str = "browser-proxy.json";

#[derive(Clone, Debug, PartialEq)]
pub struct ProxySettings {
    pub enabled: bool,
    /// "tor" | "socks5" | "http"
    pub kind: String,
    pub host: String,
    pub port: u16,
}

impl Default for ProxySettings {
    fn default() -> Self {
        ProxySettings { enabled: false, kind: "tor".into(), host: "127.0.0.1".into(), port: 9050 }
    }
}

fn cache() -> &'static Mutex<Option<ProxySettings>> {
    static C: OnceLock<Mutex<Option<ProxySettings>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

/// Host names and IPv4/IPv6 literals only: nothing that could inject another browser flag.
pub fn valid_host(h: &str) -> bool {
    !h.is_empty() && h.len() <= 253 && h.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '[' | ']'))
}

pub fn parse(v: &Value) -> Result<ProxySettings, String> {
    let d = ProxySettings::default();
    let kind = v.get("kind").and_then(|k| k.as_str()).unwrap_or(&d.kind).to_ascii_lowercase();
    if !matches!(kind.as_str(), "tor" | "socks5" | "http") { return Err("Choose Tor, SOCKS5 or HTTP.".into()); }
    let host = v.get("host").and_then(|h| h.as_str()).unwrap_or(&d.host).trim().to_string();
    if !valid_host(&host) { return Err("The proxy address is not valid.".into()); }
    let port = v.get("port").and_then(|p| p.as_u64()).unwrap_or(d.port as u64);
    if !(1..=65535).contains(&port) { return Err("The port must be between 1 and 65535.".into()); }
    Ok(ProxySettings { enabled: v.get("enabled").and_then(|e| e.as_bool()).unwrap_or(false), kind, host, port: port as u16 })
}

/// `--proxy-server` value: Tor is SOCKS5 (hostnames resolved by the proxy).
pub fn proxy_url(s: &ProxySettings) -> String {
    let scheme = if s.kind == "http" { "http" } else { "socks5" };
    format!("{scheme}://{}:{}", s.host, s.port)
}

/// Engine arguments for proxied tabs, and the profile folder name for this proxy.
/// Keeps Tauri's default flags (a custom list replaces them).
pub fn engine_args(s: &ProxySettings) -> Option<(String, String)> {
    if !s.enabled || !valid_host(&s.host) { return None; }
    let url = proxy_url(s);
    let args = format!(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --proxy-server=\"{url}\" --proxy-bypass-list=\"<-loopback>\" --force-webrtc-ip-handling-policy=disable_non_proxied_udp"
    );
    // One profile per proxy: an engine's flags are fixed once it starts.
    let mut h: u64 = 0xcbf29ce484222325;
    for b in url.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    Some((args, format!("browser-proxy-{:08x}", h as u32)))
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

pub fn current(app: &tauri::AppHandle) -> ProxySettings {
    if let Ok(g) = cache().lock() { if let Some(s) = g.as_ref() { return s.clone(); } }
    let s = std::fs::read_to_string(store_path(app)).ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| parse(&v).ok())
        .unwrap_or_default();
    if let Ok(mut g) = cache().lock() { *g = Some(s.clone()); }
    s
}

/// Profile folder and engine args for a new Browser tab, when the proxy is on.
pub fn for_new_tab(app: &tauri::AppHandle) -> Option<(String, PathBuf)> {
    let s = current(app);
    let (args, dir) = engine_args(&s)?;
    let base = app.dex_data_dir().ok()?;
    Some((args, base.join(dir)))
}

fn to_json(s: &ProxySettings) -> Value {
    json!({ "enabled": s.enabled, "kind": s.kind, "host": s.host, "port": s.port, "url": proxy_url(s) })
}

/// Is something listening, and (for Tor / SOCKS5) does it answer the SOCKS5 greeting?
pub fn test(s: &ProxySettings) -> Value {
    let addr = match (s.host.trim_matches(['[', ']']), s.port).to_socket_addrs().ok().and_then(|mut a| a.next()) {
        Some(a) => a,
        None => return json!({ "ok": false, "error": "The proxy address could not be resolved." }),
    };
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_secs(2)) {
        Ok(st) => st,
        Err(_) => {
            let hint = if s.kind == "tor" {
                " Start Tor first: the Tor service listens on port 9050, Tor Browser on 9150 while it is open."
            } else { "" };
            return json!({ "ok": false, "error": format!("Nothing is listening on {}:{}.{hint}", s.host, s.port) });
        }
    };
    if s.kind == "http" {
        return json!({ "ok": true, "message": format!("A proxy is listening on {}:{}.", s.host, s.port) });
    }
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let mut reply = [0u8; 2];
    let ok = stream.write_all(&[0x05, 0x01, 0x00]).is_ok() && stream.read_exact(&mut reply).is_ok() && reply == [0x05, 0x00];
    if ok {
        json!({ "ok": true, "message": format!("{} is ready on {}:{}.", if s.kind == "tor" { "Tor" } else { "The SOCKS5 proxy" }, s.host, s.port) })
    } else {
        json!({ "ok": false, "error": format!("Something on {}:{} answered, but it is not a SOCKS5 proxy without a password.", s.host, s.port) })
    }
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "browserProxy:get" => to_json(&current(app)),
        "browserProxy:set" => match parse(&a0) {
            Ok(s) => {
                let _ = std::fs::write(store_path(app), serde_json::to_string_pretty(&to_json(&s)).unwrap_or_default());
                if let Ok(mut g) = cache().lock() { *g = Some(s.clone()); }
                to_json(&s)
            }
            Err(e) => json!({ "error": e }),
        },
        "browserProxy:test" => {
            let base = to_json(&current(app));
            let merged = if a0.is_object() {
                let mut m = base.as_object().cloned().unwrap_or_default();
                for (k, v) in a0.as_object().unwrap() { m.insert(k.clone(), v.clone()); }
                Value::Object(m)
            } else { base };
            match parse(&merged) { Ok(s) => test(&s), Err(e) => json!({ "ok": false, "error": e }) }
        }
        _ => json!({ "error": format!("unknown channel {channel}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn validates_and_builds_engine_args() {
        let s = parse(&json!({ "enabled": true, "kind": "tor", "host": "127.0.0.1", "port": 9050 })).unwrap();
        let (args, dir) = engine_args(&s).unwrap();
        assert!(args.contains("--proxy-server=\"socks5://127.0.0.1:9050\""));
        assert!(args.contains("disable_non_proxied_udp"));
        assert!(args.contains("msSmartScreenProtection"));
        assert!(dir.starts_with("browser-proxy-"));
        let http = parse(&json!({ "enabled": true, "kind": "http", "host": "proxy.corp.example", "port": 8080 })).unwrap();
        assert!(engine_args(&http).unwrap().0.contains("http://proxy.corp.example:8080"));
        assert_ne!(engine_args(&http).unwrap().1, dir, "each proxy gets its own profile");
        assert!(engine_args(&ProxySettings::default()).is_none(), "off = normal tabs");
    }

    #[test]
    fn refuses_addresses_that_could_inject_flags() {
        for host in ["127.0.0.1 --no-sandbox", "a\"b", "x;y", "", "host/path"] {
            assert!(parse(&json!({ "host": host })).is_err(), "{host}");
        }
        assert!(parse(&json!({ "port": 70000 })).is_err());
        assert!(parse(&json!({ "kind": "ftp" })).is_err());
    }

    #[test]
    fn test_reports_nothing_listening_and_a_real_socks5_greeting() {
        // A free port with nothing on it.
        let free = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let r = test(&ProxySettings { enabled: true, kind: "tor".into(), host: "127.0.0.1".into(), port: free });
        assert_eq!(r["ok"], false);
        assert!(r["error"].as_str().unwrap().contains("9050"));
        // A minimal SOCKS5 server that accepts "no authentication".
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((mut c, _)) = l.accept() {
                let mut hello = [0u8; 3];
                let _ = c.read_exact(&mut hello);
                let _ = c.write_all(&[0x05, 0x00]);
            }
        });
        let r = test(&ProxySettings { enabled: true, kind: "socks5".into(), host: "127.0.0.1".into(), port });
        assert_eq!(r["ok"], true, "{r}");
    }
}
