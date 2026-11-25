// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Bio Studio › Align: compare the active sequence with another one in the
 * project, globally (end to end) or locally (best-matching region). Runs in a
 * worker; shows identity / similarity / gaps / score and the alignment in
 * 60-column blocks; exports as text.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { alignPairwise, formatAlignment, type Alignment, type AlignOptions } from './bioAlign';
import type { BioSequence } from './bioProject';
import { downloadText } from '../../improvements500/downloadBlob';

let worker: Worker | null = null;
let nextId = 1;
function runAlignment(a: string, b: string, opts: AlignOptions): Promise<Alignment> {
  if (typeof Worker === 'undefined') {
    return new Promise((resolve, reject) => { try { resolve(alignPairwise(a, b, opts)); } catch (e) { reject(e); } });
  }
  if (!worker) worker = new Worker(new URL('./bioAlign.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent<{ id: number; ok: boolean; result?: Alignment; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', on);
      if (e.data.ok && e.data.result) resolve(e.data.result); else reject(new Error(e.data.error || 'Alignment failed.'));
    };
    w.addEventListener('message', on);
    w.postMessage({ id, a, b, opts });
  });
}

const pill = (on: boolean): React.CSSProperties => ({
  height: 26, padding: '0 12px', borderRadius: 9999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: on ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-elevated))' : 'transparent',
  color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
});
const stat: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'baseline', gap: 6, height: 26, padding: '0 12px', borderRadius: 9999,
  background: 'var(--color-bg-hover)', fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums',
};

export const BioAlignPanel: React.FC<{ active: BioSequence; sequences: BioSequence[] }> = ({ active, sequences }) => {
  const others = useMemo(() => sequences.filter((s) => s.id !== active.id), [sequences, active.id]);
  const [otherId, setOtherId] = useState<string>(others[0]?.id ?? '');
  const [mode, setMode] = useState<'global' | 'local'>('global');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ al: Alignment; nameA: string; nameB: string } | null>(null);
  const run = useRef(0);
  const other = others.find((s) => s.id === otherId) ?? others[0] ?? null;
  const type: 'dna' | 'protein' = active.kind === 'protein' ? 'protein' : 'dna';
  const kindsMatch = !!other && (other.kind === 'protein') === (active.kind === 'protein');

  useEffect(() => { setResult(null); setError(null); }, [active.id, otherId, mode]);

  const align = async () => {
    if (!other || !kindsMatch) return;
    const ticket = ++run.current;
    setBusy(true); setError(null);
    try {
      const al = await runAlignment(active.seq, other.seq, { mode, type });
      if (ticket === run.current) setResult({ al, nameA: active.name, nameB: other.name });
    } catch (e) {
      if (ticket === run.current) { setError((e as Error).message); setResult(null); }
    } finally {
      if (ticket === run.current) setBusy(false);
    }
  };

  const text = result ? formatAlignment(result.al, result.nameA.slice(0, 16), result.nameB.slice(0, 16)) : '';
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (!others.length) {
    return (
      <div style={{ padding: 24, color: 'var(--color-text-secondary)', fontSize: 13 }}>
        Add a second sequence to the project (import, paste, or derive one) to align it with <strong>{active.name}</strong>.
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Align <strong style={{ color: 'var(--color-text-primary)' }}>{active.name}</strong> with</span>
        <select value={other?.id ?? ''} onChange={(e) => setOtherId(e.target.value)} aria-label="Sequence to align with"
          style={{ height: 28, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }}>
          {others.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.seq.length.toLocaleString()} {s.kind === 'protein' ? 'aa' : 'nt'})</option>)}
        </select>
        <div role="radiogroup" aria-label="Alignment type" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 9999, background: 'var(--color-bg-hover)' }}>
          <button role="radio" aria-checked={mode === 'global'} style={pill(mode === 'global')} onClick={() => setMode('global')}>Global</button>
          <button role="radio" aria-checked={mode === 'local'} style={pill(mode === 'local')} onClick={() => setMode('local')}>Local</button>
        </div>
        <button onClick={() => void align()} disabled={busy || !kindsMatch}
          style={{ height: 28, padding: '0 16px', borderRadius: 9999, border: 'none', background: 'var(--color-accent-fill, var(--color-accent))', color: '#fff', fontSize: 12, fontWeight: 600, cursor: busy || !kindsMatch ? 'default' : 'pointer', opacity: busy || !kindsMatch ? 0.6 : 1 }}>
          {busy ? 'Aligning…' : 'Align'}
        </button>
        {result && (
          <button onClick={() => downloadText(`${result.nameA}-vs-${result.nameB}.aln.txt`.replace(/[\\/:*?"<>|]/g, '_'), `# ${mode === 'global' ? 'Global (Needleman-Wunsch)' : 'Local (Smith-Waterman)'}, affine gaps, ${type === 'protein' ? 'BLOSUM62' : 'match 2 / mismatch -3'}\n# Identity ${pct(result.al.identity)}  Similarity ${pct(result.al.similarity)}  Gaps ${result.al.gaps}  Score ${result.al.score}\n\n${text}`)}
            style={{ height: 28, padding: '0 14px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}>
            Export
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)' }}>
        {mode === 'global' ? 'Global aligns both sequences end to end.' : 'Local finds the best-matching region.'} Affine gaps; {type === 'protein' ? 'BLOSUM62 scoring.' : 'match +2, mismatch -3.'} Up to about 5,000 residues each.
      </div>
      {!kindsMatch && <div role="alert" style={{ fontSize: 12, color: 'var(--color-warning)' }}>Pick a sequence of the same kind (DNA/RNA with DNA/RNA, protein with protein).</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--color-error)' }}>{error}</div>}
      {result && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="Alignment statistics">
            <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Identity</span>{pct(result.al.identity)}</span>
            {type === 'protein' && <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Similarity</span>{pct(result.al.similarity)}</span>}
            <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Gaps</span>{result.al.gaps.toLocaleString()}</span>
            <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Length</span>{result.al.length.toLocaleString()}</span>
            <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Score</span>{result.al.score}</span>
            {mode === 'local' && <span style={stat}><span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Region</span>{result.al.aStart}–{result.al.aEnd} / {result.al.bStart}–{result.al.bEnd}</span>}
          </div>
          <pre aria-label="Alignment" style={{ margin: 0, padding: 12, borderRadius: 10, background: 'var(--color-bg-surface)', boxShadow: 'inset 0 0 0 1px var(--color-border-subtle)', fontFamily: 'var(--font-mono, Consolas, monospace)', fontSize: 12, lineHeight: 1.5, overflow: 'auto', maxHeight: 480 }}>
            {text.length > 400_000 ? `${text.slice(0, 400_000)}\n… (export for the full alignment)` : text}
          </pre>
        </>
      )}
    </div>
  );
};

export default BioAlignPanel;
