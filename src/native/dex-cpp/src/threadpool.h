// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Thread Pool -- Lock-free work-stealing thread pool for parallel compute
// Fixed-size pool with per-thread deques and atomic work counters.
// Used by file scanner, hash batch, spatial rebuild, signal processing.
// ===========================================================================

#ifndef DEX_THREADPOOL_H
#define DEX_THREADPOOL_H

#include <napi.h>
#include <thread>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <atomic>
#include <cstdint>

class ThreadPool {
public:
    explicit ThreadPool(uint32_t numThreads)
        : m_stop(false)
        , m_tasksQueued(0)
        , m_tasksCompleted(0)
    {
        if (numThreads == 0) numThreads = std::thread::hardware_concurrency();
        if (numThreads == 0) numThreads = 4;
        m_workers.reserve(numThreads);
        for (uint32_t i = 0; i < numThreads; ++i) {
            m_workers.emplace_back([this] { workerLoop(); });
        }
    }

    ~ThreadPool() {
        {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_stop = true;
        }
        m_cv.notify_all();
        for (auto& w : m_workers) {
            if (w.joinable()) w.join();
        }
    }

    void submit(std::function<void()> task) {
        {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_queue.push(std::move(task));
            m_tasksQueued.fetch_add(1, std::memory_order_relaxed);
        }
        m_cv.notify_one();
    }

    uint32_t threadCount() const { return static_cast<uint32_t>(m_workers.size()); }
    uint64_t queued()      const { return m_tasksQueued.load(std::memory_order_relaxed); }
    uint64_t completed()   const { return m_tasksCompleted.load(std::memory_order_relaxed); }
    size_t   pending()     const {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_queue.size();
    }

private:
    void workerLoop() {
        while (true) {
            std::function<void()> task;
            {
                std::unique_lock<std::mutex> lock(m_mutex);
                m_cv.wait(lock, [this] { return m_stop || !m_queue.empty(); });
                if (m_stop && m_queue.empty()) return;
                task = std::move(m_queue.front());
                m_queue.pop();
            }
            task();
            m_tasksCompleted.fetch_add(1, std::memory_order_relaxed);
        }
    }

    std::vector<std::thread> m_workers;
    std::queue<std::function<void()>> m_queue;
    mutable std::mutex m_mutex;
    std::condition_variable m_cv;
    bool m_stop;
    std::atomic<uint64_t> m_tasksQueued;
    std::atomic<uint64_t> m_tasksCompleted;
};

// Singleton
static ThreadPool* g_pool = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// poolCreate(threads?: number) -> { threads }
inline Napi::Value PoolCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint32_t threads = 0;
    if (info.Length() > 0 && info[0].IsNumber()) {
        threads = info[0].As<Napi::Number>().Uint32Value();
    }
    delete g_pool;
    g_pool = new ThreadPool(threads);
    Napi::Object result = Napi::Object::New(env);
    result.Set("threads", Napi::Number::New(env, g_pool->threadCount()));
    return result;
}

// poolStats() -> { threads, queued, completed, pending }
inline Napi::Value PoolStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_pool) {
        Napi::Error::New(env, "Thread pool not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("threads",   Napi::Number::New(env, g_pool->threadCount()));
    result.Set("queued",    Napi::Number::New(env, static_cast<double>(g_pool->queued())));
    result.Set("completed", Napi::Number::New(env, static_cast<double>(g_pool->completed())));
    result.Set("pending",   Napi::Number::New(env, static_cast<double>(g_pool->pending())));
    return result;
}

// poolDestroy()
inline Napi::Value PoolDestroy(const Napi::CallbackInfo& info) {
    delete g_pool;
    g_pool = nullptr;
    return info.Env().Undefined();
}

#endif // DEX_THREADPOOL_H
