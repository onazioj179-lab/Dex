# DEX AI Assistant: Privacy

**Date:** 2026-11-01 · **Creator:** Onazi Oj

This describes what the code does today. It is engineering documentation, not the legal Privacy Policy. The `PRIVACY.md` rewrite still awaits the owner's approval (see `DEX_REMAINING_WORK.md`).

## Processing modes

Settings › AI Providers › **Processing**:

| Mode | What can receive your text |
|---|---|
| **Hybrid** (default) | A local Ollama model for routine requests when one is installed; otherwise the cloud providers you added a key for |
| **Local only** | Only an on-device endpoint (Ollama on localhost/127.0.0.1). Web search is off unless you grant Network access |
| **Cloud only** | Only the cloud providers you added a key for |
| **Manual** | Exactly the one model you pinned; no fallback |

Enforcement is in code at two points: `orchestrator.chat()` and the streaming path. Even a pinned model or a fallback chain cannot reach a cloud endpoint in Local only. A keyless provider pointed at a remote host is treated as cloud.

**Bug fixed in this pass:** with the old "Offline" goal, the streaming path fell back to the first configured **cloud** provider when no local model was available.

## What leaves the device

| Data | Recipient | Condition |
|---|---|---|
| Your message, recent turns, app context | The selected provider | Only when you send a free-form request and a provider is allowed by the mode |
| Web search query | DuckDuckGo, Wikipedia | `web_search` tool; never in Local only without Network |
| File text (≤ 64 KB) | The selected provider | Only with the file-read grant, only for a file the model asked for |
| One screen frame | The selected vision model | Only after you pick a window or screen in the system picker; capture stops immediately |
| API keys | Only that provider, in the request header | — |

No telemetry about assistant use is sent. With no provider configured, UKI uses the local intent engine and nothing is sent.

## What is stored on the device

| Store | Content | Controls |
|---|---|---|
| Recent conversations (`uki:mem:turns`, encrypted) | Your messages and UKI's replies | **Memory Recording** off stores nothing; **Retention** (1–365 days); **View saved memory** → **Forget** per item; **Export memory (JSON)**; **Clear All Memory** |
| Transcript (`dex:uki:history`, last 30) | Panel history | Not persisted while Memory Recording is off (fixed in this pass); cleared by Clear All Memory |
| Archives (gzip) | Older turns | Cleared by Clear All Memory |
| Native archive (Rust) | Turns recorded by the native engine | Cleared by Clear All Memory when present |
| Audit trail (300 entries) | Tool names, outcomes, truncated arguments | Security Center › Clear log |
| API keys | Provider keys | Windows: DPAPI-encrypted for your user (`uki-secrets.json`); elsewhere: obfuscated localStorage (not encryption, and Settings says so) |

**Bug fixed in this pass:** "Clear All Memory" cleared only the native archive. The encrypted conversation store, the archives and the transcript stayed.

Memory is never used as permission. Reading a file still requires the file-read grant every time.

## Microphone, camera and screen

- Listening starts only when you press the mic control and continues until you stop it or UKI goes back to sleep (Web Speech API, `continuous`). The panel and DEX Bar show the listening state while it runs. There is no wake-word listener.
- There is no continuous camera use. The camera capability is listed but no assistant feature captures camera frames.
- Screen understanding uses the OS screen-sharing picker. You choose what to share and Windows shows its own sharing indicator. DEX reads one frame (max 1600 px, JPEG) and stops every track.

## Cloud speech

Speech recognition uses the WebView's Web Speech API. On Windows (Edge WebView2) this can use Microsoft's online speech service. That is disclosed here and must be disclosed in the Privacy Policy before release.
