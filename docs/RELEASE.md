# DEX Release Procedure

One-page checklist for shipping a new version with auto-update support.

## 0. Pre-flight

- All changes merged to `main`, working tree clean.
- `npm.cmd run lint` and `node node_modules/typescript/bin/tsc --noEmit` are green.
- Test suite green: `npm.cmd test`.
- Bump version in `package.json` (and `native/Cargo.toml` if native changed).
- Add a `CHANGELOG.md` entry under the new version heading.
- Commit: `chore: release vX.Y.Z`.

## 1. Build artifacts

```powershell
npm.cmd run build
npm.cmd exec -- electron-builder --win
```

Outputs land in `release/`:

- `DEX-X.Y.Z-win-x64.exe`             (NSIS installer)
- `DEX-X.Y.Z-win-x64.exe.blockmap`    (delta-update map)
- `latest.yml`                         (manifest electron-updater reads)

Sanity check:

```powershell
Microsoft.PowerShell.Management\Get-Item .\release\DEX-X.Y.Z-win-x64.exe | Select Name, Length
Microsoft.PowerShell.Management\Get-Content .\release\latest.yml
```

`latest.yml`'s `sha512` and `size` must match the .exe.

## 2. Tag and push

```powershell
git tag -a vX.Y.Z -m "DEX X.Y.Z -- one-line summary"
git push origin main
git push origin vX.Y.Z
```

## 3. Publish GitHub Release

Either via the `gh` CLI:

```powershell
gh release create vX.Y.Z `
  release/DEX-X.Y.Z-win-x64.exe `
  release/DEX-X.Y.Z-win-x64.exe.blockmap `
  release/latest.yml `
  --title "DEX X.Y.Z" `
  --notes-file docs/CHANGELOG.md
```

Or via the web UI at <https://github.com/onazioj/dex/releases/new>:

1. Choose tag `vX.Y.Z`.
2. Upload **all three** assets above.
3. Paste the changelog entry.
4. Mark **Set as latest release**.
5. Publish.

## 4. Verify auto-update

`build.publish` in `package.json` is already configured for the GitHub
provider (`provider: github`, `owner: onazioj`, `repo: dex`), so
`electron-updater` reads `latest.yml` directly from the release.

To smoke-test: install the previous version, launch DEX, and within
`updateConfig.checkInterval` hours (or via the manual *Check for Updates*
button) you should see an update toast.

If the update is not detected:

1. Open `%APPDATA%\dex\logs\main.log` and look for `[ReleaseManager]`.
2. The first log line should read:
   `Using default GitHub provider from package.json publish config`.
3. Confirm `latest.yml` is reachable at
   `https://github.com/onazioj/dex/releases/download/vX.Y.Z/latest.yml`.

## 5. Notes

- Never run with `--no-verify` or amend a published commit.
- Generic update server: only set when an admin populates
  `%APPDATA%\dex\update-server.json` with an HTTPS URL. Default is empty,
  which falls through to the GitHub provider above.
- Pre-releases: append `-beta.N` to the version and pass `--prerelease`
  to `gh release create`. Set the user's update channel to `beta` to
  receive these.
