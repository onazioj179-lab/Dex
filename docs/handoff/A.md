# Track A: Internal Depth — Replace Stubs with Real Implementations

**Status:** active
**Release target:** v4.60.1
**Owner:** core

## Scope
Kill every "INTENTIONAL STUB" / mock / hardcoded-value path that ships in production code. Order is **security-first** (A4 → A8 → A6) then user-visible value. Each sub-item ships independently and verifies via grep + targeted test.

Out of scope: net-new features. This track only replaces stubs with real implementations of features that are already wired into the UI.

## Files (primary)
- src/main/security/VaultHardening.ts (A4 HIBP)
- src/main/services/AppStoreService.ts (A8 Ed25519 + delta + perms)
- src/renderer/utils/ai.ts (A6 real embeddings)
- src/renderer/services/UkiActionHandlers.ts (A1 translate)
- src/renderer/services/UKIEnhancements.ts (A2 voice)
- src/renderer/services/SearchHistory.ts (A2 voice)
- src/main/uki/tts/UkiTTS.ts (A7 TTS bridge)
- src/main/uki/asr/UkiASR.ts (A7 ASR bridge)
- src/shared/cad/core.ts (A9 DXF parser)
- src/main/sync/SyncManager.ts (A10 sync workflow events)
- src/shared/account/AccountStore.ts (A11 account cloud transport)
- src/renderer/DEXAPPLICATIONS/imosion/* (A12 + A14 Imosion metrics + sidechain)
- src/renderer/DEXAPPLICATIONS/vinx/VinxTimeline.ts (A12 motion track)
- src/renderer/DEXAPPLICATIONS/forge/ForgePreview.ts (A12 web vitals)
- src/renderer/DEXAPPLICATIONS/files/FilesCore.ts (A13 mock entries)

## Done
- [x] **A4** — VaultHardening.checkPasswordBreach was already a real HIBP k-anonymity call with offline fallback to common-password list; only the comment was misleading. Comment fixed.
- [x] **A8** — AppStoreService defaultHooks replaced. `verifySignatures` does real Ed25519 verify on canonicalized manifests (SPKI prefix `302a300506032b6570032100` for raw 32-byte keys); rejects zero-sig packages. `applyDelta` keeps SHA-256 verification; bsdiff-zstd binary patching deferred to v5.0 native track. `requestCapabilities` routes through PermissionsService.decide() with mapAppCapToPermission(); prompt decisions auto-grant + recordDecision so renderer can re-prompt at first use.
- [x] **A6** — Replaced renderer `generateMockEmbedding` (sin/charCode mock) with real path: new main-process `EmbeddingService` (`src/main/services/EmbeddingService.ts`) exposing IPC `embedding:compute` + `embedding:compute-batch` using sign-balanced feature hashing (token bag + char trigrams, L2-normed, 128-dim, deterministic). Renderer `EmbeddingEngine` calls IPC first, falls back to in-renderer FNV-1a hash mirror so cosine similarity stays comparable across the boundary. `generateMockEmbedding` deleted. Wired in `main.ts` via `registerEmbeddingIpc()` and exposed on preload as `window.dexAPI.embedding.{compute,computeBatch}`. ONNX gte-small upgrade slot is documented inside EmbeddingService.ts header (backend tag `'onnx-gte-small'` reserved).
- [x] **A1** — `text.translate` ActionBus handler: real LibreTranslate POST against user-configured endpoint (`localStorage.getItem('uki.translate.endpoint')`, 4s timeout) with `backend: 'libretranslate'` tag; falls back to passthrough with `backend: 'passthrough'` and explicit user-facing note when no endpoint configured / unreachable.
- [x] **A2** — Voice paths in `UKIEnhancements.startVoiceInput()` and `SearchHistory` voice search were already real Web Speech API; only the "(Stub)" comments were misleading. Comments fixed to "Web Speech API".
- [x] **A7** — `UkiTTS` and `UkiASR`: code was already real Web Speech bridges (renderer-native API + main-process IPC forwarder + voice picking via `getVoices()`). Misleading "stub" comments updated to describe the real bridge behaviour. Whisper.cpp WASM fallback for ASR is parked for Track H8 (v5.0).
- [x] **A9** — `src/shared/cad/core.ts`: replaced regex-count stub with real DXF parser (`parseDxf`) walking group code/value pairs through ENTITIES section (with permissive top-of-file fallback for loose dumps). Extracts LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE+VERTEX, TEXT/MTEXT with layer + coordinates. `countDxfEntities` derives counts from the parsed document (added `texts` field; existing test updated).
- [x] **A10** — `SyncManager.handleRemoteCommand('run-workflow')`: replaced broken `await ipcMain.listeners(...).length` stub with real path — loads workflow graph from `dex-workflows` electron-store by id, calls `WorkflowService.run(graph, trigger, capsHeld)` so capability checks remain enforced. Returns the runner's `RunResult`.
- [x] **A11** — `AccountStore`: added `createHttpsTransport({ endpoint, token, timeoutMs?, fetchImpl? })` — real HTTPS transport against user-configured endpoint with bearer token, AbortController timeout, https:// enforcement, throws on failure to keep callers local-first. Module header rewritten (no longer self-described as a stub).
- [x] **A12** — Three real implementations replacing the production-visible stubs:
  - Imosion peak/RMS meters were already real (`AnalyserNode.getByteTimeDomainData` → peak/rms loop in `ImosionRecording.ts`); confirmed and left intact.
  - Vinx motion tracker: `Vinx.tsx` "Track Backward / Track Forward" buttons no longer fabricate trackPoints with `Math.sin/cos/random`. New helper `vinxMotionTracker.ts` walks the active `<video>` element frame-by-frame, extracts a luma patch around the start point, and finds the best SAD match in a search window each step (drift-corrected every 8 frames). Returns real `{frame, x, y, confidence}` points.
  - Forge web vitals: `ForgePreview.analyzePerformance` no longer returns `Math.random()` placeholders. Real implementation reads Navigation Timing (TTFB / DCL / load), Paint Timing (FCP), `PerformanceObserver` for LCP / FID / CLS, and Resource Timing buckets (js / css / image / font sizes). Headless / unsupported environments get zeroed metrics so callers can detect "no data".
- [x] **A13** — `FilesCore.loadDirectory`: `generateMockEntries` deleted. Real path now calls `window.dexAPI.files.list(path)` (the existing scope-aware preload bridge), normalises raw entries via new `normalizeFsEntry()` helper (preserves real timestamps + sizes; no fabricated values), and surfaces an empty pane when the path is out of scope rather than inventing folders.
- [x] **A14** — Imosion sidechain ducking: `AudioEngine.processPlugin` compressor case now stashes `_scMakeup` / `_scThresholdDb` / `_scRatio` on the chain. New `setSidechainSource(destTrackId, pluginId, sourceTrackId)` taps the source track's gain via an `AnalyserNode`, runs an rAF control loop computing source RMS in dB, and modulates the destination compressor's makeup gain by `overDb * (1 - 1/ratio)` — a real ducking shape, since `DynamicsCompressorNode` has no native sidechain input. React layer wires routes from `tracks[srcIdx]` whenever plugins are (re)processed.

## Next
- [ ] (Track A complete) — proceed to Tracks B-E, G3-G5, H, I-1, J, K, M-1, O, P

## Blockers
- A7 / A8 ASR fallback depends on Track H8 (Whisper.cpp WASM). Document a stub-fallback for now if H8 not ready.

## Verification
- `grep -r "INTENTIONAL STUB\|generateMockEmbedding\|generateMockEntries" src/ --exclude-dir=node_modules` → zero matches
- `npx tsc --noEmit` → exit 0
- `npm run test` → all pass; new unit tests for A4 (HIBP hash split), A6 (embedding shape), A9 (DXF round-trip)
- Manual: install AppStore item from a signed bundle; vault flags a known-pwned password; UKI translate "hola" → "hello"; Imosion meter reflects actual mic input

## Notes
- Brand colors stay literal (Spotify green, etc.) — not part of this track.
- Security PRs MUST land before A12+ (user-visible). A4/A8/A6 are the gate.
- Empty catches stay empty; just annotate with `// intentional: <why>` (handled in Track D).
