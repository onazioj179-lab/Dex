/**
 * DEX Platform - Canvas
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Clean drawing canvas - ready for use
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { useGlobalUndo } from '../../services/undoManager';
import { useAutoSave, loadAutoSave, clearAutoSave } from '../../utils/useAutoSave';

interface Point {
  x: number;
  y: number;
}

type Tool = 'pen' | 'eraser' | 'highlighter' | 'line' | 'rectangle' | 'circle';
const SHAPE_TOOLS: ReadonlyArray<Tool> = ['line', 'rectangle', 'circle'];
const isShapeTool = (t: Tool): boolean => SHAPE_TOOLS.includes(t);

// Draw a shape's PATH only (the caller sets the stroke style + calls stroke()).
// Rectangle uses the drag bounding box; circle is centered on the start point
// with radius = drag distance; line connects start->end.
function drawShapePath(ctx: CanvasRenderingContext2D, tool: Tool, a: Point, b: Point): void {
  ctx.beginPath();
  if (tool === 'rectangle') {
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (tool === 'circle') {
    ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  tool: Tool;
}

const COLORS = [
  '#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];

const BRUSH_SIZES = [2, 4, 8, 12, 20, 32];

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live ref to the in-progress stroke so the real-time draw() can read the
  // previous point synchronously within the same pointer event, and so a drag
  // never triggers a per-move React re-render (the ref is the only source of
  // truth for the live stroke until it is committed to `strokes` on release).
  const currentStrokeRef = useRef<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [bgColor, setBgColor] = useState('#FFFFFF');

  // Shared, bounded undo/redo (replaces the old unbounded Stroke[][] stack that
  // copied every prior stroke on each action — O(n^2) memory). Canvas is the first
  // adopter of the shared GlobalUndoManager (100-deep cap, Ctrl+Z / Ctrl+Shift+Z).
  const { push: pushUndo, undo, redo, canUndo, canRedo, clear: clearHistory } = useGlobalUndo('Canvas');

  // Own the shared stack for this app's lifetime: start fresh on mount and drop
  // our commands on unmount so stale closures never fire on an unmounted canvas.
  useEffect(() => {
    clearHistory();
    return () => clearHistory();
  }, [clearHistory]);

  // --- Crash recovery -----------------------------------------------------
  // Canvas is the first adopter of the shared recovery layer as well as the
  // shared undo engine. The drawing is a vector stroke list, so autosave
  // persists it losslessly (and far more cheaply than a PNG snapshot) and
  // restores it after a crash or accidental close. getData reads through a ref
  // so the autosave subscription stays stable across every stroke.
  const recoveryRef = useRef<{ strokes: Stroke[]; bgColor: string }>({ strokes, bgColor });
  recoveryRef.current = { strokes, bgColor };
  const getRecoveryData = useCallback(() => recoveryRef.current, []);
  useAutoSave('canvas', getRecoveryData, strokes.length > 0, 15_000);

  // Restore the last auto-saved drawing once on mount.
  useEffect(() => {
    const saved = loadAutoSave<{ strokes: Stroke[]; bgColor: string }>('canvas');
    if (saved && Array.isArray(saved.strokes) && saved.strokes.length > 0) {
      setStrokes(saved.strokes);
      if (typeof saved.bgColor === 'string') setBgColor(saved.bgColor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the CSS (layout) size separately from the backing-store size so
  // drawing math stays in CSS pixels while the canvas renders at device
  // resolution. Without this, getBoundingClientRect-based pointer coords would
  // not match canvas.width/height on HiDPI screens.
  const cssSizeRef = useRef({ w: 0, h: 0 });

  // Redraw canvas (declared before the resize effect that depends on it).
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = cssSizeRef.current;

    // Clear and fill background using CSS-pixel extents (ctx is DPR-scaled).
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'eraser') {
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = stroke.size * 3;
        ctx.globalAlpha = 1;
      } else if (stroke.tool === 'highlighter') {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size * 2;
        ctx.globalAlpha = 0.3;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.globalAlpha = 1;
      }

      if (isShapeTool(stroke.tool)) {
        drawShapePath(ctx, stroke.tool, stroke.points[0], stroke.points[stroke.points.length - 1]);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    });

    ctx.globalAlpha = 1;
  }, [strokes, bgColor]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Size the canvas to its container at device resolution. Setting width/height
  // in device pixels and scaling the context by DPR keeps strokes crisp on
  // HiDPI displays; ResizeObserver also catches layout-driven size changes
  // (split panes, window chrome) that a plain window 'resize' listener misses.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const applySize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      cssSizeRef.current = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      // Reset any prior transform before applying the new DPR scale so repeated
      // resizes don't compound the scale factor.
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [redraw]);

  // Keyboard shortcuts already advertised in the toolbar tooltips (Ctrl+Z /
  // Ctrl+Shift+Z) plus the conventional Escape-to-cancel and Ctrl+Y redo.
  // Previously the tooltips promised shortcuts that were never wired up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && isDrawing) {
        // Abandon the in-progress stroke without committing it to history.
        e.preventDefault();
        setIsDrawing(false);
        currentStrokeRef.current = [];
        redraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, isDrawing, redraw]);

  // Get point from event
  const getPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const point = getPoint(e);
    // The ref is the single source of truth for the live stroke; intentionally
    // not mirrored into React state since nothing renders it and a setState per
    // pointer-move would re-reconcile the whole tree on every mouse event.
    currentStrokeRef.current = [point];
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    const point = getPoint(e);
    // Read the previous point from the ref (synchronous) rather than the state
    // array, which lags one event behind and would draw the live segment from
    // the wrong origin.
    const prevPoints = currentStrokeRef.current;
    const lastPoint = prevPoints[prevPoints.length - 1];

    // Shapes: keep the START point fixed and update the END; redraw committed
    // strokes, then draw a live preview of the shape (it morphs as you drag).
    if (isShapeTool(tool)) {
      const start = prevPoints[0] || point;
      currentStrokeRef.current = [start, point];
      const shapeCanvas = canvasRef.current;
      const shapeCtx = shapeCanvas?.getContext('2d');
      if (!shapeCtx) return;
      redraw();
      shapeCtx.lineCap = 'round';
      shapeCtx.lineJoin = 'round';
      shapeCtx.strokeStyle = color;
      shapeCtx.lineWidth = brushSize;
      shapeCtx.globalAlpha = 1;
      drawShapePath(shapeCtx, tool, start, point);
      shapeCtx.stroke();
      return;
    }

    currentStrokeRef.current = [...prevPoints, point];

    // Draw current stroke in real-time
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPoint) return;

    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'eraser') {
      ctx.strokeStyle = bgColor;
      ctx.lineWidth = brushSize * 3;
      ctx.globalAlpha = 1;
    } else if (tool === 'highlighter') {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 2;
      ctx.globalAlpha = 0.3;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.globalAlpha = 1;
    }

    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const drawn = currentStrokeRef.current;
    if (drawn.length > 0) {
      const newStroke: Stroke = {
        points: drawn,
        color,
        size: brushSize,
        tool,
      };
      const before = strokes;
      const after = [...strokes, newStroke];
      setStrokes(after);
      pushUndo('Draw stroke', () => setStrokes(after), () => setStrokes(before));
    }
    currentStrokeRef.current = [];
  };

  const clear = () => {
    if (strokes.length === 0) return;
    const before = strokes;
    setStrokes([]);
    // Drop the recovery snapshot too so a cleared canvas doesn't come back on
    // next open (undo still restores `before` within the session).
    clearAutoSave('canvas');
    pushUndo('Clear canvas', () => setStrokes([]), () => setStrokes(before));
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `canvas-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        {/* Tools */}
        <div style={s.toolGroup}>
          {(['pen', 'highlighter', 'eraser'] as const).map(t => (
            <button
              key={t}
              style={{ ...s.toolBtn, ...(tool === t ? s.toolBtnActive : {}) }}
              onClick={() => setTool(t)}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
            >
              <DexIcon name={t === 'pen' ? 'edit' : t === 'eraser' ? 'delete' : 'marker'} size={16} />
            </button>
          ))}
        </div>

        <div style={s.divider} />

        {/* Shapes */}
        <div style={s.toolGroup}>
          {(['line', 'rectangle', 'circle'] as const).map(t => (
            <button
              key={t}
              style={{ ...s.toolBtn, ...(tool === t ? s.toolBtnActive : {}) }}
              onClick={() => setTool(t)}
              title={t.charAt(0).toUpperCase() + t.slice(1)}
              aria-label={t}
            >
              {t === 'line' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>
              ) : t === 'rectangle' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="6" width="16" height="12" rx="1" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /></svg>
              )}
            </button>
          ))}
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
            />
          ))}
        </div>

        <div style={s.divider} />

        {/* Brush Size */}
        <div style={s.sizeGroup}>
          {BRUSH_SIZES.map(size => (
            <button
              key={size}
              style={{ ...s.sizeBtn, ...(brushSize === size ? s.sizeBtnActive : {}) }}
              onClick={() => setBrushSize(size)}
              title={`${size}px`}
            >
              <span style={{ width: Math.min(size, 14), height: Math.min(size, 14), borderRadius: '50%', background: 'currentColor' }} />
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={s.actionGroup}>
          <button style={s.actionBtn} onClick={() => undo()} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <DexIcon name="undo" size={16} />
          </button>
          <button style={s.actionBtn} onClick={() => redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <DexIcon name="redo" size={16} />
          </button>
          <button style={s.actionBtn} onClick={clear} title="Clear">
            <DexIcon name="trash" size={16} />
          </button>
          <button style={{ ...s.actionBtn, ...s.saveBtn }} onClick={saveImage} title="Save">
            <DexIcon name="download" size={16} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={s.canvasContainer}>
        <canvas
          ref={canvasRef}
          style={s.canvas}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
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
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--color-bg-elevated)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  toolGroup: {
    display: 'flex',
    gap: 2,
  },
  toolBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  toolBtnActive: {
    background: 'var(--color-accent)',
    color: '#fff',
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
    maxWidth: 150,
  },
  colorBtn: {
    width: 20,
    height: 20,
    borderRadius: 3,
    cursor: 'pointer',
    transition: 'transform 0.1s ease',
  },
  sizeGroup: {
    display: 'flex',
    gap: 2,
  },
  sizeBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
  },
  sizeBtnActive: {
    background: 'var(--color-accent-soft, rgba(74, 158, 255, 0.15))',
    color: 'var(--color-accent)',
  },
  actionGroup: {
    display: 'flex',
    gap: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  saveBtn: {
    background: 'var(--color-accent)',
    color: '#fff',
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
    cursor: 'crosshair',
  },
};

export default memo(Canvas);
