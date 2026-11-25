// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// DEX Code bottom panel: Problems (real syntax diagnostics, click to jump) and
// an integrated Terminal (the real ConPTY shell, opened in the project folder).
// The terminal stays mounted while the panel is open, so switching to Problems
// does not kill the shell.

import React, { Suspense, lazy } from 'react';
import { SegmentedControl, DexCapsuleButton, CapsuleGlyph } from '../../../components/controls';
import type { Diagnostic } from './diagnostics';
import { TestsPanel } from './TestsPanel';

const Terminal = lazy(() => import('../../../components/Terminal'));

export type BottomTab = 'problems' | 'terminal' | 'tests';

export const BottomPanel: React.FC<{
  tab: BottomTab;
  onTab: (t: BottomTab) => void;
  onClose: () => void;
  problems: Diagnostic[];
  fileName: string;
  onJump: (line: number) => void;
  cwd?: string;
  terminalStarted: boolean;
  height: number;
  /** Drag the top edge to resize (the editor owns and persists the height). */
  onResizeStart?: (e: React.MouseEvent) => void;
}> = ({ tab, onTab, onClose, problems, fileName, onJump, cwd, terminalStarted, height, onResizeStart }) => (
  <div role="region" aria-label="Problems and terminal" style={{ height, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)', minHeight: 0, position: 'relative' }}>
    {onResizeStart && (
      // A thin invisible grab strip on the hairline: no bar, no grip, just the resize cursor.
      <div role="separator" aria-orientation="horizontal" aria-label="Resize panel" onMouseDown={onResizeStart}
        style={{ position: 'absolute', left: 0, right: 0, top: -3, height: 6, cursor: 'row-resize', zIndex: 2 }} />
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', flexShrink: 0 }}>
      <SegmentedControl
        semantics="tabs"
        variant="subtle"
        size="sm"
        aria-label="Bottom panel"
        options={[{ value: 'problems', label: `Problems ${problems.length}` }, { value: 'terminal', label: 'Terminal' }, { value: 'tests', label: 'Tests', testId: 'dexcode-tab-tests' }]}
        value={tab}
        onChange={(v) => onTab(v as BottomTab)}
      />
      {tab === 'terminal' && cwd && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cwd}</span>}
      <span style={{ flex: 1 }} />
      <DexCapsuleButton size="sm" aria-label="Close panel" title="Close panel" onClick={onClose} icon={<CapsuleGlyph size="sm"><path d="M18 6L6 18M6 6l12 12" /></CapsuleGlyph>} />
    </div>
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <div hidden={tab !== 'problems'} role="list" aria-label={`Problems in ${fileName}`} style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
        {problems.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', padding: '6px 4px' }}>No problems found in {fileName}. Checked: JSON, JavaScript and DexScript syntax.</div>
        ) : problems.map((p, i) => (
          <button
            role="listitem"
            key={i}
            type="button"
            disabled={p.line == null}
            onClick={() => { if (p.line != null) onJump(p.line); }}
            style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '4px', borderRadius: 6, cursor: p.line != null ? 'pointer' : 'default', color: 'var(--color-text-primary)', fontSize: 12 }}
          >
            <span style={{ color: 'var(--color-error)', flexShrink: 0 }}>Error</span>
            <span style={{ flex: 1 }}>{p.message}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{p.line != null ? `Ln ${p.line}, Col ${p.col}` : 'whole file'}</span>
          </button>
        ))}
      </div>
      {tab === 'tests' && <TestsPanel root={cwd} />}
      {terminalStarted && (
        <div style={{ position: 'absolute', inset: 0, visibility: tab === 'terminal' ? 'visible' : 'hidden' }}>
          <Suspense fallback={<div style={{ fontSize: 12, padding: 8, color: 'var(--color-text-tertiary)' }}>Starting the shell…</div>}>
            <Terminal cwd={cwd} onClose={onClose} />
          </Suspense>
        </div>
      )}
    </div>
  </div>
);

export default BottomPanel;
