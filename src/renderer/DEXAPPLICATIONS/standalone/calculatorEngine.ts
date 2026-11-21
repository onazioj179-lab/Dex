// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Calculator engine: pure, DOM-free functions behind the Calculator app.
// Typed expressions go through a recursive-descent parser, never eval/Function.

export type BinaryOp = '+' | '-' | '*' | '/';

/** Longest number the keypad accepts (significant digits). */
export const MAX_ENTRY_DIGITS = 15;

export function applyOperator(a: number, op: BinaryOp, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
  }
}

/** Removes float noise such as 0.1 + 0.2 = 0.30000000000000004. */
export function roundResult(n: number): number {
  if (!Number.isFinite(n) || n === 0) return n;
  return Number.parseFloat(n.toPrecision(15));
}

/** Formats a computed value for the display. NaN / Infinity become "Error". */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const v = roundResult(n);
  if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, 'e');
  const str = v.toLocaleString('en-US', { maximumFractionDigits: 10 });
  return str.replace(/,/g, '').length > MAX_ENTRY_DIGITS + 2 ? v.toExponential(6).replace(/\.?0+e/, 'e') : str;
}

/** Groups the integer part of a raw entry while keeping a trailing "." or zeros. */
export function formatEntry(raw: string): string {
  if (raw === 'Error') return raw;
  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  const [int, frac] = body.split('.');
  const grouped = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (frac !== undefined ? '.' + frac : '');
}

/** Parses the display (with grouping commas) back to a number. */
export function parseDisplay(display: string): number {
  return Number.parseFloat(display.replace(/,/g, ''));
}

/** Appends a digit to a raw entry, honouring the digit cap. */
export function appendDigit(raw: string, digit: string): string {
  if (raw === '0' || raw === 'Error') return digit;
  if (raw === '-0') return '-' + digit;
  if (raw.replace(/[-.]/g, '').length >= MAX_ENTRY_DIGITS) return raw;
  return raw + digit;
}

/** Removes the last typed character; "-5" and "5" go to "0". */
export function backspaceEntry(raw: string): string {
  if (raw === 'Error') return '0';
  const next = raw.slice(0, -1);
  return next === '' || next === '-' ? '0' : next;
}

// ---------------------------------------------------------------------------
// Natural-language input: arithmetic ("sqrt(2)", "2+2*3"), percent ("20% of
// 80"), and unit conversions ("5 km in mi", "180 lb to kg", "100 c in f").
// ---------------------------------------------------------------------------

const UNIT_ALIAS: Record<string, string> = {
  kilometers: 'km', kilometres: 'km', kilometer: 'km', kilometre: 'km', kms: 'km',
  meters: 'm', metres: 'm', meter: 'm', metre: 'm', centimeters: 'cm', millimeters: 'mm',
  miles: 'mi', mile: 'mi', yards: 'yd', yard: 'yd', feet: 'ft', foot: 'ft', inches: 'in', inch: 'in',
  kilograms: 'kg', kilogram: 'kg', kilo: 'kg', kilos: 'kg', grams: 'g', gram: 'g',
  milligrams: 'mg', pounds: 'lb', pound: 'lb', lbs: 'lb', ounces: 'oz', ounce: 'oz', tonnes: 't', tonne: 't', tons: 't',
  bytes: 'b', byte: 'b', kilobytes: 'kb', megabytes: 'mb', gigabytes: 'gb', terabytes: 'tb',
  celsius: 'c', centigrade: 'c', fahrenheit: 'f', kelvin: 'k',
};
const UNIT_FACTOR: Record<string, { dim: string; f: number }> = {
  km: { dim: 'len', f: 1000 }, m: { dim: 'len', f: 1 }, cm: { dim: 'len', f: 0.01 }, mm: { dim: 'len', f: 0.001 },
  mi: { dim: 'len', f: 1609.344 }, yd: { dim: 'len', f: 0.9144 }, ft: { dim: 'len', f: 0.3048 }, in: { dim: 'len', f: 0.0254 },
  kg: { dim: 'mass', f: 1000 }, g: { dim: 'mass', f: 1 }, mg: { dim: 'mass', f: 0.001 }, lb: { dim: 'mass', f: 453.592 }, oz: { dim: 'mass', f: 28.3495 }, t: { dim: 'mass', f: 1e6 },
  b: { dim: 'data', f: 1 }, kb: { dim: 'data', f: 1024 }, mb: { dim: 'data', f: 1024 ** 2 }, gb: { dim: 'data', f: 1024 ** 3 }, tb: { dim: 'data', f: 1024 ** 4 },
};
function toCelsius(v: number, u: string): number | null {
  if (u === 'c') return v; if (u === 'f') return (v - 32) * 5 / 9; if (u === 'k') return v - 273.15; return null;
}
function fromCelsius(c: number, u: string): number | null {
  if (u === 'c') return c; if (u === 'f') return c * 9 / 5 + 32; if (u === 'k') return c + 273.15; return null;
}
export function convertUnits(amount: number, from: string, to: string): number | null {
  const f = UNIT_ALIAS[from] ?? from, t = UNIT_ALIAS[to] ?? to;
  if (['c', 'f', 'k'].includes(f) && ['c', 'f', 'k'].includes(t)) {
    const c = toCelsius(amount, f); return c === null ? null : fromCelsius(c, t);
  }
  const fu = UNIT_FACTOR[f], tu = UNIT_FACTOR[t];
  if (!fu || !tu || fu.dim !== tu.dim) return null;
  return (amount * fu.f) / tu.f;
}

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, log: Math.log10, log10: Math.log10,
  log2: Math.log2, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor,
  ceil: Math.ceil, exp: Math.exp, sign: Math.sign,
};
export const CALCULATOR_CONSTANTS = { pi: Math.PI, e: Math.E, c: 299792458, g: 9.80665 } as const;
const CONSTANTS: Record<string, number> = CALCULATOR_CONSTANTS;

/** Grammar (lowest to highest precedence):
 *    expr   := term (('+' | '-') term)*
 *    term   := unary (('*' | '/') unary)*
 *    unary  := ('+' | '-') unary | power
 *    power  := postfix (('^' | '**') unary)?        right-associative
 *    postfix:= atom '%'*                            "50%" = 0.5
 *    atom   := number | constant | fn '(' expr ')' | '(' expr ')' */
export function evaluateArithmetic(input: string): number | null {
  const src = input.toLowerCase().replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/');
  let i = 0;
  const peek = (s: string) => src.startsWith(s, i);
  const fail = (): never => { throw new Error('parse'); };

  function atom(): number {
    if (peek('(')) {
      i++;
      const v = expr();
      if (!peek(')')) fail();
      i++;
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(src.slice(i));
    if (num) { i += num[0].length; return Number.parseFloat(num[0]); }
    const word = /^[a-z][a-z0-9]*/.exec(src.slice(i));
    if (word) {
      const name = word[0];
      i += name.length;
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
        if (!peek('(')) fail();
        i++;
        const arg = expr();
        if (!peek(')')) fail();
        i++;
        return FUNCTIONS[name](arg);
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return CONSTANTS[name];
    }
    return fail();
  }
  function postfix(): number {
    let v = atom();
    while (peek('%')) { i++; v /= 100; }
    return v;
  }
  function power(): number {
    const base = postfix();
    if (peek('**')) { i += 2; return Math.pow(base, unary()); }
    if (peek('^')) { i++; return Math.pow(base, unary()); }
    return base;
  }
  function unary(): number {
    if (peek('-')) { i++; return -unary(); }
    if (peek('+')) { i++; return unary(); }
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (peek('*') && !peek('**')) { i++; v *= unary(); }
      else if (peek('/')) { i++; v /= unary(); }
      else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      if (peek('+')) { i++; v += term(); }
      else if (peek('-')) { i++; v -= term(); }
      else return v;
    }
  }

  if (!src) return null;
  try {
    const v = expr();
    if (i !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function evaluateNatural(raw: string): { value: number; expr: string } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  // Unit conversion: "<n> <unit> in|to <unit>"
  const conv = s.match(/^([\d.]+)\s*([a-z°]+)\s*(?:in|to|->)\s*([a-z°]+)$/);
  if (conv) {
    const r = convertUnits(parseFloat(conv[1]), conv[2], conv[3]);
    if (r !== null && isFinite(r)) return { value: r, expr: raw.trim() };
  }
  // "<n>% of <n>"
  const pct = s.match(/^([\d.]+)\s*%\s*of\s*([\d.]+)$/);
  if (pct) return { value: (parseFloat(pct[1]) / 100) * parseFloat(pct[2]), expr: raw.trim() };
  const value = evaluateArithmetic(s);
  return value === null ? null : { value, expr: raw.trim() };
}
