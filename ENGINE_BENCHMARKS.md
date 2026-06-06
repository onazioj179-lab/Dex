# DEX Native Engine — Benchmarks

Real measured numbers for the real-time audio path (SIMD kernels + lock-free
SPSC ring buffer). Reproduce with the command below; this file is committed
alongside the patch per the "report numbers, not impressions" rule.

## Machine / build

- Compiler: **g++ (MinGW-W64 UCRT) 15.2.0**, `-O3 -std=c++17 -mavx2 -mfma -pthread`
- ISA path selected at compile time: **AVX2** (8×f32 lanes) + FMA
- Source: `src/native/dex-cpp/bench/audio_bench.cpp`
- Kernels: `src/native/dex-cpp/src/audio_kernels.h` · Ring buffer: `src/native/dex-cpp/src/ringbuffer.h`

## Results (before → after)

"Before" = scalar reference twin; "after" = SIMD kernel. Same binary, same data,
warm cache. Workload = 4,000,000 × 256-frame blocks (1.024 B samples).

| Kernel | Scalar (before) | SIMD (after) | Speedup |
|---|---:|---:|---:|
| `applyGain`  (buf *= gain)         | 479.9 Msamp/s | **3194.5 Msamp/s** | **6.66×** |
| `mixAccumulate` (out += in*gain)   | 484.7 Msamp/s | **2616.6 Msamp/s** | **5.40×** |

| Real-time metric | Measured |
|---|---:|
| Per-block DSP (256-frame: 2× mix-accumulate + gain) | **112.9 ns / block** |
| Lock-free SPSC ring buffer, 2-thread producer/consumer | **51.5 M items/s · 19.4 ns/item** |
| SIMD == scalar correctness (`applyGain`) | **PASS** |

## Latency budget analysis

**Audio round-trip target: ≤ 10 ms (pro target ≤ 5 ms).**
At 48 kHz a 256-frame buffer is one **5.33 ms** period. The DSP for that block
costs **112.9 ns** — i.e. **0.0021 %** of the period — so processing is *not* the
bottleneck; the budget is dominated by the OS audio buffer (WASAPI/ASIO/CoreAudio/
ALSA). Even at a 128-frame (2.67 ms) buffer the DSP headroom is ~23,000×. The
thread handoff (ring buffer) for a full block is ~256 × 19.4 ns ≈ **5 µs**,
negligible against the period. **Conclusion: the audio thread can stay
allocation-free, lock-free, and well inside a sub-5 ms round-trip budget.**

**Video per-frame target: ≤ 16.67 ms (60 fps), ≤ 33.3 ms (30 fps).**
Frame sample/pixel ops reuse the same SIMD kernel family (≈5–7× over scalar on
this ISA). The full Vinx pipeline (FFmpeg decode/encode + GPU compositing) is a
larger build tracked in `docs/NATIVE_ABI.md` and ROADMAP-600 §3.T; the kernel
speedups above set the per-frame CPU-side budget headroom.

## Why these numbers hold the hard rules

- **No heap / no locks / no I/O on the RT path** — `applyGain`/`mixAccumulate`/
  `peakAbs` are `noexcept`, operate on caller-owned preallocated buffers, and the
  ring buffer's storage is allocated **once** in its constructor.
- **Lock-free handoff** — SPSC ring buffer uses only `std::atomic` acquire/release;
  19.4 ns/item under genuine 2-thread contention confirms no mutex.
- **SIMD with scalar fallback** — AVX/SSE on x86, NEON on ARM, scalar tail for the
  remainder; the scalar twin is kept for validation (correctness PASS).

## Reproduce

```bash
g++ -O3 -std=c++17 -mavx2 -mfma -pthread \
    src/native/dex-cpp/bench/audio_bench.cpp -o audio_bench
./audio_bench           # exits 0 on correctness PASS
```

On ARM, swap `-mavx2 -mfma` for `-march=native` (selects the NEON path).
