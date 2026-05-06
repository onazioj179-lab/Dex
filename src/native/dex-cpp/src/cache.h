// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// LRU Cache -- Constant-time O(1) get/put with max capacity eviction
// Doubly-linked list + hash map for O(1) access, insert, and eviction.
// Used by file metadata cache, thumbnail cache, search result cache.
// ===========================================================================

#ifndef DEX_CACHE_H
#define DEX_CACHE_H

#include <napi.h>
#include <string>
#include <unordered_map>
#include <cstdint>

class LRUCache {
public:
    explicit LRUCache(uint32_t capacity)
        : m_capacity(capacity < 1 ? 64 : capacity)
        , m_head(nullptr)
        , m_tail(nullptr)
        , m_hits(0)
        , m_misses(0)
    {}

    ~LRUCache() {
        Node* cur = m_head;
        while (cur) {
            Node* next = cur->next;
            delete cur;
            cur = next;
        }
    }

    bool get(const std::string& key, std::string& value) {
        auto it = m_map.find(key);
        if (it == m_map.end()) {
            ++m_misses;
            return false;
        }
        ++m_hits;
        moveToFront(it->second);
        value = it->second->value;
        return true;
    }

    void put(const std::string& key, const std::string& value) {
        auto it = m_map.find(key);
        if (it != m_map.end()) {
            it->second->value = value;
            moveToFront(it->second);
            return;
        }
        // Evict if at capacity
        if (m_map.size() >= m_capacity) {
            evictLRU();
        }
        Node* node = new Node{key, value, nullptr, m_head};
        if (m_head) m_head->prev = node;
        m_head = node;
        if (!m_tail) m_tail = node;
        m_map[key] = node;
    }

    bool remove(const std::string& key) {
        auto it = m_map.find(key);
        if (it == m_map.end()) return false;
        detach(it->second);
        delete it->second;
        m_map.erase(it);
        return true;
    }

    void clear() {
        Node* cur = m_head;
        while (cur) {
            Node* next = cur->next;
            delete cur;
            cur = next;
        }
        m_head = nullptr;
        m_tail = nullptr;
        m_map.clear();
        m_hits = 0;
        m_misses = 0;
    }

    uint32_t size()     const { return static_cast<uint32_t>(m_map.size()); }
    uint32_t capacity() const { return m_capacity; }
    uint64_t hits()     const { return m_hits; }
    uint64_t misses()   const { return m_misses; }

    double hitRate() const {
        uint64_t total = m_hits + m_misses;
        if (total == 0) return 0.0;
        return static_cast<double>(m_hits) / static_cast<double>(total);
    }

private:
    struct Node {
        std::string key;
        std::string value;
        Node* prev;
        Node* next;
    };

    void moveToFront(Node* node) {
        if (node == m_head) return;
        detach(node);
        node->prev = nullptr;
        node->next = m_head;
        if (m_head) m_head->prev = node;
        m_head = node;
        if (!m_tail) m_tail = node;
    }

    void detach(Node* node) {
        if (node->prev) node->prev->next = node->next;
        else m_head = node->next;
        if (node->next) node->next->prev = node->prev;
        else m_tail = node->prev;
        node->prev = nullptr;
        node->next = nullptr;
    }

    void evictLRU() {
        if (!m_tail) return;
        Node* victim = m_tail;
        m_map.erase(victim->key);
        detach(victim);
        delete victim;
    }

    uint32_t m_capacity;
    Node* m_head;
    Node* m_tail;
    std::unordered_map<std::string, Node*> m_map;
    uint64_t m_hits;
    uint64_t m_misses;
};

// Singleton
static LRUCache* g_cache = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// cacheCreate(capacity: number) -> { capacity }
inline Napi::Value CacheCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint32_t cap = 1024;
    if (info.Length() > 0 && info[0].IsNumber()) {
        cap = info[0].As<Napi::Number>().Uint32Value();
    }
    delete g_cache;
    g_cache = new LRUCache(cap);
    Napi::Object result = Napi::Object::New(env);
    result.Set("capacity", Napi::Number::New(env, g_cache->capacity()));
    return result;
}

// cacheGet(key: string) -> string | null
inline Napi::Value CacheGet(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_cache) {
        Napi::Error::New(env, "Cache not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: cacheGet(key: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string value;
    if (g_cache->get(info[0].As<Napi::String>().Utf8Value(), value)) {
        return Napi::String::New(env, value);
    }
    return env.Null();
}

// cachePut(key: string, value: string)
inline Napi::Value CachePut(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_cache) {
        Napi::Error::New(env, "Cache not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected: cachePut(key, value)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    g_cache->put(
        info[0].As<Napi::String>().Utf8Value(),
        info[1].As<Napi::String>().Utf8Value()
    );
    return env.Undefined();
}

// cacheRemove(key: string) -> boolean
inline Napi::Value CacheRemove(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_cache) {
        Napi::Error::New(env, "Cache not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected: cacheRemove(key)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    bool removed = g_cache->remove(info[0].As<Napi::String>().Utf8Value());
    return Napi::Boolean::New(env, removed);
}

// cacheClear()
inline Napi::Value CacheClear(const Napi::CallbackInfo& info) {
    if (g_cache) g_cache->clear();
    return info.Env().Undefined();
}

// cacheStats() -> { size, capacity, hits, misses, hitRate }
inline Napi::Value CacheStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_cache) {
        Napi::Error::New(env, "Cache not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("size",     Napi::Number::New(env, g_cache->size()));
    result.Set("capacity", Napi::Number::New(env, g_cache->capacity()));
    result.Set("hits",     Napi::Number::New(env, static_cast<double>(g_cache->hits())));
    result.Set("misses",   Napi::Number::New(env, static_cast<double>(g_cache->misses())));
    result.Set("hitRate",  Napi::Number::New(env, g_cache->hitRate()));
    return result;
}

#endif // DEX_CACHE_H
