# DEX — Data Flow Inventory (factual, from code)

**Status:** engineering inventory, 2026-11-01. Not a legal document. It records what the
DEX 6.1 desktop build actually does, so `PRIVACY.md` can be corrected (see "Policy gaps").

## How this was established

- Every outbound host in `src/renderer`, `src/shared` and `src-tauri/src` was traced to its caller.
- The packaged app was launched with WebView2 remote debugging and every network request was
  recorded during a fresh page load plus 30 s idle: **9 requests, 0 to any external host.**
- No analytics, telemetry, crash-reporting or advertising SDK is present (searched for Sentry,
  Bugsnag, PostHog, Mixpanel, Amplitude, Segment, Google Analytics/gtag; `sendBeacon` appears only
  in the Browser app's ad-block script, which *blocks* it).

## Automatic network activity

**None.** DEX contacts no server at startup or while idle. The update checker's version URL is
empty and its check/download/install channels are stubs, so it makes no request.

## User-triggered third-party requests

| Feature | Host(s) | Sent | When |
|---|---|---|---|
| Weather app | `api.open-meteo.com`, `geocoding-api.open-meteo.com` | City name typed, or coordinates of a chosen place | User opens Weather / searches a city |
| Maps — standard style | `tiles.openfreemap.org` | Map tile requests (reveal the area being viewed) | User views a map |
| Maps — Satellite / Topo styles | `server.arcgisonline.com`, `*.tile.opentopomap.org` | Map tile requests | User picks that style |
| Maps — place search | `geocoding-api.open-meteo.com` | Search text | User searches |
| Maps — "My location" | Windows location service (via WebView2) | Device position stays local; used to centre the map | Only if **Location Services** is on in Settings (default **off**) and the user taps My location |
| UKI keyless answers | `api.duckduckgo.com`, `en.wikipedia.org` | Question text | User asks UKI a factual question |
| UKI time / dictionary / currency | `worldtimeapi.org`, `api.dictionaryapi.dev`, `open.er-api.com` | Time-zone name / word / currency code | User asks for those |
| UKI with an AI provider | `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `openrouter.ai` | Conversation text + DEX context | **Only after the user adds their own API key** for that provider |
| Browser app | Any site the user visits | Normal web traffic | User browses |
| Link previews | The linked site | HTTP GET for page metadata | User pastes/opens a link that is previewed |
| Git client | User's configured remotes | Git protocol | User fetches/pushes |
| LAN file share | Local network only (`tiny_http` server) | Files the user chose to share | User starts sharing; stops on demand |

**Removed in this change:** a silent fallback that, when no AI provider was configured, POSTed the
user's UKI message plus context (foreground app, open app list, local time) to Hugging Face's
keyless inference API. The endpoint no longer resolves, so it never answered anyway.

## Data stored on the device

| Location | Contents | Cleared by |
|---|---|---|
| `%APPDATA%\com.onazioj.dex\databases` | Notes, tasks, settings and other app data (SQLite) | User deletion in the apps / uninstall data removal |
| `%APPDATA%\com.onazioj.dex\backups` | Local backups (when enabled) | Backup & Sync |
| `%APPDATA%\com.onazioj.dex\search-index` | Full-text index of Documents/Desktop/Downloads + notes/clipboard | Rebuilt automatically if removed |
| `%LOCALAPPDATA%\com.onazioj.dex\EBWebView` | WebView2 profile: Local Storage/IndexedDB (settings, UI state), HTTP/GPU caches | Settings > Storage > Clear caches (caches only) |
| `%LOCALAPPDATA%\com.onazioj.dex\logs\startup.log` | Startup diagnostics (version, WebView2 runtime, errors) — never transmitted | Settings > Storage > Clear caches |
| Vault (`vault.dex`) | Passwords, AES-256-GCM, key derived from the master password (Argon2id), never stored | Vault |

Cookies: DEX sets no tracking cookies. Sites opened in the Browser app may set their own.

## Policy gaps (need owner/legal approval before editing `PRIVACY.md`)

`PRIVACY.md` (effective 2026-06-13) both over- and under-describes the product:

1. **Describes collection that does not exist:** "Required diagnostics" processing, "Optional product
   analytics" and sharing with providers for "hosting, analytics, crash reporting". The build
   transmits none of this. Either remove these sections or keep them only if such features are
   planned (and then implement consent before shipping them).
2. **Omits the third-party services above.** Each user-triggered destination should be named with
   what is sent (the table above is ready to adapt).
3. **Location:** state that location is off by default and used only on-device to centre the map.
4. **No cookie banner is needed:** there is no non-essential tracking technology to consent to.
5. **Refund policy:** not applicable today (`PAYMENTS_ENABLED = false`, "Free — all features
   included"). Required before payments are enabled.
6. **Children:** DEX is local-first with no ads, analytics, social graph or server-side accounts,
   and the policy states it is not directed at children under 13. No age-assurance mechanism is
   proportionate for the current feature set. Re-assess if cloud accounts, collaboration or
   payments ship, and confirm against each market's requirements (e.g. store age ratings).

Versions are bumped by hand in `src/shared/policies.ts` (privacy is `2.2.0`). Bumping it makes
`hasAcceptedCurrentPolicies()` fail, so every user is asked to re-accept on next launch. That is
right for material changes like these, but it should be a deliberate release decision. The
in-app summary for the privacy policy (same file) also describes "required diagnostics, optional
analytics" and would need the same correction.
