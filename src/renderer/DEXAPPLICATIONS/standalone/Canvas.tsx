/**
 * DEX Platform - Canvas
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Layered raster drawing canvas with brushes, shapes, text, pan/zoom and history.
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { CAPSULE_HEIGHT, CAPSULE_SELECTED_BG } from '../../components/controls/capsuleTokens';
import DexIcon from '../../components/DexIcon';
import { CanvasObjectLayer } from './CanvasObjectLayer';
import { type BoardObject, createObject, createConnector, sanitizeObjects, drawObjects, STICKY_COLORS, MAX_IMAGE_BYTES, BOARD_TEMPLATES } from './canvasObjects';
import {
  type BoardsIndex, type BoardPayload, UNFILED,
  loadIndex, saveIndex, loadBoard, saveBoard, deleteBoardData,
  addBoard, renameBoard, moveBoard, touchBoard, removeBoard, groupByFolder,
  takeCanvasRequest, CANVAS_REQUEST_EVENT,
} from './canvasBoards';
import { keyEventForApp, isTypingTarget } from '../../shell/input/appKeyScope';
import AutosaveIndicator from '../../components/AutosaveIndicator';
import { useUnsavedGuard } from '../../utils/useUnsavedGuard';
import { useAppCheckpoints } from '../../hooks/useAppCheckpoints';
import { colorInputValue } from '../../utils/canvasTheme';
import { registerUkiAppAction, unregisterUkiAppAction } from '../../uki/appActionRegistry';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

type Tool =
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'text';

const SHAPE_TOOLS: ReadonlyArray<Tool> = ['line', 'rectangle', 'ellipse', 'arrow'];
const isShapeTool = (t: Tool): boolean => SHAPE_TOOLS.includes(t);

// A layer owns its own offscreen raster canvas. The visible canvas is the
// composite of every visible layer (in array order, bottom -> top) at its
// opacity. Keeping pixels per-layer is what makes the undo snapshot model
// (per-layer ImageData) and the opacity/visibility/reorder controls real.
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0..1
  canvas: HTMLCanvasElement;
}

// One undo entry snapshots the affected layer's pixels before and after an edit.
type HistoryEntry =
  | { kind?: 'pixels'; layerId: string; before: ImageData; after: ImageData }
  | { kind: 'objects'; before: BoardObject[]; after: BoardObject[] };

const COLORS = [
  '#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];

const BRUSH_SIZES = [2, 4, 8, 12, 20, 32];

// Logical drawing surface size (CSS px). The raster layers and exports use this
// resolution; the viewport (pan/zoom) maps it onto the visible element.
const CANVAS_W = 1600;
const CANVAS_H = 1000;

const MAX_HISTORY = 60;

let layerSeq = 0;
const nextLayerId = (): string => `layer-${Date.now().toString(36)}-${(layerSeq++).toString(36)}`;

function makeLayerCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  return c;
}

function createLayer(name: string): Layer {
  return { id: nextLayerId(), name, visible: true, opacity: 1, canvas: makeLayerCanvas() };
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch {
    /* no-op: toasts are best-effort */
  }
}

// Draw a shape PATH onto ctx (caller sets stroke/fill + strokes). Rectangle and
// ellipse use the drag bounding box; line/arrow connect start -> end.
function drawShapePath(ctx: CanvasRenderingContext2D, tool: Tool, a: Point, b: Point): void {
  ctx.beginPath();
  if (tool === 'rectangle') {
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (tool === 'ellipse') {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
  } else {
    // line and arrow share the same main segment
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
}

// Arrowheads are drawn as two extra segments after the main line.
function drawArrowHead(ctx: CanvasRenderingContext2D, a: Point, b: Point, size: number): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const head = Math.max(10, size * 3);
  const spread = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle - spread), b.y - head * Math.sin(angle - spread));
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - head * Math.cos(angle + spread), b.y - head * Math.sin(angle + spread));
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

import { boardToSlides, describeNotCarried, sendSlidesToPresentation } from './creativeStudio/boardToSlides';
import { setStudioMode } from './creativeStudio/studioMode';

/** True when a drawing layer has any painted pixel (checked only on demand). */
function hasInk(c: HTMLCanvasElement): boolean {
  try {
    const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return false;
    for (let i = 3; i < d.length; i += 16) if (d[i] !== 0) return true;
  } catch { /* unreadable: treat as empty */ }
  return false;
}

const Canvas: React.FC = () => {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Layers + which one is active. Stored in state so the panel re-renders, but
  // the actual pixels live on each layer's offscreen canvas (mutable).
  const [layers, setLayers] = useState<Layer[]>(() => [createLayer('Layer 1')]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');

  // Tools / style
  const [tool, setTool] = useState<Tool>('pen');
  // Whiteboard objects (sticky notes, text boxes, shapes, frames, images, connectors).
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const objectsRef = useRef<BoardObject[]>([]);
  objectsRef.current = objects;
  const [selectedObj, setSelectedObj] = useState<string | null>(null);
  /** undefined = not connecting; null = pick the start; id = pick the end. */
  const [connectFrom, setConnectFrom] = useState<string | null | undefined>(undefined);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [fontSize, setFontSize] = useState(28);
  const [snap, setSnap] = useState(false);

  // Viewport
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [gridDots, setGridDots] = useState(false);

  // Refs that drawing handlers read synchronously (avoid stale-closure / re-render churn)
  const layersRef = useRef<Layer[]>(layers);
  layersRef.current = layers;
  const activeIdRef = useRef<string>(activeLayerId);
  activeIdRef.current = activeLayerId;
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  const styleRef = useRef({ color, brushSize, brushOpacity });
  styleRef.current = { color, brushSize, brushOpacity };
  const viewportRef = useRef({ zoom, pan });
  viewportRef.current = { zoom, pan };

  // Interaction state
  const drawingRef = useRef(false);
  const startPtRef = useRef<Point | null>(null);
  const lastPtRef = useRef<Point | null>(null);
  const beforeSnapRef = useRef<ImageData | null>(null);

  // Panning (space-drag or middle button)
  const panningRef = useRef(false);
  const panOriginRef = useRef<{ screen: Point; pan: Point } | null>(null);
  const spaceDownRef = useRef(false);

  // History (per-layer ImageData snapshots)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);

  const syncHistoryFlags = useCallback(() => {
    setHistoryState({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 });
  }, []);

  const getActiveLayer = useCallback((): Layer | undefined => {
    const id = activeIdRef.current;
    return layersRef.current.find(l => l.id === id);
  }, []);

  // -------------------------------------------------------------------------
  // Compositing: paint background grid + every visible layer onto the view.
  // -------------------------------------------------------------------------
  const composite = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    try {
      const ctx = view.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const vw = view.width / dpr;
      const vh = view.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Surrounding area (outside the artboard). Canvas fills can't use CSS
      // vars, so use a dark neutral that reads well under the app chrome.
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, vw, vh);

      const { zoom: z, pan: p } = viewportRef.current;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);

      // Artboard background (white paper)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Grid / dots
      if (showGrid) {
        const step = 40;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CANVAS_W, CANVAS_H);
        ctx.clip();
        if (gridDots) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          const r = 1.4 / Math.max(z, 0.001);
          for (let x = 0; x <= CANVAS_W; x += step) {
            for (let y = 0; y <= CANVAS_H; y += step) {
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = 1 / Math.max(z, 0.001);
          ctx.beginPath();
          for (let x = 0; x <= CANVAS_W; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CANVAS_H);
          }
          for (let y = 0; y <= CANVAS_H; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(CANVAS_W, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      // Layers, bottom -> top
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
      }
      ctx.globalAlpha = 1;

      // Artboard outline
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1 / Math.max(z, 0.001);
      ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    } catch {
      /* canvas access guarded */
    }
  }, [showGrid, gridDots]);

  // Recomposite whenever layers/viewport/grid change.
  useEffect(() => {
    composite();
  }, [composite, layers, zoom, pan]);

  // -------------------------------------------------------------------------
  // Size the visible canvas to its container (DPR aware), then recomposite.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    const parent = containerRef.current;
    if (!view || !parent) return;

    const applySize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      view.width = Math.round(w * dpr);
      view.height = Math.round(h * dpr);
      view.style.width = `${w}px`;
      view.style.height = `${h}px`;
      composite();
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [composite]);

  // -------------------------------------------------------------------------
  // Persistence: serialize each layer's pixels as a PNG data URL.
  // -------------------------------------------------------------------------
  // Boards (whiteboards in folders) live in IndexedDB -- see canvasBoards.ts.
  // localStorage (~5 MB) silently failed for big drawings, losing them.
  const [boards, setBoards] = useState<BoardsIndex | null>(null);
  const boardsRef = useRef<BoardsIndex | null>(null);
  boardsRef.current = boards;
  const [boardEdit, setBoardEdit] = useState<null | { kind: 'rename' | 'folder'; value: string }>(null);

  const snapshot = useCallback((): BoardPayload => ({
    layers: layersRef.current.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      data: l.canvas.toDataURL('image/png'),
    })),
    activeLayerId: activeIdRef.current,
    objects: objectsRef.current,
  }), []);

  // Save status from real writes: the toolbar shows Saving / Saved Ns ago /
  // Not saved, and leaving warns while a write is in flight or has failed.
  // Before, a failed write was one toast and the board looked saved after.
  const saveFailedRef = useRef(false);
  const saveSeqRef = useRef(0);
  const [saveState, setSaveState] = useState<{ pending: boolean; savedAt: number | null; error: string | null }>({ pending: false, savedAt: null, error: null });
  useUnsavedGuard(saveState.pending || saveState.error !== null);
  const persist = useCallback(() => {
    const idx = boardsRef.current;
    if (!idx || !idx.activeId) return;
    const payload = snapshot();
    const next = touchBoard(idx, idx.activeId);
    boardsRef.current = next;
    setBoards(next);
    const seq = ++saveSeqRef.current;
    setSaveState((st) => ({ ...st, pending: true }));
    // A failed IndexedDB write used to vanish (void promise); say so once.
    Promise.all([saveBoard(idx.activeId, payload), saveIndex(next)]).then(() => {
      saveFailedRef.current = false;
      if (seq === saveSeqRef.current) setSaveState({ pending: false, savedAt: Date.now(), error: null });
    }, (e) => {
      console.warn('[Canvas] save failed', e);
      if (seq === saveSeqRef.current) {
        setSaveState((st) => ({ pending: false, savedAt: st.savedAt, error: `Couldn't save this board: ${(e as { name?: string } | null)?.name === 'QuotaExceededError' ? 'storage is full' : 'the store refused the write'}. Export it as an image so your latest changes aren't lost.` }));
      }
      if (saveFailedRef.current) return;
      saveFailedRef.current = true;
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: "Couldn't save this board. Export it as an image so your latest changes aren't lost." } }));
    });
  }, [snapshot]);

  // Saved versions of the open board on this device, listed and restored in
  // Collab Hub (autosaved every 5 minutes when it changed). Backlog #58.
  // A restore replaces the open board's layers and objects, then saves it.
  useAppCheckpoints({
    appId: 'canvas',
    appName: 'Canvas',
    getSnapshot: () => (boardsRef.current?.activeId ? JSON.stringify(snapshot()) : null),
    onRestore: (data) => {
      const payload = JSON.parse(data) as BoardPayload;
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.layers)) throw new Error('not a Canvas board');
      restorePayloadRef.current(payload);
      window.setTimeout(() => persistRef.current(), 300); // after the layers have redrawn
    },
  });

  // Board-list writes (switch, new, rename, move, delete) report a failure in
  // the toolbar instead of rejecting halfway through the action.
  const saveIndexReported = useCallback(async (index: BoardsIndex) => {
    try { await saveIndex(index); }
    catch (e) {
      console.warn('[Canvas] board list not saved', e);
      setSaveState((st) => ({ ...st, error: "Couldn't save the board list. Your boards may not appear after a restart." }));
    }
  }, []);

  // Replace the layer stack with a stored board (or one blank layer).
  const restorePayload = useCallback((payload: BoardPayload | undefined) => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    const objs = sanitizeObjects(payload?.objects);
    objectsRef.current = objs;
    setObjects(objs);
    setSelectedObj(null);
    setConnectFrom(undefined);
    if (!payload || !Array.isArray(payload.layers) || payload.layers.length === 0) {
      const fresh = createLayer('Layer 1');
      setLayers([fresh]);
      setActiveLayerId(fresh.id);
      return;
    }
    const restoredLayers: Layer[] = payload.layers.map(pl => {
      const canvas = makeLayerCanvas();
      const img = new Image();
      img.onload = () => {
        try {
          canvas.getContext('2d')?.drawImage(img, 0, 0);
          composite();
        } catch {
          /* ignore */
        }
      };
      img.src = pl.data;
      return {
        id: pl.id,
        name: pl.name,
        visible: pl.visible !== false,
        opacity: typeof pl.opacity === 'number' ? pl.opacity : 1,
        canvas,
      };
    });
    setLayers(restoredLayers);
    setActiveLayerId(payload.activeLayerId && restoredLayers.some(l => l.id === payload.activeLayerId)
      ? payload.activeLayerId
      : restoredLayers[restoredLayers.length - 1].id);
  }, [composite]);
  const restorePayloadRef = useRef(restorePayload);
  restorePayloadRef.current = restorePayload;
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Initial load (once): board index (migrating the old single drawing) + active board.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      try {
        const idx = await loadIndex();
        boardsRef.current = idx;
        setBoards(idx);
        restorePayload(await loadBoard(idx.activeId));
        void handleRequestRef.current();
      } catch {
        setActiveLayerId(prev => prev || layersRef.current[0]?.id || '');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchBoard = useCallback(async (id: string) => {
    const idx = boardsRef.current;
    if (!idx || id === idx.activeId) return;
    persist(); // save the board we're leaving
    const next = { ...(boardsRef.current ?? idx), activeId: id };
    boardsRef.current = next;
    setBoards(next);
    await saveIndexReported(next);
    restorePayload(await loadBoard(id));
    syncHistoryFlags();
  }, [persist, restorePayload, syncHistoryFlags]);

  const newBoard = useCallback(async () => {
    const idx = boardsRef.current;
    if (!idx) return;
    persist();
    const current = idx.boards.find(b => b.id === idx.activeId);
    const next = addBoard(boardsRef.current ?? idx, `Board ${idx.boards.length + 1}`, current?.folder ?? UNFILED);
    boardsRef.current = next;
    setBoards(next);
    await saveIndexReported(next);
    restorePayload(undefined);
    syncHistoryFlags();
  }, [persist, restorePayload, syncHistoryFlags]);

  const commitBoardEdit = useCallback(async () => {
    const idx = boardsRef.current;
    if (!idx || !boardEdit) return;
    const next = boardEdit.kind === 'rename'
      ? renameBoard(idx, idx.activeId, boardEdit.value)
      : moveBoard(idx, idx.activeId, boardEdit.value);
    boardsRef.current = next;
    setBoards(next);
    setBoardEdit(null);
    await saveIndexReported(next);
  }, [boardEdit]);

  const deleteActiveBoard = useCallback(async () => {
    const idx = boardsRef.current;
    if (!idx) return;
    const current = idx.boards.find(b => b.id === idx.activeId);
    if (!current || !window.confirm(`Delete board "${current.name}"? This can't be undone.`)) return;
    let next = removeBoard(idx, current.id);
    if (next.boards.length === 0) next = addBoard(next, 'My canvas');
    boardsRef.current = next;
    setBoards(next);
    await deleteBoardData(current.id);
    await saveIndexReported(next);
    restorePayload(await loadBoard(next.activeId));
    syncHistoryFlags();
  }, [restorePayload, syncHistoryFlags]);

  // Ensure there's always a valid active layer.
  useEffect(() => {
    if (!activeLayerId && layers.length > 0) {
      setActiveLayerId(layers[layers.length - 1].id);
    } else if (activeLayerId && !layers.some(l => l.id === activeLayerId) && layers.length > 0) {
      setActiveLayerId(layers[layers.length - 1].id);
    }
  }, [activeLayerId, layers]);

  // -------------------------------------------------------------------------
  // History helpers
  // -------------------------------------------------------------------------
  const captureLayer = (layer: Layer): ImageData | null => {
    try {
      return layer.canvas.getContext('2d')?.getImageData(0, 0, CANVAS_W, CANVAS_H) ?? null;
    } catch {
      return null;
    }
  };

  const restoreLayer = (layerId: string, data: ImageData) => {
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!layer) return;
    try {
      layer.canvas.getContext('2d')?.putImageData(data, 0, 0);
    } catch {
      /* ignore */
    }
  };

  const pushHistory = useCallback((layerId: string, before: ImageData | null, after: ImageData | null) => {
    if (!before || !after) return;
    undoStackRef.current.push({ layerId, before, after });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    syncHistoryFlags();
    persist();
  }, [syncHistoryFlags, persist]);

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    if (entry.kind === 'objects') { objectsRef.current = entry.before; setObjects(entry.before); setSelectedObj(null); }
    else restoreLayer(entry.layerId, entry.before);
    redoStackRef.current.push(entry);
    syncHistoryFlags();
    composite();
    persist();
  }, [composite, syncHistoryFlags, persist]);

  const redo = useCallback(() => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    if (entry.kind === 'objects') { objectsRef.current = entry.after; setObjects(entry.after); setSelectedObj(null); }
    else restoreLayer(entry.layerId, entry.after);
    undoStackRef.current.push(entry);
    syncHistoryFlags();
    composite();
    persist();
  }, [composite, syncHistoryFlags, persist]);

  const commitObjects = useCallback((before: BoardObject[], after: BoardObject[]) => {
    objectsRef.current = after;
    setObjects(after);
    undoStackRef.current.push({ kind: 'objects', before, after });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    syncHistoryFlags();
    persist();
  }, [syncHistoryFlags, persist]);

  const liveObjects = useCallback((objs: BoardObject[]) => { objectsRef.current = objs; setObjects(objs); }, []);

  /** Centre of the visible part of the artboard, for placing new objects. */
  const viewCenter = (): Point => {
    const view = viewRef.current;
    const { zoom: z, pan: p } = viewportRef.current;
    const w = view ? view.clientWidth : CANVAS_W, h = view ? view.clientHeight : CANVAS_H;
    return { x: Math.min(CANVAS_W - 60, Math.max(60, (w / 2 - p.x) / z)), y: Math.min(CANVAS_H - 60, Math.max(60, (h / 2 - p.y) / z)) };
  };

  const addObject = (kind: 'sticky' | 'text' | 'rect' | 'ellipse' | 'frame') => {
    const c = viewCenter();
    const jitter = (objectsRef.current.length % 6) * 16;
    const obj = createObject(kind, { x: c.x + jitter, y: c.y + jitter }, kind === 'sticky' ? STICKY_COLORS[objectsRef.current.length % STICKY_COLORS.length] : color);
    commitObjects(objectsRef.current, [...objectsRef.current, obj]);
    setSelectedObj(obj.id);
    setConnectFrom(undefined);
  };

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('error', 'That file is not an image'); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast('error', 'Images up to 8 MB'); return; }
    const src: string = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
    const dims: { w: number; h: number } = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => resolve({ w: 320, h: 240 }); i.src = src; });
    const scale = Math.min(1, 480 / Math.max(dims.w, dims.h));
    const obj = createObject('image', viewCenter(), '#000000', { src, w: Math.round(dims.w * scale), h: Math.round(dims.h * scale) });
    commitObjects(objectsRef.current, [...objectsRef.current, obj]);
    setSelectedObj(obj.id);
  };

  // UKI: read the open board (text of every object, grouped by frame) and send it to Slides.
  useEffect(() => {
    registerUkiAppAction('canvas', {
      id: 'canvas.readBoard',
      description: 'read the board open in Creative Studio: each frame and the sticky notes, text and shapes inside it (text only; images are named).',
      args: [],
      example: '{}',
      mutates: false,
    }, () => {
      const objs = objectsRef.current.filter((o) => o.kind !== 'connector');
      const name = boardsRef.current?.boards.find((b) => b.id === boardsRef.current?.activeId)?.name ?? 'Board';
      if (!objs.length) return `"${name}" has no objects.`;
      const frames = objs.filter((o) => o.kind === 'frame');
      const inFrame = (o: BoardObject, f: BoardObject) => o.x + o.w / 2 >= f.x && o.x + o.w / 2 <= f.x + f.w && o.y + o.h / 2 >= f.y && o.y + o.h / 2 <= f.y + f.h;
      const line = (o: BoardObject) => `- ${o.kind}${o.kind === 'image' ? '' : `: ${o.text.trim().replace(/\s+/g, ' ').slice(0, 200) || '(empty)'}`}`;
      const out = [`Board "${name}": ${objs.length} objects, ${frames.length} frames.`];
      for (const f of frames) out.push(`Frame "${f.text || 'Untitled'}":`, ...objs.filter((o) => o.kind !== 'frame' && inFrame(o, f)).map(line));
      const loose = objs.filter((o) => o.kind !== 'frame' && !frames.some((f) => inFrame(o, f)));
      if (loose.length) out.push('Outside frames:', ...loose.map(line));
      return out.join('\n').slice(0, 6000);
    });
    registerUkiAppAction('canvas', {
      id: 'canvas.sendToSlides',
      description: 'turn the open board into slides (each frame becomes a slide) and add them to the deck in Slides. Undoable there.',
      args: [],
      example: '{}',
      mutates: true,
    }, () => {
      const { slides, report } = boardToSlides(objectsRef.current, { hasDrawing: layersRef.current.some((l) => l.visible && hasInk(l.canvas)) });
      if (!sendSlidesToPresentation(slides)) return 'Nothing to send: the board has no sticky notes, text, shapes or images.';
      setStudioMode('slides');
      const extra = describeNotCarried(report);
      return `Added ${report.slides} slide(s) with ${report.carried} objects to Slides.${extra ? ` ${extra}` : ''}`;
    });
    return () => {
      unregisterUkiAppAction('canvas.readBoard');
      unregisterUkiAppAction('canvas.sendToSlides');
    };
  }, []);

  // Requests from the Creative Hub: open a board, or start one from a template.
  const handleRequestRef = useRef<() => Promise<void>>(async () => {});
  handleRequestRef.current = async () => {
    if (!boardsRef.current) return; // initial load will call again
    const req = takeCanvasRequest();
    if (!req) return;
    if (req.boardId && boardsRef.current.boards.some(b => b.id === req.boardId)) {
      await switchBoard(req.boardId);
      return;
    }
    const tpl = req.templateId ? BOARD_TEMPLATES.find(t => t.id === req.templateId) : undefined;
    if (!tpl) return;
    await newBoard();
    const idx = boardsRef.current;
    if (idx) {
      const named = renameBoard(idx, idx.activeId, tpl.name);
      boardsRef.current = named;
      setBoards(named);
      await saveIndexReported(named);
    }
    commitObjects([], tpl.build());
  };
  useEffect(() => {
    const on = () => { void handleRequestRef.current(); };
    window.addEventListener(CANVAS_REQUEST_EVENT, on);
    return () => window.removeEventListener(CANVAS_REQUEST_EVENT, on);
  }, []);

  const pickForConnector = (id: string) => {
    if (connectFrom === null || connectFrom === undefined) { setConnectFrom(id); return; }
    if (connectFrom !== id) {
      commitObjects(objectsRef.current, [...objectsRef.current, createConnector(connectFrom, id, color)]);
      toast('success', 'Connected');
    }
    setConnectFrom(undefined);
  };

  // -------------------------------------------------------------------------
  // Pointer -> artboard coordinate conversion (accounts for pan/zoom + DPR-free
  // CSS coords since the view element uses CSS px for layout).
  // -------------------------------------------------------------------------
  const toArtboard = (clientX: number, clientY: number): Point => {
    const view = viewRef.current;
    if (!view) return { x: 0, y: 0 };
    const rect = view.getBoundingClientRect();
    const { zoom: z, pan: p } = viewportRef.current;
    return {
      x: (clientX - rect.left - p.x) / z,
      y: (clientY - rect.top - p.y) / z,
    };
  };

  // Snap a shape endpoint: to 45-degree angles for line/arrow, or square the
  // box for rectangle/ellipse.
  const applySnap = (start: Point, end: Point, t: Tool): Point => {
    if (!snap) return end;
    if (t === 'line' || t === 'arrow') {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const ang = Math.atan2(dy, dx);
      const len = Math.hypot(dx, dy);
      const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      return { x: start.x + Math.cos(snapped) * len, y: start.y + Math.sin(snapped) * len };
    }
    if (t === 'rectangle' || t === 'ellipse') {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
    }
    return end;
  };

  const configureStroke = (ctx: CanvasRenderingContext2D, t: Tool) => {
    const { color: c, brushSize: bs, brushOpacity: bo } = styleRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (t === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = bs * 2.5;
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = bs;
      ctx.globalAlpha = bo;
    }
  };

  // -------------------------------------------------------------------------
  // Pointer handlers
  // -------------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    if (selectedObj) setSelectedObj(null);
    if (connectFrom !== undefined) { setConnectFrom(undefined); return; }

    // Pan: middle button, or space held + left button.
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      panningRef.current = true;
      panOriginRef.current = { screen: { x: e.clientX, y: e.clientY }, pan: { ...viewportRef.current.pan } };
      try { view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    if (e.button !== 0) return;

    const pt = toArtboard(e.clientX, e.clientY);

    // Text tool: place text immediately on click.
    if (toolRef.current === 'text') {
      placeText(pt);
      return;
    }

    const layer = getActiveLayer();
    if (!layer || !layer.visible) {
      if (layer && !layer.visible) toast('info', 'Active layer is hidden');
      return;
    }
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;

    drawingRef.current = true;
    startPtRef.current = pt;
    lastPtRef.current = pt;
    beforeSnapRef.current = captureLayer(layer);

    try { view.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    // Pen/eraser: stamp a starting dot so single clicks register.
    if (!isShapeTool(toolRef.current)) {
      configureStroke(ctx, toolRef.current);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(ctx.lineWidth / 2, 0.5), 0, Math.PI * 2);
      ctx.fillStyle = toolRef.current === 'eraser' ? 'rgba(0,0,0,1)' : styleRef.current.color;
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      composite();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Panning
    if (panningRef.current && panOriginRef.current) {
      const o = panOriginRef.current;
      setPan({ x: o.pan.x + (e.clientX - o.screen.x), y: o.pan.y + (e.clientY - o.screen.y) });
      return;
    }
    if (!drawingRef.current) return;

    const layer = getActiveLayer();
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    const pt = toArtboard(e.clientX, e.clientY);
    const t = toolRef.current;

    if (isShapeTool(t)) {
      // Restore the pre-drag snapshot, then draw a live preview of the shape.
      if (beforeSnapRef.current) {
        try { ctx.putImageData(beforeSnapRef.current, 0, 0); } catch { /* ignore */ }
      }
      const start = startPtRef.current || pt;
      const end = applySnap(start, pt, t);
      configureStroke(ctx, t);
      drawShapePath(ctx, t, start, end);
      ctx.stroke();
      if (t === 'arrow') drawArrowHead(ctx, start, end, styleRef.current.brushSize);
      ctx.globalAlpha = 1;
      composite();
      return;
    }

    // Freehand pen / eraser
    const last = lastPtRef.current;
    if (!last) return;
    configureStroke(ctx, t);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    lastPtRef.current = pt;
    composite();
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const layer = getActiveLayer();
    if (layer) {
      const after = captureLayer(layer);
      pushHistory(layer.id, beforeSnapRef.current, after);
    }
    beforeSnapRef.current = null;
    startPtRef.current = null;
    lastPtRef.current = null;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (panningRef.current) {
      panningRef.current = false;
      panOriginRef.current = null;
      try { viewRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    try { viewRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    finishStroke();
  };

  // Text placement via a transient prompt.
  const placeText = (pt: Point) => {
    const layer = getActiveLayer();
    if (!layer || !layer.visible) {
      toast('info', 'Active layer is hidden');
      return;
    }
    let text: string | null = null;
    try {
      text = window.prompt('Enter text');
    } catch {
      text = null;
    }
    if (!text) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    const before = captureLayer(layer);
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = styleRef.current.brushOpacity;
      ctx.fillStyle = styleRef.current.color;
      ctx.textBaseline = 'top';
      ctx.font = `${fontSize}px -apple-system, "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(text, pt.x, pt.y);
      ctx.globalAlpha = 1;
    } catch {
      /* ignore */
    }
    const after = captureLayer(layer);
    pushHistory(layer.id, before, after);
    composite();
  };

  // -------------------------------------------------------------------------
  // Zoom (wheel + buttons + fit)
  // -------------------------------------------------------------------------
  const zoomAt = useCallback((factor: number, centerClientX?: number, centerClientY?: number) => {
    const view = viewRef.current;
    if (!view) return;
    const rect = view.getBoundingClientRect();
    const cx = (centerClientX ?? rect.left + rect.width / 2) - rect.left;
    const cy = (centerClientY ?? rect.top + rect.height / 2) - rect.top;
    // Read the live viewport from the ref so both setters stay pure.
    const { zoom: prevZoom, pan: prevPan } = viewportRef.current;
    const newZoom = Math.min(8, Math.max(0.1, prevZoom * factor));
    // Keep the point under the cursor stationary across the zoom.
    const ax = (cx - prevPan.x) / prevZoom;
    const ay = (cy - prevPan.y) / prevZoom;
    setZoom(newZoom);
    setPan({ x: cx - ax * newZoom, y: cy - ay * newZoom });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  };

  const fitToScreen = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const rect = view.getBoundingClientRect();
    const margin = 40;
    const z = Math.min((rect.width - margin) / CANVAS_W, (rect.height - margin) / CANVAS_H);
    const newZoom = Math.min(8, Math.max(0.1, z));
    setZoom(newZoom);
    setPan({ x: (rect.width - CANVAS_W * newZoom) / 2, y: (rect.height - CANVAS_H * newZoom) / 2 });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    const view = viewRef.current;
    if (!view) { setPan({ x: 0, y: 0 }); return; }
    const rect = view.getBoundingClientRect();
    setPan({ x: (rect.width - CANVAS_W) / 2, y: (rect.height - CANVAS_H) / 2 });
  }, []);

  // Center the artboard the first time we have a measured size.
  const didCenterRef = useRef(false);
  useEffect(() => {
    if (didCenterRef.current) return;
    const view = viewRef.current;
    if (!view) return;
    const rect = view.getBoundingClientRect();
    if (rect.width === 0) return;
    didCenterRef.current = true;
    fitToScreen();
  }, [fitToScreen, layers]);

  // -------------------------------------------------------------------------
  // Layer operations
  // -------------------------------------------------------------------------
  const addLayer = () => {
    setLayers(prev => {
      const layer = createLayer(`Layer ${prev.length + 1}`);
      const next = [...prev, layer];
      setActiveLayerId(layer.id);
      return next;
    });
    // History stacks reference layer ids that still exist, so no purge needed.
    persist();
  };

  const deleteLayer = (id: string) => {
    setLayers(prev => {
      if (prev.length <= 1) {
        toast('info', 'Cannot delete the last layer');
        return prev;
      }
      const idx = prev.findIndex(l => l.id === id);
      const next = prev.filter(l => l.id !== id);
      if (activeIdRef.current === id) {
        const fallback = next[Math.max(0, idx - 1)] || next[next.length - 1];
        setActiveLayerId(fallback.id);
      }
      // Drop history entries tied to the removed layer.
      undoStackRef.current = undoStackRef.current.filter(h => h.kind === 'objects' || h.layerId !== id);
      redoStackRef.current = redoStackRef.current.filter(h => h.kind === 'objects' || h.layerId !== id);
      syncHistoryFlags();
      return next;
    });
    persist();
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    persist();
  };

  const toggleLayerVisible = (id: string) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)));
    persist();
  };

  const setLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, opacity } : l)));
    persist();
  };

  const renameLayer = (id: string) => {
    const current = layersRef.current.find(l => l.id === id);
    let name: string | null = null;
    try { name = window.prompt('Layer name', current?.name || ''); } catch { name = null; }
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, name: trimmed } : l)));
    persist();
  };

  const clearActive = () => {
    const layer = getActiveLayer();
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    const before = captureLayer(layer);
    try { ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); } catch { /* ignore */ }
    const after = captureLayer(layer);
    pushHistory(layer.id, before, after);
    composite();
    toast('success', `Cleared "${layer.name}"`);
  };

  // -------------------------------------------------------------------------
  // Export: flatten visible layers (white background) to a PNG.
  // -------------------------------------------------------------------------
  const flatten = (): HTMLCanvasElement | null => {
    try {
      const out = document.createElement('canvas');
      out.width = CANVAS_W;
      out.height = CANVAS_H;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      for (const layer of layersRef.current) {
        if (!layer.visible) continue;
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0);
      }
      ctx.globalAlpha = 1;
      drawObjects(ctx, objectsRef.current);
      return out;
    } catch {
      return null;
    }
  };

  const exportPng = () => {
    const flat = flatten();
    if (!flat) { toast('error', 'Export failed'); return; }
    try {
      const url = flat.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      toast('success', 'Exported PNG');
    } catch {
      toast('error', 'Export failed');
    }
  };

  const copyToClipboard = async () => {
    const flat = flatten();
    if (!flat) { toast('error', 'Copy failed'); return; }
    try {
      if (!navigator.clipboard || typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem === 'undefined') {
        toast('error', 'Clipboard not supported here');
        return;
      }
      const blob: Blob | null = await new Promise(resolve => flat.toBlob(resolve, 'image/png'));
      if (!blob) { toast('error', 'Copy failed'); return; }
      // eslint-disable-next-line no-undef
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('success', 'Copied to clipboard');
    } catch {
      toast('error', 'Copy failed');
    }
  };

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!keyEventForApp(e, 'canvas')) return;
      const typing = isTypingTarget(e.target);
      if (e.code === 'Space' && !typing) {
        spaceDownRef.current = true;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === '0' && mod) {
        e.preventDefault();
        resetZoom();
      } else if (e.key === 'Escape' && drawingRef.current) {
        e.preventDefault();
        // Cancel in-progress shape by restoring the snapshot.
        const layer = getActiveLayer();
        if (layer && beforeSnapRef.current) {
          try { layer.canvas.getContext('2d')?.putImageData(beforeSnapRef.current, 0, 0); } catch { /* ignore */ }
        }
        drawingRef.current = false;
        beforeSnapRef.current = null;
        startPtRef.current = null;
        lastPtRef.current = null;
        composite();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDownRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, redo, resetZoom, composite, getActiveLayer]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const penTools: ReadonlyArray<{ id: Tool; icon: string; label: string }> = [
    { id: 'pen', icon: 'edit', label: 'Pen' },
    { id: 'eraser', icon: 'delete', label: 'Eraser' },
    { id: 'text', icon: 'type', label: 'Text' },
  ];

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div className="dex-liquid-glass" style={s.toolbar}>
        <div style={s.toolGroup}>
          {penTools.map(t => (
            <button
              key={t.id}
              style={{ ...s.toolBtn, ...(tool === t.id ? s.toolBtnActive : {}) }}
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              aria-label={t.label}
            >
              <DexIcon name={t.icon} size={16} />
            </button>
          ))}
        </div>

        <div style={s.divider} />

        {/* Whiteboard objects: stay editable after placing (unlike paint) */}
        <div style={s.toolGroup} role="group" aria-label="Add to board">
          {([['sticky', 'Sticky note'], ['text', 'Text box'], ['rect', 'Box'], ['ellipse', 'Ellipse'], ['frame', 'Frame']] as const).map(([k, label]) => (
            <button key={k} style={{ ...s.textBtn }} onClick={() => addObject(k)} title={`Add ${label.toLowerCase()}`} aria-label={`Add ${label.toLowerCase()}`}>{label}</button>
          ))}
          <button style={{ ...s.textBtn }} onClick={() => imageInputRef.current?.click()} title="Add image" aria-label="Add image">Image</button>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} aria-label="Image to add" onChange={e => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />
          <button style={{ ...s.textBtn, ...(connectFrom !== undefined ? s.toolBtnActive : {}) }} aria-pressed={connectFrom !== undefined}
            onClick={() => { setConnectFrom(connectFrom === undefined ? null : undefined); setSelectedObj(null); }}
            title="Connect two objects: click the first, then the second" aria-label="Connect objects">{connectFrom === undefined ? 'Connect' : connectFrom === null ? 'Pick start…' : 'Pick end…'}</button>
        </div>

        <div style={s.divider} />

        {/* Shapes */}
        <div style={s.toolGroup}>
          {(['line', 'arrow', 'rectangle', 'ellipse'] as const).map(t => (
            <button
              key={t}
              style={{ ...s.toolBtn, ...(tool === t ? s.toolBtnActive : {}) }}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
              aria-label={t}
            >
              {t === 'line' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>
              ) : t === 'arrow' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /><polyline points="11,5 19,5 19,13" /></svg>
              ) : t === 'rectangle' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" rx="1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="9" ry="6" /></svg>
              )}
            </button>
          ))}
          <button
            style={{ ...s.toolBtn, ...(snap ? s.toolBtnActive : {}) }}
            onClick={() => setSnap(v => !v)}
            title="Snap shapes (square / 45 degrees)"
            aria-label="Snap"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h6V3M21 15h-6v6M3 15h6v6M21 9h-6V3" /></svg>
          </button>
        </div>

        <div style={s.divider} />

        {/* Colors */}
        <div style={s.colorGroup}>
          {COLORS.map(c => (
            <button
              key={c}
              style={{
                ...s.colorBtn,
                background: c,
                boxShadow: color === c ? `0 0 0 2px var(--color-accent), 0 0 0 4px ${c}` : 'none',
                border: c === '#FFFFFF' ? '1px solid var(--color-border)' : 'none',
              }}
              onClick={() => setColor(c)}
              title={c}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
            />
          ))}
          <input
            type="color"
            value={colorInputValue(color)}
            onChange={e => setColor(e.target.value)}
            style={s.colorPicker}
            title="Custom color"
            aria-label="Custom color"
          />
        </div>

        <div style={s.divider} />

        {/* Brush size */}
        <div style={s.sizeGroup}>
          {BRUSH_SIZES.map(size => (
            <button
              key={size}
              style={{ ...s.sizeBtn, ...(brushSize === size ? s.sizeBtnActive : {}) }}
              onClick={() => setBrushSize(size)}
              title={`${size}px`}
              aria-label={`Brush size ${size} pixels`}
              aria-pressed={brushSize === size}
            >
              <span style={{ width: Math.min(size, 14), height: Math.min(size, 14), borderRadius: '50%', background: 'currentColor' }} />
            </button>
          ))}
        </div>

        {/* Opacity */}
        <div style={s.sliderGroup} title="Brush opacity">
          <span style={s.sliderLabel}>Opacity</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(brushOpacity * 100)}
            onChange={e => setBrushOpacity(Number(e.target.value) / 100)}
            style={s.slider}
            aria-label="Brush opacity"
            aria-valuetext={`${Math.round(brushOpacity * 100)} percent`}
          />
        </div>

        {/* Font size (text tool) */}
        {tool === 'text' && (
          <div style={s.sliderGroup} title="Font size">
            <span style={s.sliderLabel}>Font</span>
            <input
              type="range"
              min={10}
              max={120}
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              style={s.slider}
              aria-label="Font size"
              aria-valuetext={`${fontSize} pixels`}
            />
            <span style={s.sliderLabel}>{fontSize}</span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Grid toggles */}
        <div style={s.toolGroup}>
          <button
            style={{ ...s.toolBtn, ...(showGrid ? s.toolBtnActive : {}) }}
            onClick={() => setShowGrid(v => !v)}
            title="Toggle grid"
            aria-label="Toggle grid"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>
          </button>
          <button
            style={{ ...s.toolBtn, ...(gridDots ? s.toolBtnActive : {}) }}
            onClick={() => setGridDots(v => !v)}
            title="Grid as dots"
            aria-label="Grid dots"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="6" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="18" cy="6" r="1.6" /><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /><circle cx="6" cy="18" r="1.6" /><circle cx="12" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></svg>
          </button>
        </div>

        <div style={s.divider} />

        {/* Zoom */}
        <div style={s.toolGroup}>
          <button style={s.actionBtn} onClick={() => zoomAt(1 / 1.2)} title="Zoom out" aria-label="Zoom out">
            <DexIcon name="minus" size={16} />
          </button>
          <button style={s.zoomLabel} onClick={resetZoom} title="Reset zoom (Ctrl+0)" aria-label={`Zoom ${Math.round(zoom * 100)}%, reset to 100%`}>{Math.round(zoom * 100)}%</button>
          <button style={s.actionBtn} onClick={() => zoomAt(1.2)} title="Zoom in" aria-label="Zoom in">
            <DexIcon name="plus" size={16} />
          </button>
          <button style={s.actionBtn} onClick={fitToScreen} title="Fit to screen" aria-label="Fit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          </button>
        </div>

        <div style={s.divider} />

        {/* Actions */}
        <div style={s.actionGroup}>
          <span title={saveState.error ?? 'Canvas saves the board as you work'} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 4 }}>
            <AutosaveIndicator
              state={saveState.error ? 'error' : saveState.pending ? 'saving' : saveState.savedAt ? 'saved' : 'idle'}
              lastSavedAt={saveState.savedAt}
              label={saveState.error ? 'Not saved' : (!saveState.pending && !saveState.savedAt ? 'Up to date' : undefined)}
            />
          </span>
          <button style={{ ...s.actionBtn, ...(historyState.canUndo ? {} : s.actionBtnDisabled) }} onClick={undo} disabled={!historyState.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <DexIcon name="undo" size={16} />
          </button>
          <button style={{ ...s.actionBtn, ...(historyState.canRedo ? {} : s.actionBtnDisabled) }} onClick={redo} disabled={!historyState.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <DexIcon name="redo" size={16} />
          </button>
          <button style={s.actionBtn} onClick={clearActive} title="Clear active layer" aria-label="Clear">
            <DexIcon name="trash" size={16} />
          </button>
          <button style={s.actionBtn} onClick={copyToClipboard} title="Copy PNG to clipboard" aria-label="Copy">
            <DexIcon name="copy" size={16} />
          </button>
          <button style={{ ...s.actionBtn, ...s.saveBtn }} onClick={exportPng} title="Export PNG" aria-label="Export">
            <DexIcon name="download" size={16} />
          </button>
        </div>
      </div>

      {/* Body: canvas + layers panel */}
      <div style={s.body}>
        <div ref={containerRef} style={s.canvasContainer}>
          <canvas
            ref={viewRef}
            style={{ ...s.canvas, cursor: tool === 'text' ? 'text' : spaceDownRef.current ? 'grab' : 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          />
          <CanvasObjectLayer
            objects={objects}
            zoom={zoom}
            pan={pan}
            snap={snap}
            selectedId={selectedObj}
            onSelect={setSelectedObj}
            onLive={liveObjects}
            onCommit={commitObjects}
            connectFrom={connectFrom}
            onConnectPick={pickForConnector}
            palette={COLORS}
          />
        </div>

        {/* Layers panel */}
        <div className="dex-liquid-glass" style={s.layersPanel}>
          {/* Boards: many whiteboards, grouped by folder */}
          <div style={s.layersHeader}>
            <span style={s.layersTitle}>Boards</span>
            <button style={s.smallBtn} onClick={() => void newBoard()} title="New board" aria-label="New board">
              <DexIcon name="plus" size={14} />
            </button>
          </div>
          {boards && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px 8px' }}>
              <select
                aria-label="Board"
                value={boards.activeId}
                onChange={e => void switchBoard(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }}
              >
                {groupByFolder(boards).map(g => (
                  <optgroup key={g.folder || '(unfiled)'} label={g.folder || 'No folder'}>
                    {g.boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {boardEdit ? (
                <form style={{ display: 'flex', gap: 4 }} onSubmit={e => { e.preventDefault(); void commitBoardEdit(); }}>
                  <input
                    autoFocus
                    aria-label={boardEdit.kind === 'rename' ? 'Board name' : 'Folder name (empty for none)'}
                    placeholder={boardEdit.kind === 'rename' ? 'Board name' : 'Folder (empty = none)'}
                    value={boardEdit.value}
                    onChange={e => setBoardEdit({ ...boardEdit, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Escape') setBoardEdit(null); }}
                    style={{ flex: 1, minWidth: 0, padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-control)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: 12 }}
                  />
                  <button type="submit" style={s.textBtn} aria-label="Save">OK</button>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={s.textBtn} onClick={() => setBoardEdit({ kind: 'rename', value: boards.boards.find(b => b.id === boards.activeId)?.name ?? '' })} aria-label="Rename board" title="Rename board">Rename</button>
                  <button style={s.textBtn} onClick={() => setBoardEdit({ kind: 'folder', value: boards.boards.find(b => b.id === boards.activeId)?.folder ?? '' })} aria-label="Move board to folder" title="Move to folder">Folder</button>
                  <button style={s.textBtn} onClick={() => void deleteActiveBoard()} aria-label="Delete board" title="Delete board">Delete</button>
                  <button style={s.textBtn} data-testid="canvas-send-to-slides" onClick={() => {
                    const { slides, report } = boardToSlides(objectsRef.current, { hasDrawing: layers.some(l => l.visible && hasInk(l.canvas)) });
                    if (!sendSlidesToPresentation(slides)) { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: 'Nothing to send: add sticky notes, text, shapes or images (frames become slides).' } })); return; }
                    setStudioMode('slides');
                    const extra = describeNotCarried(report);
                    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'success', message: `Added ${report.slides} slide${report.slides > 1 ? 's' : ''} from this board (${report.carried} objects).${extra ? ` ${extra}` : ''}` } }));
                  }} aria-label="Send board to Slides" title="Each frame becomes a slide (or the whole board if it has no frames)">To Slides</button>
                </div>
              )}
            </div>
          )}
          <div style={s.layersHeader}>
            <span style={s.layersTitle}>Layers</span>
            <button style={s.smallBtn} onClick={addLayer} title="Add layer" aria-label="Add layer">
              <DexIcon name="plus" size={14} />
            </button>
          </div>
          <div style={s.layersList}>
            {/* Top layer first in the panel (visual top is end of array). */}
            {[...layers].reverse().map(layer => {
              const isActive = layer.id === activeLayerId;
              return (
                <div
                  key={layer.id}
                  style={{ ...s.layerItem, ...(isActive ? s.layerItemActive : {}) }}
                  onClick={() => setActiveLayerId(layer.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  aria-label={`Select layer ${layer.name}`}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveLayerId(layer.id);
                    }
                  }}
                >
                  <div style={s.layerRow}>
                    <button
                      style={s.iconBtn}
                      onClick={e => { e.stopPropagation(); toggleLayerVisible(layer.id); }}
                      title={layer.visible ? 'Hide' : 'Show'}
                      aria-label="Toggle visibility"
                    >
                      <DexIcon name={layer.visible ? 'eye' : 'eye-off'} size={14} />
                    </button>
                    <span
                      style={s.layerName}
                      onDoubleClick={e => { e.stopPropagation(); renameLayer(layer.id); }}
                      title="Double-click to rename"
                    >
                      {layer.name}
                    </span>
                    <div style={s.layerActions}>
                      <button style={s.iconBtn} onClick={e => { e.stopPropagation(); moveLayer(layer.id, 1); }} title="Move up" aria-label="Move up">
                        <DexIcon name="chevron-up" size={14} />
                      </button>
                      <button style={s.iconBtn} onClick={e => { e.stopPropagation(); moveLayer(layer.id, -1); }} title="Move down" aria-label="Move down">
                        <DexIcon name="chevron-down" size={14} />
                      </button>
                      <button style={s.iconBtn} onClick={e => { e.stopPropagation(); deleteLayer(layer.id); }} title="Delete" aria-label="Delete layer">
                        <DexIcon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                  <div style={s.opacityRow}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(layer.opacity * 100)}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setLayerOpacity(layer.id, Number(e.target.value) / 100)}
                      style={s.layerOpacitySlider}
                      title="Layer opacity"
                      aria-label={`${layer.name} opacity`}
                      aria-valuetext={`${Math.round(layer.opacity * 100)} percent`}
                    />
                    <span style={s.opacityValue}>{Math.round(layer.opacity * 100)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
    overflow: 'hidden',
  },
  toolbar: {
    // Floating tool palette (DEX Capsule): inset from the edges, rounded, the
    // canvas stays dominant around it.
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 4,
    margin: '8px 8px 0',
    borderRadius: 18, // = 14 (button radius) + 4 (padding): concentric
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  toolGroup: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
  },
  toolBtn: {
    width: CAPSULE_HEIGHT.md,
    height: CAPSULE_HEIGHT.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: CAPSULE_HEIGHT.md / 2,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toolBtnActive: {
    background: CAPSULE_SELECTED_BG,
    color: 'var(--color-text-primary)',
  },
  divider: {
    width: 1,
    height: 24,
    background: 'var(--color-border)',
  },
  colorGroup: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
    maxWidth: 170,
    alignItems: 'center',
  },
  colorBtn: {
    width: 20,
    height: 20,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'transform 0.1s ease',
  },
  colorPicker: {
    width: 24,
    height: 24,
    padding: 0,
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    background: 'transparent',
    cursor: 'pointer',
  },
  sizeGroup: {
    display: 'flex',
    gap: 2,
  },
  sizeBtn: {
    width: CAPSULE_HEIGHT.md,
    height: CAPSULE_HEIGHT.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: CAPSULE_HEIGHT.md / 2,
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
  },
  sizeBtnActive: {
    background: 'var(--color-accent-soft, rgba(74, 158, 255, 0.15))',
    color: 'var(--color-accent)',
  },
  sliderGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sliderLabel: {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    whiteSpace: 'nowrap',
  },
  slider: {
    width: 80,
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  zoomLabel: {
    minWidth: 48,
    height: CAPSULE_HEIGHT.md,
    fontVariantNumeric: 'tabular-nums',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: CAPSULE_HEIGHT.md / 2,
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
  },
  actionGroup: {
    display: 'flex',
    gap: 4,
  },
  actionBtn: {
    minWidth: CAPSULE_HEIGHT.md,
    height: CAPSULE_HEIGHT.md,
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: CAPSULE_HEIGHT.md / 2,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  actionBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  saveBtn: {
    background: 'var(--color-accent-fill)',
    color: '#fff',
  },
  body: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    touchAction: 'none',
  },
  layersPanel: {
    width: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 0,
  },
  layersHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--color-border)',
  },
  layersTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    textTransform: 'none',
    letterSpacing: '0.01em',
  },
  // Text buttons in the Boards row (smallBtn is a fixed 24px icon button).
  textBtn: {
    flex: 1,
    height: CAPSULE_HEIGHT.md,
    padding: '0 10px',
    background: 'transparent',
    border: '1px solid var(--color-border-control)',
    borderRadius: CAPSULE_HEIGHT.md / 2,
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  smallBtn: {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  layersList: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  layerItem: {
    padding: '6px 8px',
    borderRadius: 10,
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
  },
  layerItemActive: {
    border: '1px solid var(--color-accent)',
    background: 'var(--color-accent-soft, rgba(74, 158, 255, 0.12))',
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  layerName: {
    flex: 1,
    fontSize: 12,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  layerActions: {
    display: 'flex',
    gap: 1,
  },
  iconBtn: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 10,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  opacityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  layerOpacitySlider: {
    flex: 1,
    accentColor: 'var(--color-accent)',
    cursor: 'pointer',
  },
  opacityValue: {
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    minWidth: 32,
    textAlign: 'right',
  },
};

export default memo(Canvas);
