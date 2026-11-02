// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Creative Hub (Part 5 §15): one lightweight place for creative work.
// Everything shown is real: the creative apps and whether they're installed,
// recent Canvas boards and Notes, whiteboard templates, and how much space the
// boards take. Nothing is installed or downloaded from here; removed apps are
// re-added through the Store.
//

import React, { useEffect, useMemo, useState } from 'react';
import { APP_DEFINITIONS } from '../../store/runningApps';
import { useInstalledAppsStore, isAppInstalled } from '../../store/installedAppsStore';
import { useNotesStore } from '../../store/notesStore';
import { loadIndex, requestCanvas, type BoardsIndex } from './canvasBoards';
import { BOARD_TEMPLATES } from './canvasObjects';
import { persistGet } from '../../utils/persistentStore';

/** The creative suite, with what each app is for in Part 5's terms. */
const CREATIVE_APPS: Array<{ id: string; role: string }> = [
  { id: 'canvas', role: 'Whiteboard & drawing' },
  { id: 'notes', role: 'Writing' },
  { id: 'prism', role: 'Photo' },
  { id: 'videoeditor', role: 'Video' },
  { id: 'imosion', role: 'Audio' },
  { id: 'presentation', role: 'Presentations' },
  { id: 'flux', role: 'Motion graphics' },
  { id: 'axl', role: 'Design & 3D' },
  { id: 'pixelart', role: 'Pixel art' },
  { id: 'forge', role: 'Media encoding' },
];

interface Recent { key: string; app: string; title: string; updatedAt: number; open(): void }

const open = (appId: string) => window.dispatchEvent(new CustomEvent('dex-open-in-window', { detail: { appId } }));

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg, 14px)', background: 'var(--color-bg-surface)', padding: 14,
};
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 10px', letterSpacing: '0.01em' };
const btn: React.CSSProperties = {
  height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm, 6px)', border: '1px solid var(--color-border-control)',
  background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

function ago(t: number): string {
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const CreativeHub: React.FC = () => {
  const removed = useInstalledAppsStore((s) => s.removedAppIds);
  const notes = useNotesStore((s) => s.notes);
  const notesReady = useNotesStore((s) => s.initialized);
  const [boards, setBoards] = useState<BoardsIndex | null>(null);
  const [boardBytes, setBoardBytes] = useState<number | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!notesReady) void useNotesStore.getState().initialize();
    let alive = true;
    void (async () => {
      try {
        const idx = await loadIndex();
        if (!alive) return;
        setBoards(idx);
        // Real size on disk of the saved boards (paint layers + objects).
        let total = 0;
        for (const b of idx.boards) {
          const data = await persistGet<unknown>(`canvas:board:${b.id}`);
          if (data) total += JSON.stringify(data).length;
        }
        if (alive) setBoardBytes(total);
      } catch { if (alive) setBoards({ boards: [], activeId: '' }); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recents: Recent[] = useMemo(() => {
    const out: Recent[] = [];
    for (const b of boards?.boards ?? []) {
      out.push({ key: `b:${b.id}`, app: 'Canvas', title: b.folder ? `${b.folder} / ${b.name}` : b.name, updatedAt: b.updatedAt,
        open: () => { requestCanvas({ boardId: b.id }); open('canvas'); } });
    }
    for (const n of notes ?? []) {
      out.push({ key: `n:${n.id}`, app: 'Notes', title: n.title || 'Untitled note', updatedAt: Number(n.updated_at) || 0,
        open: () => { open('notes'); useNotesStore.getState().selectNote(n.id); } });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [boards, notes]);

  const term = q.trim().toLowerCase();
  const shownRecents = (term ? recents.filter((r) => r.title.toLowerCase().includes(term) || r.app.toLowerCase().includes(term)) : recents).slice(0, term ? 50 : 12);
  const apps = CREATIVE_APPS.filter((a) => APP_DEFINITIONS[a.id as keyof typeof APP_DEFINITIONS])
    .filter((a) => !term || a.role.toLowerCase().includes(term) || (APP_DEFINITIONS[a.id as keyof typeof APP_DEFINITIONS]?.name || '').toLowerCase().includes(term));
  const templates = BOARD_TEMPLATES.filter((t) => !term || t.name.toLowerCase().includes(term) || t.description.toLowerCase().includes(term));

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Creative Hub</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>Your recent work, your creative apps, and a quick start.</p>
          </div>
          <input type="search" aria-label="Search projects, apps and templates" placeholder="Search projects, apps and templates" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ width: 320, maxWidth: '100%', height: 34, padding: '0 12px', borderRadius: 'var(--radius-md, 10px)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 13 }} />
        </header>

        <section style={card} aria-labelledby="hub-recent">
          <h2 id="hub-recent" style={h2}>Recent projects</h2>
          {shownRecents.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{term ? 'Nothing matches.' : 'No projects yet. Start one from a template below.'}</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {shownRecents.map((r) => (
                <li key={r.key}>
                  <button onClick={r.open} aria-label={`Open ${r.title} in ${r.app}`} style={{ ...btn, width: '100%', height: 'auto', padding: '10px 12px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{r.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.app}{r.updatedAt ? ` · ${ago(r.updatedAt)}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={card} aria-labelledby="hub-templates">
          <h2 id="hub-templates" style={h2}>Start from a template</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            <button style={{ ...btn, height: 'auto', padding: '12px', textAlign: 'left' }} onClick={() => { requestCanvas({ templateId: '' }); open('canvas'); }} aria-label="Open Canvas">
              <div style={{ fontSize: 13, fontWeight: 600 }}>Blank whiteboard</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>Open Canvas</div>
            </button>
            {templates.map((t) => (
              <button key={t.id} style={{ ...btn, height: 'auto', padding: '12px', textAlign: 'left' }} onClick={() => { requestCanvas({ templateId: t.id }); open('canvas'); }} aria-label={`New ${t.name} board`}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{t.description}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={card} aria-labelledby="hub-apps">
          <h2 id="hub-apps" style={h2}>Creative apps</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {apps.map((a) => {
              const def = APP_DEFINITIONS[a.id as keyof typeof APP_DEFINITIONS];
              const installed = isAppInstalled(removed, a.id);
              return (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md, 10px)' }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: def?.color || 'var(--color-accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{def?.name || a.id}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{a.role}{installed ? '' : ' · removed'}</div>
                  </div>
                  {installed
                    ? <button style={btn} onClick={() => open(a.id)} aria-label={`Open ${def?.name || a.id}`}>Open</button>
                    : <button style={btn} onClick={() => open('store')} aria-label={`Add ${def?.name || a.id} back from the Store`}>Get</button>}
                </li>
              );
            })}
          </ul>
        </section>

        <section style={card} aria-labelledby="hub-storage">
          <h2 id="hub-storage" style={h2}>Storage</h2>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <div><div style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>Canvas boards</div>{boards ? `${boards.boards.length} board${boards.boards.length === 1 ? '' : 's'}` : '…'}{boardBytes !== null ? ` · ${fmtBytes(boardBytes)}` : ''}</div>
            <div><div style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>Notes</div>{notesReady ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '…'}</div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button style={btn} onClick={() => { open('settings'); setTimeout(() => window.dispatchEvent(new CustomEvent('dex-settings-navigate', { detail: { section: 'storage' } })), 600); }}>Manage storage…</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CreativeHub;
