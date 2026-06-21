/**
 * DEX Platform - Pixel Art Editor
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * NES-style pixel grid editor with frames, palette, and PNG export
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassToolbar } from '../../styles/glassMenu';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';
type GridSize = 16 | 32 | 64;
type Pixel = string | null;
type Frame = Pixel[][]; // [y][x]

interface PersistedState {
  size: GridSize;
  frames: Frame[];
  currentFrame: number;
  color: string;
  tool: Tool;
}

const STORAGE_KEY = 'dex-pixelart-state';
const MAX_FRAMES = 8;

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
  eyedropper: 'I',
};

const makeBlankFrame = (size: GridSize): Frame =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null as Pixel));

const cloneFrame = (f: Frame): Frame => f.map(row => row.slice());

const PixelArt: React.FC = () => {
  const [size, setSize] = useState<GridSize>(32);
  const [frames, setFrames] = useState<Frame[]>(() => [makeBlankFrame(32)]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [color, setColor] = useState<string>(PALETTE[8]);
  const [tool, setTool] = useState<Tool>('pencil');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    const state: PersistedState = { size, frames, currentFrame, color, tool };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [size, frames, currentFrame, color, tool]);

  const frame = frames[currentFrame] ?? frames[0];

  // Compute scale (auto-fit to ~480px)
  const scale = useMemo(() => Math.max(2, Math.floor(480 / size)), [size]);
  const canvasPx = size * scale;

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasPx, canvasPx);
    // Checker pattern for transparent
    const checkSize = scale;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = frame[y][x];
        if (px === null) {
          ctx.fillStyle = ((x + y) & 1) ? '#2a2a30' : '#3a3a44';
          ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
        } else {
          ctx.fillStyle = px;
          ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
        }
      }
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
  }, [frame, size, scale, canvasPx]);

  const setPixel = useCallback((x: number, y: number, value: Pixel) => {
    setFrames(prev => prev.map((f, i) => {
      if (i !== currentFrame) return f;
      if (f[y][x] === value) return f;
      const next = cloneFrame(f);
      next[y][x] = value;
      return next;
    }));
  }, [currentFrame]);

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

  const handleCanvasAction = useCallback((clientX: number, clientY: number, isClick: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor(((clientX - rect.left) / rect.width) * size);
    const py = Math.floor(((clientY - rect.top) / rect.height) * size);
    if (px < 0 || py < 0 || px >= size || py >= size) return;

    if (tool === 'pencil') setPixel(px, py, color);
    else if (tool === 'eraser') setPixel(px, py, null);
    else if (tool === 'fill' && isClick) floodFill(px, py, frame[py][px], color);
    else if (tool === 'eyedropper' && isClick) {
      const c = frame[py][px];
      if (c) setColor(c);
    }
  }, [color, tool, size, setPixel, floodFill, frame]);

  const onMouseDown = (e: React.MouseEvent) => {
    isDrawingRef.current = true;
    handleCanvasAction(e.clientX, e.clientY, true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    handleCanvasAction(e.clientX, e.clientY, false);
  };
  const onMouseUp = () => { isDrawingRef.current = false; };

  // Release the drawing flag on a window-level mouseup. Without this, pressing
  // on the canvas, dragging off it, and releasing outside left isDrawingRef
  // stuck true, so the next hover-over would resume painting without a click.
  useEffect(() => {
    const stop = () => { isDrawingRef.current = false; };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

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
    if (frames.length >= MAX_FRAMES) return;
    setFrames(prev => {
      const copy = cloneFrame(prev[currentFrame]);
      const next = [...prev, copy];
      setCurrentFrame(next.length - 1);
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

  const changeSize = useCallback((newSize: GridSize) => {
    if (newSize === size) return;
    setSize(newSize);
    setFrames([makeBlankFrame(newSize)]);
    setCurrentFrame(0);
  }, [size]);

  const exportPNG = useCallback(() => {
    if (!frame) return;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = frame[y][x];
        if (px) {
          ctx.fillStyle = px;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    const url = off.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `dex-pixelart-${size}x${size}-f${currentFrame + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [frame, size, currentFrame]);

  // Export every frame as one horizontal sprite-sheet PNG -- the standard
  // pixel-art animation deliverable (game engines slice it by frame width).
  // Native canvas toDataURL, so it's correct by construction (no codec needed).
  const exportSheet = useCallback(() => {
    if (frames.length === 0) return;
    const off = document.createElement('canvas');
    off.width = size * frames.length;
    off.height = size;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    frames.forEach((f, fi) => {
      const ox = fi * size;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = f[y][x];
          if (px) { ctx.fillStyle = px; ctx.fillRect(ox + x, y, 1, 1); }
        }
      }
    });
    const url = off.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `dex-pixelart-${size}x${size}-${frames.length}frames-sheet.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [frames, size]);

  // Build a data-URL thumbnail for a single frame.
  const renderThumb = useCallback((f: Frame): string => {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const ctx = off.getContext('2d');
    if (!ctx) return '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = f[y][x];
        if (px) { ctx.fillStyle = px; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return off.toDataURL('image/png');
  }, [size]);

  // Memoize the thumbnail strip so toDataURL only runs when the frames (or grid
  // size) actually change. Previously every render - including tool/color
  // switches that touch no pixels - rebuilt an offscreen canvas per frame.
  const thumbs = useMemo(() => frames.map(renderThumb), [frames, renderThumb]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)',
    }}>
      <div style={{ ...premiumGlassToolbar, padding: 'var(--space-2) var(--space-3)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DexIcon name="palette" size={18} color="var(--color-text-primary)" />
          {(['pencil', 'eraser', 'fill', 'eyedropper'] as Tool[]).map(t => (
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select value={size} onChange={e => changeSize(Number(e.target.value) as GridSize)} style={selectStyle}>
            <option value={16}>16 x 16</option>
            <option value={32}>32 x 32</option>
            <option value={64}>64 x 64</option>
          </select>
          <button onClick={clearFrame} style={toolBtn}>Clear</button>
          <button onClick={exportPNG} style={{ ...toolBtn, background: 'var(--color-accent)', color: '#fff', border: 'none' }}>Export PNG</button>
          <button onClick={exportSheet} disabled={frames.length < 2} style={{ ...toolBtn, ...(frames.length < 2 ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} title={frames.length < 2 ? 'Add a second frame to export a sprite sheet' : 'Export all frames as one sprite-sheet PNG'}>Export Sheet</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Palette */}
        <div style={{
          width: 144, padding: 10, borderRight: '1px solid var(--color-border-subtle)',
          background: 'var(--color-bg-elevated)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          alignContent: 'start',
        }}>
          {PALETTE.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 28, height: 28, borderRadius: 3,
                background: c, cursor: 'pointer',
                border: c === color ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                padding: 0,
              }}
              title={c}
            />
          ))}
        </div>

        {/* Canvas area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--space-4)', overflow: 'auto',
        }}>
          <canvas
            ref={canvasRef}
            width={canvasPx}
            height={canvasPx}
            style={{
              imageRendering: 'pixelated', cursor: 'crosshair',
              boxShadow: 'var(--pg-shadow-context)', borderRadius: 3,
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>
      </div>

      {/* Frame strip */}
      <div style={{
        display: 'flex', gap: 'var(--space-2)', padding: 10,
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-elevated)', alignItems: 'center', overflowX: 'auto',
      }}>
        {frames.map((_f, i) => {
          const src = thumbs[i];
          return (
            <div key={i} style={{ position: 'relative' }}>
              <button
                onClick={() => setCurrentFrame(i)}
                style={{
                  width: 56, height: 56, padding: 0, borderRadius: 3,
                  background: 'var(--color-bg-base, #1a1a1f)', cursor: 'pointer',
                  border: i === currentFrame ? '2px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
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
          <button onClick={addFrame} style={{
            ...toolBtn, height: 56, minWidth: 56, justifyContent: 'center',
          }}>+ Frame</button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ width: 18, height: 18, borderRadius: 3, background: color, border: '1px solid var(--color-border-subtle)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{color}</span>
        </div>
      </div>
    </div>
  );
};

const toolBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '6px 10px', borderRadius: 4, fontSize: 12, textTransform: 'capitalize',
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
};
const selectStyle: React.CSSProperties = {
  padding: '6px var(--space-2)', borderRadius: 4, fontSize: 12,
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)',
};

export default memo(PixelArt);
