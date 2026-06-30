// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { executeDexScript } from '../../src/renderer/DEXAPPLICATIONS/standalone/dexCode/runtime';

const run = (src: string) => executeDexScript(src);

describe('DexScript stdlib', () => {
  it('math: round-to-decimals, clamp, sum/avg, gcd/lcm', () => {
    const r = run([
      'print(math.round(3.14159, 2))',
      'print(math.clamp(15, 0, 10))',
      'print(math.sum(1, 2, 3, 4))',
      'print(math.avg(2, 4, 6))',
      'print(math.gcd(12, 18))',
      'print(math.lcm(4, 6))',
    ].join('\n'));
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['3.14', '10', '10', '4', '6', '12']);
  });

  it('str: helpers operate functionally', () => {
    const r = run([
      'print(str.upper("hi"))',
      'print(str.capitalize("dex"))',
      'print(str.repeat("ab", 3))',
      'print(str.join(["a", "b", "c"], "-"))',
      'print(str.reverse("abc"))',
    ].join('\n'));
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['HI', 'Dex', 'ababab', 'a-b-c', 'cba']);
  });

  it('list: range, map/filter/reduce, sum, unique', () => {
    const r = run([
      'print(list.range(1, 5))',
      'print(list.sum(list.range(1, 5)))',
      'print(list.map([1, 2, 3], fn(x) { return x * x }))',
      'print(list.filter([1, 2, 3, 4], fn(x) { return x % 2 == 0 }))',
      'print(list.unique([1, 1, 2, 3, 3]))',
    ].join('\n'));
    expect(r.error).toBeNull();
    expect(r.output[0]).toBe('[1, 2, 3, 4]');
    expect(r.output[1]).toBe('10');
    expect(r.output[2]).toBe('[1, 4, 9]');
    expect(r.output[3]).toBe('[2, 4]');
    expect(r.output[4]).toBe('[1, 2, 3]');
  });

  it('fmt: number/percent/bytes/fixed', () => {
    const r = run([
      'print(fmt.percent(0.25))',
      'print(fmt.fixed(3.14159, 2))',
      'print(fmt.bytes(2048))',
    ].join('\n'));
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['25%', '3.14', '2.0 KB']);
  });

  it('assert: passes silently, fails into the caught error line', () => {
    const ok = run('assert(1 + 1 == 2)\nprint("ok")');
    expect(ok.output).toEqual(['ok']);
    const bad = run('assert(false, "nope")');
    // The sandbox catches and prints thrown errors rather than aborting.
    expect(bad.output.join('\n')).toContain('nope');
  });

  it('still blocks dangerous globals (sandbox intact)', () => {
    const r = run('print(typeof window)');
    expect(r.error).toBeNull();
    expect(r.output).toEqual(['undefined']);
  });
});
