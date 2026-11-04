# DEX Privacy Policy

Effective date: 2026-11-04
Contact: onazi75@gmail.com

DEX is a desktop environment that runs on your computer. It is free, has no advertising and needs no account. This policy describes what DEX stores, what it sends and when, and the controls you have. It reflects what the software does in version 7.0.1.

## 1. The short version

- DEX keeps your data on your computer.
- DEX sends nothing in the background. It has no analytics, no telemetry, no crash upload and no advertising.
- DEX contacts an online service only when you use a feature that needs one, and only that service receives the request. Section 3 lists them.
- Passwords, Vault items, clipboard contents, your files and your documents are never collected by DEX.

## 2. Data stored on your computer

| What | Where | How to remove it |
|---|---|---|
| Notes, tasks, calendar, settings and other app data | The DEX data folder (`%APPDATA%\com.onazioj.dex`) | Delete items in the apps, or Settings › Reset DEX |
| Search index of your Documents, Desktop and Downloads folders, notes and clipboard history | The DEX data folder | Rebuilt automatically if removed |
| Clipboard history | The DEX data folder | Clipboard history › Clear. Copies made inside DEX are kept; copies from other programs are kept only if you turn on "Include copies from other apps" |
| Vault (passwords) | `vault.dex`, encrypted with AES-256-GCM using a key derived from your master password (Argon2id). The master password is never stored | Vault |
| Assistant (UKI) conversations and memory | The DEX data folder, encrypted | UKI settings: turn off Memory Recording, set Retention, forget items, export, or Clear All Memory |
| AI provider keys | Encrypted for your Windows account (DPAPI) | AI Providers settings |
| Diagnostics: crash log, startup and app-launch timings, frame timing, interface errors | The DEX data folder and the interface storage | Shown in Nexus › Diagnostics. They contain numbers, app names and error messages, never document contents |
| Startup log (version, WebView2 runtime, errors) | `%LOCALAPPDATA%\com.onazioj.dex\logs` | Settings › Storage › Clear caches |
| Interface state and web caches | The WebView2 profile in `%LOCALAPPDATA%\com.onazioj.dex` | Settings › Storage › Clear caches |

When you uninstall DEX with the .exe installer, it offers to delete this data.

## 3. Online services DEX uses, and when

DEX makes these requests only when you use the feature. Each service receives the request and your IP address, and handles it under its own privacy policy.

| Feature | Service | What is sent |
|---|---|---|
| Weather | Open-Meteo (`open-meteo.com`) | The city you search for, or the coordinates of a place you choose |
| Maps | OpenFreeMap; Esri ArcGIS and OpenTopoMap for the Satellite and Topo styles; Open-Meteo for place search | Map tiles for the area you view; your search text |
| Maps › My location | Windows location service | Used only on your computer to center the map. Location is off until you turn it on in Settings |
| Assistant answers without an AI provider | DuckDuckGo, Wikipedia, WorldTimeAPI, Free Dictionary API, ExchangeRate-API | Your question, or the time zone, word or currency you ask about |
| Assistant with an AI provider | The provider whose API key you add: OpenAI, Anthropic, Google Gemini or OpenRouter | Your message, recent conversation and the DEX context the request needs; file text (up to 64 KB) only with your file-read permission; one screen image only after you pick a window or screen in the Windows picker |
| Voice input | The WebView2 speech service, which can use Microsoft's online speech recognition | Your voice while the microphone control is on |
| Browser | The websites you visit | Normal web traffic. Sites may set their own cookies |
| Link previews | The linked website | A request for the page's title and preview |
| Git | The remote repositories you configure | Git traffic |
| File sharing on your network | Devices on your local network | Only the files you choose to share, while sharing is on |

The assistant's Processing setting controls where requests can go. "Local only" never sends requests to a cloud provider.

## 4. Permissions

Settings › Permissions lists what DEX itself may use (clipboard, microphone, camera, location, notifications and others), with Allow, Ask or Block for each and when each was last requested. Websites in the Browser ask for permissions separately. The assistant's own access (files, network, screen) is listed on the same page and can be revoked at any time.

## 5. What DEX does not do

- It does not sell or share personal information.
- It does not show advertising or use advertising identifiers.
- It does not send analytics, usage statistics, diagnostics or crash reports.
- It does not record your screen, camera or microphone in the background.
- It does not set tracking cookies.

## 6. Sending information to the developer

DEX sends nothing to the developer. If you email the developer or open an issue on GitHub, you choose what to include, and that message is used only to answer you and fix problems. Nexus › Diagnostics › Copy report copies a summary that contains numbers, app names and statuses only, so you can review it before sharing.

## 7. Your rights

All DEX data is on your computer and under your control: you can view, export and delete it with the tools in section 2. The developer holds no personal data about DEX users unless you send it. To ask a privacy question or exercise a right under laws such as the GDPR or the CCPA, contact onazi75@gmail.com.

## 8. Children

DEX is not directed to children under 13, or the minimum age required where you live.

## 9. Changes

If this policy changes in a way that affects your data, DEX shows the new version and asks you to accept it before you continue. Earlier versions are in the project's history on GitHub.

## 10. Contact

onazi75@gmail.com · https://github.com/onazioj179-lab/Dex
