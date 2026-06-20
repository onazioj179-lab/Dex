// =============================================================================
// DEX Tauri — Embedding subsystem router (port of
// src/main/services/EmbeddingService.ts).
//
// SCOPE REALITY (read before extending):
// The `embedding` namespace is a stateless text->vector COMPUTE service. The
// Electron EmbeddingService exposes exactly two IPC channels —
//   - embedding:compute        (text -> EmbeddingResultDTO | null)
//   - embedding:compute-batch  (string[] -> EmbeddingResultDTO[] | null)
// and keeps only an in-process LRU cache. There is NO persistent store: no
// electron-store file, no DataStore key, and no embeddings.json is ever read or
// written anywhere in the repo. The ticket's DATA channels (`get`, `list`) and
// the extra HEAVY channels (`generate`, `delete`, `search`) DO NOT EXIST in this
// namespace — EmbeddingService has no such handlers, no store to get/list/delete
// from, and no generate/search surface. They are degraded honestly rather than
// inventing a contract that no renderer consumer expects.
//
// WHAT IS NOW PORTED (the two real channels — REAL native impl):
// The prior round skipped both compute channels on the claim that hashEmbed()
// could not be reproduced without SHA-1, which is not an allowed dependency. That
// is true of the *crate ecosystem* but not of `std`: SHA-1 is a fully specified,
// self-contained algorithm (FIPS 180-1) implementable in a few dozen lines of
// pure std Rust with no dependencies at all. We do exactly that below, then
// reproduce featureBucket()/hashEmbed() byte-for-byte (sha1(feature) -> u32 BE
// bucket % 128 + sign from byte[4] low bit; log(1+freq) token bag; 0.25-weighted
// char trigrams; L2 normalise). The vectors are therefore IDENTICAL to the
// Electron service, so the shared UKI cosine index (src/shared/uki/embeddings.ts)
// stays consistent across the Electron and Tauri backends — no silent corruption.
//
// The ONNX gte-small backend remains out of scope (needs onnxruntime-node, a
// native runtime), but EmbeddingService's *default* and only-wired backend is
// `hash-128`, which is what we emit — matching the real default at runtime.
//
// DIVERGENCES (documented):
//   - ONNX backend not ported (needs native runtime); we emit backend:"hash-128"
//     exactly as the live Electron default does today.
//   - get / list / generate / delete / search are not real EmbeddingService
//     channels; degraded with reason rather than faked.
// =============================================================================

use serde_json::{json, Value};

const DIM: usize = 128;

// -----------------------------------------------------------------------------
// SHA-1 (FIPS 180-1), pure std. Mirrors Node's createHash('sha1').digest():
// returns the 20-byte digest. Used only to reproduce featureBucket() exactly.
// -----------------------------------------------------------------------------
fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x6745_2301;
    let mut h1: u32 = 0xEFCD_AB89;
    let mut h2: u32 = 0x98BA_DCFE;
    let mut h3: u32 = 0x1032_5476;
    let mut h4: u32 = 0xC3D2_E1F0;

    // Pre-processing: append 0x80, pad with zeros, then 64-bit big-endian bit
    // length, to a multiple of 64 bytes.
    let ml: u64 = (data.len() as u64).wrapping_mul(8);
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&ml.to_be_bytes());

    // Process each 512-bit (64-byte) chunk.
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for (i, word) in w.iter_mut().take(16).enumerate() {
            let j = i * 4;
            *word = u32::from_be_bytes([chunk[j], chunk[j + 1], chunk[j + 2], chunk[j + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h0, h1, h2, h3, h4);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A82_7999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDCu32),
                _ => (b ^ c ^ d, 0xCA62_C1D6u32),
            };
            let tmp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = tmp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut out = [0u8; 20];
    out[0..4].copy_from_slice(&h0.to_be_bytes());
    out[4..8].copy_from_slice(&h1.to_be_bytes());
    out[8..12].copy_from_slice(&h2.to_be_bytes());
    out[12..16].copy_from_slice(&h3.to_be_bytes());
    out[16..20].copy_from_slice(&h4.to_be_bytes());
    out
}

// -----------------------------------------------------------------------------
// hashEmbed() port. Each step mirrors EmbeddingService.ts line-for-line so the
// produced vectors are bit-identical to the Electron backend.
// -----------------------------------------------------------------------------

/// Tokens: lowercase, then every maximal run of [a-z0-9_] (== /[a-z0-9_]+/g over
/// lowercased text).
fn tokens(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            cur.push(ch);
        } else if !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Char trigrams of `^token$`. Operates on chars to match JS string slicing on a
/// BMP-only token (tokens here are ASCII [a-z0-9_], so char == byte == UTF-16
/// unit — slicing is equivalent).
fn trigrams(token: &str) -> Vec<String> {
    let padded: Vec<char> = format!("^{}$", token).chars().collect();
    let mut out: Vec<String> = Vec::new();
    if padded.len() < 3 {
        return out;
    }
    for i in 0..(padded.len() - 2) {
        out.push(padded[i..i + 3].iter().collect());
    }
    out
}

/// featureBucket: sha1(feature) -> bucket = u32_be(bytes[0..4]) % DIM,
/// sign = (bytes[4] & 1) == 0 ? +1 : -1.
fn feature_bucket(feature: &str) -> (usize, f64) {
    let h = sha1(feature.as_bytes());
    let bucket = (u32::from_be_bytes([h[0], h[1], h[2], h[3]]) as usize) % DIM;
    let sign = if (h[4] & 1) == 0 { 1.0 } else { -1.0 };
    (bucket, sign)
}

/// Feature-hashing embedding. Deterministic; L2-normalised.
fn hash_embed(text: &str) -> Vec<f64> {
    let mut vec = vec![0.0f64; DIM];
    if text.is_empty() {
        return vec;
    }

    let toks = tokens(text);

    // Token bag — log(1+freq). Insertion order of first appearance, matching the
    // JS Map iteration (irrelevant to the result since buckets accumulate).
    let mut counts: Vec<(String, u32)> = Vec::new();
    for t in &toks {
        if let Some(entry) = counts.iter_mut().find(|(k, _)| k == t) {
            entry.1 += 1;
        } else {
            counts.push((t.clone(), 1));
        }
    }
    for (tok, count) in &counts {
        let (bucket, sign) = feature_bucket(&format!("tok:{}", tok));
        vec[bucket] += sign * (1.0 + *count as f64).ln();
    }

    // Character trigrams — weight 0.25.
    for tok in &toks {
        for tri in trigrams(tok) {
            let (bucket, sign) = feature_bucket(&format!("tri:{}", tri));
            vec[bucket] += sign * 0.25;
        }
    }

    // L2 normalise so cosine reduces to dot product.
    let mut norm = 0.0f64;
    for v in &vec {
        norm += v * v;
    }
    norm = norm.sqrt();
    if norm > 0.0 {
        for v in vec.iter_mut() {
            *v /= norm;
        }
    }
    vec
}

/// EmbeddingResultDTO { vector, dim, backend:"hash-128" }.
fn embed(text: &str) -> Value {
    let vector: Vec<Value> = hash_embed(text)
        .into_iter()
        .map(|f| {
            serde_json::Number::from_f64(f)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        })
        .collect();
    json!({ "vector": vector, "dim": DIM, "backend": "hash-128" })
}

/// Route an `embedding:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The full channel string (incl. the
/// `embedding:` prefix) is passed in.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // text -> EmbeddingResultDTO | null. Mirrors the Electron handler's
        // validation: must be a string, length <= 8192, else null.
        "embedding:compute" => {
            let text = match args.get(0).and_then(|v| v.as_str()) {
                Some(s) => s,
                None => return Value::Null,
            };
            if text.chars().count() > 8192 {
                return Value::Null;
            }
            embed(text)
        }

        // string[] -> EmbeddingResultDTO[] | null. Validation mirrors Electron:
        // must be an array, length <= 256, every element a string <= 8192 chars.
        "embedding:compute-batch" => {
            let arr = match args.get(0).and_then(|v| v.as_array()) {
                Some(a) => a,
                None => return Value::Null,
            };
            if arr.len() > 256 {
                return Value::Null;
            }
            let mut texts: Vec<&str> = Vec::with_capacity(arr.len());
            for item in arr {
                match item.as_str() {
                    Some(s) if s.chars().count() <= 8192 => texts.push(s),
                    _ => return Value::Null,
                }
            }
            Value::Array(texts.into_iter().map(embed).collect())
        }

        // These channels are NOT part of EmbeddingService. There is no persistent
        // embedding store (no file, no DataStore key) to get/list/delete from, no
        // generate surface beyond compute, and no search index in this namespace
        // (semantic search lives in src/renderer/uki/semanticSearch.ts over the
        // shared cosine index, not behind an `embedding:` IPC). Faking a shape
        // here would invent a contract no renderer consumer expects, so we degrade
        // honestly. (Object channels -> {success:false,...}; if any of these were
        // void in the renderer the caller simply ignores the payload.)
        "embedding:get"
        | "embedding:list"
        | "embedding:generate"
        | "embedding:delete"
        | "embedding:search" => {
            json!({ "success": false, "error": "not ported (no such channel in EmbeddingService; no embedding store/search behind this namespace)" })
        }

        // Unknown channel within the namespace: honest no-op (matches a missing
        // IPC handler), keeping the blanket starts_with("embedding:") route safe.
        _ => Value::Null,
    }
}
