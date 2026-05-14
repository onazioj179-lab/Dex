# 0007. Idle-Pause Kernel

Date: 2026-05-13

## Status

Accepted

## Context

Early DEX builds shipped a SharedTick that drove every subscriber on `requestAnimationFrame` regardless of whether the host window was visible, focused, or under thermal pressure. KPI baselines (see [KPI_BASELINES.md](../KPI_BASELINES.md)) showed idle CPU floor of ~7% on a quiet shell — unacceptable for a desktop OS-shell that is supposed to disappear into the background.

## Decision

Adopt an **idle-pause kernel** built around `SharedTick`:

1. The kernel observes `document.visibilityState`, focus, and the K-track adaptive scaler tier.
2. When all observed signals indicate idle (hidden + unfocused + tier ≤ low), the kernel downshifts subscribers from rAF to a coarse `setInterval` (250-1000 ms depending on subscriber declared cadence).
3. Subscribers register a *cadence intent* (`live | smooth | background | rare`) instead of always running per-frame.
4. The kernel resumes rAF as soon as any wake signal fires.

The contract lives in `SharedTick.ts`; tests assert tick-rate downshift on visibility hidden.

## Consequences

Positive:
- Idle CPU floor drops to ~0.5-1% on a focused-but-quiet shell, near zero when hidden.
- Battery wins on laptops materially measurable in side-by-side traces.

Negative:
- Subscribers that forget to declare a cadence will run at the kernel default (`smooth`), which is fine but not optimal. Linted via Track O audit.

Neutral:
- The kernel is renderer-side; native Rust kernel (Track L, v5.0) will inherit the same intent contract.

## Alternatives Considered

- Per-component `requestIdleCallback` — rejected: no cross-component coordination, easy to regress.
- Always-on rAF with throttling inside subscribers — rejected: shifts the problem and keeps the floor high.
