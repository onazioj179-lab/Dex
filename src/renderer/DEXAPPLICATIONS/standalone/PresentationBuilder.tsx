/**
 * DEX Platform - Presentation Builder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Slide editor with themes, layout templates, speaker notes, drag-reorder rail,
 * fullscreen present mode (presenter clock + notes), canvas/print export, outline import.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AssistedTextarea } from '../../components/AssistedTextarea';
import DexIcon from '../../components/DexIcon';
import { useElementSize } from '../../utils/motionHooksExtended';
import { useWorkingPhrase } from '../../hooks/useWorkingPhrase';
import { premiumGlassToolbar, premiumGlassSidebar } from '../../styles/glassMenu';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';
import { keyEventForApp, isTypingTarget } from '../../shell/input/appKeyScope';
import { AutosaveIndicator, type AutosaveState } from '../../components/AutosaveIndicator';
import { downloadText } from '../../improvements500/downloadBlob';
import {
  loadWorkingDeck, saveWorkingDeck, parseDeck, serializeDeck,
  historyStart, historyRecord, historyUndo, historyRedo, type DeckHistory,
} from './presentationDeck';

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
type SlideLayout = 'title' | 'title-content' | 'two-column' | 'blank';

interface Slide {
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

const safeStorage = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

const PresentationBuilder: React.FC = () => {
  // A stored deck that cannot be read is moved aside, never overwritten by the next save.
  const initialLoad = useRef<{ slides: Slide[] | null; movedAside: string | null } | null>(null);
  if (!initialLoad.current) initialLoad.current = loadWorkingDeck(safeStorage(), STORAGE_KEY, migrateSlide);
  const [slides, setSlides] = useState<Slide[]>(() => initialLoad.current?.slides ?? [makeBlankSlide()]);
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw && THEMES.some(t => t.id === raw)) return raw;
    } catch { /* ignore */ }
    return THEMES[0].id;
  });
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

  const presentRef = useRef<HTMLDivElement | null>(null);
  const dragSlideId = useRef<string | null>(null);
  const dragBlockState = useRef<{ blockId: string; startX: number; startY: number; bx: number; by: number } | null>(null);
  // The slide is authored at 960x540 and scaled to fit the stage (editor) or
  // the screen (present), like Keynote. Drags divide by the scale so blocks
  // follow the pointer at any zoom.
  const { ref: stageRef, ...stageSize } = useElementSize<HTMLDivElement>();
  const fitScale = stageSize.width > 0
    ? Math.max(0.2, Math.min(2.5, Math.min(stageSize.width / CANVAS_W, stageSize.height / CANVAS_H)))
    : 1;
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;
  const [screenScale, setScreenScale] = useState(() => Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
  useEffect(() => {
    const onResize = () => setScreenScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // Cleanup for an in-flight canvas block drag, so its window listeners are removed
  // if the component unmounts mid-drag (the mouseup handler would otherwise never fire).
  const dragCleanup = useRef<(() => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Live export verbs for the Export Images button.
  const exportPhrase = useWorkingPhrase(isExporting, 'export');

  const theme = getTheme(themeId);

  // ---- Undo history (whole-deck snapshots; typing and drags coalesce) ----
  const historyRef = useRef<DeckHistory<Slide>>(historyStart(slides));
  const timeTravel = useRef(false);
  const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });
  useEffect(() => {
    if (timeTravel.current) { timeTravel.current = false; return; }
    historyRef.current = historyRecord(historyRef.current, slides, Date.now());
    setHistoryDepth({ past: historyRef.current.past.length, future: 0 });
  }, [slides]);
  const travel = useCallback((dir: 'undo' | 'redo') => {
    const r = dir === 'undo' ? historyUndo(historyRef.current) : historyRedo(historyRef.current);
    if (!r) return;
    historyRef.current = r.h;
    timeTravel.current = true;
    setSlides(r.slides);
    setSelectedBlockId(null);
    setCurrentIdx((i) => Math.min(i, r.slides.length - 1));
    setHistoryDepth({ past: r.h.past.length, future: r.h.future.length });
  }, []);

  // ---- Autosave: debounced, flushed when the window hides or the app closes ----
  const [saveState, setSaveState] = useState<AutosaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingSave = useRef<Slide[] | null>(null);
  const flushSave = useCallback(() => {
    const toSave = pendingSave.current;
    if (!toSave) return;
    pendingSave.current = null;
    const r = saveWorkingDeck(safeStorage(), STORAGE_KEY, toSave);
    if (r.ok) { setSaveState('saved'); setLastSavedAt(Date.now()); setSaveError(null); }
    else {
      setSaveState('error');
      setSaveError(r.reason === 'quota'
        ? 'Not saved: the deck is larger than DEX can keep here (usually large images). Use Save Deck… to keep a copy.'
        : 'Not saved: storage is unavailable. Use Save Deck… to keep a copy.');
    }
  }, []);
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return; } // loading is not an edit
    pendingSave.current = slides;
    setSaveState('saving');
    const t = setTimeout(flushSave, 500);
    return () => clearTimeout(t);
  }, [slides, flushSave]);
  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flushSave(); // closing the app keeps the last edit
    };
  }, [flushSave]);
  useEffect(() => {
    const aside = initialLoad.current?.movedAside;
    if (aside) toast('error', `The saved deck could not be read. It was kept as "${aside}" and a new deck was started.`);
  }, []);

  // ---- Deck files ----
  const deckInput = useRef<HTMLInputElement>(null);
  const deckTitle = (s: Slide[]) => {
    const t = s[0]?.blocks.find(b => b.type === 'text')?.content?.trim();
    return t && t !== 'Click to edit title' ? t : 'Untitled deck';
  };
  const saveDeckFile = useCallback(() => {
    const name = deckTitle(slides).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'deck';
    downloadText(`${name}.dexdeck`, serializeDeck(slides, themeId), 'application/json;charset=utf-8');
    toast('success', `Saved ${slides.length} slide${slides.length === 1 ? '' : 's'} to ${name}.dexdeck`);
  }, [slides, themeId]);
  const openDeckFile = useCallback(async (file: File) => {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('The file is larger than 50 MB.');
      const deck = parseDeck(await file.text(), migrateSlide);
      setSlides(deck.slides);
      if (deck.theme && THEMES.some(t => t.id === deck.theme)) setThemeId(deck.theme);
      setCurrentIdx(0);
      setSelectedBlockId(null);
      toast('success', `Opened ${file.name} (${deck.slides.length} slides). Undo returns the previous deck.`);
    } catch (e) {
      toast('error', `Could not open ${file.name}: ${(e as Error).message}`);
    }
  }, []);

  // Undo / redo keys (not while presenting, and not inside a text field, which has its own undo).
  useEffect(() => {
    if (presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTypingTarget(e.target) || !keyEventForApp(e, 'presentation')) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); travel(e.shiftKey ? 'redo' : 'undo'); }
      else if (k === 'y') { e.preventDefault(); travel('redo'); }
      else if (k === 's') { e.preventDefault(); if (e.shiftKey) saveDeckFile(); else flushSave(); }
      else if (k === 'o') { e.preventDefault(); deckInput.current?.click(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, travel, flushSave, saveDeckFile]);
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
    // Let UKI outline the deck (slide number + title text) as a read action.
    registerUkiAppAction('presentation', {
      id: 'presentation.outline',
      description: 'outline the deck: each slide number and its title/first text.',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const s = ukiCtxRef.current;
      if (!s.slides.length) return 'The deck is empty.';
      return s.slides.slice(0, 100).map((sl, i) => {
        const t = sl.blocks.find((b) => b.type === 'text')?.content?.trim() || '(no text)';
        return `${i + 1}. ${t.slice(0, 80)}`;
      }).join('\n');
    });
    return () => {
      unregisterUkiAppContext('presentation');
      unregisterUkiAppAction('presentation.outline');
    };
  }, []);

  // ---- Slide ops ----
  const addSlide = useCallback((layout: SlideLayout = 'title-content') => {
    setSlides(prev => {
      const next = [...prev, makeSlideForLayout(layout, theme)];
      setCurrentIdx(next.length - 1);
      return next;
    });
    setSelectedBlockId(null);
  }, [theme]);

  const duplicateSlide = useCallback((idx: number) => {
    setSlides(prev => {
      const src = prev[idx];
      if (!src) return prev;
      const copy: Slide = {
        ...src,
        id: newId(),
        blocks: src.blocks.map(b => ({ ...b, id: newId(), style: { ...b.style } })),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      setCurrentIdx(idx + 1);
      return next;
    });
    setSelectedBlockId(null);
  }, []);

  const deleteSlide = useCallback((idx: number) => {
    setSlides(prev => {
      if (prev.length <= 1) return [makeBlankSlide(theme)];
      const next = prev.filter((_, i) => i !== idx);
      setCurrentIdx(Math.max(0, Math.min(idx, next.length - 1)));
      return next;
    });
  }, [theme]);

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

  // Pictures from this PC: downscaled to at most 1600 px (JPEG) so a deck of
  // photos still fits app storage; PNG kept for small graphics with transparency.
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageTargetRef = useRef<string | null>(null);
  const readLocalImage = useCallback(async (file: File): Promise<string> => {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      const keepPng = file.type === 'image/png' && file.size < 400_000;
      return c.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

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
    updateCurrentSlide(s => ({
      ...s,
      blocks: s.blocks.map(b => (b.id === id ? { ...b, ...patch, style: { ...b.style, ...(patch.style || {}) } } : b)),
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
  const onBlockMouseDown = useCallback((e: React.MouseEvent, b: SlideBlock) => {
    e.stopPropagation();
    setSelectedBlockId(b.id);
    dragBlockState.current = { blockId: b.id, startX: e.clientX, startY: e.clientY, bx: b.x, by: b.y };
    const move = (mv: MouseEvent) => {
      const st = dragBlockState.current;
      if (!st) return;
      const dx = (mv.clientX - st.startX) / fitScaleRef.current;
      const dy = (mv.clientY - st.startY) / fitScaleRef.current;
      updateBlock(st.blockId, { x: Math.max(0, st.bx + dx), y: Math.max(0, st.by + dy) });
    };
    const up = () => {
      dragBlockState.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dragCleanup.current = null;
    };
    dragCleanup.current = up;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [updateBlock]);

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
      if (!keyEventForApp(e, 'presentation')) return; // key meant for another app
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
            } catch { /* skip broken/tainting image */ }
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
    } catch {
      toast('error', 'Export failed');
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
              onMouseDown={interactive ? (e) => onBlockMouseDown(e, b) : undefined}
            >{b.content}</div>
          );
        }
        if (b.type === 'shape') {
          return (
            <div
              key={b.id}
              style={{ ...common, background: b.style.background ?? '#5E5CE6', borderRadius: 4 * scale }}
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
          {currentSlide && renderSlide(currentSlide, screenScale)}
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
    <div style={{
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

      {/* Toolbar */}
      <div style={{ ...premiumGlassToolbar, padding: '10px 14px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <DexIcon name="monitor" size={18} color="var(--color-text-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Presentation</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {currentIdx + 1} / {slides.length}
          </span>
          <button onClick={() => travel('undo')} disabled={!historyDepth.past} style={{ ...toolbarBtn, opacity: historyDepth.past ? 1 : 0.45 }} title="Undo (Ctrl+Z)" aria-label="Undo">Undo</button>
          <button onClick={() => travel('redo')} disabled={!historyDepth.future} style={{ ...toolbarBtn, opacity: historyDepth.future ? 1 : 0.45 }} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">Redo</button>
          <span title={saveError ?? undefined}><AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} label={saveError ? 'Not saved' : undefined} /></span>
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
          <button onClick={() => addBlock('text')} style={toolbarBtn}>+ Text</button>
          <button onClick={() => addBlock('shape')} style={toolbarBtn}>+ Shape</button>
          <button onClick={() => addBlock('image')} style={toolbarBtn}>+ Image</button>
          <span style={{ width: 8 }} />
          <input ref={deckInput} type="file" accept=".dexdeck,.dexdeck.json,.json,application/json" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) void openDeckFile(f); e.target.value = ''; }} />
          <button onClick={() => deckInput.current?.click()} style={toolbarBtn} title="Open a .dexdeck file (Ctrl+O)">Open Deck…</button>
          <button onClick={saveDeckFile} style={toolbarBtn} title="Save the deck to a file (Ctrl+Shift+S)">Save Deck…</button>
          <button onClick={() => setShowOutline(true)} style={toolbarBtn}>Import Outline</button>
          <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = '';
            const target = imageTargetRef.current;
            if (!f || !target) return;
            try { updateBlock(target, { content: await readLocalImage(f) }); } catch { toast('error', "That picture couldn't be read"); }
          }} />
          <button onClick={exportImages} disabled={isExporting} style={{ ...toolbarBtn, opacity: isExporting ? 0.5 : 1, cursor: isExporting ? 'default' : 'pointer' }}>{isExporting ? `${exportPhrase}…` : 'Export Images'}</button>
          <button onClick={exportPDF} disabled={isExporting} style={{ ...toolbarBtn, opacity: isExporting ? 0.5 : 1, cursor: isExporting ? 'default' : 'pointer' }}>Export PDF</button>
          <button onClick={enterPresent} style={{ ...toolbarBtn, background: 'var(--color-accent-fill)', color: '#fff', border: 'none' }}>Present</button>
        </div>
      </div>

      {/* Body: 3 panes */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar — slide rail */}
        <div style={{
          ...premiumGlassSidebar, width: 200, padding: 'var(--space-2)', gap: 6, overflowY: 'auto',
        }}>
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
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
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

        {/* Center — canvas */}
        <div ref={stageRef} style={{
          flex: 1, minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--space-6)', overflow: 'hidden', background: 'var(--color-bg-base)',
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
            <div className="print-hidden" style={{ boxShadow: 'var(--pg-shadow-popover)', outline: '1px solid var(--color-border-subtle)', borderRadius: 6 }}>
              {currentSlide && renderSlide(currentSlide, fitScale, true)}
            </div>
          </div>
        </div>

        {/* Right panel — properties */}
        <div className="dex-liquid-glass-strong" style={{
          width: 240, padding: 14, gap: 'var(--space-3)', display: 'flex', flexDirection: 'column',
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
            <AssistedTextarea
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
                    <AssistedTextarea
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
                  <button type="button" style={{ ...toolbarBtn, alignSelf: 'flex-start' }} onClick={() => { imageTargetRef.current = selectedBlock.id; imageInputRef.current?.click(); }}>Choose picture from this PC…</button>
                  <input
                    value={selectedBlock.content.startsWith('data:') ? '(picture from this PC)' : selectedBlock.content}
                    readOnly={selectedBlock.content.startsWith('data:')}
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
            <AssistedTextarea
              value={outlineText}
              onChange={e => setOutlineText(e.target.value)}
              autoFocus
              placeholder={'Introduction\n  - Welcome\n  - Agenda\n\nMain Topic\n  - Point one\n  - Point two'}
              rows={12}
              style={{ ...fieldInput, resize: 'vertical', fontFamily: 'var(--font-family-mono, monospace)', lineHeight: 1.4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowOutline(false)} style={toolbarBtn}>Cancel</button>
              <button onClick={importOutline} style={{ ...toolbarBtn, background: 'var(--color-accent-fill)', color: '#fff', border: 'none' }}>Import</button>
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
