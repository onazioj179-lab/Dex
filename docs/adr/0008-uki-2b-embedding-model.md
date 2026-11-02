# 0008. UKI-2B Embedding Model

Date: 2026-05-13

## Status

Accepted

## Context

The Universal Knowledge Index (UKI) needs vector embeddings for semantic search, action routing, and the contextual capsule store. The renderer cannot ship a 100MB+ ONNX model without bloating the installer, and not every user has GPU compute available. We also need embeddings to be deterministic across the IPC boundary so a renderer-computed similarity matches a main-process recall result.

## Decision

UKI-2B uses a two-tier embedding backend:

1. **Default tier — `hash-128`**: 128-dimensional sign-balanced feature hashing implemented in EmbeddingService.ts (Electron main process, removed in the Tauri migration) (main) with an FNV-1a renderer mirror in [ai.ts](../../src/renderer/utils/ai.ts). Token bag with `log(1+freq)` + char trigrams (sign × 0.25), L2-normalised so cosine = dot. Deterministic, ~0 bytes added to the installer, sub-millisecond per call.
2. **Optional tier — `onnx-gte-small`**: ONNX gte-small (384-d), loaded from a user-confirmed download. Reserved backend tag in EmbeddingService; not yet shipped. When available, the service exposes the same DTO with `backend: 'onnx-gte-small'` so callers can reason about provenance.

Renderer always calls IPC first (`window.dexAPI.embedding.compute`) and only falls back to local hashing if the bridge is unreachable.

## Consequences

Positive:
- Zero-friction default — every user gets working semantic recall at install time.
- Forward-compatible: opting into `onnx-gte-small` is a single config flag.
- Backend tag in the DTO prevents silent quality regressions across upgrades.

Negative:
- Hash embeddings have ceiling recall vs transformer embeddings; users who care can opt up.

Neutral:
- The hash backend's deterministic feature buckets mean two builds of DEX produce comparable vectors.

## Alternatives Considered

- Ship gte-small by default — rejected: ~30 MB installer hit and CPU cost on first-boot indexing.
- Cloud embedding API — rejected: violates DEX's local-first principle.
- TF-IDF only — rejected: no cross-document similarity, fails the semantic-search use case.
