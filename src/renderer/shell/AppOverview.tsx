// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX App Overview (Mission Control)
 * Full-screen layer showing all open apps as thumbnail cards.
 * Activated via gesture, keyboard shortcut, or pinch.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { isReduceMotion, SPRING_PRESETS, SpringAnimator } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// THUMBNAIL CACHE
// ---------------------------------------------------------------------------
const thumbnailCache = new Map<string, string>();

function captureThumbnail(id: string, element: HTMLElement | null | undefined, width: number, height: number): string | null {
  if (!element) return thumbnailCache.get(id) || null;

  // Use existing cache if element hasn't changed visually (cheap check)
  const key = `${id}-${element.scrollHeight}-${element.scrollWidth}`;
  if (thumbnailCache.has(key)) return thumbnailCache.get(key)!;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return thumbnailCache.get(id) || null;

    // Render a scaled-down view of the element's background + child layout
    ctx.scale(2, 2);
    const computed = getComputedStyle(element);
    ctx.fillStyle = computed.backgroundColor || '#0D0D0D';
    ctx.fillRect(0, 0, width, height);

    // Draw child elements as simplified colored rectangles
    const children = Array.from(element.querySelectorAll(':scope > div, :scope > section, :scope > main, :scope > nav'));
    const parentRect = element.getBoundingClientRect();
    const scaleX = width / parentRect.width;
    const scaleY = height / parentRect.height;

    children.slice(0, 12).forEach(child => {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(child as HTMLElement);
      const x = (rect.left - parentRect.left) * scaleX;
      const y = (rect.top - parentRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;
      ctx.fillStyle = cs.backgroundColor || 'var(--color-border-subtle)';
      ctx.fillRect(x, y, w, h);
    });

    const dataUrl = canvas.toDataURL('image/png', 0.5);
    thumbnailCache.set(key, dataUrl);
    thumbnailCache.set(id, dataUrl);
    return dataUrl;
  } catch {
    return thumbnailCache.get(id) || null;
  }
}

/** Asynchronous thumbnail capture that defers to idle time */
function captureThumbnailAsync(id: string, element: HTMLElement | null | undefined, width: number, height: number): Promise<string | null> {
  // Return cached immediately if available
  const key = element ? `${id}-${element.scrollHeight}-${element.scrollWidth}` : id;
  if (thumbnailCache.has(key)) return Promise.resolve(thumbnailCache.get(key)!);

  return new Promise(resolve => {
    const run = () => resolve(captureThumbnail(id, element, width, height));
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 200 });
    } else {
      setTimeout(run, 16);
    }
  });
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface OverviewApp {
  id: string;
  name: string;
  /** Reference to the app's DOM element for thumbnail capture */
  element?: HTMLElement | null;
}

interface AppOverviewProps {
  visible: boolean;
  apps: OverviewApp[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  onCloseApp: (id: string) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export const AppOverview: React.FC<AppOverviewProps> = ({
  visible,
  apps,
  activeAppId,
  onSelectApp,
  onCloseApp,
  onDismiss,
}) => {
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus search when typing
  useEffect(() => {
    if (!visible) { setSearch(''); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onDismiss(); return; }
      if (e.key === 'Enter') {
        const filtered = apps.filter(a =>
          a.name.toLowerCase().includes(search.toLowerCase())
        );
        if (filtered.length > 0) {
          onSelectApp(filtered[0].id);
          onDismiss();
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, apps, search, onSelectApp, onDismiss]);

  const handleCardClick = useCallback((id: string) => {
    onSelectApp(id);
    onDismiss();
  }, [onSelectApp, onDismiss]);

  const handleCardClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onCloseApp(id);
  }, [onCloseApp]);

  if (!visible) return null;

  const filtered = apps.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const maxPerRow = 4;
  const cardWidth = Math.min(280, (window.innerWidth - 120) / maxPerRow);
  const cardHeight = cardWidth * 0.625;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="App Overview"
      onClick={(e) => { if (e.target === containerRef.current) onDismiss(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-max)',
        background: 'var(--color-bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: isReduceMotion() ? 'none' : 'fadeIn 0.2s ease-out',
        cursor: 'default',
      }}
    >
      {/* Search bar */}
      {search.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 40,
          width: 320,
          padding: '8px 16px',
          background: 'var(--color-border-subtle)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            placeholder="Filter apps..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-text-primary)',
              fontSize: 14,
              fontFamily: 'var(--font-family)',
            }}
          />
        </div>
      )}
      <input
        ref={searchRef}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        tabIndex={-1}
      />

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(maxPerRow, filtered.length)}, ${cardWidth}px)`,
        gap: 24,
        padding: 40,
        maxWidth: cardWidth * maxPerRow + 24 * (maxPerRow - 1) + 80,
      }}>
        {filtered.map((app, i) => {
          const isMatch = !search || app.name.toLowerCase().includes(search.toLowerCase());
          const isHovered = hoveredId === app.id;
          const staggerDelay = isReduceMotion() ? 0 : i * 30;
          return (
            <div
              key={app.id}
              onClick={() => handleCardClick(app.id)}
              onMouseEnter={() => setHoveredId(app.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: cardWidth,
                cursor: 'pointer',
                opacity: isMatch ? 1 : 0.2,
                transition: isReduceMotion() ? 'none' : 'opacity 0.15s ease, transform 0.1s ease',
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                animation: isReduceMotion() ? 'none' : `overviewCardIn 0.3s ease-out ${staggerDelay}ms both`,
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: '100%',
                height: cardHeight,
                borderRadius: 12,
                background: app.id === activeAppId
                  ? 'rgba(74,158,255,0.12)'
                  : 'var(--color-border-subtle)',
                border: app.id === activeAppId
                  ? '2px solid var(--color-accent)'
                  : '1px solid var(--color-border-subtle)',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              }}>
                {/* App thumbnail from DOM snapshot */}
                {(() => {
                  const thumb = captureThumbnail(app.id, app.element, cardWidth, cardHeight);
                  return thumb ? (
                    <img
                      src={thumb}
                      alt={app.name}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                    />
                  ) : (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-text-muted)', fontSize: 24, fontWeight: 600,
                      opacity: 0.3,
                    }}>
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                  );
                })()}

                {/* Close button on hover */}
                {isHovered && app.id !== 'home' && (
                  <button
                    onClick={(e) => handleCardClose(e, app.id)}
                    style={{
                      position: 'absolute',
                      top: 6, right: 6,
                      width: 20, height: 20,
                      borderRadius: '50%',
                      background: 'rgba(192,69,58,0.85)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                      <line x1="1" y1="1" x2="7" y2="7"/><line x1="7" y1="1" x2="1" y2="7"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* App name */}
              <div style={{
                marginTop: 8,
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                fontWeight: 400,
              }}>
                {app.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
