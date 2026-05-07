// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX Platform - test
// =============================================================================
// Tests for v3.8.9 wave F polish/perf primitives: visibleRange windowing
// helpers and the LazyAppLoader wrapper.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import {
  computeFixedRange, computeVariableRange, scrollToIndex,
} from '../../src/shared/perf/visibleRange';
import { withLazyApp, LazyAppLoadFailure } from '../../src/renderer/components/perf/LazyAppLoader';

// ---------------- computeFixedRange ----------------

describe('computeFixedRange', () => {
  it('handles empty list', () => {
    const r = computeFixedRange({ itemCount: 0, itemHeight: 30, viewportHeight: 300, scrollTop: 0 });
    expect(r).toEqual({ startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 });
  });
  it('computes window with no overscan', () => {
    const r = computeFixedRange({ itemCount: 100, itemHeight: 30, viewportHeight: 300, scrollTop: 0, overscan: 0 });
    expect(r.startIndex).toBe(0);
    expect(r.endIndex).toBe(10); // floor((0+300)/30) = 10
    expect(r.offsetTop).toBe(0);
    expect(r.totalHeight).toBe(3000);
  });
  it('applies overscan', () => {
    const r = computeFixedRange({ itemCount: 100, itemHeight: 30, viewportHeight: 300, scrollTop: 600, overscan: 2 });
    // first visible = 20, last visible = floor((600+300)/30) = 30
    expect(r.startIndex).toBe(18);
    expect(r.endIndex).toBe(32);
    expect(r.offsetTop).toBe(540);
  });
  it('clamps end to itemCount-1', () => {
    const r = computeFixedRange({ itemCount: 10, itemHeight: 30, viewportHeight: 1000, scrollTop: 0, overscan: 0 });
    expect(r.endIndex).toBe(9);
  });
  it('clamps scrollTop to total height', () => {
    const r = computeFixedRange({ itemCount: 10, itemHeight: 30, viewportHeight: 100, scrollTop: 999_999 });
    expect(r.endIndex).toBe(9);
  });
});

// ---------------- computeVariableRange ----------------

describe('computeVariableRange', () => {
  it('handles empty list', () => {
    const r = computeVariableRange({ itemHeights: [], viewportHeight: 300, scrollTop: 0 });
    expect(r).toEqual({ startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 });
  });
  it('computes total height as sum of heights', () => {
    const r = computeVariableRange({ itemHeights: [10, 20, 30], viewportHeight: 100, scrollTop: 0, overscan: 0 });
    expect(r.totalHeight).toBe(60);
    expect(r.startIndex).toBe(0);
    expect(r.endIndex).toBe(2);
  });
  it('locates window in middle', () => {
    const heights = Array.from({ length: 10 }, () => 50);
    const r = computeVariableRange({ itemHeights: heights, viewportHeight: 100, scrollTop: 200, overscan: 0 });
    expect(r.startIndex).toBe(4);
    expect(r.endIndex).toBe(5);
    expect(r.offsetTop).toBe(200);
  });
  it('applies overscan to variable heights', () => {
    const heights = Array.from({ length: 10 }, () => 50);
    const r = computeVariableRange({ itemHeights: heights, viewportHeight: 100, scrollTop: 200, overscan: 1 });
    expect(r.startIndex).toBe(3);
    expect(r.endIndex).toBe(6);
  });
});

// ---------------- scrollToIndex ----------------

describe('scrollToIndex', () => {
  const base = { itemHeight: 30, viewportHeight: 300, currentScrollTop: 0 };
  it('start aligns to top', () => {
    expect(scrollToIndex({ ...base, index: 10, align: 'start' })).toBe(300);
  });
  it('end aligns to bottom of viewport', () => {
    expect(scrollToIndex({ ...base, index: 20, align: 'end' })).toBe(330);
  });
  it('center centres item in viewport', () => {
    // top=600, viewport=300, center: 600 - (300-30)/2 = 465
    expect(scrollToIndex({ ...base, index: 20, align: 'center' })).toBe(465);
  });
  it('auto leaves position alone if already visible', () => {
    expect(scrollToIndex({ ...base, currentScrollTop: 200, index: 10, align: 'auto' })).toBe(200);
  });
  it('auto scrolls down when item below viewport', () => {
    expect(scrollToIndex({ ...base, currentScrollTop: 0, index: 20, align: 'auto' })).toBe(330);
  });
  it('auto scrolls up when item above viewport', () => {
    expect(scrollToIndex({ ...base, currentScrollTop: 600, index: 5, align: 'auto' })).toBe(150);
  });
});

// ---------------- LazyAppLoader ----------------

describe('LazyAppLoader', () => {
  it('renders fallback then the lazy component', async () => {
    const Inner = (props: { label: string }) => <div data-testid="lazy-inner">{props.label}</div>;
    const Lazy = withLazyApp(() => Promise.resolve({ default: Inner }), { appId: 'demo', bareFallback: true });
    render(<Lazy label="hello" />);
    expect(screen.getByTestId('lazy-app-fallback-demo')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('lazy-inner').textContent).toBe('hello'));
  });
  it('LazyAppLoadFailure renders the error message', () => {
    render(<LazyAppLoadFailure appId="demo" error={new Error('boom')} />);
    const el = screen.getByTestId('lazy-app-load-failure-demo');
    expect(el.textContent).toContain('demo');
    expect(el.textContent).toContain('boom');
  });
  it('LazyAppLoadFailure works without an explicit error', () => {
    render(<LazyAppLoadFailure appId="demo" />);
    expect(screen.getByTestId('lazy-app-load-failure-demo').textContent).toContain('reinstall');
  });
});
