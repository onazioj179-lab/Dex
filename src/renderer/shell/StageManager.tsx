// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX Stage Manager -- macOS Tahoe-style window organization
 * ===========================================================================
 * Auto-collapses to a thin edge strip. Hovers open to reveal running app
 * thumbnails. Click to bring an app to center stage. Auto-hides 15 s after
 * mouse leaves. Moving the cursor to the left edge pops it back out.
 * Performance-tier aware — degrades gracefully on low-end hardware.
 * ===========================================================================
 */

import React, { useCallback, useState, useRef, useEffect, memo } from 'react';
import type { RunningApp } from '../store/runningApps';
import { APP_DEFINITIONS } from '../store/runningApps';
import { usePerfTier } from '../utils/perfAware';

/** Width of the expanded strip */
export const STAGE_STRIP_WIDTH = 96;
/** Width of the collapsed hit-zone */
const COLLAPSED_WIDTH = 6;
/** Delay (ms) before auto-hiding after mouse leaves */
const AUTO_HIDE_DELAY = 1200;
/** Faster collapse when a window is maximized */
const MAX_HIDE_DELAY = 800;

interface StageManagerProps {
  apps: RunningApp[];
  focusedAppId: string | null;
  onSelect: (appId: string) => void;
  onClose: (appId: string) => void;
  icons?: Record<string, JSX.Element>;
  /** When true, strip collapses automatically (window is maximized) */
  anyMaximized?: boolean;
}

// -- Individual tile (memoized to avoid sibling re-renders on hover) ------
interface TileProps {
  app: RunningApp;
  isActive: boolean;
  isHovered: boolean;
  icon?: JSX.Element;
  isWeak: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onClose: (e: React.MouseEvent, id: string) => void;
  onHoverIn: (id: string) => void;
  onHoverOut: () => void;
}

const StageTile = memo<TileProps>(({ app, isActive, isHovered, icon, isWeak, reducedMotion, onSelect, onClose, onHoverIn, onHoverOut }) => {
  const def = APP_DEFINITIONS[app.id];
  const color = def?.color || '#8E8E93';
  const name = def?.name || app.id;
  const dur = reducedMotion || isWeak ? '0s' : '0.25s';
  const spring = 'cubic-bezier(0.23, 1, 0.32, 1)';

  return (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
      contain: 'layout style paint',
    }}>
      {/* Active indicator bar -- left edge */}
      {!isWeak && (
        <div style={{
          position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: isActive ? 28 : isHovered ? 16 : 0,
          borderRadius: 2,
          background: isActive ? color : 'var(--color-text-tertiary)',
          boxShadow: isActive ? `0 0 10px ${color}88` : 'none',
          transition: `height ${dur} ${spring}, background ${dur} ease, box-shadow ${dur} ease, opacity ${dur} ease`,
          opacity: (isActive || isHovered) ? 1 : 0,
        }} />
      )}

      <button
        onClick={() => onSelect(app.id)}
        onMouseEnter={() => onHoverIn(app.id)}
        onMouseLeave={onHoverOut}
        aria-label={`Switch to ${name}`}
        aria-current={isActive ? 'true' : undefined}
        title={name}
        style={{
          position: 'relative',
          width: 72,
          minHeight: 72,
          borderRadius: 16,
          border: isActive
            ? `1.5px solid ${color}66`
            : isHovered
              ? '1px solid rgba(255,255,255,0.15)'
              : '1px solid rgba(255,255,255,0.06)',
          background: isActive
            ? `linear-gradient(145deg, ${color}30 0%, rgba(40,40,48,0.85) 100%)`
            : isHovered
              ? 'rgba(50,50,58,0.8)'
              : 'rgba(38,38,44,0.7)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          padding: '8px 4px 6px',
          transition: reducedMotion ? 'none' : `transform ${dur} ${spring}, border-color ${dur}, background ${dur}, box-shadow ${dur}`,
          transform: isHovered && !isWeak ? 'scale(1.02)' : 'scale(1)',
          boxShadow: isWeak ? 'none' : isActive
            ? `0 4px 16px ${color}35, 0 2px 4px rgba(0,0,0,0.3)`
            : isHovered
              ? '0 4px 14px rgba(0,0,0,0.35)'
              : '0 1px 4px rgba(0,0,0,0.2)',
          flexShrink: 0,
          contain: 'layout style',
          // Hint GPU to prepare for transform animations
          willChange: isHovered ? 'transform' : 'auto',
        }}
      >
        {/* App icon -- large, centered, dock-style */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isWeak ? 'none' : `0 3px 10px ${color}40`,
          color: '#fff',
          transition: reducedMotion ? 'none' : `transform ${dur} ${spring}`,
          transform: isActive && !isWeak ? 'scale(1.05)' : 'scale(1)',
        }}>
          {icon ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0.6)', color: '#fff' }}>{icon}</span>
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700 }}>{name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        {/* App name */}
        <span style={{
          fontSize: 9, fontWeight: 600, lineHeight: 1.1,
          color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
          maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
          textAlign: 'center',
          transition: `color ${dur} ease`,
        }}>
          {name}
        </span>

        {/* Close button on hover */}
        {isHovered && (
          <div
            onClick={(e) => onClose(e, app.id)}
            style={{
              position: 'absolute', top: -5, right: -5,
              width: 16, height: 16, borderRadius: '50%',
              background: 'rgba(255,69,58,0.95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: isWeak ? 'none' : '0 2px 6px rgba(0,0,0,0.55)',
              transition: 'transform 0.15s ease',
              zIndex: 2,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            aria-label={`Close ${name}`}
          >
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        )}
      </button>
    </div>
  );
});
StageTile.displayName = 'StageTile';

// -- Main Stage Manager ---------------------------------------------------
const StageManager: React.FC<StageManagerProps> = memo(({ apps, focusedAppId, onSelect, onClose, icons, anyMaximized }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHovering = useRef(false);
  const { isWeak, reducedMotion } = usePerfTier();

  // Clear any pending timer on unmount
  useEffect(() => () => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
  }, []);

  // Auto-collapse when any window is maximized
  useEffect(() => {
    if (anyMaximized && !isHovering.current) {
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
      autoHideTimer.current = setTimeout(() => setExpanded(false), MAX_HIDE_DELAY);
    }
  }, [anyMaximized]);

  const handleStripEnter = useCallback(() => {
    isHovering.current = true;
    if (autoHideTimer.current) { clearTimeout(autoHideTimer.current); autoHideTimer.current = null; }
    setExpanded(true);
  }, []);

  const handleStripLeave = useCallback(() => {
    isHovering.current = false;
    setHoveredId(null);
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    const delay = anyMaximized ? MAX_HIDE_DELAY : AUTO_HIDE_DELAY;
    autoHideTimer.current = setTimeout(() => setExpanded(false), delay);
  }, [anyMaximized]);

  const handleClose = useCallback((e: React.MouseEvent, appId: string) => {
    e.stopPropagation();
    onClose(appId);
  }, [onClose]);

  const handleSelect = useCallback((appId: string) => {
    onSelect(appId);
    // Don't restart auto-hide on select — only mouse-leave triggers it
  }, [onSelect]);

  const handleHoverIn = useCallback((id: string) => setHoveredId(id), []);
  const handleHoverOut = useCallback(() => setHoveredId(null), []);

  if (apps.length === 0) return null;

  const dur = reducedMotion || isWeak ? '0s' : '0.22s';
  const spring = 'cubic-bezier(0.23, 1, 0.32, 1)';

  return (
    <>
      {/* Invisible hit-zone on the left edge — triggers expand when collapsed */}
      {!expanded && (
        <div
          onMouseEnter={handleStripEnter}
          style={{
            position: 'fixed', left: 0, top: 36, bottom: 74,
            width: COLLAPSED_WIDTH + 24, zIndex: 'var(--z-max)', cursor: 'default',
          }}
          aria-hidden
        >
          <div style={{
            position: 'absolute', left: 1, top: '15%', bottom: '15%', width: 2,
            borderRadius: 1,
            background: 'var(--color-border-subtle)',
          }} />
        </div>
      )}

      {/* Main expanded strip -- dock-style floating panel */}
      <div
        onMouseEnter={handleStripEnter}
        onMouseLeave={handleStripLeave}
        style={{
          position: 'fixed',
          left: 8,
          top: '50%',
          transform: expanded
            ? 'translateY(-50%) translateX(0)'
            : `translateY(-50%) translateX(-${STAGE_STRIP_WIDTH + 8}px)`,
          width: STAGE_STRIP_WIDTH,
          maxHeight: 'calc(100vh - 140px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '12px 8px',
          zIndex: 'var(--z-max)',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          background: expanded ? 'var(--pg-sidebar)' : 'transparent',
          backdropFilter: expanded ? 'blur(28px) saturate(180%)' : 'none',
          WebkitBackdropFilter: expanded ? 'blur(28px) saturate(180%)' : 'none',
          border: expanded ? '1px solid var(--pg-border)' : 'none',
          borderRadius: 16,
          boxShadow: expanded ? 'var(--pg-shadow-overlay)' : 'none',
          opacity: expanded ? 1 : 0,
          transition: reducedMotion ? 'none' : `transform 0.12s ${spring}, opacity 0.1s ease, background 0.1s ease`,
          pointerEvents: expanded ? 'auto' : 'none',
          contain: 'layout style',
        } as React.CSSProperties}
        aria-label="Stage Manager"
        role="navigation"
      >
        {/* Only render tiles when expanded — saves DOM + reconciliation cost */}
        {expanded && apps.map((app) => (
          <StageTile
            key={app.id}
            app={app}
            isActive={app.id === focusedAppId}
            isHovered={app.id === hoveredId}
            icon={icons?.[app.id]}
            isWeak={isWeak}
            reducedMotion={reducedMotion}
            onSelect={handleSelect}
            onClose={handleClose}
            onHoverIn={handleHoverIn}
            onHoverOut={handleHoverOut}
          />
        ))}
      </div>
    </>
  );
});

StageManager.displayName = 'StageManager';

export default StageManager;
