/**
 * DEX Platform - QR Code Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Generate QR codes from text, URLs, Wi-Fi, contacts, and geo coordinates
 */
import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { qrMatrixToSVG, qrModuleStyleAt, type QrModuleStyle } from '../../../shared/format/qrSvg';
import { colorInputValue } from '../../utils/canvasTheme';
import { createQrBatch, createQrMatrix, qrBatchToSVG, type QrErrorLevel } from './qrEncoding';
import { useCreativeInput } from '../../services/creativeIntake';
import { calendarQrPayload, mailtoPayload } from '../../../shared/format/qrPayloads';
import { saveBlobAs } from '../../services/nativeSave';
import { Button } from '../../ui/Button';
import { useUtilityInput } from '../../services/utilityInput';
import { resolveUkiContext } from '../../uki/appContextRegistry';
import { useRunningApps } from '../../store/runningApps';

type QRMode = 'text' | 'url' | 'wifi' | 'contact' | 'geo' | 'email' | 'event' | 'batch';
type ECLevel = QrErrorLevel;

// Preserve at least four light modules around each preview and export.
const MIN_QUIET_ZONE = 4;
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
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.data === 'string' && !/^WIFI:/i.test(e.data)).slice(0, HISTORY_LIMIT) : [];
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
[data-dex-qr-root] .qr-quick:not(:disabled):hover { filter: brightness(1.06); }
[data-dex-qr-root] .qr-quick:not(:disabled):active { transform: scale(0.96); }
[data-dex-qr-root] .qr-field { transition: border-color 0.12s ease, box-shadow 0.12s ease; }
[data-dex-qr-root] .qr-field:focus-within { border-color: var(--color-border-strong); }
`;

const QRCodeGenerator: React.FC = () => {
  const [mode, setMode] = useState<QRMode>('text');
  const [text, setText] = useState('');
  useUtilityInput('qrcode', value => { setMode('text'); setText(value); });
  const [url, setUrl] = useState('');
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiType, setWifiType] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventId] = useState(() => crypto.randomUUID());
  const [eventStamp] = useState(() => new Date());
  const [batchText, setBatchText] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  // These are written directly to a <canvas> fillStyle and an <input type="color">,
  // neither of which can resolve CSS custom properties -- they must be literal
  // hex. (A prior token sweep set bg to 'var(--color-text-primary)', which a
  // canvas treats as invalid and an <input type=color> snaps to #000000,
  // producing an all-black, unscannable QR.)
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [ecLevel, setEcLevel] = useState<ECLevel>('M');
  const [pxSize, setPxSize] = useState(240);
  const [quietZone, setQuietZone] = useState(MIN_QUIET_ZONE);
  const [moduleStyle, setModuleStyle] = useState<QrModuleStyle>('square');
  const [swatchTarget, setSwatchTarget] = useState<'foreground' | 'background'>('foreground');
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
      case 'email': return mailtoPayload(recipient, subject, message);
      case 'event': return calendarQrPayload(eventTitle, new Date(eventStart), new Date(eventEnd), eventId, eventStamp);
      case 'batch': return '';
    }
  }, [mode, text, url, wifiSSID, wifiPass, wifiType, contactName, contactPhone, contactEmail, geoLat, geoLng,
    recipient, subject, message, eventTitle, eventStart, eventEnd, eventId, eventStamp]);

  // QR matrix generation (byte mode, selectable error-correction level)
  const qrMatrix = useMemo(() => {
    if (!qrData || qrData.length === 0) return null;
    try {
      return createQrMatrix(qrData, ecLevel);
    } catch (e) {
      console.warn('[QRCode] Generation failed:', e);
      return null;
    }
  }, [qrData, ecLevel]);

  const batch = useMemo(() => mode === 'batch' ? createQrBatch(batchText, ecLevel) : null, [mode, batchText, ecLevel]);
  const batchOptions = { fg: fgColor, bg: bgColor, margin: quietZone, pixelSize: pxSize, moduleStyle };
  const saveBatch = async () => {
    if (!batch?.items.length || savingBatch) return;
    const matrices = batch.items.flatMap(item => item.matrix ? [item.matrix] : []);
    if (matrices.length !== batch.items.length) return;
    setSavingBatch(true);
    try {
      const sheet = qrBatchToSVG(matrices, batchOptions);
      await saveBlobAs('dex-qr-batch.svg', new Blob([sheet], { type: 'image/svg+xml' }),
        { title: 'Save QR code sheet', source: 'QR Code' });
    } catch {
      // The shared save bridge reports native write failures.
    } finally {
      setSavingBatch(false);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !qrMatrix) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = qrMatrix.length;
    const totalModules = size + quietZone * 2;
    const cellSize = Math.max(1, Math.floor(pxSize / totalModules));
    const totalSize = cellSize * totalModules;
    canvas.width = totalSize;
    canvas.height = totalSize;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = fgColor;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!qrMatrix[y][x]) continue;
        const left = (x + quietZone) * cellSize, top = (y + quietZone) * cellSize;
        const shape = qrModuleStyleAt(moduleStyle, y, x, size);
        if (shape === 'square') ctx.fillRect(left, top, cellSize, cellSize);
        else {
          ctx.beginPath();
          if (shape === 'dots') ctx.arc(left + cellSize / 2, top + cellSize / 2, cellSize * 0.48, 0, 2 * Math.PI);
          else ctx.roundRect(left, top, cellSize, cellSize, cellSize * 0.2);
          ctx.fill();
        }
      }
    }
  }, [qrMatrix, fgColor, bgColor, pxSize, quietZone, moduleStyle]);

  // Record successfully generated codes into history (debounced via settle effect).
  useEffect(() => {
    if (!qrMatrix || !qrData || mode === 'email' || mode === 'event' || /^WIFI:/i.test(qrData)) return;
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
      else if (mode === 'batch') setBatchText(clip);
      else if (mode === 'email') setRecipient(clip);
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
      const svg = qrMatrixToSVG(qrMatrix, { fg: fgColor, bg: bgColor, margin: quietZone, pixelSize: pxSize, moduleStyle });
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
  }, [qrMatrix, fgColor, bgColor, pxSize, quietZone, moduleStyle]);

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

  useCreativeInput('qrcode', value => { setMode('text'); setText(value); });
  useCreativeInput('qrcode-color', value => {
    if (swatchTarget === 'foreground') setFgColor(colorInputValue(value));
    else setBgColor(colorInputValue(value));
  });

  return (
    <div style={s.container} data-dex-qr-root>
      <style>{QR_SCOPED_CSS}</style>
      {/* Mode tabs */}
      <div style={s.tabs}>
        {([
          { id: 'text' as QRMode, label: 'Text' },
          { id: 'url' as QRMode, label: 'URL' },
          { id: 'wifi' as QRMode, label: 'Wi-Fi' },
          { id: 'contact' as QRMode, label: 'Contact' },
          { id: 'geo' as QRMode, label: 'Geo' },
          { id: 'email' as QRMode, label: 'Email' },
          { id: 'event' as QRMode, label: 'Event' },
          { id: 'batch' as QRMode, label: 'Batch' },
        ]).map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className="qr-tab"
            style={{ ...s.tab, ...(mode === m.id ? s.tabActive : {}) }}
            aria-label={`${m.label} mode`}
            aria-pressed={mode === m.id}
          >
            {m.label}
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
          {mode === 'batch' && <textarea value={batchText} onChange={event => setBatchText(event.target.value)}
            aria-label="Batch data, one code per line" placeholder="One code per line, up to 24"
            style={s.textarea} />}
          {mode === 'email' && <div style={{ display: 'grid', gap: 8 }}>
            <input type="email" value={recipient} onChange={event => setRecipient(event.target.value)}
              aria-label="Email recipient" placeholder="Email address" maxLength={254} style={s.input} />
            <input value={subject} onChange={event => setSubject(event.target.value)}
              aria-label="Email subject" placeholder="Subject" maxLength={120} style={s.input} />
            <textarea value={message} onChange={event => setMessage(event.target.value)}
              aria-label="Email message" placeholder="Message" maxLength={600} style={s.textarea} />
          </div>}
          {mode === 'event' && <div style={{ display: 'grid', gap: 8 }}>
            <input value={eventTitle} onChange={event => setEventTitle(event.target.value)}
              aria-label="Event title" placeholder="Event title" maxLength={120} style={s.input} />
            <label>Starts (local time)<input type="datetime-local" value={eventStart} onChange={event => setEventStart(event.target.value)} style={s.input} /></label>
            <label>Ends (local time)<input type="datetime-local" value={eventEnd} onChange={event => setEventEnd(event.target.value)} style={s.input} /></label>
          </div>}
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
        {batch ? <div style={{ padding: '0 var(--space-4)', display: 'grid', gap: 8 }}>
          {batch.error && <div role="alert">{batch.error}</div>}
          {batch.items.length > 0 && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8 }}>
              {batch.items.map(item => <div key={item.line} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
                {item.matrix
                  ? <img alt={'QR code for line ' + item.line} width={96} height={96}
                    src={'data:image/svg+xml,' + encodeURIComponent(qrMatrixToSVG(item.matrix, batchOptions))} />
                  : <span role="status">Too large at this error-correction level</span>}
                <span>Line {item.line}</span>
              </div>)}
            </div>
            <Button size="sm" disabled={savingBatch || batch.items.some(item => !item.matrix)} onClick={() => void saveBatch()}>Save QR sheet</Button>
          </>}
        </div> : <div style={s.preview}>
          {qrMatrix ? (
            <canvas ref={canvasRef} style={s.canvas} />
          ) : (
            <div role="status" style={s.placeholder}>{qrData ? 'Data is too large at this error-correction level'
              : mode === 'event' ? 'Enter a title and a valid time range'
                : mode === 'email' ? 'Enter a valid email address' : 'Enter data to generate QR code'}</div>
          )}
        </div>}

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
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Colors app sets</span>
            <select value={swatchTarget} style={s.select} aria-label="Color Picker swatch target"
              onChange={event => setSwatchTarget(event.target.value === 'background' ? 'background' : 'foreground')}>
              <option value="foreground">Foreground</option>
              <option value="background">Background</option>
            </select>
          </label>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>FG</span>
            <input type="color" value={colorInputValue(fgColor)} onChange={e => setFgColor(e.target.value)} style={s.colorInput} title="Foreground color" aria-label="Foreground color" />
          </label>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>BG</span>
            <input type="color" value={colorInputValue(bgColor)} onChange={e => setBgColor(e.target.value)} style={s.colorInput} title="Background color" aria-label="Background color" />
          </label>
        </div>

        {/* Error-correction level + size */}
        <div style={s.settingsRow}>
          <label style={s.settingGroup}>Quiet zone
            <select aria-label="Quiet zone" style={s.select} value={quietZone} onChange={event => setQuietZone(Number(event.target.value))}>
              {[4, 6, 8, 12].map(value => <option key={value} value={value}>{value} modules</option>)}
            </select>
          </label>
          <label style={s.settingGroup}>Modules
            <select aria-label="Module style" style={s.select} value={moduleStyle} onChange={event => setModuleStyle(event.target.value as QrModuleStyle)}>
              <option value="square">Square</option>
              <option value="rounded">Rounded</option>
              <option value="dots">Dots</option>
            </select>
          </label>
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
                  <span style={s.historyBadge}>{MODE_ICONS[entry.mode] || 'Text'}</span>
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
  text: 'Text', url: 'URL', wifi: 'Wi-Fi', contact: 'Contact', geo: 'Place', email: 'Email', event: 'Event', batch: 'Batch',
};

// WIFI: payload escaping per the de-facto spec (\, ;, ,, : and " are special).
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

// Best-effort discovery of the active browser tab's URL exposed by the DEX
// shell. Falls back to nothing so the caller can try the clipboard instead.
function getActiveBrowserUrl(): string | null {
  if (useRunningApps.getState().isAppRunning('browser')) {
    const url = resolveUkiContext('browser')?.currentFile;
    if (url && /^https?:\/\//i.test(url)) return url;
  }
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

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'hidden',
  },
  tabs: {
    display: 'flex', flexWrap: 'wrap', gap: 4, padding: 'var(--space-3) var(--space-4)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px var(--space-3)', borderRadius: 9999, border: 'none', whiteSpace: 'nowrap',
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  tabActive: {
    background: 'var(--color-accent-soft)', color: 'var(--color-text-primary)',
  },
  body: {
    flex: 1, overflow: 'auto', padding: 'var(--space-4) var(--space-5)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
  },
  inputArea: {},
  textarea: {
    width: '100%', minHeight: 80, padding: '10px var(--space-3)', borderRadius: 14,
    color: 'var(--color-text-primary)', fontSize: 14, resize: 'vertical',
    outline: 'none', fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  input: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 14,
    color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 14,
    color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer',
    outline: 'none', fontFamily: 'var(--font-family)',
  },
  preview: {
    display: 'flex', justifyContent: 'center', padding: 'var(--space-4)',
  },
  canvas: {
    width: 240, height: 240, borderRadius: 14,
    border: '1px solid var(--color-border-subtle)',
  },
  placeholder: {
    width: 240, height: 240, borderRadius: 14,
    border: '2px dashed var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center',
    padding: 'var(--space-5)',
  },
  actions: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'var(--space-2)',
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-4)', borderRadius: 14, border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    transition: 'all 0.15s ease', fontFamily: 'var(--font-family)',
  },
  colorRow: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3) var(--space-4)',
  },
  colorLabel: {
    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  },
  colorInput: {
    width: 28, height: 28, border: 'none', borderRadius: 9999,
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
    textTransform: 'none', color: 'var(--color-text-muted)',
  },
  segmented: {
    display: 'flex', gap: 2, padding: 2, borderRadius: 10,
  },
  segment: {
    flex: 1, padding: '6px 0', borderRadius: 10, border: 'none',
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
    flexShrink: 0, height: 18, padding: '0 7px', borderRadius: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
    fontSize: 10, fontWeight: 600,
  },
  historyText: {
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};

QRCodeGenerator.displayName = 'QRCodeGenerator';
export default memo(QRCodeGenerator);
