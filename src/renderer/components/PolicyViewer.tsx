// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================

// NOTE: Deliberately NOT routed through the shell ModalHost / ui/Modal yet.
// PolicyViewer doubles as an inline embed (compact mode returns bare content
// with no overlay) and, when shown as a dialog, uses Z_HELP_OVERLAY_MAX so it
// can stack above the Help overlay that opens it. Both concerns sit outside the
// standard modal layer; migrating risks the embedded path and the stacking
// guarantee. TODO: split the overlay shell from the content and route only the
// standalone-dialog path through the host once the host supports a higher
// zIndex override / nested-over-overlay use.
import React, { useMemo, useState } from 'react';
import {
  DATA_CATEGORIES,
  POLICY_CONTACT_EMAIL,
  POLICY_REPOSITORY_URL,
  type PolicySlug,
} from '../../shared/policies';
import { POLICY_DOCUMENTS } from '../../shared/policyDocuments';
import { Z_HELP_OVERLAY_MAX } from '../../shared/zIndex';

interface PolicyViewerProps {
  open?: boolean;
  initialPolicy?: PolicySlug;
  onClose?: () => void;
  compact?: boolean;
}

const panel: React.CSSProperties = {
  background: 'var(--pg-surface-overlay, rgba(10,10,14,0.97))',
  border: '1px solid var(--pg-border-subtle, rgba(255,255,255,0.10))',
  borderRadius: 6,
  color: 'var(--pg-text-primary, #e5e7eb)',
};

const tabButton = (active: boolean): React.CSSProperties => ({
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 4,
  background: active ? 'rgba(74,158,255,0.16)' : 'rgba(255,255,255,0.04)',
  color: active ? 'var(--color-accent, #4A9EFF)' : 'var(--pg-text-secondary, #9ca3af)',
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});

function renderPolicyBody(body: string): React.ReactNode {
  return body.split('\n').map((line, index) => {
    if (line.startsWith('# ')) {
      return <h2 key={index} style={{ fontSize: 18, margin: '0 0 10px', color: 'var(--pg-text-primary)' }}>{line.slice(2)}</h2>;
    }
    if (line.startsWith('## ')) {
      return <h3 key={index} style={{ fontSize: 13, margin: 'var(--space-4) 0 6px', color: 'var(--color-accent, #4A9EFF)' }}>{line.slice(3)}</h3>;
    }
    if (!line.trim()) return <div key={index} style={{ height: 6 }} />;
    return <p key={index} style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 7px', color: 'var(--pg-text-secondary, #cbd5e1)' }}>{line}</p>;
  });
}

const PolicyViewer: React.FC<PolicyViewerProps> = ({ open = true, initialPolicy = 'terms', onClose, compact = false }) => {
  const [active, setActive] = useState<PolicySlug>(initialPolicy);
  const selected = useMemo(() => POLICY_DOCUMENTS.find(p => p.slug === active) ?? POLICY_DOCUMENTS[0], [active]);

  if (!open) return null;

  const content = (
    <div style={{ ...panel, width: compact ? '100%' : 760, maxWidth: 'calc(100vw - 32px)', maxHeight: compact ? undefined : '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px var(--space-4)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>DEX Legal & Privacy</div>
          <div style={{ fontSize: 11, color: 'var(--pg-text-tertiary, #94a3b8)', marginTop: 3 }}>
            Required diagnostics, optional analytics, local personalization, and strict user rules.
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ ...tabButton(false), height: 32 }} aria-label="Close policy viewer">Close</button>
        )}
      </div>

      <div style={{ padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {POLICY_DOCUMENTS.map(policy => (
          <button key={policy.slug} onClick={() => setActive(policy.slug)} style={tabButton(active === policy.slug)}>
            {policy.title}
          </button>
        ))}
      </div>

      <div style={{ overflow: 'auto', padding: 'var(--space-4)' }}>
        <section style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: 11, color: 'var(--pg-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Summary
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 'var(--space-3)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{selected.title}</div>
            <div style={{ fontSize: 12, color: 'var(--pg-text-secondary, #cbd5e1)', lineHeight: 1.55 }}>{selected.summary}</div>
          </div>
        </section>

        {active === 'privacy' && (
          <section style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 11, color: 'var(--pg-text-tertiary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Data Categories
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-2)' }}>
              {DATA_CATEGORIES.map(category => (
                <div key={category.id} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pg-text-primary)' }}>{category.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-accent, #4A9EFF)', margin: '3px 0 6px' }}>{category.defaultState}</div>
                  <div style={{ fontSize: 11, color: 'var(--pg-text-secondary, #cbd5e1)', lineHeight: 1.45 }}>{category.purpose}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-label={`${selected.title} full text`}>
          {renderPolicyBody(selected.body)}
        </section>

        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--pg-text-tertiary, #94a3b8)', lineHeight: 1.5 }}>
          Contact: {POLICY_CONTACT_EMAIL}<br />Repository: {POLICY_REPOSITORY_URL}
        </div>
      </div>
    </div>
  );

  if (compact) return content;

  return (
    <div role="dialog" aria-modal="true" aria-label="DEX legal and privacy policy viewer" style={{ position: 'fixed', inset: 0, zIndex: Z_HELP_OVERLAY_MAX, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
      {content}
    </div>
  );
};

export default PolicyViewer;
