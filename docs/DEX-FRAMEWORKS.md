# DEX Frameworks — Groundwork

Groundwork for the spec's "Future Expansion" frameworks: **plugin**, **extension**, **automation**, and **workflow**. The guiding principle is *build on what exists, not from scratch*. DEX already ships the load-bearing primitives for all four; the frameworks are mostly a matter of exposing, sandboxing, and packaging them rather than inventing new machinery.

This doc names the existing primitives, maps each framework onto them, lists the key extension points, and sketches a phased path. Policy/governance for third-party code is already written down in [`PLUGIN_POLICY.md`](./PLUGIN_POLICY.md) and is out of scope here.

## Existing primitives we build on

| Primitive | Location | What it gives us |
| --- | --- | --- |
| Command registry | `src/shared/commands/registry.ts` | `PaletteCommand` + `createRegistry` / `registerCommand` / `unregisterCommand` / `searchCommands`. A dependency-free, fuzzy-searchable surface of invokable actions — the natural place to inject third-party commands. |
| Scripting engine | `src/main/scripting/ScriptingEngine.ts` | Sandboxed (`vm`) JS/TS execution in main with a curated `ScriptContext` (`system`, `workflows`, `operations`, `notify`, `files`, `storage`, `http`, `sleep`, `log`). Scripts carry a `ScriptTrigger` of type `manual | schedule | event | hotkey`. Exposed over IPC as `scripting:*` (`create-script`, `execute`, `execute-code`, `stop`, `get-templates`, ...). This is the automation runtime. |
| Project manifest | `src/renderer/services/DexProject.ts` | `.dexproject` (`DexProjectManifest`): per-app view state, shared palette, shared timeline, MRU app list. The shared context a workflow operates over. |
| Context bus | `src/renderer/services/ContextBus.ts` | Typed, throttled pub/sub with a replay ring buffer. Channels include `app:*`, `file:*`, `task:*`, `note:*`, `workflow:trigger`, `idle:*`, and the `continuity:*` cross-app channels. This is the event spine automation listens to and workflows are triggered by. |
| Creative suite bridge | `src/renderer/services/CreativeSuiteBridge.ts` | `send-to-app`, a shared `SharedAsset` clipboard, and a `CreativeAppId → AssetKind[]` compatibility matrix (`ACCEPTS`). The handoff/routing layer workflows use to move assets between apps. |

Two facts shape every framework below:
1. **There is already a sandbox.** `ScriptingEngine` runs untrusted code in `vm` with an allow-listed API. Plugins/extensions should reuse it rather than open a second execution path.
2. **There is already an event spine.** `ContextBus` (renderer) plus the `scripting` trigger types (main) mean automation does not need a new event system — it needs the two wired together.

---

## 1. Plugin framework

**Goal:** third-party packages that add commands, panels, and asset handlers.

**Builds on:** command registry (surface) + scripting engine (sandbox) + creative bridge (asset handlers) + `PLUGIN_POLICY.md` (governance).

A plugin is a manifest + code bundle. Its declared contributions map directly onto existing primitives:
- `commands[]` → `registerCommand` into the palette registry (namespaced by plugin id to avoid collisions, since `registerCommand` already de-dupes by id).
- `assetHandlers[]` → register accepted `AssetKind`s with the creative bridge so the plugin appears as a `send-to-app` target.
- `code` → executed through the `ScriptingEngine` sandbox with a `ScriptContext` narrowed to the permissions the manifest declared.

**Key extension points**
- A `PluginManifest` type (id, version, permissions, contributions) — the missing schema.
- A `PluginHost` that loads/validates a manifest, scopes a `ScriptContext`, and registers/unregisters contributions on enable/disable (mirror `unregisterCommand` for clean teardown).
- A permission gate between the manifest's declared permissions and the `ScriptContext` capabilities actually handed to the plugin.

---

## 2. Extension framework

**Goal:** lighter-weight, mostly-declarative add-ons that *augment* existing apps (palette entries, context-menu items, continuity participants) without shipping a full sandboxed runtime.

**Builds on:** command registry + context bus.

Where a plugin can run code, an extension is the declarative subset: it contributes commands and subscribes to `ContextBus` channels to react to app/file/selection events. Most "I just want a new palette command" or "react when a file is saved" cases need no `vm` sandbox at all — only registry entries and bus subscriptions. This keeps the common case cheap and the security surface small.

**Key extension points**
- An `ExtensionContext` exposing exactly two capabilities: `registerCommand`-style contribution and a scoped `ContextBus.on(channel, handler)` subscription.
- A declarative `when` clause on commands/menu items evaluated against recent `ContextBus` state (the ring buffer makes "was a file just saved?" answerable without persistent state).
- Shared loader/lifecycle with the plugin host; extensions are the no-`vm` tier of the same loading pipeline.

---

## 3. Automation framework

**Goal:** "when X happens, do Y" rules that run unattended.

**Builds on:** scripting engine triggers + context bus.

This is the smallest gap — both halves exist. `ScriptTrigger` already enumerates `manual | schedule | event | hotkey`; `ContextBus` already emits the events. The work is the bridge: forward `ContextBus` events (renderer) to the scripting engine's `event` trigger dispatch (main), and forward `hotkey`/`schedule` triggers back to script execution. The `workflow:trigger` channel already exists for exactly this.

**Key extension points**
- A trigger router: `ContextChannel` (e.g. `file:saved`, `idle:enter`, `task:created`) → matching scripts with an `event` trigger whose `config` names that channel.
- Schedule/hotkey registration that resolves to `scripting:execute` for the bound script.
- A debounce/rate-limit on automation dispatch (the bus is throttled per-channel at the source, but rule fan-out needs its own guard to avoid loops).

---

## 4. Workflow framework

**Goal:** multi-step, multi-app sequences over a shared project ("export this clip from Vinx, send it to Forge, then notify me").

**Builds on:** project manifest + creative bridge + automation (as the run engine) + context bus (as the progress channel).

Note that `ScriptContext` already exposes a `workflows` API (`list`/`run`/`get`) and an `operations` API — workflows are a first-class concept in the engine, they just lack a renderer-authored definition format and a richer step model. A workflow is an ordered list of steps where each step is one of: run a command (registry), run a script (engine), or hand off an asset (creative bridge, gated by the `ACCEPTS` matrix). It operates over a `DexProjectManifest` so steps share palette/timeline/per-app state, and emits `workflow:trigger` / `continuity:*` events for progress.

**Key extension points**
- A `WorkflowDefinition` (ordered steps + per-step kind: `command | script | handoff`) and a runner that executes steps against the current `.dexproject`.
- Handoff steps validated against `CreativeSuiteBridge.ACCEPTS` before dispatch so an incompatible target fails fast.
- Progress/observability published on `ContextBus` (`workflow:trigger`, plus `continuity:handoff` / `continuity:handoffAck` for the asset legs).

---

## Phased path

The frameworks share infrastructure, so build the shared spine before the per-framework surface. Each phase ends in a usable state.

- **Phase 0 — Manifest + host scaffolding.** Define `PluginManifest` / `ExtensionContext` schemas and a single loader/lifecycle (load, validate, enable, disable, unregister). No third-party code runs yet; first-party features dogfood the host.
- **Phase 1 — Extensions (declarative).** Wire the no-`vm` tier: registry contributions + scoped `ContextBus` subscriptions. Lowest risk, immediately useful, exercises the host end to end.
- **Phase 2 — Automation (trigger bridge).** Connect `ContextBus` events and hotkey/schedule triggers to `ScriptingEngine` event dispatch, with debounce. Reuses the Phase 0 permission gate for what a rule's script may touch.
- **Phase 3 — Plugins (sandboxed code).** Add the `PluginHost` scoped `ScriptContext` and asset-handler registration on top of the extension loader. Enforce `PLUGIN_POLICY.md` permission declarations here.
- **Phase 4 — Workflows (multi-step).** Add `WorkflowDefinition` + runner over `.dexproject`, reusing automation as the execution engine and the creative bridge for handoff steps. Surface progress on `ContextBus`.

## Non-goals / guardrails

- **One execution path.** All code-running tiers (plugin, automation, workflow-script-step) go through `ScriptingEngine`'s `vm` sandbox. Do not add a second `eval`/runtime.
- **One event spine.** Automation and workflows consume `ContextBus`; do not reintroduce ad-hoc `window.dispatchEvent` for cross-app signals (the bus exists precisely to replace that).
- **Permissions are declarative and enforced.** A manifest's declared permissions must bound the `ScriptContext` it receives — never hand a plugin the full context by default.
- **Namespacing.** Third-party command/asset ids are namespaced by package id so `registerCommand`'s id-dedupe and clean `unregisterCommand` teardown stay correct on enable/disable.
