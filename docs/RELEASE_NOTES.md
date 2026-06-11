# DEX Release Notes

Simple, plain language. What changed, what it means for you.

Copy the v5.1.0 block below into the GitHub release body for the `dex-updates`
public feed.

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
