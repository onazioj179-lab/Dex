# DEX App Documentation

Short reference for project organization + app features.

## Project Organization

- `src/main/` -- Electron main process (IPC, system control, updates)
- `src/renderer/` -- React UI (pages, components, styles, store)
- `src/shared/` -- shared types and validation
- `src/python/` -- Python backend helpers
- `tests/` -- unit, integration, and e2e tests
- `assets/` -- installer and platform assets

## Main App Features

### Automation
- Actions
- Modes
- Rules
- Workflows
- Operations with undo

### Productivity
- Notes
- Tasks
- Timers
- Voice notes / voice control

### System Control
- Power profiles (Eco / Balanced / Boost)
- Process monitoring
- File and transfer tools

### Security
- Context isolation + secure preload bridge
- IPC validation + input sanitization
- Permission controls
- Local-first data storage

### Updates
- Manual-first updates
- Rollback support
- Backup/restore support

## Current Update Architecture (Active)

- Main backend: `src/main/core/ReleaseManager.ts`
- Startup wiring: `src/main/main.ts`
- Renderer bridge: `src/main/preload.ts`

## Commands

```bash
npm run dev
npm run build
npm run test
npm run test:e2e
```

## Notes

- Network features are opt-in via `DEX_ENABLE_NETWORK_FEATURES=true`.
- Legacy `UpdateController` file exists but active update path is `ReleaseManager`.
