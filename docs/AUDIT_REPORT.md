# DEX Desktop App — Comprehensive Codebase Audit Report

**Date:** March 2, 2026  
**Version:** 1.3.0 (package.json) — partial references to 1.2.3 remain  
**Stack:** Electron 28 + React 18 + TypeScript 5 + Vite 5 + Zustand 4 + Tailwind 3

---

## TABLE OF CONTENTS
1. [Architecture Overview](#1-architecture-overview)
2. [File Inventory](#2-file-inventory)
3. [Search Components (Duplicate Analysis)](#3-search-components-duplicate-analysis)
4. [Error Boundaries](#4-error-boundaries)
5. [Performance Monitoring](#5-performance-monitoring)
6. [Auto-Save Functionality](#6-auto-save-functionality)
7. [Notification System](#7-notification-system)
8. [Keyboard Shortcuts & Keybindings](#8-keyboard-shortcuts--keybindings)
9. [IPC Channel Definitions](#9-ipc-channel-definitions)
10. [Theme System](#10-theme-system)
11. [Offline / Connectivity Handling](#11-offline--connectivity-handling)
12. [Rate Limiting & Throttling](#12-rate-limiting--throttling)
13. [Accessibility (a11y)](#13-accessibility-a11y)
14. [Analytics & Telemetry](#14-analytics--telemetry)
15. [Undo / Redo Implementations](#15-undo--redo-implementations)
16. [Engagement System](#16-engagement-system)
17. [TODO / FIXME / HACK / PLACEHOLDER Comments](#17-todo--fixme--hack--placeholder-comments)
18. [Cleanup Required](#18-cleanup-required)
19. [Hardcoded Version Strings](#19-hardcoded-version-strings)
20. [Console.log Statements (Production Risk)](#20-consolelog-statements-production-risk)
21. [Commented-Out Imports](#21-commented-out-imports)
22. [Missing Functionality & Gaps](#22-missing-functionality--gaps)
23. [Summary & Priority Actions](#23-summary--priority-actions)

---

## 1. ARCHITECTURE OVERVIEW

### Main Process (`src/main/`)
- **main.ts** — 1,970 lines. Application core, BrowserWindow, 100+ IPC handlers, controller/service init.
- **preload.ts** — 3,232 lines. Context bridge - exposes `window.electron`/`window.dex` API surface.
- **42 Controllers** (`src/main/controllers/`) — Action, Automation, Auth, AutoFill, Code, Connection, Data, DataExport, DeepSession, Device, Diagnostics, Encryption, FeatureFlags, FileIntelligence, FileManager, Gallery, Governance, Hotkey, HttpTransfer, Ideas, Learning, Media, Mode, Operations, Plugin, Power, Scheduler, Search, Security, Session, SystemIntelligence, SystemMap, Timeline, Transfer, Trust, Update, Vault, VoiceCommand, Voice, Watchdog, Workflow.
- **150+ Core modules** (`src/main/core/`) — Storage, Automation, Performance, Rewind, Security, AI, Clipboard, Patterns, UX, etc.
- **14 Security modules** (`src/main/security/`) — Auth Hardening, Data Migration, Identity Vault, IPC Validator, Network Hygiene, Permissions, Q1 Integration, Secure Keys, Secure Transfer, Security Continuum, Security Core, Session Hardening, Vault Hardening.
- **Runtime** (`src/main/runtime/`) — ActionEngine, CoreRuntime, ErrorClassifier, HardenedPython, Observability, ResourceManager, Scheduler.
- **Monitors** — EventMonitor, HealthMonitor.
- **Additional:** `src/main/agent/`, `src/main/ai/`, `src/main/analytics/`, `src/main/api/`, `src/main/automation/`, `src/main/bridge/`, `src/main/cli/`, `src/main/engine/`, `src/main/scripting/`, `src/main/sync/`, `src/main/utils/`.

### Renderer Process (`src/renderer/`)
- **App.tsx** — 781 lines. Root component with ErrorBoundary, theme init, AppManager, Spotlight, CommandPalette, ClipboardHistory, SystemFeatures.
- **AppManager.tsx** — 667 lines. macOS-style dock, Launchpad overlay, keep-alive multi-app rendering, per-app ErrorBoundary.
- **13 Pages** (`src/renderer/pages/`): Home, Files, Browser, Settings (2,027 lines), Transfers, Dashboard, Notes, Tasks, Power, Workflows, Gallery, Audio, Video.
- **19 DEX Applications** (`src/renderer/DEXAPPLICATIONS/`): VideoEditor, Imosion, Prism, Flux, Forge, Calculator, Calendar, PasswordGenerator, Rewind, Games + feature files (FluxFeatures, ForgeFeatures, ImosionEngine/Features, PrismEngine/Features, VideoEditorFeatures, features-index, RewindViewErrorBoundary).
- **130+ Components** (`src/renderer/components/`) — Full list includes UI primitives (Button, Input, Modal, Toast, etc.), system features (Spotlight, CommandPalette, ClipboardHistory, HelpPanel), advanced components (Kanban, RichTextEditor, DataTable, VirtualList, DragDrop), and per-feature components (AIHub, Equalizer, MediaPlayer, Annotation, etc.).
- **11 Services** (`src/renderer/services/`): AppStateMachine, engagement, ErrorBoundary, helpContent, index, IntegrityMonitor, LifecycleManager, PerformanceMonitor, SystemServices, undoManager, usePatternLearning.
- **19 Stores** (`src/renderer/store/`): appSubsystem, blackBoxStore, explainableSearchStore, fileIntelligenceStore, fileUsageStore, intentSessionStore, learningStore, mediaStore, missionStore, overrideStore, runningApps, securityStore, systemUndoStore, useAuthStore, useNavigationHistory, useOnboarding, useStore, useUndoRedo, useVaultStore.
- **26 Utils** (`src/renderer/utils/`): accessibility, accessibilityHooks, accessibilityIndex, animationBudget, crashRecovery, DeepWorkUtils, FileValidation, hardeningIndex, index, ipcWrapper, KeyboardManager, keyboardNavigation, performance, performanceHooks, performanceIndex, PerformanceManager, PerformanceUtils, q1FoundationHooks, releaseValidation, renderOptimization, simpleMode, stabilityHooks, systemAudit, UndoRedoManager, useKeyboardShortcuts, usePerformance.

### App Count: **23 apps total**
Home, Dashboard, Files, Browser, Transfers, Settings, Notes, Tasks, Workflows, Calendar, Gallery, Audio, Video, Power, Calculator, PasswordGenerator, VideoEditor (VINX), Imosion, PRISM, FLUX, FORGE, Rewind, Games.

---

## 2. FILE INVENTORY

### src/renderer/pages/ (13 files)
| File | App |
|------|-----|
| Home.tsx | Home Dashboard (730 lines) |
| Files.tsx | File manager |
| Browser.tsx | Web browser |
| Settings.tsx | System preferences (2,027 lines) |
| Transfers.tsx | AirDrop-style sharing |
| Dashboard.tsx | Widget dashboard |
| Notes.tsx | Note-taking |
| Tasks.tsx | To-do manager |
| Power.tsx | System controls |
| Workflows.tsx | Automation builder |
| Gallery.tsx | Photo/media gallery |
| Audio.tsx | Music player |
| Video.tsx | Video player |

### src/renderer/DEXAPPLICATIONS/ (19 files)
| File | Notes |
|------|-------|
| VideoEditor.tsx | VINX - Professional video editor |
| Imosion.tsx | DAW - Music production |
| Prism.tsx | Image editor |
| Flux.tsx | Motion graphics |
| Forge.tsx | Batch encoder |
| Calculator.tsx | Calculator |
| Calendar.tsx | Calendar |
| PasswordGenerator.tsx | Password generator |
| Rewind.tsx | Activity DVR |
| Games.tsx | Games hub |
| ImosionEngine.ts | Audio engine |
| ImosionFeatures.ts | Feature definitions |
| PrismEngine.ts | Image engine |
| PrismFeatures.ts | Feature definitions |
| FluxFeatures.ts | Feature definitions |
| ForgeFeatures.ts | Feature definitions |
| VideoEditorFeatures.ts | Feature definitions |
| features-index.ts | Feature aggregation |
| RewindViewErrorBoundary.tsx | Error boundary for Rewind |

### src/main/controllers/ (42 files)
ActionController, AudioController, AuthController, AutoFillController, AutomationController, CodeController, ConnectionController, DataController, DataExportController, DeepSessionController, DeviceController, DiagnosticsController, EncryptionController, FeatureFlagsController, FileIntelligenceController, FileManagerController, GalleryController, GovernanceController, HotkeyController, HttpTransferServer, IdeasController, LearningController, MediaController, ModeController, OperationsController, PluginController, PowerController, SchedulerController, SearchController, SecurityController, SessionController, SystemIntelligenceController, SystemMapController, TimelineController, TransferController, TrustController, UpdateController, VaultController, VoiceCommandController, VoiceController, WatchdogController, WorkflowController.

### src/main/security/ (14 files)
AuthHardening, DataMigration, IdentityVaultManager, index, IPCValidator, NetworkHygieneMonitor, PermissionManager, Q1Integration, SecureKeyManager, SecureTransferHub, SecurityContinuumManager, SecurityCore, SessionHardening, VaultHardening.

---

## 3. SEARCH COMPONENTS (DUPLICATE ANALYSIS)

**CRITICAL FINDING: 5 overlapping search implementations exist.**

| Component | File | Lines | Trigger | Used By |
|-----------|------|-------|---------|---------|
| **Spotlight** | `src/renderer/components/Spotlight.tsx` | 720 | Ctrl+Space | App.tsx |
| **UnifiedSearch** | `src/renderer/components/UnifiedSearch.tsx` | ? | Ctrl+K | AppManager.tsx |
| **GlobalSearch** | `src/renderer/components/GlobalSearch.tsx` | 407 | F3/Ctrl+F | SystemFeatures.tsx |
| **AdvancedSearch** | `src/renderer/components/AdvancedSearch.tsx` | 717 | — | (exports GlobalSearch) |
| **SearchSystem** | `src/renderer/components/SearchSystem.tsx` | ? | — | Unknown |

**Issues:**
- `Spotlight` (Ctrl+Space) and `UnifiedSearch` (Ctrl+K) are **both mounted simultaneously** — Spotlight in App.tsx, UnifiedSearch in AppManager.tsx.
- `GlobalSearch` is exported from AdvancedSearch.tsx AND exists as a standalone `GlobalSearch.tsx`.
- `SearchSystem.tsx` adds yet another search component.
- Users face 2+ search UIs that do similar things.

**Recommendation:** Consolidate into Spotlight as the single search entry point. Remove or merge UnifiedSearch, GlobalSearch, AdvancedSearch, SearchSystem.

---

## 4. ERROR BOUNDARIES

| Location | Type | Scope |
|----------|------|-------|
| `src/renderer/App.tsx` L471-550 | `AppErrorBoundary` class | **Top-level** — wraps entire app |
| `src/renderer/components/AppManager.tsx` L127-163 | `AppErrorBoundary` class | **Per-app** — wraps each rendered app |
| `src/renderer/services/ErrorBoundary.tsx` L97+ | `AppErrorBoundary` (exported) + `ProcessIsolation` | **Service-level** — used in AppRenderer |
| `src/renderer/DEXAPPLICATIONS/RewindViewErrorBoundary.tsx` | Rewind-specific | **Per-feature** |
| `src/renderer/utils/stabilityHooks.ts` L59 | Global error listeners | **Window-level** — uncaught errors |

**Issues:**
- **Three separate `AppErrorBoundary` classes** with identical names but different implementations:
  - App.tsx (top-level, with reload/dismiss)
  - AppManager.tsx (per-app, with retry counter max 3)
  - ErrorBoundary.tsx service (most feature-complete, with process isolation)
- The App.tsx AppRenderer wraps apps in `ProcessIsolation` from the service, while AppManager.tsx has its own simpler boundary.
- Only the AppManager keep-alive renderer actually uses the per-app boundary; the App.tsx AppRenderer uses ProcessIsolation instead.

**Recommendation:** Consolidate to one `AppErrorBoundary` (the service version) and ensure all app rendering paths use it.

---

## 5. PERFORMANCE MONITORING

| File | What |
|------|------|
| `src/renderer/services/PerformanceMonitor.tsx` | Zustand store: `usePerformanceMonitor` — system metrics, 10s polling, per-app metrics, health scoring |
| `src/renderer/utils/usePerformance.ts` | Hook: `usePerformance()` — FPS tracking, input latency, animation budgets, throttle levels |
| `src/renderer/utils/PerformanceManager.ts` | Class: `PerformanceStateMachine` + `usePerformanceState()` hook |
| `src/renderer/utils/performance.ts` | Utility performance functions |
| `src/renderer/utils/performanceHooks.ts` | Performance-related hooks |
| `src/renderer/utils/PerformanceUtils.ts` | Performance utility functions |
| `src/renderer/utils/renderOptimization.ts` | Frame time measurement |
| `src/main/core/PerformanceGuardian.ts` | Main-process performance monitoring |
| `src/main/core/PerformanceEnforcer.ts` | Performance budget enforcement |
| `src/main/core/PerformanceBooster.ts` | System optimization |
| `src/main/core/PerformanceOptimizer.ts` | Optimization algorithms |
| `src/main/core/PerformanceBudgetManager.ts` | Budget management |
| `src/main/core/PerformanceContract.ts` | Performance contracts |

**Issue:** 6+ renderer-side performance utilities with overlapping functionality. Consolidation opportunity.

---

## 6. AUTO-SAVE FUNCTIONALITY

| Location | Mechanism | Interval |
|----------|-----------|----------|
| `src/renderer/components/SystemFeatures.tsx` L324-370 | `useSessionAutoSave()` — saves running apps & active instance to localStorage | 30s + visibilitychange + beforeunload |
| `src/main/security/SessionHardening.ts` L760-768 | `startAutoSave()` — captures session snapshot | 30s (configurable) |
| `src/renderer/DEXAPPLICATIONS/VideoEditor.tsx` L1063-1065 | VideoEditor project auto-save | 60s |

**Status:** Auto-save is implemented at session level (renderer) and session hardening level (main). Individual apps like VideoEditor have their own auto-save. Notes, Tasks, and other apps save to localStorage on change (implicit).

---

## 7. NOTIFICATION SYSTEM

| Component | File | Type |
|-----------|------|------|
| **notificationStore** | `src/renderer/components/SystemFeatures.tsx` L20-51 | Simple in-memory store with pub/sub |
| **SimpleToast** | `src/renderer/components/SystemFeatures.tsx` L76+ | Toast display (4s auto-dismiss) |
| **NotificationCenter** | `src/renderer/components/NotificationCenter.tsx` | Full notification center component |
| **NotificationSystem** | `src/renderer/components/NotificationSystem.tsx` | System-level notifications |
| **NotificationBadge** | `src/renderer/components/NotificationBadge.tsx` | Badge indicator |
| **Toast** | `src/renderer/components/Toast.tsx` | UI primitive |
| **Alert** | `src/renderer/components/Alert.tsx` | Alert component |
| **Native Notification** | `src/renderer/utils/stabilityHooks.ts` L210 | Uses `new Notification()` for stability alerts |
| **Main-process** | `src/main/core/NotificationCenter.ts` | Server-side notification center |

**Issue:** Multiple overlapping notification mechanisms. The SystemFeatures notification store is simple but the full NotificationCenter/NotificationSystem components may not be integrated.

---

## 8. KEYBOARD SHORTCUTS & KEYBINDINGS

### Global Shortcuts (App.tsx / AppManager.tsx)
| Shortcut | Action | Registered In |
|----------|--------|---------------|
| `Ctrl+Space` | Toggle Spotlight Search | `Spotlight.tsx` useSpotlight hook |
| `Ctrl+Shift+P` | Toggle Command Palette | `CommandPalette.tsx` useCommandPalette hook |
| `Ctrl+Shift+V` | Toggle Clipboard History | `ClipboardHistory.tsx` useClipboardHistory hook |
| `Ctrl+K` | Toggle UnifiedSearch | `AppManager.tsx` L291 |
| `Ctrl+Shift+Q` | Close all apps | `AppManager.tsx` L282 |
| `Alt+Left/Right` | Navigate back/forward | `AppManager.tsx` L285-286 |
| `F11` | Toggle dock auto-hide | `AppManager.tsx` L288 |
| `F4` | Toggle Launchpad | `AppManager.tsx` L289 |
| `Ctrl+\` | Toggle dock | `AppManager.tsx` L290 |
| `Ctrl+1` | Go to Home | `AppManager.tsx` L292 |
| `Ctrl+2` | Go to Settings | `AppManager.tsx` L292 |

### Creative Suite Shortcuts
| Shortcut | Action |
|----------|--------|
| `Alt+V` | Open VINX Video Editor |
| `Alt+I` | Open Imosion DAW |
| `Alt+R` | Open PRISM Image Editor |
| `Alt+F` | Open FLUX Motion |
| `Alt+G` | Open FORGE Encoder |

### SystemFeatures Shortcuts (`src/renderer/components/SystemFeatures.tsx` L119-162)
| Shortcut | Action |
|----------|--------|
| `Ctrl+F` / `F3` | Global Search |
| `Ctrl+B` | Toggle Notifications |
| `Ctrl+J` | Toggle Theme |
| `Ctrl+Shift+N` | New Note |
| `Ctrl+Shift+T` | New Task |

### Spotlight Listed Shortcuts (in search results)
| Shortcut | App |
|----------|-----|
| `Ctrl+E` | Files |
| `Ctrl+N` | Notes |
| `Ctrl+,` | Settings |

### Additional Keyboard Systems
| File | Purpose |
|------|---------|
| `src/renderer/utils/useKeyboardShortcuts.ts` | Global keyboard accessibility framework |
| `src/renderer/utils/KeyboardManager.ts` | Keyboard management hooks |
| `src/renderer/utils/keyboardNavigation.ts` | Focus trap, arrow-key navigation |
| `src/renderer/utils/accessibilityHooks.ts` | Keyboard shortcut hooks |
| `src/renderer/components/KeyboardShortcuts.tsx` | Keyboard shortcuts component |
| `src/renderer/components/KeyboardNav.tsx` | Keyboard navigation component |
| `src/renderer/components/Keyboard.tsx` | Keyboard UI component |
| `src/main/controllers/HotkeyController.ts` | Main-process hotkey registration |
| `src/main/core/KeyboardCommandSystem.ts` | System-level keyboard commands |

**Issues:**
- **Shortcut conflict:** `Ctrl+Shift+T` is used for "New Task" in SystemFeatures AND is the standard browser "reopen closed tab" shortcut.
- **Inconsistency in runningApps.ts:** Defines `Ctrl+N` for Notes and `Ctrl+T` for Tasks (APP_DEFINITIONS), but Spotlight shows `Ctrl+E` for Files while AppManager doesn't register it.
- **Duplicate shortcut handlers:** Multiple keydown listeners on `window` from different components.
- **No shortcut conflict detection system.**

---

## 9. IPC CHANNEL DEFINITIONS

### main.ts registered handlers (50+ discovered, 100+ across all controllers):

**Window:** `window:minimize`, `window:maximize`, `window:close`, `window:hide`

**Settings:** `settings:apply`, `settings:get`, `settings:save`

**Actions:** `action:execute`, `action:getAll`, `action:save`, `action:delete`, `action:getRunningApps`, `action:closeApp`

**Modes:** `mode:getAll`, `mode:getActive`, `mode:activate`, `mode:deactivate`, `mode:save`, `mode:delete`

**Rules:** `rule:getAll`, `rule:save`, `rule:delete`, `rule:toggle`

**System:** `system:getStatus`, `system:getProcesses`, `dialog:showOpenDialog`, `fs:readdir`

**Resources:** `resource:getSnapshot`, `resource:getPressure`, `resource:getThrottleLevel`, `resource:getBudgets`

**Logs/Health:** `logs:get`, `logs:clear`, `health:getVerification`, `health:check`, `health:getStatus`, `health:getLogs`

**Phase51:** `phase51:getStatus`, `phase51:getReport`, `phase51:getPerformance`, `phase51:getCapabilities`, `phase51:getDevices`, `phase51:getStability`, `phase51:getPlugins`

**Devices:** `devices:list`, `devices:browse`, `devices:import`, `devices:export`

**Capabilities:** `capability:fileSystem:list`, `capability:fileSystem:copy`, `capability:fileSystem:move`, `capability:transfer:getStats`, `capability:storage:get`

**From other files:**
- **Sync:** `sync:get-config`, `sync:update-config`, `sync:get-devices`, `sync:remove-device`, `sync:perform`, `sync:send-command`, `sync:get-conflicts`, `sync:resolve-conflict`, `sync:start-server`, `sync:stop-server`
- **Scripting:** `scripting:get-scripts`, `scripting:get-script`, `scripting:create-script`, `scripting:update-script`, etc.
- **Rewind:** `rewind:getAIStatus`, `rewind:getBackupSettings`, `rewind:setBackupSchedule`, `rewind:setBackupFolder`, `rewind:runBackupNow`, `rewind:pickBackupFolder`, `rewind:restoreBackupFromPicker`
- **Vault:** `vaultHardening:createBackup`, `vaultHardening:restoreBackup`
- **Update:** `update:listBackups`, `update:restore`, `update:rollback`
- **Network:** `network:addPolicy`, `network:removePolicy`, `network:testDomain`

**AI Hub:** **DISABLED** — `src/main/main.ts` L161-162: `// AI Integration (Phase 56-57) - DISABLED` with commented import.

---

## 10. THEME SYSTEM

| Component | File | Mechanism |
|-----------|------|-----------|
| CSS Design System | `src/renderer/styles/globals.css` | `:root` variables, DARK MODE LOCKED |
| Design System CSS | `src/renderer/styles/design-system.css` | `[data-theme="dark"]` selector |
| Theme Store | `src/renderer/store/useStore.ts` | Zustand: `useThemeStore` with `toggleTheme()` |
| ThemeManager | `src/renderer/components/ThemeManager.tsx` | `initializeTheme()`, `toggleTheme()`, `getCurrentTheme()` |
| ThemeSystem | `src/renderer/components/ThemeSystem.tsx` | Additional theme component |
| App.tsx init | `src/renderer/App.tsx` L431-466 | `initializeTheme()` reads localStorage, sets `data-theme` attribute |
| Settings init | `src/renderer/pages/Settings.tsx` L340-400 | Forces dark mode, applies accent color |
| index.html | `src/renderer/index.html` L39-45 | CSS for both light and dark `data-theme` |
| SystemFeatures | `src/renderer/components/SystemFeatures.tsx` L213 | `handleThemeToggle` via ThemeManager |

**Issues:**
- The globals.css header says **"DARK MODE LOCKED"** and Settings L435-436 says `darkMode: true, // Always dark mode - no switching`.
- However, `useStore.ts` has a fully functional `toggleTheme()` and `index.html` has light mode CSS.
- `ThemeManager.tsx`, `ThemeSystem.tsx`, and the CSS all support light mode.
- **Contradiction:** Settings locks to dark mode, but the infrastructure supports light mode. Need to decide: enable light mode or truly remove it.

---

## 11. OFFLINE / CONNECTIVITY HANDLING

| Location | Implementation |
|----------|---------------|
| `src/renderer/store/securityStore.ts` L77-138 | `NetworkStatus` & `ConnectivityState` interfaces, `loadNetworkStatus()` using `navigator.onLine` |
| `src/shared/types.ts` L340, L488 | `status: 'online' \| 'offline' \| 'busy' \| 'unknown'` |
| `src/renderer/types/global.d.ts` L813 | `getConnectivity: () => Promise<any>` |
| `src/main/core/NetworkGuard.ts` | Network policy enforcement, domain blocking |
| `src/main/security/NetworkHygieneMonitor.ts` | Network security monitoring |

**Status:** Basic connectivity detection via `navigator.onLine` and IPC to main process. No visible offline mode UI or graceful degradation shown in the renderer pages.

---

## 12. RATE LIMITING & THROTTLING

| Location | Type |
|----------|------|
| `src/shared/validation.ts` L342-363 | `validateRateLimit()` function |
| `src/renderer/utils/usePerformance.ts` L180-186 | Mouse move throttle (250ms) |
| `src/renderer/utils/usePerformance.ts` L130-148 | FPS report throttle (1s) |
| `src/renderer/utils/UndoRedoManager.tsx` L25-62 | Undo/redo debounce (300ms) |
| `src/renderer/utils/stabilityHooks.ts` L125-131 | Activity recording debounce (1000ms) |
| `src/main/security/IPCValidator.ts` | IPC rate limiting/validation |

**Status:** Basic throttling/debouncing in place for performance-sensitive operations. No visible API-level rate limiting for user actions.

---

## 13. ACCESSIBILITY (a11y)

| File | Scope |
|------|-------|
| `src/renderer/utils/accessibility.ts` | Focus trap, arrow-key navigation, screen reader utilities |
| `src/renderer/utils/accessibilityHooks.ts` | `useKeyboardShortcut`, `useGlobalShortcut`, `useAccessibleDisclosure`, `useAriaLive` |
| `src/renderer/utils/accessibilityIndex.ts` | Accessibility barrel export |
| `src/renderer/utils/systemAudit.ts` L317-393 | Automated a11y audit: skip links, landmarks, img alt, button labels, input labels |
| `src/renderer/utils/useKeyboardShortcuts.ts` L250 | Focusable element selectors |
| `src/renderer/components/Accessibility.tsx` | Accessibility component |
| `src/renderer/utils/keyboardNavigation.ts` | Focus management |

**Issues:**
- Most inline-style components (Spotlight, AppManager, Home) **lack `aria-*` attributes, `role` attributes, and proper `tabIndex` usage**.
- Spotlight has only `tabIndex={-1}` on filter buttons — no `aria-label` on the search input, no `role="listbox"` on results.
- Dock buttons have no `aria-label`.
- The a11y infrastructure exists in utils but is **not integrated** into the main UI components.

---

## 14. ANALYTICS & TELEMETRY

| Location | Type |
|----------|------|
| `src/main/analytics/AnalyticsManager.ts` | Main-process analytics (imported in main.ts L73) |
| `src/renderer/services/engagement.ts` | User engagement tracking (achievements, streaks, stats) |
| `src/renderer/utils/stabilityHooks.ts` | Activity tracking |
| `src/renderer/utils/usePerformance.ts` | Performance metric reporting to main process |
| `src/renderer/utils/simpleMode.tsx` L38 | Feature visibility includes `analytics` toggle |

**Status:** Analytics framework exists but engagement system is lightweight (localStorage-based). No external telemetry service integration visible.

---

## 15. UNDO / REDO IMPLEMENTATIONS

| Location | Type |
|----------|------|
| `src/renderer/utils/UndoRedoManager.tsx` | Universal undo/redo class + `useUndoRedoShortcuts()` hook |
| `src/renderer/store/useUndoRedo.tsx` | Zustand store: `useUndoRedo` + `UndoRedoButtons` component |
| `src/renderer/store/systemUndoStore.ts` | IPC bridge to SystemUndoManager backend |
| `src/renderer/services/undoManager.ts` | Service-level undo manager |
| `src/renderer/components/UndoRedo.tsx` | UI component |
| `src/main/core/SystemUndoManager.ts` | System-level undo |
| `src/main/core/GlobalUndoHistory.ts` | Global undo history |

**Issues:**
- **4 separate undo/redo implementations** in the renderer alone.
- `UndoRedoManager.tsx` (utils) vs `useUndoRedo.tsx` (store) vs `undoManager.ts` (service) vs `UndoRedo.tsx` (component).
- Not clear which one is the canonical implementation used by apps.

---

## 16. ENGAGEMENT SYSTEM

**File:** `src/renderer/services/engagement.ts` (full implementation, ~200 lines)

- **18 Achievements** across 5 categories (explorer, creator, power, social, streak)
- **20 Tips** of the day
- **Rank system:** Newcomer → Beginner → Regular → Pro → Expert → Legend
- **Points:** 10-250 per achievement
- **Streaks:** Daily usage tracking
- **Persistence:** localStorage (`dex-engagement-state`)
- **Integration:** Used in Home.tsx — shows rank badge, streak counter, tip of day, achievement grid, progress bar.

**Status:** Fully functional and integrated.

---

## 17. TODO / FIXME / HACK / PLACEHOLDER COMMENTS

| File | Line | Content |
|------|------|---------|
| `src/renderer/utils/useKeyboardShortcuts.ts` | L37 | `action: () => {}, // Placeholder, set by consumer` |
| `src/renderer/utils/stabilityHooks.ts` | L386 | `// For now, return a placeholder` |
| `src/main/security/VaultHardening.ts` | L364 | `This is a placeholder - in production, use Have I Been Pwned k-anonymity API` |
| `src/main/security/VaultHardening.ts` | L382 | `breachCount: 1000000,  // Placeholder` |

**Note:** No `TODO`, `FIXME`, or `HACK` comments found — only `PLACEHOLDER` instances. The codebase appears to have been cleaned of TODO markers.

---

## 18. CLEANUP REQUIRED

### .bak Files
| File | Action |
|------|--------|
| `src/renderer/components/AppManager.tsx.bak` | **DELETE** — stale backup of AppManager |

### Duplicate/Redundant Components
| Group | Files | Action |
|-------|-------|--------|
| Search | Spotlight.tsx, UnifiedSearch.tsx, GlobalSearch.tsx, AdvancedSearch.tsx, SearchSystem.tsx | Consolidate to Spotlight |
| ErrorBoundary | App.tsx (inline), AppManager.tsx (inline), ErrorBoundary.tsx (service) | Consolidate to service |
| UndoRedo | UndoRedoManager.tsx (utils), useUndoRedo.tsx (store), undoManager.ts (service), UndoRedo.tsx (component) | Consolidate |
| Performance | 6+ renderer utils | Consolidate |
| Keyboard | KeyboardShortcuts.tsx, KeyboardNav.tsx, Keyboard.tsx, KeyboardManager.ts, useKeyboardShortcuts.ts, keyboardNavigation.ts | Consolidate |

---

## 19. HARDCODED VERSION STRINGS

| File | Line | Value | Should Be |
|------|------|-------|-----------|
| `src/renderer/pages/Settings.tsx` | L1431 | `Version 1.2.3` | `Version 1.3.0` (or dynamic) |
| `src/renderer/App.tsx` | L8 | `v1.3.0` (banner comment) | ✅ Correct |
| `src/main/main.ts` | L9 | `@version 1.3.0` | ✅ Correct |
| `src/main/preload.ts` | L10 | `@version 1.3.0` | ✅ Correct |
| `package.json` | L3 | `"version": "1.3.0"` | ✅ Correct |

**Action Required:** Fix Settings.tsx L1431 — still shows `1.2.3`.

---

## 20. CONSOLE.LOG STATEMENTS (PRODUCTION RISK)

### Unguarded console.log (should be removed or guarded)
| File | Lines | Count | Notes |
|------|-------|-------|-------|
| `src/renderer/utils/systemAudit.ts` | L550-575 | 10 | Audit report printing — OK if debug tool only |
| `src/renderer/utils/releaseValidation.ts` | L368-465 | 15+ | Release report printing — OK if debug tool only |
| `src/renderer/DEXAPPLICATIONS/VideoEditor.tsx` | L2313 | 1 | `console.log('Using alternate audio method...')` — **REMOVE** |

### DEV-guarded console.log (safe)
| File | Lines | Notes |
|------|-------|-------|
| `src/renderer/utils/stabilityHooks.ts` | L66, L192, L203 | `import.meta.env.DEV` guarded ✅ |

### console.warn / console.error (acceptable for production)
| File | Count | Notes |
|------|-------|-------|
| `src/renderer/utils/stabilityHooks.ts` | 5 | Error reporting — appropriate |
| `src/renderer/utils/usePerformance.ts` | 1 | Init error — appropriate |

---

## 21. COMMENTED-OUT IMPORTS

| File | Line | Import |
|------|------|--------|
| `src/main/main.ts` | L162 | `// import { initializeAIHub, shutdownAIHub } from './ai';` — AI Hub disabled |

**Only 1 genuine commented-out import found.** Other matches were false positives (comment-style section headers containing the word "import").

---

## 22. MISSING FUNCTIONALITY & GAPS

### Critical Gaps
1. **No app icon assets** — All icons are inline SVGs. No actual icon files (.png/.svg/.ico) in assets/ for the app or individual sub-apps.
2. **AI Hub disabled** — Phase 56-57 AI integration is commented out.
3. **Light mode broken** — CSS supports it, Settings blocks it. Inconsistent state.
4. **No localization/i18n** — All strings are hardcoded English.
5. **No external data sync** — SyncManager exists but no cloud backend configured.

### Architecture Gaps
6. **AppManager + App.tsx dual rendering** — Both files lazy-load all 23 apps independently. App.tsx has `AppRenderer` with `AppInstance`, AppManager.tsx has its own `renderKeepAlive`. Only AppManager's keep-alive approach is actually rendering.
7. **runningApps store vs appSubsystem store** — Two separate stores track running apps: `runningApps.ts` (simpler, Zustand) and `appSubsystem.ts` (more complex, OS-grade). Both are imported and used.
8. **Home.tsx ALL_APPS only has 9 apps** — The pinning menu only shows 9 creative/core apps, missing 14 others.

### UI/UX Gaps
9. **No loading skeleton** — `AppLoadingFallback` exists but no skeleton screens for data loading.
10. **No drag-and-drop for dock customization.**
11. **No window snapping** — No split-view window management.
12. **No right-click context menus** on most elements (only Launchpad has one for closing apps).

---

## 23. SUMMARY & PRIORITY ACTIONS

### Immediate Fixes (P0)
| # | Action | File(s) |
|---|--------|---------|
| 1 | Fix version string `1.2.3` → `1.3.0` | Settings.tsx L1431 |
| 2 | Delete `.bak` file | AppManager.tsx.bak |
| 3 | Remove production `console.log` | VideoEditor.tsx L2313 |
| 4 | Remove AI Hub commented import (decide: re-enable or clean up) | main.ts L162 |

### Consolidation (P1)
| # | Action | Files Affected |
|---|--------|----------------|
| 5 | Merge 5 search components into Spotlight | Spotlight, UnifiedSearch, GlobalSearch, AdvancedSearch, SearchSystem |
| 6 | Merge 3 ErrorBoundary classes into service | App.tsx, AppManager.tsx, ErrorBoundary.tsx |
| 7 | Merge 4 undo/redo implementations | UndoRedoManager, useUndoRedo, undoManager, UndoRedo |
| 8 | Consolidate performance utils (6+) | Multiple utils/ files |
| 9 | Consolidate keyboard utils (6+ files) | Multiple utils/ + components/ files |

### Feature Gaps (P2)
| # | Action |
|---|--------|
| 10 | Add aria-labels and roles to all interactive elements |
| 11 | Resolve dark/light mode contradiction |
| 12 | Extend Home.tsx ALL_APPS to include all 23 apps |
| 13 | Resolve dual store: runningApps vs appSubsystem |
| 14 | Add shortcut conflict detection |
| 15 | Integrate NotificationCenter with SystemFeatures notifications |
| 16 | Add offline mode UI / graceful degradation |
| 17 | Resolve dual app rendering (App.tsx AppRenderer vs AppManager keep-alive) |

### Codebase Stats
| Metric | Count |
|--------|-------|
| Total renderer components | 130+ |
| Total pages | 13 |
| DEX Applications | 10 (+ 9 feature/engine files) |
| Main controllers | 42 |
| Main core modules | 150+ |
| Security modules | 14 |
| Renderer stores | 19 |
| Renderer utils | 26 |
| Renderer services | 11 |
| IPC handlers (estimated) | 200+ |
| Total lines (key files) | ~15,000+ |
| Apps | 23 |

---

*Report generated from static analysis of the DEX codebase. All line numbers reference the codebase state as of March 2, 2026.*
