/**
 * ===========================================================================
 * DEX -- Device Performance Tier Manager
 * ===========================================================================
 *
 * Single source of truth for the 5-tier performance system.
 * Auto-detects hardware tier on first launch, persists the profile,
 * and provides preset configurations that every subsystem reads.
 *
 * Tiers: low | mid | high | ultra
 *
 * @author     Onazi Treasure OJ
 * @copyright  Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * @license    MIT License
 * ===========================================================================
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviceTier = 'low' | 'mid' | 'high' | 'ultra';

export interface TierPresets {
  // Visual
  reduceMotion: boolean;
  enableBackdropFilter: boolean;
  enableShadows: boolean;
  enableParticles: boolean;
  enableLiveWallpaper: boolean;
  blurIntensity: number;       // px
  glassOpacity: number;        // 0-100
  animationDurationScale: number;

  // Resource limits
  maxConcurrentApps: number;
  undoHistoryDepth: number;
  thumbnailCacheSize: number;  // count
  previewResolution: string;

  // App loading
  deferHeavyApps: boolean;     // unmount heavy apps when backgrounded
  lowPowerMode: boolean;
}

export interface HardwareSummary {
  cores: number;
  memoryGB: number;
  gpuRenderer: string;
  weakGPU: boolean;
  screenHeight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_TIER = 'dex-device-tier';
const STORAGE_KEY_LAST_OPTIMIZE = 'dex-last-optimize-date';
const STORAGE_KEY_AUTO_OPTIMIZE = 'dex-auto-optimize-daily';
const STORAGE_KEY_MANUAL_OVERRIDE = 'dex-tier-manual-override';

const HEAVY_APP_IDS = ['flux', 'prism', 'vinx', 'forge', 'video-editor', 'image-editor'];

// ---------------------------------------------------------------------------
// Tier presets
// ---------------------------------------------------------------------------

const TIER_PRESETS: Record<DeviceTier, TierPresets> = {
  low: {
    reduceMotion: true,
    enableBackdropFilter: false,
    enableShadows: false,
    enableParticles: false,
    enableLiveWallpaper: false,
    blurIntensity: 0,
    glassOpacity: 100,
    animationDurationScale: 0,
    maxConcurrentApps: 3,
    undoHistoryDepth: 10,
    thumbnailCacheSize: 50,
    previewResolution: '480p',
    deferHeavyApps: true,
    lowPowerMode: true,
  },
  mid: {
    reduceMotion: false,
    enableBackdropFilter: true,
    enableShadows: true,
    enableParticles: true,
    enableLiveWallpaper: true,
    blurIntensity: 12,
    glassOpacity: 75,
    animationDurationScale: 1,
    maxConcurrentApps: 8,
    undoHistoryDepth: 50,
    thumbnailCacheSize: 300,
    previewResolution: '1080p',
    deferHeavyApps: false,
    lowPowerMode: false,
  },
  high: {
    reduceMotion: false,
    enableBackdropFilter: true,
    enableShadows: true,
    enableParticles: true,
    enableLiveWallpaper: true,
    blurIntensity: 20,
    glassOpacity: 70,
    animationDurationScale: 1,
    maxConcurrentApps: 15,
    undoHistoryDepth: 100,
    thumbnailCacheSize: 500,
    previewResolution: '1080p',
    deferHeavyApps: false,
    lowPowerMode: false,
  },
  ultra: {
    reduceMotion: false,
    enableBackdropFilter: true,
    enableShadows: true,
    enableParticles: true,
    enableLiveWallpaper: true,
    blurIntensity: 28,
    glassOpacity: 65,
    animationDurationScale: 1,
    maxConcurrentApps: 99,
    undoHistoryDepth: 200,
    thumbnailCacheSize: 1000,
    previewResolution: '4k',
    deferHeavyApps: false,
    lowPowerMode: false,
  },
};

// ---------------------------------------------------------------------------
// Hardware detection (renderer-side, runs in < 50ms)
// ---------------------------------------------------------------------------

let _cachedSummary: HardwareSummary | null = null;

export function getHardwareSummary(): HardwareSummary {
  if (_cachedSummary) return _cachedSummary;

  const nav = navigator as any;
  const memoryGB = nav.deviceMemory || 4;
  const cores = nav.hardwareConcurrency || 4;
  const screenHeight = Math.min(window.screen.height, window.screen.width);

  let gpuRenderer = 'unknown';
  let weakGPU = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        gpuRenderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown';
        weakGPU = /swiftshader|llvmpipe|mesa|software|microsoft basic/i.test(gpuRenderer);
      }
    }
  } catch { /* no WebGL */ }

  _cachedSummary = { cores, memoryGB, gpuRenderer, weakGPU, screenHeight };
  return _cachedSummary;
}

// ---------------------------------------------------------------------------
// Tier detection
// ---------------------------------------------------------------------------

export function detectDeviceTier(): DeviceTier {
  const hw = getHardwareSummary();

  // Ultra: 16+ cores, 16+ GB, no weak GPU
  if (hw.cores >= 16 && hw.memoryGB >= 16 && !hw.weakGPU) return 'ultra';

  // High: 8+ cores, 8+ GB
  if (hw.cores >= 8 && hw.memoryGB >= 8 && !hw.weakGPU) return 'high';

  // Mid: 4+ cores, 4+ GB
  if (hw.cores >= 4 && hw.memoryGB >= 4 && !hw.weakGPU) return 'mid';

  // Low: everything else (budget / older hardware, weak GPU, small screens)
  return 'low';
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function getTierPresets(tier: DeviceTier): TierPresets {
  return { ...TIER_PRESETS[tier] };
}

export function isHeavyApp(appId: string): boolean {
  return HEAVY_APP_IDS.includes(appId);
}

export function shouldKeepAlive(appId: string, tier: DeviceTier): boolean {
  if (!TIER_PRESETS[tier].deferHeavyApps) return true;
  return !isHeavyApp(appId);
}

export function getMaxConcurrentApps(tier: DeviceTier): number {
  return TIER_PRESETS[tier].maxConcurrentApps;
}

// ---------------------------------------------------------------------------
// Apply presets — writes to CSS vars + data attributes + localStorage
// ---------------------------------------------------------------------------

export function applyTierPresets(tier: DeviceTier): void {
  const presets = getTierPresets(tier);
  const root = document.documentElement;

  // Set the CSS tier attribute (used by uiPolish.ts tier rules)
  root.setAttribute('data-perf-tier', tier);

  // CSS custom properties
  root.style.setProperty('--blur-intensity', `${presets.blurIntensity}px`);
  root.style.setProperty('--glass-opacity', String(presets.glassOpacity / 100));

  if (presets.reduceMotion) {
    root.style.setProperty('--duration-fast', '0ms');
    root.style.setProperty('--duration-normal', '0ms');
    root.style.setProperty('--duration-slow', '0ms');
  } else {
    const scale = presets.animationDurationScale;
    root.style.setProperty('--duration-fast', `${Math.round(100 * scale)}ms`);
    root.style.setProperty('--duration-normal', `${Math.round(200 * scale)}ms`);
    root.style.setProperty('--duration-slow', `${Math.round(400 * scale)}ms`);
  }

  // Persist
  try {
    localStorage.setItem(STORAGE_KEY_TIER, tier);
    localStorage.setItem(STORAGE_KEY_LAST_OPTIMIZE, new Date().toDateString());
  } catch { /* storage full */ }
}

// ---------------------------------------------------------------------------
// Stored tier management
// ---------------------------------------------------------------------------

export function getStoredTier(): DeviceTier | null {
  try {
    let v = localStorage.getItem(STORAGE_KEY_TIER);
    // Migrate legacy 5-tier values to strict 4-tier model
    if (v === 'lowest' || v === 'ultra-low') { v = 'low'; localStorage.setItem(STORAGE_KEY_TIER, v); }
    if (v && ['low', 'mid', 'high', 'ultra'].includes(v)) return v as DeviceTier;
  } catch { /* */ }
  return null;
}

export function isManualOverride(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_MANUAL_OVERRIDE) === '1';
  } catch { return false; }
}

export function setManualOverride(tier: DeviceTier): void {
  try {
    localStorage.setItem(STORAGE_KEY_MANUAL_OVERRIDE, '1');
    localStorage.setItem(STORAGE_KEY_TIER, tier);
  } catch { /* */ }
  applyTierPresets(tier);
}

export function clearManualOverride(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_MANUAL_OVERRIDE);
  } catch { /* */ }
}

export function isAutoOptimizeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_AUTO_OPTIMIZE) !== '0';
  } catch { return true; }
}

export function setAutoOptimizeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_OPTIMIZE, enabled ? '1' : '0');
  } catch { /* */ }
}

// ---------------------------------------------------------------------------
// Daily check — returns true if re-optimization was performed
// ---------------------------------------------------------------------------

export function runDailyOptimizeCheck(): boolean {
  if (!isAutoOptimizeEnabled()) return false;
  if (isManualOverride()) return false;

  try {
    const lastDate = localStorage.getItem(STORAGE_KEY_LAST_OPTIMIZE);
    const today = new Date().toDateString();
    if (lastDate === today) return false;

    const detected = detectDeviceTier();
    applyTierPresets(detected);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// First-launch initialization
// ---------------------------------------------------------------------------

export function initializeTier(): DeviceTier {
  const stored = getStoredTier();

  if (stored && isManualOverride()) {
    // User manually set a tier — respect it, just apply CSS
    applyTierPresets(stored);
    return stored;
  }

  if (stored) {
    // Have a stored tier — apply it, but check for daily re-optimization
    applyTierPresets(stored);
    runDailyOptimizeCheck();
    return getStoredTier() || stored;
  }

  // First launch — detect and apply
  const detected = detectDeviceTier();
  applyTierPresets(detected);
  return detected;
}

// ---------------------------------------------------------------------------
// Tier label helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<DeviceTier, string> = {
  low: 'Low',
  mid: 'Mid',
  high: 'High',
  ultra: 'Ultra',
};

const TIER_DESCRIPTIONS: Record<DeviceTier, string> = {
  low: 'Minimal effects, maximum stability. For older or budget hardware.',
  mid: 'Balanced quality and performance. For mainstream hardware.',
  high: 'Full effects and smooth animations. For powerful hardware.',
  ultra: 'Maximum quality, all effects enabled. For high-end hardware.',
};

export function getTierLabel(tier: DeviceTier): string {
  return TIER_LABELS[tier];
}

export function getTierDescription(tier: DeviceTier): string {
  return TIER_DESCRIPTIONS[tier];
}

export const ALL_TIERS: DeviceTier[] = ['low', 'mid', 'high', 'ultra'];
