# DEX OS 7.0.1 — Release Notes

**Creator:** Onazi Oj · **Design:** DEX Blue Modern · **Status: NOT READY for public release** (see `DEX_7.0.1_VERIFICATION.md`)

## What changed

- **Interface Transparency slider** (Settings → Appearance and Settings → Shell → Liquid Glass).
  One control, 0% fully opaque (no blur, cheapest) to 100% most translucent supported glass. The refined
  default reads as 40%. Blur strength is a separate slider and a Refined/Liquid style choice sits beside
  it; both appear once glass is on. The slider never swaps the style mid-drag. Applies live and persists.
- **Light/dark fix for glass surfaces** (landed in parallel on main as the refined-glass default; reconciled here). The shell wrote dark-only inline values over the light theme, so
  menus, docks and panels could stay near-black in light mode. Material vars now follow the active theme
  and re-resolve on every theme switch with no restart. The CSS fallbacks for low-perf tier and
  reduced-transparency also got light variants.
- **Reduce Motion no longer disables glass.** Only the OS "reduce transparency" preference (or Low-End Mode)
  flattens glass now.
- **Wallpaper Overlay.** The old "Glass Opacity" row in Display actually drove the wallpaper overlay and showed
  a wrong value; it is now labelled and wired correctly.
- **Creator attribution.** About shows "DEX OS Creator: Onazi Oj" and "DEX Blue Modern". Copyright and license
  lines are unchanged.
- **Version 7.0.1** across `package.json`, lockfile, `tauri.conf.json`, the Rust crate, and the in-app app
  registry. The trust-report version now follows the crate version instead of a hard-coded `6.0.0`.
- **Release build profile** for the Tauri crate (`opt-level 3`, thin LTO, `strip = debuginfo`). Panic strategy
  stays `unwind` on purpose: IPC handlers rely on `catch_unwind`.
- **`npm run release:checksums`** writes and verifies `SHA256SUMS` for the current version's installers only.

## Already true (verified, not changed)

- No battery icon in the top bar; battery lives in Control Center, Power and Home widgets.
- No Ollama (or any AI runtime) is bundled, installed or launched; providers are optional and off by default.
- No secrets in tracked files (only test fixtures match secret patterns).
- `shell:openExternal` is scheme-allowlisted; `launcher:launchPath` is restricted to indexed apps.

## Known limitations

Installer is unsigned (no certificate available); MSI could not be built offline. See `DEX_REMAINING_WORK.md`.
