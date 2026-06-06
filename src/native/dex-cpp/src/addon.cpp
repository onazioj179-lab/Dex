// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX C++ Native Addon -- N-API Entry Point
// ---------------------------------------------------------------------------
// High-performance OS-level kernel modules for the DEX platform:
//   - Bloom filter    : probabilistic membership testing for large file sets
//   - Spatial index   : R-tree spatial queries for Nexus 3D visualization
//   - Hash engine     : fast non-crypto hashing (FNV-1a, xxHash-style)
//   - Signal DSP      : real-time signal convolution and normalization
//   - Matrix ops      : 4x4 matrix transforms for 3D projection pipelines
//   - Thread pool     : lock-free work-stealing parallel compute engine
//   - Memory pool     : slab allocator for zero-overhead object recycling
//   - LRU cache       : O(1) get/put/evict metadata cache
//   - Scheduler       : priority-queue task scheduler with starvation guard
//   - I/O engine      : ring buffer streaming and CRC32 integrity checks
//   - Profiler        : microsecond-precision hierarchical timer with p99
// ---------------------------------------------------------------------------

#include <napi.h>
#include "bloom.h"
#include "spatial.h"
#include "hash.h"
#include "signal.h"
#include "matrix.h"
#include "threadpool.h"
#include "mempool.h"
#include "cache.h"
#include "scheduler.h"
#include "ioengine.h"
#include "profiler.h"
#include "audio_napi.h"

// ---------------------------------------------------------------------------
// Module initialization -- register all exported functions
// ---------------------------------------------------------------------------
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // -- Bloom filter --------------------------------------------------------
    exports.Set("bloomCreate",   Napi::Function::New(env, BloomCreate));
    exports.Set("bloomInsert",   Napi::Function::New(env, BloomInsert));
    exports.Set("bloomContains", Napi::Function::New(env, BloomContains));
    exports.Set("bloomClear",    Napi::Function::New(env, BloomClear));
    exports.Set("bloomStats",    Napi::Function::New(env, BloomStats));

    // -- Spatial index (R-tree for Nexus) ------------------------------------
    exports.Set("spatialCreate",    Napi::Function::New(env, SpatialCreate));
    exports.Set("spatialInsert",    Napi::Function::New(env, SpatialInsert));
    exports.Set("spatialQuery",     Napi::Function::New(env, SpatialQuery));
    exports.Set("spatialNearest",   Napi::Function::New(env, SpatialNearest));
    exports.Set("spatialClear",     Napi::Function::New(env, SpatialClear));
    exports.Set("spatialCount",     Napi::Function::New(env, SpatialCount));

    // -- Hash engine ---------------------------------------------------------
    exports.Set("hashFnv1a",       Napi::Function::New(env, HashFnv1a));
    exports.Set("hashXx64",        Napi::Function::New(env, HashXx64));
    exports.Set("hashBatch",       Napi::Function::New(env, HashBatch));

    // -- Signal processing ---------------------------------------------------
    exports.Set("signalConvolve",  Napi::Function::New(env, SignalConvolve));
    exports.Set("signalNormalize", Napi::Function::New(env, SignalNormalize));
    exports.Set("signalRms",       Napi::Function::New(env, SignalRms));
    exports.Set("signalPeakDetect", Napi::Function::New(env, SignalPeakDetect));

    // -- Audio SIMD kernels (real-time mixer math) ---------------------------
    exports.Set("audioApplyGain",  Napi::Function::New(env, AudioApplyGain));
    exports.Set("audioMix",        Napi::Function::New(env, AudioMix));
    exports.Set("audioPeak",       Napi::Function::New(env, AudioPeak));
    exports.Set("audioSimdIsa",    Napi::Function::New(env, AudioSimdIsa));

    // -- Matrix operations (4x4) ---------------------------------------------
    exports.Set("mat4Identity",    Napi::Function::New(env, Mat4Identity));
    exports.Set("mat4Multiply",    Napi::Function::New(env, Mat4Multiply));
    exports.Set("mat4RotateX",     Napi::Function::New(env, Mat4RotateX));
    exports.Set("mat4RotateY",     Napi::Function::New(env, Mat4RotateY));
    exports.Set("mat4Perspective", Napi::Function::New(env, Mat4Perspective));
    exports.Set("mat4Project",     Napi::Function::New(env, Mat4Project));

    // -- Thread pool ---------------------------------------------------------
    exports.Set("poolCreate",      Napi::Function::New(env, PoolCreate));
    exports.Set("poolStats",       Napi::Function::New(env, PoolStats));
    exports.Set("poolDestroy",     Napi::Function::New(env, PoolDestroy));

    // -- Memory pool ---------------------------------------------------------
    exports.Set("mempoolCreate",   Napi::Function::New(env, MempoolCreate));
    exports.Set("mempoolStats",    Napi::Function::New(env, MempoolStats));
    exports.Set("mempoolReset",    Napi::Function::New(env, MempoolReset));
    exports.Set("mempoolDestroy",  Napi::Function::New(env, MempoolDestroy));

    // -- LRU cache -----------------------------------------------------------
    exports.Set("cacheCreate",     Napi::Function::New(env, CacheCreate));
    exports.Set("cacheGet",        Napi::Function::New(env, CacheGet));
    exports.Set("cachePut",        Napi::Function::New(env, CachePut));
    exports.Set("cacheRemove",     Napi::Function::New(env, CacheRemove));
    exports.Set("cacheClear",      Napi::Function::New(env, CacheClear));
    exports.Set("cacheStats",      Napi::Function::New(env, CacheStats));

    // -- Scheduler -----------------------------------------------------------
    exports.Set("schedulerCreate",  Napi::Function::New(env, SchedulerCreate));
    exports.Set("schedulerEnqueue", Napi::Function::New(env, SchedulerEnqueue));
    exports.Set("schedulerDequeue", Napi::Function::New(env, SchedulerDequeue));
    exports.Set("schedulerStats",   Napi::Function::New(env, SchedulerStats));
    exports.Set("schedulerDestroy", Napi::Function::New(env, SchedulerDestroy));

    // -- I/O engine (ring buffer + CRC32) ------------------------------------
    exports.Set("ringCreate",      Napi::Function::New(env, RingCreate));
    exports.Set("ringWrite",       Napi::Function::New(env, RingWrite));
    exports.Set("ringRead",        Napi::Function::New(env, RingRead));
    exports.Set("ringStats",       Napi::Function::New(env, RingStats));
    exports.Set("ringReset",       Napi::Function::New(env, RingReset));
    exports.Set("ringDestroy",     Napi::Function::New(env, RingDestroy));
    exports.Set("crc32",           Napi::Function::New(env, Crc32));

    // -- Profiler ------------------------------------------------------------
    exports.Set("profilerCreate",  Napi::Function::New(env, ProfilerCreate));
    exports.Set("profilerBegin",   Napi::Function::New(env, ProfilerBegin));
    exports.Set("profilerEnd",     Napi::Function::New(env, ProfilerEnd));
    exports.Set("profilerGet",     Napi::Function::New(env, ProfilerGet));
    exports.Set("profilerNames",   Napi::Function::New(env, ProfilerNames));
    exports.Set("profilerClear",   Napi::Function::New(env, ProfilerClear));
    exports.Set("profilerDestroy", Napi::Function::New(env, ProfilerDestroy));

    return exports;
}

NODE_API_MODULE(dex_cpp, Init)
