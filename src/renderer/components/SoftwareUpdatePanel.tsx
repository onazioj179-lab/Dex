// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import React from 'react';
import DexIcon from './DexIcon';
import { Button } from '../ui/Button';
import { useSoftwareUpdate, type UpdatePhase } from '../services/softwareUpdate';
import { isTauri } from '../services/platform/tauriCompat';
import { getDisplayVersion } from '../utils/appVersion';
import { openWithShell } from '../utils/openWithShell';

const RELEASES = 'https://github.com/onazioj179-lab/Dex/releases/latest';
const progressLabels: Record<UpdatePhase, string> = {
  idle: 'Software Update',
  checking: 'Checking for updates…',
  current: 'DEX is up to date',
  available: 'An update is available',
  downloading: 'Downloading update…',
  verifying: 'Verifying update…',
  ready: 'Ready to install',
  installing: 'Installing and restarting…',
  error: 'Software update couldn’t finish',
};

export function SoftwareUpdatePanel() {
  const state = useSoftwareUpdate();
  const { phase, version, notes, received, total, error } = state;
  const desktop = isTauri();
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(phase);
  const percent = total && total > 0 ? Math.min(100, Math.floor(received / total * 100)) : undefined;
  const title = phase === 'available' ? `DEX ${version} is available` : progressLabels[phase];
  return (
    <section aria-label="Software Update" style={{ width: '100%', height: '100%', boxSizing: 'border-box', overflowY: 'auto', padding: 'clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 14, textAlign: 'center', padding: '28px 20px',
          border: '1px solid var(--color-border-subtle)', borderRadius: 18, background: 'var(--color-bg-surface)' }}>
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 52, height: 52,
            borderRadius: 14, background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            <DexIcon name={phase === 'current' || phase === 'ready' ? 'check' : 'refresh'} size={26} color="currentColor" />
          </span>
          <div role="status" aria-live="polite">
            <h2 style={{ margin: 0, fontSize: 21, color: 'var(--color-text-primary)' }}>{title}</h2>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>Installed version {getDisplayVersion()}</p>
          </div>
          {phase === 'downloading' || phase === 'verifying' ? (
            <div style={{ width: 'min(100%, 360px)', display: 'grid', gap: 5 }}>
              <progress aria-label={phase === 'verifying' ? 'Verifying the update' : 'Update download progress'} max={100}
                value={phase === 'downloading' ? percent : undefined}
                style={{ width: '100%', height: 6, accentColor: 'var(--color-accent)' }} />
              {phase === 'downloading' && percent !== undefined && <span style={{ fontSize: 12 }}>{percent}%</span>}
            </div>
          ) : null}
          {phase === 'ready' && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Save your work before restarting DEX.</p>}
          {phase === 'error' && <p role="alert" style={{ margin: 0, maxWidth: 420, fontSize: 13, color: 'var(--color-error)', overflowWrap: 'anywhere' }}>{error}</p>}
          {!desktop && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Install the Windows desktop app to enable in-app updates.</p>}
          {desktop && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {phase === 'available' ? <Button onClick={() => void state.download()}>Download update</Button>
                : phase === 'ready' ? <Button onClick={() => void state.install()}>Install and restart</Button>
                  : busy ? <Button loading disabled>{progressLabels[phase]}</Button>
                    : <Button onClick={() => void state.check()}>{phase === 'error' ? 'Try again' : 'Check for updates'}</Button>}
            </div>
          )}
        </div>
        {notes && <details style={{ color: 'var(--color-text-secondary)', fontSize: 13, padding: '0 4px' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-text-primary)' }}>What’s new in DEX {version}</summary>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notes}</p>
        </details>}
        <Button variant="ghost" size="sm" onClick={() => void openWithShell('external', RELEASES, 'DEX releases')} style={{ justifySelf: 'center' }}>
          View GitHub releases
        </Button>
      </div>
    </section>
  );
}
