// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * CitationsPanel - lists the citations used in a UKI reply, highlighting
 * which citation indices actually appear in the body. Pure presentation;
 * data comes from the shared confidence module helpers.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React, { useMemo } from 'react';
import { extractCitationIndices, formatCitation, type Citation } from '../../../shared/uki/confidence';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

export interface CitationsPanelProps {
  /** The reply body (used to detect [n] markers actually in use). */
  body: string;
  /** Full citation list provided alongside the reply. */
  citations: Citation[];
  /** Optional click handler for opening the source. */
  onOpen?: (citation: Citation) => void;
  /** Hide the heading. */
  bare?: boolean;
}

export function CitationsPanel({ body, citations, onOpen, bare = false }: CitationsPanelProps) {
  const used = useMemo(() => new Set(extractCitationIndices(body)), [body]);
  const sorted = useMemo(() => [...citations].sort((a, b) => a.index - b.index), [citations]);
  if (sorted.length === 0) return null;
  return (
    <section data-testid="citations-panel" style={{ marginTop: space[3] }}>
      {!bare && (
        <h3 style={{
          margin: 0,
          marginBottom: space[2],
          fontSize: fontSize.sm,
          fontWeight: fontWeight.semibold,
          color: colors.text.secondary,
        }}>
          Sources
        </h3>
      )}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
        {sorted.map((c) => {
          const isUsed = used.has(c.index);
          const content = formatCitation(c);
          return (
            <li
              key={c.index}
              data-testid={`citation-${c.index}`}
              data-used={isUsed ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: space[2],
                padding: `${space[1]}px ${space[2]}px`,
                borderRadius: radius.md,
                background: isUsed ? colors.accent.soft : 'transparent',
                opacity: isUsed ? 1 : 0.55,
                fontSize: fontSize.sm,
                color: colors.text.primary,
              }}
            >
              <span style={{
                color: isUsed ? colors.accent.default : colors.text.tertiary,
                fontWeight: fontWeight.semibold,
                minWidth: 24,
              }}>[{c.index}]</span>
              {onOpen && c.url ? (
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left',
                    textDecoration: 'underline',
                  }}
                >
                  {content.replace(/^\[\d+\]\s*/, '')}
                </button>
              ) : (
                <span>{content.replace(/^\[\d+\]\s*/, '')}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
