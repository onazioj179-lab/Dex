/**
 * DEX Platform - Presentation Builder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Slide editor with transitions, fullscreen present mode, print-to-PDF export
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassToolbar, premiumGlassSidebar } from '../../styles/glassMenu';

type BlockType = 'text' | 'image' | 'shape';

interface SlideBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style: {
    fontSize?: number;
    color?: string;
    background?: string;
    fontWeight?: number;
  };
}

type Transition = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'zoom';

interface Slide {
  id: string;
  blocks: SlideBlock[];
  background: string;
  transition: Transition;
}

const STORAGE_KEY = 'dex-presentations-current';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const makeBlankSlide = (): Slide => ({
  id: newId(),
  blocks: [
    {
      id: newId(),
      type: 'text',
      x: 80, y: 80, width: 800, height: 90,
      content: 'Click to edit title',
      style: { fontSize: 48, color: '#ffffff', fontWeight: 600 },
    },
  ],
  background: '#1a1a1f',
  transition: 'fade',
});

const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-right', label: 'Slide Right' },
  { id: 'zoom', label: 'Zoom' },
];

const CANVAS_W = 960;
const CANVAS_H = 540;

const PresentationBuilder: React.FC = () => {
  const [slides, setSlides] = useState<Slide[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Slide[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [makeBlankSlide()];
  });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const presentRef = useRef<HTMLDivElement | null>(null);
  const dragSlideId = useRef<string | null>(null);
  const dragBlockState = useRef<{ blockId: string; startX: number; startY: number; bx: number; by: number } | null>(null);

  // Persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slides)); } catch { /* ignore */ }
  }, [slides]);

  const currentSlide = slides[currentIdx] ?? slides[0];
  const selectedBlock = currentSlide?.blocks.find(b => b.id === selectedBlockId) ?? null;

  // ---- Slide ops ----
  const addSlide = useCallback(() => {
    setSlides(prev => {
      const next = [...prev, makeBlankSlide()];
      setCurrentIdx(next.length - 1);
      return next;
    });
    setSelectedBlockId(null);
  }, []);

  const deleteSlide = useCallback((idx: number) => {
    setSlides(prev => {
      if (prev.length <= 1) return [makeBlankSlide()];
      const next = prev.filter((_, i) => i !== idx);
      setCurrentIdx(Math.max(0, Math.min(idx, next.length - 1)));
      return next;
    });
  }, []);

  const reorderSlide = useCallback((from: number, to: number) => {
    if (from === to) return;
    setSlides(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setCurrentIdx(to);
      return next;
    });
  }, []);

  // ---- Block ops ----
  const updateCurrentSlide = useCallback((mut: (s: Slide) => Slide) => {
    setSlides(prev => prev.map((s, i) => (i === currentIdx ? mut(s) : s)));
  }, [currentIdx]);

  const addBlock = useCallback((type: BlockType) => {
    const block: SlideBlock = {
      id: newId(),
      type,
      x: 200, y: 220,
      width: type === 'text' ? 480 : 200,
      height: type === 'text' ? 80 : 200,
      content: type === 'text' ? 'New text' : type === 'image' ? '' : '',
      style: type === 'text'
        ? { fontSize: 24, color: '#ffffff' }
        : type === 'shape'
          ? { background: '#5E5CE6' }
          : {},
    };
    updateCurrentSlide(s => ({ ...s, blocks: [...s.blocks, block] }));
    setSelectedBlockId(block.id);
  }, [updateCurrentSlide]);

  const updateBlock = useCallback((id: string, patch: Partial<SlideBlock>) => {
    updateCurrentSlide(s => ({
      ...s,
      blocks: s.blocks.map(b => (b.id === id ? { ...b, ...patch, style: { ...b.style, ...(patch.style || {}) } } : b)),
    }));
  }, [updateCurrentSlide]);

  const deleteBlock = useCallback((id: string) => {
    updateCurrentSlide(s => ({ ...s, blocks: s.blocks.filter(b => b.id !== id) }));
    setSelectedBlockId(null);
  }, [updateCurrentSlide]);

  // ---- Block drag (canvas) ----
  const onBlockMouseDown = useCallback((e: React.MouseEvent, b: SlideBlock) => {
    e.stopPropagation();
    setSelectedBlockId(b.id);
    dragBlockState.current = { blockId: b.id, startX: e.clientX, startY: e.clientY, bx: b.x, by: b.y };
    const move = (mv: MouseEvent) => {
      const st = dragBlockState.current;
      if (!st) return;
      const dx = mv.clientX - st.startX;
      const dy = mv.clientY - st.startY;
      updateBlock(st.blockId, { x: Math.max(0, st.bx + dx), y: Math.max(0, st.by + dy) });
    };
    const up = () => {
      dragBlockState.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [updateBlock]);

  // ---- Present mode ----
  const enterPresent = useCallback(async () => {
    setPresenting(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch { /* ignore */ }
  }, []);

  const exitPresent = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ignore */ });
    }
  }, []);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitPresent();
      else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        setCurrentIdx(i => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentIdx(i => Math.max(0, i - 1));
      }
    };
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [presenting, slides.length, exitPresent]);

  // ---- Print to PDF ----
  const exportPDF = useCallback(() => {
    window.print();
  }, []);

  // ---- Render slide content ----
  const renderSlide = (slide: Slide, scale = 1, interactive = false): React.ReactNode => (
    <div
      style={{
        position: 'relative', width: CANVAS_W * scale, height: CANVAS_H * scale,
        background: slide.background, overflow: 'hidden', borderRadius: 8 * scale,
      }}
      onClick={interactive ? () => setSelectedBlockId(null) : undefined}
    >
      {slide.blocks.map(b => {
        const isSel = interactive && b.id === selectedBlockId;
        const common: React.CSSProperties = {
          position: 'absolute',
          left: b.x * scale, top: b.y * scale,
          width: b.width * scale, height: b.height * scale,
          cursor: interactive ? 'move' : 'default',
          outline: isSel ? '2px solid var(--color-accent)' : 'none',
          outlineOffset: 2,
          boxSizing: 'border-box',
        };
        if (b.type === 'text') {
          return (
            <div
              key={b.id}
              style={{
                ...common,
                color: b.style.color ?? '#fff',
                fontSize: (b.style.fontSize ?? 24) * scale,
                fontWeight: b.style.fontWeight ?? 400,
                display: 'flex', alignItems: 'center',
              }}
              onMouseDown={interactive ? (e) => onBlockMouseDown(e, b) : undefined}
            >{b.content}</div>
          );
        }
        if (b.type === 'shape') {
          return (
            <div
              key={b.id}
              style={{ ...common, background: b.style.background ?? '#5E5CE6', borderRadius: 6 * scale }}
              onMouseDown={interactive ? (e) => onBlockMouseDown(e, b) : undefined}
            />
          );
        }
        return (
          <div
            key={b.id}
            style={{
              ...common,
              background: b.content ? `url(${b.content}) center/cover no-repeat` : 'var(--color-bg-hover)',
              border: !b.content ? '1px dashed var(--color-border-subtle)' : 'none',
              display: !b.content ? 'flex' : undefined,
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', fontSize: 12 * scale,
            }}
            onMouseDown={interactive ? (e) => onBlockMouseDown(e, b) : undefined}
          >{!b.content && 'Image URL'}</div>
        );
      })}
    </div>
  );

  // ---- Present mode UI ----
  if (presenting) {
    return (
      <div ref={presentRef} style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 999999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {renderSlide(currentSlide)}
      </div>
    );
  }

  // ---- Editor UI ----
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-system)',
    }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .dex-presentation-print, .dex-presentation-print * { visibility: visible !important; }
          .dex-presentation-print { position: absolute; left: 0; top: 0; width: 100%; }
          .dex-presentation-print .slide-page {
            page-break-after: always; width: 100vw; height: 100vh;
            display: flex; align-items: center; justify-content: center;
          }
        }
      `}</style>

      {/* Toolbar */}
      <div style={{ ...premiumGlassToolbar, padding: '10px 14px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="monitor" size={18} color="var(--color-text-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Presentation</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {currentIdx + 1} / {slides.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => addBlock('text')} style={toolbarBtn}>+ Text</button>
          <button onClick={() => addBlock('shape')} style={toolbarBtn}>+ Shape</button>
          <button onClick={() => addBlock('image')} style={toolbarBtn}>+ Image</button>
          <span style={{ width: 8 }} />
          <button onClick={exportPDF} style={toolbarBtn}>Export PDF</button>
          <button onClick={enterPresent} style={{ ...toolbarBtn, background: 'var(--color-accent)', color: '#fff', border: 'none' }}>Present</button>
        </div>
      </div>

      {/* Body: 3 panes */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — slide list */}
        <div style={{
          ...premiumGlassSidebar, width: 200, padding: 8, gap: 6, overflowY: 'auto',
        }}>
          <button onClick={addSlide} style={{
            ...toolbarBtn, width: '100%', justifyContent: 'center',
            background: 'var(--color-bg-elevated)',
          }}>+ New Slide</button>
          {slides.map((s, idx) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => { dragSlideId.current = s.id; }}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = dragSlideId.current;
                if (!draggedId) return;
                const from = slides.findIndex(x => x.id === draggedId);
                if (from >= 0) reorderSlide(from, idx);
                dragSlideId.current = null;
                setDragOverIdx(null);
              }}
              onClick={() => { setCurrentIdx(idx); setSelectedBlockId(null); }}
              style={{
                position: 'relative', cursor: 'pointer', borderRadius: 6,
                padding: 4, border: idx === currentIdx ? '2px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                background: dragOverIdx === idx ? 'var(--color-bg-hover)' : 'transparent',
              }}
            >
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
                {renderSlide(s, 0.18)}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 4, fontSize: 10, color: 'var(--color-text-muted)',
              }}>
                <span>{idx + 1}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
                    cursor: 'pointer', fontSize: 10, padding: 0,
                  }}
                  title="Delete slide"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* Center — canvas */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, overflow: 'auto', background: 'var(--color-bg-base)',
        }}>
          <div className="dex-presentation-print" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Print: render all slides */}
            <div style={{ display: 'none' }}>
              {slides.map(s => (
                <div key={`print-${s.id}`} className="slide-page">
                  {renderSlide(s)}
                </div>
              ))}
            </div>
            {/* Editor visible canvas */}
            <div style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
              {currentSlide && renderSlide(currentSlide, 1, true)}
            </div>
          </div>
        </div>

        {/* Right panel — properties */}
        <div style={{
          width: 240, padding: 14, gap: 12, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-elevated)',
          overflowY: 'auto',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Slide Settings
          </div>
          <label style={fieldLabel}>
            <span>Background</span>
            <input
              type="color"
              value={currentSlide?.background ?? '#000000'}
              onChange={e => updateCurrentSlide(s => ({ ...s, background: e.target.value }))}
              style={{ width: '100%', height: 32, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
            />
          </label>
          <label style={fieldLabel}>
            <span>Transition</span>
            <select
              value={currentSlide?.transition ?? 'fade'}
              onChange={e => updateCurrentSlide(s => ({ ...s, transition: e.target.value as Transition }))}
              style={fieldInput}
            >
              {TRANSITIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>

          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Block Properties
          </div>
          {selectedBlock ? (
            <>
              {selectedBlock.type === 'text' && (
                <>
                  <label style={fieldLabel}>
                    <span>Text</span>
                    <input
                      value={selectedBlock.content}
                      onChange={e => updateBlock(selectedBlock.id, { content: e.target.value })}
                      style={fieldInput}
                    />
                  </label>
                  <label style={fieldLabel}>
                    <span>Font Size</span>
                    <input
                      type="number" min={8} max={200}
                      value={selectedBlock.style.fontSize ?? 24}
                      onChange={e => updateBlock(selectedBlock.id, { style: { fontSize: Number(e.target.value) } })}
                      style={fieldInput}
                    />
                  </label>
                  <label style={fieldLabel}>
                    <span>Color</span>
                    <input
                      type="color"
                      value={selectedBlock.style.color ?? '#ffffff'}
                      onChange={e => updateBlock(selectedBlock.id, { style: { color: e.target.value } })}
                      style={{ width: '100%', height: 32, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                    />
                  </label>
                </>
              )}
              {selectedBlock.type === 'shape' && (
                <label style={fieldLabel}>
                  <span>Fill</span>
                  <input
                    type="color"
                    value={selectedBlock.style.background ?? '#5E5CE6'}
                    onChange={e => updateBlock(selectedBlock.id, { style: { background: e.target.value } })}
                    style={{ width: '100%', height: 32, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                  />
                </label>
              )}
              {selectedBlock.type === 'image' && (
                <label style={fieldLabel}>
                  <span>Image URL</span>
                  <input
                    value={selectedBlock.content}
                    onChange={e => updateBlock(selectedBlock.id, { content: e.target.value })}
                    placeholder="https://..."
                    style={fieldInput}
                  />
                </label>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>X</span>
                  <input type="number" value={Math.round(selectedBlock.x)} onChange={e => updateBlock(selectedBlock.id, { x: Number(e.target.value) })} style={fieldInput} />
                </label>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>Y</span>
                  <input type="number" value={Math.round(selectedBlock.y)} onChange={e => updateBlock(selectedBlock.id, { y: Number(e.target.value) })} style={fieldInput} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>W</span>
                  <input type="number" value={Math.round(selectedBlock.width)} onChange={e => updateBlock(selectedBlock.id, { width: Number(e.target.value) })} style={fieldInput} />
                </label>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>H</span>
                  <input type="number" value={Math.round(selectedBlock.height)} onChange={e => updateBlock(selectedBlock.id, { height: Number(e.target.value) })} style={fieldInput} />
                </label>
              </div>
              <button onClick={() => deleteBlock(selectedBlock.id)} style={{
                ...toolbarBtn, color: 'var(--color-error)', borderColor: 'var(--color-error)',
              }}>Delete Block</button>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Select a block to edit its properties.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 8, fontSize: 12,
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
};

const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)',
};

const fieldInput: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, fontSize: 12,
  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)',
};

export default memo(PresentationBuilder);
