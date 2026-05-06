// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Compositor module
// Manages render layer ordering, damage regions, and frame budget tracking.

use std::collections::HashMap;
use parking_lot::Mutex;

/// Unique identifier for a composited surface (window, overlay, dock, etc.)
pub type SurfaceId = u32;

/// Damage region marking an area of a surface that needs redraw.
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct DamageRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl DamageRect {
    pub fn union(&self, other: &DamageRect) -> DamageRect {
        let x1 = self.x.min(other.x);
        let y1 = self.y.min(other.y);
        let x2 = (self.x + self.width).max(other.x + other.width);
        let y2 = (self.y + self.height).max(other.y + other.height);
        DamageRect {
            x: x1,
            y: y1,
            width: x2 - x1,
            height: y2 - y1,
        }
    }

    pub fn area(&self) -> f32 {
        self.width * self.height
    }

    pub fn intersects(&self, other: &DamageRect) -> bool {
        self.x < other.x + other.width
            && self.x + self.width > other.x
            && self.y < other.y + other.height
            && self.y + self.height > other.y
    }
}

/// A composited surface with depth ordering and damage tracking.
#[derive(Clone, Debug)]
pub struct Surface {
    pub id: SurfaceId,
    pub z_index: i32,
    pub visible: bool,
    pub opacity: f32,
    pub bounds: DamageRect,
    pub damage: Vec<DamageRect>,
    pub blur_radius: f32,
}

/// Frame budget tracker -- monitors whether the composition pass fits
/// within the target frame time.
pub struct FrameBudget {
    target_ms: f64,
    samples: Vec<f64>,
    sample_cursor: usize,
    capacity: usize,
}

impl FrameBudget {
    pub fn new(target_fps: f64) -> Self {
        let capacity = 60;
        Self {
            target_ms: 1000.0 / target_fps,
            samples: vec![0.0; capacity],
            sample_cursor: 0,
            capacity,
        }
    }

    pub fn record(&mut self, frame_ms: f64) {
        self.samples[self.sample_cursor] = frame_ms;
        self.sample_cursor = (self.sample_cursor + 1) % self.capacity;
    }

    /// Average frame time over the sample window.
    pub fn average_ms(&self) -> f64 {
        let sum: f64 = self.samples.iter().sum();
        sum / self.capacity as f64
    }

    /// True if recent frames are exceeding the budget.
    pub fn is_over_budget(&self) -> bool {
        self.average_ms() > self.target_ms * 1.1
    }

    /// Fraction of budget used (1.0 = exactly at budget, >1.0 = over).
    pub fn budget_usage(&self) -> f64 {
        self.average_ms() / self.target_ms
    }
}

/// Compositor manages all surfaces and their layering.
pub struct Compositor {
    surfaces: HashMap<SurfaceId, Surface>,
    next_id: SurfaceId,
    pub frame_budget: FrameBudget,
    /// Sorted render order cache, invalidated on z-index changes.
    render_order: Vec<SurfaceId>,
    order_dirty: bool,
}

impl Compositor {
    pub fn new(target_fps: f64) -> Self {
        Self {
            surfaces: HashMap::new(),
            next_id: 1,
            frame_budget: FrameBudget::new(target_fps),
            render_order: Vec::new(),
            order_dirty: true,
        }
    }

    pub fn create_surface(&mut self, z_index: i32, bounds: DamageRect) -> SurfaceId {
        let id = self.next_id;
        self.next_id += 1;
        self.surfaces.insert(id, Surface {
            id,
            z_index,
            visible: true,
            opacity: 1.0,
            bounds,
            damage: Vec::new(),
            blur_radius: 0.0,
        });
        self.order_dirty = true;
        id
    }

    pub fn remove_surface(&mut self, id: SurfaceId) {
        self.surfaces.remove(&id);
        self.order_dirty = true;
    }

    pub fn set_z_index(&mut self, id: SurfaceId, z: i32) {
        if let Some(s) = self.surfaces.get_mut(&id) {
            s.z_index = z;
            self.order_dirty = true;
        }
    }

    pub fn set_visible(&mut self, id: SurfaceId, visible: bool) {
        if let Some(s) = self.surfaces.get_mut(&id) {
            s.visible = visible;
        }
    }

    pub fn set_bounds(&mut self, id: SurfaceId, bounds: DamageRect) {
        if let Some(s) = self.surfaces.get_mut(&id) {
            s.bounds = bounds;
        }
    }

    pub fn add_damage(&mut self, id: SurfaceId, rect: DamageRect) {
        if let Some(s) = self.surfaces.get_mut(&id) {
            s.damage.push(rect);
        }
    }

    /// Collect all damage regions, merge overlapping rectangles,
    /// and return the minimal set of regions that need redraw.
    pub fn collect_damage(&mut self) -> Vec<DamageRect> {
        let mut all_damage: Vec<DamageRect> = Vec::new();
        for surface in self.surfaces.values_mut() {
            if !surface.visible {
                continue;
            }
            all_damage.extend(surface.damage.drain(..));
        }
        merge_damage_rects(&mut all_damage);
        all_damage
    }

    /// Get surfaces in render order (back to front).
    pub fn render_order(&mut self) -> &[SurfaceId] {
        if self.order_dirty {
            self.render_order.clear();
            let mut sorted: Vec<_> = self.surfaces.values()
                .filter(|s| s.visible)
                .collect();
            sorted.sort_by_key(|s| s.z_index);
            self.render_order = sorted.iter().map(|s| s.id).collect();
            self.order_dirty = false;
        }
        &self.render_order
    }

    pub fn surface(&self, id: SurfaceId) -> Option<&Surface> {
        self.surfaces.get(&id)
    }

    pub fn surface_count(&self) -> usize {
        self.surfaces.len()
    }
}

/// Merge overlapping damage rectangles by iteratively unioning intersecting pairs.
fn merge_damage_rects(rects: &mut Vec<DamageRect>) {
    if rects.len() <= 1 {
        return;
    }
    let mut merged = true;
    while merged {
        merged = false;
        let mut i = 0;
        while i < rects.len() {
            let mut j = i + 1;
            while j < rects.len() {
                if rects[i].intersects(&rects[j]) {
                    rects[i] = rects[i].union(&rects[j]);
                    rects.swap_remove(j);
                    merged = true;
                } else {
                    j += 1;
                }
            }
            i += 1;
        }
    }
}
