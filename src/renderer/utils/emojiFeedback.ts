/**
 * DEX Platform - Text Feedback System
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * Provides compact text-token feedback messages and status indicators without
 * emoji glyphs, so DEX UI renders consistently across platforms.
 */

// ============================================================================
// Status Token Mapping
// ============================================================================

export const STATUS_EMOJIS = {
  // Success states
  success: 'OK',
  completed: 'DONE',
  saved: 'SAVE',
  uploaded: 'UP',
  downloaded: 'DOWN',
  synced: 'SYNC',
  connected: 'LINK',

  // Warning states
  warning: 'WARN',
  attention: 'LOOK',
  pending: 'WAIT',
  slow: 'SLOW',

  // Error states
  error: 'ERR',
  failed: 'FAIL',
  offline: 'OFF',
  disconnected: 'DISC',

  // Info states
  info: 'INFO',
  tip: 'TIP',
  new: 'NEW',
  update: 'UPDATE',

  // Actions
  loading: 'LOAD',
  processing: 'PROC',
  searching: 'SEARCH',
  thinking: 'THINK',

  // Creative
  music: 'AUDIO',
  video: 'VIDEO',
  image: 'IMAGE',
  animation: 'MOTION',
  design: 'DESIGN',
  code: 'CODE',

  // Files
  file: 'FILE',
  folder: 'FOLDER',
  archive: 'ARCH',
  document: 'DOC',

  // Achievements
  trophy: 'AWARD',
  medal: 'MEDAL',
  star: 'STAR',
  fire: 'HOT',
  rocket: 'LAUNCH',
  crown: 'PRO',
  gem: 'GEM',

  // Misc
  love: 'LIKE',
  thumbsUp: 'UP',
  thumbsDown: 'DOWN',
  wave: 'HELLO',
  celebration: 'CELEB',
  party: 'PARTY',
  magic: 'MAGIC',
  sparkles: 'SPARK',
  lightning: 'FAST',
  lock: 'LOCK',
  unlock: 'UNLOCK',
  key: 'KEY',
  shield: 'SAFE',
  target: 'TARGET',
  calendar: 'CAL',
  clock: 'TIME',
  alarm: 'ALARM',
  bell: 'BELL',
  microphone: 'MIC',
  speaker: 'AUDIO',
  mute: 'MUTE',
  eye: 'VIEW',
  heart: 'HEART',
  brain: 'AI',
  battery: 'BAT',
  plug: 'POWER',
  wifi: 'NET',
  location: 'LOC',
  map: 'MAP',
  compass: 'NAV',
  sun: 'DAY',
  moon: 'NIGHT',
  cloud: 'CLOUD',
  rain: 'RAIN',
  snow: 'SNOW',
  temperature: 'TEMP',
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
  fileSaved: { emoji: 'SAVE', title: 'Saved!', type: 'success' },
  fileCreated: { emoji: 'FILE', title: 'File Created', type: 'success' },
  fileDeleted: { emoji: 'DEL', title: 'Moved to Trash', type: 'info' },
  fileCopied: { emoji: 'COPY', title: 'Copied!', type: 'success' },
  fileMoved: { emoji: 'MOVE', title: 'Moved!', type: 'success' },
  fileNotFound: { emoji: 'SEARCH', title: 'File Not Found', type: 'error' },

  exportComplete: { emoji: 'UP', title: 'Export Complete!', type: 'success' },
  importComplete: { emoji: 'DOWN', title: 'Import Complete!', type: 'success' },
  exportFailed: { emoji: 'ERR', title: 'Export Failed', type: 'error' },
  importFailed: { emoji: 'ERR', title: 'Import Failed', type: 'error' },

  syncComplete: { emoji: 'SYNC', title: 'Synced!', type: 'success' },
  syncFailed: { emoji: 'OFF', title: 'Sync Failed', type: 'error' },
  syncPending: { emoji: 'WAIT', title: 'Syncing...', type: 'info' },

  loggedIn: { emoji: 'HELLO', title: 'Welcome back!', type: 'success' },
  loggedOut: { emoji: 'BYE', title: 'See you later!', type: 'info' },
  sessionExpired: { emoji: 'TIME', title: 'Session Expired', type: 'warning' },

  renderComplete: { emoji: 'VIDEO', title: 'Render Complete!', type: 'success' },
  renderFailed: { emoji: 'FAIL', title: 'Render Failed', type: 'error' },
  renderStarted: { emoji: 'PROC', title: 'Rendering...', type: 'info' },
  audioExported: { emoji: 'AUDIO', title: 'Audio Exported!', type: 'success' },
  imageExported: { emoji: 'IMAGE', title: 'Image Exported!', type: 'success' },

  levelUp: { emoji: 'LEVEL', title: 'Level Up!', type: 'success' },
  badgeEarned: { emoji: 'AWARD', title: 'Badge Earned!', type: 'success' },
  streakContinued: { emoji: 'STREAK', title: 'Streak Continues!', type: 'success' },
  goalReached: { emoji: 'TARGET', title: 'Goal Reached!', type: 'success' },

  unknownError: { emoji: 'ERR', title: 'Something went wrong', type: 'error' },
  networkError: { emoji: 'NET', title: 'Network Error', type: 'error' },
  permissionDenied: { emoji: 'LOCK', title: 'Permission Denied', type: 'error' },
  diskFull: { emoji: 'DISK', title: 'Disk Full', type: 'error' },

  unsavedChanges: { emoji: 'WARN', title: 'Unsaved Changes', type: 'warning' },
  lowBattery: { emoji: 'BAT', title: 'Low Battery', type: 'warning' },
  lowStorage: { emoji: 'DISK', title: 'Low Storage', type: 'warning' },

  updateAvailable: { emoji: 'NEW', title: 'Update Available', type: 'info' },
  featureNew: { emoji: 'NEW', title: 'New Feature!', type: 'info' },
  tipOfTheDay: { emoji: 'TIP', title: 'Tip of the Day', type: 'info' },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getEmoji(key: StatusEmojiKey): string {
  return STATUS_EMOJIS[key] || 'INFO';
}

export function getFeedback(key: keyof typeof FEEDBACK_MESSAGES): FeedbackMessage {
  return FEEDBACK_MESSAGES[key] || { emoji: 'INFO', title: key, type: 'info' };
}

export function formatWithEmoji(
  message: string,
  emoji: string | StatusEmojiKey = 'info'
): string {
  const token = emoji in STATUS_EMOJIS ? STATUS_EMOJIS[emoji as StatusEmojiKey] : emoji;
  return `[${token}] ${message}`;
}

export function getFileEmoji(filename: string, isDir = false): string {
  if (isDir) return 'FOLDER';

  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (/^(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff)$/.test(ext)) return 'IMAGE';
  if (/^(mp4|mov|avi|mkv|webm|flv|wmv)$/.test(ext)) return 'VIDEO';
  if (/^(mp3|wav|flac|aac|ogg|m4a|wma)$/.test(ext)) return 'AUDIO';
  if (/^(pdf)$/.test(ext)) return 'PDF';
  if (/^(doc|docx|odt|rtf)$/.test(ext)) return 'DOC';
  if (/^(xls|xlsx|csv)$/.test(ext)) return 'SHEET';
  if (/^(ppt|pptx)$/.test(ext)) return 'SLIDE';
  if (/^(txt|md)$/.test(ext)) return 'TEXT';
  if (/^(ts|tsx|js|jsx)$/.test(ext)) return 'JS';
  if (/^(py)$/.test(ext)) return 'PY';
  if (/^(rs)$/.test(ext)) return 'RS';
  if (/^(go)$/.test(ext)) return 'GO';
  if (/^(java|kt)$/.test(ext)) return 'JAVA';
  if (/^(c|cpp|h|hpp)$/.test(ext)) return 'CPP';
  if (/^(css|scss|sass|less)$/.test(ext)) return 'CSS';
  if (/^(html|htm)$/.test(ext)) return 'HTML';
  if (/^(json|yaml|yml|toml|xml)$/.test(ext)) return 'DATA';
  if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext)) return 'ARCH';
  if (/^(obj|fbx|gltf|glb|blend|stl)$/.test(ext)) return '3D';
  if (/^(ttf|otf|woff|woff2)$/.test(ext)) return 'FONT';
  if (/^(exe|msi|app|dmg)$/.test(ext)) return 'APP';

  return 'FILE';
}

export function getStatusEmoji(
  status: 'success' | 'warning' | 'error' | 'info' | 'pending'
): string {
  switch (status) {
    case 'success': return 'OK';
    case 'warning': return 'WARN';
    case 'error': return 'ERR';
    case 'info': return 'INFO';
    case 'pending': return 'WAIT';
    default: return 'INFO';
  }
}

export function getProgressEmoji(percent: number): string {
  if (percent >= 100) return 'DONE';
  if (percent >= 90) return 'FAST';
  if (percent >= 75) return 'HIGH';
  if (percent >= 50) return 'MID';
  if (percent >= 25) return 'LOW';
  return 'START';
}

export function getRandomCelebration(): string {
  const celebrations = ['DONE', 'AWARD', 'STAR', 'TARGET', 'LAUNCH', 'PRO'];
  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

export function getWeatherEmoji(condition: string): string {
  const value = condition.toLowerCase();
  if (value.includes('clear') || value.includes('sunny')) return 'SUN';
  if (value.includes('cloud') && value.includes('sun')) return 'PARTLY';
  if (value.includes('cloud')) return 'CLOUD';
  if (value.includes('rain')) return 'RAIN';
  if (value.includes('storm') || value.includes('thunder')) return 'STORM';
  if (value.includes('snow')) return 'SNOW';
  if (value.includes('fog') || value.includes('mist')) return 'FOG';
  if (value.includes('wind')) return 'WIND';
  if (value.includes('night') || value.includes('moon')) return 'NIGHT';
  return 'TEMP';
}

export function getBatteryEmoji(level: number, charging = false): string {
  if (charging) return 'POWER';
  if (level > 80) return 'BAT100';
  if (level > 50) return 'BAT75';
  if (level > 20) return 'BAT25';
  return 'BATLOW';
}

export function getTimeGreeting(): { emoji: string; greeting: string } {
  const hour = new Date().getHours();
  if (hour < 6) return { emoji: 'NIGHT', greeting: 'Good night' };
  if (hour < 12) return { emoji: 'DAY', greeting: 'Good morning' };
  if (hour < 17) return { emoji: 'DAY', greeting: 'Good afternoon' };
  if (hour < 21) return { emoji: 'EVE', greeting: 'Good evening' };
  return { emoji: 'NIGHT', greeting: 'Good night' };
}

// ============================================================================
// Celebration Effects (CSS class triggers)
// ============================================================================

export const CELEBRATION_CLASSES = {
  confetti: 'animate-confetti',
  sparkle: 'animate-sparkle',
  bounce: 'animate-bounce',
  pulse: 'animate-pulse',
} as const;
