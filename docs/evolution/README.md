# DEX Master Evolution — Strategy Document Set

> Source of truth for the "complete computing environment" phase. This set turns the
> aspirational roadmap into a **grounded, prioritized, ID-stable backlog** that future
> sessions execute wave by wave. It is a planning artifact — **no source code is changed by
> these documents.**

## Documents

| File | What it is |
|---|---|
| [`00-CATALOG.md`](00-CATALOG.md) | The exhaustive **Feature Opportunity Catalog** — ≥1000 grounded, ID-tagged improvements across 14 categories. The master list. |
| [`01-ARCHITECTURE-ROADMAP.md`](01-ARCHITECTURE-ROADMAP.md) | Structural direction (High / Medium / Long-term), referencing catalog IDs. |
| [`02-UIUX-ROADMAP.md`](02-UIUX-ROADMAP.md) | Shell, workflows, interactions, creative apps, navigation, accessibility. |
| [`03-INFRASTRUCTURE-ROADMAP.md`](03-INFRASTRUCTURE-ROADMAP.md) | Rust/C++ expansion, rendering, shared services, build/test. |
| [`04-PRODUCTION-READINESS-ROADMAP.md`](04-PRODUCTION-READINESS-ROADMAP.md) | Stability, performance, scalability, maintainability, release. |

The catalog is the single source of truth. Each roadmap is a **prioritized projection** of
catalog items by ID — roadmaps *reference*, they do not restate. This prevents drift.

## How to read an item

Every catalog line:

```
- [ ] `CRT-014` (I:H E:M W:1) Convert Prism adjustments to a non-destructive stack — destructive applyAdjustmentToImageData loses history. → prism/Prism.tsx
```

- **`CRT-014`** — stable ID. Prefix = category; number is zero-padded and never reused.
- **`I:`** Impact — `H` (high), `M` (medium), `L` (low / long-tail).
- **`E:`** Effort — `S` (small), `M` (medium), `L` (large).
- **`W:`** Wave — `1`–`5` execution wave, or `–` for un-scheduled backlog.
- **title** — imperative, concrete, verifiable.
- **rationale** — one line: why it matters / what's wrong today.
- **→ target** — the real file or system it touches (the grounding anchor).

> **Grounding rule.** Every `I:H` item names a real file/system that exists in the repo today.
> Long-tail (`I:L`) items may name an area, but must still be actionable — never "improve UX".

## Category map

| Prefix | Category | Target | Primary anchors |
|---|---|---:|---|
| `UKI` | UKI intelligence | 110 | `src/renderer/uki/*`, AI-provider gap, planner/tool/skills/semantic stubs |
| `NEX` | Nexus | 70 | `Nexus.tsx`, `shared/nexus/memoryViews.ts` |
| `RWD` | Rewind | 55 | `main/core/Rewind*`, `shared/rewind/timeline.ts` |
| `SHL` | Shell | 120 | `AppManager.tsx`, `StageManager`, Spotlight, Settings, Notifications |
| `SCH` | Search | 55 | `SearchOrchestrator`, `searchProviders`, native `fts.rs` |
| `HOM` | Home / Mission Control | 35 | Home page |
| `DOK` | Dock | 40 | `AppManager.tsx` dock, `StageManager.tsx` |
| `CRT` | Creative apps | 220 | Vinx/Imosion/Prism/Flux/Forge/AXL/Canvas |
| `SVC` | Shared services | 80 | `ContextBus`, `AssetLibrary`, undo, notifications, sync |
| `PRF` | Performance | 70 | Tier/Adaptive/Thermal/Workload/resource governors, `WorkerPool` |
| `INF` | Infrastructure | 90 | `dex-core` (fts/compositor/db), `dex-cpp`, build/native CI, test-infra |
| `RCV` | Recovery | 45 | `CrashRecoverySystem`, `WorkspaceSnapshot`, per-app autosave |
| `SEC` | Security | 45 | `crypto.rs`, vault, permissions, plugin sandbox |
| `AUT` | Automation | 45 | `AutomationEngine`, workflow templates, triggers |
| | **Total** | **≈1080** | |

## Wave sequence

Waves are the execution order. Each catalog item carries its `W:` tag.

1. **Wave 1 — Creative-platform consistency.** Every creative app behaves the same and never
   loses work: one shared bounded undo/redo, a shared `AssetLibrary`-backed asset browser,
   uniform configurable autosave + recovery, central shortcut registration, per-app workspace
   layouts.
2. **Wave 2 — Memory layer wiring.** Make the three orphans load-bearing: Nexus 2.0 memory-first
   sidebar (`memoryViews`), Rewind session timeline (`buildTimeline`), unified search into the
   shell/Spotlight (and dedup `UnifiedSearchService`).
3. **Wave 3 — UKI + AI-provider framework.** Multi-provider LLM orchestration (OpenAI / Anthropic
   / Google / Ollama / OpenRouter / local), secure key store, model selection/assignment; wire the
   planner/tool-call/semantic-search stubs and adopt native `fts.rs`.
4. **Wave 4 — Shell / UX coherence.** Surface-system discipline, motion-token enforcement,
   Notification Center UI, workspace switcher, Home → Mission Control, icon audit.
5. **Wave 5 — Native / perf / production.** Expand `dex-core` (fts-backed search, compositor damage
   adoption, sqlite history/memory), consolidate the governors, fix vitest fork-startup flakiness,
   code signing.

## Status legend

`[ ]` not started · `[~]` in progress · `[x]` done. Update the checkbox when a wave executes.

## Conventions for executors

- Reuse mature systems (perf stack, `ContextBus`, `AssetLibrary`, `WorkspaceSnapshot`,
  `PluginSystem`) before adding new modules.
- Keep `tsc --noEmit` = 0 and `npx vitest run --maxWorkers=4` green before declaring a slice done.
- Never commit/push without explicit go-ahead. Update `HANDOFF.md` at session end.
