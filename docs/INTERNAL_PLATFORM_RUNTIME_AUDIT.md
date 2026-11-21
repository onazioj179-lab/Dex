# DEX OS Internal Platform and Runtime Audit

Date: 2026-07-10  
Scope: current Tauri 2 + React renderer, native Rust services, shared UI/runtime seams  
Owner: Onazi Treasure OJ

## Executive finding

DEX already has substantial OS-grade foundations: a Tauri-native backend, shared SQLite storage for active subsystems, explicit application lifecycle state, typed stores, a design token layer, native search engines, and bounded health/diagnostic systems. The remaining risk is not absence of capability. It is parallel implementations and migration seams that can diverge.

This pass deliberately adds no feature. It hardens the most exposed Browser boundary, restores UKI event parity under Tauri, and closes restart/teardown leaks in shared worker infrastructure.

## Completed in this pass

### 1. Browser bridge session authentication

The loopback Browser bridge previously treated the connected state as authorization. Any local caller able to reach the port could poll actions, submit results, or refresh the heartbeat after a legitimate extension paired.

The bridge now:

- generates a 256-bit credential from the operating-system CSPRNG after successful pairing;
- returns the raw credential only in the successful pairing response;
- retains only a SHA-256 digest in process memory;
- requires a Bearer or `X-Dex-Bridge-Token` credential on action, result, and heartbeat endpoints;
- compares credential digests without data-dependent early exit;
- clears credentials on pairing restart, cancellation, disconnect, and server stop;
- removes wildcard CORS and preflight support from the loopback API;
- marks responses `no-store`;
- rejects unsupported endpoint methods.

The Browser extension contract must retain the returned `accessToken` in extension-session memory and send `Authorization: Bearer <accessToken>` on authenticated requests. It should not persist the token to page storage.

### 2. One cross-shell renderer event boundary

A platform IPC adapter now normalizes:

- Electron `ipcRenderer` events, where the hidden IPC event is the first argument;
- the Tauri compatibility bridge, where handlers receive payloads directly;
- invoke and fire-and-forget messages;
- deterministic listener teardown.

UKI now consumes this adapter instead of looking only for `window.electron.ipcRenderer`. Native UKI state, responses, TTS, listening state, conversation turns, navigation, and knowledge events therefore reach the renderer under Tauri.

The UKI bridge now returns an idempotent disposer. It releases subscriptions, the running-app context subscription, speech recognition, speech synthesis, knowledge batching, and delayed cross-app dispatches. Late microphone grants are ignored after teardown.

### 3. Restart-safe worker lifecycle

The shared worker pool now:

- stores and removes its visibility listener;
- resets lifecycle state so termination followed by initialization is safe;
- tracks and cancels every task deadline timer;
- terminates timed-out workers rather than incorrectly marking an unknown in-flight worker idle;
- only revokes blob URLs created by the pool;
- clears owned blob URL state before restart.

### 4. Capability contract correction

The renderer capability test now reflects the native transfer controller already present in the Tauri dispatcher.

## Current architecture map

| Concern | Current authority | Direction |
|---|---|---|
| Desktop shell bridge | Tauri `dex_ipc` plus renderer compatibility layer | Keep one renderer adapter; remove direct shell checks incrementally |
| Application lifecycle | Renderer lifecycle manager and running-app store | Preserve; require every long-lived app service to expose disposal |
| Window framework | Shared floating window shell and canonical window controls | Continue replacing per-app controls through adapters, not rewrites |
| Design tokens | CSS design-system/design-token files plus TypeScript tokens | Add parity tests; resolve divergent scales before broad restyling |
| UI primitives | Renderer `ui`, style components, shell components, creative controls | Choose one accessible canonical family; retain compatibility adapters |
| Notifications | SQLite notification center plus legacy notification path | Instrument callers, then remove the inactive legacy store |
| Search | File search, grouped global search, and content FTS | Keep distinct engines behind one renderer facade |
| Preferences | Zustand/local settings plus native storage controllers | Define ownership by data class; sensitive state must not fall back to plaintext KV |
| Database | Shared native SQLite for active data subsystems | Add migration, schema, index, recovery, and transaction contract tests |
| UKI | Native controller/runtime plus renderer UI and permission stores | Move authorization decisions to the native boundary |
| Browser | Renderer browser UI plus native extension bridge | Advertise only shell-supported security capabilities |
| Background work | Native task modules, renderer workers, singleton services | Standardize `dispose()` and central startup/shutdown ownership |

## Ranked remaining work

### Native UKI authorization boundary

Native operator dispatch checks the capability grant and its expiry, requests native consent where required, and records redacted decisions. Source tests cover expiry and audit redaction. The packaged consent flow, provider cancellation and remaining Xack workflows still require verification.

Acceptance criteria:

- direct native operator calls cannot bypass grants;
- destructive or privacy-sensitive actions require explicit approval;
- denial, expiry, and approval paths have native and renderer contract tests;
- the audit log records decision, capability, principal, and reason without sensitive payloads.

### Atomic shared KV repository

The shared JSON KV repository serializes mutations, publishes new generations through a staged write and retains a previous generation. Authority reads use the current generation so recovery cannot revive a revoked grant. Native tests cover concurrent writes, damaged files, failed transactions and rejection of plaintext credentials. A packaged interruption and upgrade check remains open.

Acceptance criteria:

- concurrent distinct-key writes never lose updates;
- interrupted writes leave a readable previous generation;
- sensitive values are rejected or routed to secure storage;
- browser, transfer, permissions, and UKI do not add module-local locks around the repository.

### P1 — Browser runtime capability honesty

Windows page windows expose native navigation, Find and downloads through explicit runtime support checks. Review the remaining indicators and controls for embedded navigation, request interception, credentials, developer tools, extensions and PWA installation against the shipping Tauri runtime.

### P1 — Primitive and token consolidation

There are multiple button, input, modal, and segmented-control families. Consolidation must avoid a flag-day rewrite:

1. declare the accessible renderer `ui` family canonical;
2. add missing variants to canonical primitives;
3. convert other families to thin adapters;
4. migrate call sites by usage frequency;
5. remove adapters only after import telemetry reaches zero.

Add automated parity checks for CSS and TypeScript spacing, radius, height, type, motion, and focus tokens.

### P1 — Central process teardown registry

The shell owns teardown for clipboard capture, Flow intakes, context activity and app focus learning through a shared disposable group. Clipboard polling reads only after permission has already been granted. A user action can add system clipboard text directly. Broader ownership across application startup, sign-out and workspace reset remains open.

### P1 — Notification authority consolidation

Confirm runtime callers of legacy `notifications:*`, migrate them to the SQLite-backed notification center, and delete the legacy store only after telemetry confirms zero use. Preserve one model for urgency, actions, expiry, read state, deduplication, and operating-system delivery.

### P2 — Native dispatcher registry

Tauri module declaration, schema initialization, database dispatch, and channel dispatch are manually repeated. Introduce a declarative subsystem registry with contract tests before altering routing. Search engines should remain separate implementations because file search, grouped search, and content FTS have different semantics.

### P2 — Storage and database production gates

Add query-plan tests for high-volume tables, bounded retention tests, startup integrity checks, transactional migrations, WAL checkpoint policy, backup/restore verification, and crash-recovery tests. Do not replace working SQLite subsystems with a new database abstraction without measured evidence.

### P2 — Dead-code and dependency removal

Deletion should be evidence-driven:

- TypeScript compiler/reference search;
- build graph and dynamic import analysis;
- runtime degrade/channel telemetry;
- native dead-code warnings;
- asset references in CSS, manifests, and packaging;
- dependency usage in source, scripts, and configuration.

Delete in small batches with build and test gates. Do not equate duplicate names with duplicate semantics.

## Validation record

Completed:

- focused platform/UKI/worker tests: 13 passed;
- Tauri native tests: 56 passed;
- production renderer build: passed;
- watermark policy: 2,216 files compliant;
- live shell inspection: DEX desktop rendered, navigation and window controls remained accessible.

Known repository-wide validation issues outside this implementation slice:

- the broad Vitest run currently includes legacy tests that import removed `src/main` Electron modules and fails before a meaningful current-platform total can be produced;
- repository-wide Rust formatting is not currently clean in many untouched native modules;
- the renderer build reports existing mixed static/dynamic import and large-chunk warnings.

These should be addressed as dedicated test-inventory and bundle-budget work, not hidden by weakening gates.

## Engineering guardrails

- No new subsystem without an owner, lifecycle, resource budget, and failure mode.
- No renderer permission flag may be treated as native authorization.
- No long-lived listener, timer, worker, observer, stream, or handle without teardown.
- No unsupported security control may report success.
- No shared data may use whole-file overwrite without serialization and recovery.
- No primitive fork when a canonical primitive can be extended or adapted.
- No dead-code deletion without static, runtime, build, and test evidence.
- Keep the existing monochrome-first palette and blue accent; use disciplined motion and precise geometry rather than franchise imitation.
