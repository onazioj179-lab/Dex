// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * NexusUkiPanel — makes Nexus actually "driven by UKI".
 *
 * The ukiStore already carries UKI's live "mind" (conversation history, the
 * rewindable reasoning trail, memory stats, and knowledge nodes — the store
 * comments literally say these are "for Nexus visualization"), but nothing
 * rendered them. This panel surfaces that real data in the Nexus / Task Manager
 * overview: current status, memory footprint, recent turns, reasoning steps, and
 * the knowledge graph as chips. Solid + token-styled to match the OS; folds via
 * the shared CollapsibleSection; degrades to a calm empty state before UKI has
 * done anything. No fabricated data — everything reads straight from the store.
 */

import React, { useMemo } from 'react';
import { useUkiStore, type UkiUIState } from '../store/ukiStore';
import { useUkiTasks, type UkiTaskStatus } from '../store/ukiTasksStore';
import { CollapsibleSection } from './CollapsibleSection';

const STATE_LABEL: Record<UkiUIState, string> = {
  dormant: 'Asleep',
  idle: 'Idle',
  listening: 'Listening',
  processing: 'Processing',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
};

const STATE_TONE: Record<UkiUIState, string> = {
  dormant: 'var(--color-text-tertiary)',
  idle: 'var(--color-text-secondary)',
  listening: 'var(--color-accent)',
  processing: 'var(--color-accent)',
  thinking: 'var(--color-accent)',
  speaking: 'var(--color-accent)',
  error: 'var(--color-error, #ff453a)',
};

function timeAgo(ts: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 8px',
  borderRadius: 'var(--radius-full, 999px)',
  fontSize: 11,
  fontWeight: 600,
  backgroundColor: 'var(--color-bg-hover)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--color-border-subtle)',
  color: 'var(--color-text-secondary)',
  whiteSpace: 'nowrap',
};

const TASK_TONE: Record<UkiTaskStatus, string> = {
  pending: 'var(--color-text-tertiary)',
  running: 'var(--color-accent)',
  stalled: 'var(--color-warning, #ff9f0a)',
  done: 'var(--color-success, #32d74b)',
  failed: 'var(--color-error, #ff453a)',
};

const NexusUkiPanel: React.FC = () => {
  const state = useUkiStore((s) => s.state);
  const memoryStats = useUkiStore((s) => s.memoryStats);
  const conversationHistory = useUkiStore((s) => s.conversationHistory);
  const thoughtTrail = useUkiStore((s) => s.thoughtTrail);
  const knowledgeNodes = useUkiStore((s) => s.knowledgeNodes);
  const bgTasks = useUkiTasks((s) => s.tasks);
  const clearFinished = useUkiTasks((s) => s.clearFinished);

  // Full history (newest first), capped for perf. Nexus "houses UKI histories":
  // the user scrolls this to see past turns / what was worked on over time.
  const historyTurns = useMemo(() => [...conversationHistory].slice(-40).reverse(), [conversationHistory]);
  const recentThoughts = useMemo(() => thoughtTrail.slice(-5).reverse(), [thoughtTrail]);
  const topNodes = useMemo(
    () => [...knowledgeNodes].sort((a, b) => b.weight - a.weight).slice(0, 12),
    [knowledgeNodes],
  );
  // Active work first, then most recent — capped for the panel.
  const recentTasks = useMemo(() => {
    const rank = (s: UkiTaskStatus) => (s === 'running' || s === 'stalled' ? 0 : s === 'pending' ? 1 : 2);
    return [...bgTasks].sort((a, b) => rank(a.status) - rank(b.status) || b.updatedAt - a.updatedAt).slice(0, 6);
  }, [bgTasks]);
  const hasFinishedTasks = useMemo(() => bgTasks.some(t => t.status === 'done' || t.status === 'failed'), [bgTasks]);

  const hasData = conversationHistory.length > 0 || thoughtTrail.length > 0 || knowledgeNodes.length > 0 || bgTasks.length > 0;

  return (
    <CollapsibleSection
      label="UKI Activity"
      storageKey="dex-nexus-uki-collapsed"
      style={{ marginBottom: 'var(--space-3, 12px)' }}
      headerAccessory={
        <span style={{ ...chip, color: STATE_TONE[state], borderColor: 'var(--color-border-subtle)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: STATE_TONE[state] }} />
          {STATE_LABEL[state]}
        </span>
      }
      icon={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      }
    >
      {/* Memory footprint */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={chip}>
          Memory: {memoryStats.available ? `${memoryStats.totalRecords} records` : 'unavailable'}
        </span>
        {memoryStats.available && memoryStats.totalEver > 0 && (
          <span style={chip}>{memoryStats.totalEver} total ever</span>
        )}
        <span style={chip}>{conversationHistory.length} turns</span>
        <span style={chip}>{thoughtTrail.length} reasoning steps</span>
      </div>

      {!hasData && (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 0' }}>
          UKI hasn't done anything yet this session. Ask her something and her reasoning, memory, and knowledge will show up here.
        </div>
      )}

      {/* Background tasks — UKI's own work ledger (agent runs, automations) */}
      {recentTasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Background Tasks</div>
            {hasFinishedTasks && (
              <button
                onClick={clearFinished}
                aria-label="Clear finished background tasks"
                style={{
                  marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 10.5, color: 'var(--color-text-tertiary)', padding: '1px 4px',
                }}
              >
                Clear finished
              </button>
            )}
          </div>
          {recentTasks.map((t) => {
            const lastStep = t.steps[t.steps.length - 1];
            const detail = t.status === 'failed' ? (t.error || 'Failed')
              : t.status === 'done' ? (t.result || 'Done')
              : lastStep ? lastStep.label
              : 'Waiting for first step';
            return (
              <div key={t.id} style={{ ...chip, display: 'block', whiteSpace: 'normal', width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-md, 8px)', fontWeight: 400 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: TASK_TONE[t.status] }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: TASK_TONE[t.status], textTransform: 'uppercase', flexShrink: 0 }}>{t.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{timeAgo(t.updatedAt)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as any }}>{detail}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* History — full scrollable UKI conversation timeline (newest first). */}
      {historyTurns.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>History · {conversationHistory.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
          {historyTurns.map((t) => (
            <div key={t.id} style={{ ...chip, display: 'block', whiteSpace: 'normal', width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md, 8px)', fontWeight: 400 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: t.success ? 'var(--color-accent)' : 'var(--color-error, #ff453a)', textTransform: 'uppercase' }}>{t.intent || 'chat'}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>{timeAgo(t.timestamp)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as any }}>{t.userText}</div>
              {t.response && (
                <div style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{t.response}</div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Reasoning trail */}
      {recentThoughts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Reasoning</div>
          {recentThoughts.map((th) => (
            <div key={th.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, flexShrink: 0, background: th.success ? 'var(--color-accent)' : 'var(--color-error, #ff453a)' }} />
              <span style={{ color: 'var(--color-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={th.query}>{th.query}</span>
              <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>{th.intent}</span>
              <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{Math.round(th.latencyMs)}ms</span>
            </div>
          ))}
        </div>
      )}

      {/* Knowledge nodes */}
      {topNodes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>Knowledge</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {topNodes.map((n) => (
              <span key={n.id} style={{ ...chip, borderColor: (n.color || 'var(--color-border-subtle)') }} title={`${n.category} · weight ${n.weight}`}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: n.color || 'var(--color-accent)' }} />
                {n.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
};

export default NexusUkiPanel;
