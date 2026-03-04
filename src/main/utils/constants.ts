/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX - Application Constants
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Centralized configuration for values that were previously hardcoded 
 * throughout the codebase. Grouped by domain for easy discovery.
 */

// ─────────────────────────────────────────────────────────────────────────
// Window Configuration
// ─────────────────────────────────────────────────────────────────────────
export const WINDOW = {
  DEFAULT_WIDTH: 1400,
  DEFAULT_HEIGHT: 900,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
  BACKGROUND_COLOR: '#f5f5f7',
  TITLE_BAR_COLOR: '#f5f5f7',
  TITLE_BAR_SYMBOL_COLOR: '#1f2937',
  TITLE_BAR_HEIGHT: 32,
  /** Time to wait before force-showing the window (ms) */
  FORCE_SHOW_TIMEOUT: 5000,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Network Ports
// ─────────────────────────────────────────────────────────────────────────
export const PORTS = {
  API_SERVER: 45678,
  SYNC_SERVER: 45679,
  TRANSFER_SERVER: 47633,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Timeouts & Intervals
// ─────────────────────────────────────────────────────────────────────────
export const TIMEOUTS = {
  /** DataStore initialization timeout (ms) */
  DATA_STORE_INIT: 5000,
  /** HTTP download timeout (ms) */
  DOWNLOAD: 30000,
  /** Subsystem initialization delay (ms) */
  SUBSYSTEM_INIT_DELAY: 100,
  /** Shutdown per-module timeout (ms) */
  SHUTDOWN_PER_MODULE: 3000,
} as const;

export const INTERVALS = {
  /** Security context expiry check (ms) */
  SECURITY_CONTEXT_EXPIRY: 5 * 60 * 1000,
  /** Security periodic check (ms) */
  SECURITY_CHECK: 60 * 60 * 1000,
  /** Cloud sync connectivity check (ms) */
  CLOUD_SYNC_CHECK: 5000,
  /** Rate limiter cleanup interval (ms) */
  RATE_LIMIT_CLEANUP: 5 * 60 * 1000,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────────────────
export const LIMITS = {
  /** Maximum log entries kept in memory/store */
  MAX_LOGS: 1000,
  /** Maximum files returned from media scan */
  MAX_MEDIA_SCAN_FILES: 500,
  /** Maximum depth for recursive directory scans */
  MAX_SCAN_DEPTH: 3,
  /** Maximum security threats stored */
  MAX_THREATS_STORED: 100,
  /** Password age threshold before warning (days) */
  PASSWORD_AGE_DAYS: 90,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Theme Defaults
// ─────────────────────────────────────────────────────────────────────────
export const THEME_DEFAULTS = {
  MODE: 'dark' as const,
  ACCENT_COLOR: '#6366f1',  // Indigo — cross-platform appropriate
  FONT_SCALE: 1,
  REDUCED_MOTION: false,
  DENSITY: 'comfortable' as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Media Types
// ─────────────────────────────────────────────────────────────────────────
export const MEDIA_EXTENSIONS = {
  audio: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'],
  images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'],
  video: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
  supported: ['mp4', 'mp3', 'wav', 'jpg', 'png', 'gif', 'webp', 'webm', 'ogg'],
} as const;
