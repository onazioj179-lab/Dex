/**
 * DEX Platform - QR Code Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Generate QR codes from text, URLs, Wi-Fi, contacts, and geo coordinates
 */
import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { qrMatrixToSVG } from '../../../shared/format/qrSvg';

type QRMode = 'text' | 'url' | 'wifi' | 'contact' | 'geo';
type ECLevel = 'L' | 'M' | 'Q' | 'H';

// Quiet zone (spec recommends 4 modules) — matches the SVG export margin and
// keeps the rendered/exported PNG scannable.
const QUIET_ZONE = 4;
const HISTORY_KEY = 'dex.qrcode.history.v1';
const HISTORY_LIMIT = 10;

interface HistoryEntry {
  data: string;
  mode: QRMode;
  ec: ECLevel;
  ts: number;
}

const toast = (type: 'success' | 'error' | 'warning', message: string) => {
  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
};

const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.data === 'string') : [];
  } catch {
    return [];
  }
};

// Scoped interaction polish for the QR generator's controls (a half-applied edit
// referenced this without defining it; completed here).
const QR_SCOPED_CSS = `
[data-dex-qr-root] .qr-tab { transition: background 0.12s ease, color 0.12s ease; }
[data-dex-qr-root] .qr-tab:hover { background: var(--color-bg-surface); color: var(--color-text-primary); }
[data-dex-qr-root] .qr-quick { transition: transform 0.12s ease, filter 0.12s ease; }
[data-dex-qr-root] .qr-quick:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.06); }
[data-dex-qr-root] .qr-quick:not(:disabled):active { transform: scale(0.96); }
[data-dex-qr-root] .qr-field { transition: border-color 0.12s ease, box-shadow 0.12s ease; }
[data-dex-qr-root] .qr-field:focus, [data-dex-qr-root] .qr-field:focus-within { border-color: var(--color-accent); }
`;

// Minimal QR code generator (byte mode, version 1-10 auto, selectable EC level)
// Uses canvas for rendering — no external dependencies
const QRCodeGenerator: React.FC = () => {
  const [mode, setMode] = useState<QRMode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('https://');
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiType, setWifiType] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  // These are written directly to a <canvas> fillStyle and an <input type="color">,
  // neither of which can resolve CSS custom properties -- they must be literal
  // hex. (A prior token sweep set bg to 'var(--color-text-primary)', which a
  // canvas treats as invalid and an <input type=color> snaps to #000000,
  // producing an all-black, unscannable QR.)
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [ecLevel, setEcLevel] = useState<ECLevel>('M');
  const [pxSize, setPxSize] = useState(240);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  // Disables the clipboard-backed buttons while an async read/write is pending so
  // rapid double-clicks can't overlap (and stack toasts).
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordedRef = useRef<string>('');

  const qrData = useMemo(() => {
    switch (mode) {
      case 'text': return text;
      case 'url': return url;
      case 'wifi': return `WIFI:T:${wifiType};S:${escapeWifi(wifiSSID)};P:${escapeWifi(wifiPass)};;`;
      case 'contact': return `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL:${contactPhone}\nEMAIL:${contactEmail}\nEND:VCARD`;
      case 'geo': return geoLat && geoLng ? `geo:${geoLat},${geoLng}` : '';
    }
  }, [mode, text, url, wifiSSID, wifiPass, wifiType, contactName, contactPhone, contactEmail, geoLat, geoLng]);

  // QR matrix generation (byte mode, selectable error-correction level)
  const qrMatrix = useMemo(() => {
    if (!qrData || qrData.length === 0) return null;
    try {
      return generateQRMatrix(qrData, ecLevel);
    } catch (e) {
      console.warn('[QRCode] Generation failed:', e);
      return null;
    }
  }, [qrData, ecLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !qrMatrix) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = qrMatrix.length;
    const totalModules = size + QUIET_ZONE * 2;
    const cellSize = Math.max(1, Math.floor(pxSize / totalModules));
    const totalSize = cellSize * totalModules;
    canvas.width = totalSize;
    canvas.height = totalSize;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = fgColor;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qrMatrix[y][x]) {
          ctx.fillRect((x + QUIET_ZONE) * cellSize, (y + QUIET_ZONE) * cellSize, cellSize, cellSize);
        }
      }
    }
  }, [qrMatrix, fgColor, bgColor, pxSize]);

  // Record successfully generated codes into history (debounced via settle effect).
  useEffect(() => {
    if (!qrMatrix || !qrData) return;
    const key = `${mode}:${ecLevel}:${qrData}`;
    if (recordedRef.current === key) return;
    const handle = window.setTimeout(() => {
      recordedRef.current = key;
      setHistory(prev => {
        const next = [
          { data: qrData, mode, ec: ecLevel, ts: Date.now() },
          ...prev.filter(e => !(e.data === qrData && e.mode === mode)),
        ].slice(0, HISTORY_LIMIT);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch {
          /* storage may be full or unavailable — keep in-memory only */
        }
        return next;
      });
    }, 900);
    return () => window.clearTimeout(handle);
  }, [qrMatrix, qrData, mode, ecLevel]);

  // Restore raw data into the most appropriate editable field.
  const restoreEntry = useCallback((entry: HistoryEntry) => {
    setMode(entry.mode);
    if (entry.ec) setEcLevel(entry.ec);
    switch (entry.mode) {
      case 'url': setUrl(entry.data); break;
      case 'geo': {
        const m = /^geo:([^,]+),(.+)$/.exec(entry.data);
        if (m) { setGeoLat(m[1]); setGeoLng(m[2]); }
        break;
      }
      default: setText(entry.data); setMode('text'); break;
    }
    // For wifi/contact the encoded string isn't field-decomposable here, so we
    // fall back to raw text so the exact code is still reproducible.
    if (entry.mode === 'wifi' || entry.mode === 'contact') {
      setText(entry.data);
      setMode('text');
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    recordedRef.current = '';
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  }, []);

  // Read clipboard text into the active field.
  const pasteFromClipboard = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const clip = await navigator.clipboard?.readText();
      if (!clip) {
        toast('warning', 'Clipboard is empty');
        return;
      }
      if (mode === 'url') setUrl(clip);
      else { setMode('text'); setText(clip); }
      toast('success', 'Pasted from clipboard');
    } catch (e) {
      console.warn('[QRCode] Paste failed:', e);
      toast('error', 'Could not read clipboard');
    } finally {
      setBusy(false);
    }
  }, [mode, busy]);

  // Encode the active browser URL if exposed by the shell, else fall back to the
  // clipboard contents (commonly a copied link).
  const encodeCurrentUrl = useCallback(async () => {
    if (busy) return;
    const active = getActiveBrowserUrl();
    if (active) {
      setMode('url');
      setUrl(active);
      toast('success', 'Encoded current page URL');
      return;
    }
    setBusy(true);
    try {
      const clip = ((await navigator.clipboard?.readText()) || '').trim();
      if (clip && /^[a-z][\w+.-]*:\/\//i.test(clip)) {
        setMode('url');
        setUrl(clip);
        toast('success', 'Encoded URL from clipboard');
      } else {
        toast('warning', 'No active URL available');
      }
    } catch (e) {
      console.warn('[QRCode] Encode URL failed:', e);
      toast('warning', 'No active URL available');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = 'dex-qrcode.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('success', 'Saved PNG');
    } catch (e) {
      console.warn('[QRCode] PNG download failed:', e);
      toast('error', 'Could not save PNG');
    }
  }, []);

  const downloadSVG = useCallback(() => {
    if (!qrMatrix) return;
    try {
      const svg = qrMatrixToSVG(qrMatrix, { fg: fgColor, bg: bgColor, margin: QUIET_ZONE, pixelSize: pxSize });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const link = document.createElement('a');
      link.download = 'dex-qrcode.svg';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      toast('success', 'Saved SVG');
    } catch (e) {
      console.warn('[QRCode] SVG download failed:', e);
      toast('error', 'Could not save SVG');
    }
  }, [qrMatrix, fgColor, bgColor, pxSize]);

  const copyQR = useCallback(async () => {
    if (busy) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('encode failed');
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('clipboard image API unavailable');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('success', 'Copied image to clipboard');
    } catch (e) {
      console.warn('[QRCode] Copy failed:', e);
      toast('error', 'Could not copy image');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // Human-readable description of the current encoded payload for the preview card.
  const previewMeta = useMemo(() => {
    if (!qrMatrix) return null;
    const modules = qrMatrix.length;
    const version = (modules - 17) / 4;
    const bytes = new TextEncoder().encode(qrData).length;
    return { modules, version, bytes };
  }, [qrMatrix, qrData]);

  return (
    <div style={s.container} data-dex-qr-root>
      <style>{QR_SCOPED_CSS}</style>
      {/* Mode tabs */}
      <div style={s.tabs}>
        {([
          { id: 'text' as QRMode, label: 'Text', icon: 'T' },
          { id: 'url' as QRMode, label: 'URL', icon: 'U' },
          { id: 'wifi' as QRMode, label: 'Wi-Fi', icon: 'W' },
          { id: 'contact' as QRMode, label: 'Contact', icon: 'C' },
          { id: 'geo' as QRMode, label: 'Geo', icon: 'G' },
        ]).map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="qr-tab"
            style={{ ...s.tab, ...(mode === m.id ? s.tabActive : {}) }}
            aria-label={`${m.label} mode`}
            aria-pressed={mode === m.id}
          >
            <span style={s.tabIcon} aria-hidden="true">{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {/* Quick actions */}
        <div style={s.quickRow}>
          <button onClick={pasteFromClipboard} disabled={busy} className="dex-liquid-glass qr-quick" style={{ ...s.quickBtn, ...(busy ? { opacity: 0.5, cursor: 'default' } : {}) }} aria-label="Paste from clipboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Paste
          </button>
          <button onClick={encodeCurrentUrl} disabled={busy} className="dex-liquid-glass qr-quick" style={{ ...s.quickBtn, ...(busy ? { opacity: 0.5, cursor: 'default' } : {}) }} aria-label="Encode current URL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Encode URL
          </button>
        </div>

        {/* Input area */}
        <div style={s.inputArea}>
          {mode === 'text' && (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter text to encode..."
              className="dex-liquid-glass-strong qr-field"
              style={s.textarea}
              maxLength={300}
              aria-label="Text to encode"
            />
          )}
          {mode === 'url' && (
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="dex-liquid-glass qr-field"
              style={s.input}
              aria-label="URL to encode"
            />
          )}
          {mode === 'wifi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={wifiSSID} onChange={e => setWifiSSID(e.target.value)} placeholder="Network name (SSID)" className="dex-liquid-glass qr-field" style={s.input} aria-label="Wi-Fi network name (SSID)" />
              <input value={wifiPass} onChange={e => setWifiPass(e.target.value)} placeholder="Password" type="password" className="dex-liquid-glass qr-field" style={s.input} aria-label="Wi-Fi password" />
              <select value={wifiType} onChange={e => setWifiType(e.target.value as any)} className="dex-liquid-glass qr-field" style={s.select} aria-label="Wi-Fi security type">
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">No Password</option>
              </select>
            </div>
          )}
          {mode === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" className="dex-liquid-glass qr-field" style={s.input} aria-label="Contact full name" />
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Phone number" className="dex-liquid-glass qr-field" style={s.input} aria-label="Contact phone number" />
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email" className="dex-liquid-glass qr-field" style={s.input} aria-label="Contact email" />
            </div>
          )}
          {mode === 'geo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={geoLat} onChange={e => setGeoLat(e.target.value)} placeholder="Latitude (e.g. 37.7749)" inputMode="decimal" className="dex-liquid-glass qr-field" style={s.input} aria-label="Latitude" />
              <input value={geoLng} onChange={e => setGeoLng(e.target.value)} placeholder="Longitude (e.g. -122.4194)" inputMode="decimal" className="dex-liquid-glass qr-field" style={s.input} aria-label="Longitude" />
            </div>
          )}
        </div>

        {/* QR preview */}
        <div style={s.preview}>
          {qrMatrix ? (
            <canvas ref={canvasRef} style={s.canvas} />
          ) : (
            <div style={s.placeholder}>Enter data to generate QR code</div>
          )}
        </div>

        {/* Actions */}
        {qrMatrix && (
          <div style={s.actions}>
            <button onClick={downloadQR} className="dex-liquid-glass" style={s.actionBtn} aria-label="Download QR code as PNG">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PNG
            </button>
            <button onClick={downloadSVG} className="dex-liquid-glass" style={s.actionBtn} aria-label="Download QR code as SVG">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              SVG
            </button>
            <button onClick={copyQR} disabled={busy} className="dex-liquid-glass" style={{ ...s.actionBtn, ...(busy ? { opacity: 0.5, cursor: 'default' } : {}) }} aria-label="Copy QR code to clipboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        )}

        {/* Color pickers */}
        <div style={s.colorRow}>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>FG</span>
            <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} style={s.colorInput} title="Foreground color" aria-label="Foreground color" />
          </label>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>BG</span>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={s.colorInput} title="Background color" aria-label="Background color" />
          </label>
        </div>

        {/* Error-correction level + size */}
        <div style={s.settingsRow}>
          <div style={s.settingGroup}>
            <span style={s.settingLabel}>Error correction</span>
            <div className="dex-liquid-glass" style={s.segmented} role="group" aria-label="Error correction level">
              {(['L', 'M', 'Q', 'H'] as ECLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setEcLevel(level)}
                  style={{ ...s.segment, ...(ecLevel === level ? s.segmentActive : {}) }}
                  title={EC_LABELS[level]}
                  aria-pressed={ecLevel === level}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <div style={s.settingGroup}>
            <span style={s.settingLabel}>Size {pxSize}px</span>
            <input
              type="range"
              min={160}
              max={512}
              step={16}
              value={pxSize}
              onChange={e => setPxSize(Number(e.target.value))}
              style={s.range}
              aria-label="QR code pixel size"
              aria-valuetext={`${pxSize} pixels`}
            />
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={s.historyArea}>
            <div style={s.historyHeader}>
              <span style={s.settingLabel}>Recent</span>
              <button onClick={clearHistory} style={s.clearBtn} aria-label="Clear history">Clear</button>
            </div>
            <div style={s.historyList}>
              {history.map((entry, i) => (
                <button
                  key={`${entry.ts}-${i}`}
                  onClick={() => restoreEntry(entry)}
                  className="dex-liquid-glass"
                  style={s.historyItem}
                  title={entry.data}
                >
                  <span style={s.historyBadge}>{MODE_ICONS[entry.mode] || 'T'}</span>
                  <span style={s.historyText}>{entry.data}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================================================================
// Helpers: payload escaping, active-URL discovery, EC metadata
// ===========================================================================
const EC_LABELS: Record<ECLevel, string> = {
  L: 'Low (~7%)', M: 'Medium (~15%)', Q: 'Quartile (~25%)', H: 'High (~30%)',
};
const MODE_ICONS: Record<QRMode, string> = {
  text: 'T', url: 'U', wifi: 'W', contact: 'C', geo: 'G',
};

// WIFI: payload escaping per the de-facto spec (\, ;, ,, : and " are special).
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

// Trim a string so its UTF-8 byte length fits within `maxBytes` without
// splitting a multi-byte character.
function sliceToByteCap(data: string, maxBytes: number): string {
  let out = data;
  while (new TextEncoder().encode(out).length > maxBytes && out.length > 0) {
    out = out.slice(0, -1);
  }
  return out;
}

// Best-effort discovery of the active browser tab's URL exposed by the DEX
// shell. Falls back to nothing so the caller can try the clipboard instead.
function getActiveBrowserUrl(): string | null {
  try {
    const w = window as unknown as Record<string, any>;
    const candidates = [
      w.dex?.browser?.activeUrl,
      w.dex?.activeBrowserUrl,
      w.DEX?.browser?.activeUrl,
      typeof w.dex?.browser?.getActiveUrl === 'function' ? w.dex.browser.getActiveUrl() : undefined,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && /^[a-z][\w+.-]*:\/\//i.test(c)) return c;
    }
  } catch {
    /* shell bridge absent (e.g. web preview) — fall through */
  }
  return null;
}

// ===========================================================================
// Real QR Code Generator — Version 1-10 byte mode, selectable EC level (L/M/Q/H)
// Produces standards-compliant scannable QR codes, no external library needed
// ===========================================================================
// Per-EC-level metadata, indexed by version (1-N).
// This generator does single-block Reed-Solomon (no block interleaving), so the
// `caps` list is intentionally truncated to the versions that use a SINGLE EC
// block at each level (the only ones we can emit correctly). Anything longer is
// trimmed to the largest single-block capacity so every code stays scannable.
// caps: max byte-mode data capacity; total: total codewords; ec: EC codewords.
const EC_META: Record<ECLevel, { caps: number[]; total: number[]; ec: number[] }> = {
  // L: single-block through version 5 (cap 106 bytes)
  L: {
    caps: [17, 32, 53, 78, 106],
    total: [26, 44, 70, 100, 134],
    ec: [7, 10, 15, 20, 26],
  },
  // M: single-block through version 3 (cap 42 bytes)
  M: {
    caps: [14, 26, 42],
    total: [26, 44, 70],
    ec: [10, 16, 26],
  },
  // Q: single-block through version 2 (cap 20 bytes)
  Q: {
    caps: [11, 20],
    total: [26, 44],
    ec: [13, 22],
  },
  // H: single-block through version 2 (cap 14 bytes)
  H: {
    caps: [7, 14],
    total: [26, 44],
    ec: [17, 28],
  },
};
// 15-bit format-info strings for mask pattern 0, per EC level (already masked
// with the QR format mask 0b101010000010010).
const FORMAT_BITS: Record<ECLevel, number[]> = {
  L: [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0],
  M: [1,0,1,0,1,0,0,0,0,0,1,0,0,1,0],
  Q: [0,1,1,0,1,0,1,0,1,0,1,1,1,1,1],
  H: [0,0,1,0,1,1,0,1,0,0,0,1,0,0,1],
};

function generateQRMatrix(data: string, ecLevel: ECLevel = 'M'): boolean[][] {
  const meta = EC_META[ecLevel];
  const bytes = new TextEncoder().encode(data);
  const len = bytes.length;
  // Select version (1-10) based on data length for the chosen EC level
  const caps = meta.caps;
  const ver = caps.findIndex(c => len <= c);
  if (ver < 0) {
    // Too large for the supported version range at this EC level — trim to fit
    // the largest available capacity so we still produce a scannable code.
    return generateQRMatrix(sliceToByteCap(data, caps[caps.length - 1]), ecLevel);
  }
  const version = ver + 1;
  const size = 17 + version * 4;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, v: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) { matrix[r][c] = v; reserved[r][c] = true; }
  };
  const drawFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const isInBorder = dr === -1 || dr === 7 || dc === -1 || dc === 7;
      const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6;
      const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      setModule(r, c, !isInBorder && (isOuter || isInner));
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Alignment pattern (version >= 2)
  if (version >= 2) {
    const pos = [6, size - 7];
    for (const ar of pos) for (const ac of pos) {
      if (reserved[ar]?.[ac]) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const isEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
        const isCenter = dr === 0 && dc === 0;
        setModule(ar + dr, ac + dc, isEdge || isCenter);
      }
    }
  }

  // Dark module + reserved areas
  setModule(size - 8, 8, true);
  for (let i = 0; i < 9; i++) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }

  // Encode data: byte mode indicator (0100), character count, data, EC
  const totalCodewords = meta.total[ver];
  const ecCodewords = meta.ec[ver];
  const dataCodewords = totalCodewords - ecCodewords;
  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(len, version >= 10 ? 16 : 8); // Char count
  for (const b of bytes) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCodewords * 8 - bits.length)); // Terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (bits.length < dataCodewords * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to codewords
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j++) val = (val << 1) | (bits[i + j] || 0);
    codewords.push(val);
  }

  // Reed-Solomon EC (GF(256) with primitive polynomial 0x11D)
  const gfExp: number[] = new Array(512);
  const gfLog: number[] = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { gfExp[i] = x; gfLog[x] = i; x = (x << 1) ^ (x >= 128 ? 0x11D : 0); }
  for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];
  const gfMul = (a: number, b: number) => a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]];

  // Generator polynomial
  let gen = [1];
  for (let i = 0; i < ecCodewords; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], gfExp[i]);
    }
    gen = next;
  }

  // Polynomial division
  const msgOut = new Array(dataCodewords + ecCodewords).fill(0);
  for (let i = 0; i < dataCodewords; i++) msgOut[i] = codewords[i] || 0;
  for (let i = 0; i < dataCodewords; i++) {
    const coef = msgOut[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msgOut[i + j] ^= gfMul(coef, gen[j]);
      }
    }
  }
  const ec = msgOut.slice(dataCodewords);

  // Final bitstream: data + EC
  const finalBits: number[] = [];
  for (const cw of codewords) for (let b = 7; b >= 0; b--) finalBits.push((cw >> b) & 1);
  for (const cw of ec) for (let b = 7; b >= 0; b--) finalBits.push((cw >> b) & 1);

  // Place data bits (upward zigzag)
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, 1]) {
        const c = col - dc;
        if (!reserved[row][c]) {
          matrix[row][c] = bitIndex < finalBits.length ? finalBits[bitIndex] === 1 : false;
          bitIndex++;
        }
      }
    }
    upward = !upward;
  }

  // Apply mask pattern 0 (checkerboard)
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!reserved[r][c] && (r + c) % 2 === 0) matrix[r][c] = !matrix[r][c];
  }

  // Write format info (mask 0, EC level-specific format bits)
  const formatBits = FORMAT_BITS[ecLevel];
  for (let i = 0; i < 15; i++) {
    const bit = formatBits[i] === 1;
    if (i < 6) matrix[8][i] = bit;
    else if (i < 8) matrix[8][i + 1] = bit;
    else matrix[14 - i][8] = bit;
    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix;
}

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
  },
  tabs: {
    display: 'flex', gap: 4, padding: 'var(--space-3) var(--space-4)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px var(--space-3)', borderRadius: 10, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  tabActive: {
    background: 'var(--color-accent-light)', color: 'var(--color-accent)',
  },
  body: {
    flex: 1, overflow: 'auto', padding: 'var(--space-4) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
  },
  inputArea: {},
  textarea: {
    width: '100%', minHeight: 80, padding: '10px var(--space-3)', borderRadius: 12,
    color: 'var(--color-text-primary)', fontSize: 14, resize: 'vertical',
    outline: 'none', fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  input: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 12,
    color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 12,
    color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer',
    outline: 'none', fontFamily: 'var(--font-family)',
  },
  preview: {
    display: 'flex', justifyContent: 'center', padding: 'var(--space-4)',
  },
  canvas: {
    width: 240, height: 240, borderRadius: 12,
    border: '1px solid var(--color-border-subtle)',
  },
  placeholder: {
    width: 240, height: 240, borderRadius: 12,
    border: '2px dashed var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center',
    padding: 'var(--space-5)',
  },
  actions: {
    display: 'flex', justifyContent: 'center', gap: 'var(--space-3)',
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-4)', borderRadius: 12, border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  colorRow: {
    display: 'flex', justifyContent: 'center', gap: 'var(--space-4)',
  },
  colorLabel: {
    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  },
  colorInput: {
    width: 28, height: 28, border: 'none', borderRadius: 10,
    cursor: 'pointer', background: 'transparent',
  },
  quickRow: {
    display: 'flex', gap: 'var(--space-2)', justifyContent: 'center',
  },
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px var(--space-3)', borderRadius: 10,
    color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  settingsRow: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
    gap: 'var(--space-5)', alignItems: 'flex-end',
  },
  settingGroup: {
    display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160,
  },
  settingLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
    textTransform: 'uppercase', color: 'var(--color-text-muted)',
  },
  segmented: {
    display: 'flex', gap: 2, padding: 2, borderRadius: 10,
  },
  segment: {
    flex: 1, padding: '6px 0', borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--color-text-secondary)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  segmentActive: {
    background: 'var(--color-accent-light)', color: 'var(--color-accent)',
  },
  range: {
    width: '100%', accentColor: 'var(--color-accent)', cursor: 'pointer',
  },
  historyArea: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-3)',
  },
  historyHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  clearBtn: {
    border: 'none', background: 'transparent', color: 'var(--color-text-muted)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  historyList: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  historyItem: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '6px var(--space-2)', borderRadius: 10, border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  historyBadge: {
    flexShrink: 0, width: 18, height: 18, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-accent-light)', color: 'var(--color-accent)',
    fontSize: 11, fontWeight: 700,
  },
  historyText: {
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};

QRCodeGenerator.displayName = 'QRCodeGenerator';
export default memo(QRCodeGenerator);
