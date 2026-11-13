// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! Network-level ad/tracker blocking for Browser tabs.
//!
//! The renderer's injected page script only starts after a page has loaded, so
//! early ad and tracker requests got through. Every Browser tab now registers a
//! WebView2 `WebResourceRequested` filter (see `browser_view.rs`), and each
//! sub-resource request is checked here before it leaves the machine.
//!
//! Rules: a request is blocked when blocking is on, it is not the top-level
//! page itself, the page's site does not have Shields off, the request goes to
//! a different site than the page (first-party requests are never blocked), and
//! its host or a parent domain is on the list. The list is the built-in one plus
//! any imported filter list, pushed by the renderer (`browserView:setBlocking`).

use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::{OnceLock, RwLock};

#[derive(Default)]
pub struct BlockConfig {
    pub enabled: bool,
    pub hosts: HashSet<String>,
    pub shields_off: HashSet<String>,
}

const MAX_HOSTS: usize = 100_000;

fn config() -> &'static RwLock<BlockConfig> {
    static CFG: OnceLock<RwLock<BlockConfig>> = OnceLock::new();
    CFG.get_or_init(|| RwLock::new(BlockConfig::default()))
}

pub fn normalize_host(h: &str) -> String {
    let h = h.trim().trim_end_matches('.').to_ascii_lowercase();
    h.strip_prefix("www.").map(str::to_string).unwrap_or(h)
}

/// The host and each parent domain: a.b.example.com, b.example.com, example.com, com.
fn host_and_parents(host: &str) -> impl Iterator<Item = &str> {
    let mut rest = Some(host);
    std::iter::from_fn(move || {
        let cur = rest?;
        rest = cur.find('.').map(|i| &cur[i + 1..]);
        Some(cur)
    })
}

/// A practical registrable domain ("site"): the last two labels, or three for
/// common second-level registries such as co.uk / com.au.
pub fn site_of(host: &str) -> String {
    let labels: Vec<&str> = host.split('.').filter(|l| !l.is_empty()).collect();
    if labels.len() <= 2 {
        return labels.join(".");
    }
    let tld = labels[labels.len() - 1];
    let sld = labels[labels.len() - 2];
    let take = if tld.len() == 2 && matches!(sld, "co" | "com" | "net" | "org" | "gov" | "ac" | "edu" | "ne" | "or") { 3 } else { 2 };
    labels[labels.len() - take.min(labels.len())..].join(".")
}

fn url_host(url: &str) -> Option<String> {
    let u = tauri::Url::parse(url).ok()?;
    match u.scheme() {
        "http" | "https" | "ws" | "wss" => u.host_str().map(normalize_host),
        _ => None,
    }
}

/// Decide one request against a config. `is_document` = the top-level page load.
pub fn decide(cfg: &BlockConfig, request_url: &str, page_url: &str, is_document: bool) -> bool {
    if !cfg.enabled || is_document || cfg.hosts.is_empty() {
        return false;
    }
    let Some(req) = url_host(request_url) else { return false };
    let page = url_host(page_url).unwrap_or_default();
    if !page.is_empty() {
        if host_and_parents(&page).any(|h| cfg.shields_off.contains(h)) {
            return false;
        }
        if site_of(&req) == site_of(&page) {
            return false;
        }
    }
    let blocked = host_and_parents(&req).any(|h| h.contains('.') && cfg.hosts.contains(h));
    blocked
}

pub fn should_block(request_url: &str, page_url: &str, is_document: bool) -> bool {
    match config().read() {
        Ok(cfg) => decide(&cfg, request_url, page_url, is_document),
        Err(_) => false,
    }
}

/// `browserView:setBlocking` `[{ enabled, hosts: [...], shieldsOff: [...] }]`.
pub fn set_blocking(arg: Option<&Value>) -> Value {
    let Some(o) = arg.and_then(|v| v.as_object()) else { return json!({ "success": false, "error": "expected an object" }) };
    let list = |k: &str, cap: usize| -> HashSet<String> {
        o.get(k)
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str()).map(normalize_host).filter(|h| h.contains('.') && h.len() <= 253).take(cap).collect())
            .unwrap_or_default()
    };
    let next = BlockConfig {
        enabled: o.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false),
        hosts: list("hosts", MAX_HOSTS),
        shields_off: list("shieldsOff", 10_000),
    };
    let n = next.hosts.len();
    match config().write() {
        Ok(mut cfg) => {
            *cfg = next;
            json!({ "success": true, "hosts": n })
        }
        Err(_) => json!({ "success": false, "error": "blocking state unavailable" }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(hosts: &[&str], off: &[&str]) -> BlockConfig {
        BlockConfig {
            enabled: true,
            hosts: hosts.iter().map(|s| s.to_string()).collect(),
            shields_off: off.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn blocks_listed_third_party_hosts_and_subdomains() {
        let c = cfg(&["doubleclick.net", "tracker.example.org"], &[]);
        assert!(decide(&c, "https://ad.doubleclick.net/x.js", "https://news.com/", false));
        assert!(decide(&c, "https://doubleclick.net/x.js", "https://news.com/", false));
        assert!(decide(&c, "https://tracker.example.org/p.gif", "https://news.com/", false));
        // Label boundary: "notdoubleclick.net" is not "doubleclick.net".
        assert!(!decide(&c, "https://notdoubleclick.net/x.js", "https://news.com/", false));
        // Parent of a listed host is not blocked.
        assert!(!decide(&c, "https://example.org/", "https://news.com/", false));
    }

    #[test]
    fn never_blocks_the_page_itself_first_party_or_shields_off_sites() {
        let c = cfg(&["doubleclick.net", "ads.news.com"], &["shop.com"]);
        assert!(!decide(&c, "https://ad.doubleclick.net/", "https://news.com/", true));
        assert!(!decide(&c, "https://ads.news.com/a.js", "https://www.news.com/", false));
        assert!(!decide(&c, "https://ad.doubleclick.net/", "https://m.shop.com/cart", false));
        assert!(decide(&c, "https://ad.doubleclick.net/", "https://other.com/", false));
    }

    #[test]
    fn off_or_empty_blocks_nothing_and_non_web_schemes_pass() {
        let mut c = cfg(&["doubleclick.net"], &[]);
        assert!(!decide(&c, "data:text/plain,hi", "https://news.com/", false));
        assert!(!decide(&c, "blob:https://news.com/1", "https://news.com/", false));
        c.enabled = false;
        assert!(!decide(&c, "https://ad.doubleclick.net/", "https://news.com/", false));
        assert!(!decide(&cfg(&[], &[]), "https://ad.doubleclick.net/", "https://news.com/", false));
    }

    #[test]
    fn site_of_handles_second_level_registries() {
        assert_eq!(site_of("a.b.example.com"), "example.com");
        assert_eq!(site_of("www.bbc.co.uk"), "bbc.co.uk");
        assert_eq!(site_of("shop.example.com.au"), "example.com.au");
        assert_eq!(site_of("localhost"), "localhost");
        // So a tracker on another .co.uk site is still third-party.
        let c = cfg(&["ads.tracker.co.uk"], &[]);
        assert!(decide(&c, "https://ads.tracker.co.uk/", "https://bbc.co.uk/", false));
    }

    #[test]
    fn set_blocking_normalises_and_caps_input() {
        let r = set_blocking(Some(&json!({ "enabled": true, "hosts": ["WWW.Ads.Example.com.", "nodot", 5], "shieldsOff": ["News.com"] })));
        assert_eq!(r["hosts"], 1);
        assert!(should_block("https://ads.example.com/a.js", "https://other.org/", false));
        assert!(!should_block("https://ads.example.com/a.js", "https://news.com/", false));
        assert_eq!(set_blocking(Some(&json!("nope")))["success"], false);
        set_blocking(Some(&json!({ "enabled": false })));
        assert!(!should_block("https://ads.example.com/a.js", "https://other.org/", false));
    }
}
