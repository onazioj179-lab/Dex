// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Calculator + unit-conversion search provider (SCH-041, SCH-050) for the
 * unified SearchOrchestrator. Typing "12 * (3 + 4)" or "5 km to mi" in any
 * search surface returns an instant inline result. Arithmetic is evaluated with
 * a hand-rolled shunting-yard parser — never `eval` / `Function`.
 *
 * Pure: no DOM, no IO.
 */

import type { SearchProvider, SearchQuery, SearchResult } from '../../shared/search/SearchOrchestrator';

// ---------------------------------------------------------------------------
// Safe arithmetic
// ---------------------------------------------------------------------------

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'paren'; v: '(' | ')' };

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
const RIGHT_ASSOC = new Set(['^']);

function tokenize(input: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, '');
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) return null;
      toks.push({ t: 'num', v: num });
      i = j;
    } else if ('+-*/%^'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
    } else if (c === '(' || c === ')') {
      toks.push({ t: 'paren', v: c });
      i++;
    } else {
      return null; // unsupported character → not a calc query
    }
  }
  return toks;
}

/** Evaluate a simple arithmetic expression, or null if it isn't one. */
export function evaluateExpression(input: string): number | null {
  const toks = tokenize(input);
  if (!toks || toks.length === 0) return null;

  // Shunting-yard → RPN, handling unary minus.
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null;
  for (const tok of toks) {
    if (tok.t === 'num') {
      out.push(tok);
    } else if (tok.t === 'op') {
      // Unary minus/plus: at start, or after another op or '('.
      const unary = (tok.v === '-' || tok.v === '+') &&
        (prev === null || (prev.t === 'op') || (prev.t === 'paren' && prev.v === '('));
      if (unary) {
        out.push({ t: 'num', v: 0 }); // 0 - x / 0 + x
      }
      while (
        ops.length &&
        ops[ops.length - 1].t === 'op' &&
        ((RIGHT_ASSOC.has(tok.v) ? PREC[(ops[ops.length - 1] as { v: string }).v] > PREC[tok.v]
                                 : PREC[(ops[ops.length - 1] as { v: string }).v] >= PREC[tok.v]))
      ) {
        out.push(ops.pop()!);
      }
      ops.push(tok);
    } else if (tok.v === '(') {
      ops.push(tok);
    } else {
      // ')'
      let found = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.t === 'paren' && top.v === '(') { found = true; break; }
        out.push(top);
      }
      if (!found) return null; // mismatched parens
    }
    prev = tok;
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === 'paren') return null; // mismatched parens
    out.push(top);
  }

  // Evaluate RPN.
  const stack: number[] = [];
  for (const tok of out) {
    if (tok.t === 'num') { stack.push(tok.v); continue; }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;
    let r: number;
    switch (tok.v) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/': r = a / b; break;
      case '%': r = a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: return null;
    }
    stack.push(r);
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
  return stack[0];
}

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------

// Linear units expressed in a canonical base per dimension.
const LINEAR_UNITS: Record<string, { dim: string; factor: number; label: string }> = {
  // length (base: metre)
  mm: { dim: 'len', factor: 0.001, label: 'mm' },
  cm: { dim: 'len', factor: 0.01, label: 'cm' },
  m: { dim: 'len', factor: 1, label: 'm' },
  km: { dim: 'len', factor: 1000, label: 'km' },
  in: { dim: 'len', factor: 0.0254, label: 'in' },
  ft: { dim: 'len', factor: 0.3048, label: 'ft' },
  mi: { dim: 'len', factor: 1609.344, label: 'mi' },
  // mass (base: gram)
  mg: { dim: 'mass', factor: 0.001, label: 'mg' },
  g: { dim: 'mass', factor: 1, label: 'g' },
  kg: { dim: 'mass', factor: 1000, label: 'kg' },
  lb: { dim: 'mass', factor: 453.592, label: 'lb' },
  oz: { dim: 'mass', factor: 28.3495, label: 'oz' },
};

export function convertUnit(value: number, from: string, to: string): number | null {
  const f = from.toLowerCase();
  const t = to.toLowerCase();
  // Temperature is affine, handled separately.
  if (['c', 'f', 'k'].includes(f) && ['c', 'f', 'k'].includes(t)) {
    let celsius: number;
    if (f === 'c') celsius = value;
    else if (f === 'f') celsius = (value - 32) * (5 / 9);
    else celsius = value - 273.15;
    if (t === 'c') return celsius;
    if (t === 'f') return celsius * (9 / 5) + 32;
    return celsius + 273.15;
  }
  const a = LINEAR_UNITS[f];
  const b = LINEAR_UNITS[t];
  if (!a || !b || a.dim !== b.dim) return null;
  return (value * a.factor) / b.factor;
}

const CONVERSION_RE = /^(-?\d+(?:\.\d+)?)\s*([a-z°]+)\s*(?:to|in)\s*([a-z°]+)$/i;

function tidy(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** A SearchProvider that answers math + unit-conversion queries inline. */
export function createCalcProvider(): SearchProvider {
  return {
    id: 'calc',
    kinds: ['calculator', 'unit'],
    weight: 1.3, // a direct answer should outrank fuzzy matches
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const q = query.text.trim();
      if (!q) return [];

      // Unit conversion first ("5 km to mi").
      const m = q.match(CONVERSION_RE);
      if (m) {
        const value = Number(m[1]);
        const from = m[2].replace('°', '');
        const to = m[3].replace('°', '');
        const converted = convertUnit(value, from, to);
        if (converted !== null) {
          return [{
            id: `unit:${q}`,
            title: `${tidy(converted)} ${to}`,
            subtitle: `${value} ${from} =`,
            kind: 'unit',
            source: 'calc',
            rawScore: 100,
            score: 0,
            payload: { value: converted, unit: to },
            iconHint: 'calculator',
            producedAt: Date.now(),
          }];
        }
      }

      // Arithmetic ("12 * (3 + 4)"). Require an operator so plain numbers/words
      // don't masquerade as calculations.
      if (/[+\-*/%^]/.test(q)) {
        const result = evaluateExpression(q);
        if (result !== null) {
          return [{
            id: `calc:${q}`,
            title: tidy(result),
            subtitle: `${q} =`,
            kind: 'calculator',
            source: 'calc',
            rawScore: 100,
            score: 0,
            payload: { value: result },
            iconHint: 'calculator',
            producedAt: Date.now(),
          }];
        }
      }

      return [];
    },
  };
}
