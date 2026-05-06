# DEX -- Privacy Policy

**Effective date:** 2026-05-05
**Version:** 1.0.0
**Author:** Onazi Treasure OJ &lt;onazi.treasure@outlook.com&gt;
**Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.**

DEX is built on a single principle: **your data lives on your device unless
you explicitly choose otherwise**. This document explains exactly what data
DEX touches, where it lives, and what controls you have.

---

## 1. Summary

| Data | Default | Where it lives | How to disable |
|---|---|---|---|
| Telemetry / analytics | **Off** | Not collected | N/A |
| Crash reports | **Local only** | `%APPDATA%/DEX/logs` | Settings > Diagnostics |
| Update checks | On (HTTPS, signature-verified) | Update server only | Settings > Updates |
| Cloud sync | **Off** | Your chosen provider, E2E encrypted | Settings > Sync |
| Plugin network | Per-plugin permission | Plugin sandbox | Settings > Plugins > Permissions |
| Browser cookies | Per-tab partition | Local IndexedDB | Browser > Clear site data |
| Files indexed | Local sqlite catalog | `%APPDATA%/DEX/index` | Settings > Files > Indexing |
| Rewind captures | **Local only**, encrypted at rest | `%APPDATA%/DEX/rewind` | Settings > Rewind |
| Voice (UKI) | Local on-device by default | Memory + cache only | Settings > UKI |
| Biometric data | OS-managed (Windows Hello / Touch ID / etc.) | OS keychain | Settings > Security |

## 2. Data DEX Stores Locally

DEX stores the following on your computer:

- **App state**: window positions, focus history, dock layout, theme.
- **User content**: notes, tasks, calendar entries, browser history,
  downloads, gallery thumbnails, audio playlists.
- **System metadata**: indexed file paths, EXIF, audio tags (no file bodies
  uploaded).
- **Diagnostic logs**: a rotating ring of log entries kept locally.
- **Plugin storage**: each plugin gets a private isolated storage shard.
- **Secrets**: stored in the OS keychain (DPAPI / Keychain / Secret Service)
  using AES-256-GCM where applicable.

You can view, export, or delete any of the above at any time:
- **View**: Settings > Privacy > Data on device.
- **Export**: Settings > Privacy > Export all data (signed bundle).
- **Delete**: Settings > Privacy > Delete (per-category or all).

## 3. Data DEX Does NOT Collect

DEX does not collect, by default:

- Usage telemetry, behavioral analytics, or session replay.
- Personally identifiable information sent to the Author.
- Browser history outside the local store.
- File contents from your file system.
- Microphone or camera input outside the moment a feature is actively used.
- Location data, except when a feature you invoke (e.g. Weather) needs it
  and you accept the per-feature prompt.

## 4. Network Egress

DEX makes outbound network requests only in the following cases:

1. **Update checks** to the configured update server, when enabled.
2. **Browser app** when you navigate to a URL.
3. **Plugins** that you have granted network permission to.
4. **Cloud sync** when you have configured and enabled it.
5. **Optional features** (e.g. weather provider, currency conversion) that
   you explicitly enable and that show their endpoint in Settings.

Every outbound request is observable in Settings > Diagnostics > Network.

## 5. Cloud Sync (Optional)

When cloud sync is enabled:

- Data is encrypted on your device with a key you control before upload.
- The Author has no access to your encryption key or your synced data.
- You may revoke a device or wipe the cloud copy at any time.
- The cloud provider is configurable; the Author does not host a default
  cloud sync endpoint.

## 6. Plugins

Each plugin runs in a sandbox with its own permission manifest:

- File system: jailed to a per-plugin private directory plus user-granted dirs.
- Network: per-host allowlist; off by default.
- Native module access: explicitly granted per capability.
- Storage: isolated IndexedDB shard.

You can revoke any plugin permission at any time in
Settings > Plugins > Permissions. Revocation takes effect immediately.

## 7. Children's Privacy

DEX is a developer / power-user tool not directed at children under 13.
The Author does not knowingly collect data from children.

## 8. Security Practices

- **Encryption at rest** for sensitive stores using AES-256-GCM with keys
  derived from OS-protected secrets.
- **Encryption in transit** via TLS for every network call.
- **Code signing** on Windows and macOS distribution binaries.
- **Update signature verification** with rollback on mismatch.
- **Renderer sandboxing**: `nodeIntegration: false`, `contextIsolation: true`,
  strict CSP, IPC origin assertion.
- **Defense Orchestrator**: in-app surface for security-relevant events.

For the full security disclosure policy and contact, see
[docs/SECURITY.md](docs/SECURITY.md).

## 9. Your Rights

You have, with respect to data DEX stores on your device:

- The right to access, export, and delete your data at any time.
- The right to disable any optional feature that creates data.
- The right to reset DEX to factory defaults (with confirmation).
- The right to inspect every log entry, every IPC message, and every
  outbound request in Settings > Diagnostics.

## 10. Changes to This Policy

The Author may update this policy. The current text is the one in this
repository at the commit you obtained the Software from. Material changes
are noted in [docs/CHANGELOG.md](docs/CHANGELOG.md).

## 11. Contact

Privacy questions or requests:

- **Email:** onazi.treasure@outlook.com
- **Project:** https://github.com/onazioj/dex

---

**DEX** -- Designed, built, and maintained by **Onazi Treasure OJ**
Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
