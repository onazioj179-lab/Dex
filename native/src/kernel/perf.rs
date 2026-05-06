// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// DEX Kernel — Performance Counters & Frame Governor
// High-res timing, P50/P95/P99 histograms, throughput metering, frame budget
// ═══════════════════════════════════════════════════════════════════════════

use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use parking_lot::Mutex;
use napi_derive::napi;

// ─────────────────────────────────────────────────────────────────────────
// Histogram — fixed-slot latency distribution
// ─────────────────────────────────────────────────────────────────────────

const HIST_SLOTS: usize = 1024;

struct Histogram {
    slots: Vec<AtomicU64>,
    max_us: u64,
    count: AtomicU64,
    sum: AtomicU64,
    min: AtomicU64,
    max: AtomicU64,
}

impl Histogram {
    fn new(max_us: u64) -> Self {
        let slots = (0..HIST_SLOTS).map(|_| AtomicU64::new(0)).collect();
        Self {
            slots,
            max_us,
            count: AtomicU64::new(0),
            sum: AtomicU64::new(0),
            min: AtomicU64::new(u64::MAX),
            max: AtomicU64::new(0),
        }
    }

    fn record(&self, value_us: u64) {
        let idx = ((value_us as f64 / self.max_us as f64) * (HIST_SLOTS - 1) as f64)
            .min((HIST_SLOTS - 1) as f64) as usize;
        self.slots[idx].fetch_add(1, Ordering::Relaxed);
        self.count.fetch_add(1, Ordering::Relaxed);
        self.sum.fetch_add(value_us, Ordering::Relaxed);
        // CAS loop for min
        let mut cur = self.min.load(Ordering::Relaxed);
        while value_us < cur {
            match self.min.compare_exchange_weak(cur, value_us, Ordering::Relaxed, Ordering::Relaxed) {
                Ok(_) => break,
                Err(v) => cur = v,
            }
        }
        // CAS loop for max
        let mut cur = self.max.load(Ordering::Relaxed);
        while value_us > cur {
            match self.max.compare_exchange_weak(cur, value_us, Ordering::Relaxed, Ordering::Relaxed) {
                Ok(_) => break,
                Err(v) => cur = v,
            }
        }
    }

    fn percentile(&self, p: f64) -> f64 {
        let total = self.count.load(Ordering::Relaxed);
        if total == 0 { return 0.0; }
        let target = (total as f64 * p).ceil() as u64;
        let mut cumulative = 0u64;
        for (i, slot) in self.slots.iter().enumerate() {
            cumulative += slot.load(Ordering::Relaxed);
            if cumulative >= target {
                return (i as f64 / (HIST_SLOTS - 1) as f64) * self.max_us as f64;
            }
        }
        self.max_us as f64
    }

    fn avg(&self) -> f64 {
        let c = self.count.load(Ordering::Relaxed);
        if c == 0 { return 0.0; }
        self.sum.load(Ordering::Relaxed) as f64 / c as f64
    }

    fn reset(&self) {
        for slot in &self.slots {
            slot.store(0, Ordering::Relaxed);
        }
        self.count.store(0, Ordering::Relaxed);
        self.sum.store(0, Ordering::Relaxed);
        self.min.store(u64::MAX, Ordering::Relaxed);
        self.max.store(0, Ordering::Relaxed);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Throughput Meter — sliding-window ops/sec
// ─────────────────────────────────────────────────────────────────────────

const WINDOW_SLOTS: usize = 60; // 1-second windows for 60s history

struct ThroughputMeter {
    buckets: Vec<AtomicU64>,
    // Track which elapsed-second each bucket currently belongs to
    bucket_epoch: Vec<AtomicU64>,
    start: std::time::Instant,
}

impl ThroughputMeter {
    fn new() -> Self {
        Self {
            buckets: (0..WINDOW_SLOTS).map(|_| AtomicU64::new(0)).collect(),
            bucket_epoch: (0..WINDOW_SLOTS).map(|_| AtomicU64::new(u64::MAX)).collect(),
            start: std::time::Instant::now(),
        }
    }

    fn record(&self, count: u64) {
        let elapsed = self.start.elapsed().as_secs();
        let idx = (elapsed as usize) % WINDOW_SLOTS;
        // If this bucket belongs to a past second, reset it first
        let prev_epoch = self.bucket_epoch[idx].load(Ordering::Relaxed);
        if prev_epoch != elapsed {
            // Swap epoch; only one writer wins the reset race — that's fine
            if self.bucket_epoch[idx]
                .compare_exchange(prev_epoch, elapsed, Ordering::SeqCst, Ordering::Relaxed)
                .is_ok()
            {
                self.buckets[idx].store(0, Ordering::Relaxed);
            }
        }
        self.buckets[idx].fetch_add(count, Ordering::Relaxed);
    }

    fn ops_per_sec(&self) -> f64 {
        let elapsed = self.start.elapsed().as_secs() as usize;
        let current_idx = elapsed % WINDOW_SLOTS;
        // Sum last 5 seconds, divide by 5
        let window = 5usize;
        let mut total = 0u64;
        for i in 1..=window {
            let idx = (current_idx + WINDOW_SLOTS - i) % WINDOW_SLOTS;
            total += self.buckets[idx].load(Ordering::Relaxed);
        }
        total as f64 / window as f64
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Frame Governor — adaptive frame budget tracking
// ─────────────────────────────────────────────────────────────────────────

const FRAME_HISTORY: usize = 120;

struct FrameGovernor {
    target_fps: AtomicU64,
    frame_times: Mutex<Vec<f64>>,
    frame_idx: AtomicU64,
    dropped_frames: AtomicU64,
    total_frames: AtomicU64,
    budget_exceeded: AtomicU64,
    last_frame_us: AtomicU64,
    enabled: AtomicBool,
}

impl FrameGovernor {
    fn new(target_fps: u32) -> Self {
        Self {
            target_fps: AtomicU64::new(target_fps as u64),
            frame_times: Mutex::new(vec![0.0; FRAME_HISTORY]),
            frame_idx: AtomicU64::new(0),
            dropped_frames: AtomicU64::new(0),
            total_frames: AtomicU64::new(0),
            budget_exceeded: AtomicU64::new(0),
            last_frame_us: AtomicU64::new(0),
            enabled: AtomicBool::new(true),
        }
    }

    fn record_frame(&self, duration_us: f64) {
        let idx = self.frame_idx.fetch_add(1, Ordering::Relaxed) as usize % FRAME_HISTORY;
        self.frame_times.lock()[idx] = duration_us;
        self.total_frames.fetch_add(1, Ordering::Relaxed);
        self.last_frame_us.store(duration_us as u64, Ordering::Relaxed);

        let budget = 1_000_000.0 / self.target_fps.load(Ordering::Relaxed) as f64;
        if duration_us > budget {
            self.budget_exceeded.fetch_add(1, Ordering::Relaxed);
        }
        if duration_us > budget * 2.0 {
            self.dropped_frames.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn avg_frame_ms(&self) -> f64 {
        let times = self.frame_times.lock();
        let total = self.total_frames.load(Ordering::Relaxed).min(FRAME_HISTORY as u64) as usize;
        if total == 0 { return 0.0; }
        let sum: f64 = times[..total].iter().sum();
        (sum / total as f64) / 1000.0
    }

    fn effective_fps(&self) -> f64 {
        let avg = self.avg_frame_ms();
        if avg <= 0.0 { return 0.0; }
        1000.0 / avg
    }

    fn should_skip_frame(&self) -> bool {
        if !self.enabled.load(Ordering::Relaxed) { return false; }
        let last = self.last_frame_us.load(Ordering::Relaxed) as f64;
        let budget = 1_000_000.0 / self.target_fps.load(Ordering::Relaxed) as f64;
        // If last frame took >150% of budget, advise skip
        last > budget * 1.5
    }
}

static FRAME_HIST: std::sync::OnceLock<Histogram> = std::sync::OnceLock::new();
static IPC_HIST: std::sync::OnceLock<Histogram> = std::sync::OnceLock::new();
static IO_HIST: std::sync::OnceLock<Histogram> = std::sync::OnceLock::new();
static THROUGHPUT: std::sync::OnceLock<ThroughputMeter> = std::sync::OnceLock::new();
static FRAME_GOV: std::sync::OnceLock<FrameGovernor> = std::sync::OnceLock::new();

fn get_frame_hist() -> &'static Histogram {
    FRAME_HIST.get_or_init(|| Histogram::new(100_000)) // max 100ms
}

fn get_ipc_hist() -> &'static Histogram {
    IPC_HIST.get_or_init(|| Histogram::new(50_000)) // max 50ms
}

fn get_io_hist() -> &'static Histogram {
    IO_HIST.get_or_init(|| Histogram::new(500_000)) // max 500ms
}

fn get_throughput() -> &'static ThroughputMeter {
    THROUGHPUT.get_or_init(ThroughputMeter::new)
}

fn get_frame_gov() -> &'static FrameGovernor {
    FRAME_GOV.get_or_init(|| FrameGovernor::new(60))
}

// ─────────────────────────────────────────────────────────────────────────
// NAPI Exports
// ─────────────────────────────────────────────────────────────────────────

#[napi(object)]
pub struct KernelPerfStats {
    pub frame_p50_ms: f64,
    pub frame_p95_ms: f64,
    pub frame_p99_ms: f64,
    pub frame_avg_ms: f64,
    pub ipc_p50_ms: f64,
    pub ipc_p95_ms: f64,
    pub ipc_p99_ms: f64,
    pub io_p50_ms: f64,
    pub io_p95_ms: f64,
    pub io_p99_ms: f64,
    pub ops_per_sec: f64,
    pub effective_fps: f64,
    pub target_fps: u32,
    pub dropped_frames: f64,
    pub total_frames: f64,
    pub budget_exceeded: f64,
}

#[napi]
pub fn kernel_init_perf(target_fps: Option<u32>) -> napi::Result<bool> {
    let _ = get_frame_hist();
    let _ = get_ipc_hist();
    let _ = get_io_hist();
    let _ = get_throughput();
    let _ = FRAME_GOV.get_or_init(|| FrameGovernor::new(target_fps.unwrap_or(60)));
    Ok(true)
}

#[napi]
pub fn kernel_perf_record_frame(duration_us: f64) {
    get_frame_hist().record(duration_us as u64);
    get_frame_gov().record_frame(duration_us);
}

#[napi]
pub fn kernel_perf_record_ipc(duration_us: f64) {
    get_ipc_hist().record(duration_us as u64);
}

#[napi]
pub fn kernel_perf_record_io(duration_us: f64) {
    get_io_hist().record(duration_us as u64);
    get_throughput().record(1);
}

#[napi]
pub fn kernel_perf_should_skip_frame() -> bool {
    get_frame_gov().should_skip_frame()
}

#[napi]
pub fn kernel_perf_set_target_fps(fps: u32) {
    get_frame_gov().target_fps.store(fps as u64, Ordering::Relaxed);
}

#[napi]
pub fn kernel_perf_reset() {
    get_frame_hist().reset();
    get_ipc_hist().reset();
    get_io_hist().reset();
}

#[napi]
pub fn kernel_perf_stats() -> KernelPerfStats {
    let fh = get_frame_hist();
    let ih = get_ipc_hist();
    let ioh = get_io_hist();
    let gov = get_frame_gov();
    KernelPerfStats {
        frame_p50_ms: fh.percentile(0.50) / 1000.0,
        frame_p95_ms: fh.percentile(0.95) / 1000.0,
        frame_p99_ms: fh.percentile(0.99) / 1000.0,
        frame_avg_ms: fh.avg() / 1000.0,
        ipc_p50_ms: ih.percentile(0.50) / 1000.0,
        ipc_p95_ms: ih.percentile(0.95) / 1000.0,
        ipc_p99_ms: ih.percentile(0.99) / 1000.0,
        io_p50_ms: ioh.percentile(0.50) / 1000.0,
        io_p95_ms: ioh.percentile(0.95) / 1000.0,
        io_p99_ms: ioh.percentile(0.99) / 1000.0,
        ops_per_sec: get_throughput().ops_per_sec(),
        effective_fps: gov.effective_fps(),
        target_fps: gov.target_fps.load(Ordering::Relaxed) as u32,
        dropped_frames: gov.dropped_frames.load(Ordering::Relaxed) as f64,
        total_frames: gov.total_frames.load(Ordering::Relaxed) as f64,
        budget_exceeded: gov.budget_exceeded.load(Ordering::Relaxed) as f64,
    }
}
