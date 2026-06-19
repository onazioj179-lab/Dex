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
    pi: Math.PI, e: Math.E,
    sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow,
    round: Math.round, floor: Math.floor, ceil: Math.ceil,
    min: Math.min, max: Math.max,
    random: (min = 0, max = 1) => {
      if (max === 1 && min === 0) return Math.random();
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    log: Math.log, log2: Math.log2, log10: Math.log10,
  };

  const dexTime = {
    now: () => Date.now(),
    date: () => new Date().toLocaleDateString(),
    time: () => new Date().toLocaleTimeString(),
    year: () => new Date().getFullYear(),
    month: () => new Date().getMonth() + 1,
    day: () => new Date().getDate(),
  };

  const dexJson = {
    encode: (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } },
    decode: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
    pretty: (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } },
  };

  const dexSys = { version: '1.0', platform: 'DEX', env: 'DexCode' };

  const typeFn = (v: unknown) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'list';
    return typeof v;
  };

  try {
    const jsCode = transpileDexScript(source);
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
      'print', 'math', 'time', 'json', 'sys', 'type',
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

    sandbox(printFn, dexMath, dexTime, dexJson, dexSys, typeFn);

    return { output, error: null, duration: performance.now() - startTime };
  } catch (err: unknown) {
    return {
      output,
      error: err instanceof Error ? err.message : String(err),
      duration: performance.now() - startTime,
    };
  }
}
