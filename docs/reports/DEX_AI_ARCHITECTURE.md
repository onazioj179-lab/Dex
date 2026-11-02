# DEX AI Assistant (UKI): Architecture

**Date:** 2026-11-01 · **Creator:** Onazi Oj

UKI is the DEX assistant. It is a modular userspace feature of the DEX shell: it is not part of boot, it is not needed for recovery, and DEX starts and runs normally with it disabled or with no model configured.

## Components (as built)

```text
UI
  UkiOverlay (compact panel, DEX Bar mic)        components/UkiOverlay.tsx
  Uki app (expanded chat, "look at my screen")    DEXAPPLICATIONS/standalone/Uki.tsx
  Command palette / slash commands                components/CommandPalette.tsx, UkiOverlay (/open /note /task /find /run)
  Task dashboard (Nexus: tasks, history, memory)  components/NexusUkiPanel.tsx, ScheduledTasksPanel.tsx
  Model + privacy settings                        components/AiProviderSettings.tsx
  Memory settings (view / forget / export / clear) pages/Settings.tsx (UKI & Memory)
  Permissions center                              components/PermissionCenter.tsx
  Activity log                                    DEXAPPLICATIONS/standalone/SecurityCenter.tsx

Orchestrator
  Agent loop (ReAct, text tool protocol)          uki/agentRunner.ts
  Reasoning profiles, tool risk, path scope       shared/uki/assistantPolicy.ts
  Tool catalog + argument validation              shared/uki/toolValidation.ts
  App actions (apps register tools)               uki/appActionRegistry.ts, shared/uki/appActions.ts

Model runtime
  Providers: OpenAI, Anthropic, Google, OpenRouter, Ollama   uki/providers/*.ts
  Router (goal + task features + device)          shared/uki/smartRouter.ts, uki/providers/connect.ts
  Processing-mode enforcement                     uki/providers/orchestrator.ts (chat), connect.ts (stream)
  Keys                                            uki/keystore.ts (OS keychain in the packaged app)

Memory and context
  Turns (encrypted, retention-bounded)            uki/memory.ts, uki/cache.ts
  Cold archives (gzip)                            uki/compressedMemory.ts
  App context (what the user is looking at)       uki/appContextRegistry.ts
  Local search index (files, notes, clipboard)    core/dex-search (Rust, tantivy)

Device integration
  App control: open_app / close_app / list_apps   agentRunner.ts -> shell events
  Files: find / read / create / rename / move / Recycle Bin   uki/fileTools.ts -> files:* (Rust)
  Notifications                                   services/notify.ts
  Screen: one frame via the system picker         uki/screenCapture.ts

Agent runtime
  Task ledger: pause / resume / cancel / stalled  store/ukiTasksStore.ts
  Scheduled tasks (cron/interval)                 store/scheduledTasksStore.ts

Safety
  Capability grants (session or persistent)       uki/permissions.ts
  Confirmation for risky tools                    agentRunner.ts (setUkiToolConfirmHandler)
  Persistent audit trail                          appActionRegistry.ts (recordUkiToolAudit)
```

## Request flow

1. The user types or speaks a request (overlay or Uki app).
2. Structured commands (slash commands, "open X") are handled locally without a model.
3. Free-form requests go to `runUkiAgent`:
   - `budgetFor(text)` picks **Fast / Balanced / Deep** (or the user's fixed preference). This sets the step cap (2 / 5 / 10) and the output cap (350 / 700 / 1600 tokens).
   - Each step builds the catalog: core tools plus the actions of apps that are running.
   - `askConfiguredLLM` routes the request. The **processing mode** filters the candidate models first. `chat()` re-checks the chosen model before any network call.
   - If the reply is `TOOL name {json}`, the call is validated, budget-charged and passed through `decideToolCall`: permission, then privacy mode, then risk. A risky call goes to confirmation, then runs and is audited.
   - Pause is checked before every model call and tool call. Cancel aborts the in-flight fetch.
4. With no provider configured, or if the call fails, the request degrades to the local intent engine (`uki:query` in Rust). Nothing is sent anywhere silently.

## Data flows

| Data | Where it goes | When |
|---|---|---|
| Prompt and history | The selected provider only | Every model call; never to a cloud provider in Local only |
| Web search query | DuckDuckGo Instant Answer + Wikipedia | `web_search` tool; blocked in Local only unless Network is granted |
| File contents | The selected provider, as tool output | `read_file`, only with the file-read grant, max 64 KB, text only |
| Screen frame | The selected vision model | Only after the user picks a window or screen in the system picker; tracks stopped immediately |
| Conversation turns | Encrypted local storage | Only while Memory Recording is on; retention-bounded |
| Audit trail | Local storage (300 entries) | Every tool call; args truncated to 120 characters |

## Platform boundaries

- **Windows (Tauri, WebView2):** everything above. File tools use the Rust `files:*` handlers; deletion uses the Recycle Bin (`trash` crate).
- **Linux (`dex-os/`):** the image uses GRUB + bzImage. UKI the assistant would run in the same userspace shell. No Unified Kernel Image exists (see `DEX_UKI_INTEGRATION.md`).
- **Mobile:** no target.
- **Cross-device continuity:** not implemented. No sync service exists, so there is nothing to sync securely.
