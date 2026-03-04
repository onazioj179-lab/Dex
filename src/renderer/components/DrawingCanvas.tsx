/**
 * DEX Drawing Canvas
 * Simple drawing/whiteboard tool with pen, eraser, shapes, and export
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useRef, useEffect, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text';

interface DrawingState {
  tool: Tool;
  color: string;
  lineWidth: number;
  history: ImageData[];
  historyIndex: number;
}

const COLORS = ['#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#6b7280', '#fbbf24'];
const LINE_WIDTHS = [1, 2, 3, 5, 8, 12, 20];

// ============================================================================
// COMPONENT
// ============================================================================

export const DrawingCanvas: React.FC = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<DrawingState>({
    tool: 'pen', color: '#ffffff', lineWidth: 3, history: [], historyIndex: -1,
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });

  // Resize canvas to container
  useEffect(() => {
    const resize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width: Math.floor(rect.width), height: Math.floor(rect.height - 4) });
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Initialize canvas after size set
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Fill with dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Save initial state
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setState(prev => ({ ...prev, history: [imageData], historyIndex: 0 }));
  }, [canvasSize]);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext('2d') : null;
  }, []);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const saveToHistory = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setState(prev => {
      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push(imageData);
      if (newHistory.length > 50) newHistory.shift();
      return { ...prev, history: newHistory, historyIndex: newHistory.length - 1 };
    });
  }, [getCtx]);

  const undo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex <= 0) return prev;
      const newIndex = prev.historyIndex - 1;
      const ctx = getCtx();
      if (ctx && prev.history[newIndex]) ctx.putImageData(prev.history[newIndex], 0, 0);
      return { ...prev, historyIndex: newIndex };
    });
  }, [getCtx]);

  const redo = useCallback(() => {
    setState(prev => {
      if (prev.historyIndex >= prev.history.length - 1) return prev;
      const newIndex = prev.historyIndex + 1;
      const ctx = getCtx();
      if (ctx && prev.history[newIndex]) ctx.putImageData(prev.history[newIndex], 0, 0);
      return { ...prev, historyIndex: newIndex };
    });
  }, [getCtx]);

  const clearCanvas = useCallback(() => {
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
  }, [getCtx, saveToHistory]);

  const exportCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `dex-drawing-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    setStartPos(pos);
    setIsDrawing(true);
    const ctx = getCtx();
    if (!ctx) return;

    if (state.tool === 'pen' || state.tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = state.tool === 'eraser' ? '#1a1a2e' : state.color;
      ctx.lineWidth = state.tool === 'eraser' ? state.lineWidth * 3 : state.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, [getPos, getCtx, state.tool, state.color, state.lineWidth]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) return;

    if (state.tool === 'pen' || state.tool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }, [isDrawing, getPos, getCtx, state.tool]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) { setIsDrawing(false); return; }
    const pos = getPos(e);
    const ctx = getCtx();
    if (!ctx) { setIsDrawing(false); return; }

    if (state.tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = state.color;
      ctx.lineWidth = state.lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else if (state.tool === 'rect') {
      ctx.strokeStyle = state.color;
      ctx.lineWidth = state.lineWidth;
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (state.tool === 'circle') {
      const rx = Math.abs(pos.x - startPos.x) / 2;
      const ry = Math.abs(pos.y - startPos.y) / 2;
      const cx = (startPos.x + pos.x) / 2;
      const cy = (startPos.y + pos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = state.color;
      ctx.lineWidth = state.lineWidth;
      ctx.stroke();
    } else if (state.tool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        ctx.font = `${state.lineWidth * 4 + 12}px system-ui, sans-serif`;
        ctx.fillStyle = state.color;
        ctx.fillText(text, pos.x, pos.y);
      }
    }

    setIsDrawing(false);
    setStartPos(null);
    saveToHistory();
  }, [isDrawing, startPos, getPos, getCtx, state, saveToHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolGroup}>
          {([['pen', 'Pen'], ['eraser', 'Eraser'], ['line', 'Line'], ['rect', 'Rect'], ['circle', 'Circle'], ['text', 'Text']] as [Tool, string][]).map(([tool, label]) => (
            <button key={tool} onClick={() => setState(prev => ({ ...prev, tool }))}
              style={{ ...styles.toolBtn, ...(state.tool === tool ? styles.toolBtnActive : {}) }}
              aria-label={label}>{label}</button>
          ))}
        </div>

        <div style={styles.separator} />

        {/* Colors */}
        <div style={{ display: 'flex', gap: 3 }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => setState(prev => ({ ...prev, color: c }))}
              style={{ ...styles.colorBtn, background: c, outline: state.color === c ? '2px solid #3b82f6' : 'none' }}
              aria-label={`Color ${c}`} />
          ))}
        </div>

        <div style={styles.separator} />

        {/* Line width */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {LINE_WIDTHS.map(w => (
            <button key={w} onClick={() => setState(prev => ({ ...prev, lineWidth: w }))}
              style={{ ...styles.widthBtn, ...(state.lineWidth === w ? { borderColor: '#3b82f6' } : {}) }}
              aria-label={`Width ${w}`}>
              <div style={{ width: Math.min(w + 2, 14), height: Math.min(w + 2, 14), borderRadius: '50%', background: 'currentColor' }} />
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={undo} disabled={state.historyIndex <= 0} style={styles.actionBtn} aria-label="Undo">Undo</button>
          <button onClick={redo} disabled={state.historyIndex >= state.history.length - 1} style={styles.actionBtn} aria-label="Redo">Redo</button>
          <button onClick={clearCanvas} style={styles.actionBtn} aria-label="Clear">Clear</button>
          <button onClick={exportCanvas} style={{ ...styles.actionBtn, background: '#3b82f6', color: '#fff' }} aria-label="Export">Export</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={styles.canvasContainer}>
        <canvas ref={canvasRef} width={canvasSize.width} height={canvasSize.height}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); saveToHistory(); } }}
          style={{ cursor: state.tool === 'eraser' ? 'cell' : 'crosshair', display: 'block', borderRadius: 6 }}
          aria-label="Drawing canvas" />
      </div>
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.06))', flexWrap: 'wrap' },
  toolGroup: { display: 'flex', gap: 2 },
  toolBtn: { padding: '4px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  toolBtnActive: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  separator: { width: 1, height: 20, background: 'var(--color-border, rgba(255,255,255,0.06))' },
  colorBtn: { width: 20, height: 20, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' },
  widthBtn: { width: 22, height: 22, borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtn: { padding: '4px 10px', borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 10, fontWeight: 600, cursor: 'pointer' },
  canvasContainer: { flex: 1, overflow: 'hidden', padding: 4 },
};

export default DrawingCanvas;
