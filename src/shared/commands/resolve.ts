// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Fuzzy command RESOLUTION -- the intent-tolerance layer for the one DEX command
// catalog. Where `registry.fuzzyMatch` answers "does this subsequence appear?"
// (great for a live palette filter), this module answers "what did the user most
// likely MEAN?" so the same catalog can absorb:
//
//   - typos              ("noets" -> notes, "calculater" -> calculator)
//   - partial words      ("term" -> terminal, "calc" -> calculator)
//   - reordered tokens   ("notes open" -> Open Notes)
//   - broken sentences   ("umm can you open notes please" -> Open Notes)
//
// It is deliberately PRECISE: noise ("asdfqwer") resolves to nothing. The scorer
// only fires on a strong anchor (an exact/prefix/near-exact token or whole-phrase
// hit), never on a soft pile of weak partials -- so it can drive an actual launch
// without surprising the user.
//
// Pure: no DOM / React / IPC / imports from the catalog itself, so main, the
// renderer, and tests all share ONE implementation. It is generic over any object
// with the shape below, which `DexCommand` structurally satisfies -- this avoids a
// circular import with `dexCommands.ts` (which consumes this module).

/** Minimal shape a resolvable command must expose. `DexCommand` satisfies it. */
export interface ResolvableCommand {
  id: string;
  label: string;
  /** CLI alias, e.g. "notes", "left". */
  terminal?: string;
  /** App id when the command launches an app. */
  appId?: string;
  /** Search keywords. */
  keywords?: string[];
  /** Natural-language phrases. */
  uki?: string[];
}

export interface CommandMatch<T extends ResolvableCommand = ResolvableCommand> {
  command: T;
  /** 0..1+, higher is better. >=0.95 is effectively exact. */
  score: number;
  /** Which signal won: 'alias' | 'phrase' | 'tokens'. */
  matchedOn: string;
}

export interface ResolvedBest<T extends ResolvableCommand = ResolvableCommand>
  extends CommandMatch<T> {
  /** Coarse band callers use to decide auto-run vs. "did you mean?". */
  confidence: 'exact' | 'high' | 'low';
}

export interface ResolveOptions {
  /** Max candidates returned (default 6). */
  limit?: number;
  /** Drop candidates below this score (default 0.45). */
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Word filtering
// ---------------------------------------------------------------------------
//
// Two reasons a word is dropped before token matching:
//   1. STOP words carry no command intent ("the", "please", "can you").
//   2. GENERIC command verbs ("open", "launch", "go") prefix EVERY app phrase
//      ("open Notes", "launch Notes", "go to Notes"), so letting them anchor a
//      token match would make every app tie on a bare "open". The distinctive
//      NOUN must be the anchor. Whole-phrase matching (below) still sees verbs,
//      so "open notes" as an exact phrase remains a perfect hit.
const NOISE_WORDS = new Set<string>([
  // stop words
  'the', 'a', 'an', 'to', 'of', 'on', 'in', 'at', 'is', 'it', 'this', 'that',
  'please', 'can', 'could', 'would', 'you', 'my', 'me', 'i', 'for', 'and',
  'then', 'just', 'now', 'up', 'let', 'lets', 'hey', 'ok', 'okay', 'um', 'umm',
  'plz', 'pls', 'some', 'thing', 'stuff',
  // generic command verbs (intent, not target)
  'open', 'launch', 'run', 'show', 'toggle', 'start', 'switch', 'go', 'goto',
]);

// ---------------------------------------------------------------------------
// String primitives
// ---------------------------------------------------------------------------

/** Lowercase, fold non-alphanumerics to spaces, collapse + trim. */
export function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalizeQuery(s);
  return n ? n.split(' ') : [];
}

/**
 * Optimal String Alignment distance (Damerau-Levenshtein restricted to adjacent
 * transpositions). Counts insert / delete / substitute / swap-of-neighbours as
 * cost 1 -- so "noets"->"notes" is distance 1, matching the single most common
 * real typo. Bails out early (returns max+1) once the row minimum exceeds `max`.
 */
export function osaDistance(a: string, b: string, max: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;

  let prev2: number[] = new Array(bl + 1).fill(0);
  let prev1: number[] = new Array(bl + 1);
  let curr: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev1[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev1[j] + 1, curr[j - 1] + 1, prev1[j - 1] + cost);
      if (
        i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const spare = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = spare;
  }
  return prev1[bl];
}

/**
 * Similarity of one query token to one command token: 1 exact, ~0.8 prefix,
 * ~0.7 one typo, ~0.5 two typos (long words only), 0 otherwise. Tokens shorter
 * than 3 chars only match exactly -- they are too collision-prone to fuzz.
 */
export function tokenSimilarity(qt: string, ct: string): number {
  if (qt === ct) return 1;
  const min = Math.min(qt.length, ct.length);
  // Prefix: a typed partial of a command word, or vice-versa.
  if (qt.length >= 2 && ct.startsWith(qt)) return 0.85;
  if (ct.length >= 2 && qt.startsWith(ct)) return 0.8;
  if (min >= 3) {
    const max = min >= 7 ? 2 : 1;
    const d = osaDistance(qt, ct, max);
    if (d <= max) return d === 1 ? 0.7 : 0.5;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Command scoring
// ---------------------------------------------------------------------------

/** Distinctive, noise-free token bag for a command (cached on a hidden field). */
function commandTokens(cmd: ResolvableCommand): Set<string> {
  const cache = cmd as ResolvableCommand & { __tokens?: Set<string> };
  if (cache.__tokens) return cache.__tokens;
  const bag = new Set<string>();
  const sources = [
    cmd.label,
    cmd.terminal ?? '',
    cmd.appId ?? '',
    ...(cmd.keywords ?? []),
    ...(cmd.uki ?? []),
  ].join(' ');
  for (const t of tokenize(sources)) {
    if (t.length >= 2 && !NOISE_WORDS.has(t)) bag.add(t);
  }
  try { Object.defineProperty(cmd, '__tokens', { value: bag, enumerable: false }); } catch { /* frozen */ }
  return bag;
}

/** Score a single command against a raw query. Highest of three signals wins. */
export function scoreCommand(cmd: ResolvableCommand, rawQuery: string): { score: number; matchedOn: string } {
  const q = normalizeQuery(rawQuery);
  if (!q) return { score: 0, matchedOn: '' };

  let best = 0;
  let matchedOn = '';
  const bump = (s: number, on: string) => { if (s > best) { best = s; matchedOn = on; } };

  const phrases = [...(cmd.uki ?? []), cmd.label].map((p) => p.toLowerCase());

  // 1) Exact CLI alias (single, unambiguous token) -- always allowed.
  const aliases = [cmd.terminal, cmd.appId, cmd.id, cmd.id.split('.').pop()]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());
  if (aliases.includes(q)) bump(1, 'alias');

  // 2) Exact whole-phrase equality -- always allowed.
  for (const p of phrases) {
    if (p && q === p) bump(1, 'phrase');
  }

  // The distinctive (noise- and verb-free) part of the query. If empty, the user
  // typed only filler / a generic verb ("open", "please") -- too ambiguous to
  // anchor anything, so the loose signals below stay off and we never guess.
  const qTokens = Array.from(new Set(tokenize(q).filter((t) => !NOISE_WORDS.has(t))));
  if (qTokens.length) {
    // 3) Looser phrase containment (partial phrase / phrase-plus-filler).
    for (const p of phrases) {
      if (!p || q === p) continue;
      if (p.length >= 4 && q.includes(p)) bump(0.78 + Math.min(0.15, p.length / 120), 'phrase');
      else if (q.length >= 4 && p.includes(q)) bump(0.62 + Math.min(0.12, q.length / 120), 'phrase');
    }

    // 4) Token coverage (typos + reordering + filler words).
    const cTokens = commandTokens(cmd);
    let sum = 0;
    let matched = 0;
    let strong = 0;
    for (const qt of qTokens) {
      let bestTok = 0;
      for (const ct of cTokens) {
        const m = tokenSimilarity(qt, ct);
        if (m > bestTok) bestTok = m;
        if (bestTok === 1) break;
      }
      if (bestTok > 0) { matched++; sum += bestTok; if (bestTok >= 0.7) strong++; }
    }
    const coverage = matched / qTokens.length;
    const avg = matched ? sum / matched : 0;
    // Fire only with a real anchor (one near-exact token) AND broad coverage,
    // so noise and "matches one filler word" never resolve.
    if (strong >= 1 && coverage >= 0.5) {
      bump(0.55 * coverage + 0.4 * avg, 'tokens');
    }
  }

  return { score: best, matchedOn };
}

// ---------------------------------------------------------------------------
// Public resolution API
// ---------------------------------------------------------------------------

/** Ranked candidates for a query (best first). Empty when nothing clears `minScore`. */
export function resolveCommands<T extends ResolvableCommand>(
  cmds: readonly T[],
  query: string,
  opts: ResolveOptions = {},
): CommandMatch<T>[] {
  const minScore = opts.minScore ?? 0.45;
  const limit = opts.limit ?? 6;
  const out: CommandMatch<T>[] = [];
  for (const c of cmds) {
    const { score, matchedOn } = scoreCommand(c, query);
    if (score >= minScore) out.push({ command: c, score, matchedOn });
  }
  // Best score first; on ties prefer the shorter (more specific) label.
  out.sort((a, b) => b.score - a.score || a.command.label.length - b.command.label.length);
  return out.slice(0, limit);
}

/** Single best resolution with a confidence band, or null. */
export function bestResolution<T extends ResolvableCommand>(
  cmds: readonly T[],
  query: string,
  opts: ResolveOptions = {},
): ResolvedBest<T> | null {
  const ranked = resolveCommands(cmds, query, { ...opts, limit: 1 });
  if (!ranked.length) return null;
  const top = ranked[0];
  const confidence: ResolvedBest['confidence'] =
    top.score >= 0.95 ? 'exact' : top.score >= 0.7 ? 'high' : 'low';
  return { ...top, confidence };
}
