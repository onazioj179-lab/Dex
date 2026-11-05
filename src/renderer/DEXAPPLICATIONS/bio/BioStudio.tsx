// =============================================================================
// DEX Platform - BIO ENGINEERING STUDIO
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// A molecular-biology workspace: a project of sequences (explorer, left), the
// analysis workspace (centre), the inspector (right) and an activity log
// (bottom). Every number is CALCULATED from the sequence or from values the
// user typed in (labelled MEASURED); nothing is simulated or invented. All
// science lives in ./bioScience.ts and is unit-tested. Research use only.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppShell } from '../../components/appShell';
import type { MenuGroup } from '../../components/appShell/menuTypes';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { colors, radius, fontStack } from '../../styles/tokens';
import { downloadText } from '../../improvements500/downloadBlob';
import {
  parseSequence, parseFasta, toFasta, transcribe, reverseComplement, translate, findOrfs, gcContent,
  slidingGc, baseCounts, ssDnaMolecularWeight, dsDnaMolecularWeight, meltingTemp, proteinMolecularWeight,
  extinctionCoefficient, findRestrictionSites, digestFragments, ENZYMES, molarityFromMass, massForMolarity,
  solveDilution, concentrationFromA260, purityNote, CONC_UNITS, VOLUME_UNITS, MASS_UNITS,
  type ConcUnit, type VolumeUnit, type MassUnit, type DilutionUnknown, type NucleicAcidType, type Orf,
} from './bioScience';
import {
  loadProject, saveProject, historyInit, historyReducer, normalizeProject, toCsv, fileStem, emptyProject,
  type BioSequence, type SequenceSource,
} from './bioProject';

// ---------------------------------------------------------------------------
// Styling primitives (tokens only)
// ---------------------------------------------------------------------------

const hair = '1px solid var(--color-border-subtle)';
const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.tertiary,
};
const input: React.CSSProperties = {
  height: 26, padding: '0 8px', fontSize: 12, color: colors.text.primary, background: 'var(--color-bg-inset)',
  border: hair, borderRadius: radius.sm, outline: 'none', fontFamily: fontStack.ui, minWidth: 0,
};
const mono: React.CSSProperties = { fontFamily: fontStack.mono, fontSize: 12, lineHeight: 1.6, wordBreak: 'break-all' };
const btn: React.CSSProperties = {
  height: 26, padding: '0 10px', fontSize: 12, fontWeight: 500, borderRadius: radius.sm, border: hair,
  background: 'var(--color-bg-surface)', color: colors.text.primary, cursor: 'pointer', whiteSpace: 'nowrap',
};
const th: React.CSSProperties = {
  ...label, textAlign: 'left', padding: '6px 10px', borderBottom: hair, position: 'sticky', top: 0,
  background: 'var(--color-bg-base)', fontWeight: 600,
};
const td: React.CSSProperties = { padding: '5px 10px', borderBottom: hair, fontSize: 12, fontVariantNumeric: 'tabular-nums' };

type Provenance = 'calculated' | 'measured';
const PROV_LABEL: Record<Provenance, string> = { calculated: 'Calculated', measured: 'Measured (your input)' };

const Badge: React.FC<{ kind: Provenance }> = ({ kind }) => (
  <span style={{
    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: radius.xs, whiteSpace: 'nowrap',
    color: kind === 'measured' ? colors.semantic.warning : colors.accent.default,
    background: kind === 'measured' ? colors.semantic.warningMuted : colors.accent.soft,
  }}>{PROV_LABEL[kind]}</span>
);

const Row: React.FC<{ k: string; v: React.ReactNode; unit?: string; note?: string }> = ({ k, v, unit, note }) => (
  <tr>
    <td style={{ ...td, color: colors.text.secondary, width: '40%' }}>{k}</td>
    <td style={td}>{v}{unit ? <span style={{ color: colors.text.tertiary }}> {unit}</span> : null}</td>
    <td style={{ ...td, color: colors.text.tertiary }}>{note}</td>
  </tr>
);

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'sequence' | 'orfs' | 'digest' | 'gc' | 'composition' | 'bench';
const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'sequence', label: 'Sequence', key: '1' },
  { id: 'orfs', label: 'ORFs', key: '2' },
  { id: 'digest', label: 'Restriction', key: '3' },
  { id: 'gc', label: 'GC profile', key: '4' },
  { id: 'composition', label: 'Properties', key: '5' },
  { id: 'bench', label: 'Bench', key: '6' },
];


interface LogEntry { t: number; level: 'info' | 'warn' | 'error'; text: string }

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const BioStudio: React.FC = () => {
  const [hist, dispatch] = useReducer(historyReducer, undefined, () => historyInit(loadProject()));
  const project = hist.present;
  const active = project.sequences.find((s) => s.id === project.activeId) ?? null;

  const [tab, setTab] = useState<Tab>('sequence');
  const [minAa, setMinAa] = useState(30);
  const [gcWindow, setGcWindow] = useState(40);
  const [frame, setFrame] = useState(0);
  const [selectedEnzymes, setSelectedEnzymes] = useState<string[]>(['EcoRI', 'BamHI']);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'failed'>('saved');
  const fileInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((level: LogEntry['level'], text: string) => {
    setLog((l) => [{ t: Date.now(), level, text }, ...l].slice(0, 200));
    if (level !== 'info') setLogOpen(true);
  }, []);

  // Persist after every change (debounced so typing doesn't hammer storage).
  useEffect(() => {
    const t = setTimeout(() => setSaveState(saveProject(project) ? 'saved' : 'failed'), 300);
    return () => clearTimeout(t);
  }, [project]);

  // ---- derived analysis of the active sequence ----------------------------
  const isNuc = !!active && active.kind !== 'protein';
  const dna = isNuc ? active!.seq : '';
  const analysis = useMemo(() => {
    if (!active) return null;
    if (active.kind === 'protein') {
      const p = active.seq;
      return { protein: p, mw: proteinMolecularWeight(p), ext: extinctionCoefficient(p) };
    }
    return null;
  }, [active]);
  const orfs = useMemo(() => (dna ? findOrfs(dna, minAa) : []), [dna, minAa]);
  const sites = useMemo(() => (dna ? findRestrictionSites(dna) : []), [dna]);
  const gcPts = useMemo(() => (dna ? slidingGc(dna, gcWindow) : []), [dna, gcWindow]);
  const counts = useMemo(() => baseCounts(dna), [dna]);
  const tm = useMemo(() => meltingTemp(dna), [dna]);
  const gc = useMemo(() => gcContent(dna), [dna]);

  // ---- actions ------------------------------------------------------------
  const addSequences = useCallback((items: { name: string; raw: string; source: SequenceSource }[]) => {
    const seqs: Omit<BioSequence, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    for (const it of items) {
      const p = parseSequence(it.raw);
      if (!p.seq.length) { addLog('error', `${it.name}: no valid residues — skipped.`); continue; }
      if (p.invalid.length) {
        const shown = p.invalid.slice(0, 5).map((x) => `'${x.char}' at ${x.position}`).join(', ');
        addLog('warn', `${it.name}: ${p.invalid.length} invalid character(s) removed (${shown}${p.invalid.length > 5 ? ', …' : ''}).`);
      }
      if (p.ambiguous) addLog('warn', `${it.name}: ${p.ambiguous} ambiguous base(s) stored as N.`);
      seqs.push({ name: it.name, seq: p.seq, kind: p.kind, source: it.source, notes: '' });
    }
    if (seqs.length) {
      dispatch({ type: 'add', sequences: seqs });
      addLog('info', `Added ${seqs.length} sequence(s).`);
    }
  }, [addLog]);

  const importFasta = useCallback(async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) { addLog('error', `${file.name} is larger than 20 MB; split it first.`); return; }
      const text = await file.text();
      if (/^\s*LOCUS\s/.test(text)) { addLog('error', `${file.name} looks like GenBank. Only FASTA and plain sequence text are supported.`); return; }
      const recs = parseFasta(text);
      if (!recs.length) { addLog('error', `${file.name}: no sequences found.`); return; }
      addSequences(recs.map((r) => ({ name: r.name || file.name, raw: r.seq, source: 'imported' as const })));
    } catch (e) {
      addLog('error', `Could not read ${file.name}: ${(e as Error).message}`);
    }
  }, [addLog, addSequences]);

  const restoreProject = useCallback(async (file: File) => {
    try {
      const p = normalizeProject(JSON.parse(await file.text()));
      dispatch({ type: 'replace', project: p });
      addLog('info', `Restored "${p.name}" (${p.sequences.length} sequences). Undo returns the previous project.`);
    } catch (e) {
      addLog('error', `Restore failed: ${(e as Error).message}`);
    }
  }, [addLog]);

  const exportFasta = useCallback((all: boolean) => {
    const list = all ? project.sequences : active ? [active] : [];
    if (!list.length) return;
    downloadText(`${fileStem(all ? project.name : list[0].name)}.fasta`, toFasta(list.map((s) => ({ name: fileStem(s.name), description: '', seq: s.seq }))));
    addLog('info', `Exported ${list.length} sequence(s) as FASTA.`);
  }, [project, active, addLog]);

  const exportProject = useCallback(() => {
    downloadText(`${fileStem(project.name)}.dexbio.json`, JSON.stringify(project, null, 2), 'application/json;charset=utf-8');
    addLog('info', 'Project backup exported.');
  }, [project, addLog]);

  const exportOrfs = useCallback(() => {
    if (!active) return;
    downloadText(`${fileStem(active.name)}_orfs.csv`, toCsv([
      ['strand', 'frame', 'start', 'end', 'length_nt', 'length_aa', 'stop_codon', 'protein'],
      ...orfs.map((o) => [o.strand, o.frame, o.start, o.end, o.lengthNt, o.protein.length, o.hasStop ? 'yes' : 'no', o.protein]),
    ]), 'text/csv;charset=utf-8');
  }, [active, orfs]);

  const exportSites = useCallback(() => {
    if (!active) return;
    downloadText(`${fileStem(active.name)}_sites.csv`, toCsv([
      ['enzyme', 'site', 'position', 'cut_after'],
      ...sites.map((s) => [s.enzyme, s.site, s.position, s.cutAfter]),
    ]), 'text/csv;charset=utf-8');
  }, [active, sites]);

  const deriveFromActive = useCallback((kind: 'revcomp' | 'protein' | 'orf', orf?: Orf) => {
    if (!active || active.kind === 'protein') return;
    if (kind === 'revcomp') {
      dispatch({ type: 'add', sequences: [{ name: `${active.name} (rev. comp.)`, seq: reverseComplement(active.seq), kind: 'dna', source: 'derived', notes: `Reverse complement of ${active.name}.` }] });
    } else if (kind === 'protein') {
      dispatch({ type: 'add', sequences: [{ name: `${active.name} (frame ${frame + 1})`, seq: translate(active.seq, frame, true), kind: 'protein', source: 'derived', notes: `Translation of ${active.name}, frame +${frame + 1}, to the first stop.` }] });
    } else if (orf) {
      dispatch({ type: 'add', sequences: [{ name: `${active.name} ORF ${orf.strand}${orf.frame} ${orf.start}-${orf.end}`, seq: orf.protein, kind: 'protein', source: 'derived', notes: `ORF on the ${orf.strand} strand, frame ${orf.frame}, ${orf.start}..${orf.end}.` }] });
    }
  }, [active, frame]);

  const saveResult = useCallback(() => {
    if (!active) return;
    const values: Record<string, string> = { Length: `${active.seq.length} ${isNuc ? 'nt' : 'aa'}` };
    if (isNuc) {
      values['GC content'] = `${fmt(gc, 1)} %`;
      values['Tm'] = `${fmt(tm.tm, 1)} °C (${tm.method === 'wallace' ? 'Wallace rule' : 'basic formula, 50 mM Na⁺'})`;
      values['ssDNA MW'] = `${fmt(ssDnaMolecularWeight(dna), 2)} g/mol`;
      values[`ORFs ≥ ${minAa} aa`] = String(orfs.length);
      values['Restriction sites'] = String(sites.length);
    } else if (analysis) {
      values['MW'] = `${fmt(analysis.mw, 2)} g/mol`;
      values['ε280 (reduced)'] = `${analysis.ext.reduced} M⁻¹cm⁻¹`;
    }
    dispatch({ type: 'save-result', result: { sequenceId: active.id, sequenceName: active.name, title: `${active.name} — summary`, values } });
    addLog('info', `Saved a result snapshot for ${active.name}.`);
  }, [active, isNuc, gc, tm, dna, minAa, orfs.length, sites.length, analysis, addLog]);

  // ---- keyboard (scoped to this window) -----------------------------------
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
      if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); return; }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInput.current?.click(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); setSaveState(saveProject(project) ? 'saved' : 'failed'); return; }
      if (e.altKey && !mod) {
        const t = TABS.find((x) => x.key === e.key);
        if (t) { e.preventDefault(); setTab(t.id); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [project]);

  // ---- UKI ----------------------------------------------------------------
  const ctxRef = useRef({ active, gc, tm, orfs: orfs.length, sites: sites.length });
  ctxRef.current = { active, gc, tm, orfs: orfs.length, sites: sites.length };
  useEffect(() => {
    registerUkiAppContext('bio', () => {
      const c = ctxRef.current;
      return {
        appId: 'bio',
        custom: c.active ? {
          sequence: c.active.name, kind: c.active.kind, length: c.active.seq.length,
          gcPercent: c.gc.toFixed(1), tmC: c.tm.tm.toFixed(1), orfs: c.orfs, restrictionSites: c.sites,
        } : { sequence: null },
      };
    });
    registerUkiAppAction('bio', {
      id: 'bio.analyzeSequence',
      description: 'summarize the active sequence in Bio Engineering Studio: length, GC%, melting temperature, ORF and restriction-site counts.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const c = ctxRef.current;
      if (!c.active) return 'No sequence is open in Bio Engineering Studio.';
      if (c.active.kind === 'protein') return `${c.active.name}: protein, ${c.active.seq.length} aa.`;
      return `${c.active.name}: ${c.active.seq.length} nt, GC ${c.gc.toFixed(1)}%, Tm ${c.tm.tm.toFixed(1)} °C (${c.tm.method}), ${c.orfs} ORFs, ${c.sites} restriction sites. Calculated values.`;
    });
    return () => {
      unregisterUkiAppContext('bio');
      unregisterUkiAppAction('bio.analyzeSequence');
    };
  }, []);

  // ---- menus --------------------------------------------------------------
  const menus: MenuGroup[] = [
    {
      id: 'file', label: 'File',
      sections: [
        { id: 'new', items: [
          { id: 'file.newseq', label: 'New sequence', run: () => addSequences([{ name: `Sequence ${project.sequences.length + 1}`, raw: 'ATG', source: 'entered' }]) },
          { id: 'file.import', label: 'Import FASTA…', shortcut: 'Ctrl+O', run: () => fileInput.current?.click() },
        ] },
        { id: 'export', label: 'Export', items: [
          { id: 'file.fasta', label: 'Active sequence as FASTA', disabled: !active, run: () => exportFasta(false) },
          { id: 'file.fastaAll', label: 'All sequences as FASTA', disabled: !project.sequences.length, run: () => exportFasta(true) },
          { id: 'file.orfs', label: 'ORF table (CSV)', disabled: !isNuc, run: exportOrfs },
          { id: 'file.sites', label: 'Restriction sites (CSV)', disabled: !isNuc, run: exportSites },
        ] },
        { id: 'backup', label: 'Project', items: [
          { id: 'file.backup', label: 'Back up project…', run: exportProject },
          { id: 'file.restore', label: 'Restore project…', run: () => restoreInput.current?.click() },
          { id: 'file.clear', label: 'New empty project', danger: true, run: () => dispatch({ type: 'replace', project: emptyProject() }) },
        ] },
      ],
    },
    {
      id: 'edit', label: 'Edit',
      sections: [
        { id: 'history', items: [
          { id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !hist.past.length, run: () => dispatch({ type: 'undo' }) },
          { id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !hist.future.length, run: () => dispatch({ type: 'redo' }) },
        ] },
        { id: 'seq', items: [
          { id: 'edit.revcomp', label: 'New sequence from reverse complement', disabled: !isNuc, run: () => deriveFromActive('revcomp') },
          { id: 'edit.translate', label: `New protein from frame +${frame + 1}`, disabled: !isNuc, run: () => deriveFromActive('protein') },
          { id: 'edit.delete', label: 'Delete sequence', danger: true, disabled: !active, run: () => active && dispatch({ type: 'remove', id: active.id }) },
        ] },
      ],
    },
    {
      id: 'view', label: 'View',
      sections: [
        { id: 'tabs', items: TABS.map((t) => ({ id: `view.${t.id}`, label: t.label, shortcut: `Alt+${t.key}`, checked: tab === t.id, run: () => setTab(t.id) })) },
        { id: 'panels', items: [{ id: 'view.log', label: 'Activity log', checked: logOpen, run: () => setLogOpen((v) => !v) }] },
      ],
    },
    {
      id: 'analysis', label: 'Analysis',
      sections: [{ id: 'save', items: [{ id: 'analysis.save', label: 'Save result snapshot', disabled: !active, run: saveResult }] }],
    },
  ];

  // ---- inspector ----------------------------------------------------------
  const inspector = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', fontSize: 12 }}>
      <Section title="Sequence">
        {active ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Name">
              <input key={active.id + active.name} style={{ ...input, width: '100%' }} defaultValue={active.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== active.name && dispatch({ type: 'update', id: active.id, patch: { name: e.target.value.trim() } })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </Field>
            <KV k="Type" v={active.kind === 'protein' ? 'Protein' : 'Nucleotide (DNA)'} />
            <KV k="Length" v={`${active.seq.length.toLocaleString()} ${isNuc ? 'nt' : 'aa'}`} />
            <KV k="Origin" v={{ entered: 'Typed in', imported: 'Imported file', derived: 'Derived' }[active.source]} />
            <Field label="Notes">
              <textarea key={active.id + 'n'} defaultValue={active.notes} rows={3} style={{ ...input, width: '100%', height: 'auto', padding: 6, resize: 'vertical' }}
                onBlur={(e) => e.target.value !== active.notes && dispatch({ type: 'update', id: active.id, patch: { notes: e.target.value } })} />
            </Field>
          </div>
        ) : <span style={{ color: colors.text.tertiary }}>No sequence selected.</span>}
      </Section>
      <Section title="Parameters">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="Minimum ORF length (aa)">
            <input type="number" min={1} max={2000} style={{ ...input, width: '100%' }} value={minAa} onChange={(e) => setMinAa(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="GC window (nt)">
            <input type="number" min={4} max={5000} style={{ ...input, width: '100%' }} value={gcWindow} onChange={(e) => setGcWindow(Math.max(4, Math.min(5000, Number(e.target.value) || 4)))} />
          </Field>
          <Field label="Translation frame">
            <select style={{ ...input, width: '100%' }} value={frame} onChange={(e) => setFrame(Number(e.target.value))}>
              <option value={0}>+1</option><option value={1}>+2</option><option value={2}>+3</option>
            </select>
          </Field>
        </div>
      </Section>
      <Section title="About these values">
        <p style={{ margin: 0, color: colors.text.secondary, lineHeight: 1.5 }}>
          <b>Calculated</b> values are derived from the sequence with the formulas named next to them.
          <b> Measured</b> values are readings you entered. Nothing is simulated. For research and teaching; not a clinical or diagnostic tool.
        </p>
      </Section>
    </div>
  );

  // ---- render -------------------------------------------------------------
  return (
    <div ref={rootRef} style={{ height: '100%' }}>
      <input ref={fileInput} type="file" accept=".fa,.fasta,.fna,.ffn,.faa,.txt,.seq" multiple hidden
        onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void importFasta(f); e.target.value = ''; }} />
      <input ref={restoreInput} type="file" accept=".json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void restoreProject(f); e.target.value = ''; }} />
      <AppShell
        appId="bio"
        menus={menus}
        title="Bio Engineering Studio"
        surface="plain"
        toolbar={
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={btn} disabled={!hist.past.length} onClick={() => dispatch({ type: 'undo' })} aria-label="Undo" title="Undo (Ctrl+Z)">Undo</button>
            <button style={btn} disabled={!hist.future.length} onClick={() => dispatch({ type: 'redo' })} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
          </div>
        }
        toolbarEnd={<button style={btn} disabled={!active} onClick={saveResult}>Save result</button>}
        inspector={inspector}
        inspectorWidth={250}
        status={{
          left: <span>{project.name} · {project.sequences.length} sequence{project.sequences.length === 1 ? '' : 's'}</span>,
          center: active && isNuc ? <span>{active.seq.length.toLocaleString()} nt · GC {fmt(gc, 1)}% · Tm {fmt(tm.tm, 1)} °C</span> : null,
          right: (
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: saveState === 'failed' ? colors.semantic.error : colors.text.tertiary }}>{saveState === 'failed' ? 'Not saved — storage unavailable' : 'Saved'}</span>
              <button onClick={() => setLogOpen((v) => !v)} style={{ background: 'none', border: 'none', color: colors.text.secondary, cursor: 'pointer', fontSize: 11 }}>
                Log{log.some((l) => l.level !== 'info') ? ' •' : ''}
              </button>
            </span>
          ),
        }}
      >
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
          {/* Explorer */}
          <nav aria-label="Project" style={{ width: 210, flexShrink: 0, borderRight: hair, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 10px 6px' }}>
              <input key={project.name} defaultValue={project.name} aria-label="Project name"
                style={{ ...input, width: '100%', fontWeight: 600, background: 'transparent', border: '1px solid transparent' }}
                onBlur={(e) => e.target.value.trim() !== project.name && dispatch({ type: 'rename-project', name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </div>
            <div style={{ ...label, padding: '4px 12px' }}>Sequences</div>
            <div role="listbox" aria-label="Sequences" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              {project.sequences.map((s) => (
                <div key={s.id} role="option" aria-selected={s.id === project.activeId} tabIndex={0}
                  onClick={() => dispatch({ type: 'select', id: s.id })}
                  onKeyDown={(e) => {
                    const i = project.sequences.findIndex((x) => x.id === s.id);
                    if (e.key === 'ArrowDown' && project.sequences[i + 1]) { e.preventDefault(); dispatch({ type: 'select', id: project.sequences[i + 1].id }); (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); }
                    if (e.key === 'ArrowUp' && project.sequences[i - 1]) { e.preventDefault(); dispatch({ type: 'select', id: project.sequences[i - 1].id }); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }
                    if (e.key === 'Delete') dispatch({ type: 'remove', id: s.id });
                  }}
                  className="dex-hover-bg"
                  style={{
                    padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6,
                    background: s.id === project.activeId ? colors.accent.light : undefined,
                    color: s.id === project.activeId ? colors.accent.default : colors.text.primary,
                  }}>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: colors.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{s.kind === 'protein' ? 'aa' : 'nt'} {s.seq.length}</span>
                </div>
              ))}
              {!project.sequences.length && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: colors.text.tertiary, lineHeight: 1.5 }}>
                  No sequences yet.
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    <button style={btn} onClick={() => fileInput.current?.click()}>Import FASTA…</button>
                    <button style={btn} onClick={() => addSequences([{ name: 'Sequence 1', raw: 'ATG', source: 'entered' }])}>New sequence</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ ...label, padding: '8px 12px 4px', borderTop: hair }}>Saved results</div>
            <div style={{ maxHeight: 160, overflow: 'auto' }}>
              {project.results.map((r) => (
                <details key={r.id} style={{ padding: '2px 12px', fontSize: 12 }}>
                  <summary style={{ cursor: 'pointer', color: colors.text.secondary }}>{r.title}</summary>
                  <div style={{ padding: '4px 0 6px', color: colors.text.secondary }}>
                    <div style={{ color: colors.text.tertiary, fontSize: 10 }}>{new Date(r.createdAt).toLocaleString()} · Calculated</div>
                    {Object.entries(r.values).map(([k, v]) => <div key={k}>{k}: <span style={{ color: colors.text.primary }}>{v}</span></div>)}
                    <button style={{ ...btn, height: 22, marginTop: 4 }} onClick={() => dispatch({ type: 'remove-result', id: r.id })}>Remove</button>
                  </div>
                </details>
              ))}
              {!project.results.length && <div style={{ padding: '2px 12px 10px', fontSize: 11, color: colors.text.tertiary }}>Use “Save result” to keep a snapshot.</div>}
            </div>
          </nav>

          {/* Workspace */}
          <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div role="tablist" aria-label="Analysis" style={{ display: 'flex', gap: 2, padding: '6px 10px', borderBottom: hair }}>
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} title={`Alt+${t.key}`}
                  disabled={!active && t.id !== 'bench'}
                  style={{
                    height: 26, padding: '0 10px', fontSize: 12, borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                    background: tab === t.id ? colors.accent.light : 'transparent',
                    color: tab === t.id ? colors.accent.default : colors.text.secondary, fontWeight: tab === t.id ? 600 : 500,
                    opacity: !active && t.id !== 'bench' ? 0.4 : 1,
                  }}>{t.label}</button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {tab === 'bench' ? <BenchPanel /> : !active ? (
                <Empty title="Open or create a sequence" body="Import a FASTA file (Ctrl+O), or create a new sequence and paste your own." />
              ) : tab === 'sequence' ? (
                <SequencePanel key={active.id} seq={active} frame={frame}
                  onCommit={(raw) => {
                    const p = parseSequence(raw, active.kind === 'protein' ? 'protein' : 'dna');
                    if (p.invalid.length) addLog('warn', `${active.name}: ${p.invalid.length} invalid character(s) removed.`);
                    if (p.seq !== active.seq) dispatch({ type: 'update', id: active.id, patch: { seq: p.seq } });
                  }} />
              ) : !isNuc ? (
                tab === 'composition' && analysis ? <ProteinProps protein={analysis.protein} /> :
                  <Empty title="Not available for proteins" body="ORFs, restriction sites and GC profiles need a nucleotide sequence." />
              ) : tab === 'orfs' ? (
                <OrfPanel orfs={orfs} minAa={minAa} onExtract={(o) => deriveFromActive('orf', o)} onExport={exportOrfs} />
              ) : tab === 'digest' ? (
                <DigestPanel dna={dna} sites={sites} selected={selectedEnzymes} setSelected={setSelectedEnzymes} onExport={exportSites} />
              ) : tab === 'gc' ? (
                <GcPanel pts={gcPts} length={dna.length} window={gcWindow} overall={gc} />
              ) : (
                <NucleotideProps dna={dna} counts={counts} gc={gc} tm={tm} />
              )}
            </div>
            {logOpen && (
              <div style={{ height: 120, borderTop: hair, overflow: 'auto', flexShrink: 0 }} aria-label="Activity log">
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', borderBottom: hair }}>
                  <span style={{ ...label, flex: 1 }}>Activity log</span>
                  <button style={{ ...btn, height: 20, fontSize: 11 }} onClick={() => setLog([])}>Clear</button>
                  <button style={{ ...btn, height: 20, fontSize: 11, marginLeft: 4 }} onClick={() => setLogOpen(false)} aria-label="Close log">Close</button>
                </div>
                {log.map((l, i) => (
                  <div key={i} style={{ padding: '2px 10px', fontSize: 11, fontFamily: fontStack.mono, color: l.level === 'error' ? colors.semantic.error : l.level === 'warn' ? colors.semantic.warning : colors.text.secondary }}>
                    {new Date(l.t).toLocaleTimeString()} {l.text}
                  </div>
                ))}
                {!log.length && <div style={{ padding: '4px 10px', fontSize: 11, color: colors.text.tertiary }}>Nothing yet.</div>}
              </div>
            )}
          </main>
        </div>
      </AppShell>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={{ padding: '10px 12px', borderBottom: hair }}>
    <div style={{ ...label, marginBottom: 8 }}>{title}</div>
    {children}
  </section>
);
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label: l, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ fontSize: 11, color: colors.text.secondary }}>{l}</span>{children}</label>
);
const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: colors.text.secondary }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
);
const Empty: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div style={{ padding: 40, textAlign: 'center', color: colors.text.secondary }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: colors.text.primary, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>{body}</div>
  </div>
);
const PanelHead: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 6px' }}>
    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{title}</span>{children}
  </div>
);

const SequencePanel: React.FC<{ seq: BioSequence; frame: number; onCommit: (raw: string) => void }> = ({ seq, frame, onCommit }) => {
  const [draft, setDraft] = useState(seq.seq);
  useEffect(() => setDraft(seq.seq), [seq.seq]);
  const parsed = useMemo(() => parseSequence(draft, seq.kind === 'protein' ? 'protein' : 'dna'), [draft, seq.kind]);
  const dirty = parsed.seq !== seq.seq;
  const nuc = seq.kind !== 'protein';
  return (
    <div style={{ padding: '0 0 14px' }}>
      <PanelHead title={nuc ? 'Coding strand (5′→3′)' : 'Protein sequence (N→C)'}>
        {dirty && <span style={{ fontSize: 11, color: colors.text.tertiary }}>Unapplied changes</span>}
        <button style={btn} disabled={!dirty} onClick={() => setDraft(seq.seq)}>Revert</button>
        <button style={{ ...btn, background: dirty ? colors.accent.default : btn.background, color: dirty ? 'var(--color-accent-text, #fff)' : colors.text.primary }} disabled={!dirty} onClick={() => onCommit(draft)}>Apply</button>
      </PanelHead>
      <div style={{ padding: '0 14px' }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Sequence"
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onCommit(draft); } }}
          style={{ ...input, ...mono, width: '100%', height: 120, padding: 8, resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: parsed.invalid.length ? colors.semantic.warning : colors.text.tertiary, marginTop: 4 }}>
          {parsed.seq.length.toLocaleString()} {nuc ? 'nt' : 'aa'}
          {parsed.invalid.length ? ` · ${parsed.invalid.length} invalid character(s) will be removed (first: '${parsed.invalid[0].char}' at ${parsed.invalid[0].position})` : ''}
          {parsed.ambiguous ? ` · ${parsed.ambiguous} ambiguous base(s) as N` : ''}
          {' · '}Ctrl+Enter applies
        </div>
      </div>
      {nuc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px 0' }}>
          <Derived title="mRNA (transcript)" value={transcribe(seq.seq)} unit="nt" />
          <Derived title="Reverse complement (5′→3′)" value={reverseComplement(seq.seq)} unit="nt" />
          <Derived title={`Translation, frame +${frame + 1} (* = stop)`} value={translate(seq.seq, frame)} unit="aa" />
        </div>
      )}
    </div>
  );
};

const Derived: React.FC<{ title: string; value: string; unit: string }> = ({ title, value, unit }) => (
  <div style={{ border: hair, borderRadius: radius.sm }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: hair }}>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{title}</span>
      <span style={{ fontSize: 11, color: colors.text.tertiary }}>{value.length.toLocaleString()} {unit}</span>
      <Badge kind="calculated" />
      <button style={{ ...btn, height: 22 }} onClick={() => { void navigator.clipboard?.writeText(value).catch(() => undefined); }}>Copy</button>
    </div>
    <div style={{ ...mono, padding: '6px 10px', maxHeight: 120, overflow: 'auto' }}>{value || '—'}</div>
  </div>
);

const OrfPanel: React.FC<{ orfs: Orf[]; minAa: number; onExtract: (o: Orf) => void; onExport: () => void }> = ({ orfs, minAa, onExtract, onExport }) => (
  <div>
    <PanelHead title={`Open reading frames ≥ ${minAa} aa (ATG → stop, six frames)`}>
      <Badge kind="calculated" />
      <button style={btn} disabled={!orfs.length} onClick={onExport}>Export CSV</button>
    </PanelHead>
    {!orfs.length ? <Empty title="No ORFs at this length" body="Lower the minimum ORF length in the inspector." /> : (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Strand', 'Frame', 'Start', 'End', 'Length', 'Protein', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {orfs.slice(0, 500).map((o, i) => (
            <tr key={i}>
              <td style={td}>{o.strand}</td><td style={td}>{o.frame}</td><td style={td}>{o.start.toLocaleString()}</td><td style={td}>{o.end.toLocaleString()}</td>
              <td style={td}>{o.protein.length} aa{!o.hasStop && <span style={{ color: colors.semantic.warning }} title="Runs off the end without a stop codon"> · open</span>}</td>
              <td style={{ ...td, ...mono, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.protein}>{o.protein}</td>
              <td style={td}><button style={{ ...btn, height: 22 }} onClick={() => onExtract(o)}>To protein</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    {orfs.length > 500 && <div style={{ padding: 10, fontSize: 11, color: colors.text.tertiary }}>Showing 500 of {orfs.length}; export the CSV for all.</div>}
  </div>
);

const DigestPanel: React.FC<{
  dna: string; sites: ReturnType<typeof findRestrictionSites>; selected: string[];
  setSelected: (fn: (s: string[]) => string[]) => void; onExport: () => void;
}> = ({ dna, sites, selected, setSelected, onExport }) => {
  const byEnzyme = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of sites) m.set(s.enzyme, [...(m.get(s.enzyme) ?? []), s.cutAfter]);
    return m;
  }, [sites]);
  const cuts = selected.flatMap((e) => byEnzyme.get(e) ?? []);
  const fragments = digestFragments(dna.length, cuts);
  const L = Math.max(1, dna.length);
  return (
    <div>
      <PanelHead title="Restriction analysis (linear DNA)">
        <Badge kind="calculated" />
        <button style={btn} disabled={!sites.length} onClick={onExport}>Export CSV</button>
      </PanelHead>
      <div style={{ padding: '0 14px 10px' }}>
        <div role="img" aria-label="Cut map" style={{ position: 'relative', height: 50, margin: '0 24px 4px' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 32, height: 2, background: 'var(--color-text-tertiary)' }} />
          <span style={{ position: 'absolute', left: -20, top: 26, fontSize: 10, color: colors.text.tertiary }}>1</span>
          <span style={{ position: 'absolute', right: -4, top: 38, fontSize: 10, color: colors.text.tertiary, transform: 'translateX(100%)' }}>{L.toLocaleString()}</span>
          {selected.flatMap((e) => (byEnzyme.get(e) ?? []).map((c, i) => (
            <div key={e + c} title={`${e}: cuts after ${c}`} style={{ position: 'absolute', left: `${(c / L) * 100}%`, top: 0, height: 44, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: colors.text.secondary, whiteSpace: 'nowrap', marginTop: i % 2 ? 10 : 0 }}>{e}</span>
              <span style={{ flex: 1, width: 2, background: 'var(--color-accent)', marginTop: 2 }} />
            </div>
          )))}
        </div>
        <div style={{ fontSize: 12, color: colors.text.secondary }}>
          {selected.length ? <>Fragments with {selected.join(' + ')}: <span style={{ color: colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>{fragments.map((f) => `${f.toLocaleString()} bp`).join(', ')}</span></> : 'Tick enzymes below to digest.'}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['', 'Enzyme', 'Site', 'Cuts', 'Positions (cut after)'].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {ENZYMES.map((e) => {
            const pos = byEnzyme.get(e.name) ?? [];
            const on = selected.includes(e.name);
            return (
              <tr key={e.name} style={{ opacity: pos.length ? 1 : 0.55 }}>
                <td style={td}><input type="checkbox" checked={on} aria-label={`Digest with ${e.name}`} onChange={() => setSelected((s) => (on ? s.filter((x) => x !== e.name) : [...s, e.name]))} /></td>
                <td style={td}>{e.name}</td>
                <td style={{ ...td, ...mono }}>{e.site.slice(0, e.cut)}^{e.site.slice(e.cut)}</td>
                <td style={td}>{pos.length}</td>
                <td style={{ ...td, color: colors.text.secondary }}>{pos.slice(0, 12).map((p) => p.toLocaleString()).join(', ')}{pos.length > 12 ? ', …' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const GcPanel: React.FC<{ pts: { pos: number; gc: number }[]; length: number; window: number; overall: number }> = ({ pts, length, window, overall }) => {
  const W = 1000; const H = 220; const pad = 28;
  const x = (p: number) => pad + ((p - 1) / Math.max(1, length - 1)) * (W - pad * 2);
  const y = (g: number) => H - pad - (g / 100) * (H - pad * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.pos).toFixed(1)},${y(p.gc).toFixed(1)}`).join('');
  return (
    <div>
      <PanelHead title={`GC content, ${window}-nt sliding window`}><Badge kind="calculated" /></PanelHead>
      <div style={{ padding: '0 14px' }}>
        {length < window && <div style={{ fontSize: 11, color: colors.text.tertiary, marginBottom: 6 }}>The sequence is shorter than the window; one value is shown.</div>}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="GC profile" style={{ display: 'block' }}>
          {[0, 25, 50, 75, 100].map((g) => (
            <g key={g}>
              <line x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke="var(--color-border-subtle)" />
              <text x={pad - 6} y={y(g) + 3} fontSize="10" textAnchor="end" fill="var(--color-text-tertiary)">{g}%</text>
            </g>
          ))}
          <line x1={pad} x2={W - pad} y1={y(overall)} y2={y(overall)} stroke="var(--color-text-tertiary)" strokeDasharray="4 4" />
          <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
          <text x={pad} y={H - 8} fontSize="10" fill="var(--color-text-tertiary)">1</text>
          <text x={W - pad} y={H - 8} fontSize="10" textAnchor="end" fill="var(--color-text-tertiary)">{length.toLocaleString()} nt</text>
        </svg>
        <div style={{ fontSize: 11, color: colors.text.tertiary }}>Dashed line: whole-sequence GC {fmt(overall, 1)}%. Ambiguous bases (N) are excluded from each window.</div>
      </div>
    </div>
  );
};

const NucleotideProps: React.FC<{ dna: string; counts: ReturnType<typeof baseCounts>; gc: number; tm: ReturnType<typeof meltingTemp> }> = ({ dna, counts, gc, tm }) => (
  <div>
    <PanelHead title="Physical properties"><Badge kind="calculated" /></PanelHead>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <Row k="Length" v={dna.length.toLocaleString()} unit="nt" />
        <Row k="Base counts" v={`A ${counts.A} · C ${counts.C} · G ${counts.G} · T ${counts.T}${counts.N ? ` · N ${counts.N}` : ''}`} />
        <Row k="GC content" v={fmt(gc, 2)} unit="%" note="N excluded" />
        <Row k="Melting temperature" v={fmt(tm.tm, 1)} unit="°C" note={tm.method === 'wallace' ? 'Wallace rule 2(A+T)+4(G+C), < 14 nt' : 'Basic formula 64.9+41(GC−16.4)/N, 50 mM Na⁺'} />
        <Row k="Molecular weight (ssDNA)" v={fmt(ssDnaMolecularWeight(dna), 2)} unit="g/mol" note={counts.N ? 'Undefined with N bases' : 'Anhydrous, 5′-OH (OligoCalc)'} />
        <Row k="Molecular weight (dsDNA)" v={fmt(dsDnaMolecularWeight(dna), 2)} unit="g/mol" note="Both strands" />
      </tbody>
    </table>
    <div style={{ padding: '8px 14px', fontSize: 11, color: colors.text.tertiary }}>Tm values are primer-design estimates, not a nearest-neighbour thermodynamic model.</div>
  </div>
);

const ProteinProps: React.FC<{ protein: string }> = ({ protein }) => {
  const ext = extinctionCoefficient(protein);
  const mw = proteinMolecularWeight(protein);
  return (
    <div>
      <PanelHead title="Protein properties"><Badge kind="calculated" /></PanelHead>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <Row k="Length" v={protein.replace(/\*/g, '').length.toLocaleString()} unit="aa" />
          <Row k="Molecular weight" v={fmt(mw, 2)} unit="g/mol" note="Average residue masses (ExPASy)" />
          <Row k="ε280, Cys reduced" v={ext.reduced.toLocaleString()} unit="M⁻¹cm⁻¹" note="Pace et al. 1995" />
          <Row k="ε280, all cystines" v={ext.cystines.toLocaleString()} unit="M⁻¹cm⁻¹" />
          <Row k="A280 of 1 g/L" v={mw > 0 ? fmt(ext.reduced / mw, 3) : '—'} note="Cys reduced" />
        </tbody>
      </table>
    </div>
  );
};

// ---- Bench calculators (unit-aware) --------------------------------------

function UnitInput<U extends string>({ value, onChange, unit, units, onUnit, ariaLabel }: {
  value: string; onChange: (v: string) => void; unit: U; units: readonly U[]; onUnit: (u: U) => void; ariaLabel: string;
}) {
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      <input aria-label={ariaLabel} inputMode="decimal" style={{ ...input, flex: 1, width: 0 }} value={value} onChange={(e) => onChange(e.target.value)} />
      <select aria-label={`${ariaLabel} unit`} style={{ ...input, width: 64 }} value={unit} onChange={(e) => onUnit(e.target.value as U)}>
        {units.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </span>
  );
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const CONC = Object.keys(CONC_UNITS) as ConcUnit[];
const VOL = Object.keys(VOLUME_UNITS) as VolumeUnit[];
const MASS = Object.keys(MASS_UNITS) as MassUnit[];

const BenchCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ border: hair, borderRadius: radius.sm, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
    <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
    {children}
  </div>
);
const Result: React.FC<{ children: React.ReactNode; error?: string }> = ({ children, error }) => (
  <div style={{ borderTop: hair, paddingTop: 8, fontSize: 13, color: error ? colors.semantic.warning : colors.text.primary, fontVariantNumeric: 'tabular-nums' }}>
    {error ?? children} {!error && <Badge kind="calculated" />}
  </div>
);

const BenchPanel: React.FC = () => {
  // Weigh-out
  const [mm, setMm] = useState('58.44');
  const [tc, setTc] = useState('150'); const [tcU, setTcU] = useState<ConcUnit>('mM');
  const [tv, setTv] = useState('500'); const [tvU, setTvU] = useState<VolumeUnit>('mL');
  const massG = massForMolarity(num(tc) * CONC_UNITS[tcU], num(mm), num(tv) * VOLUME_UNITS[tvU]);
  // Molarity from mass
  const [m2, setM2] = useState('10'); const [m2U, setM2U] = useState<MassUnit>('g');
  const [mm2, setMm2] = useState('58.44');
  const [v2, setV2] = useState('1'); const [v2U, setV2U] = useState<VolumeUnit>('L');
  const molar = molarityFromMass(num(m2) * MASS_UNITS[m2U], num(mm2), num(v2) * VOLUME_UNITS[v2U]);
  // Dilution
  const [unk, setUnk] = useState<DilutionUnknown>('v1');
  const [dc1, setDc1] = useState('1'); const [dc1U, setDc1U] = useState<ConcUnit>('M');
  const [dv1, setDv1] = useState(''); const [dv1U, setDv1U] = useState<VolumeUnit>('mL');
  const [dc2, setDc2] = useState('100'); const [dc2U, setDc2U] = useState<ConcUnit>('mM');
  const [dv2, setDv2] = useState('50'); const [dv2U, setDv2U] = useState<VolumeUnit>('mL');
  const dil = solveDilution({
    c1: num(dc1) * CONC_UNITS[dc1U], v1: num(dv1) * VOLUME_UNITS[dv1U],
    c2: num(dc2) * CONC_UNITS[dc2U], v2: num(dv2) * VOLUME_UNITS[dv2U],
  }, unk);
  const dilOut = unk === 'c1' || unk === 'c2'
    ? `${fmt(dil.value / CONC_UNITS[unk === 'c1' ? dc1U : dc2U], 4)} ${unk === 'c1' ? dc1U : dc2U}`
    : `${fmt(dil.value / VOLUME_UNITS[unk === 'v1' ? dv1U : dv2U], 4)} ${unk === 'v1' ? dv1U : dv2U}`;
  // A260
  const [a260, setA260] = useState(''); const [a280, setA280] = useState('');
  const [naType, setNaType] = useState<NucleicAcidType>('dsDNA'); const [dilF, setDilF] = useState('1');
  const conc = concentrationFromA260(num(a260), naType, num(dilF));
  const purity = purityNote(num(a260), num(a280), naType);

  const pair = (l: string, el: React.ReactNode, measured = false) => (
    <Field label={l}>{measured ? <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ flex: 1 }}>{el}</span><Badge kind="measured" /></span> : el}</Field>
  );
  const dilRow = (k: DilutionUnknown, l: string, el: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.text.secondary, width: 70, height: 26 }}>
        <input type="radio" name="dil-unknown" checked={unk === k} onChange={() => setUnk(k)} />Solve
      </label>
      <div style={{ flex: 1, opacity: unk === k ? 0.4 : 1 }}>{pair(l, el)}</div>
    </div>
  );

  return (
    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      <BenchCard title="Weigh out for a target molarity (m = c·V·M)">
        {pair('Molar mass (g/mol)', <input aria-label="Molar mass" inputMode="decimal" style={{ ...input, width: '100%' }} value={mm} onChange={(e) => setMm(e.target.value)} />)}
        {pair('Target concentration', <UnitInput ariaLabel="Target concentration" value={tc} onChange={setTc} unit={tcU} units={CONC} onUnit={setTcU} />)}
        {pair('Final volume', <UnitInput ariaLabel="Final volume" value={tv} onChange={setTv} unit={tvU} units={VOL} onUnit={setTvU} />)}
        <Result error={Number.isFinite(massG) ? undefined : 'Enter positive numbers.'}>
          Weigh <b>{massG >= 1 ? `${fmt(massG, 4)} g` : massG >= 1e-3 ? `${fmt(massG * 1e3, 4)} mg` : `${fmt(massG * 1e6, 4)} µg`}</b>
        </Result>
      </BenchCard>
      <BenchCard title="Molarity from a dissolved mass (c = m / M / V)">
        {pair('Mass', <UnitInput ariaLabel="Mass" value={m2} onChange={setM2} unit={m2U} units={MASS} onUnit={setM2U} />)}
        {pair('Molar mass (g/mol)', <input aria-label="Molar mass of solute" inputMode="decimal" style={{ ...input, width: '100%' }} value={mm2} onChange={(e) => setMm2(e.target.value)} />)}
        {pair('Volume', <UnitInput ariaLabel="Solution volume" value={v2} onChange={setV2} unit={v2U} units={VOL} onUnit={setV2U} />)}
        <Result error={Number.isFinite(molar) ? undefined : 'Enter positive numbers.'}>
          <b>{molar >= 1 ? `${fmt(molar, 4)} M` : molar >= 1e-3 ? `${fmt(molar * 1e3, 4)} mM` : `${fmt(molar * 1e6, 4)} µM`}</b>
        </Result>
      </BenchCard>
      <BenchCard title="Dilution (C1·V1 = C2·V2)">
        {dilRow('c1', 'Stock concentration C1', <UnitInput ariaLabel="C1" value={dc1} onChange={setDc1} unit={dc1U} units={CONC} onUnit={setDc1U} />)}
        {dilRow('v1', 'Stock volume V1', <UnitInput ariaLabel="V1" value={dv1} onChange={setDv1} unit={dv1U} units={VOL} onUnit={setDv1U} />)}
        {dilRow('c2', 'Final concentration C2', <UnitInput ariaLabel="C2" value={dc2} onChange={setDc2} unit={dc2U} units={CONC} onUnit={setDc2U} />)}
        {dilRow('v2', 'Final volume V2', <UnitInput ariaLabel="V2" value={dv2} onChange={setDv2} unit={dv2U} units={VOL} onUnit={setDv2U} />)}
        <Result error={dil.error}>{unk.toUpperCase()} = <b>{dilOut}</b>
          {unk === 'v1' && Number.isFinite(dil.value) && Number.isFinite(num(dv2)) && (
            <div style={{ fontSize: 11, color: colors.text.secondary }}>Add {fmt((num(dv2) * VOLUME_UNITS[dv2U] - dil.value) / VOLUME_UNITS[dv2U], 4)} {dv2U} diluent.</div>
          )}
        </Result>
      </BenchCard>
      <BenchCard title="Nucleic acid from absorbance (1 cm path)">
        {pair('Type', (
          <select aria-label="Nucleic acid type" style={{ ...input, width: '100%' }} value={naType} onChange={(e) => setNaType(e.target.value as NucleicAcidType)}>
            <option value="dsDNA">dsDNA (50 µg/mL per A260)</option><option value="ssDNA">ssDNA (33 µg/mL)</option><option value="RNA">RNA (40 µg/mL)</option>
          </select>
        ))}
        {pair('A260', <input aria-label="A260" inputMode="decimal" style={{ ...input, width: '100%' }} value={a260} onChange={(e) => setA260(e.target.value)} placeholder="reading" />, true)}
        {pair('A280 (optional)', <input aria-label="A280" inputMode="decimal" style={{ ...input, width: '100%' }} value={a280} onChange={(e) => setA280(e.target.value)} placeholder="reading" />, true)}
        {pair('Dilution factor', <input aria-label="Dilution factor" inputMode="decimal" style={{ ...input, width: '100%' }} value={dilF} onChange={(e) => setDilF(e.target.value)} />)}
        <Result error={Number.isFinite(conc) ? undefined : 'Enter your A260 reading.'}>
          <b>{fmt(conc, 2)} µg/mL</b>
          {a280 && <div style={{ fontSize: 11, color: colors.text.secondary }}>A260/A280 = {fmt(purity.ratio, 2)}. {purity.note}</div>}
        </Result>
      </BenchCard>
    </div>
  );
};

export default BioStudio;
