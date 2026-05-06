// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Memory Pool -- Slab allocator for fixed-size object recycling
// Eliminates malloc/free overhead for hot-path allocations.
// Pre-allocates slabs and hands out fixed-size blocks from a free list.
// Used by spatial index, particle systems, event queues.
// ===========================================================================

#ifndef DEX_MEMPOOL_H
#define DEX_MEMPOOL_H

#include <napi.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <atomic>

class MemPool {
public:
    MemPool(size_t blockSize, size_t blocksPerSlab)
        : m_blockSize(blockSize < 8 ? 8 : blockSize)
        , m_blocksPerSlab(blocksPerSlab == 0 ? 256 : blocksPerSlab)
        , m_freeHead(nullptr)
        , m_allocated(0)
        , m_recycled(0)
        , m_totalBlocks(0)
    {}

    ~MemPool() {
        for (void* slab : m_slabs) {
            std::free(slab);
        }
    }

    void* allocate() {
        if (!m_freeHead) {
            expandSlab();
        }
        FreeNode* node = m_freeHead;
        m_freeHead = node->next;
        ++m_allocated;
        return static_cast<void*>(node);
    }

    void deallocate(void* ptr) {
        if (!ptr) return;
        FreeNode* node = static_cast<FreeNode*>(ptr);
        node->next = m_freeHead;
        m_freeHead = node;
        ++m_recycled;
    }

    void reset() {
        // Rebuild free list from all slabs
        m_freeHead = nullptr;
        for (void* slab : m_slabs) {
            char* base = static_cast<char*>(slab);
            for (size_t i = 0; i < m_blocksPerSlab; ++i) {
                FreeNode* node = reinterpret_cast<FreeNode*>(base + i * m_blockSize);
                node->next = m_freeHead;
                m_freeHead = node;
            }
        }
        m_allocated = 0;
        m_recycled = 0;
    }

    size_t blockSize()     const { return m_blockSize; }
    size_t totalBlocks()   const { return m_totalBlocks; }
    uint64_t allocated()   const { return m_allocated; }
    uint64_t recycled()    const { return m_recycled; }
    size_t slabCount()     const { return m_slabs.size(); }

    double utilizationRatio() const {
        if (m_totalBlocks == 0) return 0.0;
        // Count free blocks
        size_t freeCount = 0;
        FreeNode* cur = m_freeHead;
        while (cur) { ++freeCount; cur = cur->next; }
        return 1.0 - static_cast<double>(freeCount) / static_cast<double>(m_totalBlocks);
    }

private:
    struct FreeNode {
        FreeNode* next;
    };

    void expandSlab() {
        void* slab = std::malloc(m_blockSize * m_blocksPerSlab);
        if (!slab) return;
        std::memset(slab, 0, m_blockSize * m_blocksPerSlab);
        m_slabs.push_back(slab);
        // Build free list for this slab
        char* base = static_cast<char*>(slab);
        for (size_t i = 0; i < m_blocksPerSlab; ++i) {
            FreeNode* node = reinterpret_cast<FreeNode*>(base + i * m_blockSize);
            node->next = m_freeHead;
            m_freeHead = node;
        }
        m_totalBlocks += m_blocksPerSlab;
    }

    size_t m_blockSize;
    size_t m_blocksPerSlab;
    FreeNode* m_freeHead;
    std::vector<void*> m_slabs;
    uint64_t m_allocated;
    uint64_t m_recycled;
    size_t m_totalBlocks;
};

// Singleton
static MemPool* g_mempool = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// mempoolCreate(blockSize: number, blocksPerSlab?: number) -> { blockSize, blocksPerSlab }
inline Napi::Value MempoolCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected: mempoolCreate(blockSize, [blocksPerSlab])").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    size_t blockSize = static_cast<size_t>(info[0].As<Napi::Number>().Uint32Value());
    size_t blocksPerSlab = 256;
    if (info.Length() > 1 && info[1].IsNumber()) {
        blocksPerSlab = static_cast<size_t>(info[1].As<Napi::Number>().Uint32Value());
    }
    delete g_mempool;
    g_mempool = new MemPool(blockSize, blocksPerSlab);
    Napi::Object result = Napi::Object::New(env);
    result.Set("blockSize",     Napi::Number::New(env, static_cast<double>(g_mempool->blockSize())));
    result.Set("blocksPerSlab", Napi::Number::New(env, static_cast<double>(blocksPerSlab)));
    return result;
}

// mempoolStats() -> { blockSize, totalBlocks, allocated, recycled, slabs, utilization }
inline Napi::Value MempoolStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mempool) {
        Napi::Error::New(env, "Memory pool not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("blockSize",   Napi::Number::New(env, static_cast<double>(g_mempool->blockSize())));
    result.Set("totalBlocks", Napi::Number::New(env, static_cast<double>(g_mempool->totalBlocks())));
    result.Set("allocated",   Napi::Number::New(env, static_cast<double>(g_mempool->allocated())));
    result.Set("recycled",    Napi::Number::New(env, static_cast<double>(g_mempool->recycled())));
    result.Set("slabs",       Napi::Number::New(env, static_cast<double>(g_mempool->slabCount())));
    result.Set("utilization", Napi::Number::New(env, g_mempool->utilizationRatio()));
    return result;
}

// mempoolReset()
inline Napi::Value MempoolReset(const Napi::CallbackInfo& info) {
    if (g_mempool) g_mempool->reset();
    return info.Env().Undefined();
}

// mempoolDestroy()
inline Napi::Value MempoolDestroy(const Napi::CallbackInfo& info) {
    delete g_mempool;
    g_mempool = nullptr;
    return info.Env().Undefined();
}

#endif // DEX_MEMPOOL_H
