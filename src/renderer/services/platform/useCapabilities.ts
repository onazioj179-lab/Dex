// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * React hook wrapper for the cross-shell capability layer. The hosting shell
 * (Electron / Tauri / web) is fixed for the session, so the result is memoized.
 */

import { useMemo } from 'react';
import { getCapabilities, type Capabilities } from './capabilities';

export function useCapabilities(): Capabilities {
  return useMemo(() => getCapabilities(), []);
}
