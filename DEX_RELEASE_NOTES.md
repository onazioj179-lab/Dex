# DEX — Release Notes (6.1.x)

**Creator:** Onazi Oj

## New in this release: UKI assistant

- **Choose where your requests go.** Settings › AI Providers › Processing: Hybrid, **Local only** (nothing leaves your PC), Cloud only, or one pinned model. DEX enforces this itself. Before, the "Offline" choice could still send a streamed reply request to a cloud provider.
- **Reasoning effort:** Automatic, Fast, Balanced or Deep. This controls how many steps UKI may take and how long its answers can be.
- **UKI can work with your files**, but only inside Documents, Desktop and Downloads and only after you allow it in Permissions. It always asks before creating, renaming or moving anything. Deleting always goes to the Recycle Bin.
- **Pause, resume or cancel** UKI's background tasks from Nexus. Cancel stops the request immediately.
- **Activity log:** everything UKI does is recorded in Security Center (kept across restarts). You can clear it.
- **Memory you control:** view what UKI remembers, forget single items, export it all as JSON, or clear everything.
- **Your AI keys are encrypted** with Windows DPAPI. Keys saved by older versions are moved into secure storage automatically.
- **Local AI works in the desktop app.** Ollama used to refuse DEX's requests. DEX now talks to it directly on this PC, finds the installed models, and uses them without any key.
- **See and limit AI usage:** today's tokens per provider, plus an optional daily limit for cloud AI. Local models are never limited.
- **"Look at my screen" works again** in the desktop app. You pick the window to share in the Windows picker, and DEX takes one frame.
- **"Use my camera"** in UKI takes one photo for your next message. The camera turns off before anything is sent.

## Fixed

- **DEX starts again.** Installs of 6.0.x could fail with "WebView2Loader.dll was not found" even though WebView2 was installed. The installer now produces an app that starts reliably.
- **No more blank window at startup** in the installed app.
- **Clear messages instead of silent failure** if the WebView2 runtime is missing or the window can't load, with a log saved for support.
- **Opening DEX twice** brings the existing window forward instead of starting a second copy.
- **Light mode is readable** again (text was nearly invisible). The top bar, menus, dock and panels no longer stay dark in light mode.
- **Notes:** "Attach file" and "Import" work.
- **Maps:** Satellite and Topo styles load. UKI answers for time, word definitions and currency work.

## Faster

- DEX uses **much less CPU while idle**: about 1–2% of a core instead of 50–100%. It no longer rebuilds the file search index every time it starts.
- Smaller installer (14 MB).
- Buttons and toggles use an accessible blue (white text now meets WCAG AA in dark mode).

## Privacy and honesty

- Turning off **Memory Recording**, **Allow Notifications**, **Enable UKI** or **Location Services** now really turns those things off.
- UKI no longer sends your messages to a third-party service when you haven't set up an AI provider.
- Removed settings that did nothing (including "firewall", "VPN" and "malware" switches that protected nothing). Hardware settings now open the right Windows Settings page.
- DEX makes no internet connections at startup or while idle. The only startup request is a check for a local Ollama on this PC (127.0.0.1).
- **Clear All Memory** now really clears everything. It used to leave the saved conversations and transcript behind. With Memory Recording off, the transcript is no longer saved.

## New look

- Neutral graphite surfaces with the **macOS system-blue** accent.
- Consistent corner radius and motion timing.
- Respects your "reduce motion" preference.

## Storage

- **Settings › Storage** shows what DEX actually uses and can clear its caches safely. Your notes, settings and backups are kept.

## Known limitations

- UKI needs an AI provider key, or an installed Ollama model, for free-form requests. Cloud and local model speed haven't been measured yet.
- There is no cross-device sync yet. The daily AI limit counts tokens, not money.
- In-app updates aren't available yet.
- Removing an app hides it, but doesn't free disk space.
- The Privacy Policy text is being updated.
- Screen-reader support hasn't been fully tested.

## Test status (this branch)

See `DEX_PART4_COMPLETION_REPORT.md` for the commands, results and remaining gaps. Older evidence: `docs/reports/`.
