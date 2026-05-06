# DEX Native -- Rust Performance Modules

High-performance native modules for DEX, built with Rust and NAPI-RS.

## What This Replaces

| Before | After | Improvement |
|--------|-------|-------------|
| Python subprocess (psutil, 50MB RAM) | Rust `sysinfo` crate (in-process) | ~50MB RAM saved, no IPC overhead |
| `systeminformation` (JS, spawns wmic/ps) | Rust `sysinfo` crate (direct syscalls) | ~10x faster, no child processes |
| `ps-list` (spawns tasklist/ps) | Rust `sysinfo` process enumeration | Zero subprocess overhead |
| Sync `readdirSync` recursive scans | Rust `jwalk` parallel walker | 3-10x faster, non-blocking |
| Shell commands for power profiles | Rust `Command` with proper error handling | Unified cross-platform API |

## Prerequisites

- **Rust toolchain**: Install from https://rustup.rs/
- **Node.js 18+**: Required by NAPI-RS

## Build

```bash
# From the native/ directory:
npm install
npm run build          # Release build (optimized)
npm run build:debug    # Debug build (faster compile)

# Or from the project root:
npm run build:native
```

## Architecture

```
native/
  Cargo.toml          # Rust dependencies and build config
  build.rs            # NAPI-RS build script
  package.json        # @napi-rs/cli config
  src/
    lib.rs            # Entry point -- re-exports all modules
    system.rs         # CPU, memory, battery, disk, network monitoring
    processes.rs      # Process listing, categorization, termination
    power.rs          # Power profile management (powercfg/pmset/cpupower)
    files.rs          # Parallel directory scanning (jwalk) + file watcher
    health.rs         # Watchdog + pattern learning engine
    image_processing.rs  # Image metadata extraction
    audio_processing.rs  # WAV audio processing
    video_metadata.rs    # Video file metadata
    creative.rs          # Creative suite native helpers
    kernel/
      mod.rs           # Kernel module registry
      scheduler.rs     # Task scheduler + priority queues
      memory.rs        # Memory pool + allocation tracking
      io_engine.rs     # Async I/O engine with write coalescing
      ipc_bus.rs       # IPC message bus (pub/sub)
      cpu.rs           # CPU topology + affinity
      startup.rs       # Startup optimization + prefetch
      perf.rs          # Performance counters + profiling
      uki.rs           # Voice assistant native bridge
      dsp.rs           # Audio DSP (biquad EQ, compressor, limiter, reverb, delay)
      media.rs         # Multi-format audio decode (symphonia: MP3/FLAC/OGG/AAC/WAV)
      video.rs         # Video container metadata (MP4/MOV/WebM/MKV parsing)
```

## Exported Functions

### System Monitoring
- `getSystemStats()` -- CPU, memory, battery, uptime, OS info
- `getDiskInfo()` -- All mounted volumes with usage
- `getNetworkInfo()` -- Interface tx/rx statistics

### Process Management
- `getProcesses(limit?)` -- Running processes sorted by resource usage
- `closeProcess(pid, force?)` -- Safe process termination (blocks system-critical)
- `freeMemory()` -- OS-level memory cleanup

### Power Control
- `getPowerProfiles()` -- Available profiles (eco/balanced/boost)
- `setPowerProfile(profile)` -- Set via OS-native commands
- `getPowerStatus()` -- Current profile + battery status

### File Scanning
- `scanDirectory(path, extensions, maxDepth, limit, includeDirs)` -- Parallel recursive scan
- `getDirectorySize(path)` -- Total size calculation
- `scanMediaFiles(type, paths, limit)` -- Audio/image/video/document scanning

### Health & Learning
- `heartbeat()` -- Memory sampling for trend detection
- `getHealth()` -- Process health with memory trend analysis
- `recordActivity(type, name)` -- Pattern learning
- `getSuggestions()` -- Time/frequency-based suggestions

### Kernel -- Scheduler & Memory
- `kernelScheduleTask(name, priority, cpuBound)` -- Priority task scheduling
- `kernelGetStats()` -- Scheduler statistics
- `kernelAllocPool(name, sizeMb)` -- Named memory pool allocation
- `kernelGetMemoryStats()` -- Pool usage tracking
- `kernelGcPools()` -- Garbage collect idle pools

### Kernel -- I/O Engine & IPC
- `kernelWriteCoalesced(path, data)` -- Batched async writes
- `kernelFlushWrites()` -- Flush pending write queue
- `kernelIpcPublish(topic, payload)` -- Pub/sub message bus
- `kernelIpcSubscribe(topic)` -- Subscribe to topic
- `kernelIpcDrain(topic)` -- Drain pending messages

### Kernel -- CPU & Performance
- `kernelCpuTopology()` -- Core/thread counts, P/E cores (hybrid)
- `kernelSetAffinity(pid, coreIds)` -- Process CPU affinity
- `kernelPerfSnapshot()` -- Performance counters snapshot
- `kernelStartupAnalyze()` -- Startup time analysis

### Kernel -- DSP (Audio Processing)
- `dspBiquadFilter(samples, sampleRate, filterType, freq, q, gain)` -- Biquad EQ filter
- `dspParametricEq(samples, sampleRate, bands)` -- Multi-band parametric EQ
- `dspCompressor(samples, sampleRate, threshold, ratio, attack, release, knee)` -- Dynamic range compression
- `dspLimiter(samples, ceiling)` -- Brick-wall limiter
- `dspGate(samples, sampleRate, threshold, attack, release)` -- Noise gate
- `dspConvolve(samples, ir)` -- Convolution reverb
- `dspDelay(samples, sampleRate, delaySecs, feedback, mix)` -- Feedback delay
- `dspRmsDb(samples)` / `dspPeakDb(samples)` -- Metering

### Kernel -- Media Decode (Symphonia)
- `mediaProbeAudio(filePath)` -- Fast metadata probe (codec, sample rate, channels, duration)
- `mediaDecodeAudio(filePath)` -- Full decode to f64 samples
- `mediaDecodeAudioRange(filePath, startSecs, endSecs)` -- Ranged decode
- `mediaDecodeAudioAsync(filePath)` -- Non-blocking async decode

### Kernel -- Video Metadata
- `videoProbe(filePath)` -- Container info (dimensions, duration, codec, frame rate)
- `videoProbeAsync(filePath)` -- Non-blocking async probe
- `videoEstimateFrames(filePath)` -- Total frame count estimate

## Cross-Platform

Tested on:
- Windows x64 (MSVC)
- macOS x64 / arm64
- Linux x64 (GNU)

The native module uses Node-API (N-API) which is ABI-stable -- no need to
rebuild for different Node.js or Electron versions.
