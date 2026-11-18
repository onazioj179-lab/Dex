// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI approval sheet: the one place a person says yes or no to something UKI
 * wants to do. Shows exactly what will happen (the command, the folder, the
 * class Xack gave it) and, where the request supports it, a session-only
 * "remember" choice. Escape and the backdrop deny. Answers go to Xack
 * (`xack:decide`) through the caller, never from the model.
 */

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SegmentedControl } from './controls/SegmentedControl';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Z_DROPDOWN_BASE } from '../../shared/zIndex';
import {
  answerApproval,
  currentApproval,
  pendingApprovalCount,
  registerApprovalHost,
  subscribeApprovals,
} from '../uki/approvals';
import { XACK_CLASS_TEXT, type XackRemember } from '../uki/xack';

const REMEMBER_LABEL: Record<XackRemember, string> = {
  once: 'Just this once',
  exact: 'This session',
  'scope-read': 'Read-only here',
};
const REMEMBER_TITLE: Record<XackRemember, string> = {
  once: 'Ask again next time',
  exact: 'Allow exactly this again until DEX restarts',
  'scope-read': 'Allow commands that only read, in this folder, until DEX restarts',
};

export function UkiApprovalHost(): React.ReactElement | null {
  useEffect(() => registerApprovalHost(), []);
  const req = useSyncExternalStore(subscribeApprovals, currentApproval, currentApproval);
  const waiting = useSyncExternalStore(subscribeApprovals, pendingApprovalCount, pendingApprovalCount);
  const allowRef = useRef<HTMLButtonElement>(null);
  const [remember, setRemember] = useState<XackRemember>('once');

  useEffect(() => {
    setRemember('once'); // every request starts at the narrowest choice
    if (req) requestAnimationFrame(() => allowRef.current?.focus());
  }, [req]);

  if (!req) return null;
  const deny = () => answerApproval({ allow: false, remember: 'once' });
  const sensitive = req.cls === 'external' || req.cls === 'execute' || req.cls === 'privileged';

  return (
    <Modal
      open
      onClose={deny}
      size="sm"
      title={`UKI wants to ${req.title}`}
      zIndexOverride={Z_DROPDOWN_BASE + 50}
      testIdPrefix="uki-approval"
      footer={
        <div style={footer}>
          <Button variant="ghost" size="md" onClick={deny} data-testid="uki-approval-deny">Don't allow</Button>
          <Button ref={allowRef} variant="primary" size="md" onClick={() => answerApproval({ allow: true, remember })} data-testid="uki-approval-allow">
            {remember === 'once' ? 'Allow once' : 'Allow'}
          </Button>
        </div>
      }
    >
      <div style={body} data-testid="uki-approval-dialog">
        <div style={req.code ? codeBox : subjectText}>{req.subject}</div>
        {req.facts && req.facts.length > 0 && (
          <dl style={factsGrid}>
            {req.facts.map((f) => (
              <React.Fragment key={f.label}>
                <dt style={factLabel}>{f.label}</dt>
                <dd style={factValue}>{f.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
        <div style={metaRow}>
          {req.cls && (
            <span style={{ ...classChip, ...(sensitive ? classChipStrong : null) }} data-testid="uki-approval-class">
              {XACK_CLASS_TEXT[req.cls]}
            </span>
          )}
          {req.reason && <span style={reasonText}>{req.reason}</span>}
        </div>
        {(req.remember ?? []).length > 0 && (
          <div style={rememberRow}>
            <span style={factLabel}>Remember</span>
            <SegmentedControl
              size="sm"
              aria-label="Remember this approval"
              value={remember}
              onChange={setRemember}
              options={(['once', ...(req.remember ?? [])] as XackRemember[]).map((r) => ({ value: r, label: REMEMBER_LABEL[r], title: REMEMBER_TITLE[r], testId: `uki-approval-remember-${r}` }))}
            />
          </div>
        )}
        <div style={footnote}>
          Checked by Xack and kept in UKI's action history.
          {waiting > 1 ? ` ${waiting - 1} more waiting.` : ''}
        </div>
      </div>
    </Modal>
  );
}

const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, width: '100%' };
const rememberRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
const body: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const subjectText: React.CSSProperties = { fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-primary, #fff)', overflowWrap: 'anywhere' };
const codeBox: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, "Cascadia Code", Consolas, monospace)', fontSize: 12.5, lineHeight: 1.5,
  padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-inset, rgba(0,0,0,0.35))',
  border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))', color: 'var(--color-text-primary, #fff)',
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto',
};
const factsGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4, margin: 0 };
const factLabel: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-tertiary, rgba(255,255,255,0.5))' };
const factValue: React.CSSProperties = { margin: 0, fontSize: 12, color: 'var(--color-text-secondary, rgba(255,255,255,0.75))', overflowWrap: 'anywhere' };
const metaRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const classChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
  background: 'var(--color-bg-hover, rgba(255,255,255,0.08))', color: 'var(--color-text-secondary, rgba(255,255,255,0.8))',
};
const classChipStrong: React.CSSProperties = { background: 'color-mix(in srgb, var(--color-accent, #0A84FF) 18%, transparent)', color: 'var(--color-accent, #0A84FF)' };
const reasonText: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-tertiary, rgba(255,255,255,0.55))' };
const footnote: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-tertiary, rgba(255,255,255,0.45))' };
