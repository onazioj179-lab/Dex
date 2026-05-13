# 0004. IPC contract formalization

Date: 2026-05-13

## Status

Accepted

## Context

DEX uses Electron IPC across the main, preload, and renderer layers. The
audit in `docs/AUDIT_REPORT.md` and the existing trust boundary in
`src/main/security/IPCValidator.ts` show that IPC channels have grown
organically. Channels currently lack:

- A single registry that lists every channel, its direction, and its payload
  schema.
- A consistent rate-limit policy per channel category.
- End-to-end correlation IDs for tracing requests across processes.
- A formal versioning rule for backwards-compatible payload evolution.

Master Evolution Plan Phase 1 lists IPC contract formalization as a blocker
for downstream phases.

## Decision

We will formalize IPC contracts using the following rules:

1. Every IPC channel must be declared in a central registry under
   `src/shared/ipc/contracts/` with:
   - Channel name (lowercase, colon-namespaced, for example `files:list`).
   - Direction (`renderer-to-main`, `main-to-renderer`, `bidirectional`).
   - Request payload schema (TypeScript type, validated at the boundary).
   - Response payload schema (TypeScript type, validated at the boundary).
   - Rate-limit category (`interactive`, `background`, `bulk`, `unbounded`).
   - Required permission scope.
2. `IPCValidator` is the only path that registers handlers. Handlers
   registered outside the validator must be migrated within the same PR.
3. Every IPC call carries a correlation ID issued by `IpcCallTracer`
   (`src/renderer/improvements500/ipcCallTracer.ts`) so observability can
   compute end-to-end latency.
4. Payload schemas are versioned. Breaking changes require a new channel
   name suffixed with `:v2` and a deprecation window of at least one minor
   release on the prior channel.
5. Rate-limit categories map to token-bucket budgets defined in
   `docs/KPI_BASELINES.md`.

## Consequences

- Renderer and main share a single source of truth for IPC surface area.
- New channels require contract authoring up front, which increases
  per-channel cost but eliminates a class of integration bugs.
- Observability gains end-to-end IPC traces without per-call instrumentation.
- Existing channels need a migration sweep. This is tracked as a Phase 1
  deliverable and is not blocking for ADR acceptance.

## Alternatives Considered

- Document channels in markdown only. Rejected because schemas drift from
  code without a typed registry.
- Generate channels from a schema language (protobuf, JSON Schema).
  Deferred; revisit if contract authoring becomes a bottleneck.
