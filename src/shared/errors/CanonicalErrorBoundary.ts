// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Canonical React error boundary. Single replacement for the four
 * divergent boundaries in the codebase (`AppErrorBoundary` in services and
 * AppWrapper, `ViewErrorBoundary`, `RootErrorBoundary`).
 *
 * Behavior is composed via three pluggable seams so existing consumers
 * keep their telemetry pipelines:
 *
 *   - `telemetry`: receives a `CanonicalCrashRecord` for every caught
 *     error. Provide multiple sinks via `composeTelemetry`.
 *   - `recovery`: encodes the retry policy. Default is the
 *     `boundedRetryPolicy` (3 attempts, 500 ms delay, classifies further
 *     errors after the cap as fatal).
 *   - `fallback`: receives the current state and renders the failure UI.
 *
 * The boundary itself is intentionally minimal: it owns crash counting,
 * retry timing, and remount keys. Telemetry sinks decide what to do with
 * the crash (console, IPC, system event bus, localStorage, etc.).
 *
 * Implements Phase 1 of the Master Evolution Plan (error boundary
 * consolidation). Existing boundaries continue to work; new code targets
 * this one and old boundaries migrate incrementally.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export type CanonicalCrashScope = 'root' | 'app' | 'view';

export interface CanonicalCrashRecord {
  /** Unique id for this crash, suitable for log correlation. */
  id: string;
  /** Boundary scope that caught the crash. */
  scope: CanonicalCrashScope;
  /** Optional logical name (app id, view name, route, etc.). */
  name?: string;
  /** Caught error. */
  error: Error;
  /** React component stack from `componentDidCatch`. */
  componentStack: string;
  /** When the crash was observed (ms since epoch). */
  capturedAt: number;
  /** Retry index that failed (0-based). */
  attempt: number;
  /** True when the boundary will not attempt further recovery. */
  fatal: boolean;
}

export type CanonicalTelemetrySink = (record: CanonicalCrashRecord) => void;

export interface CanonicalRecoveryDecision {
  /** True when the boundary should attempt to remount its children. */
  recover: boolean;
  /** Delay in ms before remount. Ignored when `recover` is false. */
  delayMs: number;
  /** When false, the boundary surfaces a permanent failure UI. */
  canRetry: boolean;
}

export interface CanonicalRecoveryPolicy {
  decide(input: { attempt: number; error: Error }): CanonicalRecoveryDecision;
}

export interface CanonicalFallbackProps {
  scope: CanonicalCrashScope;
  name?: string;
  error: Error;
  attempt: number;
  fatal: boolean;
  retry: () => void;
  dismiss: () => void;
}

export type CanonicalFallback = (props: CanonicalFallbackProps) => ReactNode;

export interface CanonicalErrorBoundaryProps {
  scope: CanonicalCrashScope;
  name?: string;
  children: ReactNode;
  telemetry?: CanonicalTelemetrySink;
  recovery?: CanonicalRecoveryPolicy;
  fallback?: CanonicalFallback;
  /** Optional callback invoked when the boundary attempts recovery. */
  onRecover?: () => void;
  /** Optional callback invoked when the boundary is dismissed. */
  onDismiss?: () => void;
}

interface CanonicalErrorBoundaryState {
  error: Error | null;
  attempt: number;
  remountKey: number;
  fatal: boolean;
}

export function boundedRetryPolicy(maxAttempts = 3, delayMs = 500): CanonicalRecoveryPolicy {
  return {
    decide({ attempt }) {
      const willRetry = attempt < maxAttempts;
      return {
        recover: willRetry,
        delayMs: willRetry ? delayMs : 0,
        canRetry: willRetry,
      };
    },
  };
}

export function composeTelemetry(
  ...sinks: ReadonlyArray<CanonicalTelemetrySink | undefined | null>
): CanonicalTelemetrySink {
  const concrete = sinks.filter((s): s is CanonicalTelemetrySink => typeof s === 'function');
  return (record) => {
    for (const sink of concrete) {
      try { sink(record); } catch { /* swallow telemetry errors */ }
    }
  };
}

export const consoleTelemetry: CanonicalTelemetrySink = (record) => {
  // eslint-disable-next-line no-console
  console.error('[DEX:errorBoundary]', record.scope, record.name ?? '', record.error, {
    attempt: record.attempt,
    fatal: record.fatal,
    componentStack: record.componentStack,
  });
};

const DEFAULT_FALLBACK: CanonicalFallback = ({ scope, name, error, fatal, retry, dismiss }) => {
  return React.createElement(
    'div',
    {
      role: 'alert',
      'data-dex-error-boundary': scope,
      style: {
        padding: '16px',
        border: '1px solid rgba(255,59,48,0.25)',
        borderRadius: '8px',
        background: 'rgba(255,59,48,0.06)',
        color: 'inherit',
        font: '13px system-ui, sans-serif',
      },
    },
    React.createElement(
      'div',
      { style: { fontWeight: 600, marginBottom: '4px' } },
      `${scope} error${name ? `: ${name}` : ''}`,
    ),
    React.createElement(
      'div',
      { style: { opacity: 0.85, marginBottom: '12px' } },
      error.message || 'An unexpected error occurred.',
    ),
    React.createElement(
      'div',
      { style: { display: 'flex', gap: '8px' } },
      fatal
        ? null
        : React.createElement(
            'button',
            { type: 'button', onClick: retry, 'data-action': 'retry' },
            'Retry',
          ),
      React.createElement(
        'button',
        { type: 'button', onClick: dismiss, 'data-action': 'dismiss' },
        'Dismiss',
      ),
    ),
  );
};

let crashCounter = 0;
function nextCrashId(now: number): string {
  crashCounter += 1;
  return `${now.toString(36)}-${crashCounter.toString(36)}`;
}

export class CanonicalErrorBoundary extends Component<
  CanonicalErrorBoundaryProps,
  CanonicalErrorBoundaryState
> {
  state: CanonicalErrorBoundaryState = {
    error: null,
    attempt: 0,
    remountKey: 0,
    fatal: false,
  };

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<CanonicalErrorBoundaryState> {
    return { error };
  }

  override componentWillUnmount(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { telemetry, recovery, scope, name, onRecover } = this.props;
    const policy = recovery ?? boundedRetryPolicy();
    const attempt = this.state.attempt;
    const decision = policy.decide({ attempt, error });
    const fatal = !decision.recover;
    const record: CanonicalCrashRecord = {
      id: nextCrashId(Date.now()),
      scope,
      name,
      error,
      componentStack: info.componentStack ?? '',
      capturedAt: Date.now(),
      attempt,
      fatal,
    };
    if (telemetry) {
      try { telemetry(record); } catch { /* swallow telemetry errors */ }
    }
    if (decision.recover) {
      this.scheduleRecovery(decision.delayMs, onRecover);
    } else {
      this.setState({ fatal: true });
    }
  }

  private scheduleRecovery(delayMs: number, onRecover?: () => void): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState((prev) => ({
        error: null,
        attempt: prev.attempt + 1,
        remountKey: prev.remountKey + 1,
        fatal: false,
      }));
      try { onRecover?.(); } catch { /* swallow */ }
    }, Math.max(0, delayMs));
  }

  private retry = (): void => {
    this.scheduleRecovery(0, this.props.onRecover);
  };

  private dismiss = (): void => {
    this.setState({ error: null, fatal: false });
    try { this.props.onDismiss?.(); } catch { /* swallow */ }
  };

  override render(): ReactNode {
    const { error, attempt, remountKey, fatal } = this.state;
    const { children, fallback, scope, name } = this.props;
    if (error) {
      const renderFallback = fallback ?? DEFAULT_FALLBACK;
      return renderFallback({
        scope,
        name,
        error,
        attempt,
        fatal,
        retry: this.retry,
        dismiss: this.dismiss,
      });
    }
    return React.createElement(React.Fragment, { key: remountKey }, children);
  }
}
