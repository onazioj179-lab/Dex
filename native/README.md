# DEX Native — Rust Performance Modules

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
    lib.rs            # Entry point — re-exports all modules
    system.rs         # CPU, memory, battery, disk, network monitoring
    processes.rs      # Process listing, categorization, termination
    power.rs          # Power profile management (powercfg/pmset/cpupower)
    files.rs          # Parallel directory scanning (jwalk)
    health.rs         # Watchdog + pattern learning engine
```

## Exported Functions

### System Monitoring
- `getSystemStats()` — CPU, memory, battery, uptime, OS info
- `getDiskInfo()` — All mounted volumes with usage
- `getNetworkInfo()` — Interface tx/rx statistics

### Process Management
- `getProcesses(limit?)` — Running processes sorted by resource usage
- `closeProcess(pid, force?)` — Safe process termination (blocks system-critical)
- `freeMemory()` — OS-level memory cleanup

### Power Control
- `getPowerProfiles()` — Available profiles (eco/balanced/boost)
- `setPowerProfile(profile)` — Set via OS-native commands
- `getPowerStatus()` — Current profile + battery status

### File Scanning
- `scanDirectory(path, extensions, maxDepth, limit, includeDirs)` — Parallel recursive scan
- `getDirectorySize(path)` — Total size calculation
- `scanMediaFiles(type, paths, limit)` — Audio/image/video/document scanning

### Health & Learning
- `heartbeat()` — Memory sampling for trend detection
- `getHealth()` — Process health with memory trend analysis
- `recordActivity(type, name)` — Pattern learning
- `getSuggestions()` — Time/frequency-based suggestions

## Cross-Platform

Tested on:
- Windows x64 (MSVC)
- macOS x64 / arm64
- Linux x64 (GNU)

The native module uses Node-API (N-API) which is ABI-stable — no need to
rebuild for different Node.js or Electron versions.
