// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ============================================================================
// DEX Transfers - DTP High-Speed Transfer + HTTP Link Sharing
// Dual-mode: device-to-device DTP protocol + QR code HTTP sharing
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useToastHelpers } from '../components/Toast';
import { formatBytes as sharedFormatBytes } from '../../shared/format/units';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../components/ContextMenu';

// QR Code encoder — Version 1-4 byte mode with L error correction (item 108)
// Produces a real scannable QR code, no external library needed
const generateQRMatrix = (data: string): boolean[][] => {
  const bytes = new TextEncoder().encode(data);
  const len = bytes.length;
  // Select version (1-10) based on data length for EC level L
  const caps = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271]; // byte-mode capacity per version at EC-L
  const ver = caps.findIndex(c => len <= c);
  if (ver < 0) {
    // Truncate to max supported version
    return generateQRMatrix(data.slice(0, caps[caps.length - 1]));
  }
  const version = ver + 1;
  const size = 17 + version * 4;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Draw finder patterns
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
  // Reserve format info areas
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
  while (bits.length % 8 !== 0) bits.push(0); // Byte align
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

  // Reed-Solomon EC (simplified GF(256) with primitive polynomial 0x11D)
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

  // Poly division
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

  // Place data bits
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
    // Around top-left finder
    if (i < 6) matrix[8][i] = bit;
    else if (i < 8) matrix[8][i + 1] = bit;
    else matrix[14 - i][8] = bit;
    // Around other finders
    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix;
};

// QR Code canvas component
const QRCodeCanvas: React.FC<{ url: string; size?: number }> = memo(({ url, size = 160 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const matrix = generateQRMatrix(url);
    const moduleSize = size / matrix.length;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#000000';
    matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) ctx.fillRect(c * moduleSize, r * moduleSize, moduleSize, moduleSize);
      });
    });
  }, [url, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size, borderRadius: 6 }} />;
});

// Icons
const Icons = {
  file: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  receive: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>,
  link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  copy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  server: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
  device: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  laptop: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 16V7a2 2 0 00-2-2H6a2 2 0 00-2 2v9m16 0H4m16 0l1.28 2.55a1 1 0 01-.9 1.45H3.62a1 1 0 01-.9-1.45L4 16"/></svg>,
  wifi: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>,
  usb: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22V8M5 12V8l7-5 7 5v4M7 12a2 2 0 100 4h10a2 2 0 100-4"/></svg>,
  ethernet: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="6" width="22" height="12" rx="2"/><line x1="6" y1="6" x2="6" y2="2"/><line x1="10" y1="6" x2="10" y2="2"/><line x1="14" y1="6" x2="14" y2="2"/><line x1="18" y1="6" x2="18" y2="2"/></svg>,
  pause: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
  history: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  speed: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2C6.48 2 2 6.48 2 12h4l-1 1"/><circle cx="12" cy="12" r="3"/><path d="M12 2c5.52 0 10 4.48 10 10h-4"/></svg>,
};

interface DTPDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'windows' | 'macos' | 'linux' | 'ios' | 'android';
  address: string;
  port: number;
  connectionType: 'wifi' | 'ethernet' | 'usb' | 'thunderbolt';
  estimatedSpeedMbps: number;
}

interface DTPProgress {
  transferId: string;
  totalBytes: number;
  sentBytes: number;
  speed: number;
  progress: number;
  timeRemainingMs: number;
  streamCount: number;
  chunkSize: number;
  status: string;
}

interface TransferHistoryEntry {
  id: string;
  deviceName: string;
  direction: string;
  totalBytes: number;
  fileCount: number;
  averageSpeed: number;
  completedAt: number;
}

type TabId = 'devices' | 'active' | 'history' | 'http';

// Main Transfers Component
const Transfers: React.FC = () => {
  const toast = useToastHelpers();
  const [activeTab, setActiveTab] = useState<TabId>('devices');
  const [devices, setDevices] = useState<DTPDevice[]>([]);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [activeTransfers, setActiveTransfers] = useState<DTPProgress[]>([]);
  const [pendingDevices, setPendingDevices] = useState<{ deviceId: string; deviceName: string; deviceType: string }[]>([]);
  const [history, setHistory] = useState<TransferHistoryEntry[]>([]);
  const [sending, setSending] = useState(false);

  // HTTP state
  const [httpServerRunning, setHttpServerRunning] = useState(false);
  const [httpServerUrl, setHttpServerUrl] = useState<string | null>(null);
  const [httpSharedFiles, setHttpSharedFiles] = useState<{id: string; name: string; size: number; downloadCount: number}[]>([]);
  const [pendingUploads, setPendingUploads] = useState<{id: string; fileName: string; fileSize: number; senderIp: string}[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const httpExpiryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const autoAcceptRef = useRef(false);
  const trustedDevicesRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(true);

  // --- Pro Features State ---
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [httpPassword, setHttpPassword] = useState('');
  const [httpExpiry, setHttpExpiry] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(0);
  const [autoAccept, setAutoAccept] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [downloadLocation, setDownloadLocation] = useState(() => {
    return localStorage.getItem('dex-transfer-download-dir') || '';
  });
  const [dragOver, setDragOver] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('transfers-trusted'); return s ? new Set(JSON.parse(s)) : new Set(); } catch { return new Set(); }
  });
  const [deviceNicknames, setDeviceNicknames] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('transfers-nicknames'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  // Keep refs synced for use inside effect closures
  useEffect(() => { autoAcceptRef.current = autoAccept; }, [autoAccept]);
  useEffect(() => { trustedDevicesRef.current = trustedDevices; }, [trustedDevices]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  // DTP Lifecycle
  useEffect(() => {
    window.dex?.dtp?.startServer?.();
    window.dex?.dtp?.startDiscovery?.().then(() => setDiscoveryRunning(true)).catch(() => { /* discovery unavailable */ });
    window.dex?.dtp?.getDevices?.().then((d: DTPDevice[]) => { if (d) setDevices(d); }).catch(() => { /* no devices */ });
    window.dex?.dtp?.getHistory?.(50).then((h: TransferHistoryEntry[]) => { if (h) setHistory(h); }).catch(() => { /* no history */ });

    const onDeviceFound = (device: DTPDevice) => {
      setDevices(prev => prev.find(d => d.deviceId === device.deviceId) ? prev : [...prev, device]);
    };
    const onDeviceLost = (device: DTPDevice) => {
      setDevices(prev => prev.filter(d => d.deviceId !== device.deviceId));
    };
    const onDevicePending = (info: { deviceId: string; deviceName: string; deviceType: string }) => {
      if (autoAcceptRef.current || trustedDevicesRef.current.has(info.deviceId)) {
        window.dex?.dtp?.approveDevice?.(info.deviceId);
      } else {
        setPendingDevices(prev => [...prev, info]);
      }
    };
    const onSendProgress = (progress: DTPProgress) => {
      setActiveTransfers(prev => {
        const idx = prev.findIndex(t => t.transferId === progress.transferId);
        if (idx >= 0) { const next = [...prev]; next[idx] = progress; return next; }
        return [...prev, progress];
      });
    };
    const onSendComplete = () => {
      window.dex?.dtp?.getHistory?.(50).then((h: TransferHistoryEntry[]) => { if (h) setHistory(h); }).catch(() => { /* history unavailable */ });
      if (soundEnabledRef.current) { try { new Audio('data:audio/wav;base64,UklGRl4BAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToBAAB/f39/f39/f39/f39/').play().catch(() => {}); } catch { /* sound playback optional */ } }
    };
    const onTransferProgress = (info: any) => {
      setActiveTransfers(prev => {
        const idx = prev.findIndex(t => t.transferId === info.transferId);
        if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...info }; return next; }
        return [...prev, info];
      });
    };
    const onTransferComplete = () => {
      window.dex?.dtp?.getHistory?.(50).then((h: TransferHistoryEntry[]) => { if (h) setHistory(h); }).catch(() => { /* history unavailable */ });
      if (soundEnabledRef.current) { try { new Audio('data:audio/wav;base64,UklGRl4BAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToBAAB/f39/f39/f39/f39/').play().catch(() => {}); } catch { /* sound playback optional */ } }
    };

    window.dex?.dtp?.onDeviceFound?.(onDeviceFound);
    window.dex?.dtp?.onDeviceLost?.(onDeviceLost);
    window.dex?.dtp?.onDevicePending?.(onDevicePending);
    window.dex?.dtp?.onSendProgress?.(onSendProgress);
    window.dex?.dtp?.onSendComplete?.(onSendComplete);
    window.dex?.dtp?.onTransferProgress?.(onTransferProgress);
    window.dex?.dtp?.onTransferComplete?.(onTransferComplete);

    return () => {
      window.dex?.dtp?.offDeviceFound?.(onDeviceFound);
      window.dex?.dtp?.offDeviceLost?.(onDeviceLost);
      (window.dex?.dtp as any)?.offDevicePending?.(onDevicePending);
      window.dex?.dtp?.offSendProgress?.(onSendProgress);
      (window.dex?.dtp as any)?.offSendComplete?.(onSendComplete);
      window.dex?.dtp?.offTransferProgress?.(onTransferProgress);
      (window.dex?.dtp as any)?.offTransferComplete?.(onTransferComplete);
    };
  }, []);

  // HTTP event listeners
  useEffect(() => {
    const handleFilesUpdated = (info: { sharedFiles?: { id: string; name: string; size: number; downloadCount: number }[] }) => {
      setHttpSharedFiles(info?.sharedFiles || []);
    };
    const handleUploadRequest = (req: { id: string; fileName: string; fileSize: number; senderIp: string }) => {
      setPendingUploads(prev => [...prev, req]);
    };
    const handleUploadComplete = (data: { id: string }) => {
      setPendingUploads(prev => prev.filter(u => u.id !== data.id));
    };
    window.dex?.on?.('http-transfer:files-updated', handleFilesUpdated);
    window.dex?.on?.('http-transfer:upload-request', handleUploadRequest);
    window.dex?.on?.('http-transfer:upload-complete', handleUploadComplete);
    return () => {
      window.dex?.off?.('http-transfer:files-updated', handleFilesUpdated);
      window.dex?.off?.('http-transfer:upload-request', handleUploadRequest);
      window.dex?.off?.('http-transfer:upload-complete', handleUploadComplete);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (httpExpiryTimerRef.current) clearTimeout(httpExpiryTimerRef.current);
    };
  }, []);

  // DTP Handlers
  const refreshDevices = useCallback(() => {
    window.dex?.dtp?.refreshDevices?.();
    window.dex?.dtp?.getDevices?.().then((d: DTPDevice[]) => { if (d) setDevices(d); }).catch(() => { /* no devices */ });
  }, []);

  const sendToDevice = useCallback(async (device: DTPDevice) => {
    if (sending) return;
    setSending(true);
    try {
      const result = await window.dex?.transfer?.selectFiles?.();
      if (!result?.filePaths?.length) { setSending(false); return; }
      setActiveTab('active');
      await window.dex?.dtp?.sendFiles?.({
        files: result.filePaths,
        targetAddress: device.address,
        targetPort: device.port,
        sessionToken: '',
      });
    } catch (e) { console.error('[Transfers] Send error:', e); toast.error('Failed to send files'); }
    finally { setSending(false); }
  }, [sending]);

  const approveDevice = useCallback((deviceId: string) => {
    window.dex?.dtp?.approveDevice?.(deviceId);
    setPendingDevices(prev => prev.filter(d => d.deviceId !== deviceId));
  }, []);

  const denyDevice = useCallback((deviceId: string) => {
    window.dex?.dtp?.denyDevice?.(deviceId);
    setPendingDevices(prev => prev.filter(d => d.deviceId !== deviceId));
  }, []);

  const pauseTransfer = useCallback((transferId: string) => {
    window.dex?.dtp?.pauseSend?.(transferId);
  }, []);

  const cancelTransfer = useCallback((transferId: string) => {
    window.dex?.dtp?.cancelSend?.(transferId);
    setActiveTransfers(prev => prev.filter(t => t.transferId !== transferId));
  }, []);

  // HTTP Handlers
  const startHttpServer = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.dex?.httpTransfer?.start?.({
        password: httpPassword || undefined,
        speedLimit: speedLimit > 0 ? speedLimit : undefined,
        downloadDir: downloadLocation || undefined,
        autoAccept,
      });
      if (result?.success) {
        setHttpServerRunning(true);
        setHttpServerUrl(result.url ?? null);
        // Auto-stop timer
        if (httpExpiry > 0) {
          httpExpiryTimerRef.current = setTimeout(() => {
            stopHttpServer();
          }, httpExpiry * 60 * 1000);
        }
      }
    } catch (e) { console.error('[Transfers] HTTP start error:', e); toast.error('Failed to start HTTP server'); }
    finally { setBusy(false); }
  }, [busy, httpPassword, speedLimit, downloadLocation, autoAccept, httpExpiry]);

  const stopHttpServer = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (httpExpiryTimerRef.current) { clearTimeout(httpExpiryTimerRef.current); httpExpiryTimerRef.current = undefined; }
      await window.dex?.httpTransfer?.stop?.();
      setHttpServerRunning(false); setHttpServerUrl(null); setHttpSharedFiles([]);
    } catch (e) { console.error('[Transfers] HTTP stop error:', e); toast.error('Failed to stop HTTP server'); }
    finally { setBusy(false); }
  }, [busy]);

  const httpShareFiles = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.dex?.httpTransfer?.pickAndShare?.();
      const info = await window.dex?.httpTransfer?.info?.();
      if (info) {
        setHttpSharedFiles(info.sharedFiles || []);
        if (info.isRunning) { setHttpServerRunning(true); setHttpServerUrl(info.url ?? null); }
      }
    } catch (e) { console.error('[Transfers] HTTP share error:', e); toast.error('Failed to share files'); }
    finally { setBusy(false); }
  }, [busy]);

  const acceptUpload = useCallback(async (uploadId: string, accept: boolean) => {
    try {
      await window.dex?.httpTransfer?.acceptUpload?.(uploadId, accept);
      setPendingUploads(prev => prev.filter(u => u.id !== uploadId));
    } catch (e) { console.error('[Transfers] Accept upload error:', e); toast.error('Failed to process upload'); }
  }, []);

  const copyUrl = useCallback(() => {
    if (httpServerUrl) {
      navigator.clipboard.writeText(httpServerUrl);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [httpServerUrl]);

  // --- Pro Feature Handlers ---
  const clearHistory = useCallback(() => {
    setHistory([]);
    (window.dex?.dtp as any)?.clearHistory?.();
  }, []);

  const httpRemoveFile = useCallback(async (fileId: string) => {
    try {
      await (window.dex?.httpTransfer as any)?.removeFile?.(fileId);
      setHttpSharedFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (e) { console.error('[Transfers] Remove file error:', e); }
  }, []);

  const retryTransfer = useCallback(async (transferId: string) => {
    try { await (window.dex?.dtp as any)?.retryTransfer?.(transferId); }
    catch (e) { console.error('[Transfers] Retry error:', e); }
  }, []);

  const qrWrapperRef = useRef<HTMLDivElement>(null);

  const downloadQR = useCallback(() => {
    const canvas = qrWrapperRef.current?.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'transfer-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const setNickname = useCallback((deviceId: string, name: string) => {
    setDeviceNicknames(prev => {
      const next = { ...prev, [deviceId]: name };
      localStorage.setItem('transfers-nicknames', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleTrusted = useCallback((deviceId: string) => {
    setTrustedDevices(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId); else next.add(deviceId);
      localStorage.setItem('transfers-trusted', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files.map(f => (f as any).path || f.name);
      if (activeTab === 'http') {
        await (window.dex?.httpTransfer as any)?.shareFiles?.(paths);
        const info = await window.dex?.httpTransfer?.info?.();
        if (info) {
          setHttpSharedFiles(info.sharedFiles || []);
          if (info.isRunning) { setHttpServerRunning(true); setHttpServerUrl(info.url ?? null); }
        }
      } else {
        // For devices tab, default to first available device
        if (devices.length > 0) {
          setActiveTab('active');
          await window.dex?.dtp?.sendFiles?.({
            files: paths,
            targetAddress: devices[0].address,
            targetPort: devices[0].port,
            sessionToken: '',
          });
        }
      }
    }
  }, [activeTab, devices]);

  // Utils
  const formatSize = (bytes: number): string => sharedFormatBytes(bytes);

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  };

  const formatTime = (ms: number): string => {
    if (ms <= 0) return '--';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'ios': case 'android': return Icons.device;
      default: return Icons.laptop;
    }
  };

  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'usb': return Icons.usb;
      case 'ethernet': case 'thunderbolt': return Icons.ethernet;
      default: return Icons.wifi;
    }
  };

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'devices', label: 'Devices', badge: devices.length },
    { id: 'active', label: 'Active', badge: activeTransfers.length + pendingDevices.length },
    { id: 'history', label: 'History' },
    { id: 'http', label: 'HTTP Share' },
  ];

  // Context menu
  const { menuState: ctxMenuState, show: showCtxMenu, close: closeCtxMenu } = useContextMenu();

  const buildTransferCtxItems = useCallback((t: DTPProgress): ContextMenuItem[] => [
    { label: 'Pause', icon: Icons.pause, onClick: () => pauseTransfer(t.transferId) },
    { label: 'Cancel', icon: Icons.close, onClick: () => cancelTransfer(t.transferId), danger: true },
    { label: 'Retry', icon: Icons.refresh, onClick: () => retryTransfer(t.transferId), divider: true },
    { label: 'Copy Transfer ID', onClick: () => navigator.clipboard.writeText(t.transferId) },
  ], [pauseTransfer, cancelTransfer, retryTransfer]);

  const buildHistoryCtxItems = useCallback((h: TransferHistoryEntry): ContextMenuItem[] => [
    { label: 'Copy Device Name', onClick: () => navigator.clipboard.writeText(h.deviceName) },
    { label: 'Remove from History', icon: Icons.close, onClick: () => setHistory(prev => prev.filter(x => x.id !== h.id)), danger: true },
  ], []);

  const buildDeviceCtxItems = useCallback((d: DTPDevice): ContextMenuItem[] => [
    { label: 'Send Files', icon: Icons.send, onClick: () => sendToDevice(d) },
    { label: trustedDevices.has(d.deviceId) ? 'Remove Trust' : 'Trust Device', onClick: () => toggleTrusted(d.deviceId), divider: true },
    { label: 'Set Nickname', onClick: () => {
      const name = prompt('Device nickname:', deviceNicknames[d.deviceId] || d.deviceName);
      if (name) setNickname(d.deviceId, name);
    }},
    { label: 'Copy Address', onClick: () => navigator.clipboard.writeText(`${d.address}:${d.port}`) },
  ], [sendToDevice, trustedDevices, toggleTrusted, deviceNicknames, setNickname]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg-base, #1C1C20)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '13px' } as React.CSSProperties}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      <style>{`
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle, #333) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle, #333); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border, #555); }
      `}</style>
      {/* Drag overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 'var(--z-modal)',
          background: 'var(--color-accent-muted, rgba(10,132,255,0.18))', border: '3px dashed var(--color-accent-light, rgba(10,132,255,0.5))',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-accent)' }}>Drop files to {activeTab === 'http' ? 'share via HTTP' : 'transfer'}</div>
        </div>
      )}
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 var(--space-3)', height: 32, borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface-solid)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--color-text-primary)' }}>{Icons.speed}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Transfer</span>
          {discoveryRunning && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 4,
              background: 'rgba(48,209,88,0.1)', border: '1px solid rgba(48,209,88,0.2)',
              fontSize: 11, fontWeight: 500, color: 'var(--color-success)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
              Discoverable
            </div>
          )}
        </div>
        <button onClick={() => setShowSettings(v => !v)} style={{
          padding: '6px var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
          background: showSettings ? 'var(--color-accent-muted, rgba(10,132,255,0.12))' : 'var(--color-bg-elevated)',
          color: showSettings ? 'var(--color-accent)' : 'var(--color-text-muted)',
          fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {Icons.shield} Settings
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                background: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)', color: 'var(--color-text-inverse)',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-5)' }}>

        {/* ---- Devices Tab ---- */}
        {activeTab === 'devices' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nearby devices on your network</div>
              <button onClick={refreshDevices} style={{
                padding: '6px 14px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
                fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>{Icons.refresh} Refresh</button>
            </div>

            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px var(--space-5)', color: 'var(--color-text-muted)', fontSize: 14 }}>
                <div style={{ marginBottom: 'var(--space-2)' }}>{Icons.wifi}</div>
                <div>Scanning for nearby DEX devices...</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Make sure other devices have DEX running and are on the same network</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {devices.map(device => (
                  <div key={device.deviceId} onContextMenu={e => showCtxMenu(e, buildDeviceCtxItems(device))} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderRadius: 10,
                    background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border-subtle)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 8,
                        background: 'rgba(100,210,255,0.1)', border: '1px solid rgba(100,210,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)',
                      }}>{getDeviceIcon(device.deviceType)}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            value={deviceNicknames[device.deviceId] || device.deviceName}
                            onChange={e => setNickname(device.deviceId, e.target.value)}
                            onBlur={e => { if (!e.target.value.trim()) setNickname(device.deviceId, device.deviceName); }}
                            style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', background: 'none', border: 'none', padding: 0, outline: 'none', width: '140px' }}
                            title="Click to edit nickname"
                          />
                          <button onClick={() => toggleTrusted(device.deviceId)} title={trustedDevices.has(device.deviceId) ? 'Trusted device' : 'Mark as trusted'} style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                            color: trustedDevices.has(device.deviceId) ? 'var(--color-success)' : 'var(--color-text-muted)', opacity: trustedDevices.has(device.deviceId) ? 1 : 0.4,
                          }}>{Icons.shield}</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 3 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{device.deviceType}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {getConnectionIcon(device.connectionType)} {device.connectionType}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            ~{device.estimatedSpeedMbps >= 1000 ? `${(device.estimatedSpeedMbps / 1000).toFixed(0)} Gbps` : `${device.estimatedSpeedMbps} Mbps`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => sendToDevice(device)} disabled={sending} style={{
                      padding: 'var(--space-2) 18px', borderRadius: 6, border: 'none',
                      background: 'rgba(48,209,88,0.15)', color: 'var(--color-success)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, opacity: sending ? 0.5 : 1,
                    }}>{Icons.send} Send Files</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Active Transfers Tab ---- */}
        {activeTab === 'active' && (
          <div>
            {pendingDevices.length > 0 && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>Incoming Connection Requests</div>
                {pendingDevices.map(pd => (
                  <div key={pd.deviceId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)', borderRadius: 8, marginBottom: 6,
                    background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {Icons.shield}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{pd.deviceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{pd.deviceType} wants to send files</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button onClick={() => approveDevice(pd.deviceId)} style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: 'rgba(48,209,88,0.15)', color: 'var(--color-success)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Accept</button>
                      <button onClick={() => denyDevice(pd.deviceId)} style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTransfers.length === 0 && pendingDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px var(--space-5)', color: 'var(--color-text-muted)', fontSize: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, background: 'rgba(50,213,75,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-3)' }}>
                  <span style={{ fontSize: 24, color: 'var(--color-success, #32D54B)' }}>{Icons.send}</span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No active transfers</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 'var(--space-3)' }}>Select a device above to start sharing files</div>
                <button onClick={async () => {
                  try {
                    const result = await window.dex?.transfer?.selectFiles?.();
                    if (result?.filePaths?.length) {
                      toast.success(`${result.filePaths.length} file(s) ready — select a device to send`);
                    }
                  } catch { /* dialog unavailable */ }
                }} style={{ padding: '6px var(--space-4)', borderRadius: 6, background: 'var(--color-accent, #0a84ff)', color: 'var(--color-text-inverse, #fff)', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Select Files to Send</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeTransfers.map(t => (
                  <div key={t.transferId} onContextMenu={e => showCtxMenu(e, buildTransferCtxItems(t))} style={{
                    padding: 'var(--space-4) 18px', borderRadius: 10,
                    background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {t.status === 'bandwidth-test' ? 'Measuring bandwidth...' : t.status === 'verifying' ? 'Verifying...' : `Sending ${formatSize(t.totalBytes)}`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {formatSpeed(t.speed)} {t.streamCount > 0 && `| ${t.streamCount} streams`} | ETA: {formatTime(t.timeRemainingMs)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => pauseTransfer(t.transferId)} title="Pause" aria-label="Pause transfer" style={{
                          width: 28, height: 28, borderRadius: 4, border: '1px solid var(--color-border-subtle)',
                          background: 'var(--color-bg-elevated)', color: 'var(--color-text-muted)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{Icons.pause}</button>
                        <button onClick={() => cancelTransfer(t.transferId)} title="Cancel" aria-label="Cancel transfer" style={{
                          width: 28, height: 28, borderRadius: 4, border: '1px solid rgba(255,69,58,0.3)',
                          background: 'rgba(255,69,58,0.08)', color: 'var(--color-error)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>{Icons.close}</button>
                      </div>
                    </div>
                    {/* Transfer status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500 }}>
                        {Icons.shield} Protected transfer
                      </span>
                      {speedLimit > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>| Limit: {speedLimit} MB/s</span>
                      )}
                    </div>
                    <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                      <div style={{ width: `${t.progress}%`, height: '100%', borderRadius: 2, background: 'var(--color-accent)', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatSize(t.sentBytes)} / {formatSize(t.totalBytes)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>{t.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- History Tab ---- */}
        {activeTab === 'history' && (
          <div>
            {history.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 14 }}>
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search history..." style={{
                    flex: 1, padding: 'var(--space-2) 14px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
                    fontSize: 12, outline: 'none',
                  }}
                />
                <button onClick={clearHistory} style={{
                  padding: 'var(--space-2) 14px', borderRadius: 6, border: '1px solid rgba(255,69,58,0.2)',
                  background: 'rgba(255,69,58,0.08)', color: 'var(--color-error)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Clear All</button>
              </div>
            )}
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px var(--space-5)', color: 'var(--color-text-muted)', fontSize: 14 }}>
                <div style={{ marginBottom: 'var(--space-2)' }}>{Icons.history}</div>
                No transfer history yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.filter(h => !searchQuery || h.deviceName.toLowerCase().includes(searchQuery.toLowerCase())).map(h => (
                  <div key={h.id} onContextMenu={e => showCtxMenu(e, buildHistoryCtxItems(h))} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)', borderRadius: 8,
                    background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-bg-hover)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ color: h.direction === 'receive' ? 'var(--color-success)' : 'var(--color-accent)' }}>
                        {h.direction === 'receive' ? Icons.receive : Icons.send}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{h.deviceName}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {h.fileCount} file{h.fileCount !== 1 ? 's' : ''} | {formatSize(h.totalBytes)} | {formatSpeed(h.averageSpeed)}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{new Date(h.completedAt).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- HTTP Share Tab ---- */}
        {activeTab === 'http' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Share files via HTTP link for browser access</div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button onClick={httpShareFiles} disabled={busy} style={{
                  padding: '7px var(--space-4)', borderRadius: 8, border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}>{Icons.file} Add Files</button>
                <button onClick={httpServerRunning ? stopHttpServer : startHttpServer} disabled={busy} style={{
                  padding: '7px var(--space-4)', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: httpServerRunning ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)',
                  color: httpServerRunning ? 'var(--color-error)' : 'var(--color-success)',
                  fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>{httpServerRunning ? 'Stop Server' : 'Start Server'}</button>
              </div>
            </div>

            {httpServerRunning && httpServerUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{
                  padding: 'var(--space-5)', borderRadius: 10,
                  background: 'var(--color-bg-surface-solid)', border: '1px solid var(--color-border-subtle)', textAlign: 'center',
                }}>
                  <div className="dex-label-caps" style={{ marginBottom: 'var(--space-3)' }}>Share URL</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                    <div onClick={copyUrl} role="button" tabIndex={0} aria-label="Copy share URL" onKeyDown={e => e.key === 'Enter' && copyUrl()} style={{
                      fontSize: 13, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontWeight: 600,
                      padding: 'var(--space-2) 14px', background: 'var(--color-bg-elevated)', borderRadius: 6,
                      border: '1px solid var(--color-border-subtle)', cursor: 'pointer', userSelect: 'all',
                    }}>{httpServerUrl}</div>
                    <button onClick={copyUrl} style={{
                      padding: 'var(--space-2) 14px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                      background: copied ? 'rgba(48,209,88,0.15)' : 'var(--color-bg-elevated)',
                      color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
                      fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}>{copied ? Icons.check : Icons.copy} {copied ? 'Copied' : 'Copy'}</button>
                  </div>
                  <div ref={qrWrapperRef} style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <QRCodeCanvas url={httpServerUrl} size={160} />
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Scan to open on another device</span>
                    <button onClick={downloadQR} style={{
                      marginTop: 6, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                      background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)',
                      fontSize: 11, cursor: 'pointer', fontWeight: 500,
                    }}>Download QR</button>
                  </div>
                </div>

                {httpSharedFiles.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Shared Files ({httpSharedFiles.length})</div>
                    {httpSharedFiles.map(f => (
                      <div key={f.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 6, marginBottom: 4, background: 'var(--color-bg-elevated)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>{Icons.file}</span>
                          <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{f.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatSize(f.size)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.downloadCount} dl{f.downloadCount !== 1 ? 's' : ''}</span>
                          <button onClick={() => httpRemoveFile(f.id)} title="Remove file" style={{
                            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                            color: 'var(--color-text-muted)', opacity: 0.6,
                          }}>{Icons.close}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingUploads.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Incoming Uploads</div>
                    {pendingUploads.map(u => (
                      <div key={u.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 6, marginBottom: 4,
                        background: 'rgba(255,159,10,0.05)', border: '1px solid rgba(255,159,10,0.15)',
                      }}>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{u.fileName}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatSize(u.fileSize)} from {u.senderIp}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => acceptUpload(u.id, true)} style={{
                            padding: '5px var(--space-3)', borderRadius: 4, border: 'none',
                            background: 'rgba(48,209,88,0.15)', color: 'var(--color-success)',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}>Accept</button>
                          <button onClick={() => acceptUpload(u.id, false)} style={{
                            padding: '5px var(--space-3)', borderRadius: 4, border: 'none',
                            background: 'rgba(255,69,58,0.15)', color: 'var(--color-error)',
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}>Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px var(--space-5)', color: 'var(--color-text-muted)', fontSize: 14 }}>
                <div style={{ marginBottom: 'var(--space-2)' }}>{Icons.server}</div>
                <div>Start the HTTP server to share files via link</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Other devices can access shared files through a browser</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Settings Panel ===== */}
      {showSettings && (
        <div style={{
          position: 'absolute', right: 16, top: 56, width: 'min(320px, calc(100vw - 48px))', zIndex: 2000,
          background: 'var(--color-bg-surface-solid)',
          borderRadius: 10, border: '1px solid var(--color-border)',
          boxShadow: 'var(--pg-shadow-popover)', overflow: 'hidden',
        }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Transfer Settings</span>
            <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>{Icons.close}</button>
          </div>
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Auto-accept */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Auto-Accept</div>
              <button onClick={() => setAutoAccept(v => !v)} style={{
                width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 6,
                border: '1px solid ' + (autoAccept ? 'rgba(48,209,88,0.3)' : 'var(--color-border-subtle)'),
                background: autoAccept ? 'rgba(48,209,88,0.08)' : 'var(--color-bg-elevated)',
                color: autoAccept ? 'var(--color-success)' : 'var(--color-text-muted)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
              }}>
                {autoAccept ? 'Auto-accept from trusted devices' : 'Manual approval required'}
              </button>
              {trustedDevices.size > 0 && (
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>{trustedDevices.size} trusted device{trustedDevices.size !== 1 ? 's' : ''}</div>
              )}
            </div>

            {/* Download Location */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Download Location</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{
                  flex: 1, padding: 'var(--space-2) var(--space-3)', borderRadius: 6,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-elevated)',
                  color: downloadLocation ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {downloadLocation || 'System Downloads folder'}
                </div>
                <button onClick={async () => {
                  try {
                    const result = await (window as any).dex?.dialog?.showOpenDialog?.({ properties: ['openDirectory'], title: 'Choose Download Location' });
                    if (result && !result.canceled && result.filePaths?.[0]) {
                      const dir = result.filePaths[0];
                      setDownloadLocation(dir);
                      localStorage.setItem('dex-transfer-download-dir', dir);
                    }
                  } catch { /* dialog unavailable */ }
                }} style={{
                  padding: 'var(--space-2) var(--space-3)', borderRadius: 6,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-elevated)',
                  color: 'var(--color-accent)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Browse</button>
              </div>
              {downloadLocation && (
                <button onClick={() => { setDownloadLocation(''); localStorage.removeItem('dex-transfer-download-dir'); }} style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>Reset to default</button>
              )}
            </div>

            {/* Speed Limit */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Speed Limit</span>
                <span style={{ fontSize: 11, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{speedLimit === 0 ? 'Unlimited' : `${speedLimit} MB/s`}</span>
              </div>
              <input type="range" min="0" max="1000" step="10" value={speedLimit}
                onChange={e => setSpeedLimit(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
            </div>

            {/* HTTP Password */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>HTTP Password Protection</div>
              <input
                type="password" value={httpPassword}
                onChange={e => setHttpPassword(e.target.value)}
                placeholder="No password (open access)"
                style={{
                  width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
                  fontSize: 12, outline: 'none',
                }}
              />
            </div>

            {/* HTTP Expiry */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Auto-Stop Server</span>
                <span style={{ fontSize: 11, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{httpExpiry === 0 ? 'Never' : `${httpExpiry}m`}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 5, 15, 30, 60].map(v => (
                  <button key={v} onClick={() => setHttpExpiry(v)} style={{
                    flex: 1, padding: '5px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid ' + (httpExpiry === v ? 'var(--color-accent-light, rgba(10,132,255,0.3))' : 'var(--color-border-subtle)'),
                    background: httpExpiry === v ? 'var(--color-accent-muted, rgba(10,132,255,0.12))' : 'var(--color-bg-elevated)',
                    color: httpExpiry === v ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  }}>{v === 0 ? 'Off' : `${v}m`}</button>
                ))}
              </div>
            </div>

            {/* Transfer sounds */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Sound on complete</span>
              <div style={{ flex: 1 }} />
              <div onClick={() => setSoundEnabled(p => !p)} style={{ width: 32, height: 18, borderRadius: 8, background: soundEnabled ? 'rgba(48,209,88,0.3)' : 'var(--color-text-tertiary)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 14, height: 14, borderRadius: 6, background: soundEnabled ? 'var(--color-success)' : 'var(--color-text-muted)', position: 'absolute', top: 2, transition: 'all 0.2s', ...(soundEnabled ? { right: 2 } : { left: 2 }) }} />
              </div>
            </div>
          </div>
        </div>
      )}
      {ctxMenuState && <ContextMenu items={ctxMenuState.items} position={ctxMenuState.position} onClose={closeCtxMenu} />}
    </div>
  );
};

Transfers.displayName = 'Transfers';
const MemoizedTransfers = memo(Transfers);
export { Transfers };
export default MemoizedTransfers;
