# DEX 6.0 Goal Phase 6B — Intelligence: UKI 2.0, Memory Graph, Agents

## Mission
Make DEX AI-native: one assistant that auto-selects the right model, remembers
everything as a connected graph, and lets users build their own agents.

## Vision mapping
Covers **Phase 2 (UKI 2.0)**, **Phase 4 (Memory Graph)**, and the **AI Agent
Studio**. Builds directly on the shipped 5.0 UKI provider framework
(`src/renderer/uki/providers/`, 5 providers + streaming + fallback) and the
existing `shared/nexus/` graph utilities.

## Scope

### UKI 2.0 — Smart Router (FIRST SLICE LANDED)
- **DONE:** `shared/uki/modelProfiles.ts` (cost/latency/intelligence catalog) +
  `shared/uki/smartRouter.ts` (`classifyTask`, `routeModels`, `fanOutModels`);
  goals: Auto / Cheapest / Fastest / Smartest / Offline. Wired into
  `connect.ts` (`routeConfiguredModels` → `chatWithFallback`) and the AI Providers
  Settings panel (Routing selector + banner). Unit-tested; mirrored natively in
  `core/dex-smart-router`.
- **Next:** parallel model execution (race `fanOutModels`, take first/best);
  per-task routing telemetry; learned routing from outcomes; live Ollama model
  discovery so `Offline`/`Cheapest` can include local models safely.

### Memory — Personal Knowledge Graph
- Build on `shared/nexus/` (model, views, centrality, pathfind, linkFromText).
- Connect notes, tasks, projects, files, meetings, decisions, conversations into
  relationships + timelines; surface "project context" + Project DNA.
- Persist via SQLite/LibSQL; vector recall via LanceDB/Qdrant (local-first).

### AI Agent Studio
- Visual builder for user agents (research/coding/design/marketing/support).
- Agent templates + shared agents (feeds the Marketplace in GOAL-6C).
- Agents compose UKI routing + memory + workflows (GOAL-6C) + tools.

### Intelligence Layer (ambient)
- Predictive actions ("continue yesterday's work?", "resume timer?") drawing on
  Rewind + memory, surfaced quietly (no interruptions).

## Rules
- Extend the existing UKI framework; do not reinvent providers/streaming.
- Routing/memory logic stays pure + unit-tested in `shared/`; UI wiring thin.
- Privacy by default — memory + routing run local-first; keys stay in the
  keystore (OS keychain in packaged builds).

## Success criteria
- UKI auto-routes per task across all configured providers, with graceful
  fallback; parallel execution available for hard tasks.
- A queryable knowledge graph links the user's work and powers project context.
- Users can build, save, and run custom agents from templates.
