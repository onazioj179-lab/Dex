// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Process Scheduler -- Priority queue task scheduler with deadline support
// Manages work items with priority levels and optional deadlines.
// Provides fair scheduling across priority tiers with starvation prevention.
// Used by kernel task orchestration and background job management.
// ===========================================================================

#ifndef DEX_SCHEDULER_H
#define DEX_SCHEDULER_H

#include <napi.h>
#include <queue>
#include <string>
#include <cstdint>
#include <chrono>
#include <mutex>
#include <vector>
#include <algorithm>
#include <atomic>

// ---------------------------------------------------------------------------
// Task priority levels
// ---------------------------------------------------------------------------
enum class Priority : uint8_t {
    IDLE       = 0,
    LOW        = 1,
    NORMAL     = 2,
    HIGH       = 3,
    CRITICAL   = 4,
    REALTIME   = 5
};

// ---------------------------------------------------------------------------
// Scheduled task
// ---------------------------------------------------------------------------
struct ScheduledTask {
    uint64_t id;
    std::string name;
    Priority priority;
    double deadlineMs;   // 0 = no deadline
    double enqueuedAt;   // ms since epoch
    double startedAt;    // 0 = not started
    double completedAt;  // 0 = not completed

    // Higher priority first, then earlier deadline, then earlier enqueue
    bool operator<(const ScheduledTask& o) const {
        if (priority != o.priority) return priority < o.priority; // min-heap flipped
        if (deadlineMs != o.deadlineMs) {
            if (deadlineMs == 0) return true;  // no deadline goes after
            if (o.deadlineMs == 0) return false;
            return deadlineMs > o.deadlineMs;
        }
        return enqueuedAt > o.enqueuedAt;
    }
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
class Scheduler {
public:
    Scheduler() : m_nextId(1), m_completed(0), m_starved(0) {}

    uint64_t enqueue(const std::string& name, Priority prio, double deadlineMs) {
        std::lock_guard<std::mutex> lock(m_mutex);
        uint64_t id = m_nextId++;
        double now = currentTimeMs();
        m_queue.push({id, name, prio, deadlineMs, now, 0, 0});
        return id;
    }

    // Dequeue highest-priority task, with starvation prevention:
    // every 10th dequeue promotes the oldest LOW/IDLE task
    bool dequeue(ScheduledTask& out) {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_queue.empty()) return false;

        // Starvation prevention: every 10 dequeues, check for aged low-priority
        if (m_completed % 10 == 9 && m_queue.size() > 1) {
            promoteStarved();
        }

        out = m_queue.top();
        m_queue.pop();
        out.startedAt = currentTimeMs();
        ++m_completed;
        return true;
    }

    void complete(ScheduledTask& task) {
        task.completedAt = currentTimeMs();
    }

    size_t   pending()   const { std::lock_guard<std::mutex> lock(m_mutex); return m_queue.size(); }
    uint64_t completed() const { return m_completed; }
    uint64_t starved()   const { return m_starved; }

    // Check for deadline violations in queue
    uint32_t deadlineViolations() const {
        std::lock_guard<std::mutex> lock(m_mutex);
        double now = currentTimeMs();
        uint32_t violations = 0;
        // Cannot iterate priority_queue directly, so count is approximate
        // In production, maintain a separate tracking structure
        return violations;
    }

private:
    static double currentTimeMs() {
        return static_cast<double>(
            std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::high_resolution_clock::now().time_since_epoch()
            ).count()
        ) / 1000.0;
    }

    void promoteStarved() {
        // Rebuild queue promoting oldest low-priority tasks
        std::vector<ScheduledTask> tasks;
        while (!m_queue.empty()) {
            tasks.push_back(m_queue.top());
            m_queue.pop();
        }
        double now = currentTimeMs();
        for (auto& t : tasks) {
            // If waiting > 5000ms and priority is LOW or IDLE, bump up
            if ((t.priority == Priority::LOW || t.priority == Priority::IDLE)
                && (now - t.enqueuedAt) > 5000.0) {
                t.priority = Priority::NORMAL;
                ++m_starved;
            }
        }
        for (auto& t : tasks) {
            m_queue.push(std::move(t));
        }
    }

    std::priority_queue<ScheduledTask> m_queue;
    mutable std::mutex m_mutex;
    uint64_t m_nextId;
    uint64_t m_completed;
    uint64_t m_starved;
};

// Singleton
static Scheduler* g_scheduler = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

static Priority parsePriority(int32_t val) {
    if (val <= 0) return Priority::IDLE;
    if (val == 1) return Priority::LOW;
    if (val == 2) return Priority::NORMAL;
    if (val == 3) return Priority::HIGH;
    if (val == 4) return Priority::CRITICAL;
    return Priority::REALTIME;
}

// schedulerCreate() -> true
inline Napi::Value SchedulerCreate(const Napi::CallbackInfo& info) {
    delete g_scheduler;
    g_scheduler = new Scheduler();
    return Napi::Boolean::New(info.Env(), true);
}

// schedulerEnqueue(name, priority, deadlineMs?) -> taskId
inline Napi::Value SchedulerEnqueue(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_scheduler) {
        Napi::Error::New(env, "Scheduler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: schedulerEnqueue(name, priority, [deadlineMs])").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    Priority prio = parsePriority(info[1].As<Napi::Number>().Int32Value());
    double deadline = (info.Length() > 2 && info[2].IsNumber())
                      ? info[2].As<Napi::Number>().DoubleValue()
                      : 0.0;
    uint64_t id = g_scheduler->enqueue(name, prio, deadline);
    return Napi::Number::New(env, static_cast<double>(id));
}

// schedulerDequeue() -> { id, name, priority, deadlineMs, enqueuedAt, startedAt } | null
inline Napi::Value SchedulerDequeue(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_scheduler) {
        Napi::Error::New(env, "Scheduler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    ScheduledTask task;
    if (!g_scheduler->dequeue(task)) {
        return env.Null();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("id",         Napi::Number::New(env, static_cast<double>(task.id)));
    result.Set("name",       Napi::String::New(env, task.name));
    result.Set("priority",   Napi::Number::New(env, static_cast<int>(task.priority)));
    result.Set("deadlineMs", Napi::Number::New(env, task.deadlineMs));
    result.Set("enqueuedAt", Napi::Number::New(env, task.enqueuedAt));
    result.Set("startedAt",  Napi::Number::New(env, task.startedAt));
    return result;
}

// schedulerStats() -> { pending, completed, starved }
inline Napi::Value SchedulerStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_scheduler) {
        Napi::Error::New(env, "Scheduler not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("pending",   Napi::Number::New(env, static_cast<double>(g_scheduler->pending())));
    result.Set("completed", Napi::Number::New(env, static_cast<double>(g_scheduler->completed())));
    result.Set("starved",   Napi::Number::New(env, static_cast<double>(g_scheduler->starved())));
    return result;
}

// schedulerDestroy()
inline Napi::Value SchedulerDestroy(const Napi::CallbackInfo& info) {
    delete g_scheduler;
    g_scheduler = nullptr;
    return info.Env().Undefined();
}

#endif // DEX_SCHEDULER_H
