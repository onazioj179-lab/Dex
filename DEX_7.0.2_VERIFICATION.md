# DEX OS 7.0.2 verification

**Release decision: NOT READY**

Target Windows 11 x64, Tauri 2.11.2, and the NSIS candidate workflow. Base revision `d457441d744c` with local worktree changes. The repository has a tag and version check for packaging. An established build serial generator was not found.

## Gates

| Gate | Status |
| --- | --- |
| Version metadata | Package, lockfile, Rust and Tauri target 7.0.2. |
| Renderer production build | Production Vite build, TypeScript check and attribution check completed. Rebuild the installer from the final renderer sources before release. |
| Native build and tests | Locked Windows Cargo check passed. The optimized 7.0.2 executable compiled and reported product version 7.0.2. Native test execution was still pending when desktop automation stopped. |
| Browser saved sessions | All six targeted tests passed. The five sizes from 25 to 500 records cover metadata restoration, search, selection and persistence with simulated native IPC. The sixth confirms that disabling restoration preserves the saved record. |
| Security | Source audit confirms page windows are outside the shell capability and excluded from the custom IPC handlers. Packaged verification remains open. |
| Native audio | Windows adapter and argument validation implemented. Hardware and independent routing verification remain open. |
| Installer | The initial offline NSIS attempt stopped during WebView2 provisioning. A later test of build 1038 verified per-user upgrade from 7.0.1, startup on the existing data, uninstall with data retention, and rollback from backup. The Part 27 worktree verified the build 1042 bundle. The final signed candidate, elevated installs, other Windows accounts and rollback through the 7.0.1 installer remain open. |
| Application coverage | The source inventory is recorded in [remaining work](DEX_REMAINING_WORK.md). Primary workflow verification remains open. |
| Performance | The installed 7.0.1 app opened one primary window. Browser reproduced a blank page surface. One launch-and-window-enumeration observation took 5.27 seconds and includes automation overhead. Comparative package timings and the physical device matrix remain open. |

The full Vitest attempt reported 2,934 passes, five failed assertions and 129 worker-start errors. The run overlapped with the native build and does not clear the release gate. Desktop automation stopped before the 7.0.2 runtime walkthrough.

The later Notes and Files changes are source-only. Notes passed a mocked check for rapid selection, ordered writes and save failure handling. The Files bridge passed mocked checks for conflicts, successful native results and missing IPC. Changed Rust files passed a syntax parse. A production rebuild and packaged checks for document recovery, file conflicts, cross-volume moves and Trash restoration remain open.

Ten focused Windows filesystem tests passed for the batch service and rename planner. They exercised nested folder copies, same-volume moves, no-overwrite conflicts, cancellation, duplicate selections, partial-result reporting, rename swaps, and rollback after a simulated failure. Targeted TypeScript checks and renderer logic checks passed for Files, PowerRename, the batch report and rename preview. Cross-volume folder moves and copies containing symbolic links or reparse points remain outside the implemented workflow. The packaged UI and non-Windows native paths remain unverified.

## Umari, UKI and Part 29

- Nine focused Windows search tests passed for the Tantivy index. Two focused native UKI sanitizer tests passed in a harness with stubbed Tauri permission and preference dependencies. The 98 targeted UKI validation and agent tests passed. Native dialogs, live watcher recovery and provider behavior remain package checks.
- Forty-one focused shell tests passed, including anchored zoom, pan limits, window resizing, preservation of an unsaved editor across spatial toggles, rapid transition reversal and live reduced motion. These tests use a DOM harness and do not measure compositor performance.
- Gallery source tests cover cursor-anchored image zoom and pan bounds for fitted and rotated images.
- Six focused Task Manager and UKI native-permission bridge tests passed with mocked IPC. Six Terminal tests passed and two existing cases remained skipped. The latest locked Windows Cargo check passed with four existing dead-code warnings.
- The Part 29 source changes have no new installer verification, physical input matrix or hardware timings. Live spatial rendering and window controls, OS process sampling, native terminal sessions, Browser downloads, data-preserving upgrade and the remaining application workflows stay open.

## Native Terminal follow-up

- Four headless Windows PTY tests passed in an isolated Cargo harness. A real Command Prompt produced output after the ConPTY cursor handshake, accepted a native resize, and exited normally. A separate test started a descendant shell and verified process cleanup through the session's Job Object. The remaining tests exercise split UTF-8 and geometry limits. [Microsoft ConPTY reference](https://learn.microsoft.com/en-us/windows/console/createpseudoconsole)
- Fifteen focused Terminal and DexCode file-safety tests passed. Terminal coverage includes subscription before spawn, startup output and early exit, late-session cleanup, ANSI transcript handling, tab restoration, split lifecycle and shell profiles. The locked Windows native check and scoped TypeScript checks passed. Packaged keyboard behavior, full-screen terminal programs, and the Unix runtime matrix remain open.

## DexCode project tasks

- Five Windows task-runner tests passed for manifest discovery, diagnostic path validation, stdout and stderr, the process exit code, cancellation and Unicode output limits. A separate fixture ran the installed npm and Cargo programs. It verified a successful npm build, a failing npm test with exit code 7, a Cargo build and a passing Cargo test. [npm run-script](https://docs.npmjs.com/cli/v8/commands/npm-run-script/) · [Cargo build](https://doc.rust-lang.org/cargo/commands/cargo-build.html) · [Cargo test](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- Twenty focused renderer tests passed across Project Tasks, file safety and Terminal. Coverage includes cancellation acknowledgment, restoring the current run, disabled tool states, verified diagnostic navigation, and aborting superseded project scans. The locked Windows Cargo check, scoped TypeScript and stylesheet parsing passed.
- Packaged Project Tasks and Unix process cleanup remain unverified.

## DexCode project browsing and editing

- Six Windows filesystem tests passed for nested listings and search, dependency and environment-file exclusions, search cancellation and result limits, junction rejection, workspace and document scope, revision conflicts and concurrent writers. The locked Windows Cargo check and scoped TypeScript check passed.
- Twenty-six focused renderer tests passed across the editor, project browser, Project Tasks and Terminal. The editor test opens a nested file through the project list, sends a scoped save, keeps edits made while that save is pending, and sends the updated revision on the next save. It also confirms that another surface's Save shortcut does not write the editor file.
- Main-window workspace editing authority restores from the native configuration. Detached windows hold their own live selection. Projects saved by older builds can be browsed and need one new folder selection to enable direct project saves. The packaged picker, configuration round trip and non-Windows file operations remain release checks.

## DexCode editor tab recovery

- Thirty focused renderer tests passed across editor recovery, project browsing, file safety, Project Tasks and Terminal. New cases cover lazy reopening, tab order, per-file drafts and selections, external edits, saving a separate recovered copy, save completion while another tab is active, a legacy empty draft, and explicit confirmation before dropping a dirty tab.
- Scoped TypeScript passed. The renderer tests use the local storage fallback with a simulated bridge. IndexedDB persistence and native picker behavior still need a packaged WebView2 check.

## DexCode Git

- Two Windows native tests passed against the scoped Git service, including a real repository fixture. They verify that a selected subdirectory omits sibling files, preserves literal filenames and rename paths, separates staged changes from working-tree changes, blocks parent traversal, and disables configured file filters while reading changes.
- The focused renderer run passed 31 tests. The Git case covers loading status on demand, switching diff views, opening a file, refreshing after saving, and handing the repository root to the already-open Git app. The locked Windows native check passed. The packaged native bridge and non-Windows Git behavior still need verification.

## DexCode language diagnostics and long files

- The latest focused renderer run passed 34 tests. The new coverage checks JavaScript, TypeScript and TSX syntax and source locations, ignores superseded worker replies, and confirms that the editor renders only nearby gutter rows for a 12,500-line file.
- A production Vite build emitted a separate worker. The built worker diagnosed malformed TSX in a headless JavaScript runtime. The scoped TypeScript and stylesheet checks passed.
- The worker reports syntax from the current document. Project-wide type analysis, external language servers and packaged WebView2 verification remain open.

## Application windows and motion

- The focused renderer run passed 67 tests. It covers isolated app appearance and portal inheritance, preservation of mounted content, window-size limits and launch placement, preference updates across a simulated window bridge, immediate dropdown dismissal semantics and reversal, and a simulated snap interrupted at its visible bounds.
- Four tests of the Rust preference schema passed in a lightweight harness. The locked Windows native check and scoped renderer TypeScript check passed. The full Cargo test build was stopped when it began recompiling the desktop dependency tree.
- Headless Chromium exercised the actual stylesheets and Web Animations API. It verified opposite themes in adjacent scopes, high contrast, operating-system and per-app motion reduction, and a snap interrupted without changing the visible position or width.
- WebView2 still needs the live checks for rendered palettes, compositor motion, keyboard and touch, and preferences reaching a detached window.

## Notes defaults and save timing

- The mounted Notes regression covers restoring the editor and list layouts, waiting for the configured 1.5-second pause, saving immediately with Ctrl+S, returning to writing from preview, and saving an edit made just before closing. It also checks that initialization opens an existing note without creating a blank note first.
- Tests used a simulated native bridge. Packaged SQLite writes, cross-window editing and exports still need end-to-end checks.

## Browser live pages and saved tab scale

- Sixteen focused renderer tests passed across Browser and window preferences. Browser coverage restores and searches 25, 50, 100, 250 and 500 saved tabs, verifies navigation commands and stale-event rejection, protects live pages during bulk closing, and isolates the desktop and detached tab sessions.
- Two focused Rust policy tests passed. They cover page IDs shared across different DEX windows and rejection of shell origins, loopback and unsafe schemes. TypeScript and the locked Windows Cargo check passed.
- A production-mode Browser renderer ran headlessly in Chromium at 1280×800 against a simulated native bridge. Each case used one fresh page. The probe measured renderer startup to a visible address bar, then selected the final saved tab through search. The last tab was visible afterward. No page instances opened.

| Saved tabs | Restore (ms) | Select (ms) | Rendered tabs | JS heap (MiB) | Main-thread task time (ms) |
| --- | --- | --- | --- | --- | --- |
| 25 | 159 | 40 | 10 | 7.5 | 434 |
| 50 | 190 | 30 | 10 | 7.5 | 292 |
| 100 | 185 | 30 | 10 | 7.5 | 283 |
| 250 | 192 | 34 | 10 | 7.7 | 296 |
| 500 | 185 | 32 | 10 | 7.7 | 260 |

- The samples include browser test overhead. Heap and task time describe the Chromium renderer process at the end of each sample. DEX desktop startup, system CPU, and active WebView2 page memory require separate measurements.
- The renderer tests simulate the native bridge. The Windows package still needs live testing for WebView2 history, redirects, failed loads, URL and title events, tab closing and active-page resource use.

## Browser Find and downloads on Windows

- Browser targets the active page window for Find. WebView2 supplies the search bar, search navigation and match count on supported runtimes. The renderer checks engine support and limits Ctrl+F to the Browser workspace. [WebView2 Find reference](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2find?view=webview2-1.0.3405.78)
- WebView2 holds each accepted download request while Browser waits for an explicit destination. Browser reports progress and cancellation. Transfer records are scoped to the originating DEX window and retained for the running session. Closing a tab from Browser preserves active downloads. [WebView2 download event reference](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2downloadstartingeventargs?view=webview2-1.0.4022.49)
- Eighteen renderer tests passed across Browser and window preferences. Two Rust policy tests covered filename and origin validation, request limits and window ownership. The scoped TypeScript and locked Windows Cargo checks passed.
- Renderer tests use a simulated native bridge and cover Find targeting, destination selection, progress, cancellation and stale event ordering. Packaged WebView2 still needs real-file, dialog, cancellation and Find smoke tests.

## Task Manager, Sound and shell lifecycle

- Fifty-five focused renderer tests passed. They cover stale process and audio rows, a reused PID during confirmation, failed volume writes, clipboard cleanup and restart, keyboard focus for destructive confirmations, and virtual lists after filtering.
- A Windows native test verified that an incorrect process creation time leaves an isolated child running and that the matching identity ends it. Confirmed Task Manager process actions use Windows handles. Packaged process-tree behavior and physical audio devices still need verification.

## Open apps and spatial controls

- Forty focused renderer tests and TypeScript passed. A production Vite build passed with existing chunk-size and mixed-import warnings.
- Headless Chromium ran the built renderer. Search and Enter restored a minimized Timer window. Fit kept two live windows inside the spatial viewport. The overview fit at 430 px without horizontal overflow. Native Windows and touch checks remain open.

## Platform references

- Windows endpoint and per-application session semantics. [Microsoft Core Audio sessions](https://learn.microsoft.com/en-us/windows/win32/coreaudio/audio-sessions)
- Playback device events and supported settings pages. [Microsoft endpoint notifications](https://learn.microsoft.com/en-us/windows/win32/coreaudio/relevant-device-notifications-for-stream-routing), [Windows Settings URI reference](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)
- Linux investigation. WirePlumber provides volume, mute and default-device operations. [WirePlumber wpctl reference](https://pipewire.pages.freedesktop.org/wireplumber/man/wpctl.html)
- macOS investigation. Core Audio taps capture process audio and support tap-specific muting. [Apple Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)
- Native WebView capability boundaries. [Tauri capability reference](https://v2.tauri.app/reference/acl/capability/)
