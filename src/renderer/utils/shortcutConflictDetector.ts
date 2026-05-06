/**
 * DEX Shortcut Conflict Detector
 * Detects and resolves conflicting keyboard shortcuts across the app
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ShortcutRegistration {
  id: string;
  keys: string;         // Normalized: "Ctrl+Shift+T"
  action: string;       // Human-readable description
  source: string;       // Component/file that registered it
  priority: number;     // Higher wins conflicts
  enabled: boolean;
}

export interface ShortcutConflict {
  keys: string;
  registrations: ShortcutRegistration[];
  resolved: boolean;
  winner?: string;      // ID of the winning registration
}

// ============================================================================
// NORMALIZATION
// ============================================================================

function normalizeKeys(keys: string): string {
  const parts = keys
    .split('+')
    .map(k => k.trim().toLowerCase())
    .map(k => {
      if (k === 'ctrl' || k === 'control') return 'Ctrl';
      if (k === 'cmd' || k === 'command' || k === 'meta') return 'Ctrl'; // Normalize Mac Cmd to Ctrl
      if (k === 'alt' || k === 'option') return 'Alt';
      if (k === 'shift') return 'Shift';
      return k.charAt(0).toUpperCase() + k.slice(1);
    });

  // Sort modifiers consistently: Ctrl, Alt, Shift, then key
  const modifiers = ['Ctrl', 'Alt', 'Shift'];
  const mods = parts.filter(p => modifiers.includes(p)).sort((a, b) => modifiers.indexOf(a) - modifiers.indexOf(b));
  const keys2 = parts.filter(p => !modifiers.includes(p));
  return [...mods, ...keys2].join('+');
}

// ============================================================================
// REGISTRY
// ============================================================================

const registry = new Map<string, ShortcutRegistration>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(l => l());
}

export function registerShortcut(reg: Omit<ShortcutRegistration, 'id'>): string {
  const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const normalized: ShortcutRegistration = { ...reg, id, keys: normalizeKeys(reg.keys) };
  registry.set(id, normalized);
  notify();
  return id;
}

export function unregisterShortcut(id: string): void {
  registry.delete(id);
  notify();
}

export function getAllShortcuts(): ShortcutRegistration[] {
  return Array.from(registry.values()).filter(r => r.enabled);
}

export function getShortcutsBySource(source: string): ShortcutRegistration[] {
  return Array.from(registry.values()).filter(r => r.source === source);
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

export function detectConflicts(): ShortcutConflict[] {
  const byKeys = new Map<string, ShortcutRegistration[]>();

  for (const reg of registry.values()) {
    if (!reg.enabled) continue;
    const existing = byKeys.get(reg.keys) || [];
    existing.push(reg);
    byKeys.set(reg.keys, existing);
  }

  const conflicts: ShortcutConflict[] = [];
  for (const [keys, regs] of byKeys.entries()) {
    if (regs.length > 1) {
      const sorted = [...regs].sort((a, b) => b.priority - a.priority);
      conflicts.push({
        keys,
        registrations: sorted,
        resolved: true,
        winner: sorted[0].id,
      });
    }
  }

  return conflicts;
}

export function getConflictCount(): number {
  return detectConflicts().length;
}

// ============================================================================
// BUILT-IN SHORTCUT MAP (from audit)
// ============================================================================

export const BUILTIN_SHORTCUTS: Omit<ShortcutRegistration, 'id'>[] = [
  // App-level
  { keys: 'Ctrl+Space', action: 'Toggle Spotlight Search', source: 'Spotlight', priority: 100, enabled: true },
  { keys: 'Ctrl+Shift+P', action: 'Toggle Command Palette', source: 'CommandPalette', priority: 100, enabled: true },
  { keys: 'Ctrl+Shift+V', action: 'Toggle Clipboard History', source: 'ClipboardHistory', priority: 100, enabled: true },
  { keys: 'Ctrl+K', action: 'Toggle Command Palette', source: 'CommandPalette', priority: 100, enabled: true },
  { keys: 'Ctrl+Shift+Q', action: 'Close All Apps', source: 'AppManager', priority: 80, enabled: true },
  { keys: 'Alt+Left', action: 'Navigate Back', source: 'AppManager', priority: 80, enabled: true },
  { keys: 'Alt+Right', action: 'Navigate Forward', source: 'AppManager', priority: 80, enabled: true },
  { keys: 'F11', action: 'Toggle Dock Auto-hide', source: 'AppManager', priority: 70, enabled: true },

  { keys: 'Ctrl+\\', action: 'Toggle Dock', source: 'AppManager', priority: 70, enabled: true },
  { keys: 'Ctrl+1', action: 'Go to Home', source: 'AppManager', priority: 60, enabled: true },
  { keys: 'Ctrl+2', action: 'Go to Settings', source: 'AppManager', priority: 60, enabled: true },
  
  // SystemFeatures
  { keys: 'Ctrl+F', action: 'Global Search', source: 'SystemFeatures', priority: 90, enabled: true },
  { keys: 'F3', action: 'Global Search', source: 'SystemFeatures', priority: 85, enabled: true },
  { keys: 'Ctrl+B', action: 'Toggle Notifications', source: 'SystemFeatures', priority: 80, enabled: true },
  { keys: 'Ctrl+J', action: 'Toggle Theme', source: 'SystemFeatures', priority: 80, enabled: true },
  { keys: 'Ctrl+Shift+N', action: 'New Note', source: 'SystemFeatures', priority: 80, enabled: true },
  { keys: 'Ctrl+Shift+T', action: 'New Task', source: 'SystemFeatures', priority: 80, enabled: true },

  // Creative Suite
  { keys: 'Alt+V', action: 'Open VINX Video Editor', source: 'Creative', priority: 50, enabled: true },
  { keys: 'Alt+I', action: 'Open Imosion DAW', source: 'Creative', priority: 50, enabled: true },
  { keys: 'Alt+R', action: 'Open PRISM Image Editor', source: 'Creative', priority: 50, enabled: true },
  { keys: 'Alt+F', action: 'Open FLUX Motion', source: 'Creative', priority: 50, enabled: true },
  { keys: 'Alt+G', action: 'Open FORGE Encoder', source: 'Creative', priority: 50, enabled: true },

  // Spotlight quick-access
  { keys: 'Ctrl+E', action: 'Open Files', source: 'Spotlight', priority: 60, enabled: true },
  { keys: 'Ctrl+N', action: 'Open Notes', source: 'Spotlight', priority: 60, enabled: true },
  { keys: 'Ctrl+,', action: 'Open Settings', source: 'Spotlight', priority: 60, enabled: true },
  
  // App shortcuts
  { keys: 'Alt+H', action: 'Open Home', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+B', action: 'Open Browser', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+N', action: 'Open Notes', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+T', action: 'Open Tasks', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+K', action: 'Open Kanban', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+C', action: 'Open Calendar', source: 'runningApps', priority: 40, enabled: true },
  { keys: 'Alt+D', action: 'Toggle Focus Mode', source: 'FocusMode', priority: 50, enabled: true },
];

// Initialize built-in shortcuts
let initialized = false;
export function initializeBuiltinShortcuts(): void {
  if (initialized) return;
  initialized = true;
  BUILTIN_SHORTCUTS.forEach(s => registerShortcut(s));
}

// ============================================================================
// SUBSCRIBE (for React)
// ============================================================================

export function subscribeToShortcuts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default {
  registerShortcut,
  unregisterShortcut,
  getAllShortcuts,
  detectConflicts,
  getConflictCount,
  initializeBuiltinShortcuts,
  subscribeToShortcuts,
};
