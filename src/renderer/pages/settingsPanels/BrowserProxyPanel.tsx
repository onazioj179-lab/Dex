// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Settings › Browser › Hide my IP address: route Browser tabs through Tor or a
 * proxy (src-tauri/src/browser_proxy.rs). Honest about what it does: sites see
 * the proxy's address; DEX itself cannot hide an address without one.
 */
import React, { useCallback, useEffect, useState } from 'react';

type Kind = 'tor' | 'socks5' | 'http';
interface ProxyState { enabled: boolean; kind: Kind; host: string; port: number }
type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

const PRESETS: Record<Kind, { host: string; port: number }> = {
  tor: { host: '127.0.0.1', port: 9050 },
  socks5: { host: '127.0.0.1', port: 1080 },
  http: { host: '127.0.0.1', port: 8080 },
};

function bridge(): Invoke | null {
  const dex = (globalThis as unknown as { dex?: { invoke?: Invoke } }).dex;
  return dex?.invoke ? dex.invoke.bind(dex) : null;
}

const pill = (on: boolean): React.CSSProperties => ({
  height: 28, padding: '0 14px', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  border: on ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
  background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-elevated))' : 'transparent',
  color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
});
const field: React.CSSProperties = {
  height: 30, padding: '0 12px', borderRadius: 9999, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12.5, fontFamily: 'var(--font-mono)',
};

export const BrowserProxyPanel: React.FC<{ styles: Record<string, React.CSSProperties> }> = ({ styles }) => {
  const [s, setS] = useState<ProxyState | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const invoke = bridge();

  useEffect(() => {
    if (!invoke) return;
    void invoke('browserProxy:get').then((r) => setS(r as ProxyState)).catch(() => setS(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (next: ProxyState) => {
    if (!invoke) return;
    const r = (await invoke('browserProxy:set', next).catch((e) => ({ error: String(e) }))) as ProxyState & { error?: string };
    if (r?.error) { setCheck({ ok: false, text: r.error }); return; }
    setS(r);
    setCheck(null);
  }, [invoke]);

  const runTest = useCallback(async () => {
    if (!invoke || !s) return;
    setBusy(true);
    const r = (await invoke('browserProxy:test', s).catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
    setBusy(false);
    setCheck({ ok: !!r?.ok, text: r?.ok ? (r.message || 'Ready.') : (r?.error || 'The test could not run.') });
  }, [invoke, s]);

  if (!invoke) {
    return (
      <>
        <h3 style={styles.sectionTitle}>Hide my IP address</h3>
        <div style={styles.settingDesc}>Routing the Browser through Tor or a proxy works in the DEX desktop app.</div>
      </>
    );
  }
  if (!s) return null;

  const mode: 'off' | Kind = s.enabled ? s.kind : 'off';
  const choose = (m: 'off' | Kind) => {
    if (m === 'off') { void save({ ...s, enabled: false }); return; }
    const keep = s.kind === m;
    void save({ enabled: true, kind: m, host: keep ? s.host : PRESETS[m].host, port: keep ? s.port : PRESETS[m].port });
  };

  return (
    <>
      <h3 style={styles.sectionTitle}>Hide my IP address</h3>
      <div className="settings-row" style={styles.settingRow}>
        <div style={styles.settingInfo}>
          <span style={styles.settingLabel}>Route the Browser through</span>
          <span style={styles.settingDesc}>
            Sites then see the address of Tor or your proxy instead of yours. DEX cannot hide your address on its own: Tor (or Tor Browser) or a proxy
            must be running. Applies to tabs opened after the change, which use their own profile (separate cookies and sign-ins).
          </span>
        </div>
      </div>
      <div role="radiogroup" aria-label="Route the Browser through" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 10px' }}>
        {(['off', 'tor', 'socks5', 'http'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} style={pill(mode === m)} onClick={() => choose(m)}>
            {m === 'off' ? 'Off (direct)' : m === 'tor' ? 'Tor' : m === 'socks5' ? 'SOCKS5 proxy' : 'HTTP proxy'}
          </button>
        ))}
      </div>
      {s.enabled && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input aria-label="Proxy address" style={{ ...field, width: 200 }} value={s.host}
              onChange={(e) => setS({ ...s, host: e.target.value.trim() })} onBlur={() => void save(s)} />
            <span style={{ color: 'var(--color-text-tertiary)' }}>:</span>
            <input aria-label="Proxy port" inputMode="numeric" style={{ ...field, width: 90 }} value={String(s.port)}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setS({ ...s, port: n || 0 }); }} onBlur={() => void save(s)} />
            <button type="button" style={pill(false)} onClick={() => void runTest()} disabled={busy}>{busy ? 'Testing…' : 'Test'}</button>
            {s.kind === 'tor' && (
              <button type="button" style={pill(false)} onClick={() => void save({ ...s, port: s.port === 9050 ? 9150 : 9050 })}>
                {s.port === 9050 ? 'Use Tor Browser (9150)' : 'Use Tor service (9050)'}
              </button>
            )}
          </div>
          {check && (
            <div role="status" style={{ ...styles.settingDesc, color: check.ok ? 'var(--color-success, #34c759)' : 'var(--color-error)', marginBottom: 6 }}>{check.text}</div>
          )}
          <div style={styles.settingDesc}>
            DNS goes through {s.kind === 'http' ? 'the proxy for web pages' : 'the proxy'} and WebRTC is limited to it, so the real address does not leak
            through those paths. To check, open check.torproject.org (Tor) or any "what is my IP" page in a new tab.
          </div>
        </>
      )}
    </>
  );
};

export default BrowserProxyPanel;
