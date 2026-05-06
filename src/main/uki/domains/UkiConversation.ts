// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI Conversation Domain
// Handles greetings, time, date, math, jokes, help, general chat
// ===========================================================================

import type { UkiIntent, UkiResult } from '../UkiEngine';
import { getResponse } from '../dialog/UkiResponses';

// ---------------------------------------------------------------------------
// Safe math evaluator (recursive descent -- no eval/Function)
// Supports: + - * / % ^ () and numeric literals
// ---------------------------------------------------------------------------
function safeEvaluate(input: string): number | null {
  const sanitized = input.replace(/[^0-9+\-*/().%^ ]/g, '').trim();
  if (!sanitized || sanitized.length > 200) return null;
  let pos = 0;
  const ch = () => sanitized[pos] || '';
  const skip = () => { while (ch() === ' ') pos++; };

  function parseExpr(): number {
    let left = parseTerm();
    skip();
    while (ch() === '+' || ch() === '-') {
      const op = ch(); pos++;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      skip();
    }
    return left;
  }
  function parseTerm(): number {
    let left = parsePower();
    skip();
    while (ch() === '*' || ch() === '/' || ch() === '%') {
      const op = ch(); pos++;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') { if (right === 0) throw new Error('div0'); left /= right; }
      else left %= right;
      skip();
    }
    return left;
  }
  function parsePower(): number {
    let base = parseUnary();
    skip();
    if (ch() === '^') { pos++; base = Math.pow(base, parsePower()); }
    return base;
  }
  function parseUnary(): number {
    skip();
    if (ch() === '-') { pos++; return -parseAtom(); }
    if (ch() === '+') { pos++; }
    return parseAtom();
  }
  function parseAtom(): number {
    skip();
    if (ch() === '(') {
      pos++;
      const val = parseExpr();
      skip();
      if (ch() === ')') pos++;
      return val;
    }
    const start = pos;
    while (/[0-9.]/.test(ch())) pos++;
    const numStr = sanitized.slice(start, pos);
    if (!numStr) throw new Error('unexpected');
    return parseFloat(numStr);
  }
  const result = parseExpr();
  return result;
}

export function handle(intent: UkiIntent): UkiResult {
  switch (intent.action) {
    case 'greeting':
      return { success: true, response: getResponse('greetings') };

    case 'thanks':
      return { success: true, response: getResponse('thanks') };

    case 'farewell':
      return { success: true, response: getResponse('farewell') };

    case 'identity':
      return { success: true, response: getResponse('identity') };

    case 'how-are-you':
      return { success: true, response: getResponse('howAreYou') };

    case 'joke':
      return { success: true, response: getResponse('jokes') };

    case 'help':
      return { success: true, response: getResponse('help') };

    case 'time': {
      const now = new Date();
      const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return { success: true, response: `It's ${timeStr}.` };
    }

    case 'date': {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return { success: true, response: `Today is ${dateStr}.` };
    }

    case 'calculate': {
      const expr = (intent.entities.expression as string) || '';
      if (!expr) return { success: false, response: 'What should I calculate?' };
      try {
        const result = safeEvaluate(expr);
        if (result === null || !isFinite(result)) {
          return { success: false, response: 'That calculation didn\'t produce a valid result.' };
        }
        return { success: true, response: `${expr} = ${result}` };
      } catch {
        return { success: false, response: `I couldn't calculate "${expr}". Try a simpler expression.` };
      }
    }

    case 'unknown':
    default:
      return { success: true, response: getResponse('unknown') };
  }
}
