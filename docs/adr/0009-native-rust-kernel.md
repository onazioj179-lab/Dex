# 0009. Native Rust Kernel (Phase 1)

Date: 2026-05-13

## Status

Accepted (Phase 1 — module surface only; full compositor + wgpu deferred to Track L / v5.0)

## Context

DEX renders thousands of windows, panes, and live previews per session. The TypeScript-only render pipeline is already idle-pause aware (ADR 0007) but cannot escape main-thread blocking on heavy compositing, vector math, and audio buffer transforms. We also want a clean spot to land SIMD work without infecting the JS layer.

## Decision

Establish a `native/` module compiled via napi-rs, exposing a stable `dex-native.<platform>.node` ABI:

- Phase 1 (this release): module surface, cross-platform build, security audit (see `/memories/repo/UKI-NativeModules-SecurityAudit-v2.md`), and a thin Rust fast-path for hot loops the renderer can opt into.
- Phase 2 (Track L, v5.0): wgpu compositor, C++ SIMD audio path, optional Rust pane manager.

The TypeScript binding lives at `native/index.d.ts` and `native/index.js`. All entry points are wrapped on the JS side with try/catch + JS fallback so renderer code never hard-depends on the native module being loaded.

## Consequences

Positive:
- Establishes a native escape hatch without committing the project to a full rewrite.
- Build output is a single `.node` file per platform; electron-builder picks it up automatically.

Negative:
- Adds Rust toolchain to the contributor onboarding cost; mitigated by `native/README.md` and Track G handoff docs.
- Native crashes can take down the renderer; mitigated by the JS fallback wrapper.

Neutral:
- Phase 2 design (wgpu compositor) is intentionally out of scope until v5.0 stabilises Phase 1 telemetry.

## Alternatives Considered

- Pure Wasm modules — rejected: no SIMD threading parity with native; harder OS integration.
- Electron's built-in N-API + C++ — rejected: Rust safety story is materially better for unfamiliar contributors.
- Skip native entirely — rejected: KPI ceiling on TS-only compositor is empirically reached on 4K multi-monitor setups.
