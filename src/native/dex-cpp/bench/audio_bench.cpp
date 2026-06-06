// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Standalone microbenchmark for the real-time audio path: SIMD kernels vs their
// scalar twins, and the lock-free SPSC ring buffer under genuine 2-thread
// producer/consumer contention.
//
//   g++ -O3 -std=c++17 -mavx2 -mfma -pthread \
//       src/native/dex-cpp/bench/audio_bench.cpp -o audio_bench && ./audio_bench
//
// Reports throughput + speedup numbers, not impressions.
// ===========================================================================

#include "../src/audio_kernels.h"
#include "../src/ringbuffer.h"

#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <chrono>
#include <thread>
#include <vector>

using Clock = std::chrono::high_resolution_clock;
static double nsBetween(Clock::time_point a, Clock::time_point b) {
    return std::chrono::duration<double, std::nano>(b - a).count();
}

int main() {
    std::printf("DEX audio engine benchmark  (ISA: %s)\n", dex::simdIsa());
    std::printf("------------------------------------------------------------\n");

    const std::size_t N = 256;            // one audio block (frames)
    const std::size_t iters = 4'000'000;  // blocks processed
    const double samples = double(N) * double(iters);

    std::vector<float> a(N), b(N), ref(N);
    for (std::size_t i = 0; i < N; ++i) { a[i] = 0.001f * float(i % 97); b[i] = 0.002f * float(i % 53); }

    // ---- correctness: SIMD must equal scalar ----
    ref = a;
    dex::applyGainScalar(ref.data(), N, 0.999f);
    dex::applyGain(a.data(), N, 0.999f);
    bool ok = true;
    for (std::size_t i = 0; i < N; ++i) if (std::fabs(a[i] - ref[i]) > 1e-6f) ok = false;
    std::printf("correctness applyGain   : %s\n", ok ? "PASS" : "FAIL");

    // reset
    for (std::size_t i = 0; i < N; ++i) a[i] = 0.001f * float(i % 97);

    // ---- applyGain: scalar vs SIMD ----
    auto t0 = Clock::now();
    for (std::size_t it = 0; it < iters; ++it) dex::applyGainScalar(a.data(), N, 0.999999f);
    auto t1 = Clock::now();
    for (std::size_t i = 0; i < N; ++i) a[i] = 0.001f * float(i % 97);
    auto t2 = Clock::now();
    for (std::size_t it = 0; it < iters; ++it) dex::applyGain(a.data(), N, 0.999999f);
    auto t3 = Clock::now();
    double sc = nsBetween(t0, t1), si = nsBetween(t2, t3);
    std::printf("applyGain  scalar       : %7.1f ms  %8.1f Msamp/s\n", sc / 1e6, samples / (sc / 1e9) / 1e6);
    std::printf("applyGain  simd         : %7.1f ms  %8.1f Msamp/s   %.2fx\n", si / 1e6, samples / (si / 1e9) / 1e6, sc / si);

    // ---- mixAccumulate: scalar vs SIMD ----
    std::vector<float> out1(N, 0.0f), out2(N, 0.0f);
    auto m0 = Clock::now();
    for (std::size_t it = 0; it < iters; ++it) dex::mixAccumulateScalar(out1.data(), b.data(), N, 0.5f);
    auto m1 = Clock::now();
    auto m2 = Clock::now();
    for (std::size_t it = 0; it < iters; ++it) dex::mixAccumulate(out2.data(), b.data(), N, 0.5f);
    auto m3 = Clock::now();
    double mc = nsBetween(m0, m1), mi = nsBetween(m2, m3);
    std::printf("mixAccum   scalar       : %7.1f ms  %8.1f Msamp/s\n", mc / 1e6, samples / (mc / 1e9) / 1e6);
    std::printf("mixAccum   simd         : %7.1f ms  %8.1f Msamp/s   %.2fx\n", mi / 1e6, samples / (mi / 1e9) / 1e6, mc / mi);

    // ---- per-block latency: time to process one 256-frame stereo block ----
    {
        std::vector<float> L(N), R(N), mix(N, 0.0f);
        for (std::size_t i = 0; i < N; ++i) { L[i] = 0.01f * float(i % 31); R[i] = 0.02f * float(i % 17); }
        const int reps = 100000;
        auto p0 = Clock::now();
        for (int r = 0; r < reps; ++r) {
            dex::mixAccumulate(mix.data(), L.data(), N, 0.7f);
            dex::mixAccumulate(mix.data(), R.data(), N, 0.7f);
            dex::applyGain(mix.data(), N, 0.98f);
        }
        auto p1 = Clock::now();
        std::printf("per-block (2-mix+gain)  : %6.1f ns/block  (256-frame, %s)\n", nsBetween(p0, p1) / reps, dex::simdIsa());
    }

    // ---- lock-free SPSC ring buffer under real 2-thread contention ----
    {
        SpscRingBuffer<float> rb(4096);
        const std::size_t M = 50'000'000;
        auto r0 = Clock::now();
        std::thread producer([&] {
            for (std::size_t i = 0; i < M; ) {
                if (rb.push(float(i))) ++i;
            }
        });
        std::size_t got = 0; float tmp;
        while (got < M) { if (rb.pop(tmp)) ++got; }
        producer.join();
        auto r1 = Clock::now();
        double rbns = nsBetween(r0, r1);
        std::printf("ringbuffer SPSC (2thr)  : %7.1f M items/s  %5.2f ns/item  (lock-free, 0 alloc)\n",
                    double(M) / (rbns / 1e9) / 1e6, rbns / double(M));
    }

    std::printf("------------------------------------------------------------\n");
    std::printf("result: %s\n", ok ? "OK" : "CORRECTNESS-FAILED");
    return ok ? 0 : 1;
}
