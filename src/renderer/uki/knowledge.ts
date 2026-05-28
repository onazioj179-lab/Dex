// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Knowledge Base — foundational knowledge UKI has about DEX OS.
 *
 * Pure data. No side effects. Imported by identity, prompt builders,
 * help systems, command palette, and onboarding.
 */

import { platform } from '../utils';
const _M = platform.isMac ? '⌘' : 'Ctrl';
const _O = platform.isMac ? '⌥' : 'Alt';

export interface DexAppKnowledge {
  id: string;
  name: string;
  category: 'creative' | 'productivity' | 'system' | 'utility' | 'media' | 'developer';
  oneLine: string;
  capabilities: readonly string[];
  shortcuts?: Readonly<Record<string, string>>;
}

/**
 * App catalog — keep aligned with APP_DEFINITIONS in store/runningApps.ts
 * but enriched with capability/shortcut detail UKI can quote.
 */
export const DEX_APP_CATALOG: readonly DexAppKnowledge[] = [
  {
    id: 'notes', name: 'Notes', category: 'productivity',
    oneLine: 'Markdown notebook with backlinks, tags, and rewind history.',
    capabilities: ['markdown', 'backlinks', 'tags', 'export', 'search'],
    shortcuts: { 'new note': `${_M}+N`, 'search notes': `${_M}+K` },
  },
  {
    id: 'tasks', name: 'Tasks', category: 'productivity',
    oneLine: 'Lightweight task tracker with lists, priorities, and due dates.',
    capabilities: ['lists', 'priority', 'due-dates', 'recurring'],
  },
  {
    id: 'files', name: 'Files', category: 'system',
    oneLine: 'Local file browser with tagging, preview, and quick actions.',
    capabilities: ['browse', 'tag', 'preview', 'rename', 'pin'],
  },
  {
    id: 'browser', name: 'Browser', category: 'utility',
    oneLine: 'Sandboxed in-DEX web browser.',
    capabilities: ['tabs', 'bookmarks', 'private-mode'],
  },
  {
    id: 'calendar', name: 'Calendar', category: 'productivity',
    oneLine: 'Local calendar with events, reminders, and focus blocks.',
    capabilities: ['events', 'reminders', 'focus-blocks'],
  },
  {
    id: 'nexus', name: 'Nexus', category: 'productivity',
    oneLine: 'Knowledge graph linking notes, files, tasks, and people.',
    capabilities: ['graph', 'backlinks', 'semantic-search'],
  },
  {
    id: 'vinx', name: 'VINX', category: 'creative',
    oneLine: 'Painting and image editor with brush stabilization.',
    capabilities: ['brushes', 'layers', 'pressure', 'export'],
  },
  {
    id: 'imosion', name: 'Imosion', category: 'creative',
    oneLine: 'Audio DAW with multi-track editing and effects.',
    capabilities: ['multi-track', 'midi', 'effects', 'export'],
  },
  {
    id: 'prism', name: 'Prism', category: 'creative',
    oneLine: 'Image editor with non-destructive adjustments.',
    capabilities: ['adjustments', 'masks', 'filters'],
  },
  {
    id: 'flux', name: 'Flux', category: 'creative',
    oneLine: 'Motion graphics and animation timeline.',
    capabilities: ['timeline', 'keyframes', 'easing'],
  },
  {
    id: 'forge', name: 'Forge', category: 'media',
    oneLine: 'Media encoder and converter.',
    capabilities: ['transcode', 'batch', 'presets'],
  },
  {
    id: 'axl', name: 'AXL', category: 'creative',
    oneLine: '3D and CAD modeling workspace.',
    capabilities: ['modeling', 'cad', 'render'],
  },
  {
    id: 'dexcode', name: 'DEXCode', category: 'developer',
    oneLine: 'Lightweight code editor with split views and terminal.',
    capabilities: ['edit', 'split', 'terminal', 'search', 'autosave'],
    shortcuts: { 'command palette': `${_M}+Shift+P`, 'find in files': `${_M}+Shift+F` },
  },
];

/** Common cross-app keyboard shortcuts. */
export const DEX_GLOBAL_SHORTCUTS: Readonly<Record<string, string>> = {
  'open UKI': `${_M}+Space`,
  'command palette': `${_M}+K`,
  'switch app': `${_M}+Tab`,
  'close window': `${_M}+W`,
  'new window': `${_M}+N`,
  'settings': `${_M}+,`,
  'rewind': `${_M}+Shift+Z`,
  'focus mode': `${_M}+Shift+F`,
};

/** Canonical workflow recipes UKI can suggest. */
export const DEX_WORKFLOWS: readonly { id: string; title: string; steps: readonly string[] }[] = [
  {
    id: 'capture-thought',
    title: 'Capture a thought fast',
    steps: [`Press ${_M}+Space to open UKI`, 'Type "note: ..." then Enter', 'UKI files it under today\'s notes'],
  },
  {
    id: 'restore-session',
    title: 'Restore yesterday\'s work',
    steps: ['Open Rewind', 'Pick the session', 'Click Restore'],
  },
  {
    id: 'web-then-note',
    title: 'Research then capture',
    steps: ['Open Browser', 'Highlight text', 'Right-click "Send to Notes"'],
  },
];

/** Short capability list used by help-style intents. */
export const UKI_CAPABILITIES_SUMMARY: readonly string[] = [
  'Open and close apps',
  'Answer time, date, and unit conversions locally',
  'Read what is on the active screen (with permission)',
  'Search the web via free APIs',
  'Look up Wikipedia, weather, and world time without an account',
  'Explain DEX shortcuts and workflows',
  'Remember context across the session',
];

/** Get app knowledge by id (case-insensitive). */
export function getAppKnowledge(id: string): DexAppKnowledge | undefined {
  const k = id.toLowerCase();
  return DEX_APP_CATALOG.find(a => a.id === k);
}
