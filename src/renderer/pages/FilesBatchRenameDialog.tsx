// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Files › Rename… (several items): live preview of every new name with its
// conflicts before anything changes; conflicting items are left as they are.

import React, { useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { planBatchRename, applyBatchRename, type RenameRule, type RenameOutcome } from './filesBatchRename';

export const FilesBatchRenameDialog: React.FC<{
  dir: string;
  items: { name: string; isDirectory: boolean }[];
  existingNames: string[];
  rename: (path: string, newName: string) => Promise<void>;
  onDone: (outcome: RenameOutcome | null) => void;
}> = ({ dir, items, existingNames, rename, onDone }) => {
  const [rule, setRule] = useState<RenameRule>({ find: '', replace: '', prefix: '', suffix: '', base: '', numbering: null, caseMode: 'keep' });
  const [busy, setBusy] = useState(false);
  const steps = useMemo(() => planBatchRename(items, rule, existingNames), [items, rule, existingNames]);
  const ready = steps.filter((s) => s.changed && !s.conflict).length;
  const conflicts = steps.filter((s) => s.changed && s.conflict).length;
  const set = (patch: Partial<RenameRule>) => setRule((r) => ({ ...r, ...patch }));

  const apply = async () => {
    setBusy(true);
    try { onDone(await applyBatchRename(dir, steps, rename)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => onDone(null)} size="md" title={`Rename ${items.length} items`} testIdPrefix="batch-rename"
      footer={<>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-tertiary)' }}>{ready} will be renamed{conflicts ? ` · ${conflicts} conflict${conflicts > 1 ? 's' : ''} left as is` : ''}</span>
        <Button variant="ghost" size="md" onClick={() => onDone(null)}>Cancel</Button>
        <Button variant="primary" size="md" disabled={!ready || busy} onClick={() => { void apply(); }} data-testid="batch-rename-apply">{busy ? 'Renaming…' : `Rename ${ready}`}</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Field label="Find" value={rule.find ?? ''} onChange={(v) => set({ find: v })} />
        <Field label="Replace with" value={rule.replace ?? ''} onChange={(v) => set({ replace: v })} />
        <Field label="New name (optional)" value={rule.base ?? ''} onChange={(v) => set({ base: v })} />
        <label style={lbl}>Case
          <select value={rule.caseMode} onChange={(e) => set({ caseMode: e.target.value as RenameRule['caseMode'] })} style={input}>
            <option value="keep">Keep</option><option value="lower">lowercase</option><option value="upper">UPPERCASE</option><option value="title">Title Case</option>
          </select>
        </label>
        <Field label="Prefix" value={rule.prefix ?? ''} onChange={(v) => set({ prefix: v })} />
        <Field label="Suffix" value={rule.suffix ?? ''} onChange={(v) => set({ suffix: v })} />
        <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!rule.numbering} onChange={(e) => set({ numbering: e.target.checked ? { start: 1, pad: 2, sep: ' ' } : null })} /> Add numbers
        </label>
        {rule.numbering && (
          <label style={lbl}>Start at
            <input type="number" min={0} value={rule.numbering.start} onChange={(e) => set({ numbering: { ...rule.numbering!, start: Math.max(0, Number(e.target.value) || 0) } })} style={input} />
          </label>
        )}
      </div>
      <div role="table" aria-label="Rename preview" style={{ maxHeight: 260, overflow: 'auto', borderTop: '1px solid var(--color-border-subtle)' }}>
        {steps.map((s) => (
          <div role="row" key={s.from} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '5px 2px', fontSize: 12, borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span role="cell" style={cell}>{s.from}</span>
            <span role="cell" style={{ ...cell, color: s.conflict && s.changed ? 'var(--color-error)' : s.changed ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }} title={s.conflict ?? undefined}>
              {s.changed ? s.to : 'unchanged'}{s.changed && s.conflict ? ` — ${s.conflict}` : ''}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label style={lbl}>{label}<input value={value} onChange={(e) => onChange(e.target.value)} style={input} spellCheck={false} /></label>
);
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: 'var(--color-text-tertiary)' };
const input: React.CSSProperties = { height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-inset)', color: 'var(--color-text-primary)', fontSize: 12.5 };
const cell: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
