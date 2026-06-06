// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Lock-free SPSC ring buffer -- real-time thread handoff primitive.
//
// Single-producer / single-consumer. push() and pop() never allocate, never
// lock, and never perform I/O, so they are safe to call from the audio callback
// or the video frame loop. The backing store is allocated ONCE in the ctor and
// never resized. Capacity is rounded up to a power of two so index wrap is a
// single AND. Acquire/release ordering gives correct cross-thread visibility
// without a mutex.
// ===========================================================================

#ifndef DEX_RINGBUFFER_H
#define DEX_RINGBUFFER_H

#include <atomic>
#include <cstddef>
#include <vector>

template <typename T>
class SpscRingBuffer {
public:
    explicit SpscRingBuffer(std::size_t capacity)
        : mask_(roundUpPow2(capacity) - 1), buf_(mask_ + 1) {}

    // Producer thread only. Returns false when full (never overwrites).
    bool push(const T& item) noexcept {
        const std::size_t head = head_.load(std::memory_order_relaxed);
        const std::size_t next = (head + 1) & mask_;
        if (next == tail_.load(std::memory_order_acquire)) return false; // full
        buf_[head] = item;
        head_.store(next, std::memory_order_release);
        return true;
    }

    // Producer thread only. Writes up to n items; returns the count written.
    std::size_t pushBulk(const T* src, std::size_t n) noexcept {
        std::size_t written = 0;
        while (written < n && push(src[written])) ++written;
        return written;
    }

    // Consumer thread only. Returns false when empty.
    bool pop(T& out) noexcept {
        const std::size_t tail = tail_.load(std::memory_order_relaxed);
        if (tail == head_.load(std::memory_order_acquire)) return false; // empty
        out = buf_[tail];
        tail_.store((tail + 1) & mask_, std::memory_order_release);
        return true;
    }

    // Consumer thread only. Reads up to n items; returns the count read.
    std::size_t popBulk(T* dst, std::size_t n) noexcept {
        std::size_t read = 0;
        while (read < n && pop(dst[read])) ++read;
        return read;
    }

    // Usable capacity (one slot reserved to disambiguate full/empty).
    std::size_t capacity() const noexcept { return mask_; }

    bool empty() const noexcept {
        return head_.load(std::memory_order_acquire) == tail_.load(std::memory_order_acquire);
    }

private:
    static std::size_t roundUpPow2(std::size_t v) noexcept {
        std::size_t p = 1;
        while (p < v) p <<= 1;
        return p < 2 ? 2 : p;
    }

    const std::size_t mask_;
    std::vector<T> buf_;                       // allocated once; never resized
    alignas(64) std::atomic<std::size_t> head_{0}; // producer writes (own cache line)
    alignas(64) std::atomic<std::size_t> tail_{0}; // consumer writes (own cache line)
};

#endif // DEX_RINGBUFFER_H
