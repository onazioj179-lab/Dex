// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Utilities Index
 * Export all shared utilities
 */

// Undo/Redo System
export { 
  HistoryManager, 
  useHistory, 
  useUndoRedoShortcuts, 
  HistoryPanel 
} from './UndoRedoManager';

export type { HistoryEntry, HistoryState, HistoryOptions } from './UndoRedoManager';

// Performance utilities
export { useThrottledClick, throttleClick, debounceClick } from './useThrottledClick';
export { useSuspendableRAF,useSuspendableInterval, useAppActive } from './perfAware';

// Common utility functions
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn(...args);
    }
  };
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const formatTime = (date: Date | number): string => {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDate = (date: Date | number): string => {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString([], { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

export const formatRelativeTime = (date: Date | number): string => {
  const now = Date.now();
  const timestamp = typeof date === 'number' ? date : date.getTime();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return formatDate(timestamp);
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Local storage helpers with error handling
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set: <T>(key: string, value: T): boolean => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  
  remove: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  
  clear: (): boolean => {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  },
};

// Platform detection (userAgentData preferred, navigator.platform fallback)
const _ua = typeof navigator !== 'undefined' ? ((navigator as any).userAgentData?.platform || navigator.platform || '') : '';
export const platform = {
  isMac: /Mac|macOS/i.test(_ua),
  isWindows: /Win/i.test(_ua),
  isLinux: /Linux/i.test(_ua),
  isMobile: typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/.test(navigator.userAgent),
  isTouchDevice: typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
};

// Keyboard helpers
export const keyboard = {
  isModifierKey: (e: KeyboardEvent): boolean => {
    return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  },
  
  getModifier: (): 'ctrl' | 'cmd' => {
    return platform.isMac ? 'cmd' : 'ctrl';
  },
  
  formatShortcut: (keys: string[]): string => {
    return keys.map(key => {
      if (key === 'mod') return platform.isMac ? 'Cmd' : 'Ctrl';
      if (key === 'ctrl') return 'Ctrl';
      if (key === 'shift') return 'Shift';
      if (key === 'alt') return platform.isMac ? 'Option' : 'Alt';
      if (key === 'meta') return platform.isMac ? 'Cmd' : 'Win';
      return key.charAt(0).toUpperCase() + key.slice(1);
    }).join(platform.isMac ? '' : '+');
  },
};

// Color utilities
export const color = {
  hexToRgb: (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  },
  
  rgbToHex: (r: number, g: number, b: number): string => {
    return '#' + [r, g, b].map(x => {
      const hex = Math.round(clamp(x, 0, 255)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  },
  
  lighten: (hex: string, amount: number): string => {
    const rgb = color.hexToRgb(hex);
    if (!rgb) return hex;
    return color.rgbToHex(
      Math.round(rgb.r + (255 - rgb.r) * amount),
      Math.round(rgb.g + (255 - rgb.g) * amount),
      Math.round(rgb.b + (255 - rgb.b) * amount)
    );
  },
  
  darken: (hex: string, amount: number): string => {
    const rgb = color.hexToRgb(hex);
    if (!rgb) return hex;
    return color.rgbToHex(
      Math.round(rgb.r * (1 - amount)),
      Math.round(rgb.g * (1 - amount)),
      Math.round(rgb.b * (1 - amount))
    );
  },
};

// Array utilities
export const array = {
  shuffle: <T>(arr: T[]): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },
  
  chunk: <T>(arr: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  },
  
  unique: <T>(arr: T[]): T[] => {
    return [...new Set(arr)];
  },
  
  groupBy: <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((acc, item) => {
      const group = String(item[key]);
      if (!acc[group]) acc[group] = [];
      acc[group].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  },
};
