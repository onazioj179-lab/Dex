// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- Scheduler module.
// Core count detection, recommended thread count, thread priority helpers.

/// Get the number of logical CPU cores.
pub fn get_core_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

/// Calculate the recommended number of threads for CPU-bound work.
/// Reserves at least 2 cores for the main thread and renderer.
pub fn get_recommended_threads() -> usize {
    let cores = get_core_count();
    if cores <= 2 {
        1
    } else if cores <= 4 {
        cores - 1
    } else {
        cores - 2
    }
}

/// Calculate the recommended number of IO-bound threads.
/// IO work can use more threads than cores since threads spend
/// most of their time waiting.
pub fn get_recommended_io_threads() -> usize {
    let cores = get_core_count();
    (cores * 2).max(4)
}

/// Performance tier based on available CPU cores.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PerformanceTier {
    /// 8+ cores -- full effects, max particles, all background tasks
    High,
    /// 4-7 cores -- reduced particles, selective background tasks
    Medium,
    /// 1-3 cores -- minimal effects, essential tasks only
    Low,
}

impl PerformanceTier {
    pub fn detect() -> Self {
        let cores = get_core_count();
        if cores >= 8 {
            PerformanceTier::High
        } else if cores >= 4 {
            PerformanceTier::Medium
        } else {
            PerformanceTier::Low
        }
    }

    pub fn max_particles(&self) -> usize {
        match self {
            PerformanceTier::High => 200,
            PerformanceTier::Medium => 50,
            PerformanceTier::Low => 20,
        }
    }

    pub fn max_blur_surfaces(&self) -> usize {
        match self {
            PerformanceTier::High => 10,
            PerformanceTier::Medium => 4,
            PerformanceTier::Low => 1,
        }
    }

    pub fn enable_motion_blur(&self) -> bool {
        matches!(self, PerformanceTier::High)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            PerformanceTier::High => "high",
            PerformanceTier::Medium => "medium",
            PerformanceTier::Low => "low",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_count_positive() {
        assert!(get_core_count() > 0);
    }

    #[test]
    fn recommended_threads_positive() {
        assert!(get_recommended_threads() > 0);
    }

    #[test]
    fn io_threads_at_least_four() {
        assert!(get_recommended_io_threads() >= 4);
    }

    #[test]
    fn tier_particles() {
        assert!(PerformanceTier::High.max_particles() > PerformanceTier::Medium.max_particles());
        assert!(PerformanceTier::Medium.max_particles() > PerformanceTier::Low.max_particles());
    }
}
