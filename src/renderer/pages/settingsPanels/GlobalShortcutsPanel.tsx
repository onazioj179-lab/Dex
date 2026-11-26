// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Settings › Help › System-wide shortcuts: keys that reach DEX from any app.
 * Each row shows its real state from Windows (working, off, or taken by
 * another app) and can be changed by clicking the key and pressing a new one.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { DexSwitch, Pill } from '../../components/controls';
import {
  listGlobalHotkeys, setGlobalHotkey, setGlobalHotkeysEnabled, resetGlobalHotkeys, acceleratorFromEvent,
  type GlobalHotkeyState,
} from '../../services/globalHotkeys';

interface Props {
  styles: Record<string, React.CSSProperties>;
}

export default function GlobalShortcutsPanel({ styles }: Props): React.ReactElement {
  const [state, setState] = useState<GlobalHotkeyState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listGlobalHotkeys().then((s) => { if (live) { setState(s); setLoaded(true); } });
    return () => { live = false; };
  }, []);

  const apply = useCallback((r: GlobalHotkeyState | { error: string } | null) => {
    if (!r) return;
    if ('error' in r) { setError(r.error); return; }
    setError(null);
    setState(r);
  }, []);

  // While recording, the next full combination becomes the binding; Escape cancels.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) { setRecording(null); return; }
      const acc = acceleratorFromEvent(e);
      if (!acc) return;
      if (!/(^|\+)(Ctrl|Alt|Win)\+/.test(acc)) { setError('Use Ctrl, Alt or Win with the key, so it does not take over typing in other apps.'); return; }
      const action = recording;
      setRecording(null);
      void setGlobalHotkey(action, { accelerator: acc }).then(apply);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, apply]);

  const keyStyle = (active: boolean): React.CSSProperties => ({
    minWidth: 120, height: 28, padding: '0 12px', borderRadius: 9999, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-accent-light)' : 'var(--color-bg-hover)',
    color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
  });

  if (!loaded) return <></>;
  if (!state) {
    return (
      <>
        <h3 style={styles.sectionTitle}>System-wide shortcuts</h3>
        <div style={styles.settingDesc}>Keys that reach DEX from any app work in the DEX desktop app.</div>
      </>
    );
  }

  return (
    <>
      <h3 style={styles.sectionTitle}>System-wide shortcuts</h3>
      <div className="settings-row" style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Use shortcuts from any app</span>
          <span style={styles.settingDesc}>These keys work even when DEX is in the background or minimized. Click a key to change it.</span>
        </div>
        <DexSwitch checked={state.enabled} label="Use system-wide shortcuts" onChange={(on) => { void setGlobalHotkeysEnabled(on).then(apply); }} />
      </div>
      {state.bindings.map((b) => {
        const status = !state.enabled || !b.enabled ? 'Off' : b.registered ? 'Working' : (b.error || 'Not active');
        const bad = state.enabled && b.enabled && !b.registered;
        return (
          <div key={b.action} className="settings-row" style={styles.settingRow}>
            <div style={styles.settingInfo}>
              <span style={styles.settingLabel}>{b.label}</span>
              <span style={{ ...styles.settingDesc, color: bad ? 'var(--color-error)' : undefined }}>{status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                style={keyStyle(recording === b.action)}
                onClick={() => { setError(null); setRecording((r) => (r === b.action ? null : b.action)); }}
                aria-label={`Change the shortcut for ${b.label}, now ${b.accelerator}`}
              >
                {recording === b.action ? 'Press keys…' : b.accelerator}
              </button>
              <DexSwitch size="sm" checked={b.enabled} label={`${b.label} shortcut`} onChange={(on) => { void setGlobalHotkey(b.action, { enabled: on }).then(apply); }} />
            </div>
          </div>
        );
      })}
      {error && <div role="alert" style={{ ...styles.settingDesc, color: 'var(--color-error)', marginTop: 'var(--space-2)' }}>{error}</div>}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <Pill onClick={() => { void resetGlobalHotkeys().then(apply); }}>Restore defaults</Pill>
      </div>
    </>
  );
}
