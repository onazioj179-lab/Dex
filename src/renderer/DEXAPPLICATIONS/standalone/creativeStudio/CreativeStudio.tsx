// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Creative Studio: one window for the board (whiteboard, drawing, diagrams)
 * and the slides (build and present decks). Each mode is the full editor it
 * always was; a mode mounts on first use and stays mounted, so switching never
 * loses work. "Send to Slides" on the board turns its frames into editable
 * slides. Opening Presentation from anywhere lands here in Slides mode, so the
 * same deck is never open in two places.
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { SegmentedControl } from '../../../components/controls/SegmentedControl';

// Both editors load lazily: Canvas and Slides import this folder's helpers,
// so a static import here would make a chunk cycle.
const Canvas = lazy(() => import('../Canvas'));
const PresentationBuilder = lazy(() => import('../PresentationBuilder'));

import { setStudioMode, storedStudioMode as storedMode, STUDIO_MODE_EVENT, type StudioMode } from './studioMode';
import { serializeStudioProject, parseStudioProject } from './studioProject';
import { getLiveBoard, importBoardIntoCanvas } from '../canvasBoards';
import { sendSlidesToPresentation } from './boardToSlides';
import { hasNativeFiles, pickSavePath, pickOpenPath, writeTextFile, readTextFile } from '../../../services/nativeFiles';
import { DexCapsuleButton } from '../../../components/controls';

const toast = (type: 'success' | 'error' | 'info', message: string) => window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));

/** The deck as Slides last saved it (it autosaves every change). */
function workingDeck(): { slides: unknown[]; theme: string | null } | null {
  try {
    const raw = localStorage.getItem('dex-presentations-current');
    const v = raw ? JSON.parse(raw) : null;
    const slides = Array.isArray(v) ? v : Array.isArray(v?.slides) ? v.slides : null;
    return slides && slides.length ? { slides, theme: localStorage.getItem('dex-presentations-theme') } : null;
  } catch { return null; }
}

async function saveProject(): Promise<void> {
  const board = getLiveBoard();
  const deck = workingDeck();
  if (!board && !deck) { toast('info', 'Nothing to save yet: open the Board or Slides first.'); return; }
  const text = serializeStudioProject(board, deck);
  const base = (board?.name || 'Creative Studio').replace(/[^A-Za-z0-9 ._-]+/g, '_');
  try {
    if (hasNativeFiles()) {
      const path = await pickSavePath(`${base}.dexstudio`, [{ name: 'Creative Studio project', extensions: ['dexstudio'] }], 'Save Creative Studio project');
      if (!path) return;
      await writeTextFile(path, text);
      toast('success', `Saved ${path.split(/[\\/]/).pop()}${board ? '' : ' (slides only)'}${deck ? '' : ' (board only)'}`);
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${base}.dexstudio`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (e) { toast('error', `Could not save the project: ${(e as Error).message}`); }
}

async function openProject(): Promise<void> {
  try {
    if (!hasNativeFiles()) { toast('info', 'Opening projects needs the DEX desktop app.'); return; }
    const path = await pickOpenPath([{ name: 'Creative Studio project', extensions: ['dexstudio'] }]);
    if (!path) return;
    const p = parseStudioProject(await readTextFile(path));
    if (p.board) { setStudioMode('board'); importBoardIntoCanvas(p.board.name, p.board.payload); }
    if (p.deck) sendSlidesToPresentation(p.deck.slides as never[]);
    toast('success', `Opened: ${[p.board ? `board "${p.board.name}" added` : '', p.deck ? `${p.deck.slides.length} slide(s) added after yours` : ''].filter(Boolean).join(', ')}.`);
  } catch (e) { toast('error', `Could not open the project: ${(e as Error).message}`); }
}

const CreativeStudio: React.FC = () => {
  const [mode, setMode] = useState<StudioMode>(storedMode);
  const [mounted, setMounted] = useState<Record<StudioMode, boolean>>(() => ({ board: storedMode() === 'board', slides: storedMode() === 'slides' }));

  useEffect(() => {
    const on = (e: Event) => {
      const m = (e as CustomEvent<{ mode?: StudioMode }>).detail?.mode;
      if (m === 'board' || m === 'slides') { setMode(m); setMounted((s) => ({ ...s, [m]: true })); }
    };
    window.addEventListener(STUDIO_MODE_EVENT, on);
    return () => window.removeEventListener(STUDIO_MODE_EVENT, on);
  }, []);

  const choose = (m: StudioMode) => { setStudioMode(m); };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-testid="creative-studio">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', flexShrink: 0, position: 'relative' }}>
        <SegmentedControl
          semantics="tabs"
          size="sm"
          aria-label="Creative Studio mode"
          value={mode}
          onChange={choose}
          options={[
            { value: 'board', label: 'Board', title: 'Whiteboard, drawing and diagrams', testId: 'studio-mode-board' },
            { value: 'slides', label: 'Slides', title: 'Build and present slide decks', testId: 'studio-mode-slides' },
          ]}
        />
        <div style={{ position: 'absolute', right: 10, display: 'flex', gap: 6 }}>
          <DexCapsuleButton size="sm" onClick={() => { void openProject(); }} title="Add a .dexstudio project's board and slides (nothing is replaced)" data-testid="studio-open-project">Open Project…</DexCapsuleButton>
          <DexCapsuleButton size="sm" onClick={() => { void saveProject(); }} title="Save the board and the slides as one .dexstudio file" data-testid="studio-save-project">Save Project…</DexCapsuleButton>
        </div>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {mounted.board && (
          <div hidden={mode !== 'board'} style={{ position: 'absolute', inset: 0 }}>
            <Suspense fallback={<div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Opening Board…</div>}>
              <Canvas />
            </Suspense>
          </div>
        )}
        {mounted.slides && (
          // Its own app id, so its shortcuts and UKI actions stay its own.
          <div hidden={mode !== 'slides'} data-app-id="presentation" style={{ position: 'absolute', inset: 0 }}>
            <Suspense fallback={<div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Opening Slides…</div>}>
              <PresentationBuilder />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreativeStudio;
