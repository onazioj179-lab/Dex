// =============================================================================
// DEX Platform — Simplified UI mode
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * "Return to cleaner UI" helpers.
 *
 * Produces deterministic layout settings that reduce motion/clutter and expose
 * legacy-style, task-first controls.
 */

export interface UiSettings {
  densePanels: boolean;
  floatingToolbars: boolean;
  animatedTransitions: boolean;
  progressiveDisclosure: boolean;
  iconLabels: boolean;
  panelChrome: 'minimal' | 'standard';
  commandPaletteFirst: boolean;
  timelineCompact: boolean;
}

export interface SimplifiedUiProfile {
  id: 'legacy-clean' | 'balanced-modern';
  settings: UiSettings;
}

export const LEGACY_CLEAN_PROFILE: SimplifiedUiProfile = {
  id: 'legacy-clean',
  settings: {
    densePanels: true,
    floatingToolbars: false,
    animatedTransitions: false,
    progressiveDisclosure: false,
    iconLabels: true,
    panelChrome: 'minimal',
    commandPaletteFirst: true,
    timelineCompact: true,
  },
};

export function applySimplifiedUi(base: UiSettings, mode: 'legacy-clean' | 'balanced-modern' = 'legacy-clean'): UiSettings {
  if (mode === 'balanced-modern') {
    return {
      ...base,
      densePanels: true,
      floatingToolbars: false,
      animatedTransitions: false,
      iconLabels: true,
      panelChrome: 'standard',
      commandPaletteFirst: true,
    };
  }
  return {
    ...base,
    ...LEGACY_CLEAN_PROFILE.settings,
  };
}

export function uiClutterScore(s: UiSettings): number {
  let score = 0;
  if (!s.densePanels) score += 2;
  if (s.floatingToolbars) score += 3;
  if (s.animatedTransitions) score += 2;
  if (s.progressiveDisclosure) score += 1;
  if (!s.iconLabels) score += 1;
  if (s.panelChrome === 'standard') score += 1;
  if (!s.timelineCompact) score += 1;
  return score;
}
