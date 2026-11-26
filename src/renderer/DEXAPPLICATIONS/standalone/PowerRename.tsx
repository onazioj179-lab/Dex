// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PowerRename - PowerToys-style batch file renaming.
 * Find/replace (literal or regex), case transforms, prefix/suffix, and an
 * auto-numbering sequence, all with a live before/after preview and collision
 * detection. Transforms are pure (powerRenameEngine); apply goes through the
 * real files:renameBatch IPC.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import DexIcon from '../../components/DexIcon';
import { useToastHelpers } from '../../components/Toast';
import { invokePlatformIpc } from '../../services/platform/ipc';
import {
  computeBatch,
  DEFAULT_RENAME_CONFIG,
  type RenameConfig,
  type CaseTransform,
  type RenameScope,
} from './powerRenameEngine';

interface SourceItem {
  /** Absolute path when known (real file from the bridge / drop) -- required to
   *  actually rename. Null for pasted/preview-only names. */
  path: string | null;
  original: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff',
  fontSize: 13, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block',
};

const Toggle: React.FC<{ on: boolean; onClick: () => void; label: string }> = ({ on, onClick, label }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    style={{
      padding: '6px 11px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
      border: `1px solid ${on ? 'var(--color-accent, #0A84FF)' : 'rgba(255,255,255,0.14)'}`,
      background: on ? 'rgba(10,132,255,0.18)' : 'rgba(255,255,255,0.04)',
      color: on ? 'var(--color-accent, #4A9EFF)' : 'rgba(255,255,255,0.75)',
      transition: 'all 0.12s ease',
    }}
  >{label}</button>
);

const PowerRename: React.FC = () => {
  const { success, error: toastError, info } = useToastHelpers();
  const [items, setItems] = useState<SourceItem[]>([]);
  const [cfg, setCfg] = useState<RenameConfig>(DEFAULT_RENAME_CONFIG);
  const [folderPath, setFolderPath] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof RenameConfig>(k: K, v: RenameConfig[K]) =>
    setCfg(c => ({ ...c, [k]: v })), []);
  const setNum = useCallback(<K extends keyof RenameConfig['numbering']>(k: K, v: RenameConfig['numbering'][K]) =>
    setCfg(c => ({ ...c, numbering: { ...c.numbering, [k]: v } })), []);

  const results = useMemo(() => computeBatch(items.map(i => i.original), cfg, items.map(item => {
    const path = item.path?.replace(/\\/g, '/');
    return path ? path.slice(0, path.lastIndexOf('/')).toLowerCase() : '';
  })), [items, cfg]);
  const changeCount = results.filter(r => r.changed && !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  const realCount = items.filter(i => i.path).length;
  const canApply = errorCount === 0 && !applying && results.some((result, index) => result.changed && items[index].path);

  // ── Sources ───────────────────────────────────────────────────
  const addNames = useCallback((next: SourceItem[]) => {
    setItems(prev => {
      const seen = new Set(prev.map(p => (p.path ?? p.original)));
      const merged = [...prev];
      for (const item of next) {
        const key = item.path ?? item.original;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      return merged;
    });
  }, []);

  const loadFolder = useCallback(async (path: string) => {
    const p = path.trim();
    if (!p) return;
    try {
      type Entry = { path: string; name: string; isDirectory: boolean };
      const list = await invokePlatformIpc<Entry[] | { files?: Entry[]; error?: string }>('files:list', p);
      const entries = Array.isArray(list) ? list : list?.files;
      if (!Array.isArray(entries) || (!Array.isArray(list) && list?.error)) {
        throw new Error((!Array.isArray(list) && list?.error) || 'Directory listing unavailable');
      }
      const files = entries.filter(file => typeof file.path === 'string' && typeof file.name === 'string' && !file.isDirectory);
      if (files.length === 0) { info('No files found in that folder'); return; }
      addNames(files.map(file => ({ path: file.path, original: file.name })));
      success(`Loaded ${files.length} file${files.length === 1 ? '' : 's'}`);
    } catch (e) {
      toastError('Could not read that folder');
      console.warn('[PowerRename] files:list failed', e);
    }
  }, [addNames, info, success, toastError]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length === 0) return;
    addNames(dropped.map(f => ({ path: (f as any).path || null, original: f.name })));
  }, [addNames]);

  const applyPaste = useCallback(() => {
    const names = pasteText.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    addNames(names.map(n => ({ path: null, original: n })));
    setPasteText(''); setPasteMode(false);
  }, [pasteText, addNames]);

  // ── Apply ─────────────────────────────────────────────────────
  const apply = useCallback(async () => {
    if (!canApply) return;
    const plan = items.flatMap((item, index) => (
      item.path && results[index].changed ? [{ source: item.path, name: results[index].next }] : []
    ));
    setApplying(true);
    setApplyError('');
    try {
      const outcome = await invokePlatformIpc<
        { success: true; paths: string[] } | { success: false; error: string }
      >('files:renameBatch', plan);
      if (!outcome?.success || !Array.isArray(outcome.paths) || outcome.paths.length !== plan.length
        || outcome.paths.some(path => typeof path !== 'string')) {
        const error = outcome?.success === false ? outcome.error : 'Could not confirm the rename results. Reload the folder before applying again.';
        setApplyError(error);
        toastError('Batch rename could not be completed');
        return;
      }
      const updated = new Map(plan.map((entry, index): [string, SourceItem] => [
        entry.source, { path: outcome.paths[index], original: entry.name },
      ]));
      setItems(previous => previous.map(item => item.path ? updated.get(item.path) ?? item : item));
      success(`Renamed ${plan.length} file${plan.length === 1 ? '' : 's'}`);
    } finally {
      setApplying(false);
    }
  }, [canApply, items, results, success, toastError]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg, #0a0a0c)', color: '#fff', overflow: 'hidden' }}>
      {applyError && <div role="alert" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, color: 'var(--color-error)', maxHeight: 120, overflow: 'auto' }}>{applyError}</div>}
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #FF375F, #FF6482)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <DexIcon name="wand" size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>PowerRename</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {items.length === 0 ? 'Batch rename with patterns, regex, and numbering'
              : `${items.length} file${items.length === 1 ? '' : 's'} · ${changeCount} will change${errorCount ? ` · ${errorCount} issue${errorCount === 1 ? '' : 's'}` : ''}`}
          </div>
        </div>
        {items.length > 0 && (
          <button onClick={() => setItems([])} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}>Clear</button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Controls */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Find</label>
            <input style={inputStyle} value={cfg.find} placeholder={cfg.useRegex ? 'regex e.g. IMG_(\\d+)' : 'text to find'} onChange={e => set('find', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Replace with</label>
            <input style={inputStyle} value={cfg.replace} placeholder={cfg.useRegex ? 'e.g. Photo $1' : 'replacement'} onChange={e => set('replace', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Toggle on={cfg.useRegex} onClick={() => set('useRegex', !cfg.useRegex)} label=".* Regex" />
            <Toggle on={cfg.caseSensitive} onClick={() => set('caseSensitive', !cfg.caseSensitive)} label="Aa Case" />
          </div>
          <div>
            <label style={labelStyle}>Apply to</label>
            <select style={inputStyle} value={cfg.scope} onChange={e => set('scope', e.target.value as RenameScope)}>
              <option value="name">Name only</option>
              <option value="extension">Extension only</option>
              <option value="full">Full filename</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Case</label>
            <select style={inputStyle} value={cfg.caseTransform} onChange={e => set('caseTransform', e.target.value as CaseTransform)}>
              <option value="none">Keep as-is</option>
              <option value="lower">lowercase</option>
              <option value="upper">UPPERCASE</option>
              <option value="title">Title Case</option>
              <option value="sentence">Sentence case</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prefix</label>
              <input style={inputStyle} value={cfg.prefix} onChange={e => set('prefix', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Suffix</label>
              <input style={inputStyle} value={cfg.suffix} onChange={e => set('suffix', e.target.value)} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Numbering</label>
              <Toggle on={cfg.numbering.enabled} onClick={() => setNum('enabled', !cfg.numbering.enabled)} label={cfg.numbering.enabled ? 'On' : 'Off'} />
            </div>
            {cfg.numbering.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Start</label>
                    <input type="number" style={inputStyle} value={cfg.numbering.start} onChange={e => setNum('start', Number(e.target.value) || 0)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Step</label>
                    <input type="number" style={inputStyle} value={cfg.numbering.step} onChange={e => setNum('step', Number(e.target.value) || 1)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Pad</label>
                    <input type="number" style={inputStyle} value={cfg.numbering.padding} onChange={e => setNum('padding', Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Position</label>
                    <select style={inputStyle} value={cfg.numbering.position} onChange={e => setNum('position', e.target.value as 'prefix' | 'suffix')}>
                      <option value="suffix">Suffix</option>
                      <option value="prefix">Prefix</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Separator</label>
                    <input style={inputStyle} value={cfg.numbering.separator} onChange={e => setNum('separator', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview / sources */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {items.length === 0 ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{ flex: 1, margin: 18, borderRadius: 14, border: `2px dashed ${dragOver ? 'var(--color-accent, #0A84FF)' : 'rgba(255,255,255,0.16)'}`, background: dragOver ? 'rgba(10,132,255,0.08)' : 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', transition: 'all 0.15s ease' }}
            >
              <DexIcon name="folder-open" size={40} color="rgba(255,255,255,0.4)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Drop files here to rename</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>or load a folder, or paste a list of names</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                <input style={{ ...inputStyle, width: 220 }} placeholder="C:\\path\\to\\folder" value={folderPath} onChange={e => setFolderPath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadFolder(folderPath); }} />
                <button onClick={() => loadFolder(folderPath)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', borderColor: 'var(--color-accent, #0A84FF)', color: 'var(--color-accent, #4A9EFF)' }}>Load folder</button>
                <button onClick={() => setPasteMode(p => !p)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>Paste names</button>
              </div>
              {pasteMode && (
                <div style={{ width: '100%', maxWidth: 460 }} onDragOver={e => e.stopPropagation()}>
                  <textarea
                    value={pasteText} onChange={e => setPasteText(e.target.value)}
                    placeholder={'IMG_001.jpg\nIMG_002.jpg\nIMG_003.jpg'}
                    style={{ ...inputStyle, height: 110, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)' }}
                  />
                  <button onClick={applyPaste} style={{ ...inputStyle, marginTop: 8, cursor: 'pointer', borderColor: 'var(--color-accent, #0A84FF)', color: 'var(--color-accent, #4A9EFF)' }}>Add {pasteText.split('\n').filter(s => s.trim()).length || ''} names</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', fontSize: 13, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{r.original}</span>
                  <DexIcon name="arrow-right" size={13} color="rgba(255,255,255,0.3)" />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)', color: r.error ? '#FF6482' : r.changed ? '#30D158' : 'rgba(255,255,255,0.4)' }}>
                    {r.error ? `${r.next}  (${r.error})` : r.next}
                  </span>
                  {!items[i]?.path && !r.error && <span title="Preview only — no file path" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>preview</span>}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {items.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {errorCount > 0 ? `${errorCount} name${errorCount === 1 ? '' : 's'} need attention`
                  : realCount === 0 ? 'Preview only — drop real files or load a folder to apply'
                  : `${changeCount} of ${items.length} will be renamed`}
              </div>
              <button
                onClick={apply}
                disabled={!canApply}
                style={{
                  padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: canApply ? 'pointer' : 'not-allowed',
                  background: canApply ? 'linear-gradient(135deg, #FF375F, #FF6482)' : 'rgba(255,255,255,0.08)',
                  color: canApply ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.12s ease',
                }}
              >{applying ? 'Renaming…' : `Apply Rename${realCount > 0 && changeCount > 0 ? ` (${changeCount})` : ''}`}</button>
            </div>
          )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} />
    </div>
  );
};

export default PowerRename;
