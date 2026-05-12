# IDEAS Sprint Week 08

IDEAS-only weekly chunk (50 items).
Target train: 4.3.x-same-train

Total items: 50

## Items

- [ ] #351 `IDEAS-024` (P1) [A - Account, Identity, and Sign-In] - Email change requires verification on both old and new address.
- [ ] #352 `IDEAS-025` (P1) [A - Account, Identity, and Sign-In] - Phone number as optional secondary recovery channel (hashed).
- [ ] #353 `IDEAS-026` (P2) [A - Account, Identity, and Sign-In] - Inline error and success toasts replacing browser alert().
- [ ] #354 `IDEAS-027` (P1) [A - Account, Identity, and Sign-In] - CAPTCHA challenge slot for sign-up at high abuse score.
- [ ] #355 `IDEAS-029` (P1) [A - Account, Identity, and Sign-In] - "Sign out everywhere" emergency button.
- [ ] #356 `IDEAS-030` (P1) [A - Account, Identity, and Sign-In] - Token rotation on every refresh (silent).
- [ ] #357 `IDEAS-031` (P1) [A - Account, Identity, and Sign-In] - Refresh tokens bound to device fingerprint.
- [ ] #358 `IDEAS-032` (P1) [A - Account, Identity, and Sign-In] - Short-lived access tokens (15 min) with refresh.
- [ ] #359 `IDEAS-033` (P1) [A - Account, Identity, and Sign-In] - CSRF double-submit cookie pattern for any web surface.
- [ ] #360 `IDEAS-034` (P1) [A - Account, Identity, and Sign-In] - Rate-limit lockout uses incremental cool-off, not flat ban.
- [ ] #361 `IDEAS-035` (P1) [A - Account, Identity, and Sign-In] - Email verification badge in UI.
- [ ] #362 `IDEAS-036` (P1) [A - Account, Identity, and Sign-In] - Disposable-email blocklist updated weekly via build script.
- [ ] #363 `IDEAS-037` (P1) [A - Account, Identity, and Sign-In] - Email plus-addressing (`u+tag@x.com`) collapsed to canonical.
- [ ] #364 `IDEAS-038` (P1) [A - Account, Identity, and Sign-In] - Soft-delete window (7 days) before account is gone.
- [ ] #365 `IDEAS-039` (P1) [A - Account, Identity, and Sign-In] - Honeypot field on sign-up form to trap dumb bots.
- [ ] #366 `IDEAS-040` (P1) [A - Account, Identity, and Sign-In] - Localized error copy (en, es, fr, pt-BR, de, ja to start).
- [ ] #367 `IDEAS-041` (P1) [B - Cloud, Sync, and Storage] - Selective sync: pick which workspace folders sync.
- [ ] #368 `IDEAS-042` (P1) [B - Cloud, Sync, and Storage] - Bandwidth caps per direction (upload / download), per network.
- [ ] #369 `IDEAS-043` (P3) [B - Cloud, Sync, and Storage] - Resume-on-reconnect for partial uploads (HTTP Range / multipart).
- [ ] #370 `IDEAS-044` (P1) [B - Cloud, Sync, and Storage] - Content-addressed storage: SHA-256 dedup before upload.
- [ ] #371 `IDEAS-045` (P1) [B - Cloud, Sync, and Storage] - Delta sync (rsync-style block diff) for large files.
- [ ] #372 `IDEAS-046` (P1) [B - Cloud, Sync, and Storage] - Per-file encryption key wrapped under account key.
- [ ] #373 `IDEAS-047` (P1) [B - Cloud, Sync, and Storage] - Pre-shared-key bundle to share an encrypted file with one person.
- [ ] #374 `IDEAS-048` (P1) [B - Cloud, Sync, and Storage] - Time-limited shareable links (sign + expire + audit).
- [ ] #375 `IDEAS-049` (P1) [B - Cloud, Sync, and Storage] - Storage tier policy: hot, warm, cold (move idle data after N days).
- [ ] #376 `IDEAS-050` (P1) [B - Cloud, Sync, and Storage] - Cold-tier restore queue with ETA.
- [ ] #377 `IDEAS-051` (P1) [B - Cloud, Sync, and Storage] - Trash bin with 30-day undo, separate from local recycle.
- [ ] #378 `IDEAS-052` (P1) [B - Cloud, Sync, and Storage] - Versioned files: keep last N versions, configurable.
- [ ] #379 `IDEAS-053` (P1) [B - Cloud, Sync, and Storage] - Snapshot every workspace nightly (encrypted, opt-in).
- [ ] #380 `IDEAS-054` (P1) [B - Cloud, Sync, and Storage] - Conflict resolution UI: side-by-side, pick mine / theirs / merge.
- [ ] #381 `IDEAS-055` (P1) [B - Cloud, Sync, and Storage] - Filesystem watcher batches changes to avoid sync storms.
- [ ] #382 `IDEAS-056` (P1) [B - Cloud, Sync, and Storage] - LAN p2p sync (no cloud round-trip for devices on same network).
- [ ] #383 `IDEAS-057` (P1) [B - Cloud, Sync, and Storage] - Bring-your-own-bucket: S3, R2, B2, GCS, Azure as backend.
- [ ] #384 `IDEAS-058` (P1) [B - Cloud, Sync, and Storage] - BYO Webhooks: notify external systems on sync events.
- [ ] #385 `IDEAS-059` (P1) [B - Cloud, Sync, and Storage] - Quota per workspace, not just per account.
- [ ] #386 `IDEAS-060` (P1) [B - Cloud, Sync, and Storage] - Storage usage breakdown by category (notes, media, snippets, …).
- [ ] #387 `IDEAS-061` (P1) [B - Cloud, Sync, and Storage] - Storage cleanup wizard surfaces oldest + largest items.
- [ ] #388 `IDEAS-062` (P1) [B - Cloud, Sync, and Storage] - Auto-archive files older than N years.
- [ ] #389 `IDEAS-063` (P1) [B - Cloud, Sync, and Storage] - Cloud cost dashboard for Studio admins.
- [ ] #390 `IDEAS-064` (P1) [B - Cloud, Sync, and Storage] - Region pinning: "store my data only in EU" / "only in US".
- [ ] #391 `IDEAS-065` (P1) [B - Cloud, Sync, and Storage] - Data residency receipt downloadable per file.
- [ ] #392 `IDEAS-067` (P1) [B - Cloud, Sync, and Storage] - Cloud-side malware scan with rejection log.
- [ ] #393 `IDEAS-068` (P1) [B - Cloud, Sync, and Storage] - Cloud pause toggle (Wi-Fi only, daytime only, etc.).
- [ ] #394 `IDEAS-069` (P1) [B - Cloud, Sync, and Storage] - Power-save backup window (battery > 50%).
- [ ] #395 `IDEAS-070` (P1) [B - Cloud, Sync, and Storage] - Pre-flight check: refuse upload of obvious secrets (API keys).
- [ ] #396 `IDEAS-071` (P1) [B - Cloud, Sync, and Storage] - Local file-shadow cache so offline reads still work.
- [ ] #397 `IDEAS-072` (P1) [B - Cloud, Sync, and Storage] - Background prefetch of recently-accessed cloud items.
- [ ] #398 `IDEAS-073` (P1) [B - Cloud, Sync, and Storage] - Compression policy per file type (text > zstd, media > skip).
- [ ] #399 `IDEAS-074` (P1) [B - Cloud, Sync, and Storage] - Encrypted index for cloud search without leaking content.
- [ ] #400 `IDEAS-076` (P1) [B - Cloud, Sync, and Storage] - Share revocation invalidates all derived links + cached keys.
