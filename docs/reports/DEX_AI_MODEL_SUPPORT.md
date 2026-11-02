# DEX AI Assistant: Model Support

**Date:** 2026-11-01 · **Creator:** Onazi Oj · Code: `src/renderer/uki/providers/`

## Providers

| Provider | Key | Where it runs | Streaming | Vision | Status |
|---|---|---|---|---|---|
| OpenAI | Yes | Cloud | Yes | Yes | Wired; needs a key to test live |
| Anthropic | Yes | Cloud | Yes | Yes (Sonnet/Opus) | Wired; needs a key to test live |
| Google (Gemini) | Yes | Cloud | Yes | Yes | Wired; needs a key to test live |
| OpenRouter | Yes | Cloud | Yes | Per model | Wired; needs a key to test live |
| Ollama | No | **This device** (localhost) | Yes in the web preview; in the desktop app the reply arrives in one piece (native proxy) | Vision-named models (llava, moondream, …) | Wired; **installed models are discovered** via `/api/tags` |

Request building and response parsing are pure functions and unit-tested for every provider (`ai-providers*.test.ts`, `ai-orchestrator.test.ts`, `ai-connect.test.ts`). The live network send needs a real key. No key was available in this environment, so cloud output quality and latency were **not measured**.

## Ollama in the desktop app (bug fixed)

Ollama answers **403** to browser requests from origins outside its allow-list, and the packaged app's origin (`http://tauri.localhost`) is not on it. Measured: `curl -H "Origin: http://tauri.localhost"` returned 403, and `Origin: http://localhost` returned 200. So the Ollama provider never worked in the installed app. Requests now go through `ollama:request` (`src-tauri/src/ollama_proxy.rs`). It has a fixed host of 127.0.0.1:11434 and allows only `GET /api/tags` and `POST /api/chat`; it cannot pull or delete models or reach any other host. Verified in the packaged build: `/api/tags` returned 200 through the proxy, and `/api/pull` was refused.

## Model catalog

- Cloud catalogs are static lists in each provider file. They are dated, e.g. `gpt-4o` and `claude-3-5-sonnet-latest`. Newer model ids must be added to the provider file before they can be selected. *Limitation, tracked in `DEX_REMAINING_WORK.md`.*
- **Ollama:** at startup DEX asks `http://localhost:11434/api/tags` which models are installed (2-second timeout). Only installed models are offered. If Ollama answers with no models, Settings says so and tells you how to install one. If Ollama is not running, the suggested defaults (llama3.1, qwen2.5, mistral) are shown, but requests to them will fail until they are installed.
- An installed Ollama model is used in **Hybrid** without any key, preferred for routine tasks when the device can run it (`preferOnDeviceFirst`, `canRunLocalModel`).

## Choosing a model

- **Processing:** Hybrid / Local only / Cloud only / Manual (see `DEX_AI_PRIVACY.md`).
- **Routing goal:** Auto / Cheapest / Fastest / Smartest / Offline ranks the allowed models (`smartRouter.ts`).
- **Per-provider model:** the preferred model for each connected provider.
- **Manual:** pins one model. Nothing else is used, and there is no fallback.
- **Fallback:** non-streaming calls try the ranked list in order (`chatWithFallback`), filtered by the processing mode. Fallback stops immediately on Cancel.

## Reasoning effort

**Automatic / Fast / Balanced / Deep** controls DEX's own work budget:

| Profile | Agent steps | Output tokens per call |
|---|---|---|
| Fast | 2 | 350 |
| Balanced | 5 | 700 |
| Deep | 10 | 1600 |

These do not switch on provider-side "reasoning" or "thinking" modes. No wired provider exposes one through this protocol, and DEX does not claim to use one.

## Context limits

Each model declares its context window. `classifyTask` estimates tokens, and requests over the long-context threshold prefer large-window models. The agent caps tool results at 4,000 characters and file reads at 64 KB. Older turns are summarised into archives (`compressedMemory.ts`).

## Cost controls

- Paid use happens only for providers you add a key for, and Cloud use can be disabled entirely with **Local only**.
- **Cheapest** prefers lower-cost models. Reasoning effort caps output length and steps.
- **Usage totals:** tokens and calls per provider for the current day, shown in Settings › AI Providers. Provider-reported counts are used where available; streamed replies are estimated (chars / 4) and marked "partly estimated".
- **Daily cloud limit:** an optional token cap for cloud providers. When reached, cloud calls are refused before anything is sent, and the router falls back to an allowed local model if there is one. Local models are never limited (`providers/usage.ts`, `ai-usage-cap.test.ts`).
- Not implemented: money-denominated budgets. Per-model prices change and are not shipped, so the cap is in tokens.

## Keys

On Windows, keys are encrypted with DPAPI for the current user (`secrets_ctl.rs`, `uki-secrets.json`) and kept out of localStorage. Keys saved by older builds are migrated once. Elsewhere, they are obfuscated in localStorage (not encryption, and Settings says so). Keys are never embedded in the binary.

## Local runtime in this environment

Ollama is installed and running on this machine with **0 models installed**. Pulling a model is a multi-gigabyte download, so per the Part 4 rules it was **not** done automatically. Local generation therefore could not be measured; it needs one `ollama pull`, with your approval.
