// =============================================================================
// DEX 6.0 — Link Preview fetch (native, Tauri port of LinkPreviewManager.fetchPreview)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native, network-capable implementation of `link-preview:fetch`. The pure-DB
//! `link_preview` module (sibling) only serves cached rows and degrades to null
//! on a cache MISS because the HTTP/OpenGraph scrape does not belong in a DB
//! layer. This module restores the real Electron behaviour (`net.request` + HTML
//! scraping) using the `AppHandle`, exactly like the other `native_ops::*`
//! commands: it owns the network call and performs it OUTSIDE the shared dex.db
//! mutex, then upserts the result through `with_conn`.
//!
//! Parity with src/main/core/LinkPreviewManager.ts fetchPreview(url):
//!   1. enabled flag (`settings.link_preview_enabled`, `val !== 'false'`) — when
//!      disabled, return null.
//!   2. url_hash = sha256(url) first 32 hex chars (crate::licensing::sha256_hex).
//!   3. cache READ of `link_previews` by url_hash — return the cached row if any.
//!   4. on MISS, HTTP GET the url (capped read), scrape og:title || <title> and
//!      og:description, UPSERT into `link_previews`, and return the stored row.
//!   5. on network/parse failure, return null (the TS try/catch failure path).
//!
//! Row shape is identical to `link_preview::row_to_json`:
//!   { id, url_hash, url, title, description, fetched_at }
//! `link_previews` has no image column, so og:image is not persisted (the TS
//! never stored it either); the generic meta scanner below still supports it.

use crate::native_ops::{now_ms, with_conn};
use rusqlite::{params, types::Value as SqlValue, Connection};
use serde_json::{json, Value};
use std::io::Read;
use std::time::Duration;

/// Request timeout (the TS used a 3s timeout; allow a little more headroom).
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);
/// Cap the body read so a huge page can't blow up memory (the TS capped ~50KB;
/// we allow up to 512KB to comfortably contain the <head> on heavier pages).
const MAX_BODY_BYTES: u64 = 512 * 1024;
const USER_AGENT: &str = "DEX-LinkPreview/6.0";

const SELECT_COLS: &str =
    "SELECT id, url_hash, url, title, description, fetched_at FROM link_previews WHERE url_hash = ?";

/// url_hash = sha256(url) first 32 hex chars — matches LinkPreviewManager.hashUrl.
fn hash_url(url: &str) -> String {
    crate::licensing::sha256_hex(url.as_bytes())[..32].to_string()
}

/// loadSettings parity: `link_preview_enabled` defaults to 'true'; enabled unless
/// the stored value is exactly the string 'false'.
fn is_enabled(conn: &Connection) -> bool {
    let val: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?",
            params!["link_preview_enabled"],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "true".to_string());
    val != "false"
}

/// One link_previews row -> the LinkPreview shape (column order == SELECT_COLS),
/// matching link_preview::row_to_json exactly.
fn row_to_json(conn: &Connection, url_hash: &str) -> Value {
    conn.query_row(SELECT_COLS, params![url_hash], |row| {
        Ok(json!({
            "id": row.get::<_, i64>(0)?,
            "url_hash": row.get::<_, String>(1)?,
            "url": row.get::<_, String>(2)?,
            "title": row.get::<_, String>(3)?,
            "description": row.get::<_, String>(4)?,
            "fetched_at": row.get::<_, i64>(5)?,
        }))
    })
    .unwrap_or(Value::Null)
}

/// `link-preview:fetch` — fetchPreview(url). args[0] = url (string).
///
/// Order mirrors the TS: disabled -> null; cached row present -> return it;
/// cache MISS -> HTTP GET (outside the db lock) + scrape + UPSERT + return row.
/// Any network/parse failure returns null (the TS catch path).
pub fn fetch(app: &tauri::AppHandle, args: &Value) -> Value {
    let url = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    if url.is_empty() {
        return Value::Null;
    }
    let url_hash = hash_url(&url);

    // Phase 1 (under the db lock): honor the enabled flag and serve any cached row.
    let cached = with_conn(app, |conn| {
        if !is_enabled(conn) {
            // Sentinel telling the caller to stop early WITHOUT a network fetch.
            return json!({ "__disabled": true });
        }
        row_to_json(conn, &url_hash)
    });
    if cached.get("__disabled").and_then(|v| v.as_bool()) == Some(true) {
        return Value::Null;
    }
    if cached.is_object() {
        // A real cached row (object with the LinkPreview fields).
        return cached;
    }
    // cached is Null here: either a genuine cache miss or the DB is unavailable.

    // Phase 2 (NO db lock held): perform the network fetch + HTML scrape.
    let html = match http_get(&url) {
        Some(body) => body,
        None => return Value::Null, // network failure -> null (TS catch path).
    };
    let title = extract_meta(&html, "og:title")
        .or_else(|| extract_title(&html))
        .unwrap_or_default();
    let description = extract_meta(&html, "og:description").unwrap_or_default();
    let now = now_ms();

    // Phase 3 (under the db lock again): UPSERT and return the stored row. The
    // ON CONFLICT mirrors the TS INSERT ... ON CONFLICT(url_hash) DO UPDATE.
    let stored = with_conn(app, |conn| {
        let res = conn.execute(
            "INSERT INTO link_previews (url_hash, url, title, description, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(url_hash) DO UPDATE SET title = ?3, description = ?4, fetched_at = ?5",
            params![
                SqlValue::Text(url_hash.clone()),
                SqlValue::Text(url.clone()),
                SqlValue::Text(title.clone()),
                SqlValue::Text(description.clone()),
                SqlValue::Integer(now),
            ],
        );
        if res.is_err() {
            return Value::Null;
        }
        row_to_json(conn, &url_hash)
    });

    if stored.is_object() {
        return stored;
    }
    // DB unavailable (with_conn -> Null): mirror the TS no-db fallback, which
    // returns the freshly-fetched record with id 0 rather than null.
    json!({
        "id": 0,
        "url_hash": url_hash,
        "url": url,
        "title": title,
        "description": description,
        "fetched_at": now,
    })
}

// --- HTTP -------------------------------------------------------------------

/// SSRF guard: the URL is renderer-supplied, so refuse to fetch anything that is
/// not a public http(s) endpoint. Blocks loopback/localhost, private (RFC1918),
/// link-local (incl. cloud metadata 169.254.x), unspecified, and IPv6 ULA/
/// link-local IP literals. Non-IP hostnames are allowed (resolving them would
/// need a DNS dependency); this still closes the common literal-IP/localhost
/// vectors a compromised renderer would use to reach internal services.
fn is_safe_public_url(url: &str) -> bool {
    let rest = match url.split_once("://") {
        Some((scheme, rest)) => {
            let s = scheme.to_ascii_lowercase();
            if s != "http" && s != "https" {
                return false;
            }
            rest
        }
        None => return false,
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let hostport = authority.rsplit_once('@').map(|(_, h)| h).unwrap_or(authority);
    let host = if let Some(after) = hostport.strip_prefix('[') {
        // IPv6 literal: [addr]:port
        match after.split_once(']') {
            Some((addr, _)) => addr.to_string(),
            None => return false,
        }
    } else {
        hostport.rsplit_once(':').map(|(h, _)| h).unwrap_or(hostport).to_string()
    };
    let host = host.to_ascii_lowercase();
    if host.is_empty() || host == "localhost" || host.ends_with(".localhost") {
        return false;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => {
                !(v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_unspecified()
                    || v4.is_broadcast()
                    || v4.is_documentation()
                    || v4.octets()[0] == 0)
            }
            std::net::IpAddr::V6(v6) => {
                !(v6.is_loopback()
                    || v6.is_unspecified()
                    || (v6.segments()[0] & 0xfe00) == 0xfc00  // ULA fc00::/7
                    || (v6.segments()[0] & 0xffc0) == 0xfe80) // link-local fe80::/10
            }
        };
    }
    true
}

/// GET `url` and return the body as a String (capped at MAX_BODY_BYTES), or None
/// on any transport / HTTP error — the network-failure branch of the TS fetch.
fn http_get(url: &str) -> Option<String> {
    // SSRF: refuse non-public targets (treated as a network failure by callers).
    if !is_safe_public_url(url) {
        return None;
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(FETCH_TIMEOUT)
        .build();
    let resp = agent.get(url).set("User-Agent", USER_AGENT).call().ok()?;

    let mut buf = Vec::new();
    // Read::take caps the bytes pulled from the socket so a huge page can't OOM us.
    resp.into_reader()
        .take(MAX_BODY_BYTES)
        .read_to_end(&mut buf)
        .ok()?;
    // Lossy UTF-8 keeps us robust against odd encodings (we only scrape ASCII tags).
    Some(String::from_utf8_lossy(&buf).into_owned())
}

// --- Minimal, regex-free HTML scraping --------------------------------------

/// Decode the handful of HTML entities that show up in title/description text.
/// Mirrors the practical subset the renderer expects (&amp; &lt; &gt; &quot; &#39;).
fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}

/// Extract a `<meta property="<prop>" content="...">` value (or the reversed
/// content-then-property order), case-insensitively, attribute-quote-agnostic.
/// Pure string scanning — no regex, no new crate. Returns the decoded content.
fn extract_meta(html: &str, prop: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find("<meta") {
        let tag_start = search_from + rel;
        // Bound the tag at its closing '>'; skip a tag with no terminator.
        let tag_end = match lower[tag_start..].find('>') {
            Some(e) => tag_start + e,
            None => break,
        };
        let tag_lower = &lower[tag_start..tag_end];
        let tag_raw = &html[tag_start..tag_end];

        // The tag must reference this property via property= or name= (OpenGraph
        // is usually `property`, but some sites emit `name`); match the value.
        if meta_attr_matches(tag_lower, "property", prop)
            || meta_attr_matches(tag_lower, "name", prop)
        {
            if let Some(content) = attr_value(tag_raw, tag_lower, "content") {
                if !content.is_empty() {
                    return Some(decode_entities(content.trim()));
                }
            }
        }
        search_from = tag_end + 1;
    }
    None
}

/// True when `<attr>` in the (already-lowercased) tag equals `expected` (the
/// expected value is itself lowercase, e.g. "og:title").
fn meta_attr_matches(tag_lower: &str, attr: &str, expected: &str) -> bool {
    match attr_value(tag_lower, tag_lower, attr) {
        Some(v) => v.trim() == expected,
        None => false,
    }
}

/// Read an attribute value out of a tag. `tag_raw` carries original casing for
/// the returned value; `tag_lower` is the lowercased twin used for locating the
/// attribute name and its quote. Handles single OR double quotes; tolerates
/// whitespace around '='.
fn attr_value<'a>(tag_raw: &'a str, tag_lower: &str, attr: &str) -> Option<&'a str> {
    let mut from = 0usize;
    while let Some(rel) = tag_lower[from..].find(attr) {
        let name_start = from + rel;
        // Ensure this is a standalone attribute name (preceded by start/space/quote)
        // so `name` doesn't match inside e.g. `data-name`.
        let ok_before = name_start == 0
            || matches!(
                tag_lower.as_bytes()[name_start - 1],
                b' ' | b'\t' | b'\n' | b'\r' | b'"' | b'\''
            );
        let after = name_start + attr.len();
        if ok_before {
            // Skip whitespace then expect '='.
            let mut i = after;
            let bytes = tag_lower.as_bytes();
            while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'=' {
                i += 1;
                while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
                    i += 1;
                }
                if i < bytes.len() {
                    let quote = bytes[i];
                    if quote == b'"' || quote == b'\'' {
                        let val_start = i + 1;
                        if let Some(end_rel) = tag_lower[val_start..].find(quote as char) {
                            let val_end = val_start + end_rel;
                            return Some(&tag_raw[val_start..val_end]);
                        }
                    }
                }
            }
        }
        from = after;
    }
    None
}

/// Extract `<title>...</title>` (first occurrence), decoded + trimmed.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let open = lower.find("<title")?;
    // Find the '>' that closes the opening tag (handles <title attr="...">).
    let gt = lower[open..].find('>')? + open + 1;
    let close = lower[gt..].find("</title>")? + gt;
    let text = html[gt..close].trim();
    if text.is_empty() {
        None
    } else {
        Some(decode_entities(text))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_matches_first_32_of_sha256() {
        // sha256("https://example.com") first 32 hex chars.
        let h = hash_url("https://example.com");
        assert_eq!(h.len(), 32);
        assert_eq!(h, &crate::licensing::sha256_hex(b"https://example.com")[..32]);
    }

    #[test]
    fn extracts_og_title_double_quotes() {
        let html = r#"<head><meta property="og:title" content="Hello &amp; World"></head>"#;
        assert_eq!(extract_meta(html, "og:title").as_deref(), Some("Hello & World"));
    }

    #[test]
    fn extracts_og_reversed_attr_order() {
        let html = r#"<meta content='Desc here' property='og:description'>"#;
        assert_eq!(
            extract_meta(html, "og:description").as_deref(),
            Some("Desc here")
        );
    }

    #[test]
    fn extracts_og_image_via_generic_scanner() {
        // The scanner supports og:image even though it is not persisted.
        let html = r#"<META PROPERTY="OG:IMAGE" CONTENT="https://x/y.png">"#;
        assert_eq!(
            extract_meta(html, "og:image").as_deref(),
            Some("https://x/y.png")
        );
    }

    #[test]
    fn name_attr_does_not_match_substring() {
        // `data-name` must NOT satisfy a `name="og:title"` lookup.
        let html = r#"<meta data-name="og:title" content="nope">"#;
        assert_eq!(extract_meta(html, "og:title"), None);
    }

    #[test]
    fn extracts_plain_title() {
        let html = "<html><head><title> My Page &lt;3 </title></head></html>";
        assert_eq!(extract_title(html).as_deref(), Some("My Page <3"));
    }

    #[test]
    fn title_with_attrs_on_tag() {
        let html = r#"<title data-x="1">Tagged</title>"#;
        assert_eq!(extract_title(html).as_deref(), Some("Tagged"));
    }

    #[test]
    fn missing_meta_returns_none() {
        assert_eq!(extract_meta("<html></html>", "og:title"), None);
    }
}
