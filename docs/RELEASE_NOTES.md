# DEX Release Notes

Simple, plain language. What changed, what it means for you.

Copy the v5.5.0 block below into the GitHub release body for the `dex-updates`
public feed.

---

## DEX v5.5.0 — System refinement: search, calm, and consistency

A refinement release. Nothing new to learn — DEX is faster, calmer, and more
finished end to end. Still **free for everyone**: to keep it improving, DEX uses
limited, privacy-protective usage data, and never your private files or secrets.
No ads, no paid tiers, no selling your data.

### Highlights

- **One search for everything** — a single palette fans across notes, files,
  tasks, projects, workflows, commands, screenshots and conversations, ranked by
  relevance, recency, and what you are working on right now.
- **A real Home** — a dashboard of recent projects and notes, current tasks,
  active workflows, a rewind summary and pinned apps, with honest empty states.
- **Calmer notifications** — every alert flows through one center, grouped by
  source and prioritized by severity, instead of scattered popups.
- **Search-first Settings** — type what you want to change and jump straight to
  the control; new AI and Developer sections surface existing toggles.
- **Deeper, smoother creative apps** — across Prism, Flux, Imosion, Axl, Vinx and
  the whiteboard: zoom-to-cursor, snappier timelines and playback, viewport-aware
  menus, and editing that stays out of your way.

### Under the hood

- Duplicate internal systems (caches, motion, file watching) consolidated and
  dead code removed — the same work with less overhead.
- Fixed several real glitches: double-undo and scrub-past-end in motion, a
  playhead desync and frozen analyzer in audio, a scroll crash in the video
  timeline, HiDPI rendering on the canvases, and assorted listener leaks.
- Privacy Policy and Terms updated to v2.2.0 (free-for-all, plain-language
  data-use); re-consent is prompted on first launch.

### Suggested commit message

```
release: DEX v5.5.0 — system refinement (search, notifications, Home, app depth)

- Unified search palette across all content sources with context ranking
- Single notification center: grouping, prioritization, persistence
- Search-first Settings (AI + Developer sections); Home dashboard
- Per-app depth pass across the creative suite (perf + interaction polish)
- Consolidate duplicate caches/motion/file-watcher; delete dead modules
- Privacy/Terms v2.2.0: free-for-all + plain data-use; remove ad/paid-tier text
- Remove the What's New modal entirely
```

---

## DEX v5.1.0 — Free for everyone

**DEX is now 100% free.** Every feature, on every tier, is unlocked for all
users — the full creative suite (Vinx, Imosion, Prism, Flux, Forge, AXL),
automation, multi-window, rewind, and everything else. No trial, no quotas, no
payment.

### Highlights

- **Compact mode** — press `Ctrl+Shift+M` to shrink DEX to a small always-on-top
  pill in the corner and keep working beside it. Quick actions for Notes, Timer
  and Clipboard are built in; your apps keep running, and expanding returns you
  exactly where you were.
- **Workspace recovery** — if a session ends unexpectedly, DEX offers to restore
  your workspace in one click. Crashed apps recover automatically, and the window
  remembers its size and position across launches.
- **Instant updates** — new versions download quietly in the background and
  install on quit, so you are always current without interruption.
- **A sharper, more alive system** — crisper corners and borders throughout, a
  reimagined Nexus with real depth and glow, better note-taking (wiki-links, an
  outline, drag-drop attachments), a true high-contrast theme with text-spacing
  controls, and controls that respond to every press.

### Under the hood

- Dead code removed and hot calculations memoized for lighter startup and
  smoother interaction.
- Crash isolation, window-state persistence, and a last-session journal harden
  multi-app use.

### Suggested commit message

```
release: DEX v5.1.0 — free for everyone, compact mode, recovery & a sharper system

- Unlock every feature on every tier (100% free; payment infra kept, gated off)
- Compact always-on-top mode (Ctrl+Shift+M) with quick actions
- Recovery: auto-restart crashed apps, persist window bounds, restore workspace
- Background auto-download + install-on-quit updates
- Sharper radius scale system-wide; Nexus visual overhaul; Notes depth
- High-contrast theme + text-spacing controls; universal button press feedback
- Remove dead PrismUI/FluxUI modules; memoize Stopwatch/AXL hot paths
```

---
