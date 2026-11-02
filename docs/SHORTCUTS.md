# DEX Commands & Shortcuts

> One catalog, every surface. The keyboard, command palette, in-app terminal
> (`dex <cmd>`), and UKI (the assistant) all read the SAME source of truth:
> [`src/shared/commands/dexCommands.ts`](../src/renderer/../shared/commands/dexCommands.ts).
> No parallel command lists, no per-surface keymaps to keep in sync.

## The source of truth

`dexCommands.ts` is the canonical [DexCommand] catalog. It is assembled by
`buildDexCommands(APP_DEFINITIONS)`:

- **App-launch commands DERIVE from `APP_DEFINITIONS`** — the app list is never
  duplicated. Each app's name, icon, category, and shortcut come from that one
  place; the catalog just wraps them (`app.<id>`, "Open <Name>", terminal alias).
- **System / Window / Navigation commands are authored once** in `CORE_DEX_COMMANDS`.
- Everything is **cross-platform**: each shortcut carries a Windows/Linux form and
  a macOS form (`crossPlatform()` derives both; `Ctrl`↔`Cmd`, `Alt`↔`Option`).
  `resolveShortcut(cmd, isMac)` picks the right one at display time, so the same
  catalog works on Windows, Linux, and macOS.
- Maps only to **DEX inner apps** — no Apple/OS apps.

## How each surface uses it

| Surface | How it reads the catalog | Status |
|---------|--------------------------|--------|
| **Terminal** | `dex <name>` / `dex list` runs the command via `executeDexCommand` (app launches via the running-apps store; action commands via the `dex-command` bus); lines starting with `dex` are not sent to the OS shell. | DONE (`Terminal.tsx`) |
| **Command palette** | App launches already derive from `APP_DEFINITIONS`; the catalog's missing ACTION commands (tile/maximize/uki/compact/nav/close) are added and run through `executeDexCommand`. No duplicates. | DONE (`CommandPalette.tsx`) |
| **UKI** | `chat.dexCommand` skill + `dex.command` action map natural phrases ("split screen", "tile left", "maximize") via `findByUtterance` → `executeDexCommand`. App open/close stay on the existing `app.open` path. | DONE (`chatActions.ts`) |
| **Keyboard** | AppManager's keydown already binds the catalog's shortcuts (Ctrl+1-9, Alt+letter, tile/split/maximize, nav, UKI). | already covered |

**The executor + bus:** `executeDexCommand(cmd)` (`services/dexCommandRunner.ts`) is the ONE renderer runner — app commands launch directly; ACTION commands dispatch a single `dex-command` window event that AppManager routes to the same handlers the keyboard uses. Terminal, palette, and UKI all run commands through it.

## The 1000-shortcut triage

The full key-combo space — every possible combo from Ctrl+A to Ctrl+Shift+Alt+F5 —
is raw *capacity*: ~1000 slots, all unassigned. We do
**not** need 1000 bindings. The catalog assigns only the **ergonomic subset**:

- **App launches** — `Ctrl/Cmd+1..9` and a few `Alt/Option+<letter>` (Notes=Ctrl+4,
  Calculator=Alt+C, VINX=Alt+V, …) — these already live in `APP_DEFINITIONS`.
- **Project Spaces** — `Ctrl/Cmd+Alt+1..9` jumps to Project Space N (DEX 5.6
  virtual-desktop switch); mirrors the app `Ctrl+1..9` idiom. Spaces are also
  created/switched from the command palette ("New Project Space", "Switch Space",
  "Open Workspace: …").
- **System** — Search/Spotlight `Ctrl+K`, Command Palette `Ctrl+Shift+P`, UKI
  `Ctrl+Shift+U`, Compact `Ctrl+Shift+M`, Lock `Ctrl+Shift+L`.
- **Window** — Close `Ctrl+W`, Maximize `Ctrl+Up`, Tile L/R `Ctrl+Alt+←/→`,
  Split `Ctrl+Shift+S`, Arrange `Ctrl+Shift+Z`.
- **Tiling layouts** — Apply to all open windows: `Alt+Shift+1` Master+Stack,
  `2` Columns, `3` Rows, `4` Grid, `5` Dwindle, `6` Monocle. Cycle focus through
  floating windows `Meta+\`` (or `Ctrl+Alt+\``; add `Shift` to reverse).
- **Custom snap zones (FancyZones)** — Open the Zone Editor `Ctrl+Alt+Z` (or the
  "Edit Snap Zones" palette command). With a layout active: drag a window onto a
  zone to snap it; expand the focused window across the adjacent zone
  `Ctrl+Alt+Shift+←/→/↑/↓`; cycle focus among windows sharing a zone
  `Ctrl+Alt+[` / `Ctrl+Alt+]`.
- **Navigation** — Back/Forward `Ctrl+←/→`.

That is roughly **40 assigned slots**; the other ~960 stay **unbound and reserved**
(available for per-app or user bindings later). Adding a command = one entry in the
catalog (or, for an app, it derives automatically) — and it appears in the terminal,
palette, UKI, and keyboard at once.

## Per-app shortcuts (in-app, not global)

These live inside individual apps (part of the reserved per-app space above), so
they are scoped to the focused app and do not appear in the global catalog:

- **DexCode** — `Ctrl/Cmd+M` jump to the matching bracket; the status bar shows
  live selection stats (chars / lines) while text is selected.
- **Any modal / overlay** — `Escape` closes it (now uniformly, incl. the Kanban
  card editor).

## Spatial desktop

Active once the canvas is on (Settings › Window Management, or `Ctrl/Cmd+Alt+S`).
On the canvas, `Ctrl/Cmd+Alt+Arrows` pan instead of tiling.

| Keys | Action |
|---|---|
| `Ctrl/Cmd+Alt+S` | Turn the spatial desktop on / off |
| `Ctrl/Cmd+Alt+=` / `-` / `0` | Zoom in / out / actual size |
| `Ctrl/Cmd+Alt+F` | Show all windows |
| `Ctrl/Cmd+Alt+Enter` | Zoom to the front window |
| `Ctrl/Cmd+Alt+Arrows` | Pan |
| `Ctrl/Cmd+Alt+Backspace` | Previous view |
| `Ctrl/Cmd+Alt+W` | Find a window (all windows and groups) |
| `Ctrl/Cmd+Alt+G` | Group the windows in view |
| `Ctrl/Cmd+Alt+M` | Minimap |
| Wheel / two-finger scroll over the desktop | Pan |
| `Ctrl`+wheel or pinch over the desktop, `Alt`+wheel anywhere | Zoom at the pointer |
| Middle-drag, or `Space`+drag | Pan |

## Run a command from the terminal

```
dex                 # usage
dex list            # full catalog with shortcuts
dex notes           # open Notes
dex vinx            # open VINX (video editor)
dex split           # split screen (or shows the shortcut)
```

[DexCommand]: ../src/shared/commands/dexCommands.ts
