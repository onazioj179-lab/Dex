// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Self-contained settings panels for the May 2026 user-feedback sweep.
// Three sections live here so Settings.tsx stays readable:
//   1. PermissionsPanel   — list, revoke per-grant, revoke-all
//   2. SnapLayoutsPanel   — drag-snap toggle, gutter slider, shortcut hints
//   3. CreatorAccessPanel — Ed25519 challenge / signature unlock for the
//                           "Creative Full Access" surface (single owner)
//
import React, { useEffect, useState, useCallback } from 'react';
import { resolvePlan, limitsFor, planLabel } from '../../../shared/plan';

// ---------- Shared design tokens (kept inline to avoid prop drilling) ----------
const PANEL: React.CSSProperties = {
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  color: 'var(--color-text-primary)',
  overflowY: 'auto',
};
const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid var(--color-border-subtle)',
  gap: 12,
};
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500 };
const DESC: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 };
const TITLE: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginTop: 12, marginBottom: 4 };
const SECTION: React.CSSProperties = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
  padding: '4px 14px',
};
const BTN: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-hover)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};
const BTN_DANGER: React.CSSProperties = {
  ...BTN,
  borderColor: 'rgba(255,69,58,0.4)',
  color: '#ff453a',
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--color-accent)',
  color: '#fff',
  border: 'none',
};
const TEXTAREA: React.CSSProperties = {
  width: '100%',
  minHeight: 70,
  fontFamily: 'ui-monospace, "SF Mono", monospace',
  fontSize: 11,
  padding: 8,
  borderRadius: 6,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-base)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
  resize: 'vertical',
};

// ===========================================================================
// 1. Permissions Panel
// ===========================================================================
interface Grant {
  capability: string;
  origin: string;
  decision: 'allow' | 'deny';
  grantedAt: number;
  expiresAt: number;
  reason?: string;
  fromGroup?: boolean;
}

const PRETTY_CAP: Record<string, string> = {
  'screen-record': 'Screen recording',
  'camera': 'Camera',
  'microphone': 'Microphone',
  'location': 'Location',
  'clipboard-read': 'Clipboard read',
  'clipboard-cloud-sync': 'Clipboard cloud sync',
  'files-read': 'Files read',
  'files-write': 'Files write',
  'network-request': 'Network',
  'notifications': 'Notifications',
  'biometric': 'Biometric',
  'system-events': 'System events',
};

function timeLeft(expiresAt: number): string {
  if (!expiresAt) return 'Never expires';
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h left`;
  const days = Math.round(hrs / 24);
  return `${days} d left`;
}

export const PermissionsPanel: React.FC = () => {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const native = (window as any).dexNative?.permissions;
      if (!native) throw new Error('Permissions bridge unavailable');
      const list: Grant[] = await native.list();
      setGrants(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const revoke = useCallback(async (cap: string, origin: string) => {
    try {
      await (window as any).dexNative?.permissions?.revoke(cap, origin);
      await refresh();
    } catch (err) {
      console.warn('[permissions] revoke failed', err);
    }
  }, [refresh]);

  const revokeAll = useCallback(async () => {
    if (!confirm('Revoke every saved permission grant?')) return;
    try {
      await (window as any).dexNative?.permissions?.revokeAll();
      await refresh();
    } catch (err) {
      console.warn('[permissions] revoke-all failed', err);
    }
  }, [refresh]);

  const allowed = grants.filter(g => g.decision === 'allow');
  const denied = grants.filter(g => g.decision === 'deny');

  return (
    <div style={PANEL}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Permissions</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Saved decisions for screen recording, camera, microphone, location, clipboard, files, and more.
          Related capabilities are batched into a single prompt — revoking here clears the whole batch.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={BTN} onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <button style={BTN_DANGER} onClick={revokeAll} disabled={!grants.length}>
          Revoke all
        </button>
      </div>

      {error && (
        <div style={{ color: '#ff453a', fontSize: 12 }}>Error: {error}</div>
      )}

      <h3 style={TITLE}>Allowed ({allowed.length})</h3>
      <div style={SECTION}>
        {allowed.length === 0 ? (
          <div style={{ ...DESC, padding: '14px 0' }}>No permissions granted yet.</div>
        ) : (
          allowed.map((g, i) => (
            <div key={`${g.capability}|${g.origin}|${i}`} style={ROW}>
              <div>
                <div style={LABEL}>{PRETTY_CAP[g.capability] ?? g.capability}</div>
                <div style={DESC}>
                  {g.origin} · {timeLeft(g.expiresAt)}
                  {g.fromGroup ? ' · batched' : ''}
                </div>
              </div>
              <button style={BTN_DANGER} onClick={() => revoke(g.capability, g.origin)}>Revoke</button>
            </div>
          ))
        )}
      </div>

      <h3 style={TITLE}>Denied ({denied.length})</h3>
      <div style={SECTION}>
        {denied.length === 0 ? (
          <div style={{ ...DESC, padding: '14px 0' }}>No active denials.</div>
        ) : (
          denied.map((g, i) => (
            <div key={`d|${g.capability}|${g.origin}|${i}`} style={ROW}>
              <div>
                <div style={LABEL}>{PRETTY_CAP[g.capability] ?? g.capability}</div>
                <div style={DESC}>{g.origin} · {timeLeft(g.expiresAt)}</div>
              </div>
              <button style={BTN} onClick={() => revoke(g.capability, g.origin)}>Clear</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// 2. Snap Layouts Panel
// ===========================================================================
const SNAP_PREFS_KEY = 'dex.snap.preferences';

interface SnapPrefs {
  enabled: boolean;
  gutter: number;
  cycleOnRepeat: boolean;
}

function loadSnapPrefs(): SnapPrefs {
  try {
    const raw = localStorage.getItem(SNAP_PREFS_KEY);
    if (raw) return { enabled: true, gutter: 8, cycleOnRepeat: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { enabled: true, gutter: 8, cycleOnRepeat: true };
}

function saveSnapPrefs(p: SnapPrefs): void {
  try { localStorage.setItem(SNAP_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl + Alt + ←', label: 'Snap to left half (repeat for thirds)' },
  { keys: 'Ctrl + Alt + →', label: 'Snap to right half (repeat for thirds)' },
  { keys: 'Ctrl + Alt + ↑', label: 'Maximize' },
  { keys: 'Ctrl + Alt + ↓', label: 'Restore / center' },
  { keys: 'Ctrl + Alt + 1..4', label: 'Snap to corner quadrant' },
  { keys: 'Drag to top edge', label: 'Maximize' },
  { keys: 'Drag to side edge', label: 'Snap to half' },
  { keys: 'Drag to corner', label: 'Snap to quadrant' },
];

export const SnapLayoutsPanel: React.FC = () => {
  const [prefs, setPrefs] = useState<SnapPrefs>(() => loadSnapPrefs());
  const update = useCallback((patch: Partial<SnapPrefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      saveSnapPrefs(next);
      try {
        window.dispatchEvent(new CustomEvent('dex:snap-prefs', { detail: next }));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <div style={PANEL}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Frame Snapping</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Magnet / Rectangle-style snap zones. Drag a frame to a screen edge or corner to tile it,
          or use the keyboard shortcuts below.
        </p>
      </div>

      <div style={SECTION}>
        <div style={ROW}>
          <div>
            <div style={LABEL}>Snap on drag</div>
            <div style={DESC}>Show snap zones when dragging a frame near an edge.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={e => update({ enabled: e.target.checked })}
            aria-label="Enable snap on drag"
          />
        </div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Cycle on repeat</div>
            <div style={DESC}>Press the same shortcut again to cycle half → third → two-thirds.</div>
          </div>
          <input
            type="checkbox"
            checked={prefs.cycleOnRepeat}
            onChange={e => update({ cycleOnRepeat: e.target.checked })}
            aria-label="Cycle on repeat"
          />
        </div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Gutter</div>
            <div style={DESC}>{prefs.gutter}px between tiled frames and the workspace edge.</div>
          </div>
          <input
            type="range" min={0} max={20} step={1}
            value={prefs.gutter}
            onChange={e => update({ gutter: parseInt(e.target.value, 10) })}
            style={{ width: 200 }}
            aria-label="Tile gutter"
          />
        </div>
      </div>

      <h3 style={TITLE}>Shortcuts</h3>
      <div style={SECTION}>
        {SHORTCUTS.map((s, i) => (
          <div key={i} style={ROW}>
            <div style={LABEL}>{s.label}</div>
            <kbd style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              background: 'var(--color-bg-hover)',
              border: '1px solid var(--color-border-subtle)',
            }}>{s.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===========================================================================
// 3. Creator Access Panel
// ===========================================================================
interface CreatorState {
  configured: boolean;
  fingerprint?: string | null;
  available: boolean;
}

export const CreatorAccessPanel: React.FC = () => {
  const [keyState, setKeyState] = useState<CreatorState | null>(null);
  const [unlocked, setUnlocked] = useState<{ unlocked: boolean; expiresAt?: number; reason?: string } | null>(null);
  const [challenge, setChallenge] = useState<string>('');
  const [challengeIssued, setChallengeIssued] = useState<{ issuedAt: number; expiresAt: number } | null>(null);
  const [signature, setSignature] = useState<string>('');
  const [verifyMsg, setVerifyMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refreshState = useCallback(async () => {
    const c = (window as any).dexNative?.creator;
    if (!c) {
      setKeyState({ configured: false, available: false });
      setUnlocked({ unlocked: false, reason: 'native-unavailable' });
      return;
    }
    try {
      const [s, cur] = await Promise.all([c.status(), c.current()]);
      setKeyState(s);
      setUnlocked(cur);
    } catch (err) {
      console.warn('[creator] status fetch failed', err);
    }
  }, []);

  useEffect(() => { refreshState(); }, [refreshState]);

  const requestChallenge = useCallback(async () => {
    setBusy(true);
    setVerifyMsg('');
    try {
      const c = (window as any).dexNative?.creator;
      const result = await c?.challenge();
      if (result?.challenge) {
        setChallenge(result.challenge);
        setChallengeIssued({ issuedAt: result.issuedAt, expiresAt: result.expiresAt });
        setSignature('');
      } else {
        setVerifyMsg('Native bridge did not return a challenge.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const submitSignature = useCallback(async () => {
    if (!challenge || !signature.trim()) {
      setVerifyMsg('Paste the signed challenge first.');
      return;
    }
    setBusy(true);
    setVerifyMsg('');
    try {
      const result = await (window as any).dexNative?.creator?.verify(challenge, signature.trim());
      if (result?.ok) {
        setVerifyMsg('Unlocked. Creative Full Access surface is live for this session.');
        setChallenge('');
        setSignature('');
        setChallengeIssued(null);
      } else {
        setVerifyMsg(`Rejected: ${result?.reason ?? 'unknown'}`);
      }
      await refreshState();
    } finally {
      setBusy(false);
    }
  }, [challenge, signature, refreshState]);

  const lock = useCallback(async () => {
    await (window as any).dexNative?.creator?.lock();
    await refreshState();
  }, [refreshState]);

  const isUnlocked = !!unlocked?.unlocked;
  const planTier = resolvePlan(unlocked ?? null);
  const limits = limitsFor(planTier);

  return (
    <div style={PANEL}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Creator Access</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Single-owner unlock for the Creative Full Access surface. The owner holds an Ed25519 private
          key offline; this surface only verifies signatures. Tokens never survive a process restart.
        </p>
      </div>

      <div style={SECTION}>
        <div style={ROW}>
          <div>
            <div style={LABEL}>Embedded key</div>
            <div style={DESC}>
              {keyState?.available === false && 'Native creator bridge not loaded.'}
              {keyState?.available && keyState.configured &&
                `Fingerprint ${keyState.fingerprint}`}
              {keyState?.available && !keyState.configured &&
                'No creator public key embedded in this build (placeholder).'}
            </div>
          </div>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: keyState?.configured ? 'rgba(48,209,88,0.15)' : 'rgba(255,159,10,0.15)',
            color: keyState?.configured ? '#30d158' : '#ff9f0a',
          }}>{keyState?.configured ? 'Ready' : 'Not provisioned'}</span>
        </div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Current state</div>
            <div style={DESC}>
              {isUnlocked
                ? `Unlocked${unlocked?.expiresAt ? ` until ${new Date(unlocked.expiresAt * 1000).toLocaleTimeString()}` : ''}.`
                : 'Locked. Sign a fresh challenge to unlock.'}
            </div>
          </div>
          {isUnlocked
            ? <button style={BTN_DANGER} onClick={lock}>Lock now</button>
            : <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{unlocked?.reason ?? ''}</span>}
        </div>

        <div style={ROW}>
          <div>
            <div style={LABEL}>Active plan</div>
            <div style={DESC}>
              {planLabel(planTier)} — {limits.tokensPerMinute.toLocaleString()} tok/min,
              {' '}{limits.contextWindowTokens.toLocaleString()} ctx tokens,
              {' '}{limits.maxParallelToolCalls} parallel tool calls,
              {' '}{limits.maxPlanSteps} plan steps.
            </div>
          </div>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: planTier === 'power' ? 'rgba(94,160,255,0.18)' : 'rgba(150,150,150,0.15)',
            color: planTier === 'power' ? '#5ea0ff' : 'var(--color-text-secondary)',
          }}>{planTier === 'power' ? 'Power' : 'Free'}</span>
        </div>
      </div>

      {!isUnlocked && keyState?.configured && (
        <>
          <h3 style={TITLE}>Step 1 — Issue challenge</h3>
          <div style={SECTION}>
            <div style={ROW}>
              <div>
                <div style={LABEL}>Fresh challenge</div>
                <div style={DESC}>
                  Each challenge is single-use and expires in 5 minutes.
                </div>
              </div>
              <button style={BTN_PRIMARY} onClick={requestChallenge} disabled={busy}>
                {busy ? 'Working...' : 'Generate'}
              </button>
            </div>
            {challenge && (
              <div style={{ padding: '8px 0' }}>
                <textarea readOnly value={challenge} style={TEXTAREA} aria-label="Challenge" />
                {challengeIssued && (
                  <div style={DESC}>
                    Expires at {new Date(challengeIssued.expiresAt * 1000).toLocaleTimeString()}.
                  </div>
                )}
              </div>
            )}
          </div>

          <h3 style={TITLE}>Step 2 — Paste signature</h3>
          <div style={SECTION}>
            <div style={{ padding: '8px 0' }}>
              <textarea
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder="Hex-encoded Ed25519 signature (128 hex chars)..."
                style={TEXTAREA}
                aria-label="Signature"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button style={BTN_PRIMARY} onClick={submitSignature} disabled={busy || !challenge || !signature.trim()}>
                  Verify & unlock
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {verifyMsg && (
        <div style={{
          padding: 10, borderRadius: 6, fontSize: 12,
          background: verifyMsg.startsWith('Unlocked') ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)',
          color: verifyMsg.startsWith('Unlocked') ? '#30d158' : '#ff453a',
        }}>{verifyMsg}</div>
      )}
    </div>
  );
};
