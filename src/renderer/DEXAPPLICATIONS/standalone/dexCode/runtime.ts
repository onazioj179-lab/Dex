// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DexScript transpiler + sandboxed executor.
// Translates DexScript syntax sugar to JS, then runs it inside a Function-based
// sandbox that blocks dangerous globals.

export function transpileDexScript(source: string): string {
  let code = source;

  // fn name(args) { → function name(args) {
  code = code.replace(/\bfn\s+(\w+)\s*\(([^)]*)\)\s*\{/g, 'function $1($2) {');

  // Anonymous fn(args) { → function(args) {  — inline lambdas for list.map etc.
  // Runs AFTER the named form so it only catches the nameless case. (Plain JS
  // arrow functions `x => ...` already pass through untouched.)
  code = code.replace(/\bfn\s*\(([^)]*)\)\s*\{/g, 'function($1) {');

  // for x in start..end {
  code = code.replace(
    /\bfor\s+(\w+)\s+in\s+(.+?)\.\.(.+?)\s*\{/g,
    'for (let $1 = ($2); $1 <= ($3); $1++) {'
  );

  // for x in list {
  code = code.replace(
    /\bfor\s+(\w+)\s+in\s+(.+?)\s*\{/g,
    'for (const $1 of $2) {'
  );

  code = code.replace(/\belif\b/g, 'else if');

  code = code.replace(
    /\bif\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `if (${cond.trim()}) {`
  );
  code = code.replace(
    /\belse\s+if\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `else if (${cond.trim()}) {`
  );
  code = code.replace(
    /\bwhile\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `while (${cond.trim()}) {`
  );

  code = code.replace(/\bcatch\s+(\w+)\s*\{/g, 'catch($1) {');
  code = code.replace(/\.len\(\)/g, '.length');

  return code;
}

export interface DexScriptResult {
  output: string[];
  error: string | null;
  duration: number;
}

export function executeDexScript(source: string): DexScriptResult {
  const output: string[] = [];
  const startTime = performance.now();

  const dexMath = {
    pi: Math.PI, e: Math.E, tau: Math.PI * 2,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, pow: Math.pow, hypot: Math.hypot,
    round: (n: number, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; },
    floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc, sign: Math.sign,
    min: Math.min, max: Math.max,
    clamp: (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n)),
    sum: (...xs: number[]) => xs.flat().reduce((a, b) => a + Number(b), 0),
    avg: (...xs: number[]) => { const f = xs.flat(); return f.length ? f.reduce((a, b) => a + Number(b), 0) / f.length : 0; },
    gcd: (a: number, b: number) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; },
    lcm: (a: number, b: number) => { if (!a || !b) return 0; const g = (x: number, y: number): number => y ? g(y, x % y) : x; return Math.abs(a * b) / g(Math.abs(a), Math.abs(b)); },
    random: (min = 0, max = 1) => {
      if (max === 1 && min === 0) return Math.random();
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    log: Math.log, log2: Math.log2, log10: Math.log10,
    deg: (rad: number) => rad * 180 / Math.PI,
    rad: (deg: number) => deg * Math.PI / 180,
  };

  const dexTime = {
    now: () => Date.now(),
    date: () => new Date().toLocaleDateString(),
    time: () => new Date().toLocaleTimeString(),
    year: () => new Date().getFullYear(),
    month: () => new Date().getMonth() + 1,
    day: () => new Date().getDate(),
    weekday: () => new Date().toLocaleDateString(undefined, { weekday: 'long' }),
    iso: () => new Date().toISOString(),
  };

  const dexJson = {
    encode: (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } },
    decode: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
    pretty: (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } },
  };

  // str.* — string helpers in functional form (work on any value, coerced to
  // string). Complements the dotted-method proxy below.
  const dexStr = {
    upper: (s: unknown) => String(s).toUpperCase(),
    lower: (s: unknown) => String(s).toLowerCase(),
    trim: (s: unknown) => String(s).trim(),
    len: (s: unknown) => String(s).length,
    contains: (s: unknown, sub: string) => String(s).includes(sub),
    starts: (s: unknown, sub: string) => String(s).startsWith(sub),
    ends: (s: unknown, sub: string) => String(s).endsWith(sub),
    split: (s: unknown, sep: string) => String(s).split(sep),
    join: (list: unknown[], sep = '') => (Array.isArray(list) ? list.join(sep) : String(list)),
    replace: (s: unknown, a: string, b: string) => String(s).split(a).join(b),
    repeat: (s: unknown, n: number) => String(s).repeat(Math.max(0, n | 0)),
    reverse: (s: unknown) => String(s).split('').reverse().join(''),
    padLeft: (s: unknown, n: number, c = ' ') => String(s).padStart(n, c),
    padRight: (s: unknown, n: number, c = ' ') => String(s).padEnd(n, c),
    capitalize: (s: unknown) => { const x = String(s); return x ? x[0].toUpperCase() + x.slice(1) : x; },
  };

  // list.* — array helpers. Non-mutating except push/pop, mirroring DexScript's
  // "looks like Python" feel.
  const dexList = {
    range: (start: number, end?: number, step = 1) => {
      // range(n) -> 0..n-1 ; range(a, b) -> a..b-1 ; range(a, b, step)
      let lo = start, hi = end;
      if (end === undefined) { lo = 0; hi = start; }
      const out: number[] = [];
      if (step === 0) return out;
      if (step > 0) for (let i = lo; i < (hi as number); i += step) out.push(i);
      else for (let i = lo; i > (hi as number); i += step) out.push(i);
      return out;
    },
    map: (a: unknown[], f: (v: unknown, i: number) => unknown) => a.map(f),
    filter: (a: unknown[], f: (v: unknown, i: number) => boolean) => a.filter(f),
    reduce: (a: unknown[], f: (acc: unknown, v: unknown) => unknown, init: unknown) => a.reduce(f, init),
    each: (a: unknown[], f: (v: unknown, i: number) => void) => { a.forEach(f); return a; },
    sum: (a: number[]) => a.reduce((x, y) => x + Number(y), 0),
    avg: (a: number[]) => (a.length ? a.reduce((x, y) => x + Number(y), 0) / a.length : 0),
    min: (a: number[]) => Math.min(...a),
    max: (a: number[]) => Math.max(...a),
    sort: (a: unknown[], f?: (x: any, y: any) => number) => [...a].sort(f),
    reverse: (a: unknown[]) => [...a].reverse(),
    unique: (a: unknown[]) => [...new Set(a)],
    first: (a: unknown[]) => a[0],
    last: (a: unknown[]) => a[a.length - 1],
    len: (a: unknown[]) => a.length,
    contains: (a: unknown[], v: unknown) => a.includes(v),
    indexOf: (a: unknown[], v: unknown) => a.indexOf(v),
    slice: (a: unknown[], s?: number, e?: number) => a.slice(s, e),
    flatten: (a: unknown[]) => a.flat(Infinity),
    zip: (a: unknown[], b: unknown[]) => a.map((x, i) => [x, b[i]]),
    push: (a: unknown[], v: unknown) => { a.push(v); return a; },
    pop: (a: unknown[]) => a.pop(),
  };

  // fmt.* — human-facing formatting.
  const dexFmt = {
    number: (n: number) => Number(n).toLocaleString(),
    currency: (n: number, cur = 'USD') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n); } catch { return String(n); } },
    percent: (n: number, d = 0) => (n * 100).toFixed(d) + '%',
    fixed: (n: number, d = 2) => Number(n).toFixed(d),
    bytes: (n: number) => {
      const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = Math.abs(n);
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      return `${(n < 0 ? -v : v).toFixed(i ? 1 : 0)} ${u[i]}`;
    },
  };

  const dexSys = { version: '1.1', platform: 'DEX', env: 'DexCode' };

  const typeFn = (v: unknown) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'list';
    return typeof v;
  };

  // Validate assumptions inside a script; throws (caught + printed) on failure.
  const assertFn = (cond: unknown, msg = 'Assertion failed') => {
    if (!cond) throw new Error(String(msg));
    return true;
  };

  try {
    const jsCode = transpileDexScript(source);

    // Sandbox escape guard. The runtime shadows window/document/fetch/Function
    // to undefined, but a few constructs still reach the real global scope and
    // cannot be lexically shadowed in strict mode:
    //   - eval(...)                 : runs arbitrary code in the caller's scope
    //   - import(...)               : dynamic import bypasses the shadowing
    //   - ({}).constructor.constructor : rebuilds Function from a literal
    //   - __proto__ / globalThis    : prototype/global reach-through
    //   - WebAssembly / importScripts: alternate code-loading paths
    // None of these are emitted by transpileDexScript for legitimate scripts, so
    // rejecting the source outright is safe and keeps the sandbox honest.
    const ESCAPE_HATCHES = /\b(eval|import|constructor|__proto__|globalThis|WebAssembly|importScripts|require)\b/;
    const hatch = ESCAPE_HATCHES.exec(jsCode);
    if (hatch) {
      return {
        output,
        error: `Blocked: '${hatch[1]}' is not permitted in DexScript (sandbox protection).`,
        duration: performance.now() - startTime,
      };
    }

    const maxOutputLines = 1000;
    let lineCount = 0;

    const printFn = (...args: unknown[]) => {
      if (lineCount >= maxOutputLines) {
        throw new Error('Output limit reached (1000 lines). Check for infinite loops.');
      }
      lineCount++;
      output.push(args.map((a) => {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (Array.isArray(a)) return '[' + a.join(', ') + ']';
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' '));
    };

    // String proxy: lets DexScript call .upper(), .len() etc on plain strings.
    // Currently unused (transpiler maps .len() → .length already) but kept for
    // symmetry with future stdlib expansion.
    const wrapValue = `
      const __wrapStr = (s) => {
        if (typeof s !== 'string') return s;
        return new Proxy(new String(s), {
          get(_t, prop) {
            if (prop === 'upper') return () => s.toUpperCase();
            if (prop === 'lower') return () => s.toLowerCase();
            if (prop === 'len') return () => s.length;
            if (prop === 'contains') return (sub) => s.includes(sub);
            if (prop === 'starts') return (sub) => s.startsWith(sub);
            if (prop === 'ends') return (sub) => s.endsWith(sub);
            if (prop === 'trim') return () => s.trim();
            if (prop === 'split') return (sep) => s.split(sep);
            if (prop === 'replace') return (a, b) => s.replace(a, b);
            if (prop === 'slice') return (a, b) => s.slice(a, b);
            if (prop === 'repeat') return (n) => s.repeat(n);
            if (prop === Symbol.toPrimitive) return () => s;
            if (prop === 'toString' || prop === 'valueOf') return () => s;
            return s[prop];
          }
        });
      };
    `;

    const sandbox = new Function(
      'print', 'math', 'time', 'json', 'sys', 'type', 'str', 'list', 'fmt', 'assert',
      `"use strict";
      ${wrapValue}
      const window = undefined;
      const document = undefined;
      const fetch = undefined;
      const XMLHttpRequest = undefined;
      // NOTE: 'eval' cannot be lexically shadowed in strict mode (SyntaxError),
      // so it is intentionally not redeclared here. Function/window/etc. below
      // are still shadowed to block the common escape hatches.
      const Function = undefined;
      const importScripts = undefined;
      const localStorage = undefined;
      const sessionStorage = undefined;
      try {
        ${jsCode}
      } catch(e) {
        print("Error: " + e.message);
      }`
    );

    sandbox(printFn, dexMath, dexTime, dexJson, dexSys, typeFn, dexStr, dexList, dexFmt, assertFn);

    return { output, error: null, duration: performance.now() - startTime };
  } catch (err: unknown) {
    return {
      output,
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - startTime,
    };
  }
}
