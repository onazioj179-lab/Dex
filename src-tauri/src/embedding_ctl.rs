// =============================================================================
// DEX Tauri — Embedding subsystem router (port surface of
// src/main/services/EmbeddingService.ts).
//
// SCOPE REALITY (read before extending):
// The `embedding` namespace is NOT a data/CRUD subsystem. EmbeddingService is a
// stateless text->vector COMPUTE service. It exposes exactly two IPC channels —
//   - embedding:compute        (text -> EmbeddingResultDTO | null)
//   - embedding:compute-batch  (string[] -> EmbeddingResultDTO[] | null)
// and keeps only an in-process LRU cache. There is NO persistent store: no
// electron-store file, no DataStore key, and (despite the porting ticket naming
// `fs-json:embeddings.json`) no such file is ever read or written anywhere in the
// repo (grep: only Cargo.lock mentions sha1; no embeddings.json exists). The
// ticket's DATA channels (`get`, `list`) and HEAVY channels (`generate`,
// `delete`, `search`) likewise DO NOT EXIST in this namespace — the only real
// channels are the two compute ones above. They are catalogued in channelsSkipped
// so the mismatch is visible rather than silently invented.
//
// WHY NOTHING IS PORTED:
// EmbeddingResultDTO is `{ vector: number[], dim: 128, backend: 'hash-128' }`.
// Producing `vector` requires reproducing hashEmbed(), whose feature buckets come
// from `createHash('sha1')` (featureBucket: sha1(feature) -> u32 bucket + sign).
// SHA-1 is not in the Rust standard library, and this port is constrained to
// serde_json / std / tauri / sysinfo / crate:: helpers with NO new dependencies.
// A different hash would yield DIFFERENT vectors and silently corrupt the shared
// UKI cosine index (embeddings.ts) — exactly the kind of fake the rules forbid.
// The ONNX backend additionally needs onnxruntime-node, an out-of-scope native
// runtime. So both real channels are honestly skipped (need native runtime),
// and there is no pure-data tier left to port.
//
// BEHAVIOUR:
// dispatch() handles the whole `embedding:` namespace and returns Value::Null for
// every channel (honest degrade — matches EmbeddingService returning `null` on
// the reject paths, and a missing handler over IPC). Prefix routing
// (`channel.starts_with("embedding:")` -> this dispatch) is therefore safe.
//
// DIVERGENCES (documented):
//   - No channel is functionally ported; the namespace degrades to null until a
//     native embedding runtime (sha1 fallback or ONNX) is available.
// =============================================================================

use serde_json::Value;

/// Route an `embedding:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// Every channel in the namespace is intentionally a no-op here: the embedding
/// backend (sha1 feature-hash or ONNX) cannot be reproduced dependency-free, so
/// rather than emit wrong vectors we degrade to `null` — the same value the
/// Electron service returns on its reject paths. Returning Value::Null for all
/// channels keeps a blanket `starts_with("embedding:")` prefix route correct.
pub fn dispatch(_app: &tauri::AppHandle, _channel: &str, _args: &Value) -> Value {
    Value::Null
}
