// =============================================================================
// DEX 6.0 — Native AI Runtime (GOAL-6A / GOAL-6B) · scaffold
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Future home of the native AI runtime: provider HTTP transport, SSE/NDJSON
//! streaming, and parallel ("fan-out") model execution — the native counterpart
//! of the TS `orchestrator.ts` + `stream.ts`. It already depends on
//! `dex-smart-router` so routing + execution live together on the Tauri core.
//! Scaffold only — implemented in a later GOAL-6A/6B slice.

pub use dex_smart_router as router;

/// Status marker so the crate compiles and links into the workspace.
pub fn scaffold_status() -> &'static str {
    "dex-ai-runtime: scaffold — native transport/streaming pending (GOAL-6A/6B)"
}
