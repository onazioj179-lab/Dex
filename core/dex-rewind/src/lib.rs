// =============================================================================
// DEX 6.0 — Native Rewind Engine (GOAL-6A) · scaffold
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Future home of the native Rewind capture + session-reconstruction engine
//! (activity DVR, idle-gap session detection, daily/weekly summaries). The TS
//! timeline logic in `src/shared/rewind/` becomes the JS fallback. Scaffold only
//! — implemented in a later GOAL-6A slice.

/// Status marker so the crate compiles and links into the workspace.
pub fn scaffold_status() -> &'static str {
    "dex-rewind: scaffold — native capture engine pending (GOAL-6A)"
}
