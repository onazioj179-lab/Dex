# DEX — 500 Improvement Backlog

Authoritative tracking list for the post-cohesion-wave improvement program. Each item has a stable id (`<theme>-<seq>`), one-line scope, and acceptance criterion. Items are intentionally small enough to land in a single PR.

Themes (counts sum to 500):

| Theme | Code | Count |
|---|---|---|
| Accessibility                          | T1  | 60 |
| Iconography & visual polish            | T2  | 45 |
| Creative-suite features                | T3  | 70 |
| Collaboration & sync                   | T4  | 45 |
| Knowledge / UKI                        | T5  | 55 |
| Performance & stability                | T6  | 55 |
| Security & hardening                   | T7  | 35 |
| Testing & QA                           | T8  | 35 |
| UX & onboarding                        | T9  | 25 |
| Docs & content                         | T10 | 15 |
| Touch / pen / 10-finger                | T11 | 35 |
| Dock & shell peek                      | T12 | 25 |

Status legend: `[ ]` open · `[~]` in progress · `[x]` done.

---

## T1 — Accessibility (60)

- [ ] T1-001 — Imosion: aria-label every mute/solo/arm button. AC: axe-core reports 0 unlabeled buttons in mixer.
- [ ] T1-002 — Imosion: aria-label every track add/remove control.
- [ ] T1-003 — Imosion: aria-label transport controls (play/stop/record/loop/metronome).
- [ ] T1-004 — Imosion: aria-label file menu items.
- [ ] T1-005 — Imosion: aria-label export panel buttons.
- [ ] T1-006 — Imosion: aria-label split-clip and trim controls.
- [ ] T1-007 — Imosion: aria-label add-track menu items.
- [ ] T1-008 — Imosion: aria-label mastering panel knobs.
- [ ] T1-009 — Imosion: aria-label preset selector buttons.
- [ ] T1-010 — Imosion: keyboard nav between tracks (Up/Down arrows).
- [ ] T1-011 — Imosion: focus ring on every interactive surface.
- [ ] T1-012 — VINX: aria-label viewer transport buttons.
- [ ] T1-013 — VINX: aria-label timeline tool palette.
- [ ] T1-014 — VINX: aria-label clip context-menu items.
- [ ] T1-015 — VINX: keyboard nav between timeline tracks.
- [ ] T1-016 — PRISM: aria-label tool palette.
- [ ] T1-017 — PRISM: aria-label brush/size/opacity controls.
- [ ] T1-018 — PRISM: aria-label layer panel buttons.
- [ ] T1-019 — PRISM: keyboard shortcut hints in tooltips.
- [ ] T1-020 — FLUX: aria-label timeline keyframe controls.
- [ ] T1-021 — FLUX: aria-label effects panel.
- [ ] T1-022 — FLUX: aria-label property inspector fields.
- [ ] T1-023 — FORGE: aria-label primitive palette.
- [ ] T1-024 — FORGE: aria-label transform gizmo modes.
- [ ] T1-025 — AXL: aria-label drawing tool palette.
- [~] T1-026 — AXL: aria-label dimension and GD&T controls. (close buttons + share + AI panel labelled v4.5.0)
- [ ] T1-027 — Files: aria-label sidebar tree buttons.
- [ ] T1-028 — Files: aria-label item context menu.
- [ ] T1-029 — Files: keyboard rename (F2) wired everywhere.
- [ ] T1-030 — Browser: aria-label tab close, new-tab, address bar buttons.
- [ ] T1-031 — Settings: aria-label every panel toggle.
- [ ] T1-032 — Settings: keyboard nav between panels.
- [ ] T1-033 — Tasks: aria-label add/edit/delete buttons.
- [ ] T1-034 — Calendar: aria-label nav (prev month, today, view switcher).
- [ ] T1-035 — Notes: aria-label formatting toolbar.
- [ ] T1-036 — Gallery: aria-label sort/filter toolbar.
- [ ] T1-037 — Audio: aria-label playback controls.
- [ ] T1-038 — Vault: aria-label entry actions.
- [ ] T1-039 — Calculator: aria-label every button.
- [ ] T1-040 — Terminal: aria-label session tabs.
- [ ] T1-041 — Code: aria-label tab close + file picker.
- [ ] T1-042 — Power: aria-label profile selector.
- [ ] T1-043 — Workflows: aria-label step controls.
- [ ] T1-044 — Transfers: aria-label transfer item actions.
- [ ] T1-045 — Weather: aria-label location and unit toggles (done) — verify.
- [ ] T1-046 — Recents: aria-label per recent item.
- [ ] T1-047 — Dock: aria-current="true" on active app (done) — verify.
- [ ] T1-048 — Window header: aria-label minimize/maximize/close.
- [ ] T1-049 — Context menus: role="menu" + roving tabindex.
- [~] T1-050 — Modals: focus trap + initial focus + ESC closes. (useFocusTrap shipped v4.6.0)
- [~] T1-051 — Toasts: aria-live region. (liveRegion.announce shipped v4.6.0)
- [ ] T1-052 — Form fields: every input has an associated label.
- [~] T1-053 — Color contrast audit pass (target WCAG AA 4.5:1). (evaluateContrast / contrastRatio shipped v4.7.0)
- [ ] T1-054 — Provide skip-link to main content.
- [~] T1-055 — Reduced-motion: every animation respects `prefers-reduced-motion`. (useReducedMotion / a11yPrefs shipped v4.6.0)
- [~] T1-056 — High-contrast preference: honor `prefers-contrast: more`. (useHighContrast shipped v4.6.0)
- [~] T1-057 — Screen-reader announce when a window opens / closes. (liveRegion.announce shipped v4.6.0)
- [ ] T1-058 — Tooltips reachable via keyboard focus, not only hover.
- [~] T1-059 — Live region for download progress. (liveRegion.announce assertive shipped v4.6.0)
- [ ] T1-060 — Axe-core scan in CI; fail PR on new violations.

## T2 — Iconography & visual polish (45)

- [ ] T2-001..T2-030 — Add a 256px PNG for each remaining app id (30 apps). Generate from DexIcon SVG via build script. AC: `appicons/<id>.png` exists and AppIcon resolves it.
- [ ] T2-031 — DexIcon: add hover/active stroke-weight variants.
- [ ] T2-032 — DexIcon: light-theme color overrides where needed.
- [ ] T2-033 — Dock icon hover lift (4px) using transform, not margin.
- [ ] T2-034 — Dock icon press scale (0.94) on pointerdown.
- [~] T2-035 — Window header icon = AppIcon, not letter. [v4.9.0 palette helpers (lighten/darken/mix) for icon tinting.]
- [ ] T2-036 — Launcher tile icon = AppIcon at 32px.
- [ ] T2-037 — Recents icon = AppIcon at 16px.
- [ ] T2-038 — Search result icon = AppIcon at 18px.
- [ ] T2-039 — Notification icon = AppIcon at 18px.
- [ ] T2-040 — Splash screen wordmark uses real DEX logo, not placeholder.
- [ ] T2-041 — Settings sidebar icons reviewed for visual weight parity.
- [ ] T2-042 — Empty-state illustration set (glassy, monochrome) for each major app.
- [ ] T2-043 — Loading skeleton shapes match the layout they replace.
- [ ] T2-044 — Error-state icon set (cloud-off, plug, lock) standardized.
- [ ] T2-045 — Favicon + window taskbar icon match brand.

## T3 — Creative-suite features (70)

VINX (18):
- [ ] T3-001 — Timeline: ripple delete (option-drag).
- [ ] T3-002 — Timeline: slip / slide tools.
- [ ] T3-003 — Timeline: J/K/L shuttle.
- [ ] T3-004 — Viewer: scrubbing thumbnails on hover.
- [ ] T3-005 — Color: secondary color wheels.
- [ ] T3-006 — Audio: track-level EQ insert.
- [ ] T3-007 — Effects: drag-and-drop preset application.
- [ ] T3-008 — Export: per-track stems toggle.
- [ ] T3-009 — Render queue panel.
- [ ] T3-010 — Markers panel with shortcut M.
- [ ] T3-011 — Multi-cam edit angles UI.
- [ ] T3-012 — Stabilization preview.
- [ ] T3-013 — Speed-ramp curve editor.
- [ ] T3-014 — Title preset library.
- [ ] T3-015 — Captions auto-generate panel.
- [ ] T3-016 — Project autosave indicator.
- [ ] T3-017 — Source-monitor in/out points.
- [ ] T3-018 — Bin search with filters.

Imosion (18):
- [ ] T3-019 — Mixer scenes / snapshots.
- [ ] T3-020 — Step-sequencer pattern bank.
- [~] T3-021 — MIDI controller mapping panel. (midiMapping registry + mapCcValue shipped v4.7.0)
- [ ] T3-022 — Sidechain compression UI.
- [ ] T3-023 — Tempo / time-signature automation lane.
- [ ] T3-024 — Chord track preview.
- [ ] T3-025 — Vocal tuning preset menu.
- [~] T3-026 — Bus routing matrix. [v4.9.0 stateMachine helper for matrix transitions.]
- [ ] T3-027 — Loop browser drag-to-track.
- [~] T3-028 — Master limiter visualization (LUFS meter). (LufsMeter momentary/short-term shipped v4.7.0)
- [ ] T3-029 — Track freeze / bounce.
- [ ] T3-030 — Punch-in record markers.
- [ ] T3-031 — Take comping lanes.
- [ ] T3-032 — Mixer view density toggle.
- [ ] T3-033 — Project template library.
- [ ] T3-034 — Sample slicer pad view.
- [ ] T3-035 — Spectrum analyzer master insert.
- [ ] T3-036 — Render selection range.

PRISM (14):
- [ ] T3-037 — Brush dynamics editor.
- [ ] T3-038 — Custom brush import (.abr-like).
- [ ] T3-039 — Symmetry guides.
- [ ] T3-040 — Smart selection (color range).
- [ ] T3-041 — Healing brush.
- [ ] T3-042 — Liquify panel.
- [ ] T3-043 — Adjustment layers (curves, levels).
- [ ] T3-044 — Smart object resize without quality loss.
- [ ] T3-045 — Clipping masks UI.
- [ ] T3-046 — Layer styles (drop shadow, glow).
- [ ] T3-047 — Color picker eyedropper from anywhere.
- [ ] T3-048 — Pen-pressure → brush size and opacity mapping.
- [ ] T3-049 — Pen-tilt → brush angle.
- [ ] T3-050 — Export-as panel with format presets.

FLUX (12):
- [~] T3-051 — Bezier curve editor for keyframes. (cubicBezier/cubicBezierEasing/interpolateKeyframes shipped v4.5.0; editor UI pending)
- [x] T3-052 — Easing presets (in/out/elastic). EASING_PRESETS + ease() shipped v4.5.0.
- [ ] T3-053 — Pre-comps (nested compositions).
- [ ] T3-054 — Track matte attachment.
- [ ] T3-055 — Expression scripting on properties.
- [ ] T3-056 — Effect masks per layer.
- [ ] T3-057 — 3D layer mode + camera.
- [~] T3-058 — Particles emitter built-in. (ParticleEmitter simulation shipped v4.7.0)
- [ ] T3-059 — Text animator presets.
- [ ] T3-060 — Render queue presets.
- [ ] T3-061 — Time-remap tool.
- [ ] T3-062 — Motion-tracking attach to layer.

FORGE (8):
- [ ] T3-063 — Boolean ops (union/subtract/intersect) UI.
- [ ] T3-064 — Material library panel.
- [ ] T3-065 — Lighting environment HDRI picker.
- [ ] T3-066 — Camera presets (top/front/side/persp).
- [~] T3-067 — Snap-to-grid + edge snap. (snapToGrid / snapBoxToBoxes shipped v4.7.0)
- [ ] T3-068 — Subdivide / smooth shading.
- [ ] T3-069 — Export glTF / OBJ / STL.
- [ ] T3-070 — Render-to-PNG button.

## T4 — Collaboration & sync (45)

- [ ] T4-001 — Nexus: presence panel (avatar list with status dots).
- [ ] T4-002 — Nexus: cursor sync stub for shared docs.
- [~] T4-003 — Nexus: comment threads pinned to canvas regions. (Comment + anchor data layer shipped v4.5.0; render pending)
- [ ] T4-004 — Nexus: notifications inbox.
- [ ] T4-005 — Nexus: invite link generator.
- [ ] T4-006 — Nexus: role permissions UI (view/comment/edit/admin).
- [ ] T4-007 — Nexus: history panel (versions).
- [~] T4-008 — Nexus: diff view between versions. (lineDiff + diffStats shipped v4.5.0; UI pending)
- [ ] T4-009 — Nexus: revert to version action.
- [ ] T4-010 — Nexus: session timeline.
- [ ] T4-011 — Nexus: chat panel (text only).
- [ ] T4-012 — Nexus: voice toggle (uses WebRTC, optional).
- [ ] T4-013 — Nexus: screen-share toggle.
- [ ] T4-014 — Collab Hub: combined activity feed.
- [ ] T4-015 — Collab Hub: mention highlighting.
- [ ] T4-016 — Collab Hub: search across comments.
- [ ] T4-017 — Files: shared-with-me filter.
- [ ] T4-018 — Files: link sharing dialog.
- [ ] T4-019 — Files: per-file permission editor.
- [ ] T4-020 — Files: conflict resolution UI on simultaneous edit.
- [ ] T4-021 — Notes: collaborative cursors.
- [~] T4-022 — Notes: comment thread per paragraph. (Comment data layer shipped v4.5.0)
- [ ] T4-023 — Tasks: assign-to-user.
- [~] T4-024 — Tasks: comment thread per card. (Comment data layer shipped v4.5.0)
- [ ] T4-025 — Calendar: shared calendar overlay.
- [ ] T4-026 — Calendar: meeting invite send.
- [ ] T4-027 — Workflows: shared run history.
- [ ] T4-028 — Sync engine: pause/resume button (visible).
- [ ] T4-029 — Sync engine: per-folder enable.
- [ ] T4-030 — Sync engine: bandwidth limit slider.
- [ ] T4-031 — Sync engine: conflict log panel.
- [ ] T4-032 — Sync engine: encryption indicator on every panel.
- [ ] T4-033 — Activity feed: filter by app.
- [ ] T4-034 — Activity feed: filter by user.
- [ ] T4-035 — Activity feed: filter by date range.
- [x] T4-036 — Notifications: do-not-disturb toggle. setDnd/shouldDeliver shipped v4.5.0.
- [x] T4-037 — Notifications: per-app mute. setAppMuted shipped v4.5.0.
- [x] T4-038 — Notifications: snooze. snoozeApp shipped v4.5.0.
- [~] T4-039 — Presence: idle/away/busy detection. (IdleDetector shipped v4.6.0)
- [~] T4-040 — Presence: custom status string. (presence.setCustomText shipped v4.5.0)
- [ ] T4-041 — Profile: avatar upload + crop.
- [ ] T4-042 — Profile: bio + links.
- [ ] T4-043 — Profile: timezone display on hover.
- [ ] T4-044 — Org: workspace switcher.
- [ ] T4-045 — Org: invite-by-email flow.

## T5 — Knowledge / UKI (55)

- [~] T5-001 — UKI graph: zoom + pan + minimap. (zoomPan transform helpers shipped v4.8.0)
- [~] T5-002 — UKI graph: node search. (fuzzySearch scorer + filter shipped v4.8.0)
- [ ] T5-003 — UKI graph: cluster collapse / expand.
- [ ] T5-004 — UKI graph: filter by source app.
- [ ] T5-005 — UKI graph: filter by date.
- [ ] T5-006 — UKI graph: filter by tag.
- [ ] T5-007 — UKI graph: pin nodes.
- [ ] T5-008 — UKI graph: shortest-path tool.
- [ ] T5-009 — UKI graph: export PNG / SVG.
- [~] T5-010 — RAG: streaming token output. [v4.11.0 tokenStream chunked tokenizer.]
- [~] T5-011 — RAG: citation chips beneath answers. [v4.11.0 citation parser foundation.]
- [ ] T5-012 — RAG: source preview on chip hover.
- [ ] T5-013 — RAG: model picker (local / cloud).
- [ ] T5-014 — RAG: temperature / top-p sliders.
- [ ] T5-015 — RAG: function calling support.
- [ ] T5-016 — RAG: tool use trace panel.
- [ ] T5-017 — RAG: stop / regenerate.
- [ ] T5-018 — RAG: branch conversation.
- [ ] T5-019 — RAG: pin message.
- [ ] T5-020 — RAG: export conversation as note.
- [ ] T5-021 — Indexing: per-folder enable / exclude.
- [ ] T5-022 — Indexing: progress + queue panel.
- [ ] T5-023 — Indexing: file-type filters.
- [ ] T5-024 — Indexing: re-index button.
- [ ] T5-025 — Indexing: redaction rules (PII).
- [ ] T5-026 — Memory: short-term vs long-term tabs.
- [ ] T5-027 — Memory: edit memory entry.
- [ ] T5-028 — Memory: delete memory entry.
- [ ] T5-029 — Memory: usage stats per memory.
- [ ] T5-030 — Memory: memory clusters tab.
- [ ] T5-031 — Voice: push-to-talk hotkey.
- [ ] T5-032 — Voice: continuous listening with wake word.
- [ ] T5-033 — Voice: transcript saved to notes.
- [ ] T5-034 — Voice: language picker.
- [ ] T5-035 — Voice: voice profile selector.
- [ ] T5-036 — Plugins: registry browser.
- [ ] T5-037 — Plugins: install / disable / uninstall actions.
- [ ] T5-038 — Plugins: permission diff on update.
- [ ] T5-039 — Plugins: developer mode console.
- [ ] T5-040 — Plugins: hot-reload during dev.
- [ ] T5-041 — Knowledge cards: hover tooltip with summary.
- [ ] T5-042 — Knowledge cards: pin to home.
- [ ] T5-043 — Knowledge cards: share to collab.
- [ ] T5-044 — UKI: timeline view.
- [ ] T5-045 — UKI: inbox of new captures awaiting tagging.
- [ ] T5-046 — UKI: bulk-tag operation.
- [x] T5-047 — UKI: smart-collection rules. SmartRule + applyCollection (eq/contains/startsWith/endsWith/gt/lt) shipped v4.5.0.
- [x] T5-048 — UKI: duplicate detection. shingles/jaccard/findDuplicates (>=0.85 threshold) shipped v4.5.0.
- [ ] T5-049 — UKI: missing-link suggestions.
- [ ] T5-050 — UKI: weekly digest email.
- [ ] T5-051 — Embeddings: model picker.
- [ ] T5-052 — Embeddings: dimension / cost display.
- [ ] T5-053 — Embeddings: re-embed all action.
- [ ] T5-054 — Embeddings: vector store backend selector.
- [ ] T5-055 — UKI: data export bundle (zip).

## T6 — Performance & stability (55)

- [~] T6-001 — Virtualize Files list when items > 500. (useVirtualList shipped v4.6.0)
- [~] T6-002 — Virtualize Notes list. (useVirtualList shipped v4.6.0)
- [~] T6-003 — Virtualize Tasks list. (useVirtualList shipped v4.6.0)
- [~] T6-004 — Virtualize Gallery grid. (useVirtualList shipped v4.6.0)
- [~] T6-005 — Virtualize Recents list. (useVirtualList shipped v4.6.0)
- [~] T6-006 — Virtualize Search results. (useVirtualList shipped v4.6.0)
- [ ] T6-007 — Lazy-load every standalone app via React.lazy.
- [ ] T6-008 — Code-split per major surface (Settings panels).
- [~] T6-009 — Memoize selectors in zustand stores. [v4.12.0 generic memoize() w/ FIFO max.]
- [ ] T6-010 — Audit and add React.memo on hot leaf components.
- [ ] T6-011 — Replace inline styles with CSS classes on hot paths.
- [ ] T6-012 — Dock: avoid full re-render on hover (item-local state).
- [ ] T6-013 — FloatingWindow: drag uses transform, not left/top.
- [ ] T6-014 — FloatingWindow: resize uses CSS aspect-ratio where possible.
- [~] T6-015 — Cancel in-flight fetches on app close. (useFetchJson AbortController shipped v4.6.0; v4.13.0 combineAbortSignals + abortPromise combinator.)
- [~] T6-016 — Throttle scroll listeners to rAF. (rafThrottle helper shipped v4.8.0; v4.12.0 time-based throttle() + debounceFn.)
- [~] T6-017 — Debounce text-input → store updates. (useDebounced shipped v4.6.0; v4.12.0 debounceFn for non-React paths.)
- [ ] T6-018 — Web workers for image processing in PRISM/FLUX.
- [~] T6-019 — Web workers for FFT in Imosion visualizers. [v4.9.0 retry helper + workerPool already shipped — FFT migration pending.]
- [~] T6-020 — Worker pool for thumbnail generation. (WorkerPool shipped v4.8.0)
- [ ] T6-021 — Off-screen canvas for VINX preview render.
- [~] T6-022 — IndexedDB cache for thumbnails. (AsyncCache TTL+LRU shipped v4.8.0)
- [~] T6-023 — IndexedDB cache for embeddings. [v4.11.0 idbCache KV layer w/ memory fallback.]
- [~] T6-024 — LRU eviction for caches. (LRU class shipped v4.6.0)
- [ ] T6-025 — Detach unused canvases when window minimized.
- [~] T6-026 — Pause animations when window not visible. (useDocumentVisible shipped v4.6.0)
- [~] T6-027 — Pause polling when document.hidden. (useDocumentVisible shipped v4.6.0)
- [ ] T6-028 — Tear down audio nodes on Imosion close.
- [~] T6-029 — Leak audit: every useEffect cleans up timers. (useTimeout/useInterval shipped v4.6.0)
- [~] T6-030 — Leak audit: every useEffect cleans up event listeners. (useEventListener shipped v4.6.0)
- [~] T6-031 — Leak audit: zustand subscriptions unsubscribed. [v4.10.0 deepEqual + EventBus.clear primitives.]
- [~] T6-032 — Leak audit: requestAnimationFrame cancelled. (useRaf shipped v4.6.0)
- [ ] T6-033 — Bundle analyzer in build pipeline.
- [ ] T6-034 — Tree-shake icon library imports.
- [~] T6-035 — Replace moment-style date libs with native Intl. [v4.9.0 timeFormat module — formatDuration/formatRelative without deps.]
- [ ] T6-036 — Lazy-load wallpaper images by viewport.
- [ ] T6-037 — Image srcset for high-DPI displays.
- [ ] T6-038 — Webp conversion in build for static images.
- [ ] T6-039 — Preload critical fonts.
- [ ] T6-040 — Subset fonts to used glyphs.
- [ ] T6-041 — Audit synchronous localStorage reads.
- [~] T6-042 — Audit synchronous JSON.parse on hot paths. [v4.11.0 ChunkedJsonParser for streaming/NDJSON.]
- [ ] T6-043 — Heap snapshot baseline + regression check in CI.
- [~] T6-044 — Long-task tracker logs spans > 50ms. (longTask + measureSpan shipped v4.7.0)
- [ ] T6-045 — INP / LCP perf budget per app.
- [ ] T6-046 — Crash reporter integration (renderer + main).
- [~] T6-047 — Auto-recover unsaved state on crash. (crashRecovery save/load + autoSave shipped v4.7.0)
- [ ] T6-048 — Watchdog for runaway main-process workers.
- [~] T6-049 — Renderer process restart on white-screen detection. (downloadBlob exports + EventBus pub/sub infra shipped v4.8.0; v4.11.0 detectWhiteScreen heuristic added.)
- [ ] T6-050 — Telemetry opt-in dashboard.
- [ ] T6-051 — Slow-render warning overlay (dev only).
- [ ] T6-052 — FPS overlay (dev only) toggle.
- [ ] T6-053 — Memory pressure indicator (dev only).
- [ ] T6-054 — IPC latency overlay (dev only).
- [ ] T6-055 — Don't auto-downgrade perf-tier from heap usage (DONE this wave).

## T7 — Security & hardening (35)

- [ ] T7-001 — IPC: validate every channel payload with zod schema.
- [~] T7-002 — IPC: deny-by-default on unknown channels. [v4.10.0 base64 + uuid + deepMerge feed permissioned IPC envelope work.]
- [~] T7-003 — IPC: rate-limit per channel. [v4.13.0 TokenBucket + CircuitBreaker primitives.]
- [~] T7-004 — IPC: redact sensitive args from logs. (redactString / redactDeep shipped v4.7.0)
- [ ] T7-005 — Vault: argon2id for key derivation.
- [ ] T7-006 — Vault: AES-256-GCM for entry encryption.
- [ ] T7-007 — Vault: master-key never stored.
- [~] T7-008 — Vault: clipboard auto-clear after 30s. (secureClipboard.copySecret shipped v4.6.0)
- [~] T7-009 — Vault: lock-on-idle. (IdleDetector shipped v4.6.0)
- [~] T7-010 — Vault: audit log of access events. (audit append-only ring buffer shipped v4.7.0)
- [ ] T7-011 — Plugin sandbox: iframe with strict CSP.
- [~] T7-012 — Plugin sandbox: postMessage protocol with validated schema. (PluginSandbox.handleMessage shipped v4.7.0)
- [~] T7-013 — Plugin sandbox: per-plugin permission list. (PluginSandbox.has shipped v4.7.0)
- [~] T7-014 — Plugin sandbox: per-plugin storage quota. (PluginSandbox.storageSet quota check shipped v4.7.0)
- [~] T7-015 — Plugin sandbox: per-plugin network allowlist. (PluginSandbox.isHostAllowed shipped v4.7.0)
- [ ] T7-016 — Plugin signing: signature verification on install.
- [ ] T7-017 — Plugin signing: revocation list check.
- [ ] T7-018 — Dependency scan in CI (npm audit + sca tool).
- [ ] T7-019 — License audit (no GPL leakage).
- [ ] T7-020 — SBOM generation per release.
- [ ] T7-021 — CSP header on renderer (no inline scripts allowed).
- [ ] T7-022 — Disable Electron remote module verified.
- [ ] T7-023 — contextIsolation=true verified.
- [ ] T7-024 — nodeIntegration=false verified.
- [ ] T7-025 — webSecurity=true verified.
- [ ] T7-026 — Auto-update: signature pinning.
- [ ] T7-027 — Auto-update: rollback on failed boot.
- [ ] T7-028 — Settings: hide secrets in UI (mask + show-on-click).
- [~] T7-029 — Logs: redact secrets via regex pre-write. (redactString / redactDeep shipped v4.7.0)
- [~] T7-030 — Crash dumps: strip PII before submit. (redactCrashDump shipped v4.7.0)
- [ ] T7-031 — File pickers: enforce extension allowlist.
- [~] T7-032 — Clipboard reads: explicit user gesture required. (recordUserGesture/readClipboard shipped v4.6.0)
- [ ] T7-033 — Notification permission gated per app.
- [ ] T7-034 — Camera/mic permission gated per app.
- [ ] T7-035 — Pen-test checklist in `docs/SECURITY.md`.

## T8 — Testing & QA (35)

- [ ] T8-001 — data-testid on every dock button (DONE template — extend).
- [ ] T8-002 — data-testid on every launcher tile.
- [ ] T8-003 — data-testid on every window header button.
- [ ] T8-004 — data-testid on every primary toolbar button per app.
- [ ] T8-005 — data-testid on every modal close button.
- [ ] T8-006 — Playwright: dock launch each app (smoke).
- [ ] T8-007 — Playwright: window drag with mouse.
- [ ] T8-008 — Playwright: window drag with touch (iPad emulation).
- [ ] T8-009 — Playwright: long-press dock peek opens.
- [ ] T8-010 — Playwright: spotlight search opens app.
- [ ] T8-011 — Playwright: PRISM brush stroke produces non-empty canvas.
- [ ] T8-012 — Playwright: VINX timeline drag clip.
- [ ] T8-013 — Playwright: Imosion add track.
- [ ] T8-014 — Playwright: Files create/rename/delete folder.
- [ ] T8-015 — Playwright: Notes create/edit/save.
- [ ] T8-016 — Playwright: Tasks add/complete.
- [ ] T8-017 — Playwright: Calendar add event.
- [ ] T8-018 — Playwright: Settings change theme persists.
- [ ] T8-019 — Vitest: every store has at least one unit test.
- [ ] T8-020 — Vitest: every util has at least one unit test.
- [ ] T8-021 — Vitest: snapshot test for AppShell variants.
- [ ] T8-022 — Vitest: snapshot test for AppEmptyState/Error/Loading.
- [ ] T8-023 — Visual regression: Playwright screenshot diff for dock.
- [ ] T8-024 — Visual regression: each app first-paint screenshot.
- [ ] T8-025 — Perf: vitest benchmark for hot stores.
- [ ] T8-026 — Perf: bundle-size budget enforced in CI.
- [ ] T8-027 — Perf: lighthouse run on dev build.
- [ ] T8-028 — Coverage report uploaded per PR.
- [ ] T8-029 — Flaky test quarantine label + report.
- [x] T8-030 — Test data factory module. (testFactory shipped v4.8.0)
- [x] T8-031 — Mock IPC layer for renderer tests. (MockIpc shipped v4.8.0)
- [~] T8-032 — Mock filesystem for main-process tests. [v4.11.0 fsAdapter interface + InMemoryFsAdapter.]
- [ ] T8-033 — E2E parallelization in CI.
- [ ] T8-034 — Cross-platform CI matrix (win/mac/linux).
- [ ] T8-035 — Release smoke-test runbook.

## T9 — UX & onboarding (25)

- [ ] T9-001 — First-run welcome tour (dismissible).
- [ ] T9-002 — Per-app one-time tooltip pointing to a key feature.
- [~] T9-003 — Shortcut cheat-sheet overlay (Cmd/Ctrl+/). (shortcuts.cheatSheet shipped v4.6.0)
- [~] T9-004 — Command palette (Cmd/Ctrl+K) covers every action. (commandPalette registry + fuzzy search shipped v4.6.0)
- [ ] T9-005 — "What's new" panel after update.
- [ ] T9-006 — Empty home → suggested actions list.
- [~] T9-007 — Recovery banner if previous session crashed. (crashRecovery.previousSessionCrashed shipped v4.7.0)
- [ ] T9-008 — Backup-now button in Settings.
- [ ] T9-009 — Restore-from-backup wizard.
- [ ] T9-010 — Quick switcher (Cmd/Ctrl+Tab) between running apps.
- [ ] T9-011 — Drag a file onto the dock launches its default app.
- [ ] T9-012 — Drop-onto-dock-icon opens the file in that app.
- [ ] T9-013 — Recents quick action: pin to home.
- [x] T9-014 — Notification grouping by app. groupByApp shipped v4.5.0.
- [ ] T9-015 — Tooltips show keyboard shortcut next to label.
- [ ] T9-016 — Inline help (?) in every settings panel.
- [ ] T9-017 — In-app feedback button → opens compose with system info.
- [ ] T9-018 — Tutorial videos linked from each app's empty state.
- [ ] T9-019 — Hover guide overlay (press Alt) labels every visible control.
- [ ] T9-020 — Per-user theme preset editor.
- [~] T9-021 — Per-user shortcut remap UI. (shortcuts.setBinding/getBinding/resetBinding shipped v4.6.0)
- [x] T9-022 — Multi-window layout presets (save/load). workspaceLayouts.saveLayout/getLayout/listLayouts/deleteLayout shipped v4.5.0.
- [x] T9-023 — Workspace switcher (sets of windows). workspace field on layouts + listWorkspaces shipped v4.5.0.
- [ ] T9-024 — Focus mode (hide non-active windows).
- [x] T9-025 — Quiet hours scheduler. setQuietHours + inQuietHours (cross-midnight aware) shipped v4.5.0.

## T10 — Docs & content (15)

- [ ] T10-001 — Per-app user manual page in `docs/apps/<id>.md`.
- [ ] T10-002 — Quick-start guide.
- [ ] T10-003 — Keyboard shortcut sheet (printable).
- [ ] T10-004 — Touch gesture cheat sheet.
- [ ] T10-005 — Troubleshooting top-10 page.
- [ ] T10-006 — Glossary page.
- [ ] T10-007 — Privacy policy reviewed.
- [ ] T10-008 — Terms reviewed.
- [ ] T10-009 — Plugin developer guide.
- [ ] T10-010 — Plugin API reference (auto-generated).
- [ ] T10-011 — Architecture overview diagram.
- [ ] T10-012 — Threat model document.
- [ ] T10-013 — Release notes template.
- [ ] T10-014 — Contributing guide reviewed.
- [ ] T10-015 — Code of conduct reviewed.

## T11 — Touch / pen / 10-finger (35)

- [ ] T11-001 — Touch mode auto-detect on first touch event (DONE).
- [ ] T11-002 — Touch mode pinned via Settings → Input.
- [ ] T11-003 — Touch mode bumps hit-targets to 44px (DONE — verify).
- [ ] T11-004 — Touch mode expands window edge handles to 12px (DONE — verify).
- [ ] T11-005 — Long-press dock icon = peek (DONE).
- [ ] T11-006 — Short tap dock icon = launch (DONE).
- [~] T11-007 — 2-finger swipe-down on titlebar = minimize. (MultiTouchSwipe + swipeToShellAction shipped v4.5.0)
- [~] T11-008 — 2-finger swipe-up on titlebar = maximize. (action mapping shipped v4.5.0)
- [~] T11-009 — 3-finger swipe-left/right = cycle apps. (action mapping shipped v4.5.0)
- [~] T11-010 — 4-finger swipe-up = mission control / overview. (action mapping shipped v4.5.0)
- [ ] T11-011 — 5-finger pinch = show desktop.
- [ ] T11-012 — Pinch-to-zoom in PRISM viewport.
- [ ] T11-013 — Pinch-to-zoom in FLUX viewport.
- [ ] T11-014 — Pinch-to-zoom in AXL viewport.
- [ ] T11-015 — Pinch-to-zoom in Files thumbnails grid.
- [ ] T11-016 — Pinch-to-zoom in Gallery grid.
- [ ] T11-017 — 2-finger pan in scroll containers.
- [~] T11-018 — Pen pressure → PRISM brush size. (samplePen + applyBrushDynamics shipped v4.5.0)
- [~] T11-019 — Pen pressure → PRISM brush opacity. (applyBrushDynamics opacity scaling shipped v4.5.0)
- [~] T11-020 — Pen tilt → PRISM brush angle. (applyBrushDynamics tilt-angle shipped v4.5.0)
- [~] T11-021 — Pen pressure → FLUX brush stroke width. (applyBrushDynamics shipped v4.5.0)
- [~] T11-022 — Pen pressure → AXL pen tool weight. (applyBrushDynamics shipped v4.5.0)
- [x] T11-023 — Pen barrel-button → eraser. isEraserGesture shipped v4.5.0.
- [~] T11-024 — Palm rejection on canvases. (samplePen palm heuristic shipped v4.5.0)
- [ ] T11-025 — Imosion spectrum canvas: touch scrub.
- [ ] T11-026 — Imosion waveform canvas: pinch-zoom + touch scrub.
- [ ] T11-027 — Soft-keyboard affordance for kiosk text inputs.
- [ ] T11-028 — Auto-show OS soft keyboard on input focus in touch mode.
- [ ] T11-029 — Numeric soft pad for number-only inputs.
- [ ] T11-030 — Touch ripple feedback on tap.
- [ ] T11-031 — Long-press menu = right-click menu.
- [ ] T11-032 — Drag-to-select with finger in Files.
- [ ] T11-033 — Drag-to-reorder dock items with finger.
- [ ] T11-034 — Touch e2e suite (Playwright iPad emulation).
- [ ] T11-035 — Kiosk lock mode (single-app fullscreen).

## T12 — Dock & shell peek (25)

- [ ] T12-001 — DockPeek popover scaffolded (DONE — basic preview).
- [ ] T12-002 — DockPeek shows status chip (Running / Minimized / Not running).
- [ ] T12-003 — DockPeek shows last 3 recents from app's recent store.
- [ ] T12-004 — DockPeek shows live miniature thumbnail when running.
- [ ] T12-005 — DockPeek action: New.
- [ ] T12-006 — DockPeek action: Open recent.
- [ ] T12-007 — DockPeek action: Reveal in launcher.
- [ ] T12-008 — DockPeek action: Close all windows.
- [ ] T12-009 — DockPeek dismiss on pointer leave with grace.
- [ ] T12-010 — DockPeek dismiss on escape.
- [ ] T12-011 — DockPeek dismiss on outside tap.
- [ ] T12-012 — DockPeek keyboard accessible (focus + space/enter-hold).
- [ ] T12-013 — DockPeek arrow-key nav between actions.
- [ ] T12-014 — DockPeek share menu plumbing with right-click context menu.
- [ ] T12-015 — DockPeek entrance/exit animation respects reduced-motion.
- [ ] T12-016 — DockPeek surface uses Premium Glass v1 tokens.
- [ ] T12-017 — DockPeek pinning (keep open).
- [ ] T12-018 — DockPeek drag a recent to a window snap target.
- [ ] T12-019 — DockPeek for Home/Settings/Files prioritized first.
- [ ] T12-020 — DockPeek for creative suite (VINX/Imosion/PRISM/FLUX/FORGE/AXL).
- [ ] T12-021 — DockPeek for utility apps batch.
- [ ] T12-022 — DockPeek a11y: announce on open.
- [ ] T12-023 — DockPeek thumbnail uses html2canvas-style snapshot, throttled.
- [ ] T12-024 — DockPeek thumbnail caches per app (invalidate on focus loss).
- [ ] T12-025 — DockPeek opens via global hotkey on focused dock item.

---

## How to use this list

1. Pick an item by id. Each id maps cleanly to a single PR.
2. Update status `[ ]` -> `[~]` -> `[x]` in this file as you go.
3. When closing a PR, mention the id(s) in the description.
4. The companion file `docs/IMPROVEMENTS_500_INDEX.md` (TBD) will map each id to owning files for grep-and-do batches.
