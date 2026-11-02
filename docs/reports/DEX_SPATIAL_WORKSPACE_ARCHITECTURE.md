# DEX Spatial Desktop — Architecture

**Date:** 2026-11-01 · **Creator:** Onazi Oj

The spatial desktop turns the existing DEX floating windows into a pannable, zoomable canvas. It is an **application-level** feature of the DEX shell (the Tauri/WebView2 renderer). It is not an OS compositor and does not embed other programs' native windows (see *Platform boundaries*).

## Components

| Piece | File | Role |
|---|---|---|
| Camera math | `src/renderer/shell/spatial/spatialMath.ts` | Pure functions: world↔screen transforms, zoom-at-point, pan, fit, culling test, centre-interpolated camera tweening, arrangements, new-window placement |
| State | `src/renderer/store/spatialStore.ts` | Zustand store: `enabled`, `camera`, view history, minimap, snap-to-grid, groups, per-app remembered world rects, pre-canvas screen layout; persisted (`dex-spatial-v1`, debounced) with repair-on-load |
| Shell wiring | `src/renderer/components/AppManager.tsx` | World layer, camera transform, culling, input, shortcuts, enter/exit, window placement, host bridge |
| Chrome | `src/renderer/shell/spatial/SpatialHud.tsx` | Zoom bar, arrange menu, minimap, Windows & Groups panel; group frames (world space) |
| Settings | `src/renderer/pages/settingsPanels/SpatialDesktopPanel.tsx` | Settings › Window Management › Spatial Desktop |

## Coordinate system

- Every floating window already had a rect `{x, y, w, h, z}` in AppManager's `detachedApps` map. On the canvas those rects are **world coordinates** (CSS px at 100%).
- Camera `{x, y, z}` = the world point at the top-left of the workspace and the zoom. `screen = (world − camera) × z`.
- Zoom range 5 %–300 % (`DEFAULT_LIMITS`), positions clamped to ±1,000,000 world px.
- Zoom-at-point recomputes the camera from absolute values (anchor world point − screen point ÷ new zoom), never from accumulated deltas. Unit test: 1,000 zoom/pan round trips return to the start within 1e-6 px.

## Rendering

- All floating windows render inside one **world layer** (`[data-spatial-world]`), a 0×0 absolutely positioned div in the content surface. With the canvas off it has no transform and is layout-transparent: windows anchor exactly as before.
- With the canvas on, the world layer gets `translate(−cx·z, −cy·z) scale(z)` (transform-origin 0 0). The transform is written **outside React**: AppManager subscribes to the store and writes it as inline `!important`, so pan/zoom never re-render AppManager. `!important` is required because the low-performance tier has a `*:hover { transform: none !important }` rule. `transition: none` is also set, otherwise the global theme transition makes the camera lag the pointer.
- Windows stay real DOM: apps are live and interactive at any zoom (text selection, scrolling and input are native; Chromium hit-tests through the transform). Menus that apps portal to `document.body` appear at normal size next to their trigger.
- **Culling:** 120 ms after the camera settles, windows more than 400 px (screen) outside the view get `data-spatial-offscreen`, which applies `content-visibility: hidden`, and are moved to the `background` lifecycle phase (apps using `useAppLifecycle` pause heavy rendering). App state and timers are untouched; nothing is unmounted and no snapshot is substituted.
- **LOD:** below 35 % zoom the deep window shadows are dropped.

## Interaction

| Action | Input |
|---|---|
| Toggle canvas | Ctrl/⌘+Alt+S, Settings switch, or `dex-spatial-toggle` event |
| Pan | Wheel / two-finger scroll over the desktop; middle-drag; Space+drag (Space only claimed when focus isn't in a window or text field); Ctrl+Alt+Arrows |
| Zoom | Ctrl+wheel / pinch over the desktop; Alt+wheel anywhere; Ctrl+Alt+= / − / 0; HUD |
| Fit all / previous view | Ctrl+Alt+F / Ctrl+Alt+Backspace (20-step history) |
| Focus a window | Maximize button or title double-click (zooms to the window); Ctrl+Alt+Enter; Windows panel |
| Move / resize | Existing title-bar drag and 8 resize handles; pointer deltas are divided by zoom, screen clamps and edge-snapping are off on the canvas; optional 20 px snap-to-grid |
| Keyboard focus | Tabbing into an off-screen window pans it into view |

## Groups and layouts

- Groups: name, colour, members (a window belongs to one group), collapse (minimizes members), focus (fits the camera). A frame behind the members carries a label; dragging the label moves all members from their drag-start positions.
- Arrangements: grid, masonry, presentation row, cascade. Each keeps window sizes, and is undoable one step.
- New windows on the canvas open at their remembered world rect, or at normal size in the nearest free spot in the current view (cascade fallback when the view is full).

## Persistence and recovery

- Persisted: enabled flag, camera, minimap, snap-to-grid, groups, per-app world rects, the screen layout from before entering.
- Window contents are **not** stored. Apps are not reopened automatically by the canvas.
- Load runs a repair `merge`: invalid cameras, groups and rects are dropped or reset instead of failing. Unit-tested with corrupt input.
- Entering keeps non-colliding remembered places (front-most window wins a collision) and grids the rest. Leaving restores the exact pre-canvas screen layout.

## Platform boundaries

- Works wherever the DEX renderer runs (Tauri on Windows today). Only DEX's own app windows are on the canvas. Third-party native windows (other programs) are **not** embedded or captured: WebView2/Tauri offers no supported way to composite foreign HWNDs into a transformed web surface, and capturing them would need screen-capture permission per window. Not attempted, not simulated.
- Split view and the canvas are mutually exclusive (entering split view leaves the canvas).
- Linux `dex-os` / UKI: the canvas is userspace renderer code, not a boot component; nothing in the boot chain changed.

## Accessibility

- Windows & Groups panel (Ctrl+Alt+W): searchable list of every window, including minimized ones. Enter jumps to the first match. Select with checkboxes to group; rename, recolour, collapse and ungroup groups. This is the non-spatial way to navigate the canvas.
- Every HUD control is a labelled button; zoom level is announced through a polite live region; Escape closes the panel; visible focus outlines.
- Reduced motion: camera transitions jump instead of animating.
