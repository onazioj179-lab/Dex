// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.5.0 Premium Experience - Feature Index
// Central export for all v3.5.0 utilities and initialization
// =============================================================================

// Phase 1: Premium UI (901-925)
export * from './premium';
export { GlassPanel, PremiumButton, AnimatedCounter, StaggeredList, ParallaxContainer, AmbientGlow, Skeleton } from './PremiumComponents';

// Phase 2: Creative Suite (926-975)
export * from './creative-suite';

// Phase 3: System Apps (976-1025)
export * from './system-apps';

// Phase 4: Infrastructure (1026-1125)
export * from './infrastructure';

// Phase 5: Privacy (1126-1175)
export * from './privacy';

// Phase 6: OS Features (1176-1275)
export * from './os-features';

// Phase 7: UX Depth (1276-1350)
export * from './ux-depth';

// Compatibility & Stability (Additional)
export * from './compatibility';
export * from './stability';

// =============================================================================
// VERSION INFO
// =============================================================================

export const DEX_VERSION = '3.5.0';
export const DEX_CODENAME = 'Premium Experience';
export const DEX_BUILD_DATE = '2026-04-16';

export interface DEXVersionInfo {
  version: string;
  codename: string;
  buildDate: string;
  features: string[];
}

export const VERSION_INFO: DEXVersionInfo = {
  version: DEX_VERSION,
  codename: DEX_CODENAME,
  buildDate: DEX_BUILD_DATE,
  features: [
    'Premium UI with depth shadows and spring physics',
    'Glass effects with ambient color extraction',
    'Creative Suite enhancements (AXL, PRISM, VINX, IMOSION, FLUX)',
    'Browser privacy features and tab management',
    'Files column view and batch rename',
    'Workflows debug mode and templates',
    'Kanban swimlanes and WIP limits',
    'Calendar natural language input',
    'Virtual lists and RAF batching',
    'LRU cache with TTL',
    'IndexedDB wrapper with batching',
    'Task scheduler and request queue',
    'Privacy dashboard and encryption',
    'PII detection and redaction',
    'Tracker blocker and fingerprint protection',
    'Spotlight search and Quick Look',
    'Spaces and Mission Control',
    'Widget system with built-in widgets',
    'Quick Actions and Control Center',
    'Screen reader and focus management',
    'Color contrast and vision simulation',
    'Reduced motion support',
    'Micro-interactions and ripple effects',
    'Haptic feedback and sound design',
    'Hardware compatibility detection',
    'Adaptive settings for all devices',
    'Global error handling and recovery',
    'Auto-save and crash recovery',
  ],
};

// =============================================================================
// INITIALIZATION
// =============================================================================

import { initCompatibility, getFeatures, getHardwareProfile, getSettings } from './compatibility';
import { initStability } from './stability';

let isInitialized = false;

/**
 * Initialize all DEX v3.5.0 features
 * Call this once at app startup
 */
export function initDEX(): {
  version: DEXVersionInfo;
  compatibility: ReturnType<typeof initCompatibility>;
} {
  if (isInitialized) {
    console.warn('[DEX] Already initialized');
    return {
      version: VERSION_INFO,
      compatibility: {
        features: getFeatures(),
        profile: getHardwareProfile(),
        settings: getSettings(),
      },
    };
  }
  
  console.log(`[DEX] Initializing v${DEX_VERSION} (${DEX_CODENAME})`);
  
  // Initialize compatibility layer (detects hardware, applies settings)
  const compatibility = initCompatibility();
  
  // Initialize stability layer (error handlers, recovery)
  initStability();
  
  // Log initialization
  console.log(`[DEX] Hardware: ${compatibility.profile.tier} tier`);
  console.log(`[DEX] GPU: ${compatibility.profile.gpu}`);
  console.log(`[DEX] Cores: ${compatibility.profile.cores}`);
  console.log(`[DEX] Memory: ~${compatibility.profile.memory}GB`);
  
  if (compatibility.profile.prefersReducedMotion) {
    console.log('[DEX] Reduced motion enabled');
  }
  
  if (compatibility.profile.isLowEndDevice) {
    console.log('[DEX] Low-end device optimizations active');
  }
  
  isInitialized = true;
  
  console.log('[DEX] Initialization complete');
  
  return {
    version: VERSION_INFO,
    compatibility,
  };
}

/**
 * Check if DEX is initialized
 */
export function isDEXInitialized(): boolean {
  return isInitialized;
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export interface FeatureFlags {
  premiumUI: boolean;
  glassEffects: boolean;
  animations: boolean;
  particles: boolean;
  privacyDashboard: boolean;
  spotlight: boolean;
  spaces: boolean;
  widgets: boolean;
  controlCenter: boolean;
  haptics: boolean;
  soundEffects: boolean;
  webGL: boolean;
}

/**
 * Get active feature flags based on hardware
 */
export function getFeatureFlags(): FeatureFlags {
  const settings = getSettings();
  const features = getFeatures();
  
  return {
    premiumUI: true,
    glassEffects: settings.enableGlassEffect,
    animations: settings.enableAnimations,
    particles: settings.enableParticles,
    privacyDashboard: true,
    spotlight: true,
    spaces: true,
    widgets: true,
    controlCenter: true,
    haptics: features.vibration,
    soundEffects: features.webAudio,
    webGL: settings.enableWebGL && features.webGL,
  };
}

// =============================================================================
// QUICK SETUP HELPERS
// =============================================================================

/**
 * Quick check if running on low-end device
 */
export function isLowEndDevice(): boolean {
  return getHardwareProfile().isLowEndDevice;
}

/**
 * Quick check if animations should be disabled
 */
export function shouldDisableAnimations(): boolean {
  const profile = getHardwareProfile();
  return profile.prefersReducedMotion || profile.tier === 'low' || profile.tier === 'minimal';
}

/**
 * Quick check if heavy effects should be disabled
 */
export function shouldDisableHeavyEffects(): boolean {
  const settings = getSettings();
  return !settings.enableBlur || !settings.enableShadows || !settings.enableGlassEffect;
}

/**
 * Get animation duration multiplier
 */
export function getAnimationMultiplier(): number {
  return getSettings().animationDuration;
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  version: DEX_VERSION,
  codename: DEX_CODENAME,
  init: initDEX,
  isInitialized: isDEXInitialized,
  getFeatureFlags,
  isLowEndDevice,
  shouldDisableAnimations,
  shouldDisableHeavyEffects,
  getAnimationMultiplier,
};
