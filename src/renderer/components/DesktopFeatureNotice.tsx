// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DesktopFeatureNotice — the "operable everywhere" UI primitive.
 *
 * Wrap any feature whose backend may not be native in the current shell. When
 * the feature's `namespace` IS natively available (always under Electron; the
 * ported subsystems under Tauri) it renders the children unchanged. Otherwise it
 * renders a clean, calm notice instead of a broken/empty surface — so the app is
 * operable everywhere rather than silently dead.
 *
 *   <DesktopFeatureNotice feature="Audio Studio" namespace="audio">
 *     <AudioApp />
 *   </DesktopFeatureNotice>
 */

import React from 'react';
import { getCapabilities } from '../services/platform';

interface Props {
  /** Human label, e.g. "Audio Studio". */
  feature: string;
  /** The `window.dex.<namespace>` this feature needs, e.g. "audio". */
  namespace: string;
  children?: React.ReactNode;
}

export const DesktopFeatureNotice: React.FC<Props> = ({ feature, namespace, children }) => {
  const caps = getCapabilities();
  if (caps.has(namespace)) {
    return <>{children}</>;
  }

  return (
    <div
      role="note"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: '14px var(--space-4)',
        margin: 'var(--space-3)',
        borderRadius: 10,
        background: 'var(--pg-surface, rgba(255,255,255,0.04))',
        border: '1px solid var(--color-border, rgba(255,255,255,0.10))',
        color: 'var(--color-text-primary)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{feature} isn’t available in this build</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
          {caps.shell === 'tauri'
            ? 'This is the lightweight build — the feature runs in the full DEX desktop app while it’s being ported.'
            : 'Open DEX as a desktop app to use this feature.'}
        </div>
      </div>
    </div>
  );
};

export default DesktopFeatureNotice;
