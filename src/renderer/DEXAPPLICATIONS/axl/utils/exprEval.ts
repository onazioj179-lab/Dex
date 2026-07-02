// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Parametric expression evaluator (pure, unit-tested, NO eval()).
 *
 * Powers AXL's parameter table: `depth = width * 2`, `r = sqrt(area / pi)`.
 * Supports + - * / % ^ (right-assoc), parentheses, unary minus, named
 * parameters, the constant `pi`, and the functions sqrt/abs/min/max/floor/
 * ceil/round. Unknown names, malformed syntax, and non-finite results throw
 * with a human-readable message the UI surfaces directly.
 */

export type ParamScope = Record<string, number>;

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: (a) => Math.sqrt(a),
  abs: (a) => Math.abs(a),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  round: (a) => Math.round(a),
};

const CONSTANTS: Record<string, number> = { pi: Math.PI };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c >= '0' && c <= '9' || c === '.') {
      let j = i;
      while (j < src.length && (src[j] >= '0' && src[j] <= '9' || src[j] === '.')) j++;
      const raw = src.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Bad number "${raw}"`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ kind: 'name', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/%^'.includes(c)) { tokens.push({ kind: 'op', value: c }); i++; continue; }
    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (c === ',') { tokens.push({ kind: 'comma' }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

/**
 * Recursive-descent parser/evaluator.
 *   expr    := term (('+'|'-') term)*
 *   term    := factor (('*'|'/'|'%') factor)*
 *   factor  := unary ('^' factor)?          // right-associative power
 *   unary   := '-' unary | atom
 *   atom    := number | name | name '(' args ')' | '(' expr ')'
 */
export function evaluateExpression(source: string, scope: ParamScope = {}): number {
  const src = source.trim();
  if (!src) throw new Error('Empty expression');
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expr(): number {
    let v = term();
    while (peek()?.kind === 'op' && (peek() as any).value.match(/[+-]/)) {
      const op = (next() as any).value;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  function term(): number {
    let v = factor();
    while (peek()?.kind === 'op' && '*/%'.includes((peek() as any).value)) {
      const op = (next() as any).value;
      const r = factor();
      if (op === '*') v = v * r;
      else if (op === '/') {
        if (r === 0) throw new Error('Division by zero');
        v = v / r;
      } else {
        if (r === 0) throw new Error('Modulo by zero');
        v = v % r;
      }
    }
    return v;
  }

  function factor(): number {
    const base = unary();
    if (peek()?.kind === 'op' && (peek() as any).value === '^') {
      next();
      return Math.pow(base, factor()); // right-assoc: 2^3^2 = 2^(3^2)
    }
    return base;
  }

  function unary(): number {
    if (peek()?.kind === 'op' && (peek() as any).value === '-') {
      next();
      return -unary();
    }
    if (peek()?.kind === 'op' && (peek() as any).value === '+') {
      next();
      return unary();
    }
    return atom();
  }

  function atom(): number {
    const t = next();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'lparen') {
      const v = expr();
      if (next()?.kind !== 'rparen') throw new Error('Missing ")"');
      return v;
    }
    if (t.kind === 'name') {
      const name = t.value;
      if (peek()?.kind === 'lparen') {
        // Function call
        next(); // consume '('
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function "${name}"`);
        const args: number[] = [];
        if (peek()?.kind !== 'rparen') {
          args.push(expr());
          while (peek()?.kind === 'comma') { next(); args.push(expr()); }
        }
        if (next()?.kind !== 'rparen') throw new Error('Missing ")" after arguments');
        return fn(...args);
      }
      if (name in scope) return scope[name];
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`Unknown parameter "${name}"`);
    }
    throw new Error('Unexpected token');
  }

  const result = expr();
  if (pos < tokens.length) throw new Error('Unexpected trailing input');
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number');
  return result;
}

/**
 * Resolve a parameter table where entries may reference each other by name.
 * Iterates until values settle (parameters are few; N passes bound the work)
 * and throws on circular references or unknown names.
 */
export function resolveParameters(
  params: { name: string; value: number; expression?: string }[],
): { name: string; value: number; expression?: string }[] {
  const scope: ParamScope = {};
  params.forEach(p => { scope[p.name] = p.value; });
  const out = params.map(p => ({ ...p }));

  // Fixed-point iteration: with N parameters, N passes resolve any acyclic
  // dependency chain. If values still change after N passes, it's circular.
  for (let pass = 0; pass <= out.length; pass++) {
    let changed = false;
    for (const p of out) {
      if (!p.expression) continue;
      const v = evaluateExpression(p.expression, scope);
      if (v !== p.value) {
        p.value = v;
        scope[p.name] = v;
        changed = true;
      }
    }
    if (!changed) return out;
  }
  throw new Error('Circular parameter reference');
}
