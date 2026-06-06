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
