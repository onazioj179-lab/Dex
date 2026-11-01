# DEX — Security & Privacy Report

**Date:** 2026-11-01 · **Creator:** Onazi Oj

## Security

| Area | Finding | Status |
|---|---|---|
| Startup integrity | GNU-built exe depended on an unshipped DLL | **Fixed**: build refuses GNU release; bundle gate checks PE imports |
| `shell:openExternal` / `openPath` | Any string reached the OS opener (could launch executables) | **Fixed in PR #62 (open)**: http(s)/mailto/`windowsdefender:`/`ms-settings:` only; refuses executables, network/device paths, ADS; 7 tests |
| CSP | Only the hosts the code actually fetches; IPC custom protocol blocked on purpose (postMessage measured faster) | Reviewed, documented in `index.html` |
| Single instance | Duplicate shells could run schedulers twice on one DB | **Fixed** |
| Fake security UI | "Firewall", "Anti-Hacker", "Malware", "Sandbox", "VPN" toggles reported "Protected" while doing nothing | **Removed**; real protections stated (Argon2id lock, AES-256-GCM vault, Windows Security link) |
| Secrets | Vault key derived (Argon2id), never stored | Unchanged (audited earlier) |
| Signed updates | In-app updater is a stub | **Blocked**: needs an owner-held signing key |

## Privacy

| Area | Finding | Status |
|---|---|---|
| Network at launch/idle | 0 external requests (captured) | Verified |
| Third-party SDKs | None (no analytics/crash/ads) | Verified |
| UKI silent transfer | Messages + context were POSTed to Hugging Face when no provider was set | **Removed** |
| Location | Maps read position even with Location Services off | **Fixed** (default off, enforced) |
| UKI memory | "Memory Recording" off still stored conversations; retention never applied | **Fixed** (PR #61) |
| Notifications | "Allow Notifications" off changed nothing | **Fixed** (PR #61) |
| Enable UKI | Off didn't stop the voice mic | **Fixed** (PR #61) |
| Google Fonts prefetch | DNS lookups to Google every launch | **Removed** |
| Crash reports | Toggle claimed "send"; nothing is sent | Replaced with the truth |
| Cookie banner | No non-essential tracking | Not needed |
| Refund policy | Payments disabled | Not applicable today |
| Children | Local-first, no ads/analytics/social | No age gate proportionate; legal confirmation pending |
| **PRIVACY.md** | Over-claims diagnostics/analytics; omits real user-triggered services | **Blocked: owner declined the rewrite.** Facts ready in `docs/privacy/DATA_FLOWS.md` |
| Terms | Not clause-reviewed | Needs legal review |

## Creator attribution

- The only creator credit is **Onazi Oj** (existing file headers read "Onazi Treasure OJ", the same person's full name; left unchanged).
- AI-tool attribution removed from PR #60/#61 descriptions and `docs/PR-DESCRIPTION.md`.
- No AI co-author trailers exist in the history.
- None will be added to commits, PRs, docs or release notes.
- Third-party license notices are untouched.
