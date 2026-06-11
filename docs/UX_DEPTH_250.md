# UX DEPTH 250 — Program Checklist

Approved plan: full UX depth across shell and apps. ~250 items, 8 workstreams.
Conventions: wire existing components from `src/renderer/components` (import via
`components/index.ts`); animations via `src/renderer/utils/MotionController.ts`
presets only; no new dependencies (no gsap/three/framer-motion); stage only,
never commit; batch verification at batch end (`npm run lint`); evidence lines
per batch in docs/REFINEMENT.md.

Status: `[x]` done, `[ ]` open, `[-]` intentionally skipped (reason inline).

## WS0 — Scaffold (UXD-001..005)

- [x] UXD-001 This checklist generated
- [x] UXD-002 REFINEMENT.md program section added
- [x] UXD-003 Baseline green: lint + full build verified at session start
- [x] UXD-004 Staged-state snapshot taken before session batches
- [x] UXD-005 Import conventions documented (header above)

## WS1 — Free tiers + immediate updates (UXD-006..025)

- [x] UXD-006 FEATURE_FLAGS_CONFIG: tasks/media/automation gates -> free
- [x] UXD-007 FEATURE_FLAGS_CONFIG: rewind/vinx/multi_window gates -> free
- [x] UXD-008 FEATURE_FLAGS_CONFIG: store/early_access gates -> free
- [x] UXD-009 FEATURE_FLAGS_CONFIG: team.* gates -> free
- [x] UXD-010 FEATURE_FLAGS_CONFIG: analytics/export/search/voice gates -> free
- [x] UXD-011 New installs: pro tier, no trial clock (loadLicense)
- [x] UXD-012 Existing installs: pinned to pro, expiry cleared (checkTrialStatus)
- [x] UXD-013 getLimits() returns null — no quotas on any tier
- [x] UXD-014 Licensing machinery kept intact and reversible (explicit non-goal)
- [x] UXD-015 AccountSettingsCard: PAYMENTS_ENABLED dead flag added
- [x] UXD-016 Manage-subscription button + UpgradePrompt hidden
- [x] UXD-017 Billing/PlanCompare/PaymentMethod panels gated off (files kept)
- [x] UXD-018 Plan line shows "Free — all features included"
- [x] UXD-019 Signed-out copy no longer mentions payments
- [-] UXD-020 Store.tsx plan checks — none exist on inspection; nothing to strip
- [x] UXD-021 ReleaseManager: autoDownload true, checkInterval 4h
- [x] UXD-022 ReleaseManager: install-on-quit (autoInstallOnAppQuit from config)
- [x] UXD-023 loadConfig pins autoDownload/autoInstall for existing installs
- [-] UXD-024 StatusBar restart pill — dropdown already persistent with
      Install & Restart action; second surface would be redundant
- [ ] UXD-025 FLAGGED FOR USER SIGN-OFF: tier/ad language in
      src/shared/policyDocuments.ts TERMS section 8, PRICING.md, TERMS.md

## WS2 — Micro-control adoption, creative apps (UXD-026..110)

Pattern key (defined once, applied per app):
(a) ResizablePanel on side panels, key `dex-resize-{app}-{panel}`
(b) CollapsiblePanel/CollapsibleToolGroup on tool/property groups
(c) ScrollEnhancements on long lists; react-virtual when >100 rows
(d) SmoothZoom on viewports (wire presets into existing zoom engines)
(e) AutosaveIndicator in command bar
(f) MotionController panelSlide/sidebarCollapse on panel transitions
(g) shared ColorPicker with recent swatches replacing ad-hoc color inputs
(h) ContextMenu on canvas/list objects

Heavy apps (9 items each: a,b,c,d,e,f,g,h + responsive-degradation audit):

| App | a | b | c | d | e | f | g | h | resp |
|---|---|---|---|---|---|---|---|---|---|
| vinx (UXD-026..034) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| prism (UXD-035..043) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| flux (UXD-044..052) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| forge (UXD-053..061) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| imosion (UXD-062..070) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| axl (UXD-071..079) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |
| canvas (UXD-080..088) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] |

Mid-weight apps (subset a+c+e, ~3 items each):

| App | a | c | e |
|---|---|---|---|
| PixelArt (UXD-089..091) | [ ] | [ ] | [ ] |
| DexCode (UXD-092..094) | [ ] | [ ] | [ ] |
| MarkdownEditor (UXD-095..097) | [ ] | [ ] | [ ] |
| PresentationBuilder (UXD-098..100) | [ ] | [ ] | [ ] |
| KanbanApp (UXD-101..103) | [ ] | [ ] | [ ] |
| Calendar (UXD-104..106) | [ ] | [ ] | [ ] |
| PDFViewer (UXD-107..109) | [ ] | [ ] | [ ] |
| ScreenRecorder (UXD-110a..c) | [ ] | [ ] | [ ] |

Shared one-time upgrades:
- [ ] UXD-111 ContextMenu submenu support
- [ ] UXD-112 ScrollEnhancements + MomentumScroller integration
- [ ] UXD-113 CollapsiblePanel keyboard toggle (a11y)

## WS3 — Nexus modernization in place (UXD-114..143)

Visual depth (12): layered node glow multi-pass `lighter` compositing
(UXD-114), z-depth size/alpha falloff (115), saturation falloff (116),
parallax starfield 2-3 layers (117), denser starfield (118), gradient
connection lines (119), traveling pulse dots (120), vignette (121),
HUD tabular numerals (122), HUD glass panels (123), tighter HUD typography
(124), film grain subtle overlay (125).
- [ ] UXD-114..125

Avatar (4): retire hexagons (126), breathing concentric rings (127),
particle orbit (128), tick-driven sync with graph pulse (129).
- [ ] UXD-126..129

Interaction (10): node hover glow (130), cursor affordance (131),
click-to-focus SpringAnimator camera ease (132), node search via SearchInput
(133), fly-to-result (134), node ContextMenu pin/hide/expand (135-137),
spring morph crossfade (138), keyboard orbit controls (139).
- [ ] UXD-130..139

Biometrics sidebar (4): real data or honest removal of stubs (140-141),
CollapsiblePanel wrap (142), enrollment flow feedback states (143).
- [ ] UXD-140..143

## WS4 — Notes depth (UXD-144..173)

Linking (6): [[wiki-link]] autocomplete (144-145), link resolution in
document model (146), bidirectional backlink index on save (147-148),
unlinked mentions panel (149).
- [ ] UXD-144..149

Structure (6): TOC/outline sidebar from headings (150-151), heading fold
(152), pinned-notes view (153), multi-tag filter AND/OR (154-155).
- [ ] UXD-150..155

Media (5): drag-drop attachments (156-157), inline image preview (158),
SmoothZoom lightbox (159), paste-image (160).
- [ ] UXD-156..160

Capture/history (7): global quick capture Ctrl+Shift+N (161-162), Inbox
note append (163), version snapshots bounded ring (164-165), restore UI
(166), snapshot on external import (167).
- [ ] UXD-161..167

Polish (6): MotionController toolbar feedback (168), ScrollEnhancements on
list (169), AutosaveIndicator in header (170), find-replace keyboard flow
(171), RichTextInput repoint or deprecate decision (172), notes list
virtualization >100 (173).
- [ ] UXD-168..173

## WS5 — Compact/mini mode + flexibility (UXD-174..198)

MiniShell:
- [x] UXD-176..178 MiniShell.tsx compact pill (active app + identity)
- [x] UXD-179..181 quick actions Notes/Timer/Clipboard (expand-then-act, all
      fire real listened events)
- [x] UXD-182 expand control
- [x] UXD-183 hover/press via MotionController cssTransitions
- [-] UXD-174..175,184 shared useMiniDrag hook + PiP refactor — deferred; OS
      window does the drag (frameless -webkit-app-region), so a JS momentum
      hook isn't needed for the main-window morph

Main process:
- [x] UXD-185 window:enter-compact IPC (saves bounds, shrinks to corner)
- [x] UXD-186 window:exit-compact restores bounds + resizable + min size
- [x] UXD-187 multi-display clamping via screen.getDisplayMatching work area
- [x] UXD-188 setAlwaysOnTop('floating'), non-resizable while compact
- [x] UXD-189 global Ctrl+Shift+M shortcut + Spotlight + Settings entry points
- [x] UXD-190 IPC via preload window.enterCompact/exitCompact (portable surface)

Flexibility:
- [x] UXD-191..192 compactMode zustand flag + App root overlay swap
- [x] UXD-193 apps keep running underneath (overlay, not unmount)
- [ ] UXD-194..198 per-app minSize registry, StageManager dock resize,
      QuickControls/AppOverview-from-compact — deferred to a later pass

## WS6 — Isolation + recovery levels (UXD-199..223)

L1 auto-restart (7): autoRestorApps setting (199), crash -> bounded retry
remount via AppStateMachine (200-202), recovered toast (203), budget
exhaustion falls back to crash card (204), setting surfaced in Settings (205).
- [x] UXD-199 autoRecoverApps pref added to shellPreferencesStore (default on)
- [x] UXD-200..202 ErrorBoundary auto-recovers via existing handleRecover while
      crashCount < 3 (bounded), gated on the pref
- [x] UXD-203 CrashScreen "Recovering..." state already visible during attempt
- [x] UXD-204 After 3 crashes, auto-recover stops; crash card takes over
- [x] UXD-205 Toggle surfaced in Settings shell section

L2 window bounds (8): debounced persister, key, display clamping, maximized.
- [x] UXD-206..207 windowStateKeeper.ts: debounced (500ms) save on move/resize
- [x] UXD-208 window-state.json in userData (main window)
- [x] UXD-209..210 loadWindowState validates visible overlap vs all displays
- [x] UXD-211 maximized state persisted (normal bounds while maximized)
- [-] UXD-212 reset-layout command — deferred to WS8 CommandPalette pass
- [-] UXD-213 per-app FloatingWindow bounds — only one consumer (Settings demo);
      main-window persistence is the real surface, done above

L3 crash workspace restore (6): journal + boot-time restore offer.
- [x] UXD-214..215 last-session journal in runningApps (debounced write)
- [x] UXD-216 clean-shutdown marked on pagehide/beforeunload
- [x] UXD-217..218 AppManager offers "Restore your workspace?" banner with
      one-click Restore action when last session ended unclean (<24h)
- [x] UXD-219 clean sentinel via journal.clean flag

Isolation hardening (4): deferred to Session 3.
- [ ] UXD-220..223

## WS7 — Accessibility depth (UXD-224..248)

- [ ] UXD-224..228 High-contrast palette defined + wired to existing toggle;
      WCAG contrast checker surfaced as dev overlay in DiagnosticsPanel
- [ ] UXD-229..232 Keyboard module consolidation (keyboardNav/
      keyboardNavigation/keyboardShortcuts -> one module + shims)
- [ ] UXD-233..240 Creative app keyboard access (7 heavy apps + shared
      focus-ring utility)
- [ ] UXD-241..244 Text-spacing controls, reduce-motion coverage audit,
      live-region announcements for autosave + recovery
- [ ] UXD-245..248 Focus traps on all modals, ARIA pass on StageManager +
      AppOverview, skip-link coverage

## WS8 — Shell polish + portability (UXD-249..263)

- [ ] UXD-249..253 SpotlightSearch fuzzy ranking + recents + app actions
- [ ] UXD-254..257 NotificationBanners dedup, priority queue, DND in compact
- [ ] UXD-258 CommandPalette/RegistryCommandPalette unification check
- [ ] UXD-259..263 Portability audit + TAURI-MIGRATION.md contract notes
