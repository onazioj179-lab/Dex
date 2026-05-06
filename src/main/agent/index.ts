// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Agent System - DISABLED (items 96-97: cleaned up)
// =============================================================================
// AI agent features intentionally removed for privacy-first system.
// Pattern Learning (local-only) replaces AI functionality.
// Minimal stubs retained only for interface compatibility.
// =============================================================================

/** @deprecated Agent system disabled — no-op */
export const agentCore = null;
/** @deprecated Agent system disabled — no-op */
export const initializeAgent = (): void => { /* intentionally empty */ };
/** @deprecated Agent system disabled — no-op */
export const shutdownAgent = (): void => { /* intentionally empty */ };
/** @deprecated Agent system disabled — no-op */
export const initializeComputerTasks = (): void => { /* intentionally empty */ };
/** @deprecated Agent system disabled — no-op */
export const shutdownComputerTasks = (): void => { /* intentionally empty */ };

// Minimal types (only those referenced by other modules)
/** @deprecated Agent system disabled */
export type AgentMessage = Record<string, never>;
/** @deprecated Agent system disabled */
export type ToolDefinition = Record<string, never>;
export type PermissionCategory = 'none';
export type DataAccessLog = Record<string, never>;
export type ExplainableAction = Record<string, never>;
export type ReasoningStep = Record<string, never>;
export type DataExport = Record<string, never>;
export type PrivacyReport = Record<string, never>;
