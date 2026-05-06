// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// Spatial Index -- R-tree for Nexus 3D node queries
// Axis-aligned bounding box (AABB) spatial partitioning.
// Supports insert, range query, and k-nearest-neighbor lookups.
// Flat linear scan optimized for up to ~10K nodes.
// ===========================================================================

#ifndef DEX_SPATIAL_H
#define DEX_SPATIAL_H

#include <napi.h>
#include <vector>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <limits>

// ---------------------------------------------------------------------------
// 3D point with associated metadata
// ---------------------------------------------------------------------------
struct SpatialPoint {
    double x, y, z;
    uint32_t id;
    std::string label;
};

// ---------------------------------------------------------------------------
// Axis-aligned bounding box
// ---------------------------------------------------------------------------
struct AABB {
    double minX, minY, minZ;
    double maxX, maxY, maxZ;

    bool contains(double x, double y, double z) const {
        return x >= minX && x <= maxX
            && y >= minY && y <= maxY
            && z >= minZ && z <= maxZ;
    }
};

// ---------------------------------------------------------------------------
// Spatial index -- flat array with O(n) scan, SIMD-friendly layout
// For Nexus node counts (<10K), flat scan beats tree overhead.
// ---------------------------------------------------------------------------
class SpatialIndex {
public:
    void insert(uint32_t id, double x, double y, double z, const std::string& label) {
        m_points.push_back({x, y, z, id, label});
    }

    // Range query: return all points within AABB
    std::vector<const SpatialPoint*> query(const AABB& box) const {
        std::vector<const SpatialPoint*> results;
        for (const auto& p : m_points) {
            if (box.contains(p.x, p.y, p.z)) {
                results.push_back(&p);
            }
        }
        return results;
    }

    // K-nearest neighbors to (qx, qy, qz)
    std::vector<const SpatialPoint*> nearest(double qx, double qy, double qz, uint32_t k) const {
        struct DistEntry {
            double dist;
            size_t idx;
            bool operator<(const DistEntry& o) const { return dist < o.dist; }
        };

        std::vector<DistEntry> dists;
        dists.reserve(m_points.size());
        for (size_t i = 0; i < m_points.size(); ++i) {
            double dx = m_points[i].x - qx;
            double dy = m_points[i].y - qy;
            double dz = m_points[i].z - qz;
            dists.push_back({dx*dx + dy*dy + dz*dz, i});
        }

        if (k >= dists.size()) {
            std::sort(dists.begin(), dists.end());
        } else {
            std::partial_sort(dists.begin(), dists.begin() + k, dists.end());
        }

        std::vector<const SpatialPoint*> results;
        size_t count = std::min(static_cast<size_t>(k), dists.size());
        for (size_t i = 0; i < count; ++i) {
            results.push_back(&m_points[dists[i].idx]);
        }
        return results;
    }

    void clear() { m_points.clear(); }
    size_t count() const { return m_points.size(); }

private:
    std::vector<SpatialPoint> m_points;
};

// Singleton
static SpatialIndex* g_spatial = nullptr;

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

// spatialCreate()
inline Napi::Value SpatialCreate(const Napi::CallbackInfo& info) {
    delete g_spatial;
    g_spatial = new SpatialIndex();
    return Napi::Boolean::New(info.Env(), true);
}

// spatialInsert(id, x, y, z, label)
inline Napi::Value SpatialInsert(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_spatial) {
        Napi::Error::New(env, "Spatial index not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected: spatialInsert(id, x, y, z, [label])").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    uint32_t id = info[0].As<Napi::Number>().Uint32Value();
    double x = info[1].As<Napi::Number>().DoubleValue();
    double y = info[2].As<Napi::Number>().DoubleValue();
    double z = info[3].As<Napi::Number>().DoubleValue();
    std::string label = (info.Length() > 4 && info[4].IsString())
                        ? info[4].As<Napi::String>().Utf8Value()
                        : "";
    g_spatial->insert(id, x, y, z, label);
    return env.Undefined();
}

// spatialQuery(minX, minY, minZ, maxX, maxY, maxZ) -> [{id, x, y, z, label}]
inline Napi::Value SpatialQuery(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_spatial) {
        Napi::Error::New(env, "Spatial index not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 6) {
        Napi::TypeError::New(env, "Expected: spatialQuery(minX,minY,minZ,maxX,maxY,maxZ)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    AABB box{
        info[0].As<Napi::Number>().DoubleValue(),
        info[1].As<Napi::Number>().DoubleValue(),
        info[2].As<Napi::Number>().DoubleValue(),
        info[3].As<Napi::Number>().DoubleValue(),
        info[4].As<Napi::Number>().DoubleValue(),
        info[5].As<Napi::Number>().DoubleValue(),
    };
    auto results = g_spatial->query(box);
    Napi::Array arr = Napi::Array::New(env, results.size());
    for (size_t i = 0; i < results.size(); ++i) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("id",    Napi::Number::New(env, results[i]->id));
        obj.Set("x",     Napi::Number::New(env, results[i]->x));
        obj.Set("y",     Napi::Number::New(env, results[i]->y));
        obj.Set("z",     Napi::Number::New(env, results[i]->z));
        obj.Set("label", Napi::String::New(env, results[i]->label));
        arr[i] = obj;
    }
    return arr;
}

// spatialNearest(x, y, z, k) -> [{id, x, y, z, label, dist}]
inline Napi::Value SpatialNearest(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_spatial) {
        Napi::Error::New(env, "Spatial index not created").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected: spatialNearest(x, y, z, k)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    double qx = info[0].As<Napi::Number>().DoubleValue();
    double qy = info[1].As<Napi::Number>().DoubleValue();
    double qz = info[2].As<Napi::Number>().DoubleValue();
    uint32_t k = info[3].As<Napi::Number>().Uint32Value();
    auto results = g_spatial->nearest(qx, qy, qz, k);
    Napi::Array arr = Napi::Array::New(env, results.size());
    for (size_t i = 0; i < results.size(); ++i) {
        double dx = results[i]->x - qx;
        double dy = results[i]->y - qy;
        double dz = results[i]->z - qz;
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("id",    Napi::Number::New(env, results[i]->id));
        obj.Set("x",     Napi::Number::New(env, results[i]->x));
        obj.Set("y",     Napi::Number::New(env, results[i]->y));
        obj.Set("z",     Napi::Number::New(env, results[i]->z));
        obj.Set("label", Napi::String::New(env, results[i]->label));
        obj.Set("dist",  Napi::Number::New(env, std::sqrt(dx*dx + dy*dy + dz*dz)));
        arr[i] = obj;
    }
    return arr;
}

// spatialClear()
inline Napi::Value SpatialClear(const Napi::CallbackInfo& info) {
    if (g_spatial) g_spatial->clear();
    return info.Env().Undefined();
}

// spatialCount() -> number
inline Napi::Value SpatialCount(const Napi::CallbackInfo& info) {
    if (!g_spatial) return Napi::Number::New(info.Env(), 0);
    return Napi::Number::New(info.Env(), static_cast<double>(g_spatial->count()));
}

#endif // DEX_SPATIAL_H
