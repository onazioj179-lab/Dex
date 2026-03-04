// ═══════════════════════════════════════════════════════════════════════════
// DEX - AI Module Index
// DISABLED: AI features removed for privacy-first system
// Pattern Learning (local-only) replaces AI functionality
// ═══════════════════════════════════════════════════════════════════════════

// Stub exports for compatibility - these do nothing
export const AIHub = null;
export const aiHub = null;
export const initializeAIHub = () => {};
export const shutdownAIHub = () => {};

// Stub types
export type AIProviderType = 'none';
export type AIProviderConfig = Record<string, never>;
export type AIRequest = Record<string, never>;
export type AIContext = Record<string, never>;
export type AIResponse = { success: false; error: 'AI disabled' };
export type AIUsageLog = Record<string, never>;
