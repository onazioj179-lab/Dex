# DEX - Personal Control Hub

> **Created by Onazi Treasure OJ** &lt;onazi75@gmail.com&gt; | Version 3.7.4 | Copyright (c) 2026 All Rights Reserved | MIT Licensed

A cross-platform desktop automation app that lets you define rules, modes, and actions to locally control your computer with full transparency.

## What's New in 3.7

- **ContextBus**: a typed activity bus across the shell — apps, files, tasks, and clipboard activity all flow through one observable seam, making the assistant context-aware without ad-hoc wiring.
- **Hybrid motion system**: input feedback (hover, focus, fade, progress) is now driven by tuned linear presets, while layout still uses springs. Every surface honours `prefers-reduced-motion`.
- **Unified palette**: `Ctrl+K` is the canonical command launcher; `Ctrl+Space` opens the UKI conversational panel. One hotkey per intent — no more overlapping search overlays.
- **UKI slash commands**: `/help`, `/open`, `/note`, `/task`, `/find`, `/run` work directly from the assistant panel; voice input still works alongside.
- **Cleaner UI primitives**: `Button`, `TextInput`, and `Card` use the new motion presets — interactions feel snappier and more consistent.
- **Type-tight globals** for the Battery Status, `Performance.memory`, and `Navigator.userAgentData` APIs so the assistant's system replies are checked at compile time.
- 632 tests passing across 45 suites, TypeScript clean.

## About DEX (Non-Technical)

DEX helps you control your computer faster with less manual work.

- Automate repeated tasks
- Organize your day with notes, tasks, and timers
- Manage system performance with simple power profiles
- Keep your data local by default
- Update safely with backup and rollback support

## Full Documentation

**Everything is in one place ** [docs/APP_DOCUMENTATION.md](docs/APP_DOCUMENTATION.md)

Architecture, features, updates, commands, security, known gaps -- all in one file.

## Quick Start

```bash
npm install
npm run dev
```

## Build Native Modules (Rust)

```bash
# Requires Rust toolchain (https://rustup.rs/)
npm run build:native      # Release build (dex-native)
npm run build:core        # dex-core native module
npm run build:all         # Everything (native + core + app)
```

## Build & Package

```bash
npm run build
npm run package:win       # Windows
npm run package:mac       # macOS
npm run package:linux     # Linux
```

## Test

```bash
npm run test              # Unit + integration
npm run test:e2e          # E2E (Playwright)
npm run test:coverage     # With V8 coverage
```

## Links

- [Full App Documentation](docs/APP_DOCUMENTATION.md)
- [Security Policy](docs/SECURITY.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Changelog](docs/CHANGELOG.md)
- [Project TODO](docs/TODO.md)
- [License](LICENSE)
- [Notice](NOTICE)
- [Authors](AUTHORS)
- [Terms of Use](TERMS.md)
- [Privacy Policy](PRIVACY.md)
- [Code Owners](CODEOWNERS)

---

**DEX** -- Designed, built, and maintained by **Onazi Treasure OJ** &lt;onazi75@gmail.com&gt;
Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. Licensed under the MIT License.
