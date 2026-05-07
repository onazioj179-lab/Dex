# DEX v3.8.9+ — 500 Improvements, Features, and New Ways to Operate

> Brainstorm document. Numbered for easy reference. Picking 5–20 of these
> per wave is realistic; do NOT attempt all 500 in one push. Status icons:
> [P] = pure shared logic (cheap), [U] = renderer UI work, [M] = main /
> Electron, [N] = native (Rust), [D] = docs / pricing, [O] = ops / build,
> [I] = infra / cloud / external dependency.

## A. Account, Identity, and Sign-In (1–40)

1. [P] Passkey / WebAuthn sign-in alongside email + password.
2. [P] OAuth: GitHub, Google, Microsoft, Apple as optional sign-in.
3. [P] Magic-link sign-in (one-tap email link, no password).
4. [P] SSO via SAML / OIDC for Studio admins.
5. [P] SCIM 2.0 endpoint stubs for enterprise user provisioning.
6. [P] Hardware-key (YubiKey, Titan) as second factor instead of TOTP.
7. [P] Session list per account ("you are signed in on 3 devices") with revoke.
8. [P] Trusted device fingerprint with explicit user consent.
9. [P] Step-up auth: re-prompt for password before destructive actions.
10. [P] Password rotation reminders (configurable, default 365 days).
11. [P] Breach-check: pwned-passwords k-anonymity API stub.
12. [P] Account merge tool (two free accounts → one paid account).
13. [P] Account export (full GDPR data dump as encrypted bundle).
14. [P] Account deletion request with 30-day grace + verification email.
15. [P] Recovery flow: recovery codes + verified-email reset + heir override.
16. [P] Multi-tenant org switcher (Studio plan).
17. [P] Anonymous local-account → cloud-account upgrade path.
18. [U] Avatar uploader with on-device crop.
19. [U] Display name + handle separation (handle is unique).
20. [P] Pronouns + locale on the profile.
21. [P] Per-account timezone for legacy / scheduled actions.
22. [U] "Sign in with another account" without losing local state.
23. [P] Detect concurrent sign-in from new geo + soft-lock + email.
24. [P] Email change requires verification on both old and new address.
25. [P] Phone number as optional secondary recovery channel (hashed).
26. [U] Inline error and success toasts replacing browser alert().
27. [P] CAPTCHA challenge slot for sign-up at high abuse score.
28. [P] Audit log of every auth event, exportable.
29. [P] "Sign out everywhere" emergency button.
30. [P] Token rotation on every refresh (silent).
31. [P] Refresh tokens bound to device fingerprint.
32. [P] Short-lived access tokens (15 min) with refresh.
33. [P] CSRF double-submit cookie pattern for any web surface.
34. [P] Rate-limit lockout uses incremental cool-off, not flat ban.
35. [P] Email verification badge in UI.
36. [P] Disposable-email blocklist updated weekly via build script.
37. [P] Email plus-addressing (`u+tag@x.com`) collapsed to canonical.
38. [P] Soft-delete window (7 days) before account is gone.
39. [P] Honeypot field on sign-up form to trap dumb bots.
40. [P] Localized error copy (en, es, fr, pt-BR, de, ja to start).

## B. Cloud, Sync, and Storage (41–80)

41. [P] Selective sync: pick which workspace folders sync.
42. [P] Bandwidth caps per direction (upload / download), per network.
43. [I] Resume-on-reconnect for partial uploads (HTTP Range / multipart).
44. [P] Content-addressed storage: SHA-256 dedup before upload.
45. [P] Delta sync (rsync-style block diff) for large files.
46. [P] Per-file encryption key wrapped under account key.
47. [P] Pre-shared-key bundle to share an encrypted file with one person.
48. [P] Time-limited shareable links (sign + expire + audit).
49. [P] Storage tier policy: hot, warm, cold (move idle data after N days).
50. [P] Cold-tier restore queue with ETA.
51. [P] Trash bin with 30-day undo, separate from local recycle.
52. [P] Versioned files: keep last N versions, configurable.
53. [P] Snapshot every workspace nightly (encrypted, opt-in).
54. [P] Conflict resolution UI: side-by-side, pick mine / theirs / merge.
55. [P] Filesystem watcher batches changes to avoid sync storms.
56. [P] LAN p2p sync (no cloud round-trip for devices on same network).
57. [P] Bring-your-own-bucket: S3, R2, B2, GCS, Azure as backend.
58. [P] BYO Webhooks: notify external systems on sync events.
59. [P] Quota per workspace, not just per account.
60. [P] Storage usage breakdown by category (notes, media, snippets, …).
61. [P] Storage cleanup wizard surfaces oldest + largest items.
62. [P] Auto-archive files older than N years.
63. [P] Cloud cost dashboard for Studio admins.
64. [P] Region pinning: "store my data only in EU" / "only in US".
65. [P] Data residency receipt downloadable per file.
66. [P] Egress / import-export tooling at cost.
67. [P] Cloud-side malware scan with rejection log.
68. [P] Cloud pause toggle (Wi-Fi only, daytime only, etc.).
69. [P] Power-save backup window (battery > 50%).
70. [P] Pre-flight check: refuse upload of obvious secrets (API keys).
71. [P] Local file-shadow cache so offline reads still work.
72. [P] Background prefetch of recently-accessed cloud items.
73. [P] Compression policy per file type (text > zstd, media > skip).
74. [P] Encrypted index for cloud search without leaking content.
75. [P] Per-collaborator share scopes (read, comment, edit, admin).
76. [P] Share revocation invalidates all derived links + cached keys.
77. [P] Read-only "snapshot view" for shared bundles.
78. [P] Embeddable preview iframe for shared docs.
79. [P] DNS-bound short-link domain (dex.link / similar).
80. [P] Backup integrity checker runs weekly + emails report.

## C. UKI (Unified Knowledge Interface) (81–130)

81. [P] Streaming token output with cancel button mid-generation.
82. [P] Tool-use protocol: UKI can call file / web / native tools.
83. [P] On-device model selector (small / medium / pro per task).
84. [P] Local model auto-download with checksum + signature verify.
85. [P] Quantized model variants for low-RAM machines.
86. [P] Multi-step plan preview before execution.
87. [P] Branchable plan: "what if I tried path B".
88. [P] Plan history with replay + diff between runs.
89. [P] Saved prompt templates with variables.
90. [P] Prompt library with sharing inside the marketplace.
91. [P] Personal style pack: tone, examples, do-not-do lists.
92. [P] Per-workspace UKI memory scope.
93. [P] Sensitive-content redaction before sending to cloud model.
94. [P] PII detector (regex + small ML) with confirm prompt.
95. [P] Local RAG index over your notes / files (per workspace).
96. [P] Embeddings cache invalidates on file change.
97. [P] Multi-modal input: paste image, drop PDF, attach audio.
98. [P] Voice in: push-to-talk, on-device Whisper-small.
99. [P] Voice out: configurable TTS preset or trained voice.
100. [P] Translation toggle on every reply.
101. [P] Summarize, expand, rewrite-as one-click slash commands.
102. [P] Code-mode: autoformat output as fenced blocks.
103. [P] Diff-mode: ask UKI for a patch, apply with one click.
104. [P] Notebook-mode: cells with persistent variables.
105. [P] Plan timer: shows wallclock + token cost.
106. [P] Token budget per plan with hard cap.
107. [P] Confidence score per answer.
108. [P] Source citation panel for every claim.
109. [P] Auto-link mentions of files, people, snippets.
110. [P] Slash command /undo reverts the last UKI action.
111. [P] Slash command /sandbox runs in an ephemeral workspace.
112. [P] Plan signing: cryptographic receipt of inputs + outputs.
113. [P] Reproducible runs: same inputs + same seed = same output.
114. [P] Determinism toggle (temp 0 + seed pinned).
115. [P] Inline math rendering (KaTeX) in answers.
116. [P] Inline diagram rendering (mermaid / graphviz).
117. [P] Inline table editor for tabular answers.
118. [P] Spreadsheet-mode for /chart and /pivot commands.
119. [P] Step-back reasoning toggle (show the thinking).
120. [P] Auto-quote source paragraphs in answers.
121. [P] "Why did you do that?" introspection command.
122. [P] Per-tool budget (e.g. max 3 web fetches).
123. [P] Local web cache for repeat queries (TTL configurable).
124. [P] UKI agent profiles (Researcher, Coder, Writer, Planner, …).
125. [P] Multi-agent debate option for tough problems.
126. [P] Skill packs: bundles of templates + tools + memory.
127. [P] Skill marketplace inside the Plugin store.
128. [P] Per-skill rate limit so a runaway skill cannot drain quota.
129. [P] Hot-swap model mid-conversation.
130. [P] "Quote this in a future answer" pin button.

## D. Creative Suite Apps (131–170)

131. [U] App: Mind-map (Nexus boards) with timeline scrubbing.
132. [U] App: Vector drawing (path tools, boolean ops, SVG export).
133. [U] App: Pixel art (8/16-bit palettes, animation frames).
134. [U] App: Audio waveform editor with non-destructive edits.
135. [U] App: Multitrack DAW lite (8 tracks, MIDI in).
136. [U] App: Video trim + simple cuts + transitions.
137. [U] App: 3D viewer for OBJ / GLTF.
138. [U] App: Blueprint / wireframe sketcher.
139. [U] App: Stock-photo browser (Unsplash-style API).
140. [U] App: Color picker + palette generator + WCAG checker.
141. [U] App: Font book (system fonts + variable axes).
142. [U] App: Icon set browser + sprite generator.
143. [U] App: Whiteboard with pressure / pen support.
144. [U] App: Slide / presentation builder.
145. [U] App: Calendar / agenda app.
146. [U] App: Habit tracker with weekly review.
147. [U] App: Pomodoro timer + focus stats.
148. [U] App: Flashcards with spaced repetition.
149. [U] App: Reading list with web archiver.
150. [U] App: RSS / feed reader.
151. [U] App: Markdown blog publisher with draft sync.
152. [U] App: Code playground (JS / TS / Python / Rust).
153. [U] App: REST client (Postman-lite).
154. [U] App: GraphQL explorer.
155. [U] App: Local-only LLM playground.
156. [U] App: Database browser (SQLite, Postgres read-only).
157. [U] App: JSON / YAML / TOML formatter + viewer.
158. [U] App: Regex tester with named groups.
159. [U] App: Diff / merge tool with three-way merge.
160. [U] App: Hex viewer / binary editor.
161. [U] App: ZIP / TAR archive extractor.
162. [U] App: PDF viewer with annotations.
163. [U] App: EPUB / book reader.
164. [U] App: Comic / image-set viewer.
165. [U] App: Screen recorder with region select.
166. [U] App: GIF maker.
167. [U] App: Screenshot annotator.
168. [U] App: Window-based tutor / coach overlay.
169. [U] App: System monitor (CPU, RAM, disk, GPU graphs).
170. [U] App: Network speed + latency monitor.

## E. Collaboration (171–210)

171. [P] CRDT-based co-editing for Nexus boards.
172. [P] CRDT for plain-text notes (Yjs-style).
173. [P] Voice chat per workspace (LAN p2p first).
174. [P] Cursor presence with name + color.
175. [P] Selection broadcast.
176. [P] @-mentions with email and in-app notifications.
177. [P] Threaded comments on any object.
178. [P] Reactions (thumbs, eyes, heart) on comments.
179. [P] Per-comment resolution state.
180. [P] Live polls inside a workspace.
181. [P] Round-robin task assignment.
182. [P] Project boards (kanban) backed by CRDT.
183. [P] Project gantt view.
184. [P] Inline review mode: tracked changes + accept/reject.
185. [P] Branching workspaces (like git branches for layouts).
186. [P] Pull-request style merge for workspaces.
187. [P] Activity feed with filtering.
188. [P] Read receipts (opt-in).
189. [P] Per-channel notification rules.
190. [P] Do-not-disturb hours per user.
191. [P] Status messages (slack-style).
192. [P] Calendar overlay shows team availability.
193. [P] Meeting room booking (in-app).
194. [P] Shared snippet vault per team.
195. [P] Shared template gallery.
196. [P] Shared theme gallery.
197. [P] Approval workflow ("X reviewers required").
198. [P] Mention-to-task converter.
199. [P] AI-summarize a busy thread on demand.
200. [P] Translation bubble for cross-language teams.
201. [P] Read-only board export to static HTML.
202. [P] Anonymous guest viewer link.
203. [P] Time-boxed editor link ("editable for 1 hour").
204. [P] Per-workspace knowledge base (intranet-lite).
205. [P] Internal wiki with backlinks + search.
206. [P] Page-history diff viewer.
207. [P] Edit-conflict warning with merge wizard.
208. [P] Roles: viewer, commenter, editor, manager, admin.
209. [P] Audit trail per workspace.
210. [P] Org-wide policy: "no public shares" toggle.

## F. Pricing, Payments, and Commerce (211–250)

211. [I] Stripe Customer Portal embed for self-serve billing.
212. [I] Apple App Store IAP integration for the macOS build.
213. [I] Microsoft Store IAP integration for the Windows build.
214. [I] Lemon Squeezy / Paddle as payment-tax fallback.
215. [P] Local-tax / VAT calculation per country.
216. [P] Currency selector with daily FX rates.
217. [P] Coupon engine (% off, $ off, free months).
218. [P] Referral program: $X credit when invitee converts.
219. [P] Affiliate tracking links with disclosure.
220. [P] Trial period (14 days) for any paid plan.
221. [P] Trial-to-paid auto-prompt 3 days before expiry.
222. [P] Annual auto-renew toggle (default OFF).
223. [P] Pause subscription (1–3 months).
224. [P] Downgrade with prorated refund.
225. [P] Family plan invitation flow + seat assignment.
226. [P] Studio seat reassignment (one click).
227. [P] Studio invoice consolidation.
228. [P] PO / wire transfer flow for enterprise.
229. [P] Receipts as PDF + email + in-app archive.
230. [P] Tax-exempt cert upload for Studio admins.
231. [P] Charity / education discount (verified via SheerID).
232. [P] Lifetime upgrade pack (bundle Pro + Studio bonus).
233. [P] One-time add-ons: extra 100 GB, extra UKI plans, voice pack.
234. [P] Marketplace revenue share dashboard (80/20 split).
235. [P] Author payouts via Stripe Connect.
236. [P] Plugin / theme listings with screenshots + readme.
237. [P] Plugin versioning + auto-update channel.
238. [P] Plugin signed manifest verified at install.
239. [P] Plugin permission prompt on first run.
240. [P] Plugin sandbox: capability tokens, no raw FS.
241. [P] In-app gift codes.
242. [P] Plan compare table generated from `proPerks.ts`.
243. [P] Upgrade flow inside the app (no browser bounce).
244. [P] Downgrade survey (why are you leaving?).
245. [P] Cancellation pause-offer ("save 30% if you stay").
246. [P] Renewal warning email 7 days before.
247. [P] Failed-payment retry with grace period.
248. [P] Dunning emails sequenced over 14 days.
249. [P] Invoice tax breakdown printable.
250. [P] Webhook receipt for every paid event.

## G. Performance and Reliability (251–290)

251. [N] Native fuzzy matcher already exists -- expose to all surfaces.
252. [N] Native image thumbnailer for Gallery (faster cold-load).
253. [N] Native zip / unzip for Files app.
254. [N] Native PDF page renderer (pdfium binding).
255. [N] Native crypto: AES-GCM via OS hardware (BCrypt / CommonCrypto).
256. [N] Native FS watcher with batched events.
257. [N] Native search index (tantivy or sled-based).
258. [O] Vite manual chunks (current build warns >500 KB chunks).
259. [O] Code-split every Creative app behind a route.
260. [O] React.lazy + Suspense for all heavy panels.
261. [O] Pre-warm critical routes after idle.
262. [O] Service-worker style cache for the renderer assets.
263. [O] Bundle analyzer report in CI.
264. [P] Memo + virtualization on every long list (>100 rows).
265. [P] IndexedDB for renderer-side persistence (replace bulky JSON in localStorage).
266. [P] Web Workers for parsing big files.
267. [P] OffscreenCanvas for heavy redraws.
268. [P] requestIdleCallback for non-critical setup.
269. [P] Debounce / throttle every onChange across forms.
270. [P] Virtualized scroll for chat / log views.
271. [P] Skeleton states for every async surface.
272. [P] Optimistic updates with rollback on error.
273. [P] Network resilience: queue + retry with jitter.
274. [P] Crash reporter (opt-in, scrubs PII).
275. [P] Telemetry opt-in dashboard inside Settings.
276. [P] Memory ceiling guard (warn user if > 1.5 GB renderer RSS).
277. [P] Cold-start budget < 1.5 s on mid-range laptop.
278. [P] Hot-reload dev with HMR proven across all surfaces.
279. [O] Smoke test on every PR (boot + open Settings).
280. [O] E2E coverage report.
281. [O] Mutation testing (Stryker) for shared modules.
282. [O] Snapshot tests for tokens / themes.
283. [O] Lighthouse-style audit for renderer.
284. [O] Bundle size budget enforced in CI.
285. [O] TypeScript `--strict` already on; add `noUncheckedIndexedAccess`.
286. [O] ESLint with `eslint-plugin-react-hooks` enforced.
287. [O] Prettier enforced on every PR.
288. [O] Spell-check for all user-facing strings.
289. [O] License-check for transitive deps (no AGPL surprises).
290. [O] SBOM (cyclonedx) on every release.

## H. Security and Privacy (291–330)

291. [P] Threat model document, reviewed quarterly.
292. [P] Penetration test budget (annual, third-party).
293. [P] Secrets vault inside the app (encrypted, biometric unlock).
294. [P] Auto-detect API keys in code views, redact.
295. [P] Local network firewall: allowlist + blocklist URLs UKI may hit.
296. [P] HTTPS-only enforcement; warn on any HTTP target.
297. [P] CSP for every renderer surface.
298. [P] No remote code execution paths reviewed and documented.
299. [P] Electron context isolation verified each release.
300. [P] Renderer cannot access Node.js APIs (preload bridge only).
301. [P] IPC schema validation with zod (already partial).
302. [P] Native modules signed.
303. [P] Notarization on macOS, signed installer on Windows.
304. [P] Linux AppImage / deb / rpm signed.
305. [P] Reproducible builds documented.
306. [P] Update channel signature verification (already partial).
307. [P] Update channel rollback path tested.
308. [P] Subresource Integrity for any external script.
309. [P] No third-party trackers, ever, in writing.
310. [P] Crash reports scrub file paths + emails.
311. [P] Logs rotated and capped.
312. [P] Right-to-be-forgotten endpoint.
313. [P] DSAR (data-subject-access-request) automated export.
314. [P] Privacy by design checklist on every PR.
315. [P] Cookie / storage inventory page in Settings.
316. [P] Differential privacy noise option for opt-in telemetry.
317. [P] Tor / proxy support honored (no DNS leaks).
318. [P] Local Wi-Fi fingerprinting disabled.
319. [P] Webcam / mic indicators in the app's status bar.
320. [P] Screen recording warning when active.
321. [P] Clipboard read prompts user.
322. [P] File drop sanity check (size + extension).
323. [P] Dependency-confusion guard for plugins.
324. [P] Plugin code review checklist before listing.
325. [P] CSRF-safe deep links (`dex://` scheme validates origin).
326. [P] OAuth state + nonce verified.
327. [P] PKCE for any OAuth flow.
328. [P] Per-tab cookie isolation in Browser app.
329. [P] Tracker / ad blocker in Browser app (default on).
330. [P] HTTPS-everywhere upgrade in Browser app.

## I. Accessibility (331–360)

331. [U] WCAG 2.2 AA audit of every screen.
332. [U] Keyboard reachable for every interactive control.
333. [U] Visible focus ring everywhere (already partial).
334. [U] ARIA roles + labels on dialogs, lists, menus.
335. [U] Live-region announcements for async events.
336. [U] High-contrast theme bundled.
337. [U] Color-blind safe palette option.
338. [U] Reduced-motion respected end-to-end.
339. [U] Larger-text mode (scales tokens, not just zoom).
340. [U] Dyslexia-friendly font option (OpenDyslexic).
341. [U] Screen-reader read-order tested with NVDA + VoiceOver.
342. [U] Focus trap in modals.
343. [U] ESC closes every modal.
344. [U] Skip-to-content link.
345. [U] Captions for any in-app video.
346. [U] Voice control entry points labelled.
347. [U] Keyboard help overlay (`?` key).
348. [U] Customizable shortcuts per command.
349. [U] Large-target mode (44 px minimum).
350. [U] Sticky-keys friendly (no required chords).
351. [U] Single-handed operation profile.
352. [U] Eye-tracker dwell-click support.
353. [U] Switch-control profile (one-button navigation).
354. [U] Read-aloud for any selected text.
355. [U] Hover-text TTS for icons.
356. [U] Cursor magnifier overlay.
357. [U] Inverted-colors theme.
358. [U] Sepia / warm theme for night.
359. [U] Adjustable line spacing in reading apps.
360. [U] Plain-language option for tooltips.

## J. UX, Visual, and Polish (361–400)

361. [U] AppShell-based standardized chrome on every page.
362. [U] Replace every browser alert() / confirm() with Toast / Modal.
363. [U] Replace inline styled blocks with token-driven CSS where possible.
364. [U] Unified empty-state component with illustration.
365. [U] Unified loading-state component.
366. [U] Unified error-state component with retry.
367. [U] Confirmation dialogs use the same Button vocabulary.
368. [U] Top-level command palette (Ctrl+K).
369. [U] Quick-switcher (Ctrl+P) for files / workspaces.
370. [U] Recent items sidebar.
371. [U] Pinned items rail.
372. [U] Drag handles for re-ordering everywhere.
373. [U] Multi-select with shift / ctrl in lists.
374. [U] Bulk actions toolbar appears on multi-select.
375. [U] Right-click menus consistent.
376. [U] Context-menu items show shortcut hints.
377. [U] Consistent breadcrumb component.
378. [U] Consistent tabs component.
379. [U] Consistent tooltip component.
380. [U] Consistent dropdown menu component.
381. [U] Consistent radio group component.
382. [U] Consistent checkbox group component.
383. [U] Consistent date picker.
384. [U] Consistent time picker.
385. [U] Consistent file picker (drop zone + browse).
386. [U] Consistent table with sort / filter / paginate.
387. [U] Consistent search bar with debounce + cancel.
388. [U] Consistent badge + chip components.
389. [U] Notification center with grouping + filters.
390. [U] System tray menu with quick toggles.
391. [U] Mini-window (always-on-top widget) mode.
392. [U] Multi-monitor aware: remember last monitor per app.
393. [U] Picture-in-picture for video / chat.
394. [U] Theme editor with live preview.
395. [U] Font scale control in Appearance.
396. [U] Density control: comfortable / compact.
397. [U] Sidebar collapse + restore animation.
398. [U] Drag-to-resize panes everywhere.
399. [U] First-run UI tour scripted across sections (not just welcome).
400. [U] Inline help icon next to every advanced setting.

## K. Plugin / Extension Ecosystem (401–420)

401. [P] Plugin manifest schema documented + validator.
402. [P] Plugin local dev mode (`dex plugin dev`).
403. [P] Plugin hot-reload during dev.
404. [P] Plugin debug console.
405. [P] Plugin lifecycle hooks: install / activate / deactivate / uninstall.
406. [P] Plugin storage scoped per plugin id.
407. [P] Plugin events bus.
408. [P] Plugin theming API.
409. [P] Plugin command registration.
410. [P] Plugin slash-command registration for UKI.
411. [P] Plugin sidebar slot.
412. [P] Plugin status-bar slot.
413. [P] Plugin window slot (for full-screen plugin apps).
414. [P] Plugin marketplace ratings + reviews.
415. [P] Plugin trust score (signed + verified author + low report rate).
416. [P] Plugin offline cache.
417. [P] Plugin policy: no untrusted code in main process.
418. [P] Plugin internationalization API.
419. [P] Plugin telemetry quota (none by default).
420. [P] Plugin spec docs + sample repo.

## L. Onboarding, Education, and Growth (421–440)

421. [U] Onboarding A/B framework.
422. [U] First-week digest email recap.
423. [U] In-app changelog modal on update.
424. [U] "What's new" tour for each release.
425. [U] Achievement system (subtle, not gamified to death).
426. [U] Daily tip card on dashboard.
427. [U] Sample workspaces for each Creative app.
428. [U] Curated sample data sets per persona (writer, dev, designer).
429. [U] Persona quiz at first run (optional).
430. [U] Cheat-sheet PDF generator for shortcuts.
431. [U] In-app feature request form.
432. [U] Public roadmap page synced from a JSON.
433. [U] Public changelog feed (RSS / Atom).
434. [U] Power-user hidden features list.
435. [U] Inline upgrade nudge after 5 hits of Free quota.
436. [U] Free-to-Pro one-week trial banner once.
437. [U] Refer-a-friend modal in Settings -> Account.
438. [U] Loyalty discount after 12 months.
439. [U] Welcome-back banner if returning after 30 days idle.
440. [U] Survey after first month (NPS).

## M. Internationalization and Localization (441–455)

441. [P] i18n framework (intl-messageformat).
442. [P] Extract strings via babel-plugin or sweep script.
443. [P] Translation manifest per locale.
444. [P] Pluralization rules per locale.
445. [P] RTL support (Arabic, Hebrew).
446. [P] Locale-aware number / date / currency formatting.
447. [P] Locale picker in Settings (separate from system locale).
448. [P] Glossary file for product nouns ("UKI", "Nexus").
449. [P] Crowdin / community translation workflow.
450. [P] Region-aware help links.
451. [P] Locale-aware spellcheck.
452. [P] Locale-specific tutorials.
453. [P] Locale fallback chain (es-MX → es → en).
454. [P] Currency symbol position respects locale.
455. [P] First-day-of-week respects locale.

## N. Build, CI, and Ops (456–475)

456. [O] GitHub Actions matrix: win / mac / linux.
457. [O] Cache `node_modules` + `.vite` in CI.
458. [O] Cache native `target/` directory.
459. [O] CodeQL static analysis.
460. [O] Dependabot weekly.
461. [O] Renovate as alternative.
462. [O] Auto-tag + auto-release on `main`.
463. [O] Signed commits enforced.
464. [O] CODEOWNERS file.
465. [O] Issue + PR templates.
466. [O] Conventional commits enforced.
467. [O] Changelog automated from commits.
468. [O] Auto-generate release notes on tag push.
469. [O] Beta channel auto-publish.
470. [O] Nightly channel for bleeding edge.
471. [O] Rollback playbook documented.
472. [O] Update server dashboard.
473. [O] Update telemetry: who is on which version.
474. [O] Status page (uptime + incidents).
475. [O] Chaos test on update server quarterly.

## O. Long-Term Bets (476–500)

476. [N] Compile parts of UKI to WebAssembly for portability.
477. [N] First-class Linux ARM64 build (Raspberry Pi 5 friendly).
478. [N] First-class macOS Apple Silicon build.
479. [N] iOS / iPadOS companion app (read-only at minimum).
480. [N] Android companion app (read-only at minimum).
481. [N] Web viewer (signed-in, read shared boards in browser).
482. [N] CLI binary (`dex` command-line tool).
483. [N] Headless server mode (run on a NAS to host workspaces).
484. [P] Federation: multiple DEX hosts, follow / sync.
485. [P] Open standard for workspace bundle (.dexpkg).
486. [P] LSP-style protocol for plugins (out-of-process).
487. [P] WASM plugin runtime (sandbox by design).
488. [P] Embeddable model runner (llama.cpp / mlc).
489. [P] On-device fine-tuning of personal model.
490. [P] On-device speech recognition pipeline.
491. [P] On-device image generation pipeline.
492. [P] On-device music generation pipeline.
493. [P] Encrypted federated search across your devices.
494. [P] Open-source SDK for third-party Creative apps.
495. [P] Public API for external sync clients.
496. [P] Community wiki + forum.
497. [D] Blog with a real publishing cadence.
498. [D] Video tutorials channel.
499. [O] Annual transparency report.
500. [O] Public security.txt + bug bounty program.
