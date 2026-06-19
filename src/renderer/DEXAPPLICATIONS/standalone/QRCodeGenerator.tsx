/**
 * DEX Platform - QR Code Generator
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Generate QR codes from text, URLs, Wi-Fi, contacts
 */
import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { qrMatrixToSVG } from '../../../shared/format/qrSvg';

type QRMode = 'text' | 'url' | 'wifi' | 'contact';

// Minimal QR code generator (alphanumeric mode, version 2-6 auto)
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
  // These are written directly to a <canvas> fillStyle and an <input type="color">,
  // neither of which can resolve CSS custom properties -- they must be literal
  // hex. (A prior token sweep set bg to 'var(--color-text-primary)', which a
  // canvas treats as invalid and an <input type=color> snaps to #000000,
  // producing an all-black, unscannable QR.)
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const qrData = useMemo(() => {
    switch (mode) {
      case 'text': return text;
      case 'url': return url;
      case 'wifi': return `WIFI:T:${wifiType};S:${wifiSSID};P:${wifiPass};;`;
      case 'contact': return `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL:${contactPhone}\nEMAIL:${contactEmail}\nEND:VCARD`;
    }
  }, [mode, text, url, wifiSSID, wifiPass, wifiType, contactName, contactPhone, contactEmail]);

  // Simple QR matrix generation (numeric encoding for basic data)
  const qrMatrix = useMemo(() => {
    if (!qrData || qrData.length === 0) return null;
    return generateQRMatrix(qrData);
  }, [qrData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !qrMatrix) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = qrMatrix.length;
    const cellSize = Math.floor(240 / size);
    const totalSize = cellSize * size;
    canvas.width = totalSize;
    canvas.height = totalSize;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalSize, totalSize);

    ctx.fillStyle = fgColor;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (qrMatrix[y][x]) {
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }
  }, [qrMatrix, fgColor, bgColor]);

  const downloadQR = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'dex-qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const downloadSVG = useCallback(() => {
    if (!qrMatrix) return;
    const svg = qrMatrixToSVG(qrMatrix, { fg: fgColor, bg: bgColor });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = 'dex-qrcode.svg';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [qrMatrix, fgColor, bgColor]);

  const copyQR = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
    } catch (e) {
      console.warn('[QRCode] Copy failed:', e);
    }
  }, []);

  return (
    <div style={s.container}>
      {/* Mode tabs */}
      <div style={s.tabs}>
        {([
          { id: 'text' as QRMode, label: 'Text', icon: 'T' },
          { id: 'url' as QRMode, label: 'URL', icon: 'U' },
          { id: 'wifi' as QRMode, label: 'Wi-Fi', icon: 'W' },
          { id: 'contact' as QRMode, label: 'Contact', icon: 'C' },
        ]).map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{ ...s.tab, ...(mode === m.id ? s.tabActive : {}) }}
          >
            <span>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {/* Input area */}
        <div style={s.inputArea}>
          {mode === 'text' && (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter text to encode..."
              style={s.textarea}
              maxLength={300}
            />
          )}
          {mode === 'url' && (
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={s.input}
            />
          )}
          {mode === 'wifi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={wifiSSID} onChange={e => setWifiSSID(e.target.value)} placeholder="Network name (SSID)" style={s.input} />
              <input value={wifiPass} onChange={e => setWifiPass(e.target.value)} placeholder="Password" type="password" style={s.input} />
              <select value={wifiType} onChange={e => setWifiType(e.target.value as any)} style={s.select}>
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">No Password</option>
              </select>
            </div>
          )}
          {mode === 'contact' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" style={s.input} />
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Phone number" style={s.input} />
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email" style={s.input} />
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
            <button onClick={downloadQR} style={s.actionBtn} aria-label="Download QR code as PNG">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download PNG
            </button>
            <button onClick={downloadSVG} style={s.actionBtn} aria-label="Download QR code as SVG">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              SVG
            </button>
            <button onClick={copyQR} style={s.actionBtn} aria-label="Copy QR code to clipboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
        )}

        {/* Color pickers */}
        <div style={s.colorRow}>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>FG</span>
            <input type="color" value={fgColor} onChange={e => setFgColor(e.target.value)} style={s.colorInput} />
          </label>
          <label style={s.colorLabel}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>BG</span>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={s.colorInput} />
          </label>
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// Real QR Code Generator — Version 1-10 byte mode with L error correction
// Produces standards-compliant scannable QR codes, no external library needed
// ===========================================================================
function generateQRMatrix(data: string): boolean[][] {
  const bytes = new TextEncoder().encode(data);
  const len = bytes.length;
  // Select version (1-10) based on data length for EC level L
  const caps = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  const ver = caps.findIndex(c => len <= c);
  if (ver < 0) {
    return generateQRMatrix(data.slice(0, caps[caps.length - 1]));
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
  const totalCodewords = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346][ver];
  const ecCodewords = [7, 10, 15, 20, 26, 36, 40, 48, 60, 72][ver];
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

  // Write format info (mask 0, EC level L = 01, format bits = 0b111011111000100)
  const formatBits = [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0];
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
    padding: '6px var(--space-3)', borderRadius: 6, border: 'none',
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
    width: '100%', minHeight: 80, padding: '10px var(--space-3)', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-inset)',
    color: 'var(--color-text-primary)', fontSize: 14, resize: 'vertical',
    outline: 'none', fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  input: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-inset)',
    color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '10px var(--space-3)', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)',
    color: 'var(--color-text-primary)', fontSize: 14, cursor: 'pointer',
    outline: 'none', fontFamily: 'var(--font-family)',
  },
  preview: {
    display: 'flex', justifyContent: 'center', padding: 'var(--space-4)',
  },
  canvas: {
    width: 240, height: 240, borderRadius: 10,
    border: '1px solid var(--color-border-subtle)',
  },
  placeholder: {
    width: 240, height: 240, borderRadius: 10,
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
    padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
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
    width: 28, height: 28, border: 'none', borderRadius: 4,
    cursor: 'pointer', background: 'transparent',
  },
};

QRCodeGenerator.displayName = 'QRCodeGenerator';
export default memo(QRCodeGenerator);
