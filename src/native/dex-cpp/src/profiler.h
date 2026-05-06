// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Performance Profiler -- Microsecond-precision timing and stat aggregation
// Hierarchical timer with named scopes, min/max/avg/p99 tracking.
// Used by kernel to measure hot paths and detect regressions.
// ===========================================================================

#ifndef DEX_PROFILER_H
#define DEX_PROFILER_H

#include <napi.h>
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cmath>
#include <mutex>

struct TimerEntry {
    std::string name;
    std::vector<double> samples; // microseconds
    double total;
    uint64_t count;

    TimerEntry() : total(0), count(0) {}

    void record(double us) {
        samples.push_back(us);
        total += us;
        ++count;
        // Keep max 10000 samples to bound memory
        if (samples.size() > 10000) {
            samples.erase(samples.begin(), samples.begin() + 5000);
        }
    }

    double avg() const { return count > 0 ? total / count : 0; }

    double min() const {
        if (samples.empty()) return 0;
        return *std::min_element(samples.begin(), samples.end());
    }

    double max() const {
        if (samples.empty()) return 0;
        return *std::max_element(samples.begin(), samples.end());
    }

    double p99() const {
        if (samples.empty()) return 0;
        std::vector<double> sorted = samples;
        std::sort(sorted.begin(), sorted.end());
        size_t idx = static_cast<size_t>(sorted.size() * 0.99);
        if (idx >= sorted.size()) idx = sorted.size() - 1;
        return sorted[idx];
    }

    double stddev() const {
        if (count < 2) return 0;
        double mean = avg();
        double sumSq = 0;
        for (double s : samples) {
            double diff = s - mean;
            sumSq += diff * diff;
        }
        return std::sqrt(sumSq / (samples.size() - 1));
    }
};

class Profiler {
public:
    void begin(const std::string& name) {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_active[name] = now();
    }

    double end(const std::string& name) {
        std::lock_guard<std::mutex> lock(m_mutex);
        auto it = m_active.find(name);
        if (it == m_active.end()) return 0;
        double elapsed = now() - it->second;
        m_active.erase(it);
        m_timers[name].name = name;
        m_timers[name].record(elapsed);
        return elapsed;
    }

    const TimerEntry* get(const std::string& name) const {
        auto it = m_timers.find(name);
        return it != m_timers.end() ? &it->second : nullptr;
    }

    std::vector<std::string> names() const {
        std::vector<std::string> result;
        for (const auto& kv : m_timers) result.push_back(kv.first);
        return result;
    }

    void clear() {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_timers.clear();
        m_active.clear();
    }

    size_t timerCount() const { return m_timers.size(); }

private:
    static double now() {
        return static_cast<double>(
            std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now().time_since_epoch()
            ).count()
        );
    }

    std::unordered_map<std::string, TimerEntry> m_timers;
    std::unordered_map<std::string, double> m_active;
    std::mutex m_mutex;
};

// Singleton
static Profiler* g_profiler = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// profilerCreate()
inline Napi::Value ProfilerCreate(const Napi::CallbackInfo& info) {
    delete g_profiler;
    g_profiler = new Profiler();
    return Napi::Boolean::New(info.Env(), true);
}

// profilerBegin(name: string)
inline Napi::Value ProfilerBegin(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_profiler) {
        Napi::Error::New(env, "Profiler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: profilerBegin(name)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    g_profiler->begin(info[0].As<Napi::String>().Utf8Value());
    return env.Undefined();
}

// profilerEnd(name: string) -> elapsedUs
inline Napi::Value ProfilerEnd(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_profiler) {
        Napi::Error::New(env, "Profiler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: profilerEnd(name)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    double elapsed = g_profiler->end(info[0].As<Napi::String>().Utf8Value());
    return Napi::Number::New(env, elapsed);
}

// profilerGet(name: string) -> { count, total, avg, min, max, p99, stddev } | null
inline Napi::Value ProfilerGet(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_profiler) {
        Napi::Error::New(env, "Profiler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: profilerGet(name)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    const TimerEntry* entry = g_profiler->get(info[0].As<Napi::String>().Utf8Value());
    if (!entry) return env.Null();
    Napi::Object result = Napi::Object::New(env);
    result.Set("count",  Napi::Number::New(env, static_cast<double>(entry->count)));
    result.Set("total",  Napi::Number::New(env, entry->total));
    result.Set("avg",    Napi::Number::New(env, entry->avg()));
    result.Set("min",    Napi::Number::New(env, entry->min()));
    result.Set("max",    Napi::Number::New(env, entry->max()));
    result.Set("p99",    Napi::Number::New(env, entry->p99()));
    result.Set("stddev", Napi::Number::New(env, entry->stddev()));
    return result;
}

// profilerNames() -> string[]
inline Napi::Value ProfilerNames(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_profiler) {
        Napi::Error::New(env, "Profiler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto names = g_profiler->names();
    Napi::Array result = Napi::Array::New(env, names.size());
    for (size_t i = 0; i < names.size(); ++i) {
        result[i] = Napi::String::New(env, names[i]);
    }
    return result;
}

// profilerClear()
inline Napi::Value ProfilerClear(const Napi::CallbackInfo& info) {
    if (g_profiler) g_profiler->clear();
    return info.Env().Undefined();
}

// profilerDestroy()
inline Napi::Value ProfilerDestroy(const Napi::CallbackInfo& info) {
    delete g_profiler;
    g_profiler = nullptr;
    return info.Env().Undefined();
}

#endif // DEX_PROFILER_H
