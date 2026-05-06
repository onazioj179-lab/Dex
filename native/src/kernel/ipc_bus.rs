// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
use std::sync::atomic::{AtomicU64, Ordering};
use napi::bindgen_prelude::*;
use napi_derive::napi;

static MSG_SENT: AtomicU64 = AtomicU64::new(0);
static MSG_RECEIVED: AtomicU64 = AtomicU64::new(0);
static BATCHES_FLUSHED: AtomicU64 = AtomicU64::new(0);
static BYTES_COMPRESSED: AtomicU64 = AtomicU64::new(0);
static BYTES_UNCOMPRESSED: AtomicU64 = AtomicU64::new(0);

struct MessageBatcher {
    channels: dashmap::DashMap<String, Vec<Vec<u8>>>,
    max_batch: usize,
    max_bytes: usize,
}

impl MessageBatcher {
    fn new(max_batch: usize, max_bytes: usize) -> Self {
        Self {
            channels: dashmap::DashMap::new(),
            max_batch,
            max_bytes,
        }
    }

    fn enqueue(&self, channel: &str, payload: Vec<u8>) -> Option<Vec<Vec<u8>>> {
        MSG_SENT.fetch_add(1, Ordering::Relaxed);
        let mut entry = self.channels.entry(channel.to_string()).or_insert_with(Vec::new);
        entry.push(payload);
        let total_bytes: usize = entry.iter().map(|p| p.len()).sum();
        if entry.len() >= self.max_batch || total_bytes >= self.max_bytes {
            let batch = std::mem::take(entry.value_mut());
            BATCHES_FLUSHED.fetch_add(1, Ordering::Relaxed);
            MSG_RECEIVED.fetch_add(batch.len() as u64, Ordering::Relaxed);
            Some(batch)
        } else {
            None
        }
    }

    fn flush(&self, channel: &str) -> Vec<Vec<u8>> {
        if let Some((_, batch)) = self.channels.remove(channel) {
            BATCHES_FLUSHED.fetch_add(1, Ordering::Relaxed);
            MSG_RECEIVED.fetch_add(batch.len() as u64, Ordering::Relaxed);
            batch
        } else {
            Vec::new()
        }
    }

    fn flush_all(&self) -> Vec<(String, Vec<Vec<u8>>)> {
        let keys: Vec<String> = self.channels.iter().map(|r| r.key().clone()).collect();
        let mut result = Vec::new();
        for key in keys {
            if let Some((k, v)) = self.channels.remove(&key) {
                BATCHES_FLUSHED.fetch_add(1, Ordering::Relaxed);
                MSG_RECEIVED.fetch_add(v.len() as u64, Ordering::Relaxed);
                result.push((k, v));
            }
        }
        result
    }
}

fn encode_batch(messages: &[Vec<u8>]) -> Vec<u8> {
    let mut out = Vec::new();
    let count = messages.len() as u32;
    out.extend_from_slice(&count.to_le_bytes());
    for msg in messages {
        let len = msg.len() as u32;
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(msg);
    }
    out
}

fn decode_batch(data: &[u8]) -> Vec<Vec<u8>> {
    if data.len() < 4 { return Vec::new(); }
    let count = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let mut offset = 4;
    let mut messages = Vec::with_capacity(count);
    for _ in 0..count {
        if offset + 4 > data.len() { break; }
        let len = u32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        offset += 4;
        if offset + len > data.len() { break; }
        messages.push(data[offset..offset+len].to_vec());
        offset += len;
    }
    messages
}

static BATCHER: std::sync::OnceLock<MessageBatcher> = std::sync::OnceLock::new();

fn get_batcher() -> &'static MessageBatcher {
    BATCHER.get_or_init(|| MessageBatcher::new(32, 65536))
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelIPCStats {
    pub messages_sent: f64,
    pub messages_received: f64,
    pub batches_flushed: f64,
    pub bytes_compressed: f64,
    pub bytes_uncompressed: f64,
    pub compression_ratio: f64,
    pub active_channels: u32,
}

#[napi]
pub fn kernel_init_ipc(max_batch: Option<u32>, max_bytes: Option<u32>) -> napi::Result<bool> {
    let _ = BATCHER.get_or_init(|| {
        MessageBatcher::new(
            max_batch.unwrap_or(32) as usize,
            max_bytes.unwrap_or(65536) as usize,
        )
    });
    Ok(true)
}

#[napi]
pub fn kernel_ipc_send(channel: String, payload: Buffer) -> Option<Buffer> {
    let result = get_batcher().enqueue(&channel, payload.to_vec());
    result.map(|batch| {
        let encoded = encode_batch(&batch);
        Buffer::from(encoded)
    })
}

#[napi]
pub fn kernel_ipc_flush(channel: String) -> Buffer {
    let batch = get_batcher().flush(&channel);
    Buffer::from(encode_batch(&batch))
}

#[napi]
pub fn kernel_ipc_flush_all() -> Vec<String> {
    get_batcher().flush_all().into_iter().map(|(ch, msgs)| {
        let encoded = encode_batch(&msgs);
        let encoded_b64 = base64_encode(&encoded);
        format!("{{\"channel\":{},\"data\":\"{}\"}}", serde_json::to_string(&ch).unwrap_or_default(), encoded_b64)
    }).collect()
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((n >> 18) & 63) as usize] as char);
        result.push(CHARS[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[((n >> 6) & 63) as usize] as char); } else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(n & 63) as usize] as char); } else { result.push('='); }
    }
    result
}

#[napi]
pub fn kernel_ipc_decode_batch(data: Buffer) -> Vec<Buffer> {
    decode_batch(&data).into_iter().map(Buffer::from).collect()
}

#[napi]
pub fn kernel_ipc_encode_batch(messages: Vec<Buffer>) -> Buffer {
    let vecs: Vec<Vec<u8>> = messages.into_iter().map(|b| b.to_vec()).collect();
    Buffer::from(encode_batch(&vecs))
}

#[napi]
pub fn kernel_compress(data: Buffer, level: Option<i32>) -> napi::Result<Buffer> {
    let input = data.to_vec();
    let lvl = level.unwrap_or(3);
    let compressed = zstd::encode_all(input.as_slice(), lvl)
        .map_err(|e| napi::Error::from_reason(format!("compress failed: {}", e)))?;
    BYTES_UNCOMPRESSED.fetch_add(input.len() as u64, Ordering::Relaxed);
    BYTES_COMPRESSED.fetch_add(compressed.len() as u64, Ordering::Relaxed);
    Ok(Buffer::from(compressed))
}

#[napi]
pub fn kernel_decompress(data: Buffer) -> napi::Result<Buffer> {
    let input = data.to_vec();
    let decompressed = zstd::decode_all(input.as_slice())
        .map_err(|e| napi::Error::from_reason(format!("decompress failed: {}", e)))?;
    Ok(Buffer::from(decompressed))
}

#[napi]
pub fn kernel_ipc_stats() -> KernelIPCStats {
    let sent = BYTES_UNCOMPRESSED.load(Ordering::Relaxed) as f64;
    let comp = BYTES_COMPRESSED.load(Ordering::Relaxed) as f64;
    let ratio = if sent > 0.0 { comp / sent } else { 1.0 };
    KernelIPCStats {
        messages_sent: MSG_SENT.load(Ordering::Relaxed) as f64,
        messages_received: MSG_RECEIVED.load(Ordering::Relaxed) as f64,
        batches_flushed: BATCHES_FLUSHED.load(Ordering::Relaxed) as f64,
        bytes_compressed: comp,
        bytes_uncompressed: sent,
        compression_ratio: ratio,
        active_channels: get_batcher().channels.len() as u32,
    }
}
