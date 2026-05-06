// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SafeMath - AV-safe math expression evaluator
 * Replaces new Function() dynamic code execution which triggers AV heuristics
 */

type Token = { type: 'number'; value: number } | { type: 'op'; value: string } | { type: 'paren'; value: string };

const OPERATORS: Record<string, { prec: number; assoc: 'L' | 'R'; fn: (a: number, b: number) => number }> = {
  '+': { prec: 1, assoc: 'L', fn: (a, b) => a + b },
  '-': { prec: 1, assoc: 'L', fn: (a, b) => a - b },
  '*': { prec: 2, assoc: 'L', fn: (a, b) => a * b },
  '/': { prec: 2, assoc: 'L', fn: (a, b) => b === 0 ? NaN : a / b },
  '%': { prec: 2, assoc: 'L', fn: (a, b) => a % b },
  '^': { prec: 3, assoc: 'R', fn: (a, b) => Math.pow(a, b) },
};

/**
 * Tokenize math expression
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = expr.replace(/\s+/g, '');

  while (i < src.length) {
    const c = src[i];

    // Number (including decimals)
    if (/\d/.test(c) || (c === '.' && i + 1 < src.length && /\d/.test(src[i + 1]))) {
      let num = '';
      while (i < src.length && (/\d/.test(src[i]) || src[i] === '.')) {
        num += src[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // Operators
    if (c in OPERATORS) {
      // Handle unary minus
      if (c === '-' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'op' || (tokens[tokens.length - 1].type === 'paren' && tokens[tokens.length - 1].value === '('))) {
        i++;
        let num = '';
        while (i < src.length && (/\d/.test(src[i]) || src[i] === '.')) {
          num += src[i++];
        }
        if (num) {
          tokens.push({ type: 'number', value: -parseFloat(num) });
        } else {
          return []; // Invalid
        }
        continue;
      }
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }

    // Parentheses
    if (c === '(' || c === ')') {
      tokens.push({ type: 'paren', value: c });
      i++;
      continue;
    }

    // Unknown character - invalid
    return [];
  }

  return tokens;
}

/**
 * Convert to RPN using Shunting-yard algorithm
 */
function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const opStack: Token[] = [];

  for (const tok of tokens) {
    if (tok.type === 'number') {
      output.push(tok);
    } else if (tok.type === 'op') {
      const o1 = OPERATORS[tok.value];
      while (opStack.length > 0) {
        const top = opStack[opStack.length - 1];
        if (top.type !== 'op') break;
        const o2 = OPERATORS[top.value];
        if ((o1.assoc === 'L' && o1.prec <= o2.prec) || (o1.assoc === 'R' && o1.prec < o2.prec)) {
          output.push(opStack.pop()!);
        } else {
          break;
        }
      }
      opStack.push(tok);
    } else if (tok.type === 'paren') {
      if (tok.value === '(') {
        opStack.push(tok);
      } else {
        while (opStack.length > 0 && !(opStack[opStack.length - 1].type === 'paren' && opStack[opStack.length - 1].value === '(')) {
          output.push(opStack.pop()!);
        }
        if (opStack.length === 0) return []; // Mismatched parens
        opStack.pop(); // Remove '('
      }
    }
  }

  while (opStack.length > 0) {
    const tok = opStack.pop()!;
    if (tok.type === 'paren') return []; // Mismatched parens
    output.push(tok);
  }

  return output;
}

/**
 * Evaluate RPN expression
 */
function evalRPN(rpn: Token[]): number | null {
  if (rpn.length === 0) return null;

  const stack: number[] = [];

  for (const tok of rpn) {
    if (tok.type === 'number') {
      stack.push(tok.value);
    } else if (tok.type === 'op') {
      if (stack.length < 2) return null;
      const b = stack.pop()!;
      const a = stack.pop()!;
      const result = OPERATORS[tok.value].fn(a, b);
      if (!isFinite(result)) return null;
      stack.push(result);
    }
  }

  return stack.length === 1 ? stack[0] : null;
}

/**
 * Safe math expression evaluator
 * Returns null if expression is invalid
 * @example safeMath("2 + 3 * 4") => 14
 * @example safeMath("(1 + 2) ^ 3") => 27
 */
export function safeMath(expr: string): number | null {
  if (!expr || typeof expr !== 'string') return null;

  // Only allow safe characters
  if (!/^[\d\s+\-*/().^%]+$/.test(expr)) return null;

  // Must contain at least one digit
  if (!/\d/.test(expr)) return null;

  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) return null;

    const rpn = toRPN(tokens);
    if (rpn.length === 0) return null;

    return evalRPN(rpn);
  } catch {
    return null;
  }
}

/**
 * Format result for display
 */
export function formatResult(value: number): string {
  return String(Math.round(value * 1e10) / 1e10);
}
