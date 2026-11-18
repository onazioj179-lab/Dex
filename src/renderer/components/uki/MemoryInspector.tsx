// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * MemoryInspector - user-visible browser of UKI memory items. Lets the user
 * search, filter by tier, forget individual entries, and export everything
 * as JSON. The store is read-through; mutations call back into the host.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React, { useMemo, useState } from 'react';
import { SegmentedControl } from '../controls';
import { Button } from '../../ui/Button';
import { DexSearchInput } from '../../styles/components';
import {
  recallMemory, exportMemories, type MemoryStore, type MemoryItem, type MemoryKind,
} from '../../../shared/uki/memory';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

const KINDS: Array<{ id: 'all' | MemoryKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'short', label: 'Short-term' },
  { id: 'working', label: 'Working' },
  { id: 'long', label: 'Long-term' },
];

export interface MemoryInspectorProps {
  store: MemoryStore;
  onForget?: (id: string) => void;
  onExport?: (json: string) => void;
  /** Override now for deterministic recency ordering (tests). */
  now?: number;
}

export function MemoryInspector({ store, onForget, onExport, now }: MemoryInspectorProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | MemoryKind>('all');

  const items = useMemo<MemoryItem[]>(() => {
    if (!query.trim()) {
      const all = exportMemories(store);
      const filtered = kind === 'all' ? all : all.filter((m) => m.kind === kind);
      return filtered.sort((a, b) => b.accessedAt - a.accessedAt);
    }
    return recallMemory(store, query, {
      kind: kind === 'all' ? undefined : kind, limit: 100, now,
    });
  }, [store, query, kind, now]);

  const handleExport = () => {
    const json = JSON.stringify(exportMemories(store), null, 2);
    onExport?.(json);
  };

  return (
    <section data-testid="memory-inspector" style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <DexSearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder="Search memory…"
          data-testid="memory-search"
          fullWidth
        />
        <Button variant="secondary" onClick={handleExport} data-testid="memory-export">Export</Button>
      </header>

      <SegmentedControl
        semantics="tabs"
        size="md"
        aria-label="Memory tier"
        options={KINDS.map((k) => ({ value: k.id, label: k.label, testId: `memory-tab-${k.id}` }))}
        value={kind}
        onChange={(v) => setKind(v as typeof kind)}
      />

      {items.length === 0 ? (
        <div data-testid="memory-empty" style={{ color: colors.text.tertiary, fontSize: fontSize.sm, padding: space[3] }}>
          No memories match.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {items.map((m) => (
            <li
              key={m.id}
              data-testid={`memory-item-${m.id}`}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: space[3],
                padding: space[2], background: colors.bg.inset, borderRadius: radius.md,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, color: colors.text.primary, wordBreak: 'break-word' }}>
                  {m.content}
                </div>
                <div style={{ marginTop: space[1], fontSize: fontSize.xs, color: colors.text.tertiary }}>
                  <span data-testid={`memory-kind-${m.id}`}>{m.kind}</span>
                  <span> · importance {(m.importance * 100).toFixed(0)}%</span>
                  {m.tags.length > 0 && <span> · {m.tags.join(', ')}</span>}
                  {m.source && <span> · {m.source}</span>}
                </div>
              </div>
              {onForget && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onForget(m.id)}
                  data-testid={`memory-forget-${m.id}`}
                >
                  Forget
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
