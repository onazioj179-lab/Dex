// =============================================================================
// DEX Platform — Track H: platform parity policy
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Per-platform feature support matrix + installer/notarization gating.
 * Used by build scripts (when invoked) and by the renderer to gray out
 * features that the current host cannot provide.
 */

export type PlatformId = 'win-x64' | 'win-arm64' | 'mac-arm64' | 'mac-x64' | 'linux-x64' | 'linux-arm64' | 'dex-os';

export type FeatureId =
  | 'hardware-encode' | 'gpu-compute' | 'low-latency-audio'
  | 'media-keys' | 'global-shortcuts' | 'wayland'
  | 'gptk' | 'proton' | 'win-loader' | 'msstore-pkg' | 'mac-app-store'
  | 'steam-deck-game-mode' | 'apple-touch-bar' | 'fseventschange'
  | 'dbus' | 'system-tray' | 'notarized-installer';

const MATRIX: Record<PlatformId, Set<FeatureId>> = {
  'win-x64':     new Set(['hardware-encode', 'gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'win-loader', 'msstore-pkg', 'system-tray']),
  'win-arm64':   new Set(['gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'win-loader', 'msstore-pkg', 'system-tray']),
  'mac-arm64':   new Set(['hardware-encode', 'gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'gptk', 'mac-app-store', 'apple-touch-bar', 'fseventschange', 'notarized-installer', 'system-tray']),
  'mac-x64':     new Set(['gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'mac-app-store', 'apple-touch-bar', 'fseventschange', 'notarized-installer', 'system-tray']),
  'linux-x64':   new Set(['gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'wayland', 'proton', 'dbus', 'system-tray']),
  'linux-arm64': new Set(['gpu-compute', 'low-latency-audio', 'media-keys', 'wayland', 'dbus', 'system-tray']),
  'dex-os':      new Set(['hardware-encode', 'gpu-compute', 'low-latency-audio', 'media-keys', 'global-shortcuts', 'wayland', 'proton', 'steam-deck-game-mode', 'dbus']),
};

export function supports(platform: PlatformId, feature: FeatureId): boolean {
  return MATRIX[platform].has(feature);
}

export function listFeatures(platform: PlatformId): FeatureId[] {
  return Array.from(MATRIX[platform]).sort();
}

export interface BuildArtifact {
  platform: PlatformId;
  format: 'nsis' | 'msi' | 'msix' | 'dmg' | 'pkg' | 'AppImage' | 'deb' | 'rpm' | 'iso';
  /** Whether this artifact is signed for distribution. */
  signed: boolean;
  /** Whether notarization is required (mac). */
  notarized?: boolean;
}

export function defaultArtifactsFor(platform: PlatformId): BuildArtifact[] {
  switch (platform) {
    case 'win-x64':     return [{ platform, format: 'nsis', signed: true }, { platform, format: 'msix', signed: true }];
    case 'win-arm64':   return [{ platform, format: 'nsis', signed: true }];
    case 'mac-arm64':   return [{ platform, format: 'dmg', signed: true, notarized: true }, { platform, format: 'pkg', signed: true, notarized: true }];
    case 'mac-x64':     return [{ platform, format: 'dmg', signed: true, notarized: true }];
    case 'linux-x64':   return [{ platform, format: 'AppImage', signed: true }, { platform, format: 'deb', signed: true }, { platform, format: 'rpm', signed: true }];
    case 'linux-arm64': return [{ platform, format: 'AppImage', signed: true }, { platform, format: 'deb', signed: true }];
    case 'dex-os':      return [{ platform, format: 'iso', signed: true }];
  }
}

/** Block a release if any required platform's required feature is missing. */
export function checkReleaseGate(
  required: { platform: PlatformId; features: FeatureId[] }[]
): { ok: boolean; missing: { platform: PlatformId; feature: FeatureId }[] } {
  const missing: { platform: PlatformId; feature: FeatureId }[] = [];
  for (const r of required) {
    for (const f of r.features) {
      if (!supports(r.platform, f)) missing.push({ platform: r.platform, feature: f });
    }
  }
  return { ok: missing.length === 0, missing };
}
