// =============================================================================
// DEX Platform — Z-Index Constants
// =============================================================================
// Single source of truth for all stacking layers. Keep values in ascending
// order so the ladder stays readable. Never hard-code z-index values elsewhere;
// import from here instead.
//
// Ladder (ascending):
//   floating windows  <  dock  <  dropdowns  <  MiniPulse  <  diagnostics
//   <  help/overlays  <  focus session
// =============================================================================

/** Floating windows managed by FloatingWindow.tsx (baseline 200, cap 4990). */
export const Z_FLOATING_WINDOW_BASE = 200;
export const Z_FLOATING_WINDOW_MAX  = 4990;

/** Dock / taskbar (AppManager top bar + bottom dock). */
export const Z_DOCK = 5000;

/** Dropdown menus, context menus, and similar transient popups. */
export const Z_DROPDOWN_BASE = 6000;
export const Z_DROPDOWN_MAX  = 9000;

/**
 * MiniPulse always-on-top pill.
 * Sits inside the dropdown band but below DiagnosticsPanel so it never
 * obscures diagnostics or the Focus Mode controls.
 */
export const Z_MINI_PULSE = 8500;

/** DiagnosticsPanel / developer overlay. */
export const Z_DIAGNOSTICS = 9999;

/** Help overlay, onboarding spotlights, and similar guidance layers. */
export const Z_HELP_OVERLAY_BASE = 10000;
export const Z_HELP_OVERLAY_MAX  = 12000;

/**
 * Focus Session overlay — must cover everything except the system title bar.
 * Two values: the tinted background (BASE) and the controls on top (TOP).
 */
export const Z_FOCUS_SESSION      = 99998;
export const Z_FOCUS_SESSION_TOP  = 99999;
