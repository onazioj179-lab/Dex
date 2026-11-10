# DEX Release Procedure

How to build, verify and publish a DEX OS release (Tauri, Windows x64).

## Build serials (owner rule, 2026-11-06)

The version number (`7.0.1`) only changes when the owner decides the release is
finished. Every update before that carries a **build serial**, shown next to the
version everywhere DEX reports it: `7.0.1 (18a)`.

- Source of truth: `"dexBuild"` in `package.json` (format `<number><letter>`).
  Vite passes it to the interface (`getDisplayVersion()` / `formatDisplayVersion()`
  in `src/renderer/utils/appVersion.ts`); `src-tauri/build.rs` passes it to the
  native side (`DEX_BUILD_SERIAL`, the `startup.log` first line, `corepc:getBuild`).
- Each merged update moves the letter (`18a` → `18b`). A new Part of work moves
  the number and restarts the letter (`19a`).
- Record what each serial adds under "Build serials" in the release notes.
- Installer files keep the plain version (`DEX_7.0.1_x64-setup.exe`) because
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

## 5. Publish

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds the
installers on a Windows runner, publishes the GitHub release "DEX OS X.Y.Z",
and mirrors it to the update channel (`onazioj179-lab/dex-updates`, tag
`dex-vX.Y.Z`) when the `DEX_UPDATES_TOKEN` secret is set.

```bash
git tag -a vX.Y.Z -m "DEX OS X.Y.Z"
```

```bash
git push origin vX.Y.Z
```

To publish a locally built, signed release instead, create it first; the
workflow then uploads onto the existing release rather than creating one:

```bash
gh release create vX.Y.Z --repo onazioj179-lab/Dex --title "DEX OS X.Y.Z" --notes-file DEX_X.Y.Z_RELEASE_NOTES.md src-tauri/target/release/bundle/nsis/DEX_X.Y.Z_x64-setup.exe src-tauri/target/release/bundle/SHA256SUMS
```

## 6. Old releases

- The workflow keeps the newest three releases in `onazioj179-lab/Dex`
  (`scripts/prune-releases.js --keep 3`). Keep at least one earlier working
  release for rollback until the new one has been installed successfully.
- `dex-updates` is shared with other products. Never run the count-based prune
  there; delete a specific old DEX release only:
  `gh release delete dex-vX.Y.Z --repo onazioj179-lab/dex-updates --yes --cleanup-tag`.
- Preview a prune with `npm run release:prune:dry`.

## Notes

- Never push with `--no-verify` or amend a published commit.
- Pre-releases: use a `-beta.N` version and pass `--prerelease` to `gh release create`.
