// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Index for the 500-improvement wave shared infrastructure.
 *
 * Centralized re-exports so app-side code imports a single namespace:
 *   import { ariaButton, useArrowNav, usePinchZoom, ... } from '@/renderer/improvements500';
 */

export * from './aria';
export * from './useArrowNav';
export * from './usePinchZoom';
export * from './useTickBudget';
export * from './withPermission';
export * as presence from './presence';
