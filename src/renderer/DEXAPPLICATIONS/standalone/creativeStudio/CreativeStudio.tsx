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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', flexShrink: 0 }}>
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
