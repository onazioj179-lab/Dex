// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DiagnosticsPanel -- live system diagnostics overlay for DEX.
 *
 * Displays:
 *   - Heap utilization (from MemorySentinel)
 *   - Render budget histograms (from rendererMetrics)
 *   - Heartbeat / freeze status
 *   - Recent logs (LogsPanel embed)
 *
 * W6#307-310: observability overlay
 *
 * NOTE: Deliberately NOT routed through the shell ModalHost / ui/Modal. This is
 * a corner-anchored (bottom-right), backdrop-less panel meant to coexist with
 * the live app (MiniPulse toggles it), not a centered, screen-dimming dialog.
 * Forcing it onto the modal surface would change its placement and block the
 * shell underneath -- a regression. It is a separate overlay surface by design.
 */

import React, { useEffect, useState } from 'react';
import { rendererMetrics, type MetricSnapshot } from '../../shared/metrics';
import LogsPanel from './LogsPanel';
import { Z_DIAGNOSTICS } from '../../shared/zIndex';

interface DiagnosticsPanelProps {
  open: boolean;
  onClose?: () => void;
}

function formatMB(mb: number): string {
  return `${mb.toFixed(1)} MB`;
}

function percent(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ open, onClose }) => {
  const [snapshots, setSnapshots] = useState<MetricSnapshot[]>([]);
  const [timeline, setTimeline] = useState<{ totalMs: number; phases: { name: string; durationMs: number }[] } | null>(null);
  const [crashes, setCrashes] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (document.hidden) return;
      setSnapshots(rendererMetrics.snapshots());
    };
    update();
    const id = setInterval(update, 2000);
    return () => clearInterval(id);
  }, [open]);

  // Fetch startup timeline once when panel opens
  useEffect(() => {
    if (!open) return;
    const diag = (window as any).dexDiagnostics;
    if (diag?.getStartupTimeline) {
      diag.getStartupTimeline()
        .then((t: any) => { if (t && Array.isArray(t.phases)) setTimeline(t); })
        .catch(() => { /* main process may not be ready */ });
    }
  }, [open]);

  // Crash reports from the main-process DiagnosticsController (unhandled
  // exceptions / rejections / GPU + worker crashes). Surfaces history that the
  // overlay never showed; degrades to an empty state without the native bridge.
  useEffect(() => {
    if (!open) return;
    const getCrashReports = (window as any).dex?.diagnostics?.getCrashReports;
    if (typeof getCrashReports !== 'function') return;
    let cancelled = false;
    getCrashReports()
      .then((list: any[]) => { if (!cancelled && Array.isArray(list)) setCrashes(list); })
      .catch(() => { /* main process may not be ready */ });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const heap = snapshots.find(s => s.name === 'renderer.heap.used');
  const heartbeat = snapshots.find(s => s.name === 'renderer.heartbeat.sent');
  const freezes = snapshots.find(s => s.name === 'renderer.freeze.detected');

  const renderBudgets = snapshots.filter(s => s.name.startsWith('renderer.render.'));

  return (
    <div
      role="dialog"
      aria-label="System diagnostics"
      aria-modal="true"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 520,
        maxHeight: '80vh',
        zIndex: Z_DIAGNOSTICS,
        background: 'var(--pg-surface-overlay, rgba(10,10,14,0.97))',
        border: '1px solid var(--pg-border-subtle, rgba(255,255,255,0.10))',
        borderRadius: 10,
        boxShadow: 'var(--pg-shadow-modal)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'var(--blur-lg)',
        WebkitBackdropFilter: 'var(--blur-lg)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px var(--space-4)', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ color: 'var(--pg-text-primary, #e2e8f0)', fontWeight: 600, fontSize: 13, letterSpacing: '0.02em' }}>
          System Diagnostics
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close diagnostics panel"
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, color: 'var(--pg-text-secondary)', cursor: 'pointer',
              padding: '2px 10px', fontSize: 11,
            }}
          >
            Close
          </button>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Memory row */}
        <section aria-label="Memory">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>Memory</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            <Stat label="Heap used" value={heap ? formatMB(heap.value) : '--'} />
            <Stat label="Heartbeats" value={heartbeat ? String(heartbeat.value) : '--'} />
            <Stat label="Freezes" value={freezes ? String(freezes.value) : '0'} warn={(freezes?.value ?? 0) > 0} />
          </div>
        </section>

        {/* Render budgets */}
        {renderBudgets.length > 0 && (
          <section aria-label="Render budgets">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>Render Budgets</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
              {renderBudgets.map(s => (
                <Stat key={s.name} label={s.name.replace('renderer.render.', '')} value={`${s.value.toFixed(1)} ms`} warn={s.value > 16.67} />
              ))}
            </div>
          </section>
        )}

        {/* Startup timeline */}
        {timeline && timeline.phases.length > 0 && (
          <section aria-label="Startup timeline">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>
              Startup Timeline ({timeline.totalMs} ms total)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
              {[...timeline.phases].sort((a, b) => b.durationMs - a.durationMs).map(p => (
                <div key={p.name} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  color: p.durationMs > 500 ? 'var(--status-error, #ef4444)' : 'var(--pg-text-secondary, #9ca3af)',
                  padding: '2px var(--space-2)', background: 'rgba(255,255,255,0.03)', borderRadius: 4,
                }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{p.name}</span>
                  <span style={{ fontWeight: 600 }}>{p.durationMs} ms</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Crash reports */}
        <section aria-label="Crash reports">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>
            Crash Reports{crashes.length > 0 ? ` (${crashes.length})` : ''}
          </div>
          {crashes.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--pg-text-tertiary)' }}>No crashes recorded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {crashes.slice(0, 20).map((c, i) => (
                <div key={c.id || i} style={{ padding: '4px var(--space-2)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', fontSize: 11 }}>
                    <span style={{ fontWeight: 600, color: 'var(--status-error, #ef4444)' }}>{String(c.type || c.kind || c.reason || 'crash')}</span>
                    <span style={{ color: 'var(--pg-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{c.timestamp ? new Date(c.timestamp).toLocaleString() : String(c.time || '')}</span>
                  </div>
                  {(c.message || c.error || c.detail) && (
                    <div style={{ fontSize: 10, color: 'var(--pg-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {String(c.message || c.error || c.detail)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Live logs */}
        <section aria-label="Live logs">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'none', letterSpacing: '0.01em', marginBottom: 6 }}>Live Logs</div>
          <LogsPanel height={220} maxEntries={200} />
        </section>
      </div>
    </div>
  );
};

interface StatProps { label: string; value: string; warn?: boolean }
const Stat: React.FC<StatProps> = ({ label, value, warn }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
    padding: 'var(--space-2) 10px',
    border: `1px solid ${warn ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
  }}>
    <div style={{ fontSize: 10, color: 'var(--pg-text-tertiary)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, color: warn ? 'var(--status-error, #ef4444)' : 'var(--pg-text-primary, #e2e8f0)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

export default DiagnosticsPanel;
