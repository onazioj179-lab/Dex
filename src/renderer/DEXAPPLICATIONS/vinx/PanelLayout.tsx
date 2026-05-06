// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- PanelLayout
 * 4-zone resizable layout: MediaBrowser (left), Viewer (top-center),
 * Inspector (right), Timeline (bottom).
 * 4px drag handles, live resize at 60fps, double-click resets to defaults.
 */

import React, { useCallback, useRef, useEffect, memo } from 'react';
import { useVinxStore } from './VinxStore';
import { DEFAULT_PANEL_LAYOUT } from './VinxTypes';

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 4;
const MIN_PANEL_WIDTH = 160;
const MAX_PANEL_WIDTH = 600;
const MIN_TIMELINE_HEIGHT = 120;
const MAX_TIMELINE_HEIGHT = 600;

// ---------------------------------------------------------------------------
// DRAG HANDLE
// ---------------------------------------------------------------------------

interface DragHandleProps {
  direction: 'vertical' | 'horizontal';
  onDrag: (delta: number) => void;
  onDoubleClick: () => void;
}

const DragHandle: React.FC<DragHandleProps> = memo(({ direction, onDrag, onDoubleClick }) => {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = direction === 'vertical' ? e.clientX : e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [direction]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const current = direction === 'vertical' ? e.clientX : e.clientY;
    const delta = current - lastPos.current;
    if (delta !== 0) {
      lastPos.current = current;
      onDrag(delta);
    }
  }, [direction, onDrag]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const style: React.CSSProperties = direction === 'vertical'
    ? { width: HANDLE_SIZE, cursor: 'col-resize', position: 'relative', flexShrink: 0, zIndex: 2 }
    : { height: HANDLE_SIZE, cursor: 'row-resize', position: 'relative', flexShrink: 0, zIndex: 2 };

  return (
    <div
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-border-subtle)',
      }} />
      <div style={{
        position: 'absolute',
        ...(direction === 'vertical'
          ? { top: '50%', left: 0, right: 0, height: 24, transform: 'translateY(-50%)', borderLeft: '1px solid var(--color-border-subtle)', borderRight: '1px solid var(--color-border-subtle)' }
          : { left: '50%', top: 0, bottom: 0, width: 24, transform: 'translateX(-50%)', borderTop: '1px solid var(--color-border-subtle)', borderBottom: '1px solid var(--color-border-subtle)' }
        ),
      }} />
    </div>
  );
});

DragHandle.displayName = 'DragHandle';

// ---------------------------------------------------------------------------
// PANEL LAYOUT COMPONENT
// ---------------------------------------------------------------------------

interface VinxPanelLayoutProps {
  mediaBrowser: React.ReactNode;
  viewer: React.ReactNode;
  inspector: React.ReactNode;
  timeline: React.ReactNode;
}

export const VinxPanelLayout: React.FC<VinxPanelLayoutProps> = memo(({
  mediaBrowser,
  viewer,
  inspector,
  timeline,
}) => {
  const panelLayout = useVinxStore(s => s.project.panelLayout);
  const setPanelLayout = useVinxStore(s => s.setPanelLayout);

  const mediaBrowserWidth = panelLayout.mediaBrowserWidth;
  const inspectorWidth = panelLayout.inspectorWidth;
  const timelineHeight = panelLayout.timelineHeight;

  const handleLeftDrag = useCallback((delta: number) => {
    const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, mediaBrowserWidth + delta));
    setPanelLayout({ mediaBrowserWidth: newWidth });
  }, [mediaBrowserWidth, setPanelLayout]);

  const handleRightDrag = useCallback((delta: number) => {
    const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, inspectorWidth - delta));
    setPanelLayout({ inspectorWidth: newWidth });
  }, [inspectorWidth, setPanelLayout]);

  const handleBottomDrag = useCallback((delta: number) => {
    const newHeight = Math.max(MIN_TIMELINE_HEIGHT, Math.min(MAX_TIMELINE_HEIGHT, timelineHeight - delta));
    setPanelLayout({ timelineHeight: newHeight });
  }, [timelineHeight, setPanelLayout]);

  const resetLeft = useCallback(() => {
    setPanelLayout({ mediaBrowserWidth: DEFAULT_PANEL_LAYOUT.mediaBrowserWidth });
  }, [setPanelLayout]);

  const resetRight = useCallback(() => {
    setPanelLayout({ inspectorWidth: DEFAULT_PANEL_LAYOUT.inspectorWidth });
  }, [setPanelLayout]);

  const resetBottom = useCallback(() => {
    setPanelLayout({ timelineHeight: DEFAULT_PANEL_LAYOUT.timelineHeight });
  }, [setPanelLayout]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--color-bg-base)',
    }}>
      {/* Top row: MediaBrowser | Viewer | Inspector */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {/* Media Browser */}
        <div style={{
          width: mediaBrowserWidth,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-base)',
          borderRight: '1px solid var(--color-bg-hover)',
        }}>
          {mediaBrowser}
        </div>

        <DragHandle direction="vertical" onDrag={handleLeftDrag} onDoubleClick={resetLeft} />

        {/* Viewer */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-base)',
        }}>
          {viewer}
        </div>

        <DragHandle direction="vertical" onDrag={handleRightDrag} onDoubleClick={resetRight} />

        {/* Inspector */}
        <div style={{
          width: inspectorWidth,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-base)',
          borderLeft: '1px solid var(--color-bg-hover)',
        }}>
          {inspector}
        </div>
      </div>

      <DragHandle direction="horizontal" onDrag={handleBottomDrag} onDoubleClick={resetBottom} />

      {/* Timeline */}
      <div style={{
        height: timelineHeight,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-base)',
        borderTop: '1px solid var(--color-bg-hover)',
      }}>
        {timeline}
      </div>
    </div>
  );
});

VinxPanelLayout.displayName = 'VinxPanelLayout';
