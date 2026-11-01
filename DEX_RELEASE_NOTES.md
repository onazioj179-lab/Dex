# DEX — Release Notes (6.1.x)

**Creator:** Onazi Oj

## Fixed

- **DEX starts again.** Installs of 6.0.x could fail with "WebView2Loader.dll was not found" even though WebView2 was installed. The installer now produces an app that starts reliably.
- **No more blank window at startup** in the installed app.
- **Clear messages instead of silent failure** if the WebView2 runtime is missing or the window can't load, with a log saved for support.
- **Opening DEX twice** brings the existing window forward instead of starting a second copy.
- **Light mode is readable** again (text was nearly invisible).
- **Notes:** "Attach file" and "Import" work.
- **Maps:** Satellite and Topo styles load. UKI answers for time, word definitions and currency work.

## Faster

- DEX uses **much less CPU while idle**: about 1–2% of a core instead of 50–100%. It no longer rebuilds the file search index every time it starts.
- Smaller installer (14 MB).

## Privacy and honesty

- Turning off **Memory Recording**, **Allow Notifications**, **Enable UKI** or **Location Services** now really turns those things off.
- UKI no longer sends your messages to a third-party service when you haven't set up an AI provider.
- Removed settings that did nothing (including "firewall", "VPN" and "malware" switches that protected nothing). Hardware settings now open the right Windows Settings page.
- DEX makes no network connections at startup or while idle.

## New look

- Neutral graphite surfaces with the **macOS system-blue** accent.
- Consistent corner radius and motion timing.
- Respects your "reduce motion" preference.

## Storage

- **Settings › Storage** shows what DEX actually uses and can clear its caches safely. Your notes, settings and backups are kept.

## Known limitations

- In-app updates aren't available yet.
- Removing an app hides it, but doesn't free disk space.
- The Privacy Policy text is being updated.
- Screen-reader support hasn't been fully tested.

## Test status (this branch)

Full unit suite, Rust unit tests, typecheck and the release build pass. See `DEX_PART3_IMPLEMENTATION_REPORT.md` and `DEX_PART1_PART2_COMPLETION_AUDIT.md` for evidence.
