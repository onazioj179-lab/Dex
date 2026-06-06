// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// N-API bindings for the SIMD audio kernels (audio_kernels.h). Exposes the
// real-time sample ops to JS so the renderer/main can offload mixer math to the
// native SIMD path. Mirrors signal.h's binding style. The kernels themselves do
// no allocation / locking; these thin wrappers copy in/out of JS typed arrays.
// ===========================================================================

#ifndef DEX_AUDIO_NAPI_H
#define DEX_AUDIO_NAPI_H

#include <napi.h>
#include <cstring>
#include "audio_kernels.h"

// audioApplyGain(buf: Float32Array, gain: number) -> Float32Array
inline Napi::Value AudioApplyGain(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected: audioApplyGain(Float32Array, gain)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Float32Array in = info[0].As<Napi::Float32Array>();
    const float gain = info[1].As<Napi::Number>().FloatValue();
    const size_t n = in.ElementLength();
    Napi::Float32Array out = Napi::Float32Array::New(env, n);
    std::memcpy(out.Data(), in.Data(), n * sizeof(float));
    dex::applyGain(out.Data(), n, gain);
    return out;
}

// audioMix(dst: Float32Array, src: Float32Array, gain: number) -> Float32Array
// Returns a new buffer = dst + src*gain (dst is not mutated in place).
inline Napi::Value AudioMix(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsTypedArray() || !info[1].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected: audioMix(Float32Array dst, Float32Array src, gain)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Float32Array dst = info[0].As<Napi::Float32Array>();
    Napi::Float32Array src = info[1].As<Napi::Float32Array>();
    const float gain = info[2].As<Napi::Number>().FloatValue();
    const size_t n = dst.ElementLength() < src.ElementLength() ? dst.ElementLength() : src.ElementLength();
    Napi::Float32Array out = Napi::Float32Array::New(env, n);
    std::memcpy(out.Data(), dst.Data(), n * sizeof(float));
    dex::mixAccumulate(out.Data(), src.Data(), n, gain);
    return out;
}

// audioPeak(buf: Float32Array) -> number
inline Napi::Value AudioPeak(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected: audioPeak(Float32Array)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Float32Array buf = info[0].As<Napi::Float32Array>();
    return Napi::Number::New(env, dex::peakAbs(buf.Data(), buf.ElementLength()));
}

// audioSimdIsa() -> string   (which SIMD path the native module compiled to)
inline Napi::Value AudioSimdIsa(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), dex::simdIsa());
}

#endif // DEX_AUDIO_NAPI_H
