# DEX Release Notes

Simple, plain language. What changed, what it means for you.

---

## Version 4.16.0 -- 500-Improvement Wave 12

Wave 12 ships ten data-and-IO infrastructure modules: RFC 6265 cookie
parsing and serialization, a stricter cross-platform filename sanitizer
that handles Windows reserved names and length-aware extension trimming,
base16 hex encode/decode, strict IPv4 and IPv6 parsers with `::`
compression on output, a parser-only `jwtDecodeNoVerify` (header +
payload, never trust for auth), an extended URL parser/builder pair with
multi-value query support, form-encoded helpers with `[]` array
convention, an RFC 4180 CSV writer that neutralizes spreadsheet formula
injection, an ASCII table renderer with per-column alignment, and a
deterministic Markdown serializer suitable for diffs. 24 new unit tests.

---

## Version 4.15.0 -- 500-Improvement Wave 11

Wave 11 adds ten infrastructure modules: a `Trie<V>` prefix tree with
lex-sorted `prefixSearch`, `lazy` and `lazyAsync` memoized one-shot
values, an `AsyncMutex` with FIFO fairness and `runExclusive`, a `PubSub`
topic bus with `*` and `**` wildcard matching, a POSIX `pathParse`
module (`joinPath`, `dirname`, `basename`, `extname`, `normalizePath`,
`relativePath`), a typed `CodedError<C>` with `cause` and `details` plus
`isCodedError` / `hasCode` / `wrapError` helpers, a sliding-window
`RetryBudget`, an `IdleQueue` backed by `requestIdleCallback` with a
`setTimeout` fallback, in-place `heapSort` + `partialHeapSort`, and
RFC 4648 base32 encode/decode. 26 new unit tests.

---

## Version 4.14.0 -- 500-Improvement Wave 10

Wave 10 adds ten more shared modules: a keyboard-chord parser/matcher
with aliases (Cmd/Option/Win/Super), a `createFocusVisible` controller
that toggles a class only on keyboard interaction, a `perfMark` /
`perfMeasure` User Timing wrapper with a recent-measures ring, a
`BloomFilter` for cheap dedupe with a `recommendBloomParams` sizing
helper, a `caseConvert` module covering kebab / snake / camel / pascal /
title / constant, Levenshtein distance plus a `bestMatch` fuzzy
selector, an unbalanced `IntervalTree<T>` with point and range queries,
a strongly typed `TypedEventEmitter<E>`, an IntersectionObserver-based
`createLazyImageLoader` with a no-IO fallback, and a `parseRetryAfter`
+ `retryAfterDelay` HTTP Retry-After helper. 28 new unit tests.

---

## Version 4.13.0 -- 500-Improvement Wave 9

Wave 9 adds ten infrastructure modules focused on concurrency, resilience,
and low-level rendering: a sequential `AsyncQueue` that survives task
rejections, a `createLimiter` p-limit-style concurrency cap, a
`CircuitBreaker` with closed / open / half-open transitions and
injectable clock, a `TokenBucket` rate limiter with both sync
`tryConsume` and async `consumeAsync` paths, simple and exponential
moving-average classes, a `combineAbortSignals` combinator, a fluent
`SvgPathBuilder` plus `roundedRectPath`, public `xmlEscape` /
`unescapeHtml` helpers, a `unitConvert` module covering length, time, and
byte units, and a `colorBlend` module with source-over compositing,
premultiplied alpha conversions, and screen blend. 25 new unit tests.

---

## Version 4.12.0 -- 500-Improvement Wave 8

Wave 8 adds ten more shared modules: time-based `throttle` plus a
`debounceFn` (companion to the React `useDebounced` hook), an argument-
keyed `memoize`, a SemVer 2.0.0 parser/comparator, a `queryString` codec
with repeated-key array semantics, a `urlSafe` parser that blocks
`javascript:`/`data:`/`vbscript:`/`file:` by default, descriptive stats
(`mean`, `median`, sample variance, stddev, percentile, minMax), a
histogram binner with Sturges auto-bin-count, linear and log chart scales
with Wilkinson "nice" tick generation, an offscreen-canvas text-metrics
helper with `truncateToWidth` ellipsis, and a Typewriter animator. 28 new
unit tests; full wave5-8 regression at 106 passing.

---

## Version 4.11.0 -- 500-Improvement Wave 7

Wave 7 adds ten more shared infrastructure modules: a streaming tokenizer
for SSE / RAG output, a citation marker parser, an NDJSON chunked parser, a
fixed-capacity ring buffer, a stylus palm-rejection filter, an exponential
zoom inertia integrator, a single-pointer gesture recognizer (tap, double
tap, long press, swipe), an `fsAdapter` interface so the renderer never
touches `fs` directly, a heuristic white-screen detector for boot
telemetry, and an IndexedDB-backed key-value cache with an in-memory
fallback for tests. 24 new unit tests; full suite still uses the default
vitest reporter (the basic reporter is broken in this repo's vitest 4).

---

## Version 4.10.0 -- 500-Improvement Wave 6

Wave 6 lands ten more shared modules covering randomness, encoding,
packing, gestures, and core data primitives.

What's now in the kit: a seeded random generator that gives
reproducible test runs, dependency-free base64 (with URL-safe variant)
that works the same in renderer and tests, an RFC 4122 v4 UUID
generator with a sensible fallback chain, a guillotine rectangle
packer for sprite atlases and icon caches, a pointer velocity tracker
for fling and momentum gestures, an in-memory clipboard history with
de-dupe, a deep-equality compare that handles cycles and NaN
correctly, a deep-merge helper for layered settings, a binary-heap
priority queue for schedulers, and a small numeric utility module
(clamp, lerp, smoothstep, wrap).

What you'll feel: nothing immediately user visible -- this wave is
internal plumbing. The benefit shows up as more reliable tests, fewer
runtime allocations in hot paths, and faster iteration on Settings,
plugin sandboxing, and gesture features in upcoming releases.

What's next: Wave 7 will continue the program with more focused
modules.

---

## Version 4.9.0 -- 500-Improvement Wave 5

Wave 5 adds ten more shared modules covering text, geometry, motion, and
resilience.

What's now in the kit: a line-by-line diff for collaborative comments and
version compare, a quote-aware CSV parser for Files imports, a safe-by-
default markdown renderer that blocks dangerous URL schemes, a 2D
geometry helper set for selection and hit-testing, ten curated easing
curves for motion, an HSL-aware color palette helper for themes, a tiny
typed state machine for tool gestures, an exponential-backoff retry with
jitter for network resilience, lightweight time formatting that replaces
moment-style libraries, and a cross-platform filename sanitizer that
respects Windows reserved names.

What you'll feel: faster Notes preview render, safer pasted content,
smoother motion in dialogs and panels, and more reliable network calls
that recover from transient failures without a full retry loop.

What's next: Wave 6 will continue chipping away at the 500-improvement
backlog with similar small, focused modules.

---

## Version 4.8.0 -- 500-Improvement Wave 4

Wave 4 lands ten more shared modules covering search, performance, graph
math, and test infrastructure.

What's now in the kit: a fuzzy substring matcher (used by command palette
and graph search), a bounded worker pool for offloading heavy compute, an
async cache with TTL plus LRU eviction plus request coalescing, an
in-memory mock IPC harness for renderer tests, a test data factory module
for shared fixtures, anchor-stable zoom and pan transform math, a
requestAnimationFrame throttle that coalesces rapid input into one call
per frame, browser download helpers (blob, text, JSON, CSV), a
force-directed graph layout step, and a typed event bus.

Eight more backlog items advanced this wave. Two completed outright (test
data factory and mock IPC). Cumulative across waves 1-4: thirty-eight
modules and one hundred and twenty-eight backlog items moved.

---

## Version 4.7.0 -- 500-Improvement Wave 3

Wave 3 lands ten more shared modules that cover creative-suite math,
security hardening, and crash resilience.

What's now in the kit: snap-to-grid + smart edge snapping for canvases,
WCAG color-contrast checking with AA / AAA verdicts, deep PII redaction
for log lines and crash reports, automatic crash recovery (so unsaved work
is restored after a hard crash), an append-only audit log per subsystem,
a long-task perf tracker, MIDI controller mapping, an LUFS loudness meter
for the audio master bus, a pure particle-emitter simulation for FLUX
effects, and a plugin sandbox protocol with per-plugin permissions, storage
quotas, and network allowlists.

Sixteen more backlog items advanced this wave. Cumulative across waves 1-3:
twenty-eight modules and one hundred and twenty backlog items moved.

---

## Version 4.6.0 -- 500-Improvement Wave 2

Continues the foundation pass. Wave 2 adds ten more shared modules that the
rest of the app will plug into: list virtualization, leak-safe React effect
helpers, an LRU cache, a modal focus trap, a screen-reader live-region
announcer, OS accessibility preference hooks (reduced-motion / high-contrast
/ dark-scheme), a command palette registry, a keyboard-shortcut registry with
user remap and cheat-sheet, an idle/away detector, and a secure clipboard
with auto-clear plus user-gesture gating for reads.

These mean: bigger lists will scroll smoothly without rendering thousands of
hidden rows, modals will be properly trappable for keyboard users, important
status changes (downloads, window opens) can announce themselves to screen
readers, every app respects your OS reduced-motion / high-contrast settings,
and the vault clipboard will auto-clear so secrets do not linger.

Twenty-nine more backlog items advanced this wave. The next release will
start wiring these into the visible app surfaces.

---

## Version 4.5.0 -- 500-Improvement Wave 1

This is the first shipping wave of a planned 500-item improvement program.
It focuses on *foundations* — the shared building blocks that the next several
waves will plug into apps and shell surfaces. Some items already work
end-to-end; others land their core engine now and the visible surface comes
in the next wave.

### What's new for you

**More reliable updates and tests.**
A subtle bug in our cache layer could crash test environments without browser
crypto. That's now fixed at the source instead of being papered over, so
tests run cleanly and our CI pipeline is fully green again.

**AXL is more screen-reader friendly.**
Six unlabeled close/share/AI buttons in AXL now announce themselves correctly
to assistive tech.

**New foundations shipping under the hood.**
Forty-plus new helper modules and APIs are in place for: bezier easing /
keyframe animation, pen pressure + tilt, multi-finger touch gestures,
notifications (do-not-disturb, per-app mute, snooze, quiet hours), workspace
window layouts, knowledge smart-collections + duplicate detection, comment
threads, and version diffs. The next wave wires these into the apps you see.

### What ships fully usable today

- **Easing presets**: 8 motion curves available app-wide.
- **Notification policy**: DND, per-app mute, snooze, cross-midnight quiet
  hours, and per-app grouping all queryable through one API.
- **Smart collections + duplicate detection** for the knowledge layer.
- **Workspace layouts**: save / load / delete named window arrangements per
  workspace, persisted locally.
- **Pen barrel-button = eraser** gesture.

---

## Version 3.6.0 -- May 2026

### What is DEX?

DEX is your personal desktop control hub. It brings together everything you
need in one app: files, notes, tasks, music production, image editing, video
editing, motion design, 3D CAD, a browser, and more. It runs on your computer,
keeps your data local, and works even without the internet.

---

### What's New in 3.6.0

**Normal launches are now clean.**
DEX no longer shows splash screens every time you open the app or switch into an inner app. The branded startup screen is now first-install only, so once DEX is set up it opens directly into the workspace.

**Sharper, solid surfaces across the system.**
More of the shell now uses solid, readable panels instead of translucent glass. This improves contrast, reduces visual noise, and helps older systems avoid extra blur work.

**Rewind is more direct.**
Rewind now lands on Timeline by default and keeps the main working tabs in front, so the app feels more focused and useful during real use.

**Cache budget is hardware-aware.**
DEX now gives Chromium a disk cache budget based on your RAM tier, up to 2 GB on stronger systems. Older systems keep a smaller cache so the app stays responsive.

---

### Also included from 3.2.0

**Lock screen with real security.**
DEX now has a full lock screen with Windows Hello support, password and PIN
authentication, recovery codes, and idle auto-lock. Your session is protected
when you step away.

**UKI voice commands work for real.**
UKI now responds with real system analytics -- actual memory usage, CPU stats,
disk info, and running processes. No more placeholder responses.

**5 GB effective memory with SSD spill.**
DEX now uses up to 5 GB of effective memory on premium hardware by combining
RAM budgets with SSD-backed overflow storage. Tight on RAM? DEX spills cold
data to SSD automatically and reads it back when needed.

**AXL 3D CAD is fully wired.**
The WebGL2 renderer is now connected to the render loop with real-time 3D
viewport, grid, mesh generation, and Canvas 2D fallback. Boolean operations
on solids are improved.

**App loading stays in-place.**
Inner apps keep their normal content loading behavior without a separate splash
screen layer interrupting the workspace.

**App bugs fixed across the board.**
Forge: fixed a race condition where video metadata callbacks never fired if
the browser had already cached the file. Prism: fixed a crash when using
bucket fill on cross-origin images, and fixed image load hangs in panorama
stitching and focus stacking.

**System controls expanded.**
Settings now includes WiFi network selection, Bluetooth pairing controls,
display resolution picker, and UI scaling from 100% to 200%.

**Rust native performance layer audited.**
160+ native functions across 20 Rust modules verified complete. System
monitoring, process management, power profiles, file scanning, health checks,
image processing, audio analysis, video probing, kernel scheduler, 3-tier
memory cache, I/O acceleration, IPC bus, DSP pipeline, and UKI NLU -- all
running in native Rust via NAPI-RS.

**Weather app now shows real UV index and visibility.**
Previously hardcoded, these now come from the Open-Meteo API.

**All versions aligned to 3.6.0.**
Every release-facing version marker now reports version 3.6.0.

**Debug logging removed from production.**
Stray console.log statements in Forge have been removed. Only error handlers
and dev-guarded logging remain.

---

### All the Apps Inside DEX

| App | What it does |
|-----|-------------|
| **Home** | Your dashboard. See recent files, quick actions, daily overview |
| **Files** | Browse, search, move, rename, and manage files on your computer |
| **Notes** | Write notes with rich text, checklists, and search |
| **Tasks** | To-do lists, due dates, priorities, subtasks |
| **Calendar** | Monthly and weekly views with event management |
| **Browser** | Built-in web browser with tabs |
| **Gallery** | View and organize photos and images |
| **Audio** | Music player and audio file manager |
| **Transfers** | Send and receive files between devices |
| **Workflows** | Create automation rules. If this happens, do that |
| **Power** | See your system stats: CPU, memory, disk, battery |
| **Settings** | Customize DEX: themes, shortcuts, privacy, accounts |
| **Prism** | Full image editor. Layers, brushes, filters, export |
| **Imosion** | Digital audio workstation. Record, mix, and export music |
| **Flux** | Motion design and animation tool. Keyframes, easing, export |
| **Forge** | File converter. Convert video, audio, and image formats |
| **Vinx** | Timeline-based video editing with clips, effects, and export |
| **Rewind** | Activity history. See what you did and when, replay past states |
| **AXL** | Professional 3D CAD and engineering design studio |
| **Nexus** | AI-powered research and knowledge management |
| **Calculator** | Standard and scientific calculator |
| **Password Generator** | Create strong, random passwords |
| **Kanban** | Visual board for organizing work in columns |
| **Achievements** | Track your DEX usage milestones |
| **Weather** | Live weather with forecasts, UV index, and visibility |
| **Color Picker** | Pick and convert colors across formats |
| **Markdown Editor** | Write and preview Markdown documents |
| **Noise Generator** | Ambient sound generator for focus |
| **Pomodoro Timer** | Focus timer with work and break intervals |
| **QR Code Generator** | Create QR codes from text or URLs |
| **Recycle Bin** | Manage deleted files with restore support |
| **Stopwatch** | Precision timer with lap tracking |
| **Unit Converter** | Convert between measurement units |
| **World Clock** | View time across multiple time zones |

---

### How DEX Keeps Things Fast

- **Smart detection** -- DEX checks your CPU, RAM, storage speed, and battery
  when it starts. Nothing for you to configure.
- **Auto quality** -- Apps and games pick the right quality level. Premium
  hardware gets full effects. Older hardware gets a lighter experience that
  still looks good.
- **Battery aware** -- When you unplug, DEX reduces background work to save
  power. When battery gets very low, DEX saves your open work automatically.
- **Heat aware** -- If your computer gets hot, DEX slows down background
  tasks and reduces visual effects until it cools down. You might notice
  slightly simpler animations for a moment. Once cool, everything goes back
  to normal.
- **Memory aware** -- If your computer is running low on memory, DEX tells
  its apps to use less. Games reduce particle effects. Editors use smaller
  caches. If things get critical, DEX frees memory and notifies you.

---

### Minimum Requirements

| Part | Minimum |
|------|---------|
| **OS** | Windows 10, macOS 11, Ubuntu 20.04 |
| **CPU** | 4 cores |
| **RAM** | 4 GB |
| **Disk** | 500 MB free space |
| **Screen** | 1280 x 720 |

DEX works on low-end machines. It just adjusts quality automatically.

---

### How to Update

DEX checks for updates when it starts. When an update is available, you will
see a notification. Click it to install. Your data is kept safe during updates.

---

### Need Help?

- Press **Ctrl+Shift+P** (or **Cmd+Shift+P** on Mac) to open the Command Palette
- Press **Ctrl+/** for keyboard shortcuts
- Check the [full documentation](APP_DOCUMENTATION.md) for details

---

### Previous Versions

See [CHANGELOG.md](CHANGELOG.md) for the full technical history.
