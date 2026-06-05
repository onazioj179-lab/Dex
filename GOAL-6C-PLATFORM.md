# DEX 6.0 Goal Phase 6C — Platform: Workflows, Marketplace, Creative, Cloud, SDK

## Mission
Turn DEX from an app into a platform: automations users can build, a marketplace
to share them, a polished creative suite, optional cloud sync, a developer SDK,
and a cohesive Arc/Linear/Raycast-grade visual layer.

## Vision mapping
Covers **Phase 3 (Workflow System)**, **Phase 5 (Marketplace)**, **Phase 6
(Cloud Sync)**, **Phase 7 (Developer Platform)**, plus the Creative Suite and the
Visual/Design refresh.

## Scope

### Workflow Builder (Phase 3)
- Drag-and-drop automations on the existing node editor (`pages/Workflows.tsx`).
- Trigger → action chains (e.g. New Screenshot → Extract Text → Summarize → Save
  to Notes → Notify). Natural-language → executable workflow (DEX Command Lang).
- Reuse `shared/automation/` (cron, schedule, pipeline, condition, backoff).

### Marketplace (Phase 5)
- One-click install of agents, themes, plugins, workflows, widgets, integrations.
- Signed packages; local-first install; ratings/templates.

### Creative Suite — DEX Studio
- Notes, Whiteboard, Mind Maps, Canvas, Code/Markdown editors, Story Writer,
  Screen Recorder, Screenshot Tool, Voice Notes. Unify on the shared creative
  services (undo, AssetLibrary, autosave, history) already in `shared/creative/`.
- Close the one PARTIAL 5.0 gap: a standalone Screenshot capture UI.

### Cloud (Phase 6, optional, opt-in)
- Device sync, backup, team workspaces, shared agents/memory. The CRDT core
  exists (`shared/sync/lww.ts` + `syncQueue.ts`); add the network transport.
- E2E sync, local encryption, secure vault, passkey/biometric unlock.

### Developer Platform (Phase 7)
- SDKs: Plugin API, Rust SDK, TypeScript SDK, Workflow SDK, Agent SDK, Theme SDK.
- WASM plugin runtime; stable extension points behind the platform bridge.

### Visual / Design refresh
- Cleaner, sharper, faster: build on the Surface + Motion frameworks and design
  tokens already shipped. Glass/motion/layout polish; adaptive panels, dockable
  widgets, split views. Keep changes token-level + perf-tier-aware.

## Rules
- Reuse the mature shared services; do not duplicate undo/search/format/automation.
- Cloud + marketplace are opt-in; privacy and local-first remain defaults.
- Visual changes stay token-level and need eyes-on iteration on the real app.

## Success criteria
- Users build, run, and share automations and agents end-to-end.
- Optional sync works conflict-free across devices.
- A documented SDK lets third parties extend DEX; the UI feels designed by one
  team across every surface.
