// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Particle effects system.
// Manages a pool of particles for burst effects, returns positions each tick
// for the renderer to draw via Canvas2D or WebGL.

/// Maximum number of particles across all active bursts.
const MAX_PARTICLES: usize = 200;

/// A single particle with position, velocity, color, and lifetime.
#[derive(Clone, Copy)]
pub struct Particle {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub alpha: f64,
    pub life: f64,     // remaining lifetime in seconds
    pub max_life: f64, // original lifetime for alpha fade
    pub size: f64,
    pub active: bool,
}

impl Default for Particle {
    fn default() -> Self {
        Self {
            x: 0.0, y: 0.0, vx: 0.0, vy: 0.0,
            r: 1.0, g: 1.0, b: 1.0, alpha: 1.0,
            life: 0.0, max_life: 1.0, size: 4.0,
            active: false,
        }
    }
}

/// Simple xoshiro128+ state for deterministic particle randomness.
struct ParticleRng {
    s: [u32; 4],
}

impl ParticleRng {
    fn new(seed: u64) -> Self {
        // SplitMix64 to initialize state from a single seed
        let mut state = seed;
        let mut s = [0u32; 4];
        for slot in &mut s {
            state = state.wrapping_add(0x9e3779b97f4a7c15);
            let mut z = state;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
            z ^= z >> 31;
            *slot = z as u32;
        }
        Self { s }
    }

    fn next_u32(&mut self) -> u32 {
        let result = self.s[0].wrapping_add(self.s[3]);
        let t = self.s[1] << 9;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(11);
        result
    }

    /// Returns a float in [0, 1).
    fn next_f64(&mut self) -> f64 {
        (self.next_u32() as f64) / (u32::MAX as f64 + 1.0)
    }

    /// Returns a float in [-1, 1).
    fn next_signed(&mut self) -> f64 {
        self.next_f64() * 2.0 - 1.0
    }
}

/// The particle system, managing a fixed-size pool.
pub struct ParticleSystem {
    particles: Vec<Particle>,
    rng: ParticleRng,
    gravity: f64,
    friction: f64,
}

impl ParticleSystem {
    pub fn new() -> Self {
        Self {
            particles: vec![Particle::default(); MAX_PARTICLES],
            rng: ParticleRng::new(0xDE0_C0DE_CAFE),
            gravity: 120.0,   // pixels/sec^2 downward
            friction: 0.98,
        }
    }

    /// Spawn a burst of particles at position (x, y) with a given color.
    /// `count` is clamped to the number of available (inactive) slots.
    pub fn spawn_burst(&mut self, x: f64, y: f64, count: u32, r: f64, g: f64, b: f64) {
        let count = count as usize;
        let mut spawned = 0;

        for particle in self.particles.iter_mut() {
            if spawned >= count {
                break;
            }
            if particle.active {
                continue;
            }

            let angle = self.rng.next_f64() * std::f64::consts::TAU;
            let speed = 40.0 + self.rng.next_f64() * 160.0;

            particle.x = x;
            particle.y = y;
            particle.vx = angle.cos() * speed;
            particle.vy = angle.sin() * speed;
            particle.r = r;
            particle.g = g;
            particle.b = b;
            particle.alpha = 1.0;
            particle.life = 0.4 + self.rng.next_f64() * 0.8;
            particle.max_life = particle.life;
            particle.size = 2.0 + self.rng.next_f64() * 6.0;
            particle.active = true;

            spawned += 1;
        }
    }

    /// Advance all active particles by `dt` seconds.
    /// Returns a flat f64 array: [x, y, r, g, b, alpha, size, ...] for each
    /// active particle. The renderer reads this directly.
    pub fn tick(&mut self, dt: f64) -> Vec<f64> {
        let dt = dt.min(0.064); // clamp to 64ms max step

        let mut output = Vec::with_capacity(self.active_count() * 7);

        for particle in self.particles.iter_mut() {
            if !particle.active {
                continue;
            }

            // Apply gravity
            particle.vy += self.gravity * dt;

            // Apply friction
            particle.vx *= self.friction;
            particle.vy *= self.friction;

            // Integrate position
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;

            // Decay lifetime
            particle.life -= dt;
            if particle.life <= 0.0 {
                particle.active = false;
                continue;
            }

            // Fade alpha based on remaining life
            particle.alpha = (particle.life / particle.max_life).clamp(0.0, 1.0);

            // Shrink near end of life
            let life_ratio = particle.life / particle.max_life;
            let current_size = particle.size * life_ratio.max(0.2);

            output.push(particle.x);
            output.push(particle.y);
            output.push(particle.r);
            output.push(particle.g);
            output.push(particle.b);
            output.push(particle.alpha);
            output.push(current_size);
        }

        output
    }

    /// Number of currently active particles.
    pub fn active_count(&self) -> usize {
        self.particles.iter().filter(|p| p.active).count()
    }
}

// ---------------------------------------------------------------------------
// Singleton + free-function wrappers for NAPI exports
// ---------------------------------------------------------------------------

use std::sync::OnceLock;
use parking_lot::Mutex;

static PARTICLES: OnceLock<Mutex<ParticleSystem>> = OnceLock::new();

fn get_particles() -> &'static Mutex<ParticleSystem> {
    PARTICLES.get_or_init(|| Mutex::new(ParticleSystem::new()))
}

/// Tick all particles and return flat array for renderer.
pub fn tick_particles(dt: f32) -> Vec<f64> {
    get_particles().lock().tick(dt as f64)
}

/// Spawn a burst of particles at (x, y) with color [r, g, b].
pub fn spawn_burst(x: f32, y: f32, count: usize, color: [f32; 3]) {
    get_particles()
        .lock()
        .spawn_burst(x as f64, y as f64, count as u32, color[0] as f64, color[1] as f64, color[2] as f64);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_and_tick() {
        let mut sys = ParticleSystem::new();
        assert_eq!(sys.active_count(), 0);

        sys.spawn_burst(100.0, 100.0, 10, 1.0, 0.0, 0.0);
        assert_eq!(sys.active_count(), 10);

        let data = sys.tick(0.016);
        assert_eq!(data.len(), 10 * 7);

        // All particles should still be active after one tick
        assert_eq!(sys.active_count(), 10);
    }

    #[test]
    fn particles_expire() {
        let mut sys = ParticleSystem::new();
        sys.spawn_burst(0.0, 0.0, 5, 1.0, 1.0, 1.0);

        // Tick far enough that all particles expire
        for _ in 0..200 {
            sys.tick(0.016);
        }

        assert_eq!(sys.active_count(), 0);
    }

    #[test]
    fn pool_limit() {
        let mut sys = ParticleSystem::new();
        // Try to spawn more than MAX_PARTICLES
        sys.spawn_burst(0.0, 0.0, (MAX_PARTICLES + 50) as u32, 1.0, 1.0, 1.0);
        assert_eq!(sys.active_count(), MAX_PARTICLES);
    }
}
