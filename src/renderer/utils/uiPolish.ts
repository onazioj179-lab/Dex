// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Shared UI polish styles for DEX apps.
 * Items 69-83: Animations, tooltips, visual consistency, accessibility.
 */

// ===== Item 69: Panel open/close animation =====
export const PANEL_ANIMATION_STYLE = `
@keyframes dex-panel-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes dex-panel-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(8px); }
}
.dex-panel-enter {
  animation: dex-panel-in 200ms ease-out forwards;
}
`;

// ===== Item 70: Toolbar button transition =====
export const TOOLBAR_TRANSITION = 'background-color 150ms ease, color 150ms ease, border-color 150ms ease';

// ===== Item 71: Slider hover/drag styles =====
export const SLIDER_STYLES = `
input[type="range"]::-webkit-slider-thumb {
  transition: transform 150ms ease, box-shadow 150ms ease;
}
input[type="range"]:hover::-webkit-slider-thumb {
  transform: scale(1.2);
}
input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.3);
  box-shadow: 0 0 8px rgba(10,132,255,0.4);
}
`;

// ===== Item 75: Standardized panel header =====
export const PANEL_HEADER_HEIGHT = 38;
export const panelHeaderStyle: React.CSSProperties = {
  height: PANEL_HEADER_HEIGHT,
  padding: '0 14px',
  borderBottom: '1px solid var(--color-bg-hover)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};

// ===== Item 76: Standardized panel body =====
export const PANEL_BODY_PADDING = 14;
export const panelBodyStyle: React.CSSProperties = {
  padding: PANEL_BODY_PADDING,
};

// ===== Item 78: Action button (green) =====
export const actionButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid rgba(48,209,88,0.3)',
  background: 'rgba(48,209,88,0.12)',
  color: 'var(--color-success)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  transition: TOOLBAR_TRANSITION,
};

// ===== Item 79: Destructive button (red) =====
export const destructiveButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: '1px solid rgba(255,69,58,0.3)',
  background: 'rgba(255,69,58,0.12)',
  color: 'var(--color-error)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  transition: TOOLBAR_TRANSITION,
};

// ===== Item 81: Focus-visible outline =====
export const FOCUS_VISIBLE_STYLES = `
button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 2px;
}
`;

// ===== Item 80: Scroll fade gradient =====
export const scrollFadeTopStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 16,
  background: 'linear-gradient(to bottom, rgba(20,20,22,0.97), transparent)',
  pointerEvents: 'none',
  zIndex: 1,
};

export const scrollFadeBottomStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 16,
  background: 'linear-gradient(to top, rgba(20,20,22,0.97), transparent)',
  pointerEvents: 'none',
  zIndex: 1,
};

// ===== Tooltip system for [data-tip] attributes =====
const TOOLTIP_STYLES = `
[data-tip] {
  position: relative;
}
[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 5px;
  background: rgba(30,30,32,0.92);
  color: var(--color-text-primary);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: var(--z-tooltip, 9400);
  border: 1px solid var(--color-border-subtle);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  letter-spacing: 0.01em;
}
[data-tip]:focus-visible::after {
  opacity: 1;
  transition-delay: 0ms;
}
[data-dock-item] [data-tip]::after {
  bottom: calc(100% + 8px);
}
[data-perf-tier="low"] [data-tip]::after {
  display: none !important;
}
`;

// Combined CSS injection for items 69, 71, 81, tooltips, and perf-tier adaptations
const PERF_TIER_CSS = `
/* Low-tier device: zero visual overhead */
html[data-perf-tier="low"] * {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  animation: none !important;
  transition: none !important;
  box-shadow: none !important;
  filter: none !important;
  text-shadow: none !important;
}
html[data-perf-tier="low"] [data-tip]::after { display: none !important; }
html[data-perf-tier="low"] [style*="backdrop"] {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
/* Mid-tier: cap blur to 6px, reduce transition times */
html[data-perf-tier="mid"] * {
  transition-duration: 120ms !important;
}
/* High-tier: full effects (no overrides needed) */
/* Ultra-tier: full effects, enhanced particles (no overrides needed) */
/* Reduce motion: minimal animations on any tier */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export const GLOBAL_POLISH_CSS = PANEL_ANIMATION_STYLE + SLIDER_STYLES + FOCUS_VISIBLE_STYLES + TOOLTIP_STYLES + PERF_TIER_CSS;

import React from 'react';
