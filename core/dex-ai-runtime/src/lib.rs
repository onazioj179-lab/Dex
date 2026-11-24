// =============================================================================
// DEX 6.0 — Native AI Runtime (GOAL-6A / GOAL-6B)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Native AI runtime core. Re-exports `dex-smart-router` (routing/execution) and
//! implements the streaming PARSER — a faithful port of the TS
//! `src/renderer/uki/providers/stream.ts`: it turns a raw streamed body (SSE
//! `data:` lines for OpenAI/Anthropic/Google, or NDJSON for Ollama) into
//! incremental content tokens, buffering partial lines across chunk boundaries.
//! The parser/builder/extractor layer is pure (no network / DOM). The HTTP
//! TRANSPORT (`send_http`, `chat_completion`, `chat_completion_streamed`) uses a
//! tiny blocking client (`ureq`) to actually POST a built request and read the
//! response body; the unit tests stay pure (transport is exercised at runtime,
//! not in CI, since it requires a live provider endpoint + key).

pub use dex_smart_router as router;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;

/// Raw stream framing: SSE `data:` lines, or one JSON object per NDJSON line.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamFormat {
    Sse,
    Ndjson,
}

/// A stateful streaming parser that handles lines split across network chunks.
/// `parse_chunk` extracts the content token from one event's payload (provider-
/// specific); an empty string result means "this event carries no token".
pub struct StreamParser<F: FnMut(&str) -> String> {
    format: StreamFormat,
    parse_chunk: F,
    buffer: String,
}

impl<F: FnMut(&str) -> String> StreamParser<F> {
    pub fn new(format: StreamFormat, parse_chunk: F) -> Self {
        Self {
            format,
            parse_chunk,
            buffer: String::new(),
        }
    }

    /// Interpret one complete line. `None` for blanks, SSE non-`data:`/`[DONE]`
    /// lines, or events the provider extractor yields no text from.
    fn emit(&mut self, raw_line: &str) -> Option<String> {
        let line = raw_line.trim();
        if line.is_empty() {
            return None;
        }
        match self.format {
            StreamFormat::Sse => {
                if !line.starts_with("data:") {
                    return None; // skip event:/id:/comment lines
                }
                let data = line["data:".len()..].trim();
                if data.is_empty() || data == "[DONE]" {
                    return None;
                }
                let t = (self.parse_chunk)(data);
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
            StreamFormat::Ndjson => {
                let t = (self.parse_chunk)(line);
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
        }
    }

    /// Feed a raw chunk; returns the content tokens completed by it. Any partial
    /// trailing line is retained in the buffer for the next `push`/`flush`.
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.buffer.push_str(chunk);
        let mut out = Vec::new();
        while let Some(idx) = self.buffer.find('\n') {
            let line = self.buffer[..idx].to_string();
            self.buffer.replace_range(..=idx, "");
            if let Some(t) = self.emit(&line) {
                out.push(t);
            }
        }
        out
    }

    /// Flush any buffered remainder at end-of-stream.
    pub fn flush(&mut self) -> Vec<String> {
        if self.buffer.is_empty() {
            return Vec::new();
        }
        let rem = std::mem::take(&mut self.buffer);
        match self.emit(&rem) {
            Some(t) => vec![t],
            None => Vec::new(),
        }
    }
}

/// Assemble a full raw stream body into the complete text (one-shot).
pub fn assemble_stream<F: FnMut(&str) -> String>(
    raw: &str,
    format: StreamFormat,
    parse_chunk: F,
) -> String {
    let mut p = StreamParser::new(format, parse_chunk);
    let mut out = p.push(raw);
    out.extend(p.flush());
    out.join("")
}

// --- Provider request / response (pure; the network SEND is a later slice) ---
// Faithful port of the OpenAI provider's pure core in `openai.ts`: build the
// chat-completion HTTP request, parse a full JSON response, and extract a token
// from one streaming `data:` payload (the `parse_chunk` an OpenAI stream feeds to
// `StreamParser`). Also covers OpenAI-compatible bases (e.g. OpenRouter) via
// `base_url`. The actual network transport is the deferred GOAL-6A/6B slice.

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default, rename = "maxTokens")]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub stream: bool,
}

/// A normalized HTTP request a provider produces; the (later) transport sends it.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
}

const OPENAI_DEFAULT_BASE: &str = "https://api.openai.com/v1";

/// Build the OpenAI (and OpenAI-compatible, via `base_url`) chat request. Pure.
pub fn build_openai_request(
    req: &ChatRequest,
    base_url: Option<&str>,
    api_key: &str,
) -> HttpRequest {
    let base = base_url
        .unwrap_or(OPENAI_DEFAULT_BASE)
        .trim_end_matches('/');
    let mut headers = BTreeMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    headers.insert("Authorization".to_string(), format!("Bearer {}", api_key));

    let mut body = serde_json::Map::new();
    body.insert("model".to_string(), json!(req.model));
    let msgs: Vec<Value> = req
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    body.insert("messages".to_string(), Value::Array(msgs));
    if let Some(t) = req.temperature {
        body.insert("temperature".to_string(), json!(t));
    }
    if let Some(mt) = req.max_tokens {
        body.insert("max_tokens".to_string(), json!(mt));
    }
    body.insert("stream".to_string(), json!(req.stream));

    HttpRequest {
        url: format!("{}/chat/completions", base),
        method: "POST".to_string(),
        headers,
        body: Some(Value::Object(body).to_string()),
    }
}

/// Normalized chat response.
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    #[serde(rename = "finishReason")]
    pub finish_reason: Option<String>,
}

/// Parse an OpenAI chat-completion JSON response into a normalized `ChatResponse`.
pub fn parse_openai_response(json: &Value) -> ChatResponse {
    let choice = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first());
    ChatResponse {
        content: choice
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        model: json
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        finish_reason: choice
            .and_then(|c| c.get("finish_reason"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    }
}

/// Extract the incremental text from one OpenAI streaming `data:` payload (or "").
pub fn parse_openai_stream_chunk(data: &str) -> String {
    let t = data.trim();
    if t.is_empty() || t == "[DONE]" {
        return String::new();
    }
    match serde_json::from_str::<Value>(t) {
        Ok(j) => j
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        Err(_) => String::new(),
    }
}

// --- HTTP transport (blocking, ureq) ----------------------------------------
// The real network layer: take an `HttpRequest` produced by `build_openai_request`
// (or any provider builder) and send it. Kept separate from the pure builders so
// the request shape stays unit-testable while the send is exercised at runtime.

/// Send a built request over the network and return the raw response body.
/// On a non-2xx status the body is included in the error so callers can surface
/// the provider's error message. Blocking — call off the UI thread.
pub fn send_http(req: &HttpRequest) -> Result<String, String> {
    let mut r = ureq::request(&req.method, &req.url);
    for (k, v) in &req.headers {
        r = r.set(k, v);
    }
    let result = match &req.body {
        Some(body) => r.send_string(body),
        None => r.call(),
    };
    match result {
        Ok(resp) => resp.into_string().map_err(|e| format!("read body: {e}")),
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            Err(format!("HTTP {code}: {body}"))
        }
        Err(e) => Err(format!("transport: {e}")),
    }
}

/// One-shot (non-streaming) OpenAI-compatible chat: build -> send -> parse.
/// Forces `stream:false` regardless of the request flag (a single JSON body).
pub fn chat_completion(
    req: &ChatRequest,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<ChatResponse, String> {
    let mut r = req.clone();
    r.stream = false;
    let http = build_openai_request(&r, base_url, api_key);
    let body = send_http(&http)?;
    let json: Value = serde_json::from_str(&body).map_err(|e| format!("parse json: {e}"))?;
    Ok(parse_openai_response(&json))
}

/// Streaming OpenAI-compatible chat assembled to its final text: build with
/// `stream:true` -> send -> run the SSE body through the parser + OpenAI chunk
/// extractor. Returns the joined content (incremental delivery to the UI is the
/// renderer's job; this gives the complete text natively in one call).
pub fn chat_completion_streamed(
    req: &ChatRequest,
    base_url: Option<&str>,
    api_key: &str,
) -> Result<ChatResponse, String> {
    let mut r = req.clone();
    r.stream = true;
    let http = build_openai_request(&r, base_url, api_key);
    let body = send_http(&http)?;
    let content = assemble_stream(&body, StreamFormat::Sse, parse_openai_stream_chunk);
    Ok(ChatResponse {
        content,
        model: r.model.clone(),
        finish_reason: Some("stop".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_buffers_partial_lines_and_skips_noise() {
        let mut p = StreamParser::new(StreamFormat::Sse, |s: &str| s.to_string());
        // A comment/event line is skipped; a `data:` line split across two chunks
        // is reassembled before it is emitted.
        let mut out = p.push("event: message\ndata: hel");
        out.extend(p.push("lo\ndata: world\n"));
        assert_eq!(out, vec!["hello".to_string(), "world".to_string()]);
        // [DONE] and blank data carry no token.
        assert!(p.push("data: [DONE]\ndata: \n").is_empty());
    }

    #[test]
    fn ndjson_one_token_per_line() {
        let mut p = StreamParser::new(StreamFormat::Ndjson, |s: &str| s.to_string());
        let out = p.push("{\"a\":1}\n{\"b\":2}\n");
        assert_eq!(out, vec!["{\"a\":1}".to_string(), "{\"b\":2}".to_string()]);
    }

    #[test]
    fn flush_emits_unterminated_trailing_line_once() {
        let mut p = StreamParser::new(StreamFormat::Sse, |s: &str| s.to_string());
        assert!(p.push("data: tail").is_empty()); // no newline yet -> buffered
        assert_eq!(p.flush(), vec!["tail".to_string()]);
        assert!(p.flush().is_empty()); // idempotent
    }

    #[test]
    fn assemble_joins_full_sse_body() {
        let body = "data: foo\ndata: bar\ndata: baz\ndata: [DONE]\n";
        let text = assemble_stream(body, StreamFormat::Sse, |s: &str| s.to_string());
        assert_eq!(text, "foobarbaz");
    }

    #[test]
    fn parse_chunk_can_drop_events() {
        // A provider extractor that keeps only numeric payloads; an empty result
        // drops the event (e.g. a heartbeat / non-content frame).
        let mut p = StreamParser::new(StreamFormat::Sse, |s: &str| {
            if !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) {
                s.to_string()
            } else {
                String::new()
            }
        });
        let out = p.push("data: 123\ndata: skip\ndata: 456\n");
        assert_eq!(out, vec!["123".to_string(), "456".to_string()]);
    }

    #[test]
    fn openai_request_is_well_formed() {
        let req = ChatRequest {
            model: "gpt-4o-mini".into(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: "be brief".into(),
                },
                ChatMessage {
                    role: "user".into(),
                    content: "hi".into(),
                },
            ],
            temperature: Some(0.5),
            max_tokens: Some(100),
            stream: true,
        };
        let r = build_openai_request(&req, None, "sk-test");
        assert_eq!(r.url, "https://api.openai.com/v1/chat/completions");
        assert_eq!(r.method, "POST");
        assert_eq!(
            r.headers.get("Authorization").map(String::as_str),
            Some("Bearer sk-test")
        );
        assert_eq!(
            r.headers.get("Content-Type").map(String::as_str),
            Some("application/json")
        );
        // Parse the body back — JSON key order is irrelevant.
        let body: Value = serde_json::from_str(r.body.as_deref().unwrap()).unwrap();
        assert_eq!(body["model"], "gpt-4o-mini");
        assert_eq!(body["stream"], true);
        assert_eq!(body["temperature"], 0.5);
        assert_eq!(body["max_tokens"], 100);
        assert_eq!(body["messages"][1]["content"], "hi");
    }

    #[test]
    fn openai_base_url_override_and_omitted_optionals() {
        let req = ChatRequest {
            model: "x".into(),
            ..Default::default()
        };
        let r = build_openai_request(&req, Some("https://router.example/v1/"), "k");
        assert_eq!(r.url, "https://router.example/v1/chat/completions"); // trailing slash trimmed
        let body: Value = serde_json::from_str(r.body.as_deref().unwrap()).unwrap();
        assert!(body.get("temperature").is_none()); // None -> omitted
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["stream"], false);
    }

    #[test]
    fn openai_response_and_stream_extract_content() {
        let resp = serde_json::json!({
            "model": "gpt-4o",
            "choices": [{ "message": { "content": "Hello!" }, "finish_reason": "stop" }]
        });
        let parsed = parse_openai_response(&resp);
        assert_eq!(parsed.content, "Hello!");
        assert_eq!(parsed.model, "gpt-4o");
        assert_eq!(parsed.finish_reason.as_deref(), Some("stop"));

        // End-to-end: an OpenAI SSE body streamed through StreamParser using the
        // OpenAI chunk extractor reassembles the full text (parser + provider).
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n",
            "data: [DONE]\n"
        );
        let text = assemble_stream(body, StreamFormat::Sse, parse_openai_stream_chunk);
        assert_eq!(text, "Hello");
    }
}
