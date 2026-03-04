# Changelog

All notable changes to DEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-03-04

### Added
- **IPC Layer**: 50+ critical missing IPC handlers registered (sessions, activity, dashboard, projects, media, theme, automationEngine)
- **Responsive Design**: Real `useBreakpoint` hook with ResizeObserver for adaptive layouts
- **Responsive CSS**: Media queries for mobile/tablet breakpoints, flex-based top-bar
- **Responsive Modals**: GlobalSearch, KeyboardShortcuts, NotificationCenter use `min()` for fluid widths
- **Dock**: Horizontal overflow scroll for small screens
- **Sidebar**: Auto-collapse on xs/sm breakpoints via `useSidebar` hook
- **Search**: Real `useSearch` hook with debounced filtering
- **Onboarding**: `getNextTip` now properly advances through tips
- **ClipboardHistory**: `onSelect` pastes content into active element
- **Menu**: `setActiveSubmenu` properly wired with local state
- **Governance**: `governance:getPermission` IPC handler

### Fixed
- **TypeScript**: All 60+ strict-mode errors resolved (0 errors)
- **IPC Naming**: `theme:set-mode` → `theme:setMode`, `longevity:cleanupOrphans` → `longevity:cleanupOrphanedTasks`
- **Type Conflicts**: Removed duplicate `declare global` blocks from Tasks.tsx and QuickActions.tsx
- **Transfers**: Fixed `url` undefined → null safety
- **Forge**: Fixed `showDirectoryPicker` null guard
- **Rewind**: Fixed `getOnboardingState` truthy check (was always true for function reference)
- **stabilityHooks**: Optional chain returns properly defaulted with `?? null`

### Removed
- Emoji characters from source code (Alert, Accessibility, FileUpload, Select, WatchdogController, SessionStabilityManager)

### Improved
- File organization: audit reports moved to `docs/`, stale artifacts removed
- Production build verified (Vite, 5s)
- Full test suite: 190/190 passing

## [1.3.0] - 2026-01-20

### Added
- **Prism**: Real brush/eraser drawing with canvas mouse handlers, hardness/opacity/size support
- **Prism**: Working undo/redo system with canvas layer snapshots (Ctrl+Z/Y)
- **Prism**: Save button exports .prism.json project files (Ctrl+S)
- **Prism**: Filter presets (15 presets) now apply adjustments on click
- **Prism**: Eyedropper tool samples color from canvas
- **Prism**: Quick Export presets and Quick Adjustments from PrismFeatures
- **Imosion**: Bars/beats time display with click-to-toggle (bars.beat.tick format)
- **Imosion**: Real audio export using OfflineAudioContext + WAV encoder (16/24/32-bit)
- **Imosion**: WAV file encoder supporting PCM 16-bit, PCM 24-bit, and IEEE 32-bit float
- **Flux**: Video export using canvas.captureStream() + MediaRecorder (.webm)
- **Flux**: Save/Open project as JSON
- **Flux**: History panel with state restore
- **Flux**: Easing presets panel (27 presets from FluxFeatures)
- **Flux**: Composition presets dropdown (10 presets: 1080p, 4K, social media sizes)
- **Forge**: Real video/audio encoding via HTMLVideoElement + canvas + MediaRecorder
- **Forge**: Browser storage estimate via navigator.storage.estimate()
- **Forge**: Watch folders via File System Access API (showDirectoryPicker)
- **Forge**: Batch folder import for encoding queue
- **Calendar**: Full week view with 7-day x 24-hour grid, event placement, click-to-create
- **VideoEditor**: Export queue Start/Clear buttons wired
- **VideoEditor**: Audio mixer Mute/Solo buttons wired
- **VideoEditor**: History panel wired to real undo/redo state
- **VideoEditor**: Keyboard shortcuts overlay uses VideoEditorFeatures (28 shortcuts, 4 categories)
- Feature files (5) wired into all app components as single source of truth

### Removed
- **Prism**: AI/Smart panel and Smart tab (fake setTimeout-simulated features)
- **VideoEditor**: Smart Tools modal (6 fake tools with setTimeout simulation)
- **VideoEditor**: Team Projects panel (requires server backend - deferred to V3)
- **VideoEditor**: VR/360 Controls panel (no VR hardware API in browser)
- **VideoEditor**: Dynamic Link panel (requires inter-app communication)
- **VideoEditor**: Immersive Audio / Dolby Atmos panel (no spatial audio API)
- **VideoEditor**: Multicam Editing panel (empty source slots)
- **VideoEditor**: Stock Media Browser (12 fake placeholder cards)
- **VideoEditor**: Smart Tools toolbar button and associated state
- **VideoEditor**: 6 unused TypeScript interfaces (VRSettings, MulticamSequence, TeamProject, SceneDetection, SpeechToText, AutoReframe)
- **VideoEditor**: 7 unused icon entries and 4 unused clip properties

### Fixed
- **Imosion**: Mouse wheel zoom clamped to 10-200 (was 1-1000, inconsistent with buttons)
- **Imosion**: Removed dead `showMixer` state variable
- **Imosion**: Recording waveform uses honest flat line instead of misleading random data
- **Flux**: Inspector inputs are now editable (were readOnly)
- **VideoEditor**: Effect Controls Motion inputs marked as V3 instead of showing fake no-op handlers
- **VideoEditor**: Captions transcribe button replaced with honest V3 placeholder
- **VideoEditor**: Render and Replace shows honest info about Export panel
- **Forge**: Disk space shows real browser storage instead of hardcoded "C:/ (1.2 TB free)"

## [1.2.3] - 2026-01-15

### Added
- ESLint configuration for TypeScript and React
- SECURITY.md with full security policy documentation
- CONTRIBUTING.md with contribution guidelines
- CHANGELOG.md for version history tracking
- Top-level error boundary for crash resilience
- Missing page routes: Dashboard, Notes, Tasks, Power, Workflows, Gallery, Audio, Video

### Fixed
- Version inconsistency across package.json, main.ts, README.md, and App.tsx
- Tray icon reference updated from PNG to SVG
- Missing app routes now properly connected in App.tsx

## [1.2.2] - 2026-01-10

### Added
- Q1 Foundation integration (Auth Hardening, Vault Hardening, Session Hardening)
- Pattern Learning service for local-only usage insights
- Integrity Monitor with automated health checks
- Performance Monitor with resource budgets
- Lifecycle Manager for app process states
- App State Machine for network-aware state management

### Improved
- Security layer with IPC validation and input sanitization
- Data migration system with rollback support
- Permission manager with presets (minimal, standard, full)

## [1.2.1] - 2026-01-05

### Added
- DEX Applications: VideoEditor, Imosion, Prism, Flux, Forge
- Command Palette (Ctrl+K)
- Clipboard History (Ctrl+Shift+V)
- Onboarding Wizard for first-time users
- System Features panel with Quick Launcher

### Improved
- App Manager with OS-grade lifecycle management
- Process Isolation for fault containment
- Lazy loading for all pages and DEX applications

## [1.2.0] - 2025-12-20

### Added
- OS-grade application framework (v4.0 architecture)
- Sub-application hosting with real lifecycle states
- Resource budgets per application
- System integrity monitoring
- Background task management

### Changed
- Migrated from simple page routing to app subsystem model
- Upgraded to Electron 28

## [1.1.0] - 2025-11-15

### Added
- Power Management with Eco/Balanced/Boost profiles
- Workflow automation engine
- File Manager with intelligence features
- Encryption service for vault data
- Data export in JSON and Markdown formats

### Improved
- IPC security with channel allowlisting
- Error recovery with severity classification
- Storage manager with type safety

## [1.0.0] - 2025-10-01

### Added
- Initial release
- Action system (open/close apps, run commands, control volume)
- Mode system (Work, Focus, Night mode bundles)
- Rule engine (IF/THEN automation with conditions)
- Operations with undo support
- Quick Notes and Tasks
- Timer system (Pomodoro, countdown, reminders)
- Voice control and recording
- System tray integration
- Cross-platform support (Windows, macOS, Linux)
- 100% local data storage
- Full data export capability

---

**DEX** - Made by Onazi Treasure OJ
