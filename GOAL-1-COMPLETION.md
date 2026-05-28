# DEX Goal Phase 1 — Completion & Architecture Sanitization

## Mission
Finish unfinished DEX systems. Remove stale workflows. Sanitize architecture.

## Scope

### Systems to Complete
- Shell: floating windows, snapping, z-layer ordering, workspace restoration
- Compositor: blur/transparency rendering, redraw logic, overlay conflicts
- Browser: tab lifecycle, download progress, stability
- Notes: responsiveness, autosave
- Tasks / Files / Reader: incomplete UI states, broken transitions
- UKI / Nexus / Dock / Orbit / Stage / Spotlight: unfinished fallbacks
- Notifications: stale rendering layers
- DexCode / Terminal: unstable controls, hidden layout bugs

### Architecture Cleanup Targets
- Remove dead services and abandoned optimization attempts
- Remove duplicate rendering paths and state managers
- Remove stale cache systems and mock systems
- Remove unused dependencies and abandoned migration artifacts
- Reduce event routing and service orchestration clutter

## Rules
- Patch inside real architecture only — no placeholder layers
- No duplicate workflows
- No temporary junk abstractions
- Every commit must be production-meaningful

## Success Criteria
- No half-finished production systems remain
- No stale workflows remain active
- All systems behave intentionally and consistently
