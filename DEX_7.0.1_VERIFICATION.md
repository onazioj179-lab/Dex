# DEX OS 7.0.1 — Verification

Branch `claude/cranky-hopper-4f196b`. Verdict: **NOT READY**. The gates below that failed or were not run are why.

## Build

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass (exit 0) |
| `vite build` (renderer) | Pass, 46.7 s |
| `cargo` release build, MSVC, new profile | Pass, 24 m 43 s |
| NSIS installer `DEX_7.0.1_x64-setup.exe` | Built, 14.6 MB |
| MSI installer | **Failed**: WiX step downloads the WebView2 bootstrapper (`go.microsoft.com`), no network in this environment |
| `verify-tauri-bundle.js` gate | WebView2 loader statically linked (no `WebView2Loader.dll` import): pass. NSIS present: pass. MSI missing: **fail** |
| `release:checksums` / `--verify` | Pass. `354eb9c77c0f87f13cd4764e1d0399bc6f9f4fc055e3803054d2b34678db9a2f *nsis/DEX_7.0.1_x64-setup.exe` |
| Code signing | **Not signed**: no certificate available. Nothing was signed or claimed signed |
| Deployed / published | **No** |

## Size, 6.1.0 → 7.0.1 (measured, one build each)

| Artifact | 6.1.0 | 7.0.1 |
|---|---|---|
| `dex-tauri.exe` | 37,953,024 B | 40,117,760 B |
| NSIS installer | 14,849,119 B | 15,259,414 B |

Both grew. This build changed the release profile *and* the code, and I did not isolate which caused it, so
I make no claim that the profile reduced size. Startup, memory and idle CPU were **not** measured in this pass.

## Tests

| Test | Result |
|---|---|
| `tests/unit/interfaceTransparency.test.ts` (new, 10 tests: mapping, round-trip, clamping, theme-aware material, blur independence) | Pass |
| `shellPreferences`, `calc-provider` | Pass (29 tests across the three files above) |
| `radius-scale-ratchet` | Was failing on import on Windows (CRLF shebang); fixed via `.gitattributes`. It then caught one off-scale radius from main (`SpatialHud.tsx`), also fixed. Passes (2/2) |
| Watermark gate (`add-watermarks.js --check`) | Pass, 2276 files |
| Full `vitest run` suite | 516 of 520 files pass (5,423 tests). 4 failures: 3 `v6-performance-guards` budgets (pass when the file runs alone; they fail under load) and 1 `auto-save-manager` test that broke on the DST-change day (now-24h is still today); the test now uses calendar arithmetic and passes |
| Playwright e2e | Not run |

## Live checks (Vite preview, the app's own store instance)

- 64% glass persisted → reload → `--color-bg-glass: rgba(10,10,10,0.64)`, blur 12 px, mode `normal`, even with the
  browser reporting reduce-motion.
- Flipping `data-theme` to light re-tinted to `rgba(245,245,247,0.64)` with no reload; flipping back restored dark.
- The Settings UI itself was **not** exercised: the preview sits behind the Terms & Privacy acceptance gate, and
  accepting legal terms was not done on the owner's behalf. The slider component is type-checked and its logic is
  unit-tested but has not been clicked in a rendered Settings page.

## Hardening status

- Secrets: scan of tracked files found only test fixtures. No private keys, `.env` is example-only.
- Source maps off, esbuild minify on (existing). **No JS obfuscator added**: it risks Tauri IPC and dynamic imports and
  is not a security boundary.
- Native update download/install is not implemented (`update_service.rs` degrades honestly), so there is no
  signed-update path to verify yet.
- No packaged install / upgrade / uninstall test was run.

## Part 7 checks (2026-11-02, `claude/dex-part7`)

- `tsc --noEmit` 0 · `vite build` 0 (chunk-cycle guard passes) · full unit suite **515 files / 5,299 tests passed, 0 failed** (2 files skipped) · native tests 6/6 (`browser_view`, `profile_name`, `powercfg`, `process_ranking`).
- Live, debug build with embedded frontend, driven over CDP, isolated WebView2 profile; the owner's `%APPDATA%\com.onazioj.dex` was snapshotted first and restored afterwards (SHA-256 identical, 39 files):
  - `system:getProcesses` returns an array; Power's Energy Use lists real processes.
  - Power Mode shows the real Windows plan (Balanced). A different mode was **not** clicked: it changes the machine's power plan.
  - Launch at Login reads the real `Run` key (not set; the test only read it).
  - Browser: typed `https://example.com` -> child webview loads "Example Domain"; covered -> hidden, uncovered -> visible; app closed -> view released; relaunched -> recreated at the same URL; the page's `dex_ipc` call is refused ("not allowed").
- Not run: packaged installer, click-through of Browser back/forward/find/reader mode, Settings Launch at Login toggle (writes the registry).
