// ===========================================================================
// DEX Platform -- Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// ===========================================================================
// DEX C++ Native -- Bloom Filter
// ---------------------------------------------------------------------------
// Space-efficient probabilistic data structure for membership testing.
// Used by DEX file scanner to quickly check if a path has been indexed.
// False positive rate ~1% at optimal k for 100K entries in 1MB filter.
// ---------------------------------------------------------------------------

#ifndef DEX_BLOOM_H
#define DEX_BLOOM_H

#include <napi.h>
#include <vector>
#include <cstdint>
#include <cmath>
#include <string>

// ---------------------------------------------------------------------------
// Internal bloom filter implementation
// ---------------------------------------------------------------------------
class BloomFilter {
public:
    explicit BloomFilter(uint32_t expectedItems, double fpRate = 0.01)
        : m_count(0)
    {
        // Optimal bit array size: m = -(n * ln(p)) / (ln(2)^2)
        double m = -(static_cast<double>(expectedItems) * std::log(fpRate))
                   / (std::log(2.0) * std::log(2.0));
        m_bits.resize(static_cast<size_t>(std::ceil(m)), false);

        // Optimal hash count: k = (m/n) * ln(2)
        m_hashCount = static_cast<uint32_t>(
            std::round((static_cast<double>(m_bits.size()) / expectedItems) * std::log(2.0))
        );
        if (m_hashCount < 1) m_hashCount = 1;
        if (m_hashCount > 16) m_hashCount = 16;
    }

    void insert(const std::string& key) {
        for (uint32_t i = 0; i < m_hashCount; ++i) {
            size_t idx = hash(key, i) % m_bits.size();
            m_bits[idx] = true;
        }
        ++m_count;
    }

    bool contains(const std::string& key) const {
        for (uint32_t i = 0; i < m_hashCount; ++i) {
            size_t idx = hash(key, i) % m_bits.size();
            if (!m_bits[idx]) return false;
        }
        return true;
    }

    void clear() {
        std::fill(m_bits.begin(), m_bits.end(), false);
        m_count = 0;
    }

    uint32_t count()     const { return m_count; }
    size_t   bitSize()   const { return m_bits.size(); }
    uint32_t hashFuncs() const { return m_hashCount; }

    double fillRatio() const {
        size_t set = 0;
        for (bool b : m_bits) { if (b) ++set; }
        return static_cast<double>(set) / m_bits.size();
    }

private:
    // Double hashing: h(key, i) = h1(key) + i * h2(key)
    static uint64_t hash(const std::string& key, uint32_t seed) {
        uint64_t h = 14695981039346656037ULL; // FNV offset basis
        for (char c : key) {
            h ^= static_cast<uint64_t>(c);
            h *= 1099511628211ULL; // FNV prime
        }
        h ^= seed * 2654435761ULL; // Knuth multiplicative
        h *= 6364136223846793005ULL;
        return h;
    }

    std::vector<bool> m_bits;
    uint32_t m_hashCount;
    uint32_t m_count;
};

// Singleton bloom instance (thread-safe for single-threaded N-API context)
static BloomFilter* g_bloom = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// bloomCreate(expectedItems: number, fpRate?: number) -> { bits, hashes }
inline Napi::Value BloomCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected: bloomCreate(expectedItems, [fpRate])").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    uint32_t expected = info[0].As<Napi::Number>().Uint32Value();
    double fpRate = (info.Length() > 1 && info[1].IsNumber())
                    ? info[1].As<Napi::Number>().DoubleValue()
                    : 0.01;

    if (expected == 0) expected = 1;
    if (fpRate <= 0 || fpRate >= 1) fpRate = 0.01;

    delete g_bloom;
    g_bloom = new BloomFilter(expected, fpRate);

    Napi::Object result = Napi::Object::New(env);
    result.Set("bits",   Napi::Number::New(env, static_cast<double>(g_bloom->bitSize())));
    result.Set("hashes", Napi::Number::New(env, g_bloom->hashFuncs()));
    return result;
}

// bloomInsert(key: string)
inline Napi::Value BloomInsert(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_bloom) {
        Napi::Error::New(env, "Bloom filter not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: bloomInsert(key: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    g_bloom->insert(info[0].As<Napi::String>().Utf8Value());
    return env.Undefined();
}

// bloomContains(key: string) -> boolean
inline Napi::Value BloomContains(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_bloom) {
        Napi::Error::New(env, "Bloom filter not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: bloomContains(key: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    bool result = g_bloom->contains(info[0].As<Napi::String>().Utf8Value());
    return Napi::Boolean::New(env, result);
}

// bloomClear()
inline Napi::Value BloomClear(const Napi::CallbackInfo& info) {
    if (g_bloom) g_bloom->clear();
    return info.Env().Undefined();
}

// bloomStats() -> { count, bits, hashes, fillRatio }
inline Napi::Value BloomStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_bloom) {
        Napi::Error::New(env, "Bloom filter not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("count",     Napi::Number::New(env, g_bloom->count()));
    result.Set("bits",      Napi::Number::New(env, static_cast<double>(g_bloom->bitSize())));
    result.Set("hashes",    Napi::Number::New(env, g_bloom->hashFuncs()));
    result.Set("fillRatio", Napi::Number::New(env, g_bloom->fillRatio()));
    return result;
}

#endif // DEX_BLOOM_H
