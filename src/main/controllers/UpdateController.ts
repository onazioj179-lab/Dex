// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * ===========================================================================
 * DEPRECATED -- UpdateController (v2.0.1)
 * ===========================================================================
 *
 * This controller was the v1.x update system using electron-updater directly.
 * It has been FULLY REPLACED by ReleaseManager (src/main/core/ReleaseManager.ts)
 * which provides:
 *   - Staged rollouts with channel support (stable/beta/canary)
 *   - Pre-update backups and one-click rollback
 *   - Silent background downloads with progress tracking
 *   - Backward-compatible `updates:*` IPC aliases for the renderer
 *
 * DO NOT import this file. The `updates:*` IPC channels are now handled
 * by ReleaseManager. Importing this file will throw at startup.
 *
 * @deprecated since 2.0.0 -- Use ReleaseManager instead
 * @see src/main/core/ReleaseManager.ts
 */

export class UpdateController {
  constructor() {
    throw new Error(
      '[UpdateController] DEPRECATED -- This controller was removed in v2.0.1. ' +
      'Use ReleaseManager from src/main/core/ReleaseManager.ts instead. ' +
      'All `updates:*` IPC channels are now served by ReleaseManager.'
    );
  }
}

// No default export -- prevents accidental singleton construction

