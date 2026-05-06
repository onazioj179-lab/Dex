// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use parking_lot::Mutex;
use dashmap::DashMap;
use napi::bindgen_prelude::*;
use napi_derive::napi;

static MODULES_CACHED: AtomicU64 = AtomicU64::new(0);
static CACHE_HITS: AtomicU64 = AtomicU64::new(0);
static CACHE_MISSES: AtomicU64 = AtomicU64::new(0);
static STARTUP_COMPLETE: AtomicBool = AtomicBool::new(false);

struct ModuleCache {
    cache_dir: String,
    index: DashMap<String, ModuleEntry>,
}

struct ModuleEntry {
    hash: String,
    size: u64,
    cached_at: u64,
}

impl ModuleCache {
    fn new(cache_dir: String) -> Self {
        let mc = Self {
            cache_dir,
            index: DashMap::new(),
        };
        mc.load_index();
        mc
    }

    fn load_index(&self) {
        let index_path = std::path::Path::new(&self.cache_dir).join("module-index.json");
        if let Ok(data) = std::fs::read_to_string(&index_path) {
            if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&data) {
                for (key, val) in map {
                    if let (Some(hash), Some(size), Some(cached_at)) = (
                        val.get("hash").and_then(|v| v.as_str()),
                        val.get("size").and_then(|v| v.as_u64()),
                        val.get("cachedAt").and_then(|v| v.as_u64()),
                    ) {
                        self.index.insert(key, ModuleEntry {
                            hash: hash.to_string(),
                            size,
                            cached_at,
                        });
                    }
                }
            }
        }
    }

    fn save_index(&self) {
        let _ = std::fs::create_dir_all(&self.cache_dir);
        let index_path = std::path::Path::new(&self.cache_dir).join("module-index.json");
        let mut map = serde_json::Map::new();
        for entry in self.index.iter() {
            let mut obj = serde_json::Map::new();
            obj.insert("hash".into(), serde_json::Value::String(entry.hash.clone()));
            obj.insert("size".into(), serde_json::Value::Number(entry.size.into()));
            obj.insert("cachedAt".into(), serde_json::Value::Number(entry.cached_at.into()));
            map.insert(entry.key().clone(), serde_json::Value::Object(obj));
        }
        let json = serde_json::to_string(&map).unwrap_or_default();
        let _ = std::fs::write(index_path, json);
    }

    fn cache_module(&self, module_id: &str, source_hash: &str, data: &[u8]) -> bool {
        let _ = std::fs::create_dir_all(&self.cache_dir);
        let file_path = std::path::Path::new(&self.cache_dir).join(format!("{}.cache", module_id));
        if std::fs::write(&file_path, data).is_ok() {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            self.index.insert(module_id.to_string(), ModuleEntry {
                hash: source_hash.to_string(),
                size: data.len() as u64,
                cached_at: now,
            });
            MODULES_CACHED.fetch_add(1, Ordering::Relaxed);
            self.save_index();
            true
        } else {
            false
        }
    }

    fn get_module(&self, module_id: &str, source_hash: &str) -> Option<Vec<u8>> {
        if let Some(entry) = self.index.get(module_id) {
            if entry.hash == source_hash {
                let file_path = std::path::Path::new(&self.cache_dir).join(format!("{}.cache", module_id));
                if let Ok(data) = std::fs::read(&file_path) {
                    CACHE_HITS.fetch_add(1, Ordering::Relaxed);
                    return Some(data);
                }
            }
        }
        CACHE_MISSES.fetch_add(1, Ordering::Relaxed);
        None
    }

    fn invalidate(&self, module_id: &str) {
        self.index.remove(module_id);
        let file_path = std::path::Path::new(&self.cache_dir).join(format!("{}.cache", module_id));
        let _ = std::fs::remove_file(file_path);
        self.save_index();
    }

    fn clear(&self) {
        self.index.clear();
        if let Ok(entries) = std::fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map(|e| e == "cache").unwrap_or(false) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        self.save_index();
    }
}

struct StartupTracer {
    marks: Mutex<Vec<(String, f64)>>,
    start: std::time::Instant,
}

impl StartupTracer {
    fn new() -> Self {
        Self {
            marks: Mutex::new(Vec::new()),
            start: std::time::Instant::now(),
        }
    }

    fn mark(&self, label: &str) {
        let elapsed = self.start.elapsed().as_micros() as f64;
        self.marks.lock().push((label.to_string(), elapsed));
    }

    fn get_marks(&self) -> Vec<(String, f64)> {
        self.marks.lock().clone()
    }

    fn total_us(&self) -> f64 {
        self.start.elapsed().as_micros() as f64
    }
}

static MODULE_CACHE: std::sync::OnceLock<ModuleCache> = std::sync::OnceLock::new();
static STARTUP_TRACER: std::sync::OnceLock<StartupTracer> = std::sync::OnceLock::new();

fn get_module_cache() -> &'static ModuleCache {
    MODULE_CACHE.get_or_init(|| {
        let cache_dir = dirs::data_local_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("DEX")
            .join("kernel-cache");
        ModuleCache::new(cache_dir.to_string_lossy().to_string())
    })
}

fn get_tracer() -> &'static StartupTracer {
    STARTUP_TRACER.get_or_init(StartupTracer::new)
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelStartupStats {
    pub modules_cached: f64,
    pub cache_hits: f64,
    pub cache_misses: f64,
    pub startup_complete: bool,
    pub total_startup_us: f64,
    pub marks: Vec<String>,
}

#[napi]
pub fn kernel_init_startup() -> napi::Result<bool> {
    let _ = get_module_cache();
    get_tracer().mark("kernel_init");
    Ok(true)
}

#[napi]
pub fn kernel_startup_mark(label: String) {
    get_tracer().mark(&label);
}

#[napi]
pub fn kernel_startup_complete() {
    get_tracer().mark("startup_complete");
    STARTUP_COMPLETE.store(true, Ordering::Relaxed);
}

#[napi]
pub fn kernel_cache_module(module_id: String, source_hash: String, data: Buffer) -> bool {
    get_module_cache().cache_module(&module_id, &source_hash, &data)
}

#[napi]
pub fn kernel_get_cached_module(module_id: String, source_hash: String) -> Option<Buffer> {
    get_module_cache().get_module(&module_id, &source_hash).map(Buffer::from)
}

#[napi]
pub fn kernel_invalidate_module(module_id: String) {
    get_module_cache().invalidate(&module_id);
}

#[napi]
pub fn kernel_clear_module_cache() {
    get_module_cache().clear();
}

#[napi]
pub fn kernel_startup_stats() -> KernelStartupStats {
    let marks = get_tracer().get_marks();
    let mark_strings: Vec<String> = marks.iter().map(|(label, us)| {
        format!("{}:{:.0}", label, us)
    }).collect();
    KernelStartupStats {
        modules_cached: MODULES_CACHED.load(Ordering::Relaxed) as f64,
        cache_hits: CACHE_HITS.load(Ordering::Relaxed) as f64,
        cache_misses: CACHE_MISSES.load(Ordering::Relaxed) as f64,
        startup_complete: STARTUP_COMPLETE.load(Ordering::Relaxed),
        total_startup_us: get_tracer().total_us(),
        marks: mark_strings,
    }
}
