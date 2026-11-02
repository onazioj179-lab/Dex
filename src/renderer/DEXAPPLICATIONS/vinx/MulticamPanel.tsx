// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Multicam angle picker
 */

import React from 'react';
import type { MulticamClip } from './VinxTypes';

interface Props {
  multicamClip: MulticamClip | null;
  onSelectAngle: (angleId: string) => void;
  activeAngleId?: string;
}

const wrapStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', height: '100%',
  background: 'transparent', overflow: 'auto',
};

const headerStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)',
};

const gridStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)',
};

const emptyStyle: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--color-text-tertiary)', fontSize: 11, textAlign: 'center', padding: 'var(--space-5)',
};

function placeholderColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 28%)`;
}

export const MulticamPanel: React.FC<Props> = ({ multicamClip, onSelectAngle, activeAngleId }) => {
  if (!multicamClip) {
    return (
      <div style={wrapStyle}>
        <div style={headerStyle}>Multicam</div>
        <div style={emptyStyle}>Select a multicam clip to view angles</div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>Multicam Angles ({multicamClip.angles.length})</div>
      <div style={gridStyle}>
        {multicamClip.angles.map((angle, idx) => {
          const isActive = activeAngleId === angle.id;
          const bg = placeholderColor(angle.id);
          return (
            <button
              key={angle.id}
              onClick={() => onSelectAngle(angle.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: 6, borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                background: 'var(--color-bg-base)',
                border: isActive ? '2px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
              }}
              aria-label={`Select angle ${angle.name}`}
            >
              <div
                style={{
                  width: '100%', aspectRatio: '16 / 9', background: bg,
                  borderRadius: 4, position: 'relative', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,0.4)', fontSize: 22, fontWeight: 700,
                }}
              >
                {idx + 1}
                <span style={{
                  position: 'absolute', top: 4, left: 4,
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                  background: 'rgba(0,0,0,0.6)', padding: '2px 4px', borderRadius: 2,
                  color: 'var(--color-text-primary)',
                }}>
                  ANGLE {idx + 1}
                </span>
                {isActive && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                    background: 'var(--color-accent-fill)', padding: '2px 4px', borderRadius: 2,
                    color: '#FFFFFF',
                  }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {angle.name || `Angle ${idx + 1}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

MulticamPanel.displayName = 'VinxMulticamPanel';

export default MulticamPanel;
