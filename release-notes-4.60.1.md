# DEX v4.60.1 — Cumulative Release

Depth, polish, UKI expansion, creative wave 1, workflow + adaptive scaling.

## Highlights
- **Per-app focus profiles** (J11): hide chrome / mute notifications / dim background, persisted per app.
- **GPU + tier aware effect skipping** (K3): `shouldSkipExpensiveEffect()` short-circuits expensive visuals on low-tier and reduced-motion modes.
- **Adaptive scaling kernel** (K1/K6/K10): `SystemTier` policy, `IdleResourceBalancer` (idle pause + worker throttle), `CacheRegistry` for centralised cache lifecycle.
- **Design system** (M1/M4): chrome / body / headline / display typography tokens, `--pg-curve-*` token wiring across components.
- **Creative wave 1** (I1.3.f): Prism brush stabilization, Vinx motion tracker.
- **AppManager**: completed left/center/right-third tile positions for detached windows.
- **New ADRs** 0006-0010: design-token shadows, idle-pause kernel, UKI 2B embedding model, native Rust kernel, adaptive scaling tier policy.
- **Workflow runner**: `manual` trigger kind for remote/Sync workflow execution; type re-exports stabilised.

## Downloads
- **Windows x64 installer**: `DEX-4.60.1-win-x64.exe` (86.6 MB)
- **SHA-256**: `D29B374A2148CF7EC753E3D2802239581BCB620F73D84B300D0CAA5768B9666D`

## Validation
- TSC: clean on `tsconfig.json` and `tsconfig.main.json`
- New tests (J11 + K3 + K1 + K6 + K10 + console-bridge): 24/24 passing in isolation
- Vite production build: clean

## Notes
- macOS / Linux artifacts will be published via the new GitHub Actions release workflow once a tag is built on the corresponding runners.
- Auto-update channel: `latest.yml` published to both `Dex` and `dex-updates` repos.
