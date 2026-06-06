# DEX — ROADMAP-600

Master feature roadmap: **600** items across UKI & Creative intelligence (400), Platform (150),
and Sound/Video I/O (50). Companion to `GOAL-6A/6B/6C/6D.md` and `docs/IDEAS_500.md`.

**Legend** — status: `[missing]` not built · `[partial]` scaffolding exists, not wired/complete ·
`[have]` exists, listed for polish. Priority: **P0** foundational/near-term · **P1** important ·
**P2** later. "vs" = what leading apps (Photoshop/Firefly, Premiere/DaVinci, Ableton/Logic,
After Effects, Fusion 360, Cursor/Copilot, Notion AI, Raycast) already do.

Counts are fixed per group so the file always totals 600. First code landed for this roadmap:
the UKI **action executor** (`src/shared/uki/actionExecutor.ts`) + **creative action handlers**
(`src/shared/uki/creativeActions.ts`) + 36 new creative-control skills — see §1.C.

---

## §1 — UKI & Creative Intelligence — 400 (`#001`–`#400`)

### A. Agentic UKI core — 50 (`#001`–`#050`)
- #001 [have] P0 — Multi-step agent loop (think→act→observe) — `shared/uki/agentLoop.ts`. ✅ landed
- #002 [partial] P0 — Tool-use loop with typed dispatch + result feedback (`toolCall.ts`).
- #003 [have] P0 — Plan preview & approval UI (CreativeCommandBar shows steps + confirm before apply). ✅ landed
- #004 [partial] P0 — Undo-aware execution trail wired to `intelligence.ts` UndoLog. (executor emits trail)
- #005 [missing] P1 — Parallel-model race ("fastest wins") via `ukiPlusRouter`.
- #006 [missing] P1 — Self-critique / reflexion pass before finalizing an answer.
- #007 [partial] P0 — Per-step retries with backoff (executor supports `retries`).
- #008 [missing] P1 — Streaming responses interleaved with tool calls.
- #009 [partial] P1 — Determinism toggle (seed-locked runs) surfaced in UI.
- #010 [have] P1 — Cost budget per task (`shared/uki/budget.ts`). ✅ landed
- #011 [have] P1 — Latency budget per task (`shared/uki/budget.ts`). ✅ landed
- #012 [partial] P0 — Smart router goals UI (Auto/Cheapest/Fastest/Smartest/Offline).
- #013 [missing] P1 — Learned routing from past task outcomes.
- #014 [missing] P1 — Live Ollama/local-model discovery for Offline goal.
- #015 [missing] P2 — Multi-agent debate / consensus for hard problems.
- #016 [missing] P1 — Agent memory scratchpad (working set across steps).
- #017 [missing] P1 — Cancellable runs with partial-result preservation.
- #018 [have] P1 — Step-level confirm tiers (`shared/uki/confirmTier.ts`, +policy). ✅ landed
- #019 [missing] P2 — Branching plans (try A, fall back to B).
- #020 [missing] P1 — Dry-run mode (simulate ops, show predicted diff).
- #021 [have] P1 — Token/usage meter per conversation + per app (`shared/uki/budget.ts`). ✅ landed
- #022 [missing] P2 — Prompt template library with variables.
- #023 [missing] P1 — System-prompt presets per app context.
- #024 [missing] P2 — Few-shot example injection from past accepted edits.
- #025 [missing] P1 — Function/tool schema auto-generation from app skills.
- #026 [missing] P1 — Error-recovery agent (read stderr, propose fix, re-run).
- #027 [missing] P2 — Multi-turn clarification when intent is ambiguous.
- #028 [have] P1 — Context window packing by relevance (`shared/uki/contextPack.ts`). ✅ landed
- #029 [missing] P2 — Speculative pre-fetch of likely next action.
- #030 [missing] P1 — Inline citations attached to each generated claim.
- #031 [missing] P2 — Voice-in (push-to-talk, on-device Whisper-small).
- #032 [missing] P2 — Voice-out (TTS presets / trained voice).
- #033 [missing] P2 — Multi-modal input (image/PDF/audio attach).
- #034 [missing] P1 — Slash-command palette for UKI (/undo, /fix, /explain…).
- #035 [missing] P1 — Per-app "what can I ask?" capability hints.
- #036 [missing] P2 — Conversation forking & compare.
- #037 [missing] P2 — Background agents (run while you work).
- #038 [missing] P2 — Scheduled agents (cron-triggered routines).
- #039 [missing] P1 — Trigger agents on events (file saved, build failed).
- #040 [missing] P2 — Agent handoff (one agent calls another).
- #041 [have] P1 — Result caching keyed by (prompt, context hash) — `shared/uki/resultCache.ts`. ✅ landed
- #042 [missing] P2 — Offline queue (run when model available).
- #043 [missing] P1 — Per-provider key management via OS keychain.
- #044 [missing] P2 — Provider failover chains (A→B→local).
- #045 [missing] P2 — Response format enforcement (JSON/diff/markdown).
- #046 [missing] P1 — Action allow/deny policy per workspace.
- #047 [missing] P2 — Rate limiting / quota guard per provider.
- #048 [missing] P2 — Telemetry opt-in for accepted-suggestion rate.
- #049 [have] P1 — "Explain this plan" + run report — `shared/uki/planSummary.ts`. ✅ landed (#003 preview logic too)
- #050 [missing] P2 — Agent run history with replay.

### B. Memory, knowledge & context — 40 (`#051`–`#090`)
- #051 [partial] P0 — Vector recall store (LanceDB/Qdrant) for semantic search.
- #052 [partial] P0 — On-device embeddings (UKI-2B ONNX) with API fallback.
- #053 [missing] P1 — Project DNA: connect notes/files/tasks/decisions per project.
- #054 [partial] P1 — Semantic file search across the workspace.
- #055 [missing] P1 — Long-term memory editing UI (add/forget facts).
- #056 [missing] P1 — Per-app context packs fed to prompts.
- #057 [partial] P0 — Live context engine (project/file/workspace/task) wired to prompts.
- #058 [missing] P1 — Citation provenance & source ranking.
- #059 [missing] P2 — Retrieval reranking (BM25 + vector hybrid).
- #060 [missing] P1 — Incremental knowledge feeder (index on change).
- #061 [partial] P2 — Compressed memory archives (gzip + integrity).
- #062 [missing] P1 — Memory inspector UI (browse indexed facts).
- #063 [missing] P2 — Fact confidence + decay (forget unused after N days).
- #064 [missing] P1 — Cross-app entity linking (person↔file↔project).
- #065 [missing] P2 — Auto-tagging of ingested documents.
- #066 [missing] P1 — Recent-activity recall for "what was I doing?".
- #067 [missing] P2 — Memory export/import (portable knowledge pack).
- #068 [missing] P2 — Redaction-on-ingest for sensitive content.
- #069 [missing] P1 — Snippet extraction for grounded answers.
- #070 [missing] P2 — Knowledge graph centrality to surface key entities.
- #071 [missing] P2 — Timeline view of knowledge evolution.
- #072 [missing] P1 — "Related to this" surfacing while editing.
- #073 [missing] P2 — Duplicate-fact merge.
- #074 [missing] P2 — Multi-workspace memory isolation.
- #075 [missing] P1 — Context budget controls (how much memory to inject).
- #076 [missing] P2 — Embedding model picker (small/medium/pro).
- #077 [missing] P2 — Auto-download models w/ checksum verify.
- #078 [missing] P1 — Query memory by natural language.
- #079 [missing] P2 — Memory diffs across sessions.
- #080 [missing] P2 — Per-file summary cache.
- #081 [missing] P1 — Selection→memory ("remember this").
- #082 [missing] P2 — Scheduled re-index of changed folders.
- #083 [missing] P2 — Knowledge health dashboard (coverage, staleness).
- #084 [missing] P2 — Vector store compaction / GC.
- #085 [missing] P1 — Grounded answers cite file:line.
- #086 [missing] P2 — Embeddings for images (CLIP-style) for photo search.
- #087 [missing] P2 — Embeddings for audio (find similar sounds).
- #088 [missing] P1 — Context from open windows (linked-window awareness).
- #089 [missing] P2 — Privacy zones (never index marked folders).
- #090 [missing] P2 — Memory-backed autocomplete across apps.

### C. Creative-control tools (NL → operations) — 70 (`#091`–`#160`)
- #091 [have] P0 — Action executor binds skill `actionId`→handler (`actionExecutor.ts`). ✅ landed
- #092 [have] P0 — Creative op descriptors (`creativeActions.ts`, 53 ops). ✅ landed
- #093 [have] P0 — 36 new NL creative-control skills in `appSkills.ts`. ✅ landed
- #094 [have] P0 — Bind descriptors to live apps: `UkiCreativeOperator.dispatchCreativeOp` + `creativeRunner.runCreativeGoal` (NL→plan→op→IPC). ✅ landed
- #095 [have] P0 — NL command bar inside each creative app — `CreativeCommandBar` + `shared/uki/creativeCommand` (intent-gated NL→plan→preview→apply→report); wired into Prism. ✅ landed
- #096 [missing] P0 — Undo/redo integration for every agentic edit.
- #097 [missing] P1 — Batch ops ("apply to all selected layers/clips/tracks").
- #098 [missing] P1 — Reference-image/clip control ("match this look").
- #099 [missing] P1 — Content-aware suggestions surfaced contextually.
- #100 [missing] P1 — Multi-step creative recipes ("cut silences, add captions, color-match").
- #101 [missing] P1 — Preview-before-apply for destructive ops.
- #102 [missing] P1 — Natural-language selection ("select the person on the left").
- #103 [missing] P1 — Parameter inference from vague intent ("a bit warmer").
- #104 [missing] P2 — Style memory ("use my usual look").
- #105 [missing] P1 — Cross-app handoff ("send this frame to Prism").
- #106 [have] P1 — Confirm tiers for mutating ops (`shared/uki/confirmTier.ts`). ✅ landed
- #107 [missing] P2 — Voice control of creative tools.
- #108 [missing] P2 — Macro recording from agent actions.
- #109 [missing] P1 — "Explain what changed" after an edit.
- #110 [missing] P1 — Snap-to-intent (interpret rough drags as commands).
- #111 [missing] P2 — Suggest next step based on current document.
- #112 [missing] P2 — Auto-name layers/clips/tracks from content.
- #113 [missing] P2 — Smart presets learned from your edits.
- #114 [missing] P1 — Inline diff of pixel/timeline/graph before/after.
- #115 [missing] P2 — A/B variant generation ("give me 3 versions").
- #116 [missing] P2 — Constraint-based edits ("keep faces sharp").
- #117 [missing] P1 — Progress + cancel for long creative ops.
- #118 [missing] P2 — Cost estimate for AI-heavy ops.
- #119 [missing] P2 — Offline fallbacks for creative AI ops.
- #120 [missing] P1 — Per-app skill discovery panel.
- #121 [missing] P2 — Templated creative briefs → generated project.
- #122 [missing] P2 — "Fix this" one-click from detected issues.
- #123 [missing] P2 — Auto-QA pass (artifacts, clipping, banding).
- #124 [missing] P2 — Suggest crops/aspect variants for platforms.
- #125 [missing] P1 — Asset library search by description.
- #126 [missing] P2 — Generate placeholder assets inline.
- #127 [missing] P2 — Smart object replacement.
- #128 [missing] P2 — Auto-layout / auto-arrange.
- #129 [missing] P2 — Consistency check across a series.
- #130 [missing] P2 — Brand-kit enforcement (colors/fonts).
- #131 [missing] P2 — Accessibility check (contrast, captions).
- #132 [missing] P2 — Localization helper (translate text layers).
- #133 [missing] P2 — Export-intent presets ("for Instagram").
- #134 [missing] P2 — Auto-thumbnail / poster frame.
- #135 [have] P2 — Smart trim to target duration (`video/pipeline.planSmartTrim`). ✅ landed
- #136 [missing] P2 — Auto-beat-sync edits to music.
- #137 [missing] P2 — Generate captions/subtitles + styling.
- #138 [missing] P2 — Auto-translate captions.
- #139 [missing] P2 — Voiceover generation from script.
- #140 [missing] P2 — Script→storyboard.
- #141 [missing] P2 — Storyboard→rough cut.
- #142 [missing] P2 — Mood/tone control across a project.
- #143 [missing] P2 — Color palette extraction → apply.
- #144 [missing] P2 — Font pairing suggestions.
- #145 [missing] P2 — Smart guides from content.
- #146 [missing] P2 — Auto-mask refinement.
- #147 [missing] P2 — Edge-aware adjustments.
- #148 [missing] P2 — Depth-aware effects.
- #149 [missing] P2 — Relight from a reference.
- #150 [missing] P2 — Harmonize composited elements.
- #151 [missing] P2 — Noise/grain matching across sources.
- #152 [missing] P2 — Auto-retime for slow-mo.
- #153 [missing] P2 — Object tracking → attach effects.
- #154 [missing] P2 — Rotoscoping assist.
- #155 [missing] P2 — Sky/segment selection presets.
- #156 [missing] P2 — Smart fill across video (temporal).
- #157 [missing] P2 — Audio-driven animation.
- #158 [missing] P2 — Generate transitions to match pacing.
- #159 [missing] P2 — "Clean up" pass per app (one button).
- #160 [missing] P2 — Recipe marketplace (share creative recipes).

### D. Prism (image) intelligence — 35 (`#161`–`#195`)
- #161 [partial] P0 — Select subject (`prism.subjectSelect`). #162 [partial] P0 — Remove background.
- #163 [partial] P1 — Color match to reference. #164 [partial] P1 — Smart fill selection.
- #165 [missing] P0 — Generative fill (`prism.generativeFill`, skill landed; engine pending).
- #166 [missing] P0 — Generative expand canvas. #167 [missing] P0 — AI upscale (2x/4x).
- #168 [missing] P1 — Relight. #169 [missing] P1 — Style transfer. #170 [missing] P1 — Denoise.
- #171 [missing] P1 — Perspective fix. #172 [missing] P1 — Object remove (inpaint).
- #173 [missing] P1 — Sky replace. #174 [missing] P1 — Auto-enhance. #175 [missing] P1 — Color grade to look.
- #176 [missing] P2 — Face-aware retouch. #177 [missing] P2 — Skin smoothing (natural).
- #178 [missing] P2 — Red-eye / blemish removal. #179 [missing] P2 — Dehaze. #180 [missing] P2 — HDR merge.
- #181 [missing] P2 — Focus stacking. #182 [missing] P2 — Panorama stitch. #183 [missing] P2 — Lens correction.
- #184 [missing] P2 — Content-aware crop. #185 [missing] P2 — Smart resize (seam carving).
- #186 [missing] P2 — Auto-levels/curves. #187 [missing] P2 — Palette quantize/poster.
- #188 [missing] P2 — Pattern/texture generate. #189 [missing] P2 — Background generate.
- #190 [missing] P2 — Layer auto-name. #191 [missing] P2 — Non-destructive smart filters.
- #192 [missing] P2 — Frequency separation assist. #193 [missing] P2 — Dodge/burn assist.
- #194 [missing] P2 — Batch edit presets. #195 [missing] P2 — Export for web (optimize).

### E. Vinx (video) intelligence — 35 (`#196`–`#230`)
- #196 [partial] P0 — Auto-highlight reel. #197 [partial] P0 — Auto-transcribe/captions.
- #198 [partial] P0 — Smart cuts at silence/scene. #199 [missing] P0 — Silence removal (skill landed).
- #200 [missing] P0 — Auto-reframe (9:16/1:1). #201 [missing] P1 — B-roll suggest.
- #202 [missing] P1 — Auto color match. #203 [missing] P1 — Stabilize. #204 [missing] P1 — Speed ramp.
- #205 [missing] P1 — Remove filler words. #206 [missing] P1 — Scene detect. #207 [missing] P1 — Auto-duck music.
- #208 [missing] P2 — Multicam AI sync. #209 [missing] P2 — Object tracking. #210 [missing] P2 — Motion blur synth.
- #211 [missing] P2 — Auto chapters. #212 [missing] P2 — Transcript-based editing.
- #213 [missing] P2 — Auto-zoom on speaker. #214 [missing] P2 — Smart reframe per shot.
- #215 [missing] P2 — Auto-subtitle styling. #216 [missing] P2 — Translate captions.
- #217 [missing] P2 — Auto-thumbnail. #218 [missing] P2 — Loudness normalize (broadcast).
- #219 [missing] P2 — Audio cleanup (de-noise/de-reverb). #220 [missing] P2 — Auto music selection.
- #221 [missing] P2 — Beat-synced cuts. #222 [missing] P2 — Smart transitions. #223 [missing] P2 — Color LUT suggest.
- #224 [missing] P2 — Sky/segment masks in video. #225 [missing] P2 — Green-screen key assist.
- #226 [missing] P2 — Auto-crop to action. #227 [missing] P2 — Proxy auto-gen. #228 [missing] P2 — Smart render passthrough.
- #229 [missing] P2 — Shot list from footage. #230 [missing] P2 — Auto-rough-cut from script.

### F. Imosion (audio/DAW) intelligence — 35 (`#231`–`#265`)
- #231 [partial] P0 — Mastering coach. #232 [partial] P0 — Stem separation. #233 [partial] P0 — Tempo/key detect.
- #234 [partial] P1 — Podcast cleanup. #235 [missing] P0 — Auto-mix (skill landed). #236 [missing] P1 — Melody→chords.
- #237 [missing] P1 — Denoise. #238 [missing] P1 — Vocal align. #239 [missing] P1 — Pitch correct (auto-tune).
- #240 [missing] P1 — Loudness match (LUFS). #241 [missing] P1 — Beat detect. #242 [missing] P1 — De-ess.
- #243 [missing] P2 — De-reverb. #244 [missing] P2 — Click/pop removal. #245 [missing] P2 — Hum removal.
- #246 [missing] P2 — Auto-EQ to reference. #247 [missing] P2 — Auto-compression. #248 [missing] P2 — Sidechain assist.
- #249 [missing] P2 — Chord progression suggest. #250 [missing] P2 — Drum pattern generate. #251 [missing] P2 — Bassline generate.
- #252 [missing] P2 — Melody generate. #253 [missing] P2 — Humanize MIDI. #254 [missing] P2 — Quantize w/ groove.
- #255 [missing] P2 — Key/scale lock. #256 [missing] P2 — Sample chop to slices. #257 [missing] P2 — Loop finder.
- #258 [missing] P2 — Vocal harmony generate. #259 [missing] P2 — Time-stretch (formant-aware). #260 [missing] P2 — Spectral repair.
- #261 [missing] P2 — Auto-fade/crossfade. #262 [missing] P2 — Gain staging assist. #263 [missing] P2 — Reference-track A/B.
- #264 [missing] P2 — Auto-arrange sections. #265 [missing] P2 — Export stems/mixdown presets.

### G. Flux (animation/motion) intelligence — 30 (`#266`–`#295`)
- #266 [partial] P0 — Suggest animation. #267 [partial] P1 — Expression autocomplete. #268 [partial] P1 — Motion presets.
- #269 [missing] P0 — Text→motion (skill landed). #270 [missing] P1 — Auto-rig. #271 [missing] P1 — Physics sim.
- #272 [missing] P1 — Camera path generate. #273 [missing] P1 — Lip sync. #274 [missing] P2 — Motion capture import.
- #275 [missing] P2 — Auto-tween/interpolate. #276 [missing] P2 — Easing suggest. #277 [missing] P2 — Squash/stretch assist.
- #278 [missing] P2 — Path morph. #279 [missing] P2 — Particle presets. #280 [missing] P2 — Trails/echo.
- #281 [missing] P2 — Audio-reactive animation. #282 [missing] P2 — Kinetic typography presets. #283 [missing] P2 — Logo sting generator.
- #284 [missing] P2 — Scene transitions. #285 [missing] P2 — 3D layer extrude. #286 [missing] P2 — Light rig presets.
- #287 [missing] P2 — Depth-of-field. #288 [missing] P2 — Auto-stagger across layers. #289 [missing] P2 — Loop-safe timing.
- #290 [missing] P2 — Rotoscope to shape. #291 [missing] P2 — Vector to motion. #292 [missing] P2 — Expression library.
- #293 [missing] P2 — Rig templates (character/UI). #294 [missing] P2 — Render queue presets. #295 [missing] P2 — Lottie/SVG export.

### H. Axl (CAD/3D) intelligence — 25 (`#296`–`#320`)
- #296 [partial] P1 — Parametric suggest. #297 [partial] P1 — GD&T suggest. #298 [partial] P1 — Standard part lookup.
- #299 [missing] P1 — Design-for-manufacture check (skill landed). #300 [missing] P1 — Topology optimize.
- #301 [missing] P1 — Mass properties. #302 [missing] P2 — Tolerance stackup. #303 [missing] P2 — Auto-fillet/chamfer.
- #304 [missing] P2 — Sketch auto-constrain. #305 [missing] P2 — Feature recognition. #306 [missing] P2 — Auto-dimension drawing.
- #307 [missing] P2 — Interference/clash detect. #308 [missing] P2 — Material selector by use-case. #309 [missing] P2 — Cost estimate.
- #310 [missing] P2 — FEA quick-check. #311 [missing] P2 — Generative design. #312 [missing] P2 — Lattice infill.
- #313 [missing] P2 — Draft analysis. #314 [missing] P2 — Wall-thickness check. #315 [missing] P2 — Assembly mate suggest.
- #316 [missing] P2 — BOM generate. #317 [missing] P2 — Print-prep (slicing hints). #318 [missing] P2 — Export STEP/STL presets.
- #319 [missing] P2 — Parametric variants table. #320 [missing] P2 — Reverse-engineer from mesh.

### I. Forge / DexCode (code) intelligence — 30 (`#321`–`#350`)
- #321 [partial] P0 — Explain selection. #322 [partial] P0 — Fix error. #323 [partial] P0 — Generate test.
- #324 [partial] P1 — Write docstring. #325 [partial] P1 — Refactor selection. #326 [missing] P0 — Inline completion (ghost text).
- #327 [missing] P0 — Agentic multi-file edit. #328 [missing] P1 — Repo Q&A (codebase chat). #329 [missing] P1 — Diff-mode patches.
- #330 [missing] P1 — Generate code from comment. #331 [missing] P1 — Rename across project. #332 [missing] P2 — Extract function/component.
- #333 [missing] P2 — Convert language. #334 [missing] P2 — Add types/annotations. #335 [missing] P2 — Write commit message.
- #336 [missing] P2 — PR description generate. #337 [missing] P2 — Review my diff. #338 [missing] P2 — Find similar code.
- #339 [missing] P2 — Generate migration. #340 [missing] P2 — Explain stack trace. #341 [missing] P2 — Suggest dependencies.
- #342 [missing] P2 — Detect dead code. #343 [missing] P2 — Security lint (AI). #344 [missing] P2 — Perf hotspots.
- #345 [missing] P2 — Generate fixtures/mocks. #346 [missing] P2 — Doc site generate. #347 [missing] P2 — Scaffold from spec.
- #348 [missing] P2 — Inline run/REPL. #349 [missing] P2 — Snippet learn-from-repo. #350 [missing] P2 — Autograde TODOs.

### J. Cross-app & Agent Studio — 30 (`#351`–`#380`)
- #351 [missing] P0 — Visual agent builder (drag tools→agent). #352 [missing] P0 — Workflow synthesis from NL.
- #353 [missing] P1 — Cross-app recipes (e.g., screenshot→note→task). #354 [missing] P1 — Schedule/trigger automations.
- #355 [missing] P1 — Agent templates (research/coding/design/support). #356 [missing] P1 — Tool catalog with permissions.
- #357 [missing] P2 — Shared agent marketplace. #358 [missing] P2 — Agent versioning. #359 [missing] P2 — Agent eval harness.
- #360 [missing] P2 — Multi-app macro recorder. #361 [missing] P2 — Conditional workflows. #362 [missing] P2 — Loop/iterate steps.
- #363 [missing] P2 — Human-in-the-loop checkpoints. #364 [missing] P2 — Variables/secrets store. #365 [missing] P2 — Webhook triggers.
- #366 [missing] P2 — File-watch triggers. #367 [missing] P2 — Email/calendar triggers. #368 [missing] P2 — Data transforms (map/filter).
- #369 [missing] P2 — API call step. #370 [missing] P2 — Branch on AI classification. #371 [missing] P2 — Retry/backoff policy UI.
- #372 [missing] P2 — Run logs + traces. #373 [missing] P2 — Cost dashboard per agent. #374 [missing] P2 — Sandbox test runs.
- #375 [missing] P2 — Share/export agent bundle. #376 [missing] P2 — Import community agents. #377 [missing] P2 — Agent permissions audit.
- #378 [missing] P2 — Multi-agent orchestration. #379 [missing] P2 — Agent memory per project. #380 [missing] P2 — Natural-language agent debugging.

### K. Trust, eval & control surfaces — 20 (`#381`–`#400`)
- #381 [partial] P0 — Confidence calibration (Brier) UI. #382 [partial] P0 — PII guard dialog before send.
- #383 [partial] P1 — Citations panel. #384 [missing] P1 — Eval harness (golden prompts).
- #385 [missing] P1 — A/B prompt testing. #386 [missing] P1 — Redaction settings (PII classes).
- #387 [missing] P1 — Audit log of AI actions. #388 [missing] P2 — Hallucination flags ("low evidence").
- #389 [missing] P2 — Source trust scoring. #390 [missing] P2 — Content safety filters. #391 [missing] P2 — Jailbreak/abuse guard.
- #392 [missing] P2 — Per-workspace data residency. #393 [missing] P2 — Model card surface. #394 [missing] P2 — Bias checks.
- #395 [missing] P2 — Explainability ("why this answer"). #396 [missing] P2 — Consent prompts for cloud send.
- #397 [missing] P2 — Reproducibility report. #398 [missing] P2 — Feedback thumbs → learning. #399 [missing] P2 — Cost/usage transparency.
- #400 [missing] P2 — Kill-switch for autonomous agents.

---

## §2 — Platform — 150 (`#401`–`#550`)

### L. Shell / workspace / dock / windows — 25 (`#401`–`#425`)
- #401 [partial] P0 — Linked-window UX (drag to link, move/resize together). #402 [partial] P0 — Workspace restore (exact layout).
- #403 [partial] P0 — Dock grouping polish (creative/dev/comm/utility). #404 [have] P1 — Snap layouts (14 presets).
- #405 [missing] P1 — Virtual desktops/spaces UI. #406 [missing] P1 — Hot corners config. #407 [partial] P1 — Command palette scopes.
- #408 [missing] P1 — Stage-manager style grouping. #409 [missing] P2 — Per-project window sets. #410 [missing] P2 — Quick-tile keyboard.
- #411 [missing] P2 — Window peek/preview. #412 [missing] P2 — Always-on-top/PiP. #413 [missing] P2 — Focus mode (hide chrome).
- #414 [missing] P2 — Multi-monitor profiles. #415 [missing] P2 — Session save/restore on crash. #416 [missing] P2 — Workspace templates.
- #417 [missing] P2 — Dock magnification tuning. #418 [missing] P2 — Dock badges (running/notif). #419 [missing] P2 — Spotlight unified search polish.
- #420 [missing] P2 — Global hotkeys editor. #421 [missing] P2 — Theme manager (light/dark/custom). #422 [missing] P2 — Reduced-glass/liquid toggle UI.
- #423 [missing] P2 — Accessibility prefs (contrast/motion). #424 [missing] P2 — Onboarding <3min polish. #425 [missing] P2 — Layout export/share.

### M. Terminal — 20 (`#426`–`#445`)
- #426 [partial] P0 — Real PTY w/ full ANSI (256-color/truecolor). #427 [missing] P0 — Tabs & splits.
- #428 [missing] P0 — AI inline (explain/fix/NL→command, skills exist). #429 [partial] P1 — Command history search.
- #430 [missing] P1 — Command blocks (prompt/output grouping). #431 [missing] P1 — SSH sessions. #432 [missing] P1 — Env profiles.
- #433 [missing] P2 — Themes/fonts. #434 [missing] P2 — Clickable paths/URLs. #435 [missing] P2 — Copy-on-select.
- #436 [missing] P2 — Broadcast to panes. #437 [missing] P2 — Saved commands/snippets. #438 [missing] P2 — Inline images (sixel/iterm).
- #439 [missing] P2 — Status line (cwd/git/exit). #440 [missing] P2 — Autosuggest from history. #441 [missing] P2 — Syntax highlight input.
- #442 [missing] P2 — Session record/replay. #443 [missing] P2 — Persistent scrollback. #444 [missing] P2 — Profiles per project.
- #445 [missing] P2 — Right-click context actions.

### N. DexCode / Forge editor + Dev Mode — 30 (`#446`–`#475`)
- #446 [partial] P0 — Syntax highlight + find/replace + run. #447 [missing] P0 — LSP (completions/hover/defs).
- #448 [missing] P0 — Debugger (breakpoints/step/watch). #449 [missing] P0 — Multi-file project tree. #450 [missing] P1 — Git UI (diff/stage/commit).
- #451 [missing] P1 — Integrated terminal panel polish. #452 [missing] P1 — Linting/diagnostics. #453 [missing] P1 — Formatting on save.
- #454 [missing] P1 — Snippets/templates. #455 [missing] P1 — Go-to-symbol/outline. #456 [missing] P2 — Minimap.
- #457 [missing] P2 — Multi-cursor. #458 [missing] P2 — Bracket/indent guides. #459 [missing] P2 — Inline blame.
- #460 [missing] P2 — Tasks/run configs. #461 [missing] P2 — Problems panel. #462 [missing] P2 — Search across files.
- #463 [missing] P1 — Dev Mode: API/IPC explorer (450+ channels). #464 [missing] P1 — Dev Mode: plugin builder/debugger.
- #465 [missing] P1 — Dev Mode: agent builder. #466 [missing] P1 — Dev Mode: prompt tester. #467 [missing] P1 — Dev Mode: feature flags toggle.
- #468 [missing] P2 — Dev Mode: system monitor (cpu/mem/thermal). #469 [missing] P2 — Dev Mode: workflow debugger.
- #470 [missing] P2 — Dev Mode: log viewer/filter. #471 [missing] P2 — Dev Mode: payload sandbox. #472 [missing] P2 — DexScript runtime polish.
- #473 [missing] P2 — Notebook/REPL cells. #474 [missing] P2 — Live preview pane. #475 [missing] P2 — Extension host for editor plugins.

### O. Microservices / "develop mode" for services — 25 (`#476`–`#500`)
- #476 [partial] P0 — Service registry UI (ServiceHost inventory). #477 [missing] P0 — Local service runner (start/stop).
- #478 [missing] P0 — Health & logs per service. #479 [missing] P1 — IPC channel explorer + invoke. #480 [missing] P1 — Service scaffolding generator.
- #481 [missing] P1 — Native engine status (Vault/Search/Audio/Automation/Scanner). #482 [missing] P1 — Tauri/Electron bridge inspector.
- #483 [missing] P2 — Capability broker viewer (native vs JS). #484 [missing] P2 — Service dependency graph. #485 [missing] P2 — Restart policies.
- #486 [missing] P2 — Resource limits per service. #487 [missing] P2 — Metrics dashboard. #488 [missing] P2 — Trace requests across services.
- #489 [missing] P2 — Mock service mode. #490 [missing] P2 — Hot-reload services in dev. #491 [missing] P2 — Env/secret injection.
- #492 [missing] P2 — Port/endpoint manager. #493 [missing] P2 — Service templates (Rust/Node). #494 [missing] P2 — Build/test runner per crate.
- #495 [missing] P2 — Rust core `cargo test` integration. #496 [missing] P2 — Native build status (napi/core). #497 [missing] P2 — Crash recovery per service.
- #498 [missing] P2 — Service versioning/rollback. #499 [missing] P2 — Local API gateway. #500 [missing] P2 — Service marketplace (internal).

### P. Nexus memory graph UX — 20 (`#501`–`#520`)
- #501 [partial] P0 — Memory-first views (projects/ideas/people/files…). #502 [have] P0 — Live ingest from ContextBus (`nexusLiveStore.installNexusIngest`). ✅ landed
- #503 [partial] P1 — Centrality surfacing (important entities). #504 [partial] P1 — Timeline view. #505 [partial] P1 — Entity search + tags.
- #506 [missing] P1 — Link-from-text (auto-link entities in notes). #507 [missing] P1 — Graph layout (force/hierarchical) UI.
- #508 [missing] P2 — Pathfinding between entities. #509 [missing] P2 — Clusters by tag. #510 [missing] P2 — Orphan detection/cleanup.
- #511 [missing] P2 — Snapshot/restore graph. #512 [missing] P2 — Co-occurrence inference. #513 [missing] P2 — Entity merge/split.
- #514 [missing] P2 — Saved queries/views. #515 [missing] P2 — Graph→project bundle. #516 [missing] P2 — Recall by recency (LRU).
- #517 [missing] P2 — Dashboard widgets. #518 [missing] P2 — P2P/multi-device graph sync. #519 [missing] P2 — Power view (top entities).
- #520 [missing] P2 — Export graph (JSON/Graphviz).

### Q. Plugins / integrations / marketplace / SDK — 20 (`#521`–`#540`)
- #521 [partial] P0 — Plugin manifest schema + validation. #522 [missing] P0 — Plugin loader/executor runtime.
- #523 [missing] P0 — Capability prompts (fs/net/ipc/shell…). #524 [missing] P1 — Plugin marketplace UI. #525 [missing] P1 — Plugin signing/distribution.
- #526 [partial] P1 — Integration registry (GitHub/Figma/Slack/Gmail/Drive/Notion). #527 [missing] P1 — OAuth/token/apikey flows.
- #528 [missing] P1 — Reusable integration settings UI. #529 [missing] P2 — SDK v1 docs + samples. #530 [missing] P2 — Plugin event bus.
- #531 [missing] P2 — Plugin panels/widgets API. #532 [missing] P2 — Plugin commands API. #533 [missing] P2 — Plugin AI-tool registration.
- #534 [missing] P2 — Capability ledger (grant/revoke). #535 [missing] P2 — Plugin sandbox isolation. #536 [missing] P2 — Plugin auto-update.
- #537 [missing] P2 — Integration health/status. #538 [missing] P2 — Per-integration scopes. #539 [missing] P2 — Webhook receiver framework.
- #540 [missing] P2 — Marketplace ratings/reviews.

### R. Internal wiring / perf / reliability / UI polish — 10 (`#541`–`#550`)
- #541 [partial] P0 — Wire pure `shared/*` logic → UI/IPC (stub→live audit). #542 [partial] P0 — Consolidate ~247 inline `backdrop-filter` → tokens.
- #543 [partial] P1 — Perf-tier gating coverage (low/mid/high/ultra). #544 [partial] P1 — Thermal protection (kill blur when hot).
- #545 [missing] P1 — Crash recovery + session restore. #546 [missing] P2 — Reduce bundle size / lazy-load apps.
- #547 [missing] P2 — Startup time budget + measurement. #548 [missing] P2 — Memory-leak guard for long sessions.
- #549 [missing] P2 — Accessibility audit pass (ARIA/keyboard). #550 [missing] P2 — Error/empty/loading-state consistency.

---

## §3 — Sound & Video I/O Engine — 50 (`#551`–`#600`)

### S. Audio I/O — 20 (`#551`–`#570`)
- #551 [have] P0 — Real playback **out** (`AudioPlaybackService`: ctx+gain+analyser; app singleton synced to Audio page volume). ✅ landed
- #552 [have] P0 — Capture **in** (`AudioPlaybackService.startRecording` MediaRecorder→Blob). ✅ landed
- #553 [missing] P0 — Output device selection/routing. #554 [missing] P1 — Input device selection.
- #555 [have] P1 — Level meters (peak/RMS/LUFS) — `shared/audio/levelMeter.ts` + `AudioPlaybackService.meter()`. ✅ #556 [missing] P1 — Monitoring (zero-latency passthrough).
- #557 [missing] P1 — Gain/pan per channel (`dsp.ts`). #558 [missing] P1 — Fades (lin/log/exp/s-curve) on playback.
- #559 [have] P2 — Loop/region playback (`AudioPlaybackService.setLoop`). ✅ #560 [partial] P2 — Scrub/seek (`seek()` landed; waveform UI pending). #561 [missing] P2 — Multi-track sync playback.
- #562 [missing] P2 — Latency compensation. #563 [missing] P2 — Sample-rate convert. #564 [missing] P2 — Bit-depth convert.
- #565 [missing] P2 — Export WAV/MP3/FLAC/AAC. #566 [missing] P2 — Metronome/click. #567 [missing] P2 — Punch-in/out record.
- #568 [missing] P2 — Spatial/surround upmix (`SpatialAudio.ts`). #569 [missing] P2 — Sidechain routing. #570 [missing] P2 — Plugin host (AU/VST-style) wiring.

### T. Video I/O — 20 (`#571`–`#590`)
- #571 [partial] P0 — Import/decode **in** (HTMLVideoElement + `probeFromMetadata`). *(probe landed)*
- #572 [have] P0 — Export **out** in-app: Vinx `ExportDialog` drives codec/mime/bitrate via shared `planExport` (canvas+MediaRecorder→WebM). ✅ landed
- #573 [missing] P0 — Native export MP4/H.264/H.265 (Tauri/ffmpeg descriptor). #574 [missing] P1 — ProRes/DNxHD export.
- #575 [missing] P1 — `planExport()` job descriptor + progress. #576 [missing] P1 — Proxy generation pipeline (`planProxy`).
- #577 [have] P1 — Frame extraction / thumbnails (`video/pipeline.planThumbnails`). ✅ #578 [missing] P1 — Smart-render passthrough (`shouldSmartRender`).
- #579 [missing] P2 — Multicam waveform sync wiring (`multicamSyncOffset`). #580 [missing] P2 — Scene-change detect wiring.
- #581 [missing] P2 — Render-farm chunk plan (`planRenderFarm`). #582 [missing] P2 — Hardware-accel encode detect.
- #583 [missing] P2 — Container mux (MOV/MXF). #584 [missing] P2 — Color space convert (Rec.709/2020). #585 [missing] P2 — HDR/SDR tone-map.
- #586 [missing] P2 — Burn-in captions/subtitles. #587 [missing] P2 — GIF/WebP export. #588 [missing] P2 — Image-sequence export.
- #589 [missing] P2 — Timecode/EDL export. #590 [missing] P2 — Background/queued export.

### U. Shared media pipeline — 10 (`#591`–`#600`)
- #591 [have] P1 — A/V sync engine (offset + drift correct) — `shared/media/avSync.ts`. ✅ #592 [have] P1 — Transcode/job queue (`shared/media/jobQueue.ts`). ✅ landed
- #593 [missing] P2 — Format/codec auto-detection. #594 [missing] P2 — Streaming/chunked decode for large files.
- #595 [missing] P2 — Waveform cache (reuse `dex-audio` peaks). #596 [missing] P2 — Thumbnail cache.
- #597 [missing] P2 — Unified media metadata model. #598 [have] P2 — Progress/cancel for all media jobs (`jobQueue`). ✅
- #599 [missing] P2 — Error recovery + partial-output cleanup. #600 [have] P2 — Media job history + re-run (`jobQueue` retains finished jobs). ✅

---

## Execution notes

- **Landed for this roadmap (first wiring slice):** §1.C #091–#093 — `actionExecutor.ts`,
  `creativeActions.ts` (53 creative ops), and 36 new creative-control skills (registry now 77),
  all unit-tested. In progress: #094 (bind to live apps), #551–#552 (audio I/O), #571–#572 (video I/O),
  #502 (Nexus live ingest).
- **Sequencing:** P0 items first, grouped by the four current goals (6A native, 6B intelligence,
  6C platform, 6D workspace). Each item maps to a small, testable slice — pure logic in
  `src/shared/`, then thin UI/IPC adapters.
- This file is the single source of truth; update status tags as items land.
