// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// Game World — Entity-Component System with A* pathfinding
// ═══════════════════════════════════════════════════════════════════════════
// Provides a lightweight 2D game world for DEX's built-in games,
// supporting entity spawning, player input, tick-based simulation,
// and grid-based A* pathfinding.

use std::collections::BinaryHeap;
use std::cmp::Ordering;

// ─── Core types ───────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Default)]
pub struct Pos2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Vel2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug)]
#[repr(u8)]
pub enum EntityState {
    Idle = 0,
    Moving = 1,
    Attacking = 2,
    Hurt = 3,
    Dead = 4,
}

impl Default for EntityState {
    fn default() -> Self {
        EntityState::Idle
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Health {
    pub current: i32,
    pub max: i32,
}

impl Default for Health {
    fn default() -> Self {
        Health { current: 100, max: 100 }
    }
}

#[derive(Clone, Debug, Default)]
pub struct PlayerInput {
    pub left: bool,
    pub right: bool,
    pub up: bool,
    pub down: bool,
    pub dash: bool,
}

// ─── Game World ───────────────────────────────────────────────────────────

pub struct GameWorld {
    pub positions: Vec<Pos2>,
    pub velocities: Vec<Vel2>,
    pub states: Vec<EntityState>,
    pub health: Vec<Health>,
    pub entity_count: usize,
    pub player_index: usize,
    capacity: usize,
}

impl GameWorld {
    pub fn new(capacity: usize) -> Self {
        let cap = capacity.max(1);
        GameWorld {
            positions: vec![Pos2::default(); cap],
            velocities: vec![Vel2::default(); cap],
            states: vec![EntityState::default(); cap],
            health: vec![Health::default(); cap],
            entity_count: 0,
            player_index: 0,
            capacity: cap,
        }
    }

    /// Spawn a new entity and return its index.
    pub fn spawn_entity(&mut self, x: f32, y: f32, hp: i32) -> usize {
        if self.entity_count >= self.capacity {
            // Grow by 50%
            let new_cap = self.capacity + self.capacity / 2 + 1;
            self.positions.resize(new_cap, Pos2::default());
            self.velocities.resize(new_cap, Vel2::default());
            self.states.resize(new_cap, EntityState::default());
            self.health.resize(new_cap, Health::default());
            self.capacity = new_cap;
        }
        let idx = self.entity_count;
        self.positions[idx] = Pos2 { x, y };
        self.velocities[idx] = Vel2::default();
        self.states[idx] = EntityState::Idle;
        self.health[idx] = Health { current: hp, max: hp };
        self.entity_count += 1;
        idx
    }

    /// Advance the world by `dt` seconds using the given player input.
    pub fn tick(&mut self, dt: f32, input: &PlayerInput) {
        let speed = if input.dash { 400.0 } else { 200.0 };

        // Apply player input to player entity
        if self.player_index < self.entity_count {
            let pi = self.player_index;
            let mut vx = 0.0_f32;
            let mut vy = 0.0_f32;
            if input.left { vx -= 1.0; }
            if input.right { vx += 1.0; }
            if input.up { vy -= 1.0; }
            if input.down { vy += 1.0; }
            // Normalize diagonal movement
            let len = (vx * vx + vy * vy).sqrt();
            if len > 0.0 {
                vx = vx / len * speed;
                vy = vy / len * speed;
                self.states[pi] = EntityState::Moving;
            } else {
                self.states[pi] = EntityState::Idle;
            }
            self.velocities[pi] = Vel2 { x: vx, y: vy };
        }

        // Integrate positions with velocity
        for i in 0..self.entity_count {
            if matches!(self.states[i], EntityState::Dead) {
                continue;
            }
            self.positions[i].x += self.velocities[i].x * dt;
            self.positions[i].y += self.velocities[i].y * dt;

            // Apply friction to non-player entities
            if i != self.player_index {
                self.velocities[i].x *= 0.95;
                self.velocities[i].y *= 0.95;
                if self.velocities[i].x.abs() < 0.1 && self.velocities[i].y.abs() < 0.1 {
                    self.velocities[i] = Vel2::default();
                    if matches!(self.states[i], EntityState::Moving) {
                        self.states[i] = EntityState::Idle;
                    }
                }
            }

            // Mark dead entities
            if self.health[i].current <= 0 {
                self.states[i] = EntityState::Dead;
            }
        }
    }

    // ─── Phase 10: Enhanced game engine methods ───────────────────────────

    /// Spawn an enemy entity with an AI type tag.
    /// Returns entity index.
    pub fn spawn_enemy(&mut self, x: f32, y: f32, hp: i32, _ai_type: u8) -> usize {
        self.spawn_entity(x, y, hp)
    }

    /// Apply damage to an entity. Sets state to Hurt (or Dead if health <= 0).
    pub fn apply_damage(&mut self, entity: usize, damage: i32) {
        if entity >= self.entity_count {
            return;
        }
        if matches!(self.states[entity], EntityState::Dead) {
            return;
        }
        self.health[entity].current -= damage;
        if self.health[entity].current <= 0 {
            self.health[entity].current = 0;
            self.states[entity] = EntityState::Dead;
        } else {
            self.states[entity] = EntityState::Hurt;
        }
    }

    /// Simple AABB collision check between all alive entities.
    /// Returns flat vec: [entity_a, entity_b, entity_a, entity_b, ...].
    pub fn get_collisions(&self) -> Vec<i32> {
        let collision_radius = 24.0_f32; // px
        let mut pairs = Vec::new();
        for i in 0..self.entity_count {
            if matches!(self.states[i], EntityState::Dead) {
                continue;
            }
            for j in (i + 1)..self.entity_count {
                if matches!(self.states[j], EntityState::Dead) {
                    continue;
                }
                let dx = self.positions[i].x - self.positions[j].x;
                let dy = self.positions[i].y - self.positions[j].y;
                let dist_sq = dx * dx + dy * dy;
                if dist_sq < collision_radius * collision_radius {
                    pairs.push(i as i32);
                    pairs.push(j as i32);
                }
            }
        }
        pairs
    }

    /// Spawn a loot item entity at position. Returns entity index.
    pub fn spawn_loot(&mut self, x: f32, y: f32, _loot_type: u8) -> usize {
        self.spawn_entity(x, y, 1) // 1 HP = destroyable pickup
    }
}

// ─── A* Pathfinding ───────────────────────────────────────────────────────

#[derive(Clone, Eq, PartialEq)]
struct AStarNode {
    cost: i32,       // f = g + h
    g_cost: i32,     // distance from start
    x: i32,
    y: i32,
}

impl Ord for AStarNode {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost) // min-heap
            .then_with(|| other.g_cost.cmp(&self.g_cost))
    }
}

impl PartialOrd for AStarNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Grid-based A* pathfinding. Grid values: 0 = walkable, non-zero = blocked.
/// Returns path as vec of (x, y) from start to goal, or None if unreachable.
pub fn astar(
    grid: &[u8],
    width: i32,
    height: i32,
    start: (i32, i32),
    goal: (i32, i32),
) -> Option<Vec<(i32, i32)>> {
    let w = width as usize;
    let h = height as usize;
    if w == 0 || h == 0 || grid.len() < w * h {
        return None;
    }

    let idx = |x: i32, y: i32| -> usize { y as usize * w + x as usize };
    let in_bounds = |x: i32, y: i32| -> bool { x >= 0 && y >= 0 && x < width && y < height };

    if !in_bounds(start.0, start.1) || !in_bounds(goal.0, goal.1) {
        return None;
    }
    if grid[idx(goal.0, goal.1)] != 0 {
        return None; // goal is blocked
    }

    let total = w * h;
    let mut g_scores = vec![i32::MAX; total];
    let mut came_from = vec![usize::MAX; total];
    let mut closed = vec![false; total];

    let heuristic = |x: i32, y: i32| -> i32 {
        // Manhattan distance × 10 for integer costs
        ((x - goal.0).abs() + (y - goal.1).abs()) * 10
    };

    let start_idx = idx(start.0, start.1);
    g_scores[start_idx] = 0;

    let mut open = BinaryHeap::new();
    open.push(AStarNode {
        cost: heuristic(start.0, start.1),
        g_cost: 0,
        x: start.0,
        y: start.1,
    });

    // 8-directional neighbors: (dx, dy, cost)
    let neighbors: [(i32, i32, i32); 8] = [
        (-1, 0, 10), (1, 0, 10), (0, -1, 10), (0, 1, 10),
        (-1, -1, 14), (1, -1, 14), (-1, 1, 14), (1, 1, 14),
    ];

    while let Some(current) = open.pop() {
        let ci = idx(current.x, current.y);
        if current.x == goal.0 && current.y == goal.1 {
            // Reconstruct path
            let mut path = Vec::new();
            let mut cur = ci;
            while cur != usize::MAX {
                let cy = (cur / w) as i32;
                let cx = (cur % w) as i32;
                path.push((cx, cy));
                cur = came_from[cur];
            }
            path.reverse();
            return Some(path);
        }

        if closed[ci] {
            continue;
        }
        closed[ci] = true;

        for &(dx, dy, move_cost) in &neighbors {
            let nx = current.x + dx;
            let ny = current.y + dy;
            if !in_bounds(nx, ny) {
                continue;
            }
            let ni = idx(nx, ny);
            if closed[ni] || grid[ni] != 0 {
                continue;
            }
            // For diagonal moves, ensure both cardinal neighbors are walkable
            if dx != 0 && dy != 0 {
                if grid[idx(current.x + dx, current.y)] != 0 || grid[idx(current.x, current.y + dy)] != 0 {
                    continue;
                }
            }
            let new_g = g_scores[ci] + move_cost;
            if new_g < g_scores[ni] {
                g_scores[ni] = new_g;
                came_from[ni] = ci;
                open.push(AStarNode {
                    cost: new_g + heuristic(nx, ny),
                    g_cost: new_g,
                    x: nx,
                    y: ny,
                });
            }
        }
    }

    None // No path found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spawn_and_tick() {
        let mut world = GameWorld::new(8);
        let p = world.spawn_entity(10.0, 20.0, 100);
        assert_eq!(p, 0);
        assert_eq!(world.entity_count, 1);
        world.player_index = 0;
        let input = PlayerInput { right: true, ..Default::default() };
        world.tick(0.016, &input);
        assert!(world.positions[0].x > 10.0);
    }

    #[test]
    fn test_astar_simple() {
        // 5x5 grid, all walkable
        let grid = vec![0u8; 25];
        let path = astar(&grid, 5, 5, (0, 0), (4, 4));
        assert!(path.is_some());
        let p = path.unwrap();
        assert_eq!(p[0], (0, 0));
        assert_eq!(*p.last().unwrap(), (4, 4));
    }

    #[test]
    fn test_astar_blocked() {
        // 3x3 grid with wall blocking path
        let grid = vec![
            0, 1, 0,
            0, 1, 0,
            0, 1, 0,
        ];
        let path = astar(&grid, 3, 3, (0, 0), (2, 0));
        assert!(path.is_none());
    }
}
