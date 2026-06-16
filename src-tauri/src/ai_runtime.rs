// =============================================================================
// DEX 6.0 — AI Runtime IPC (bridges core/dex-ai-runtime into the Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Routes `ai-runtime:*` channels to the native AI runtime (request build,
//! response/stream parsing — all pure — plus the blocking HTTP transport).
//!
//! Arg convention (positional array from the renderer):
//!   buildRequest   [chatRequest, apiKey, baseUrl?]  -> HttpRequest
//!   parseResponse  [responseJson]                   -> ChatResponse
//!   assembleStream [rawSseBody]                      -> string (joined content)
//!   chat           [chatRequest, apiKey, baseUrl?]  -> ChatResponse | { error }
//!   chatStreamed   [chatRequest, apiKey, baseUrl?]  -> ChatResponse | { error }
//!
//! The pure routes never touch the network; `chat`/`chatStreamed` perform the
//! real provider POST and so must run off the UI thread (Tauri does this for us
//! by invoking commands on a worker).

use dex_ai_runtime::{
    assemble_stream, build_openai_request, chat_completion, chat_completion_streamed,
    parse_openai_response, parse_openai_stream_chunk, ChatRequest, StreamFormat,
};
use serde_json::{json, Value};

/// Deserialize positional arg 0 into a `ChatRequest` (lenient — missing fields
/// fall back to defaults via the type's `Deserialize`/`Default`).
fn parse_request(args: &Value) -> ChatRequest {
    args.get(0)
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn arg_str(args: &Value, i: usize) -> Option<String> {
    args.get(i).and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub fn dispatch(channel: &str, args: &Value) -> Value {
    match channel {
        "ai-runtime:buildRequest" => {
            let req = parse_request(args);
            let api_key = arg_str(args, 1).unwrap_or_default();
            let base = arg_str(args, 2);
            let http = build_openai_request(&req, base.as_deref(), &api_key);
            serde_json::to_value(http).unwrap_or(Value::Null)
        }
        "ai-runtime:parseResponse" => {
            let body = args.get(0).cloned().unwrap_or(Value::Null);
            serde_json::to_value(parse_openai_response(&body)).unwrap_or(Value::Null)
        }
        "ai-runtime:assembleStream" => {
            let raw = arg_str(args, 0).unwrap_or_default();
            let text = assemble_stream(&raw, StreamFormat::Sse, parse_openai_stream_chunk);
            json!(text)
        }
        "ai-runtime:chat" => {
            let req = parse_request(args);
            let api_key = arg_str(args, 1).unwrap_or_default();
            let base = arg_str(args, 2);
            match chat_completion(&req, base.as_deref(), &api_key) {
                Ok(resp) => serde_json::to_value(resp).unwrap_or(Value::Null),
                Err(e) => json!({ "error": e }),
            }
        }
        "ai-runtime:chatStreamed" => {
            let req = parse_request(args);
            let api_key = arg_str(args, 1).unwrap_or_default();
            let base = arg_str(args, 2);
            match chat_completion_streamed(&req, base.as_deref(), &api_key) {
                Ok(resp) => serde_json::to_value(resp).unwrap_or(Value::Null),
                Err(e) => json!({ "error": e }),
            }
        }
        _ => Value::Null,
    }
}
