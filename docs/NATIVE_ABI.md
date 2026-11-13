# DEX Native ABI — Rust ⇄ C++ boundary

The native core is split so that **system logic stays in Rust** and
**microsecond-sensitive paths run in C++**, interoperating through a stable **C
ABI**. This document is the contract.

## Split of responsibilities

| Layer | Language | Owns |
|---|---|---|
| Core / coordination | **Rust** (`core/`, `src/native/dex-core`) | System logic, 20+ inner-app coordination, IPC, file transfer, automation, update distribution, memory/process management (Xenon CPU/RAM reallocation). |
| Real-time engines | **C++** (`src/native/dex-cpp`) | Audio mixer + processing graph; Vinx video frame pipeline (FFmpeg decode/encode, GPU render); SIMD sample/frame kernels. |

**Hard rule:** no garbage-collected language touches any real-time path. The
audio callback and the video frame loop perform **no heap allocation, no I/O, and
no locks** — preallocate, and hand off across threads with the lock-free SPSC
ring buffer (`src/native/dex-cpp/src/ringbuffer.h`).

## C ABI boundary

All cross-language calls go through `extern "C"` functions with POD arguments
only (no C++ types, no Rust types crossing the line). Ownership and threading are
explicit.

```c
/* dex_audio.h — stable C ABI (C++ implements, Rust binds via FFI) */

typedef struct DexAudioEngine DexAudioEngine;   /* opaque */

/* lifecycle — called from the Rust control thread, never the audio thread */
DexAudioEngine* dex_audio_create(uint32_t sample_rate, uint32_t max_block);
void            dex_audio_destroy(DexAudioEngine*);

/* config — control thread only; engine double-buffers params internally */
void  dex_audio_set_gain(DexAudioEngine*, uint32_t channel, float gain);

/* hand a block of input to the engine; lock-free, returns frames accepted.
   Safe to call from the OS audio callback. */
uint32_t dex_audio_push(DexAudioEngine*, const float* interleaved, uint32_t frames);

/* pull processed output; lock-free, returns frames produced. */
uint32_t dex_audio_pull(DexAudioEngine*, float* out_interleaved, uint32_t frames);

/* meter read — wait-free snapshot, control thread. */
float dex_audio_peak(const DexAudioEngine*, uint32_t channel);
```

### Contract rules

1. **Threading.** `create`/`destroy`/`set_*` are **control-thread only**.
   `push`/`pull`/`peak` are **real-time-safe** (lock-free, allocation-free) and
   are the only functions the audio callback may call.
2. **Ownership.** Buffers passed across the ABI are **caller-owned and
   preallocated**; the callee never frees or reallocates them.
3. **No exceptions cross the boundary.** C++ functions are `noexcept` at the ABI
   edge; errors are status returns, never C++ throws or Rust panics.
4. **Param updates** (gain etc.) are published from the control thread and read by
   the audio thread via atomics / double-buffering — never a mutex.
5. **No I/O on the RT path.** Decode/encode and file work happen on worker
   threads; results reach the RT thread only through the SPSC ring buffer.

## Latency budgets (targets)

| Engine | Budget | Basis |
|---|---|---|
| Audio round-trip | **≤ 5 ms** (≤ 10 ms relaxed) | 128–256-frame buffer at 48 kHz; DSP measured at 112.9 ns/block (see `ENGINE_BENCHMARKS.md`). |
| Audio thread handoff | **≤ 50 µs** / block | ring buffer 19.4 ns/item × 256 ≈ 5 µs. |
| Video frame (60 fps) | **≤ 16.67 ms** | per-frame CPU ops on SIMD kernels; GPU compositing off the CPU RT budget. |
| Video frame (30 fps) | **≤ 33.3 ms** | as above. |

## OS audio / IO backends (stay native)

- **Audio:** WASAPI / ASIO (Windows), Core Audio (macOS), ALSA / JACK (Linux).
- **Async IO:** IOCP (Windows), io_uring (Linux), Grand Central Dispatch (macOS).

## Current status

- ✅ Lock-free SPSC ring buffer (`ringbuffer.h`) — implemented, benchmarked.
- ✅ SIMD sample kernels (`audio_kernels.h`: `applyGain`, `mixAccumulate`,
  `peakAbs`) — AVX2/SSE2/NEON + scalar fallback, validated, benchmarked.
- ✅ Benchmark harness (`bench/audio_bench.cpp`) + committed numbers.
- ✅ N-API exposure (`audio_napi.h`, registered in `addon.cpp`): `audioApplyGain`,
  `audioMix`, `audioPeak`, `audioSimdIsa` — the renderer/main can offload mixer
  math to the native SIMD path. (Linux build gets AVX via `-march=native`, Mac
  clang gets SSE2/NEON automatically, MSVC uses the safe scalar fallback.)
- ⏳ `DexAudioEngine` graph + WASAPI/ASIO backend wiring — next; builds on the
  primitives above (ROADMAP-600 §3.S).
- ⏳ Vinx C++ frame pipeline (FFmpeg + GPU) — ROADMAP-600 §3.T.

## Renderer ⇄ native IPC ABI ("we do not break userspace")

The second ABI is the one apps actually use: the `dex_ipc` channel names the
renderer, apps, plugins and saved automations call. A channel that shipped is
treated as a stable system call. Removing or renaming one doesn't fail loudly;
the call just resolves to `null` and the feature goes dead. So:

- `src-tauri/ipc-abi.lock.json` lists every channel the native side answers
  (`src-tauri/src` plus the `core/*` crates it dispatches into, such as
  `dex-ledger`), and the known renderer calls that nothing answers.
- `npm run abi:check` (also part of `npm run lint` and the unit tests,
  `tests/unit/ipc-abi-compat.test.ts`) fails when a locked channel disappears or
  when new renderer code calls a channel with no native arm and no
  `rendererShims` handler.
- Adding channels is always fine. To retire one, keep an alias arm that maps the
  old name to the new behaviour. If it truly has to go, run `npm run abi:update`
  and write down here what replaced it.
- The unhandled list may only shrink: when you wire one up, run
  `npm run abi:update` so the fix can't regress.

First run (2026-11-12): 1,919 native channels locked. It found one real dead
call: Quick Look's text preview used `files:read`, which nothing answers, so text
previews were always blank in the desktop app (now `fs:readText`). The 7
remaining unhandled calls all degrade honestly (`dexnotes:favorite` and
`dexnotes:get-word-suggestions` are served by the Notes local backend,
`optimization:*` and `memory:report` fall back to defaults, and
`screencapture:getSources` falls back to the system picker).
