// =============================================================================
// DEX 6.0 — Native File Scanner (GOAL-6A) · scaffold
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Future home of the native file scanner/indexer (fast `jwalk` traversal,
//! content hashing for dedup, change watching) that feeds dex-search and Files
//! 2.0. The TS `assetHash.ts` + the existing NAPI `contenthash.rs` are the
//! starting points. Scaffold only — implemented in a later GOAL-6A slice.

/// Status marker so the crate compiles and links into the workspace.
pub fn scaffold_status() -> &'static str {
    "dex-scanner: scaffold — native traversal/indexer pending (GOAL-6A)"
}
