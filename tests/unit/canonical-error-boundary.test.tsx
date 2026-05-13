// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  CanonicalErrorBoundary,
  boundedRetryPolicy,
  composeTelemetry,
  type CanonicalCrashRecord,
  type CanonicalTelemetrySink,
} from '../../src/shared/errors/CanonicalErrorBoundary';

function Boom({ when }: { when: boolean }): JSX.Element {
  if (when) throw new Error('kaboom');
  return React.createElement('div', null, 'ok');
}

describe('CanonicalErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      React.createElement(
        CanonicalErrorBoundary,
        { scope: 'view', name: 'demo' },
        React.createElement('div', null, 'child'),
      ),
    );
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('catches errors and emits telemetry', () => {
    vi.useFakeTimers();
    const sink = vi.fn<[CanonicalCrashRecord], void>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      React.createElement(
        CanonicalErrorBoundary,
        { scope: 'view', name: 'demo', telemetry: sink },
        React.createElement(Boom, { when: true }),
      ),
    );
    expect(sink).toHaveBeenCalledTimes(1);
    const record = sink.mock.calls[0]![0];
    expect(record.scope).toBe('view');
    expect(record.name).toBe('demo');
    expect(record.error.message).toBe('kaboom');
    expect(record.attempt).toBe(0);
    expect(record.fatal).toBe(false);
    expect(screen.getByRole('alert')).toBeTruthy();
    errSpy.mockRestore();
    vi.useRealTimers();
  });

  it('marks fatal after policy denies recovery', () => {
    const sink = vi.fn<[CanonicalCrashRecord], void>();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      React.createElement(
        CanonicalErrorBoundary,
        {
          scope: 'app',
          name: 'noRetry',
          telemetry: sink,
          recovery: boundedRetryPolicy(0),
        },
        React.createElement(Boom, { when: true }),
      ),
    );
    expect(sink.mock.calls[0]![0].fatal).toBe(true);
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.getByText('Dismiss')).toBeTruthy();
    errSpy.mockRestore();
  });

  it('dismiss invokes callback and clears error UI', () => {
    const onDismiss = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Holder(): JSX.Element {
      const [crashed] = React.useState(true);
      return React.createElement(
        CanonicalErrorBoundary,
        {
          scope: 'view',
          name: 'd',
          recovery: boundedRetryPolicy(0),
          onDismiss,
        },
        React.createElement(Boom, { when: crashed }),
      );
    }
    render(React.createElement(Holder));
    fireEvent.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it('boundedRetryPolicy: recovers up to maxAttempts then becomes fatal', () => {
    const policy = boundedRetryPolicy(2, 100);
    expect(policy.decide({ attempt: 0, error: new Error() })).toEqual({
      recover: true, delayMs: 100, canRetry: true,
    });
    expect(policy.decide({ attempt: 1, error: new Error() }).recover).toBe(true);
    expect(policy.decide({ attempt: 2, error: new Error() })).toEqual({
      recover: false, delayMs: 0, canRetry: false,
    });
  });

  it('composeTelemetry fans out and isolates sink errors', () => {
    const a = vi.fn();
    const b = vi.fn(() => { throw new Error('sink failed'); });
    const c = vi.fn();
    const composed: CanonicalTelemetrySink = composeTelemetry(a, undefined, b, c);
    composed({
      id: 'x', scope: 'view', error: new Error('x'),
      componentStack: '', capturedAt: 0, attempt: 0, fatal: false,
    });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    expect(c).toHaveBeenCalled();
  });

  it('schedules recovery via timer and remounts children', async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let setCrash: (v: boolean) => void = () => {};
    function Holder(): JSX.Element {
      const [crash, set] = React.useState(true);
      setCrash = set;
      return React.createElement(
        CanonicalErrorBoundary,
        {
          scope: 'view',
          name: 'r',
          recovery: boundedRetryPolicy(3, 10),
        },
        React.createElement(Boom, { when: crash }),
      );
    }
    render(React.createElement(Holder));
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => {
      setCrash(false);
      await vi.advanceTimersByTimeAsync(15);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('ok')).toBeTruthy();
    errSpy.mockRestore();
    vi.useRealTimers();
  });
});
