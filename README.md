# DEX - Personal Control Hub

> **Created by Onazi Treasure OJ** &lt;onazi.treasure@outlook.com&gt; | Version 3.6.0 | Copyright (c) 2026 All Rights Reserved | MIT Licensed

A cross-platform desktop automation app that lets you define rules, modes, and actions to locally control your computer with full transparency.

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

**DEX** -- Designed, built, and maintained by **Onazi Treasure OJ** &lt;onazi.treasure@outlook.com&gt;
Copyright (c) 2026 Onazi Treasure OJ. All rights reserved. Licensed under the MIT License.
