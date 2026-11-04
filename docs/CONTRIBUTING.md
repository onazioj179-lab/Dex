# Contributing to DEX

Thank you for your interest in contributing to DEX! This document provides guidelines and instructions for contributing.

## Before you open a pull request

- `npm run lint` passes (TypeScript and the attribution-header check).
- `npm test` passes.
- `npm run build` succeeds with no new warnings.
- For interface changes, check the affected screen in light and dark mode.
- Track open work in [DEX_REMAINING_WORK.md](../DEX_REMAINING_WORK.md) and
  [ROADMAP.md](ROADMAP.md) rather than in new Markdown files.

**No bloat rule:** every change must replace, strengthen, or directly extend existing code. New parallel systems are rejected unless an ADR justifies the duplication.

## Getting Started

### Prerequisites

- Windows 10 or 11 (x64)
- Node.js 20 LTS (18 or later) and npm 9 or later
- Rust stable with the MSVC toolchain, and Visual Studio Build Tools with the C++ workload
- Git

### Setup

```bash
git clone https://github.com/onazioj179-lab/Dex.git
```

```bash
npm ci
```

```bash
npm run dev
```

`npm run dev` starts the desktop app. `npm run dev:renderer` starts only the
interface in a browser, without native features.

## Development Workflow

### Branch Naming

- `feature/` - New features (e.g., `feature/clipboard-sync`)
- `fix/` - Bug fixes (e.g., `fix/tray-icon-missing`)
- `docs/` - Documentation updates (e.g., `docs/update-readme`)
- `refactor/` - Code refactoring (e.g., `refactor/settings-page`)

### Commit Messages

Follow conventional commits:

```
type(scope): description

feat(vault): add biometric unlock support
fix(tray): use SVG icon instead of PNG
docs(readme): update installation instructions
refactor(settings): extract theme panel component
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run tests: `npm run test`
5. Run the build: `npm run build`
6. Submit a pull request with a clear description

## Project Structure

```
src/
  renderer/          # React interface: shell, pages, apps, stores, styles
    DEXAPPLICATIONS/ # Built-in DEX applications
  shared/            # Code shared by the interface and the UKI assistant
src-tauri/           # Desktop host in Rust (Tauri 2): windows, IPC, storage, native services
core/                # Rust libraries (search, audio, vault, scanner, cache, ...)
native/              # Optional Node native module (Rust)
dex-os/              # Experimental bootable image (Buildroot)
tests/               # Vitest unit tests and Playwright end-to-end tests
```

## Code Style

### TypeScript
- Use strict TypeScript (`strict: true`)
- Prefer `const` over `let`
- Use explicit return types for public functions
- Use interfaces over type aliases where possible

### React
- Use functional components with hooks
- Use `React.FC` for component typing
- Lazy load pages and heavy components
- Apps are wrapped in `AppErrorBoundary` (in `AppManager.tsx`) so one failing app cannot take down the shell

### CSS
- Utility class names come from a hand-written layer in `styles/design-system.css` (not full Tailwind); an undefined class does nothing
- Use CSS variables for theming (`var(--color-*)`)
- Avoid inline styles where possible
- Support both light and dark themes

## Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run end-to-end tests
npm run test:e2e
```

### Writing Tests
- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Place e2e tests in `tests/e2e/`
- Use descriptive test names
- Test both success and failure paths

## Architecture Guidelines

### Security First
- All IPC channels must be validated
- User input must be sanitized
- File paths must be checked for traversal
- Sensitive operations require permission checks

### Local Only
- No cloud dependencies
- No telemetry or tracking
- All data stays on the user's device
- Network features are opt-in only

### Performance
- Lazy load components and pages
- Use resource budgets for sub-applications
- Monitor memory usage and clean up
- Respect the user's power profile settings

### Fault Isolation
- New apps are mounted through `AppManager`, which wraps each in `AppErrorBoundary`
- Use error boundaries for UI components
- Log errors with context for debugging
- Never let one subsystem crash the entire app

## Reporting Issues

When reporting bugs, please include:
- DEX version
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Console logs or error messages

## License

By contributing to DEX, you agree that your contributions will be licensed under the MIT License.

---

**DEX** - Made by Onazi Treasure OJ
