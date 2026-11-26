// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Learn -- in-app self-teaching overlay
 * -----------------------------------------------------------------------------
 * Opens a short, structured guide for the CURRENT app: a custom guide when the
 * app registered one (learnRegistry), otherwise a generic guide built from the
 * app's definition + the DEX-wide shortcuts -- so every app is teachable.
 *
 * Opt-in: opened via the `dex-open-learn` event (the "Learn" command). Never
 * appears on its own.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useOverlay } from '../services/overlayStack';
import { getLearnContent, GLOBAL_LEARN_TIPS, type LearnSection } from '../services/learnRegistry';
import { useRunningApps, APP_DEFINITIONS } from '../store/runningApps';

interface ResolvedGuide {
  name: string;
  overview: string;
  sections: LearnSection[];
}

function resolveGuide(appId: string): ResolvedGuide {
  const def = APP_DEFINITIONS[appId];
  const name = def?.name || appId;
  const custom = getLearnContent(appId);
  if (custom) {
    return {
      name,
      overview: custom.overview || `${name} is a DEX app.`,
      sections: [...(custom.sections || []), { heading: 'Everywhere in DEX', items: GLOBAL_LEARN_TIPS }],
    };
  }
  // Generic guide -- works for any app with no custom content.
  const sections: LearnSection[] = [];
  sections.push({ heading: 'Everywhere in DEX', items: GLOBAL_LEARN_TIPS });
  return { name, overview: def?.description || `${name} is a DEX app.`, sections };
}

export const LearnOverlay: React.FC = () => {
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ appId?: string }>).detail;
      let id = detail?.appId;
      if (!id) { try { id = useRunningApps.getState().currentAppId; } catch { id = 'home'; } }
      setAppId(id || 'home');
    };
    window.addEventListener('dex-open-learn', onOpen as EventListener);
    return () => window.removeEventListener('dex-open-learn', onOpen as EventListener);
  }, []);

  // Escape through the shared overlay stack (top-only).
  const closeLearn = useCallback(() => setAppId(null), []);
  useOverlay(!!appId, closeLearn, { dismissOnOutside: false });

  if (!appId) return null;

  const guide = resolveGuide(appId);
  const accent = APP_DEFINITIONS[appId]?.color || 'var(--color-accent)';

  const styles: Record<string, React.CSSProperties> = {
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' },
    panel: { width: '100%', maxWidth: '480px', background: 'var(--color-bg-elevated)', borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '74vh' },
    head: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' },
    dot: { width: '12px', height: '12px', borderRadius: '4px', flexShrink: 0 },
    headText: { flex: 1, minWidth: 0 },
    title: { fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' },
    sub: { fontSize: '12px', color: 'var(--color-text-muted)' },
    body: { padding: 'var(--space-4)', overflow: 'auto' },
    overview: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-4)' },
    section: { marginBottom: 'var(--space-4)' },
    heading: { fontSize: '11px', fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' },
    item: { display: 'flex', gap: 'var(--space-2)', fontSize: '13px', color: 'var(--color-text-primary)', lineHeight: 1.5, padding: '3px 0' },
    bullet: { color: accent, flexShrink: 0 },
    hint: { padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' },
  };

  return (
    <div style={styles.overlay} onMouseDown={() => setAppId(null)}>
      <div style={styles.panel} onMouseDown={e => e.stopPropagation()}>
        <div style={styles.head}>
          <span style={{ ...styles.dot, background: accent }} />
          <div style={styles.headText}>
            <div style={styles.title}>Learn {guide.name}</div>
            <div style={styles.sub}>A quick guide to what {guide.name} can do</div>
          </div>
        </div>
        <div style={styles.body}>
          <div style={styles.overview}>{guide.overview}</div>
          {guide.sections.map((s, si) => (
            <div key={`${s.heading}-${si}`} style={styles.section}>
              <div style={styles.heading}>{s.heading}</div>
              {s.items.map((it, ii) => (
                <div key={ii} style={styles.item}><span style={styles.bullet}>•</span><span>{it}</span></div>
              ))}
            </div>
          ))}
        </div>
        <div style={styles.hint}>Esc to close</div>
      </div>
    </div>
  );
};

export default memo(LearnOverlay);
