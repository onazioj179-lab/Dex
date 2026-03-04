# Contributing to DEX

Thank you for your interest in contributing to DEX! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Python 3.8+ (optional, for advanced system features)
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/onazioj/dex.git
cd dex

# Install dependencies
npm install

# Install Python dependencies (optional)
pip install -r src/python/requirements.txt

# Run in development mode
npm run dev
```

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
  main/           # Electron main process
    controllers/  # Business logic controllers
    core/         # Core system services
    engine/       # Rule engine
    monitors/     # System event monitoring
    runtime/      # Runtime services
    security/     # Permission and security management
    store/        # Data persistence
    utils/        # Logging utilities
  renderer/       # React frontend
    components/   # UI components
    pages/        # Page views
    services/     # Frontend services
    store/        # Zustand state management
    styles/       # Tailwind CSS
    types/        # TypeScript type definitions
    utils/        # Frontend utilities
    DEXAPPLICATIONS/ # Built-in DEX applications
  python/         # Python backend for deep system control
  shared/         # Shared type definitions
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
- Wrap app components in `ProcessIsolation` for fault containment

### CSS
- Use Tailwind CSS utility classes
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
- Wrap apps in `ProcessIsolation`
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
