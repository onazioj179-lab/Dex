# DEX AI Assistant: Performance

**Date:** 2026-11-01 · **Creator:** Onazi oJ · Machine: Windows 11 Pro 26300, 8 logical cores

Only measured numbers appear here. Anything not measured says so.

## Measured

| What | Result | Method |
|---|---|---|
| `classifyReasoning` (Fast/Balanced/Deep) | 0.70 µs per call | 200k-iteration microbenchmark (Node 22). The machine was also running the full test suite, so these are upper bounds |
| `decideToolCall` (permission → mode → risk) | 0.12 µs per call | same |
| `checkPathInScope` (file-tool path validation) | 0.65 µs per call | same |
| `filterModelsForMode` (processing-mode filter) | 0.30 µs per call | same |
| Local Ollama endpoint round-trip (`/api/tags`) | 10–19 ms (3 runs) | `curl` to 127.0.0.1:11434 |
| Ollama discovery cost at startup | One localhost request, 2 s timeout, non-blocking | Code path (`refreshOllamaModels`) |
| Agent loop overhead with a mocked model | 5 agent tests incl. cancel: 2–24 ms per run | `uki-agent-runner-policy.test.ts` timings |

The policy layer adds well under 5 µs to a request, so assistant latency is the model's latency.

## Resource behaviour (by design, verified in code)

- **No model at boot.** Nothing is loaded until you send a free-form request. The local intent engine answers structured commands without any model.
- **Bounded memory.** Recent turns are capped at 200 and the transcript at 30. Older turns are compressed into archives (cap 40). The audit trail keeps 500 in memory and 300 persisted.
- **Bounded work per request.** The step cap (2 / 5 / 10) and the per-tool budgets (e.g. web_search 4, read_file 6) limit calls. Tool results are capped at 4,000 characters and file reads at 64 KB.
- **Screen understanding** captures one frame, max 1600 px. Tracks are stopped immediately. There is no continuous capture.
- **Cancel** aborts the in-flight HTTP request, so a cancelled run stops consuming network and provider quota.
- **No new timers.** The task watchdog uses the existing shared 15 s tick.

## Shell baseline (from `PERFORMANCE_REPORT.md`, unchanged by this work)

Whole-app idle was 1.35% of the machine and 617 MB. The Rust process at idle used about 1–2% of one core. Installed app to window took 1.3 s.

## Not measured (and why)

| Metric | Why |
|---|---|
| Cloud model latency / tokens per second | No provider key in this environment |
| Local model load time / tokens per second | Ollama has 0 models installed; pulling one is a multi-GB download that needs your approval |
| Voice latency (speech to text, text to speech) | Needs an interactive microphone session |
| GPU / NPU utilisation during inference | No local model to run |
| Battery impact | Desktop machine |

**To measure local AI:** approve `ollama pull llama3.2:3b` (about 2 GB), then time the first token and tokens per second through Settings › Processing › Local only.
