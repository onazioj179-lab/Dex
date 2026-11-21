# DEX Release Procedure

How to build, verify and publish a DEX OS release (Tauri, Windows x64).

## Build serials (owner rule, 2026-11-06)

The version number (`7.0.2`) only changes when the owner decides the release is
finished. Every update before that carries a **build serial**, shown next to the
version everywhere DEX reports it: `7.0.2 (001z)`.

- Source of truth: `"dexBuild"` in `package.json` (format `<number><letter>`).
  Vite passes it to the interface (`getDisplayVersion()` / `formatDisplayVersion()`
  in `src/renderer/utils/appVersion.ts`); `src-tauri/build.rs` passes it to the
  native side (`DEX_BUILD_SERIAL`, the `startup.log` first line, `corepc:getBuild`).
- Each merged update moves the letter (`18a` → `18b`). A new Part of work moves
  the number and restarts the letter (`19a`).
- Record what each serial adds under "Build serials" in the release notes.
- Installer files keep the plain version (`DEX_7.0.2_x64-setup.exe`) because
  Windows installers only accept numeric versions.

## 0. Before you start

- All changes are merged to `main` and the working tree is clean.
- `npm run lint` and `npm test` pass.
- The version is the same in `package.json`, `src-tauri/tauri.conf.json` and
  `src-tauri/Cargo.toml`. The app reads its version from `package.json` at build
  time; update `PLATFORM_BUILD_DATE` in `src/renderer/store/runningApps.ts`.
- `docs/CHANGELOG.md` has a `## vX.Y.Z` section, and `DEX_X.Y.Z_RELEASE_NOTES.md`
  exists if the release has full notes (the release workflow prefers that file).

## 1. Build

Use the MSVC Rust toolchain. `src-tauri/build.rs` refuses a GNU release build,
because the GNU build depends on `WebView2Loader.dll`, which the installer does
not ship.

```bash
npm ci
```

```bash
npm run build:tauri
```

Outputs:

- `src-tauri/target/release/bundle/nsis/DEX_X.Y.Z_x64-setup.exe`, the one
  official Windows setup

MSI is not built or published. The setup installs per user to
`%LOCALAPPDATA%\DEX` with the uninstall entry `HKCU\...\Uninstall\DEX`: the same
folder and entry as 6.x, so installing over 6.x upgrades in place and keeps user
data (`%LOCALAPPDATA%\com.onazioj.dex`). If a machine still has an MSI install of
DEX, the setup offers to remove it first.

`build:tauri` runs `scripts/verify-tauri-bundle.js` afterwards, which fails if
the executable imports DLLs the installer does not include or if the setup for
the current version is missing.

## 2. Sign (when a certificate is available)

See [SIGNING.md](SIGNING.md). Unsigned installers work but trigger a
SmartScreen warning; say so in the release notes.

## 3. Checksums

```bash
npm run release:checksums
```

This writes `src-tauri/target/release/bundle/SHA256SUMS` for the current
version's installers; `npm run release:checksums -- --verify` checks the files
against it. Run it after signing, because signing changes the files.

## 4. Test the packaged app

Install over the previous release on a test profile and check that it starts,
reports the new version in Settings › About, and uninstalls cleanly. Record the
results in `DEX_X.Y.Z_VERIFICATION.md`.

## 5. Local Windows previews

DEX is in local preview. Run the installer produced in step 1 on the test PC
when the owner approves an update. Use the same installer path each time so the
new preview replaces the previous setup. Settings › Software Update shows the
installed build. CI runs the renderer checks without packaging installers.

The GitHub Release workflow is disabled during local preview. When the owner
approves public distribution, enable it explicitly and dispatch it with the
approved version tag. The stable workflow builds one x64 setup, a signature,
a checksum and the GitHub update manifest. Stable builds verify the package and
its version before offering to restart. Each update requires a higher published
version. The signing key is stored outside the repository. The workflow reads
the GitHub secret TAURI_SIGNING_PRIVATE_KEY and optionally its password.

## 6. Old releases

- Verify the current setup opens and reports the expected version before
  removing superseded releases. Release cleanup is a separate operation from
  publishing.
- `dex-updates` is shared with other products. Never run the count-based prune
  there; delete a specific old DEX release only:
  `gh release delete dex-vX.Y.Z --repo onazioj179-lab/dex-updates --yes --cleanup-tag`.
- Preview a prune with `npm run release:prune:dry`.

## Notes

- Never push with `--no-verify` or amend a published commit.
- Pre-releases: use a `-beta.N` version and pass `--prerelease` to `gh release create`.
