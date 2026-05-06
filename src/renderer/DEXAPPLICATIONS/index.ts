// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - APPLICATIONS INDEX
// Central export file for all DEX applications and engines
// NOTE: Using direct module imports rather than barrel re-exports to avoid
// name collisions between creative app modules (Layer, Transform, etc.)
// =============================================================================

// Each app should be imported directly from its module path, e.g.:
//   import { BrushEngine } from './prism/PrismBrush'
//   import { FluxProject } from './flux/FluxAnimation'

// =============================================================================
// STANDALONE UTILITY APPS (no conflicts - safe to re-export)
// =============================================================================
export { default as Calculator } from './standalone/Calculator';
export { default as Calendar } from './standalone/Calendar';
export { default as ColorPicker } from './standalone/ColorPicker';
export { default as KanbanApp } from './standalone/KanbanApp';
export { default as MarkdownEditor } from './standalone/MarkdownEditor';
export { default as NoiseGenerator } from './standalone/NoiseGenerator';
export { default as PasswordGenerator } from './standalone/PasswordGenerator';
export { default as PomodoroTimer } from './standalone/PomodoroTimer';
export { default as QRCodeGenerator } from './standalone/QRCodeGenerator';
export { default as RecycleBin } from './standalone/RecycleBin';
export { default as Stopwatch } from './standalone/Stopwatch';
export { default as UnitConverter } from './standalone/UnitConverter';
export { default as Weather } from './standalone/Weather';
export { default as WorldClock } from './standalone/WorldClock';
export { default as Learn } from './standalone/Learn';
export { default as Achievements } from './standalone/Achievements';
export { default as DexCode } from './standalone/DexCode';
export { default as CollabHub } from './standalone/CollabHub';

// =============================================================================
// REWIND - Time Machine Backup
// =============================================================================
export { default as Rewind } from './rewind/Rewind';

// =============================================================================
// VERSION INFO
// =============================================================================
export const DEX_VERSION = '3.6.0';
export const DEX_BUILD_DATE = '2026-04-17';
export const DEX_ITEMS_COMPLETED = 1000;
