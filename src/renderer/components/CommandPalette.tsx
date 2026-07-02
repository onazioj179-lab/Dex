// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Command Palette
 * Quick actions via Ctrl+K / Cmd+K
 * Universal search and action launcher
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useInstalledAppsStore } from '../store/installedAppsStore';
import { useClipboardStore } from '../store/clipboardStore';
import { useAuthStore } from '../store/useAuthStore';
import { toggleTheme } from '../utils/theme';
import { useFocusTrap } from '../utils/useFocusTrap';
import { safeMath, formatResult } from '../utils/safeMath';
import { platform } from '../utils';
import { scopedQuery } from '../services/commandScope';
import { getRecentCommandIds, recordRecentCommand } from '../services/recentCommands';
import { listPresets, type WorkspacePreset } from '../shell/WorkspacePresets';
import { useStageStore, STAGE_KIND_META, type StageKind } from '../store/stageStore';
import { SETTINGS_SECTIONS } from '../shell/settingsSections';
import { openWorkflowSpace, WORKFLOW_TEMPLATES } from '../services/projectSpaces';
import { exportDiagnostics, resetSettingsToDefaults } from '../services/ErrorBoundary';
import { buildDexCommands, resolveShortcut } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { DexSearchInput } from '../styles/components';

// Catalog ACTION commands the palette does NOT already cover (split / arrange /
// lock / fullscreen exist above). Adding only the gaps keeps the catalog the one
// source without duplicating commands. Each runs through the single executor.
const DEX_PALETTE_ACTION_IDS = new Set([
  'window.tileLeft', 'window.tileRight', 'window.maximize',
  'system.uki', 'system.compact', 'nav.back', 'nav.forward', 'window.close',
]);

const _M = platform.isMac ? '⌘' : 'Ctrl';

// ==================== TYPES ====================

interface Command {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: 'app' | 'action' | 'navigation' | 'settings' | 'recent';
  action: () => void;
  keywords?: string[];
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

// ==================== ICONS ====================

const Icons = {
  files: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  tasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  browser: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  gallery: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  audio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  calculator: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  password: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  workflows: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  theme: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  newNote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>,
  newTask: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M5 12h14"/></svg>,
  power: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
  transfers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  stopwatch: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>,
  kanban: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>,
  pomodoro: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  qrcode: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>,
  colorpicker: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>,
  converter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  trophy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 22h16"/><path d="M10 22V12"/><path d="M14 22V12"/><rect x="6" y="2" width="12" height="10" rx="2"/></svg>,
  weather: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>,
  worldclock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  noise: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  markdown: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
};

// ==================== MATH EVALUATOR ====================

function tryEvalMath(query: string): string | null {
  const expr = query.trim();
  // Normalize ^ for exponent and handle percent
  const normalized = expr.replace(/\^/g, '^').replace(/%/g, '/100*');
  const result = safeMath(normalized);
  return result !== null ? formatResult(result) : null;
}

// ==================== UNIT CONVERSION ====================

const UNIT_MAP: Record<string, Record<string, number>> = {
  // Length (base: meters)
  m: { m: 1 }, km: { m: 1000 }, cm: { m: 0.01 }, mm: { m: 0.001 }, mi: { m: 1609.344 }, ft: { m: 0.3048 }, 'in': { m: 0.0254 }, yd: { m: 0.9144 },
  // Weight (base: grams)
  g: { g: 1 }, kg: { g: 1000 }, mg: { g: 0.001 }, lb: { g: 453.592 }, lbs: { g: 453.592 }, oz: { g: 28.3495 },
  // Temperature handled separately
  c: { t: 1 }, f: { t: 1 }, k: { t: 1 },
  // Volume (base: liters)
  l: { l: 1 }, ml: { l: 0.001 }, gal: { l: 3.78541 }, qt: { l: 0.946353 }, pt: { l: 0.473176 }, cup: { l: 0.236588 },
};

function tryUnitConvert(query: string): string | null {
  const m = query.trim().match(/^([\d.]+)\s*([\w]+)\s+(?:to|in|as)\s+([\w]+)$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();
  if (isNaN(val)) return null;

  // Temperature special handling
  const temps = ['c', 'f', 'k'];
  if (temps.includes(from) && temps.includes(to)) {
    let celsius = from === 'c' ? val : from === 'f' ? (val - 32) * 5 / 9 : val - 273.15;
    let result = to === 'c' ? celsius : to === 'f' ? celsius * 9 / 5 + 32 : celsius + 273.15;
    return `${Math.round(result * 100) / 100} ${to.toUpperCase()}`;
  }

  const fromInfo = UNIT_MAP[from];
  const toInfo = UNIT_MAP[to];
  if (!fromInfo || !toInfo) return null;

  // Check same base unit type
  const fromBase = Object.keys(fromInfo)[0];
  const toBase = Object.keys(toInfo)[0];
  if (fromBase !== toBase) return null;

  const baseVal = val * fromInfo[fromBase];
  const result = baseVal / toInfo[toBase];
  return `${Math.round(result * 1e6) / 1e6} ${to}`;
}

// ==================== FUZZY MATCH ====================

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 + (q.length / t.length) * 50;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 2;
      if (ti === 0 || t[ti - 1] === ' ') score += 5;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? score : 0;
}

// ==================== COMPONENT ====================

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
  // Select ONLY the stable launchApp action — the palette is always mounted,
  // and a whole-store subscription made every running-apps write re-render it
  // (and, when a write landed during another component's render, triggered
  // React's "Cannot update CommandPalette while rendering AppManager" warning).
  const launchApp = useRunningApps(s => s.launchApp);
  // Removed apps must not appear as launch commands, and must not launch even if
  // a stale surface references them (defense in depth at the launch point).
  const removedAppIds = useInstalledAppsStore(s => s.removedAppIds);
  const removedAppSet = useMemo(() => new Set(removedAppIds), [removedAppIds]);

  // Helper: launch an app by id using the canonical APP_DEFINITIONS registry
  const openApp = useCallback((appId: string) => {
    if (removedAppSet.has(appId)) return; // removed — reinstall from the Store first
    const def = APP_DEFINITIONS[appId];
    if (def) launchApp({ id: appId, name: def.name, icon: def.icon || appId, color: def.color });
  }, [launchApp, removedAppSet]);

  // Saved workspace layouts ("workspace memory") — refreshed when the palette
  // opens and whenever a layout is saved/removed, so Restore commands stay live.
  const [wsPresets, setWsPresets] = useState<WorkspacePreset[]>([]);
  useEffect(() => {
    const refresh = () => setWsPresets(listPresets());
    refresh();
    window.addEventListener('dex-workspace-presets-changed', refresh);
    return () => window.removeEventListener('dex-workspace-presets-changed', refresh);
  }, [isOpen]);

  // Project Spaces (DEX 5.6) — switch the active workspace context, or spin up a
  // new one. Subscribed so the "Switch Space" list stays current.
  const stages = useStageStore((s) => s.stages);
  const activeStageId = useStageStore((s) => s.activeStageId);

  // Build command list
  const commands: Command[] = useMemo(() => ([
    // Apps — System
    { id: 'home', title: 'Go to Home', icon: Icons.home, category: 'app', action: () => openApp('home'), keywords: ['dashboard', 'main'] },
    { id: 'files', title: 'Open Files', icon: Icons.files, category: 'app', action: () => openApp('files'), keywords: ['folder', 'documents'] },
    { id: 'browser', title: 'Open Browser', icon: Icons.browser, category: 'app', action: () => openApp('browser'), keywords: ['web', 'internet', 'safari'] },
    { id: 'settings', title: 'Open Settings', icon: Icons.settings, category: 'app', action: () => openApp('settings'), keywords: ['preferences', 'config'], shortcut: `${_M}+,` },
    { id: 'power', title: 'Open Power Manager', icon: Icons.power, category: 'app', action: () => openApp('power'), keywords: ['battery', 'cpu', 'performance'] },
    { id: 'recyclebin', title: 'Open Recycle Bin', icon: Icons.trash, category: 'app', action: () => openApp('recyclebin'), keywords: ['trash', 'deleted', 'restore'] },

    // Apps — Productivity
    { id: 'notes', title: 'Open Notes', icon: Icons.notes, category: 'app', action: () => openApp('notes'), keywords: ['write', 'text'] },
    { id: 'tasks', title: 'Open Tasks', icon: Icons.tasks, category: 'app', action: () => openApp('tasks'), keywords: ['todo', 'reminders'] },
    { id: 'calendar', title: 'Open Calendar', icon: Icons.calendar, category: 'app', action: () => openApp('calendar'), keywords: ['events', 'schedule'] },
    { id: 'workflows', title: 'Open Workflows', icon: Icons.workflows, category: 'app', action: () => openApp('workflows'), keywords: ['automation', 'shortcuts'] },
    { id: 'kanban', title: 'Open Kanban Board', icon: Icons.kanban, category: 'app', action: () => openApp('kanban'), keywords: ['board', 'columns', 'project'] },
    { id: 'dexcode', title: 'Open DexCode Editor', icon: Icons.markdown, category: 'app', action: () => openApp('dexcode'), keywords: ['code', 'dexscript', 'editor', 'programming'] },

    // Apps — Creative Suite
    { id: 'videoeditor', title: 'Open VINX Video Editor', icon: Icons.video, category: 'app', action: () => openApp('videoeditor'), keywords: ['video', 'edit', 'timeline', 'cut', 'vinx'] },
    { id: 'imosion', title: 'Open Imosion DAW', icon: Icons.audio, category: 'app', action: () => openApp('imosion'), keywords: ['daw', 'music', 'audio', 'record', 'mix', 'master'] },
    { id: 'prism', title: 'Open PRISM Image Editor', icon: Icons.gallery, category: 'app', action: () => openApp('prism'), keywords: ['image', 'photo', 'edit', 'layers', 'paint'] },
    { id: 'flux', title: 'Open FLUX Motion Graphics', icon: Icons.gallery, category: 'app', action: () => openApp('flux'), keywords: ['motion', 'animation', 'keyframe', 'particle', 'vfx'] },
    { id: 'forge', title: 'Open FORGE Encoder', icon: Icons.files, category: 'app', action: () => openApp('forge'), keywords: ['encode', 'transcode', 'export', 'render', 'batch'] },
    { id: 'axl', title: 'Open AXL CAD', icon: Icons.files, category: 'app', action: () => openApp('axl'), keywords: ['cad', '3d', 'model', 'engineering', 'parametric'] },

    // Apps — Media
    { id: 'gallery', title: 'Open Gallery', icon: Icons.gallery, category: 'app', action: () => openApp('gallery'), keywords: ['photos', 'images'] },
    { id: 'audio', title: 'Open Audio', icon: Icons.audio, category: 'app', action: () => openApp('audio'), keywords: ['music', 'player'] },

    // Apps — Tools
    { id: 'calculator', title: 'Open Calculator', icon: Icons.calculator, category: 'app', action: () => openApp('calculator'), keywords: ['math', 'calc'] },
    { id: 'passwordgenerator', title: 'Open Password Manager', icon: Icons.password, category: 'app', action: () => openApp('passwordgenerator'), keywords: ['vault', 'security'] },
    { id: 'transfers', title: 'Open Transfers', icon: Icons.transfers, category: 'app', action: () => openApp('transfers'), keywords: ['send', 'receive', 'share'] },
    { id: 'rewind', title: 'Open Rewind', icon: Icons.audio, category: 'app', action: () => openApp('rewind'), keywords: ['history', 'timeline', 'version', 'undo', 'time machine'] },
    { id: 'stopwatch', title: 'Open Stopwatch', icon: Icons.stopwatch, category: 'app', action: () => openApp('stopwatch'), keywords: ['timer', 'lap'] },
    { id: 'unitconverter', title: 'Open Unit Converter', icon: Icons.converter, category: 'app', action: () => openApp('unitconverter'), keywords: ['length', 'weight', 'temperature'] },
    { id: 'pomodoro', title: 'Open Pomodoro Timer', icon: Icons.pomodoro, category: 'app', action: () => openApp('pomodoro'), keywords: ['focus', 'break', 'timer'] },
    { id: 'qrcode', title: 'Open QR Generator', icon: Icons.qrcode, category: 'app', action: () => openApp('qrcode'), keywords: ['barcode', 'scan', 'link'] },
    { id: 'colorpicker', title: 'Open Color Picker', icon: Icons.colorpicker, category: 'app', action: () => openApp('colorpicker'), keywords: ['hsl', 'rgb', 'hex', 'palette'] },
    { id: 'weather', title: 'Open Weather', icon: Icons.weather, category: 'app', action: () => openApp('weather'), keywords: ['forecast', 'temperature', 'rain'] },
    { id: 'worldclock', title: 'Open World Clock', icon: Icons.worldclock, category: 'app', action: () => openApp('worldclock'), keywords: ['timezone', 'time', 'international'] },
    { id: 'noisegenerator', title: 'Open Noise Generator', icon: Icons.noise, category: 'app', action: () => openApp('noisegenerator'), keywords: ['white', 'pink', 'brown', 'ambient', 'focus'] },
    { id: 'achievements', title: 'Open Achievements', icon: Icons.trophy, category: 'app', action: () => openApp('achievements'), keywords: ['progress', 'goals', 'badges'] },
    { id: 'screenrecorder', title: 'Open Screen Recorder', icon: Icons.video, category: 'app', action: () => openApp('screenrecorder'), keywords: ['record', 'capture', 'screencast', 'video'] },
    { id: 'presentation', title: 'Open Presentation', icon: Icons.gallery, category: 'app', action: () => openApp('presentation'), keywords: ['slides', 'present', 'deck', 'pdf', 'keynote'] },
    { id: 'pdfviewer', title: 'Open PDF Viewer', icon: Icons.markdown, category: 'app', action: () => openApp('pdfviewer'), keywords: ['pdf', 'document', 'annotate', 'read'] },
    { id: 'pixelart', title: 'Open Pixel Art', icon: Icons.colorpicker, category: 'app', action: () => openApp('pixelart'), keywords: ['pixel', 'art', 'sprite', 'nes', 'draw'] },
    { id: 'powerrename', title: 'Open PowerRename', icon: Icons.files, category: 'app', action: () => openApp('powerrename'), keywords: ['rename', 'batch', 'bulk', 'regex', 'powertoys', 'pattern'] },

    // Actions
    { id: 'new-note', title: 'Create New Note', subtitle: 'Start a new note', icon: Icons.newNote, category: 'action', action: () => { openApp('notes'); }, keywords: ['add', 'create'] },
    { id: 'new-task', title: 'Create New Task', subtitle: 'Add a new task', icon: Icons.newTask, category: 'action', action: () => { openApp('tasks'); }, keywords: ['add', 'todo'] },
    { id: 'new-workflow', title: 'Create New Workflow', subtitle: 'Build automation', icon: Icons.workflows, category: 'action', action: () => { openApp('workflows'); }, keywords: ['automate', 'create'] },
    { id: 'lock-screen', title: 'Lock Screen', subtitle: 'Lock DEX immediately', icon: Icons.power, category: 'action', action: () => { void useAuthStore.getState().lock(); }, keywords: ['secure', 'lock', 'bye'], shortcut: `${_M}+L` },
    { id: 'take-screenshot', title: 'Take Screenshot', subtitle: 'Capture screen', icon: Icons.gallery, category: 'action', action: () => { openApp('rewind'); }, keywords: ['capture', 'snap', 'screen'] },
    { id: 'clear-clipboard', title: 'Clear Clipboard', subtitle: 'Wipe clipboard history', icon: Icons.trash, category: 'action', action: () => { useClipboardStore.getState().clearAll(); }, keywords: ['clean', 'privacy'] },
    { id: 'toggle-dex-bar', title: 'Show / Hide DEX Bar', subtitle: 'Toggle the floating launcher bar', icon: Icons.home, category: 'action', action: () => { window.dispatchEvent(new CustomEvent('dex-toggle-bar')); }, keywords: ['bar', 'launcher', 'dock', 'floating', 'show', 'hide', 'restore'], shortcut: `${_M}+Shift+B` },
    { id: 'save-diagnostics', title: 'Save Diagnostics Report', subtitle: 'Download crash + environment info', icon: Icons.files, category: 'action', action: () => { exportDiagnostics(); }, keywords: ['diagnostics', 'crash', 'report', 'debug', 'support', 'recovery', 'logs'] },
    { id: 'fullscreen', title: 'Toggle Fullscreen', subtitle: 'Enter or exit fullscreen', icon: Icons.gallery, category: 'action', action: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }, keywords: ['maximize', 'f11'], shortcut: 'F11' },
    { id: 'arrange-windows', title: 'Arrange Windows', subtitle: 'Tile open windows into a grid', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows')), keywords: ['tile', 'grid', 'arrange', 'organize', 'windows', 'layout', 'cascade'] },
    { id: 'tile-all-apps', title: 'Use All Apps at Once', subtitle: 'Open every running app into a window and tile them together', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { includeAll: true } })), keywords: ['tile', 'all', 'apps', 'multitask', 'everything', 'side by side', 'windows', 'spread', 'mission control', 'expose', 'arrange'] },
    { id: 'workspace-timeline', title: 'Workspace Time Machine', subtitle: 'Restore your desktop layout to an earlier moment', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-open-workspace-timeline')), keywords: ['time machine', 'snapshot', 'history', 'layout', 'restore', 'workspace', 'rewind', 'undo'] },
    { id: 'snapshot-workspace', title: 'Snapshot Workspace Now', subtitle: 'Capture the current window layout', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-workspace-snapshot-now')), keywords: ['snapshot', 'capture', 'layout', 'save', 'time machine'] },
    { id: 'tile-master', title: 'Tile: Master + Stack', subtitle: 'Wide primary pane, the rest stacked beside it', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { layout: 'master' } })), keywords: ['tile', 'master', 'stack', 'primary', 'main', 'arrange', 'layout', 'tiling'] },
    { id: 'tile-columns', title: 'Tile: Columns', subtitle: 'Every window an equal full-height column', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { layout: 'columns' } })), keywords: ['tile', 'columns', 'vertical', 'side by side', 'arrange', 'layout', 'tiling'] },
    { id: 'tile-rows', title: 'Tile: Rows', subtitle: 'Every window an equal full-width row', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { layout: 'rows' } })), keywords: ['tile', 'rows', 'horizontal', 'stacked', 'arrange', 'layout', 'tiling'] },
    { id: 'tile-dwindle', title: 'Tile: Dwindle', subtitle: 'Spiral binary split (Hyprland-style)', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { layout: 'dwindle' } })), keywords: ['tile', 'dwindle', 'spiral', 'binary', 'split', 'fibonacci', 'arrange', 'layout', 'tiling'] },
    { id: 'tile-monocle', title: 'Tile: Monocle', subtitle: 'Stack every window full-screen (focus one)', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-arrange-windows', { detail: { layout: 'monocle' } })), keywords: ['tile', 'monocle', 'stack', 'maximize', 'fullscreen', 'focus', 'arrange', 'layout', 'tiling'] },
    { id: 'edit-zones', title: 'Edit Snap Zones', subtitle: 'Open the FancyZones-style custom zone editor', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-open-zone-editor')), keywords: ['zones', 'fancyzones', 'snap', 'custom', 'layout', 'editor', 'tiling', 'grid', 'regions'] },
    { id: 'tile-zones', title: 'Tile: Into Active Zones', subtitle: 'Place open windows into your active custom zone layout', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-apply-zone-layout')), keywords: ['zones', 'fancyzones', 'snap', 'custom', 'tile', 'arrange', 'layout', 'regions'] },
    { id: 'split-5050', title: 'Split 50 / 50', subtitle: 'Two windows, equal columns', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-split-layout', { detail: { ratios: [1, 1] } })), keywords: ['split', 'half', '50', 'two', 'columns', 'side by side', 'layout'] },
    { id: 'split-7030', title: 'Split 70 / 30', subtitle: 'Wide primary + narrow side panel', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-split-layout', { detail: { ratios: [0.7, 0.3] } })), keywords: ['split', '70', '30', 'two', 'columns', 'primary', 'side', 'layout'] },
    { id: 'split-6040', title: 'Split 60 / 40', subtitle: 'Primary pane + a roomy side panel', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-split-layout', { detail: { ratios: [0.6, 0.4] } })), keywords: ['split', '60', '40', 'two', 'columns', 'primary', 'side', 'layout'] },
    { id: 'split-602020', title: 'Split 60 / 20 / 20', subtitle: 'Primary + two side columns', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-split-layout', { detail: { ratios: [0.6, 0.2, 0.2] } })), keywords: ['split', '60', '20', 'three', 'columns', 'thirds', 'layout'] },
    { id: 'grid-2x2', title: 'Four-Grid Layout', subtitle: 'Tile windows into a 2 x 2 grid', icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-grid-layout', { detail: { cols: 2, rows: 2 } })), keywords: ['grid', 'four', 'quad', '2x2', 'quadrant', 'tile', 'four-grid', 'corners', 'layout', 'windows'] },
    { id: 'save-workspace', title: 'Save Workspace Layout', subtitle: 'Remember the current window arrangement', icon: Icons.workflows, category: 'action', action: () => { const name = window.prompt('Name this workspace layout:'); if (name && name.trim()) window.dispatchEvent(new CustomEvent('dex-workspace-save', { detail: { name: name.trim() } })); }, keywords: ['workspace', 'layout', 'save', 'arrangement', 'session', 'memory'] },
    ...(wsPresets.length > 0 ? [{ id: 'manage-workspaces', title: 'Manage Workspace Layouts', subtitle: 'Rename or delete saved layouts', icon: Icons.workflows, category: 'action' as const, action: () => window.dispatchEvent(new CustomEvent('dex-workspace-manage')), keywords: ['workspace', 'layout', 'manage', 'rename', 'delete', 'edit'] }] : []),
    ...wsPresets.map((p): Command => ({ id: 'restore-ws-' + p.id, title: `Restore Workspace: ${p.name}`, subtitle: `${p.windows.length} window${p.windows.length === 1 ? '' : 's'}`, icon: Icons.workflows, category: 'action', action: () => window.dispatchEvent(new CustomEvent('dex-workspace-restore', { detail: { id: p.id } })), keywords: ['workspace', 'layout', 'restore', 'open', p.name.toLowerCase()] })),

    // Project Spaces (DEX 5.6) — the active workspace context (kind-aware).
    { id: 'new-space', title: 'New Project Space', subtitle: 'Create a dedicated workspace and switch to it', icon: Icons.workflows, category: 'action', action: () => { const name = window.prompt('Name this project space:'); if (name && name.trim()) { const id = useStageStore.getState().createStage({ name: name.trim() }); useStageStore.getState().setActiveStage(id); } }, keywords: ['workspace', 'space', 'project', 'new', 'create', 'stage', 'context'] },
    ...stages.filter(s => s.id !== activeStageId).map((s): Command => ({ id: 'switch-space-' + s.id, title: `Switch Space: ${s.name}`, subtitle: `${STAGE_KIND_META[(s.kind ?? 'general') as StageKind].label} space`, icon: Icons.workflows, category: 'action', action: () => useStageStore.getState().setActiveStage(s.id), keywords: ['workspace', 'space', 'switch', 'stage', 'project', 'context', s.name.toLowerCase()] })),
    // Open a workflow template as a fresh, kind-tagged Project Space (apps tiled +
    // UKI project awareness). Static list — no memo dep needed.
    ...WORKFLOW_TEMPLATES.map((t): Command => ({ id: 'open-workflow-' + t.id, title: `Open Workspace: ${t.name}`, subtitle: t.description, icon: Icons.workflows, category: 'action', action: () => openWorkflowSpace(t.id), keywords: ['workspace', 'workflow', 'space', 'open', 'template', 'project', ...t.tags, t.name.toLowerCase()] })),

    // Settings
    { id: 'toggle-theme', title: 'Toggle Dark/Light Theme', subtitle: 'Switch appearance', icon: Icons.theme, category: 'settings', action: () => { toggleTheme(); }, keywords: ['dark', 'light', 'appearance'] },
    { id: 'open-appearance', title: 'Appearance Settings', subtitle: 'Colors, fonts, accent', icon: Icons.colorpicker, category: 'settings', action: () => { openApp('settings'); }, keywords: ['theme', 'color', 'font', 'accent'] },
    { id: 'open-keyboard', title: 'Keyboard Shortcuts', subtitle: 'View all shortcuts', icon: Icons.calculator, category: 'settings', action: () => { openApp('settings'); }, keywords: ['hotkey', 'keybind', 'shortcut'] },
    { id: 'open-privacy', title: 'Privacy Settings', subtitle: 'Security and privacy options', icon: Icons.password, category: 'settings', action: () => { openApp('settings'); }, keywords: ['security', 'privacy', 'encryption'] },
    { id: 'uki-permissions', title: 'UKI Permissions', subtitle: 'Control what UKI can access (screen, files, shell, mic…)', icon: Icons.password, category: 'settings', action: () => window.dispatchEvent(new CustomEvent('dex-permission-center')), keywords: ['permission', 'permissions', 'capability', 'grant', 'revoke', 'access', 'security', 'uki', 'privacy'] },
    { id: 'reset-settings', title: 'Reset Appearance & Settings', subtitle: 'Restore UI preferences to defaults (your data is kept)', icon: Icons.theme, category: 'settings', action: () => { if (window.confirm('Reset appearance and UI settings to defaults?\n\nYour notes, tasks, files, and projects are NOT affected.')) { resetSettingsToDefaults(); window.location.reload(); } }, keywords: ['reset', 'defaults', 'settings', 'recover', 'fix', 'corrupt', 'restore', 'broken'] },

    // DEX catalog action commands not covered above (tile/maximize/uki/compact/nav),
    // run through the one executor + command bus.
    ...buildDexCommands(APP_DEFINITIONS)
      .filter(c => DEX_PALETTE_ACTION_IDS.has(c.id))
      .map((c): Command => ({
        id: `dex-${c.id}`,
        title: c.label,
        subtitle: 'DEX command',
        icon: Icons.workflows,
        category: 'action',
        action: () => executeDexCommand(c),
        keywords: c.keywords,
        shortcut: resolveShortcut(c, platform.isMac) || undefined,
      })),
    // Drop launch commands for apps the user removed (protected apps are never
    // in the removed set, so Home/Files/Settings stay).
  ] as Command[]).filter(c => c.category !== 'app' || !removedAppSet.has(c.id)),
  [openApp, wsPresets, stages, activeStageId, removedAppSet]);

  // Settings deep-links: one command per Settings page, dispatched only while
  // searching (kept out of the default/empty list so it stays uncluttered). The
  // section list is the shared source of truth (settingsSections.ts), so typing
  // "wifi" -> Network, "theme" -> Appearance, etc. jumps straight to that pane.
  const settingsCommands: Command[] = useMemo(() => SETTINGS_SECTIONS.map(s => ({
    id: `settings-${s.id}`,
    title: `Settings: ${s.name}`,
    subtitle: 'Open this settings page',
    icon: Icons.settings,
    category: 'settings' as const,
    action: () => window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
      detail: { appId: 'settings', contextId: s.id },
    })),
    keywords: s.keywords ? s.keywords.split(/\s+/) : [],
  })), []);

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Empty box: surface recently-used commands at the top (deduped from the
      // normal groups below), then the full list. `recentIds` is refreshed in
      // state whenever the palette opens, so this memo recomputes with fresh data.
      // Recents can include settings deep-links the user actually used, so look
      // those up across both lists -- but the default body stays just `commands`.
      const recent = recentIds
        .map(id => commands.find(c => c.id === id) ?? settingsCommands.find(c => c.id === id))
        .filter((c): c is Command => !!c)
        .map(c => ({ ...c, category: 'recent' as const }));
      if (recent.length === 0) return commands;
      const recentSet = new Set(recentIds);
      return [...recent, ...commands.filter(c => !recentSet.has(c.id))];
    }
    // Scoped search ("in:apps prism", "kind:settings"): filter by category, then
    // fuzzy-match the residual text. Unrecognised scopes fall back to a normal search.
    const { text: scopeText, allowedCategories } = scopedQuery(query);
    const q = scopeText.toLowerCase();

    // Math/unit evaluation only makes sense when the query carries a number, so
    // skip the parse machinery on plain-text queries -- this memo runs on every
    // keystroke and the common case ("notes", "set...") has no digits.
    const hasDigit = /\d/.test(scopeText);
    const mathResult = hasDigit ? tryEvalMath(scopeText) : null;
    const unitResult = hasDigit ? tryUnitConvert(scopeText) : null;
    const inlineResults: Command[] = [];
    if (mathResult) inlineResults.push({
      id: 'math-result',
      title: `= ${mathResult}`,
      subtitle: 'Copy result to clipboard',
      icon: Icons.calculator,
      category: 'action',
      action: () => { navigator.clipboard.writeText(mathResult); },
      keywords: [],
    });
    if (unitResult) inlineResults.push({
      id: 'unit-result',
      title: `= ${unitResult}`,
      subtitle: 'Copy conversion to clipboard',
      icon: Icons.converter,
      category: 'action',
      action: () => { navigator.clipboard.writeText(unitResult); },
      keywords: [],
    });

    const scored = [...commands, ...settingsCommands]
      .filter(cmd => !allowedCategories || allowedCategories.has(cmd.category))
      .map(cmd => {
      const titleScore = fuzzyScore(q, cmd.title);
      const keywordScore = cmd.keywords ? Math.max(...cmd.keywords.map(k => fuzzyScore(q, k))) : 0;
      const subtitleScore = cmd.subtitle ? fuzzyScore(q, cmd.subtitle) : 0;
      return { cmd, score: Math.max(titleScore, keywordScore, subtitleScore) };
    }).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score);

    // Spotlight-style fallback: a non-empty query is never a dead end. Append a
    // "Search the web" action under the scored matches, reusing the same browser
    // navigation contract as Quick Actions and Flow (dex-spotlight-navigate ->
    // AppManager opens Browser and navigates). Suppressed for math/unit queries,
    // which already produced an inline result above.
    const fallbacks: Command[] = [];
    const trimmed = scopeText.trim();
    if (trimmed && !mathResult && !unitResult) {
      fallbacks.push({
        id: 'web-search',
        title: `Search the web for "${trimmed}"`,
        subtitle: 'Open in Browser',
        icon: Icons.browser,
        category: 'action',
        action: () => window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
          detail: { appId: 'browser', contextId: `https://www.google.com/search?q=${encodeURIComponent(trimmed)}` },
        })),
        keywords: [],
      });
    }
    return [...inlineResults, ...scored.map(x => x.cmd), ...fallbacks];
  }, [commands, settingsCommands, query, recentIds]);

  // Flatten into the SAME order the list renders (grouped by category). The list
  // is rendered grouped, so the visual top-to-bottom order differs from the
  // score-sorted `filteredCommands`; keyboard nav, scroll-into-view, the active-
  // descendant aria, and Enter must all index against THIS order or the
  // highlighted row and the executed command drift apart.
  const orderedCommands = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      const list = groups.get(cmd.category);
      if (list) list.push(cmd);
      else groups.set(cmd.category, [cmd]);
    }
    return Array.from(groups.values()).flat();
  }, [filteredCommands]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setRecentIds(getRecentCommandIds()); // refresh recents each time it opens
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Execute a command: record it as recent (except transient math/unit results),
  // run its action, and close.
  const runCommand = useCallback((cmd: Command) => {
    if (cmd.id !== 'math-result' && cmd.id !== 'unit-result' && cmd.id !== 'web-search') recordRecentCommand(cmd.id);
    cmd.action();
    onClose();
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, orderedCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (orderedCommands[selectedIndex]) {
          runCommand(orderedCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [orderedCommands, selectedIndex, onClose, runCommand]);

  // Scroll selected item into view. Items are nested inside per-category group
  // wrappers, so listRef.children is NOT the flat item list -- look the row up by
  // its stable id (cmd-<id>) instead of by child index.
  useEffect(() => {
    const cmd = orderedCommands[selectedIndex];
    if (!cmd || !listRef.current) return;
    const selected = listRef.current.querySelector<HTMLElement>(
      `#cmd-${CSS.escape(cmd.id)}`
    );
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, orderedCommands]);

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'var(--color-scrim, rgba(0, 0, 0, 0.75))',
      zIndex: 'var(--z-overlay)' as any,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '15vh',
    },
    container: {
      width: '100%',
      maxWidth: 'min(560px, calc(100vw - 48px))',
      // background + border come from the .dex-liquid-glass class (real frosted
      // glass, lite-mode-aware). Keep radius/clip/elevation inline.
      borderRadius: '12px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      overflow: 'hidden',
    },
    inputWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      borderBottom: '1px solid var(--color-border)',
    },
    shortcut: {
      padding: '4px var(--space-2)',
      background: 'var(--color-bg-glass)',
      borderRadius: '3px',
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      fontFamily: 'monospace',
    },
    list: {
      maxHeight: '400px',
      overflow: 'auto',
      padding: 'var(--space-2)',
    },
    category: {
      padding: 'var(--space-2) var(--space-3) 4px',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: '10px var(--space-3)',
      borderRadius: '6px',
      cursor: 'pointer',
      transition: 'background 0.1s',
    },
    itemSelected: {
      background: 'var(--color-accent)',
    },
    itemIcon: {
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      borderRadius: '6px',
      color: 'var(--color-text-secondary)',
    },
    itemContent: {
      flex: 1,
    },
    itemTitle: {
      fontSize: '14px',
      fontWeight: 500,
      color: 'var(--color-text-primary)',
    },
    itemSubtitle: {
      fontSize: '12px',
      color: 'var(--color-text-muted)',
      marginTop: '2px',
    },
    itemShortcut: {
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      fontFamily: 'monospace',
      padding: '2px 6px',
      background: 'var(--color-bg-glass)',
      borderRadius: '3px',
    },
    empty: {
      padding: 'var(--space-8)',
      textAlign: 'center',
      color: 'var(--color-text-muted)',
    },
  };

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  const categoryLabels: Record<string, string> = {
    app: 'Apps',
    action: 'Quick Actions',
    navigation: 'Navigation',
    settings: 'Settings',
    recent: 'Recent',
  };

  let itemIndex = -1;

  return (
    <div style={styles.overlay} onMouseDown={onClose} role="presentation">
      <div ref={trapRef} className="dex-liquid-glass" style={styles.container} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command palette">
        <div style={styles.inputWrapper}>
          <DexSearchInput
            ref={inputRef}
            fullWidth
            placeholder="Search"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onClear={() => { setQuery(''); setSelectedIndex(0); inputRef.current?.focus(); }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-palette-list"
            aria-activedescendant={orderedCommands[selectedIndex] ? `cmd-${orderedCommands[selectedIndex].id}` : undefined}
            aria-autocomplete="list"
          />
          <span style={styles.shortcut}>ESC</span>
        </div>
        
        <div style={styles.list} ref={listRef} id="cmd-palette-list" role="listbox" aria-label="Commands">
          {filteredCommands.length === 0 ? (
            <div style={styles.empty}>No commands found</div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="dex-label-caps" style={styles.category}>{categoryLabels[category] || category}</div>
                {cmds.map(cmd => {
                  itemIndex++;
                  const currentIndex = itemIndex;
                  const isSelected = currentIndex === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      id={`cmd-${cmd.id}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-keyshortcuts={cmd.shortcut || undefined}
                      aria-label={cmd.subtitle ? `${cmd.title} — ${cmd.subtitle}` : cmd.title}
                      style={{
                        ...styles.item,
                        ...(isSelected ? styles.itemSelected : {}),
                        color: isSelected ? '#fff' : undefined,
                      }}
                      onClick={() => runCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <div style={{
                        ...styles.itemIcon,
                        background: isSelected ? 'var(--color-text-tertiary)' : styles.itemIcon.background,
                        color: isSelected ? '#fff' : styles.itemIcon.color,
                      }}>
                        {cmd.icon}
                      </div>
                      <div style={styles.itemContent}>
                        <div style={{
                          ...styles.itemTitle,
                          color: isSelected ? '#fff' : styles.itemTitle.color,
                        }}>{cmd.title}</div>
                        {cmd.subtitle && (
                          <div style={{
                            ...styles.itemSubtitle,
                            color: isSelected ? 'var(--color-text-secondary)' : styles.itemSubtitle.color,
                          }}>{cmd.subtitle}</div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <span style={{
                          ...styles.itemShortcut,
                          background: isSelected ? 'var(--color-text-tertiary)' : styles.itemShortcut.background,
                          color: isSelected ? '#fff' : styles.itemShortcut.color,
                        }}>{cmd.shortcut}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== HOOK ====================

export const useCommandPalette = (enabled: boolean = true) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K opens the command palette
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!enabled && isOpen) {
      setIsOpen(false);
    }
  }, [enabled, isOpen]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
};

export default CommandPalette;
