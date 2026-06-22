/**
 * DEX Platform - PDF Viewer
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * PDF rendering via Electron iframe + per-document highlight annotations
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassToolbar } from '../../styles/glassMenu';
import { sendToNotes } from '../../services/sendTo';

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

/** Fit modes map to the native Chromium PDF plugin `#view=` fragment values. */
type FitMode = 'custom' | 'width' | 'page';
/** Layout maps to the plugin scroll mode (#scrollbar / view) — best-effort. */
type Layout = 'continuous' | 'single';

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300, 400];

const toast = (type: 'success' | 'error' | 'info', message: string): void => {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
};

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
  const [pageInput, setPageInput] = useState('1');
  const [fitMode, setFitMode] = useState<FitMode>('custom');
  const [layout, setLayout] = useState<Layout>('continuous');
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270 (CSS-only)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; rect: HTMLDivElement | null } | null>(null);
  // Holds the in-flight drag window listeners so an unmount mid-drag can detach them.
  const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: (e: MouseEvent) => void } | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Safety net: if the component unmounts while a highlight drag is in progress,
  // remove the global listeners and the floating preview node so nothing leaks.
  useEffect(() => () => {
    if (dragListenersRef.current) {
      window.removeEventListener('mousemove', dragListenersRef.current.move);
      window.removeEventListener('mouseup', dragListenersRef.current.up);
      dragListenersRef.current = null;
    }
    if (dragRef.current?.rect) {
      try { dragRef.current.rect.remove(); } catch { /* noop */ }
    }
    dragRef.current = null;
  }, []);

  // Keep the page-jump input in sync with the active page.
  useEffect(() => { setPageInput(String(page)); }, [page]);

  // Track the rendering stage size so rotated (90/270) pages can swap their
  // logical width/height to keep filling the viewport.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { try { ro.disconnect(); } catch { /* noop */ } };
  }, [filePath]);

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
      setZoom(100);
      setFitMode('custom');
      setLayout('continuous');
      setRotation(0);
    } catch (err) {
      console.error('[PDFViewer] open failed:', err);
      setErrorMsg('Could not open this PDF. The file may be unsupported or unavailable.');
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
      dragListenersRef.current = null;
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
    dragListenersRef.current = { move, up };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [annotateMode]);

  const clearAnnotations = useCallback(() => setAnnotations([]), []);

  // --- Zoom / fit ----------------------------------------------------------
  const applyZoom = useCallback((value: number) => {
    const clamped = Math.max(25, Math.min(400, Math.round(value)));
    setFitMode('custom');
    setZoom(clamped);
  }, []);
  const zoomIn = useCallback(() => applyZoom(zoom + 10), [applyZoom, zoom]);
  const zoomOut = useCallback(() => applyZoom(zoom - 10), [applyZoom, zoom]);
  const fitWidth = useCallback(() => setFitMode('width'), []);
  const fitPage = useCallback(() => setFitMode('page'), []);

  // --- Rotation (CSS-only; native plugin has no rotate fragment) ----------
  const rotateCW = useCallback(() => setRotation(r => (r + 90) % 360), []);
  const rotateCCW = useCallback(() => setRotation(r => (r + 270) % 360), []);

  // --- Page jump -----------------------------------------------------------
  const commitPageInput = useCallback(() => {
    try {
      const n = parseInt(pageInput, 10);
      if (Number.isFinite(n) && n >= 1) setPage(n);
      else setPageInput(String(page));
    } catch { setPageInput(String(page)); }
  }, [pageInput, page]);

  // --- Send selected text to Notes ----------------------------------------
  // The PDF itself renders inside a cross-origin file:// iframe whose selection
  // is not reachable, but text selected anywhere in this app's own document
  // (e.g. copied out of the PDF into the page) can be forwarded.
  const sendSelectionToNotes = useCallback(async () => {
    try {
      const sel = window.getSelection?.()?.toString().trim() || '';
      if (!sel) {
        toast('info', 'Select some text first, then send to Notes');
        return;
      }
      await sendToNotes(sel, fileName ? `From ${fileName}` : undefined);
    } catch (err) {
      console.error('[PDFViewer] send to notes failed:', err);
      toast('error', 'Could not send selection to Notes');
    }
  }, [fileName]);

  // Build the native PDF-plugin URL fragment. The Chromium PDF viewer honours
  // #page=, #zoom= and #view=FitH|Fit; rotation is applied via CSS instead.
  const buildFragment = useCallback((): string => {
    const parts: string[] = [`page=${Math.max(1, page)}`];
    if (fitMode === 'width') parts.push('view=FitH');
    else if (fitMode === 'page') parts.push('view=Fit');
    else parts.push(`zoom=${zoom}`);
    // Scroll/layout hint: the plugin uses view=FitV for single-page fitting.
    if (layout === 'single' && fitMode !== 'page') parts.push('view=FitV');
    return parts.join('&');
  }, [page, zoom, fitMode, layout]);

  const fileUrl = filePath
    ? `file://${filePath.replace(/\\/g, '/')}#${buildFragment()}`
    : '';

  const rotated = rotation % 180 !== 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)',
    }}>
      <div style={{ ...premiumGlassToolbar, padding: 'var(--space-2) var(--space-3)', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <DexIcon name="file-text" size={18} color="var(--color-text-primary)" />
          <button onClick={openPdf} style={btnPrimary}>Open PDF</button>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 6, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName || 'No document'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Page navigation + jump-to-page */}
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!filePath} style={btn} title="Previous page" aria-label="Previous page">Prev</button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              value={pageInput}
              onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={commitPageInput}
              onKeyDown={e => { if (e.key === 'Enter') { commitPageInput(); (e.target as HTMLInputElement).blur(); } }}
              disabled={!filePath}
              aria-label="Page number"
              title="Jump to page"
              style={{
                width: 44, padding: '4px 6px', textAlign: 'center', borderRadius: 4, fontSize: 12,
                background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border-subtle)',
              }}
            />
          </span>
          <button onClick={() => setPage(p => p + 1)} disabled={!filePath} style={btn} title="Next page" aria-label="Next page">Next</button>
          <span style={{ width: 8 }} />

          {/* Zoom: out / preset select / in */}
          <button onClick={zoomOut} disabled={!filePath} style={btn} title="Zoom out" aria-label="Zoom out">&#8722;</button>
          <select
            value={fitMode === 'custom' ? String(zoom) : fitMode}
            onChange={e => {
              const v = e.target.value;
              if (v === 'width') fitWidth();
              else if (v === 'page') fitPage();
              else applyZoom(parseInt(v, 10));
            }}
            disabled={!filePath}
            aria-label="Zoom level"
            title="Zoom level"
            style={{
              fontSize: 12, padding: '5px 6px', borderRadius: 4,
              background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)', cursor: 'pointer',
            }}
          >
            {fitMode === 'custom' && !ZOOM_PRESETS.includes(zoom) && (
              <option value={String(zoom)}>{zoom}%</option>
            )}
            {ZOOM_PRESETS.map(z => <option key={z} value={String(z)}>{z}%</option>)}
            <option value="width">Fit width</option>
            <option value="page">Fit page</option>
          </select>
          <button onClick={zoomIn} disabled={!filePath} style={btn} title="Zoom in" aria-label="Zoom in">+</button>
          <span style={{ width: 8 }} />

          {/* Rotate */}
          <button onClick={rotateCCW} disabled={!filePath} style={btn} title="Rotate counter-clockwise" aria-label="Rotate counter-clockwise">&#8634;</button>
          <button onClick={rotateCW} disabled={!filePath} style={btn} title="Rotate clockwise" aria-label="Rotate clockwise">&#8635;</button>
          <span style={{ width: 8 }} />

          {/* Single / continuous layout toggle */}
          <button
            onClick={() => setLayout(l => (l === 'continuous' ? 'single' : 'continuous'))}
            disabled={!filePath}
            style={btn}
            title="Toggle single / continuous layout"
            aria-label="Toggle layout"
          >{layout === 'continuous' ? 'Continuous' : 'Single'}</button>
          <span style={{ width: 8 }} />

          <button onClick={sendSelectionToNotes} disabled={!filePath} style={btn} title="Send selected text to Notes" aria-label="Send selected text to Notes">To Notes</button>
          <button
            onClick={() => setAnnotateMode(m => !m)}
            disabled={!filePath}
            aria-pressed={annotateMode}
            aria-label="Toggle highlight annotation mode"
            title="Toggle highlight annotation mode"
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

      <div ref={stageRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-bg-base, #1a1a1f)' }}>
        {filePath ? (
          <>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              <iframe
                key={fileUrl}
                src={fileUrl}
                title="PDF document"
                style={{
                  // When rotated 90/270 swap the logical width/height (using the
                  // measured stage size) so the rotated page still fills the view.
                  width: rotated && stageSize.h ? stageSize.h : '100%',
                  height: rotated && stageSize.w ? stageSize.w : '100%',
                  border: 'none',
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                  pointerEvents: annotateMode ? 'none' : 'auto',
                }}
              />
            </div>
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
            height: '100%', color: 'var(--color-text-muted)', gap: 'var(--space-3)',
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
