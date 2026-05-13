# DEX Release Notes

Simple, plain language. What changed, what it means for you.

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
