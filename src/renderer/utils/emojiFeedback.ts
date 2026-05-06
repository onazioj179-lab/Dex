/**
 * DEX Platform - Emoji Feedback System
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Provides emoji-enhanced feedback messages, status indicators,
 * and celebratory animations for user interactions.
 */

// ============================================================================
// Status Emoji Mapping
// ============================================================================

export const STATUS_EMOJIS = {
  // Success states
  success: '✅',
  completed: '🎉',
  saved: '💾',
  uploaded: '📤',
  downloaded: '📥',
  synced: '🔄',
  connected: '🔗',
  
  // Warning states
  warning: '⚠️',
  attention: '👀',
  pending: '⏳',
  slow: '🐢',
  
  // Error states
  error: '❌',
  failed: '💥',
  offline: '📴',
  disconnected: '🔌',
  
  // Info states
  info: 'ℹ️',
  tip: '💡',
  new: '🆕',
  update: '🔔',
  
  // Actions
  loading: '⏳',
  processing: '⚙️',
  searching: '🔍',
  thinking: '🧠',
  
  // Creative
  music: '🎵',
  video: '🎬',
  image: '🖼️',
  animation: '✨',
  design: '🎨',
  code: '💻',
  
  // Files
  file: '📄',
  folder: '📁',
  archive: '📦',
  document: '📑',
  
  // Achievements
  trophy: '🏆',
  medal: '🥇',
  star: '⭐',
  fire: '🔥',
  rocket: '🚀',
  crown: '👑',
  gem: '💎',
  
  // Misc
  love: '❤️',
  thumbsUp: '👍',
  thumbsDown: '👎',
  wave: '👋',
  celebration: '🎊',
  party: '🥳',
  magic: '🪄',
  sparkles: '✨',
  lightning: '⚡',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  shield: '🛡️',
  target: '🎯',
  calendar: '📅',
  clock: '🕐',
  alarm: '⏰',
  bell: '🔔',
  microphone: '🎤',
  speaker: '🔊',
  mute: '🔇',
  eye: '👁️',
  heart: '💖',
  brain: '🧠',
  battery: '🔋',
  plug: '🔌',
  wifi: '📶',
  location: '📍',
  map: '🗺️',
  compass: '🧭',
  sun: '☀️',
  moon: '🌙',
  cloud: '☁️',
  rain: '🌧️',
  snow: '❄️',
  temperature: '🌡️',
} as const;

export type StatusEmojiKey = keyof typeof STATUS_EMOJIS;

// ============================================================================
// Feedback Messages
// ============================================================================

export interface FeedbackMessage {
  emoji: string;
  title: string;
  subtitle?: string;
  type: 'success' | 'warning' | 'error' | 'info';
}

export const FEEDBACK_MESSAGES: Record<string, FeedbackMessage> = {
  // File operations
  fileSaved: { emoji: '💾', title: 'Saved!', type: 'success' },
  fileCreated: { emoji: '📄', title: 'File Created', type: 'success' },
  fileDeleted: { emoji: '🗑️', title: 'Moved to Trash', type: 'info' },
  fileCopied: { emoji: '📋', title: 'Copied!', type: 'success' },
  fileMoved: { emoji: '📦', title: 'Moved!', type: 'success' },
  fileNotFound: { emoji: '🔍', title: 'File Not Found', type: 'error' },
  
  // Export/Import
  exportComplete: { emoji: '📤', title: 'Export Complete!', type: 'success' },
  importComplete: { emoji: '📥', title: 'Import Complete!', type: 'success' },
  exportFailed: { emoji: '❌', title: 'Export Failed', type: 'error' },
  importFailed: { emoji: '❌', title: 'Import Failed', type: 'error' },
  
  // Sync
  syncComplete: { emoji: '🔄', title: 'Synced!', type: 'success' },
  syncFailed: { emoji: '📴', title: 'Sync Failed', type: 'error' },
  syncPending: { emoji: '⏳', title: 'Syncing...', type: 'info' },
  
  // Authentication
  loggedIn: { emoji: '👋', title: 'Welcome back!', type: 'success' },
  loggedOut: { emoji: '👋', title: 'See you later!', type: 'info' },
  sessionExpired: { emoji: '⏰', title: 'Session Expired', type: 'warning' },
  
  // Creative apps
  renderComplete: { emoji: '🎬', title: 'Render Complete!', type: 'success' },
  renderFailed: { emoji: '💥', title: 'Render Failed', type: 'error' },
  renderStarted: { emoji: '⚙️', title: 'Rendering...', type: 'info' },
  audioExported: { emoji: '🎵', title: 'Audio Exported!', type: 'success' },
  imageExported: { emoji: '🖼️', title: 'Image Exported!', type: 'success' },
  
  // Achievements
  levelUp: { emoji: '🎉', title: 'Level Up!', type: 'success' },
  badgeEarned: { emoji: '🏆', title: 'Badge Earned!', type: 'success' },
  streakContinued: { emoji: '🔥', title: 'Streak Continues!', type: 'success' },
  goalReached: { emoji: '🎯', title: 'Goal Reached!', type: 'success' },
  
  // Errors
  unknownError: { emoji: '😕', title: 'Something went wrong', type: 'error' },
  networkError: { emoji: '📶', title: 'Network Error', type: 'error' },
  permissionDenied: { emoji: '🔒', title: 'Permission Denied', type: 'error' },
  diskFull: { emoji: '💾', title: 'Disk Full', type: 'error' },
  
  // Warnings
  unsavedChanges: { emoji: '⚠️', title: 'Unsaved Changes', type: 'warning' },
  lowBattery: { emoji: '🪫', title: 'Low Battery', type: 'warning' },
  lowStorage: { emoji: '📦', title: 'Low Storage', type: 'warning' },
  
  // Info
  updateAvailable: { emoji: '🆕', title: 'Update Available', type: 'info' },
  featureNew: { emoji: '✨', title: 'New Feature!', type: 'info' },
  tipOfTheDay: { emoji: '💡', title: 'Tip of the Day', type: 'info' },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get emoji for a status key
 */
export function getEmoji(key: StatusEmojiKey): string {
  return STATUS_EMOJIS[key] || '📌';
}

/**
 * Get feedback message for a key
 */
export function getFeedback(key: keyof typeof FEEDBACK_MESSAGES): FeedbackMessage {
  return FEEDBACK_MESSAGES[key] || { emoji: 'ℹ️', title: key, type: 'info' };
}

/**
 * Format a message with emoji prefix
 */
export function formatWithEmoji(
  message: string,
  emoji: string | StatusEmojiKey = 'info'
): string {
  const e = emoji in STATUS_EMOJIS ? STATUS_EMOJIS[emoji as StatusEmojiKey] : emoji;
  return `${e} ${message}`;
}

/**
 * Get appropriate emoji for file type
 */
export function getFileEmoji(filename: string, isDir = false): string {
  if (isDir) return '📁';
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Images
  if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(ext)) return '🖼️';
  
  // Videos
  if (/^(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(ext)) return '🎬';
  
  // Audio
  if (/^(mp3|wav|flac|aac|ogg|m4a|wma)$/.test(ext)) return '🎵';
  
  // Documents
  if (/^(pdf)$/.test(ext)) return '📕';
  if (/^(doc|docx|odt|rtf)$/.test(ext)) return '📄';
  if (/^(xls|xlsx|csv)$/.test(ext)) return '📊';
  if (/^(ppt|pptx)$/.test(ext)) return '📽️';
  if (/^(txt|md)$/.test(ext)) return '📝';
  
  // Code
  if (/^(ts|tsx|js|jsx)$/.test(ext)) return '💛';
  if (/^(py)$/.test(ext)) return '🐍';
  if (/^(rs)$/.test(ext)) return '🦀';
  if (/^(go)$/.test(ext)) return '🐹';
  if (/^(java|kt)$/.test(ext)) return '☕';
  if (/^(c|cpp|h|hpp)$/.test(ext)) return '⚙️';
  if (/^(css|scss|sass|less)$/.test(ext)) return '🎨';
  if (/^(html|htm)$/.test(ext)) return '🌐';
  if (/^(json|yaml|yml|toml|xml)$/.test(ext)) return '📋';
  
  // Archives
  if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext)) return '📦';
  
  // 3D
  if (/^(obj|fbx|gltf|glb|blend|stl)$/.test(ext)) return '🧊';
  
  // Fonts
  if (/^(ttf|otf|woff|woff2)$/.test(ext)) return '🔤';
  
  // Executables
  if (/^(exe|msi|app|dmg)$/.test(ext)) return '⚙️';
  
  return '📄';
}

/**
 * Get status emoji with color hint
 */
export function getStatusEmoji(
  status: 'success' | 'warning' | 'error' | 'info' | 'pending'
): string {
  switch (status) {
    case 'success': return '✅';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    case 'info': return 'ℹ️';
    case 'pending': return '⏳';
    default: return '📌';
  }
}

/**
 * Get progress emoji based on percentage
 */
export function getProgressEmoji(percent: number): string {
  if (percent >= 100) return '🎉';
  if (percent >= 90) return '🔥';
  if (percent >= 75) return '⚡';
  if (percent >= 50) return '💪';
  if (percent >= 25) return '🚀';
  return '🏁';
}

/**
 * Get random celebration emoji
 */
export function getRandomCelebration(): string {
  const celebrations = ['🎉', '🎊', '🥳', '🏆', '⭐', '🌟', '✨', '💫', '🎯', '🚀', '🔥', '💎', '👏', '🙌'];
  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

/**
 * Get weather emoji
 */
export function getWeatherEmoji(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('clear') || c.includes('sunny')) return '☀️';
  if (c.includes('cloud') && c.includes('sun')) return '⛅';
  if (c.includes('cloud')) return '☁️';
  if (c.includes('rain')) return '🌧️';
  if (c.includes('storm') || c.includes('thunder')) return '⛈️';
  if (c.includes('snow')) return '❄️';
  if (c.includes('fog') || c.includes('mist')) return '🌫️';
  if (c.includes('wind')) return '💨';
  if (c.includes('night') || c.includes('moon')) return '🌙';
  return '🌡️';
}

/**
 * Get battery emoji based on level
 */
export function getBatteryEmoji(level: number, charging = false): string {
  if (charging) return '🔌';
  if (level > 80) return '🔋';
  if (level > 50) return '🔋';
  if (level > 20) return '🪫';
  return '🪫';
}

/**
 * Get time-of-day greeting with emoji
 */
export function getTimeGreeting(): { emoji: string; greeting: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { emoji: '🌙', greeting: 'Good night' };
  if (hour < 12) return { emoji: '☀️', greeting: 'Good morning' };
  if (hour < 17) return { emoji: '🌤️', greeting: 'Good afternoon' };
  if (hour < 21) return { emoji: '🌆', greeting: 'Good evening' };
  return { emoji: '🌙', greeting: 'Good night' };
}

// ============================================================================
// Celebration Effects (CSS class triggers)
// ============================================================================

export const CELEBRATION_CLASSES = {
  confetti: 'animate-confetti',
  sparkle: 'animate-sparkle',
  bounce: 'animate-bounce',
  pulse: 'animate-pulse',
  shake: 'animate-shake',
  glow: 'animate-glow',
} as const;

/**
 * Trigger a celebration effect by adding a class to an element
 */
export function triggerCelebration(
  element: HTMLElement,
  effect: keyof typeof CELEBRATION_CLASSES = 'confetti',
  duration = 1000
): void {
  const className = CELEBRATION_CLASSES[effect];
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), duration);
}

// Default export
export default {
  STATUS_EMOJIS,
  FEEDBACK_MESSAGES,
  getEmoji,
  getFeedback,
  formatWithEmoji,
  getFileEmoji,
  getStatusEmoji,
  getProgressEmoji,
  getRandomCelebration,
  getWeatherEmoji,
  getBatteryEmoji,
  getTimeGreeting,
  triggerCelebration,
};
