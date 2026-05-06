// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
use std::sync::atomic::{AtomicU64, Ordering};
use dashmap::DashMap;
use napi_derive::napi;
use rayon::prelude::*;

static STRINGS_INTERNED: AtomicU64 = AtomicU64::new(0);
static STRINGS_DEDUPED: AtomicU64 = AtomicU64::new(0);
static BATCH_OPS: AtomicU64 = AtomicU64::new(0);
static BATCH_ITEMS: AtomicU64 = AtomicU64::new(0);

struct StringInterner {
    table: DashMap<String, u64>,
    reverse: DashMap<u64, String>,
    next_id: AtomicU64,
}

impl StringInterner {
    fn new() -> Self {
        Self {
            table: DashMap::new(),
            reverse: DashMap::new(),
            next_id: AtomicU64::new(1),
        }
    }

    fn intern(&self, s: &str) -> u64 {
        if let Some(id) = self.table.get(s) {
            STRINGS_DEDUPED.fetch_add(1, Ordering::Relaxed);
            return *id;
        }
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.table.insert(s.to_string(), id);
        self.reverse.insert(id, s.to_string());
        STRINGS_INTERNED.fetch_add(1, Ordering::Relaxed);
        id
    }

    fn resolve(&self, id: u64) -> Option<String> {
        self.reverse.get(&id).map(|r| r.clone())
    }

    fn len(&self) -> usize {
        self.table.len()
    }
}

struct BitwiseFlags {
    lo: AtomicU64,
    hi: AtomicU64,
}

impl BitwiseFlags {
    fn new() -> Self {
        Self {
            lo: AtomicU64::new(0),
            hi: AtomicU64::new(0),
        }
    }

    fn set(&self, bit: u32) {
        if bit < 64 {
            self.lo.fetch_or(1u64 << bit, Ordering::Relaxed);
        } else if bit < 128 {
            self.hi.fetch_or(1u64 << (bit - 64), Ordering::Relaxed);
        }
    }

    fn clear(&self, bit: u32) {
        if bit < 64 {
            self.lo.fetch_and(!(1u64 << bit), Ordering::Relaxed);
        } else if bit < 128 {
            self.hi.fetch_and(!(1u64 << (bit - 64)), Ordering::Relaxed);
        }
    }

    fn test(&self, bit: u32) -> bool {
        if bit < 64 {
            (self.lo.load(Ordering::Relaxed) >> bit) & 1 == 1
        } else if bit < 128 {
            (self.hi.load(Ordering::Relaxed) >> (bit - 64)) & 1 == 1
        } else {
            false
        }
    }

    fn popcount(&self) -> u32 {
        self.lo.load(Ordering::Relaxed).count_ones() +
        self.hi.load(Ordering::Relaxed).count_ones()
    }
}

static INTERNER: std::sync::OnceLock<StringInterner> = std::sync::OnceLock::new();
static FLAGS: std::sync::OnceLock<BitwiseFlags> = std::sync::OnceLock::new();
static ID_REGISTRY: std::sync::OnceLock<DashMap<String, u32>> = std::sync::OnceLock::new();
static NEXT_COMPACT_ID: AtomicU64 = AtomicU64::new(1);

fn get_interner() -> &'static StringInterner {
    INTERNER.get_or_init(StringInterner::new)
}

fn get_flags() -> &'static BitwiseFlags {
    FLAGS.get_or_init(BitwiseFlags::new)
}

fn get_id_registry() -> &'static DashMap<String, u32> {
    ID_REGISTRY.get_or_init(DashMap::new)
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelCPUStats {
    pub strings_interned: f64,
    pub strings_deduped: f64,
    pub intern_table_size: u32,
    pub batch_operations: f64,
    pub batch_items_processed: f64,
    pub flags_set: u32,
    pub id_registry_size: u32,
}

#[napi]
pub fn kernel_init_cpu() -> napi::Result<bool> {
    let _ = get_interner();
    let _ = get_flags();
    let _ = get_id_registry();
    Ok(true)
}

#[napi]
pub fn kernel_intern_string(s: String) -> f64 {
    get_interner().intern(&s) as f64
}

#[napi]
pub fn kernel_intern_bulk(strings: Vec<String>) -> Vec<f64> {
    strings.iter().map(|s| get_interner().intern(s) as f64).collect()
}

#[napi]
pub fn kernel_resolve_string(id: f64) -> Option<String> {
    get_interner().resolve(id as u64)
}

#[napi]
pub fn kernel_register_id(name: String) -> u32 {
    let registry = get_id_registry();
    if let Some(id) = registry.get(&name) {
        return *id;
    }
    let id = NEXT_COMPACT_ID.fetch_add(1, Ordering::Relaxed) as u32;
    registry.insert(name, id);
    id
}

#[napi]
pub fn kernel_lookup_id(name: String) -> Option<u32> {
    get_id_registry().get(&name).map(|r| *r)
}

#[napi]
pub fn kernel_flag_set(bit: u32) {
    get_flags().set(bit);
}

#[napi]
pub fn kernel_flag_clear(bit: u32) {
    get_flags().clear(bit);
}

#[napi]
pub fn kernel_flag_test(bit: u32) -> bool {
    get_flags().test(bit)
}

#[napi]
pub fn kernel_flag_popcount() -> u32 {
    get_flags().popcount()
}

#[napi]
pub fn kernel_batch_hash(items: Vec<String>) -> Vec<f64> {
    BATCH_OPS.fetch_add(1, Ordering::Relaxed);
    BATCH_ITEMS.fetch_add(items.len() as u64, Ordering::Relaxed);
    items.par_iter().map(|s| {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in s.bytes() {
            hash ^= byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash as f64
    }).collect()
}

#[napi]
pub fn kernel_batch_sort(mut items: Vec<String>) -> Vec<String> {
    BATCH_OPS.fetch_add(1, Ordering::Relaxed);
    BATCH_ITEMS.fetch_add(items.len() as u64, Ordering::Relaxed);
    items.par_sort_unstable();
    items
}

#[napi]
pub fn kernel_batch_dedupe(items: Vec<String>) -> Vec<String> {
    BATCH_OPS.fetch_add(1, Ordering::Relaxed);
    BATCH_ITEMS.fetch_add(items.len() as u64, Ordering::Relaxed);
    let set: std::collections::HashSet<String> = items.into_iter().collect();
    set.into_iter().collect()
}

#[napi]
pub fn kernel_json_parse(input: String) -> napi::Result<String> {
    let _: serde_json::Value = serde_json::from_str(&input)
        .map_err(|e| napi::Error::from_reason(format!("json parse: {}", e)))?;
    Ok(input)
}

#[napi]
pub fn kernel_hrtime_us() -> f64 {
    use std::time::Instant;
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(Instant::now);
    start.elapsed().as_micros() as f64
}

#[napi]
pub fn kernel_popcount32(x: u32) -> u32 {
    x.count_ones()
}

#[napi]
pub fn kernel_cpu_stats() -> KernelCPUStats {
    KernelCPUStats {
        strings_interned: STRINGS_INTERNED.load(Ordering::Relaxed) as f64,
        strings_deduped: STRINGS_DEDUPED.load(Ordering::Relaxed) as f64,
        intern_table_size: get_interner().len() as u32,
        batch_operations: BATCH_OPS.load(Ordering::Relaxed) as f64,
        batch_items_processed: BATCH_ITEMS.load(Ordering::Relaxed) as f64,
        flags_set: get_flags().popcount(),
        id_registry_size: get_id_registry().len() as u32,
    }
}
