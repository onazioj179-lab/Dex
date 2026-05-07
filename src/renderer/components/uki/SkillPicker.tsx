// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * SkillPicker - shows the top-K matched skills for a typed intent and lets
 * the user pick one (Enter or click). Backed by the pure `matchSkills`
 * function; missing-context skills render disabled with a hint.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { TextInput } from '../../ui/TextInput';
import {
  matchSkills, type SkillRegistry, type RankedSkill,
} from '../../../shared/uki/skills';
import { colors, fontSize, fontWeight, radius, space } from '../../styles/tokens';

export interface SkillPickerProps {
  registry: SkillRegistry;
  /** Initial intent text. */
  initialIntent?: string;
  /** Active app id, narrows scoped skills. */
  appId?: string;
  /** Available facts for required-context check. */
  facts?: Record<string, unknown>;
  /** Top-K. */
  limit?: number;
  /** Called when user picks a skill (Enter / click). */
  onPick: (skillId: string) => void;
  /** Allow picking even if context is missing. */
  allowMissingContext?: boolean;
}

export function SkillPicker({
  registry, initialIntent = '', appId, facts, limit = 5, onPick, allowMissingContext = false,
}: SkillPickerProps) {
  const [intent, setIntent] = useState(initialIntent);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo<RankedSkill[]>(
    () => matchSkills(intent, registry, { appId, facts, limit }),
    [intent, registry, appId, facts, limit],
  );

  useEffect(() => { setActive(0); }, [intent]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (ranked.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, ranked.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = ranked[active];
      if (!r) return;
      const blocked = !allowMissingContext && r.missingContext.length > 0;
      if (!blocked) onPick(r.skill.id);
    }
  };

  return (
    <div data-testid="skill-picker" style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <TextInput
        ref={inputRef}
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="What do you want to do?"
        data-testid="skill-intent"
        autoFocus
      />
      {ranked.length === 0 ? (
        <div data-testid="skill-empty" style={{ color: colors.text.tertiary, fontSize: fontSize.sm }}>
          {intent.trim() ? 'No matching skills.' : 'Type to search skills.'}
        </div>
      ) : (
        <ul role="listbox" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[1] }}>
          {ranked.map((r, i) => {
            const blocked = !allowMissingContext && r.missingContext.length > 0;
            const isActive = i === active;
            return (
              <li key={r.skill.id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  data-testid={`skill-option-${r.skill.id}`}
                  data-active={isActive}
                  data-blocked={blocked}
                  disabled={blocked}
                  onClick={() => onPick(r.skill.id)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: space[2],
                    background: isActive ? colors.bg.hover : colors.bg.inset,
                    border: `1px solid ${isActive ? colors.accent.default : colors.border.subtle}`,
                    borderRadius: radius.md,
                    color: blocked ? colors.text.disabled : colors.text.primary,
                    cursor: blocked ? 'not-allowed' : 'pointer',
                    fontSize: fontSize.sm,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                    <span style={{ fontWeight: fontWeight.semibold }}>{r.skill.label}</span>
                    <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                      score {r.score}
                    </span>
                  </div>
                  {blocked && (
                    <div data-testid={`skill-missing-${r.skill.id}`} style={{
                      marginTop: space[1], fontSize: fontSize.xs, color: colors.semantic.warning,
                    }}>
                      Needs: {r.missingContext.join(', ')}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
