/**
 * DEX Platform - Creative Command Bar
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 *
 * ROADMAP-600 #095 — the natural-language command bar that lives inside each
 * creative app ("remove the background", "upscale 2x", "detect tempo and key").
 * It is the UI that finally drives the previously-orphaned NL->op pipeline:
 *
 *   type goal -> buildCreativeCommand (plan + op descriptors, #003 preview)
 *             -> confirm tier gate (#018/#106)
 *             -> applyCreativeCommand via the host's onApplyOp (the app mutates
 *                its own document) -> run report.
 *
 * The bar is host-agnostic: each creative app passes its current `facts`
 * (active layer / selection / clip ids) and an `onApplyOp` that knows how to
 * apply a CreativeOp to its live document. Everything below the apply boundary
 * is pure + unit-tested in shared/uki/creativeCommand.
 */
import React, { useCallback, useId, useState } from 'react';
import {
  buildCreativeCommand,
  applyCreativeCommand,
  type CreativeCommand,
  type ApplyReport,
  type OpApplier,
} from '../../shared/uki/creativeCommand';
import type { CreativeApp } from '../../shared/uki/creativeActions';
import type { TierPolicy } from '../../shared/uki/confirmTier';

export interface CreativeCommandBarProps {
  /** Host creative app — scopes NL intent matching to its skills. */
  appId: CreativeApp;
  /** Current document facts: layerId, selectionId, clipId, trackId, … */
  facts?: Record<string, unknown>;
  /** Apply one op to the live document. Return a note, or throw to fail it. */
  onApplyOp: OpApplier;
  /** Optional per-workspace confirm policy. */
  policy?: TierPolicy;
  /** Example prompts shown as one-tap chips when the bar is empty. */
  examples?: string[];
  placeholder?: string;
}

type Phase = 'idle' | 'planning' | 'preview' | 'applying' | 'done';

const C = {
  surface: 'var(--color-bg-elevated, rgba(24,24,28,0.96))',
  surface2: 'var(--color-bg-base, rgba(16,16,20,0.96))',
  border: 'var(--dex-hairline, 1px solid rgba(255,255,255,0.10))',
  text: 'var(--color-text-primary, #f3f3f5)',
  textDim: 'var(--color-text-secondary, #9a9aa3)',
  accent: 'var(--color-accent, #4a9eff)',
  radius: 'var(--radius-md, 8px)',
  ok: '#3ecf8e',
  warn: '#f0b429',
  bad: '#ff5d5d',
};

/** Small colored status dot — avoids emoji/dingbats per the design-token guard. */
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: 999,
        background: color, flex: '0 0 auto', marginTop: 5,
      }}
    />
  );
}

export default function CreativeCommandBar({
  appId, facts, onApplyOp, policy, examples, placeholder,
}: CreativeCommandBarProps) {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [command, setCommand] = useState<CreativeCommand | null>(null);
  const [report, setReport] = useState<ApplyReport | null>(null);
  const inputId = useId();

  const reset = useCallback(() => {
    setPhase('idle'); setCommand(null); setReport(null);
  }, []);

  const plan = useCallback(async (goal: string) => {
    const g = goal.trim();
    if (!g) return;
    setReport(null);
    setPhase('planning');
    const cmd = await buildCreativeCommand(g, { appId, facts, policy });
    setCommand(cmd);
    setPhase('preview');
  }, [appId, facts, policy]);

  const apply = useCallback(async () => {
    if (!command || command.tier === 'forbidden') return;
    setPhase('applying');
    const rep = await applyCreativeCommand(command.ops, onApplyOp);
    setReport(rep);
    setPhase('done');
  }, [command, onApplyOp]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void plan(input); }
    else if (e.key === 'Escape') { reset(); }
  };

  const blocked = command?.tier === 'forbidden';
  const needsConfirm = command?.tier === 'confirm';

  return (
    <section
      aria-label={`${appId} AI command bar`}
      style={{
        background: C.surface, border: C.border, borderRadius: C.radius,
        padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        color: C.text, font: '13px/1.45 var(--dex-font-ui, system-ui, sans-serif)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor={inputId} style={{ color: C.textDim, fontSize: 12, flex: '0 0 auto' }}>
          Ask {appId}
        </label>
        <input
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? 'e.g. remove the background'}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, background: C.surface2, color: C.text,
            border: C.border, borderRadius: 4, padding: '7px 10px', outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => void plan(input)}
          disabled={!input.trim() || phase === 'planning'}
          style={{
            flex: '0 0 auto', background: C.accent, color: '#08111f', border: 'none',
            borderRadius: 4, padding: '7px 14px', fontWeight: 600,
            cursor: !input.trim() ? 'not-allowed' : 'pointer', opacity: !input.trim() ? 0.5 : 1,
          }}
        >
          {phase === 'planning' ? 'Planning…' : 'Plan'}
        </button>
      </div>

      {/* Example chips when idle/empty */}
      {phase === 'idle' && !input && examples && examples.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setInput(ex); void plan(ex); }}
              style={{
                background: 'transparent', color: C.textDim, border: C.border,
                borderRadius: 999, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Plan preview (#003) */}
      {phase === 'preview' && command && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!command.understood ? (
            <p style={{ margin: 0, color: C.textDim }}>
              I didn’t catch a creative action in that. Try naming the operation
              (e.g. “upscale”, “denoise”, “remove background”).
            </p>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {command.ops.map((op, i) => (
                  <li key={`${op.op}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Dot color={op.mutates ? C.warn : C.ok} />
                    <span>
                      <strong style={{ fontWeight: 600 }}>{op.op}</strong>
                      <span style={{ color: C.textDim }}>
                        {op.mutates ? ' · changes the document' : ' · read-only'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {blocked && (
                <p style={{ margin: 0, color: C.bad }}>
                  Blocked by workspace policy — this action is not allowed here.
                </p>
              )}
              {needsConfirm && !blocked && (
                <p style={{ margin: 0, color: C.warn, fontSize: 12 }}>
                  This will modify your document. Review the steps, then apply.
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void apply()}
                  disabled={blocked}
                  style={{
                    background: blocked ? 'var(--color-bg-base,#222)' : C.accent,
                    color: blocked ? C.textDim : '#08111f', border: 'none', borderRadius: 4,
                    padding: '7px 14px', fontWeight: 600, cursor: blocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  {needsConfirm ? 'Apply' : 'Run'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    background: 'transparent', color: C.textDim, border: C.border,
                    borderRadius: 4, padding: '7px 14px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'applying' && (
        <p style={{ margin: 0, color: C.textDim }}>Applying…</p>
      )}

      {/* Run report (#049) */}
      {phase === 'done' && report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Dot color={report.ok ? C.ok : C.bad} />
            <strong>
              {report.ok ? 'Done' : 'Completed with errors'} — {report.applied} applied
              {report.skipped ? `, ${report.skipped} skipped` : ''}
              {report.failed ? `, ${report.failed} failed` : ''}
            </strong>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.results.map((r, i) => (
              <li key={`${r.op.op}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Dot color={r.outcome === 'applied' ? C.ok : r.outcome === 'failed' ? C.bad : C.warn} />
                <span>
                  <strong style={{ fontWeight: 600 }}>{r.op.op}</strong>
                  {r.note && <span style={{ color: C.textDim }}> — {r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { reset(); setInput(''); }}
            style={{
              alignSelf: 'flex-start', background: 'transparent', color: C.accent,
              border: C.border, borderRadius: 4, padding: '6px 12px', cursor: 'pointer',
            }}
          >
            New command
          </button>
        </div>
      )}
    </section>
  );
}
