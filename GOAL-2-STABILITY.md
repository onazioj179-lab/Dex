# DEX Goal Phase 2 — Stability, Performance & Windows-First Optimization

## Mission
Make DEX reliable on 8 GB RAM / integrated GPU systems over long sessions.
Windows is the primary platform — optimize for Windows compositor and scheduler realities.

## Performance Targets
- Stable on 8 GB RAM under multitasking pressure
- Integrated GPU: adaptive rendering, deferred GPU work
- Long-session: memory must not grow unbounded
- Browser tabs: lifecycle cleanup on hidden tabs
- Creative apps: lower undo-history footprint, async background rendering

## Optimization Areas
- Adaptive rendering — reduce compositor work when idle
- Deferred initialization — lazy-load heavy panels
- Smart cache cleanup — prune search index, workspace snapshots
- Async processing — background workers non-blocking
- Active/inactive app prioritization — suspend pollers on hidden windows

## Windows-First Requirements
- Stable multi-monitor behavior
- Stable minimized/restored workflows
- Stable window focus and z-order
- Reliable update lifecycle on Windows
- No platform abstraction that weakens stability

## Shell & Multi-Window Fixes
- Scrolling lag during multitasking
- Delayed redraw on window restore
- Focus desync between compositor and shell
- Resize glitches on snap/unsnap
- Workspace interruptions during update cycles

## Success Criteria
- DEX stays stable across 4-hour sessions
- Memory pressure stays controlled automatically
- Frame pacing stays smooth under creative workloads
- No compositor crash under multi-window stress
