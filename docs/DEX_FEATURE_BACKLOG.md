# DEX OS — Feature Backlog (research-derived)

> Source: deep-research run `wf_0e06c8bb-160` (2026-06-23). 107 agents, 25 sources
> fetched, 116 claims extracted, 25 adversarially verified (3-vote), 24 confirmed /
> 1 refuted. Evidence skews **primary-source** (Tauri v2 docs, Apple Developer,
> Microsoft Learn, Google Project Zero, Bubblewrap repo).
>
> **Coverage note:** the original run (above) went DEEP on domains 01–04. A second
> pass (`wf_92160670-0fb`, 2026-06-23, 114 agents) then covered **05–10** — verified
> findings for 05/06/07 are in the "05–10 RESEARCH PASS" section below; 08/09/10 have
> primary sources fetched but await a scoped claim-extraction re-run. Implementation
> status: **01 CLEARED, 02 confirmed, 03 + 04 shipped** (DEX policy + native driver /
> live wiring) — see the STATUS blocks per domain.
>
> Priorities: **P0** = foundational / highest-leverage likely gap · **P1** = strong
> win, scoped · **P2** = nice-to-have / lower confidence.

---

## P0 CROSS-DOMAIN SHORTLIST — STATUS (updated 2026-06-23)

1. **Per-inner-app capability scoping in the manifest** (Sec) — **ALREADY BUILT.**
   `shared/runtime/capabilityBroker.ts` (+ `capabilityToken.ts`) is the broker, and
   `shared/store/validationGate.ts` `evaluateAppValidation` enforces a
   `capability-declared` block-check (all sensitive caps must be declared). No rebuild.
2. **MCP-style tool catalog for UKI** (AI) — **DONE this session.** Tools are now data
   (name/description/schema/example) in `shared/uki/toolValidation.ts` `CORE_TOOLS`;
   `renderToolCatalog()` generates the agent prompt and `createToolCatalog(extra)` lets
   inner apps register tools (the MCP-server analogue). 14 tests.
3. **Constrained-decoding / typed tool outputs in UKI's ReAct loop** (AI) — **DONE.**
   `validateToolCall` gates every call; malformed/missing/mis-typed args are repaired,
   never run. Wired into `agentRunner.ts`. (Apple `@Generable` analogue.)
4. **Tiered on-device-first / cloud-fallback AI routing** (AI) — **DONE.**
   `smartRouter.ts` `isRoutineTask`/`preferOnDeviceFirst`, wired into
   `connect.ts routeConfiguredModels` for the `auto` goal. 5 tests.
5. **Signed-registry launch gate modeled on notarization** (Sec) — **ALREADY BUILT.**
   `evaluateAppValidation` is the multi-check gate (signature + integrity + code-scan +
   publisher-known + capability-declared + size); `shared/store/installer.ts`
   `verifySignatures` does real multi-sig Ed25519 verification against trusted publisher
   keys with a `verify-signatures` install step that hard-fails. No rebuild.
6. **Confirm/lean into Tauri multi-process isolation** (Perf/Arch) — confirmation only;
   the migration is on the right base (per-inner-app WebView isolation + TAO-native tray).

> **Net: of the 6 P0s, 3 were already implemented in DEX, and 3 (#2/#3/#4) were shipped
> this session — all test-backed, `tsc` clean.** The remaining roadmap is the P1/P2
> items below + the 05–10 research pass (blocked on a rate limit, re-run after reset).

---

## 01 · WINDOW MANAGEMENT & SHELL

| Feature | Source Inspiration | DEX Location | Priority | Status |
|---|---|---|---|---|
| Selectable, swappable tiling layouts (Master / Columns / Rows / Grid / Dwindle / Monocle), switched at runtime | Hyprland compositor layouts | `shared/shell/tilingLayouts.ts` + AppManager + Command Palette | P1 | **DONE** (15 tests) |
| Dual custom-zone editor: **Grid** (relative) + **Canvas** (free-form, overlapping) | Windows FancyZones | `shared/shell/customZones.ts` + `store/zoneStore.ts` + `components/ZoneEditor.tsx` | P1 | **DONE** — full visual editor: grid templates, free-form draw/move/resize, named save, per-session persistence, drag-to-zone snapping (16 tests) |
| Full keyboard snap grammar: move-between-zones, apply-layout-by-number, cycle-within-zone, expand-across-zones | FancyZones | WM + keybind layer | P1 | **DONE** — move-between-zones (Ctrl+Alt+arrows), apply-layout-by-number (Alt+Shift+1-6), cycle-window-focus (Meta+\`), **cycle-within-zone (Ctrl+Alt+[ / ])**, and **expand-across-zones (Ctrl+Alt+Shift+arrows)** all bound on the persisted zone state |
| Stage-Manager workspace: centered active window + left **recents rail** | macOS Stage Manager | `store/stageStore.ts` (Stages) | P1 | **Already built** (stages + postures + recents) |
| User-formed **window groups** = restorable set, persisted | macOS Stage Manager | `stageStore` + `WorkspacePresets` + `WorkspaceSnapshotStore` | P1 | **Already built** (stages capture window sets; named snapshots, max 20) |

> **Tiling layouts** were the genuine new gap and are shipped: a pure `computeTiling`
> engine (master/columns/rows/grid/dwindle/monocle) + 5 Command-Palette actions
> ("Tile: Master + Stack", Columns, Rows, Dwindle, Monocle) routed through the
> existing `dex-arrange-windows` path. The recents-rail / window-groups items were
> already implemented via Stages + Workspace presets/snapshots.
>
> **PERSISTENT CUSTOM ZONES — SHIPPED (closes section 01).** The last open WM gap
> is done end-to-end: a pure FancyZones model (`shared/shell/customZones.ts` —
> grid construction, bounds conversion, hit-test, coverage, and the
> `expandAcross` engine; 16 tests), a persisted zone store
> (`store/zoneStore.ts`, localStorage + capability:storage mirror), and a visual
> editor (`components/ZoneEditor.tsx`, Ctrl+Alt+Z or the "Edit Snap Zones"
> palette command) with grid templates, free-form draw/move/resize, named save,
> and an active-layout picker. Wired into AppManager: drag-to-zone snapping (the
> active layout takes priority on drop), **expand-across-zones** (Ctrl+Alt+Shift+
> Arrow), and **cycle-within-zone** (Ctrl+Alt+[ / ]) — all built on the persisted
> state. tsc 0, renderer build green.

- **Steal:** layout-as-pluggable-strategy + per-workspace binding; dual relative/absolute
  zones; the rarely-cloned cycle-within-zone & expand-across-zones bindings; group-as-set.
- **Improve:** surface layout switching as a command-palette/keybind action (not config
  edits); make the recents rail show live inner-app status (notifications / now-playing),
  not static thumbnails; persist zone layouts per workspace/display.
- **Avoid:** config-file-reload to change layouts.

---

## 02 · PERFORMANCE & ARCHITECTURE (Tauri foundation)

| Feature | Source Inspiration | DEX Location | Priority |
|---|---|---|---|
| Multi-process crash isolation: Rust Core = sole full-OS-access component spawning isolated WebView processes | Tauri v2 process model | Tauri/Rust shell core | **P0** (validates migration) |
| Small binary / no shipped runtime via dynamically-linked OS webview (WebView2/WKWebView/webkitgtk) | Tauri v2 architecture | Build/distribution + core | **P0** |
| Build WM + control-strip/tray on **TAO** (native tray/menu, 5 platforms) + **WRY** (webview) rather than reinventing | Tauri WRY/TAO | Shell core (WM + tray/strip) | **P0** |

- **Steal/Confirm:** DEX is on the right base — lean into per-inner-app WebView isolation
  and TAO-native tray for the control strip.
- **Avoid:** assuming webview parity across OSes; handle WebView2 bootstrapping when absent.
- **Caveat:** independent benches cite ~3–10 MB Tauri vs 52–244 MB Electron (corroborating,
  not primary).

---

## 03 · SECURITY & SANDBOXING

| Feature | Source Inspiration | DEX Location | Priority |
|---|---|---|---|
| Per-inner-app capability scoping in manifest (minimum fs/shell/net perms); APIs disabled by default | Tauri least-privilege + Bishop Fox XSS→RCE | App registry/manifest + IPC perm layer | **P0** |
| Signed-registry launch gate: automated malware/codesign scan → ticket → first-launch verify (online or stapled-offline) | macOS notarization + Gatekeeper | App registry/store + launcher | **P0** |
| Linux inner-app jail via unprivileged user-namespace isolation (DEX supplies policy on top) | Bubblewrap (under Flatpak) | System sandbox layer (Linux) | P1 |
| Windows per-app network capability gating (internetClient / internetClientServer / privateNetworkClientServer) via WFP/AppContainer | Google Project Zero (Forshaw) + MS Learn | System sandbox (Windows) + manifest | P1 |
| Brokered secure IPC for inner-app comms (NOT localhost sockets — AppContainer blocks cross-package loopback by default) | Project Zero loopback analysis | Secure IPC / cross-app data layer | P2 |

- **Steal:** capability-scoped manifests; automated-scan + ticket model; user-namespace jail.
- **Improve:** stapled/offline tickets for Phantom portable mode.
- **Avoid:** broad fs/shell scopes; assuming "notarized = safe" (notarized malware exists —
  pair with sandboxing); modeling Windows AppContainer as blanket default-deny (a broad
  default-deny claim was **REFUTED 1-2** — it's *capability-gated*, network + loopback).

> **STATUS (2026-06-23) — DEX policy layer SHIPPED (the host-agnostic half of all
> three rows).** The kernel enforcement is per-OS native (WFP/AppContainer SIDs on
> Windows, real `bwrap`/namespaces on Linux) and is the remaining native-driver
> step; the **policy that drives it** is now pure, tested DEX code:
> - **Windows per-app network gating** — `shared/runtime/networkPolicy.ts`:
>   derives the AppContainer classes (`internetClient` / `internetClientServer` /
>   `privateNetworkClientServer`) from declared caps, classifies a destination,
>   and fail-closed-evaluates each request. Loopback is denied by default even for
>   networked apps (honours the REFUTED-default-deny nuance: gated, not blanket).
> - **Linux inner-app jail** — `shared/runtime/linuxSandbox.ts`: builds the
>   bubblewrap argv from caps (maximal `--unshare-all` default; net/gpu/audio/fs
>   re-shared only when declared; cap-drop + new-session). DEX-policy-on-top, exactly
>   as the Bubblewrap inspiration intends.
> - **Brokered secure IPC** — `shared/runtime/brokeredIpc.ts`: capability-scoped
>   route policy; direct app→app is forbidden (everything via the broker, no
>   localhost sockets), unknown channels fail-closed.
> - **`shared/runtime/sandboxProfile.ts`** composes all three into one
>   `buildSandboxProfile(caps)` artifact a per-OS driver consumes. 24 unit tests.
>
> **NATIVE DRIVER LANDED (2026-06-23).** `src-tauri/src/sandbox_ctl.rs` is the
> per-OS enforcement driver (channels `sandbox:profile` / `:checkNetwork` /
> `:checkIpc` / `:launchLinux`, registered in `main.rs`). It mirrors the TS policy
> in Rust (pinned equal by 8 `cargo test`s) and applies it: on **Linux** it spawns
> the inner app under real `bwrap` with the capability-derived argv; on **Windows**
> it computes the AppContainer network-capability set. The ONE remaining native-API
> step — installing the actual WFP filters / capability SIDs — needs the Win32 FWP
> APIs + elevation and is honestly REPORTED by the driver, not faked. `cargo test`
> green (8/8).

---

## 04 · AI & PRODUCTIVITY (UKI)

| Feature | Source Inspiration | DEX Location | Priority |
|---|---|---|---|
| MCP-style tool framework + signed MCP/tool catalog so UKI connects to inner apps as tools | Windows MCP Registry (Build 2025, preview) | UKI assistant + app registry | **P0** |
| Constrained-decoding / typed schema-guaranteed tool outputs in the ReAct loop | Apple `@Generable` (Foundation Models) | UKI agentic tool loop | **P0** |
| Tiered on-device-first / cloud-fallback routing (local for routine, escalate to provider tier) | Apple Foundation Models + Private Cloud Compute | UKI AI layer (routing) | **P0** (extends existing) |
| On-device inference tier, NPU-optimized where present, via a CPU/GPU/NPU runtime abstraction | Windows ML + on-device APIs | UKI AI layer (offline path) | P1 |
| Small-SLM offline tier feasibility datapoint (Phi Silica 3.8B: ~230ms TTFT, ~20 tok/s, 56% power win vs CPU) | Phi Silica (MS) | UKI AI layer (offline tier) | P1 |

- **Steal:** MCP as UKI's tool standard; typed/guarded tool outputs; tiered provider-agnostic
  routing (aligns with UKI's existing provider-agnostic streaming).
- **Caveat (version-sensitive):** Windows MCP Registry was a *private preview*, since
  rebranded (On-device Agent Registry / File Explorer MCP) — cite the feature, not the brand.
- **Caveat (don't generalize):** Phi Silica figures are vendor lab numbers on Snapdragon X
  Elite NPU; "power-efficient" ≠ "faster" (NPU can be slower than CPU for some small models).
  Validate on commodity (non-Copilot+) hardware before committing the offline tier.

> **STATUS (2026-06-23) — on-device runtime abstraction SHIPPED.**
> `shared/uki/deviceRuntime.ts` is the pure CPU/GPU/NPU abstraction: a model
> runtime-need catalog + `selectComputeTier` (prefers an accelerator, honours an
> NPU TOPS floor, CPU always a valid fallback) + `canRunLocalModel` (gates a heavy
> local model off an accelerator-less machine). It encodes the research caveat —
> NPU is preferred for *power*, not assumed *faster*, and large models stay gated
> on commodity hardware. Wired LIVE into routing: `smartRouter.preferOnDeviceFirst`
> now takes a runnability predicate and `connect.ts routeConfiguredModels` passes
> the detected device (WebGPU ⇒ gpu; NPU is native-reported), so the `auto` goal
> only fronts a local model this machine can actually run. 14 unit tests; the smart
> router's 17 existing tests still pass (default predicate = back-compat). The
> remaining 04 work is the NATIVE execution provider (DirectML/CoreML/NPU EP) +
> the commodity-hardware SLM benchmark — both need real silicon, not headless code.

---

## 05–10 · RESEARCH PASS — DONE (verified backlog)

> Source: deep-research run `wf_92160670-0fb` (2026-06-23). 114 agents, 6 angles,
> 31 primary sources fetched, 146 claims extracted, **25 adversarially verified
> (3-vote), 25 confirmed / 0 refuted** → 9 synthesized findings. Evidence is
> heavily **primary-source** (W3C/WCAG, Microsoft Learn/Fluent 2, GNOME HIG,
> Khronos/Vulkan, PipeWire, Apple, CoreOS rpm-ostree, Raycast).
>
> **Honest coverage note:** verified claims landed for **05 (UI/UX), 06 (gaming/
> real-time), and 07 (one claim: rpm-ostree)**. For **08 / 09 / 10** the primary
> sources WERE fetched (listed below) but were budget-dropped before claim
> extraction — those rows are sourced-but-not-yet-verified and a scoped re-run will
> land them fast. Nothing was fabricated to fill the gap.

### Cross-domain P0 shortlist (verified)

1. **WCAG 2.2 AA conformance** — enforce **2.5.8 Target Size** (pointer targets ≥
   24×24 CSS px: dock icons, window controls, command-palette hits) and **2.5.7
   Dragging Movements** (every drag has a single-pointer non-drag alternative —
   window tiling, snap-zone placement, cross-app drag). Both testable + map exactly
   onto DEX. (W3C, 3-0.)
2. **Per-workload GPU scheduling** — drive explicit GPU queue priority for a DEX
   "Game/Focus Mode": D3D12 `D3D12_COMMAND_QUEUE_PRIORITY` (NORMAL/HIGH/
   GLOBAL_REALTIME) + Vulkan `VK_KHR_global_priority` (LOW/MEDIUM/HIGH/REALTIME).
   Top tier is privilege-gated + fails closed (no silent downgrade). (MS Learn +
   Khronos, 3-0.)
3. **Low-latency shared-mode audio** — WASAPI `IAudioClient3`
   (`GetSharedModeEnginePeriod` + `InitializeSharedAudioStream`) for sub-10 ms
   shared audio (engine floor 1.3 ms); PipeWire (SPA graph, JACK-compatible) on
   Linux. (MS Learn + PipeWire, 3-0.)

> **STATUS (2026-06-23) — verified findings IMPLEMENTED to the headless boundary.**
> - **05 WCAG 2.2 SC 2.5.8** — `shared/a11y/targetSize.ts`: pure 24×24 checker with
>   all five spec exceptions + a strict DEX-audit mode + `auditRects`/`auditDomTargets`;
>   exposed as `window.__dexAuditTargets()` and applied to the ZoneEditor controls
>   (min 24×24). 6 tests.
> - **05 Fluent size-proportional motion** — `shared/motion/motionScale.ts`:
>   size→duration bands + reduced-motion collapse; wired LIVE into the window-snap
>   transition (a larger window animates longer). 4 tests.
> - **06 GPU queue priority** — `src-tauri/src/gpu_priority.rs`: maps a DEX level to
>   the D3D12 (NORMAL/HIGH/GLOBAL_REALTIME=0/100/10000) + Vulkan (LOW/MED/HIGH/
>   REALTIME) enumerants; realtime flagged privileged; `gpu-priority:apply` honestly
>   degrades (needs a native GPU device + elevation). 5 cargo tests.
> - **07 rpm-ostree rollback model** — `shared/update/transactionalUpdate.ts`: a pure
>   transactional deployment machine (stage-without-unbooting, finalize, one-step
>   rollback, checksum-integrity, prune-with-pin). 7 tests.
> The 2.5.7 dragging-alternative P0 is already satisfied for snap zones (keyboard
> expand/cycle bindings). Remaining 06 work (real WASAPI/Vulkan execution) needs
> native silicon; the shell-wide a11y NAME/keyboard sweep (GNOME matrix) is a broad
> renderer pass tracked for a dedicated batch.

### 05 · UI/UX feel & polish — VERIFIED

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| Target Size ≥ 24×24 CSS px on all pointer targets | WCAG 2.2 SC 2.5.8 (AA) | Dock, window controls, ZoneEditor, CommandPalette | **P0** | Steal: enforce as a lint + test gate (5 exceptions exist). |
| Single-pointer non-drag alternative for every drag | WCAG 2.2 SC 2.5.7 (AA) | Snap zones, tiling, cross-app drag | **P0** | Steal: keyboard/menu path for each drag (already true for zones via expand/cycle bindings). |
| Descriptive accessible names + full keyboard operability + 5-item a11y test matrix (high-contrast / large-text / keyboard / screen-reader / on-screen-kbd) | GNOME HIG | Shell-wide a11y pass + CI checklist | **P0** (test gate) / P1 (build) | Steal: the 5-item matrix verbatim as the acceptance gate. |
| Size-proportional motion (larger elements animate longer) + shell-level "no motion" toggle all inner apps respect | Fluent 2 motion / WCAG 2.3.3 | design-tokens motion vars + reduced-motion store | P1 | Steal: one motion-duration scale keyed to element size; reduced-motion is the a11y lever. |
| Action-panel UX: auto primary/secondary shortcuts (Enter / Cmd+Enter), `Section` grouping when many actions, context-aware items per selection | Raycast Action Panel | CommandPalette + Ask-UKI quick-actions | P1 | Steal: the primary/secondary + section convention directly. |

### 06 · Gaming & real-time — VERIFIED

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| Per-queue GPU priority (NORMAL/HIGH/GLOBAL_REALTIME ; LOW/MED/HIGH/REALTIME) for a Focus/Game Mode | D3D12 `D3D12_COMMAND_QUEUE_PRIORITY` + Vulkan `VK_KHR_global_priority` | Native Rust GPU layer + a "mode" controller | **P0** | Steal: queue-priority skew; gate REALTIME behind privilege, expect fail-closed. Avoid: assuming it's reachable from WebView — needs a native escape hatch. |
| Sub-10 ms shared-mode audio | WASAPI `IAudioClient3` ; PipeWire SPA/JACK | Native audio bridge for creative apps | P1 | Steal: `InitializeSharedAudioStream` below the 10 ms default; PipeWire on Linux. Caveat: needs a driver declaring small buffers. |
| OS "Game Mode" template: highest CPU+GPU priority to the focused workload, throttle background, 2× BT sampling for input/audio latency | macOS Game Mode | DEX mode controller (`modes.rs`) | P1 | Steal: the prioritize-foreground + de-prioritize-background pattern (mechanism = the GPU/audio rows above). |

### 07 · Developer tooling — VERIFIED (partial)

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| Signed, rollback-safe, transactional image+package distribution (immutable base + optional layered packages; versioned/checksummed; OCI-container or HTTP delivery; client layering never mutates the booted root) | rpm-ostree (CoreOS) | DEX app installer / update service | P2 | Steal: the atomic + rollback model. Avoid: full image-OS commitment — DEX's per-app sandbox is lighter; take the transactional/checksum/rollback idea, not the whole base-image system. |

### 08 · Notifications & system comm — VERIFIED

> Source: deep-research re-run `wf_72ce566b-036` (2026-06-23, 109 agents). 26
> sources, 122 claims, **25 verified (3-vote), 25 confirmed / 0 refuted**. (The
> run's synthesis step hit the session limit; findings synthesized by hand from the
> verified `confirmed` set.) Heavily primary-sourced (freedesktop spec, MS Learn,
> Apple Developer/Support).

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| Urgency model: BYTE 0/1/2 = Low/Normal/Critical; **critical never auto-expires** | freedesktop org.freedesktop.Notifications | `shared/notifications/actionable.ts` | **P0** | Steal: the 3-level urgency + critical-persist rule; map onto the existing 4-level center priority. |
| `expire_timeout` sentinels: −1 server-default, 0 never, >0 ms | freedesktop spec | `actionable.ts resolveExpiry` | P1 | Steal: the sentinel semantics verbatim. |
| Actionable notifications: actions as (id,label) pairs + reserved `default`; categories keyed by an identifier string; inline text-input (quick reply); per-action options (auth-required / destructive / foreground) | Apple UN* + freedesktop | `actionable.ts` | **P0** | Steal: category↔action split + identifier binding; **authenticationRequired** gates sensitive actions on unlock. |
| Activation types (foreground / background / protocol); ≤5 inputs + ≤5 buttons caps; Scenario (reminder/alarm/incomingCall = persist until dismissed) | Microsoft adaptive toasts | `actionable.ts` | P1 | Steal: background activation for quick-reply without focus-steal; enforce the caps. Avoid: looping-audio scenarios unless wired to real audio. |
| Focus filtering: per-source **allow-list / silence-list** (not one global mute) + time-sensitive override as a per-app capability; per-app grouped/stacked Notification Center | macOS Focus + Notification Center | `actionable.ts passesFocus` + `center.ts` | **P0** | Steal: allow/silence lists + the time-sensitive break-through. Improve on the existing single-floor DND. |

### 09 · Cross-app & ecosystem — VERIFIED + IMPLEMENTED

> Two passes verified this domain: CfAPI (run `wf_72ce566b-036`) and the
> drag/Handoff/DPI trio (run `wf_5b3498b8-425`, 103 agents, 25 confirmed / 0
> refuted — synthesis dropped on a connection error, synthesized by hand from the
> confirmed set). Primary-sourced (WHATWG HTML spec, Apple Platform Security, Win32).

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| On-demand placeholder files: ~1 KB header, transparent **auto-hydrate** on access, dehydrate to reclaim space, pin = always-keep-local | Windows Cloud Files API (CfAPI) | `shared/sync/placeholderFile.ts` | P1 | Steal: the placeholder/hydration state machine + free-up-space sweep; present as normal files. |
| Drag dataTransfer: 9 `effectAllowed` × 4 `dropEffect` values + the constraint mapping; MIME-keyed insertion-ordered data store; read-only/protected access modes | WHATWG HTML Drag-and-Drop | `shared/crossapp/dragData.ts` | P1 | Verified: effectAllowed `copyMove`⇒{copy,move}, `all`⇒{copy,link,move}; types ASCII-lowercased, most-recent-last. |
| Per-Monitor-v2 DPI rescale on display change (size × DPI ratio, re-anchor to target = `WM_DPICHANGED` suggested rect) + per-display window position memory | Win32 high-DPI | `shared/display/perDisplay.ts` | P1 | Steal: rescale + per-(display,window) recall. |
| Cross-device Handoff: same-account trust boundary, short-lived advertisement, AES-256-GCM + **replay protection**, integrity-gated continuation | Apple Handoff security | `shared/crossapp/handoff.ts` | P2 | Verified: same-iCloud trust, BLE 4.2 pairing, 256-bit AES-GCM. DEX models trust + freshness + integrity (transport is the host's). |
| local-first / CRDT sync principles | Ink & Switch | (already shipped — live collab CRDT core) | — | Already built (see ROADMAP "live collab"). |

> **STATUS (2026-06-23) — 09 trio IMPLEMENTED.** `shared/crossapp/dragData.ts`
> (effect negotiation + data store), `shared/display/perDisplay.ts` (DPI rescale +
> WindowMemory), `shared/crossapp/handoff.ts` (`canContinueActivity` trust/freshness/
> integrity gate). 12 unit tests. tsc 0.

### 10 · Creative & media extensibility — VERIFIED + IMPLEMENTED

> Source: deep-research run `wf_d3798395-5bb` (2026-06-23, 105 agents). 23 sources,
> 104 claims, **25 verified (3-vote), 25 confirmed / 0 refuted**. It CONFIRMED the
> model already built and added three refinements (granularity, lifecycle
> preconditions, extension negotiation), now folded in. Primary-sourced (Apple
> AUv3/WWDC19-509, CLAP `plugin.h`/`thread-check.h`, Bitwig, Ardour).

| Feature | Source Inspiration | DEX Location | Priority | Note |
|---|---|---|---|---|
| Out-of-process **by default** (in-process an explicit trusted opt-in) + crash containment (restart budget → quarantine) | Apple AUv3 App Extensions | `shared/extensibility/pluginHost.ts` | **P0** | Verified: "AUv3 loaded out-of-process by default… if a plug-in crashes, the host won't." |
| **Configurable isolation granularity** (in-engine / together / per-manufacturer / per-plugin / individual) — plugins sharing a group key share one process | Bitwig (5 modes) + Ardour caveat | `pluginHost.ts isolationGroupKey` | **P0** | Steal: naive per-plugin OOP does NOT scale (context-switch can blow the realtime budget) → make it configurable + coalesce IPC. |
| Thread-affinity + **lifecycle active-state preconditions** (process⇒active; activate⇒initialized&!active; destroy⇒!active) | CLAP `plugin.h` | `pluginHost.ts canInvoke` | P1 | Verified bracket annotations; reject `process` off the audio thread / out of `active`. |
| String-keyed **extension negotiation** (`get_extension`→null if unsupported, forbidden pre-init; versioned) + opaque atomic state (host never reads the blob) | CLAP extensions + state | `pluginHost.ts negotiateExtension` + checksummed state | P1 | Steal: one query fn + string ids; treat the plugin as opaque. |
| Capability-scoped + typed IPC message contract (fail-closed) | AppContainer caps + CLAP | `pluginHost.ts` | P1 | Declared-capability-only + integrity-gated state restore. |

Media-capture/AVFoundation pipeline exposure (Core Image/Media Foundation/GStreamer
to inner apps) is genuinely native and remains for a native sprint, not headless.

> **09 leftovers (Handoff / drag-drop / per-monitor-DPI):** ran in this same focused
> pass but again produced **no surviving verified claims** (the run's budget went to
> the plugin-host corpus). They are sourced (Apple Handoff security, WHATWG DnD,
> Win32 hi-DPI) but not yet claim-verified — a final narrow run would close them.

> **STATUS (2026-06-23) — verified 08/09 findings IMPLEMENTED + WIRED; 10 modelled.**
> - **08** `shared/notifications/actionable.ts` — full actionable model, and **WIRED
>   LIVE** into the single `services/notify.ts` entry point: `urgency` derives
>   priority, `expireTimeout`/`scenario` resolve the banner's auto-dismiss, and
>   critical/alarm/incoming-call are persistent (NotificationBanners now treats
>   `duration<=0` as no-auto-dismiss).
> - **09** `shared/sync/placeholderFile.ts` — CfAPI placeholder/hydration machine.
> - **10** `shared/extensibility/pluginHost.ts` — out-of-process plugin-host model,
>   now research-VERIFIED + augmented (Bitwig isolation granularity, CLAP lifecycle
>   preconditions, `get_extension` negotiation).
> 66 unit tests across the three modules; renderer build green; tsc 0. REMAINING
> (genuinely): native media-capture/host execution (silicon) + a final narrow run
> to claim-verify the 09 Handoff/drag/DPI sources.

---

## OPEN QUESTIONS

1. Current GA status / API surface of the Windows MCP (On-device Agent) Registry — can
   DEX's signed app registry directly double as the UKI MCP server catalog?
2. On-device SLM performance on **commodity** (non-Copilot+, sub-40-TOPS / CPU-GPU-only)
   hardware most users actually have — the Phi Silica figures are NPU-specific.
3. Given AppContainer's default localhost-IPC block + Tauri's brokered Core, what concrete
   secure-IPC channel should DEX standardize cross-OS for inner-app data + shared dex.db?
4. Authoritative sources + prioritized backlog for domains 05–10.

---

*Cross-reference against `docs/ROADMAP.md` and `docs/TAURI-MIGRATION.md` before any
implementation sprint. Several findings (Tauri multi-process, signed registry, UKI
provider-agnostic routing) confirm or extend work DEX already has — verify before
building net-new.*
