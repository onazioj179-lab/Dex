# DEX Feature Opportunity Catalog

> The master list. ≥1000 grounded, ID-stable improvements across 14 categories. See
> [`README.md`](README.md) for the item format, impact/effort/wave legend, and grounding rule.
> Roadmaps reference these IDs; they do not restate them.

Format: `` `ID` (I:impact E:effort W:wave) Title — rationale. → anchor ``

---

## 1 · UKI Intelligence (`UKI`) — target 110

**Audit:** `src/renderer/uki/*` is 14 modules (identity, knowledge, knowledgeFeeder, operator,
context, memory, cache, compressedMemory, semanticSearch, index_search, permissions, freeApis,
schemas) — a context/operator layer with **no LLM provider integration**. `semanticSearch.ts` is a
lexical-only facade; `shared/uki/{embeddings,toolCall,planner,skills,streaming}.ts` are type-only
stubs; `utils/ai.ts` is local-ML only. `operator.ts` has briefing + intent router + searchEnvironment.

### A. AI Provider Framework
- [ ] `UKI-001` (I:H E:M W:3) Define an `LLMProvider` interface (chat, stream, embed, toolCall) — no provider abstraction exists. → uki/providers/types.ts (new)
- [ ] `UKI-002` (I:H E:M W:3) Implement OpenAI provider (chat + SSE streaming). → uki/providers/openai.ts
- [ ] `UKI-003` (I:H E:M W:3) Implement Anthropic provider (messages + streaming). → uki/providers/anthropic.ts
- [ ] `UKI-004` (I:H E:M W:3) Implement Google Gemini provider. → uki/providers/google.ts
- [ ] `UKI-005` (I:H E:M W:3) Implement Ollama local provider (localhost discovery). → uki/providers/ollama.ts
- [ ] `UKI-006` (I:H E:M W:3) Implement OpenRouter aggregator provider. → uki/providers/openrouter.ts
- [ ] `UKI-007` (I:M E:L W:3) Implement local inference provider via dex-core native. → uki/providers/local.ts + dex-core
- [ ] `UKI-008` (I:H E:M W:3) Encrypted API-key store (via crypto.rs / vault) — never plaintext localStorage. → uki/keystore.ts
- [ ] `UKI-009` (I:H E:S W:3) Settings panel to add / edit / remove / test provider keys. → Settings app
- [ ] `UKI-010` (I:H E:S W:3) Model registry: per-provider model list + capability flags (vision, tools, context window). → uki/providers/registry.ts
- [ ] `UKI-011` (I:H E:M W:3) Provider orchestrator: route a request to the chosen provider/model. → uki/orchestrator.ts
- [ ] `UKI-012` (I:M E:M W:3) Per-task model assignment (chat vs summarize vs code vs embed). → uki/orchestrator.ts
- [ ] `UKI-013` (I:M E:S W:3) Model quick-switcher in the UKI panel header. → UkiOverlay.tsx
- [ ] `UKI-014` (I:M E:M W:3) Streaming token rendering in the UKI panel (incremental). → UkiOverlay.tsx + streaming.ts
- [ ] `UKI-015` (I:M E:S W:3) Cancel/stop an in-flight generation. → uki/orchestrator.ts
- [ ] `UKI-016` (I:M E:S W:3) Per-provider rate-limit + backoff handling. → uki/orchestrator.ts
- [ ] `UKI-017` (I:M E:S W:3) Token + cost meter per request (budget awareness). → streaming.ts (tokenBudget)
- [ ] `UKI-018` (I:M E:M W:3) Fallback chain: degrade to local/free provider on failure. → uki/orchestrator.ts
- [ ] `UKI-019` (I:L E:S W:3) Offline mode banner when no provider reachable. → UkiOverlay.tsx
- [ ] `UKI-020` (I:M E:S W:3) Redact secrets/PII from prompts before send (privacy principle). → uki/orchestrator.ts
- [ ] `UKI-021` (I:L E:S W:3) Provider health indicator (reachable/latency) in Settings. → Settings app
- [ ] `UKI-022` (I:L E:M W:3) Response caching by prompt hash with TTL. → uki/cache.ts
- [ ] `UKI-023` (I:L E:S W:3) Configurable system-prompt prefix per provider. → uki/identity.ts
- [ ] `UKI-024` (I:L E:S W:3) Temperature / max-tokens controls surfaced in advanced settings. → Settings app
- [ ] `UKI-025` (I:L E:M W:3) Multi-modal input (attach image to vision-capable models). → UkiOverlay.tsx

### B. Tool-calling, skills & planner execution
- [ ] `UKI-026` (I:H E:M W:3) Wire `toolCall.ts` to provider tool/function calling — currently a type-only stub. → shared/uki/toolCall.ts
- [ ] `UKI-027` (I:H E:M W:3) Tool registry mapping UKI tools → app actions (open app, search, create note). → uki/tools/registry.ts
- [ ] `UKI-028` (I:H E:M W:3) Execute `planner.ts` plans step-by-step with confirmation gates. → shared/uki/planner.ts
- [ ] `UKI-029` (I:H E:M W:3) Execute `skills.ts`/`appSkills.ts` catalog entries (not just list them). → shared/uki/skills.ts
- [ ] `UKI-030` (I:M E:S W:3) Dry-run preview of a plan before execution. → uki/planner
- [ ] `UKI-031` (I:M E:S W:3) Per-tool permission prompt via existing `permissions.ts`. → uki/permissions.ts
- [ ] `UKI-032` (I:M E:M W:3) Tool result feedback loop back into the conversation. → uki/orchestrator.ts
- [ ] `UKI-033` (I:M E:S W:3) Undo for tool-driven actions (route to SystemUndoManager). → main/core/SystemUndoManager.ts
- [ ] `UKI-034` (I:M E:M W:4) "Prepare my workspace" skill: launch a workflow template. → operator.ts + workflowTemplates.ts
- [ ] `UKI-035` (I:M E:M W:4) "Continue yesterday" skill: restore project workspace. → operator.ts + WorkspaceSnapshot
- [ ] `UKI-036` (I:L E:S W:3) Tool-call audit log (what UKI did, when). → uki/memory.ts
- [ ] `UKI-037` (I:L E:M W:3) Skill confidence calibration surfaced to user. → shared/uki/intelligence.ts
- [ ] `UKI-038` (I:L E:S W:3) Per-app skill discovery in the panel. → shared/uki/appSkills.ts
- [ ] `UKI-039` (I:L E:M W:4) Chained skills (macro of skills). → uki/skills
- [ ] `UKI-040` (I:L E:S W:3) Tool timeout + cancellation. → uki/tools/registry.ts

### C. Semantic search, embeddings & memory
- [ ] `UKI-041` (I:H E:L W:3) Replace `semanticSearch.ts` lexical facade with vector + FTS5 hybrid. → uki/semanticSearch.ts
- [ ] `UKI-042` (I:H E:M W:3) Wire `embeddings.ts` to a real embed endpoint (provider or local). → shared/uki/embeddings.ts
- [ ] `UKI-043` (I:H E:M W:5) Adopt native `fts.rs` (tantivy) as UKI memory index backend. → dex-core/fts.rs
- [ ] `UKI-044` (I:M E:M W:3) Persist embeddings in sqlite (`database.rs`) not localStorage. → dex-core/database.rs
- [ ] `UKI-045` (I:M E:S W:3) Hybrid ranking blend (lexical + vector) with weights. → uki/semanticSearch.ts
- [ ] `UKI-046` (I:M E:M W:3) Incremental re-index on new memory turns. → uki/index_search.ts
- [ ] `UKI-047` (I:M E:S W:2) Surface semantic-search status (lexical/vector/FTS) honestly in UI. → UkiOverlay.tsx
- [ ] `UKI-048` (I:M E:M W:3) Memory consolidation summaries via LLM (compressedMemory). → uki/compressedMemory.ts
- [ ] `UKI-049` (I:M E:S W:3) Memory budget controls (100MB default) surfaced in Settings. → uki/knowledgeFeeder.ts
- [ ] `UKI-050` (I:L E:S W:3) Pin/forget specific memories. → uki/memory.ts
- [ ] `UKI-051` (I:L E:S W:3) Memory search box in the panel. → UkiOverlay.tsx
- [ ] `UKI-052` (I:L E:M W:3) Encrypt memory archives at rest. → uki/memory.ts + crypto
- [ ] `UKI-053` (I:L E:S W:3) Export/import memory archive. → uki/knowledgeFeeder.ts
- [ ] `UKI-054` (I:L E:M W:3) De-duplicate near-identical memory turns. → uki/index_search.ts
- [ ] `UKI-055` (I:L E:S W:3) Memory age decay weighting in recall. → uki/index_search.ts

### D. Operator capabilities
- [ ] `UKI-056` (I:H E:M W:2) Wire `operator.searchEnvironment` results into the panel UI. → operator.ts + UkiOverlay.tsx
- [ ] `UKI-057` (I:M E:S W:2) Show the operator briefing (open apps, project, workload) as a status chip. → operator.ts
- [ ] `UKI-058` (I:M E:M W:3) Add `automate` intent to the operator router. → operator.ts
- [ ] `UKI-059` (I:M E:M W:2) Active-project awareness everywhere (read continuity:project). → operator.ts + ContextBus
- [ ] `UKI-060` (I:M E:S W:2) "What was I doing?" → reconstruct from Rewind timeline. → operator.ts + timeline.ts
- [ ] `UKI-061` (I:M E:S W:3) Resource recommendations from unified search (assets/files). → operator.ts
- [ ] `UKI-062` (I:M E:M W:3) Proactive suggestions (idle: "resume project X?"). → operator.ts
- [ ] `UKI-063` (I:L E:S W:2) Operator briefing token-bounded for prompt inclusion. → operator.ts (formatOperatorBriefing)
- [ ] `UKI-064` (I:L E:S W:3) Per-workspace operator context scoping. → operator.ts
- [ ] `UKI-065` (I:L E:M W:3) Operator action history timeline. → operator.ts + memory
- [ ] `UKI-066` (I:L E:S W:3) Confidence threshold before taking autonomous action. → operator.ts
- [ ] `UKI-067` (I:L E:S W:3) Operator "explain why" for each suggestion. → operator.ts
- [ ] `UKI-068` (I:L E:M W:4) Operator multi-step task tracking panel. → UkiOverlay.tsx
- [ ] `UKI-069` (I:L E:S W:3) Operator quiet hours / do-not-suggest windows. → operator.ts
- [ ] `UKI-070` (I:L E:S W:3) Operator keyboard entrypoint (global hotkey). → utils/keyboardShortcuts.ts

### E. Context & awareness
- [ ] `UKI-071` (I:M E:S W:3) Enrich `context.ts` snapshot with selection/clipboard. → uki/context.ts
- [ ] `UKI-072` (I:M E:M W:3) Per-app context resolvers (focused item, selection). → shared/uki/appContext.ts
- [ ] `UKI-073` (I:M E:S W:3) Browser activity into context (current page/title). → uki/context.ts + Browser
- [ ] `UKI-074` (I:M E:S W:3) Open-file awareness (recent files into context). → uki/knowledgeFeeder.ts
- [ ] `UKI-075` (I:L E:S W:3) Task/calendar awareness into context. → uki/context.ts
- [ ] `UKI-076` (I:L E:S W:3) Workspace/stage awareness into context. → uki/context.ts + ContextBus
- [ ] `UKI-077` (I:L E:M W:3) Relationship/timeline/dependency modeling (context intelligence). → main/core/ContextIntelligenceService.ts
- [ ] `UKI-078` (I:L E:S W:3) Asset-relationship awareness (which assets in which project). → AssetLibrary + context
- [ ] `UKI-079` (I:L E:S W:3) Privacy scope toggle: what UKI may read. → uki/permissions.ts
- [ ] `UKI-080` (I:L E:S W:3) Context freshness/staleness indicator. → uki/context.ts

### F. Conversation UX & knowledge layer
- [ ] `UKI-081` (I:M E:S W:3) Conversation history list with search. → UkiOverlay.tsx
- [ ] `UKI-082` (I:M E:S W:3) Markdown + code rendering with copy buttons. → UkiOverlay.tsx
- [ ] `UKI-083` (I:M E:S W:3) Inline citations when free-API facts are used. → uki/freeApis.ts
- [ ] `UKI-084` (I:L E:S W:3) Regenerate / edit-and-resend a message. → UkiOverlay.tsx
- [ ] `UKI-085` (I:L E:S W:3) Pin a conversation to a project. → UkiOverlay.tsx + ContextBus
- [ ] `UKI-086` (I:L E:S W:3) Suggested follow-up prompts. → UkiOverlay.tsx
- [ ] `UKI-087` (I:L E:S W:3) Voice input (existing permission scaffold). → uki/permissions.ts
- [ ] `UKI-088` (I:L E:S W:3) Read-aloud responses (TTS). → UkiOverlay.tsx
- [ ] `UKI-089` (I:M E:S W:3) Keep `knowledge.ts` app catalog in sync with APP_DEFINITIONS. → uki/knowledge.ts
- [ ] `UKI-090` (I:M E:S W:3) Expand troubleshooting knowledge from real HANDOFF issues. → uki/knowledge.ts (findTroubleshooting)
- [ ] `UKI-091` (I:L E:S W:3) Architecture knowledge kept current with native subsystems. → uki/knowledge.ts (DEX_ARCHITECTURE)
- [ ] `UKI-092` (I:L E:S W:3) Surface keyboard-shortcut knowledge for the focused app. → uki/knowledge.ts
- [ ] `UKI-093` (I:L E:S W:3) Knowledge feeder ingest of plugin manifests. → uki/knowledgeFeeder.ts
- [ ] `UKI-094` (I:L E:S W:3) Knowledge feeder budget telemetry. → uki/knowledgeFeeder.ts
- [ ] `UKI-095` (I:L E:S W:3) Cache free-API facts with provenance + TTL. → uki/freeApis.ts

### G. Reliability, privacy & polish
- [ ] `UKI-096` (I:M E:S W:3) Hard-deny permission state (currently grant-only). → uki/permissions.ts
- [ ] `UKI-097` (I:M E:S W:3) Per-provider data-sharing disclosure on first use. → Settings app
- [ ] `UKI-098` (I:L E:S W:3) Local-only mode that blocks all cloud providers. → uki/orchestrator.ts
- [ ] `UKI-099` (I:L E:S W:3) Prompt/response size guards. → uki/orchestrator.ts
- [ ] `UKI-100` (I:L E:S W:3) Schema-version migration for memory records. → uki/schemas.ts
- [ ] `UKI-101` (I:L E:S W:3) Graceful empty/loading/error states in the panel. → UkiOverlay.tsx
- [ ] `UKI-102` (I:L E:S W:3) Latency telemetry for provider calls. → uki/orchestrator.ts
- [ ] `UKI-103` (I:L E:S W:3) Deterministic test harness with a mock provider. → tests/unit
- [ ] `UKI-104` (I:L E:S W:3) Conversation export (markdown). → UkiOverlay.tsx
- [ ] `UKI-105` (I:L E:S W:3) Accessibility pass on the UKI panel (focus, ARIA, contrast). → UkiOverlay.tsx
- [ ] `UKI-106` (I:L E:S W:3) Reduced-motion respect in panel animations. → UkiOverlay.tsx + comfortPrefs
- [ ] `UKI-107` (I:L E:S W:3) Panel resize + dock-to-side option. → UkiOverlay.tsx
- [ ] `UKI-108` (I:L E:S W:3) Per-project conversation memory partitioning. → uki/memory.ts
- [ ] `UKI-109` (I:L E:S W:3) Configurable persona/voice presets. → uki/identity.ts
- [ ] `UKI-110` (I:L E:S W:3) Telemetry opt-in/out for UKI usage. → Settings app

---

## 2 · Nexus (`NEX`) — target 70

**Audit:** `Nexus.tsx` is still graph-first (Canvas2D starfield / grid / cluster / knowledge modes).
`shared/nexus/memoryViews.ts` defines the memory-first model (8 memory + 2 structure views,
`orderedNexusViews`, `NEXUS_DEFAULT_VIEW_ID='projects'`) but is **orphaned** — no UI consumes it.

### A. Memory-first shell
- [ ] `NEX-001` (I:H E:M W:2) Build the memory-first sidebar consuming `orderedNexusViews()`. → Nexus.tsx + memoryViews.ts
- [ ] `NEX-002` (I:H E:S W:2) Default Nexus to `NEXUS_DEFAULT_VIEW_ID` (projects), not the graph. → Nexus.tsx
- [ ] `NEX-003` (I:H E:M W:2) Demote graph to a secondary "structure" view (tab, not home). → Nexus.tsx
- [ ] `NEX-004` (I:M E:S W:2) Memory/structure tier separators in the sidebar. → Nexus.tsx
- [ ] `NEX-005` (I:M E:S W:2) Per-view empty states with helpful copy. → Nexus.tsx
- [ ] `NEX-006` (I:M E:S W:2) Remember last-open view per session. → Nexus.tsx + cache
- [ ] `NEX-007` (I:L E:S W:2) Keyboard navigation across views. → Nexus.tsx
- [ ] `NEX-008` (I:L E:S W:2) View-level search box. → Nexus.tsx + SearchOrchestrator
- [ ] `NEX-009` (I:L E:S W:2) Density/comfort respect (comfortPrefs). → Nexus.tsx
- [ ] `NEX-010` (I:L E:S W:2) Icon hints from `memoryViews` mapped to DexIcon. → memoryViews.ts + DexIcon

### B. Project view
- [ ] `NEX-011` (I:H E:M W:2) Project view: group everything by `.dexproject` manifest. → Nexus.tsx + DexProject.ts
- [ ] `NEX-012` (I:M E:M W:2) Project card: notes, files, assets, sessions counts. → Nexus.tsx
- [ ] `NEX-013` (I:M E:S W:2) Open project → restore workspace (WorkspaceSnapshot). → DexProject.ts
- [ ] `NEX-014` (I:M E:S W:2) Recent vs archived projects. → Nexus.tsx
- [ ] `NEX-015` (I:M E:S W:2) Project activity sparkline from Rewind. → timeline.ts
- [ ] `NEX-016` (I:L E:S W:2) Pin/favorite projects. → Nexus.tsx
- [ ] `NEX-017` (I:L E:S W:2) Project color/accent from workflow template. → workflowTemplates.ts
- [ ] `NEX-018` (I:L E:S W:2) Project search + filter. → Nexus.tsx
- [ ] `NEX-019` (I:L E:M W:2) Project timeline drill-down. → timeline.ts
- [ ] `NEX-020` (I:L E:S W:2) Create new project from view. → DexProject.ts

### C. Idea view
- [ ] `NEX-021` (I:M E:M W:2) Idea view: captured notes/drafts/sparks. → Nexus.tsx + Notes
- [ ] `NEX-022` (I:M E:S W:2) Quick-capture an idea inline. → Nexus.tsx
- [ ] `NEX-023` (I:L E:S W:2) Link ideas to projects. → ContextBus
- [ ] `NEX-024` (I:L E:S W:2) Tag/cluster ideas. → Nexus.tsx
- [ ] `NEX-025` (I:L E:M W:2) Idea → task promotion. → Tasks app
- [ ] `NEX-026` (I:L E:S W:2) Idea search. → SearchOrchestrator
- [ ] `NEX-027` (I:L E:S W:2) Idea timeline (when captured). → timeline.ts

### D. People view
- [ ] `NEX-028` (I:M E:M W:2) People view: collaborators/contacts linked to work. → Nexus.tsx
- [ ] `NEX-029` (I:L E:S W:2) Person card: related projects/files/conversations. → Nexus.tsx
- [ ] `NEX-030` (I:L E:M W:2) Source people from collaboration features. → useCollaborationFeatures
- [ ] `NEX-031` (I:L E:S W:2) Person search/filter. → Nexus.tsx
- [ ] `NEX-032` (I:L E:S W:2) Recent interactions per person. → timeline.ts
- [ ] `NEX-033` (I:L E:S W:2) Privacy: people view opt-out. → uki/permissions.ts
- [ ] `NEX-034` (I:L E:S W:2) Link a person to a conversation thread. → ContextBus

### E. Asset view
- [ ] `NEX-035` (I:H E:M W:2) Asset view backed by `AssetLibrary` (all kinds). → AssetLibrary.ts
- [ ] `NEX-036` (I:M E:S W:2) Asset thumbnails + kind filter. → Nexus.tsx
- [ ] `NEX-037` (I:M E:S W:2) Asset → which projects use it. → AssetLibrary + ContextBus
- [ ] `NEX-038` (I:L E:S W:2) Asset search via asset provider. → searchProviders.ts
- [ ] `NEX-039` (I:L E:S W:2) Asset reveal-in-app action. → SendToMenu.tsx
- [ ] `NEX-040` (I:L E:S W:2) Asset recency/usage sort. → AssetLibrary.ts

### F. Timeline view
- [ ] `NEX-041` (I:H E:M W:2) Timeline view rendering `buildTimeline()` sessions. → timeline.ts
- [ ] `NEX-042` (I:M E:S W:2) Day/week grouping of sessions. → timeline.ts
- [ ] `NEX-043` (I:M E:S W:2) Click a session → reconstruct workspace. → WorkspaceSnapshot
- [ ] `NEX-044` (I:L E:S W:2) Filter timeline by app/project. → timeline.ts
- [ ] `NEX-045` (I:L E:S W:2) Session duration + primary-app labels. → timeline.ts (sessionDuration)
- [ ] `NEX-046` (I:L E:S W:2) Timeline zoom (hour/day/week). → Nexus.tsx

### G. Knowledge view
- [ ] `NEX-047` (I:M E:M W:2) Knowledge view: things grouped by understanding/topics. → Nexus.tsx
- [ ] `NEX-048` (I:M E:M W:3) Topic clustering via embeddings. → embeddings.ts
- [ ] `NEX-049` (I:L E:S W:2) Knowledge → source documents. → Nexus.tsx
- [ ] `NEX-050` (I:L E:S W:3) Auto-summaries per topic (LLM). → uki/orchestrator.ts
- [ ] `NEX-051` (I:L E:S W:2) Knowledge search. → SearchOrchestrator
- [ ] `NEX-052` (I:L E:S W:2) Pin key knowledge cards. → Nexus.tsx

### H. Graph (secondary) & data model
- [ ] `NEX-053` (I:M E:M W:2) Keep graph mode but feed it from the memory data model. → Nexus.tsx
- [ ] `NEX-054` (I:M E:S W:5) Move graph rendering hot path to dex-core/effects if janky. → dex-core
- [ ] `NEX-055` (I:L E:S W:2) Graph node → open in memory view. → Nexus.tsx
- [ ] `NEX-056` (I:L E:S W:2) Graph perf-tier degradation (already partial). → TierManager
- [ ] `NEX-057` (I:L E:S W:2) Graph edge weighting by relationship strength. → Nexus.tsx
- [ ] `NEX-058` (I:L E:S W:2) Graph search highlight. → Nexus.tsx
- [ ] `NEX-059` (I:H E:M W:2) Define a unified Nexus data model (entities + relations). → shared/nexus/model.ts (new)
- [ ] `NEX-060` (I:M E:M W:2) Ingest entities from ContextBus events. → ContextBus
- [ ] `NEX-061` (I:M E:M W:2) Ingest sessions from RewindEngine. → main/core/RewindEngine.ts
- [ ] `NEX-062` (I:M E:M W:5) Persist Nexus model in sqlite (database.rs). → dex-core/database.rs
- [ ] `NEX-063` (I:L E:S W:2) Relationship inference (co-occurrence). → shared/nexus/model.ts
- [ ] `NEX-064` (I:L E:S W:2) Model migration/versioning. → shared/nexus/model.ts
- [ ] `NEX-065` (I:L E:S W:2) Model export/import. → shared/nexus/model.ts
- [ ] `NEX-066` (I:L E:S W:2) Incremental model updates (no full rebuild). → shared/nexus/model.ts
- [ ] `NEX-067` (I:L E:S W:2) Dead-entity garbage collection. → shared/nexus/model.ts
- [ ] `NEX-068` (I:L E:S W:2) Privacy filter on indexed entities. → uki/permissions.ts
- [ ] `NEX-069` (I:L E:S W:2) Nexus onboarding tour for the new model. → Nexus.tsx
- [ ] `NEX-070` (I:L E:S W:2) Unit tests for the Nexus data model + views. → tests/unit

---

## 3 · Rewind (`RWD`) — target 55

**Audit:** `main/core/RewindEngine.ts` (+ Logger/Security/DexBridge/Learning/Analytics/Plugin/Phase5)
silently logs windows, clipboard, files, browser tabs to date-sharded JSON. `Rewind.tsx` shows raw
entries + optional screenshots. `shared/rewind/timeline.ts` (`buildTimeline`) reconstructs sessions
by idle gap but is **never called**.

### A. Timeline integration
- [ ] `RWD-001` (I:H E:M W:2) Call `buildTimeline()` over loaded events in Rewind.tsx. → Rewind.tsx + timeline.ts
- [ ] `RWD-002` (I:H E:M W:2) Render `TimelineSession` rows (primary app, span, count). → Rewind.tsx
- [ ] `RWD-003` (I:M E:S W:2) Map RewindEngine entries → `ActivityEvent[]`. → RewindDexBridge
- [ ] `RWD-004` (I:M E:S W:2) Configurable session idle-gap (default 30m). → timeline.ts (DEFAULT_SESSION_GAP_MS)
- [ ] `RWD-005` (I:M E:S W:2) Day/week section headers over sessions. → Rewind.tsx
- [ ] `RWD-006` (I:L E:S W:2) Session search/filter by app. → Rewind.tsx
- [ ] `RWD-007` (I:L E:S W:2) Session duration display (sessionDuration). → timeline.ts
- [ ] `RWD-008` (I:L E:S W:2) Empty-state when no activity yet. → Rewind.tsx
- [ ] `RWD-009` (I:L E:S W:2) Virtualize long session lists. → Rewind.tsx
- [ ] `RWD-010` (I:L E:S W:2) Timeline unit tests on real event fixtures. → tests/unit/rewind-timeline.test.ts
- [ ] `RWD-011` (I:L E:S W:2) Per-project timeline filter (continuity:project). → ContextBus
- [ ] `RWD-012` (I:L E:S W:2) Color sessions by primary app accent. → Rewind.tsx

### B. Session reconstruction & replay
- [ ] `RWD-013` (I:H E:M W:2) Reconstruct a workspace from a session (open apps/files). → WorkspaceSnapshot
- [ ] `RWD-014` (I:M E:M W:2) "Replay" a creative/research session step-by-step. → RewindPhase5Manager
- [ ] `RWD-015` (I:M E:M W:2) Reconstruct browser tabs from a session. → Browser + RewindEngine
- [ ] `RWD-016` (I:M E:S W:2) Reconstruct open files from a session. → Files + RewindEngine
- [ ] `RWD-017` (I:M E:S W:2) Jump from a session to its project in Nexus. → Nexus.tsx
- [ ] `RWD-018` (I:L E:S W:2) Bookmark a session moment. → Rewind.tsx
- [ ] `RWD-019` (I:L E:S W:2) Annotate a session. → Rewind.tsx
- [ ] `RWD-020` (I:L E:M W:2) Diff two sessions (what changed). → RewindAnalyticsEngine
- [ ] `RWD-021` (I:L E:S W:2) Export a session summary. → Rewind.tsx
- [ ] `RWD-022` (I:L E:M W:2) Resume-where-left-off action per session. → operator.ts
- [ ] `RWD-023` (I:L E:S W:2) Session → asset list touched. → AssetLibrary
- [ ] `RWD-024` (I:L E:S W:2) Activity recovery after crash from last session. → CrashRecoverySystem

### C. Capture & recording
- [ ] `RWD-025` (I:M E:S W:2) Capture toggle + status indicator in shell. → Rewind.tsx
- [ ] `RWD-026` (I:M E:S W:2) Per-app capture opt-out list. → RewindSecurityLayer
- [ ] `RWD-027` (I:M E:M W:2) Screenshot capture cadence + storage budget. → RewindEngine (Phase 2)
- [ ] `RWD-028` (I:M E:S W:2) Pause capture during private/incognito. → Browser + RewindSecurityLayer
- [ ] `RWD-029` (I:L E:S W:2) Retention policy (auto-delete after N days). → RewindEngine
- [ ] `RWD-030` (I:L E:S W:2) Storage usage meter. → Rewind.tsx
- [ ] `RWD-031` (I:L E:M W:5) Move shard compaction to native (compression.rs). → dex-native kernel
- [ ] `RWD-032` (I:L E:S W:2) Clipboard capture sensitivity rules. → RewindSecurityLayer
- [ ] `RWD-033` (I:L E:S W:2) File-event noise filtering (temp/system files). → RewindEngine
- [ ] `RWD-034` (I:L E:S W:2) Capture pause on low battery. → power (dex-native)

### D. Search & intelligence
- [ ] `RWD-035` (I:M E:M W:3) Natural-language search over activity ("trailer edit last week"). → RewindEngine + semanticSearch
- [ ] `RWD-036` (I:M E:M W:5) Index activity in native fts.rs. → dex-core/fts.rs
- [ ] `RWD-037` (I:M E:S W:3) AI day-summaries (SmartSummary) via provider. → Rewind.tsx + uki/orchestrator
- [ ] `RWD-038` (I:L E:M W:3) Pattern learning insights (RewindLearningEngine). → RewindLearningEngine
- [ ] `RWD-039` (I:L E:S W:3) "Most productive time" analytics. → RewindAnalyticsEngine
- [ ] `RWD-040` (I:L E:S W:3) App-usage breakdown per day. → RewindAnalyticsEngine
- [ ] `RWD-041` (I:L E:S W:3) Surface insights into Home Mission Control. → Home page
- [ ] `RWD-042` (I:L E:S W:3) Suggest workflow templates from observed patterns. → workflowTemplates.ts

### E. Privacy, security & UX
- [ ] `RWD-043` (I:H E:S W:2) Encrypt activity store at rest. → RewindSecurityLayer + crypto.rs
- [ ] `RWD-044` (I:M E:S W:2) One-click "delete today / range / all". → Rewind.tsx
- [ ] `RWD-045` (I:M E:S W:2) Local-only guarantee documented + enforced. → RewindEngine
- [ ] `RWD-046` (I:L E:S W:2) Sensitive-app blocklist (password managers). → RewindSecurityLayer
- [ ] `RWD-047` (I:L E:S W:2) Redact secrets in clipboard captures. → RewindSecurityLayer
- [ ] `RWD-048` (I:L E:S W:2) Export-then-wipe flow. → Rewind.tsx
- [ ] `RWD-049` (I:L E:S W:2) Capture-consent on first run. → Rewind.tsx
- [ ] `RWD-050` (I:L E:S W:2) Settings: Rewind privacy controls. → Settings app
- [ ] `RWD-051` (I:L E:S W:2) Rewind plugin permissions (RewindPluginManager). → RewindPluginManager
- [ ] `RWD-052` (I:L E:S W:2) Accessibility pass on Rewind UI. → Rewind.tsx
- [ ] `RWD-053` (I:L E:S W:2) Reduced-motion in timeline transitions. → comfortPrefs
- [ ] `RWD-054` (I:L E:S W:2) Keyboard navigation of timeline. → Rewind.tsx
- [ ] `RWD-055` (I:L E:S W:2) Perf-tier-aware screenshot resolution. → TierManager

---

## 4 · Shell (`SHL`) — target 120

**Audit:** `AppManager.tsx` hosts the dock + 42 lazy apps + window layer; `StageManager.tsx` is the
left-edge workspace strip (collapses 6px→96px, 1200ms auto-hide, no thumbnails); Spotlight is partly
retired (Ctrl+Space gone; Ctrl+K = CommandPalette); `NotificationBanners.tsx` caps at `MAX_VISIBLE=3`
with no archive UI (built `NotificationCenter` unwired); Settings is ~4766 LOC. (Dock-specific items
live in `DOK`; Home in `HOM`; search in `SCH`.)

### A. Window management
- [ ] `SHL-001` (I:H E:M W:4) Enforce per-app minimum window sizes. → AppManager.tsx
- [ ] `SHL-002` (I:H E:M W:4) Correct resize behavior across all apps (no clipping). → AppManager.tsx
- [ ] `SHL-003` (I:M E:M W:4) Window open/close/minimize/restore via `--motion-window-*`. → AppManager.tsx + UnifiedMotionSystem
- [ ] `SHL-004` (I:M E:S W:4) Snap-to-edge / half/quarter tiling. → AppManager.tsx
- [ ] `SHL-005` (I:M E:S W:4) Remember per-app last window bounds. → WorkspaceSnapshot
- [ ] `SHL-006` (I:M E:S W:4) Window focus ring + active-window emphasis. → AppManager.tsx
- [ ] `SHL-007` (I:L E:S W:4) Cascade/auto-place new windows. → AppManager.tsx
- [ ] `SHL-008` (I:L E:S W:4) Always-on-top toggle per window. → AppManager.tsx
- [ ] `SHL-009` (I:L E:S W:4) Window shade/roll-up. → AppManager.tsx
- [ ] `SHL-010` (I:L E:S W:4) Double-click titlebar to maximize. → AppManager.tsx
- [ ] `SHL-011` (I:L E:S W:4) Keyboard window cycling (Alt+`). → keyboardShortcuts.ts
- [ ] `SHL-012` (I:L E:S W:4) Window close confirmation when unsaved (useUnsavedGuard). → useUnsavedGuard
- [ ] `SHL-013` (I:L E:S W:4) Minimize-to-dock animation target. → AppManager.tsx
- [ ] `SHL-014` (I:L E:M W:4) Multi-window per app (e.g., two Notes). → AppManager.tsx
- [ ] `SHL-015` (I:L E:S W:4) Window opacity while dragging. → AppManager.tsx
- [ ] `SHL-016` (I:L E:S W:4) Z-order ladder audit (use --z-* tokens). → design-system.css
- [ ] `SHL-017` (I:L E:S W:4) Respect maximized state on dock pointer-events. → AppManager.tsx
- [ ] `SHL-018` (I:L E:M W:4) Detachable panels (tear-off). → AppManager.tsx
- [ ] `SHL-019` (I:L E:S W:4) Window resize via keyboard. → keyboardShortcuts.ts
- [ ] `SHL-020` (I:L E:S W:4) Per-app remember maximized preference. → WorkspaceSnapshot

### B. Stage Manager & workspaces
- [ ] `SHL-021` (I:H E:M W:4) Live window thumbnails in StageTile (currently icon-only). → StageManager.tsx
- [ ] `SHL-022` (I:H E:M W:4) Named workspace switcher UI (snapshots exist, no UI). → WorkspaceSnapshot + StageManager
- [ ] `SHL-023` (I:M E:S W:4) Workspace switch transition via --motion-workspace-switch. → UnifiedMotionSystem
- [ ] `SHL-024` (I:M E:S W:4) Create/rename/delete workspaces. → WorkspaceSnapshot
- [ ] `SHL-025` (I:M E:S W:4) Per-workspace app sets. → WorkspaceSnapshot
- [ ] `SHL-026` (I:M E:S W:4) Drag app between workspaces. → StageManager.tsx
- [ ] `SHL-027` (I:L E:S W:4) Workspace previews on hover. → StageManager.tsx
- [ ] `SHL-028` (I:L E:S W:4) Keyboard workspace switching (Ctrl+1..9). → keyboardShortcuts.ts
- [ ] `SHL-029` (I:L E:S W:4) Auto-hide tuning exposed in Settings. → Settings + StageManager
- [ ] `SHL-030` (I:L E:S W:4) Always-visible stage option (a11y). → StageManager.tsx
- [ ] `SHL-031` (I:L E:S W:4) Stage perf weak-mode review. → TierManager
- [ ] `SHL-032` (I:L E:S W:4) Workspace from a workflow template. → workflowTemplates.ts
- [ ] `SHL-033` (I:L E:S W:4) Workspace bound to a project. → DexProject.ts
- [ ] `SHL-034` (I:L E:M W:4) Cross-monitor workspace placement. → main-process display info
- [ ] `SHL-035` (I:L E:S W:4) Active-workspace indicator in top bar. → top bar

### C. Spotlight / Command Palette
- [ ] `SHL-036` (I:H E:M W:2) Unify Spotlight + CommandPalette on SearchOrchestrator. → SpotlightEngine.ts + searchProviders
- [ ] `SHL-037` (I:M E:S W:2) Single global hotkey to open unified search. → keyboardShortcuts.ts
- [ ] `SHL-038` (I:M E:S W:2) Result grouping (apps/files/commands/assets). → SearchOrchestrator
- [ ] `SHL-039` (I:M E:S W:2) Recent + frequent results when empty. → SpotlightEngine.ts
- [ ] `SHL-040` (I:L E:S W:2) Keyboard-only result navigation. → SpotlightSearch.tsx
- [ ] `SHL-041` (I:L E:S W:2) Inline calculator/unit results. → SearchOrchestrator (calculator kind)
- [ ] `SHL-042` (I:L E:S W:2) Action verbs ("new note", "open project"). → SpotlightEngine.ts
- [ ] `SHL-043` (I:L E:S W:2) Result previews on focus. → SpotlightSearch.tsx
- [ ] `SHL-044` (I:L E:S W:2) Remove dead Spotlight code paths. → SpotlightEngine.ts
- [ ] `SHL-045` (I:L E:S W:2) Explainable ranking debug panel. → SearchOrchestrator (timings)

### D. Notifications
- [ ] `SHL-046` (I:H E:M W:4) Wire the built `NotificationCenter` into the shell. → NotificationCenter + AppManager
- [ ] `SHL-047` (I:H E:S W:4) Persistent notification archive + search. → UnifiedNotificationHub
- [ ] `SHL-048` (I:M E:S W:4) Raise/scale MAX_VISIBLE intelligently (priority-based). → NotificationBanners.tsx
- [ ] `SHL-049` (I:M E:S W:4) Per-source notification settings (mute/group). → NotificationCenter
- [ ] `SHL-050` (I:M E:S W:4) Do-Not-Disturb / focus mode. → NotificationCenter
- [ ] `SHL-051` (I:M E:S W:4) Actionable notifications (buttons route to app). → NotificationBanners.tsx
- [ ] `SHL-052` (I:L E:S W:4) Notification grouping by source/time (partial today). → NotificationBanners.tsx
- [ ] `SHL-053` (I:L E:S W:4) Fade-on-dismiss + swipe polish. → NotificationBanners.tsx
- [ ] `SHL-054` (I:L E:S W:4) Sound policy per priority (SpatialAudio). → SpatialAudio
- [ ] `SHL-055` (I:L E:S W:4) Unread badge in top bar. → top bar
- [ ] `SHL-056` (I:L E:S W:4) Snooze a notification. → NotificationCenter
- [ ] `SHL-057` (I:L E:S W:4) Rich media in notifications (thumbnail). → NotificationBanners.tsx
- [ ] `SHL-058` (I:L E:S W:4) Reduced-motion notification entrance. → comfortPrefs
- [ ] `SHL-059` (I:L E:S W:4) Notification history retention policy. → UnifiedNotificationHub
- [ ] `SHL-060` (I:L E:S W:4) Coalesce duplicate notifications (5s window today — tune). → NotificationBanners.tsx
- [ ] `SHL-061` (I:L E:S W:4) Per-app notification permission. → uki/permissions.ts
- [ ] `SHL-062` (I:L E:S W:4) Accessibility: notifications announced to SR. → NotificationBanners.tsx
- [ ] `SHL-063` (I:L E:S W:4) Notification center keyboard navigation. → NotificationCenter

### E. Settings
- [ ] `SHL-064` (I:M E:M W:4) Search within Settings (4766 LOC needs find). → Settings app
- [ ] `SHL-065` (I:M E:S W:4) Settings categories restructure for discoverability. → Settings app
- [ ] `SHL-066` (I:M E:S W:1) Surface autosave interval (currently hardcoded 30s). → useAutoSave.ts + Settings
- [ ] `SHL-067` (I:M E:S W:4) Surface dock auto-hide delay. → Settings + StageManager
- [ ] `SHL-068` (I:M E:S W:3) AI provider/key management section. → Settings app
- [ ] `SHL-069` (I:M E:S W:4) Comfort/accessibility section (comfortPrefs). → Settings + comfortPrefs
- [ ] `SHL-070` (I:M E:S W:4) Glass/transparency/blur controls (shellPreferencesStore). → Settings + glassMenu
- [ ] `SHL-071` (I:L E:S W:4) Theme: light/dark/auto + accent system. → design-system.css
- [ ] `SHL-072` (I:L E:S W:4) Wallpaper-driven accent toggle. → wallpaper system
- [ ] `SHL-073` (I:L E:S W:4) Perf-tier override + explanation. → TierManager
- [ ] `SHL-074` (I:L E:S W:4) Privacy dashboard (permissions overview). → uki/permissions.ts
- [ ] `SHL-075` (I:L E:S W:4) Backup/restore settings. → Settings app
- [ ] `SHL-076` (I:L E:S W:4) Reset-to-defaults per section. → Settings app
- [ ] `SHL-077` (I:L E:S W:4) Keyboard shortcut editor (ShortcutManager). → keyboardShortcuts.ts
- [ ] `SHL-078` (I:L E:S W:4) Startup apps configuration. → Settings app

### F. Top bar & Control Center
- [ ] `SHL-079` (I:M E:M W:4) Control Center (glass surface) for quick toggles. → new shell component
- [ ] `SHL-080` (I:M E:S W:4) Time/date glass widget consistency. → top bar
- [ ] `SHL-081` (I:M E:S W:4) System status (battery/network/perf) from dex-native. → power.rs/system.rs
- [ ] `SHL-082` (I:L E:S W:4) Quick volume/brightness sliders. → Control Center
- [ ] `SHL-083` (I:L E:S W:4) Quick DND / focus toggle. → NotificationCenter
- [ ] `SHL-084` (I:L E:S W:4) Quick glass-mode toggle. → glassMenu
- [ ] `SHL-085` (I:L E:S W:4) Now-playing media control (Audio app). → Audio app
- [ ] `SHL-086` (I:L E:S W:4) Active-project chip in top bar. → ContextBus
- [ ] `SHL-087` (I:L E:S W:4) Thermal/perf indicator when hot. → ThermalAdaptiveMonitor
- [ ] `SHL-088` (I:L E:S W:4) Top-bar menu consistency (glass tokens). → glassMenu
- [ ] `SHL-089` (I:L E:S W:4) Calendar peek from time widget. → Calendar
- [ ] `SHL-090` (I:L E:S W:4) Search entrypoint in top bar. → SearchOrchestrator

### G. Global shortcuts & gestures
- [ ] `SHL-091` (I:H E:M W:4) Central shortcut registry as source of truth (ShortcutManager). → keyboardShortcuts.ts
- [ ] `SHL-092` (I:H E:S W:4) Conflict detection enabled (capability exists, unused). → keyboardShortcuts.ts
- [ ] `SHL-093` (I:M E:S W:4) User-rebindable global shortcuts. → keyboardShortcuts.ts
- [ ] `SHL-094` (I:M E:S W:4) Shortcut cheat-sheet overlay (?). → new overlay
- [ ] `SHL-095` (I:L E:S W:4) Per-app shortcut scoping. → keyboardShortcuts.ts
- [ ] `SHL-096` (I:L E:S W:4) Edge gestures config (GestureEngine). → GestureEngine
- [ ] `SHL-097` (I:L E:S W:4) Trackpad gesture support. → GestureEngine
- [ ] `SHL-098` (I:L E:S W:4) Chord shortcuts. → keyboardShortcuts.ts
- [ ] `SHL-099` (I:L E:S W:4) Surface shortcuts to UKI knowledge. → uki/knowledge.ts
- [ ] `SHL-100` (I:L E:S W:4) Shortcut search in Settings. → Settings app

### H. Onboarding, first-run & shell polish
- [ ] `SHL-101` (I:M E:M W:4) Streamline onboarding (dex-welcomed + policy gates). → onboarding
- [ ] `SHL-102` (I:M E:S W:4) First-run perf-tier explanation. → TierManager + onboarding
- [ ] `SHL-103` (I:L E:S W:4) Guided tour of memory-first workflow. → onboarding
- [ ] `SHL-104` (I:L E:S W:4) Sample project for new users. → DexProject.ts
- [ ] `SHL-105` (I:L E:S W:4) Empty-shell helpful hints. → Home page
- [ ] `SHL-106` (I:L E:S W:4) Consistent context-menu surface (overlay tier). → design-system.css (.dex-surface-overlay)
- [ ] `SHL-107` (I:L E:S W:4) Consistent dialog surface + focus trap. → design-system.css
- [ ] `SHL-108` (I:L E:S W:4) Consistent toolbar surface tokens. → glassMenu (glassToolbar)
- [ ] `SHL-109` (I:L E:S W:4) Loading skeletons use --state-skeleton-*. → design-system.css
- [ ] `SHL-110` (I:L E:S W:4) Error states use --state-error-*. → design-system.css
- [ ] `SHL-111` (I:L E:S W:4) Empty states use --state-empty-*. → design-system.css
- [ ] `SHL-112` (I:L E:S W:4) Shell-wide focus-visible ring. → design-system.css
- [ ] `SHL-113` (I:L E:S W:4) Tooltip surface + timing consistency. → glassMenu (glassTooltip)
- [ ] `SHL-114` (I:L E:S W:4) Drag-and-drop visual affordances shell-wide. → AppManager.tsx
- [ ] `SHL-115` (I:L E:S W:4) Right-click anywhere → contextual actions. → AppManager.tsx
- [ ] `SHL-116` (I:L E:S W:4) Shell sound design pass (subtle, optional). → SpatialAudio
- [ ] `SHL-117` (I:L E:S W:4) Consistent chip/badge styling (--pg-shadow-chip). → design-system.css
- [ ] `SHL-118` (I:L E:S W:4) High-contrast theme verification shell-wide. → comfortPrefs
- [ ] `SHL-119` (I:L E:S W:4) RTL layout readiness audit. → design-system.css
- [ ] `SHL-120` (I:L E:S W:4) Shell-level integration tests (smoke). → tests/integration

---

## 5 · Search (`SCH`) — target 55

**Audit:** `shared/search/SearchOrchestrator.ts` is a mature facade; `services/searchProviders.ts`
registers apps/workflows/assets/commands and `createUnifiedSearch()` exists — but nothing in the shell
consumes it (only `operator.searchEnvironment`). `services/UnifiedSearchService.ts` duplicates the
orchestrator. Each app self-searches. Native `dex-core/fts.rs` (tantivy) is unused for app content.

### A. Consolidation
- [ ] `SCH-001` (I:H E:M W:2) Make SearchOrchestrator the one search facade; deprecate UnifiedSearchService. → UnifiedSearchService.ts
- [ ] `SCH-002` (I:H E:M W:2) Wire `createUnifiedSearch()` into Spotlight/CommandPalette. → searchProviders.ts + SpotlightSearch.tsx
- [ ] `SCH-003` (I:M E:S W:2) Single result-action dispatcher (open app/file/run command). → searchProviders.ts (payload)
- [ ] `SCH-004` (I:M E:S W:2) Provider weights tuned (apps>commands>assets). → searchProviders.ts
- [ ] `SCH-005` (I:M E:S W:2) Provider timeout + abort honored everywhere. → SearchOrchestrator.ts
- [ ] `SCH-006` (I:L E:S W:2) De-dup by kind:id (already in blend) — verify cross-provider. → SearchOrchestrator.ts
- [ ] `SCH-007` (I:L E:S W:2) Correlation IDs for tracing slow queries. → SearchOrchestrator.ts
- [ ] `SCH-008` (I:L E:S W:2) Search provider unit tests for each source. → tests/unit/search-providers.test.ts
- [ ] `SCH-009` (I:L E:S W:2) Document the provider contract for plugins. → docs
- [ ] `SCH-010` (I:M E:S W:2) Plugin-contributed search providers (PluginSystem DEX_SEARCH). → PluginSystem.ts
- [ ] `SCH-011` (I:L E:S W:2) Settings-search provider (SHL-064 integration). → Settings app
- [ ] `SCH-012` (I:L E:S W:2) Web-search provider (opt-in, free API). → freeApis.ts

### B. Content providers & per-app adoption
- [ ] `SCH-013` (I:H E:M W:2) Notes content provider (full-text). → Notes + fts
- [ ] `SCH-014` (I:H E:M W:2) Files content provider (name + metadata + content). → Files + fts
- [ ] `SCH-015` (I:M E:M W:2) Browser history/bookmarks provider. → Browser.tsx
- [ ] `SCH-016` (I:M E:S W:2) Tasks provider. → Tasks app
- [ ] `SCH-017` (I:M E:S W:2) Reader documents provider. → Reader app
- [ ] `SCH-018` (I:M E:S W:2) Rewind activity provider. → RewindEngine
- [ ] `SCH-019` (I:M E:S W:2) Nexus entity provider. → shared/nexus/model.ts
- [ ] `SCH-020` (I:M E:S W:2) Creative-project provider (open recent projects). → DexProject.ts
- [ ] `SCH-021` (I:L E:S W:2) UKI memory provider. → uki/index_search.ts
- [ ] `SCH-022` (I:L E:S W:2) Calendar event provider. → Calendar
- [ ] `SCH-023` (I:L E:S W:2) Per-app in-app search uses the same engine. → all apps

### C. Native indexing & performance
- [ ] `SCH-024` (I:H E:L W:5) Adopt native fts.rs (tantivy) as the content index. → dex-core/fts.rs
- [ ] `SCH-025` (I:H E:M W:5) IPC bridge for fts index/query. → main controller
- [ ] `SCH-026` (I:M E:M W:5) Incremental indexing on file/note changes. → UsageAwareFileSystem
- [ ] `SCH-027` (I:M E:M W:5) Background index build via WorkerPool. → WorkerPool.ts
- [ ] `SCH-028` (I:M E:S W:5) Sub-100ms query budget on large libraries. → fts.rs
- [ ] `SCH-029` (I:L E:M W:5) Bloom filter pre-check (dex-cpp/bloom). → dex-cpp/bloom.cpp
- [ ] `SCH-030` (I:L E:S W:5) Index size budget + compaction. → fts.rs
- [ ] `SCH-031` (I:L E:S W:5) Index health diagnostics. → fts.rs
- [ ] `SCH-032` (I:L E:M W:3) Vector index for semantic results (hybrid). → embeddings.ts
- [ ] `SCH-033` (I:L E:S W:5) Index encryption for private content. → crypto.rs
- [ ] `SCH-034` (I:L E:S W:5) Re-index on schema change. → fts.rs

### D. Search UX
- [ ] `SCH-035` (I:H E:S W:2) Grouped, ranked results UI with kind icons. → SpotlightSearch.tsx
- [ ] `SCH-036` (I:M E:S W:2) Type-ahead suggestions. → SpotlightSearch.tsx
- [ ] `SCH-037` (I:M E:S W:2) Filter chips (kind/date/app). → SpotlightSearch.tsx
- [ ] `SCH-038` (I:M E:S W:2) Result previews (note/file/page). → SpotlightSearch.tsx
- [ ] `SCH-039` (I:L E:S W:2) Recent searches + clear. → SpotlightEngine.ts
- [ ] `SCH-040` (I:L E:S W:2) Keyboard-only flow with result actions. → SpotlightSearch.tsx
- [ ] `SCH-041` (I:L E:S W:2) "No results" with suggested refinements. → SpotlightSearch.tsx
- [ ] `SCH-042` (I:L E:S W:2) Pin frequent results. → SpotlightEngine.ts
- [ ] `SCH-043` (I:L E:S W:2) Scoped search (within current app/project). → SearchOrchestrator (kinds)
- [ ] `SCH-044` (I:L E:S W:2) Natural-language query routing to intent. → intentRouter.ts
- [ ] `SCH-045` (I:L E:S W:2) Search analytics (popular queries, opt-in). → telemetry
- [ ] `SCH-046` (I:L E:S W:2) Accessibility: search announced + navigable. → SpotlightSearch.tsx
- [ ] `SCH-047` (I:L E:S W:2) Reduced-motion in result transitions. → comfortPrefs
- [ ] `SCH-048` (I:L E:S W:2) Result open in new window vs replace. → AppManager.tsx
- [ ] `SCH-049` (I:L E:S W:2) Drag a result into an app. → AppManager.tsx
- [ ] `SCH-050` (I:L E:S W:2) Quick-action row (calc/define/convert). → SearchOrchestrator
- [ ] `SCH-051` (I:L E:S W:2) Search history privacy toggle. → uki/permissions.ts
- [ ] `SCH-052` (I:L E:S W:2) Multi-select results → batch action. → SpotlightSearch.tsx
- [ ] `SCH-053` (I:L E:S W:2) Search within results (refine). → SpotlightSearch.tsx
- [ ] `SCH-054` (I:L E:S W:2) Provider attribution badges. → SpotlightSearch.tsx
- [ ] `SCH-055` (I:L E:S W:2) Explainable ranking ("why this result"). → SearchOrchestrator (timings/score)

---

## 6 · Home / Mission Control (`HOM`) — target 35

**Audit:** Home is the landing page (uses SpotlightSearch 'home' variant). The roadmap wants it to
become **Mission Control**: active projects, unfinished work, recent activity, important assets,
continuity — and to shed filler widgets.

- [ ] `HOM-001` (I:H E:M W:4) Redesign Home as Mission Control (work-first, not widgets). → Home page
- [ ] `HOM-002` (I:H E:M W:4) Active projects strip (from DexProject + ContextBus). → Home + DexProject.ts
- [ ] `HOM-003` (I:H E:M W:4) "Continue where you left off" from Rewind sessions. → timeline.ts
- [ ] `HOM-004` (I:M E:S W:4) Unfinished work surfaced (open tasks, drafts). → Tasks/Notes
- [ ] `HOM-005` (I:M E:S W:4) Recent activity feed (Rewind). → RewindEngine
- [ ] `HOM-006` (I:M E:S W:4) Important/recent assets row (AssetLibrary). → AssetLibrary.ts
- [ ] `HOM-007` (I:M E:S W:4) Quick-launch workflow templates. → workflowTemplates.ts
- [ ] `HOM-008` (I:M E:S W:4) Unified search bar prominent on Home. → searchProviders.ts
- [ ] `HOM-009` (I:L E:S W:4) Remove filler/dashboard clutter. → Home page
- [ ] `HOM-010` (I:L E:S W:4) Greeting + time-of-day context. → uki/context.ts
- [ ] `HOM-011` (I:L E:S W:4) UKI suggestions card. → operator.ts
- [ ] `HOM-012` (I:L E:S W:4) Pin favorite projects/assets to Home. → AssetLibrary/DexProject
- [ ] `HOM-013` (I:L E:S W:4) Today's calendar peek. → Calendar
- [ ] `HOM-014` (I:L E:S W:4) Focus session entrypoint (IntelligenceLayer). → IntelligenceLayer.ts
- [ ] `HOM-015` (I:L E:S W:4) Customizable section order. → Home page
- [ ] `HOM-016` (I:L E:S W:4) Per-section show/hide. → Home page
- [ ] `HOM-017` (I:L E:S W:4) Empty-state for new users (sample project). → DexProject.ts
- [ ] `HOM-018` (I:L E:S W:4) Continuity: resume last workspace one-click. → WorkspaceSnapshot
- [ ] `HOM-019` (I:L E:S W:4) Recent files quick-open. → Files
- [ ] `HOM-020` (I:L E:S W:4) Recent browser sessions. → Browser
- [ ] `HOM-021` (I:L E:S W:4) Project progress indicators. → DexProject.ts
- [ ] `HOM-022` (I:L E:S W:4) Surface system health (perf/thermal/battery). → dex-native
- [ ] `HOM-023` (I:L E:S W:4) Surface storage usage (Rewind/assets). → system.rs
- [ ] `HOM-024` (I:L E:S W:4) Keyboard navigation across cards. → Home page
- [ ] `HOM-025` (I:L E:S W:4) Reduced-motion Home transitions. → comfortPrefs
- [ ] `HOM-026` (I:L E:S W:4) Surface consistency (soft/solid tiers). → design-system.css
- [ ] `HOM-027` (I:L E:S W:4) Home density respects comfortPrefs scale. → comfortPrefs
- [ ] `HOM-028` (I:L E:S W:4) Quick-capture note/idea from Home. → Nexus idea view
- [ ] `HOM-029` (I:L E:S W:4) "Pick up project" deep-links to app set. → DexProject.ts
- [ ] `HOM-030` (I:L E:S W:4) Recently-used apps row. → runningApps store
- [ ] `HOM-031` (I:L E:S W:4) Achievements/engagement subtle surfacing. → achievementsCatalog
- [ ] `HOM-032` (I:L E:S W:4) Home loading skeletons. → design-system.css
- [ ] `HOM-033` (I:L E:S W:4) Home error/empty states. → design-system.css
- [ ] `HOM-034` (I:L E:S W:4) Home performance budget (first paint). → StartupTimeline
- [ ] `HOM-035` (I:L E:S W:4) Home integration smoke tests. → tests/integration

---

## 7 · Dock (`DOK`) — target 40

**Audit:** Dock lives in `AppManager.tsx` — full-width bottom reveal strip (8px), hover-intent gate,
macOS-Tahoe magnification, running-state dot (added), anchored-while-dragging persistence (added),
`--motion-dock-*` wiring. Remaining: magnification curve tuning + **multi-monitor (runtime-blocked)**.

- [ ] `DOK-001` (I:M E:S W:4) Tune magnification curve (subjective, eyes-on). → AppManager.tsx
- [ ] `DOK-002` (I:M E:M W:4) Multi-monitor dock awareness (needs main display info). → main process
- [ ] `DOK-003` (I:M E:S W:4) Reveal/hide via --motion-dock-reveal/hide (done — verify everywhere). → AppManager.tsx
- [ ] `DOK-004` (I:M E:S W:4) Hover-intent dwell/velocity tuning. → AppManager.tsx (beginDockIntent)
- [ ] `DOK-005` (I:M E:S W:4) Running-state indicator polish (active vs running). → AppManager.tsx
- [ ] `DOK-006` (I:L E:S W:4) Per-app badge counts (unread/notifications). → AppManager.tsx
- [ ] `DOK-007` (I:L E:S W:4) Dock auto-hide delay in Settings. → Settings + AppManager
- [ ] `DOK-008` (I:L E:S W:4) Always-visible dock option (a11y). → AppManager.tsx
- [ ] `DOK-009` (I:L E:S W:4) Dock position option (bottom/left/right). → AppManager.tsx
- [ ] `DOK-010` (I:L E:S W:4) Dock size preference. → AppManager.tsx
- [ ] `DOK-011` (I:L E:S W:4) Pin/unpin apps (useDockPins exists). → useDockPins
- [ ] `DOK-012` (I:L E:S W:4) Reorder by drag (persistence anchored — verify). → AppManager.tsx
- [ ] `DOK-013` (I:L E:S W:4) Folders/stacks in dock. → AppManager.tsx
- [ ] `DOK-014` (I:L E:S W:4) Recent apps section. → runningApps store
- [ ] `DOK-015` (I:L E:S W:4) Right-click app → app actions menu. → AppManager.tsx
- [ ] `DOK-016` (I:L E:S W:4) Drag file onto dock app to open (creative apps today). → AppManager.tsx
- [ ] `DOK-017` (I:L E:S W:4) Dock divider between pinned/running. → AppManager.tsx
- [ ] `DOK-018` (I:L E:S W:4) Bounce/attention animation for events. → UnifiedMotionSystem
- [ ] `DOK-019` (I:L E:S W:4) Minimized-window thumbnails in dock. → AppManager.tsx
- [ ] `DOK-020` (I:L E:S W:4) Dock glass surface consistency (liquidGlassDock). → glassMenu
- [ ] `DOK-021` (I:L E:S W:4) Dock perf-tier degradation review. → TierManager
- [ ] `DOK-022` (I:L E:S W:4) Dock edge-trigger reliability on corners (fixed — regression test). → AppManager.tsx
- [ ] `DOK-023` (I:L E:S W:4) Touch/pen affordance pill review. → AppManager.tsx
- [ ] `DOK-024` (I:L E:S W:4) Dock keyboard navigation. → AppManager.tsx
- [ ] `DOK-025` (I:L E:S W:4) Dock never hides while menu open. → AppManager.tsx (scheduleDockHide)
- [ ] `DOK-026` (I:L E:S W:4) Dock context menu surface (overlay tier). → design-system.css
- [ ] `DOK-027` (I:L E:S W:4) Per-workspace dock app set. → WorkspaceSnapshot
- [ ] `DOK-028` (I:L E:S W:4) Quick-settings access from dock. → Control Center
- [ ] `DOK-029` (I:L E:S W:4) Dock search shortcut. → SearchOrchestrator
- [ ] `DOK-030` (I:L E:S W:4) Trash/recents target in dock. → Files
- [ ] `DOK-031` (I:L E:S W:4) Dock app launch progress indicator. → AppManager.tsx (DOCK_LAUNCH)
- [ ] `DOK-032` (I:L E:S W:4) Lazy-retry stale-chunk recovery surfaced. → AppManager.tsx
- [ ] `DOK-033` (I:L E:S W:4) Dock magnification reduced under thermal-hot. → ThermalAdaptiveMonitor
- [ ] `DOK-034` (I:L E:S W:4) Dock zero-layout-shift indicator (absolute — verify). → AppManager.tsx
- [ ] `DOK-035` (I:L E:S W:4) Configurable click vs hover to open. → AppManager.tsx
- [ ] `DOK-036` (I:L E:S W:4) Dock reduced-motion respect. → comfortPrefs
- [ ] `DOK-037` (I:L E:S W:4) Dock accessibility labels. → AppManager.tsx
- [ ] `DOK-038` (I:L E:S W:4) Dock haptics (where supported). → platform
- [ ] `DOK-039` (I:L E:S W:4) Dock app grouping by category. → APP_DEFINITIONS
- [ ] `DOK-040` (I:L E:S W:4) Dock unit/interaction tests. → tests/unit

---

## 8 · Creative Apps (`CRT`) — target 220 · **Wave 1 anchor**

**Audit:** Vinx (`videoeditor`), Imosion (audio DAW), Prism (image), Flux (motion), Forge (encoder),
AXL (CAD), Canvas (sketch). Shared hooks today: `useAutoSave` (30s hardcoded), `useUnsavedGuard`,
`useCreativeAppSettings`, `useBeginnerMode` + `KeyboardShortcutsPanel`, `useCollaborationFeatures`,
`SendToMenu`. Gaps: inconsistent undo (Prism destructive in-place; Canvas unbounded stack; AXL no
visible undo), per-app media browsers instead of shared `AssetLibrary`, autosave not configurable,
workspace layouts not exposed.

### A. Cross-cutting consistency (the Wave-1 core)
- [ ] `CRT-001` (I:H E:M W:1) Create one bounded, memory-capped undo/redo utility for creative apps. → new shared/creative/history.ts
- [ ] `CRT-002` (I:H E:M W:1) Adopt the shared history in Prism (replace destructive applyAdjustmentToImageData). → prism/Prism.tsx
- [ ] `CRT-003` (I:H E:M W:1) Adopt the shared history in Canvas (cap unbounded undoStack). → standalone/Canvas.tsx
- [ ] `CRT-004` (I:H E:M W:1) Add visible undo/redo to AXL. → axl/Axl.tsx
- [ ] `CRT-005` (I:H E:M W:1) Adopt shared history in Vinx timeline. → vinx/Vinx.tsx
- [ ] `CRT-006` (I:H E:M W:1) Adopt shared history in Imosion. → imosion/Imosion.tsx
- [ ] `CRT-007` (I:H E:M W:1) Adopt shared history in Flux keyframes. → flux/Flux.tsx
- [ ] `CRT-008` (I:H E:S W:1) Consistent undo/redo keyboard shortcuts across apps. → keyboardShortcuts.ts
- [ ] `CRT-009` (I:H E:S W:1) Undo history depth tied to perf tier (TierManager undo depth). → TierManager.ts
- [ ] `CRT-010` (I:H E:M W:1) Shared asset-browser panel backed by AssetLibrary. → new shared/creative/AssetBrowser.tsx
- [ ] `CRT-011` (I:H E:M W:1) Adopt shared asset browser in Vinx (replace MediaBrowser). → vinx/MediaBrowser.tsx
- [ ] `CRT-012` (I:H E:M W:1) Adopt shared asset browser in Prism. → prism/Prism.tsx
- [ ] `CRT-013` (I:H E:M W:1) Adopt shared asset browser in Imosion. → imosion/Imosion.tsx
- [ ] `CRT-014` (I:H E:M W:1) Adopt shared asset browser in Flux. → flux/Flux.tsx
- [ ] `CRT-015` (I:M E:M W:1) Adopt shared asset browser in Forge (watch-folder sources). → forge/Forge.tsx
- [ ] `CRT-016` (I:H E:M W:1) Asset dedup (hash) to stop project bloat. → AssetLibrary.ts
- [ ] `CRT-017` (I:M E:M W:1) Asset versioning. → AssetLibrary.ts
- [ ] `CRT-018` (I:M E:S W:1) Asset tagging + search across apps. → AssetLibrary.search
- [ ] `CRT-019` (I:H E:S W:1) Make autosave interval configurable (Settings). → useAutoSave.ts
- [ ] `CRT-020` (I:H E:S W:1) Uniform recovery banner component across apps. → new shared/creative/RecoveryBanner.tsx
- [ ] `CRT-021` (I:H E:M W:1) Verify every creative app registers with WorkspaceSnapshot. → WorkspaceSnapshot.ts
- [ ] `CRT-022` (I:M E:S W:1) Configurable version-snapshot interval (5min hardcoded). → useAutoSave.ts
- [ ] `CRT-023` (I:H E:M W:1) Register all creative-app shortcuts in central ShortcutManager. → keyboardShortcuts.ts
- [ ] `CRT-024` (I:M E:S W:1) Surface creative-app shortcuts to UKI knowledge. → uki/knowledge.ts
- [ ] `CRT-025` (I:M E:M W:1) Per-app named workspace layouts via WorkspaceSnapshot. → WorkspaceSnapshot.ts
- [ ] `CRT-026` (I:M E:S W:1) Consistent cross-app project model (.dexproject). → DexProject.ts
- [ ] `CRT-027` (I:M E:S W:1) SendToMenu coverage audit across all creative apps. → SendToMenu.tsx
- [ ] `CRT-028` (I:M E:S W:1) Consistent toolbar density + surface tokens. → glassMenu (glassToolbar)
- [ ] `CRT-029` (I:M E:S W:1) Consistent panel layout patterns (inspector/browser). → design-system.css
- [ ] `CRT-030` (I:L E:S W:1) Consistent beginner-mode behavior (useBeginnerMode). → useBeginnerMode
- [ ] `CRT-031` (I:L E:S W:1) Consistent keyboard-shortcuts panel. → KeyboardShortcutsPanel
- [ ] `CRT-032` (I:L E:S W:1) Consistent collaboration checkpoints (useCollaborationFeatures). → useCollaborationFeatures
- [ ] `CRT-033` (I:M E:S W:1) Consistent export dialog UX. → shared/creative
- [ ] `CRT-034` (I:M E:M W:1) Crash recovery integration for in-progress edits. → CrashRecoverySystem
- [ ] `CRT-035` (I:M E:S W:1) Creative-app integration tests for save/recover/undo. → tests/integration

### B. Vinx (video editor — `videoeditor`)
- [ ] `CRT-036` (I:M E:M W:1) Document + bound timeline undo depth. → vinx/Vinx.tsx
- [ ] `CRT-037` (I:M E:M W:1) Project recovery UI wired to real recovery mechanism. → vinx/Vinx.tsx
- [ ] `CRT-038` (I:M E:M W:1) In-app asset library browser (shared). → vinx/MediaBrowser.tsx
- [ ] `CRT-039` (I:M E:S W:4) Viewer playback metrics (dropped frames, cache). → vinx/Vinx.tsx
- [ ] `CRT-040` (I:M E:M W:5) Offload frame-diff motion track to native (video.rs). → dex-native kernel/video.rs
- [ ] `CRT-041` (I:L E:S W:4) Timeline magnetic snapping. → vinx/Vinx.tsx
- [ ] `CRT-042` (I:L E:S W:4) Ripple/roll/slip/slide trim tools. → vinx/Vinx.tsx
- [ ] `CRT-043` (I:L E:S W:4) Multicam sync polish. → vinx multicam panel
- [ ] `CRT-044` (I:L E:S W:4) Waveform display on audio clips. → vinx/Vinx.tsx
- [ ] `CRT-045` (I:L E:S W:4) Keyframeable clip effects. → vinx/Vinx.tsx
- [ ] `CRT-046` (I:L E:S W:4) Marker + chapter support. → vinx/Vinx.tsx
- [ ] `CRT-047` (I:L E:S W:4) Proxy/optimized media workflow. → vinx + Forge
- [ ] `CRT-048` (I:L E:S W:4) Export presets via Forge integration. → forge/Forge.tsx
- [ ] `CRT-049` (I:L E:S W:4) Title/text tool. → vinx/Vinx.tsx
- [ ] `CRT-050` (I:L E:S W:4) Transition library. → vinx/Vinx.tsx
- [ ] `CRT-051` (I:L E:S W:4) Audio ducking automation. → vinx/Vinx.tsx
- [ ] `CRT-052` (I:L E:S W:4) Color grading panel. → vinx/Vinx.tsx
- [ ] `CRT-053` (I:L E:S W:4) Speed ramp / time remap. → vinx/Vinx.tsx
- [ ] `CRT-054` (I:L E:S W:4) Timeline zoom + scrub precision. → vinx/Vinx.tsx
- [ ] `CRT-055` (I:L E:S W:4) Snapshot frame to Prism. → SendToMenu.tsx
- [ ] `CRT-056` (I:L E:S W:4) J/K/L playback shortcuts. → keyboardShortcuts.ts
- [ ] `CRT-057` (I:L E:S W:4) Render queue + background export. → WorkerPool
- [ ] `CRT-058` (I:L E:S W:4) Auto-save scratch on crash. → CrashRecoverySystem
- [ ] `CRT-059` (I:L E:S W:4) Timeline accessibility (keyboard editing). → vinx/Vinx.tsx
- [ ] `CRT-060` (I:L E:S W:4) Reduced-motion in viewer/timeline. → comfortPrefs
- [ ] `CRT-061` (I:L E:S W:4) Project template presets. → workflowTemplates.ts
- [ ] `CRT-062` (I:L E:S W:4) Nested sequences. → vinx/Vinx.tsx
- [ ] `CRT-063` (I:L E:S W:4) Frame-accurate export verification. → forge
- [ ] `CRT-064` (I:L E:S W:4) GPU encoder selection (Forge GPU_ENCODERS). → forge/Forge.tsx
- [ ] `CRT-065` (I:L E:S W:4) Vinx perf-tier preview resolution scaling. → AdaptiveRenderingEngine

### C. Imosion (audio DAW)
- [ ] `CRT-066` (I:M E:M W:1) Bound + expose undo depth. → imosion/Imosion.tsx
- [ ] `CRT-067` (I:M E:M W:1) Shared asset browser for samples/loops. → shared AssetBrowser
- [ ] `CRT-068` (I:M E:M W:4) Plugin library browser (TrackPlugin exists, no UI). → imosion/Imosion.tsx
- [ ] `CRT-069` (I:M E:M W:4) MIDI piano roll editor. → imosion/Imosion.tsx
- [ ] `CRT-070` (I:M E:S W:4) Mixer view (10+ tracks supported, no UI). → imosion/Imosion.tsx
- [ ] `CRT-071` (I:L E:S W:4) Automation lane editing polish. → imosion/Imosion.tsx
- [ ] `CRT-072` (I:L E:M W:5) Offload DSP to native dsp.rs. → dex-native kernel/dsp.rs
- [ ] `CRT-073` (I:L E:S W:4) Time-stretch/pitch quality modes (warp). → imosion/Imosion.tsx
- [ ] `CRT-074` (I:L E:S W:4) Key/tempo detection surfacing. → imosion/Imosion.tsx
- [ ] `CRT-075` (I:L E:S W:4) Metronome + count-in polish. → imosion/Imosion.tsx
- [ ] `CRT-076` (I:L E:S W:4) Bus/send routing UI clarity. → imosion/Imosion.tsx
- [ ] `CRT-077` (I:L E:S W:4) Export formats beyond AIFF (WAV/MP3/FLAC via native). → audio_processing.rs
- [ ] `CRT-078` (I:L E:S W:4) Clip fade/cross-fade handles. → imosion/Imosion.tsx
- [ ] `CRT-079` (I:L E:S W:4) Sample-level zoom editing. → imosion/Imosion.tsx
- [ ] `CRT-080` (I:L E:S W:4) Track freeze/bounce. → imosion/Imosion.tsx
- [ ] `CRT-081` (I:L E:S W:4) Loop browser with preview. → shared AssetBrowser
- [ ] `CRT-082` (I:L E:S W:4) Record arm + input monitoring. → imosion/Imosion.tsx
- [ ] `CRT-083` (I:L E:S W:4) Decoded-buffer FIFO cap review (leak guard exists). → imosion/Imosion.tsx
- [ ] `CRT-084` (I:L E:S W:4) Latency compensation. → imosion/Imosion.tsx
- [ ] `CRT-085` (I:L E:S W:4) Master metering + loudness (LUFS). → imosion/Imosion.tsx
- [ ] `CRT-086` (I:L E:S W:4) Project templates (song/podcast). → workflowTemplates.ts
- [ ] `CRT-087` (I:L E:S W:4) Send stem to Vinx. → SendToMenu.tsx
- [ ] `CRT-088` (I:L E:S W:4) Keyboard-driven editing shortcuts. → keyboardShortcuts.ts
- [ ] `CRT-089` (I:L E:S W:4) Reduced-motion meters option. → comfortPrefs
- [ ] `CRT-090` (I:L E:S W:4) Accessibility for transport/controls. → imosion/Imosion.tsx
- [ ] `CRT-091` (I:L E:S W:4) Snapshot mix versions. → shared history
- [ ] `CRT-092` (I:L E:S W:4) Per-track color/labels. → imosion/Imosion.tsx
- [ ] `CRT-093` (I:L E:S W:4) Quantize + groove. → imosion/Imosion.tsx
- [ ] `CRT-094` (I:L E:S W:4) Plugin parameter automation polish. → imosion/Imosion.tsx
- [ ] `CRT-095` (I:L E:S W:4) Imosion perf-tier voice/track caps. → TierManager

### D. Prism (image editor)
- [ ] `CRT-096` (I:H E:M W:1) Non-destructive adjustment layers (replace in-place edits). → prism/Prism.tsx
- [ ] `CRT-097` (I:M E:S W:1) Bound undo memory for large canvases. → shared history
- [ ] `CRT-098` (I:M E:S W:4) Layer group UI (type:'group' exists, no UI). → prism/Prism.tsx
- [ ] `CRT-099` (I:M E:S W:4) Smart-object / linked-layer concept. → prism/Prism.tsx
- [ ] `CRT-100` (I:M E:S W:4) Text-layer rendering exposed. → prism/Prism.tsx
- [ ] `CRT-101` (I:L E:M W:5) Offload content-aware fill (patchMatchFill) to native. → dex-cpp/matrix.cpp
- [ ] `CRT-102` (I:L E:S W:4) Adjustment presets manager. → prism/Prism.tsx
- [ ] `CRT-103` (I:L E:S W:4) Curves/LUT editor polish. → prism/Prism.tsx
- [ ] `CRT-104` (I:L E:S W:4) Selection refine (feather/grow/shrink). → prism/Prism.tsx
- [ ] `CRT-105` (I:L E:S W:4) Clone/heal brush quality. → prism/Prism.tsx
- [ ] `CRT-106` (I:L E:S W:4) Blend-mode preview. → prism/Prism.tsx
- [ ] `CRT-107` (I:L E:S W:4) Histogram live update. → prism/Prism.tsx
- [ ] `CRT-108` (I:L E:S W:4) Export color-profile awareness. → prism/Prism.tsx
- [ ] `CRT-109` (I:L E:M W:5) Native image codecs (image_processing.rs) for export. → dex-native
- [ ] `CRT-110` (I:L E:S W:4) ImageData pooling to cut Canvas-2D allocation. → prism/Prism.tsx
- [ ] `CRT-111` (I:L E:S W:4) Brush engine pressure/tilt. → prism/Prism.tsx
- [ ] `CRT-112` (I:L E:S W:4) Vector pen path editing polish. → prism/Prism.tsx
- [ ] `CRT-113` (I:L E:S W:4) Transform with smart guides. → prism/Prism.tsx
- [ ] `CRT-114` (I:L E:S W:4) Layer masks UI clarity. → prism/Prism.tsx
- [ ] `CRT-115` (I:L E:S W:4) Send layer to Flux. → SendToMenu.tsx
- [ ] `CRT-116` (I:L E:S W:4) Document templates / canvas presets. → prism/Prism.tsx
- [ ] `CRT-117` (I:L E:S W:4) Snapshot/version history panel. → shared history
- [ ] `CRT-118` (I:L E:S W:4) Keyboard tool shortcuts standardized. → keyboardShortcuts.ts
- [ ] `CRT-119` (I:L E:S W:4) Reduced-motion in tool feedback. → comfortPrefs
- [ ] `CRT-120` (I:L E:S W:4) Accessibility (tool labels, focus). → prism/Prism.tsx
- [ ] `CRT-121` (I:L E:S W:4) Large-image tiling for performance. → prism/Prism.tsx
- [ ] `CRT-122` (I:L E:S W:4) GPU-accelerated filters where available. → AdaptiveRenderingEngine
- [ ] `CRT-123` (I:L E:S W:4) Export size/quality preview. → prism/Prism.tsx
- [ ] `CRT-124` (I:L E:S W:4) Batch export. → forge/Forge.tsx
- [ ] `CRT-125` (I:L E:S W:4) Prism perf-tier canvas-size caps. → TierManager

### E. Flux (motion graphics)
- [ ] `CRT-126` (I:H E:M W:1) Adopt shared bounded keyframe undo. → flux/Flux.tsx
- [ ] `CRT-127` (I:M E:M W:4) Precomp / nested composition. → flux/Flux.tsx
- [ ] `CRT-128` (I:M E:S W:4) Effect-chain UI (filters referenced, no chain). → flux/Flux.tsx
- [ ] `CRT-129` (I:M E:M W:4) Expression language documented + editor. → flux EXPRESSION_TEMPLATES
- [ ] `CRT-130` (I:M E:S W:4) 3D viewport/camera controls. → flux/Flux.tsx
- [ ] `CRT-131` (I:L E:S W:4) Behavior system exposed in UI. → flux/Flux.tsx
- [ ] `CRT-132` (I:L E:S W:4) Easing curve editor polish (EasingCurveEditor). → flux/EasingCurveEditor.tsx
- [ ] `CRT-133` (I:L E:S W:4) Particle emitter presets. → flux/Flux.tsx
- [ ] `CRT-134` (I:L E:S W:4) Mask feather + animation polish. → flux/Flux.tsx
- [ ] `CRT-135` (I:L E:S W:4) Path morphing UI (morphPaths). → flux/Flux.tsx
- [ ] `CRT-136` (I:L E:M W:5) Offload particle sim to native physics.rs. → dex-core/physics.rs
- [ ] `CRT-137` (I:L E:S W:4) Layer parenting/null objects. → flux/Flux.tsx
- [ ] `CRT-138` (I:L E:S W:4) Composition presets. → flux/Flux.tsx
- [ ] `CRT-139` (I:L E:S W:4) Motion-blur toggle. → flux/Flux.tsx
- [ ] `CRT-140` (I:L E:S W:4) Render preview RAM cache. → flux/Flux.tsx
- [ ] `CRT-141` (I:L E:S W:4) Export via Forge presets. → forge/Forge.tsx
- [ ] `CRT-142` (I:L E:S W:4) Import Prism layers as comp layers. → SendToMenu.tsx
- [ ] `CRT-143` (I:L E:S W:4) Keyframe interpolation handles. → flux/Flux.tsx
- [ ] `CRT-144` (I:L E:S W:4) Timeline + graph editor sync. → flux/Flux.tsx
- [ ] `CRT-145` (I:L E:S W:4) Shape tools + boolean ops. → flux/Flux.tsx
- [ ] `CRT-146` (I:L E:S W:4) Text animators. → flux/Flux.tsx
- [ ] `CRT-147` (I:L E:S W:4) Reduced-motion editor option. → comfortPrefs
- [ ] `CRT-148` (I:L E:S W:4) Accessibility for timeline/graph. → flux/Flux.tsx
- [ ] `CRT-149` (I:L E:S W:4) Project templates (lower-third, intro). → workflowTemplates.ts
- [ ] `CRT-150` (I:L E:S W:4) Snapshot versions. → shared history
- [ ] `CRT-151` (I:L E:S W:4) GPU compositing where available. → AdaptiveRenderingEngine
- [ ] `CRT-152` (I:L E:S W:4) Flux perf-tier particle caps. → TierManager
- [ ] `CRT-153` (I:L E:S W:4) Render-on-background-worker. → WorkerPool

### F. Forge (media encoder)
- [ ] `CRT-154` (I:M E:M W:4) Real encode engine wiring (Job tracks state; IPC delegate). → forge/Forge.tsx
- [ ] `CRT-155` (I:M E:S W:4) Codec parameter UI (bitrate/profile, not just string). → forge/Forge.tsx
- [ ] `CRT-156` (I:M E:S W:4) Watch-folder monitor UI (types exist, no UI). → forge/Forge.tsx
- [ ] `CRT-157` (I:M E:S W:4) Custom preset creation UI. → forge VIDEO/AUDIO/IMAGE_PRESETS
- [ ] `CRT-158` (I:L E:S W:4) Job grouping (flat queue today). → forge/Forge.tsx
- [ ] `CRT-159` (I:L E:S W:4) GPU encoder detection surfacing (detectGPUCapabilities). → forge/Forge.tsx
- [ ] `CRT-160` (I:L E:S W:4) Two-pass toggle clarity. → forge/Forge.tsx
- [ ] `CRT-161` (I:L E:S W:4) Output naming tokens UI (NAMING_TOKENS). → forge/Forge.tsx
- [ ] `CRT-162` (I:L E:S W:4) Size/time prediction accuracy. → forge/Forge.tsx
- [ ] `CRT-163` (I:L E:S W:4) Pause/resume/retry per job. → forge/Forge.tsx
- [ ] `CRT-164` (I:L E:S W:4) Queue persistence across restart. → WorkspaceSnapshot
- [ ] `CRT-165` (I:L E:M W:5) Native codec acceleration (audio/image native). → dex-native
- [ ] `CRT-166` (I:L E:S W:4) Drag files/assets into queue (shared browser). → shared AssetBrowser
- [ ] `CRT-167` (I:L E:S W:4) Notification on job completion. → NotificationCenter
- [ ] `CRT-168` (I:L E:S W:4) Concurrency limit tied to resourceGovernor. → resourceGovernor.ts
- [ ] `CRT-169` (I:L E:S W:4) Error surfacing + logs per job. → forge/Forge.tsx
- [ ] `CRT-170` (I:L E:S W:4) Preset import/export. → forge/Forge.tsx
- [ ] `CRT-171` (I:L E:S W:4) Forge ↔ Vinx export handoff. → SendToMenu.tsx
- [ ] `CRT-172` (I:L E:S W:4) Throttle under thermal-hot. → ThermalAdaptiveMonitor
- [ ] `CRT-173` (I:L E:S W:4) Accessibility for queue table. → forge/Forge.tsx
- [ ] `CRT-174` (I:L E:S W:4) Batch from a folder (recursive). → forge/Forge.tsx
- [ ] `CRT-175` (I:L E:S W:4) Forge unit tests for estimation math. → tests/unit

### G. AXL (engineering CAD)
- [ ] `CRT-176` (I:H E:M W:1) Add undo/redo (no visible history today). → axl/Axl.tsx
- [ ] `CRT-177` (I:M E:L W:4) True 3D viewport (currently isometric 2D AXLRenderer). → axl/Axl.tsx
- [ ] `CRT-178` (I:M E:M W:4) Parametric history / feature tree editing. → axl/Axl.tsx
- [ ] `CRT-179` (I:M E:M W:4) Drawing/blueprint export (PDF/DWG/STEP). → axl/Axl.tsx
- [ ] `CRT-180` (I:L E:M W:5) Mesh ops via C solid kernel (axl_solid.c). → native/src/c/axl_solid.c
- [ ] `CRT-181` (I:L E:S W:4) Assembly motion/animation simulation. → axl/Axl.tsx
- [ ] `CRT-182` (I:L E:S W:4) Constraint solver feedback UI. → axl/Axl.tsx
- [ ] `CRT-183` (I:L E:S W:4) Standard-parts library search (STD_PARTS_LIBRARY). → axl/Axl.tsx
- [ ] `CRT-184` (I:L E:S W:4) Material DB surfacing (MATERIAL_DB). → axl/Axl.tsx
- [ ] `CRT-185` (I:L E:M W:5) FEA solve offloaded to native/WorkerPool. → WorkerPool
- [ ] `CRT-186` (I:L E:S W:4) Stress visualization polish (von Mises). → axl/Axl.tsx
- [ ] `CRT-187` (I:L E:S W:4) GDT annotation UX. → axl/Axl.tsx
- [ ] `CRT-188` (I:L E:S W:4) Manufacturing prep (CNC/3D-print export). → axl/Axl.tsx
- [ ] `CRT-189` (I:L E:S W:4) AI material/design recommendations surfacing. → axl/Axl.tsx
- [ ] `CRT-190` (I:L E:S W:4) Sketch constraints UI. → axl/Axl.tsx
- [ ] `CRT-191` (I:L E:S W:4) Measurement tools. → axl/Axl.tsx
- [ ] `CRT-192` (I:L E:S W:4) Section views. → axl/Axl.tsx
- [ ] `CRT-193` (I:L E:S W:4) Snapshot versions of a model. → shared history
- [ ] `CRT-194` (I:L E:S W:4) Keyboard modeling shortcuts. → keyboardShortcuts.ts
- [ ] `CRT-195` (I:L E:S W:4) Accessibility for modeling tools. → axl/Axl.tsx
- [ ] `CRT-196` (I:L E:S W:4) Import standard CAD formats. → axl/Axl.tsx
- [ ] `CRT-197` (I:L E:S W:4) Weight/center-of-mass display. → axl/Axl.tsx
- [ ] `CRT-198` (I:L E:S W:4) Pattern/array tools polish. → axl/Axl.tsx
- [ ] `CRT-199` (I:L E:S W:4) Perf-tier model complexity caps. → TierManager
- [ ] `CRT-200` (I:L E:S W:4) AXL geometry unit tests. → tests/unit

### H. Canvas (sketch)
- [ ] `CRT-201` (I:H E:S W:1) Cap unbounded undoStack (memory ceiling risk). → standalone/Canvas.tsx
- [ ] `CRT-202` (I:M E:S W:1) Adopt shared history utility. → standalone/Canvas.tsx
- [ ] `CRT-203` (I:M E:S W:1) Add Send-To integration (incomplete). → SendToMenu.tsx
- [ ] `CRT-204` (I:M E:S W:4) Layers support. → standalone/Canvas.tsx
- [ ] `CRT-205` (I:M E:S W:4) Shape/line tools beyond freehand. → standalone/Canvas.tsx
- [ ] `CRT-206` (I:L E:S W:4) Text tool. → standalone/Canvas.tsx
- [ ] `CRT-207` (I:L E:S W:4) Transform/rotate. → standalone/Canvas.tsx
- [ ] `CRT-208` (I:L E:S W:4) Vector path + SVG export. → standalone/Canvas.tsx
- [ ] `CRT-209` (I:L E:S W:4) Color palette + custom swatches. → standalone/Canvas.tsx
- [ ] `CRT-210` (I:L E:S W:4) Brush pressure (pen). → standalone/Canvas.tsx
- [ ] `CRT-211` (I:L E:S W:4) Asset browser (shared). → shared AssetBrowser
- [ ] `CRT-212` (I:L E:S W:4) Autosave + recovery (shared). → useAutoSave.ts
- [ ] `CRT-213` (I:L E:S W:4) Export formats beyond PNG. → standalone/Canvas.tsx
- [ ] `CRT-214` (I:L E:S W:4) Infinite canvas / pan-zoom. → standalone/Canvas.tsx
- [ ] `CRT-215` (I:L E:S W:4) Grid/guides. → standalone/Canvas.tsx
- [ ] `CRT-216` (I:L E:S W:4) Keyboard tool shortcuts. → keyboardShortcuts.ts
- [ ] `CRT-217` (I:L E:S W:4) Reduced-motion stroke preview. → comfortPrefs
- [ ] `CRT-218` (I:L E:S W:4) Accessibility (tool labels). → standalone/Canvas.tsx
- [ ] `CRT-219` (I:L E:S W:4) Send sketch to Prism for finishing. → SendToMenu.tsx
- [ ] `CRT-220` (I:L E:S W:4) Canvas templates. → workflowTemplates.ts

---

## 9 · Shared Services (`SVC`) — target 80

**Audit:** Strong foundations — `ContextBus` (pub/sub, used widely), `AssetLibrary`,
`WorkspaceSnapshot`, `undoManager.ts`, `IntelligenceLayer`, `ContextIntelligenceService`. Gaps: **no
Sync layer**; `UnifiedSearchService` duplicates `SearchOrchestrator`; `SystemUndoManager`,
`TrustworthySearch`, `UsageAwareFileSystem` are aspirational stubs; memory model in `shared/uki` not
deeply wired to the renderer.

### A. Asset Engine
- [ ] `SVC-001` (I:H E:M W:1) Promote AssetLibrary to the single asset engine for all apps. → AssetLibrary.ts
- [ ] `SVC-002` (I:H E:M W:1) Asset persistence backend (sqlite via database.rs). → dex-core/database.rs
- [ ] `SVC-003` (I:M E:S W:1) Asset thumbnail generation + cache. → AssetLibrary.ts
- [ ] `SVC-004` (I:M E:S W:1) Asset metadata schema (kind, tags, source, project). → AssetLibrary.ts
- [ ] `SVC-005` (I:M E:S W:1) Asset events on ContextBus (assetFocus broadened — done). → ContextBus.ts
- [ ] `SVC-006` (I:M E:S W:1) Asset dedup by content hash. → AssetLibrary.ts
- [ ] `SVC-007` (I:L E:S W:1) Asset garbage collection (unreferenced). → AssetLibrary.ts
- [ ] `SVC-008` (I:L E:S W:1) Asset import pipeline (drag/drop, file picker). → AssetLibrary.ts
- [ ] `SVC-009` (I:L E:S W:2) Asset usage analytics (most reused). → AssetLibrary.ts
- [ ] `SVC-010` (I:L E:S W:2) Asset linking across projects. → ContextBus

### B. History / Undo Engine
- [ ] `SVC-011` (I:H E:M W:1) Define a shared bounded history engine (creative + system). → undoManager.ts
- [ ] `SVC-012` (I:H E:M W:3) Implement SystemUndoManager (currently stub). → main/core/SystemUndoManager.ts
- [ ] `SVC-013` (I:M E:S W:1) Memory-capped command stacks. → undoManager.ts
- [ ] `SVC-014` (I:M E:S W:1) Coalesce rapid edits into one undo step. → undoManager.ts
- [ ] `SVC-015` (I:M E:S W:3) Cross-app undo for UKI/tool actions. → SystemUndoManager.ts
- [ ] `SVC-016` (I:L E:S W:1) Undo grouping/labels for UI. → undoManager.ts
- [ ] `SVC-017` (I:L E:S W:1) Redo invalidation rules. → undoManager.ts
- [ ] `SVC-018` (I:L E:S W:2) Persist undo across crash where safe. → CrashRecoverySystem
- [ ] `SVC-019` (I:L E:S W:2) Undo history inspector (debug). → undoManager.ts
- [ ] `SVC-020` (I:L E:S W:1) Undo unit tests (bounds, coalescing). → tests/unit

### C. Context Engine
- [ ] `SVC-021` (I:M E:S W:2) Document ContextBus channel contract. → ContextBus.ts
- [ ] `SVC-022` (I:M E:S W:2) Typed channel registry + payload validation. → ContextBus.ts
- [ ] `SVC-023` (I:M E:S W:2) Replay buffer bounds + retention. → ContextBus.ts (replay)
- [ ] `SVC-024` (I:M E:S W:2) Throttle controls per channel. → ContextBus.ts (_setThrottle)
- [ ] `SVC-025` (I:L E:S W:2) Cross-app handoff ack reliability. → ContextBus (handoffAck)
- [ ] `SVC-026` (I:L E:S W:2) Context snapshot for new subscribers. → ContextBus.ts
- [ ] `SVC-027` (I:L E:S W:2) DevTools panel for ContextBus traffic. → ContextBus.ts
- [ ] `SVC-028` (I:L E:S W:2) Project-context broadcast standardization. → ContextBus (continuity:project)
- [ ] `SVC-029` (I:L E:S W:2) ContextIntelligenceService → renderer bridge. → ContextIntelligenceService.ts
- [ ] `SVC-030` (I:L E:S W:2) Context privacy gates. → uki/permissions.ts

### D. Notification Engine
- [ ] `SVC-031` (I:M E:M W:4) Unify NotificationCenter + UnifiedNotificationHub + banners. → UnifiedNotificationHub.ts
- [ ] `SVC-032` (I:M E:S W:4) Shared notify() API for all apps. → UnifiedNotificationHub.ts
- [ ] `SVC-033` (I:M E:S W:4) Priority + grouping policy centralized. → UnifiedNotificationHub.ts
- [ ] `SVC-034` (I:L E:S W:4) Notification persistence + history. → UnifiedNotificationHub.ts
- [ ] `SVC-035` (I:L E:S W:4) Per-source mute/DND. → NotificationCenter
- [ ] `SVC-036` (I:L E:S W:4) Actionable-notification routing contract. → UnifiedNotificationHub.ts

### E. Recovery Engine (facade)
- [ ] `SVC-037` (I:H E:M W:1) Recovery facade over CrashRecoverySystem + WorkspaceSnapshot. → main/core
- [ ] `SVC-038` (I:M E:S W:1) Per-app recovery registration API. → WorkspaceSnapshot.ts
- [ ] `SVC-039` (I:M E:S W:2) Recovery coverage report (which apps register). → WorkspaceSnapshot.ts
- [ ] `SVC-040` (I:L E:S W:2) Recovery test harness (simulate crash). → tests/integration
- [ ] `SVC-041` (I:L E:S W:2) Update-recovery (resume after auto-update). → ReleaseManager.ts
- [ ] `SVC-042` (I:L E:S W:2) Recovery telemetry (success/data-loss). → CrashRecoverySystem.ts

### F. Permissions Engine
- [ ] `SVC-043` (I:M E:S W:3) Unify renderer uki/permissions with PluginSecurityGate model. → PluginSecurityGate.ts
- [ ] `SVC-044` (I:M E:S W:3) Permission prompt UX consistency. → uki/permissions.ts
- [ ] `SVC-045` (I:M E:S W:3) Hard-deny + revoke. → uki/permissions.ts
- [ ] `SVC-046` (I:L E:S W:3) Permission audit log. → uki/permissions.ts
- [ ] `SVC-047` (I:L E:S W:3) Per-app permission scopes. → uki/permissions.ts
- [ ] `SVC-048` (I:L E:S W:3) Privacy dashboard aggregation. → Settings app

### G. Sync Engine (missing today)
- [ ] `SVC-049` (I:M E:L W:5) Design a local-first sync engine (no server lock-in). → new shared/sync
- [ ] `SVC-050` (I:M E:M W:5) Conflict resolution model (CRDT or last-writer). → shared/sync
- [ ] `SVC-051` (I:M E:M W:5) Sync settings/preferences across devices (opt-in). → shared/sync
- [ ] `SVC-052` (I:L E:M W:5) Sync projects/assets (opt-in). → shared/sync
- [ ] `SVC-053` (I:L E:M W:5) End-to-end encryption for sync (crypto.rs). → dex-core/crypto.rs
- [ ] `SVC-054` (I:L E:M W:5) Offline queue + retry. → shared/sync
- [ ] `SVC-055` (I:L E:S W:5) Sync status UI. → Settings app
- [ ] `SVC-056` (I:L E:S W:5) Selective sync scopes. → shared/sync
- [ ] `SVC-057` (I:L E:S W:5) Sync provider abstraction (cloud/self-host/LAN). → shared/sync
- [ ] `SVC-058` (I:L E:S W:5) Sync unit/integration tests. → tests

### H. Memory Engine
- [ ] `SVC-059` (I:M E:M W:3) Wire shared/uki/memory three-tier model to renderer memory. → shared/uki/memory.ts
- [ ] `SVC-060` (I:M E:S W:3) Single memory API for apps + UKI. → uki/memory.ts
- [ ] `SVC-061` (I:L E:S W:3) Memory persistence in sqlite. → dex-core/database.rs
- [ ] `SVC-062` (I:L E:S W:3) Memory privacy/encryption. → crypto.rs
- [ ] `SVC-063` (I:L E:S W:3) Memory export/import. → uki/memory.ts
- [ ] `SVC-064` (I:L E:S W:3) Memory budget telemetry. → uki/knowledgeFeeder.ts

### I. Consolidation & cross-cutting
- [ ] `SVC-065` (I:H E:M W:2) Remove/merge UnifiedSearchService into SearchOrchestrator. → UnifiedSearchService.ts
- [ ] `SVC-066` (I:M E:S W:5) Finish or remove TrustworthySearch stub. → main/core/TrustworthySearch.ts
- [ ] `SVC-067` (I:M E:S W:5) Finish or remove UsageAwareFileSystem stub. → main/core/UsageAwareFileSystem.ts
- [ ] `SVC-068` (I:M E:S W:5) Finish or remove IntentSessionManager stub. → main/core/IntentSessionManager.ts
- [ ] `SVC-069` (I:L E:S W:2) Shared service registry/index doc. → docs
- [ ] `SVC-070` (I:L E:S W:2) Service init order audit (main.ts). → main.ts
- [ ] `SVC-071` (I:L E:S W:2) Service teardown/HMR safety (_reset patterns). → services
- [ ] `SVC-072` (I:L E:S W:2) Shared event-bus error isolation. → ContextBus.ts
- [ ] `SVC-073` (I:L E:S W:2) Shared logging facade. → main/core
- [ ] `SVC-074` (I:L E:S W:2) Shared error classifier reuse (ErrorClassifier). → main/core/ErrorClassifier.ts
- [ ] `SVC-075` (I:L E:S W:2) Shared scheduler reuse (Scheduler). → main/core/Scheduler.ts
- [ ] `SVC-076` (I:L E:S W:2) Shared data-integrity checks (DataIntegrity). → shared DataIntegrity
- [ ] `SVC-077` (I:L E:S W:2) Shared cache facade (uki/cache pattern generalized). → uki/cache.ts
- [ ] `SVC-078` (I:L E:S W:2) Shared IPC contract types. → src/shared/types
- [ ] `SVC-079` (I:L E:S W:2) Shared service health dashboard. → TaskManager app
- [ ] `SVC-080` (I:L E:S W:2) Shared-service unit-test coverage pass. → tests/unit

---

## 10 · Performance (`PRF`) — target 70

**Audit:** A sophisticated stack already exists — `TierManager` (5-tier, persisted), `AdaptivePerfMonitor`
(rAF jank), `ThermalAdaptiveMonitor` (frame-median thermal states + universal hot CSS),
`WorkloadGovernor` (advisory policy), `resourceGovernor` (pure CPU/GPU/RAM allocator), `WorkerPool`
(bounded, suspend-on-hidden), main `PerfTier`. Risk: overlap/confusion between the five governors;
`AdaptivePerfMonitor` downgrade path is intentionally a no-op (caused blank-screen regression).

### A. Governor clarity & consolidation
- [ ] `PRF-001` (I:H E:S W:5) Document the non-overlap of the 5 governors (one diagram). → docs
- [ ] `PRF-002` (I:H E:M W:5) Single perf-facade that reads tier+thermal+workload+visibility. → WorkloadGovernor.ts
- [ ] `PRF-003` (I:M E:S W:5) Consumers read the facade, not individual monitors. → services
- [ ] `PRF-004` (I:M E:S W:5) Keep AdaptivePerfMonitor downgrade a no-op (regression guard) + comment. → AdaptivePerfMonitor.ts
- [ ] `PRF-005` (I:M E:S W:5) WorkloadGovernor remains advisory/read-only (no unmount). → WorkloadGovernor.ts
- [ ] `PRF-006` (I:L E:S W:5) Perf overlay (dev) showing all signals live. → new dev overlay
- [ ] `PRF-007` (I:L E:S W:5) Perf event log for diagnosis. → AdaptivePerfMonitor.ts
- [ ] `PRF-008` (I:L E:S W:5) Perf budget unit tests (policy derivation). → tests/unit/workload-governor.test.ts
- [ ] `PRF-009` (I:L E:S W:5) Expose perf state to UKI knowledge. → uki/knowledge.ts
- [ ] `PRF-010` (I:L E:S W:5) Perf telemetry (opt-in). → telemetry
- [ ] `PRF-011` (I:L E:S W:5) Main↔renderer perf-tier IPC bridge (currently separate). → PerfTier.ts
- [ ] `PRF-012` (I:L E:S W:5) Reconcile compute PerfTier with visual TierManager naming. → PerfTier.ts

### B. Tier system
- [ ] `PRF-013` (I:M E:S W:5) Re-detect hardware on major change (GPU swap). → TierManager.ts
- [ ] `PRF-014` (I:M E:S W:5) Surface manual tier override + reset in Settings. → Settings + TierManager
- [ ] `PRF-015` (I:L E:S W:5) Tier preset audit (enableParticles/liveWallpaper dead fields). → TierManager.ts
- [ ] `PRF-016` (I:L E:S W:5) Per-tier app-defer list review (blank-screen safety). → TierManager.ts
- [ ] `PRF-017` (I:L E:S W:5) Tier-aware thumbnail cache sizing. → TierManager.ts
- [ ] `PRF-018` (I:L E:S W:5) Tier-aware undo depth (ties to CRT-009). → TierManager.ts
- [ ] `PRF-019` (I:L E:S W:5) Tier change toast (transparency). → NotificationCenter
- [ ] `PRF-020` (I:L E:S W:5) Tier detection unit tests. → tests/unit
- [ ] `PRF-021` (I:L E:S W:5) Low-power-mode wiring review. → TierManager.ts
- [ ] `PRF-022` (I:L E:S W:5) BOM-safe TierManager file (noted UTF-8 BOM). → TierManager.ts

### C. Thermal
- [ ] `PRF-023` (I:M E:S W:5) Verify universal hot backdrop-filter kill on all glass. → globals.css
- [ ] `PRF-024` (I:M E:S W:5) Warm-state pre-emptive cap tuning. → globals.css
- [ ] `PRF-025` (I:L E:S W:5) Surface thermal state in top bar when hot. → top bar
- [ ] `PRF-026` (I:L E:S W:5) Thermal recovery hysteresis tuning. → ThermalAdaptiveMonitor.ts
- [ ] `PRF-027` (I:L E:S W:5) Reconcile FPS-thermal with main CPU-temp signal. → ThermalPowerManager.ts
- [ ] `PRF-028` (I:L E:S W:5) Game frame-cap presets per thermal state. → ThermalAdaptiveMonitor.ts
- [ ] `PRF-029` (I:L E:S W:5) Long-task observer threshold tuning. → ThermalAdaptiveMonitor.ts
- [ ] `PRF-030` (I:L E:S W:5) Thermal unit tests (state transitions). → tests/unit

### D. WorkerPool & async
- [ ] `PRF-031` (I:M E:S W:5) Audit heavy sync work → move to WorkerPool. → WorkerPool.ts
- [ ] `PRF-032` (I:M E:S W:5) Priority queue usage for user-blocking tasks. → WorkerPool.ts
- [ ] `PRF-033` (I:L E:S W:5) Worker suspend-on-hidden verification. → WorkerPool.ts
- [ ] `PRF-034` (I:L E:S W:5) Worker task timeout tuning per workload. → WorkerPool.ts
- [ ] `PRF-035` (I:L E:S W:5) Worker pool stats surfaced (TaskManager). → TaskManager app
- [ ] `PRF-036` (I:L E:S W:5) Transferable objects to cut copy cost. → WorkerPool.ts
- [ ] `PRF-037` (I:L E:S W:5) Cap concurrency via resourceGovernor. → resourceGovernor.ts
- [ ] `PRF-038` (I:L E:S W:5) Worker error isolation + restart. → WorkerPool.ts

### E. Resource allocation
- [ ] `PRF-039` (I:M E:M W:5) Map resourceGovernor allocations onto OS primitives (main). → main process
- [ ] `PRF-040` (I:M E:S W:5) Foreground bias tuning (70% default). → resourceGovernor.ts
- [ ] `PRF-041` (I:L E:S W:5) Eviction victim picker review. → resourceGovernor.ts
- [ ] `PRF-042` (I:L E:S W:5) Per-app weight assignment (critical/normal/low). → resourceGovernor.ts
- [ ] `PRF-043` (I:L E:S W:5) Shed-flag honored by heavy apps. → creative apps
- [ ] `PRF-044` (I:L E:S W:5) Allocation telemetry. → resourceGovernor.ts
- [ ] `PRF-045` (I:L E:S W:5) Allocation unit tests. → tests/unit
- [ ] `PRF-046` (I:L E:S W:5) Background app throttle on battery. → power (dex-native)

### F. Rendering
- [ ] `PRF-047` (I:M E:S W:5) RenderGovernor refresh-rate targets verified per display. → RenderGovernor.ts
- [ ] `PRF-048` (I:M E:S W:5) AdaptiveRenderingEngine resolution scale review. → AdaptiveRenderingEngine.ts
- [ ] `PRF-049` (I:M E:M W:5) Adopt dex-core compositor damage tracking in hot paths. → dex-core/compositor.rs
- [ ] `PRF-050` (I:L E:S W:5) Input-to-pixel latency budget verification. → InputLatencyController.ts
- [ ] `PRF-051` (I:L E:S W:5) Reduce reflow/layout thrash in heavy lists. → renderer
- [ ] `PRF-052` (I:L E:S W:5) Virtualize long lists (Notes/Files/Rewind). → apps
- [ ] `PRF-053` (I:L E:S W:5) Memoize hot components (StageTile pattern). → components
- [ ] `PRF-054` (I:L E:S W:5) Reduced-motion lowers animation FPS cap. → comfortPrefs
- [ ] `PRF-055` (I:L E:S W:5) GPU layer-count audit (avoid over-promotion). → design-system.css
- [ ] `PRF-056` (I:L E:S W:5) Render loop self-terminate when idle (VisualEffects pattern). → VisualEffects.ts

### G. Memory & startup
- [ ] `PRF-057` (I:H E:S W:5) Long-session heap caps audit (FIFO buffers). → services
- [ ] `PRF-058` (I:M E:S W:5) Bound all per-app caches (decoded buffers, thumbnails). → creative apps
- [ ] `PRF-059` (I:M E:S W:5) MemoryManager pressure → workload reduction. → MemoryManager.ts
- [ ] `PRF-060` (I:L E:S W:5) Leak detection harness (long-run). → tests
- [ ] `PRF-061` (I:L E:S W:5) idlePause coverage verification (hidden/blur). → idlePause.ts
- [ ] `PRF-062` (I:L E:S W:5) Cache flush on memory pressure (CacheRegistry). → CacheRegistry
- [ ] `PRF-063` (I:L E:S W:5) StartupTimeline budget tracking. → StartupTimeline
- [ ] `PRF-064` (I:L E:S W:5) Defer non-critical startup work. → main.ts
- [ ] `PRF-065` (I:L E:S W:5) Lazy-load heavy app chunks (already chunked — verify). → vite.config.ts
- [ ] `PRF-066` (I:L E:S W:5) Warm-up critical chunks (App/AppManager). → vite.config.ts
- [ ] `PRF-067` (I:L E:S W:5) First-paint budget for Home. → Home page
- [ ] `PRF-068` (I:L E:S W:5) Startup error resilience. → main.ts
- [ ] `PRF-069` (I:L E:S W:5) Perf regression CI check. → ci.yml
- [ ] `PRF-070` (I:L E:S W:5) Memory/startup telemetry (opt-in). → telemetry

---

## 11 · Infrastructure (`INF`) — target 90

**Audit:** Native code already exists. `native/` = `dex-native` NAPI-RS (system/processes/power/files/
health, image/audio/video codecs, kernel: scheduler/io/dsp/compression/fuzzy/media/video). `src/native/
dex-core/` = Rust (compositor.rs, fts.rs tantivy, database.rs rusqlite, crypto.rs, physics.rs, effects,
network, scheduler, supervisor, platform/{win,mac,linux}). `src/native/dex-cpp/` = C++20 via node-gyp
(threadpool, mempool, spatial, bloom, matrix, profiler) + C kernel `native/src/c/axl_solid.c`. Build via
`native/build.rs` + `napi build` + node-gyp (`npm run build:native`). **This is expand, not greenfield.**

### A. dex-core (Rust) adoption
- [ ] `INF-001` (I:H E:L W:5) Wire fts.rs (tantivy) as the app-content search index. → dex-core/fts.rs
- [ ] `INF-002` (I:H E:M W:5) IPC contract for fts index/query/delete. → main controller
- [ ] `INF-003` (I:H E:M W:5) Use database.rs (rusqlite) for memory/history/assets. → dex-core/database.rs
- [ ] `INF-004` (I:M E:M W:5) Adopt compositor.rs damage tracking for heavy surfaces. → dex-core/compositor.rs
- [ ] `INF-005` (I:M E:M W:5) Route encryption through crypto.rs (vault/sync/rewind). → dex-core/crypto.rs
- [ ] `INF-006` (I:M E:M W:5) Use physics.rs for Flux particles + spring motion. → dex-core/physics.rs
- [ ] `INF-007` (I:L E:S W:5) effects.rs for GPU-ish visual effects offload. → dex-core/effects.rs
- [ ] `INF-008` (I:L E:S W:5) network.rs for fast/parallel transfers. → dex-core/network.rs
- [ ] `INF-009` (I:L E:S W:5) scheduler.rs/supervisor.rs for background jobs. → dex-core
- [ ] `INF-010` (I:L E:S W:5) search.rs ranking reuse. → dex-core/search.rs
- [ ] `INF-011` (I:L E:S W:5) transfer.rs for Transfers app backend. → dex-core/transfer.rs
- [ ] `INF-012` (I:L E:S W:5) game.rs core for Games app. → dex-core/game.rs
- [ ] `INF-013` (I:L E:S W:5) platform/* APIs surfaced consistently. → dex-core/platform
- [ ] `INF-014` (I:L E:S W:5) memory.rs allocation tracking → TaskManager. → dex-core/memory.rs
- [ ] `INF-015` (I:L E:S W:5) dex-core unit/bench tests (cargo test). → dex-core
- [ ] `INF-016` (I:L E:S W:5) Graceful JS fallback when native missing. → IPC layer
- [ ] `INF-017` (I:L E:S W:5) Native error → ErrorClassifier mapping. → ErrorClassifier.ts
- [ ] `INF-018` (I:L E:S W:5) Versioned native ABI checks. → build.rs
- [ ] `INF-019` (I:L E:S W:5) Document dex-core public surface. → docs
- [ ] `INF-020` (I:L E:S W:5) Bench harness for fts vs JS search. → dex-core

### B. dex-native (Rust) kernel
- [ ] `INF-021` (I:M E:S W:5) system.rs metrics → Home/TaskManager/Power. → native/src/system.rs
- [ ] `INF-022` (I:M E:S W:5) processes.rs → TaskManager process view. → native/src/processes.rs
- [ ] `INF-023` (I:M E:S W:5) power.rs → battery/power-mode UI. → native/src/power.rs
- [ ] `INF-024` (I:M E:S W:5) files.rs fast scan → Files indexing. → native/src/files.rs
- [ ] `INF-025` (I:L E:S W:5) health.rs → system health surfacing. → native/src/health.rs
- [ ] `INF-026` (I:M E:S W:5) image_processing.rs → Prism/Forge export codecs. → native/src/image_processing.rs
- [ ] `INF-027` (I:M E:S W:5) audio_processing.rs → Imosion/Forge codecs. → native/src/audio_processing.rs
- [ ] `INF-028` (I:M E:S W:5) video_metadata.rs → Vinx media parsing. → native/src/video_metadata.rs
- [ ] `INF-029` (I:L E:S W:5) kernel/dsp.rs → Imosion DSP offload. → native kernel/dsp.rs
- [ ] `INF-030` (I:L E:S W:5) kernel/compression.rs → Rewind shard compaction. → native kernel/compression.rs
- [ ] `INF-031` (I:L E:S W:5) kernel/fuzzy.rs → search fuzzy matching. → native kernel/fuzzy.rs
- [ ] `INF-032` (I:L E:S W:5) kernel/video.rs → Vinx frame-diff motion track. → native kernel/video.rs
- [ ] `INF-033` (I:L E:S W:5) kernel/scheduler.rs reuse. → native kernel/scheduler.rs
- [ ] `INF-034` (I:L E:S W:5) kernel/io_engine.rs for fast file IO. → native kernel/io_engine.rs
- [ ] `INF-035` (I:L E:S W:5) kernel/startup.rs to cut cold-start. → native kernel/startup.rs
- [ ] `INF-036` (I:L E:S W:5) creator_key.rs crypto review. → native/src/creator_key.rs
- [ ] `INF-037` (I:L E:S W:5) dex-native unit tests. → native
- [ ] `INF-038` (I:L E:S W:5) Document dex-native bindings. → docs
- [ ] `INF-039` (I:L E:S W:5) Native module load-time budget. → native
- [ ] `INF-040` (I:L E:S W:5) ARM64 native build validation. → CI (hardware-blocked)

### C. dex-cpp (C/C++)
- [ ] `INF-041` (I:M E:S W:5) threadpool.cpp for CPU-bound creative tasks. → dex-cpp/threadpool.cpp
- [ ] `INF-042` (I:M E:S W:5) mempool.cpp to cut allocation churn (Prism). → dex-cpp/mempool.cpp
- [ ] `INF-043` (I:M E:S W:5) spatial.cpp index for canvas/CAD hit-testing. → dex-cpp/spatial.cpp
- [ ] `INF-044` (I:L E:S W:5) bloom.cpp pre-filter for search. → dex-cpp/bloom.cpp
- [ ] `INF-045` (I:L E:S W:5) matrix.cpp for AXL/Flux transforms. → dex-cpp/matrix.cpp
- [ ] `INF-046` (I:L E:S W:5) hash.cpp for asset dedup hashing. → dex-cpp/hash.cpp
- [ ] `INF-047` (I:L E:S W:5) cache.cpp layer reuse. → dex-cpp/cache.cpp
- [ ] `INF-048` (I:L E:S W:5) ioengine.cpp for batched IO. → dex-cpp/ioengine.cpp
- [ ] `INF-049` (I:L E:S W:5) profiler.cpp → perf overlay data. → dex-cpp/profiler.cpp
- [ ] `INF-050` (I:L E:S W:5) signal.cpp handling review. → dex-cpp/signal.cpp
- [ ] `INF-051` (I:L E:S W:5) dex-cpp tests via node-gyp test target. → dex-cpp
- [ ] `INF-052` (I:L E:S W:5) C kernel axl_solid.c → AXL mesh ops. → native/src/c/axl_solid.c

### D. Build & native CI
- [ ] `INF-053` (I:H E:M W:5) CI builds native (cargo + node-gyp) artifacts. → ci.yml
- [ ] `INF-054` (I:M E:S W:5) Cache cargo/node-gyp builds in CI. → ci.yml
- [ ] `INF-055` (I:M E:S W:5) Pre-built .node per platform in release. → release.yml
- [ ] `INF-056` (I:M E:S W:5) Windows GNU toolchain dlltool step documented. → build.rs
- [ ] `INF-057` (I:L E:S W:5) napi build --release pipeline verified. → package.json (build:native)
- [ ] `INF-058` (I:L E:S W:5) Native build failure surfaced clearly. → ci.yml
- [ ] `INF-059` (I:L E:S W:5) Reproducible native builds. → build.rs
- [ ] `INF-060` (I:L E:S W:5) Strip/optimize native binary size. → Cargo.toml
- [ ] `INF-061` (I:L E:S W:5) Vite chunk strategy review. → vite.config.ts
- [ ] `INF-062` (I:L E:S W:5) Lightning CSS verification. → vite.config.ts
- [ ] `INF-063` (I:L E:S W:5) Main tsc build cleanliness. → tsconfig.main.json
- [ ] `INF-064` (I:L E:S W:5) Watermark check stays green. → watermark:check

### E. Test infrastructure
- [ ] `INF-065` (I:H E:S W:5) Fix vitest fork-startup timeout (bake --maxWorkers=4 into config/CI). → vitest.config.ts + ci.yml
- [ ] `INF-066` (I:M E:S W:5) Raise pool startup timeout or use threads pool. → vitest.config.ts
- [ ] `INF-067` (I:M E:S W:5) Split slow test files to parallelize better. → tests
- [ ] `INF-068` (I:L E:S W:5) Coverage gates enforced (60/50/60/60). → vitest.config.ts
- [ ] `INF-069` (I:L E:S W:5) Mock provider for UKI tests. → tests
- [ ] `INF-070` (I:L E:S W:5) Native binding mocks for unit tests. → tests/setup.ts
- [ ] `INF-071` (I:L E:S W:5) Integration tests for save/recover/undo. → tests/integration
- [ ] `INF-072` (I:L E:S W:5) E2E smoke for shell boot. → tests/e2e
- [ ] `INF-073` (I:L E:S W:5) Deterministic time/RNG in tests. → tests/setup.ts
- [ ] `INF-074` (I:L E:S W:5) Flaky-test quarantine policy. → docs
- [ ] `INF-075` (I:L E:S W:5) Test runtime budget tracking. → ci.yml

### F. IPC, rendering & platform
- [ ] `INF-076` (I:M E:M W:5) Typed IPC contract layer (renderer↔main↔native). → src/shared/types
- [ ] `INF-077` (I:M E:S W:5) IPC error normalization. → main controllers
- [ ] `INF-078` (I:L E:S W:5) IPC rate-limit/backpressure for heavy streams. → main
- [ ] `INF-079` (I:L E:S W:5) Reconcile RenderGovernor/RenderingEngine/AdaptiveRenderingEngine roles. → main/core
- [ ] `INF-080` (I:L E:S W:5) MotionController main-process coordination. → MotionController.ts
- [ ] `INF-081` (I:L E:S W:5) Display-info service (multi-monitor) for dock/windows. → main process
- [ ] `INF-082` (I:L E:S W:5) Platform-specific window chrome polish. → platform
- [ ] `INF-083` (I:L E:S W:5) Clean main↔renderer↔native boundaries (future-OS foundation). → architecture
- [ ] `INF-084` (I:L E:S W:5) Session stability manager review. → SessionStabilityManager.ts
- [ ] `INF-085` (I:L E:S W:5) PerformanceGuardian role clarity. → PerformanceGuardian.ts
- [ ] `INF-086` (I:L E:S W:5) ProcessingPipeline reuse for media. → ProcessingPipeline.ts
- [ ] `INF-087` (I:L E:S W:5) Xenon background optimizer scope/decision. → main/core
- [ ] `INF-088` (I:L E:S W:5) Hardware optimization layer scope. → main/core
- [ ] `INF-089` (I:L E:S W:5) Dependency/security audit of native crates. → Cargo.toml
- [ ] `INF-090` (I:L E:S W:5) Infrastructure architecture doc kept current. → docs

<!-- CATALOG-END -->
