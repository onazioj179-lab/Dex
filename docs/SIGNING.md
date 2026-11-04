# Code Signing the DEX Installer (Windows)

The DEX installer is currently built **unsigned**, so Windows SmartScreen shows an
"unknown publisher" warning on first run. Signing removes that warning. The bundle
is already wired for signing (`src-tauri/tauri.conf.json` → `bundle.windows` sets
`digestAlgorithm` + `timestampUrl`); the only missing piece is your certificate.

## You need

- A **code-signing certificate** (OV or EV) from a CA (DigiCert, Sectigo, SSL.com…),
  installed in the Windows certificate store (Personal / "My").
- Its **SHA-1 thumbprint**. List installed certs:
  ```powershell
  Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint
  ```

## Option A — let Tauri sign during the build (recommended)

Add your thumbprint to `src-tauri/tauri.conf.json` under `bundle.windows`:

```json
"windows": {
  "certificateThumbprint": "YOUR_40_CHAR_THUMBPRINT",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

Then build — the installer comes out signed:

```bash
npm run build:tauri -- --bundles nsis
# signed -> src-tauri/target/release/bundle/nsis/DEX_<ver>_x64-setup.exe
```

> Keep the thumbprint out of public commits if your repo is open — set it locally
> or via your CI secret store instead of committing it.

## Option B — sign the finished installer with signtool

If you'd rather not put the thumbprint in config (e.g. EV cert on a hardware token):

```powershell
& "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe" sign `
  /sha1 YOUR_THUMBPRINT /fd sha256 /tr http://timestamp.digicert.com /td sha256 `
  "src-tauri\target\release\bundle\nsis\DEX_7.0.1_x64-setup.exe"
```

Verify:

```powershell
signtool verify /pa "src-tauri\target\release\bundle\nsis\DEX_7.0.1_x64-setup.exe"
```

## After signing

Re-upload the signed installer to the release:

```bash
gh release upload v7.0.1 "src-tauri/target/release/bundle/nsis/DEX_7.0.1_x64-setup.exe" --clobber
```

EV certificates clear SmartScreen immediately; OV certificates build reputation
over time/installs.
