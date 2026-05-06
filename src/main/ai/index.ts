// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - AI Module Index
// ===========================================================================
// DISABLED: AI features intentionally removed for privacy-first system.
// Pattern Learning (local-only) replaces all AI functionality.
// These stubs exist for interface compatibility with controllers that
// reference AI capabilities — they are no-ops and allocate nothing.
// ===========================================================================

/** @deprecated AI disabled — returns null */
export const AIHub = null;
/** @deprecated AI disabled — returns null */
export const aiHub = null;
/** @deprecated AI disabled — no-op */
export const initializeAIHub = (): void => { /* intentionally empty — AI disabled */ };
/** @deprecated AI disabled — no-op */
export const shutdownAIHub = (): void => { /* intentionally empty — AI disabled */ };

// Minimal type stubs (items 96-97: cleaned up, marked deprecated)
/** @deprecated AI disabled */
export type AIProviderType = 'none';
/** @deprecated AI disabled */
export type AIResponse = { success: false; error: 'AI disabled' };
