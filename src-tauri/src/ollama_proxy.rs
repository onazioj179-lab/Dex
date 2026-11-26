// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// `ollama:request` -- a narrow native proxy to the LOCAL Ollama server.
//
// Ollama rejects browser requests whose Origin is not on its allow-list, and
// the packaged app's origin (http://tauri.localhost) is not on it: every fetch
// from the WebView got 403, so local models never worked in the installed app.
// This proxy makes the same request from Rust (no Origin header).
//
// Scope is deliberately tiny: fixed host 127.0.0.1:11434, only GET /api/tags
// and POST /api/chat, body <= 16 MB (vision images), response <= 32 MB. It is
// not a general HTTP client and cannot reach any other host.
//

use serde_json::{json, Value};
use std::io::Read;
use std::time::Duration;

const BASE: &str = "http://127.0.0.1:11434";
const MAX_BODY: usize = 16 * 1024 * 1024;
const MAX_RESPONSE: u64 = 32 * 1024 * 1024;

/// Which (method, path) pairs may be proxied.
pub fn allowed(method: &str, path: &str) -> bool {
    matches!((method, path), ("GET", "/api/tags") | ("POST", "/api/chat"))
}

pub fn dispatch(args: &Value) -> Value {
    let method = args.get(0).and_then(|v| v.as_str()).unwrap_or_default().to_ascii_uppercase();
    let path = args.get(1).and_then(|v| v.as_str()).unwrap_or_default();
    let body = args.get(2).and_then(|v| v.as_str()).unwrap_or_default();
    if !allowed(&method, path) {
        return json!({ "ok": false, "status": 0, "error": "not an allowed Ollama endpoint" });
    }
    if body.len() > MAX_BODY {
        return json!({ "ok": false, "status": 0, "error": "request too large" });
    }
    // Model generation on CPU can take minutes; listing models must be quick.
    let timeout = if path == "/api/tags" { Duration::from_secs(3) } else { Duration::from_secs(600) };
    let agent = ureq::AgentBuilder::new().timeout(timeout).build();
    let url = format!("{BASE}{path}");
    if let Err(e) = crate::net_gate::check_url(&url) {
        return json!({ "ok": false, "status": 0, "error": e });
    }
    let result = if method == "GET" {
        agent.get(&url).call()
    } else {
        agent.post(&url).set("Content-Type", "application/json").send_string(body)
    };
    match result {
        Ok(resp) => {
            let status = resp.status();
            let mut buf = Vec::new();
            if resp.into_reader().take(MAX_RESPONSE).read_to_end(&mut buf).is_err() {
                return json!({ "ok": false, "status": status, "error": "read failed" });
            }
            json!({ "ok": (200..300).contains(&status), "status": status, "body": String::from_utf8_lossy(&buf) })
        }
        Err(ureq::Error::Status(code, resp)) => {
            let text = resp.into_string().unwrap_or_default();
            json!({ "ok": false, "status": code, "body": text.chars().take(500).collect::<String>() })
        }
        Err(e) => json!({ "ok": false, "status": 0, "error": e.to_string() }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_tags_and_chat() {
        assert!(allowed("GET", "/api/tags"));
        assert!(allowed("POST", "/api/chat"));
        assert!(!allowed("POST", "/api/pull")); // no model downloads through DEX
        assert!(!allowed("DELETE", "/api/delete"));
        assert!(!allowed("GET", "/api/tags/../../x"));
        assert!(!allowed("GET", "http://evil/api/tags"));
    }

    #[test]
    fn rejects_disallowed_without_network() {
        let v = dispatch(&json!(["POST", "/api/pull", "{}"]));
        assert_eq!(v["ok"], false);
        assert_eq!(v["status"], 0);
    }
}
