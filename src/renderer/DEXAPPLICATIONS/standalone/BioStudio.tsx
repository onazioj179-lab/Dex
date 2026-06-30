// =============================================================================
// DEX Platform - BIO ENGINEERING STUDIO
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Molecular-biology bench tools: DNA/RNA transcription + translation (the real
// standard genetic code), reverse-complement, composition (GC%, Tm, MW), and
// solution prep (molarity + C1V1=C2V2 dilution). Pure, offline, client-side.
// Sibling to Health Studio — both prove "future apps inherit the DEX standard".
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { colors, radius, fontStack } from '../../styles/tokens';

// ---------------------------------------------------------------------------
// Domain — the real standard genetic code + pure sequence maths
// ---------------------------------------------------------------------------

// Standard genetic code (NCBI transl_table=1), built so it is provably correct:
// amino-acid 1-letter codes enumerated with bases in U,C,A,G order, first base
// slowest. e.g. index for AUG = A(2)*16 + U(0)*4 + G(3) = 35 -> 'M' (Met/start).
const RNA_BASES = ['U', 'C', 'A', 'G'] as const;
const AA_STRING = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const CODON_TABLE: Record<string, string> = (() => {
  const t: Record<string, string> = {};
  let k = 0;
  for (const b1 of RNA_BASES) for (const b2 of RNA_BASES) for (const b3 of RNA_BASES) t[b1 + b2 + b3] = AA_STRING[k++];
  return t;
})();

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };
// Average ssDNA nucleotide-monophosphate masses (g/mol) for the MW estimate.
const NT_MASS: Record<string, number> = { A: 313.21, T: 304.2, C: 289.18, G: 329.21 };

/** Keep only A/C/G/T (DNA). Uppercased. */
export function cleanDna(s: string): string {
  return s.toUpperCase().replace(/[^ACGT]/g, '');
}

/** DNA coding strand -> mRNA (T -> U). */
export function transcribe(dna: string): string {
  return dna.replace(/T/g, 'U');
}

/** Reverse complement of a DNA strand. */
export function reverseComplement(dna: string): string {
  let out = '';
  for (let i = dna.length - 1; i >= 0; i--) out += COMPLEMENT[dna[i]] ?? '';
  return out;
}

/** Translate mRNA to a protein (1-letter codes); stops at the first stop codon. */
export function translate(rna: string): string {
  let protein = '';
  for (let i = 0; i + 3 <= rna.length; i += 3) {
    const aa = CODON_TABLE[rna.slice(i, i + 3)];
    if (aa === undefined) break;
    if (aa === '*') break;
    protein += aa;
  }
  return protein;
}

export function baseCounts(dna: string): { A: number; C: number; G: number; T: number } {
  const c = { A: 0, C: 0, G: 0, T: 0 };
  for (const b of dna) if (b in c) (c as Record<string, number>)[b]++;
  return c;
}

export function gcContent(dna: string): number {
  if (!dna.length) return 0;
  const { G, C } = baseCounts(dna);
  return ((G + C) / dna.length) * 100;
}

/** Estimated single-stranded DNA molecular weight (g/mol). */
export function molecularWeight(dna: string): number {
  if (!dna.length) return 0;
  let mw = 0;
  for (const b of dna) mw += NT_MASS[b] ?? 0;
  return mw - 61.96; // standard ssDNA correction term
}

/**
 * Primer melting temperature (deg C). Wallace rule for short oligos (<14 nt);
 * the basic GC formula for longer sequences.
 */
export function meltingTemp(dna: string): number {
  const n = dna.length;
  if (!n) return 0;
  const { A, T, G, C } = baseCounts(dna);
  if (n < 14) return 2 * (A + T) + 4 * (G + C);
  return 64.9 + (41 * (G + C - 16.4)) / n;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

type Module = 'sequence' | 'composition' | 'solution';
const MODULES: { id: Module; label: string }[] = [
  { id: 'sequence', label: 'Sequence' },
  { id: 'composition', label: 'Composition' },
  { id: 'solution', label: 'Solution' },
];

const SAMPLE = 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
  borderRadius: radius.xl, padding: 16,
};
const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: colors.text.tertiary, marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px', fontSize: 13, color: colors.text.primary,
  background: 'var(--color-bg-inset)', border: '1px solid var(--color-border-subtle)',
  borderRadius: radius.md, outline: 'none', fontFamily: fontStack.ui,
};
const mono: React.CSSProperties = { fontFamily: fontStack.mono, fontSize: 12, wordBreak: 'break-all', lineHeight: 1.6 };

const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: string; accent?: string }> = ({ label, value, sub, accent }) => (
  <div style={card}>
    <div style={fieldLabel}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: accent || colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{sub}</div>}
  </div>
);

const SeqBlock: React.FC<{ label: string; seq: string; accent?: string }> = ({ label, seq, accent }) => (
  <div style={card}>
    <div style={{ ...fieldLabel, marginBottom: 8 }}>{label} <span style={{ color: colors.text.tertiary }}>· {seq.length} nt</span></div>
    <div style={{ ...mono, color: accent || colors.text.primary }}>{seq || '—'}</div>
  </div>
);

const BioStudio: React.FC = () => {
  const [raw, setRaw] = useState(SAMPLE);
  const [module, setModule] = useState<Module>('sequence');
  // Solution prep inputs.
  const [mass, setMass] = useState(10);
  const [mw, setMw] = useState(58.44); // NaCl default
  const [vol, setVol] = useState(1);   // litres
  const [c1, setC1] = useState(1);
  const [v1, setV1] = useState(0);
  const [c2, setC2] = useState(0.1);

  const dna = useMemo(() => cleanDna(raw), [raw]);
  const rna = useMemo(() => transcribe(dna), [dna]);
  const protein = useMemo(() => translate(rna), [rna]);
  const revc = useMemo(() => reverseComplement(dna), [dna]);
  const gc = gcContent(dna);
  const counts = baseCounts(dna);
  const mwDna = molecularWeight(dna);
  const tm = meltingTemp(dna);

  const molarity = mw > 0 && vol > 0 ? (mass / mw) / vol : 0;     // mol/L
  const dilV1 = c1 > 0 ? (c2 * (v1 || 0)) / c1 : 0;               // C1V1=C2V2 -> V1 (when solving)
  const dilV2 = c2 > 0 ? (c1 * (v1 || 0)) / c2 : 0;               // final volume for given V1 stock

  const ctxRef = useRef({ dna, gc, protein, tm, module });
  ctxRef.current = { dna, gc, protein, tm, module };
  useEffect(() => {
    registerUkiAppContext('bio', () => {
      const c = ctxRef.current;
      return {
        appId: 'bio',
        custom: {
          module: c.module,
          length: c.dna.length,
          gcPercent: c.gc.toFixed(1),
          proteinLength: c.protein.length,
          tmC: c.tm.toFixed(1),
        },
      };
    });
    registerUkiAppAction('bio', {
      id: 'bio.analyzeSequence',
      description: 'analyze the loaded DNA sequence: length, GC%, melting temp, and the translated protein.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ctxRef.current;
      if (!c.dna.length) return 'No DNA sequence loaded.';
      return `${c.dna.length} bp, GC ${c.gc.toFixed(1)}%, Tm ${c.tm.toFixed(1)} C. Protein (${c.protein.length} aa): ${c.protein || '(none — no start/ORF)'}`;
    });
    return () => {
      unregisterUkiAppContext('bio');
      unregisterUkiAppAction('bio.analyzeSequence');
    };
  }, []);

  const numSet = (fn: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => fn(Math.max(0, Number(e.target.value) || 0));

  const menus: MenuGroup[] = [
    {
      id: 'view', label: 'View',
      sections: [{ id: 'modules', label: 'Modules', items: MODULES.map((m) => ({ id: `view.${m.id}`, label: m.label, checked: module === m.id, run: () => setModule(m.id) })) }],
    },
    {
      id: 'sequence', label: 'Sequence',
      sections: [{ id: 'seq', items: [
        { id: 'seq.sample', label: 'Load sample ORF', run: () => setRaw(SAMPLE) },
        { id: 'seq.revc', label: 'Replace with reverse complement', run: () => setRaw(reverseComplement(cleanDna(raw))) },
        { id: 'seq.clear', label: 'Clear', danger: true, run: () => setRaw('') },
      ] }],
    },
  ];

  return (
    <AppShell
      appId="bio"
      menus={menus}
      title="Bio Engineering Studio"
      surface="plain"
      status={{
        left: <span>{dna.length} bp · GC {gc.toFixed(1)}%</span>,
        right: <span>Tm {tm.toFixed(1)} C · {protein.length} aa</span>,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Sequence input */}
        <div style={{ padding: 16, borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={fieldLabel}>DNA sequence (coding strand · A/C/G/T)</div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            spellCheck={false}
            style={{ ...inputStyle, height: 56, padding: 8, resize: 'vertical', ...mono }}
            placeholder="Paste a DNA sequence…"
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
            {MODULES.map((m) => (
              <button key={m.id} onClick={() => setModule(m.id)} style={{
                height: 30, padding: '0 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: radius.md,
                border: '1px solid var(--color-border-subtle)',
                background: module === m.id ? colors.accent.light : 'transparent',
                color: module === m.id ? colors.accent.default : colors.text.secondary,
              }}>{m.label}</button>
            ))}
          </div>

          {module === 'sequence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SeqBlock label="mRNA (transcription)" seq={rna} accent={colors.accent.default} />
              <SeqBlock label="Reverse complement" seq={revc} />
              <div style={card}>
                <div style={{ ...fieldLabel, marginBottom: 8 }}>Protein (translation) <span style={{ color: colors.text.tertiary }}>· {protein.length} aa</span></div>
                <div style={{ ...mono, color: colors.semantic.success }}>{protein || '— no protein (needs an in-frame ORF)'}</div>
              </div>
            </div>
          )}

          {module === 'composition' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <Stat label="Length" value={`${dna.length}`} sub="base pairs" />
              <Stat label="GC content" value={`${gc.toFixed(1)}%`} sub={`A:${counts.A} C:${counts.C} G:${counts.G} T:${counts.T}`} accent={colors.accent.default} />
              <Stat label="Melting temp" value={`${tm.toFixed(1)}°C`} sub={dna.length < 14 ? 'Wallace rule' : 'GC formula'} accent={colors.semantic.warning} />
              <Stat label="Mol. weight" value={`${mwDna ? mwDna.toFixed(0) : 0}`} sub="g/mol (ssDNA est.)" />
            </div>
          )}

          {module === 'solution' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div style={card}>
                <div style={{ ...fieldLabel, marginBottom: 10 }}>Molarity (n = m / MW)</div>
                <label style={{ display: 'block', marginBottom: 8 }}><div style={fieldLabel}>Mass (g)</div><input style={inputStyle} type="number" value={mass} onChange={numSet(setMass)} /></label>
                <label style={{ display: 'block', marginBottom: 8 }}><div style={fieldLabel}>Molar mass (g/mol)</div><input style={inputStyle} type="number" value={mw} onChange={numSet(setMw)} /></label>
                <label style={{ display: 'block', marginBottom: 12 }}><div style={fieldLabel}>Volume (L)</div><input style={inputStyle} type="number" value={vol} onChange={numSet(setVol)} /></label>
                <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent.default, fontVariantNumeric: 'tabular-nums' }}>{molarity.toFixed(4)} M</div>
                <div style={{ fontSize: 12, color: colors.text.secondary }}>{(mass / Math.max(mw, 1e-9)).toFixed(4)} mol in {vol} L</div>
              </div>
              <div style={card}>
                <div style={{ ...fieldLabel, marginBottom: 10 }}>Dilution (C1·V1 = C2·V2)</div>
                <label style={{ display: 'block', marginBottom: 8 }}><div style={fieldLabel}>Stock conc. C1 (M)</div><input style={inputStyle} type="number" value={c1} onChange={numSet(setC1)} /></label>
                <label style={{ display: 'block', marginBottom: 8 }}><div style={fieldLabel}>Stock volume V1 (mL)</div><input style={inputStyle} type="number" value={v1} onChange={numSet(setV1)} /></label>
                <label style={{ display: 'block', marginBottom: 12 }}><div style={fieldLabel}>Target conc. C2 (M)</div><input style={inputStyle} type="number" value={c2} onChange={numSet(setC2)} /></label>
                <div style={{ fontSize: 14, color: colors.text.primary }}>Final volume V2 = <b style={{ color: colors.semantic.success }}>{dilV2.toFixed(2)} mL</b></div>
                <div style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>top up {v1 || 0} mL of stock to {dilV2.toFixed(2)} mL (add {(Math.max(dilV2 - (v1 || 0), 0)).toFixed(2)} mL diluent)</div>
                <div style={{ fontSize: 12, color: colors.text.tertiary, marginTop: 6 }}>or, for a fixed final volume, V1 needed = {dilV1.toFixed(2)} mL</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default BioStudio;
