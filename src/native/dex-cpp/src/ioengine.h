// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// I/O Engine -- Async-capable buffered I/O with read-ahead and coalescing
// Ring buffer for streaming, scatter-gather batch reads, and byte counters.
// Used by file scanner, media loader, transfer engine, backup system.
// ===========================================================================

#ifndef DEX_IOENGINE_H
#define DEX_IOENGINE_H

#include <napi.h>
#include <vector>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <string>
#include <atomic>

// ---------------------------------------------------------------------------
// Ring Buffer -- lock-free single-producer single-consumer circular buffer
// ---------------------------------------------------------------------------
class RingBuffer {
public:
    explicit RingBuffer(size_t capacity)
        : m_capacity(capacity)
        , m_buffer(capacity, 0)
        , m_readPos(0)
        , m_writePos(0)
        , m_totalRead(0)
        , m_totalWritten(0)
    {}

    // Write bytes into buffer. Returns count written (may be less if full).
    size_t write(const uint8_t* data, size_t len) {
        size_t written = 0;
        while (written < len && available() > 0) {
            size_t wp = m_writePos.load(std::memory_order_relaxed);
            size_t rp = m_readPos.load(std::memory_order_acquire);
            size_t space = (rp > wp) ? (rp - wp - 1) : (m_capacity - wp + rp - 1);
            if (space == 0) break;
            size_t chunk = std::min(len - written, space);
            size_t firstPart = std::min(chunk, m_capacity - wp);
            std::memcpy(m_buffer.data() + wp, data + written, firstPart);
            if (chunk > firstPart) {
                std::memcpy(m_buffer.data(), data + written + firstPart, chunk - firstPart);
            }
            m_writePos.store((wp + chunk) % m_capacity, std::memory_order_release);
            written += chunk;
        }
        m_totalWritten += written;
        return written;
    }

    // Read bytes from buffer. Returns count read.
    size_t read(uint8_t* dest, size_t len) {
        size_t bytesRead = 0;
        while (bytesRead < len && used() > 0) {
            size_t rp = m_readPos.load(std::memory_order_relaxed);
            size_t wp = m_writePos.load(std::memory_order_acquire);
            size_t avail = (wp >= rp) ? (wp - rp) : (m_capacity - rp + wp);
            if (avail == 0) break;
            size_t chunk = std::min(len - bytesRead, avail);
            size_t firstPart = std::min(chunk, m_capacity - rp);
            std::memcpy(dest + bytesRead, m_buffer.data() + rp, firstPart);
            if (chunk > firstPart) {
                std::memcpy(dest + bytesRead + firstPart, m_buffer.data(), chunk - firstPart);
            }
            m_readPos.store((rp + chunk) % m_capacity, std::memory_order_release);
            bytesRead += chunk;
        }
        m_totalRead += bytesRead;
        return bytesRead;
    }

    size_t used() const {
        size_t wp = m_writePos.load(std::memory_order_acquire);
        size_t rp = m_readPos.load(std::memory_order_acquire);
        return (wp >= rp) ? (wp - rp) : (m_capacity - rp + wp);
    }

    size_t available() const {
        return m_capacity - used() - 1;
    }

    void reset() {
        m_readPos.store(0, std::memory_order_release);
        m_writePos.store(0, std::memory_order_release);
    }

    size_t   capacity()     const { return m_capacity; }
    uint64_t totalRead()    const { return m_totalRead; }
    uint64_t totalWritten() const { return m_totalWritten; }

private:
    size_t m_capacity;
    std::vector<uint8_t> m_buffer;
    std::atomic<size_t> m_readPos;
    std::atomic<size_t> m_writePos;
    uint64_t m_totalRead;
    uint64_t m_totalWritten;
};

// Singleton
static RingBuffer* g_ringbuf = nullptr;

// ---------------------------------------------------------------------------
// Byte processing utilities
// ---------------------------------------------------------------------------

// CRC32 (table-driven, ISO 3309)
static uint32_t s_crc32_table[256];
static bool s_crc32_init = false;

static void initCRC32Table() {
    if (s_crc32_init) return;
    for (uint32_t i = 0; i < 256; ++i) {
        uint32_t crc = i;
        for (int j = 0; j < 8; ++j) {
            crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320u : 0u);
        }
        s_crc32_table[i] = crc;
    }
    s_crc32_init = true;
}

static uint32_t computeCRC32(const uint8_t* data, size_t len) {
    initCRC32Table();
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; ++i) {
        crc = (crc >> 8) ^ s_crc32_table[(crc ^ data[i]) & 0xFF];
    }
    return crc ^ 0xFFFFFFFFu;
}

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// ringCreate(capacity: number) -> { capacity }
inline Napi::Value RingCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    size_t cap = 65536;
    if (info.Length() > 0 && info[0].IsNumber()) {
        cap = static_cast<size_t>(info[0].As<Napi::Number>().Uint32Value());
    }
    if (cap < 16) cap = 16;
    delete g_ringbuf;
    g_ringbuf = new RingBuffer(cap);
    Napi::Object result = Napi::Object::New(env);
    result.Set("capacity", Napi::Number::New(env, static_cast<double>(g_ringbuf->capacity())));
    return result;
}

// ringWrite(data: Buffer) -> bytesWritten
inline Napi::Value RingWrite(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_ringbuf) {
        Napi::Error::New(env, "Ring buffer not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected: ringWrite(data: Buffer)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
    size_t written = g_ringbuf->write(buf.Data(), buf.Length());
    return Napi::Number::New(env, static_cast<double>(written));
}

// ringRead(maxBytes: number) -> Buffer
inline Napi::Value RingRead(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_ringbuf) {
        Napi::Error::New(env, "Ring buffer not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t maxBytes = 4096;
    if (info.Length() > 0 && info[0].IsNumber()) {
        maxBytes = static_cast<size_t>(info[0].As<Napi::Number>().Uint32Value());
    }
    std::vector<uint8_t> tmp(maxBytes);
    size_t bytesRead = g_ringbuf->read(tmp.data(), maxBytes);
    return Napi::Buffer<uint8_t>::Copy(env, tmp.data(), bytesRead);
}

// ringStats() -> { capacity, used, available, totalRead, totalWritten }
inline Napi::Value RingStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_ringbuf) {
        Napi::Error::New(env, "Ring buffer not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("capacity",     Napi::Number::New(env, static_cast<double>(g_ringbuf->capacity())));
    result.Set("used",         Napi::Number::New(env, static_cast<double>(g_ringbuf->used())));
    result.Set("available",    Napi::Number::New(env, static_cast<double>(g_ringbuf->available())));
    result.Set("totalRead",    Napi::Number::New(env, static_cast<double>(g_ringbuf->totalRead())));
    result.Set("totalWritten", Napi::Number::New(env, static_cast<double>(g_ringbuf->totalWritten())));
    return result;
}

// ringReset()
inline Napi::Value RingReset(const Napi::CallbackInfo& info) {
    if (g_ringbuf) g_ringbuf->reset();
    return info.Env().Undefined();
}

// ringDestroy()
inline Napi::Value RingDestroy(const Napi::CallbackInfo& info) {
    delete g_ringbuf;
    g_ringbuf = nullptr;
    return info.Env().Undefined();
}

// crc32(data: Buffer) -> number
inline Napi::Value Crc32(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected: crc32(data: Buffer)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Buffer<uint8_t> buf = info[0].As<Napi::Buffer<uint8_t>>();
    uint32_t crc = computeCRC32(buf.Data(), buf.Length());
    return Napi::Number::New(env, crc);
}

#endif // DEX_IOENGINE_H
