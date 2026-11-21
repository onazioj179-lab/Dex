/**
 * DEX Platform - Presentation Builder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Slide editor with themes, layout templates, speaker notes, drag-reorder rail,
 * fullscreen present mode (presenter clock + notes), canvas/print export, outline import.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { WorkspacePanel } from '../../ui/WorkspacePanel';
import { useDocumentHistory } from '../../hooks/useDocumentHistory';
import { MAX_PROJECT_BYTES, parsePresentationProject } from './presentationProject';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { premiumGlassToolbar } from '../../styles/glassMenu';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';

type BlockType = 'text' | 'image' | 'shape';

export interface SlideBlock {
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
type SlideLayout = 'title' | 'title-content' | 'two-column' | 'blank';

export interface Slide {
  id: string;
  blocks: SlideBlock[];
  background: string;
  transition: Transition;
  /** Speaker notes (optional for backward compatibility with older decks). */
  notes?: string;
  /** Layout template used when this slide was created (optional). */
  layout?: SlideLayout;
}

interface Theme {
  id: string;
  label: string;
  background: string;
  /** Primary text color (titles). */
  titleColor: string;
  /** Secondary / body text color. */
  bodyColor: string;
  /** Accent fill for shapes. */
  accent: string;
}

const STORAGE_KEY = 'dex-presentations-current';
const THEME_KEY = 'dex-presentations-theme';

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const THEMES: Theme[] = [
  { id: 'midnight', label: 'Midnight', background: '#1a1a1f', titleColor: '#ffffff', bodyColor: '#c8c8d0', accent: '#5E5CE6' },
  { id: 'paper',    label: 'Paper',    background: '#f7f5f0', titleColor: '#1a1a1f', bodyColor: '#444448', accent: '#d97757' },
  { id: 'ocean',    label: 'Ocean',    background: '#0b1f2e', titleColor: '#e8f4ff', bodyColor: '#9ec3da', accent: '#2d9bd6' },
  { id: 'sunset',   label: 'Sunset',   background: '#2a1320', titleColor: '#ffe8d6', bodyColor: '#e0a99a', accent: '#ff7a59' },
  { id: 'forest',   label: 'Forest',   background: '#12231a', titleColor: '#eafbef', bodyColor: '#a7d4b6', accent: '#34c77b' },
  { id: 'mono',     label: 'Mono',     background: '#000000', titleColor: '#ffffff', bodyColor: '#bdbdbd', accent: '#888888' },
];

const getTheme = (id: string): Theme => THEMES.find(t => t.id === id) ?? THEMES[0];

const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-right', label: 'Slide Right' },
  { id: 'zoom', label: 'Zoom' },
];

const LAYOUTS: { id: SlideLayout; label: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'title-content', label: 'Title + Content' },
  { id: 'two-column', label: 'Two Column' },
  { id: 'blank', label: 'Blank' },
];

const CANVAS_W = 960;
const CANVAS_H = 540;

const toast = (type: 'success' | 'error' | 'info', message: string) => {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch { /* ignore */ }
};

// ---- Slide construction ----
const titleBlock = (theme: Theme, content = 'Click to edit title'): SlideBlock => ({
  id: newId(), type: 'text', x: 80, y: 80, width: 800, height: 90,
  content, style: { fontSize: 48, color: theme.titleColor, fontWeight: 600 },
});

const bodyBlock = (theme: Theme, x: number, y: number, width: number, height: number, content = 'Content'): SlideBlock => ({
  id: newId(), type: 'text', x, y, width, height,
  content, style: { fontSize: 24, color: theme.bodyColor, fontWeight: 400 },
});

const makeSlideForLayout = (layout: SlideLayout, theme: Theme, title?: string, body?: string): Slide => {
  const blocks: SlideBlock[] = [];
  switch (layout) {
    case 'title':
      blocks.push({ ...titleBlock(theme, title ?? 'Presentation Title'), y: 210, height: 110, style: { fontSize: 56, color: theme.titleColor, fontWeight: 700 } });
      blocks.push(bodyBlock(theme, 80, 330, 800, 60, body ?? 'Subtitle'));
      break;
    case 'title-content':
      blocks.push(titleBlock(theme, title));
      blocks.push(bodyBlock(theme, 80, 200, 800, 280, body ?? 'Content'));
      break;
    case 'two-column':
      blocks.push(titleBlock(theme, title));
      blocks.push(bodyBlock(theme, 80, 200, 380, 280, body ?? 'Left column'));
      blocks.push(bodyBlock(theme, 500, 200, 380, 280, 'Right column'));
      break;
    case 'blank':
    default:
      break;
  }
  return { id: newId(), blocks, background: theme.background, transition: 'fade', notes: '', layout };
};

const makeBlankSlide = (theme: Theme = THEMES[0]): Slide =>
  makeSlideForLayout('title-content', theme, 'Click to edit title');

// Backward-compatible migration: ensure notes/layout exist, keep stored blocks intact.
const migrateSlide = (s: any): Slide => ({
  id: typeof s?.id === 'string' ? s.id : newId(),
  blocks: Array.isArray(s?.blocks) ? s.blocks : [],
  background: typeof s?.background === 'string' ? s.background : '#1a1a1f',
  transition: (['none', 'fade', 'slide-left', 'slide-right', 'zoom'].includes(s?.transition) ? s.transition : 'fade') as Transition,
  notes: typeof s?.notes === 'string' ? s.notes : '',
  layout: (['title', 'title-content', 'two-column', 'blank'].includes(s?.layout) ? s.layout : undefined) as SlideLayout | undefined,
});

const PresentationBuilder: React.FC = () => {
  const { value: slides, setValue: setSlides, undo, redo, beginEdit, endEdit, canUndo, canRedo } = useDocumentHistory<Slide[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(migrateSlide);
      }
    } catch { /* ignore */ }
    return [makeBlankSlide()];
  });
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw && THEMES.some(t => t.id === raw)) return raw;
    } catch { /* ignore */ }
    return THEMES[0].id;
  });
  const [focusMode, setFocusMode] = useState(() => {
    try { return localStorage.getItem('dex-present-focus') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('dex-present-focus', String(focusMode)); } catch { /* Optional preference. */ }
  }, [focusMode]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [outlineText, setOutlineText] = useState('');
  // Present-mode timing
  const [clock, setClock] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const presentStart = useRef<number>(0);

  const editorViewport = useRef<HTMLDivElement>(null);
  const [editorScale, setEditorScale] = useState(1);
  useEffect(() => {
    const el = editorViewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setEditorScale(Math.max(0.1, Math.min(1, (el.clientWidth - 32) / CANVAS_W, (el.clientHeight - 32) / CANVAS_H)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [presenting]);
  const projectInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const presentRef = useRef<HTMLDivElement | null>(null);
  const dragSlideId = useRef<string | null>(null);
  const dragBlockState = useRef<{ blockId: string; startX: number; startY: number; bx: number; by: number } | null>(null);
  // Cleanup for an in-flight canvas block drag, so its window listeners are removed
  // if the component unmounts mid-drag (the mouseup handler would otherwise never fire).
  const dragCleanup = useRef<(() => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Live export verbs for the Export Images button.
  const exportPhrase = useWorkingPhrase(isExporting, 'export');

  const theme = getTheme(themeId);

  const [saveError, setSaveError] = useState(false);
  // Persist
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slides)); setSaveError(false); } catch { setSaveError(true); }
  }, [slides]);
  useEffect(() => {
    setCurrentIdx(i => Math.min(i, slides.length - 1));
    setSelectedBlockId(null);
  }, [slides.length]);
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, themeId); } catch { /* ignore */ }
  }, [themeId]);

  const currentSlide = slides[currentIdx] ?? slides[0];
  const selectedBlock = currentSlide?.blocks.find(b => b.id === selectedBlockId) ?? null;

  // UKI app-context: expose the deck title (first text block of slide 1), the
  // slide count, the current slide position, and present-mode. A ref keeps the
  // resolver reading live state (register once at mount).
  const ukiCtxRef = useRef({ slides, currentIdx, presenting });
  ukiCtxRef.current = { slides, currentIdx, presenting };
  useEffect(() => {
    registerUkiAppContext('presentation', () => {
      const s = ukiCtxRef.current;
      const firstText = s.slides[0]?.blocks.find(b => b.type === 'text')?.content?.trim();
      const title = firstText && firstText !== 'Click to edit title' ? firstText : 'Untitled deck';
      return {
        appId: 'presentation',
        focusedItemId: s.slides[s.currentIdx]?.id,
        custom: {
          deck: title,
          slides: s.slides.length,
          currentSlide: `${s.currentIdx + 1} of ${s.slides.length}`,
          mode: s.presenting ? 'presenting' : 'editing',
        },
      };
    });
    return () => unregisterUkiAppContext('presentation');
  }, []);

  const exportProject = useCallback(() => {
    try {
      const data = JSON.stringify({ format: 'dex-presentation', version: 1, themeId, slides }, null, 2);
      // Apply the same contract in both directions: never download a project
      // that this editor would refuse to open (including oversized image decks).
      parsePresentationProject(data);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'presentation-' + Date.now() + '.dexslides.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast('error', error instanceof Error ? `Project export failed: ${error.message}` : 'Project export failed. Your deck has not changed.');
    }
  }, [slides, themeId]);

  const importProject = useCallback(async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Project exceeds 16 MB.');
      const project = parsePresentationProject(await file.text());
      setSlides(project.slides);
      setThemeId(getTheme(project.themeId).id);
      setCurrentIdx(0);
      setSelectedBlockId(null);
      toast('success', 'Project opened. Undo restores the previous deck.');
    } catch (error) { toast('error', error instanceof Error ? error.message : 'Project could not be opened.'); }
  }, [setSlides]);

  const importImage = useCallback(async (file: File) => {
    const targetId = currentSlide?.id;
    if (!targetId) return;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read.'));
        reader.onerror = () => reject(new Error('Image could not be read.'));
        reader.readAsDataURL(file);
      });
      const image = await loadImage(data);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no dimensions.');
      const scale = Math.min(1, 800 / image.naturalWidth, 400 / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      const block: SlideBlock = { id: newId(), type: 'image', x: (CANVAS_W - width) / 2, y: (CANVAS_H - height) / 2,
        width, height, content: data, style: {} };
      setSlides(prev => prev.map(slide => slide.id === targetId ? { ...slide, blocks: [...slide.blocks, block] } : slide));
      setSelectedBlockId(block.id);
    } catch (error) { toast('error', error instanceof Error ? error.message : 'Image import failed.'); }
  }, [currentSlide?.id, setSlides]);

  // ---- Slide ops ----
  const addSlide = useCallback((layout: SlideLayout = 'title-content') => {
    const slide = makeSlideForLayout(layout, theme);
    setSlides(prev => [...prev, slide]);
    setCurrentIdx(slides.length);
    setSelectedBlockId(null);
  }, [theme, slides.length, setSlides]);

  const duplicateSlide = useCallback((idx: number) => {
    const src = slides[idx];
    if (!src) return;
    const copy: Slide = { ...src, id: newId(), blocks: src.blocks.map(b => ({ ...b, id: newId(), style: { ...b.style } })) };
    setSlides(prev => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
    setCurrentIdx(idx + 1);
    setSelectedBlockId(null);
  }, [slides, setSlides]);

  const deleteSlide = useCallback((idx: number) => {
    const replacement = makeBlankSlide(theme);
    setSlides(prev => prev.length <= 1 ? [replacement] : prev.filter((_, i) => i !== idx));
    setCurrentIdx(Math.max(0, Math.min(idx, slides.length - 2)));
    setSelectedBlockId(null);
  }, [theme, slides.length, setSlides]);

  const reorderSlide = useCallback((from: number, to: number) => {
    if (from === to) return;
    setSlides(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setCurrentIdx(to);
  }, [setSlides]);

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
      content: type === 'text' ? 'New text' : '',
      style: type === 'text'
        ? { fontSize: 24, color: theme.bodyColor }
        : type === 'shape'
          ? { background: theme.accent }
          : {},
    };
    updateCurrentSlide(s => ({ ...s, blocks: [...s.blocks, block] }));
    setSelectedBlockId(block.id);
  }, [updateCurrentSlide, theme]);

  const updateBlock = useCallback((id: string, patch: Partial<SlideBlock>) => {
    // Keep inspector edits compatible with the project-file geometry contract.
    const bounds = { x: [0, CANVAS_W], y: [0, CANVAS_H], width: [1, CANVAS_W], height: [1, CANVAS_H] };
    const validated = { ...patch };
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      const value = validated[key];
      if (value !== undefined) {
        if (!Number.isFinite(value)) delete validated[key];
        else validated[key] = Math.max(bounds[key][0], Math.min(bounds[key][1], value));
      }
    }
    updateCurrentSlide(s => ({
      ...s,
      blocks: s.blocks.map(b => (b.id === id ? { ...b, ...validated, style: { ...b.style, ...(validated.style || {}) } } : b)),
    }));
  }, [updateCurrentSlide]);

  const deleteBlock = useCallback((id: string) => {
    updateCurrentSlide(s => ({ ...s, blocks: s.blocks.filter(b => b.id !== id) }));
    setSelectedBlockId(null);
  }, [updateCurrentSlide]);

  // ---- Theme ----
  // Apply a theme to the whole deck: recolor backgrounds + retint text/shape blocks
  // that still match the prior theme palette so applying feels cohesive but never
  // clobbers custom colors that don't belong to any known theme.
  const applyTheme = useCallback((nextId: string) => {
    const next = getTheme(nextId);
    const knownTitle = new Set(THEMES.map(t => t.titleColor.toLowerCase()));
    const knownBody = new Set(THEMES.map(t => t.bodyColor.toLowerCase()));
    const knownAccent = new Set(THEMES.map(t => t.accent.toLowerCase()));
    const knownBg = new Set(THEMES.map(t => t.background.toLowerCase()));
    setSlides(prev => prev.map(s => ({
      ...s,
      background: knownBg.has((s.background || '').toLowerCase()) ? next.background : s.background,
      blocks: s.blocks.map(b => {
        if (b.type === 'text') {
          const c = (b.style.color || '').toLowerCase();
          if (knownTitle.has(c)) return { ...b, style: { ...b.style, color: next.titleColor } };
          if (knownBody.has(c)) return { ...b, style: { ...b.style, color: next.bodyColor } };
          return b;
        }
        if (b.type === 'shape') {
          const bg = (b.style.background || '').toLowerCase();
          if (knownAccent.has(bg)) return { ...b, style: { ...b.style, background: next.accent } };
          return b;
        }
        return b;
      }),
    })));
    setThemeId(nextId);
    toast('success', `Theme: ${next.label}`);
  }, []);

  // ---- Outline import ----
  // Each non-indented / heading line becomes a slide title; indented or "- " /
  // "* " bullet lines become content on the current slide.
  const importOutline = useCallback(() => {
    const lines = outlineText.split(/\r?\n/);
    const groups: { title: string; bullets: string[] }[] = [];
    let cur: { title: string; bullets: string[] } | null = null;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const indented = /^\s+/.test(raw) || /^\s*[-*•]\s+/.test(raw);
      const text = raw.replace(/^\s*[-*•#]+\s*/, '').trim();
      if (!text) continue;
      if (!indented || !cur) {
        cur = { title: text, bullets: [] };
        groups.push(cur);
      } else {
        cur.bullets.push(text);
      }
    }
    if (groups.length === 0) {
      toast('error', 'No outline content found');
      return;
    }
    const built = groups.map(g => {
      const body = g.bullets.map(b => `• ${b}`).join('\n');
      return makeSlideForLayout(g.bullets.length ? 'title-content' : 'title', theme, g.title, body || undefined);
    });
    setSlides(built);
    setCurrentIdx(0);
    setSelectedBlockId(null);
    setShowOutline(false);
    setOutlineText('');
    toast('success', `Imported ${built.length} slide${built.length === 1 ? '' : 's'}`);
  }, [outlineText, theme]);

  // ---- Block drag (canvas) ----
  const onBlockPointerDown = useCallback((e: React.PointerEvent, b: SlideBlock) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragCleanup.current?.();
    beginEdit();
    setSelectedBlockId(b.id);
    const spatialScale = e.currentTarget.parentElement!.getBoundingClientRect().width / CANVAS_W || 1;
    const pointerId = e.pointerId;
    dragBlockState.current = { blockId: b.id, startX: e.clientX, startY: e.clientY, bx: b.x, by: b.y };
    const move = (mv: PointerEvent) => {
      if (mv.pointerId !== pointerId) return;
      const st = dragBlockState.current;
      if (!st) return;
      const dx = (mv.clientX - st.startX) / spatialScale;
      const dy = (mv.clientY - st.startY) / spatialScale;
      updateBlock(st.blockId, { x: Math.max(0, Math.min(CANVAS_W - b.width, st.bx + dx)), y: Math.max(0, Math.min(CANVAS_H - b.height, st.by + dy)) });
    };
    const up = () => {
      endEdit();
      dragBlockState.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      dragCleanup.current = null;
    };
    dragCleanup.current = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [updateBlock, beginEdit, endEdit]);

  // Safety net: tear down any in-flight drag listeners on unmount.
  useEffect(() => () => { dragCleanup.current?.(); }, []);

  // ---- Present mode ----
  const enterPresent = useCallback(async () => {
    presentStart.current = Date.now();
    setElapsedMs(0);
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
        e.preventDefault();
        setCurrentIdx(i => Math.min(slides.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
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

  // Presenter clock + elapsed ticker
  useEffect(() => {
    if (!presenting) return;
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setElapsedMs(Date.now() - presentStart.current);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [presenting]);

  // ---- Export (canvas -> PNG) ----
  // Render every slide to an offscreen canvas and download as PNG. No deps; uses
  // the native 2D context. Images on remote URLs are best-effort (CORS may taint).
  const exportImages = useCallback(async () => {
    setIsExporting(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) { toast('error', 'Canvas unavailable'); return; }
        ctx.fillStyle = s.background || '#000';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Draw blocks in order
        for (const b of s.blocks) {
          if (b.type === 'shape') {
            ctx.fillStyle = b.style.background || '#5E5CE6';
            ctx.fillRect(b.x, b.y, b.width, b.height);
          } else if (b.type === 'text') {
            ctx.fillStyle = b.style.color || '#fff';
            const fs = b.style.fontSize ?? 24;
            ctx.font = `${b.style.fontWeight ?? 400} ${fs}px sans-serif`;
            ctx.textBaseline = 'top';
            // wrap text to block width, honor explicit newlines
            const lines = wrapText(ctx, b.content, b.width);
            let ty = b.y;
            for (const ln of lines) {
              if (ty > b.y + b.height) break;
              ctx.fillText(ln, b.x, ty);
              ty += fs * 1.25;
            }
          } else if (b.type === 'image' && b.content) {
            try {
              const img = await loadImage(b.content);
              ctx.drawImage(img, b.x, b.y, b.width, b.height);
            } catch { throw new Error('Image on slide ' + (i + 1) + ' could not be loaded.'); }
          }
        }

        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `slide-${String(i + 1).padStart(2, '0')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast('success', `Exported ${slides.length} image${slides.length === 1 ? '' : 's'}`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [slides]);

  // ---- Print to PDF (browser print dialog -> Save as PDF) ----
  const exportPDF = useCallback(() => {
    toast('info', 'Use the print dialog to Save as PDF');
    window.print();
  }, []);

  // ---- Render slide content ----
  const renderSlide = (slide: Slide, scale = 1, interactive = false): React.ReactNode => (
    <div
      style={{
        position: 'relative', width: CANVAS_W * scale, height: CANVAS_H * scale,
        background: slide.background, overflow: 'hidden', borderRadius: 6 * scale,
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
          touchAction: interactive ? 'none' : undefined,
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
                display: 'flex', alignItems: 'flex-start',
                whiteSpace: 'pre-wrap', lineHeight: 1.25, overflow: 'hidden',
              }}
              onPointerDown={interactive ? (e) => onBlockPointerDown(e, b) : undefined}
              onClick={interactive ? e => e.stopPropagation() : undefined}
            >{b.content}</div>
          );
        }
        if (b.type === 'shape') {
          return (
            <div
              key={b.id}
              style={{ ...common, background: b.style.background ?? '#5E5CE6', borderRadius: 4 * scale }}
              onPointerDown={interactive ? (e) => onBlockPointerDown(e, b) : undefined}
              onClick={interactive ? e => e.stopPropagation() : undefined}
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
            onPointerDown={interactive ? (e) => onBlockPointerDown(e, b) : undefined}
              onClick={interactive ? e => e.stopPropagation() : undefined}
          >{!b.content && 'Image URL'}</div>
        );
      })}
    </div>
  );

  // ---- Present mode UI ----
  if (presenting) {
    const elapsed = formatElapsed(elapsedMs);
    const notes = currentSlide?.notes?.trim();
    return (
      <div ref={presentRef} style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 20000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Presenter HUD */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px', color: '#ccc', fontSize: 13,
          fontFamily: 'var(--font-family)', pointerEvents: 'none',
        }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>Clock {clock}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>Elapsed {elapsed}</span>
          <span>{currentIdx + 1} / {slides.length}</span>
        </div>

        {/* Slide (click halves navigate) */}
        <div
          style={{ position: 'relative', cursor: 'none' }}
          onClick={(e) => {
            const half = (e.currentTarget as HTMLDivElement).clientWidth / 2;
            const x = e.nativeEvent.offsetX;
            if (x < half) setCurrentIdx(i => Math.max(0, i - 1));
            else setCurrentIdx(i => Math.min(slides.length - 1, i + 1));
          }}
        >
          {currentSlide && renderSlide(currentSlide)}
        </div>

        {/* Speaker notes strip */}
        {notes && (
          <div className="dex-liquid-glass" style={{
            position: 'absolute', bottom: 26, left: 24, right: 24, maxHeight: '18vh',
            overflow: 'auto', padding: '10px 14px', borderRadius: 14,
            color: '#ddd', fontSize: 15,
            fontFamily: 'var(--font-family)', whiteSpace: 'pre-wrap', lineHeight: 1.4,
          }}>{notes}</div>
        )}

        {/* Elapsed-time bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            height: '100%', background: theme.accent,
            width: `${slides.length > 1 ? (currentIdx / (slides.length - 1)) * 100 : 100}%`,
            transition: 'width 0.25s ease',
          }} />
        </div>

        {/* Exit hint */}
        <div style={{ position: 'absolute', bottom: 8, right: 18, color: '#666', fontSize: 11, fontFamily: 'var(--font-family)' }}>
          Esc to exit · ← → to navigate
        </div>
      </div>
    );
  }

  // ---- Editor UI ----
  return (
    <div onKeyDown={e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo(); else undo();
    }} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)',
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
          .dex-presentation-print .print-hidden, .dex-presentation-print .print-only-host > * { display: none; }
          .dex-presentation-print .print-only-host { display: block !important; }
        }
      `}</style>

      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importImage(file);
        }} />
      <input ref={projectInput} type="file" accept=".json,.dexslides.json,application/json" hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importProject(file);
        }} />
      {/* Toolbar */}
      <div style={{ ...premiumGlassToolbar, padding: '6px 10px', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="monitor" size={18} color="var(--color-text-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Presentation</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {currentIdx + 1} / {slides.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={themeId}
            onChange={e => applyTheme(e.target.value)}
            style={{ ...toolbarBtn, paddingRight: 6 }}
            title="Deck theme"
          >
            {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <button aria-pressed={focusMode} onClick={() => setFocusMode(v => !v)} style={toolbarBtn}>{focusMode ? 'Restore Panels' : 'Focus Canvas'}</button>
          <button onClick={undo} disabled={!canUndo} style={toolbarBtn}>Undo</button>
          <button onClick={redo} disabled={!canRedo} style={toolbarBtn}>Redo</button>
          <button onClick={() => addBlock('text')} style={toolbarBtn}>+ Text</button>
          <button onClick={() => addBlock('shape')} style={toolbarBtn}>+ Shape</button>
          <button onClick={() => imageInput.current?.click()} style={toolbarBtn}>+ Image</button>
          <span style={{ width: 8 }} />
          <button onClick={() => projectInput.current?.click()} style={toolbarBtn}>Open Project</button>
          <button onClick={exportProject} style={toolbarBtn}>Save Project</button>
          <button onClick={() => setShowOutline(true)} style={toolbarBtn}>Import Outline</button>
          <button onClick={exportImages} disabled={isExporting} style={{ ...toolbarBtn, opacity: isExporting ? 0.5 : 1, cursor: isExporting ? 'default' : 'pointer' }}>{isExporting ? `${exportPhrase}…` : 'Export Images'}</button>
          <button onClick={exportPDF} disabled={isExporting} style={{ ...toolbarBtn, opacity: isExporting ? 0.5 : 1, cursor: isExporting ? 'default' : 'pointer' }}>Export PDF</button>
          <button onClick={enterPresent} style={{ ...toolbarBtn, background: 'var(--color-accent)', color: '#fff', border: 'none' }}>Present</button>
        </div>
      </div>

      {saveError && <div role="alert" style={{ padding: 8, fontSize: 12 }}>Autosave failed. Save Project before closing this window.</div>}
      {/* Body: 3 panes */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'auto' }}>
        {/* Left sidebar — slide rail */}
<WorkspacePanel hidden={focusMode} storageKey="dex-present-slides-layout" title="Slides" initialWidth={200}>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => addSlide('title-content')} style={{
              ...toolbarBtn, flex: 1, justifyContent: 'center',
              background: 'var(--color-bg-elevated)',
            }}>+ Slide</button>
            <select
              onChange={e => { if (e.target.value) { addSlide(e.target.value as SlideLayout); e.target.value = ''; } }}
              value=""
              style={{ ...toolbarBtn, padding: '6px 4px', cursor: 'pointer' }}
              title="Add slide with layout"
            >
              <option value="">Layout…</option>
              {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
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
                position: 'relative', cursor: 'pointer', borderRadius: 10,
                padding: 4, border: idx === currentIdx ? '2px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                background: dragOverIdx === idx ? 'var(--color-bg-hover)' : 'transparent',
              }}
            >
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 3 }}>
                {renderSlide(s, 0.18)}
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginTop: 4, fontSize: 10, color: 'var(--color-text-muted)',
              }}>
                <span>{idx + 1}{s.notes?.trim() ? ' ·' : ''}</span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateSlide(idx); }}
                    style={railBtn}
                    title="Duplicate slide"
                  >Dup</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                    style={railBtn}
                    title="Delete slide"
                  >Delete</button>
                </span>
              </div>
            </div>
          ))}
        </div>

        </WorkspacePanel>

        {/* Center — canvas */}
        <div ref={editorViewport} style={{
          flex: 1, minWidth: 180, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, overflow: 'auto', background: 'var(--color-bg-base)',
        }}>
          <div className="dex-presentation-print" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Print: render all slides */}
            <div className="print-only-host" style={{ display: 'none' }}>
              {slides.map(s => (
                <div key={`print-${s.id}`} className="slide-page">
                  {renderSlide(s)}
                </div>
              ))}
            </div>
            {/* Editor visible canvas */}
            <div className="print-hidden" style={{ boxShadow: 'var(--pg-shadow-popover)' }}>
              {currentSlide && renderSlide(currentSlide, editorScale, true)}
            </div>
          </div>
        </div>

        {/* Right panel — properties */}
        <WorkspacePanel hidden={focusMode} storageKey="dex-present-inspector-layout" title="Inspector" side="right" initialWidth={240}>
        <div style={{
          padding: 14, gap: 'var(--space-3)', display: 'flex', flexDirection: 'column',
          borderRadius: 0, overflowY: 'auto',
        }}>
          <div className="dex-label-caps">
            Slide Settings
          </div>
          <label style={fieldLabel}>
            <span>Layout template</span>
            <select
              value={currentSlide?.layout ?? 'blank'}
              onChange={e => {
                const layout = e.target.value as SlideLayout;
                // Rebuild current slide from layout using current theme, preserving id + notes.
                updateCurrentSlide(s => {
                  const rebuilt = makeSlideForLayout(layout, theme);
                  return { ...rebuilt, id: s.id, notes: s.notes, background: s.background };
                });
                setSelectedBlockId(null);
              }}
              style={fieldInput}
            >
              {LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label style={fieldLabel}>
            <span>Background</span>
            <input
              type="color"
              value={currentSlide?.background ?? '#000000'}
              onChange={e => updateCurrentSlide(s => ({ ...s, background: e.target.value }))}
              style={{ width: '100%', height: 32, border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer' }}
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

          <label style={fieldLabel}>
            <span>Speaker notes</span>
            <textarea
              value={currentSlide?.notes ?? ''}
              onChange={e => updateCurrentSlide(s => ({ ...s, notes: e.target.value }))}
              placeholder="Notes for this slide (shown in present mode only)…"
              rows={5}
              style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }}
            />
          </label>

          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: '4px 0' }} />

          <div className="dex-label-caps">
            Block Properties
          </div>
          {selectedBlock ? (
            <>
              {selectedBlock.type === 'text' && (
                <>
                  <label style={fieldLabel}>
                    <span>Text</span>
                    <textarea
                      value={selectedBlock.content}
                      onChange={e => updateBlock(selectedBlock.id, { content: e.target.value })}
                      rows={3}
                      style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit' }}
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
                      style={{ width: '100%', height: 32, border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer' }}
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
                    style={{ width: '100%', height: 32, border: 'none', borderRadius: 10, background: 'transparent', cursor: 'pointer' }}
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
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>X</span>
                  <input type="number" value={Math.round(selectedBlock.x)} onChange={e => updateBlock(selectedBlock.id, { x: Number(e.target.value) })} style={fieldInput} />
                </label>
                <label style={{ ...fieldLabel, flex: 1 }}>
                  <span>Y</span>
                  <input type="number" value={Math.round(selectedBlock.y)} onChange={e => updateBlock(selectedBlock.id, { y: Number(e.target.value) })} style={fieldInput} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
        </WorkspacePanel>
      </div>

      {/* Outline import modal */}
      {showOutline && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 19000,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowOutline(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="dex-liquid-glass-strong"
            style={{
              width: 520, maxWidth: '90%', borderRadius: 14, padding: 18,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Import Outline</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              Each heading line becomes a slide title. Indented or bullet lines (- / * / •) become content.
              This replaces the current deck.
            </div>
            <textarea
              value={outlineText}
              onChange={e => setOutlineText(e.target.value)}
              autoFocus
              placeholder={'Introduction\n  - Welcome\n  - Agenda\n\nMain Topic\n  - Point one\n  - Point two'}
              rows={12}
              style={{ ...fieldInput, resize: 'vertical', fontFamily: 'var(--font-family-mono, monospace)', lineHeight: 1.4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowOutline(false)} style={toolbarBtn}>Cancel</button>
              <button onClick={importOutline} style={{ ...toolbarBtn, background: 'var(--color-accent)', color: '#fff', border: 'none' }}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- helpers ----
function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of (text || '').split('\n')) {
    if (!para) { out.push(''); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px var(--space-3)', borderRadius: 10, fontSize: 12,
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
};

const railBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--color-text-muted)',
  cursor: 'pointer', fontSize: 10, padding: 0,
};

const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)',
};

const fieldInput: React.CSSProperties = {
  padding: '6px var(--space-2)', borderRadius: 10, fontSize: 12,
  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)',
};

export default memo(PresentationBuilder);
