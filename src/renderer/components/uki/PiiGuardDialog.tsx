// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PiiGuardDialog - confirm-before-send dialog that surfaces detected PII /
 * secrets in a prompt and lets the user choose to send raw, send redacted,
 * or cancel.
 *
 * Renders through the canonical ui/Modal surface (portal, backdrop, Escape,
 * focus trap, scroll lock, --z-modal layer) instead of hand-rolling its own
 * fixed-inset overlay. Escape / backdrop map to cancel.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React from 'react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

export interface PiiFinding {
  /** Type label, e.g. "email", "api-key", "ssn". */
  type: string;
  /** The matched substring (already truncated/safe to show). */
  match: string;
  /** Inclusive start offset in the source text. */
  start?: number;
  /** Exclusive end offset in the source text. */
  end?: number;
}

export interface PiiGuardDialogProps {
  open: boolean;
  /** Original user-typed text. */
  raw: string;
  /** Same text with PII / secrets redacted. */
  redacted: string;
  findings: PiiFinding[];
  onSendRedacted: () => void;
  onSendRaw: () => void;
  onCancel: () => void;
}

export function PiiGuardDialog({
  open, raw, redacted, findings, onSendRedacted, onSendRaw, onCancel,
}: PiiGuardDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      title="Sensitive data detected"
      testIdPrefix="pii-guard"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} data-testid="pii-cancel">Cancel</Button>
          <Button variant="secondary" onClick={onSendRaw} data-testid="pii-send-raw">Send original</Button>
          <Button variant="primary" onClick={onSendRedacted} data-testid="pii-send-redacted">Send redacted</Button>
        </>
      }
    >
      <div data-testid="pii-guard-dialog">
        <p style={{ margin: 0, color: colors.text.secondary, fontSize: fontSize.sm }}>
          We found {findings.length} item{findings.length === 1 ? '' : 's'} that look sensitive.
          Choose how to send this prompt to the model.
        </p>

        {findings.length > 0 && (
          <ul style={{
            listStyle: 'none', padding: space[2], margin: `${space[3]}px 0`,
            background: colors.bg.inset, borderRadius: radius.md,
            display: 'flex', flexDirection: 'column', gap: space[1],
            fontSize: fontSize.xs, color: colors.text.secondary, maxHeight: 140, overflowY: 'auto',
          }}>
            {findings.map((f, i) => (
              <li key={i} data-testid={`pii-finding-${i}`}>
                <span style={{ color: colors.semantic.warning, fontWeight: fontWeight.semibold }}>{f.type}</span>
                <span style={{ marginLeft: space[2], fontFamily: 'monospace' }}>{f.match}</span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3], marginTop: space[3] }}>
          <Pane title="Redacted (safe)" body={redacted} tone="success" />
          <Pane title="Original" body={raw} tone="warning" />
        </div>
      </div>
    </Modal>
  );
}

function Pane({ title, body, tone }: { title: string; body: string; tone: 'success' | 'warning' }) {
  const accent = tone === 'success' ? colors.semantic.success : colors.semantic.warning;
  return (
    <div style={{
      background: colors.bg.inset,
      borderRadius: radius.md,
      padding: space[2],
      borderLeft: `3px solid ${accent}`,
      maxHeight: 160,
      overflow: 'auto',
    }}>
      <div style={{
        fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
        color: accent, marginBottom: space[1],
      }}>{title}</div>
      <pre style={{
        margin: 0, fontSize: fontSize.xs, color: colors.text.primary,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace',
      }}>{body}</pre>
    </div>
  );
}
