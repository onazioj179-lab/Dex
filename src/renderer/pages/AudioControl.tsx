// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invokePlatformIpc } from '../services/platform/ipc';
import { isTauri } from '../services/platform/tauriCompat';
import { Button } from '../ui/Button';

interface Volume { volume: number; muted: boolean }
interface Output { id: string; name: string; master: Volume | null }
interface Session extends Volume { id: string; device: string; name: string; active: boolean }
interface AudioSnapshot { outputs: Output[]; sessions: Session[]; currentOutput: string | null }
type Response<T = unknown> = ({ success: true } & T) | { success: false; error: string };
type Commit = (control: 'volume' | 'mute', value: number | boolean) => void;

function VolumeControl({ value, label, disabled, commit }: { value: Volume; label: string; disabled: boolean; commit: Commit }) {
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const shown = draft ?? value.volume;
  const reset = () => {
    pending.current = null;
    setDraft(null);
  };
  useEffect(() => { if (disabled) reset(); }, [disabled]);
  const apply = () => {
    const next = pending.current;
    reset();
    if (!disabled && next !== null && next !== value.volume) commit('volume', next);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input aria-label={label + ' volume'} aria-valuetext={shown + '%'} type="range" min="0" max="100" value={shown} disabled={disabled}
        onChange={e => { const next = Number(e.target.value); pending.current = next; setDraft(next); }}
        onPointerUp={apply} onKeyUp={apply} onBlur={apply}
        onPointerCancel={reset} />
      <span aria-hidden="true" style={{ minWidth: '4ch', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{shown}%</span>
      <Button size="xs" variant="subtle" aria-label={'Mute ' + label} aria-pressed={value.muted}
        disabled={disabled} onClick={() => commit('mute', !value.muted)}>
        Mute
      </Button>
    </div>
  );
}

export function AudioControl() {
  const [snapshot, setSnapshot] = useState<AudioSnapshot>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [actionError, setActionError] = useState('');
  const lifecycle = useRef<AbortController | null>(null);
  const updating = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const session = lifecycle.current;
    if (!session) return;
    const request = ++generation.current;
    setLoading(true);
    const result = await invokePlatformIpc<Response<AudioSnapshot>>('audio-control:snapshot');
    if (session.signal.aborted || request !== generation.current) return;
    setLoading(false);
    if (result?.success) {
      setSnapshot(result);
      setRefreshError('');
    } else {
      setRefreshError(result?.error ?? 'Native Audio Control is unavailable.');
    }
  }, []);

  useEffect(() => {
    const session = new AbortController();
    lifecycle.current = session;
    updating.current = false;
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (!updating.current) void refresh(); }, 150);
    };
    void refresh();
    window.addEventListener('focus', scheduleRefresh);
    if (isTauri()) {
      void listen('dex-audio-devices-changed', scheduleRefresh).then(dispose => {
        if (!session.signal.aborted) {
          unlisten = dispose;
          scheduleRefresh();
        } else dispose();
      }).catch(() => {});
    }
    return () => {
      session.abort();
      lifecycle.current = null;
      clearTimeout(timer);
      unlisten?.();
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [refresh]);

  const change = (device: string, session: string | null): Commit => async (field, value) => {
    const run = lifecycle.current;
    if (!run || updating.current || refreshError) return;
    updating.current = true;
    generation.current++;
    setBusy(true);
    setActionError('');
    try {
      const result = await invokePlatformIpc<Response>('audio-control:change', device, session, field, value);
      if (run.signal.aborted) return;
      if (!result?.success) setActionError(result?.error ?? 'Audio change failed.');
      await refresh();
    } finally {
      if (!run.signal.aborted) {
        updating.current = false;
        setBusy(false);
      }
    }
  };
  const systemSettings = async (mixer: boolean) => {
    const run = lifecycle.current;
    if (!run) return;
    setActionError('');
    const result = await invokePlatformIpc<Response>('audio-control:systemSettings', mixer);
    if (!run.signal.aborted && !result?.success) setActionError(result?.error ?? 'Could not open Windows sound settings.');
  };
  const defaultOutput = snapshot?.outputs.find(output => output.id === snapshot.currentOutput);

  return (
    <section aria-label="Audio Control" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" disabled={busy} loading={loading} onClick={() => {
          setActionError('');
          void refresh();
        }}>Refresh audio</Button>
        {snapshot && <>
          <Button size="sm" onClick={() => void systemSettings(false)}>Change output in Windows</Button>
          <Button size="sm" onClick={() => void systemSettings(true)}>Open Windows volume mixer</Button>
        </>}
      </div>
      {loading && !snapshot && <p role="status">Reading playback devices…</p>}
      {refreshError && <p role="status">{refreshError}{snapshot ? ' Showing the last device list.' : ''}</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {snapshot && <>
        <h3 style={{ margin: 0 }}>Playback devices</h3>
        {snapshot.outputs.length === 0 && <p>No connected playback devices.</p>}
        <ul style={{ margin: 0, paddingInlineStart: 22 }}>
          {snapshot.outputs.map(output => <li key={output.id}>
            {output.name}{output.id === snapshot.currentOutput && <strong> · Default</strong>}
          </li>)}
        </ul>
        {defaultOutput?.master && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <strong>Master volume</strong>
          <VolumeControl key={defaultOutput.id} label="Default output" value={defaultOutput.master} disabled={busy || !!refreshError}
            commit={change(defaultOutput.id, null)} />
        </div>}
        <h3 style={{ margin: 0 }}>Application audio sessions</h3>
        {snapshot.sessions.length === 0 && <p>Play audio in an application, then refresh to see its session.</p>}
        <ul style={{ display: 'grid', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {snapshot.sessions.map(session => (
            <li key={JSON.stringify([session.device, session.id])} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBlock: 6, borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div>
                <strong>{session.name}</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                  {snapshot.outputs.find(device => device.id === session.device)?.name || 'Playback device'} · {session.active ? 'Active' : 'Idle'}
                </div>
              </div>
              <VolumeControl label={session.name} value={session} disabled={busy || !!refreshError} commit={change(session.device, session.id)} />
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}
