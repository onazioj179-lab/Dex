// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX UkiApprovalCard
 * -----------------------------------------------------------------------------
 * Inline approval gate rendered by UkiOverlay whenever ActionBus emits
 * `plan:awaiting-approval`. Shows the destructive plan, lists every step, and
 * gives the user three buttons: Run, Edit (cancels — user re-types), Cancel.
 *
 * Pure presentational component; the parent owns the plan + handlers.
 */

// DEX v3.8.0 - UkiApprovalCard

import * as React from 'react';
import type { PlanGraph } from '../../shared/types/plan-graph';

interface Props {
  plan: PlanGraph;
  onApprove: () => void;
  onDeny: () => void;
}

const riskColor: Record<string, string> = {
  safe: '#3fb950',
  reversible: '#d29922',
  destructive: '#f85149',
};

export const UkiApprovalCard: React.FC<Props> = ({ plan, onApprove, onDeny }) => {
  return (
    <div
      role="dialog"
      aria-label="Approve plan"
      style={{
        margin: '8px 0',
        padding: 12,
        borderRadius: 10,
        background: 'rgba(248, 81, 73, 0.08)',
        border: `1px solid ${riskColor[plan.risk] || '#666'}`,
        color: 'inherit',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          aria-label={`Risk: ${plan.risk}`}
          style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 8,
            background: riskColor[plan.risk] || '#666',
          }}
        />
        <strong>Approve {plan.steps.length}-step plan</strong>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 11 }}>{plan.risk}</span>
      </div>
      <div style={{ opacity: 0.85, marginBottom: 8, fontStyle: 'italic' }}>
        &ldquo;{plan.utterance}&rdquo;
      </div>
      <ol style={{ margin: '0 0 10px 18px', padding: 0 }}>
        {plan.steps.map((s) => (
          <li key={s.id} style={{ marginBottom: 4 }}>
            <span style={{ color: riskColor[s.risk] || 'inherit' }}>•</span>{' '}
            {s.label}{' '}
            <code style={{ opacity: 0.55, fontSize: 11 }}>{s.action}</code>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDeny}
          style={{
            padding: '4px 12px', borderRadius: 6,
            border: '1px solid rgba(127,127,127,0.4)',
            background: 'transparent', color: 'inherit', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApprove}
          style={{
            padding: '4px 12px', borderRadius: 6,
            border: 'none', background: '#238636', color: '#fff', cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Run
        </button>
      </div>
    </div>
  );
};

export default UkiApprovalCard;
