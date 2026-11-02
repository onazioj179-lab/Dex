# DEX OS 7.0.1 — Release Notes

**Creator:** Onazi Oj · **Theme:** DEX Blue Modern · Changes since 6.1.0 (the last published release).

## New

- **Interface Transparency.** One slider from 0% (fully opaque, no blur) to 100% (maximum glass) in Settings › Appearance, Settings › Shell and Control Center, with a separate blur-strength slider and a Refined/Liquid style choice. It changes the top bar, DEX Bar, menus, panels and window chrome live, follows light and dark mode, and is saved. Refined glass is the default (reads as 40%). Reduce Transparency and low-end mode keep surfaces opaque.
- **Wallpaper Overlay** in Display is labelled and wired correctly (it used to be a mislabelled "Glass Opacity" row).
- **Interface sounds** toggle in Settings › Sound, kept in sync with the menu toggle; the mute is remembered across restarts.
- **Calculator, rebuilt.** Keypad scales with the window, the pending operator stays highlighted, C clears the entry and AC clears everything, pressing = again repeats the last step, `200 + 10%` gives 220, and dividing by zero says so. Typed expressions (`sqrt(2)`, `5 km in mi`, `20% of 80`) use a safe parser.
- **One place for long tasks.** Downloads, file copies, exports (including Forge frame-sequence exports) and transfers show as small cards in the top-right corner with real progress, and Cancel where the task supports it. A failed or cancelled task now says so instead of "Done".
- **UKI assistant** (from the 6.1.x work, unreleased until now): choose where requests go (Local only, Hybrid, Cloud only, or one pinned model), reasoning effort, file actions limited to Documents/Desktop/Downloads with confirmation, pause/resume/cancel for background tasks, an activity log, memory you can view/forget/export/clear, AI keys encrypted with Windows DPAPI, daily AI usage and an optional cloud limit, "Look at my screen" and "Use my camera" (one frame each).
- **Spatial desktop and Creative Hub** (from Part 5, merged): windows on a pan/zoom canvas with zones, snapping and saved views; Creative Hub and whiteboard templates.

## Changed

- **Local AI is opt-in.** DEX no longer checks for Ollama on every start or uses it just because it is running. Turn on "Connect to a local AI service (Ollama)" in Settings › AI Providers if you want it. DEX never installs or starts an AI runtime.
- **Battery is no longer in the top bar.** It is in Control Center, which also says when a PC has no battery.
- **The DEX Bar no longer covers app content.** Apps and maximized windows end above it.
- **About** shows the version, the creator (Onazi Oj), the correct license, and where the open-source notices are.

## Fixed

- Turning off Windows animation effects no longer turns off glass.
- Fewer pop-ups: redundant toasts removed (pin/unpin in Files, "wallpaper applied", per-frame Forge export messages).
- Hover feedback came back in about a dozen apps (it was switched off whenever glass was off).
- The Calculator reacted to Enter, Escape and number keys pressed in other apps while it was open in the background.
- DEX starts reliably on machines where 6.0.x failed with "WebView2Loader.dll was not found"; opening DEX twice focuses the existing window.
- Light mode: the top bar, menus, dock and panels no longer stay dark; the live-activity card is readable in light mode.

## Faster

- DEX no longer runs a frame-by-frame monitor in the background. Idle Home: no frame callbacks and about one timer wake-up every 5 seconds. Minimizing DEX no longer makes it think the PC is overheating and turn effects off.
- Release builds use link-time optimisation: app 37.1 MB (was 40.1), NSIS installer 14.4 MB (was 15.1), MSI 17.8 MB (was 19.0).

## Security and integrity

- No private keys or tokens in the source, the app bundle or the installers (scanned).
- The release check refuses builds that would ship source maps, environment files or tests, and writes a SHA-256 checksum file for the installers (`npm run release:checksums` writes or verifies it on its own).
- Installer metadata names the publisher (Onazi Oj) and ships the license and third-party notices.

## Known limitations

- **The installers are not code-signed** (no certificate is configured), so Windows SmartScreen may warn on first run. In-app updates are not available.
- UKI needs an AI provider key, or a connected local Ollama with a model, for free-form requests.
- No cross-device sync; the AI limit counts tokens, not money.
- The Privacy Policy text is awaiting the owner's approval of the rewrite.
- Screen-reader, clean-VM install, multi-monitor and high-DPI checks were not run.

Full evidence: `DEX_7.0.1_VERIFICATION.md`. Open items: `DEX_REMAINING_WORK.md`.
