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

import { applyMotionDurations } from '../styles/motionDurations';

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
    maxConcurrentApps: 6,
    undoHistoryDepth: 5,
    thumbnailCacheSize: 30,
    previewResolution: '480p',
    deferHeavyApps: true,
    lowPowerMode: true,
  },
  mid: {
    reduceMotion: false,
    enableBackdropFilter: true,
    enableShadows: true,
    enableParticles: false,
    enableLiveWallpaper: false,
    blurIntensity: 8,
    glassOpacity: 80,
    animationDurationScale: 1,
    maxConcurrentApps: 10,
    undoHistoryDepth: 30,
    thumbnailCacheSize: 200,
    previewResolution: '720p',
    // Mid still defers heavy apps when backgrounded — mid-range machines crash
    // when 2+ heavy apps stay resident. They re-mount instantly when foregrounded.
    deferHeavyApps: true,
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
  // Only CONFIRMED software rendering counts as weak. An unreadable GPU string
  // (webviews routinely mask WEBGL_debug_renderer_info for privacy) is treated
  // as NOT weak so capable machines aren't wrongly pinned to the low tier --
  // which would strip the liquid glass down to a flat surface. The runtime
  // AdaptivePerfMonitor downgrades at the first sign of real frame drops, so an
  // optimistic start is safe.
  let weakGPU = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        gpuRenderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown';
        // Confirmed software / basic renderers genuinely cannot handle GPU
        // compositing. (Mesa is a real hardware driver on Linux, so it is NOT
        // treated as software here.)
        weakGPU = /swiftshader|llvmpipe|software|microsoft basic|softpipe/i.test(gpuRenderer);
      }
    } else {
      // No WebGL at all -> genuinely can't GPU-composite.
      weakGPU = true;
    }
  } catch { weakGPU = true; }

  _cachedSummary = { cores, memoryGB, gpuRenderer, weakGPU, screenHeight };
  return _cachedSummary;
}

// ---------------------------------------------------------------------------
// Tier detection
// ---------------------------------------------------------------------------

export function detectDeviceTier(): DeviceTier {
  const hw = getHardwareSummary();

  // Ultra: 16+ cores, 16+ GB, confirmed strong GPU
  if (hw.cores >= 16 && hw.memoryGB >= 16 && !hw.weakGPU) return 'ultra';

  // High: 8+ cores, 8+ GB, confirmed strong GPU
  if (hw.cores >= 8 && hw.memoryGB >= 8 && !hw.weakGPU) return 'high';

  // Mid: 6+ cores, 8+ GB — require more headroom than before so weak
  // mid-range machines fall back to low and don't overload on first install.
  if (hw.cores >= 6 && hw.memoryGB >= 8 && !hw.weakGPU) return 'mid';

  // Low: everything else (budget / older hardware, weak/unknown GPU, small screens)
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

// ---------------------------------------------------------------------------
// Lifecycle tiers — drive the AppLifecycle protocol (background/suspend policy).
// heavy-gpu : stop the rAF/canvas loop on background, lose the GL context on
//             suspend (extended idle / memory pressure).
// heavy-audio: suspend the AudioContext + free re-decodable buffers as soon as
//             the app loses the foreground (no audio should bleed from a hidden
//             DAW, and the hardware audio thread frees immediately).
// light     : no-op; never suspended.
// ---------------------------------------------------------------------------

export type LifecycleTier = 'heavy-gpu' | 'heavy-audio' | 'light';

const HEAVY_GPU_APP_IDS = ['flux', 'prism', 'vinx', 'axl', 'video-editor', 'image-editor'];
const HEAVY_AUDIO_APP_IDS = ['imosion', 'forge', 'audio'];

export function getLifecycleTier(appId: string): LifecycleTier {
  if (HEAVY_GPU_APP_IDS.includes(appId)) return 'heavy-gpu';
  if (HEAVY_AUDIO_APP_IDS.includes(appId)) return 'heavy-audio';
  return 'light';
}

export function shouldKeepAlive(_appId: string, _tier: DeviceTier): boolean {
  // Owner directive: apps NEVER close, blank, or unmount on their own -- not on
  // idle, not when backgrounded, not under memory pressure, on any tier. Every
  // launched app stays fully mounted and alive so switching back is instant and
  // never shows a blank/reloading surface. Resource pressure is handled by Xenon
  // throttling CPU/GPU/FPS (prioritization), which keeps the component mounted.
  return true;
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

  // One source of truth for durations (was 100/200/400 ms here, conflicting
  // with the stylesheet and Settings).
  applyMotionDurations(root, { reduce: presets.reduceMotion, scale: presets.animationDurationScale });

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

    const rank: Record<DeviceTier, number> = { low: 0, mid: 1, high: 2, ultra: 3 };
    const current = getStoredTier();
    const detected = detectDeviceTier();

    // Never auto-downgrade a user's visual tier on daily checks. This avoids
    // surprise fallback into low-tier "boxy" styling after idle/resume cycles.
    if (!current || rank[detected] > rank[current]) {
      applyTierPresets(detected);
      return true;
    }

    // Mark check complete for the day even when we keep the existing tier.
    localStorage.setItem(STORAGE_KEY_LAST_OPTIMIZE, today);
    return false;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// First-launch initialization
// ---------------------------------------------------------------------------

// Bump when the auto-detection heuristic changes so existing users with a
// stale auto-detected tier get re-evaluated once (manual overrides are kept).
const DETECTION_VERSION = '2';
const STORAGE_KEY_DETECT_VERSION = 'dex-tier-detect-version';

export function initializeTier(): DeviceTier {
  const stored = getStoredTier();

  if (stored && isManualOverride()) {
    // User manually set a tier — respect it, just apply CSS
    applyTierPresets(stored);
    return stored;
  }

  // Detection logic changed: discard a stale AUTO tier so the improved heuristic
  // runs fresh (this is what unsticks machines wrongly pinned to "low", which had
  // flattened the liquid glass). One-time per detection version.
  try {
    if (localStorage.getItem(STORAGE_KEY_DETECT_VERSION) !== DETECTION_VERSION) {
      localStorage.setItem(STORAGE_KEY_DETECT_VERSION, DETECTION_VERSION);
      localStorage.removeItem(STORAGE_KEY_TIER);
      localStorage.removeItem(STORAGE_KEY_LAST_OPTIMIZE);
      const detected = detectDeviceTier();
      applyTierPresets(detected);
      return detected;
    }
  } catch { /* storage unavailable -- fall through to normal path */ }

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
  low: 'Resource Saver',
  mid: 'Balanced',
  high: 'Performance',
  ultra: 'Maximum',
};

const TIER_DESCRIPTIONS: Record<DeviceTier, string> = {
  low: 'Opaque surfaces, no blur, shadows or animation, smaller caches, 1 awake background browser tab. For older or budget hardware.',
  mid: 'Light blur and full animation, 3 awake background browser tabs. For mainstream hardware.',
  high: 'Full blur, live wallpapers and effects, 5 awake background browser tabs. For powerful hardware.',
  ultra: 'Strongest blur and every effect, 8 awake background browser tabs. For high-end hardware.',
};

export function getTierLabel(tier: DeviceTier): string {
  return TIER_LABELS[tier];
}

export function getTierDescription(tier: DeviceTier): string {
  return TIER_DESCRIPTIONS[tier];
}

export const ALL_TIERS: DeviceTier[] = ['low', 'mid', 'high', 'ultra'];
