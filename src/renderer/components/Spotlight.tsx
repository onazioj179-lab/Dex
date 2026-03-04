/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPOTLIGHT — Universal Search & Command Launcher
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * macOS Spotlight-style unified search across all DEX apps, files,
 * actions, settings, and content. Replaces fragmented search components.
 *
 * Trigger: Ctrl+Space (global) or click search icon
 * Features: fuzzy matching, categories, keyboard nav, recent history,
 *           inline math, app-deep search, context-aware suggestions
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRunningApps } from '../store/runningApps';

// ═══ Types ════════════════════════════════════════════════════════════════

type ResultCategory = 'app' | 'action' | 'file' | 'note' | 'task' | 'setting' | 'math' | 'recent' | 'web';

interface SpotlightResult {
  id: string;
  title: string;
  subtitle?: string;
  category: ResultCategory;
  icon: React.ReactNode;
  color?: string;
  shortcut?: string;
  action: () => void;
  score: number;
}

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
}

// ═══ Icons (inline SVGs for zero-dep) ═════════════════════════════════════

const SI = {
  search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  files: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  browser: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  video: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>,
  audio: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  gallery: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  tasks: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  calculator: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/></svg>,
  password: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  transfers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  power: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
  workflows: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>,
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
  rewind: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 8 14"/></svg>,
  vinx: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>,
  imosion: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>,
  prism: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  flux: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>,
  forge: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  games: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><line x1="12" y1="9" x2="12" y2="15"/></svg>,
  action: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  math: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
  clock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  web: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
};

// ═══ Category labels & colors ════════════════════════════════════════════

const CAT_META: Record<ResultCategory, { label: string; color: string }> = {
  app:     { label: 'Apps',     color: '#3b82f6' },
  action:  { label: 'Actions',  color: '#f59e0b' },
  file:    { label: 'Files',    color: '#10b981' },
  note:    { label: 'Notes',    color: '#ffd60a' },
  task:    { label: 'Tasks',    color: '#ff9f0a' },
  setting: { label: 'Settings', color: '#8b5cf6' },
  math:    { label: 'Math',     color: '#06b6d4' },
  recent:  { label: 'Recent',   color: '#6b7280' },
  web:     { label: 'Web',      color: '#64d2ff' },
};

// ═══ Fuzzy match scoring ═════════════════════════════════════════════════

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;

  // Character-by-character fuzzy
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      score += consecutive * 2; // Reward consecutive matches
      if (ti === 0) score += 10; // Reward start-of-string
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return 0; // Not all chars matched
  return Math.min(60, score + maxConsecutive * 5);
}

function bestScore(query: string, ...texts: (string | undefined)[]): number {
  let best = 0;
  for (const t of texts) {
    if (t) best = Math.max(best, fuzzyScore(query, t));
  }
  return best;
}

// ═══ Math evaluator (safe, no eval/Function) ════════════════════════════

/** Recursive-descent parser: expr -> term ((+|-) term)* */
function safeMathEval(input: string): number | null {
  const cleaned = input
    .replace(/\s/g, '')
    .replace(/π|pi/gi, String(Math.PI))
    .replace(/\^/g, '**');
  let pos = 0;
  const ch = () => cleaned[pos] || '';
  const eat = (c: string) => { if (ch() === c) { pos++; return true; } return false; };

  function parseExpr(): number {
    let left = parseTerm();
    while (true) {
      if (eat('+')) left = left + parseTerm();
      else if (eat('-')) left = left - parseTerm();
      else break;
    }
    return left;
  }
  function parseTerm(): number {
    let left = parsePower();
    while (true) {
      if (eat('*') && eat('*')) left = Math.pow(left, parsePower());
      else if (cleaned[pos - 1] === '*' && cleaned[pos] !== '*') { left = left * parsePower(); }
      else if (eat('/')) { const r = parsePower(); if (r === 0) throw new Error('div0'); left = left / r; }
      else if (eat('%')) left = left % parsePower();
      else break;
    }
    return left;
  }
  function parsePower(): number {
    return parseUnary();
  }
  function parseUnary(): number {
    if (eat('-')) return -parseAtom();
    if (eat('+')) return parseAtom();
    return parseAtom();
  }
  function parseAtom(): number {
    // sqrt(...)
    if (cleaned.startsWith('sqrt(', pos)) {
      pos += 5;
      const val = parseExpr();
      if (!eat(')')) throw new Error('expected )');
      return Math.sqrt(val);
    }
    // abs(...)
    if (cleaned.startsWith('abs(', pos)) {
      pos += 4;
      const val = parseExpr();
      if (!eat(')')) throw new Error('expected )');
      return Math.abs(val);
    }
    // Parenthesized expression
    if (eat('(')) {
      const val = parseExpr();
      if (!eat(')')) throw new Error('expected )');
      return val;
    }
    // Number literal
    const start = pos;
    while (/[\d.e]/.test(ch())) pos++;
    if (pos === start) throw new Error('unexpected char');
    const num = parseFloat(cleaned.slice(start, pos));
    if (isNaN(num)) throw new Error('bad number');
    return num;
  }

  // Only allow safe characters before parsing
  if (!/^[\d.+\-*/()%esqrtabpi]+$/.test(cleaned)) return null;
  try {
    const result = parseExpr();
    if (pos !== cleaned.length) return null; // leftover chars = invalid
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return result;
  } catch { return null; }
}

function tryMath(expr: string): string | null {
  const result = safeMathEval(expr);
  if (result === null) return null;
  return result % 1 === 0 ? result.toString() : result.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

// ═══ Unit conversions ═══════════════════════════════════════════════════

function tryConversion(query: string): string | null {
  const m = query.match(/^([\d.]+)\s*(km|mi|miles|kg|lbs|lb|pounds|celsius|c|fahrenheit|f|cm|in|inches|m|ft|feet|oz|g|grams|l|gal|gallons)\s+(?:in|to)\s+(km|mi|miles|kg|lbs|lb|pounds|celsius|c|fahrenheit|f|cm|in|inches|m|ft|feet|oz|g|grams|l|gal|gallons)$/i);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();

  const conversions: Record<string, Record<string, (v: number) => number>> = {
    km: { mi: v => v * 0.621371, miles: v => v * 0.621371, m: v => v * 1000 },
    mi: { km: v => v * 1.60934 }, miles: { km: v => v * 1.60934 },
    kg: { lbs: v => v * 2.20462, lb: v => v * 2.20462, pounds: v => v * 2.20462, g: v => v * 1000, grams: v => v * 1000 },
    lbs: { kg: v => v * 0.453592 }, lb: { kg: v => v * 0.453592 }, pounds: { kg: v => v * 0.453592 },
    celsius: { fahrenheit: v => v * 9/5 + 32, f: v => v * 9/5 + 32 }, c: { f: v => v * 9/5 + 32, fahrenheit: v => v * 9/5 + 32 },
    fahrenheit: { celsius: v => (v - 32) * 5/9, c: v => (v - 32) * 5/9 }, f: { c: v => (v - 32) * 5/9, celsius: v => (v - 32) * 5/9 },
    cm: { in: v => v / 2.54, inches: v => v / 2.54 }, in: { cm: v => v * 2.54 }, inches: { cm: v => v * 2.54 },
    m: { ft: v => v * 3.28084, feet: v => v * 3.28084 }, ft: { m: v => v / 3.28084 }, feet: { m: v => v / 3.28084 },
    oz: { g: v => v * 28.3495, grams: v => v * 28.3495 }, g: { oz: v => v / 28.3495 }, grams: { oz: v => v / 28.3495 },
    l: { gal: v => v * 0.264172, gallons: v => v * 0.264172 }, gal: { l: v => v / 0.264172 }, gallons: { l: v => v / 0.264172 },
  };

  const fn = conversions[from]?.[to];
  if (!fn) return null;
  const result = fn(val);
  return `${val} ${from} = ${result.toFixed(2)} ${to}`;
}

// ═══ Recent searches persistence ════════════════════════════════════════

const RECENT_KEY = 'dex-spotlight-recent';
const MAX_RECENT = 20;

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentSearch(query: string) {
  if (!query.trim()) return;
  const recent = getRecentSearches().filter(r => r !== query);
  recent.unshift(query);
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
}

// ═══ Main Component ═════════════════════════════════════════════════════

const Spotlight: React.FC<SpotlightProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<ResultCategory | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setCurrentApp } = useRunningApps();

  // ── All available results ───────────────────────────────────────────

  const allResults: SpotlightResult[] = useMemo(() => {
    const close = () => onClose();
    const go = (app: string) => () => { setCurrentApp(app); close(); };

    const apps: SpotlightResult[] = [
      { id: 'app-home', title: 'Home', subtitle: 'Dashboard & overview', category: 'app', icon: SI.home, color: '#ffffff', action: go('home'), score: 0 },
      { id: 'app-files', title: 'Files', subtitle: 'Browse & manage files', category: 'app', icon: SI.files, color: '#30d158', shortcut: 'Ctrl+E', action: go('files'), score: 0 },
      { id: 'app-browser', title: 'Browser', subtitle: 'Secure web browsing', category: 'app', icon: SI.browser, color: '#64d2ff', action: go('browser'), score: 0 },
      { id: 'app-notes', title: 'Notes', subtitle: 'Write & organize notes', category: 'app', icon: SI.notes, color: '#ffd60a', shortcut: 'Ctrl+N', action: go('notes'), score: 0 },
      { id: 'app-tasks', title: 'Tasks', subtitle: 'Manage your to-do list', category: 'app', icon: SI.tasks, color: '#ff9f0a', action: go('tasks'), score: 0 },
      { id: 'app-calendar', title: 'Calendar', subtitle: 'Events & schedules', category: 'app', icon: SI.calendar, color: '#ff2d55', action: go('calendar'), score: 0 },
      { id: 'app-settings', title: 'Settings', subtitle: 'System preferences', category: 'app', icon: SI.settings, color: '#8e8e93', shortcut: 'Ctrl+,', action: go('settings'), score: 0 },
      { id: 'app-dashboard', title: 'Dashboard', subtitle: 'Widgets & launcher', category: 'app', icon: SI.dashboard, color: '#5e5ce6', action: go('dashboard'), score: 0 },
      { id: 'app-power', title: 'Power', subtitle: 'System controls & safe mode', category: 'app', icon: SI.power, color: '#ff453a', action: go('power'), score: 0 },
      { id: 'app-workflows', title: 'Workflows', subtitle: 'Automation builder', category: 'app', icon: SI.workflows, color: '#bf5af2', action: go('workflows'), score: 0 },
      { id: 'app-gallery', title: 'Gallery', subtitle: 'Photos & media', category: 'app', icon: SI.gallery, color: '#ff375f', action: go('gallery'), score: 0 },
      { id: 'app-audio', title: 'Audio', subtitle: 'Music player', category: 'app', icon: SI.audio, color: '#ff6482', action: go('audio'), score: 0 },
      { id: 'app-video', title: 'Video', subtitle: 'Video player', category: 'app', icon: SI.video, color: '#5e5ce6', action: go('video'), score: 0 },
      { id: 'app-calculator', title: 'Calculator', subtitle: 'Math & science', category: 'app', icon: SI.calculator, color: '#8e8e93', action: go('calculator'), score: 0 },
      { id: 'app-passwords', title: 'Password Generator', subtitle: 'Secure password creation', category: 'app', icon: SI.password, color: '#30d158', action: go('passwordgenerator'), score: 0 },
      { id: 'app-transfers', title: 'Share / Transfers', subtitle: 'AirDrop-style file sharing', category: 'app', icon: SI.transfers, color: '#10b981', action: go('transfers'), score: 0 },
      { id: 'app-rewind', title: 'Rewind', subtitle: 'Activity DVR & history', category: 'app', icon: SI.rewind, color: '#0078d4', action: go('rewind'), score: 0 },
      // Creative Suite
      { id: 'app-vinx', title: 'VINX Video Editor', subtitle: 'Professional video editing', category: 'app', icon: SI.vinx, color: '#bf5af2', shortcut: 'Alt+V', action: go('videoeditor'), score: 0 },
      { id: 'app-imosion', title: 'Imosion DAW', subtitle: 'Music production & mixing', category: 'app', icon: SI.imosion, color: '#ff9f0a', shortcut: 'Alt+I', action: go('imosion'), score: 0 },
      { id: 'app-prism', title: 'PRISM Image Editor', subtitle: 'Photo editing & design', category: 'app', icon: SI.prism, color: '#64d2ff', shortcut: 'Alt+R', action: go('prism'), score: 0 },
      { id: 'app-flux', title: 'FLUX Motion', subtitle: 'Motion graphics & VFX', category: 'app', icon: SI.flux, color: '#30d158', shortcut: 'Alt+F', action: go('flux'), score: 0 },
      { id: 'app-forge', title: 'FORGE Encoder', subtitle: 'Batch media encoding', category: 'app', icon: SI.forge, color: '#ff9f0a', shortcut: 'Alt+G', action: go('forge'), score: 0 },
      { id: 'app-games', title: 'Games', subtitle: 'Play & train your mind', category: 'app', icon: SI.games, color: '#ff375f', action: go('games'), score: 0 },
    ];

    const actions: SpotlightResult[] = [
      { id: 'act-new-note', title: 'Create New Note', subtitle: 'Start writing', category: 'action', icon: SI.notes, color: '#ffd60a', action: go('notes'), score: 0 },
      { id: 'act-new-task', title: 'Create New Task', subtitle: 'Add a to-do', category: 'action', icon: SI.tasks, color: '#ff9f0a', action: go('tasks'), score: 0 },
      { id: 'act-screenshot', title: 'Take Screenshot', subtitle: 'Capture your screen', category: 'action', icon: SI.prism, color: '#64d2ff', action: () => { window.electron?.invoke?.('rewind:takeScreenshot').catch(() => {}); close(); }, score: 0 },
      { id: 'act-workflows', title: 'New Workflow', subtitle: 'Create automation', category: 'action', icon: SI.workflows, color: '#bf5af2', action: go('workflows'), score: 0 },
      { id: 'act-panic', title: 'Panic Stop', subtitle: 'Emergency stop all automations', category: 'action', icon: SI.power, color: '#ff453a', action: () => { window.electron?.invoke?.('power:panic').catch(() => {}); close(); }, score: 0 },
      { id: 'act-lock', title: 'Lock DEX', subtitle: 'Require authentication', category: 'action', icon: SI.password, color: '#ff453a', action: () => { window.electron?.invoke?.('auth:lock').catch(() => {}); close(); }, score: 0 },
    ];

    const settings: SpotlightResult[] = [
      { id: 'set-general', title: 'General Settings', subtitle: 'Startup, language, updates', category: 'setting', icon: SI.settings, color: '#8e8e93', action: go('settings'), score: 0 },
      { id: 'set-appearance', title: 'Appearance', subtitle: 'Theme, accent color, fonts', category: 'setting', icon: SI.settings, color: '#8b5cf6', action: go('settings'), score: 0 },
      { id: 'set-privacy', title: 'Privacy & Security', subtitle: 'Data, permissions, vault', category: 'setting', icon: SI.password, color: '#30d158', action: go('settings'), score: 0 },
      { id: 'set-notifications', title: 'Notifications', subtitle: 'Alerts & sounds', category: 'setting', icon: SI.settings, color: '#ff9f0a', action: go('settings'), score: 0 },
      { id: 'set-storage', title: 'Storage', subtitle: 'Manage disk usage', category: 'setting', icon: SI.files, color: '#10b981', action: go('settings'), score: 0 },
      { id: 'set-rewind', title: 'Rewind Settings', subtitle: 'Recording & privacy zones', category: 'setting', icon: SI.rewind, color: '#0078d4', action: go('settings'), score: 0 },
      { id: 'set-shortcuts', title: 'Keyboard Shortcuts', subtitle: 'View & customize', category: 'setting', icon: SI.action, color: '#f59e0b', action: go('settings'), score: 0 },
      { id: 'set-about', title: 'About DEX', subtitle: 'Version, credits, license', category: 'setting', icon: SI.home, color: '#ffffff', action: go('settings'), score: 0 },
    ];

    return [...apps, ...actions, ...settings];
  }, [setCurrentApp, onClose]);

  // ── Filtered & scored results ──────────────────────────────────────

  const results: SpotlightResult[] = useMemo(() => {
    const q = query.trim();

    // Math result
    const mathResult = q ? tryMath(q) : null;
    const convResult = q ? tryConversion(q) : null;
    const specials: SpotlightResult[] = [];

    if (mathResult) {
      specials.push({
        id: 'math-result',
        title: `= ${mathResult}`,
        subtitle: q,
        category: 'math',
        icon: SI.math,
        color: '#06b6d4',
        action: () => { navigator.clipboard?.writeText(mathResult).catch(() => {}); onClose(); },
        score: 200,
      });
    }
    if (convResult) {
      specials.push({
        id: 'conv-result',
        title: convResult,
        subtitle: 'Unit conversion — click to copy',
        category: 'math',
        icon: SI.math,
        color: '#06b6d4',
        action: () => { navigator.clipboard?.writeText(convResult).catch(() => {}); onClose(); },
        score: 195,
      });
    }

    if (!q) {
      // Show recent searches + top apps
      const recent = getRecentSearches();
      const recentResults: SpotlightResult[] = recent.slice(0, 5).map((r, i) => ({
        id: `recent-${i}`,
        title: r,
        subtitle: 'Recent search',
        category: 'recent' as ResultCategory,
        icon: SI.clock,
        color: '#6b7280',
        action: () => setQuery(r),
        score: 50 - i,
      }));
      // Show some popular apps when empty
      const topApps = allResults.filter(r => r.category === 'app').slice(0, 8).map((r, i) => ({ ...r, score: 40 - i }));
      return [...recentResults, ...topApps];
    }

    // Score all results
    const scored = allResults.map(r => ({
      ...r,
      score: bestScore(q, r.title, r.subtitle, r.id),
    })).filter(r => r.score > 0);

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Category filter
    const filtered = activeCategory === 'all'
      ? scored
      : scored.filter(r => r.category === activeCategory);

    // Always add a web search option when there's a typed query
    if (q) {
      const webResult: SpotlightResult = {
        id: 'web-search',
        title: `Search the web for "${q}"`,
        subtitle: 'Open in Browser',
        category: 'web',
        icon: SI.web,
        color: '#64d2ff',
        action: () => {
          localStorage.setItem('dex-browser-search-url', q);
          setCurrentApp('browser');
          close();
        },
        score: filtered.length === 0 ? 200 : 5,
      };
      return [...specials, ...filtered, webResult].slice(0, 25);
    }

    return [...specials, ...filtered].slice(0, 25);
  }, [query, allResults, activeCategory, onClose, setCurrentApp]);

  // ── Keyboard nav ──────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          addRecentSearch(query);
          results[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        // Cycle categories
        const cats: (ResultCategory | 'all')[] = ['all', 'app', 'action', 'setting', 'file', 'note', 'task'];
        const ci = cats.indexOf(activeCategory);
        setActiveCategory(cats[(ci + 1) % cats.length]);
        setSelectedIndex(0);
        break;
    }
  }, [results, selectedIndex, query, onClose, activeCategory]);

  // ── Open/close effects ────────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setActiveCategory('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keep selected in view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  // ── Group results by category ─────────────────────────────────────

  const grouped = new Map<ResultCategory, SpotlightResult[]>();
  for (const r of results) {
    const list = grouped.get(r.category) || [];
    list.push(r);
    grouped.set(r.category, list);
  }

  return (
    <>
      {/* Backdrop */}
      <div style={S.backdrop} onClick={onClose} />

      {/* Main panel */}
      <div style={S.panel}>
        {/* Search input row */}
        <div style={S.inputRow}>
          <span style={S.searchIcon}>{SI.search}</span>
          <input
            ref={inputRef}
            style={S.input}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search apps, actions, files, settings…"
            autoComplete="off"
            spellCheck={false}
          />
          <div style={S.badges}>
            {(['all', 'app', 'action', 'setting'] as const).map(cat => (
              <button
                key={cat}
                style={{
                  ...S.catBadge,
                  ...(activeCategory === cat ? S.catBadgeActive : {}),
                }}
                onClick={() => { setActiveCategory(cat); setSelectedIndex(0); }}
                tabIndex={-1}
              >
                {cat === 'all' ? 'All' : CAT_META[cat as ResultCategory].label}
              </button>
            ))}
          </div>
          <kbd style={S.kbd}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={S.resultsList} ref={listRef}>
          {results.length === 0 && query && (
            <div style={S.empty}>
              <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 8 }}>search</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No results found</div>
              <div style={{ fontSize: 12, opacity: 0.5 }}>Try different keywords or check spelling</div>
            </div>
          )}

          {Array.from(grouped.entries()).map(([cat, items]) => (
            <div key={cat}>
              {query && (
                <div style={S.sectionHeader}>
                  <span style={{ ...S.sectionDot, background: CAT_META[cat]?.color || '#666' }} />
                  {CAT_META[cat]?.label || cat}
                </div>
              )}
              {items.map((result) => {
                const globalIdx = results.indexOf(result);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <div
                    key={result.id}
                    style={{
                      ...S.resultItem,
                      ...(isSelected ? S.resultItemSelected : {}),
                    }}
                    onClick={() => { addRecentSearch(query); result.action(); }}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                  >
                    <div style={{ ...S.resultIcon, background: `${result.color || '#3b82f6'}18`, color: result.color || '#3b82f6' }}>
                      {result.icon}
                    </div>
                    <div style={S.resultBody}>
                      <div style={S.resultTitle}>{result.title}</div>
                      {result.subtitle && <div style={S.resultSubtitle}>{result.subtitle}</div>}
                    </div>
                    {result.shortcut && (
                      <kbd style={S.resultShortcut}>{result.shortcut}</kbd>
                    )}
                    <div style={{ ...S.catPill, background: `${CAT_META[result.category]?.color || '#666'}18`, color: CAT_META[result.category]?.color || '#666' }}>
                      {CAT_META[result.category]?.label || result.category}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        <div style={S.footer}>
          <span style={S.footerHint}><kbd style={S.footerKbd}>arrow-uparrow-down</kbd> Navigate</span>
          <span style={S.footerHint}><kbd style={S.footerKbd}>↵</kbd> Open</span>
          <span style={S.footerHint}><kbd style={S.footerKbd}>Tab</kbd> Category</span>
          <span style={S.footerHint}><kbd style={S.footerKbd}>Esc</kbd> Close</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, opacity: 0.3 }}>Spotlight Search</span>
        </div>
      </div>
    </>
  );
};

// ═══ Hook: useSpotlight — manages open state + keyboard trigger ═════════

export function useSpotlight() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space to toggle Spotlight
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen, close: () => setIsOpen(false) };
}

// ═══ Styles ═════════════════════════════════════════════════════════════

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    zIndex: 99998,
    transition: 'opacity 0.15s ease',
  },
  panel: {
    position: 'fixed',
    top: '15%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '620px',
    maxWidth: '92vw',
    maxHeight: '70vh',
    background: 'rgba(22,22,26,0.92)',
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 18,
    boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 99999,
    color: 'var(--text-primary, #fafafa)',
    fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  searchIcon: {
    color: 'rgba(255,255,255,0.35)',
    flexShrink: 0,
    display: 'flex',
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary, #fafafa)',
    fontSize: 16,
    fontWeight: 500,
    letterSpacing: '-0.01em',
  },
  badges: {
    display: 'flex',
    gap: 4,
    flexShrink: 0,
  },
  catBadge: {
    padding: '4px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'rgba(255,255,255,0.05)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  catBadgeActive: {
    background: 'rgba(59,130,246,0.2)',
    color: '#3b82f6',
  },
  kbd: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 500,
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  resultsList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 8px',
    maxHeight: 'calc(70vh - 120px)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 10px 4px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'rgba(255,255,255,0.35)',
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    display: 'inline-block',
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    marginBottom: 2,
  },
  resultItemSelected: {
    background: 'rgba(255,255,255,0.08)',
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultBody: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  resultSubtitle: {
    fontSize: 11,
    opacity: 0.45,
    marginTop: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  resultShortcut: {
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 500,
    fontFamily: 'inherit',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  },
  catPill: {
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 500,
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center' as const,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '10px 18px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  footerHint: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  footerKbd: {
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 10,
    fontFamily: 'inherit',
    color: 'rgba(255,255,255,0.4)',
  },
};

Spotlight.displayName = 'Spotlight';
export default memo(Spotlight);
export { Spotlight };
