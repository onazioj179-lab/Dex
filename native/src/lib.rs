// ═══════════════════════════════════════════════════════════════════════════
// DEX Native — Rust NAPI-RS Entry Point
// Replaces: Python psutil subprocess, JS systeminformation, ps-list
// Provides: system monitoring, process management, file scanning, power control
// ═══════════════════════════════════════════════════════════════════════════

#![deny(clippy::all)]
#![allow(clippy::manual_is_multiple_of)] // is_multiple_of() is nightly-only

mod system;
mod processes;
mod power;
mod files;
mod health;

pub use system::*;
pub use processes::*;
pub use power::*;
pub use files::*;
pub use health::*;
