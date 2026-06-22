# DEX — Next Stage (backend / native milestone)

> Everything in the v6.0.4 per-app + shared + Future-local-first program is **done and merged in
> this PR**. What remains are the items that genuinely cannot be built honestly in a renderer-only
> pass — they need a server, a real-time transport, or a native model. They were **flagged, not
> faked**, and are queued here as the next stage. Each lists the local-first foundation already in
> the codebase to build on.

## Why these are "next stage", not "skipped"
A renderer-only build has no backend, no sync service, no signalling/relay server, and no bundled
local model. Shipping a fake marketplace or a sync toggle that does nothing would violate the
project's standing rule (**complete everything, fake nothing**). So these are deferred to a stage
that includes the backend work they require.

## The milestone (6 tracks)

### 1. App marketplace (Future #1, #12, #25, #37)
Third-party app submission, review, install/update/remove, ratings, and signature/trust checks.
- **Needs:** a hosted registry + submission/review pipeline + package signing.
- **Foundations present:** `shared/plugin/manifest.ts`, `shared/plugin/eventBus.ts`, `PlatformExtensions`, `permissionStore`/`PermissionCenter`, `pages/Store.tsx` UI.

### 2. Cross-device sync + handoff (Future #3, #26)
Sync notes/tasks/settings/vault across devices; continue a session on another device.
- **Needs:** an account-bound sync server + per-store change feeds.
- **Foundations present:** `shared/cloud/*` (conflictResolver, dedup, versioning, quota, selectiveSync), `shared/account/*`, `services/dataExport`, per-store persistence.

### 3. Real-time multiplayer / live co-editing (Future #6, #17, #31)
Presence + concurrent editing across creative and document apps; CollabHub goes real.
- **Needs:** a CRDT relay/signalling server (WebSocket/WebRTC) + awareness protocol.
- **Foundations present:** `shared/collab/crdt.ts`, `shared/collab/v4/core.ts`, `shared/collab/reactions.ts`/`comments.ts`, the now-local CollabHub app.

### 4. Offline-first data layer + E2E-encrypted sync (Future #9, #10)
Offline-first store with conflict resolution; end-to-end encryption for sensitive stores.
- **Needs:** the sync server from #2 + an E2E key-exchange/crypto envelope at rest and in transit.
- **Foundations present:** `shared/cloud/encryption.ts`, `shared/cloud/conflictResolver.ts`, `useVaultStore`/`uki/keystore`, `safeStorage`/`migrateState` (new this PR).

### 5. Pluggable storage backends (Future #33)
Local / cloud / self-hosted storage behind the data layer.
- **Needs:** a storage-adapter interface + at least one remote adapter (depends on #2).
- **Foundations present:** `shared/cloud/coldTier.ts`, `storageBreakdown.ts`, `bandwidthCap.ts`, the safe-storage layer.

### 6. Bundled local offline AI model (Future #34)
A local model as an offline fallback wired into UKI provider routing.
- **Needs:** a packaged on-device model + native inference (WASM/llama.cpp/ONNX) — C++/native, blocked in the renderer-only build.
- **Foundations present:** UKI provider routing + `agentRunner.ts` ReAct loop + `uki/keystore` (this PR added the agent loop; a `local`/`offline` provider slots into the existing router).

## Suggested sequencing
1. **Sync server (#2)** unblocks #4, #5, and most of #3 — build it first.
2. **CRDT relay (#3)** on top of the sync transport.
3. **Marketplace (#1)** is independent and can run in parallel.
4. **Local AI (#6)** is independent (native packaging track).

Until the backend lands, every shipped surface degrades cleanly to local-first (the standing
"flag, don't fake" contract).
