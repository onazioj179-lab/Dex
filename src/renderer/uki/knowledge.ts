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

// ---------------------------------------------------------------------------
// Troubleshooting knowledge — symptom → cause → fix. Lets UKI answer "why is
// X happening / how do I fix it" from on-device facts. Every entry is grounded
// in real DEX behaviour (dock auto-hide, the perf-tier + thermal systems, the
// workspace-snapshot / Rewind recovery paths) so UKI's advice is correct.
// ---------------------------------------------------------------------------

export interface DexTroubleshooting {
  id: string;
  /** What the user observes / would say. */
  symptom: string;
  /** Why it happens, in one line. */
  cause: string;
  /** Ordered remediation steps. */
  fix: readonly string[];
  /** Match terms for findTroubleshooting(). */
  keywords: readonly string[];
}

export const DEX_TROUBLESHOOTING: readonly DexTroubleshooting[] = [
  {
    id: 'dock-not-showing',
    symptom: 'The dock will not appear or stays hidden.',
    cause: 'auto-hide is on and the cursor is not at the very bottom edge, or a window is maximized (a maximized window owns the bottom edge)',
    fix: [
      'Move the cursor to the very bottom edge of the screen and pause briefly',
      'Un-maximize the focused window if one is full-screen',
      'Set the Dock to Always Visible in Settings → Shell & Dock',
    ],
    keywords: ['dock', 'hidden', 'not showing', 'disappear', 'taskbar'],
  },
  {
    id: 'overheating',
    symptom: 'DEX runs hot, the fans spin up, or the GPU is pegged.',
    cause: 'continuous backdrop-filter (glass blur) is GPU-heavy and re-rasterizes every frame on weaker machines',
    fix: [
      'DEX automatically reduces effects when it detects sustained low FPS and restores them as soon as FPS recovers',
      'Set Liquid Glass to Reduced or Off in Settings → Shell & Dock',
      'Lower the performance tier, or enable Reduce Motion',
    ],
    keywords: ['hot', 'overheat', 'fan', 'gpu', 'temperature', 'thermal', 'cpu'],
  },
  {
    id: 'glass-flat',
    symptom: 'Glass panels look flat or opaque with no blur.',
    cause: 'a low performance tier or a thermal-hot state disables backdrop-filter to protect performance',
    fix: [
      'Check Settings → Shell & Dock → Liquid Glass is not set to Off',
      'Raise the performance tier if the hardware supports it',
      'Let the machine cool — the thermal state restores blur automatically',
    ],
    keywords: ['glass', 'blur', 'flat', 'opaque', 'frosted', 'transparency'],
  },
  {
    id: 'lost-work',
    symptom: 'I lost my windows or layout after a crash or update.',
    cause: 'work is recoverable — DEX snapshots the workspace and records sessions',
    fix: [
      'Reopen DEX — the workspace snapshot restores your windows and layout',
      'Open Rewind to restore an earlier session',
      'Open the project — projects restore their windows, tabs, notes, and assets',
    ],
    keywords: ['lost', 'crash', 'recover', 'restore', 'session', 'layout', 'update'],
  },
  {
    id: 'ui-laggy',
    symptom: 'Animations stutter or the UI feels slow.',
    cause: 'high system load or a low device tier',
    fix: [
      'The adaptive monitor shortens or drops animations under load automatically',
      'Enable Reduce Motion in Settings',
      'Close heavy background apps — the resource governor pauses inactive work',
    ],
    keywords: ['lag', 'slow', 'stutter', 'jank', 'choppy', 'performance', 'fps'],
  },
  {
    id: 'app-blank',
    symptom: 'An app shows a blank screen after I return to DEX.',
    cause: 'the background app was suspended to save resources',
    fix: [
      'DEX self-heals to Home when focus returns',
      'Reopen the app from the dock — it remounts cleanly',
    ],
    keywords: ['blank', 'empty', 'white screen', 'black screen', 'frozen', 'suspended'],
  },
  {
    id: 'shortcut-dead',
    symptom: 'A keyboard shortcut does nothing.',
    cause: 'another app or input field has focus, or the shortcut differs per platform',
    fix: [
      'Shortcuts use Cmd on macOS and Ctrl on Windows/Linux',
      'Open the command palette (Cmd/Ctrl+K) and search for the action by name',
    ],
    keywords: ['shortcut', 'hotkey', 'keyboard', 'key', 'binding'],
  },
];

/** Rank troubleshooting entries against a free-text query. Pure, no I/O. */
export function findTroubleshooting(query: string, limit = 3): DexTroubleshooting[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(t => t.length > 2);
  return DEX_TROUBLESHOOTING
    .map(entry => {
      const hay = `${entry.symptom} ${entry.keywords.join(' ')}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      for (const k of entry.keywords) if (q.includes(k)) score += 2;
      return { entry, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry);
}

// ---------------------------------------------------------------------------
// System-architecture knowledge — concise, true facts about how DEX is built,
// so UKI can explain the system it lives in. Kept high-level and accurate.
// ---------------------------------------------------------------------------

export interface DexArchitectureFact {
  id: string;
  topic: string;
  fact: string;
}

export const DEX_ARCHITECTURE: readonly DexArchitectureFact[] = [
  {
    id: 'perf-tiers', topic: 'performance tiers',
    fact: 'DEX classifies the device into a visual tier (low/mid/high/ultra) once on first launch and persists it; the tier drives blur, shadows, and motion. A separate compute tier governs the AI and worker backends.',
  },
  {
    id: 'surfaces', topic: 'surfaces',
    fact: 'Four named surface materials — solid, soft, glass, and overlay — form one visual vocabulary. Components pick a surface by role (e.g. context menus use the overlay surface), not by how it looks.',
  },
  {
    id: 'motion', topic: 'motion',
    fact: 'Motion is organized by category — window, workspace, dock, and panel. Animation communicates state rather than decoration, and every transition respects Reduce Motion and current system load.',
  },
  {
    id: 'thermal', topic: 'thermal protection',
    fact: 'A frame-rate thermal monitor reduces visual effects on sustained low FPS and restores them when FPS recovers. The main process also reads real CPU temperature to drive the same protection.',
  },
  {
    id: 'local-first', topic: 'privacy',
    fact: 'DEX is local-first. UKI builds her knowledge from on-device data and nothing leaves the device without explicit consent.',
  },
  {
    id: 'recovery', topic: 'recovery',
    fact: 'Workspace snapshots and Rewind together provide crash, session, and workspace recovery. Projects own their windows, tabs, notes, and assets, so reopening a project restores its full context.',
  },
  {
    id: 'tech-stack', topic: 'technology',
    fact: 'TypeScript runs product and app logic, Rust powers performance-critical infrastructure such as search and indexing, and C/C++ handles rendering and the compositor.',
  },
  {
    id: 'governor', topic: 'resource governor',
    fact: 'A resource governor pauses inactive systems and reduces hidden background work to keep the foreground responsive without lowering visual quality.',
  },
];
