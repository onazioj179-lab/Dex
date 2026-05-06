// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Rust native addon entry point
// Registers all exported functions for the NAPI-RS bridge.

#![deny(clippy::all)]
#![allow(clippy::needless_pass_by_value)] // NAPI wrappers require owned args

// ---------------------------------------------------------------------------
// Phase 1: Global memory allocator -- mimalloc replaces system allocator.
// Faster allocation, less fragmentation under mixed workloads.
// ---------------------------------------------------------------------------
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[macro_use]
extern crate napi_derive;

pub mod physics;
pub mod compositor;
pub mod transfer;
pub mod memory;
pub mod platform;
pub mod search;
pub mod effects;
pub mod scheduler;
pub mod game;
pub mod database;
pub mod crypto;
pub mod fts;
pub mod network;
pub mod supervisor;
pub mod phantom;

use napi::bindgen_prelude::*;

// ---------------------------------------------------------------------------
// Physics engine singleton
// ---------------------------------------------------------------------------

use std::sync::OnceLock;
use parking_lot::Mutex;

static PHYSICS: OnceLock<Mutex<physics::PhysicsEngine>> = OnceLock::new();

fn get_physics() -> &'static Mutex<physics::PhysicsEngine> {
    PHYSICS.get_or_init(|| Mutex::new(physics::PhysicsEngine::new(512)))
}

#[napi]
pub fn physics_create_spring(
    stiffness: f64,
    damping: f64,
    mass: f64,
    initial: f64,
    target: f64,
) -> u32 {
    let mut engine = get_physics().lock();
    engine.create_spring(
        stiffness as f32,
        damping as f32,
        mass as f32,
        initial as f32,
        target as f32,
    ) as u32
}

#[napi]
pub fn physics_set_target(id: u32, target: f64) {
    let mut engine = get_physics().lock();
    engine.set_target(id as usize, target as f32);
}

#[napi]
pub fn physics_tick_all(dt: f64) -> Vec<f64> {
    let mut engine = get_physics().lock();
    let results = engine.tick_all(dt as f32);
    // Pack as flat array: [id, position, settled, id, position, settled, ...]
    let mut out = Vec::with_capacity(results.len() * 3);
    for (id, pos, settled) in results {
        out.push(id as f64);
        out.push(pos as f64);
        out.push(if settled { 1.0 } else { 0.0 });
    }
    out
}

#[napi]
pub fn physics_release_spring(id: u32) {
    let mut engine = get_physics().lock();
    engine.release(id as usize);
}

#[napi]
pub fn physics_get_position(id: u32) -> f64 {
    let engine = get_physics().lock();
    engine.get_position(id as usize) as f64
}

#[napi]
pub fn physics_set_value(id: u32, value: f64) {
    let mut engine = get_physics().lock();
    engine.set_value(id as usize, value as f32);
}

// ---------------------------------------------------------------------------
// Game world singleton
// ---------------------------------------------------------------------------

static GAME: OnceLock<Mutex<game::GameWorld>> = OnceLock::new();

fn get_game() -> &'static Mutex<game::GameWorld> {
    GAME.get_or_init(|| Mutex::new(game::GameWorld::new(256)))
}

#[napi]
pub fn game_init(capacity: u32) {
    let mut world = get_game().lock();
    *world = game::GameWorld::new(capacity as usize);
}

#[napi]
pub fn game_spawn_entity(x: f64, y: f64, health: i32) -> u32 {
    let mut world = get_game().lock();
    world.spawn_entity(x as f32, y as f32, health) as u32
}

#[napi]
pub fn game_set_player(index: u32) {
    let mut world = get_game().lock();
    world.player_index = index as usize;
}

#[napi]
pub fn game_tick(dt: f64, left: bool, right: bool, up: bool, down: bool, dash: bool) {
    let mut world = get_game().lock();
    let input = game::PlayerInput { left, right, up, down, dash, ..Default::default() };
    world.tick(dt as f32, &input);
}

/// Returns flat array: [x0, y0, state0, health0, x1, y1, state1, health1, ...]
#[napi]
pub fn game_get_state() -> Vec<f64> {
    let world = get_game().lock();
    let mut out = Vec::with_capacity(world.entity_count * 4);
    for i in 0..world.entity_count {
        out.push(world.positions[i].x as f64);
        out.push(world.positions[i].y as f64);
        out.push(world.states[i] as u8 as f64);
        out.push(world.health[i].current as f64);
    }
    out
}

#[napi]
pub fn game_astar(
    grid: Vec<u8>,
    width: i32,
    height: i32,
    start_x: i32,
    start_y: i32,
    goal_x: i32,
    goal_y: i32,
) -> Option<Vec<i32>> {
    game::astar(&grid, width, height, (start_x, start_y), (goal_x, goal_y))
        .map(|path| path.iter().flat_map(|(x, y)| [*x, *y]).collect())
}

// ---------------------------------------------------------------------------
// Memory monitoring
// ---------------------------------------------------------------------------

#[napi]
pub async fn memory_get_pressure() -> String {
    memory::get_pressure_level().await
}

#[napi]
pub fn memory_get_usage() -> napi::Result<serde_json::Value> {
    Ok(memory::get_memory_usage())
}

// ---------------------------------------------------------------------------
// File transfer
// ---------------------------------------------------------------------------

#[napi]
pub async fn transfer_hash_file(path: String) -> napi::Result<String> {
    transfer::hash_file_blake3(&path)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn transfer_compress(data: Buffer) -> napi::Result<Buffer> {
    let compressed = transfer::compress_lz4(&data);
    Ok(Buffer::from(compressed))
}

#[napi]
pub async fn transfer_decompress(data: Buffer) -> napi::Result<Buffer> {
    transfer::decompress_lz4(&data)
        .map(Buffer::from)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

#[napi]
pub fn scheduler_get_core_count() -> u32 {
    scheduler::get_core_count() as u32
}

#[napi]
pub fn scheduler_get_recommended_threads() -> u32 {
    scheduler::get_recommended_threads() as u32
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[napi]
pub async fn search_fuzzy(
    query: String,
    candidates: Vec<String>,
    limit: u32,
) -> Vec<String> {
    search::fuzzy_search(&query, &candidates, limit as usize)
        .into_iter()
        .map(|r| candidates[r.index].clone())
        .collect()
}

// ---------------------------------------------------------------------------
// Effects - particle batch computation
// ---------------------------------------------------------------------------

#[napi]
pub fn effects_tick_particles(dt: f64) -> Vec<f64> {
    effects::tick_particles(dt as f32)
}

#[napi]
pub fn effects_spawn_burst(x: f64, y: f64, count: u32, color_r: f64, color_g: f64, color_b: f64) {
    effects::spawn_burst(
        x as f32, y as f32, count as usize,
        [color_r as f32, color_g as f32, color_b as f32],
    );
}

// ---------------------------------------------------------------------------
// Platform info
// ---------------------------------------------------------------------------

#[napi]
pub fn platform_get_info() -> napi::Result<serde_json::Value> {
    Ok(platform::get_platform_info())
}

// ===========================================================================
// Phase 2: Database -- rusqlite direct bindings
// ===========================================================================

#[napi]
pub fn db_open(path: String) -> napi::Result<()> {
    database::open(&path).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn db_execute(sql: String, params_json: String) -> napi::Result<u32> {
    database::execute(&sql, &params_json).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn db_query(sql: String, params_json: String) -> napi::Result<String> {
    database::query(&sql, &params_json).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn db_close() -> napi::Result<()> {
    database::close().map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ===========================================================================
// Phase 3: Zstd compression (alongside existing LZ4)
// ===========================================================================

#[napi]
pub async fn transfer_compress_zstd(data: Buffer, level: Option<i32>) -> napi::Result<Buffer> {
    let lvl = level.unwrap_or(3);
    let compressed = transfer::compress_zstd(&data, lvl);
    Ok(Buffer::from(compressed))
}

#[napi]
pub async fn transfer_decompress_zstd(data: Buffer) -> napi::Result<Buffer> {
    transfer::decompress_zstd(&data)
        .map(Buffer::from)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn transfer_compress_zstd_stream(
    input_path: String,
    output_path: String,
    level: Option<i32>,
) -> napi::Result<u64> {
    let lvl = level.unwrap_or(3);
    transfer::compress_zstd_stream(&input_path, &output_path, lvl)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ===========================================================================
// Phase 4: Cryptography -- ring (AES-256-GCM, PBKDF2)
// ===========================================================================

#[napi]
pub fn crypto_encrypt(data: Buffer, key: Buffer) -> napi::Result<Buffer> {
    crypto::encrypt_aes256gcm(&data, &key)
        .map(Buffer::from)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn crypto_decrypt(data: Buffer, key: Buffer) -> napi::Result<Buffer> {
    crypto::decrypt_aes256gcm(&data, &key)
        .map(Buffer::from)
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub fn crypto_derive_key(password: String, salt: Buffer, iterations: u32) -> napi::Result<Buffer> {
    let derived = crypto::derive_key_pbkdf2(password.as_bytes(), &salt, iterations);
    Ok(Buffer::from(derived))
}

#[napi]
pub fn crypto_random_bytes(len: u32) -> napi::Result<Buffer> {
    let bytes = crypto::random_bytes(len as usize);
    Ok(Buffer::from(bytes))
}

// ===========================================================================
// Phase 5: Full-text search -- tantivy
// ===========================================================================

#[napi]
pub fn fts_create_index(path: String) -> napi::Result<()> {
    fts::create_index(&path).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn fts_open_index(path: String) -> napi::Result<()> {
    fts::open_index(&path).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn fts_add_document(id: String, title: String, body: String) -> napi::Result<()> {
    fts::add_document(&id, &title, &body).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn fts_commit() -> napi::Result<()> {
    fts::commit().map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn fts_search(query_str: String, limit: u32) -> napi::Result<String> {
    fts::search(&query_str, limit as usize).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn fts_delete_document(id: String) -> napi::Result<()> {
    fts::delete_document(&id).map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ===========================================================================
// Phase 8: Zero-copy networking
// ===========================================================================

#[napi]
pub async fn network_zero_copy_transfer(
    source_path: String,
    dest_host: String,
    dest_port: u32,
) -> napi::Result<u64> {
    network::zero_copy_send(&source_path, &dest_host, dest_port as u16)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ===========================================================================
// Phase 9: Process supervisor
// ===========================================================================

#[napi]
pub fn supervisor_init() -> napi::Result<()> {
    supervisor::init().map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn supervisor_register_process(pid: u32, name: String) -> napi::Result<()> {
    supervisor::register_process(pid, &name).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn supervisor_heartbeat(pid: u32) -> napi::Result<()> {
    supervisor::heartbeat(pid).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn supervisor_get_health() -> napi::Result<String> {
    supervisor::get_health().map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn supervisor_unregister_process(pid: u32) -> napi::Result<()> {
    supervisor::unregister_process(pid).map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ===========================================================================
// Phase 10: Game engine enhancements
// ===========================================================================

#[napi]
pub fn game_spawn_enemy(x: f64, y: f64, hp: i32, ai_type: u32) -> u32 {
    let mut world = get_game().lock();
    world.spawn_enemy(x as f32, y as f32, hp, ai_type as u8) as u32
}

#[napi]
pub fn game_apply_damage(entity: u32, damage: i32) {
    let mut world = get_game().lock();
    world.apply_damage(entity as usize, damage);
}

#[napi]
pub fn game_get_collisions() -> Vec<i32> {
    let world = get_game().lock();
    world.get_collisions()
}

#[napi]
pub fn game_spawn_loot(x: f64, y: f64, loot_type: u32) -> u32 {
    let mut world = get_game().lock();
    world.spawn_loot(x as f32, y as f32, loot_type as u8) as u32
}

// ===========================================================================
// Phase 11: DEX Phantom
// ===========================================================================

#[napi]
pub async fn phantom_detect_speed(path: String) -> napi::Result<String> {
    phantom::detect_speed(&path)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn phantom_zero_trace(paths: Vec<String>) -> napi::Result<u32> {
    phantom::zero_trace(&paths).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub async fn phantom_sync(
    source: String,
    target: String,
    key: Buffer,
) -> napi::Result<String> {
    phantom::sync_encrypted(&source, &target, &key)
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
