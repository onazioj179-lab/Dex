# DEX 6.0 Goal Phase 6D — Workspace & Navigation Redesign

## Mission
Stop feeling like a collection of apps; feel like one modern operating
environment. One experience, one workflow, one design language — everything
connected. **Primarily a visual/UX phase: it needs eyes-on iteration on the
running app** (the headless preview can't validate dock/window/glass feel).

## Scope (phased)

### 1. Reduced Glass (FIRST — quantified, token-level)
- **Blur −60%, transparency −50% (more opaque), shadow −40%.** Done at the design
  tokens (`--blur-*`, `--glass-opacity-*`, `--pg-shadow-*`) so it cascades.
- Follow-up: a **design-system consolidation pass** converting the ~247 hardcoded
  inline `backdrop-filter: blur(..)` usages to the tokens, so glass is consistent
  everywhere (today only token-using surfaces reduce).

### 2. Dock 2.0 (`components/AppManager.tsx`)
- 30% thinner, lighter elevation, minimal blur, rounded container.
- Dynamic width (compact → expands as apps pin/open; no scroll).
- Running/background/active/notification indicators (subtle).
- Smart grouping (creative/utility/dev/comm). Dock search (apps/files/commands/
  projects/notes/workflows) — reuse the existing Spotlight engine.

### 3. Window system
- Consistent rounded architecture (one radius/spacing/shadow/padding).
- **Linked windows**: drag windows together → DEX links them (Canvas+Notes,
  Code+Terminal, Tasks+Project…); linked windows resize/move together.
- **Workspace awareness**: persist positions/sizes/groups/open project+files;
  reopen a project → exact restore. (Build on the existing WorkspaceSnapshot.)

### 4. Universal Workspace + Project-Centered model
- Any surface (Notes/Canvas/Files/Workflows/AI/Rewind/Dev) placeable anywhere.
- **Projects** become the core unit: each bundles notes/files/workflows/AI chats/
  screenshots/tasks/voice notes/references — all linked. (Build on `.dexproject`
  + the Nexus memory graph.)

### 5. UKI 3.0 — context engine
- Knows current project/file/workspace/task without re-asking; remembers recent
  activity + habits; acts (launch/create/organize/execute/generate). Builds on
  the shipped UKI + Smart Router + memory graph.

### 6. Platform
- Developer Mode (API explorer, plugin builder, workflow debugger, agent builder,
  prompt testing, system monitor). Plugin system (commands/panels/workflows/
  widgets/AI tools). Third-party integrations via one framework (GitHub/Figma/
  Slack/Gmail/Drive/Notion…). Creative suite expansion (Canvas/Whiteboard/Mind
  Maps/Diagram/Story/Presentation/Design boards).

### 7. Onboarding + perf + design-system rules
- Onboarding < 3 min: Welcome → AI provider → import → default workspace →
  shortcuts tour → first workflow.
- Perf: cold-start <300ms, search <20ms, AI first token <50ms, low RAM.
- One typography/spacing/icon/motion/component system; every screen consistent.

## Rules
- Visual changes stay token-level + perf-tier-aware where possible; the heavy
  low-tier/thermal blur gates already exist — build on them.
- Reversible, incremental; **iterate with eyes on the running app** (owner-driven,
  since the build is headless here).
- Reuse mature systems (Spotlight, WorkspaceSnapshot, glass tokens, Nexus,
  Surface/Motion frameworks) — do not reinvent.

## Success criteria
- The dock is the single, lighter, dynamic navigation; windows link + restore;
  projects are the core; UKI is context-aware; one consistent design language.
