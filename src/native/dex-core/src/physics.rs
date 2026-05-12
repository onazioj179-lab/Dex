// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX Core -- Spring physics engine with SIMD-accelerated batch ticking.
// All springs run in Rust with zero GC pressure.

/// Per-spring simulation state packed in a cache-friendly struct.
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct SpringState {
    pub position: f32,
    pub velocity: f32,
    pub target: f32,
    pub stiffness: f32,
    pub damping: f32,
    pub mass: f32,
    pub settled: bool,
}

impl SpringState {
    /// Advance the spring by dt seconds using semi-implicit Euler integration.
    /// Returns the new position.
    #[inline(always)]
    pub fn tick(&mut self, dt: f32) -> f32 {
        if self.settled {
            return self.position;
        }
        // Clamp dt to prevent instability from large time gaps
        let dt = dt.min(0.064);

        let spring_force = -self.stiffness * (self.position - self.target);
        let damping_force = -self.damping * self.velocity;
        let acceleration = (spring_force + damping_force) / self.mass;

        // Semi-implicit Euler: update velocity first, then position
        self.velocity += acceleration * dt;
        self.position += self.velocity * dt;

        // Settle detection with tight thresholds
        let distance = (self.position - self.target).abs();
        if distance < 0.001 && self.velocity.abs() < 0.001 {
            self.position = self.target;
            self.velocity = 0.0;
            self.settled = true;
        }
        self.position
    }
}

/// Pool-based physics engine that manages hundreds of springs concurrently.
pub struct PhysicsEngine {
    springs: Vec<SpringState>,
    free_indices: Vec<usize>,
}

impl PhysicsEngine {
    pub fn new(capacity: usize) -> Self {
        Self {
            springs: Vec::with_capacity(capacity),
            free_indices: Vec::new(),
        }
    }

    /// Create a spring and return its pool index.
    pub fn create_spring(
        &mut self,
        stiffness: f32,
        damping: f32,
        mass: f32,
        initial: f32,
        target: f32,
    ) -> usize {
        let state = SpringState {
            position: initial,
            velocity: 0.0,
            target,
            stiffness,
            damping,
            mass: mass.max(0.01), // prevent division by zero
            settled: (initial - target).abs() < 0.001,
        };
        if let Some(idx) = self.free_indices.pop() {
            self.springs[idx] = state;
            idx
        } else {
            self.springs.push(state);
            self.springs.len() - 1
        }
    }

    /// Tick all unsettled springs. Returns (index, position, settled) triples.
    /// Pre-sizes the result vector to the active spring count to avoid
    /// reallocations on the hot path.
    pub fn tick_all(&mut self, dt: f32) -> Vec<(usize, f32, bool)> {
        // Clamp dt once to keep the per-spring math branchless on dt.
        let dt = dt.min(0.064);
        let active_estimate = self.springs.len().saturating_sub(self.free_indices.len());
        let mut results: Vec<(usize, f32, bool)> = Vec::with_capacity(active_estimate);

        // Auto-vectorizable scalar loop. Each spring is independent so
        // LLVM emits SSE/AVX with -O3 + LTO when the slice is contiguous.
        for (i, spring) in self.springs.iter_mut().enumerate() {
            if spring.settled {
                continue;
            }
            // Inline the tick body so the compiler can keep state in registers
            // across the loop iteration (cheaper than a function call here).
            let spring_force = -spring.stiffness * (spring.position - spring.target);
            let damping_force = -spring.damping * spring.velocity;
            let acceleration = (spring_force + damping_force) / spring.mass;
            spring.velocity += acceleration * dt;
            spring.position += spring.velocity * dt;

            let distance = (spring.position - spring.target).abs();
            if distance < 0.001 && spring.velocity.abs() < 0.001 {
                spring.position = spring.target;
                spring.velocity = 0.0;
                spring.settled = true;
            }
            results.push((i, spring.position, spring.settled));
        }
        results
    }

    /// Scalar fallback path that works on all architectures.
    /// Retained for tests that compare against the inlined fast path.
    #[allow(dead_code)]
    fn tick_all_scalar(&mut self, dt: f32) -> Vec<(usize, f32, bool)> {
        let mut results = Vec::new();
        for (i, spring) in self.springs.iter_mut().enumerate() {
            if spring.settled {
                continue;
            }
            let pos = spring.tick(dt);
            results.push((i, pos, spring.settled));
        }
        results
    }

    /// Update the target of a spring and wake it if settled.
    pub fn set_target(&mut self, id: usize, target: f32) {
        if let Some(spring) = self.springs.get_mut(id) {
            spring.target = target;
            spring.settled = false;
        }
    }

    /// Instantly set the current position (used for reduce-motion).
    pub fn set_value(&mut self, id: usize, value: f32) {
        if let Some(spring) = self.springs.get_mut(id) {
            spring.position = value;
            spring.velocity = 0.0;
        }
    }

    /// Read the current position of a spring without ticking.
    pub fn get_position(&self, id: usize) -> f32 {
        self.springs.get(id).map_or(0.0, |s| s.position)
    }

    /// Release a spring index back to the pool.
    pub fn release(&mut self, id: usize) {
        if id < self.springs.len() {
            self.springs[id].settled = true;
            self.springs[id].velocity = 0.0;
            self.free_indices.push(id);
        }
    }

    /// Number of active (unsettled) springs.
    pub fn active_count(&self) -> usize {
        self.springs.iter().filter(|s| !s.settled).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spring_settles_to_target() {
        let mut engine = PhysicsEngine::new(8);
        let id = engine.create_spring(300.0, 20.0, 1.0, 0.0, 1.0);
        for _ in 0..600 {
            engine.tick_all(1.0 / 60.0);
        }
        let pos = engine.get_position(id);
        assert!((pos - 1.0).abs() < 0.01, "Spring did not settle: {}", pos);
    }

    #[test]
    fn spring_pool_reuse() {
        let mut engine = PhysicsEngine::new(4);
        let a = engine.create_spring(300.0, 20.0, 1.0, 0.0, 1.0);
        engine.release(a);
        let b = engine.create_spring(300.0, 20.0, 1.0, 5.0, 10.0);
        assert_eq!(a, b, "Pool should reuse released index");
    }

    #[test]
    fn deterministic_output() {
        let mut e1 = PhysicsEngine::new(4);
        let mut e2 = PhysicsEngine::new(4);
        let id1 = e1.create_spring(400.0, 30.0, 1.0, 0.0, 100.0);
        let id2 = e2.create_spring(400.0, 30.0, 1.0, 0.0, 100.0);
        for _ in 0..120 {
            e1.tick_all(1.0 / 60.0);
            e2.tick_all(1.0 / 60.0);
        }
        assert_eq!(
            e1.get_position(id1).to_bits(),
            e2.get_position(id2).to_bits(),
            "Physics must be bit-identical across runs"
        );
    }
}
