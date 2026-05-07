// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Helper to lazy-load heavy DEX apps with consistent fallback + error
 * boundary. Pairs React.lazy with Suspense, SkeletonPage and the
 * existing AppErrorBoundary so any heavy app can opt in with one line.
 *
 *   const Imosion = withLazyApp(() => import('../DEXAPPLICATIONS/imosion'));
 *
 * The wrapper preserves the host's appId for crash reporting.
 */

// DEX v3.8.9 wave F - lazy app loader

import React, { Suspense, lazy, type ComponentType } from 'react';
import { ViewErrorBoundary } from '../../services/ErrorBoundary';
import { SkeletonPage } from '../Skeleton';

export interface LazyAppOptions {
  appId?: string;
  /** 'list' | 'grid' | 'detail' for the skeleton variant. */
  fallbackVariant?: 'list' | 'grid' | 'detail';
  /** When true, renders a no-skeleton transparent fallback. */
  bareFallback?: boolean;
}

type LazyImport<P> = () => Promise<{ default: ComponentType<P> }>;

/**
 * Wrap a dynamic import in Suspense + AppErrorBoundary.
 * Returns a React component compatible with the original loader.
 */
export function withLazyApp<P extends object>(
  loader: LazyImport<P>,
  options: LazyAppOptions = {},
): ComponentType<P> {
  const Lazy = lazy(loader) as unknown as ComponentType<P>;
  const { appId = 'unknown', fallbackVariant = 'detail', bareFallback = false } = options;
  const fallback = bareFallback
    ? <div data-testid={`lazy-app-fallback-${appId}`} style={{ width: '100%', height: '100%' }} />
    : <SkeletonPage variant={fallbackVariant} />;

  function LazyAppHost(props: P): React.JSX.Element {
    return (
      <ViewErrorBoundary viewName={appId}>
        <Suspense fallback={fallback}>
          <Lazy {...props} />
        </Suspense>
      </ViewErrorBoundary>
    );
  }
  LazyAppHost.displayName = `LazyApp(${appId})`;
  return LazyAppHost;
}

/**
 * INTENTIONAL FALLBACK: when the dynamic import fails (offline or
 * tampered bundle) callers can register this as a manual fallback so
 * the host shell does not white-screen.
 */
export function LazyAppLoadFailure({ appId, error }: { appId: string; error?: unknown }): React.JSX.Element {
  return (
    <div
      data-testid={`lazy-app-load-failure-${appId}`}
      role="alert"
      style={{ padding: 24, color: 'var(--color-text-secondary, #B8B8BD)' }}
    >
      <strong>Could not load {appId}.</strong>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        {error ? String((error as { message?: string }).message ?? error) : 'The app bundle is unavailable. Try again or reinstall.'}
      </div>
    </div>
  );
}
