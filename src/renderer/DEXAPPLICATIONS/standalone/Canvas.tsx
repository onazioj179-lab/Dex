/**
 * DEX Platform - Canvas
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Clean drawing canvas - ready for use
 */
import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { useGlobalUndo } from '../../services/undoManager';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  tool: 'pen' | 'eraser' | 'highlighter';
}

const COLORS = [
  '#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#00C7BE', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55',
];

const BRUSH_SIZES = [2, 4, 8, 12, 20, 32];

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlighter'>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
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

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to container
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
        redraw();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
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

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });

    ctx.globalAlpha = 1;
  }, [strokes, bgColor]);

  useEffect(() => {
    redraw();
  }, [redraw]);

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
    setCurrentStroke([point]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    
    const point = getPoint(e);
    setCurrentStroke(prev => [...prev, point]);

    // Draw current stroke in real-time
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (currentStroke.length > 0) {
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

      const lastPoint = currentStroke[currentStroke.length - 1];
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (currentStroke.length > 0) {
      const newStroke: Stroke = {
        points: currentStroke,
        color,
        size: brushSize,
        tool,
      };
      const before = strokes;
      const after = [...strokes, newStroke];
      setStrokes(after);
      pushUndo('Draw stroke', () => setStrokes(after), () => setStrokes(before));
    }
    setCurrentStroke([]);
  };

  const clear = () => {
    if (strokes.length === 0) return;
    const before = strokes;
    setStrokes([]);
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
    gap: 8,
    padding: '8px 12px',
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
