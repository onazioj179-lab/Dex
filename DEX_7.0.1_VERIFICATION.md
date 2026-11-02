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
| Full `vitest run` suite | **Not run** in this pass |
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
