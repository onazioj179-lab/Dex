// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
use std::sync::atomic::{AtomicU64, Ordering};
use parking_lot::Mutex;
use dashmap::DashMap;
use napi::bindgen_prelude::*;
use napi_derive::napi;

static READS: AtomicU64 = AtomicU64::new(0);
static WRITES: AtomicU64 = AtomicU64::new(0);
static BYTES_READ: AtomicU64 = AtomicU64::new(0);
static BYTES_WRITTEN: AtomicU64 = AtomicU64::new(0);
static COALESCED_WRITES: AtomicU64 = AtomicU64::new(0);

struct WriteEntry {
    offset: u64,
    data: Vec<u8>,
}

struct WriteCoalescer {
    pending: DashMap<String, Vec<WriteEntry>>,
    max_batch: usize,
}

impl WriteCoalescer {
    fn new(max_batch: usize) -> Self {
        Self {
            pending: DashMap::new(),
            max_batch,
        }
    }

    fn enqueue(&self, path: String, offset: u64, data: Vec<u8>) {
        let mut entry = self.pending.entry(path).or_insert_with(Vec::new);
        entry.push(WriteEntry { offset, data });
        if entry.len() >= self.max_batch {
            COALESCED_WRITES.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn flush(&self, path: &str) -> Vec<WriteEntry> {
        self.pending.remove(path).map(|(_, v)| v).unwrap_or_default()
    }

    fn flush_all(&self) -> Vec<(String, Vec<WriteEntry>)> {
        let keys: Vec<String> = self.pending.iter().map(|r| r.key().clone()).collect();
        let mut result = Vec::new();
        for key in keys {
            if let Some((k, v)) = self.pending.remove(&key) {
                result.push((k, v));
            }
        }
        result
    }
}

struct ReadCache {
    cache: Mutex<lru::LruCache<String, Vec<u8>>>,
}

impl ReadCache {
    fn new(cap: usize) -> Self {
        Self {
            cache: Mutex::new(lru::LruCache::new(
                std::num::NonZeroUsize::new(cap).unwrap(),
            )),
        }
    }

    fn get(&self, path: &str) -> Option<Vec<u8>> {
        self.cache.lock().get(path).cloned()
    }

    fn put(&self, path: String, data: Vec<u8>) {
        self.cache.lock().push(path, data);
    }

    fn invalidate(&self, path: &str) {
        self.cache.lock().pop(path);
    }
}

static WRITE_COALESCER: std::sync::OnceLock<WriteCoalescer> = std::sync::OnceLock::new();
static READ_CACHE: std::sync::OnceLock<ReadCache> = std::sync::OnceLock::new();

fn get_coalescer() -> &'static WriteCoalescer {
    WRITE_COALESCER.get_or_init(|| WriteCoalescer::new(16))
}

fn get_read_cache() -> &'static ReadCache {
    READ_CACHE.get_or_init(|| ReadCache::new(256))
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelIOStats {
    pub reads: f64,
    pub writes: f64,
    pub bytes_read: f64,
    pub bytes_written: f64,
    pub coalesced_writes: f64,
    pub read_cache_size: u32,
    pub pending_writes: u32,
}

#[napi]
pub fn kernel_init_io(write_batch_size: Option<u32>, read_cache_cap: Option<u32>) -> napi::Result<bool> {
    let _ = WRITE_COALESCER.get_or_init(|| WriteCoalescer::new(write_batch_size.unwrap_or(16) as usize));
    let _ = READ_CACHE.get_or_init(|| ReadCache::new(read_cache_cap.unwrap_or(256) as usize));
    Ok(true)
}

#[napi]
pub async fn kernel_read_file(path: String) -> napi::Result<Buffer> {
    if let Some(cached) = get_read_cache().get(&path) {
        READS.fetch_add(1, Ordering::Relaxed);
        BYTES_READ.fetch_add(cached.len() as u64, Ordering::Relaxed);
        return Ok(Buffer::from(cached));
    }
    let data = tokio::fs::read(&path).await
        .map_err(|e| napi::Error::from_reason(format!("read failed: {}", e)))?;
    READS.fetch_add(1, Ordering::Relaxed);
    BYTES_READ.fetch_add(data.len() as u64, Ordering::Relaxed);
    get_read_cache().put(path, data.clone());
    Ok(Buffer::from(data))
}

#[napi]
pub async fn kernel_read_files(paths: Vec<String>) -> napi::Result<Vec<Buffer>> {
    let handles: Vec<_> = paths.into_iter().map(|p| {
        tokio::spawn(async move {
            let data = tokio::fs::read(&p).await?;
            READS.fetch_add(1, Ordering::Relaxed);
            BYTES_READ.fetch_add(data.len() as u64, Ordering::Relaxed);
            Ok::<Vec<u8>, std::io::Error>(data)
        })
    }).collect();

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let data = handle.await
            .map_err(|e| napi::Error::from_reason(format!("task failed: {}", e)))?
            .map_err(|e| napi::Error::from_reason(format!("read failed: {}", e)))?;
        results.push(Buffer::from(data));
    }
    Ok(results)
}

#[napi]
pub async fn kernel_write_file(path: String, data: Buffer) -> napi::Result<bool> {
    let bytes = data.to_vec();
    WRITES.fetch_add(1, Ordering::Relaxed);
    BYTES_WRITTEN.fetch_add(bytes.len() as u64, Ordering::Relaxed);
    get_read_cache().invalidate(&path);
    tokio::fs::write(&path, &bytes).await
        .map_err(|e| napi::Error::from_reason(format!("write failed: {}", e)))?;
    Ok(true)
}

#[napi]
pub fn kernel_enqueue_write(path: String, offset: f64, data: Buffer) {
    get_coalescer().enqueue(path, offset as u64, data.to_vec());
}

#[napi]
pub async fn kernel_flush_writes(path: Option<String>) -> napi::Result<u32> {
    let entries = if let Some(p) = path {
        vec![(p.clone(), get_coalescer().flush(&p))]
            .into_iter()
            .filter(|(_, v)| !v.is_empty())
            .collect::<Vec<_>>()
    } else {
        get_coalescer().flush_all()
    };

    let mut count = 0u32;
    for (file_path, writes) in entries {
        use tokio::io::AsyncWriteExt;
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&file_path)
            .await
            .map_err(|e| napi::Error::from_reason(format!("open failed: {}", e)))?;

        for entry in writes {
            use tokio::io::AsyncSeekExt;
            file.seek(std::io::SeekFrom::Start(entry.offset)).await
                .map_err(|e| napi::Error::from_reason(format!("seek failed: {}", e)))?;
            file.write_all(&entry.data).await
                .map_err(|e| napi::Error::from_reason(format!("write failed: {}", e)))?;
            WRITES.fetch_add(1, Ordering::Relaxed);
            BYTES_WRITTEN.fetch_add(entry.data.len() as u64, Ordering::Relaxed);
            count += 1;
        }
        file.flush().await
            .map_err(|e| napi::Error::from_reason(format!("flush failed: {}", e)))?;
        get_read_cache().invalidate(&file_path);
    }
    Ok(count)
}

#[napi]
pub fn kernel_invalidate_read_cache(path: String) {
    get_read_cache().invalidate(&path);
}

#[napi]
pub fn kernel_io_stats() -> KernelIOStats {
    let pending: u32 = get_coalescer().pending.iter().map(|r| r.value().len() as u32).sum();
    KernelIOStats {
        reads: READS.load(Ordering::Relaxed) as f64,
        writes: WRITES.load(Ordering::Relaxed) as f64,
        bytes_read: BYTES_READ.load(Ordering::Relaxed) as f64,
        bytes_written: BYTES_WRITTEN.load(Ordering::Relaxed) as f64,
        coalesced_writes: COALESCED_WRITES.load(Ordering::Relaxed) as f64,
        read_cache_size: get_read_cache().cache.lock().len() as u32,
        pending_writes: pending,
    }
}

/// Prefetch multiple files into the read cache in parallel.
/// Returns count of successfully prefetched files.
#[napi]
pub async fn kernel_prefetch_files(paths: Vec<String>) -> napi::Result<u32> {
    // Cap concurrent I/O to avoid overwhelming the file system with large batches
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(32));
    let handles: Vec<_> = paths.into_iter().map(|p| {
        let sem = sem.clone();
        tokio::spawn(async move {
            let _permit = sem.acquire_owned().await
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            if get_read_cache().get(&p).is_some() {
                return Ok::<bool, std::io::Error>(false); // already cached
            }
            match tokio::fs::read(&p).await {
                Ok(data) => {
                    BYTES_READ.fetch_add(data.len() as u64, Ordering::Relaxed);
                    get_read_cache().put(p, data);
                    Ok(true)
                }
                Err(_) => Ok(false),
            }
        })
    }).collect();

    let mut count = 0u32;
    for h in handles {
        if let Ok(Ok(true)) = h.await {
            count += 1;
        }
    }
    Ok(count)
}

/// Batch stat: get file sizes for multiple paths in parallel.
/// Returns JSON array of {path, size, exists} objects.
#[napi]
pub async fn kernel_batch_stat(paths: Vec<String>) -> napi::Result<Vec<String>> {
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(64));
    let handles: Vec<_> = paths.into_iter().map(|p| {
        let sem = sem.clone();
        tokio::spawn(async move {
            let _permit = sem.acquire_owned().await
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "semaphore closed"))?;
            match tokio::fs::metadata(&p).await {
                Ok(m) => Ok::<String, std::io::Error>(format!(
                    "{{\"path\":{},\"size\":{},\"exists\":true,\"isDir\":{}}}",
                    serde_json::to_string(&p).unwrap_or_default(),
                    m.len(),
                    m.is_dir()
                )),
                Err(_) => Ok(format!(
                    "{{\"path\":{},\"size\":0,\"exists\":false,\"isDir\":false}}",
                    serde_json::to_string(&p).unwrap_or_default()
                )),
            }
        })
    }).collect();

    let mut results = Vec::with_capacity(handles.len());
    for h in handles {
        if let Ok(Ok(s)) = h.await {
            results.push(s);
        }
    }
    Ok(results)
}

/// Clear the read cache entirely.
#[napi]
pub fn kernel_clear_read_cache() -> u32 {
    let mut cache = get_read_cache().cache.lock();
    let count = cache.len() as u32;
    cache.clear();
    count
}
