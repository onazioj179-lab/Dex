/**
 * DEX Platform - PDF Viewer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * PDF rendering via Electron iframe + per-document highlight annotations
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassToolbar } from '../../styles/glassMenu';

interface Annotation {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  note?: string;
}

interface OpenDialogResult {
  canceled?: boolean;
  filePaths?: string[];
}

const HIGHLIGHT_COLOR = 'rgba(255, 224, 102, 0.45)';

const sha1Hex = async (input: string): Promise<string> => {
  try {
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-1', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback non-crypto hash
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h) + input.charCodeAt(i);
      h |= 0;
    }
    return `fallback-${Math.abs(h).toString(16)}`;
  }
};

const storageKey = (digest: string) => `dex-pdf-annotations-${digest}`;

const PDFViewer: React.FC = () => {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [docKey, setDocKey] = useState<string | null>(null);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; rect: HTMLDivElement | null } | null>(null);

  // Load annotations when document changes
  useEffect(() => {
    if (!docKey) { setAnnotations([]); return; }
    try {
      const raw = localStorage.getItem(storageKey(docKey));
      setAnnotations(raw ? (JSON.parse(raw) as Annotation[]) : []);
    } catch { setAnnotations([]); }
  }, [docKey]);

  // Persist annotations
  useEffect(() => {
    if (!docKey) return;
    try { localStorage.setItem(storageKey(docKey), JSON.stringify(annotations)); } catch { /* ignore */ }
  }, [annotations, docKey]);

  const openPdf = useCallback(async () => {
    setErrorMsg(null);
    try {
      // Try files:openDialog first; fall back to dialog:showOpenDialog
      let result: OpenDialogResult | undefined;
      try {
        result = await window.electron?.invoke?.<OpenDialogResult>(
          'files:openDialog',
          { filters: [{ name: 'PDF', extensions: ['pdf'] }], properties: ['openFile'] },
        );
      } catch { /* try fallback */ }
      if (!result || (!result.filePaths && !result.canceled)) {
        result = await window.electron?.invoke?.<OpenDialogResult>(
          'dialog:showOpenDialog',
          { filters: [{ name: 'PDF', extensions: ['pdf'] }], properties: ['openFile'] },
        );
      }
      if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) return;
      const fp = result.filePaths[0];
      const name = fp.replace(/\\/g, '/').split('/').pop() || fp;
      const digest = await sha1Hex(fp);
      setFilePath(fp);
      setFileName(name);
      setDocKey(digest);
      setPage(1);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Annotation drag (rectangle highlight)
  const onOverlayMouseDown = useCallback((e: React.MouseEvent) => {
    if (!annotateMode || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    const previewEl = document.createElement('div');
    previewEl.style.position = 'absolute';
    previewEl.style.left = `${startX}px`;
    previewEl.style.top = `${startY}px`;
    previewEl.style.background = HIGHLIGHT_COLOR;
    previewEl.style.pointerEvents = 'none';
    previewEl.style.border = '1px dashed rgba(0,0,0,0.4)';
    overlayRef.current.appendChild(previewEl);

    dragRef.current = { startX, startY, rect: previewEl };

    const move = (mv: MouseEvent) => {
      const st = dragRef.current;
      if (!st || !st.rect || !overlayRef.current) return;
      const r = overlayRef.current.getBoundingClientRect();
      const cx = mv.clientX - r.left;
      const cy = mv.clientY - r.top;
      const x = Math.min(st.startX, cx);
      const y = Math.min(st.startY, cy);
      const w = Math.abs(cx - st.startX);
      const h = Math.abs(cy - st.startY);
      st.rect.style.left = `${x}px`;
      st.rect.style.top = `${y}px`;
      st.rect.style.width = `${w}px`;
      st.rect.style.height = `${h}px`;
    };
    const up = (uv: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const st = dragRef.current;
      dragRef.current = null;
      if (!st || !overlayRef.current) return;
      const r = overlayRef.current.getBoundingClientRect();
      const cx = uv.clientX - r.left;
      const cy = uv.clientY - r.top;
      const x = Math.min(st.startX, cx);
      const y = Math.min(st.startY, cy);
      const w = Math.abs(cx - st.startX);
      const h = Math.abs(cy - st.startY);
      if (st.rect) st.rect.remove();
      if (w > 6 && h > 6) {
        setAnnotations(prev => [...prev, { x, y, width: w, height: h, color: HIGHLIGHT_COLOR }]);
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [annotateMode]);

  const clearAnnotations = useCallback(() => setAnnotations([]), []);

  const fileUrl = filePath ? `file://${filePath.replace(/\\/g, '/')}#page=${page}&zoom=${zoom}` : '';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-system)',
    }}>
      <div style={{ ...premiumGlassToolbar, padding: '8px 12px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DexIcon name="file-text" size={18} color="var(--color-text-primary)" />
          <button onClick={openPdf} style={btnPrimary}>Open PDF</button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 6, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName || 'No document'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!filePath} style={btn}>Prev</button>
          <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>{page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={!filePath} style={btn}>Next</button>
          <span style={{ width: 8 }} />
          <button onClick={() => setZoom(z => Math.max(25, z - 10))} disabled={!filePath} style={btn}>-</button>
          <span style={{ fontSize: 12, minWidth: 44, textAlign: 'center' }}>{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(400, z + 10))} disabled={!filePath} style={btn}>+</button>
          <span style={{ width: 8 }} />
          <button
            onClick={() => setAnnotateMode(m => !m)}
            disabled={!filePath}
            style={{
              ...btn,
              background: annotateMode ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
              color: annotateMode ? '#fff' : 'var(--color-text-primary)',
              borderColor: annotateMode ? 'var(--color-accent)' : 'var(--color-border-subtle)',
            }}
          >Annotate</button>
          {annotations.length > 0 && (
            <button onClick={clearAnnotations} style={btn}>Clear ({annotations.length})</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1a1a1f' }}>
        {filePath ? (
          <>
            <iframe
              src={fileUrl}
              title="PDF document"
              style={{
                width: '100%', height: '100%', border: 'none',
                pointerEvents: annotateMode ? 'none' : 'auto',
              }}
            />
            <div
              ref={overlayRef}
              onMouseDown={onOverlayMouseDown}
              style={{
                position: 'absolute', inset: 0,
                pointerEvents: annotateMode ? 'auto' : 'none',
                cursor: annotateMode ? 'crosshair' : 'default',
              }}
            >
              {annotations.map((a, i) => (
                <div
                  key={i}
                  title={a.note || 'Highlight'}
                  style={{
                    position: 'absolute', left: a.x, top: a.y, width: a.width, height: a.height,
                    background: a.color, pointerEvents: 'none',
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--color-text-muted)', gap: 12,
          }}>
            <DexIcon name="file-text" size={56} color="var(--color-text-muted)" />
            <span style={{ fontSize: 13 }}>Open a PDF to begin</span>
            {errorMsg && <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{errorMsg}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

const btn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 4, fontSize: 12,
  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  ...btn, background: 'var(--color-accent)', color: '#fff', border: 'none',
};

export default memo(PDFViewer);
