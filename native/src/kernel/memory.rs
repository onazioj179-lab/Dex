// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use parking_lot::Mutex;
use lru::LruCache;
use std::num::NonZeroUsize;
use napi::bindgen_prelude::*;
use napi_derive::napi;

static CACHE_HITS: AtomicU64 = AtomicU64::new(0);
static CACHE_MISSES: AtomicU64 = AtomicU64::new(0);
static CACHE_EVICTIONS: AtomicU64 = AtomicU64::new(0);
static PRESSURE_ACTIVE: AtomicBool = AtomicBool::new(false);

struct KernelCache {
    young: Mutex<LruCache<String, Vec<u8>>>,
    mature: Mutex<LruCache<String, Vec<u8>>>,
    old: Mutex<LruCache<String, Vec<u8>>>,
    promote_threshold: u32,
    access_counts: dashmap::DashMap<String, u32>,
}

impl KernelCache {
    fn new(young_cap: usize, mature_cap: usize, old_cap: usize) -> Self {
        Self {
            young: Mutex::new(LruCache::new(NonZeroUsize::new(young_cap).unwrap())),
            mature: Mutex::new(LruCache::new(NonZeroUsize::new(mature_cap).unwrap())),
            old: Mutex::new(LruCache::new(NonZeroUsize::new(old_cap).unwrap())),
            promote_threshold: 3,
            access_counts: dashmap::DashMap::new(),
        }
    }

    fn get(&self, key: &str) -> Option<Vec<u8>> {
        // Check old (hottest) tier — single lock, clone within scope
        {
            let maybe = self.old.lock().get(key).cloned();
            if let Some(val) = maybe {
                CACHE_HITS.fetch_add(1, Ordering::Relaxed);
                return Some(val);
            }
        }
        // Check mature tier — clone within lock scope, then promote without re-locking
        {
            let maybe = self.mature.lock().get(key).cloned();
            if let Some(val) = maybe {
                CACHE_HITS.fetch_add(1, Ordering::Relaxed);
                let mut count = self.access_counts.entry(key.to_string()).or_insert(0);
                *count += 1;
                if *count >= self.promote_threshold * 2 {
                    // Promote to old; lock is released before this point
                    if let Some((ek, _)) = self.old.lock().push(key.to_string(), val.clone()) {
                        CACHE_EVICTIONS.fetch_add(1, Ordering::Relaxed);
                        let _ = ek;
                    }
                }
                return Some(val);
            }
        }
        // Check young tier — same pattern: clone within lock, then promote
        {
            let maybe = self.young.lock().get(key).cloned();
            if let Some(val) = maybe {
                CACHE_HITS.fetch_add(1, Ordering::Relaxed);
                let mut count = self.access_counts.entry(key.to_string()).or_insert(0);
                *count += 1;
                if *count >= self.promote_threshold {
                    if let Some((ek, _)) = self.mature.lock().push(key.to_string(), val.clone()) {
                        CACHE_EVICTIONS.fetch_add(1, Ordering::Relaxed);
                        let _ = ek;
                    }
                }
                return Some(val);
            }
        }
        CACHE_MISSES.fetch_add(1, Ordering::Relaxed);
        None
    }

    fn put(&self, key: String, value: Vec<u8>) {
        if let Some((ek, _)) = self.young.lock().push(key, value) {
            CACHE_EVICTIONS.fetch_add(1, Ordering::Relaxed);
            let _ = ek;
        }
    }

    fn trim(&self, percent: f64) {
        let trim_young = (self.young.lock().len() as f64 * percent) as usize;
        let trim_mature = (self.mature.lock().len() as f64 * percent) as usize;

        let mut y = self.young.lock();
        for _ in 0..trim_young {
            if y.pop_lru().is_some() {
                CACHE_EVICTIONS.fetch_add(1, Ordering::Relaxed);
            }
        }
        drop(y);

        let mut m = self.mature.lock();
        for _ in 0..trim_mature {
            if m.pop_lru().is_some() {
                CACHE_EVICTIONS.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    fn clear(&self) {
        self.young.lock().clear();
        self.mature.lock().clear();
        self.old.lock().clear();
        self.access_counts.clear();
    }

    fn stats(&self) -> (usize, usize, usize) {
        (self.young.lock().len(), self.mature.lock().len(), self.old.lock().len())
    }
}

struct SlabPool {
    slab_size: usize,
    pool: Mutex<Vec<Vec<u8>>>,
    allocated: AtomicU64,
    reused: AtomicU64,
}

impl SlabPool {
    fn new(slab_size: usize, initial_count: usize) -> Self {
        let pool: Vec<Vec<u8>> = (0..initial_count)
            .map(|_| vec![0u8; slab_size])
            .collect();
        Self {
            slab_size,
            pool: Mutex::new(pool),
            allocated: AtomicU64::new(0),
            reused: AtomicU64::new(0),
        }
    }

    fn acquire(&self) -> Vec<u8> {
        if let Some(slab) = self.pool.lock().pop() {
            self.reused.fetch_add(1, Ordering::Relaxed);
            slab
        } else {
            self.allocated.fetch_add(1, Ordering::Relaxed);
            vec![0u8; self.slab_size]
        }
    }

    fn release(&self, mut slab: Vec<u8>) {
        slab.fill(0);
        self.pool.lock().push(slab);
    }
}

static CACHE: std::sync::OnceLock<KernelCache> = std::sync::OnceLock::new();
static SLAB_POOL: std::sync::OnceLock<SlabPool> = std::sync::OnceLock::new();

fn get_cache() -> &'static KernelCache {
    CACHE.get_or_init(|| KernelCache::new(2048, 512, 128))
}

fn get_slab_pool() -> &'static SlabPool {
    SLAB_POOL.get_or_init(|| SlabPool::new(4096, 64))
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelMemoryStats {
    pub young_entries: u32,
    pub mature_entries: u32,
    pub old_entries: u32,
    pub cache_hits: f64,
    pub cache_misses: f64,
    pub evictions: f64,
    pub slab_allocated: f64,
    pub slab_reused: f64,
    pub pressure_active: bool,
}

#[napi]
pub fn kernel_init_memory(young_cap: Option<u32>, mature_cap: Option<u32>, old_cap: Option<u32>) -> napi::Result<bool> {
    let _ = CACHE.get_or_init(|| {
        KernelCache::new(
            young_cap.unwrap_or(2048) as usize,
            mature_cap.unwrap_or(512) as usize,
            old_cap.unwrap_or(128) as usize,
        )
    });
    let _ = get_slab_pool();
    Ok(true)
}

#[napi]
pub fn kernel_cache_get(key: String) -> Option<Buffer> {
    get_cache().get(&key).map(Buffer::from)
}

#[napi]
pub fn kernel_cache_set(key: String, value: Buffer) {
    get_cache().put(key, value.to_vec());
}

#[napi]
pub fn kernel_cache_trim(percent: f64) {
    get_cache().trim(percent.clamp(0.0, 1.0));
}

#[napi]
pub fn kernel_cache_clear() {
    get_cache().clear();
}

#[napi]
pub fn kernel_slab_acquire() -> Buffer {
    Buffer::from(get_slab_pool().acquire())
}

#[napi]
pub fn kernel_slab_release(slab: Buffer) {
    get_slab_pool().release(slab.to_vec());
}

#[napi]
pub fn kernel_check_memory_pressure() -> bool {
    let sys = sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::new().with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    let total = sys.total_memory();
    let available = sys.available_memory();
    let usage_pct = if total > 0 { ((total - available) as f64 / total as f64) * 100.0 } else { 0.0 };
    let pressure = usage_pct > 85.0;
    PRESSURE_ACTIVE.store(pressure, Ordering::Relaxed);
    if pressure {
        get_cache().trim(0.25);
    }
    pressure
}

#[napi]
pub fn kernel_memory_stats() -> KernelMemoryStats {
    let (y, m, o) = get_cache().stats();
    KernelMemoryStats {
        young_entries: y as u32,
        mature_entries: m as u32,
        old_entries: o as u32,
        cache_hits: CACHE_HITS.load(Ordering::Relaxed) as f64,
        cache_misses: CACHE_MISSES.load(Ordering::Relaxed) as f64,
        evictions: CACHE_EVICTIONS.load(Ordering::Relaxed) as f64,
        slab_allocated: get_slab_pool().allocated.load(Ordering::Relaxed) as f64,
        slab_reused: get_slab_pool().reused.load(Ordering::Relaxed) as f64,
        pressure_active: PRESSURE_ACTIVE.load(Ordering::Relaxed),
    }
}

/// Batch cache get - retrieve multiple keys at once (reduced lock contention).
#[napi]
pub fn kernel_cache_get_batch(keys: Vec<String>) -> Vec<Option<Buffer>> {
    keys.iter()
        .map(|k| get_cache().get(k).map(Buffer::from))
        .collect()
}

/// Batch cache set - store multiple key-value pairs at once.
#[napi]
pub fn kernel_cache_set_batch(entries: Vec<serde_json::Value>) {
    let cache = get_cache();
    for entry in entries {
        if let (Some(key), Some(value)) = (
            entry.get("key").and_then(|v| v.as_str()),
            entry.get("value").and_then(|v| v.as_str()),
        ) {
            cache.put(key.to_string(), value.as_bytes().to_vec());
        }
    }
}

/// Acquire multiple slabs at once (batch allocation).
#[napi]
pub fn kernel_slab_acquire_batch(count: u32) -> Vec<Buffer> {
    let pool = get_slab_pool();
    (0..count.min(64)) // Cap at 64 to prevent abuse
        .map(|_| Buffer::from(pool.acquire()))
        .collect()
}

/// Release multiple slabs at once (batch deallocation).
#[napi]
pub fn kernel_slab_release_batch(slabs: Vec<Buffer>) {
    let pool = get_slab_pool();
    for slab in slabs {
        pool.release(slab.to_vec());
    }
}

/// Get detailed memory breakdown for debugging.
#[napi]
pub fn kernel_memory_detailed_stats() -> String {
    let sys = sysinfo::System::new_with_specifics(
        sysinfo::RefreshKind::new().with_memory(sysinfo::MemoryRefreshKind::everything()),
    );
    let (y, m, o) = get_cache().stats();
    let pool = get_slab_pool();
    
    // Pre-calculate hit ratio to avoid complex expression in json! macro
    let hits = CACHE_HITS.load(Ordering::Relaxed) as f64;
    let misses = CACHE_MISSES.load(Ordering::Relaxed) as f64;
    let hit_ratio = if hits + misses > 0.0 { hits / (hits + misses) } else { 0.0 };
    
    serde_json::json!({
        "system": {
            "total_mb": sys.total_memory() / (1024 * 1024),
            "available_mb": sys.available_memory() / (1024 * 1024),
            "used_mb": sys.used_memory() / (1024 * 1024),
            "swap_total_mb": sys.total_swap() / (1024 * 1024),
            "swap_used_mb": sys.used_swap() / (1024 * 1024)
        },
        "kernel_cache": {
            "young": y,
            "mature": m,
            "old": o,
            "hits": hits as u64,
            "misses": misses as u64,
            "evictions": CACHE_EVICTIONS.load(Ordering::Relaxed),
            "hit_ratio": hit_ratio
        },
        "slab_pool": {
            "allocated": pool.allocated.load(Ordering::Relaxed),
            "reused": pool.reused.load(Ordering::Relaxed),
            "pool_size": pool.pool.lock().len(),
            "slab_size_bytes": pool.slab_size
        },
        "pressure_active": PRESSURE_ACTIVE.load(Ordering::Relaxed)
    }).to_string()
}
