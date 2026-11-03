// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SystemIntegrityPanel — the visible face of the IntegrityMonitor and the
 * PerformanceMonitor alert queue, shown in Task Manager.
 *
 * Both monitors already run in the background (started from App.tsx), but
 * their results were never rendered. This lists every integrity check with its
 * last result, any open performance alerts (dismissable), and lets the user
 * re-run the checks or copy a diagnostic report.
 */

import React, { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { useIntegrityMonitor, INTEGRITY_CHECKS } from '../services/IntegrityMonitor';
import { usePerformanceMonitor, usePerformanceAlerts } from '../services/PerformanceMonitor';

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
  borderRadius: 9999, fontSize: 11, fontWeight: 600,
  background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)',
  color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
};

const actionBtn: React.CSSProperties = {
  padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 9999, cursor: 'pointer',
  border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-hover)',
  color: 'var(--color-text-primary)',
};

const HEALTH_TONE: Record<string, string> = {
  healthy: 'var(--color-success, #32d74b)',
  warning: 'var(--color-warning, #ff9f0a)',
  error: 'var(--color-error, #ff453a)',
  critical: 'var(--color-error, #ff453a)',
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'Healthy', warning: 'Warnings', error: 'Errors', critical: 'Critical',
};

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

/** Flattens a check's details into readable lines (issues / zombies arrays). */
function detailLines(details: Record<string, unknown> | undefined): string[] {
  if (!details) return [];
  const out: string[] = [];
  for (const key of ['issues', 'zombies']) {
    const v = details[key];
    if (Array.isArray(v)) out.push(...v.map(String));
  }
  return out;
}

const SystemIntegrityPanel: React.FC = () => {
  const lastResults = useIntegrityMonitor(s => s.lastResults);
  const lastFullCheckAt = useIntegrityMonitor(s => s.lastFullCheckAt);
  const health = useIntegrityMonitor(s => s.getOverallHealth());
  const { alerts } = usePerformanceAlerts();
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  const failed = Array.from(lastResults.values()).filter(r => !r.passed).length;
  const ran = lastResults.size;

  const runAll = () => useIntegrityMonitor.getState().runAllChecks();

  const copyReport = async () => {
    const report = useIntegrityMonitor.getState().generateDiagnosticReport();
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    setTimeout(() => setCopied('idle'), 2000);
  };

  const tone = HEALTH_TONE[health] ?? HEALTH_TONE.healthy;

  return (
    <CollapsibleSection
      label="System Health"
      storageKey="dex-nexus-integrity-collapsed"
      defaultCollapsed
      style={{ marginBottom: 'var(--space-3, 12px)' }}
      headerAccessory={
        <span style={{ ...chip, color: tone }} data-integrity-health={health}>
          <span style={{ width: 6, height: 6, borderRadius: 9999, background: tone }} />
          {ran === 0 ? 'Not checked yet' : HEALTH_LABEL[health]}
          {alerts.length > 0 && ` · ${alerts.length} alert${alerts.length === 1 ? '' : 's'}`}
        </span>
      }
      icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" />
        </svg>
      }
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button style={actionBtn} onClick={runAll}>Run checks</button>
        <button style={actionBtn} onClick={copyReport} aria-live="polite">
          {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy diagnostic report'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {lastFullCheckAt ? `Full check ${ago(lastFullCheckAt)}` : `${ran}/${INTEGRITY_CHECKS.length} checks run`}
          {failed > 0 && ` · ${failed} failing`}
        </span>
      </div>

      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {INTEGRITY_CHECKS.map(check => {
          const r = lastResults.get(check.type);
          const dot = !r ? 'var(--color-text-tertiary)'
            : r.passed ? HEALTH_TONE.healthy
            : r.severity === 'warning' ? HEALTH_TONE.warning : HEALTH_TONE.error;
          const lines = r && !r.passed ? detailLines(r.details) : [];
          return (
            <div key={check.type} role="listitem" data-check={check.type} style={{ padding: '4px 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, flexShrink: 0, background: dot }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1, minWidth: 0 }} title={check.description}>
                  {check.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {r ? `${r.message} · ${ago(r.timestamp)}` : 'Pending'}
                </span>
              </div>
              {lines.length > 0 && (
                <ul style={{ margin: '2px 0 0 14px', padding: 0, listStyle: 'none', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {lines.slice(0, 5).map((l, i) => <li key={i}>{l}</li>)}
                  {lines.length > 5 && <li style={{ color: 'var(--color-text-tertiary)' }}>+{lines.length - 5} more</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {alerts.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.02em', flex: 1 }}>
              Performance alerts
            </span>
            <button
              style={{ ...actionBtn, padding: '2px 10px', fontSize: 11 }}
              onClick={() => usePerformanceMonitor.getState().clearAlerts()}
            >
              Clear all
            </button>
          </div>
          {alerts.slice(-8).reverse().map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6,
              background: 'var(--color-bg-hover)', borderLeft: `2px solid ${a.severity === 'critical' ? HEALTH_TONE.error : HEALTH_TONE.warning}`,
            }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1, minWidth: 0 }}>{a.message}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{ago(a.timestamp)}</span>
              <button
                onClick={() => usePerformanceMonitor.getState().acknowledgeAlert(a.id)}
                aria-label={`Dismiss alert: ${a.message}`}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 13, lineHeight: 1 }}
              >×</button>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
};

export default SystemIntegrityPanel;
