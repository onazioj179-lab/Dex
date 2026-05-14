# Track H: UKI Intelligence Expansion

**Status:** planned
**Release target:** v4.60.1
**Owner:** core

## Scope
Promote UKI from intent classifier to a deeply contextual, semantic, continuity-aware OS layer. Adds vector store, semantic memory, workspace observer, ContextBus, planning + chaining, voice systems, multi-turn conversation, offline guarantees, and a cross-app context API.

## Files
- src/main/uki/core/UkiVectorStore.ts (new)
- src/main/uki/core/UkiMemory.ts (new)
- src/main/uki/core/UkiPredictive.ts (extend with WorkspaceObserver)
- src/main/uki/core/UkiOperations.ts (Plan type + chaining)
- src/main/uki/core/UkiSearch.ts (replace string-similarity with cosine)
- src/main/uki/asr/UkiASR.ts (Whisper.cpp WASM fallback)
- src/main/uki/tts/UkiTTS.ts (Edge TTS / system voices routing)
- src/main/services/ContextBus.ts (new, IPC over preload)
- src/preload/index.ts (expose `window.dex.uki.context()`)

## Done
- [ ] none yet

## Next (in dependency order)
- [ ] H1 — embed `sqlite-vec` (already on roadmap); create UkiVectorStore.ts with `embeddings(id, scope, owner_app, payload_json, vec)`; wire into UkiSearch.ts cosine ranking
- [ ] H2 — UkiMemory.ts: episodic + semantic + procedural stores; promote/forget rules driven by recency × access frequency × user feedback
- [ ] H3 — extend UkiPredictive.ts with WorkspaceObserver (active app, focused doc, selection, recents per workspace); expose `getWorkspaceContext()`
- [ ] H4 — promote in-renderer "context bus" to main-process `ContextBus` over IPC; every app reports `currentProject`/`currentSelection`/`recentActions`
- [ ] H5 — extend UkiOperations.ts with `Plan` type (ordered steps, preconditions, rollback points, preview); UKI returns plans for multi-step intents
- [ ] H6 — workflow continuation: on app reopen, UKI offers "continue: <last task>" backed by procedural memory
- [ ] H7 — adaptive reasoning loop in `UkiModel.processTranscript` (classify → plan → critique → refine), 250ms budget, fallback to current path
- [ ] H8 — voice systems: Whisper.cpp tiny WASM ASR (always-on wake word); Edge TTS / system voices for output
- [ ] H9 — multi-turn state machine; pronoun resolution via WorkspaceObserver; clarifying questions when intent confidence < 0.65
- [ ] H10 — offline-first audit: every UKI capability functions with no network; network paths badged "online only" in UI
- [ ] H11 — measure intent → action latency; budget 150ms median, 500ms p95; profile + optimize hot paths
- [ ] H12 — `window.dex.uki.context()` cross-app awareness API

## Blockers
- H8 depends on Whisper.cpp WASM bundle (~25MB). Confirm size budget acceptable before downloading.
- Dependency order matters: H1 → H2 → H3+H4 (parallel) → H5 → H6+H7+H8 → H9-H12

## Verification
- `UkiVectorStore.search('test query')` returns ≥1 ranked result
- Semantic recall test: insert 100 docs, query, top-5 contains expected (≥80% accuracy)
- Median UKI intent latency < 150ms in `npm run test:perf:uki`
- Offline test: disable network, run scripted UKI scenarios, confirm pass

## Notes
- Local-only inference. No network calls for reasoning.
- ContextBus IPC schema typed in shared/uki/types.ts; validate at boundary.
- Whisper.cpp WASM should be lazy-loaded only on first voice trigger.
