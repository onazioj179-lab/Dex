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
 */

import React, { useEffect, useState } from 'react';
import { rendererMetrics, type MetricSnapshot } from '../../shared/metrics';
import LogsPanel from './LogsPanel';

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
        zIndex: 9999,
        background: 'var(--pg-surface-overlay, rgba(10,10,14,0.97))',
        border: '1px solid var(--pg-border-subtle, rgba(255,255,255,0.10))',
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
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
              borderRadius: 6, color: 'var(--pg-text-secondary)', cursor: 'pointer',
              padding: '2px 10px', fontSize: 11,
            }}
          >
            Close
          </button>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Memory row */}
        <section aria-label="Memory">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Memory</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <Stat label="Heap used" value={heap ? formatMB(heap.value) : '--'} />
            <Stat label="Heartbeats" value={heartbeat ? String(heartbeat.value) : '--'} />
            <Stat label="Freezes" value={freezes ? String(freezes.value) : '0'} warn={(freezes?.value ?? 0) > 0} />
          </div>
        </section>

        {/* Render budgets */}
        {renderBudgets.length > 0 && (
          <section aria-label="Render budgets">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Render Budgets</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {renderBudgets.map(s => (
                <Stat key={s.name} label={s.name.replace('renderer.render.', '')} value={`${s.value.toFixed(1)} ms`} warn={s.value > 16.67} />
              ))}
            </div>
          </section>
        )}

        {/* Startup timeline */}
        {timeline && timeline.phases.length > 0 && (
          <section aria-label="Startup timeline">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Startup Timeline ({timeline.totalMs} ms total)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
              {[...timeline.phases].sort((a, b) => b.durationMs - a.durationMs).map(p => (
                <div key={p.name} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  color: p.durationMs > 500 ? 'var(--status-error, #ef4444)' : 'var(--pg-text-secondary, #9ca3af)',
                  padding: '2px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4,
                }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{p.name}</span>
                  <span style={{ fontWeight: 600 }}>{p.durationMs} ms</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live logs */}
        <section aria-label="Live logs">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Live Logs</div>
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
    borderRadius: 6,
    padding: '8px 10px',
    border: `1px solid ${warn ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
  }}>
    <div style={{ fontSize: 10, color: 'var(--pg-text-tertiary)', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, color: warn ? 'var(--status-error, #ef4444)' : 'var(--pg-text-primary, #e2e8f0)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

export default DiagnosticsPanel;
