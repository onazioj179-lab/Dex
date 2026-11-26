// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Settings › Software Update. One card says where DEX stands and offers the
// one next step (Update Now, Restart to Update, Try Again). Automatic checks
// are a switch. Earlier versions can be reinstalled (rollback): the installer's
// signature is verified natively and the data is backed up first.
import React, { useState } from 'react';
import DexIcon from './DexIcon';
import { Button } from '../ui/Button';
import { DexSwitch } from './controls/Switch';
import { useConfirm } from './ConfirmDialog';
import {
  useSoftwareUpdate, type UpdatePhase, type ReleaseVersion,
  listReleaseVersions, installReleaseVersion, compareVersions, getAutoCheck, setAutoCheck,
} from '../services/softwareUpdate';
import { isTauri } from '../services/platform/tauriCompat';
import { getBuildInfo, getDisplayVersion, getBundledAppVersion } from '../utils/appVersion';

const titles: Record<UpdatePhase, string> = {
  idle: 'Software Update',
  checking: 'Checking for updates…',
  current: 'DEX is up to date',
  available: 'Update available',
  downloading: 'Downloading…',
  verifying: 'Verifying…',
  ready: 'Ready to install',
  installing: 'Installing…',
  error: 'Update couldn’t finish',
};

const formatDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const card: React.CSSProperties = {
  border: '1px solid var(--color-border-subtle)', borderRadius: 14, background: 'var(--color-bg-surface)',
};
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-secondary)' };

export function SoftwareUpdatePanel() {
  const state = useSoftwareUpdate();
  const { phase, version, notes, received, total, error } = state;
  const desktop = isTauri();
  const stable = getBuildInfo().channel === 'stable';
  const hasUpdater = desktop && stable;
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(phase);
  const percent = total && total > 0 ? Math.min(100, Math.floor(received / total * 100)) : undefined;
  const installed = getBundledAppVersion();

  const [auto, setAuto] = useState(getAutoCheck);
  const [moreInfo, setMoreInfo] = useState(false);
  const [versions, setVersions] = useState<ReleaseVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState('');
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState('');
  const { confirm, ConfirmHost } = useConfirm();

  const loadVersions = async () => {
    setLoadingVersions(true);
    setVersionsError('');
    try { setVersions(await listReleaseVersions()); }
    catch (e) { setVersionsError(e instanceof Error ? e.message : String(e)); }
    finally { setLoadingVersions(false); }
  };

  const switchTo = async (v: string) => {
    const older = compareVersions(v, installed) < 0;
    const ok = await confirm({
      title: older ? `Go back to DEX ${v}?` : `Install DEX ${v}?`,
      confirmLabel: older ? 'Go Back' : 'Install',
      message: `Your data is backed up first. DEX then closes, installs ${v} and reopens. You can update again from here at any time.`,
    });
    if (!ok) return;
    setSwitching(v);
    setSwitchError('');
    const res = await installReleaseVersion(v);
    if (!res.ok) { setSwitching(null); setSwitchError(res.error ?? ''); }
  };

  const title = !stable ? 'Local build' : phase === 'available' ? `DEX ${version}` : titles[phase];
  const subtitle = !stable
    ? `DEX ${getDisplayVersion()}, built on this computer. Release builds update here.`
    : phase === 'available' ? `Installed: ${getDisplayVersion()}`
      : phase === 'ready' ? 'DEX restarts to finish. Save your work first.'
        : phase === 'downloading' && percent !== undefined ? `${percent}%`
          : `DEX ${getDisplayVersion()}`;

  const primary = !hasUpdater ? null
    : phase === 'available' ? <Button onClick={() => void state.download()}>Update Now</Button>
      : phase === 'ready' ? <Button onClick={() => void state.install()}>Restart to Update</Button>
        : busy ? <Button loading disabled>{titles[phase]}</Button>
          : <Button variant={phase === 'error' ? 'primary' : 'secondary'} onClick={() => void (phase === 'error' ? state.retry() : state.check())}>
            {phase === 'error' ? 'Try Again' : 'Check Now'}
          </Button>;

  return (
    <section aria-label="Software Update" style={{ width: '100%', height: '100%', boxSizing: 'border-box', overflowY: 'auto', padding: 'clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'grid', gap: 14 }}>
        {hasUpdater && (
          <div style={{ ...card, ...row }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Automatic updates</div>
              <div style={muted}>Check once a day and tell you when a new version is out.</div>
            </div>
            <DexSwitch checked={auto} label="Automatic updates" onChange={on => { setAuto(on); setAutoCheck(on); }} />
          </div>
        )}

        <div style={{ ...card, ...row, padding: 18, gap: 16 }}>
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 48, height: 48, flexShrink: 0,
            borderRadius: 10, background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            <DexIcon name={phase === 'current' ? 'check' : phase === 'error' ? 'alert-triangle' : 'refresh'} size={24} color="currentColor" />
          </span>
          <div role="status" aria-live="polite" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</div>
            <div style={{ ...muted, marginTop: 2 }}>{subtitle}</div>
            {(phase === 'downloading' || phase === 'verifying') && (
              <progress aria-label={phase === 'verifying' ? 'Verifying the update' : 'Update download progress'} max={100}
                value={phase === 'downloading' ? percent : undefined}
                style={{ width: '100%', height: 4, marginTop: 8, accentColor: 'var(--color-accent)' }} />
            )}
            {phase === 'error' && <div role="alert" style={{ fontSize: 12, marginTop: 4, color: 'var(--color-error)', overflowWrap: 'anywhere' }}>{error}</div>}
            {notes && phase !== 'current' && (
              <button type="button" onClick={() => setMoreInfo(v => !v)} aria-expanded={moreInfo}
                style={{ marginTop: 6, padding: 0, border: 'none', background: 'none', color: 'var(--color-accent)', fontSize: 12, cursor: 'pointer' }}>
                {moreInfo ? 'Less Info' : 'More Info…'}
              </button>
            )}
          </div>
          {primary}
        </div>
        {moreInfo && notes && (
          <div style={{ ...card, padding: 16, fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{notes}</div>
        )}

        {desktop && stable && (
          <div style={card}>
            <div style={{ ...row, borderBottom: versions?.length ? '1px solid var(--color-border-subtle)' : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Earlier versions</div>
                <div style={muted}>Go back to a previous release. Your data is backed up first.</div>
              </div>
              {versions === null && (
                <Button variant="secondary" size="sm" loading={loadingVersions} disabled={loadingVersions} onClick={() => void loadVersions()}>Show</Button>
              )}
            </div>
            {versionsError && <div role="alert" style={{ ...row, fontSize: 12, color: 'var(--color-error)' }}>{versionsError}</div>}
            {switchError && <div role="alert" style={{ ...row, fontSize: 12, color: 'var(--color-error)', overflowWrap: 'anywhere' }}>{switchError}</div>}
            {versions?.length === 0 && <div style={{ ...row, ...muted }}>No other versions are published yet.</div>}
            {versions?.map((v, i) => {
              const cmp = compareVersions(v.version, installed);
              return (
                <div key={v.version} style={{ ...row, borderTop: i ? '1px solid var(--color-border-subtle)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>DEX {v.version}</div>
                    <div style={muted}>{formatDate(v.publishedAt)}</div>
                  </div>
                  {cmp === 0 ? <span style={muted}>Installed</span>
                    : <Button variant="secondary" size="sm" loading={switching === v.version} disabled={!!switching}
                      onClick={() => void switchTo(v.version)}>{cmp < 0 ? 'Go Back' : 'Install'}</Button>}
                </div>
              );
            })}
          </div>
        )}
        {!desktop && <div style={{ ...muted, textAlign: 'center' }}>Install the Windows desktop app to update DEX in place.</div>}
      </div>
      <ConfirmHost />
    </section>
  );
}
