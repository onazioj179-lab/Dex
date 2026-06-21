# DEX Backlog — Small / Standalone Apps

> **On scope.** The originating spec asked for "Generate 500 New Small App Features." This
> document delivers a complete, organized **~500-item** catalog. Every item maps to a real app
> that exists under `src/renderer/DEXAPPLICATIONS/standalone/`, `src/renderer/DEXAPPLICATIONS/notes/`,
> `src/renderer/components/`, or `src/renderer/pages/`, and is written as a concise, actionable line.
> It is a backlog to pull from, not prose — scan a category, pick an item, build it.
>
> Items lean toward two goals: (1) making each app genuinely more useful on its own, and
> (2) connecting apps to the rest of DEX (Notes, ContextBus, DexProject, UKI, Clipboard,
> command registry, send-to / receive-from flows).
>
> **Grand total: ~500 items.** Per-category counts:
>
> | Category | Items |
> |---|---|
> | First Wins | 10 |
> | Productivity | 96 |
> | Creative | 80 |
> | Developer | 88 |
> | AI | 42 |
> | Media | 66 |
> | System | 60 |
> | Utility | 68 |
> | Cross-App Connective Tissue | 12 |
> | **Total** | **522** |
>
> Categories: Productivity · Creative · Developer · AI · Media · System · Utility, plus
> First Wins and Cross-App connective tissue.

---

## First Wins (10 — highest value, lowest effort, build next)

These are small, self-contained, and unblock cross-app flows used by many other items.

1. **Calculator** — add "copy result" + "send result to Notes" actions (history tape already exists).
2. **Calculator** — unit-aware input (`5 km in mi`, `20% of 80`) parsed inline.
3. **Clipboard** — pinned items + history search box.
4. **Color Picker** — copy in any format (HEX/RGB/HSL) one-click + "send swatch to Notes/Canvas".
5. **Unit Converter** — recent/favorite conversions row; swap-units button.
6. **Password Generator** — strength meter + one-click copy with auto-clear-clipboard timeout.
7. **Timer / Stopwatch / Pomodoro** — shared persistent state so a running timer survives app switch.
8. **QR Code Generator** — paste-from-clipboard URL + download as PNG/SVG.
9. **Notes** — global "send to Notes" sink any app can target (Calculator, Color Picker, Terminal output).
10. **World Clock** — "add city" from a search field with timezone autocomplete.

---

## Productivity (96)

### Notes (`DEXAPPLICATIONS/notes/`)
1. Global "Send to Notes" inbox that any app can append to (result, swatch, snippet, URL).
2. Backlinks / `[[wiki-links]]` between notes with a link graph view.
3. Inline tags (`#tag`) with a tag sidebar and tag-filtered views.
4. Slash-command menu for blocks (heading, todo, code, callout, table).
5. Daily-note template auto-created per day, linked to Calendar.
6. Full-text search across all notes with match highlighting.
7. Pin notes to top; archive instead of delete.
8. Code blocks with syntax highlighting and copy button.
9. Export note to Markdown / PDF / clipboard.
10. Word/char count and reading-time in the status bar.
11. Attach a note to a DexProject so it surfaces in workspace context.
12. Checklist progress bar when a note contains todos.
13. Note templates (meeting, standup, retro, blank) from a picker.
14. Folder/notebook tree with drag-to-move and collapse.
15. Split-view to read two notes side by side.
16. Version history per note with restore-to-version.
17. Outline/heading navigator panel for long notes.
18. Table-of-contents auto-generated from headings.
19. Inline image paste from clipboard with thumbnail resize.
20. Per-note color/icon for quick visual scanning.
21. Markdown-table editor with add-row/column controls.
22. Recently-edited row and "continue where you left off".
23. Encrypt a single note behind a passphrase.
24. Convert a note's todo lines into Tasks in one click.
25. Pinned "scratchpad" note always one keystroke away.

### Tasks (`pages/Tasks.tsx`)
26. Natural-language due dates ("tomorrow 5pm", "next fri").
27. Recurring tasks (daily/weekly/custom).
28. Subtasks with rollup completion percentage.
29. Smart lists: Today, Upcoming, Flagged, Overdue.
30. Drag to reorder within a list and between lists.
31. Quick-add bar with `!priority`, `#list`, `@date` tokens.
32. Convert a Note line or Kanban card into a Task.
33. Surface today's tasks in UKI / Home context.
34. Per-task notes field and attachments.
35. Bulk complete / move / delete selection.
36. Estimated vs actual time per task with a running tally.
37. Tags on tasks with tag-filtered saved views.
38. Snooze a task to a later date with one click.
39. Completed-today summary panel for end-of-day review.
40. Keyboard-only triage mode (j/k navigate, x complete, e edit).
41. Dependency links ("blocked by") with a warning badge.
42. Start a Pomodoro session bound to the selected task.
43. Sort lists by priority, due date, or manual order.
44. Quick filter chips (priority, list, has-due-date).

### Calendar (`standalone/Calendar.tsx`)
45. Week and Day views alongside Month.
46. Create event by click-drag on a time grid.
47. Recurring events with exceptions.
48. Show Tasks with due dates as all-day calendar items.
49. Color-coded calendars / categories with toggle visibility.
50. Jump-to-date and keyboard month navigation.
51. "Today" pill and mini-month navigator.
52. ICS import/export for a single event or range.
53. Surface next event in the DEX bar widget.
54. Link an event to a DexProject and to related Notes.
55. Event reminders with system notification before start.
56. Duplicate an event and drag-to-reschedule.
57. Agenda/list view of the next N days.
58. Working-hours overlay and weekend dimming.
59. Search across event titles and notes.
60. Quick-create from natural language ("lunch fri 12").

### Kanban (`standalone/KanbanApp.tsx`)
61. WIP limits per column with visual warning.
62. Card labels, due dates, and assignees.
63. Card detail panel with description, checklist, and linked Notes.
64. Swimlanes / grouping by label or priority.
65. Quick-add card inline at the bottom of each column.
66. Archive done column; board-level activity log.
67. Convert card ↔ Task two-way sync.
68. Board templates (Bug Triage, Sprint, Personal).
69. Filter/search bar across cards.
70. Per-board DexProject binding.
71. Card cover color and emoji marker.
72. Drag a card to Calendar to schedule its due date.
73. Column collapse to save horizontal space.
74. Card count and aggregate estimate per column.
75. Multi-board switcher with recent-boards row.

### Pomodoro / Timer / Stopwatch (`standalone/PomodoroTimer.tsx`, `Timer.tsx`, `Stopwatch.tsx`)
76. Shared timer-state store so timers persist across app switches and survive reload.
77. Pomodoro: configurable work/break lengths + long-break cadence.
78. Pomodoro: session log + daily focus total, optionally linked to active Task/Project.
79. Pomodoro: auto-start next interval toggle; skip-break button.
80. Timer: multiple named concurrent timers.
81. Timer: preset chips (1m, 5m, 10m, 25m) and quick-restart.
82. Stopwatch: lap times with split deltas and fastest/slowest highlight.
83. Stopwatch/Timer: completion sound choice + system notification.
84. Send a finished session as a Note or Task log entry.
85. Mini-display of any running timer in the DEX bar.
86. Pomodoro: weekly focus chart and streak counter.
87. Timer: per-timer label and color for quick identification.
88. Stopwatch: export lap table to clipboard/CSV.
89. Do-not-disturb toggle that mutes other DEX notifications during a focus session.

### Presentation Builder (`standalone/PresentationBuilder.tsx`)
90. Slide thumbnail rail with drag-reorder.
91. Master/theme selection and per-slide layout templates.
92. Speaker notes per slide.
93. Present mode (fullscreen) with next/prev and timer.
94. Import outline from a Note (heading → slide).
95. Export to PDF.
96. Presenter clock + elapsed-time bar in present mode.

---

## Creative (80)

### Color Picker (`standalone/ColorPicker.tsx`)
1. Output formats: HEX, RGB, HSL, HSB, CSS var — copy any with one click.
2. Saved palettes with naming; export palette as JSON/CSS/SVG.
3. Eyedropper to sample any on-screen pixel.
4. Contrast / WCAG AA-AAA checker against a chosen background.
5. Generate harmonies (complementary, triadic, analogous) from a base color.
6. Shades/tints ramp generator.
7. Send swatch to Canvas / PixelArt / Notes.
8. Recent-colors strip persisted across sessions.
9. Color blindness simulation preview (protanopia/deuteranopia/tritanopia).
10. Image-to-palette extraction (drop an image, get dominant colors).
11. Gradient builder with copy-as-CSS.
12. Lock a hue and vary lightness/saturation only.
13. Name-the-color (nearest named color) lookup.
14. Mix two colors with an adjustable ratio slider.
15. Import palette from a hex list pasted from clipboard.

### Canvas (`standalone/Canvas.tsx`)
16. Layers panel with reorder, opacity, and visibility toggle.
17. Brush size/opacity/hardness controls and an eraser.
18. Shape tools (rect, ellipse, line, arrow) with snapping.
19. Undo/redo history stack with keyboard shortcuts.
20. Pull active color from Color Picker.
21. Export PNG/SVG; copy canvas to clipboard.
22. Pan/zoom with fit-to-screen.
23. Text tool with font/size/color.
24. Background grid / dot toggle with snap.
25. Color-fill bucket and gradient fill.
26. Selection + move/transform of a region.
27. Import an image as a backdrop layer to trace.
28. Adjustable canvas size / aspect presets.
29. Recolor a layer with the active Color Picker swatch.
30. Save/restore a canvas to Files or a DexProject.

### Pixel Art (`standalone/PixelArt.tsx`)
31. Adjustable grid size and per-cell color from the Color Picker palette.
32. Frames + onion-skin for simple animation; export GIF/spritesheet.
33. Mirror/symmetry drawing mode.
34. Fill bucket and color-replace.
35. Export PNG at integer scale (1x/4x/8x).
36. Import an image and downscale to the grid.
37. Tile-preview mode (repeat the canvas to check seamlessness).
38. Palette lock to a fixed N-color set.
39. Line and rectangle tools snapped to the grid.
40. Per-frame duration control for animation timing.

### Markdown Editor (`standalone/MarkdownEditor.tsx`)
41. Live split preview with synced scroll.
42. Toolbar for bold/italic/link/code/table.
43. Export to HTML/PDF and copy rendered output.
44. Drag-drop image insert.
45. Open/save against the file system and DexProjects.
46. Document outline (heading nav) sidebar.
47. Word/char/reading-time counter.
48. Find/replace with regex toggle.
49. GitHub-flavored task list checkboxes that toggle in preview.
50. Mermaid/code-fence rendering in preview.
51. Front-matter editor panel for YAML metadata.
52. Send the rendered output to Notes or a Presentation outline.

### Gallery (`pages/Gallery.tsx`)
53. Folder/album grouping and tag filtering.
54. Lightbox with keyboard nav and basic zoom/pan.
55. EXIF/metadata panel.
56. Quick rotate/crop and send-to-Canvas.
57. Slideshow mode.
58. Multi-select with batch tag, move, or delete.
59. Sort by date, name, or size with grid/list toggle.
60. Favorites/star filter.
61. Copy image to clipboard and "set as wallpaper".
62. Inline rename and folder breadcrumb.
63. Duplicate-image detection hint.
64. Send an image to PixelArt or QR (encode as data) flow.

### Games (`pages/Games.tsx`)
65. Per-game high-score persistence and personal-best badge.
66. Recently-played row and search/filter across games.
67. Pause/resume with state preserved across app switch.
68. Difficulty selector per game with remembered preference.
69. Achievements hook-in that reports to the Achievements app.
70. Keyboard + on-screen control parity.
71. Session timer that can log focus breaks to Pomodoro.
72. Sound on/off and volume control shared with system mute.

### Presentation visuals & shared creative
73. Theme/token preview swatch board pulling from `design-tokens.css`.
74. Reusable shape/sticker library shared between Canvas and PixelArt.
75. Export-as-image action standardized across Canvas, PixelArt, Gallery.
76. "Pick color" hand-off: any creative app can request a color from Color Picker.
77. Recent-exports tray (last N images you exported) with re-open.
78. Aspect-ratio presets (1:1, 16:9, 4:5, story) shared across creative apps.
79. Drop-to-import: drag a file from Files into any creative canvas.
80. Copy-as-data-URL for embedding a small image into Notes/Markdown.

---

## Developer (88)

### DexCode (`standalone/DexCode.tsx`)
1. Multi-tab editor with file-system open/save.
2. Language-aware syntax highlighting and bracket matching.
3. Integrated find/replace with regex.
4. Run/format current file via the scripting engine where available.
5. Bind editor to a DexProject so its file tree is the project root.
6. Command-palette actions (go to file, go to symbol).
7. Diff view against last saved / git HEAD.
8. Send selection to Terminal or AI (Uki) for explanation.
9. File-tree sidebar with create/rename/delete.
10. Split editor (side-by-side files).
11. Minimap and current-line/column indicator.
12. Code folding and indentation guides.
13. Multi-cursor and column selection.
14. Snippet manager with tab-stops.
15. Per-language formatter config and format-on-save toggle.
16. Breadcrumb path bar with symbol drill-down.
17. Recent-files quick switcher (Ctrl-P style).
18. Inline TODO/FIXME marker gutter + a TODO list panel.
19. Theme + font/ligature settings shared with Terminal.
20. Open the current file's folder in Files.

### Terminal (`components/Terminal.tsx`, `TerminalTabs.tsx`)
21. Persisted command history with search (Ctrl-R style).
22. Named tabs/sessions with restore on relaunch.
23. Split panes.
24. Per-DexProject working directory.
25. Copy-on-select / paste, and "send output to Notes".
26. Quick-actions bar (clear, kill, cd to project).
27. Theme + font-size controls.
28. Saved command snippets / aliases palette.
29. Click a file path in output to open it in DexCode.
30. Environment-variable inspector for the session.
31. Scrollback search with match highlight.
32. Per-tab title auto-set from running command.
33. Broadcast input to all split panes toggle.
34. Export the current buffer to a file or Notes.
35. Inline exit-code badge on each completed command.

### Git Client (`standalone/GitClient.tsx`)
36. Stage/unstage by file and by hunk.
37. Commit with message box and amend toggle.
38. Branch list with checkout/create/delete.
39. Visual diff viewer for working tree and staged.
40. Commit history graph with details panel.
41. Pull/push/fetch status indicators (no auto-push).
42. Bind to the active DexProject repo.
43. Stash list and apply/drop.
44. Blame view for the open file in DexCode.
45. Conflict resolver with ours/theirs/both choices.
46. Tag list with create/delete.
47. Remote list and per-remote ahead/behind counts.
48. Discard changes per file with confirm.
49. Commit-message templates and last-message recall.
50. File history (log for a single path) with diff per commit.

### Env Manager (`standalone/EnvManager.tsx`)
51. Per-project `.env` profiles with switching.
52. Mask/reveal secret values; copy single value.
53. Validation against a schema / required-keys list.
54. Import/export `.env` files.
55. Diff two profiles.
56. Warn on duplicate or empty keys.
57. Inline comments preserved on import/export.
58. Generate a `.env.example` from the current profile (values stripped).
59. Search/filter keys.
60. Bulk paste key=value lines to populate a profile.

### SSH Client (`standalone/SshClient.tsx`)
61. Saved host profiles (host, user, port, key path).
62. Connection status and quick reconnect.
63. Per-host known-hosts and key management UI.
64. Recent-sessions list.
65. Open a Terminal tab against a saved host.
66. Host groups/folders for organizing many machines.
67. Per-host startup command / snippet.
68. Copy a ready-made `ssh ...` command for a host.
69. Connection latency/ping indicator per host.
70. Import hosts from an existing `~/.ssh/config`.

### Workflows (`pages/Workflows.tsx`)
71. Visual step list with reorder.
72. Trigger types (manual, schedule, app-event).
73. Run history with per-step status and logs.
74. Templates for common chains (build, backup, deploy).
75. Bind a workflow to a DexProject.
76. Dry-run / preview mode that shows steps without executing.
77. Per-step retry and continue-on-error toggle.
78. Pass outputs from one step as inputs to the next.
79. Enable/disable a workflow without deleting it.
80. Notification on completion/failure routed to the system tray.

### Browser (`pages/Browser.tsx`)
81. Tabbed browsing with restore-on-relaunch.
82. Bookmarks bar and a searchable bookmark store.
83. Reader mode that can send the article to Notes.
84. "Encode this URL as QR" hand-off to QR Code Generator.
85. Per-tab find-in-page.
86. Open a link's domain map/info in a side panel.
87. Send the current URL to Tasks/Calendar as a follow-up.
88. Zoom and per-site zoom memory.

---

## AI (42)

### Uki (`standalone/Uki.tsx`)
1. "Ask about current app" using the registered UKI app context.
2. Insert AI response into Notes / DexCode at cursor.
3. Conversation history with per-conversation titles and search.
4. Slash-prompts / saved prompt templates.
5. Summarize selected Note / file / Terminal output.
6. Cross-app actions ("create a Task from this", "draft an event").
7. Token/context indicator and stop-generation control.
8. Cite which DEX context (project, note, app) was used.
9. Pin a conversation and resume it later.
10. Regenerate / edit-and-resend the last message.
11. Attach a file or selection as context with a removable chip.
12. Copy a code block from a response with one click.
13. Per-conversation model/provider selector (uses AiProviderSettings).
14. Quick "explain this error" from Terminal output.
15. Draft a commit message from the Git Client staged diff.
16. Turn a rough Note into a structured outline in place.
17. Streaming responses with a visible typing/stop control.
18. Saved "personas"/system prompts per task type.
19. Export a conversation to a Note or Markdown.
20. Inline retry with a different provider on failure.

### Nexus (`standalone/Nexus.tsx`)
21. Surface ContextBus signals as a live knowledge graph.
22. Filter graph by app, project, or recency.
23. Click a node to open the underlying item.
24. Pin a subgraph as a saved view.
25. Explain a connection via Uki.
26. Search nodes by label with highlight-and-center.
27. Cluster nodes by app or project with collapsible groups.
28. Timeline scrubber to replay how the graph grew.
29. Export the current graph view as an image.
30. Node detail panel with related items and "open in app".
31. Adjustable edge-strength threshold to declutter.

### Learn (`standalone/Learn.tsx`)
32. Track progress per lesson/module with resume.
33. Inline code/quiz checkpoints.
34. Bookmark and note-taking that lands in Notes.
35. Search across lessons.
36. Recommend next lesson based on activity.
37. Per-lesson estimated time and completion badge.
38. Streak/daily-goal tracker that reports to Achievements.
39. Glossary popovers for inline terms.
40. "Try it" buttons that open DexCode/Terminal with a starter.
41. Export a course's notes bundle to a single Note.
42. Spaced-review queue surfacing past lessons due for recall.

---

## Media (66)

### Weather (`standalone/Weather.tsx`)
1. Multiple saved locations with quick switch.
2. Hourly + 7-day forecast strip.
3. Units toggle (C/F, km/h-mph) persisted.
4. "Use current location" and city search.
5. Compact widget mode for the DEX bar.
6. Severe-weather highlight.
7. Sunrise/sunset and UV-index row.
8. Precipitation-probability chart for the next hours.
9. "Feels like" and humidity/wind detail card.
10. Auto-refresh interval with last-updated timestamp.
11. Per-location wallpaper/background tint by condition.

### World Clock (`standalone/WorldClock.tsx`)
12. Add city via timezone-autocomplete search.
13. Day/night shading per clock.
14. Reorder and remove cities.
15. Meeting-planner strip (overlap of working hours).
16. 12/24h toggle.
17. Pin a "home" clock.
18. Show offset from home (+3h) on each clock.
19. Convert a specific time across all clocks (time-traveler slider).
20. Highlight cities currently in working hours.
21. Send a chosen meeting time to Calendar.

### Noise Generator (`standalone/NoiseGenerator.tsx`)
22. Mixable layers (white/pink/brown, rain, waves, cafe).
23. Per-layer volume sliders and master volume.
24. Save/load presets.
25. Sleep timer / fade-out.
26. Keep playing across app switches (shared audio state).
27. Random "shuffle a soundscape" generator.
28. Crossfade between presets.
29. Bind a preset to start automatically with a Pomodoro session.
30. EQ-lite tone control per layer.
31. Mini transport control in the DEX bar.

### Audio (`pages/Audio.tsx`)
32. Playlist/queue with reorder.
33. Waveform scrubber and time display.
34. Loop/shuffle and playback-speed control.
35. Now-playing surface in the DEX bar.
36. Keyboard media keys.
37. Folder import and library search.
38. A-B repeat loop region.
39. Gapless / crossfade between tracks.
40. Per-track replay-gain / normalization toggle.
41. Sleep timer that fades out and pauses.
42. Output-device selector.
43. Send "now playing" metadata to Notes as a log entry.

### PDF Viewer (`standalone/PDFViewer.tsx`)
44. Thumbnail page rail and outline/bookmarks nav.
45. Text search with match highlight.
46. Zoom presets and fit-width/page.
47. Copy selected text; extract page range.
48. Rotate pages; open from Files/DexProject.
49. Single/continuous/two-page layout toggle.
50. Highlight/annotation layer saved alongside the file.
51. Jump-to-page input and page-count readout.
52. Send selected text to Notes or Uki for summary.
53. Export current page as an image to Gallery.

### Screen Recorder / Screenshot (`standalone/ScreenRecorder.tsx`)
54. Region / window / full-screen capture choice.
55. Mic + system-audio toggles.
56. Countdown before start; pause/resume.
57. Output format and frame-rate selection.
58. Save to Files / DexProject and reveal on stop.
59. Trim start/end before save.
60. Still-screenshot mode with annotate (arrow/box/blur).
61. Copy a screenshot straight to clipboard.
62. Capture-then-QR or capture-then-Notes hand-off.
63. Webcam overlay bubble during recording.
64. Highlight cursor / show clicks during capture.
65. Recent-captures tray with quick re-open.
66. Scheduled/delayed capture (timed screenshot).

---

## System (60)

### Files (`pages/Files.tsx`)
1. Tabbed locations and breadcrumb path bar.
2. Quick-look preview pane.
3. Multi-select with batch move/copy/delete.
4. Search within current folder + recents.
5. "Open with" routing to DEX apps (md → Markdown Editor, png → Gallery).
6. Pin favorite folders; bind a folder as a DexProject root.
7. Column/list/grid view toggle with sort options.
8. Inline rename and new-folder creation.
9. File properties panel (size, dates, type, path).
10. Copy path / copy as relative path actions.
11. Show hidden files toggle.
12. Compress/extract archive in place.
13. Duplicate-file finder within a folder.
14. Drag-drop into Canvas/Gallery/DexCode.
15. Disk-usage breakdown for the current folder.

### Task Manager (`pages/TaskManager.tsx`)
16. Live CPU/memory/process list with sort.
17. Kill/restart process actions.
18. Per-DEX-app resource attribution.
19. Sparkline history for CPU/mem.
20. Filter/search processes.
21. Group processes by application.
22. Network/disk I/O columns.
23. Pin a process to watch it persistently.
24. Per-process detail panel (threads, path, start time).
25. Export a snapshot of current usage to Notes.

### Power (`pages/Power.tsx`)
26. Battery/charging status and time-remaining estimate.
27. Power-mode toggle (balanced / saver / performance).
28. Per-app energy impact list.
29. Schedule sleep/restart.
30. Battery-health and cycle-count readout.
31. Low-battery action rules (e.g. dim, switch to saver).
32. Wake-history / sleep-log timeline.
33. Quick "keep awake for N minutes" toggle.

### Recycle Bin (`standalone/RecycleBin.tsx`)
34. Restore single item to original location.
35. Empty-with-confirm and "empty older than N days".
36. Search/filter deleted items.
37. Show original path and deletion date.
38. Size-reclaimable readout for the whole bin.
39. Bulk-restore selection.
40. Sort by date deleted, size, or original folder.

### Transfers (`pages/Transfers.tsx`)
41. Pause/resume/cancel per transfer.
42. Progress, speed, and ETA per item.
43. Retry failed transfers; clear completed.
44. Open destination folder on completion.
45. Overall throughput summary across active transfers.
46. Bandwidth-limit toggle.
47. Notification on completion routed to the tray.
48. Queue reorder and priority bump.

### Store (`pages/Store.tsx`)
49. Search and category filtering of apps.
50. Installed vs available state with update badges.
51. App detail page with screenshots and permissions.
52. "Recently added" and "featured" rows.
53. Update-all action with per-app progress.
54. Per-app changelog/version-history view.
55. Ratings/favorites and a "my apps" filter.
56. Permission summary before install/enable.

### Settings (`pages/Settings.tsx`)
57. Settings search that jumps to the matching pane.
58. Per-app default-handler mapping (file type → app).
59. Export/import settings profile.
60. Reset-to-defaults per section with confirm.

---

## Utility (68)

### Calculator (`standalone/Calculator.tsx`)
1. Copy result and "send to Notes" (history tape already present).
2. Unit-aware / natural input (`5 km in mi`, `20% of 80`, `sqrt(2)`).
3. Keyboard-first entry parity with on-screen buttons.
4. Variable memory slots (M1..M4) beyond single M.
5. Programmer mode (hex/bin/oct, bitwise).
6. Pin history entry; reuse expression by click.
7. Thousands-separator and configurable precision.
8. Scientific functions panel (trig, log, exp, factorial).
9. Date/time math (`today + 30d`, "days until ...").
10. Percentage helpers (tip, tax, markup) as named buttons.
11. Send a number to Unit Converter as the input value.
12. Angle-mode toggle (deg/rad/grad).
13. Constants palette (pi, e, c, g) insertable into input.

### Unit Converter (`standalone/UnitConverter.tsx`)
14. Swap-units button and recent/favorite conversions.
15. Categories: length, mass, temp, data, speed, area, volume, currency.
16. Live currency rates with last-updated and offline fallback.
17. Copy converted value; send to Calculator/Notes.
18. Multi-target output (convert once, see several units).
19. Search a unit by name across categories.
20. Custom/compound units (e.g. fuel economy, density).
21. Per-category precision and significant-figures control.
22. Pin a frequently used pair to the top.
23. Cooking/recipe units category with sensible defaults.

### QR Code Generator (`standalone/QRCodeGenerator.tsx`)
24. Paste-from-clipboard and "encode current URL".
25. Download as PNG/SVG; copy image to clipboard.
26. Encode Wi-Fi, contact (vCard), and geo payloads via a typed form.
27. Error-correction level and size/quiet-zone controls.
28. Logo/center-icon overlay.
29. Foreground/background color from Color Picker.
30. Batch generate from a list of lines.
31. History of recently generated codes with re-open.
32. Encode a Calendar event (vEvent) or email (mailto) payload.
33. Rounded/dot module style options.

### Password Generator (`standalone/PasswordGenerator.tsx`)
34. Strength/entropy meter.
35. Length + character-class toggles + exclude-ambiguous.
36. Passphrase mode (word lists, separators).
37. Copy with auto-clear-clipboard timeout.
38. Bulk generate N passwords.
39. Avoid-similar and pronounceable options.
40. Custom required-set rules (≥1 digit, ≥1 symbol).
41. History of generated secrets cleared on close (never persisted).
42. PIN mode (digits-only, fixed length).
43. Estimated crack-time readout next to the meter.

### Clipboard (`components/ClipboardHistory.tsx`)
44. Pinned items that never expire.
45. Search across history.
46. Type-aware previews (text, link, color, image).
47. Paste-as-plain-text action.
48. Clear history + per-item delete.
49. "Send clip to Notes / Calculator / QR".
50. Merge several clips into one combined paste.
51. Snippet library (saved frequently pasted text).
52. Transform actions (uppercase, trim, slugify) before paste.
53. Per-item source-app label.

### Maps (`standalone/Maps.tsx`)
54. Search with autocomplete and recent searches.
55. Saved/favorite places.
56. Distance/route between two points.
57. Drop a pin and copy coordinates.
58. Share a location to Notes / a Calendar event.
59. Switch map style (standard/satellite/terrain).
60. Measure a multi-point distance path.
61. "Encode this place as QR" hand-off (geo payload).

### Live Activity Browser (`standalone/LiveActivityBrowser.tsx`)
62. Filter activity by app and time range.
63. Click-through to the originating item.
64. Pause/resume the live feed.
65. Export an activity slice.

### Collab Hub (`standalone/CollabHub.tsx`)
66. Presence list and per-room status.
67. Shared note/board link-out into the relevant app.
68. Activity timeline per collaborator.

### Achievements (`standalone/Achievements.tsx`)
> (covered under Games/Learn hooks; see items above)

---

## Cross-App Connective Tissue (12 — applies to most apps above)
1. Universal **"Send to…"** menu (Notes, Tasks, Calendar, Clipboard, Uki, Files).
2. Universal **"Open with…"** routing from Files by file type.
3. Register every app's live state with the **UKI app-context registry** (pattern already used by Tasks).
4. Emit meaningful events to **ContextBus** so Nexus and Uki can reason across apps.
5. Honor the active **DexProject** as default scope (cwd, repo, file root, linked notes).
6. Adopt the shared **command registry** so every app action is reachable from the command palette.
7. Consistent empty/error/loading states via shared `EmptyState` / `ErrorState` / `DexLoader`.
8. Persist per-app UI state (last tab, filters, scroll) across relaunch.
9. Shared **toast/notification** sink so every app reports completion the same way.
10. A standard **"copy" + "export"** affordance contract (clipboard, file, send-to).
11. Per-app **keyboard-shortcut** registration surfaced in a global shortcuts cheat-sheet.
12. Standard **recents** primitive (recent files/searches/items) reusable by any app.
