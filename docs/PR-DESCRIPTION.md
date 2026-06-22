# feat(dex): v6.0.4 per-app completion + creative engines + shared primitives + Future local-first apps

Drives the v6.0.4 program from the backlog MDs (`docs/DEX-BACKLOG-smallapps.md`, `docs/DEX-BACKLOG-shared.md`) and the Creative initiative to its achievable, renderer-only completion. Built in verified waves — `npm run lint` (tsc + watermark) green after every wave; **nothing faked**, native/backend-blocked paths flagged honestly.

## Highlights

**Whole-roster per-app features.** Real features across ~36 apps (Calculator, Unit Converter, Color Picker, QR, World Clock, Weather, Maps, Noise Generator, Pixel Art, Markdown Editor, Calendar, Canvas, Gallery, Timer/Stopwatch/Pomodoro w/ a shared `timerStore`, Tasks, Env Manager, Presentation, Learn, Audio, SSH, Recycle Bin, Task Manager, Store, Git, Files, Workflows, Collab Hub, Live Activity, Screen Recorder, Settings, Terminal, PDF Viewer, Browser, Transfers, Power). New app-wide `services/sendTo.ts` sink.

**Creative suite — real engines (no stubs):** VINX real WebM export (captureStream+MediaRecorder), FLUX sandboxed expression evaluator, FORGE real image+WAV transcode (removed ~290 lines of fake encode), AXL direct-stiffness 2D truss FEA solver, PRISM canvas-boolean + diffusion inpaint, IMOSION polyphonic Web-Audio synth into the mixer.

**Earlier productivity batch:** Achievement engine (coalesced unlock notifications + `unlockedAt` + daily challenges), Kanban (sort/filter/reorder/recurrence/due), Nexus (close/minimal mode; chat removed), Notes (toolbar/word-goal/cross-folder search/breadcrumb/#tags/templates/color), DexCode (project awareness + workspace search + cross-file go-to-definition), and a provider-agnostic **UKI agentic tool loop** (`agentRunner.ts`) with real web search + app control.

**Shared primitives (ADR-0003 gaps only):** `useReducedMotion`, `usePersistentState`, `useManagedTimers`, `safeJson`, `safeStorage`, `migrateState`, `services/toastResult`. (Existing ErrorBoundary/debouncedStorage/leakDetector/useAsyncResource/global focus-visible were not re-chased.)

**200-patch initiative:** roster-wide leak-safety + a11y + robustness pass — real leak fixes (Imosion MIDI/BroadcastChannel, Prism rAF, Forge AudioContext-on-error, Browser webview listeners, Weather AbortController-per-tick, after-unmount timers in SSH/Env/Settings/Rewind, DexNotes resizer), plus aria-labels, overflow clamps, and async double-fire guards.

**Future track (tractable, local-first):** three NEW registered apps — **Spaces** (snapshot/restore open apps + project), **Inbox** (unified notifications + cross-app activity), **Project** (per-project dashboard).

## Verification
- `npm run lint` → `tsc --noEmit` 0 errors + watermark check OK (2156 files) — green after every wave.
- Live preview spot-checks where applicable (achievement engine coalesced banner, Nexus close, UKI keyless web search, Kanban controls).
- DexCode project-open + native-dialog paths verify in the packaged app (absent in web preview) — noted.

## Explicitly NOT in this PR (flagged, not faked) → see `docs/NEXT-STAGE.md`
App marketplace, cross-device sync + handoff, real-time multiplayer / live co-editing, offline-first + E2E-encrypted sync, pluggable cloud storage, bundled local offline-AI model. These need a server / CRDT transport / native model that doesn't exist in a renderer-only build; their local-first foundations are in place.

Full per-wave detail is in `docs/ROADMAP.md`.

