# DEX OS

A desktop environment for Windows that brings notes, files, a web browser,
creative tools and an AI assistant into one workspace.

**Version:** 7.0.2 (001z) · **Creator:** Onazi oJ · **License:** [DEX Software License v1.0](LICENSE)

> **Release status.** The source in this repository is version 7.0.2 (001z). The 7.0.2
> installer has not been published yet; the newest published installer is
> [v6.1.0](https://github.com/onazioj179-lab/Dex/releases/tag/v6.1.0). What
> remains before 7.0.2 ships is listed in [DEX_REMAINING_WORK.md](DEX_REMAINING_WORK.md).

---

## Download

| Platform | Package |
|---|---|
| Windows 10 or 11, 64-bit (x64) | `DEX_<version>_x64-setup.exe` from [Releases](https://github.com/onazioj179-lab/Dex/releases), the one official installer |
| macOS, Linux, Windows on ARM | Not available |

The setup installs DEX for the current user in `%LOCALAPPDATA%\DEX`, adds a
Start menu shortcut (and a desktop shortcut if you leave that option on), and registers one uninstall entry (Settings ›
Apps › DEX). Installing a newer version over an older one upgrades it in place
and keeps your data.

The installer is not code-signed yet, so Windows SmartScreen may show a
warning. Select **More info**, then **Run anyway**. Each release lists SHA-256
checksums so you can verify the download (see [Verifying a download](#verifying-a-download)).

### System requirements

- Windows 10 or Windows 11, 64-bit
- Microsoft Edge WebView2 Runtime. It is part of Windows 11; on Windows 10 the
  installer downloads it if it is missing.

---

## Features

- **Desktop shell.** Movable, resizable windows with snapping and tiling, a
  spatial canvas you can pan and zoom in every direction, Spotlight search
  (`Ctrl+K`), a launcher bar, notifications and Do Not Disturb.
- **Everyday apps.** Notes, Tasks, Files, Browser, Calendar, Calculator,
  Password Generator (with an encrypted vault), clipboard history and Workflows.
- **Creative apps.** VINX (video), Imosion (music), PRISM (photo), FLUX
  (motion), FORGE (3D), AXL (CAD), Canvas, Pixel Art, Presentation and DexCode.
- **Nexus.** System overview and task manager with live CPU, memory, disk and
  network figures.
- **UKI assistant.** Answers questions and runs actions across DEX apps. Changes
  to your data are shown for confirmation first. Cloud models need your own API
  key; a local model through Ollama is optional.
- **Local first.** No account is required. Data is stored on your computer.
  Analytics are off by default. See [PRIVACY.md](PRIVACY.md).

### Known limitations

- The installer is unsigned, and updates are not delivered automatically.
- Cloud AI features require an API key from a supported provider.
- Speech recognition uses the system Web Speech service, which may process audio online.
- The bootable DEX OS image in [`dex-os/`](dex-os/README.md) is experimental and has not been boot-tested for this release.

---

## Building from source

### Prerequisites

- Windows 10 or 11 (x64)
- [Node.js](https://nodejs.org/) 20 LTS (18 or later works) and npm 9 or later
- [Rust](https://rustup.rs/) stable with the **MSVC** toolchain
  (`rustup default stable-x86_64-pc-windows-msvc`)
- Visual Studio Build Tools with the **Desktop development with C++** workload

Release builds must use the MSVC toolchain. A GNU build depends on
`WebView2Loader.dll`, which the installer does not include, so `src-tauri/build.rs`
refuses to produce one.

### Commands

```bash
npm ci
```

```bash
npm run dev
```

`npm run dev` starts the desktop app with live reload. `npm run dev:renderer`
starts only the web interface in a browser at `http://localhost:5173`; native
features (files, clipboard, system information) are unavailable there.

| Task | Command |
|---|---|
| Type-check and attribution check | `npm run lint` |
| Unit tests | `npm test` |
| End-to-end tests | `npm run test:e2e` |
| Installer (`DEX_<version>_x64-setup.exe`) | `npm run build:tauri` |
| SHA-256 checksum for the installer | `npm run release:checksums` |

`npm run build:tauri` writes the installer to `src-tauri/target/release/bundle/nsis/`,
then checks that the executable does not depend on DLLs the installer does not ship.
DEX does not ship an MSI: one setup means one install folder, one uninstall
entry and one upgrade path.

### Verifying a download

```powershell
Get-FileHash .\DEX_7.0.2_x64-setup.exe -Algorithm SHA256
```

Compare the result with the checksum listed on the release page.

---

## Repository layout

| Path | Contents |
|---|---|
| `src/renderer/` | User interface (React and TypeScript): shell, apps, settings |
| `src/shared/` | Code shared by the interface and the assistant: UKI, commands, policies |
| `src-tauri/` | Desktop host in Rust (Tauri 2): windows, IPC, storage, native services |
| `core/` | Rust libraries: search index, audio analysis, vault, scanner, cache |
| `native/` | Optional Node native module (Rust) used by tooling |
| `dex-os/` | Experimental bootable image (Buildroot) |
| `tests/` | Unit tests (Vitest) and end-to-end tests (Playwright) |
| `scripts/` | Build, release and maintenance scripts |
| `docs/` | Documentation; start at [docs/README.md](docs/README.md) |

---

## Documentation

- [Documentation index](docs/README.md)
- [Changelog](docs/CHANGELOG.md) and [7.0.1 release notes](DEX_7.0.1_RELEASE_NOTES.md)
- [Release procedure](docs/RELEASE.md) and [code signing](docs/SIGNING.md)
- [Keyboard shortcuts](docs/SHORTCUTS.md)
- [Contributing](docs/CONTRIBUTING.md)

## Security

Report security issues privately to onazi75@gmail.com. Do not open a public
issue for a vulnerability. See [docs/SECURITY.md](docs/SECURITY.md).

## License

DEX is proprietary software distributed under the
[DEX Software License Agreement v1.0](LICENSE). See also [TERMS.md](TERMS.md),
[PRIVACY.md](PRIVACY.md) and [NOTICE](NOTICE) for third-party components.

© 2026 Onazi Treasure OJ. DEX OS is created by Onazi oJ.
