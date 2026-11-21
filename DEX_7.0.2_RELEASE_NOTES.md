# DEX OS 7.0.2 — Release Notes

**Creator:** Onazi oJ

## UKI, Xack and Umari
- **Xack** checks every UKI action in Rust: what it is, how risky it is, and whether it needs your approval. Approvals cover one exact command in one folder, once; the terminal refuses to run without one. You can allow a command for the session and revoke it in Security Center, where the full action history lives.
- **Umari** gives UKI context from your files: add folders to index (Settings › UKI), find projects and their test commands, and short cited excerpts. Key and credential files are never indexed by content.
- UKI asks in an in-app sheet that shows exactly what will happen; it can now act in Task Manager, Files, Gallery, DEX Code, Creative Studio, Slides and Project Dashboard.
- Requests are trimmed to fit each AI model's context size.

## Apps
- **Creative Studio** (was Canvas): Board and Slides in one window; frames become slides; project files (`.dexstudio`); reusable components; alignment guides and locking.
- **Gallery**: real photo adjustments with undo and before/after; edited copies saved with a Save dialog (originals untouched); your own albums; "Delete" now really moves files to the Recycle Bin.
- **Calendar and Tasks**: event alerts and timed task alerts, even when the app is closed; due dates no longer land a day early west of UTC; Undo after deleting.
- **DEX Code**: Tests tab runs your project's own test command (with approval) and summarises the results.
- **Files**: rename many items at once with a conflict-checked preview.
- **Browser**: search all saved history; remove single visits.
- **Search**: the App Menu and Classic Dock keep the search field anchored as results load. Search also finds code projects and offers "Ask UKI".
- **Pixel Art**: undo and redo. **Project Dashboard**: status report into Notes.

## Build serials
- **002a** adds Files tabs and folder scans, project-linked Env Manager profiles, Task Manager process details, and Windows power-plan verification.

## Updates
- Settings › Software Update shows the installed local preview build.
- New preview builds are installed locally when approved.

## Everywhere
- Confirmations and name prompts use DEX's own dialog instead of the system box.
- "Today" is your local day everywhere (daily challenges and streaks no longer roll over in the afternoon).
- About shows the full build: `7.0.2+build.<n>`, serial, commit, channel and build time.

## Known limitations
- Windows may show a SmartScreen prompt because the installer has no Authenticode certificate. In-app updates use a separate DEX signature.
- Cloud AI features need your own provider key.
