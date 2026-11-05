// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Desktop creator mark: a small "Onazi oJ" in the bottom-right corner of the bare desktop.
 * It sits under every icon, widget and window (z-index 0, no pointer events),
 * so it can never obstruct, intercept a drag or cover a control. It follows the
 * theme through the tertiary text token and can be turned off in
 * Settings › Shell & Dock › Desktop creator mark.
 */
import React from 'react';
import { useShellPreferences } from '../store/shellPreferencesStore';
import { CREATOR_NAME } from '../../shared/creator';

export const CreatorMark: React.FC = () => {
  const show = useShellPreferences((s) => s.showCreatorMark);
  const dockEdge = useShellPreferences((s) => s.dockEdge);
  if (!show) return null;
  // Bottom-right: the DEX Bar owns the bottom-left. Move aside for a right dock.
  const side: React.CSSProperties = dockEdge === 'right' ? { left: 18 } : { right: 18 };
  return (
    <div
      aria-hidden="true"
      data-dex-creator-mark=""
      style={{
        position: 'absolute', bottom: 14, ...side, zIndex: 0,
        pointerEvents: 'none', userSelect: 'none',
        fontSize: 11, fontWeight: 500, letterSpacing: '0.04em',
        color: 'var(--color-text-tertiary)', opacity: 0.55,
      }}
    >
      {CREATOR_NAME}
    </div>
  );
};

export default CreatorMark;
