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
import { SegmentedControl } from '../../components/controls';
import { resolvePlan, limitsFor, planLabel } from '../../../shared/plan';
import {
  describeCapabilities,
  grant as grantCapability,
  revoke as revokeCapability,
  type CapabilityInfo,
  type Capability,
  type CapabilityStatus,
} from '../../uki/permissions';

// ---------- Shared design tokens (kept inline to avoid prop drilling) ----------
const PANEL: React.CSSProperties = {
  padding: 'var(--space-5) var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  color: 'var(--color-text-primary)',
  overflowY: 'auto',
};
const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-3) 0',
  borderBottom: '1px solid var(--color-border-subtle)',
  gap: 'var(--space-3)',
};
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500 };
const DESC: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 };
const TITLE: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginTop: 'var(--space-3)', marginBottom: 4 };
const SECTION: React.CSSProperties = {
  background: 'var(--color-bg-elevated)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 10,
  padding: '4px 14px',
};
const BTN: React.CSSProperties = {
  padding: '6px var(--space-3)',
  fontSize: 12,
  borderRadius: 4,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-hover)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
};
const BTN_DANGER: React.CSSProperties = {
  ...BTN,
  borderColor: 'rgba(255,69,58,0.4)',
  color: 'var(--color-error)',
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  background: 'var(--color-accent-fill)',
  color: 'var(--color-accent-text)',
  border: 'none',
};
const TEXTAREA: React.CSSProperties = {
  width: '100%',
  minHeight: 70,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: 'var(--space-2)',
  borderRadius: 4,
  border: '1px solid var(--color-border-subtle)',
  background: 'var(--color-bg-base)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
  resize: 'vertical',
};

// ===========================================================================
// 1. Permissions Panel
// ===========================================================================
/** One row of `webPermissions:list` (src-tauri/src/webview_permissions.rs). */
type WebPolicy = 'allow' | 'ask' | 'deny';
interface WebPermission {
  id: string;
  label: string;
  description: string;
  policy: WebPolicy;
  default: WebPolicy;
  lastRequestedAt: number | null;
  lastDecision: WebPolicy | null;
}

const POLICY_LABEL: Record<WebPolicy, string> = { allow: 'Allow', ask: 'Ask', deny: 'Block' };

function dexInvoke(): ((channel: string, ...args: unknown[]) => Promise<unknown>) | undefined {
  return (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex?.invoke;
}

function ago(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
}

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

// ---------------------------------------------------------------------------
// UKI Assistant Access — the AI half of the permission center.
// Surfaces uki/permissions.ts (describe/grant/revoke) so the user can see and
// control exactly what the assistant may access, and why. Rendered inside the
// PermissionsPanel below so "Permissions" is a single AI + system center, and
// `dex perms` ("grant or revoke from settings") now points at a real surface.
// ---------------------------------------------------------------------------
const STATUS_DOT: Record<CapabilityStatus, string> = {
  granted: 'var(--color-success, #30d158)',
  denied: 'var(--color-text-tertiary, #8e8e93)',
  'hard-denied': 'var(--color-error, #ff453a)',
};

const UkiAccessSection: React.FC = () => {
  const [caps, setCaps] = useState<CapabilityInfo[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setCaps(await describeCapabilities()); } catch { /* localStorage unavailable */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setGrant = useCallback(async (cap: Capability, scope: 'session' | 'persistent') => {
    setBusy(true);
    try { await grantCapability(cap, scope); await refresh(); }
    catch (err) { console.warn('[uki-perms] grant failed', err); }
    finally { setBusy(false); }
  }, [refresh]);

  const clearGrant = useCallback(async (cap: Capability) => {
    setBusy(true);
    try { await revokeCapability(cap); await refresh(); }
    catch (err) { console.warn('[uki-perms] revoke failed', err); }
    finally { setBusy(false); }
  }, [refresh]);

  const grantedCount = caps.filter(c => c.status === 'granted').length;

  const revokeAllUki = useCallback(async () => {
    if (!confirm('Revoke every UKI assistant capability?')) return;
    setBusy(true);
    try {
      for (const c of caps) {
        if (c.status === 'granted') await revokeCapability(c.capability);
      }
      await refresh();
    } finally { setBusy(false); }
  }, [caps, refresh]);

  return (
    <>
      <h3 style={TITLE}>UKI Assistant Access</h3>
      <p style={{ ...DESC, marginTop: 0, marginBottom: 'var(--space-2)' }}>
        What the UKI assistant may access, and why. Nothing is assumed — grant only
        what you want it to use. &ldquo;Allow once&rdquo; lapses automatically after 4 hours.
      </p>
      <div style={SECTION}>
        {caps.map((c) => {
          const granted = c.status === 'granted';
          const hard = c.status === 'hard-denied';
          return (
            <div key={c.capability} style={ROW}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...LABEL, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[c.status], flex: '0 0 auto' }} />
                  {c.label}
                  {granted && (
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                      {c.scope === 'persistent' ? 'Always' : timeLeft(c.expiresTs ?? 0)}
                    </span>
                  )}
                </div>
                <div style={DESC}>{c.rationale}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flex: '0 0 auto' }}>
                {hard ? (
                  <span style={{ fontSize: 11, color: 'var(--color-error)' }}>Blocked</span>
                ) : granted ? (
                  <button style={BTN_DANGER} onClick={() => clearGrant(c.capability)} disabled={busy}>Revoke</button>
                ) : (
                  <>
                    <button style={BTN} onClick={() => setGrant(c.capability, 'session')} disabled={busy} title="Grant for this session (4h)">Allow once</button>
                    <button style={BTN_PRIMARY} onClick={() => setGrant(c.capability, 'persistent')} disabled={busy} title="Grant until revoked">Always</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <button style={BTN_DANGER} onClick={revokeAllUki} disabled={busy || grantedCount === 0}>
          Revoke all assistant access ({grantedCount})
        </button>
      </div>
    </>
  );
};

export const PermissionsPanel: React.FC = () => {
  const [rows, setRows] = useState<WebPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const invoke = dexInvoke();

  const refresh = useCallback(async () => {
    if (!invoke) return;
    try {
      const list = await invoke('webPermissions:list');
      setRows(Array.isArray(list) ? (list as WebPermission[]) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [invoke]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setPolicy = useCallback(async (id: string, policy: WebPolicy) => {
    if (!invoke) return;
    setRows(prev => prev.map(r => (r.id === id ? { ...r, policy } : r)));
    const res = (await invoke('webPermissions:set', id, policy).catch(() => null)) as { success?: boolean; error?: string } | null;
    if (!res?.success) setError(res?.error ?? 'Could not save the change.');
    void refresh();
  }, [invoke, refresh]);

  const resetAll = useCallback(async () => {
    if (!invoke) return;
    await invoke('webPermissions:reset').catch(() => null);
    void refresh();
  }, [invoke, refresh]);

  const changed = rows.some(r => r.policy !== r.default);

  return (
    <div style={PANEL}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Permissions</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          What DEX itself may use. Allow and Block apply without a prompt; Ask shows the system prompt.
          Websites in the Browser always ask separately. What the UKI assistant may access is listed below.
        </p>
      </div>

      {!invoke && (
        <div style={DESC}>Available in the installed app.</div>
      )}
      {error && <div style={{ color: 'var(--color-error)', fontSize: 12 }}>{error}</div>}

      {invoke && (
        <div style={SECTION}>
          {rows.map(r => (
            <div key={r.id} style={ROW}>
              <div style={{ minWidth: 0 }}>
                <div style={LABEL}>{r.label}</div>
                <div style={DESC}>
                  {r.description}
                  {r.lastRequestedAt ? ` · Last requested ${ago(r.lastRequestedAt)}` : ''}
                </div>
              </div>
              <SegmentedControl
                aria-label={`${r.label} permission`}
                size="sm"
                options={(['allow', 'ask', 'deny'] as WebPolicy[]).map(p => ({ value: p, label: POLICY_LABEL[p] }))}
                value={r.policy}
                onChange={(p) => { if (r.policy !== p) void setPolicy(r.id, p as WebPolicy); }}
                style={{ flexShrink: 0 }}
              />
            </div>
          ))}
        </div>
      )}

      {invoke && (
        <div>
          <button style={BTN} onClick={resetAll} disabled={!changed}>Restore defaults</button>
        </div>
      )}

      <UkiAccessSection />
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
    if (raw) return { enabled: true, gutter: 6, cycleOnRepeat: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { enabled: true, gutter: 6, cycleOnRepeat: true };
}

function saveSnapPrefs(p: SnapPrefs): void {
  try { localStorage.setItem(SNAP_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// The real bindings (AppManager.tsx keydown handler + detectDragSnapZone).
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl + Alt + ← / Win + ←', label: 'Snap to the left half (repeat: two-thirds, then one-third)' },
  { keys: 'Ctrl + Alt + → / Win + →', label: 'Snap to the right half (repeat: two-thirds, then one-third)' },
  { keys: 'Win + ↑', label: 'Maximize' },
  { keys: 'Ctrl + Alt + ↓ / Win + ↓', label: 'Minimize / restore' },
  { keys: 'Alt + Shift + ↑ / ↓', label: 'Top / bottom half' },
  { keys: 'Alt + Shift + ← / →', label: 'Top-left / top-right quadrant' },
  { keys: 'Double-click the title bar', label: 'Maximize / restore' },
  { keys: 'Drag to the top or bottom edge', label: 'Top / bottom half' },
  { keys: 'Drag to a side edge', label: 'Left / right half' },
  { keys: 'Drag to a corner', label: 'Quadrant' },
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
            <div style={DESC}>Press the same side shortcut again to cycle half → two-thirds → one-third.</div>
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
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '3px var(--space-2)',
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
            fontSize: 11, padding: '3px 10px', borderRadius: 9999,
            background: keyState?.configured ? 'var(--color-success-muted, rgba(48,209,88,0.15))' : 'var(--color-warning-muted, rgba(255,159,10,0.15))',
            color: keyState?.configured ? 'var(--color-success)' : 'var(--color-warning)',
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
            fontSize: 11, padding: '3px 10px', borderRadius: 9999,
            background: planTier === 'power' ? 'var(--color-accent-light)' : 'var(--color-bg-hover)',
            color: planTier === 'power' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
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
              <div style={{ padding: 'var(--space-2) 0' }}>
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
            <div style={{ padding: 'var(--space-2) 0' }}>
              <textarea
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder="Hex-encoded Ed25519 signature (128 hex chars)..."
                style={TEXTAREA}
                aria-label="Signature"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
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
          padding: 10, borderRadius: 4, fontSize: 12,
          background: verifyMsg.startsWith('Unlocked') ? 'var(--color-success-muted, rgba(48,209,88,0.1))' : 'var(--color-error-muted, rgba(255,69,58,0.1))',
          color: verifyMsg.startsWith('Unlocked') ? 'var(--color-success)' : 'var(--color-error)',
        }}>{verifyMsg}</div>
      )}
    </div>
  );
};
