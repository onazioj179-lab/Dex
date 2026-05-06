// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Signal Processing -- Real-time DSP primitives
// Convolution, normalization, RMS calculation, peak detection.
// Used by audio engine and Flux waveform visualizer.
// ===========================================================================

#ifndef DEX_SIGNAL_H
#define DEX_SIGNAL_H

#include <napi.h>
#include <vector>
#include <cmath>
#include <cstdint>
#include <algorithm>

// ---------------------------------------------------------------------------
// Core DSP functions
// ---------------------------------------------------------------------------

// 1D convolution (output length = signal.size() - kernel.size() + 1)
static std::vector<double> convolve(
    const std::vector<double>& signal,
    const std::vector<double>& kernel)
{
    if (kernel.empty() || signal.size() < kernel.size()) return {};
    size_t outLen = signal.size() - kernel.size() + 1;
    std::vector<double> out(outLen, 0.0);
    for (size_t i = 0; i < outLen; ++i) {
        double sum = 0.0;
        for (size_t j = 0; j < kernel.size(); ++j) {
            sum += signal[i + j] * kernel[kernel.size() - 1 - j];
        }
        out[i] = sum;
    }
    return out;
}

// Normalize to [-1, 1] range
static void normalize(std::vector<double>& buf) {
    if (buf.empty()) return;
    double maxAbs = 0.0;
    for (double v : buf) {
        double a = std::fabs(v);
        if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs > 1e-12) {
        double scale = 1.0 / maxAbs;
        for (double& v : buf) v *= scale;
    }
}

// Root mean square
static double rms(const std::vector<double>& buf) {
    if (buf.empty()) return 0.0;
    double sum = 0.0;
    for (double v : buf) sum += v * v;
    return std::sqrt(sum / static_cast<double>(buf.size()));
}

// Peak detection: find indices where value exceeds threshold and is local max
static std::vector<uint32_t> detectPeaks(
    const std::vector<double>& buf,
    double threshold,
    uint32_t minDistance)
{
    std::vector<uint32_t> peaks;
    if (buf.size() < 3) return peaks;

    for (size_t i = 1; i + 1 < buf.size(); ++i) {
        if (buf[i] < threshold) continue;
        if (buf[i] <= buf[i - 1] || buf[i] <= buf[i + 1]) continue;
        // Check minimum distance from last peak
        if (!peaks.empty() && (i - peaks.back()) < minDistance) {
            // Keep the higher peak
            if (buf[i] > buf[peaks.back()]) {
                peaks.back() = static_cast<uint32_t>(i);
            }
            continue;
        }
        peaks.push_back(static_cast<uint32_t>(i));
    }
    return peaks;
}

// ---------------------------------------------------------------------------
// Helper: JS Float64Array / Array -> std::vector<double>
// ---------------------------------------------------------------------------
static std::vector<double> jsToVec(Napi::Env env, Napi::Value val) {
    std::vector<double> out;
    if (val.IsTypedArray()) {
        Napi::Float64Array ta = val.As<Napi::Float64Array>();
        out.resize(ta.ElementLength());
        for (size_t i = 0; i < out.size(); ++i) out[i] = ta[i];
    } else if (val.IsArray()) {
        Napi::Array arr = val.As<Napi::Array>();
        out.resize(arr.Length());
        for (uint32_t i = 0; i < arr.Length(); ++i) {
            out[i] = arr.Get(i).As<Napi::Number>().DoubleValue();
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// signalConvolve(signal: number[], kernel: number[]) -> number[]
inline Napi::Value SignalConvolve(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: signalConvolve(signal, kernel)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto sig = jsToVec(env, info[0]);
    auto ker = jsToVec(env, info[1]);
    auto result = convolve(sig, ker);
    Napi::Float64Array out = Napi::Float64Array::New(env, result.size());
    for (size_t i = 0; i < result.size(); ++i) out[i] = result[i];
    return out;
}

// signalNormalize(buffer: number[]) -> number[]
inline Napi::Value SignalNormalize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected: signalNormalize(buffer)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto buf = jsToVec(env, info[0]);
    normalize(buf);
    Napi::Float64Array out = Napi::Float64Array::New(env, buf.size());
    for (size_t i = 0; i < buf.size(); ++i) out[i] = buf[i];
    return out;
}

// signalRms(buffer: number[]) -> number
inline Napi::Value SignalRms(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected: signalRms(buffer)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto buf = jsToVec(env, info[0]);
    return Napi::Number::New(env, rms(buf));
}

// signalPeakDetect(buffer: number[], threshold: number, minDistance: number) -> number[]
inline Napi::Value SignalPeakDetect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected: signalPeakDetect(buffer, threshold, minDistance)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto buf = jsToVec(env, info[0]);
    double threshold = info[1].As<Napi::Number>().DoubleValue();
    uint32_t minDist = info[2].As<Napi::Number>().Uint32Value();
    auto peaks = detectPeaks(buf, threshold, minDist);
    Napi::Array out = Napi::Array::New(env, peaks.size());
    for (size_t i = 0; i < peaks.size(); ++i) {
        out[i] = Napi::Number::New(env, peaks[i]);
    }
    return out;
}

#endif // DEX_SIGNAL_H
