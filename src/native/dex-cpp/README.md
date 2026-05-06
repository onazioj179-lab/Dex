# DEX C++ Native Addon

High-performance compute modules for the DEX platform, built with Node.js N-API (node-addon-api).

## Modules

| Module | Purpose | Key Functions |
|--------|---------|---------------|
| **Bloom Filter** | Probabilistic membership testing for large file sets | `bloomCreate`, `bloomInsert`, `bloomContains` |
| **Spatial Index** | 3D point queries for Nexus visualizer | `spatialInsert`, `spatialQuery`, `spatialNearest` |
| **Hash Engine** | Fast non-crypto hashing (FNV-1a, xxHash-style) | `hashFnv1a`, `hashXx64`, `hashBatch` |
| **Signal DSP** | Real-time convolution, RMS, peak detection | `signalConvolve`, `signalRms`, `signalPeakDetect` |
| **Matrix Ops** | 4x4 matrix transforms for 3D projection | `mat4Multiply`, `mat4Perspective`, `mat4Project` |

## Build

```bash
cd src/native/dex-cpp
npm install
npm run build
```

Requires:
- Node.js >= 18
- C++20 compiler (MSVC on Windows, Clang on macOS, GCC on Linux)
- node-gyp

## Architecture

- **N-API** bindings ensure ABI stability across Node.js versions
- **Header-only** implementations in `.h` files for easy inlining
- **Singleton** instances for stateful modules (bloom, spatial) -- safe for single-threaded N-API context
- **Zero-copy** where possible via `Float64Array` returns
- **Column-major** layout for matrix ops (OpenGL/WebGL compatible)
