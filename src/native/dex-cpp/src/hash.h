// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Hash Engine -- Fast non-cryptographic hashing
// FNV-1a (64-bit) and xxHash-style for file dedup, cache keys, bloom seeds.
// Batch mode for hashing arrays of strings in a single call.
// ===========================================================================

#ifndef DEX_HASH_H
#define DEX_HASH_H

#include <napi.h>
#include <cstdint>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// FNV-1a 64-bit hash
// ---------------------------------------------------------------------------
static inline uint64_t fnv1a_64(const char* data, size_t len) {
    uint64_t h = 14695981039346656037ULL;
    for (size_t i = 0; i < len; ++i) {
        h ^= static_cast<uint64_t>(static_cast<unsigned char>(data[i]));
        h *= 1099511628211ULL;
    }
    return h;
}

// ---------------------------------------------------------------------------
// xxHash-style 64-bit (simplified, fast)
// ---------------------------------------------------------------------------
static inline uint64_t xx64(const char* data, size_t len) {
    const uint64_t P1 = 11400714785074694791ULL;
    const uint64_t P2 = 14029467366897019727ULL;
    const uint64_t P3 = 1609587929392839161ULL;
    const uint64_t P4 = 9650029242287828579ULL;
    const uint64_t P5 = 2870177450012600261ULL;

    uint64_t h;
    const unsigned char* p = reinterpret_cast<const unsigned char*>(data);

    if (len >= 32) {
        uint64_t v1 = P1 + P2;
        uint64_t v2 = P2;
        uint64_t v3 = 0;
        uint64_t v4 = 0 - P1;
        const unsigned char* limit = p + len - 32;
        do {
            uint64_t k;
            // Round 1
            k = *reinterpret_cast<const uint64_t*>(p); p += 8;
            v1 += k * P2; v1 = (v1 << 31) | (v1 >> 33); v1 *= P1;
            // Round 2
            k = *reinterpret_cast<const uint64_t*>(p); p += 8;
            v2 += k * P2; v2 = (v2 << 31) | (v2 >> 33); v2 *= P1;
            // Round 3
            k = *reinterpret_cast<const uint64_t*>(p); p += 8;
            v3 += k * P2; v3 = (v3 << 31) | (v3 >> 33); v3 *= P1;
            // Round 4
            k = *reinterpret_cast<const uint64_t*>(p); p += 8;
            v4 += k * P2; v4 = (v4 << 31) | (v4 >> 33); v4 *= P1;
        } while (p <= limit);

        h = ((v1 << 1) | (v1 >> 63))
          + ((v2 << 7) | (v2 >> 57))
          + ((v3 << 12) | (v3 >> 52))
          + ((v4 << 18) | (v4 >> 46));

        // Merge round results
        v1 *= P2; v1 = (v1 << 31) | (v1 >> 33); v1 *= P1; h ^= v1; h = h * P1 + P4;
        v2 *= P2; v2 = (v2 << 31) | (v2 >> 33); v2 *= P1; h ^= v2; h = h * P1 + P4;
        v3 *= P2; v3 = (v3 << 31) | (v3 >> 33); v3 *= P1; h ^= v3; h = h * P1 + P4;
        v4 *= P2; v4 = (v4 << 31) | (v4 >> 33); v4 *= P1; h ^= v4; h = h * P1 + P4;
    } else {
        h = P5;
    }

    h += static_cast<uint64_t>(len);

    // Remaining bytes
    const unsigned char* end = reinterpret_cast<const unsigned char*>(data) + len;
    while (p + 8 <= end) {
        uint64_t k = *reinterpret_cast<const uint64_t*>(p);
        k *= P2; k = (k << 31) | (k >> 33); k *= P1;
        h ^= k; h = ((h << 27) | (h >> 37)) * P1 + P4;
        p += 8;
    }
    while (p < end) {
        h ^= (*p) * P5;
        h = ((h << 11) | (h >> 53)) * P1;
        p++;
    }

    // Avalanche
    h ^= h >> 33;
    h *= P2;
    h ^= h >> 29;
    h *= P3;
    h ^= h >> 32;

    return h;
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// hashFnv1a(input: string) -> string  (hex)
inline Napi::Value HashFnv1a(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: hashFnv1a(input: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string input = info[0].As<Napi::String>().Utf8Value();
    uint64_t h = fnv1a_64(input.data(), input.size());
    char buf[17];
    snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(h));
    return Napi::String::New(env, buf);
}

// hashXx64(input: string) -> string  (hex)
inline Napi::Value HashXx64(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: hashXx64(input: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string input = info[0].As<Napi::String>().Utf8Value();
    uint64_t h = xx64(input.data(), input.size());
    char buf[17];
    snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(h));
    return Napi::String::New(env, buf);
}

// hashBatch(inputs: string[]) -> string[]  (FNV-1a hex hashes)
inline Napi::Value HashBatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsArray()) {
        Napi::TypeError::New(env, "Expected: hashBatch(inputs: string[])").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Array inputs = info[0].As<Napi::Array>();
    uint32_t len = inputs.Length();
    Napi::Array results = Napi::Array::New(env, len);
    for (uint32_t i = 0; i < len; ++i) {
        std::string s = inputs.Get(i).As<Napi::String>().Utf8Value();
        uint64_t h = fnv1a_64(s.data(), s.size());
        char buf[17];
        snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(h));
        results[i] = Napi::String::New(env, buf);
    }
    return results;
}

#endif // DEX_HASH_H
