// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Spotlight Engine
 * Adaptive search index with learning, deep host search, settings discovery.
 * Categories: top, recent, apps, settings, notes, tasks, files, actions, calculator, web.
 * Co-occurrence graph with time decay, prefix type-ahead, throttle awareness.
 * Safe math parser (no eval), fuzzy matching with character-level highlight spans.
 * First result under 30ms.
 */

import { sharedTick } from '../services/SharedTick';
import { useXenonStore } from '../store/xenonStore';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';
import { useClipboardStore } from '../store/clipboardStore';
import { useStageStore, STAGE_KIND_META, type StageKind } from '../store/stageStore';
import { buildDexCommands } from '../../shared/commands/dexCommands';
import { executeDexCommand } from '../services/dexCommandRunner';
import { openWorkflowSpace, WORKFLOW_TEMPLATES } from '../services/projectSpaces';

export type SpotlightCategory =
  | 'top'
  | 'recent'
  | 'apps'
  | 'settings'
  | 'notes'
  | 'tasks'
  | 'files'
  | 'projects'
  | 'workflows'
  | 'commands'
  | 'clipboard'
  | 'screenshots'
  | 'conversations'
  | 'actions'
  | 'calculator'
  | 'web';

export interface HighlightSpan {
  start: number;
  end: number;
}

export interface SpotlightResult {
  id: string;
  category: SpotlightCategory;
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  highlights: HighlightSpan[];
  score: number;
  action: () => void;
}

export interface SpotlightAction {
  id: string;
  label: string;
  keywords: string[];
  icon?: string;
  color?: string;
  action: () => void;
}

interface IndexedItem {
  id: string;
  category: SpotlightCategory;
  title: string;
  subtitle?: string;
  searchText: string;
  icon?: string;
  color?: string;
  action: () => void;
  frequency: number;
  lastUsed: number;
}

// ---------------------------------------------------------------------------
// SAFE MATH PARSER
// Tokenizer + recursive descent -- no eval, no Function constructor.
// Supports: +, -, *, /, ^, %, (, ), unary minus, decimals
// Built-in: sqrt, sin, cos, tan, log, ln, abs, ceil, floor, round, pi, e
// ---------------------------------------------------------------------------

const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const MATH_FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  exp: Math.exp,
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'func'; value: string }
  | { type: 'const'; value: string };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const src = expr.replace(/\s+/g, '').toLowerCase();

  while (i < src.length) {
    const ch = src[i];

    if (/[0-9.]/.test(ch)) {
      let num = '';
      let dots = 0;
      while (i < src.length && (/[0-9]/.test(src[i]) || src[i] === '.')) {
        if (src[i] === '.') dots++;
        if (dots > 1) return null;
        num += src[i];
        i++;
      }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) return null;
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    if ('+-*/%^'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    if (/[a-z]/.test(ch)) {
      let word = '';
      while (i < src.length && /[a-z]/.test(src[i])) {
        word += src[i];
        i++;
      }
      if (MATH_FUNCTIONS[word]) {
        tokens.push({ type: 'func', value: word });
      } else if (MATH_CONSTANTS[word] !== undefined) {
        tokens.push({ type: 'const', value: word });
      } else {
        return null;
      }
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

function parseMathExpression(expr: string): number | null {
  const rawTokens = tokenize(expr);
  if (!rawTokens || rawTokens.length === 0) return null;
  const tokens: Token[] = rawTokens;

  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens.length) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      consume();
      const right = parseTerm();
      if (right === null) return null;
      left = t.value === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parsePower();
    if (left === null) return null;
    while (pos < tokens.length) {
      const t = peek();
      if (!t || t.type !== 'op' || (t.value !== '*' && t.value !== '/' && t.value !== '%')) break;
      consume();
      const right = parsePower();
      if (right === null) return null;
      if (t.value === '*') left = left * right;
      else if (t.value === '/') { if (right === 0) return null; left = left / right; }
      else left = left % right;
    }
    return left;
  }

  function parsePower(): number | null {
    let base = parseUnary();
    if (base === null) return null;
    while (pos < tokens.length) {
      const t = peek();
      if (!t || t.type !== 'op' || t.value !== '^') break;
      consume();
      const exp = parseUnary();
      if (exp === null) return null;
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number | null {
    const t = peek();
    if (t && t.type === 'op' && t.value === '-') {
      consume();
      const val = parseAtom();
      return val !== null ? -val : null;
    }
    if (t && t.type === 'op' && t.value === '+') {
      consume();
    }
    return parseAtom();
  }

  function parseAtom(): number | null {
    const t = peek();
    if (!t) return null;

    if (t.type === 'number') {
      consume();
      return t.value;
    }

    if (t.type === 'const') {
      consume();
      return MATH_CONSTANTS[t.value] ?? null;
    }

    if (t.type === 'func') {
      consume();
      const fn = MATH_FUNCTIONS[t.value];
      if (!fn) return null;
      const next = peek();
      if (!next || next.type !== 'paren' || next.value !== '(') return null;
      consume();
      const arg = parseExpr();
      if (arg === null) return null;
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') return null;
      consume();
      return fn(arg);
    }

    if (t.type === 'paren' && t.value === '(') {
      consume();
      const val = parseExpr();
      if (val === null) return null;
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') return null;
      consume();
      return val;
    }

    return null;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  if (!isFinite(result)) return null;
  return result;
}

// ---------------------------------------------------------------------------
// UNIT CONVERSION TABLE (static, no external dependencies)
// ---------------------------------------------------------------------------

interface ConversionUnit {
  name: string;
  aliases: string[];
  toBase: number;
  group: string;
}

const CONVERSIONS: ConversionUnit[] = [
  // Length
  { name: 'meters', aliases: ['m', 'meter', 'meters', 'metre', 'metres'], toBase: 1, group: 'length' },
  { name: 'kilometers', aliases: ['km', 'kilometer', 'kilometers'], toBase: 1000, group: 'length' },
  { name: 'centimeters', aliases: ['cm', 'centimeter', 'centimeters'], toBase: 0.01, group: 'length' },
  { name: 'millimeters', aliases: ['mm', 'millimeter', 'millimeters'], toBase: 0.001, group: 'length' },
  { name: 'miles', aliases: ['mi', 'mile', 'miles'], toBase: 1609.344, group: 'length' },
  { name: 'yards', aliases: ['yd', 'yard', 'yards'], toBase: 0.9144, group: 'length' },
  { name: 'feet', aliases: ['ft', 'foot', 'feet'], toBase: 0.3048, group: 'length' },
  { name: 'inches', aliases: ['in', 'inch', 'inches'], toBase: 0.0254, group: 'length' },
  // Weight
  { name: 'kilograms', aliases: ['kg', 'kilogram', 'kilograms'], toBase: 1, group: 'weight' },
  { name: 'grams', aliases: ['g', 'gram', 'grams'], toBase: 0.001, group: 'weight' },
  { name: 'milligrams', aliases: ['mg', 'milligram', 'milligrams'], toBase: 0.000001, group: 'weight' },
  { name: 'pounds', aliases: ['lb', 'lbs', 'pound', 'pounds'], toBase: 0.453592, group: 'weight' },
  { name: 'ounces', aliases: ['oz', 'ounce', 'ounces'], toBase: 0.0283495, group: 'weight' },
  { name: 'tonnes', aliases: ['t', 'tonne', 'tonnes', 'metric ton'], toBase: 1000, group: 'weight' },
  // Temperature (handled separately via formula)
  // Volume
  { name: 'liters', aliases: ['l', 'liter', 'liters', 'litre', 'litres'], toBase: 1, group: 'volume' },
  { name: 'milliliters', aliases: ['ml', 'milliliter', 'milliliters'], toBase: 0.001, group: 'volume' },
  { name: 'gallons', aliases: ['gal', 'gallon', 'gallons'], toBase: 3.78541, group: 'volume' },
  { name: 'quarts', aliases: ['qt', 'quart', 'quarts'], toBase: 0.946353, group: 'volume' },
  { name: 'cups', aliases: ['cup', 'cups'], toBase: 0.236588, group: 'volume' },
  { name: 'fluid ounces', aliases: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'], toBase: 0.0295735, group: 'volume' },
  // Time
  { name: 'seconds', aliases: ['s', 'sec', 'second', 'seconds'], toBase: 1, group: 'time' },
  { name: 'minutes', aliases: ['min', 'minute', 'minutes'], toBase: 60, group: 'time' },
  { name: 'hours', aliases: ['h', 'hr', 'hour', 'hours'], toBase: 3600, group: 'time' },
  { name: 'days', aliases: ['d', 'day', 'days'], toBase: 86400, group: 'time' },
  { name: 'weeks', aliases: ['wk', 'week', 'weeks'], toBase: 604800, group: 'time' },
  // Data
  { name: 'bytes', aliases: ['b', 'byte', 'bytes'], toBase: 1, group: 'data' },
  { name: 'kilobytes', aliases: ['kb', 'kilobyte', 'kilobytes'], toBase: 1024, group: 'data' },
  { name: 'megabytes', aliases: ['mb', 'megabyte', 'megabytes'], toBase: 1048576, group: 'data' },
  { name: 'gigabytes', aliases: ['gb', 'gigabyte', 'gigabytes'], toBase: 1073741824, group: 'data' },
  { name: 'terabytes', aliases: ['tb', 'terabyte', 'terabytes'], toBase: 1099511627776, group: 'data' },
];

const ALIAS_MAP = new Map<string, ConversionUnit>();
for (const unit of CONVERSIONS) {
  for (const alias of unit.aliases) {
    ALIAS_MAP.set(alias.toLowerCase(), unit);
  }
}

// Temperature conversion (special case -- not linear)
function convertTemperature(value: number, from: string, to: string): number | null {
  const fromKey = from.toLowerCase();
  const toKey = to.toLowerCase();

  const cAliases = ['c', 'celsius', 'centigrade'];
  const fAliases = ['f', 'fahrenheit'];
  const kAliases = ['k', 'kelvin'];

  let celsius: number;
  if (cAliases.includes(fromKey)) celsius = value;
  else if (fAliases.includes(fromKey)) celsius = (value - 32) * 5 / 9;
  else if (kAliases.includes(fromKey)) celsius = value - 273.15;
  else return null;

  if (cAliases.includes(toKey)) return celsius;
  if (fAliases.includes(toKey)) return celsius * 9 / 5 + 32;
  if (kAliases.includes(toKey)) return celsius + 273.15;
  return null;
}

function isTemperatureUnit(unit: string): boolean {
  const u = unit.toLowerCase();
  return ['c', 'celsius', 'centigrade', 'f', 'fahrenheit', 'k', 'kelvin'].includes(u);
}

function tryConversion(query: string): string | null {
  // Pattern: "100 km to miles" or "100km in miles" or "100 km = miles"
  const pattern = /^([\d.]+)\s*([a-zA-Z\s]+?)\s+(?:to|in|=)\s+([a-zA-Z\s]+)$/i;
  const match = query.trim().match(pattern);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const fromStr = match[2].trim().toLowerCase();
  const toStr = match[3].trim().toLowerCase();

  if (isNaN(value)) return null;

  // Temperature
  if (isTemperatureUnit(fromStr) && isTemperatureUnit(toStr)) {
    const result = convertTemperature(value, fromStr, toStr);
    if (result !== null) {
      return `${value} ${fromStr} = ${parseFloat(result.toFixed(4))} ${toStr}`;
    }
    return null;
  }

  const fromUnit = ALIAS_MAP.get(fromStr);
  const toUnit = ALIAS_MAP.get(toStr);
  if (!fromUnit || !toUnit) return null;
  if (fromUnit.group !== toUnit.group) return null;

  const baseValue = value * fromUnit.toBase;
  const converted = baseValue / toUnit.toBase;
  return `${value} ${fromUnit.name} = ${parseFloat(converted.toFixed(6))} ${toUnit.name}`;
}

// ---------------------------------------------------------------------------
// LEVENSHTEIN DISTANCE (for typo suggestions)
// ---------------------------------------------------------------------------

function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  // Use only two rows for space efficiency
  let prev = new Array(bn + 1);
  let curr = new Array(bn + 1);

  for (let j = 0; j <= bn; j++) prev[j] = j;

  for (let i = 1; i <= an; i++) {
    curr[0] = i;
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bn];
}

/** Check if query might be a typo of target (within tolerance) */
function isLikelyTypo(query: string, target: string, maxDistance = 2): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  // Skip if lengths differ too much
  if (Math.abs(q.length - t.length) > maxDistance) return false;
  // Skip very short queries
  if (q.length < 3) return false;
  return levenshteinDistance(q, t) <= maxDistance;
}

// ---------------------------------------------------------------------------
// CUSTOM USER ALIASES (user-defined shortcuts)
// ---------------------------------------------------------------------------

const ALIASES_KEY = 'dex-spotlight-aliases';

interface UserAlias {
  alias: string;
  target: string;       // target item id or title
  targetType: 'app' | 'action' | 'setting' | 'url';
  created: number;
}

function loadUserAliases(): UserAlias[] {
  try {
    const raw = localStorage.getItem(ALIASES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveUserAliases(aliases: UserAlias[]): void {
  try {
    localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
  } catch { /* ignore */ }
}

// Built-in common aliases
const BUILTIN_ALIASES: Record<string, string> = {
  'calc': 'calculator',
  'cal': 'calendar',
  'vid': 'videoeditor',
  'music': 'imosion',
  'daw': 'imosion',
  'photo': 'prism',
  'img': 'prism',
  'pics': 'gallery',
  'anim': 'flux',
  'motion': 'flux',
  'render': 'forge',
  'export': 'forge',
  'cad': 'axl',
  '3d': 'axl',
  'browse': 'browser',
  'web': 'browser',
  'config': 'settings',
  'prefs': 'settings',
  'preferences': 'settings',
  'todo': 'tasks',
  'docs': 'files',
  'documents': 'files',
  'trash': 'recyclebin',
  'bin': 'recyclebin',
  'pwd': 'passwordgenerator',
  'pass': 'passwordgenerator',
  'timer': 'pomodoro',
  'focus': 'pomodoro',
  'noise': 'noisegenerator',
  'ambient': 'noisegenerator',
  'md': 'markdown',
  'clock': 'worldclock',
  'time': 'worldclock',
  'qr': 'qrcode',
  'colors': 'colorpicker',
  'palette': 'colorpicker',
  'units': 'unitconverter',
  'convert': 'unitconverter',
  'watch': 'stopwatch',
  'lap': 'stopwatch',
  'board': 'kanban',
  'project': 'kanban',
  'history': 'rewind',
  'backup': 'rewind',
  'trophies': 'achievements',
  'badges': 'achievements',
  'share': 'transfers',
  'send': 'transfers',
  'auto': 'workflows',
  'automation': 'workflows',
  'cpu': 'power',
  'perf': 'power',
  'system': 'power',
};

// ---------------------------------------------------------------------------
// KEYBOARD SHORTCUT HINTS
// ---------------------------------------------------------------------------

const _isMac = typeof navigator !== 'undefined'
  ? /Mac|macOS/i.test((navigator as any).userAgentData?.platform || navigator.platform || '')
  : false;
const _MOD = _isMac ? 'Cmd' : 'Ctrl';

const KEYBOARD_SHORTCUTS: Record<string, string> = {
  'settings':   `${_MOD}+,`,
  'browser':    `${_MOD}+Shift+B`,
  'files':      `${_MOD}+E`,
  'notes':      `${_MOD}+N`,
  'tasks':      `${_MOD}+T`,
  'calculator': `${_MOD}+Shift+C`,
  'calendar':   `${_MOD}+Shift+K`,
  'power':      `${_MOD}+Shift+P`,
};

// ---------------------------------------------------------------------------
// FUZZY MATCH WITH HIGHLIGHT SPANS
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, text: string): { score: number; highlights: HighlightSpan[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const highlights: HighlightSpan[] = [];

  // Exact substring match (highest score)
  const exactIdx = t.indexOf(q);
  if (exactIdx !== -1) {
    return {
      score: 100 + (q.length / t.length) * 50,
      highlights: [{ start: exactIdx, end: exactIdx + q.length }],
    };
  }

  // Word-start match (each query char matches start of a word)
  const words = t.split(/[\s\-_./\\]+/);
  let wordIdx = 0;
  let qIdx = 0;
  const wordHighlights: HighlightSpan[] = [];
  let offset = 0;
  let wordMatchCount = 0;

  for (const word of words) {
    const wordStart = t.indexOf(word, offset);
    if (qIdx < q.length && word.startsWith(q[qIdx])) {
      wordHighlights.push({ start: wordStart, end: wordStart + 1 });
      wordMatchCount++;
      qIdx++;
    }
    offset = wordStart + word.length;
    wordIdx++;
  }

  if (wordMatchCount === q.length) {
    return {
      score: 70 + (wordMatchCount / words.length) * 20,
      highlights: wordHighlights,
    };
  }

  // Character-level fuzzy (lowest score)
  let tIdx = 0;
  qIdx = 0;
  const charHighlights: HighlightSpan[] = [];
  let matchCount = 0;

  while (qIdx < q.length && tIdx < t.length) {
    if (q[qIdx] === t[tIdx]) {
      charHighlights.push({ start: tIdx, end: tIdx + 1 });
      matchCount++;
      qIdx++;
    }
    tIdx++;
  }

  if (qIdx === q.length) {
    // Merge adjacent highlights
    const merged: HighlightSpan[] = [];
    for (const h of charHighlights) {
      const last = merged[merged.length - 1];
      if (last && last.end === h.start) {
        last.end = h.end;
      } else {
        merged.push({ ...h });
      }
    }
    return {
      score: 30 + (matchCount / t.length) * 20 - (tIdx / t.length) * 10,
      highlights: merged,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// SEARCH HISTORY (last 50, in-memory with localStorage backup)
// ---------------------------------------------------------------------------

const HISTORY_KEY = 'dex-spotlight-history';
const MAX_HISTORY = 50;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    }
  } catch { /* ignore */ }
  return [];
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// CO-OCCURRENCE GRAPH (with time-decay learning, 45% boost cap)
// ---------------------------------------------------------------------------

const CO_OCCURRENCE_KEY = 'dex-spotlight-cooccurrence';
const MAX_BOOST = 0.45;
const DECAY_FACTOR = 0.92; // older selections decay each session
const DECAY_KEY = 'dex-spotlight-decay-ts';

interface CoOccurrence {
  [key: string]: { [key: string]: number };
}

function loadCoOccurrence(): CoOccurrence {
  try {
    const raw = localStorage.getItem(CO_OCCURRENCE_KEY);
    if (raw) {
      const graph: CoOccurrence = JSON.parse(raw);
      // Apply decay if last session was >2h ago
      const lastDecay = parseInt(localStorage.getItem(DECAY_KEY) || '0', 10);
      if (Date.now() - lastDecay > 7200000) {
        for (const key of Object.keys(graph)) {
          for (const id of Object.keys(graph[key])) {
            graph[key][id] = Math.round(graph[key][id] * DECAY_FACTOR * 100) / 100;
            if (graph[key][id] < 0.1) delete graph[key][id];
          }
          if (Object.keys(graph[key]).length === 0) delete graph[key];
        }
        localStorage.setItem(DECAY_KEY, String(Date.now()));
        saveCoOccurrence(graph);
      }
      return graph;
    }
  } catch { /* ignore */ }
  return {};
}

// The co-occurrence graph is keyed by every unique query string the user types,
// and new keys are only decay-pruned on load when >2h has elapsed — so within a
// long session it grows without bound (in memory and on disk). Cap the number of
// query keys here, dropping the weakest-signal ones. Mutates `graph` in place so
// the live `_coGraph` stays bounded too.
const MAX_CO_KEYS = 400;

function saveCoOccurrence(graph: CoOccurrence) {
  try {
    const keys = Object.keys(graph);
    if (keys.length > MAX_CO_KEYS) {
      const weight = (k: string) => {
        let sum = 0;
        for (const v of Object.values(graph[k])) sum += v;
        return sum;
      };
      keys.sort((a, b) => weight(b) - weight(a));
      for (const k of keys.slice(MAX_CO_KEYS)) delete graph[k];
    }
    localStorage.setItem(CO_OCCURRENCE_KEY, JSON.stringify(graph));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// PREFIX TYPE-AHEAD (learns what you pick for each prefix)
// ---------------------------------------------------------------------------

const TYPEAHEAD_KEY = 'dex-spotlight-typeahead';
const MAX_TYPEAHEAD_PER_PREFIX = 5;

interface TypeaheadEntry { id: string; title: string; subtitle?: string; count: number; lastPicked: number; }
interface TypeaheadMap { [prefix: string]: TypeaheadEntry[]; }

function loadTypeahead(): TypeaheadMap {
  try {
    const raw = localStorage.getItem(TYPEAHEAD_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveTypeahead(map: TypeaheadMap) {
  try {
    localStorage.setItem(TYPEAHEAD_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// APP DESCRIPTIONS (for search subtitles)
// ---------------------------------------------------------------------------

const APP_DESCRIPTIONS: Record<string, string> = {
  home: 'Desktop home screen',
  files: 'Browse and manage files',
  browser: 'Web browser',
  transfers: 'File sharing and transfers',
  settings: 'System settings and preferences',
  notes: 'Write and organize notes',
  tasks: 'Task manager and to-do lists',
  workflows: 'Automation workflows',
  calendar: 'Calendar and events',
  gallery: 'Photo gallery and viewer',
  audio: 'Music player',
  power: 'System power and performance',
  calculator: 'Calculator and conversions',
  passwordgenerator: 'Generate secure passwords',
  videoeditor: 'VINX — Professional video editor',
  imosion: 'Imosion — DAW and music production',
  prism: 'PRISM — Image editor and compositor',
  flux: 'FLUX — Motion graphics and animation',
  forge: 'FORGE — Media encoder and converter',
  axl: 'AXL — CAD and 3D modeling',
  rewind: 'Rewind — Time machine and activity log',
  kanban: 'Kanban — Project management board',
  achievements: 'Trophies and achievements',
  recyclebin: 'Trash / Recycle bin',
  weather: 'Weather forecasts and conditions',
  worldclock: 'World clock and time zones',
  noisegenerator: 'Ambient noise generator',
  markdown: 'Markdown editor and previewer',
  stopwatch: 'Stopwatch and lap timer',
  unitconverter: 'Unit converter',
  pomodoro: 'Pomodoro focus timer',
  qrcode: 'QR code generator',
  colorpicker: 'Color picker and palette tool',
  nexus: 'Arc reactor 3D file visualizer',
};

// ---------------------------------------------------------------------------
// SETTINGS INDEX (searchable settings from all apps and system)
// ---------------------------------------------------------------------------

interface SettingDef {
  id: string;
  label: string;
  section: string;
  keywords: string[];
}

const SETTINGS_INDEX: SettingDef[] = [
  // General
  { id: 'general:launchAtStartup', label: 'Launch at Login', section: 'general', keywords: ['startup', 'login', 'boot', 'auto start', 'launch'] },
  { id: 'general:checkForUpdates', label: 'Check for Updates', section: 'general', keywords: ['update', 'version', 'upgrade'] },
  { id: 'general:restoreLastSession', label: 'Restore Last Session', section: 'general', keywords: ['restore', 'session', 'reopen', 'tabs'] },
  { id: 'general:autoSave', label: 'Auto-Save', section: 'general', keywords: ['save', 'automatic', 'auto save'] },
  { id: 'general:analytics', label: 'Send Analytics', section: 'general', keywords: ['analytics', 'telemetry', 'usage data', 'anonymous'] },
  { id: 'general:reset', label: 'Reset All Settings', section: 'general', keywords: ['reset', 'defaults', 'factory', 'restore defaults'] },
  // Appearance
  { id: 'appearance:darkMode', label: 'Theme', section: 'appearance', keywords: ['dark mode', 'light mode', 'theme', 'dark', 'light', 'auto'] },
  { id: 'appearance:accentColor', label: 'Accent Color', section: 'appearance', keywords: ['color', 'accent', 'blue', 'green', 'orange', 'red', 'purple', 'pink', 'cyan', 'yellow'] },
  { id: 'appearance:fontSize', label: 'Font Size', section: 'appearance', keywords: ['font', 'text size', 'small', 'medium', 'large', 'font size'] },
  { id: 'appearance:reduceMotion', label: 'Reduce Motion', section: 'appearance', keywords: ['animation', 'motion', 'reduce', 'accessibility'] },
  { id: 'appearance:transparency', label: 'Transparency', section: 'appearance', keywords: ['transparent', 'opacity', 'glass', 'blur'] },
  { id: 'appearance:windowMaterial', label: 'Background Tint', section: 'appearance', keywords: ['wallpaper', 'tint', 'glass', 'frosted', 'solid', 'blur', 'material'] },
  { id: 'appearance:windowControls', label: 'Window Button Style', section: 'appearance', keywords: ['window', 'buttons', 'traffic light', 'close', 'minimize', 'maximize', 'controls'] },
  { id: 'appearance:stageManager', label: 'Stage Manager', section: 'appearance', keywords: ['stage manager', 'thumbnails', 'quick switch', 'app switching', 'multitasking'] },
  // Notifications
  { id: 'notifications:enable', label: 'Allow Notifications', section: 'notifications', keywords: ['notifications', 'alerts', 'push', 'notify'] },
  { id: 'notifications:sound', label: 'Notification Sound', section: 'notifications', keywords: ['sound', 'audio', 'alert sound', 'chime'] },
  { id: 'notifications:badge', label: 'Badge App Icon', section: 'notifications', keywords: ['badge', 'count', 'dock', 'icon'] },
  { id: 'notifications:dnd', label: 'Do Not Disturb', section: 'notifications', keywords: ['do not disturb', 'silence', 'quiet', 'focus', 'dnd', 'mute'] },
  // Privacy
  { id: 'privacy:biometric', label: 'Biometric Unlock', section: 'privacy', keywords: ['fingerprint', 'biometric', 'face', 'hello', 'unlock', 'security'] },
  { id: 'privacy:pin', label: 'PIN Code', section: 'privacy', keywords: ['pin', 'code', 'unlock', 'lock'] },
  { id: 'privacy:password', label: 'Password', section: 'privacy', keywords: ['password', 'unlock', 'security', 'credential'] },
  { id: 'privacy:autoLock', label: 'Auto-Lock Timer', section: 'privacy', keywords: ['auto lock', 'inactivity', 'timeout', 'lock screen'] },
  { id: 'privacy:location', label: 'Location Services', section: 'privacy', keywords: ['location', 'gps', 'privacy'] },
  { id: 'privacy:firewall', label: 'Built-in Firewall', section: 'privacy', keywords: ['firewall', 'network', 'block', 'security', 'protection'] },
  { id: 'privacy:malware', label: 'Malware Protection', section: 'privacy', keywords: ['malware', 'scan', 'antivirus', 'security', 'protection'] },
  { id: 'privacy:sandbox', label: 'Sandbox Applications', section: 'privacy', keywords: ['sandbox', 'isolated', 'safety', 'container'] },
  { id: 'privacy:encrypt', label: 'Protect Stored Data', section: 'privacy', keywords: ['protect data', 'stored data', 'privacy', 'security', 'device protection'] },
  { id: 'privacy:vpn', label: 'VPN Protection', section: 'privacy', keywords: ['vpn', 'tunnel', 'secure', 'traffic', 'network'] },
  // Updates
  { id: 'updates:autoCheck', label: 'Auto-Check Updates', section: 'updates', keywords: ['auto check', 'updates', 'periodic'] },
  { id: 'updates:autoDownload', label: 'Auto-Download Updates', section: 'updates', keywords: ['auto download', 'background', 'updates'] },
  { id: 'updates:channel', label: 'Update Channel', section: 'updates', keywords: ['stable', 'beta', 'release channel', 'updates'] },
  // About
  { id: 'about:version', label: 'Version Info', section: 'about', keywords: ['version', 'build', 'about', 'app info'] },
  { id: 'about:diagnostics', label: 'Diagnostics', section: 'about', keywords: ['diagnostics', 'troubleshoot', 'debug', 'report', 'system info'] },
  // Hidden settings (no UI section but still searchable)
  { id: 'general:downloadLocation', label: 'Download Location', section: 'general', keywords: ['download', 'save', 'folder', 'directory', 'location', 'path'] },
  { id: 'appearance:targetFPS', label: 'Target FPS', section: 'appearance', keywords: ['fps', 'frame rate', 'performance', 'refresh'] },
  { id: 'sound:masterVolume', label: 'Master Volume', section: 'general', keywords: ['volume', 'sound', 'audio', 'master'] },
  { id: 'sound:spatialAudio', label: 'Spatial Audio', section: 'general', keywords: ['spatial', 'surround', '3d audio', 'immersive'] },
  { id: 'display:nightShift', label: 'Night Shift', section: 'appearance', keywords: ['night shift', 'blue light', 'warmth', 'eye strain', 'night'] },
  { id: 'display:hdr', label: 'HDR Content', section: 'appearance', keywords: ['hdr', 'high dynamic range', 'display'] },
  { id: 'performance:hardwareAcceleration', label: 'Hardware Acceleration', section: 'general', keywords: ['hardware', 'acceleration', 'gpu', 'performance'] },
  { id: 'performance:lowPower', label: 'Low Power Mode', section: 'general', keywords: ['low power', 'battery', 'energy', 'power saving'] },
  { id: 'performance:memoryOptimization', label: 'Memory Optimization', section: 'general', keywords: ['memory', 'ram', 'optimization', 'performance'] },
  { id: 'accessibility:highContrast', label: 'High Contrast', section: 'appearance', keywords: ['high contrast', 'accessibility', 'visibility'] },
  { id: 'accessibility:largeText', label: 'Large Text', section: 'appearance', keywords: ['large text', 'bigger', 'accessibility', 'font size'] },
  { id: 'accessibility:screenReader', label: 'Screen Reader', section: 'appearance', keywords: ['screen reader', 'accessibility', 'voiceover', 'narrator'] },
];

// ---------------------------------------------------------------------------
// WEB SUGGESTION HELPERS
// ---------------------------------------------------------------------------

const WEB_SUGGESTION_ENGINES = [
  { label: 'Search Google', url: 'https://www.google.com/search?q=', color: '#4285F4' },
  { label: 'Search YouTube', url: 'https://www.youtube.com/results?search_query=', color: '#FF0000' },
  { label: 'Search Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=', color: '#636466' },
  { label: 'Search Stack Overflow', url: 'https://stackoverflow.com/search?q=', color: '#F48024' },
];

function generateWebSuggestions(query: string): SpotlightResult[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  return WEB_SUGGESTION_ENGINES.map((engine, i) => ({
    id: `web-${i}-${q}`,
    category: 'web' as SpotlightCategory,
    title: `${engine.label} for "${q}"`,
    subtitle: engine.url + encodeURIComponent(q),
    color: engine.color,
    highlights: [],
    score: 10 - i,
    action: () => {
      // Open in DEX browser app
      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
        detail: { appId: 'browser', contextId: engine.url + encodeURIComponent(q) },
      }));
    },
  }));
}

// ---------------------------------------------------------------------------
// SPOTLIGHT ENGINE
// ---------------------------------------------------------------------------

export class SpotlightEngine {
  private _index: IndexedItem[] = [];
  private _actions: Map<string, SpotlightAction> = new Map();
  private _history: string[] = loadHistory();
  private _usageFrequency: Map<string, number> = new Map();
  private _coGraph: CoOccurrence = loadCoOccurrence();
  private _typeahead: TypeaheadMap = loadTypeahead();
  private _userAliases: UserAlias[] = loadUserAliases();
  private _lastQuery = '';
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;
  private _onRefresh: (() => void) | null = null;
  private _xenonThrottle: 'none' | 'light' | 'moderate' | 'aggressive' | 'emergency' = 'none';
  private _xenonMemPressure: 'normal' | 'moderate' | 'aggressive' = 'normal';
  // Active project (cached from window.dex.projects.getActive); used to boost
  // results that belong to the project the user is currently working in.
  private _activeProjectId: string | null = null;

  constructor() {
    this._loadUsageFrequency();
    this._listenXenon();
  }

  // -- Lifecycle -----------------------------------------------------------

  start(onRefresh: () => void): void {
    this._onRefresh = onRefresh;
    this._refreshIndex();
    sharedTick.subscribe('spotlight-index', () => this._refreshIndex(), 60000);
  }

  destroy(): void {
    sharedTick.unsubscribe('spotlight-index');
    this._onRefresh = null;
    this._xenonUnsub?.();
  }

  // -- Xenon integration (throttle-aware search) --------------------------

  private _xenonUnsub: (() => void) | null = null;

  private _listenXenon(): void {
    try {
      this._xenonUnsub = useXenonStore.subscribe(
        (state: any) => {
          this._xenonThrottle = state.throttleLevel || 'none';
          this._xenonMemPressure = state.memoryPressure || 'normal';
        },
      );
    } catch { /* xenon store not available */ }
  }

  /** Returns true when system is under pressure — limits async fanout */
  private _isThrottled(): boolean {
    return this._xenonThrottle === 'aggressive' || this._xenonThrottle === 'emergency'
      || this._xenonMemPressure === 'aggressive';
  }

  // -- Index management ----------------------------------------------------

  private _refreshIndex(): void {
    const items: IndexedItem[] = [];

    // Notes from localStorage
    try {
      const raw = localStorage.getItem('dex-notes');
      if (raw) {
        const notes = JSON.parse(raw);
        if (Array.isArray(notes)) {
          for (const note of notes) {
            const title = note.title || note.name || 'Untitled Note';
            items.push({
              id: `note-${note.id || title}`,
              category: 'notes',
              title,
              subtitle: note.content ? note.content.slice(0, 80) : undefined,
              searchText: `${title} ${note.content || ''}`.toLowerCase(),
              icon: 'notes',
              color: 'var(--color-warning)',
              action: () => this._launchAppWithContext('notes', note.id),
              frequency: this._usageFrequency.get(`note-${note.id || title}`) || 0,
              lastUsed: note.updatedAt || note.createdAt || 0,
            });
          }
        }
      }
    } catch { /* ignore */ }

    // Tasks from localStorage
    try {
      const raw = localStorage.getItem('dex-tasks');
      if (raw) {
        const tasks = JSON.parse(raw);
        if (Array.isArray(tasks)) {
          for (const task of tasks) {
            const title = task.title || 'Untitled Task';
            items.push({
              id: `task-${task.id || title}`,
              category: 'tasks',
              title,
              subtitle: task.completed ? 'Completed' : task.dueDate ? `Due: ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date',
              searchText: `${title} ${task.description || ''}`.toLowerCase(),
              icon: 'tasks',
              color: task.completed ? 'var(--color-success)' : 'var(--color-warning)',
              action: () => this._launchAppWithContext('tasks', task.id),
              frequency: this._usageFrequency.get(`task-${task.id || title}`) || 0,
              lastUsed: task.updatedAt || task.createdAt || 0,
            });
          }
        }
      }
    } catch { /* ignore */ }

    // Recent files from localStorage
    try {
      const raw = localStorage.getItem('dex-recent-files');
      if (raw) {
        const files = JSON.parse(raw);
        if (Array.isArray(files)) {
          for (const file of files) {
            const name = file.name || file.path || 'Unknown File';
            items.push({
              id: `file-${file.path || name}`,
              category: 'files',
              title: name,
              subtitle: file.path,
              searchText: `${name} ${file.path || ''}`.toLowerCase(),
              icon: 'files',
              color: '#5B8FBF',
              action: () => this._launchAppWithContext('files', file.path),
              frequency: this._usageFrequency.get(`file-${file.path || name}`) || 0,
              lastUsed: file.time ? new Date(file.time).getTime() : 0,
            });
          }
        }
      }
    } catch { /* ignore */ }

    // Omni Clipboard -- recent clips are searchable; selecting copies the clip
    // back onto the OS clipboard. Source/language flow into the search text so
    // "copied from Notes" or "json" finds the right clip.
    try {
      const clips = useClipboardStore.getState().entries;
      for (const clip of clips.slice(0, 30)) {
        if (clip.kind === 'image') continue; // base64 data URLs aren't text-searchable
        const kindLabel = clip.kind === 'code'
          ? (clip.language?.toUpperCase() || 'Code')
          : clip.kind.charAt(0).toUpperCase() + clip.kind.slice(1);
        items.push({
          id: `clip-${clip.id}`,
          category: 'clipboard',
          title: clip.preview || clip.content.slice(0, 80),
          subtitle: clip.sourceAppName ? `${kindLabel} · ${clip.sourceAppName}` : kindLabel,
          searchText: `${clip.content.slice(0, 200)} ${clip.sourceAppName || ''} ${clip.language || ''}`.toLowerCase(),
          icon: 'clipboard',
          color: 'var(--color-accent)',
          action: () => {
            try { void navigator.clipboard.writeText(clip.content); } catch { /* clipboard unavailable */ }
            window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: 'Copied to clipboard' } }));
          },
          frequency: this._usageFrequency.get(`clip-${clip.id}`) || 0,
          lastUsed: clip.timestamp,
        });
      }
    } catch { /* clipboard store unavailable */ }

    // Register built-in actions from apps
    for (const [, action] of this._actions) {
      // Actions that launch apps get the 'apps' category for better grouping
      const isLaunchAction = action.id.startsWith('launch-');
      items.push({
        id: `action-${action.id}`,
        category: isLaunchAction ? 'apps' : 'actions',
        title: action.label,
        subtitle: isLaunchAction ? (APP_DESCRIPTIONS[action.id.replace('launch-', '')] || 'DEX Application') : undefined,
        searchText: [action.label, ...action.keywords].join(' ').toLowerCase(),
        icon: action.icon || 'forge',
        color: action.color || 'var(--color-accent)',
        action: action.action,
        frequency: this._usageFrequency.get(`action-${action.id}`) || 0,
        lastUsed: 0,
      });
    }

    // Settings items (searchable preferences from all sections)
    for (const setting of SETTINGS_INDEX) {
      const id = `setting-${setting.id}`;
      items.push({
        id,
        category: 'settings',
        title: setting.label,
        subtitle: `Settings > ${setting.section.charAt(0).toUpperCase() + setting.section.slice(1)}`,
        searchText: [setting.label, ...setting.keywords, setting.section].join(' ').toLowerCase(),
        icon: 'settings',
        color: 'var(--color-text-tertiary)',
        action: () => this._launchAppWithContext('settings', setting.section),
        frequency: this._usageFrequency.get(id) || 0,
        lastUsed: 0,
      });
    }

    // Project Spaces (DEX 5.6) — make the active workspace context switchable
    // straight from universal search ("development" -> Switch to Development).
    // Synchronous read of the renderer stage store, like settings/actions above.
    try {
      const { stages, activeStageId } = useStageStore.getState();
      for (const s of stages) {
        if (s.id === activeStageId) continue; // can't switch to the current space
        const meta = STAGE_KIND_META[(s.kind ?? 'general') as StageKind];
        const id = `space-${s.id}`;
        items.push({
          id,
          category: 'actions',
          title: `Switch to ${s.name}`,
          subtitle: `Workspace · ${meta.label}`,
          searchText: `${s.name} ${meta.label} workspace space switch project context`.toLowerCase(),
          icon: 'workflows',
          color: meta.accent.startsWith('#') ? meta.accent : 'var(--color-accent)',
          action: () => { try { useStageStore.getState().setActiveStage(s.id); } catch { /* store not ready */ } },
          frequency: this._usageFrequency.get(id) || 0,
          lastUsed: s.lastActiveAt || 0,
        });
      }
    } catch { /* stage store unavailable -> omit spaces */ }

    // DEX command catalog (DEX 5.6 "Universal Command Layer") — run system /
    // window / navigation actions straight from universal search, Raycast-style.
    // App-launch commands are already indexed above, so only ACTION commands are
    // added here; each runs through the one canonical executor (no duplication).
    try {
      for (const cmd of buildDexCommands(APP_DEFINITIONS)) {
        if (cmd.appId || !cmd.action) continue;
        const id = `cmd-${cmd.id}`;
        items.push({
          id,
          category: 'commands',
          title: cmd.label,
          subtitle: `${cmd.group} command`,
          searchText: [cmd.label, cmd.terminal, cmd.group, ...(cmd.keywords ?? []), ...(cmd.uki ?? [])].join(' ').toLowerCase(),
          icon: 'workflows',
          color: 'var(--color-accent)',
          action: () => { try { executeDexCommand(cmd); } catch { /* command run failed */ } },
          frequency: this._usageFrequency.get(id) || 0,
          lastUsed: 0,
        });
      }
    } catch { /* catalog unavailable -> omit commands */ }

    // Starter workspaces (DEX 5.6) — "open development workspace" spins up a new
    // kind-tagged Project Space with its apps tiled (one workflow-template source).
    try {
      for (const t of WORKFLOW_TEMPLATES) {
        const id = `wf-${t.id}`;
        items.push({
          id,
          category: 'actions',
          title: `Open ${t.name}`,
          subtitle: 'Starter workspace',
          searchText: `${t.name} ${t.description} ${t.tags.join(' ')} workspace open start project`.toLowerCase(),
          icon: 'workflows',
          color: t.accent.startsWith('#') ? t.accent : 'var(--color-accent)',
          action: () => { try { openWorkflowSpace(t.id); } catch { /* open failed */ } },
          frequency: this._usageFrequency.get(id) || 0,
          lastUsed: 0,
        });
      }
    } catch { /* templates unavailable -> omit */ }

    // Open browser tabs (DEX 5.6 Global Search 2.0) — the user's open browser
    // tabs become searchable; picking one opens the browser to that page. Reads
    // the persisted browser session from renderer localStorage (no IPC), and
    // routes through the same spotlight->browser navigate path as web results.
    try {
      const raw = localStorage.getItem('dex-browser-session');
      if (raw) {
        const session = JSON.parse(raw);
        const tabs: Array<{ id?: string; title?: string; url?: string }> = Array.isArray(session?.tabs) ? session.tabs : [];
        for (const t of tabs) {
          if (!t || typeof t.url !== 'string' || !t.url) continue; // skip blank "New Tab"
          const url = t.url;
          const id = `tab-${t.id ?? url}`;
          const title = (typeof t.title === 'string' && t.title) ? t.title : url;
          items.push({
            id,
            category: 'web',
            title,
            subtitle: `Browser tab · ${url.replace(/^https?:\/\//, '').slice(0, 60)}`,
            searchText: `${title} ${url} browser tab open page web`.toLowerCase(),
            icon: 'browser',
            color: '#5E5CE6',
            action: () => this._launchAppWithContext('browser', url),
            frequency: this._usageFrequency.get(id) || 0,
            lastUsed: 0,
          });
        }
      }
    } catch { /* no/invalid browser session -> omit tabs */ }

    // Browser history (DEX 5.6 Global Search) — recently-visited pages are
    // searchable; picking one reopens it. Reads the browser's persisted history
    // (renderer localStorage), most-recent-first and deduped by URL, capped so a
    // long history never floods the index.
    try {
      const raw = localStorage.getItem('dex-browser-history');
      if (raw) {
        const hist: Array<{ url?: string; title?: string; visitedAt?: number }> = JSON.parse(raw);
        if (Array.isArray(hist)) {
          const seen = new Set<string>();
          const recent = [...hist].sort((a, b) => (b?.visitedAt || 0) - (a?.visitedAt || 0));
          for (const h of recent) {
            if (!h || typeof h.url !== 'string' || !h.url || seen.has(h.url)) continue;
            seen.add(h.url);
            if (seen.size > 40) break;
            const url = h.url;
            const id = `hist-${url}`;
            const title = (typeof h.title === 'string' && h.title) ? h.title : url;
            items.push({
              id,
              category: 'web',
              title,
              subtitle: `History · ${url.replace(/^https?:\/\//, '').slice(0, 60)}`,
              searchText: `${title} ${url} history visited recent page web`.toLowerCase(),
              icon: 'browser',
              color: '#5E5CE6',
              action: () => this._launchAppWithContext('browser', url),
              frequency: this._usageFrequency.get(id) || 0,
              lastUsed: h.visitedAt || 0,
            });
          }
        }
      }
    } catch { /* no/invalid history -> omit */ }

    // Fetch real files from filesystem via IPC
    this._fetchFilesFromBackend();
    // Fetch projects + workflows via their existing channels. These are small,
    // bounded lists, so they live in the synchronous index (refreshed on the
    // 60s tick) and stay searchable instantly per keystroke — no async fanout.
    this._fetchProjectsFromBackend();
    this._fetchWorkflowsFromBackend();
    // Refresh which project is currently active so ranking can boost its items.
    this._refreshActiveProject();

    this._index = items;
    this._onRefresh?.();
  }

  /** Resolve the active project id (cached) so ranking can boost its members. */
  private async _refreshActiveProject(): Promise<void> {
    try {
      const active = await (window as any).dex?.projects?.getActive?.();
      this._activeProjectId = active?.id ?? null;
    } catch { this._activeProjectId = null; }
  }

  /** Projects from the native store (window.dex.projects.getAll). */
  private async _fetchProjectsFromBackend(): Promise<void> {
    try {
      const projects = await (window as any).dex?.projects?.getAll?.();
      if (!Array.isArray(projects)) return; // null under Tauri parity -> omit
      const next: IndexedItem[] = [];
      for (const p of projects) {
        const name = p?.name || 'Untitled Project';
        const id = `project-${p?.id || name}`;
        if (this._index.some(item => item.id === id)) continue;
        next.push({
          id,
          category: 'projects',
          title: name,
          subtitle: 'Project',
          searchText: `${name} project`.toLowerCase(),
          icon: 'kanban',
          color: p?.color || '#5E5CE6',
          // Carry the project id so ranking can detect the active project.
          action: () => this._launchAppWithContext('kanban', p?.id),
          frequency: this._usageFrequency.get(id) || 0,
          lastUsed: p?.lastAccessed ? Number(p.lastAccessed) : 0,
        });
      }
      if (next.length > 0) {
        this._index = [...this._index, ...next];
        this._onRefresh?.();
      }
    } catch { /* projects channel unavailable -> omit source */ }
  }

  /** Workflows from the native store (window.dex.workflows.getAll). */
  private async _fetchWorkflowsFromBackend(): Promise<void> {
    try {
      const dex = (window as any).dex;
      // Prefer the richer Phase-20 store, fall back to the legacy list.
      const workflows = await (dex?.workflow?.getAll?.() ?? dex?.workflows?.getAll?.());
      if (!Array.isArray(workflows)) return; // null under Tauri parity -> omit
      const next: IndexedItem[] = [];
      for (const w of workflows) {
        const name = w?.name || w?.title || 'Untitled Workflow';
        const id = `workflow-${w?.id || name}`;
        if (this._index.some(item => item.id === id)) continue;
        next.push({
          id,
          category: 'workflows',
          title: name,
          subtitle: w?.description ? String(w.description).slice(0, 80) : 'Workflow',
          searchText: `${name} ${w?.description || ''} workflow automation`.toLowerCase(),
          icon: 'workflows',
          color: '#BF5AF2',
          action: () => this._launchAppWithContext('workflows', w?.id),
          frequency: this._usageFrequency.get(id) || 0,
          lastUsed: w?.updatedAt || w?.lastRun || w?.createdAt || 0,
        });
      }
      if (next.length > 0) {
        this._index = [...this._index, ...next];
        this._onRefresh?.();
      }
    } catch { /* workflows channel unavailable -> omit source */ }
  }

  private async _fetchFilesFromBackend(): Promise<void> {
    try {
      const result = await (window as any).electron?.invoke?.('files:recent', { limit: 50 });
      if (result?.success && Array.isArray(result.files)) {
        const newFiles: IndexedItem[] = [];
        for (const file of result.files) {
          const name = file.name || file.path?.split(/[\\/]/).pop() || 'Unknown';
          const id = `file-${file.path || name}`;
          // Skip if already indexed from localStorage
          if (this._index.some(item => item.id === id)) continue;
          newFiles.push({
            id,
            category: 'files',
            title: name,
            subtitle: file.path,
            searchText: `${name} ${file.path || ''}`.toLowerCase(),
            icon: 'files',
            color: '#5B8FBF',
            action: () => this._launchAppWithContext('files', file.path),
            frequency: this._usageFrequency.get(id) || 0,
            lastUsed: file.modified ? new Date(file.modified).getTime() : 0,
          });
        }
        if (newFiles.length > 0) {
          this._index = [...this._index, ...newFiles];
          this._onRefresh?.();
        }
      }
    } catch { /* IPC not available */ }
  }

  private _launchAppWithContext(appId: string, contextId?: string): void {
    if (contextId) {
      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
        detail: { appId, contextId },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
        detail: { appId },
      }));
    }
  }

  // -- Action registration ------------------------------------------------

  registerAction(action: SpotlightAction): void {
    this._actions.set(action.id, action);
  }

  unregisterAction(id: string): void {
    this._actions.delete(id);
  }

  registerActions(actions: SpotlightAction[]): void {
    for (const a of actions) {
      this._actions.set(a.id, a);
    }
  }

  // -- Search --------------------------------------------------------------

  search(query: string): SpotlightResult[] {
    if (!query || query.trim().length === 0) {
      return this._getRecentResults();
    }

    const q = query.trim();
    this._lastQuery = q;
    const results: SpotlightResult[] = [];

    // 0. Check for alias match (user or built-in)
    const aliasResults = this._resolveAliases(q);
    if (aliasResults.length > 0) {
      results.push(...aliasResults);
    }

    // 1. Type-ahead suggestions (instant, from learned prefixes)
    const typeaheadResults = this._getTypeaheadSuggestions(q);
    if (typeaheadResults.length > 0 && q.length <= 6) {
      results.push(...typeaheadResults);
    }

    // 2. Calculator / Conversion (instant)
    const calcResult = this._tryCalculator(q);
    if (calcResult) {
      results.push(calcResult);
    }

    // 3. Search index (local items: apps, settings, notes, tasks, files, actions)
    const indexResults = this._searchIndex(q);
    results.push(...indexResults);

    // 4. Typo suggestions ("did you mean?") if no good matches
    if (indexResults.length === 0 || (indexResults.length > 0 && indexResults[0].score < 50)) {
      const typoResults = this._getTypoSuggestions(q);
      results.push(...typoResults);
    }

    // 5. Apply co-occurrence boost + usage frequency multiplier
    this._applyCoBoost(results);
    this._applyFrequencyBoost(results);
    // Boost by recency + active project / foreground app so the unified surface
    // surfaces what the user is working in right now (relevance + recency + context).
    this._applyContextBoost(results);

    // 6. Add keyboard shortcut hints to results
    this._addKeyboardHints(results);

    // 7. Sort by score
    results.sort((a, b) => b.score - a.score);

    // 8. Deduplicate (type-ahead may overlap with index results) and cap each
    // source so no single section (e.g. many matching notes/screenshots) floods
    // the unified surface — keeps the grouped-by-source layout balanced.
    const seen = new Set<string>();
    const perCategory = new Map<SpotlightCategory, number>();
    const PER_CATEGORY_LIMIT = 6;
    const deduped: SpotlightResult[] = [];
    for (const r of results) {
      if (seen.has(r.id)) continue;
      const count = perCategory.get(r.category) || 0;
      if (r.category !== 'calculator' && count >= PER_CATEGORY_LIMIT) continue;
      seen.add(r.id);
      perCategory.set(r.category, count + 1);
      deduped.push(r);
    }

    // 9. Mark top result
    if (deduped.length > 0 && deduped[0].category !== 'calculator') {
      deduped[0] = { ...deduped[0], category: 'top' };
    }

    // 10. Web suggestions (always appended at end after local results)
    if (q.length >= 2) {
      const webResults = generateWebSuggestions(q);
      deduped.push(...webResults);
    }

    // 11. Fire async deep search (host + DEX backend) unless throttled
    if (q.length >= 3) {
      this._searchFilesAsync(q);
      if (!this._isThrottled()) {
        this._searchDeepAsync(q);
        // Query-driven sources: screenshots, conversations and plugin commands.
        // Each degrades independently (null/throw -> source omitted).
        this._searchSourcesAsync(q);
      }
    }

    return deduped.slice(0, 32);
  }

  /** Resolve user and built-in aliases */
  private _resolveAliases(query: string): SpotlightResult[] {
    const q = query.toLowerCase().trim();
    const results: SpotlightResult[] = [];

    // Check user aliases first
    for (const alias of this._userAliases) {
      if (alias.alias.toLowerCase() === q) {
        const item = this._index.find(i => 
          i.id === alias.target || 
          i.title.toLowerCase() === alias.target.toLowerCase()
        );
        if (item) {
          results.push({
            id: item.id,
            category: 'top',
            title: item.title,
            subtitle: `Alias: ${alias.alias} → ${item.title}`,
            icon: item.icon,
            color: item.color,
            highlights: [],
            score: 250, // High score for exact alias match
            action: item.action,
          });
        } else if (alias.targetType === 'url') {
          results.push({
            id: `alias-url-${alias.alias}`,
            category: 'web',
            title: `Open ${alias.target}`,
            subtitle: `Alias: ${alias.alias}`,
            highlights: [],
            score: 250,
            action: () => {
              window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', {
                detail: { appId: 'browser', contextId: alias.target },
              }));
            },
          });
        }
      }
    }

    // Check built-in aliases
    const builtinTarget = BUILTIN_ALIASES[q];
    if (builtinTarget) {
      const item = this._index.find(i => 
        i.id === `action-launch-${builtinTarget}` || 
        i.title.toLowerCase() === builtinTarget
      );
      if (item && !results.some(r => r.id === item.id)) {
        results.push({
          id: item.id,
          category: 'top',
          title: item.title,
          subtitle: `Shortcut: "${q}" → ${item.title}`,
          icon: item.icon,
          color: item.color,
          highlights: [],
          score: 240,
          action: item.action,
        });
      }
    }

    return results;
  }

  /** Get typo suggestions using Levenshtein distance */
  private _getTypoSuggestions(query: string): SpotlightResult[] {
    const results: SpotlightResult[] = [];
    const seen = new Set<string>();

    // Check against app names and common actions
    for (const item of this._index) {
      if (seen.has(item.id)) continue;
      if (isLikelyTypo(query, item.title)) {
        seen.add(item.id);
        results.push({
          id: `typo-${item.id}`,
          category: item.category,
          title: item.title,
          subtitle: `Did you mean: ${item.title}?`,
          icon: item.icon,
          color: item.color,
          highlights: [],
          score: 35, // Lower score than exact matches
          action: item.action,
        });
      }
    }

    // Limit to top 3 typo suggestions
    return results.slice(0, 3);
  }

  /** Add keyboard shortcut hints to results */
  private _addKeyboardHints(results: SpotlightResult[]): void {
    for (const result of results) {
      // Extract app name from various id formats
      let appName: string | undefined;
      if (result.id.startsWith('action-launch-')) {
        appName = result.id.replace('action-launch-', '');
      } else if (result.category === 'apps') {
        appName = result.title.toLowerCase().replace(/\s/g, '');
      }

      if (appName && KEYBOARD_SHORTCUTS[appName]) {
        result.subtitle = result.subtitle 
          ? `${result.subtitle} • ${KEYBOARD_SHORTCUTS[appName]}`
          : KEYBOARD_SHORTCUTS[appName];
      }
    }
  }

  // -- Alias management ----------------------------------------------------

  addAlias(alias: string, target: string, targetType: 'app' | 'action' | 'setting' | 'url'): void {
    // Remove existing alias with same name
    this._userAliases = this._userAliases.filter(a => a.alias.toLowerCase() !== alias.toLowerCase());
    this._userAliases.push({ alias, target, targetType, created: Date.now() });
    saveUserAliases(this._userAliases);
  }

  removeAlias(alias: string): void {
    this._userAliases = this._userAliases.filter(a => a.alias.toLowerCase() !== alias.toLowerCase());
    saveUserAliases(this._userAliases);
  }

  getAliases(): UserAlias[] {
    return [...this._userAliases];
  }

  /** Get type-ahead instant suggestions from learned prefix map */
  private _getTypeaheadSuggestions(query: string): SpotlightResult[] {
    const prefix = query.toLowerCase().slice(0, 4);
    const results: SpotlightResult[] = [];

    // Check prefixes of decreasing length
    for (let len = Math.min(prefix.length, 4); len >= 2; len--) {
      const key = prefix.slice(0, len);
      const entries = this._typeahead[key];
      if (!entries || entries.length === 0) continue;

      // Return the top entries sorted by count
      const sorted = [...entries].sort((a, b) => b.count - a.count);
      for (const entry of sorted.slice(0, 3)) {
        // Find the actual indexed item to get its action
        const item = this._index.find(i => i.id === entry.id);
        if (!item) continue;
        results.push({
          id: entry.id,
          category: 'recent',
          title: entry.title,
          subtitle: entry.subtitle || item.subtitle,
          icon: item.icon,
          color: item.color,
          highlights: [],
          score: 150 + entry.count * 5,
          action: item.action,
        });
      }
      if (results.length > 0) break;
    }

    return results;
  }

  /** Apply usage frequency as a score multiplier */
  private _applyFrequencyBoost(results: SpotlightResult[]): void {
    for (const result of results) {
      const freq = this._usageFrequency.get(result.id) || 0;
      if (freq > 0) {
        // Logarithmic boost: diminishing returns for very high frequency
        result.score *= (1 + Math.log2(freq + 1) * 0.08);
      }
    }
  }

  /** Get suggestions from search history */
  getHistorySuggestions(prefix: string): string[] {
    if (!prefix || prefix.length < 1) return [];
    const p = prefix.toLowerCase();
    return this._history.filter(h => h.toLowerCase().startsWith(p)).slice(0, 5);
  }

  private _getRecentResults(): SpotlightResult[] {
    // Show recent/frequent items when no query
    const recent = [...this._index]
      .filter(item => item.frequency > 0 || item.lastUsed > 0)
      .sort((a, b) => {
        const freqDiff = b.frequency - a.frequency;
        if (freqDiff !== 0) return freqDiff;
        return b.lastUsed - a.lastUsed;
      })
      .slice(0, 8);

    return recent.map(item => ({
      id: item.id,
      category: 'recent' as SpotlightCategory,
      title: item.title,
      subtitle: item.subtitle,
      icon: item.icon,
      color: item.color,
      highlights: [],
      score: item.frequency * 10 + (item.lastUsed > 0 ? 5 : 0),
      action: item.action,
    }));
  }

  private _tryCalculator(query: string): SpotlightResult | null {
    // Try unit conversion first
    const conversion = tryConversion(query);
    if (conversion) {
      return {
        id: 'calc-conversion',
        category: 'calculator',
        title: conversion,
        subtitle: 'Unit Conversion',
        icon: 'calculator',
        color: '#64d2ff',
        highlights: [],
        score: 200,
        action: () => this._copyToClipboard(conversion.split('=')[1]?.trim() || conversion),
      };
    }

    // Try math expression
    const result = parseMathExpression(query);
    if (result !== null) {
      const formatted = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
      return {
        id: 'calc-result',
        category: 'calculator',
        title: `${query} = ${formatted}`,
        subtitle: 'Calculator',
        icon: 'calculator',
        color: '#64d2ff',
        highlights: [],
        score: 200,
        action: () => this._copyToClipboard(formatted),
      };
    }

    return null;
  }

  private _searchIndex(query: string): SpotlightResult[] {
    const results: SpotlightResult[] = [];

    for (const item of this._index) {
      const match = fuzzyMatch(query, item.title);
      const subtitleMatch = item.subtitle ? fuzzyMatch(query, item.subtitle) : null;
      // Also check searchText for keyword matches (settings, app keywords etc.)
      const searchTextMatch = item.searchText ? fuzzyMatch(query, item.searchText) : null;
      const candidates = [match, subtitleMatch, searchTextMatch].filter(Boolean) as { score: number; highlights: HighlightSpan[] }[];
      const bestMatch = candidates.sort((a, b) => b.score - a.score)[0];

      if (bestMatch && bestMatch.score > 20) {
        const titleHighlights = match === bestMatch ? bestMatch.highlights : [];
        results.push({
          id: item.id,
          category: item.category,
          title: item.title,
          subtitle: item.subtitle,
          icon: item.icon,
          color: item.color,
          highlights: titleHighlights,
          score: bestMatch.score + item.frequency * 4,
          action: item.action,
        });
      }
    }

    return results;
  }

  private _applyCoBoost(results: SpotlightResult[]): void {
    if (!this._lastQuery || results.length < 2) return;

    const q = this._lastQuery.toLowerCase();
    // Check multiple prefix lengths for broader co-occurrence matching
    for (const len of [4, 3, 2]) {
      const queryKey = q.slice(0, len);
      if (queryKey.length < 2) continue;
      const coData = this._coGraph[queryKey];
      if (!coData) continue;

      for (const result of results) {
        const boost = coData[result.id];
        if (boost && boost > 0) {
          const cappedBoost = Math.min(boost / 50, MAX_BOOST);
          result.score *= (1 + cappedBoost);
        }
      }
      break; // Use the most specific prefix that has data
    }
  }

  /**
   * Boost results by recency and by whether they belong to the active project
   * or the foreground app. This is the unified-surface ranking layer: the index
   * score (relevance) is multiplied by small, capped factors so a strong textual
   * match still wins, but ties break toward what the user is working in now.
   */
  private _applyContextBoost(results: SpotlightResult[]): void {
    const now = Date.now();
    // Foreground app id (reused from the running-apps store — no new state).
    let currentAppId = '';
    try { currentAppId = useRunningApps.getState().currentAppId || ''; } catch { /* store unavailable */ }
    const activeProjectId = this._activeProjectId;

    // Map each result id back to its indexed item for lastUsed + action context.
    const byId = new Map(this._index.map(i => [i.id, i]));

    for (const result of results) {
      const item = byId.get(result.id);

      // Recency: items touched in the last ~30 days get up to +25% (linear decay).
      const lastUsed = item?.lastUsed ?? 0;
      if (lastUsed > 0) {
        const ageDays = (now - lastUsed) / 86400000;
        if (ageDays >= 0 && ageDays < 30) {
          result.score *= 1 + 0.25 * (1 - ageDays / 30);
        }
      }

      // Foreground-app affinity: a result that opens (or lives in) the app the
      // user is currently looking at is more likely the one they want. Apps and
      // launch actions match on their own id; other items match via the appId
      // their action navigates to (best-effort, from the id prefix).
      if (currentAppId) {
        const ownerApp =
          result.id.startsWith('action-launch-') ? result.id.replace('action-launch-', '')
          : result.category === 'apps' ? result.title.toLowerCase().replace(/\s/g, '')
          : result.id.startsWith('workflow-') ? 'workflows'
          : result.id.startsWith('project-') ? 'kanban'
          : result.id.startsWith('screenshot-') ? 'rewind'
          : result.id.startsWith('conversation-') ? 'uki'
          : result.id.startsWith('command-') ? 'rewind'
          : result.id.startsWith('note-') ? 'notes'
          : result.id.startsWith('task-') ? 'tasks'
          : result.id.startsWith('file-') || result.id.startsWith('intel-') ? 'files'
          : '';
        if (ownerApp && ownerApp === currentAppId) {
          result.score *= 1.15;
        }
      }

      // Active-project affinity: the currently-active project ranks above peers.
      if (activeProjectId && result.id === `project-${activeProjectId}`) {
        result.score *= 1.3;
      }
    }
  }

  // -- Usage tracking ------------------------------------------------------

  recordSelection(query: string, resultId: string): void {
    // Update usage frequency
    const count = (this._usageFrequency.get(resultId) || 0) + 1;
    this._usageFrequency.set(resultId, count);
    this._saveUsageFrequency();

    // Update history
    const q = query.trim();
    if (q.length > 0) {
      this._history = [q, ...this._history.filter(h => h !== q)].slice(0, MAX_HISTORY);
      saveHistory(this._history);
    }

    // Update co-occurrence (use up to 4-char prefix for finer granularity)
    const queryKey = q.toLowerCase().slice(0, 4);
    if (queryKey.length > 0) {
      if (!this._coGraph[queryKey]) this._coGraph[queryKey] = {};
      this._coGraph[queryKey][resultId] = (this._coGraph[queryKey][resultId] || 0) + 2;
      // Also store for shorter prefix (2-3 chars) for broader matching
      const shortKey = queryKey.slice(0, 3);
      if (shortKey.length >= 2) {
        if (!this._coGraph[shortKey]) this._coGraph[shortKey] = {};
        this._coGraph[shortKey][resultId] = (this._coGraph[shortKey][resultId] || 0) + 1;
      }
      saveCoOccurrence(this._coGraph);
    }

    // Update type-ahead prefix map (learn what gets picked for each prefix)
    if (q.length >= 2) {
      const item = this._index.find(i => i.id === resultId);
      if (item) {
        // Store for multiple prefix lengths (2, 3, 4 chars)
        for (let len = 2; len <= Math.min(q.length, 4); len++) {
          const prefix = q.toLowerCase().slice(0, len);
          if (!this._typeahead[prefix]) this._typeahead[prefix] = [];
          const entries = this._typeahead[prefix];
          const existing = entries.find(e => e.id === resultId);
          if (existing) {
            existing.count++;
            existing.lastPicked = Date.now();
          } else {
            entries.push({ id: resultId, title: item.title, subtitle: item.subtitle, count: 1, lastPicked: Date.now() });
          }
          // Keep only top entries
          entries.sort((a, b) => b.count - a.count);
          if (entries.length > MAX_TYPEAHEAD_PER_PREFIX) {
            entries.length = MAX_TYPEAHEAD_PER_PREFIX;
          }
        }
        saveTypeahead(this._typeahead);
      }
    }
  }

  getHistory(): string[] {
    return [...this._history];
  }

  clearHistory(): void {
    this._history = [];
    saveHistory(this._history);
  }

  // -- Private helpers -----------------------------------------------------

  private _fileSearchSeq = 0;
  private async _searchFilesAsync(query: string): Promise<void> {
    const seq = ++this._fileSearchSeq;
    try {
      const result = await (window as any).electron?.invoke?.('files:search', { query, limit: 10 });
      if (seq !== this._fileSearchSeq) return; // stale
      if (result?.success && Array.isArray(result.files)) {
        let added = false;
        for (const file of result.files) {
          const name = file.name || file.path?.split(/[\\/]/).pop() || 'Unknown';
          const id = `file-${file.path || name}`;
          if (this._index.some(item => item.id === id)) continue;
          this._index.push({
            id,
            category: 'files',
            title: name,
            subtitle: file.path,
            searchText: `${name} ${file.path || ''}`.toLowerCase(),
            icon: 'files',
            color: '#5B8FBF',
            action: () => this._launchAppWithContext('files', file.path),
            frequency: 0,
            lastUsed: file.modified ? new Date(file.modified).getTime() : 0,
          });
          added = true;
        }
        if (added) this._onRefresh?.();
      }
    } catch { /* IPC not available */ }
  }

  /** Deep search via Universal Search API — searches across DEX and host computer */
  private _deepSearchSeq = 0;
  private async _searchDeepAsync(query: string): Promise<void> {
    const seq = ++this._deepSearchSeq;
    try {
      // Universal Search API: searches DEX data + host computer filesystem
      const dexSearch = (window as any).dex?.search;
      if (!dexSearch?.query) return;

      const result = await dexSearch.query(query, {
        scopes: ['dex', 'computer'],
        limit: 20,
        // Ask the global content index for every source it can return so the
        // unified surface reflects notes/tasks/projects/workflows too, not just
        // files. Unknown types degrade to the generic 'actions' bucket below.
        types: ['file', 'setting', 'app', 'action', 'note', 'task', 'project', 'workflow', 'screenshot', 'conversation'],
      });

      if (seq !== this._deepSearchSeq) return; // stale
      if (!result?.results || !Array.isArray(result.results)) return;

      // Map a global-index result type onto a Spotlight category + the app that
      // owns it. Centralised so the icon/color/navigation stay consistent.
      const DEEP_TYPE_MAP: Record<string, { category: SpotlightCategory; app: string; icon: string; color: string }> = {
        file: { category: 'files', app: 'files', icon: 'files', color: '#5B8FBF' },
        setting: { category: 'settings', app: 'settings', icon: 'settings', color: 'var(--color-text-tertiary)' },
        app: { category: 'apps', app: 'home', icon: 'forge', color: 'var(--color-accent)' },
        note: { category: 'notes', app: 'notes', icon: 'notes', color: 'var(--color-warning)' },
        task: { category: 'tasks', app: 'tasks', icon: 'tasks', color: 'var(--color-warning)' },
        project: { category: 'projects', app: 'kanban', icon: 'kanban', color: '#5E5CE6' },
        workflow: { category: 'workflows', app: 'workflows', icon: 'workflows', color: '#BF5AF2' },
        screenshot: { category: 'screenshots', app: 'rewind', icon: 'gallery', color: '#FF375F' },
        conversation: { category: 'conversations', app: 'uki', icon: 'collabhub', color: '#5E5CE6' },
      };

      let added = false;
      for (const item of result.results) {
        const id = `deep-${item.id || item.title}`;
        if (this._index.some(i => i.id === id)) continue;

        const mapped = DEEP_TYPE_MAP[item.type] ?? { category: 'actions' as SpotlightCategory, app: 'home', icon: 'forge', color: 'var(--color-accent)' };

        this._index.push({
          id,
          category: mapped.category,
          title: item.title,
          subtitle: item.subtitle || item.path || item.scope,
          searchText: `${item.title} ${item.subtitle || ''} ${item.path || ''}`.toLowerCase(),
          icon: mapped.icon,
          color: mapped.color,
          action: () => {
            if (item.path && mapped.category === 'files') {
              this._launchAppWithContext('files', item.path);
            } else {
              this._launchAppWithContext(mapped.app, item.id);
            }
          },
          frequency: 0,
          lastUsed: item.timestamp || 0,
        });
        added = true;
      }
      if (added) this._onRefresh?.();
    } catch { /* Universal Search not available */ }

    // Also try File Intelligence API for deeper file discovery
    try {
      const fileIntel = (window as any).dex?.fileIntel;
      if (!fileIntel?.searchFiles) return;

      const files = await fileIntel.searchFiles(query);
      if (seq !== this._deepSearchSeq) return;
      if (!Array.isArray(files)) return;

      let added = false;
      for (const file of files.slice(0, 10)) {
        const name = file.name || file.path?.split(/[\\/]/).pop() || 'Unknown';
        const id = `intel-${file.path || name}`;
        if (this._index.some(i => i.id === id)) continue;

        this._index.push({
          id,
          category: 'files',
          title: name,
          subtitle: file.path,
          searchText: `${name} ${file.path || ''}`.toLowerCase(),
          icon: 'files',
          color: '#5B8FBF',
          action: () => {
            if (file.path) {
              (window as any).dex?.fileIntel?.openFile?.(file.path);
            }
            this._launchAppWithContext('files', file.path);
          },
          frequency: 0,
          lastUsed: file.modified ? new Date(file.modified).getTime() : 0,
        });
        added = true;
      }
      if (added) this._onRefresh?.();
    } catch { /* File Intelligence not available */ }
  }

  /**
   * Query-driven sources that have no synchronous cache: plugin commands,
   * Rewind screenshots, and UKI conversations/memory. Each is queried through
   * its EXISTING channel, guarded so a null result (Tauri parity) or a throw
   * just omits that source — the rest of the surface is unaffected.
   */
  private _sourcesSeq = 0;
  private async _searchSourcesAsync(query: string): Promise<void> {
    const seq = ++this._sourcesSeq;
    const dex = (window as any).dex;
    if (!dex) return;
    const q = query.toLowerCase();
    const added = { value: false };

    const pushItem = (item: IndexedItem) => {
      if (this._index.some(i => i.id === item.id)) return;
      this._index.push(item);
      added.value = true;
    };

    // -- Plugin commands (Rewind plugin host) -------------------------------
    const commands = (async () => {
      try {
        const cmds = await dex?.rewind?.getPluginCommands?.();
        if (seq !== this._sourcesSeq || !Array.isArray(cmds)) return;
        for (const c of cmds) {
          const name = c?.name;
          if (!name) continue;
          // Local filter — getPluginCommands returns the full list, not a search.
          if (!name.toLowerCase().includes(q) && !(c?.pluginId || '').toLowerCase().includes(q)) continue;
          const pluginId = c.pluginId || 'plugin';
          pushItem({
            id: `command-${pluginId}-${name}`,
            category: 'commands',
            title: name,
            subtitle: `Command · ${pluginId}`,
            searchText: `${name} ${pluginId} command`.toLowerCase(),
            icon: 'forge',
            color: 'var(--color-accent)',
            action: () => { dex?.rewind?.runPluginCommand?.(pluginId, name)?.catch?.(() => {}); },
            frequency: 0,
            lastUsed: 0,
          });
        }
      } catch { /* commands unavailable -> omit */ }
    })();

    // -- Screenshots (Rewind, last 7 days) ----------------------------------
    const screenshots = (async () => {
      try {
        const shots = await dex?.rewind?.getScreenshots?.();
        if (seq !== this._sourcesSeq || !Array.isArray(shots)) return;
        for (const s of shots.slice(0, 40)) {
          const label = s?.appName || s?.title || s?.windowTitle || 'Screenshot';
          const hay = `${label} ${s?.ocrText || s?.text || ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
          const path = s?.filepath || s?.path || s?.id;
          const id = `screenshot-${path || label}`;
          const ts = s?.timestamp ? Number(s.timestamp) : 0;
          pushItem({
            id,
            category: 'screenshots',
            title: label,
            subtitle: ts ? new Date(ts).toLocaleString() : 'Screenshot',
            searchText: hay,
            icon: 'gallery',
            color: '#FF375F',
            action: () => this._launchAppWithContext('rewind', path),
            frequency: 0,
            lastUsed: ts,
          });
        }
      } catch { /* screenshots unavailable -> omit */ }
    })();

    // -- Conversations / UKI memory -----------------------------------------
    const conversations = (async () => {
      try {
        const hits = await dex?.uki?.memorySearch?.(query, 12);
        if (seq !== this._sourcesSeq || !Array.isArray(hits)) return;
        for (const h of hits) {
          const title = h?.summary || h?.title || h?.content || 'Conversation';
          const id = `conversation-${h?.id || title}`;
          const ts = h?.timestamp ? Number(h.timestamp) : (h?.createdAt ? Number(h.createdAt) : 0);
          pushItem({
            id,
            category: 'conversations',
            title: String(title).slice(0, 90),
            subtitle: h?.appId ? `UKI · ${h.appId}` : 'UKI conversation',
            searchText: `${title} ${h?.category || ''}`.toLowerCase(),
            icon: 'collabhub',
            color: '#5E5CE6',
            action: () => this._launchAppWithContext('uki', h?.id),
            frequency: 0,
            lastUsed: ts,
          });
        }
      } catch { /* uki memory unavailable -> omit */ }
    })();

    await Promise.allSettled([commands, screenshots, conversations]);
    if (seq === this._sourcesSeq && added.value) this._onRefresh?.();
  }

  private _copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch((e: unknown) => { console.warn('[DEX]', e); });
  }

  private _loadUsageFrequency(): void {
    try {
      const raw = localStorage.getItem('dex-spotlight-usage');
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data === 'object' && data !== null) {
          for (const [k, v] of Object.entries(data)) {
            if (typeof v === 'number') {
              this._usageFrequency.set(k, v);
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  private _saveUsageFrequency(): void {
    try {
      const obj: Record<string, number> = {};
      for (const [k, v] of this._usageFrequency) {
        obj[k] = v;
      }
      localStorage.setItem('dex-spotlight-usage', JSON.stringify(obj));
    } catch { /* ignore */ }
  }

  // -- Force refresh -------------------------------------------------------

  refresh(): void {
    this._refreshIndex();
  }
}

// ---------------------------------------------------------------------------
// SINGLETON
// ---------------------------------------------------------------------------

export const spotlightEngine = new SpotlightEngine();
