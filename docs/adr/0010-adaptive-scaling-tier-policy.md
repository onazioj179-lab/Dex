# 0010. Adaptive Performance Scaling Tier Policy

Date: 2026-05-13

## Status

Accepted

## Context

DEX runs the same shell on a fanless laptop, a desktop with discrete GPU, and (eventually) an embedded DEX-OS device. We need a single policy that decides how aggressive the shell should be with effects, animations, and background work — without per-device feature flags scattered across the codebase.

## Decision

Adopt a **four-tier adaptive scaler** owned by Track K:

| Tier | Trigger | Behaviour |
|------|---------|-----------|
| `ultra` | Discrete GPU + ≥16 GB RAM + AC power | Full blur, full motion, all background indexing |
| `high`  | Default for capable hardware | Full blur, full motion, throttled background indexing |
| `low`   | Battery saver, or low-mem signal | Reduce blur radius, halve motion, defer background indexing |
| `safe`  | Thermal critical, or first-boot probe failed | No blur, no motion (`prefers-reduced-motion`), background work paused |

The scaler exposes the current tier on a context bus subscribers can read; `SharedTick` (ADR 0007) feeds the idle-pause kernel from the same tier signal. Tier transitions are debounced (≥2 s) to avoid flicker.

Tier sources (in priority order): user override → OS battery saver → thermal sensor → device capability probe → default.

## Consequences

Positive:
- Single decision point; no `if (isLowEndDevice)` branches sprinkled in components.
- Honours OS-level `prefers-reduced-motion` and battery saver out of the box.
- Plays cleanly with the idle-pause kernel.

Negative:
- Tier transitions are visible to users (e.g. blur fades out); designed-for, but worth noting.

Neutral:
- DEX-OS will likely lock `safe` or `low` on the first generation of hardware.

## Alternatives Considered

- One global "performance mode" boolean — rejected: too coarse for the laptop-on-AC vs laptop-on-battery split.
- Per-component feature flags — rejected: explosion of branching, hard to reason about end-state.
- Telemetry-driven autotuning — rejected for v4.60.1: needs more field data; revisit in v5.0 alongside Track N reliability work.
