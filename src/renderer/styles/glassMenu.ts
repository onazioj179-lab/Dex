/**
 * DEX Glass Menu Utility
 * Shared transparent glass-effect styles for dropdowns, menus, popovers, and overlays.
 * Use these instead of hardcoded opaque backgrounds.
 */

import type React from 'react';

/** Standard glass menu/dropdown: solid with subtle blur + border */
export const glassMenu: React.CSSProperties = {
  background: 'rgba(30,30,30,0.82)',
  backdropFilter: 'blur(16px) saturate(180%)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

/** Stronger glass for panels/sidebars */
export const glassPanel: React.CSSProperties = {
  background: 'rgba(25,25,28,0.85)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
};

/** Lighter glass for toolbar-level elements */
export const glassToolbar: React.CSSProperties = {
  background: 'rgba(35,35,38,0.78)',
  backdropFilter: 'blur(14px) saturate(160%)',
  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  border: '1px solid rgba(255,255,255,0.12)',
};

/** Glass overlay for modals/palettes */
export const glassOverlay: React.CSSProperties = {
  background: 'rgba(0,0,0,0.65)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
};

/** Glass select/dropdown item styles */
export const glassSelectStyles: React.CSSProperties = {
  background: 'rgba(30,30,30,0.82)',
  backdropFilter: 'blur(16px) saturate(180%)',
  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: 'var(--color-text-primary, #f5f5f7)',
  outline: 'none',
  cursor: 'pointer',
};

/** Glass button — solid with subtle border */
export const glassButton: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.14)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  borderRadius: 6,
  color: 'var(--color-text-primary, #f5f5f7)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

/** Hover state for glass buttons */
export const glassButtonHover: React.CSSProperties = {
  background: 'rgba(255,255,255,0.18)',
  borderColor: 'rgba(255,255,255,0.20)',
};

export default {
  glassMenu,
  glassPanel,
  glassToolbar,
  glassOverlay,
  glassSelectStyles,
  glassButton,
  glassButtonHover,
};
