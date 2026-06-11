// =============================================================================
// DEX Platform — Phase 3 renderer: Store developer panel (local install)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * The developer affordance for the DEX Store: trust a publisher's signing key
 * and sideload a signed `.dexplug` from disk through the FULL production
 * validation gate. The gate's checklist is shown verbatim so you can see
 * exactly why an app is approved or rejected before it installs — the answer to
 * "actually test it and confirm it's up to par, or reject it." Backed by
 * store:publisher:verify, store:local:pick, and store:local:install.
 */

import React, { useCallback, useState } from 'react';
import DexIcon from '../../components/DexIcon';
import { glassModal, premiumGlassOverlay, premiumGlassCard } from '../../styles/glassMenu';
import { ipc, toMessage, storeButton } from './storeKit';

type ValidationStatus = 'approved' | 'pending' | 'rejected';
interface ValidationCheck { id: string; label: string; passed: boolean; severity: 'block' | 'warn'; detail?: string }
interface ValidationReport { status: ValidationStatus; checks: ValidationCheck[]; reasons: string[]; evaluatedAt: number }
interface PickResult {
  filePath: string;
  fileName: string;
  report: ValidationReport;
  summary: { packageId: string; name: string; version: string; runtime: 'web' | 'native'; signed: boolean };
}
interface InstallResult { ok: boolean; packageId?: string; version?: string; runtime?: string; status: ValidationStatus; error?: string }

type Recognition = 'recognized' | 'partner' | 'first-party';

export default function DeveloperPanel({ onClose, onInstalled }: { onClose: () => void; onInstalled: (packageId: string) => void }): React.ReactElement {
  // --- Trust a publisher key ---
  const [pubId, setPubId] = useState('dex.app');
  const [pubKey, setPubKey] = useState('');
  const [recognition, setRecognition] = useState<Recognition>('first-party');
  const [trustMsg, setTrustMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [trusting, setTrusting] = useState(false);

  // --- Install from file ---
  const [pick, setPick] = useState<PickResult | null>(null);
  const [picking, setPicking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const trust = useCallback(async () => {
    setTrustMsg(null);
    if (!/^[0-9a-fA-F]{64}$/.test(pubKey.trim())) {
      setTrustMsg({ ok: false, text: 'Public key must be 64 hex characters (from `dex-codesign keygen`).' });
      return;
    }
    setTrusting(true);
    try {
      const r = await ipc().invoke('store:publisher:verify', pubId.trim(), pubKey.trim().toLowerCase(), recognition);
      setTrustMsg(r?.ok ? { ok: true, text: `Trusted. ${pubId.trim()} can now publish signed apps.` } : { ok: false, text: `Failed: ${r?.error ?? 'unknown error'}` });
      // Re-validate the already-picked file against the now-updated trust store.
      if (r?.ok && pick) {
        const re = (await ipc().invoke('store:local:validateFile', pick.filePath)) as PickResult | null;
        if (re) setPick(re);
      }
    } catch (e) {
      setTrustMsg({ ok: false, text: toMessage(e) });
    } finally {
      setTrusting(false);
    }
  }, [pubId, pubKey, recognition, pick]);

  const choose = useCallback(async () => {
    setPicking(true);
    setInstallMsg(null);
    try {
      const r = (await ipc().invoke('store:local:pick')) as PickResult | null;
      if (r) setPick(r);
    } catch (e) {
      setInstallMsg({ ok: false, text: toMessage(e) });
    } finally {
      setPicking(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (!pick) return;
    setInstalling(true);
    setInstallMsg(null);
    try {
      const r = (await ipc().invoke('store:local:install', pick.filePath)) as InstallResult;
      if (r.ok) {
        setInstallMsg({ ok: true, text: `Installed ${r.packageId} ${r.version ?? ''} (${r.runtime}).`.trim() });
        onInstalled(r.packageId ?? pick.summary.packageId);
      } else {
        setInstallMsg({ ok: false, text: `Install blocked: ${r.error ?? r.status}` });
      }
    } catch (e) {
      setInstallMsg({ ok: false, text: toMessage(e) });
    } finally {
      setInstalling(false);
    }
  }, [pick, onInstalled]);

  const report = pick?.report;
  const approved = report?.status === 'approved';

  return (
    <div style={styles.backdrop} onClick={onClose} role="presentation">
      <div style={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal aria-label="Developer install">
        <header style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={styles.headIcon}><DexIcon name="terminal" size={16} /></span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Developer</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>Trust a key and sideload a signed app through the production gate</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn} title="Close"><DexIcon name="close" size={16} /></button>
        </header>

        <div style={styles.body}>
          {/* 1. Trust a publisher key */}
          <section style={{ ...premiumGlassCard, padding: 14 }}>
            <div style={styles.stepTitle}><span style={styles.stepNum}>1</span> Trust a publisher key</div>
            <p style={styles.help}>
              From <code style={styles.code}>node scripts/dex-codesign.cjs keygen</code>, paste the PUBLIC KEY. This adds it to the trust store so its signed apps pass the gate.
            </p>
            <div style={styles.fieldRow}>
              <input aria-label="Publisher id" value={pubId} onChange={e => setPubId(e.target.value)} placeholder="publisher id (e.g. dex.app)" style={{ ...inputStyle, flex: '0 0 180px' }} />
              <select aria-label="Recognition" value={recognition} onChange={e => setRecognition(e.target.value as Recognition)} style={{ ...inputStyle, flex: '0 0 150px', cursor: 'pointer' }}>
                <option value="first-party">First-party (DEX)</option>
                <option value="partner">Partner</option>
                <option value="recognized">Recognized</option>
              </select>
            </div>
            <input aria-label="Public key hex" value={pubKey} onChange={e => setPubKey(e.target.value)} placeholder="64-hex Ed25519 public key" spellCheck={false} style={{ ...inputStyle, marginTop: 8, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {trustMsg ? <span style={{ fontSize: 12, color: trustMsg.ok ? 'var(--color-success)' : '#ff8a82', display: 'inline-flex', alignItems: 'center', gap: 6 }}><DexIcon name={trustMsg.ok ? 'check-circle' : 'alert-triangle'} size={13} />{trustMsg.text}</span> : <span />}
              <button type="button" style={storeButton('muted')} disabled={trusting} onClick={trust}><DexIcon name="shield" size={13} /> {trusting ? 'Trusting...' : 'Trust key'}</button>
            </div>
          </section>

          {/* 2. Install from file */}
          <section style={{ ...premiumGlassCard, padding: 14, marginTop: 12 }}>
            <div style={styles.stepTitle}><span style={styles.stepNum}>2</span> Install an app from file</div>
            <p style={styles.help}>
              Choose a signed <code style={styles.code}>.dexplug</code> (from <code style={styles.code}>dex-codesign sign &lt;appdir&gt;</code>). DEX re-runs the full validation gate before anything is written to disk.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" style={storeButton('muted')} disabled={picking} onClick={choose}><DexIcon name="folder" size={13} /> {picking ? 'Opening...' : 'Choose .dexplug...'}</button>
              {pick && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{pick.fileName}</span>}
            </div>

            {pick && (
              <div style={{ marginTop: 12 }}>
                {/* Summary */}
                <div style={styles.summaryRow}>
                  <Meta k="App" v={pick.summary.name || '(unknown)'} />
                  <Meta k="Package" v={pick.summary.packageId || '-'} />
                  <Meta k="Version" v={pick.summary.version || '-'} />
                  <Meta k="Runtime" v={pick.summary.runtime} />
                  <Meta k="Signed" v={pick.summary.signed ? 'yes' : 'no'} />
                </div>

                {/* Status banner */}
                <div style={{ ...styles.statusBanner, ...statusTone(pick.report.status) }}>
                  <DexIcon name={pick.report.status === 'approved' ? 'check-circle' : pick.report.status === 'pending' ? 'alert-triangle' : 'x-circle'} size={15} />
                  <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{pick.report.status}</span>
                  <span style={{ opacity: 0.85 }}>
                    {pick.report.status === 'approved' ? '- all checks pass, ready to install'
                      : pick.report.status === 'pending' ? '- passes safety but missing store metadata'
                        : '- blocked by one or more checks below'}
                  </span>
                </div>

                {/* Checklist */}
                <ul style={styles.checkList}>
                  {pick.report.checks.map(c => (
                    <li key={c.id} style={styles.checkRow}>
                      <span style={{ color: c.passed ? 'var(--color-success)' : c.severity === 'block' ? '#ff8a82' : '#ff9f0a', flexShrink: 0, marginTop: 1 }}>
                        <DexIcon name={c.passed ? 'check-circle' : c.severity === 'block' ? 'x-circle' : 'alert-triangle'} size={14} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, color: c.passed ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>{c.label}</span>
                        {!c.passed && c.detail && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{c.detail}</span>}
                        {!c.passed && c.id === 'publisher-known' && <span style={{ display: 'block', fontSize: 11, color: 'var(--color-accent)', marginTop: 1 }}>Trust this app's key in step 1, then re-choose the file.</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  {installMsg ? <span style={{ fontSize: 12, color: installMsg.ok ? 'var(--color-success)' : '#ff8a82', display: 'inline-flex', alignItems: 'center', gap: 6 }}><DexIcon name={installMsg.ok ? 'check-circle' : 'alert-triangle'} size={13} />{installMsg.text}</span> : <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Trusting a key re-validates this file automatically.</span>}
                  <button type="button" style={approved ? storeButton('accent') : storeButton('muted')} disabled={!approved || installing} onClick={install} title={approved ? 'Install this app' : 'Only an approved app can be installed'}>
                    <DexIcon name="download" size={14} /> {installing ? 'Installing...' : 'Install'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--color-text-tertiary)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{v}</span>
    </span>
  );
}

function statusTone(status: ValidationStatus): React.CSSProperties {
  if (status === 'approved') return { background: 'rgba(48,209,88,0.12)', border: '1px solid rgba(48,209,88,0.30)', color: 'var(--color-success)' };
  if (status === 'pending') return { background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.30)', color: '#ff9f0a' };
  return { background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.30)', color: '#ff8a82' };
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid var(--pg-border-strong)',
  borderRadius: 7,
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontSize: 13,
  boxSizing: 'border-box',
  minWidth: 0,
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: { ...premiumGlassOverlay, position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { ...glassModal, width: 'min(620px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', color: 'var(--color-text-primary)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--pg-border)' },
  headIcon: { width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', background: 'rgba(10,132,255,0.14)', border: '1px solid rgba(10,132,255,0.28)', flexShrink: 0 },
  closeBtn: { width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--pg-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0 },
  body: { padding: 16, overflowY: 'auto', minHeight: 0 },
  stepTitle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, marginBottom: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--color-accent)', background: 'rgba(10,132,255,0.16)', border: '1px solid rgba(10,132,255,0.30)' },
  help: { margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.5, color: 'var(--color-text-tertiary)' },
  code: { fontFamily: 'var(--font-mono, monospace)', fontSize: 11, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--pg-border)' },
  fieldRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  summaryRow: { display: 'flex', flexWrap: 'wrap', gap: '8px 18px', padding: '10px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--pg-border)' },
  statusBanner: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 12px', borderRadius: 7, fontSize: 12.5 },
  checkList: { listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  checkRow: { display: 'flex', gap: 9, alignItems: 'flex-start' },
};
