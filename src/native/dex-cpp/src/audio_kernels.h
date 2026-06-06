// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Real-time audio sample kernels -- SIMD with scalar fallback.
//
// SSE/AVX on x86, NEON on ARM, scalar tail for the remainder. None of these
// allocate, lock, or perform I/O, so they are safe inside the audio callback.
// Buffers are caller-owned and preallocated. Each kernel has a `*Scalar`
// reference twin used for validation + benchmarking the SIMD speedup.
// ===========================================================================

#ifndef DEX_AUDIO_KERNELS_H
#define DEX_AUDIO_KERNELS_H

#include <cstddef>
#include <cmath>

#if defined(__AVX__)
#  include <immintrin.h>
#elif defined(__SSE2__)
#  include <emmintrin.h>
#endif
#if defined(__ARM_NEON) || defined(__ARM_NEON__)
#  include <arm_neon.h>
#endif

namespace dex {

// ---- scalar reference twins -------------------------------------------------

inline void applyGainScalar(float* buf, std::size_t n, float gain) noexcept {
    for (std::size_t i = 0; i < n; ++i) buf[i] *= gain;
}

inline void mixAccumulateScalar(float* out, const float* in, std::size_t n, float gain) noexcept {
    for (std::size_t i = 0; i < n; ++i) out[i] += in[i] * gain;
}

inline float peakAbsScalar(const float* buf, std::size_t n) noexcept {
    float peak = 0.0f;
    for (std::size_t i = 0; i < n; ++i) {
        const float a = std::fabs(buf[i]);
        if (a > peak) peak = a;
    }
    return peak;
}

// ---- SIMD kernels -----------------------------------------------------------

// buf[i] *= gain
inline void applyGain(float* buf, std::size_t n, float gain) noexcept {
    std::size_t i = 0;
#if defined(__AVX__)
    const __m256 g = _mm256_set1_ps(gain);
    for (; i + 8 <= n; i += 8)
        _mm256_storeu_ps(buf + i, _mm256_mul_ps(_mm256_loadu_ps(buf + i), g));
#elif defined(__SSE2__)
    const __m128 g = _mm_set1_ps(gain);
    for (; i + 4 <= n; i += 4)
        _mm_storeu_ps(buf + i, _mm_mul_ps(_mm_loadu_ps(buf + i), g));
#elif defined(__ARM_NEON) || defined(__ARM_NEON__)
    const float32x4_t g = vdupq_n_f32(gain);
    for (; i + 4 <= n; i += 4)
        vst1q_f32(buf + i, vmulq_f32(vld1q_f32(buf + i), g));
#endif
    for (; i < n; ++i) buf[i] *= gain; // scalar tail
}

// out[i] += in[i] * gain   (mixer accumulate)
inline void mixAccumulate(float* out, const float* in, std::size_t n, float gain) noexcept {
    std::size_t i = 0;
#if defined(__AVX__)
    const __m256 g = _mm256_set1_ps(gain);
    for (; i + 8 <= n; i += 8) {
        const __m256 o = _mm256_loadu_ps(out + i);
        const __m256 v = _mm256_loadu_ps(in + i);
#  if defined(__FMA__)
        _mm256_storeu_ps(out + i, _mm256_fmadd_ps(v, g, o));
#  else
        _mm256_storeu_ps(out + i, _mm256_add_ps(o, _mm256_mul_ps(v, g)));
#  endif
    }
#elif defined(__SSE2__)
    const __m128 g = _mm_set1_ps(gain);
    for (; i + 4 <= n; i += 4) {
        const __m128 o = _mm_loadu_ps(out + i);
        const __m128 v = _mm_loadu_ps(in + i);
        _mm_storeu_ps(out + i, _mm_add_ps(o, _mm_mul_ps(v, g)));
    }
#elif defined(__ARM_NEON) || defined(__ARM_NEON__)
    const float32x4_t g = vdupq_n_f32(gain);
    for (; i + 4 <= n; i += 4)
        vst1q_f32(out + i, vmlaq_f32(vld1q_f32(out + i), vld1q_f32(in + i), g));
#endif
    for (; i < n; ++i) out[i] += in[i] * gain; // scalar tail
}

// max(|buf[i]|)  -- meter peak
inline float peakAbs(const float* buf, std::size_t n) noexcept {
    std::size_t i = 0;
    float peak = 0.0f;
#if defined(__AVX__)
    const __m256 sign = _mm256_set1_ps(-0.0f);
    __m256 vmax = _mm256_setzero_ps();
    for (; i + 8 <= n; i += 8)
        vmax = _mm256_max_ps(vmax, _mm256_andnot_ps(sign, _mm256_loadu_ps(buf + i)));
    float tmp[8];
    _mm256_storeu_ps(tmp, vmax);
    for (int k = 0; k < 8; ++k) if (tmp[k] > peak) peak = tmp[k];
#endif
    for (; i < n; ++i) {
        const float a = std::fabs(buf[i]);
        if (a > peak) peak = a;
    }
    return peak;
}

// Which SIMD path this translation unit compiled to (for reports/benchmarks).
inline const char* simdIsa() noexcept {
#if defined(__AVX2__)
    return "AVX2";
#elif defined(__AVX__)
    return "AVX";
#elif defined(__SSE2__)
    return "SSE2";
#elif defined(__ARM_NEON) || defined(__ARM_NEON__)
    return "NEON";
#else
    return "scalar";
#endif
}

} // namespace dex

#endif // DEX_AUDIO_KERNELS_H
