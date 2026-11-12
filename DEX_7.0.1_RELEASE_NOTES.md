# DEX OS 7.0.1 — Release Notes

**Creator:** Onazi oJ · **Theme:** DEX Blue Modern · Changes since 6.1.0 (the last published release).

## Build serials

7.0.1 stays the version until it is declared finished; each update is marked
`7.0.1 (<serial>)` in Settings › About, App Information and the startup log.

| Serial | What it adds |
| --- | --- |
| 18a | Build serials themselves. Builds before this were Parts 16–17: DEX Ledger (native engine, import of the earlier ledger), one app-pinning service, the Dock in the DEX Bar, the smart App Menu, shared app menus, Terminal split panes, Bioengineering workspace |
| 18b | Browser: real back/forward state and a proper error page when a site can't be reached (both verified live); Terminal checked live in a built app (PowerShell runs commands; four shells detected), page fullscreen events wired; Terminal shell profiles and Open in Terminal; App Information shows creator and licence; Bio Studio nearest-neighbour melting temperature and circular-plasmid digests; app audit of Calculator, Calendar, Notes, Files, Store, Transfers (no fake controls found) |
| 18c | Presentation: put pictures from your PC on slides (downscaled to fit), Save Deck / Open Deck as a .dexdeck file, and a clear warning if the deck can't be saved; VINX: a clear warning when the project can't be saved (it used to fail silently), with the native copy still written |
| 18f | Browser downloads work: files save to your Downloads folder (never overwriting an existing file), and a failed download says why instead of spinning forever |
| 18g | Your work is no longer lost silently when app storage is full: DexCode, Kanban, Markdown Editor, PDF annotations, Pixel Art, Imosion markers and regions, AXL design tokens, Collab Hub rooms and Spaces now warn once; DexCode shows "Not saved" instead of falsely saying Saved |
| 18j | More apps say so when they can't save your work: Calendar events, the Rewind journal, the Forge job queue, Imosion presets and track templates, and every app's crash-recovery copy |

## New

- **Interface Transparency.** One slider from 0% (fully opaque, no blur) to 100% (maximum glass) in Settings › Appearance, Settings › Shell and Control Center, with a separate blur-strength slider and a Refined/Liquid style choice. It changes the top bar, DEX Bar, menus, panels and window chrome live, follows light and dark mode, and is saved. Refined glass is the default (reads as 40%). Reduce Transparency and low-end mode keep surfaces opaque.
- **Wallpaper Overlay** in Display is labelled and wired correctly (it used to be a mislabelled "Glass Opacity" row).
- **Interface sounds** toggle in Settings › Sound, kept in sync with the menu toggle; the mute is remembered across restarts.
- **Calculator, rebuilt.** Keypad scales with the window, the pending operator stays highlighted, C clears the entry and AC clears everything, pressing = again repeats the last step, `200 + 10%` gives 220, and dividing by zero says so. Typed expressions (`sqrt(2)`, `5 km in mi`, `20% of 80`) use a safe parser.
- **One place for long tasks.** Downloads, file copies, exports (including Forge frame-sequence exports) and transfers show as small cards in the top-right corner with real progress, and Cancel where the task supports it. A failed or cancelled task now says so instead of "Done".
- **UKI assistant** (from the 6.1.x work, unreleased until now): choose where requests go (Local only, Hybrid, Cloud only, or one pinned model), reasoning effort, file actions limited to Documents/Desktop/Downloads with confirmation, pause/resume/cancel for background tasks, an activity log, memory you can view/forget/export/clear, AI keys encrypted with Windows DPAPI, daily AI usage and an optional cloud limit, "Look at my screen" and "Use my camera" (one frame each).
- **Spatial desktop and Creative Hub** (from Part 5, merged): windows on a pan/zoom canvas with zones, snapping and saved views; Creative Hub and whiteboard templates.

- **Touch & Pen settings.** Shows how many fingers your screen supports and has a test pad that draws every live contact. Up to ten fingers are tracked at once where the screen supports it.
- **Spotlight finds open windows**, and on the spatial desktop also your window groups, zones and saved views.
- **Password Generator+.** Passwords and passphrases (4 to 12 words), an option to leave out look-alike characters (0 O o 1 l I), strength from the real size of the space the value was chosen from, Enter or R to generate and Ctrl+C to copy. Save to Vault stores a value in the encrypted Vault, unlocking it (or creating one) on the spot.
- **Permissions in one place.** Settings › Permissions lists what DEX itself may use (clipboard, microphone, camera, location and more) with Allow, Ask or Block for each, and when each was last requested.
- **Checkpoints you can restore.** VINX and AXL save checkpoints of the whole project (also automatically when it changes); Collab Hub lists them with Restore and Delete.
- **Resume interrupted assistant tasks.** A UKI task cut off by closing DEX can be resumed once from the UKI panel.
- **Interface sound volume** in Settings › Sound.
- **Nexus › Diagnostics.** How DEX itself is doing: memory and CPU of all DEX processes, startup phases, app launch times, frame rate, crashes and errors, and background task durations. Measured on your computer and never uploaded; Copy report copies numbers only.
- **New Privacy Policy (3.0).** It describes what DEX actually does: your data stays on your computer, nothing is sent in the background, and every online service a feature can contact is listed with what it receives. You are asked to accept it once.

## Changed

- **Spatial desktop: no more corner toolbar or default minimap.** Right-click or long-press the desktop for zoom, arrange and window options (shortcuts unchanged). The minimap is off unless you turn it on.
- **Turning on the spatial canvas keeps your layout.** Windows stay where they were on screen; one that would overlap another moves to the nearest free spot in any direction. Before, they were lined up to the right of earlier windows, so the canvas grew into a long strip.
- **Clipboard history from other programs is opt-in.** Copies made inside DEX are always kept. Turn on "Include copies from other apps" in the clipboard history panel to also keep copies from other programs.
- **Keyboard shortcuts that were only labels now work:** Ctrl+, opens Settings, Ctrl+Shift+B shows or hides the DEX Bar, Ctrl+Shift+L locks DEX (was Ctrl+L, which the Browser address bar uses), and F11 makes the DEX window full screen.
- **Haptics only where there is a motor.** DEX no longer calls vibrate on every button press; a short pulse marks a snap on supported phones/tablets, and you can turn it off.

- **Local AI is opt-in.** DEX no longer checks for Ollama on every start or uses it just because it is running. Turn on "Connect to a local AI service (Ollama)" in Settings › AI Providers if you want it. DEX never installs or starts an AI runtime.
- **Battery is no longer in the top bar.** It is in Control Center, which also says when a PC has no battery.
- **The DEX Bar no longer covers app content.** Apps and maximized windows end above it.
- **About** shows the version, the creator (Onazi oJ), the correct license, and where the open-source notices are.

## Fixed

- DEX no longer asks again and again for permission to "see text and images copied to the clipboard": it used to read the clipboard every 4 seconds. Imosion no longer asks to "control and reprogram your MIDI devices"; it asks for ordinary MIDI access only when you open its MIDI panel.
- Passwords saved in Password Generator were stored unencrypted on disk. Recent passwords are now kept in memory for the session only, and passwords saved by an earlier version can be moved to the Vault or deleted. The clipboard is cleared 30 seconds after a copy only if it still holds the password.
- Settings › Permissions always showed an error under the current app framework.
- Unchecked checkboxes were hard to see in dark mode; their border now has at least 3:1 contrast.
- Right-click menus: the item the arrow keys are on is highlighted, submenus work from the keyboard and no longer run off the bottom of the screen, and menus no longer flash in the wrong place.
- Spotlight: Home and End move the cursor in the search text again, Tab no longer gets stuck in the Home search, and scrolling no longer changes the selected result.
- Notification Center: Escape closes it, each notification can be dismissed, and opening it no longer flashes a blur over the screen.
- Nexus: its charts no longer fail to draw, and grid lines show in light mode.
- AXL, FLUX, FORGE, Imosion and PRISM now keep their durable version-history snapshots; Plugin Marketplace and Nexus Biometrics work in the installed app (they reached the system too early and did nothing).
- Gallery: choosing the Yellow label no longer labels the item Orange.
- The "Optional Product Analytics" switch is gone: DEX has no analytics, so it did nothing.
- Browser: the saved-password prompt, the blocked-request count and full-screen video work with the native browser view.
- Rewind no longer checks for updates over the network every time it opens.
- A background task can no longer crash DEX with a stack overflow: background threads are named and get an 8 MB stack.
- Turning off Windows animation effects no longer turns off glass.
- Fewer pop-ups: redundant toasts removed (pin/unpin in Files, "wallpaper applied", per-frame Forge export messages).
- Hover feedback came back in about a dozen apps (it was switched off whenever glass was off).
- The Calculator reacted to Enter, Escape and number keys pressed in other apps while it was open in the background.
- DEX starts reliably on machines where 6.0.x failed with "WebView2Loader.dll was not found"; opening DEX twice focuses the existing window.
- Light mode: the top bar, menus, dock and panels no longer stay dark; the live-activity card is readable in light mode.

- Touch drags inside apps no longer lose their grip (the shell was taking over every touch), and pinching inside an app no longer opens the overview.
- The spatial canvas keeps panning and zooming when a third finger lands.
- Maps tells you when you are offline or search is down (instead of "No places found"), explains why My location failed, and says when map tiles could not load.
- Creative apps open in the background no longer react to keys typed in another app: Space in Notes no longer toggles FLUX playback, and Ctrl+Z in Notes no longer undoes FLUX, PRISM, Vinx, Imosion, FORGE, AXL, Canvas or Pixel Art edits. FLUX redo no longer gets out of step after an undo. The same applies to every other app: Files no longer pastes a copied file when you press Ctrl+V in a text box, Delete no longer removes a selected Canvas object while you work elsewhere, and Imosion no longer plays notes when you type in another app.
- Browser: typing `localhost:5173` or a local IP opens it instead of searching for it; `file:`, `data:` and other non-web addresses are refused with a reason.
- Task Manager: the per-app "Realtime / Frozen" menu did nothing and is gone. Each open app shows whether it is in the foreground, background or suspended, and apps that support it can be suspended to free GPU and audio.

## Faster

- DEX no longer runs a frame-by-frame monitor in the background. Idle Home: no frame callbacks and about one timer wake-up every 5 seconds. Minimizing DEX no longer makes it think the PC is overheating and turn effects off.
- Release builds use link-time optimisation: app 37.1 MB (was 40.1), installer 14.4 MB (was 15.1).

## One installer

- DEX 7.0.1 ships **one** Windows setup, `DEX_7.0.1_x64-setup.exe`. The MSI package is no longer built or published, and the old Electron packaging job that ran alongside the Tauri release on every tag was removed, so a release can no longer carry two competing installers.
- The setup installs for the current user in `%LOCALAPPDATA%\DEX`, with one uninstall entry. That is the same folder and entry 6.x used, so installing 7.0.1 over 6.x upgrades in place and keeps your data. If DEX was installed from an MSI before, the setup offers to remove that copy first.
- If WebView2 is missing, the setup installs it. Nothing else is bundled; no AI runtime is installed.

## Upgrading

Run `DEX_7.0.1_x64-setup.exe`. It detects the installed version, replaces it, and keeps your notes, settings and files. To go back, uninstall 7.0.1 and run the 6.1.0 setup from the [v6.1.0 release](https://github.com/onazioj179-lab/Dex/releases/tag/v6.1.0); your data folder is not removed by uninstalling unless you tick "Delete the application data".

## Security and integrity

- No private keys or tokens in the source, the app bundle or the installers (scanned).
- The release check refuses builds that would ship source maps, environment files or tests, and writes a SHA-256 checksum file for the installers (`npm run release:checksums` writes or verifies it on its own).
- Installer metadata names the publisher (Onazi oJ) and ships the license and third-party notices.

## Known limitations

- **The installer is not code-signed** (no certificate is configured), so Windows SmartScreen may warn on first run. In-app updates are not available.
- UKI needs an AI provider key, or a connected local Ollama with a model, for free-form requests.
- No cross-device sync; the AI limit counts tokens, not money.
- The Privacy Policy text is awaiting the owner's approval of the rewrite.
- Screen-reader, clean-VM install, multi-monitor and high-DPI checks were not run.

Full evidence: `DEX_7.0.1_VERIFICATION.md`. Open items: `DEX_REMAINING_WORK.md`.
