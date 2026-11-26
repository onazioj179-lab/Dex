// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * InterfaceTransparencyControl - the single glass-to-opaque control.
 *
 * 0% is fully opaque (no backdrop blur, cheapest to render); 100% is the most
 * translucent supported glass. Opacity and blur strength are separate material
 * parameters: the blur slider only appears once any glass is on. Changes apply
 * live through the shell-preferences store (no reload, no layout change).
 */

import React from 'react';
import {
  GLASS_BLUR_MAX,
  GLASS_BLUR_MIN,
  getEffectiveGlassMode,
  prefsToTransparency,
  useShellPreferences,
} from '../store/shellPreferencesStore';

type RowStyles = Record<string, React.CSSProperties>;

function describe(percent: number, forcedFlat: boolean): string {
  if (percent === 0) return 'Fully opaque. Blur is off, which is also the lightest on your GPU.';
  const base = percent >= 100 ? 'Maximum glass.' : `${percent}% glass.`;
  return forcedFlat
    ? `${base} Currently shown flat because Reduce Transparency or Low-End Mode is on.`
    : base;
}

export function InterfaceTransparencyControl({ styles, onChange }: { styles: RowStyles; onChange?: (percent: number) => void }): React.ReactElement {
  const glassMode = useShellPreferences((s) => s.glassMode);
  const glassOpacity = useShellPreferences((s) => s.glassOpacity);
  const glassBlur = useShellPreferences((s) => s.glassBlur);
  const lowEndMode = useShellPreferences((s) => s.lowEndMode);
  const setInterfaceTransparency = useShellPreferences((s) => s.setInterfaceTransparency);
  const setGlassBlur = useShellPreferences((s) => s.setGlassBlur);
  const setGlassMode = useShellPreferences((s) => s.setGlassMode);

  const percent = prefsToTransparency({ glassMode, glassOpacity });
  const forcedFlat = percent > 0 && getEffectiveGlassMode({ glassMode, lowEndMode }) !== glassMode;

  return (
    <>
      <div className="settings-row" style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Interface Transparency</span>
          <span style={styles.settingDesc} id="dex-iface-transparency-desc">{describe(percent, forcedFlat)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 220 }}>
          <input
            type="range" min={0} max={100} step={5}
            value={percent}
            onChange={(e) => { const v = Number(e.target.value); setInterfaceTransparency(v); onChange?.(v); }}
            style={{ flex: 1, accentColor: 'var(--color-accent)' }}
            aria-label="Interface Transparency"
            aria-valuetext={percent === 0 ? 'Fully opaque' : `${percent} percent glass`}
            aria-describedby="dex-iface-transparency-desc"
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'right' }}>{percent}%</span>
        </div>
      </div>
      {percent > 0 && (
        <div className="settings-row" style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Glass style</span>
            <span style={styles.settingDesc}>Refined is restrained and crisp. Liquid is deeper, with stronger lensing.</span>
          </div>
          <div role="group" aria-label="Glass style" style={{ display: 'flex', gap: 6 }}>
            {([{ id: 'normal', label: 'Refined' }, { id: 'liquid', label: 'Liquid' }] as const).map((m) => {
              const active = (glassMode === 'liquid') === (m.id === 'liquid');
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGlassMode(m.id)}
                  style={{
                    padding: '5px var(--space-3)', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: active ? '1px solid var(--dex-focus-color, var(--color-accent))' : '1px solid var(--color-border)',
                    background: active ? 'var(--color-bg-active)' : 'transparent',
                    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  }}
                >{m.label}</button>
              );
            })}
          </div>
        </div>
      )}
      {percent > 0 && (
        <div className="settings-row" style={styles.settingRow}>
          <div style={styles.settingInfo}>
            <span style={styles.settingLabel}>Blur strength</span>
            <span style={styles.settingDesc}>How strongly glass frosts what is behind it. Separate from transparency.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 220 }}>
            <input
              type="range" min={GLASS_BLUR_MIN} max={GLASS_BLUR_MAX} step={2}
              value={glassBlur}
              onChange={(e) => setGlassBlur(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-accent)' }}
              aria-label="Glass blur strength"
            />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'right' }}>{glassBlur}px</span>
          </div>
        </div>
      )}
    </>
  );
}

export default InterfaceTransparencyControl;
