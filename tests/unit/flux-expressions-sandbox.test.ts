// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import { compileExpression, validateExpression, checkExpressionTokens, evaluateExpression } from '../../src/renderer/DEXAPPLICATIONS/flux/expressions';

const ctx = { time: 1, value: 10, index: 0, frame: 30, fps: 30 };
const g = globalThis as Record<string, unknown>;

afterEach(() => { delete g.__fluxPwned; });

describe('FLUX expressions: allowlist sandbox', () => {
  // The first three passed the old keyword blocklist (no blocked word appears,
  // even inside the string) and ran: they would set a global marker. The rest
  // are other ways to reach properties or run statements; all are refused.
  const escapes = [
    "Math.max['con'+'structor']('glo'+'balThis.__fluxPwned=1')()",
    "wiggle['con'+'structor']('glo'+'balThis.__fluxPwned=1')()",
    "(Math.max)['con'+'structor']('glo'+'balThis.__fluxPwned=1')()",
    'Math.max.call',
    "value['toString']",
    '`${1}`',
    'Math["PI"]',
    '[1][0]',
    'x = 1',
    '(() => 1)()',
    'value; 1',
    'Math.max\\u0028',
  ];

  it.each(escapes)('refuses %s before anything runs', (src) => {
    expect(checkExpressionTokens(src)).not.toBeNull();
    expect(validateExpression(src)).not.toBeNull();
    const c = compileExpression(src);
    expect(c.error).not.toBeNull();
    expect(c.eval(ctx)).toBe(ctx.value); // degrades to the static value
    expect(g.__fluxPwned).toBeUndefined();
  });

  it('keeps every documented form working', () => {
    expect(evaluateExpression('time + value', ctx)).toBe(11);
    expect(evaluateExpression('Math.sin(0) + Math.PI * 0 + Math . max(1, 2)', ctx)).toBe(2);
    expect(evaluateExpression('value > 5 ? clamp(value, 0, 4) : 0', ctx)).toBe(4);
    expect(evaluateExpression('lerp(0, 10, 0.5) + smoothstep(0, 1, 1) + -.5 + 1e1', ctx)).toBe(15.5);
    expect(compileExpression('[value, value * 2]').eval(ctx)).toEqual([10, 20]);
    expect(Number.isFinite(evaluateExpression('value + wiggle(2, 30)', ctx))).toBe(true);
    expect(Number.isFinite(evaluateExpression('noise(time) + random(index)', ctx))).toBe(true);
    expect(validateExpression('frame / fps ** 2 % 3')).toBeNull();
  });

  it('names the token it refused', () => {
    expect(checkExpressionTokens('valu + 1')).toMatch('"valu" is not allowed');
    expect(checkExpressionTokens('Math.random2()')).toMatch('"Math.random2" is not allowed');
    expect(checkExpressionTokens("'a'")).toMatch(`"'" is not allowed`);
  });
});
