/**
 * DEX Platform - Pixel Art Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * NES-style pixel grid editor with frames, onion-skin, symmetry, and PNG export
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassToolbar } from '../../styles/glassMenu';

type Tool = 'pencil' | 'eraser' | 'fill' | 'replace' | 'line' | 'rect' | 'eyedropper';
type GridSize = 8 | 16 | 32 | 64;
type ExportScale = 1 | 4 | 8;
type Pixel = string | null;
type Frame = Pixel[][]; // [y][x]

interface PersistedState {
  size: GridSize;
  frames: Frame[];
  currentFrame: number;
  color: string;
  tool: Tool;
  mirror?: boolean;
  onion?: boolean;
  fps?: number;
  exportScale?: ExportScale;
  tilePreview?: boolean;
  paletteLock?: boolean;
  lockedPalette?: string[];
}

const STORAGE_KEY = 'dex-pixelart-state';
const MAX_FRAMES = 8;

const toast = (type: 'success' | 'error' | 'info', message: string) => {
  try {
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
  } catch { /* ignore */ }
};

// 32 NES-style colors (4x8 palette)
const PALETTE: string[] = [
  '#000000', '#1d2b53', '#7e2553', '#008751',
  '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#ff77a8', '#ffccaa',
  '#291814', '#111d35', '#422136', '#125359',
  '#742f29', '#49333b', '#a28879', '#f3ef7d',
  '#be1250', '#ff6c24', '#a8e72e', '#00b543',
  '#065ab5', '#754665', '#ff6e59', '#ff9d81',
];

// Single source of truth for tool hotkeys, shared by the keydown handler and
// the toolbar tooltips so the advertised key always matches the bound key.
const TOOL_HOTKEY: Record<Tool, string> = {
  pencil: 'B',
  eraser: 'E',
  fill: 'G',
  replace: 'R',
  line: 'L',
  rect: 'U',
  eyedropper: 'I',
};

const TOOLS: Tool[] = ['pencil', 'eraser', 'fill', 'replace', 'line', 'rect', 'eyedropper'];

const makeBlankFrame = (size: GridSize): Frame =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null as Pixel));

const cloneFrame = (f: Frame): Frame => f.map(row => row.slice());

// Resize a frame, preserving overlapping pixels (top-left anchored).
const resizeFrame = (f: Frame, from: number, to: GridSize): Frame => {
  const next = makeBlankFrame(to);
  const n = Math.min(from, to);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      next[y][x] = f[y]?.[x] ?? null;
    }
  }
  return next;
};

// Bresenham line between two grid cells.
const linePoints = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => {
  const pts: Array<[number, number]> = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  // Bounded loop guard so a bad input can never spin forever.
  for (let guard = 0; guard < 100000; guard++) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return pts;
};

// Outline of a rectangle (grid cells on the border).
const rectPoints = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const pts: Array<[number, number]> = [];
  for (let x = minX; x <= maxX; x++) { pts.push([x, minY], [x, maxY]); }
  for (let y = minY; y <= maxY; y++) { pts.push([minX, y], [maxX, y]); }
  return pts;
};

// Parse a #rrggbb / #rgb hex string to [r,g,b]; null if unparseable.
const hexToRgb = (hex: string): [number, number, number] | null => {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Snap an arbitrary color to the nearest color in a palette (squared RGB
// distance). Used by palette-lock so any draw stays inside the locked set.
const nearestColor = (hex: string, palette: string[]): string => {
  const target = hexToRgb(hex);
  if (!target || palette.length === 0) return hex;
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const c = hexToRgb(p);
    if (!c) continue;
    const dr = c[0] - target[0];
    const dg = c[1] - target[1];
    const db = c[2] - target[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
};

const PixelArt: React.FC = () => {
  const [size, setSize] = useState<GridSize>(32);
  const [frames, setFrames] = useState<Frame[]>(() => [makeBlankFrame(32)]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [color, setColor] = useState<string>(PALETTE[8]);
  const [tool, setTool] = useState<Tool>('pencil');
  const [mirror, setMirror] = useState(false);
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(6);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [exportScale, setExportScale] = useState<ExportScale>(8);
  // Tile-preview mode: render the canvas as a 3x3 repeat to check seamlessness.
  const [tilePreview, setTilePreview] = useState(false);
  // Palette lock: when on, drawing colors are snapped to the locked palette so
  // a sprite stays inside a fixed N-color set (a real pixel-art workflow).
  const [paletteLock, setPaletteLock] = useState(false);
  const [lockedPalette, setLockedPalette] = useState<string[]>([]);
  // Live drag state for line / rect shape tools.
  const [shapeStart, setShapeStart] = useState<[number, number] | null>(null);
  const [shapeEnd, setShapeEnd] = useState<[number, number] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isDrawingRef = useRef(false);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        if (parsed.size && parsed.frames && Array.isArray(parsed.frames)) {
          setSize(parsed.size);
          setFrames(parsed.frames);
          setCurrentFrame(Math.min(parsed.currentFrame ?? 0, parsed.frames.length - 1));
          if (parsed.color) setColor(parsed.color);
          if (parsed.tool) setTool(parsed.tool);
          if (typeof parsed.mirror === 'boolean') setMirror(parsed.mirror);
          if (typeof parsed.onion === 'boolean') setOnion(parsed.onion);
          if (typeof parsed.fps === 'number') setFps(parsed.fps);
          if (parsed.exportScale) setExportScale(parsed.exportScale);
          if (typeof parsed.tilePreview === 'boolean') setTilePreview(parsed.tilePreview);
          if (typeof parsed.paletteLock === 'boolean') setPaletteLock(parsed.paletteLock);
          if (Array.isArray(parsed.lockedPalette)) setLockedPalette(parsed.lockedPalette.filter(c => typeof c === 'string'));
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    const state: PersistedState = { size, frames, currentFrame, color, tool, mirror, onion, fps, exportScale, tilePreview, paletteLock, lockedPalette };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [size, frames, currentFrame, color, tool, mirror, onion, fps, exportScale, tilePreview, paletteLock, lockedPalette]);

  const frame = frames[currentFrame] ?? frames[0];
  const prevFrame = currentFrame > 0 ? frames[currentFrame - 1] : (frames.length > 1 ? frames[frames.length - 1] : null);

  // The color actually written when drawing. With palette-lock on (and a
  // non-empty locked palette), snap the active color to the nearest locked one
  // so the sprite can never leave the fixed N-color set.
  const drawColor = useMemo(
    () => (paletteLock && lockedPalette.length > 0 ? nearestColor(color, lockedPalette) : color),
    [paletteLock, lockedPalette, color],
  );

  // Compute scale (auto-fit to ~480px)
  const scale = useMemo(() => Math.max(2, Math.floor(480 / size)), [size]);
  const canvasPx = size * scale;

  // Animation playback: advance the preview frame at the chosen FPS.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    setPreviewFrame(p => p % frames.length);
    const id = window.setInterval(() => {
      setPreviewFrame(p => (p + 1) % frames.length);
    }, Math.max(1, Math.round(1000 / Math.max(1, fps))));
    return () => window.clearInterval(id);
  }, [playing, fps, frames.length]);

  // The frame actually shown on the big canvas: the playback frame when
  // previewing, otherwise the frame being edited.
  const displayFrame = playing ? (frames[previewFrame] ?? frame) : frame;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayFrame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.clearRect(0, 0, canvasPx, canvasPx);
      const checkSize = scale;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = displayFrame[y][x];
          if (px === null) {
            ctx.fillStyle = ((x + y) & 1) ? '#2a2a30' : '#3a3a44';
            ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
          } else {
            ctx.fillStyle = px;
            ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
          }
        }
      }

      // Onion-skin overlay: faint previous frame, only while editing.
      if (!playing && onion && prevFrame) {
        ctx.globalAlpha = 0.28;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const px = prevFrame[y][x];
            if (px !== null) {
              ctx.fillStyle = px;
              ctx.fillRect(x * scale, y * scale, scale, scale);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // Live shape preview (line / rect) while dragging.
      if (!playing && shapeStart && shapeEnd && (tool === 'line' || tool === 'rect')) {
        const pts = tool === 'line'
          ? linePoints(shapeStart[0], shapeStart[1], shapeEnd[0], shapeEnd[1])
          : rectPoints(shapeStart[0], shapeStart[1], shapeEnd[0], shapeEnd[1]);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = drawColor;
        for (const [px, py] of pts) {
          if (px >= 0 && py >= 0 && px < size && py < size) {
            ctx.fillRect(px * scale, py * scale, scale, scale);
            if (mirror) {
              const mx = size - 1 - px;
              ctx.fillRect(mx * scale, py * scale, scale, scale);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // Grid lines (subtle)
      if (scale >= 6) {
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= size; i++) {
          ctx.beginPath();
          ctx.moveTo(i * scale + 0.5, 0);
          ctx.lineTo(i * scale + 0.5, canvasPx);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i * scale + 0.5);
          ctx.lineTo(canvasPx, i * scale + 0.5);
          ctx.stroke();
        }
      }
    } catch { /* ignore draw errors */ }
  }, [displayFrame, prevFrame, size, scale, canvasPx, onion, playing, shapeStart, shapeEnd, tool, drawColor, mirror]);

  // Write a value at (x,y), and at the horizontal mirror when symmetry is on.
  const setPixel = useCallback((x: number, y: number, value: Pixel) => {
    setFrames(prev => prev.map((f, i) => {
      if (i !== currentFrame) return f;
      const mx = size - 1 - x;
      const needA = f[y][x] !== value;
      const needB = mirror && f[y][mx] !== value;
      if (!needA && !needB) return f;
      const next = cloneFrame(f);
      next[y][x] = value;
      if (mirror) next[y][mx] = value;
      return next;
    }));
  }, [currentFrame, size, mirror]);

  const floodFill = useCallback((sx: number, sy: number, target: Pixel, replacement: Pixel) => {
    if (target === replacement) return;
    setFrames(prev => prev.map((f, i) => {
      if (i !== currentFrame) return f;
      const next = cloneFrame(f);
      const stack: Array<[number, number]> = [[sx, sy]];
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (next[y][x] !== target) continue;
        next[y][x] = replacement;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      return next;
    }));
  }, [currentFrame, size]);

  // Replace every cell of a given color across the whole frame.
  const colorReplace = useCallback((target: Pixel, replacement: Pixel) => {
    if (target === replacement) return;
    setFrames(prev => prev.map((f, i) => {
      if (i !== currentFrame) return f;
      let changed = false;
      const next = f.map(row => row.map(c => {
        if (c === target) { changed = true; return replacement; }
        return c;
      }));
      return changed ? next : f;
    }));
  }, [currentFrame]);

  // Commit a list of grid cells in one batch (used by line / rect tools).
  const commitPoints = useCallback((pts: Array<[number, number]>, value: Pixel) => {
    setFrames(prev => prev.map((f, i) => {
      if (i !== currentFrame) return f;
      const next = cloneFrame(f);
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        next[y][x] = value;
        if (mirror) next[y][size - 1 - x] = value;
      }
      return next;
    }));
  }, [currentFrame, size, mirror]);

  const cellFromEvent = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(((clientX - rect.left) / rect.width) * size);
    const py = Math.floor(((clientY - rect.top) / rect.height) * size);
    if (px < 0 || py < 0 || px >= size || py >= size) return null;
    return [px, py];
  }, [size]);

  const handleCanvasAction = useCallback((clientX: number, clientY: number, isClick: boolean) => {
    if (playing) return;
    const cell = cellFromEvent(clientX, clientY);
    if (!cell || !frame) return;
    const [px, py] = cell;

    if (tool === 'pencil') setPixel(px, py, drawColor);
    else if (tool === 'eraser') setPixel(px, py, null);
    else if (tool === 'fill' && isClick) floodFill(px, py, frame[py][px], drawColor);
    else if (tool === 'replace' && isClick) colorReplace(frame[py][px], drawColor);
    else if (tool === 'eyedropper' && isClick) {
      const c = frame[py][px];
      if (c) setColor(c);
    }
  }, [drawColor, tool, cellFromEvent, setPixel, floodFill, colorReplace, frame, playing]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (playing) return;
    if (tool === 'line' || tool === 'rect') {
      const cell = cellFromEvent(e.clientX, e.clientY);
      if (cell) { setShapeStart(cell); setShapeEnd(cell); }
      isDrawingRef.current = true;
      return;
    }
    isDrawingRef.current = true;
    handleCanvasAction(e.clientX, e.clientY, true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    if (tool === 'line' || tool === 'rect') {
      const cell = cellFromEvent(e.clientX, e.clientY);
      if (cell) setShapeEnd(cell);
      return;
    }
    handleCanvasAction(e.clientX, e.clientY, false);
  };
  const finishStroke = useCallback(() => {
    if ((tool === 'line' || tool === 'rect') && shapeStart && shapeEnd) {
      const pts = tool === 'line'
        ? linePoints(shapeStart[0], shapeStart[1], shapeEnd[0], shapeEnd[1])
        : rectPoints(shapeStart[0], shapeStart[1], shapeEnd[0], shapeEnd[1]);
      commitPoints(pts, drawColor);
    }
    setShapeStart(null);
    setShapeEnd(null);
    isDrawingRef.current = false;
  }, [tool, shapeStart, shapeEnd, commitPoints, drawColor]);

  const onMouseUp = () => { finishStroke(); };

  // Release the drawing flag on a window-level mouseup. Without this, pressing
  // on the canvas, dragging off it, and releasing outside left isDrawingRef
  // stuck true, so the next hover-over would resume painting without a click.
  // For shape tools this also commits the pending line/rect.
  useEffect(() => {
    const stop = () => { finishStroke(); };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [finishStroke]);

  // Conventional pixel-editor tool hotkeys (derived from TOOL_HOTKEY). These
  // mirror the toolbar buttons and are ignored while typing in a form control
  // so the size <select> etc. keep their native behaviour.
  useEffect(() => {
    const byKey: Record<string, Tool> = {};
    (Object.keys(TOOL_HOTKEY) as Tool[]).forEach(t => { byKey[TOOL_HOTKEY[t].toLowerCase()] = t; });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (e.key.toLowerCase() === 'm') { e.preventDefault(); setMirror(m => !m); return; }
      const next = byKey[e.key.toLowerCase()];
      if (next) {
        e.preventDefault();
        setTool(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Frames
  const addFrame = useCallback(() => {
    if (frames.length >= MAX_FRAMES) { toast('info', `Frame limit is ${MAX_FRAMES}`); return; }
    setFrames(prev => {
      const next = [...prev, makeBlankFrame(size)];
      setCurrentFrame(next.length - 1);
      return next;
    });
  }, [frames.length, size]);

  const duplicateFrame = useCallback(() => {
    if (frames.length >= MAX_FRAMES) { toast('info', `Frame limit is ${MAX_FRAMES}`); return; }
    setFrames(prev => {
      const copy = cloneFrame(prev[currentFrame] ?? prev[0]);
      const next = [...prev.slice(0, currentFrame + 1), copy, ...prev.slice(currentFrame + 1)];
      setCurrentFrame(currentFrame + 1);
      return next;
    });
  }, [frames.length, currentFrame]);

  const deleteFrame = useCallback((idx: number) => {
    setFrames(prev => {
      if (prev.length <= 1) return [makeBlankFrame(size)];
      const next = prev.filter((_, i) => i !== idx);
      setCurrentFrame(c => Math.max(0, Math.min(c, next.length - 1)));
      return next;
    });
  }, [size]);

  const clearFrame = useCallback(() => {
    setFrames(prev => prev.map((f, i) => (i === currentFrame ? makeBlankFrame(size) : f)));
  }, [currentFrame, size]);

  // Resize the grid, preserving overlapping pixels in every frame.
  const changeSize = useCallback((newSize: GridSize) => {
    if (newSize === size) return;
    setFrames(prev => prev.map(f => resizeFrame(f, size, newSize)));
    setSize(newSize);
  }, [size]);

  // Render a single frame to a freshly sized offscreen canvas at an integer
  // scale, transparent where unset. Returns the canvas (caller exports it).
  const renderFrameCanvas = useCallback((f: Frame, sc: number): HTMLCanvasElement | null => {
    const off = document.createElement('canvas');
    off.width = size * sc;
    off.height = size * sc;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = f[y][x];
        if (px) { ctx.fillStyle = px; ctx.fillRect(x * sc, y * sc, sc, sc); }
      }
    }
    return off;
  }, [size]);

  const triggerDownload = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const exportPNG = useCallback(() => {
    if (!frame) return;
    try {
      const off = renderFrameCanvas(frame, exportScale);
      if (!off) { toast('error', 'Export failed: no canvas context'); return; }
      const url = off.toDataURL('image/png');
      triggerDownload(url, `dex-pixelart-${size}x${size}-f${currentFrame + 1}@${exportScale}x.png`);
      toast('success', `Exported frame ${currentFrame + 1} at ${exportScale}x`);
    } catch {
      toast('error', 'PNG export failed');
    }
  }, [frame, size, currentFrame, exportScale, renderFrameCanvas]);

  // Export every frame as one horizontal sprite-sheet PNG -- the standard
  // pixel-art animation deliverable (game engines slice it by frame width).
  const exportSheet = useCallback(() => {
    if (frames.length === 0) return;
    try {
      const sc = exportScale;
      const off = document.createElement('canvas');
      off.width = size * sc * frames.length;
      off.height = size * sc;
      const ctx = off.getContext('2d');
      if (!ctx) { toast('error', 'Export failed: no canvas context'); return; }
      frames.forEach((f, fi) => {
        const ox = fi * size * sc;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const px = f[y][x];
            if (px) { ctx.fillStyle = px; ctx.fillRect(ox + x * sc, y * sc, sc, sc); }
          }
        }
      });
      const url = off.toDataURL('image/png');
      triggerDownload(url, `dex-pixelart-${size}x${size}-${frames.length}frames-sheet@${sc}x.png`);
      toast('success', `Exported ${frames.length}-frame sheet at ${sc}x`);
    } catch {
      toast('error', 'Sprite-sheet export failed');
    }
  }, [frames, size, exportScale]);

  // ---- Palette lock --------------------------------------------------------
  // Distinct colors used in the current frame (stable order), capped so a
  // 64x64 import can't produce an unwieldy locked set.
  const frameColors = useCallback((f: Frame): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let y = 0; y < f.length; y++) {
      for (let x = 0; x < f[y].length; x++) {
        const c = f[y][x];
        if (c && !seen.has(c)) { seen.add(c); out.push(c); if (out.length >= 64) return out; }
      }
    }
    return out;
  }, []);

  // Toggle palette-lock. Turning it on with no locked set yet seeds the lock
  // from the colors already in the frame (or the built-in palette if blank).
  const togglePaletteLock = useCallback(() => {
    setPaletteLock(on => {
      if (!on && lockedPalette.length === 0) {
        const used = frameColors(frames[currentFrame] ?? frames[0]);
        const seed = used.length > 0 ? used : PALETTE.slice(0, 8);
        setLockedPalette(seed);
        toast('info', `Palette locked to ${seed.length} color${seed.length === 1 ? '' : 's'}`);
      } else {
        toast('info', on ? 'Palette unlocked' : `Palette locked to ${lockedPalette.length} colors`);
      }
      return !on;
    });
  }, [lockedPalette.length, frameColors, frames, currentFrame]);

  // Re-seed the locked palette from the colors in the current frame.
  const lockToCurrentColors = useCallback(() => {
    const used = frameColors(frames[currentFrame] ?? frames[0]);
    if (used.length === 0) { toast('info', 'Frame is empty - nothing to lock'); return; }
    setLockedPalette(used);
    setPaletteLock(true);
    toast('success', `Locked palette to ${used.length} color${used.length === 1 ? '' : 's'}`);
  }, [frameColors, frames, currentFrame]);

  // ---- Image import --------------------------------------------------------
  // Load an image file, area-average it down to the current grid, and paint it
  // into the current frame. Transparent source pixels stay empty.
  const importImage = useCallback((file: File) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => toast('error', 'Could not read image file');
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => toast('error', 'Could not decode image');
        img.onload = () => {
          try {
            const tmp = document.createElement('canvas');
            tmp.width = size;
            tmp.height = size;
            const ctx = tmp.getContext('2d');
            if (!ctx) { toast('error', 'Import failed: no canvas context'); return; }
            // High-quality area downscale to the grid resolution.
            ctx.imageSmoothingEnabled = true;
            (ctx as any).imageSmoothingQuality = 'high';
            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            const next = makeBlankFrame(size);
            const usePalette = paletteLock && lockedPalette.length > 0;
            for (let y = 0; y < size; y++) {
              for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const a = data[i + 3];
                if (a < 32) { next[y][x] = null; continue; } // treat near-transparent as empty
                let hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
                if (usePalette) hex = nearestColor(hex, lockedPalette);
                next[y][x] = hex;
              }
            }
            setFrames(prev => prev.map((f, idx) => (idx === currentFrame ? next : f)));
            toast('success', `Imported image into ${size}x${size} frame`);
          } catch {
            toast('error', 'Image import failed');
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } catch {
      toast('error', 'Image import failed');
    }
  }, [size, currentFrame, paletteLock, lockedPalette]);

  const onImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importImage(file);
    // Reset so re-importing the same file re-fires onChange.
    e.target.value = '';
  }, [importImage]);

  // ---- Tile preview --------------------------------------------------------
  // Render the current frame repeated in a 3x3 grid so the user can judge how
  // it tiles (seamless-texture check). Empty cells get the checkerboard.
  useEffect(() => {
    if (!tilePreview) return;
    const canvas = tileCanvasRef.current;
    if (!canvas || !displayFrame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const ts = Math.max(1, Math.floor(scale / 2)); // smaller per-pixel scale for the 3x3
      const tileW = size * ts;
      ctx.clearRect(0, 0, tileW * 3, tileW * 3);
      for (let ty = 0; ty < 3; ty++) {
        for (let tx = 0; tx < 3; tx++) {
          const ox = tx * tileW;
          const oy = ty * tileW;
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const px = displayFrame[y][x];
              if (px === null) {
                ctx.fillStyle = ((x + y) & 1) ? '#2a2a30' : '#3a3a44';
              } else {
                ctx.fillStyle = px;
              }
              ctx.fillRect(ox + x * ts, oy + y * ts, ts, ts);
            }
          }
        }
      }
      // Faint borders between the 9 tiles to mark the seams.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * tileW + 0.5, 0); ctx.lineTo(i * tileW + 0.5, tileW * 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * tileW + 0.5); ctx.lineTo(tileW * 3, i * tileW + 0.5); ctx.stroke();
      }
    } catch { /* ignore draw errors */ }
  }, [tilePreview, displayFrame, size, scale]);

  const tileScale = Math.max(1, Math.floor(scale / 2));
  const tilePx = size * tileScale * 3;

  // Build a data-URL thumbnail for a single frame (1x, for the strip).
  const renderThumb = useCallback((f: Frame): string => {
    try {
      const off = renderFrameCanvas(f, 1);
      return off ? off.toDataURL('image/png') : '';
    } catch { return ''; }
  }, [renderFrameCanvas]);

  // Memoize the thumbnail strip so toDataURL only runs when the frames (or grid
  // size) actually change.
  const thumbs = useMemo(() => frames.map(renderThumb), [frames, renderThumb]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)',
    }}>
      <div style={{ ...premiumGlassToolbar, padding: 'var(--space-2) var(--space-3)', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <DexIcon name="palette" size={18} color="var(--color-text-primary)" />
          {TOOLS.map(t => (
            <button
              key={t}
              onClick={() => setTool(t)}
              // Surface the keyboard hotkey in the tooltip so the shortcut is
              // discoverable from the button the user is already looking at.
              title={`${t} (${TOOL_HOTKEY[t]})`}
              style={{
                ...toolBtn,
                background: tool === t ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color: tool === t ? '#fff' : 'var(--color-text-primary)',
                borderColor: tool === t ? 'var(--color-accent)' : 'var(--color-border-subtle)',
              }}
            >{t}</button>
          ))}
          <button
            onClick={() => setMirror(m => !m)}
            title="Horizontal symmetry (M)"
            style={{
              ...toolBtn,
              background: mirror ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: mirror ? '#fff' : 'var(--color-text-primary)',
              borderColor: mirror ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >Mirror</button>
          <button
            onClick={() => setOnion(o => !o)}
            title="Onion-skin previous frame"
            style={{
              ...toolBtn,
              background: onion ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: onion ? '#fff' : 'var(--color-text-primary)',
              borderColor: onion ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >Onion</button>
          <button
            onClick={() => setTilePreview(t => !t)}
            title="Tile preview (3x3 seamlessness check)"
            style={{
              ...toolBtn,
              background: tilePreview ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: tilePreview ? '#fff' : 'var(--color-text-primary)',
              borderColor: tilePreview ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >Tile</button>
          <button
            onClick={togglePaletteLock}
            title="Lock drawing to a fixed palette"
            style={{
              ...toolBtn,
              background: paletteLock ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: paletteLock ? '#fff' : 'var(--color-text-primary)',
              borderColor: paletteLock ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >{paletteLock ? `Locked (${lockedPalette.length})` : 'Lock'}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <select value={size} onChange={e => changeSize(Number(e.target.value) as GridSize)} style={selectStyle} title="Grid size (preserves pixels)" aria-label="Grid size">
            <option value={8}>8 x 8</option>
            <option value={16}>16 x 16</option>
            <option value={32}>32 x 32</option>
            <option value={64}>64 x 64</option>
          </select>
          <select value={exportScale} onChange={e => setExportScale(Number(e.target.value) as ExportScale)} style={selectStyle} title="PNG export scale" aria-label="PNG export scale">
            <option value={1}>1x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onImportFile}
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={toolBtn}
            title={`Import an image and downscale it into the ${size}x${size} grid`}
          >Import</button>
          <button onClick={clearFrame} style={toolBtn}>Clear</button>
          <button onClick={exportPNG} style={{ ...toolBtn, background: 'var(--color-accent-fill)', color: '#fff', border: 'none' }}>Export PNG</button>
          <button onClick={exportSheet} disabled={frames.length < 2} style={{ ...toolBtn, ...(frames.length < 2 ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} title={frames.length < 2 ? 'Add a second frame to export a sprite sheet' : 'Export all frames as one sprite-sheet PNG'}>Export Sheet</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Palette */}
        <div className="dex-liquid-glass" style={{
          width: 144, padding: 10, borderRadius: 0,
          display: 'flex', flexDirection: 'column', gap: 8,
          alignContent: 'start', overflowY: 'auto',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: 4,
                  background: c, cursor: 'pointer',
                  border: c === color ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                  padding: 0,
                }}
                title={c}
                aria-label={`Select color ${c}`}
                aria-pressed={c === color}
              />
            ))}
          </div>

          {/* Locked palette: the fixed set drawing snaps to when Lock is on. */}
          {paletteLock && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Locked</span>
                <button
                  onClick={lockToCurrentColors}
                  style={{ ...toolBtn, padding: '2px 6px', fontSize: 10 }}
                  title="Re-lock to the colors used in the current frame"
                >From Frame</button>
              </div>
              {lockedPalette.length === 0 ? (
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Empty - draw or import first</span>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {lockedPalette.map((c, i) => (
                    <button
                      key={`${c}-${i}`}
                      onClick={() => setColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: 4,
                        background: c, cursor: 'pointer',
                        border: c === drawColor ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                        padding: 0,
                      }}
                      title={c}
                      aria-label={`Locked color ${c}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canvas area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 'var(--space-4)', padding: 'var(--space-4)', overflow: 'auto',
        }}>
          <canvas
            ref={canvasRef}
            width={canvasPx}
            height={canvasPx}
            style={{
              imageRendering: 'pixelated', cursor: playing ? 'default' : 'crosshair',
              boxShadow: 'var(--pg-shadow-context)', borderRadius: 4,
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
          />
          {tilePreview && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>3x3 Tile</span>
              <canvas
                ref={tileCanvasRef}
                width={tilePx}
                height={tilePx}
                style={{
                  imageRendering: 'pixelated', borderRadius: 4,
                  boxShadow: 'var(--pg-shadow-context)',
                }}
                title="3x3 tile preview - check that edges line up seamlessly"
              />
            </div>
          )}
        </div>
      </div>

      {/* Frame strip + playback controls */}
      <div className="dex-liquid-glass" style={{
        display: 'flex', gap: 'var(--space-2)', padding: 10, borderRadius: 0,
        alignItems: 'center', overflowX: 'auto',
      }}>
        {frames.map((_f, i) => {
          const src = thumbs[i];
          const isPreviewing = playing && previewFrame === i;
          return (
            <div key={i} style={{ position: 'relative' }}>
              <button
                onClick={() => { setCurrentFrame(i); setPlaying(false); }}
                style={{
                  width: 56, height: 56, padding: 0, borderRadius: 4,
                  background: 'var(--color-bg-base, #1a1a1f)', cursor: 'pointer',
                  border: i === currentFrame
                    ? '2px solid var(--color-accent)'
                    : isPreviewing
                      ? '2px solid var(--color-success, #00e436)'
                      : '1px solid var(--color-border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
                title={`Frame ${i + 1}`}
              >
                {src && <img src={src} alt={`Frame ${i + 1}`} style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'cover' }} />}
              </button>
              <button
                onClick={() => deleteFrame(i)}
                style={{
                  position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--color-error)', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
                title={`Delete frame ${i + 1}`}
                aria-label={`Delete frame ${i + 1}`}
              ><DexIcon name="close" size={10} color="#fff" /></button>
            </div>
          );
        })}
        {frames.length < MAX_FRAMES && (
          <>
            <button onClick={addFrame} style={{ ...toolBtn, height: 56, minWidth: 48, justifyContent: 'center' }} title="Add blank frame">+ Frame</button>
            <button onClick={duplicateFrame} style={{ ...toolBtn, height: 56, minWidth: 48, justifyContent: 'center' }} title="Duplicate current frame">Dupe</button>
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button
            onClick={() => setPlaying(p => !p)}
            disabled={frames.length < 2}
            style={{
              ...toolBtn,
              background: playing ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: playing ? '#fff' : 'var(--color-text-primary)',
              ...(frames.length < 2 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
            }}
            title={frames.length < 2 ? 'Add a frame to preview animation' : 'Play / pause animation'}
          >{playing ? 'Pause' : 'Play'}</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-muted)' }} title="Frames per second">
            <input
              type="range" min={1} max={24} step={1} value={fps}
              onChange={e => setFps(Number(e.target.value))}
              style={{ width: 80 }}
              aria-label="Playback frames per second"
              aria-valuetext={`${fps} frames per second`}
            />
            {fps} fps
          </label>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: color, border: '1px solid var(--color-border-subtle)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
};

const toolBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '6px 10px', borderRadius: 10, fontSize: 12, textTransform: 'capitalize',
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
};
const selectStyle: React.CSSProperties = {
  padding: '6px var(--space-2)', borderRadius: 10, fontSize: 12,
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)',
};

export default memo(PixelArt);
