# Changelog

All notable changes to DEX will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file documents the **current release only**. For the full history of
prior releases, see the git tag history (`git tag --list`) and the GitHub
Releases page. Older changelog entries were trimmed in v3.8.9 to keep the
public document short and focused on what has actually shipped to users now.

---

## v4.60.3 — Production Polish & Shell Stability (2026-05-28)

### Improvements

- **Minimized windows are now easy to restore.** The "N minimized" indicator in
  the top bar is now a clickable button. Click it to see a list of all minimized
  apps by name. Click any app in the list to bring it back. Works with keyboard
  too — Arrow keys to navigate, Enter to restore, Escape to dismiss.

- **Settings → Updates: Clear Cache button.** A new "Clear Cache" button in
  Settings → Updates removes stale installer downloads from the system temp
  folder. The button shows how much space was freed (e.g. "Freed 142 MB").
  The cache is also cleaned automatically at startup and every 24 hours.

- **Onboarding preferences now take effect.** The crash reporting and
  auto-update toggles in the initial setup wizard are now properly wired.
  Turning them on or off during setup now actually changes the behaviour
  of the app — previously only the analytics toggle had any effect.

- **Crash reports toggle in Settings is live.** The crash reports toggle in
  Settings → Privacy is now connected to the diagnostics system. Toggling it
  on or off takes effect immediately and persists across restarts.

- **Platform shortcuts everywhere.** Keyboard shortcut labels throughout the
  app now show the correct modifier for your platform — ⌘ on macOS, Ctrl on
  Windows and Linux. Shortcuts that were displayed correctly but didn't fire
  on macOS (using Cmd key) are now fixed.

- **Reduce Motion toggle works.** The Reduce Motion toggle in the system menu
  now correctly applies — previously it wrote a preference but the compositor
  ignored it.

- **Caps Lock warning on Lock Screen.** When Caps Lock is active while typing
  your password on the lock screen, a small amber warning appears below the
  input so you know why your password might not be working.

- **Release retention is automatic.** Old GitHub releases are pruned
  automatically during the release process (newest 3 kept). The prune script
  now works on Windows, macOS, and Linux runners.

### Fixes

- Fixed minimized floating windows being unrecoverable after using the
  macOS-style yellow traffic-light button to minimize them.

- Fixed the Reduce Motion toggle doing nothing (the localStorage key was
  written but never read by the motion controller on startup or change).

- Fixed floating window resize gesture leaking pointer listeners when a
  window was closed mid-drag (three document-level event listeners were
  never removed, causing phantom drag behaviour in subsequent windows).

- Fixed MiniPulse widget (live CPU/RAM/FPS pill) blocking interaction with
  the Focus Session overlay — it was stacked at z-index 2,147,483,000 which
  is above everything in the app. Now correctly sits below the focus overlay.

- Fixed Cmd+key shortcuts silently failing on macOS. The keyboard handler
  was comparing `metaKey` events against `ctrl` bindings; it now maps
  macOS Cmd → the internal ctrl modifier so all shortcuts fire correctly.

- Removed all `window.confirm()` and `window.prompt()` native dialog calls
  from production code. These blocked the UI thread and ignored the DEX theme.
  Replaced with in-app dialogs and inline inputs throughout.

- Removed a debug log statement in the audio chain preset save path that was
  printing user preset names and parameter values to the developer console.

- Fixed 9 service init log statements printing noise to DevTools in every
  production session (MemoryMonitor, UIPolishSystem, InputPriority,
  ScreenGuardSystem, ProPerformanceEngine, Snappy).

### Windows

- Installer now builds for both x64 and ARM64.
- Added portable `.exe` (no-install, run anywhere) alongside the NSIS
  installer.
- Added `.zip` archive for manual extraction installs.
- NSIS installer properly stops any running DEX instance before upgrading,
  prevents duplicate startup entries, writes install timestamp to registry,
  and cleans the update cache on uninstall.

---

## v4.56.0 - Master Evolution Plan Phase 1: IPC contracts, unified search, canonical error boundary

Phase 1 of the Master Evolution Plan (per ADR 0002 and ADR 0004) lands three
additive foundation layers under `src/shared/`. Existing implementations
(200+ legacy IPC handlers, 6 search surfaces, 4 divergent error boundaries)
are unchanged in this release; they migrate incrementally on top of the new
layers in subsequent waves. No user-facing behavior changes.

New shared platform layers:

- `src/shared/ipc/contracts/registry.ts` - typed `IpcContractRegistry` with
  channel-name validation, schema combinators (`string`, `number`, `boolean`,
  `optional`, `array`, `object`), request/response validators, deprecation
  tracking, and rate-category linkage to `src/shared/governance`.
- `src/shared/ipc/contracts/canonical.ts` - first canonical contract set:
  `files:read`, `files:write`, `dir:read`, `window:minimize`, plus
  `createCanonicalRegistry()` for main + renderer startup.
- `src/shared/search/SearchOrchestrator.ts` - single facade that the existing
  search surfaces register with as `SearchProvider`s. Per-provider timeouts,
  weighted score normalization, kind filtering, accept callbacks, throwing-
  provider isolation, and `kind:id` deduplication.
- `src/shared/errors/CanonicalErrorBoundary.ts` - one canonical React error
  boundary that supersedes the four divergent boundaries. Composable
  telemetry sinks (`composeTelemetry`), pluggable recovery policies
  (`boundedRetryPolicy`), pluggable fallback UI, scope-aware crash records.

Tests:

- `tests/unit/ipc-contracts.test.ts`
- `tests/unit/search-orchestrator.test.ts`
- `tests/unit/canonical-error-boundary.test.tsx`

All tests, `tsc --noEmit`, and the production build are green.

## v4.55.0 - Master Evolution Plan Phase 0: governance, ADRs, KPI baselines

First release after the 500-improvement backlog closed. Begins the Master
Evolution Plan with Phase 0 deliverables. No user-facing behavior changes;
this lands the binding governance scaffolding that downstream phases depend
on.

New architecture decision records under `docs/adr/`:

- ADR 0001 - record architecture decisions.
- ADR 0002 - master evolution plan phasing (binding sequence and deps).
- ADR 0003 - improvements500 shared-primitive layer policy.
- ADR 0004 - IPC contract formalization (registry, schemas, rate categories,
  correlation IDs, versioning rule).
- ADR 0005 - release rings and rollback policy (dev/canary/beta/stable with
  health-gated promotion and automatic rollback).

New governance documents:

- `docs/KPI_BASELINES.md` - performance, reliability, intelligence, UX,
  accessibility, creative, and collaboration KPI baselines plus IPC rate
  categories and health/memory/attention thresholds.
- `docs/RELEASE_RINGS.md` - ring promotion workflow.
- `docs/ROLLBACK_POLICY.md` - automatic and manual rollback procedure plus
  forward-fix ban during freeze.
- `docs/DEPENDENCY_MAP.md` - phase graph, hard dependencies, cross-cutting
  producer/consumer matrix, and risk hotspots inherited from the audit.

New runtime module:

- `src/shared/governance/index.ts` - programmatic mirror of the KPI and
  ring policy documents (release ring constants, gate thresholds, IPC rate
  budgets, health/memory/attention defaults, and promotion helpers
  `canPromote` and `nextRing`). Code consuming KPI thresholds reads from
  this module so the docs and the runtime cannot drift. 10 unit tests pass.

## v4.54.0 - 500-Improvement Wave 50 (final): operational and master-plan primitives

Fiftieth and final wave. 10 modules close out the 500-improvement backlog (501 total
shared primitives shipped across waves 1-50). All 10 unit tests pass; full type-check
and production build green.

Wave 50 modules map to the DEX Master Evolution Plan operational pillars:

- `FocusModeController` - subscribe/notify state machine for deep-work mode (manual,
  app-context, idle, schedule reasons) used by the shell to dim non-pinned dock items
  and throttle non-critical notifications.
- `takeWorkspaceLayoutSnapshot` / `diffWorkspaceLayoutSnapshots` - JSON-safe save and
  restore for window arrangement plus added/removed/moved diff for continuity.
- `computeHealthScore` - blends crash-free ratio, memory headroom, frame-budget pass,
  and IPC success ratio into a 0..100 score with `healthy`/`degraded`/`critical` bands
  for the rollback-by-health-score policy.
- `MemoryPressureMonitor` - threshold-based level transitions (`nominal`/`elevated`/
  `critical`) with hysteresis so subscribers do not flap.
- `semanticChunker` - sentence-aware text chunker with target size, overlap, and
  minimum size for embedding pipelines.
- `confidenceMeter` - blends similarity, model probability, prior, and evidence count
  into a normalized score plus `low`/`medium`/`high` band for AI suggestion UI.
- `IpcCallTracer` - correlation-ID span tracker for IPC end-to-end latency.
- `classifyCrash` / `summarizeCrashes` - taxonomy mapping crash records into
  renderer/main/native/gpu/memory/worker/unhandled-rejection categories for dashboards.
- `AutosaveCoordinator` - per-source debounced flush queue that serializes overlapping
  flushes so a destination is never written twice in parallel.
- `AttentionBudget` - rolling-window interruption budget the shell consults before
  surfacing notifications.

Backlog status: 491 modules shipped through Wave 49 + 10 Wave 50 = 501 modules. The
500-improvement pipeline is complete. Subsequent work shifts to Master Evolution Plan
phases.

## v4.53.0 - 500-Improvement Wave 49: dsp, easing, motion smoothing, audio codecs

Forty-ninth wave. 11 more shared modules, 11 new tests pass.

### Added

- `OnePoleLowPass` / `OnePoleHighPass` - one-pole IIR filters for streaming numeric signals.
- `springStep` - second-order spring-damper one-dimensional smoothing toward a target.
- `criticallyDampedSmooth` - critically-damped spring (Game Programming Gems 4).
- `tukeyWindow` - cosine-tapered rectangular window with alpha parameter.
- `easeInQuad`/`easeOutQuad`/`easeInOutQuad`/`easeInCubic`/`easeOutCubic`/`easeInOutCubic`/`easeOutBack`/`easeOutElastic`/`easeOutBounce` - UI animation easing curves.
- `dbToLinear` / `linearToDb` / `clipDb` - decibel <-> linear amplitude conversion.
- `midiToFrequency` / `frequencyToMidi` / `midiToNoteName` - MIDI-Hz conversion (A4 = 440).
- `linearResample` - simple linear sample-rate conversion for visualization use.
- `quaternionSlerp` - spherical linear interpolation between unit quaternions.
- `int16ToFloat32` / `float32ToInt16` - PCM bit-depth conversion between Int16 and Float32.
- `muLawEncode` / `muLawDecode` - mu-law nonlinear companding for telephony-style audio.

## v4.52.0 - 500-Improvement Wave 48: color, perception, dsp, audio analysis

Forty-eighth wave. 10 more shared modules, 10 new tests pass.

### Added

- `simulateColorBlind` - color-blindness simulation (protanopia/deuteranopia/tritanopia).
- `deltaE76` - CIE76 delta-E distance between two Lab colors.
- `colorTemperatureToRgb` - Tanner Helland color-temperature-to-RGB approximation.
- `whiteBalanceGray` - gray-world automatic white balance for image buffers.
- `rgbToXyz` / `xyzToRgb` - sRGB <-> CIE XYZ (D65) conversion.
- `dct2` / `idct2` - 2-D discrete cosine transform pair.
- `autocorrelate` - signal autocorrelation function.
- `detectPeaks` - local-maximum peak detection with min-distance and min-height filters.
- `hzToMel` / `melToHz` / `melFilterbankCenters` - mel-scale conversion and filterbank centers.

## v4.51.0 - 500-Improvement Wave 47: image processing, edge detection, filters

Forty-seventh wave. 10 more shared modules, 10 new tests pass.

### Added

- `boxBlur` - separable box blur for grayscale image buffers.
- `gaussianBlurImage` - separable 2-D Gaussian blur over image buffers.
- `prewittEdges` / `scharrEdges` / `robertsCross` / `laplacianEdges` - edge-detection filters.
- `unsharpMask` - sharpening via subtraction of a blurred copy.
- `medianBlur` - square-neighborhood median filter for salt-and-pepper noise.
- `bilateralFilter` - edge-preserving bilateral smoothing.
- `histogramEqualize` - 8-bit grayscale histogram equalization.

## v4.50.0 - 500-Improvement Wave 46: ML primitives, optimizers, normalization

Forty-sixth wave. 10 more shared modules, 10 new tests pass.

### Added

- `softmax` - numerically-stable softmax over a numeric array.
- `logSumExp` - numerically-stable log-sum-exp.
- `crossEntropy` - cross-entropy loss between predicted and target distributions.
- `sigmoid`/`relu`/`leakyRelu`/`elu`/`gelu`/`softplus`/`swish`/`mish` - common activation functions.
- `layerNormalize` - layer-normalization over a single feature vector.
- `adamStep` / `createAdamState` - Adam optimizer step with state.
- `sgdMomentumStep` / `createMomentumState` - SGD with momentum (optional Nesterov).
- `rmspropStep` / `createRmspropState` - RMSProp optimizer step.
- `adagradStep` / `createAdagradState` - AdaGrad optimizer step.
- `batchNormalize` - batch normalization over a 1-D batch.

## v4.49.0 - 500-Improvement Wave 45: special functions, polynomials, normalization

Forty-fifth wave. 10 more shared modules, 10 new tests pass.

### Added

- `erf` / `erfc` - error function and complementary error function (A&S 7.1.26).
- `lambertW0` - principal branch Lambert W via Halley iteration.
- `besselJ0` - Bessel function of the first kind, order zero.
- `gammaLanczos` / `lnGamma` - Lanczos gamma approximation (g=7).
- `digamma` - digamma function via shift and asymptotic series.
- `polyGcd` - polynomial GCD via Euclidean algorithm with monic result.
- `polyDivide` - polynomial long division producing quotient and remainder.
- `zScoreNormalize` - zero-mean unit-variance standardization.
- `minMaxNormalize` - linear rescaling into a target range.
- `robustScale` - median/MAD-based robust scaling.

## v4.48.0 - 500-Improvement Wave 44: HMM, graph, sampling, sieves

Forty-fourth wave. 10 more shared modules, 10 new tests pass.

### Added

- `viterbi` - Viterbi most-likely-state-sequence decoding for an HMM.
- `floodFill4` - 4-connected flood fill on a grid.
- `connectedComponents4` - 4-connected component labelling on a binary image.
- `beamSearch` - generic beam-search expansion over a state space.
- `sieveOfAtkin` - Sieve of Atkin prime enumeration.
- `ReservoirSamplerK` - k-reservoir sampling for streaming data.
- `WeightedUnionFind` - weighted union-find with union-by-size and path compression.
- `euclideanRhythm` - Bjorklund evenly-distributed rhythm pattern generator.
- `forwardBackward` - HMM forward-backward smoothing returning alpha/beta/gamma and log-likelihood.

## v4.47.0 - 500-Improvement Wave 43: numerical methods, geometry, polynomials

Forty-third wave. 10 more shared modules, 10 new tests pass.

### Added

- `brentRoot` - Brent root-finding on a bracketed scalar function.
- `goldenSectionMin` - golden-section minimization of a unimodal function.
- `rombergIntegrate` - Romberg numerical integration with Richardson extrapolation.
- `gaussLegendreIntegrate` - 2/3/4/5-point Gauss-Legendre quadrature on [a, b].
- `chebyshevT` / `clenshawChebyshev` - Chebyshev T_n evaluation and Clenshaw recurrence.
- `legendreP` - Legendre polynomial evaluation via Bonnet recursion.
- `rayTriangleIntersect` - Moller-Trumbore ray/triangle intersection.
- `minimumEnclosingCircle` - Welzl smallest enclosing circle.
- `rodriguesRotate` - Rodrigues' rotation of a 3-D vector around an axis.
- `bernsteinBasis` / `bernsteinEval` - Bernstein basis polynomial evaluation.

## v4.46.0 - 500-Improvement Wave 42: bigint, image, search, optimization

Forty-second wave. 10 more shared modules, 10 new tests pass.

### Added

- `karatsubaMul` - Karatsuba big-integer multiplication on base-2^15 digits.
- `Welford` - online numerically stable mean and variance.
- `medianFilter1d` - 1D sliding-window median filter with mirror edges.
- `otsuThreshold` / `applyThreshold` - Otsu adaptive grayscale thresholding.
- `erodeBinary` / `dilateBinary` - 3x3 binary morphology.
- `marchingSquares` - iso-contour line extraction.
- `worleyNoise2d` - cellular noise distance to nearest feature point.
- `fbm2d` - fractional Brownian motion over a noise function.
- `boyerMooreHorspool` / `boyerMooreHorspoolAll` - Horspool string search.
- `simulatedAnnealing` - generic SA optimizer with geometric cooling.

## v4.45.0 - 500-Improvement Wave 41: spatial, numeric, fusion

Forty-first wave. 11 new tests pass across 10 shared modules.

### Added

- `Quadtree` - point quadtree with rectangle range queries.
- `Octree` - point octree with box range queries.
- `earClipTriangulate` - ear-clipping polygon triangulation.
- `durandKernerRoots` - Durand-Kerner all-roots polynomial solver.
- `conjugateGradient` - matrix-free CG solver for SPD systems.
- `gaussSeidel` - Gauss-Seidel iterative solver.
- `circumcircle` / `incircle` - triangle circles.
- `fisherYatesShuffle` / `fisherYatesShuffled` - Knuth shuffle.
- `ComplementaryFilter` - gyro/accel angle fusion.
- `Kalman2d` - constant-velocity 2D position tracker.

## v4.44.0 - 500-Improvement Wave 40: clipping, PRNG, sampling, control

Fortieth wave. 10 more shared modules, 10 new tests pass.

### Added

- `liangBarskyClip` - Liang-Barsky line clipping against AA rectangles.
- `Xorshift32` - Marsaglia's 32-bit xorshift PRNG.
- `Xoshiro128pp` - xoshiro128++ PRNG (Blackman & Vigna).
- `crc8` / `crc8Hex` - CRC-8 (poly 0x07) for SMBus / 1-Wire.
- `AliasSampler` - Vose's alias method for O(1) weighted sampling.
- `buildNaturalCubicSpline` / `evalCubicSpline` - natural cubic spline via Thomas algorithm.
- `theilSen` - robust median-of-slopes regression.
- `verletSolve` / `verletStep` - velocity Verlet integrator.
- `PidController` - PID with output clamp and conditional anti-windup.
- `gradientDescent1d` - fixed-step 1D gradient descent.

## v4.43.0 - 500-Improvement Wave 39: image, PRNG, signal, ODE

Thirty-ninth wave. 10 more shared modules, 10 new tests pass.

### Added

- `bilinearResample` - bilinear resampling with center-pixel sampling.
- `ditherBayer` - 8x8 ordered Bayer dithering.
- `sweptAabb` - swept AABB collision returning entry time and normal.
- `MersenneTwister` - MT19937 PRNG.
- `cohenSutherlandClip` - Cohen-Sutherland line clipping.
- `kelvinToRgb` - Tanner Helland Kelvin to RGB approximation.
- `savitzkyGolay` - Savitzky-Golay smoothing for windows 5/7/9/11.
- `ExponentialMovingAverage` / `emaSeries` - EMA filter.
- `linearRegression` - least squares with R^2.
- `rk4Step` / `rk4Solve` - classical 4th-order Runge-Kutta integrator.

## v4.42.0 - 500-Improvement Wave 38: crypto, codec, image, geometry

Thirty-eighth wave. 10 more shared modules, 10 new tests pass.

### Added
- `sha1/sha1Hex` - FIPS 180-4 SHA-1 (legacy interop only).
- `pbkdf2Sha256` - PBKDF2-HMAC-SHA256 key derivation.
- `arithmeticEncode/arithmeticDecode` - order-0 binary arithmetic coding.
- `parseIso` - permissive ISO 8601 date/time parser.
- `easterDate` - Anonymous Gregorian Easter Sunday algorithm.
- `sobelEdges` - 2D Sobel edge magnitude on grayscale Float32Array.
- `lanczosResample` - 1D Lanczos resampling with configurable kernel size.
- `paletteQuantize` - median-cut color palette quantization.
- `ditherFloydSteinberg` - Floyd-Steinberg error-diffusion dither.
- `raycastSphere` - ray-sphere intersection with near/far roots.

## v4.41.0 - 500-Improvement Wave 37: codec, hashing, ranking, geometry

Thirty-seventh wave. 10 more shared modules, 10 new tests pass.

### Added
- `base91Encode/base91Decode` - basE91 binary-to-text codec.
- `sha256/sha256Hex` - FIPS 180-4 SHA-256 hash.
- `hmacSha256` - HMAC-SHA256 message authentication.
- `lzssCompress/lzssDecompress` - LZSS sliding-window compression.
- `KdTree` - kd-tree for k-nearest-neighbour queries.
- `Bm25` - Okapi BM25 document ranking.
- `ordinalSuffix/ordinal` - English ordinal suffix helper.
- `businessDaysBetween/addBusinessDays` - workday arithmetic with holidays.
- `longestCommonSubstring` - contiguous LCS via DP.
- `gaussianBlur1D/gaussianKernel1D` - separable Gaussian blur kernel.

## v4.40.0 - 500-Improvement Wave 36: encoding, color, stats, numerics

Thirty-sixth wave. 10 more shared modules, 10 new tests pass.

### Added
- `base85Encode/base85Decode` - Adobe Ascii85 binary-to-text codec.
- `bwtTransform/bwtInverse` - Burrows-Wheeler transform with primary index.
- `constantTimeEqual/constantTimeStringEqual` - timing-safe equality checks.
- `rgbToOklab/oklabToRgb` - perceptually uniform Oklab color space conversion.
- `kahanSum/neumaierSum` - compensated floating-point summation.
- `percentileLinear/quantiles` - linear-interpolation percentile estimation.
- `MultiMap<K,V>` - keys mapping to arrays of values, size tracking.
- `Tfidf` - term-frequency / inverse-document-frequency document ranking.
- `simpsonsRule/trapezoidRule` - numerical quadrature.
- `newtonRaphson/bisection` - one-dimensional root finders.

## v4.39.0 - 500-Improvement Wave 35: MST, alignment, clustering, DSP

Thirty-fifth wave. 10 more shared modules, 10 new tests pass.

- `boruvkaMst` — Borůvka's MST.
- `needlemanWunsch` — global sequence alignment with traceback.
- `smithWaterman` — local sequence alignment.
- `dbscan` — density-based clustering.
- `kMeans` — Lloyd's k-means with seedable PRNG.
- `agglomerativeCluster` — single-linkage hierarchical clustering.
- `dspWindows` — Hann, Hamming, Blackman, Blackman-Harris.
- `biquadFilter` + `biquadLowpass`/`biquadHighpass` — RBJ biquad TDF II.
- `adsrEnvelope` — ADSR envelope generator.
- `oneEuroFilter` — 1€ filter for noisy real-time signals.

## v4.38.0 - 500-Improvement Wave 34: 2D segtree, number theory, NTT

Thirty-fourth wave. 10 more shared modules, 10 new tests pass.

- `SegTree2D` — 2D segment tree, point update + rectangle sum.
- `crt` — generalized Chinese remainder theorem (BigInt).
- `extendedEuclidean` — Bézout coefficients.
- `tonelliShanks` — square root mod p.
- `babyStepGiantStep` — discrete logarithm.
- `nttMultiply` — NTT polynomial multiplication mod 998244353.
- `PointQuadtree` — point quadtree with range query.
- `lagrangeInterpolate` — polynomial interpolation.
- `fwht` — Fast Walsh-Hadamard transform.
- `modPowBig` — BigInt modular exponentiation.

## v4.37.0 - 500-Improvement Wave 33: All-pairs, BST, heap, betweenness

Thirty-third wave. 10 more shared modules, 10 new tests pass.

- `johnsonAllPairs` — Johnson's reweighted all-pairs shortest paths.
- `MergeSortTree` — range count of values <= x.
- `SplayTree` — splay tree with insert/contains.
- `FibonacciHeap` — amortized O(1) push, O(log n) pop.
- `FastBitVector` — succinct bit vector with rank/select.
- `chuLiuEdmonds` — directed minimum spanning arborescence cost.
- `brandesBetweenness` — Brandes' betweenness centrality.
- `heavyLightDecomposition` — HLD position arrays.
- `tspNearestNeighbor` + `tsp2Opt` — TSP heuristics.
- `stoerWagnerMinCut` — global minimum cut.

## v4.36.0 - 500-Improvement Wave 32: Flow, ranking, hashing, heaps

Thirty-second wave. 10 more shared modules, 10 new tests pass.

- `Dinic` — Dinic's max-flow.
- `pageRank` — PageRank with dangling-mass correction.
- `hits` — HITS algorithm (hubs/authorities).
- `RollingHash` — polynomial rolling hash with Mersenne prime.
- `Fenwick2D` — 2D Fenwick tree.
- `SuffixAutomaton` — Ukkonen-style SAM with distinct substring count.
- `PersistentArray` — 16-way persistent array.
- `LeftistHeap` — leftist tree.
- `PairingHeap` — pairing heap.
- `yenKShortest` — Yen's k-shortest paths.

## v4.35.0 - 500-Improvement Wave 31: Bit ops, Gray code, SPF, knapsack, graph algos

Thirty-first wave. 10 more shared modules, 10 new tests pass.

- `bitOps32` — popcount32, leadingZeros32, trailingZeros32, reverseBits32.
- `grayCode` — binaryToGray, grayToBinary, grayCodeSequence.
- `smallestPrimeFactorSieve` + `factorizeWithSpf` — O(log n) factorization.
- `subsetSum` — bitset DP, O(n*target/32).
- `knapsackUnbounded` — unbounded 0/1 knapsack, `UnboundedKnapsackItem`.
- `matrixChainOrder` — DP with `parenthesize()` reconstruction.
- `bipartiteCheck` — BFS 2-coloring, returns Int8Array | null.
- `treeDiameter` — two-pass BFS, diameter + endpoints + centers.
- `LcaBinaryLifting` — binary lifting LCA class with O(log n) queries.
- `combinations` / `powerset` — generators.

## v4.34.0 - 500-Improvement Wave 30: Combinatorics, strings, sequences

Thirtieth wave. 10 more shared modules, 10 new tests pass.

- `josephus` — classic recurrence.
- `catalan` / `catalanList` — Catalan numbers.
- `stirling2` — Stirling numbers of the second kind.
- `bernoulliNumbers` — Akiyama-Tanigawa, B_1=+1/2 convention, BigInt rationals.
- `hammingDistance` / `hammingDistanceBytes` — string and Uint8Array variants.
- `soundex` — classic Soundex coding.
- `cosineSimilarity` — dense vector cosine.
- `nGramTokenize` / `nGramArray` — character/array n-grams.
- `nextPermutation` / `prevPermutation` — in-place lex perms.
- `partitionInteger` — descending lex iterative partition generation.

## v4.33.0 - 500-Improvement Wave 29: Number theory, linear algebra, flow

Twenty-ninth wave. 10 more shared modules, 10 new tests pass.

- `eulerTotient` — Euler's totient via trial division.
- `pollardRho` — BigInt Pollard rho with internal gcdBig.
- `quickSelect` — median-of-three pivot.
- `medianOfMediansSelect` — deterministic O(n) selection.
- `matrixInverse` — Gauss-Jordan with partial pivoting (null on singular).
- `gaussJordanSolve` — linear system solver.
- `jacobiEigen` — Jacobi eigendecomposition, eigenvalues sorted desc.
- `hungarianAssign` — Jonker-Volgenant style O(n^3) assignment.
- `edmondsKarp` — Edmonds-Karp max-flow with flow matrix.
- `jaroSimilarity` / `jaroWinklerSimilarity` — string similarity.

## v4.32.0 - 500-Improvement Wave 28: Geometry, polynomials, codecs, Kalman

Twenty-eighth wave. 10 more shared modules, 10 new tests pass.

- `circleCircleIntersect` two-circle intersection points.
- `polynomialDiv` polynomial long division (quotient + remainder).
- `hornerEval` fast polynomial evaluation via Horner's method.
- `continuedFraction` real-to-rational continued fraction + convergents.
- `sternBrocotPath` / `sternBrocotFromPath` Stern-Brocot tree navigation.
- `lz77Encode` / `lz77Decode` sliding-window LZ77 codec.
- `toRoman` / `fromRoman` Roman numeral round-trip (1..3999).
- `parseDuration` / `formatDurationShort` "1h30m" duration helpers.
- `Kalman1D` scalar Kalman filter for noisy 1-D measurements.
- `deCasteljauCubic` / `sampleCubicBezier` numerically stable Bezier eval.

## v4.31.0 - 500-Improvement Wave 27: CORDIC, fixed-point, color, geometry

Twenty-seventh wave. 10 more shared modules, 10 new tests pass.

- `cordicSinCos` CORDIC sin/cos (24 iterations, no Math.sin dependency).
- `atan2Approx` fast atan2 approximation (~0.004 rad max error).
- `sinTable` / `cosTable` lookup-table sin/cos with linear interpolation.
- `toQ15` / `q15Add` / `q15Mul` Q15 fixed-point arithmetic.
- `midiNoteToFreq` / `freqToMidiNote` / `midiNoteName` MIDI helpers.
- `rgbToCmyk` / `cmykToRgb` RGB <-> CMYK color conversion.
- `rgbToLab` / `labToRgb` sRGB <-> CIE Lab via D65 illuminant.
- `gammaEncode` / `gammaDecode` gamma correction for byte channels.
- `simplifyDouglasPeucker` Ramer-Douglas-Peucker polyline simplification.
- `greedyColoring` Welsh-Powell greedy graph coloring.

## v4.30.0 - 500-Improvement Wave 26: Bidirectional A*, advanced trees

Twenty-sixth wave. 10 more shared modules, 11 new tests pass.

- `aStarBidirectional` meet-in-the-middle A* with two heap frontiers.
- `SegmentTreeLazy` lazy-propagation range-add range-sum tree.
- `LiChaoTree` lower-envelope minimum query over [xLo, xHi].
- `mosAlgorithm` offline range-query reordering with snake hi.
- `SqrtDecomposition` sqrt-bucket point-update range-sum.
- `PersistentSegmentTree` versioned segment tree with rangeSum lookup.
- `ImplicitTreap` rank-indexed treap (insertAt/removeAt/at).
- `jacobiSymbol` BigInt Jacobi symbol with quadratic reciprocity.
- `polyMul` polynomial multiplication (schoolbook + FFT path).
- `deBruijnSequence` classic recursive de Bruijn B(k, n) generator.

## v4.29.0 - 500-Improvement Wave 25: Monotone, SCC, geometry, compression

Twenty-fifth wave. 10 more shared modules, 12 new tests pass.

- `nextGreaterElements` / `largestRectangleHistogram` monotone-stack helpers.
- `slidingWindowMax` / `slidingWindowMin` monotone-deque sliding window.
- `kosarajuScc` strongly connected components via two-pass DFS.
- `mergeKSortedLists` heap-based K-way merge.
- `WaveletTree` rank/quantile queries over integer sequences.
- `grahamScan` convex hull (Andrew's monotone chain).
- `polygonContains` ray-casting point-in-polygon.
- `segmentsIntersect` segment-segment intersection.
- `huffmanEncode` / `huffmanDecode` prefix-free coding round-trip.
- `rleEncode` / `rleDecode` byte run-length codec.

## v4.28.0 - 500-Improvement Wave 24: Backtracking, hashes, Z-algorithm

Twenty-fourth wave. 10 more shared modules, 11 new tests pass.

- `tspBitmask` Held-Karp exact TSP DP for up to ~24 cities.
- `nQueens` bitmask backtracking with solution count + first board.
- `sudokuSolver` 9x9 backtracking with bitmask constraint propagation.
- `crc16` CRC-16/CCITT-FALSE checksum (poly 0x1021).
- `adler32` Adler-32 checksum (RFC 1950).
- `murmurHash3` x86 32-bit MurmurHash3 with seed.
- `fletcher16` Fletcher-16 position-sensitive checksum.
- `jenkinsHash` one-at-a-time hash.
- `djb2Hash` Bernstein DJB2 string hash.
- `zArray` / `zSearch` Z-algorithm prefix function and pattern search.

## v4.27.0 - 500-Improvement Wave 23: Shortest paths, MST, matching

Twenty-third wave. 10 more shared modules, 14 new tests pass.

- `bellmanFord` single-source shortest paths with negative-cycle detection.
- `floydWarshall` + `floydPath` all-pairs shortest paths and reconstruction.
- `primMst` minimum spanning tree (binary-heap Prim).
- `kruskalMst` minimum spanning tree (union-find Kruskal).
- `articulationPoints` cut-vertex detection (Tarjan lowlink).
- `graphBridges` cut-edge detection (Tarjan lowlink).
- `hopcroftKarp` O(E sqrt V) maximum bipartite matching.
- `stableMarriage` Gale-Shapley stable matching.
- `chineseRemainder` generalized CRT solver over BigInt.
- `gcd` / `lcm` / `gcdMany` / `lcmMany` / `gcdBig` / `lcmBig` helpers.

## v4.26.0 - 500-Improvement Wave 22: Range queries, DP, graph traversal

Twenty-second wave. 10 more shared modules, 16 new tests pass.

- `SparseTable` O(1) idempotent range queries (min/max/gcd) after O(n log n) build.
- `longestIncreasingSubsequence` patience-sort LIS with reconstruction.
- `longestCommonSubsequence` / `longestCommonSubsequenceString` Wagner-Fischer LCS.
- `twoSat` 2-SAT solver via implication graph + Kosaraju SCC.
- `eulerianPath` Hierholzer Eulerian path/circuit on undirected multigraphs.
- `bfsLevels` / `bfsLayers` graph BFS distance and layer extraction.
- `iddfs` iterative-deepening depth-first search for goal queries.
- `findDirectedCycle` / `hasDirectedCycle` three-color iterative cycle detection.
- `coinChangeMin` minimum-coins DP with reconstruction.
- `knapsack01` 0/1 knapsack DP with selected items.

## v4.25.0 - 500-Improvement Wave 21: Signals, geometry, flow networks

Twenty-first wave. 10 more shared modules, 12 new tests pass.

- `Deque<T>` circular-buffer double-ended queue with O(1) operations.
- `PerlinNoise` 2D and 3D classic Perlin gradient noise (seedable).
- `SimplexNoise` 2D simplex noise (smoother than Perlin).
- `catmullRomSpline` interpolating spline through control points.
- `bsplineCurve` De Boor evaluation with clamped uniform knots.
- `polynomialFit` + `polynomialEval` least-squares regression and Horner eval.
- `fft` / `ifft` / `fftFromReal` radix-2 Cooley-Tukey FFT.
- `hammingEncode4` / `hammingDecode7` Hamming(7,4) single-bit error correction.
- `sutherlandHodgmanClip` polygon clipping against convex region.
- `fordFulkerson` Edmonds-Karp max-flow on directed graphs.

## v4.24.0 - 500-Improvement Wave 20: Search, balanced trees, matrices

Twentieth wave. 10 more shared modules, 12 new tests pass.

- `SkipList<T>` probabilistic ordered set with O(log n) expected operations.
- `AvlTree<K>` height-balanced BST with rotation rebalancing.
- `Treap<K>` randomized BST keyed by random priorities.
- `kmpSearch` / `kmpAll` linear-time substring search via KMP failure function.
- `rabinKarpSearch` / `rabinKarpAll` rolling-hash substring search.
- `longestPalindrome` Manacher's algorithm in O(n).
- `suffixArray` + `lcpArray` for fast substring/text indexing.
- `editScript` Wagner-Fischer with full edit-op traceback.
- `mat4*` 4x4 column-major matrix utilities (multiply/transpose/translate/scale/rotate).
- `CountingBloomFilter` add/remove/contains with small per-cell counters.

## v4.23.0 - 500-Improvement Wave 19: Graphs, trees, number theory

Nineteenth wave. 10 more shared modules, 18 new tests pass.

### Added
- `UnionFind` disjoint-set union with path compression and union by rank.
- `SegmentTree<T>` arbitrary-combiner range queries with point updates.
- `FenwickTree` binary indexed tree for prefix sums.
- `topologicalSort` Kahn's algorithm with cycle detection.
- `dijkstra` / `reconstructPath` shortest paths with binary-heap PQ.
- `tarjanSCC` iterative Tarjan strongly-connected components.
- `primeSieve` / `isPrimeTrial` Sieve of Eratosthenes + trial division.
- `millerRabin` deterministic Miller-Rabin primality (n < 2^64).
- `extendedGcd` / `modInverse` BigInt extended Euclidean + modular inverse.
- `mat2Multiply` / `mat2Determinant` / `mat2Inverse` and `mat3*` matrix utilities.

### Changed
- Barrel re-exports all 10 new Wave 19 modules.
- `package.json` bumped to 4.23.0.

## v4.22.0 - 500-Improvement Wave 18: Probabilistic, geometry, scheduling, formats

Eighteenth wave. 10 more shared modules, 17 new tests pass.

### Added
- `CuckooFilter` probabilistic membership with deletion.
- `CountMinSketch` sub-linear-memory frequency estimator.
- `HyperLogLog` cardinality estimator with bias correction.
- `splitmix64` seedable BigInt PRNG with uint32 + nextFloat helpers.
- `mergeIntervals` / `subtractIntervals` / `intersectIntervals` 1D interval set ops.
- `polygonArea` / `polygonSignedArea` / `polygonCentroid` / `isClockwise` polygon utilities.
- `convexHull` Andrew's monotone-chain hull.
- `RoundRobin<T>` cycling iterator with predicate-skip.
- `parseTsv` / `writeTsv` RFC4180-style tab-separated values.
- `code128Checksum` / `code128Encode` Code-128 subset B bar-pattern encoder.

### Changed
- Barrel re-exports all 10 new Wave 18 modules.
- `package.json` bumped to 4.22.0.

## v4.21.0 - 500-Improvement Wave 17: Multi-pattern, hashing, geometry

Seventeenth wave. 10 more shared modules, 23 new tests pass.

### Added
- `AhoCorasick` multi-pattern string matcher.
- `boyerMooreSearch` / `boyerMooreAll` Boyer-Moore-Horspool single-pattern search.
- `crc32` / `crc32Hex` IEEE 802.3 CRC-32 (renderer-side pure JS).
- `RadixTree<V>` compressed trie with prefix listing.
- `rectsOverlap` / `rectIntersection` / `rectsBoundingBox` / `rectContains` axis-aligned rectangle helpers.
- `hilbertXYToIndex` / `hilbertIndexToXY` Hilbert space-filling curve mapping.
- `mortonEncode` / `mortonDecode` Morton (Z-order) 2D <-> 1D mapping.
- `quatFromAxisAngle` / `quatMul` / `quatRotateVec` / `quatSlerp` quaternion math.
- `simhash64` / `simhashHamming` similarity hashing.
- `xxhash32` / `xxhash32Hex` non-cryptographic xxHash32.

### Changed
- Barrel re-exports all 10 new Wave 17 modules.
- `package.json` bumped to 4.21.0.

## v4.20.0 - 500-Improvement Wave 16: Fuzzy match, hashing, sampling, varint

Sixteenth wave. 10 more shared modules, 25 new tests pass.

### Added
- `damerauDistance` Damerau-Levenshtein edit distance (with transposition).
- `wildcardMatch` glob match supporting `*`, `?`, `**`.
- `arc4Stream` / `arc4Encrypt` RC4 stream cipher (TEST/EDUCATION ONLY, not crypto).
- `fnv1a32` / `fnv1a32Hex` non-cryptographic FNV-1a hash.
- `ReservoirSampler` / `reservoirSample` Algorithm R streaming sampler.
- `TopKHeap` streaming top-K via min-heap.
- `bitapSearch` Bitap (Wu-Manber) approximate substring search.
- `zigZagEncode` / `zigZagDecode` int32 <-> uint32 ZigZag encoding.
- `base58Encode` / `base58Decode` Bitcoin-alphabet Base58 codec.
- `pcg32` PCG-XSH-RR seedable PRNG (uint32 + nextFloat).

### Changed
- Barrel re-exports all 10 new Wave 16 modules.
- `package.json` bumped to 4.20.0.

## v4.19.0 - 500-Improvement Wave 15: Radix, A*, ULID, color, scheduling

Fifteenth wave. 10 more shared modules, 22 new tests pass.

### Added
- `radixSort` LSD radix sort for uint32 arrays.
- `LruWeak` object-keyed cache backed by `WeakRef`.
- `aStar` A* shortest-path with caller-supplied neighbors/cost/heuristic.
- `simplifyPolyline` Ramer-Douglas-Peucker polyline simplification.
- `ulid` ULID generator (Crockford base32, 26-char, sortable).
- `shannonEntropy` bits-per-symbol entropy measurement.
- `MarkovChain` order-N Markov chain trainer/sampler.
- `rgbToHsv` / `hsvToRgb` RGB <-> HSV color conversions.
- `PriorityScheduler` cooperative priority job runner.
- `BitSet` packed Uint32-backed fixed-capacity bit set.

### Changed
- Barrel re-exports all 10 new Wave 15 modules.
- `package.json` bumped to 4.19.0.

## v4.18.0 - 500-Improvement Wave 14: Stable sort, spatial, weighted, schedule

Fourteenth wave. 10 more shared modules, 27 new tests pass.

### Added
- `mergeSort` stable sort (does not mutate input).
- `KdTree2` 2D k-d tree with `nearest` and `rangeQuery`.
- `WeightedRandom` cumulative-table weighted sampling.
- `dateRangeDays`, `dateRangeMonths`, `daysBetween` UTC date iteration.
- `parseCron` / `nextCronAfter` 5-field cron parser and next-run calculator.
- `cidrMatch` IPv4/IPv6 subnet membership testing.
- `chunkArray` fixed-size array splitter.
- `flattenObject` / `unflatten` dot-key conversion.
- `htmlDecode` HTML entity decoder (counterpart to `xmlEscape`).
- `structClone` safe deep clone with structuredClone-or-fallback.

### Changed
- Barrel re-exports all 10 new Wave 14 modules.
- `package.json` bumped to 4.18.0.

## v4.17.0 - 500-Improvement Wave 13: Sort, search, batching, IDs

Thirteenth wave. 10 more shared modules, 28 new tests pass.

### Added
- `quickSort` in-place sort with median-of-three pivot and insertion-sort cutoff.
- `binarySearch`, `lowerBound`, `upperBound` for sorted arrays.
- `shuffleSeeded` deterministic Fisher-Yates using mulberry32.
- `zip` / `zipLongest` / `unzip` parallel iteration helpers.
- `groupBy` / `keyBy` / `countBy` collection groupers.
- `rangeIter` / `rangeArray` / `enumerate` Python-style iteration.
- `debouncePromise` latest-wins async debounce that coalesces concurrent callers.
- `BatchScheduler` window-based batch flusher with `maxBatch` cap.
- `expoBackoff` pure exponential backoff calculator (none/full/equal/decorrelated jitter).
- `uuidV7` time-ordered UUIDs (RFC 9562) with injectable `now` and `random`.

### Changed
- Barrel re-exports all 10 new Wave 13 modules.
- `package.json` bumped to 4.17.0.

## v4.16.0 - 500-Improvement Wave 12: Cookies, IPs, JWT, CSV, tables

Twelfth wave. 10 more shared modules, 24 new tests pass.

### Added
- `parseCookies` / `serializeCookie` (RFC 6265 with quoted-value handling).
- `sanitizeFilenameStrict` cross-platform filename hardening (Windows reserved names, control chars, trailing dots, length-aware extension preservation).
- `encodeHex` / `decodeHex` base16 codec.
- `parseIPv4` / `parseIPv6` strict numeric parsers with `formatIPv4` / `formatIPv6` (`::` compression).
- `jwtDecodeNoVerify` parser-only JWT decoder. Never use for authorization.
- `parseUrlExtended` / `buildUrlExtended` structured URL split with multi-value query support.
- `objectToFormData` / `formDataToObject` form-encoded helpers with `[]` array convention.
- `csvWrite` RFC 4180 writer with formula-injection neutralization.
- `asciiTable` fixed-width log/CLI table renderer with per-column alignment.
- `mdSerialize` deterministic Markdown serializer for diffs.

### Changed
- Barrel re-exports all 10 new Wave 12 modules.
- `package.json` bumped to 4.16.0.

## v4.15.0 - 500-Improvement Wave 11: Trie, lazy, mutex, paths, errors

Eleventh wave. 10 more shared modules, 26 new tests pass.

### Added
- `Trie<V>` prefix tree with `prefixSearch` (lex-sorted, optional limit).
- `lazy` and `lazyAsync` memoized one-shot value producers (with reset).
- `AsyncMutex` cooperative async lock with FIFO fairness and `runExclusive`.
- `PubSub` topic bus with `*` and `**` wildcard matching.
- `pathParse` POSIX path utils: `joinPath`, `dirname`, `basename`, `extname`, `normalizePath`, `relativePath`.
- `CodedError<C>` typed error with `code`, `cause`, `details`, plus `isCodedError`, `hasCode`, `wrapError`.
- `RetryBudget` sliding-window retry quota.
- `IdleQueue` requestIdleCallback-backed work queue with setTimeout fallback.
- `heapSort` + `partialHeapSort` in-place comparator-aware sorters.
- `encodeBase32` / `decodeBase32` (RFC 4648 alphabet).

### Changed
- Barrel re-exports all 10 new Wave 11 modules.
- `package.json` bumped to 4.15.0.

## v4.14.0 - 500-Improvement Wave 10: Chords, focus, perf, fuzzy, intervals

Tenth wave. 10 more shared modules. 28 new tests pass.

### Added
- `parseChord`/`matchChord`/`chordToString` keyboard-shortcut helpers.
- `createFocusVisible` controller that toggles a focus-visible class only on keyboard interaction.
- `perfMark`/`perfMeasure`/`perfTime`/`perfTimeAsync` User Timing wrapper with safe fallback and a recent-measures ring.
- `BloomFilter` + `recommendBloomParams` probabilistic set membership.
- `caseConvert` module: `kebabCase`, `snakeCase`, `camelCase`, `pascalCase`, `titleCase`, `constantCase`.
- `levenshtein` distance + `similarity` + `bestMatch` fuzzy selector.
- `IntervalTree<T>` half-open interval container with point and range queries.
- `TypedEventEmitter<E>` strongly typed pub/sub with `on`/`once`/`off`/`emit`/`listenerCount`.
- `createLazyImageLoader` IntersectionObserver-based image loader with no-IO fallback.
- `parseRetryAfter` + `retryAfterDelay` HTTP Retry-After parser with jitter and cap.

### Fixed
- `colorBlend.parseRgba`: handle `parseColor` returning `null` under `strictNullChecks` (CI typecheck regression in v4.13.0 fixed in 9baf70c).

### Changed
- Barrel `src/renderer/improvements500/index.ts` re-exports all 10 new modules.
- `package.json` bumped to 4.14.0.

## v4.13.0 - 500-Improvement Wave 9: Concurrency, breakers, signal, paths

Ninth wave. 10 more shared modules. 25 new tests; full wave5-9 suite passes.

### Added
- `AsyncQueue` class: FIFO sequential async work queue. One rejection does not break subsequent tasks.
- `createLimiter`: p-limit-style concurrency cap with `active` and `pending` accessors.
- `CircuitBreaker` + `CircuitBreakerOpenError`: closed/open/half-open state machine with cooldown and injectable clock.
- `TokenBucket`: rate limiter with `tryConsume`, `msUntilAvailable`, `consumeAsync`.
- `MovingAverage` and `ExponentialMovingAverage` rolling-window helpers.
- `combineAbortSignals` + `abortPromise` AbortSignal combinator.
- `SvgPathBuilder` + `roundedRectPath` fluent SVG path d-attribute builder.
- `xmlEscape`/`escapeHtmlAttr`/`unescapeHtml` public XML escapers.
- `unitConvert` module: length (px/in/cm/mm/pt), time, byte conversions with binary or decimal base.
- `colorBlend` module: `parseRgba`, `compositeOver`, premultiplied conversions, `screenBlend`, `toRgbaString`.

### Changed
- Barrel `src/renderer/improvements500/index.ts` re-exports all 10 new modules.
- `package.json` bumped to 4.13.0.

## v4.12.0 - 500-Improvement Wave 8: Throttle, memoize, semver, charts

Eighth wave. 10 more shared modules. 28 new tests; full wave5-8 suite is 106 passing.

### Added
- `throttle` module: time-based `throttle` (leading + trailing edges) and `debounceFn` with cancel/flush.
- `memoize` module: argument-keyed cache with optional `max` FIFO eviction.
- `semver` module: `parseSemver`, `compareSemver`, `compareSemverStrings`, `semverSatisfiesGte`. Pre-release ordering per spec.
- `queryString` module: `stringifyQuery` and `parseQuery` with repeated-key array semantics.
- `urlSafe` module: `parseSafeUrl` blocks javascript:/data:/vbscript:/file: by default; `isHttpUrl`.
- `statsBasic` module: `mean`, `median`, sample `variance`, `stddev`, linear-interpolation `percentile`, `minMax`.
- `dataBinning` module: `histogram` with optional bin count; `sturgesBinCount` helper.
- `chartScale` module: `linearScale`, `logScale`, Wilkinson-style `niceTicks`.
- `textMetrics` module: shared offscreen-canvas `measureText` plus `truncateToWidth` ellipsis helper.
- `Typewriter` class: progressive-prefix text animator with `start`, `append`, `finish`, `stop`.

### Changed
- Barrel `src/renderer/improvements500/index.ts` re-exports all 10 new modules.
- `package.json` bumped to 4.12.0.

## v4.11.0 - 500-Improvement Wave 7: Streaming, gestures, fs, detection

Seventh wave. 10 more shared modules. 24 new tests, default reporter only
(vitest 4 `--reporter=basic` is broken in this repo).

### Added
- `tokenStream` module: SSE/RAG-friendly chunked tokenizer with custom global delimiter regex.
- `citation` module: parses numeric `[1]`, footnote `[^x]`, and citekey `[@key]` markers; strip + dedupe helpers.
- `chunkedJsonParse` module: NDJSON parser that tolerates split chunks, with bounded buffer and onError callback.
- `ringBuffer` module: fixed-capacity circular buffer with O(1) push/shift and overwrite semantics.
- `palmRejection` module: stylus-first input filter; rejects touches concurrent with or near a recent pen contact.
- `zoomInertia` module: exponential-decay momentum integrator with closed-form position update; clamp helper.
- `gestureRecognizer` module: single-pointer state machine for tap, double-tap, long-press, swipe, cancel.
- `fsAdapter` module: filesystem interface plus an in-memory implementation for tests; renderer never touches `fs` directly.
- `whiteScreenDetect` module: heuristic blank-canvas detector for boot/render-failure telemetry.
- `idbCache` module: async key-value cache backed by IndexedDB when available, in-memory fallback otherwise.

### Changed
- Barrel `src/renderer/improvements500/index.ts` re-exports all 10 new modules.
- `package.json` bumped to 4.11.0.

## v4.10.0 - 500-Improvement Wave 6: Random, encode, pack, math primitives

Sixth wave. 10 more shared modules. Two backlog items advanced.

### Added
- `prng` module: seedable mulberry32 RNG plus `randomInt`, `randomChoice`, `shuffleInPlace` for deterministic test fixtures.
- `base64` module: dependency-free encode/decode with URL-safe variant and UTF-8 helpers.
- `uuid` module: RFC 4122 v4 generator with `crypto.randomUUID` fallback chain plus `isUuid` validator.
- `rectPacking` module: best-short-side-fit + guillotine bin packing for sprite atlases and icon caches.
- `velocityTracker` module: pointer fling/momentum velocity sampling.
- `clipboardHistory` module: bounded in-memory ring buffer with consecutive de-dupe.
- `deepEqual` module: structural compare with cycle protection, Date/RegExp value compare, NaN-equal-NaN.
- `deepMerge` module: recursive plain-object merge with `replace` or `concat` array strategy.
- `priorityQueue` module: binary-heap min-priority queue.
- `math` module: `clamp`, `lerp`, `inverseLerp`, `smoothstep`, `modulo`, `wrap`, `approxEqual`.

### Backlog
- T6-031 [~] zustand leak audit primitives (deepEqual + bus clear).
- T7-002 [~] IPC envelope groundwork (uuid + base64 + deepMerge).

### Tests
- 28 new tests in `tests/unit/improvements500-wave6.test.ts`. Total wave coverage now 170 tests across 7 files.

### Internal
- Cleaned up stray debug artifacts `ci-out.txt` and `runs.json` accidentally committed in v4.9.0.

## v4.9.0 - 500-Improvement Wave 5: Diff, parsing, geometry, color, motion

Fifth wave. 10 more shared modules. Four backlog items advanced.

### Added
- `diff` module: line-based diff via LCS, used by collab comments and version compare.
- `csvParse` module: RFC 4180 quote-aware parser (`parseCsv`, `parseCsvObjects`).
- `markdownLite` module: safe-by-default markdown to HTML (escapes raw HTML, blocks `javascript:` and `data:` URLs).
- `geometry` module: `pointInRect`, `pointInPolygon`, `bboxOfPoints`, `rectsIntersect`, `distanceToSegment`.
- `easings` module: 10 curated curves (linear, quad, cubic, back, elastic, bounce).
- `palette` module: `rgbToHsl`/`hslToRgb`/`toHex`/`lighten`/`darken`/`mix`.
- `stateMachine` module: typed FSM with `can`/`send`/`reset` and per-state `onEnter` callbacks.
- `retry` module: async retry with exponential backoff, jitter, and `shouldRetry` predicate.
- `timeFormat` module: `formatDuration` (M:SS / H:MM:SS), `formatDurationCompact`, `formatRelative`.
- `stringSlugify` module: `slugify`, `sanitizeFilename` (Windows reserved-name aware), `ensureUniqueName`.

### Backlog
- T2-035 [~] window header AppIcon tinting helpers (palette).
- T3-026 [~] bus routing matrix transitions (stateMachine).
- T6-019 [~] FFT off-main-thread (workerPool already shipped).
- T6-035 [~] Intl-only date formatting (timeFormat).

### Tests
- 24 new tests in `tests/unit/improvements500-wave5.test.ts`. Total wave coverage now 142 tests across 6 files.

## v4.8.0 - 500-Improvement Wave 4: Search, perf, graph, test infra

Fourth wave. 10 more shared modules. Eight backlog items advanced.

### Added — `src/renderer/improvements500/`

- **Fuzzy search** (`fuzzySearch.ts`): subsequence scorer + `fuzzyFilter`
  with consecutive / word-start / camel-case bonuses. *(T5-002)*
- **Worker pool** (`workerPool.ts`): bounded-concurrency promise pool with
  FIFO queue + drain. *(T6-020)*
- **Async cache** (`asyncCache.ts`): TTL + LRU bound + in-flight
  coalescing. *(T6-022)*
- **Mock IPC** (`mockIpc.ts`): in-memory renderer-IPC harness for tests
  with invocation history. *(T8-031, complete)*
- **Test data factory** (`testFactory.ts`): deterministic id sequence and
  default-shaped fixtures (user/doc/notification). *(T8-030, complete)*
- **Zoom / pan transforms** (`zoomPan.ts`): `worldToScreen`,
  `screenToWorld`, `zoomAt` (anchor-stable), `panBy`, `fitToView`.
  *(T5-001)*
- **rAF throttle** (`rafThrottle.ts`): coalesces high-frequency callers
  into one call per frame. *(T6-016)*
- **Download helpers** (`downloadBlob.ts`): `downloadBlob`, `downloadText`,
  `downloadJson`, `downloadCsv`. *(T6-049)*
- **Force-directed graph layout** (`graphLayout.ts`): repulsion + spring +
  damping, pure simulation tick. *(T5-001 supporting)*
- **Typed event bus** (`eventBus.ts`): `EventBus<TMap>` with `on`, `once`,
  `emit`, `clear`. *(T6-031 supporting)*

### Tests

- New [tests/unit/improvements500-wave4.test.ts](../tests/unit/improvements500-wave4.test.ts)
  (23 tests). All 116 cumulative wave tests pass.



Third wave. 10 more force-multiplier modules covering creative-suite math,
security hardening, and crash-resilience. Advances 16 backlog items.

### Added — `src/renderer/improvements500/`

- **Snap-to-grid + edge snap** (`snap.ts`): `snapToGrid`, `snapToGuides`,
  `snapBoxToBoxes` for canvas alignment. *(T3-067)*
- **WCAG contrast** (`contrast.ts`): `parseColor`, `contrastRatio`,
  `evaluateContrast` (AA / AAA / large). *(T1-053)*
- **PII redaction** (`redact.ts`): regex scrub for emails, JWTs, bearer
  tokens, credit-card / SSN / IP; deep object redaction with cycle guard.
  *(T7-004, T7-029, T7-030)*
- **Crash recovery** (`crashRecovery.ts`): `saveRecovery`, `loadRecovery`,
  `previousSessionCrashed`, debounced `autoSave`. *(T6-047, T9-007)*
- **Audit log** (`audit.ts`): append-only ring buffer per channel.
  *(T7-010)*
- **Long-task tracker** (`longTask.ts`): PerformanceObserver longtask + a
  `measureSpan` helper. *(T6-044)*
- **MIDI mapping** (`midiMapping.ts`): bindings store + CC value scaling.
  *(T3-021)*
- **LUFS meter** (`lufs.ts`): momentary (400ms) + short-term (3s) loudness
  with K-weighting approximation. *(T3-028)*
- **Particle emitter** (`particles.ts`): pure simulation tick + spawn /
  drag / gravity. *(T3-058)*
- **Plugin sandbox protocol** (`pluginSandbox.ts`): permission gates,
  storage quota enforcement, network allowlist with `*.host` wildcards.
  *(T7-012, T7-013, T7-014, T7-015)*

### Tests

- New [tests/unit/improvements500-wave3.test.ts](../tests/unit/improvements500-wave3.test.ts)
  (23 tests). All 93 cumulative wave tests pass.



Second shipping wave. Adds 10 more force-multiplier modules under
`src/renderer/improvements500/`, advancing 29 backlog items.

### Added

- **List virtualization** (`virtualList.ts`): `computeSlice` pure math +
  `useVirtualList` hook with ResizeObserver. *(T6-001..006)*
- **Leak-safe effect helpers** (`safeEffects.ts`): `useTimeout`,
  `useInterval`, `useEventListener`, `useRaf`, `useFetchJson`
  (auto-aborting), `useDocumentVisible`, `useDebounced`. *(T6-015, T6-017,
  T6-026, T6-027, T6-029, T6-030, T6-032)*
- **LRU cache** (`lru.ts`): capacity-bounded with bump-on-get. *(T6-024)*
- **Modal focus trap** (`focusTrap.ts`): Tab cycle + initial focus + ESC.
  *(T1-050)*
- **Live region announcer** (`liveRegion.ts`): polite/assertive global
  channels with idempotent re-announce. *(T1-051, T1-057, T1-059)*
- **OS a11y preference hooks** (`a11yPrefs.ts`): `useReducedMotion`,
  `useHighContrast`, `useDarkScheme`. *(T1-055, T1-056)*
- **Command palette registry** (`commandPalette.ts`): register / search with
  consecutive-streak fuzzy scoring. *(T9-004)*
- **Shortcut registry + remap** (`shortcuts.ts`): default + per-user binding,
  parser, dispatcher, cheat-sheet data. *(T9-003, T9-021)*
- **Idle detector** (`idleDetector.ts`): active/idle/away transitions on
  pointer/keyboard/touch input. *(T4-039, T7-009)*
- **Secure clipboard** (`secureClipboard.ts`): `copySecret` with auto-clear
  and `readClipboard` gated on recent user gesture. *(T7-008, T7-032)*

### Tests

- New [tests/unit/improvements500-wave2.test.ts](../tests/unit/improvements500-wave2.test.ts)
  (20 tests covering all 10 new modules). All 70 cumulative wave tests pass.

### Notes

Twenty-nine backlog items are now `[~]` infrastructure-shipped pending UI
integration. Wave 3 will start wiring these into call sites across apps.



First shipping wave of the 500-improvement program. This release focuses on
landing the *shared infrastructure* that subsequent UI integrations will
consume one-line at a time, plus a CI root-cause fix and accessibility polish
on AXL.

### Added — `src/renderer/improvements500/`

- **Accessibility helpers** (`aria.ts`): `ariaButton`, `ariaToggle`,
  `ariaTrigger`, `ariaCurrent`, `ariaLive`, `ariaInput` — single-call helpers
  that produce correct ARIA attribute bundles for common control patterns.
- **Roving tab-index** (`useArrowNav.ts`): hook with horizontal / vertical /
  grid orientation modes and optional wrap.
- **Pinch-zoom hook** (`usePinchZoom.ts`): two-pointer scale tracker with
  configurable min/max clamp.
- **Tick-budget scheduler** (`useTickBudget.ts`): drains queued work across
  rAF frames without exceeding a time budget; `rafThrottle` helper.
- **IPC permission gate** (`withPermission.ts`): channel/permission/validate/
  rate-limit/sensitive-key redaction wrapper for main-process IPC handlers.
- **Bezier + easing** (`bezierKeyframes.ts`): `cubicBezier`,
  `cubicBezierEasing`, `EASING_PRESETS` (linear/easeIn/easeOut/easeInOut/
  elasticIn/elasticOut/back/bounce), `interpolateKeyframes` with optional
  in/out tangents. *(T3-051 partial, T3-052)*
- **Pen input** (`penInput.ts`): `samplePen` (palm-rejection heuristic),
  `applyBrushDynamics` (pressure → size/opacity, tilt → angle),
  `isEraserGesture`. *(T11-018..023)*
- **Multi-touch swipes** (`multiTouchSwipe.ts`): `MultiTouchSwipe` tracker
  + `swipeToShellAction` mapping for window minimize/maximize, app cycle,
  and overview gestures. *(T11-007..010)*
- **Smart collections + duplicate detection** (`smartCollections.ts`):
  `applyCollection` AND-rule filter (eq/contains/startsWith/endsWith/gt/lt),
  `shingles`, `jaccard`, `findDuplicates`. *(T5-047, T5-048)*
- **Comments + version diff** (`collabComments.ts`): `newComment`,
  `extractMentions`, line-level `lineDiff` + `diffStats`.
  *(T4-003, T4-008, T4-022, T4-024)*
- **Workspace layouts** (`workspaceLayouts.ts`): named window-arrangement
  presets per workspace, persisted to localStorage. *(T9-022, T9-023)*
- **Notification policy** (`notifications.ts`): DND, per-app mute, snooze,
  cross-midnight quiet hours, and per-app grouping.
  *(T4-036, T4-037, T4-038, T9-014, T9-025)*
- **Presence registry** (`presence.ts`): online/idle/busy/offline with
  custom-text status, alphabetical peer listing, idle pruning.

### Fixed

- **CI: UKI cache crashed in environments without WebCrypto**.
  `cache.setAsync` now wraps `crypto.subtle.encrypt` in a try/catch and
  degrades to a plaintext envelope (logged once) instead of throwing. This
  is the root-cause fix for repeated CI failures on Linux runners and lets
  the strict UKI compression / knowledge-feeder assertions stand.
- **AXL: 6 close/share/AI buttons missing accessible names**. Added
  `aria-label` to the parts library close, feature create close, GD&T create
  close, AI panel close, BOM close, and Share project buttons. *(T1-026
  partial)*

### Tests

- New `tests/unit/improvements500-shared.test.ts` (18 tests, aria + perms +
  rafThrottle + presence).
- New `tests/unit/improvements500-features.test.ts` (32 tests, bezier + pen
  + swipe + smart collections + comments + diff + workspace layouts +
  notifications).

### Notes

This wave intentionally ships *infrastructure first*. Items marked `[~]`
in [`docs/IMPROVEMENTS_500.md`](IMPROVEMENTS_500.md) have their core helpers
landed and tested but still need UI integration in subsequent waves. Items
marked `[x]` are complete (helpers exist and the surface they target consumes
them or is purely an API surface).



Small performance polish release on top of v4.0.1.2b.

- **App open smoothness**: app load metrics are written after first paint
  instead of during mount, reducing open-time jank.
- **Creative app loading**: loading dots/progress update less aggressively and
  respect reduced-motion settings.
- **Wallpaper sliders**: blur, opacity, and tint persistence is debounced so
  dragging controls does not write localStorage on every tiny movement.
- **Wallpaper accent extraction**: k-means palette extraction no longer creates
  filtered pixel arrays on every iteration, reducing memory churn during
  wallpaper changes.
- **Diagnostics**: browser tab-request and power cleanup failures now log
  instead of disappearing silently.

## v4.0.1.2b - Auto-update repo fix + Settings icons + scrubber hit area

Critical bugfix release. The v3.x and v4.0.0/v4.0.1-2a installers were built
with the wrong electron-updater feed (`onazioj/dex` instead of
`onazioj179-lab/Dex`), so old installs silently failed to discover updates.
Going forward, fresh installs of v4.0.1-2b+ point at the real GitHub repo and
will auto-update normally. Existing users must download v4.0.1-2b once
manually from https://github.com/onazioj179-lab/Dex/releases.

- **Auto-update**: `package.json` `build.publish` now targets
  `onazioj179-lab/Dex`. `ReleaseManager` downgrade and "open releases"
  fallback URLs corrected. `DocGenerator` GitHub link corrected.
- **Settings icons**: Plugin Marketplace, Nexus Biometrics, and Account each
  get a unique sidebar icon (puzzle / face / user) instead of reusing the
  privacy / creative-suite icon.
- **Settings appearance**: Accent color picker had a duplicate
  `var(--color-warning)` swatch; replaced with distinct `#ff9f0a` so all 8
  swatches are unique.
- **Audio scrubber**: progress and volume bars went from a 4 px clickable
  strip to a 16 px hit area (visible track stays 4 px) so seek/volume drags
  are reliable.
- **AXL right-click**: viewport context menu now opens regardless of
  selection, with view (Front/Top/Right/3D) and Add Primitive entries when
  no part is selected.
- **DexIcon**: dev-only `console.warn` once per missing icon name so blank
  icons surface in DevTools.

## v4.0.1.2a - Shell fit, UKI, and Nexus completion fix

Bugfix/completion pass for the v4.0.1 desktop runtime. The packaged semver is
`4.0.1-2a` so Electron/npm tooling can build a valid installer while the user
release label remains v4.0.1.2a.

- Fixed new app launches so every app opens into the safe inner workspace below
  the top bar, with no dock-reserved bottom gap and no accidental dock pop over
  maximized work.
- Reworked shell window layout math into a shared tested helper and clamped
  maximized/restored windows to the visible workspace after resize.
- Removed blur-heavy app-menu behavior and tightened dropdown/context-menu
  listener cleanup so menus stop washing out the screen or double-handling
  pointer events.
- Fixed UKI typed backend queries so main-process responses are not echoed back
  through a second local stream/TTS path, and app-control actions only dispatch
  for explicit commands.
- Polished Nexus across the full page: calmer DEX graph palette, cleaned top
  chrome, search dropdown, lower controls, side HUDs, labels, tooltip, and web
  results panel.
- Polished Imosion's root app chrome for full-window fit, solid menus, stable
  scrolling toolbar behavior, and less fragile compact controls.
- Added missing shared icon definitions used by creative and standalone apps so
  icon-only buttons no longer render as blank fallback controls.

## v4.0.1 - "Boil the Ocean" platform deepening (Waves A-J, 169 new tests)

A second 10-wave platform pass shipping pure, deterministic, dependency-free
modules under `src/shared/` that complement the v4.0.0 Q-Z leapfrog. Every
module is fully typed, fully unit-tested, watermarked, and free of Electron,
React, DOM, or Node runtime coupling so it can be reused across main,
renderer, workers, kernel, native bridges, and headless tooling alike.

- Wave A - creative foundations (`src/shared/creative/foundations.ts`)
  capped UndoStack with byte budget, autosave scheduler with idle gating,
  project health checks, export validation against known formats, asset
  relink suggester (hash -> name+size -> name -> size), background queue
  summary, and a heuristic preset/budget tier picker.
- Wave B - audio mastering (`src/shared/audio/mastering.ts`) RBJ biquad
  cookbook (LP/HP/BP/notch/peaking/lowshelf/highshelf), ADSR envelope,
  BS.1770 K-weighted LUFS, 4x oversampled true-peak, soft-knee compressor,
  brick-wall limiter, energy-autocorrelation BPM detector, four pan laws,
  Krumhansl key detection, beat quantize + humanize, and platform LUFS
  targets (Spotify/Apple/YouTube/Tidal/broadcast).
- Wave C - video post (`src/shared/video/post.ts`) proxy spec chooser and
  byte estimator, scene detector (luma + histogram delta), audio-aligned
  multicam cross-correlation, SRT + VTT parse/serialize round-trip,
  histogram + luma waveform, automated QC checks, and drop-frame /
  non-drop-frame timecode <-> frame conversion.
- Wave D - image layers (`src/shared/image/layers.ts`) layer stack with 12
  blend modes, 13 adjustment kinds, recursive group flatten, sRGB <->
  linear, exposure / contrast / gamma / levels, 1D LUT build + evaluate,
  tile cache keying, histogram, and auto-correct analysis.
- Wave E - motion + 3D animation (`src/shared/motion3d/animation.ts`) 16
  named easings + cubic-bezier solver, keyframe evaluator with clamping,
  particle stepper with global cap, 2-bone analytic IK, and a sandboxed
  expression evaluator with allowlist + identifier whitelist.
- Wave F - CAD measurement (`src/shared/cad/measurement.ts`) 2D / 3D
  distance, polygon area / perimeter / centroid, signed-tetrahedra mesh
  volume + surface area, length unit conversion, ISO 2768 tolerance
  lookup, BOM summary by material, and drill pattern generator.
- Wave G - shell snap + spaces (`src/shared/shell/snap.ts`) 15 snap
  presets (halves / thirds / quarters / max / center), multi-display
  containment lookup, hot-corner + edge detection with deterministic
  routing, window stack focus traversal that skips minimized windows,
  and per-space window membership.
- Wave H - UKI verifier (`src/shared/uki/verifier.ts`) plan verification
  with risk ranking + per-tool allowedArgs, calibrated confidence
  combining vector similarity / citation count / tool errors /
  hallucination flags / retrieval recall / model logprob, citation
  finder by sentence word-set match, intent matcher (string + regex),
  and dry-run plan summariser.
- Wave I - security + privacy (`src/shared/security/privacy.ts`)
  recursive schema validator (string / number / integer / boolean /
  array / object / null + min/max/pattern/enum/items/properties/
  additionalProperties/maxLength/optional), secret redactor for GitHub
  PATs / OAuth, AWS access + secret keys, JWTs, OpenAI keys, emails,
  card numbers, E.164 phones, and Win/macOS/Linux user paths,
  permission grant lifecycle (validity + expiry pruning), semver
  comparison, sha256 + version validators, and a guarded update
  evaluator.
- Wave J - power + macros (`src/shared/power/macros.ts`) snippet engine
  with `$CLIPBOARD` / `$SELECTION` / `$FILENAME` / `$DATE(fmt)` /
  `${k}` variables, `$0` cursor, `${N:default}` and `$N` tabstops,
  macro normaliser + duration + adjacent-text compressor, fuzzy matcher
  with subseq + consecutive + word-boundary bonuses, hotkey combo
  normaliser (mod order ctrl -> alt -> shift -> meta), and per-scope
  conflict detector.

Other improvements:

- Updated `tests/unit/update-aliases.test.ts` to match the current
  ReleaseManager IPC surface (12 primary + 15 alias/extended channels;
  was asserting a stale 24).
- Bumped version `4.0.0` -> `4.0.1`.

## v4.0.0 - "Surpass the Competition" leapfrog (Waves Q-Z, 190 new tests)

A 10-wave leapfrog release shipping deterministic, dependency-free
primitives in `src/shared/` that match or exceed Logic Pro, Premiere,
After Effects, Blender, CAD pipelines, Photoshop, macOS / Windows 11 /
Linux shells, enterprise security stacks, real-time collaboration
platforms, modern AI orchestration, and power-user / accessibility
("weird mode") tooling.

- Wave Q - audio DSP + analysis (36 tests, `src/shared/audio/`)
- Wave R - video pipeline + color + captions (27 tests, `src/shared/video/`)
- Wave S - motion + 3D math (13 tests, `src/shared/motion3d/`)
- Wave T - CAD + simulation (18 tests, `src/shared/cad/`)
- Wave U - non-destructive image AI (16 tests, `src/shared/image/`)
- Wave V - OS shell parity (15 tests, `src/shared/shell/`)
- Wave W - cybersecurity hardening v4 (16 tests, `src/shared/security/v4/`)
- Wave X - real-time collab + cloud sync v4 (14 tests, `src/shared/collab/v4/`)
- Wave Y - UKI super-intelligence v4 (14 tests, `src/shared/uki/v4/`)
- Wave Z - power-user weird mode (21 tests, `src/shared/power/`)

All primitives are pure modules: no DOM, IPC, electron, network or
filesystem coupling. Callers inject clocks, RNG, and hash functions
explicitly so every test is deterministic. Each wave shipped as its own
commit on `main` and went through the full gate sequence
(`add-watermarks` → `tsc --noEmit` → focused vitest → `npm run build`)
before push.

## v3.9.0 - "Boil the Ocean" polish (10 waves, 259 new tests)

A 10-wave polish release that lands ~500 user-visible improvements as
deterministic pure-data primitives in `src/shared/`. Every primitive is
covered by a dedicated test file under `tests/unit/v389-wave<X>-*.test.ts`
and is wired-in incrementally by the renderer and main process. The test
suite grew from 1223 to **1482 passing tests across 73 files** with no
regressions.

Each wave shipped as its own commit on `main` and went through the full
gate sequence (`add-watermarks` → `tsc --noEmit` → full vitest suite →
`npm run build`) before push.

### Wave G — Operation smoothness (33 tests)
- `src/shared/perf/smoothness.ts` — frame-budget stepper with `FRAME_BUDGET_MS=12`,
  debounce/throttle planners, hover-intent state machine (80 ms),
  scroll memory with negative-value clamping, priority `PrefetchQueue<T>`
  with id dedupe, long-task buffer + summariser, reduced-motion-aware
  effective animation duration helper.
- `src/shared/perf/optimistic.ts` — `OptimisticStore<T>` with
  `beginMutation`/`commitMutation` (server-value override) /
  `rollbackMutation` (drops created entries) and `pruneStale`.

### Wave H — Untouched UI surfaces (16 tests)
- `src/shared/theme/surfaces.ts` — 18-key empty-state catalogue,
  `rankPalette` with prefix/substring/subseq scoring + recency boost,
  scoped key-binding registry (8 scopes, globals-first), focus-ring
  tokens, TTL-driven toast queue with id-replace and sticky support.

### Wave I — Pricing & revenue plumbing (26 tests)
- `src/shared/license/revenue.ts` — capability-driven feature gates
  with trial bypass, `buildPlanPicker` with most-popular/best-value/free
  badges, per-seat quoting, promo-code format validation, receipt
  normaliser + sorter, retention ladder (pause → discount → cancel),
  trial-countdown coloring tiers.

### Wave J — Reliability & self-healing (27 tests)
- `src/shared/security/reliability.ts` — autosave snapshots with
  `AUTOSAVE_INTERVAL_MS=60000` and force-on-blur, jittered exponential
  backoff (`DEFAULT_BACKOFF`), three-state circuit breaker
  (closed/open/half-open) with cooldown probes, native module health
  summary (ok/mismatch/failed/missing), disk guard with warn (200 MB)
  and block (50 MB) thresholds, FIFO crash queue (`CRASH_QUEUE_CAPACITY=50`)
  with consent-gated upload.

### Wave K — A11y + i18n foundation (33 tests)
- `src/shared/i18n/a11y.ts` — WCAG `relativeLuminance` + `contrastRatio`,
  AAA/AA/AA-large classification, color-blind safe palette substitution
  (Wong palette) for protanopia/deuteranopia/tritanopia, aria-label
  resolution chain (explicit → tooltip → prettified action id → "Action"),
  `isFocusable` heuristic, locale-aware `t()` with `{name}` interpolation
  and English fallback, registerable string tables.

### Wave L — UKI intelligence polish (28 tests)
- `src/shared/uki/intelligence.ts` — rolling Brier-score calibration with
  bias clamping, structural plan diff (added/removed/reordered + destructive
  flag), regex-gated `suggestSkills` from selection text, bounded multi-step
  undo log (`UNDO_LOG_CAPACITY=100`), 30-day pattern decay, epsilon-greedy
  suggestion bandit with optimistic priors.

### Wave M — Nexus power features (23 tests)
- `src/shared/nexus/power.ts` — play/pause/seek time-scrubber state machine
  with snap-to-step, multi-select with replace/toggle/range-extend gestures,
  saved-views store with id-replace and capacity, world→minimap projection
  with bounds checking, JSON + SVG graph exporters with XML escaping.

### Wave N — File ops & storage (28 tests)
- `src/shared/cloud/fileOps.ts` — DnD planner that reads modifiers
  (ctrl/alt/shift) and same-vs-cross-root semantics, cancellable bulk
  operation queue with progress and per-item status, age-based trash
  purge with reprieve windows, conflict resolver with rename/overwrite/
  skip/keep-both strategies, priority-ordered sync status badge resolver
  (error → conflict → offline → syncing → pending → synced).

### Wave O — Onboarding & discovery (23 tests)
- `src/shared/onboarding/discovery.ts` — tour state machine with
  next/prev/skip/restart and required-step gating, `TRY_CARDS` catalogue
  (5 entries across 4 scopes), `DAILY_TIPS` rotator with deterministic
  djb2-seeded date selection, "?" search index with prefix/contains/title
  scoring + combo bonus, dependency-gated first-run checklist.

### Wave P — Perf hardening (22 tests)
- `src/shared/perf/hardening.ts` — chunk planner that bin-packs
  non-critical apps under `CHUNK_MAX_KB=500`, viewport-relative image
  lazy-load policy with saveData adjustment, IPC payload trimmer that
  drops optional fields in declared order under `IPC_PAYLOAD_BUDGET_BYTES=256KB`,
  fixed-height virtual-scroll window with overscan, four-tier memory
  pressure classifier with mitigation actions.

### Pricing baseline (carried from v3.8.9)
- DEX Personal $20/mo or $179/yr (save 25%)
- DEX Family $30/mo or $300/yr for up to 5 household members
- DEX Pro $40/mo or $379/yr (save 21%) — commercial use, live collab,
  priority support
- DEX Studio $60/seat/mo or $599/seat/yr — admin console, audit log
- Free Viewer stays free, forever, read-only after trial
- Lifetime tier remains retired; the `lifetime` billing period stays in
  the type system only for historical receipts

### Verification
- `node scripts/add-watermarks.js` — 1155 already canonical, 0 stamped, 0 migrated
- `npx tsc --noEmit` — 0 errors
- `npm test -- --run` — **1482 / 1482 passing across 73 test files**
- `npm run build` — clean, vite + tsc -p tsconfig.main.json both green

### v3.8.9 follow-up - pricing reset to $20 entry, lifetime retired (no version bump)

DEX moves to a Claude-style subscription ladder so the unit economics
actually cover hosting, sync, support, and continued development:

- **Starting price is now $20/mo** for DEX Personal ($179/yr, save 25%).
- **DEX Family** $30/mo or $300/yr for up to 5 household members.
- **DEX Pro** $40/mo or $379/yr (save 21%) -- commercial use, live
  collab, priority support.
- **DEX Studio** $60/seat/mo or $599/seat/yr -- admin console, audit
  log, 99.5% SLA.
- **Free Viewer** stays free, forever, read-only after trial.
- **Lifetime licences are retired for now.** All plans are subscription
  only. Existing lifetime holders keep what they bought; no new
  lifetime tier is offered. The `lifetime` billing period stays in
  the type system and Stripe glue so historical receipts render, but
  no `Plan.prices.lifetime` entries remain.
- All discount programs (student/educator 50%, non-profit 50%, OSS
  maintainer free Pro, switcher one free year of Personal) and the
  30-day trial / 14-day refund are unchanged.

### v3.8.9 follow-up - public copy refresh + pricing bump (no version bump)

Two non-code changes that keep the public surface honest and the unit
economics safe:

- **README rewritten as a short user-facing page.** The historical
  "What is new in 3.8.x / 3.8 / 3.7" wall was removed. The intro,
  "Why people use DEX", trial blurb, pricing table, install pointer,
  and a single link to this changelog are all that remain. No
  internals, no protocol names, no encryption ceremony in the
  README -- those still live in their own docs.
- **Pricing +30% across every tier** (rounded to clean retail).
  Personal $8.99/mo, $64/yr, $129 lifetime. Family $129/yr, $239
  lifetime. Pro $16.99/mo, $155/yr, $259 lifetime. Studio $32.99/seat
  monthly, $299/seat yearly. Free Viewer stays free. Updated in the
  single source of truth `src/shared/license/pricing.ts`, mirrored in
  `store/appstore.config.json`, `docs/PRICING.md`, and `README.md`.
  All discount programs (student / educator / non-profit / OSS /
  switcher) and the 30-day trial / 14-day refund stay exactly as
  before.

### v3.8.9 follow-up - polish + perf wave F (no version bump)

Two additive primitives so any DEX surface can opt into windowed rendering
or lazy-loaded apps without a refactor:

- `src/shared/perf/visibleRange.ts` exports `computeFixedRange`,
  `computeVariableRange` (binary-search prefix sums) and `scrollToIndex`
  with `start`/`center`/`end`/`auto` alignment. Pure math, no DOM, no
  React; consumers feed scrollTop / viewportHeight each frame and
  render only the resulting `[startIndex, endIndex]` window.
- `src/renderer/components/perf/LazyAppLoader.tsx` exports
  `withLazyApp(loader, { appId, fallbackVariant, bareFallback })` which
  pairs `React.lazy` with `Suspense` + the existing `ViewErrorBoundary`
  + `SkeletonPage` for one-line code splitting of any heavy app.
  `LazyAppLoadFailure` is the INTENTIONAL FALLBACK component callers
  can mount when the dynamic import itself rejects.

Coverage: 18 tests in `tests/unit/v389-perf-polish.test.tsx` (10 for
windowing, 5 for `scrollToIndex`, 3 for the lazy loader).

### v3.8.9 follow-up - settings surfaces wave E (no version bump)

`src/renderer/components/settings/` ships seven panes that wire up the
existing shared modules into a consistent macOS-style settings card. Each
pane is a stateless presentational component so the host (Settings.tsx)
keeps owning persisted state.

- `DevicesPane` lists `SessionStore` entries, surfacing trust + revoke
  actions and a "sign out other devices" shortcut.
- `ActivityPane` is a searchable view over `auditLog` with text + CSV
  export buttons that pipe `formatAuditAsText` / `formatAuditAsCsv`.
- `PluginsPane` shows installed plugins with their `CapabilityLedger`
  grants and per-capability revoke buttons.
- `MemoryPane` is a thin wrapper around the wave B `MemoryInspector`
  giving it the shell chrome.
- `AccessibilityPane` toggles contrast, colour-blind palette, density
  and reduced-motion using the existing `theme/accessibility` tokens.
- `StoragePane` renders the `summariseUsage` breakdown, suggestion list
  and largest-items list with per-category clean callbacks.
- `TrashAndVersionsPane` lists `trashBin` entries with restore/purge
  plus an optional `VersionedFile` history with rollback.

`SettingsPaneShell` provides the shared card layout and `formatBytes` /
`formatRelative` helpers used by every pane. Each pane is exported from
`src/renderer/components/settings/index.ts` for easy import.

Coverage: 32 tests in `tests/unit/v389-settings-surfaces.test.tsx`.

### v3.8.9 follow-up - Nexus uplift wave C (no version bump)

`src/shared/nexus/uplift.ts` adds five pure helper bundles that the Nexus
shell (or any visualization surface) can wire up without pulling in D3 or
React:

- `confidenceColor()` maps a UKI confidence score to a node tint that
  matches the trust palette (high/medium/low + unknown fallback).
- Time-scrub helpers (`snapshotRange`, `snapshotIndexAt`,
  `scrubberToIndex`) turn a sorted snapshot list into binary-search lookups
  so the timeline scrubber stays O(log n).
- Filter-chip predicate composer (`buildNodeFilter`, `applyNodeFilter`)
  combines category, confidence band and recency band with AND semantics
  so chips compose cleanly.
- 3D orbit camera math (`createOrbitCamera`, `orbitRotate`, `orbitZoom`,
  `cameraPosition`, `projectPoint`) is matrix-free and side-effect-free,
  ready for the Nexus 3D view without a heavy linear-algebra dep.
- Collab cursor LWW reducer (`createCursorMap`, `applyCursorUpdate`,
  `pruneStaleCursors`, `cursorsOnNode`) is replay-safe and idempotent so
  the existing P2P channel can drive presence badges without bespoke
  conflict logic.

Coverage: 39 tests in `tests/unit/v389-nexus-uplift.test.ts`.

### v3.8.9 follow-up - per-app UKI skills wave D (no version bump)

`src/shared/uki/appSkills.ts` registers 41 per-app skills across 11
creative apps, each scoped to its `appId` and namespaced
`<app>.<verb>` for safe registry merging:

- DexCode (5): explain, fix error, generate test, docstring, refactor
- Terminal (4): explain command, fix stderr, NL->command, search history
- Notes / DexNotes (4): rewrite tone, summarize, bulletize, semantic search
- Forge (4): suggest preset, dedup, watch folder, hash verify
- VINX (3): highlight reel, captions, smart cuts
- Prism (4): subject select, bg remove, color match, smart fill
- Flux (3): suggest animation, expression autocomplete, motion preset
- Imosion (4): mastering coach, stem separation, tempo/key, podcast cleanup
- AXL (3): parametric suggest, GD&T, standard parts
- Rewind (3): semantic search, daily review, pattern detect
- Gallery (4): auto-album, semantic search, duplicates, story

`loadAppSkillRegistry()` merges any subset (or all) into a single
`SkillRegistry` for the renderer to drive UKI with. Coverage: 23 tests in
`tests/unit/v389-uki-app-skills.test.ts`.

### v3.8.9 follow-up - UKI trust UI wave B (no version bump)

User-facing surfaces for the wave A brain landed under
`src/renderer/components/uki/`:

- `ConfidenceChip.tsx` - low/medium/high pill driven by `confidenceLabel`,
  numeric percent on hover, compact mode for chrome
- `CitationsPanel.tsx` - sources list that highlights citation indices
  actually present in the reply body, with optional click-through
- `PiiGuardDialog.tsx` - confirm-before-send dialog showing the original
  text, the redacted text, and every detected finding
- `MemoryInspector.tsx` - search + filter + forget + JSON export over a
  `MemoryStore`, tier tabs (all / short / working / long-term)
- `SkillPicker.tsx` - top-K matched skills for a typed intent with
  keyboard navigation; blocks skills that need missing context
- `StreamingResponse.tsx` - incremental render of an async `StreamReader`
  with done / error / toolCall callbacks

Coverage: 35 deterministic tests in
`tests/unit/v389-uki-trust-ui.test.tsx` (jsdom + @testing-library).

### v3.8.9 follow-up - UKI brain wave A (no version bump)

Foundation for smarter UKI behaviour landed as 7 pure shared modules under
`src/shared/uki/`:

- `planner.ts` - decompose goals into ordered ActionBus steps with deps,
  topological sort, plan validation
- `toolCall.ts` - typed JSON->dispatcher with schema validation, retry
  backoff, confidence floor and budget gate
- `memory.ts` - short / working / long-term memory store with substring
  recall, importance + recency scoring, prune + promote
- `embeddings.ts` - cosine-similarity index with top-k search (linear scan;
  later: native sqlite-vec)
- `skills.ts` - skill registry pairing intent matchers with plan templates;
  appId-scoped, context-aware ranking
- `streaming.ts` - async-iterator wrapper for token streams with map / tee /
  collectToolCalls helpers
- `appContext.ts` - per-app context resolver registry with bounded
  prompt-format helper

Coverage: 84 deterministic tests in `tests/unit/v389-uki-brain.test.ts`.

### v3.8.9 follow-up - consolidation pass (no version bump)

A "boil the ocean" follow-up landed on the same `v3.8.9` line: ~30 new pure
shared modules + 180 new tests + a no-`alert()` rewrite of the account
settings panel. The version stays at `v3.8.9`; the tag stays at the original
ship commit. These modules are pure, self-contained, fully covered by the new
`tests/unit/v389-followup-consolidation.test.ts` suite, and ready to be wired
into UI surfaces in subsequent updates.

**Account hardening.** `src/shared/account/sessions.ts` (device list, trusted
window, step-up policy, suspicious-sign-in heuristic),
`src/shared/account/auditLog.ts` (capped event log + text/csv exporters),
`src/shared/account/magicLink.ts` (issue / verify / consume with email +
fingerprint binding and 10-minute lifetime).

**Security primitives.** `security/pwnedCheck.ts` (k-anonymity response
parser, severity grading), `security/secretRedactor.ts` (AWS / GitHub / JWT /
private-key detector + redactor), `security/urlPolicy.ts` (allow / deny lists,
private-IP blocking, scheme allowlist), `security/cspBuilder.ts` (renderer CSP
builder, no `unsafe-inline` by default), `security/emailCanonical.ts`
(plus-tag stripping, gmail-dot collapse, honeypot + dwell-time bot detector).

**Cloud storage internals.** `cloud/dedup.ts` (content-id refcounting,
chunk ranges), `cloud/trashBin.ts` (TTL-based recycle bin with sweeper),
`cloud/versioning.ts` (keep-N history with rollback that preserves history),
`cloud/selectiveSync.ts` (gitignore-style include / exclude),
`cloud/bandwidthCap.ts` (time-window pacing with wrap-around),
`cloud/conflictResolver.ts` (3-way base / mine / theirs auto-merge),
`cloud/coldTier.ts` (idle-based demotion, recent-access promotion, thaw ETA),
`cloud/storageBreakdown.ts` (category roll-ups, stale-large finder, cleanup
suggestions), `cloud/shareLinks.ts` (revocable share tokens with passphrase,
opens cap, and expiry).

**UKI runtime.** `uki/tokenBudget.ts` (rolling-window charge / cap),
`uki/confidence.ts` (logprob + citation + retry score, label bands, citation
extraction), `uki/promptTemplates.ts` (validated `{{var}}` substitution +
control-character stripping + standard summarise / rewrite / bullet
templates), `uki/piiDetector.ts` (email / phone / SSN / credit-card with Luhn
gating / IPv4 / IPv6, with redactor), `uki/webCache.ts` (TTL cache with
oldest-eviction + per-tool budget), `uki/agentProfile.ts` (researcher /
writer / coder / planner profiles, deterministic seeding overlay).

**Collaboration.** `collab/comments.ts` (threaded tree with edit / resolve /
cascade-delete), `collab/reactions.ts` (semantic reaction names - thumbs-up,
eyes, heart, celebrate, questioning, thinking - **no emojis**, plus mention
parser that ignores email-style `@`), `collab/crdt.ts` (LWW register +
G-Counter with deterministic actor tie-break), `collab/kanban.ts` (board /
column / card with WIP limits).

**Payments.** `payment/coupons.ts` (percent / amount / free-months with min
spend, plan scoping, and one-use enforcement), `payment/referrals.ts`
(deterministic 8-char codes, monthly cap with prorating), `payment/trial.ts`
(idle / active / expired / converted / cancelled state machine + dunning
schedule with success short-circuit), `payment/tax.ts` (30+ country VAT
table, Intl-backed currency formatter with fallback, FX conversion).

**Plugin platform.** `plugin/manifest.ts` (reverse-DNS id, semver, capability
allowlist, manifest validator + capability ledger), `plugin/eventBus.ts`
(typed pub-sub with per-plugin detach for clean unload).

**Cross-cutting.** `i18n/messages.ts` (`{var}` + ICU-style plurals, RTL
locale detection, locale fallback chain), `perf/helpers.ts` (debounce,
throttle, deterministic-jitter retry, virtualised `visibleRange`),
`theme/accessibility.ts` (high-contrast palettes, three colour-blind palettes
based on Wong, density scales), `onboarding/helpers.ts` (changelog parser
that finds the entry for the current version, persona quiz, NPS prompter +
score), `commands/registry.ts` (palette command store, fuzzy ranker, `argv`
parser with `--key=value` and `--key value`, public API contract version).

**Account settings UI no longer uses `alert()`.** The two `alert()` calls in
`AccountSettingsCard.tsx` have been replaced with two inline panels (billing
+ plan compare) inside the signed-in view. Both panels have an honest stub
banner if no callback handler is wired in. New props `onManageBilling` and
`onComparePlans` allow host code to take over with a real surface.

**Tests.** `tests/unit/v389-followup-consolidation.test.ts` adds 180 new unit
tests across 56 suites for everything above. Total suite is now **973 tests**
across **56 files**, all passing. `tsc --noEmit` reports zero errors and
`npm run build` ships clean.

### v3.8.9 follow-up - UI surfaces (no version bump)

The three UI surfaces that the consolidation pass left for later have now
landed on the same `v3.8.9` line:

- **`PlanComparePanel`** (`src/renderer/components/account/PlanComparePanel.tsx`).
  Side-by-side plan grid driven entirely by `pricing.PLANS` and `proPerks.PRO_PERKS`.
  Inline SVG check / dash icons (no emojis), monthly / yearly toggle with savings
  callout, "Choose plan" Button per column, current-plan column shows a disabled
  "Current plan" pill. Wired into `AccountSettingsCard` so the inline compare
  panel is now the rich grid; host code can still override via `onComparePlans`.
- **`ConfirmDialog`** (`src/renderer/components/ConfirmDialog.tsx`). The
  in-app replacement for `window.confirm()`. Focus is moved to the primary
  button on open; Escape cancels, Enter confirms; backdrop dismiss is
  configurable; destructive variant uses the danger Button styling. Pure
  presentational, callers own the open state.
- **`RegistryCommandPalette`** (`src/renderer/components/RegistryCommandPalette.tsx`).
  Ctrl+K palette wired to the shared `commands/registry`. Distinct from the
  existing apps-and-themes `CommandPalette`; this one is fully data-driven so
  any subsystem that calls `registerCommand` shows up immediately. Up / Down
  / Enter / Escape keyboard support, disabled commands hidden, empty-state
  copy, group label rendered under each row.

`tests/unit/v389-followup-ui.test.tsx` adds **19 new tests** for these three
components. Total suite is now **992 tests** across **57 files**, all passing.
Watermark check, `tsc --noEmit`, and `npm run build` all clean.

## [3.8.9] - 2026-05-13 -- Polished accounts, 100 GB cloud, sharper Pro

### Added

- **Polished account UI.** New `src/renderer/components/account/`
  surface: `AccountAuthFlow` (welcome / sign-in / sign-up / terms gate /
  two-factor / skip / success), `AccountSettingsCard` (signed-in or
  signed-out view inside Settings), `ProBadge` and `UpgradePrompt` for
  consistent "this is paid" signposting. Every component uses the
  shared `Button` and `TextInput` primitives so the visual system stays
  consistent across the app.
- **Onboarding sign-in / sign-up / skip.** New `account` step inserted
  into the first-launch onboarding between the Terms screen and the
  Ready screen. Skipping is the recommended default; an account is
  always optional.
- **Pure onboarding flow logic.** `src/shared/account/onboardingFlow.ts`
  with full state machine, validators, and a hard cloud-action gate
  that refuses sign-in / payment until Terms + Privacy are accepted.
- **Pro perks catalogue.** `src/shared/license/proPerks.ts` lists
  every perk a paying user gets, mapped to gates the renderer can
  query: 100 GB storage, end-to-end encryption, legacy handover,
  unlimited snippets, workspace sync, theme studio, ad-free promise,
  commercial use, live collab, priority support, plugin publishing,
  on-device voice cloning, beta channel, admin console, SLA.

### Changed

- **Paid cloud storage doubled to 100 GB** for Personal, Family, Pro,
  and Studio (per seat). Free Viewer remains 10 GB. Updated in
  `src/shared/cloud/quota.ts`, `src/shared/license/planFeatures.ts`,
  PRICING.md, TERMS.md, PRIVACY.md, and the related unit tests.
- **Settings -> Account** is a first-class section. The card renders
  `AccountAuthFlow` when signed out and a polished management view
  with cloud-storage usage bar + upgrade prompt when signed in.
- **CHANGELOG trimmed.** Older release entries were removed from this
  document. Tag history and GitHub Releases retain the full record.

### Tests

- `tests/unit/onboarding-and-perks.test.ts` -- 19 new tests covering
  every flow branch, every validator, and every Pro-perk gate.

### Notes

- Free Viewer keeps its full feature set (10 GB cloud, 20 UKI plans
  per day, all local features). The paid tiers only add capability;
  they never restrict free.
- All new files are watermarked under the DEX Software License
  Agreement v1.0 (see `LICENSE`).
