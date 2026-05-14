# Track K: Adaptive Performance Scaling

**Status:** planned
**Release target:** v4.60.1
**Owner:** core

## Scope
Premium look on low-end Atom/Celeron AND full-quality + GPU-push on RTX-class hardware. Tier-aware rendering scales magnitudes within the premium aesthetic — never removes effects.

## Files
- src/renderer/utils/PerformanceManager.ts
- src/renderer/utils/HeapMonitor.ts
- src/main/engine/CPUOptimizer.ts
- src/main/engine/MemoryArchitecture.ts
- src/main/services/SystemTier.ts (new)
- native/src/perf.rs (extend frame-time histogram)
- src/renderer/services/CacheRegistry.ts (new)

## Done
- [ ] none yet

## Next
- [ ] K1 — hardware tier detection at startup (CPU cores, RAM, GPU class via `gpu_info` IPC, storage type); emit `system.tier` ∈ {low, mid, high}
- [ ] K2 — adaptive rendering pipeline per tier:
    - low: shadows → chip-only, blur radius ×0.5, animation duration ×0.7
    - mid: defaults
    - high: parallax wallpaper depth, background blur on inactive apps
- [ ] K3 — GPU-aware scheduling via native perf.rs frame-time histogram; renderer skips non-essential paint frames when budget exceeded
- [ ] K4 — thermal-aware balancing: throttle background indexing + analytics when "hot"
- [ ] K5 — battery-aware: defer non-urgent embeddings on battery <20%
- [ ] K6 — idle resource balancing: orchestrate idle-pause pollers + heap monitor + worker scheduling
- [ ] K7 — predictive resource loading: pre-warm next likely app via `UkiPredictive.getPredictions(1)` when CPU idle ≥2s
- [ ] K8 — dynamic memory cleanup: GC hint when heap >75%; aggressive image cache eviction on memory pressure
- [ ] K9 — async loading: audit current `React.lazy` usage; lazy-require where safe in main
- [ ] K10 — unified `CacheRegistry` (per-cache LRU + size budget + persistence policy)

## Blockers
- K1 blocks K2-K8 (tier must exist first)
- K7 depends on Track H (UkiPredictive extension)

## Verification
- 60fps shell on integrated GPU (Intel UHD 620 baseline)
- Stable on Celeron N4020 + 4GB RAM (low tier smoke)
- Stable + extra effects on RTX 4060 + 32GB (high tier smoke)
- No perceptible visual difference between tiers (subjective audit)
- Heap stays bounded under 24h soak

## Notes
- Visual quality is sacred. Tier changes adjust magnitudes, never remove effects.
- Tier policy table (K2) should be published in docs (Further Consideration #4 in plan.md, recommended publish).
