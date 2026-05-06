// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
use std::collections::BinaryHeap;
use std::cmp::Ordering;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering as AOrdering};
use parking_lot::Mutex;
use napi_derive::napi;

static TASK_ID_GEN: AtomicU64 = AtomicU64::new(1);
static TASKS_SUBMITTED: AtomicU64 = AtomicU64::new(0);
static TASKS_COMPLETED: AtomicU64 = AtomicU64::new(0);
static TASKS_STOLEN: AtomicU64 = AtomicU64::new(0);

#[derive(Clone)]
struct KernelTask {
    id: u64,
    priority: u8,
    payload: String,
    created_at: u64,
}

impl Eq for KernelTask {}
impl PartialEq for KernelTask {
    fn eq(&self, other: &Self) -> bool { self.id == other.id }
}
impl PartialOrd for KernelTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}
impl Ord for KernelTask {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority.cmp(&other.priority)
            .then_with(|| other.created_at.cmp(&self.created_at))
    }
}

struct WorkerQueue {
    queue: Mutex<BinaryHeap<KernelTask>>,
}

impl WorkerQueue {
    fn new() -> Self {
        Self { queue: Mutex::new(BinaryHeap::new()) }
    }

    fn push(&self, task: KernelTask) {
        self.queue.lock().push(task);
    }

    fn pop(&self) -> Option<KernelTask> {
        self.queue.lock().pop()
    }

    fn steal(&self) -> Option<KernelTask> {
        let mut q = self.queue.lock();
        if q.len() > 1 {
            let tasks: Vec<_> = std::iter::from_fn(|| q.pop()).collect();
            let stolen = tasks.last().cloned();
            for t in tasks.into_iter().rev().skip(1) {
                q.push(t);
            }
            if stolen.is_some() {
                TASKS_STOLEN.fetch_add(1, AOrdering::Relaxed);
            }
            stolen
        } else {
            None
        }
    }

    fn len(&self) -> usize {
        self.queue.lock().len()
    }
}

static WORKER_COUNT: AtomicUsize = AtomicUsize::new(0);

struct Scheduler {
    workers: Vec<WorkerQueue>,
    next_worker: AtomicUsize,
}

impl Scheduler {
    fn new(num_workers: usize) -> Self {
        let workers = (0..num_workers).map(|_| WorkerQueue::new()).collect();
        Self { workers, next_worker: AtomicUsize::new(0) }
    }

    fn submit(&self, priority: u8, payload: String) -> u64 {
        let id = TASK_ID_GEN.fetch_add(1, AOrdering::Relaxed);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let task = KernelTask { id, priority, payload, created_at: now };

        let idx = self.next_worker.fetch_add(1, AOrdering::Relaxed) % self.workers.len();
        self.workers[idx].push(task);
        TASKS_SUBMITTED.fetch_add(1, AOrdering::Relaxed);
        id
    }

    fn dequeue(&self, worker_id: usize) -> Option<(u64, String)> {
        let idx = worker_id % self.workers.len();
        if let Some(task) = self.workers[idx].pop() {
            TASKS_COMPLETED.fetch_add(1, AOrdering::Relaxed);
            return Some((task.id, task.payload));
        }
        for i in 0..self.workers.len() {
            if i != idx {
                if let Some(task) = self.workers[i].steal() {
                    TASKS_COMPLETED.fetch_add(1, AOrdering::Relaxed);
                    return Some((task.id, task.payload));
                }
            }
        }
        None
    }

    fn queue_lengths(&self) -> Vec<usize> {
        self.workers.iter().map(|w| w.len()).collect()
    }
}

static SCHEDULER: std::sync::OnceLock<Scheduler> = std::sync::OnceLock::new();

fn get_scheduler() -> &'static Scheduler {
    SCHEDULER.get_or_init(|| {
        let cpus = num_cpus();
        WORKER_COUNT.store(cpus, AOrdering::Relaxed);
        Scheduler::new(cpus)
    })
}

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

// --- Timer Wheel ---

struct TimerEntry {
    id: u64,
    expires_at: u64,
    payload: String,
}

struct TimerWheel {
    slots: Vec<Mutex<Vec<TimerEntry>>>,
    slot_count: usize,
    tick_ms: u64,
    current_tick: AtomicU64,
}

impl TimerWheel {
    fn new(slot_count: usize, tick_ms: u64) -> Self {
        let slots = (0..slot_count).map(|_| Mutex::new(Vec::new())).collect();
        Self { slots, slot_count, tick_ms, current_tick: AtomicU64::new(0) }
    }

    fn schedule(&self, delay_ms: u64, payload: String) -> u64 {
        let id = TASK_ID_GEN.fetch_add(1, AOrdering::Relaxed);
        let ticks = delay_ms / self.tick_ms;
        let current = self.current_tick.load(AOrdering::Relaxed);
        let target_slot = ((current + ticks) as usize) % self.slot_count;
        let entry = TimerEntry {
            id,
            expires_at: current + ticks,
            payload,
        };
        self.slots[target_slot].lock().push(entry);
        id
    }

    fn advance(&self) -> Vec<(u64, String)> {
        let tick = self.current_tick.fetch_add(1, AOrdering::Relaxed) + 1;
        let slot_idx = (tick as usize) % self.slot_count;
        let mut slot = self.slots[slot_idx].lock();
        let mut fired = Vec::new();
        slot.retain(|entry| {
            if entry.expires_at <= tick {
                fired.push((entry.id, entry.payload.clone()));
                false
            } else {
                true
            }
        });
        fired
    }
}

static TIMER_WHEEL: std::sync::OnceLock<TimerWheel> = std::sync::OnceLock::new();

fn get_timer_wheel() -> &'static TimerWheel {
    TIMER_WHEEL.get_or_init(|| TimerWheel::new(4096, 1))
}

// --- NAPI Exports ---

#[napi(object)]
pub struct KernelSchedulerStats {
    pub workers: u32,
    pub submitted: f64,
    pub completed: f64,
    pub stolen: f64,
    pub queue_lengths: Vec<u32>,
}

#[napi]
pub fn kernel_init_scheduler(num_workers: Option<u32>) -> napi::Result<u32> {
    let n = num_workers.unwrap_or(num_cpus() as u32) as usize;
    let _ = SCHEDULER.get_or_init(|| {
        WORKER_COUNT.store(n, AOrdering::Relaxed);
        Scheduler::new(n)
    });
    let _ = get_timer_wheel();
    Ok(n as u32)
}

#[napi]
pub fn kernel_submit_task(priority: u8, payload: String) -> f64 {
    get_scheduler().submit(priority, payload) as f64
}

#[napi]
pub fn kernel_dequeue_task(worker_id: u32) -> Option<String> {
    get_scheduler().dequeue(worker_id as usize).map(|(id, p)| {
        format!("{{\"id\":{},\"payload\":{}}}", id, serde_json::to_string(&p).unwrap_or_default())
    })
}

#[napi]
pub fn kernel_schedule_timer(delay_ms: u32, payload: String) -> f64 {
    get_timer_wheel().schedule(delay_ms as u64, payload) as f64
}

#[napi]
pub fn kernel_advance_timer() -> Vec<String> {
    get_timer_wheel().advance().into_iter().map(|(id, p)| {
        format!("{{\"id\":{},\"payload\":{}}}", id, serde_json::to_string(&p).unwrap_or_default())
    }).collect()
}

#[napi]
pub fn kernel_scheduler_stats() -> KernelSchedulerStats {
    let sched = get_scheduler();
    let lengths: Vec<u32> = sched.queue_lengths().into_iter().map(|l| l as u32).collect();
    KernelSchedulerStats {
        workers: WORKER_COUNT.load(AOrdering::Relaxed) as u32,
        submitted: TASKS_SUBMITTED.load(AOrdering::Relaxed) as f64,
        completed: TASKS_COMPLETED.load(AOrdering::Relaxed) as f64,
        stolen: TASKS_STOLEN.load(AOrdering::Relaxed) as f64,
        queue_lengths: lengths,
    }
}

/// Age all pending tasks — boosts low-priority tasks that have waited too long.
/// Prevents starvation in the priority queue. Call periodically (e.g. every 500ms).
#[napi]
pub fn kernel_scheduler_age_tasks(boost_amount: Option<u8>) -> u32 {
    let boost = boost_amount.unwrap_or(1);
    let sched = get_scheduler();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let mut aged = 0u32;
    for worker in &sched.workers {
        let mut q = worker.queue.lock();
        let tasks: Vec<KernelTask> = std::iter::from_fn(|| q.pop()).collect();
        for mut t in tasks {
            // If task has been waiting > 2 seconds, boost priority
            if now.saturating_sub(t.created_at) > 2000 && t.priority < 255 {
                t.priority = t.priority.saturating_add(boost);
                aged += 1;
            }
            q.push(t);
        }
    }
    aged
}

/// Drain all tasks from all workers. Returns count of drained tasks.
#[napi]
pub fn kernel_scheduler_drain() -> u32 {
    let sched = get_scheduler();
    let mut total = 0u32;
    for worker in &sched.workers {
        let mut q = worker.queue.lock();
        while q.pop().is_some() {
            total += 1;
        }
    }
    total
}

/// Get total pending task count across all workers.
#[napi]
pub fn kernel_scheduler_pending() -> u32 {
    let sched = get_scheduler();
    sched.queue_lengths().iter().sum::<usize>() as u32
}

/// Submit multiple tasks in a single batch (reduced lock contention).
/// Returns array of task IDs.
#[napi]
pub fn kernel_submit_tasks_batch(tasks: Vec<serde_json::Value>) -> Vec<f64> {
    let sched = get_scheduler();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    
    let mut ids = Vec::with_capacity(tasks.len());
    
    // Group tasks by target worker to minimize lock contention
    let worker_count = sched.workers.len();
    let mut worker_batches: Vec<Vec<KernelTask>> = vec![Vec::new(); worker_count];
    
    for task_val in tasks {
        let priority = task_val.get("priority")
            .and_then(|v| v.as_u64())
            .unwrap_or(5) as u8;
        let payload = task_val.get("payload")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let id = TASK_ID_GEN.fetch_add(1, AOrdering::Relaxed);
        let task = KernelTask { id, priority, payload, created_at: now };
        
        let idx = sched.next_worker.fetch_add(1, AOrdering::Relaxed) % worker_count;
        worker_batches[idx].push(task);
        ids.push(id as f64);
    }
    
    // Submit batches with single lock acquisition per worker
    for (idx, batch) in worker_batches.into_iter().enumerate() {
        let batch_len = batch.len(); // Store length before consuming batch
        if batch_len > 0 {
            let mut q = sched.workers[idx].queue.lock();
            for task in batch {
                q.push(task);
            }
            TASKS_SUBMITTED.fetch_add(batch_len as u64, AOrdering::Relaxed);
        }
    }
    
    ids
}

/// Dequeue multiple tasks at once (batch dequeue for efficiency).
#[napi]
pub fn kernel_dequeue_tasks_batch(worker_id: u32, max_tasks: u32) -> Vec<String> {
    let sched = get_scheduler();
    let idx = worker_id as usize % sched.workers.len();
    let max = max_tasks.min(100) as usize; // Cap at 100 per batch
    
    let mut results = Vec::with_capacity(max);
    let mut q = sched.workers[idx].queue.lock();
    
    for _ in 0..max {
        if let Some(task) = q.pop() {
            TASKS_COMPLETED.fetch_add(1, AOrdering::Relaxed);
            results.push(format!(
                "{{\"id\":{},\"payload\":{}}}",
                task.id,
                serde_json::to_string(&task.payload).unwrap_or_default()
            ));
        } else {
            break;
        }
    }
    drop(q);
    
    // Try work stealing if we didn't get enough
    if results.len() < max {
        for i in 0..sched.workers.len() {
            if i != idx && results.len() < max {
                if let Some(task) = sched.workers[i].steal() {
                    TASKS_COMPLETED.fetch_add(1, AOrdering::Relaxed);
                    results.push(format!(
                        "{{\"id\":{},\"payload\":{}}}",
                        task.id,
                        serde_json::to_string(&task.payload).unwrap_or_default()
                    ));
                }
            }
        }
    }
    
    results
}
