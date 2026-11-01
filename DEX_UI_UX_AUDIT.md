# DEX — UI / UX Audit

**Date:** 2026-11-01 · **Creator:** Onazi Oj

## Visual direction (owner decision, 2026-11-01)

The macOS-referenced look uses neutral graphite surfaces, the **macOS system-blue accent**, no gold and no green. "Golden Modern" in the Part 3 prompt was a macOS reference, not a request for gold.

## Design tokens (one source: `src/renderer/styles/design-system.css`)

| Group | Dark | Light |
|---|---|---|
| Base / surface / elevated | `#111214` / `#1B1D20` / `#212327` | `#F8F8F6` / `#FFFFFF` / `#FFFFFF` |
| Text primary / secondary | `#F5F5F2` / `#B5B5AE` | `#202124` / `#3C3C43` |
| Accent (hover / pressed) | `#0A84FF` (`#409CFF` / `#0071E3`) | `#0066CC` (`#0058B0` / `#004A94`) |
| Text on accent | `#FFFFFF` | `#FFFFFF` |
| Radius | 4 · 6 · **10** · **14** · **18** · **24** · full | same |
| Motion | 100 · 150 · 220 · 260 (panel) · 340 (major) ms | same |

These values are also kept in step in:
- the **boot block** in `index.html` (it had drifted to a *blue* accent while the stylesheet said green, so launches flashed the wrong color);
- the **ThemeManager** default presets;
- **`tokens.ts`** (radius);
- **`styles/motionDurations.ts`** (motion). TierManager and Settings used to write conflicting durations inline (400 / 250 / 80 ms); both now use this one module.

Light-mode `#007AFF` (true macOS) is only 3.8:1 on the light base, so DEX uses `#0066CC` (5.2–5.6:1).

## Contrast (measured live in the packaged app)

| Pair | Dark | Light |
|---|---|---|
| text-primary / base | 17.16:1 | 15.14:1 |
| text-secondary / base | 9.09:1 | 10.29:1 |
| text-tertiary / base | 5.75:1 | 5.63:1 |
| text-muted / base | 7.20:1 | 4.92:1 |
| accent / base | 5.14:1 | 5.24:1 (computed) |
| error / success / warning (≥3:1) | pass | pass |
| `--color-border` (decorative) | 1.1–1.4:1 | 1.6–1.7:1 |

Fixed along the way:
- Light mode was **unreadable** (1.00:1 and 1.34:1) because the inline preset colors fought `data-theme`. One `MutationObserver` now keeps them in sync.
- Light muted text was 2.9–3.3:1 and is now ≥4.5:1.
- Toggles used system green; they now use the accent with a ≥3:1 knob.

## Radius

Tokens follow the owner scale. Shell surfaces (Settings, Store, dock/launcher, Control Center, `shell/`) are snapped. **636** inline values inside individual apps remain; `tests/unit/radius-scale-ratchet.test.ts` fails if that number grows. Tool: `node scripts/snap-radius-to-scale.mjs <path>`.

## Motion and reduced motion

Verified in the packaged app: with the OS preference *and* with the Settings toggle, effective transition duration is **0.01 ms**. This PC has Windows animation effects off (`MinAnimate = 0`), which DEX correctly follows at boot. The JS twin (`animationTokens.ts`) was already in range.

## Accessibility

- Global `:focus-visible` ring on buttons, `role=button`, links and inputs.
- Notification items and `DexListItem` are keyboard-operable.
- The Keyboard Shortcuts page lists the real shortcuts.
- Not done: a screen-reader pass (Narrator/NVDA) and a full Tab-through.

## Remaining inconsistencies

- 636 off-scale inline radii in apps.
- Hardcoded hex colors inside individual apps (not swept).
- `--color-border` is below 3:1 where it is a control's only boundary.
- The three hero accent presets (Dark Knight, Nanite) remain as user choices. Removing them is the owner's call.
- No screen-by-screen visual review of all 59 apps.
