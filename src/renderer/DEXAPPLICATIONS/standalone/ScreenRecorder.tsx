/**
 * DEX Platform - Screen Recorder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Captures screen via desktopCapturer + MediaRecorder, exports webm
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassPanel, premiumGlassToolbar } from '../../styles/glassMenu';

interface CaptureSource {
  id: string;
  name: string;
  thumbnail?: string;
}

type RecState = 'idle' | 'recording' | 'paused';

const FALLBACK_SOURCE: CaptureSource = { id: 'screen:0', name: 'Primary Display' };

const pad = (n: number) => n.toString().padStart(2, '0');
const fmtClock = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const fmtTimestamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

const ScreenRecorder: React.FC = () => {
  const [sources, setSources] = useState<CaptureSource[]>([FALLBACK_SOURCE]);
  const [selectedId, setSelectedId] = useState<string>(FALLBACK_SOURCE.id);
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // Load capture sources via IPC, fall back to single primary display
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await window.electron?.invoke?.<CaptureSource[]>('screencapture:getSources');
        if (!cancelled && Array.isArray(result) && result.length > 0) {
          setSources(result);
          setSelectedId(result[0].id);
        }
      } catch {
        // keep fallback
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    stopTimer();
    cleanupStream();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
  }, [stopTimer, cleanupStream]);

  const handleStart = useCallback(async () => {
    setErrorMsg(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    chunksRef.current = [];

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        // Electron-specific desktop capture constraints (cast for TS)
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedId,
          },
        } as unknown as MediaTrackConstraints,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => { /* ignore autoplay rejection */ });
      }

      const preferred = 'video/webm;codecs=vp9';
      const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const name = `dex-screen-${fmtTimestamp(new Date())}.webm`;
        setDownloadUrl(url);
        setDownloadName(name);
      };

      recorder.start(1000);
      setElapsed(0);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[ScreenRecorder] capture failed:', err);
      setErrorMsg('Screen capture failed. Please check recording permissions and try again.');
      cleanupStream();
      setState('idle');
    }
  }, [selectedId, downloadUrl, cleanupStream]);

  const handlePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (state === 'recording' && rec.state === 'recording') {
      rec.pause();
      stopTimer();
      setState('paused');
    } else if (state === 'paused' && rec.state === 'paused') {
      rec.resume();
      setState('recording');
      timerRef.current = window.setInterval(() => setElapsed(p => p + 1), 1000);
    }
  }, [state, stopTimer]);

  const handleStop = useCallback(() => {
    const rec = recorderRef.current;
    stopTimer();
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* noop */ }
    }
    cleanupStream();
    setState('idle');
  }, [stopTimer, cleanupStream]);

  const startDisabled = state !== 'idle';
  const pauseDisabled = state === 'idle';
  const stopDisabled = state === 'idle';
  const sourceDisabled = state !== 'idle';

  const statusLabel = state === 'idle' ? 'Ready' : state === 'recording' ? 'Recording' : 'Paused';
  const statusColor =
    state === 'recording' ? 'var(--color-error)' : state === 'paused' ? 'var(--color-warning)' : 'var(--color-text-secondary)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-system)',
    }}>
      {/* Header / toolbar */}
      <div style={{ ...premiumGlassToolbar, padding: '10px var(--space-4)', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="video" size={18} color="var(--color-text-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Screen Recorder</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{
            fontSize: 13, fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-text-secondary)', minWidth: 56, textAlign: 'right',
          }}>{fmtClock(elapsed)}</span>
          <select
            value={selectedId}
            disabled={sourceDisabled}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-subtle)',
              opacity: sourceDisabled ? 0.5 : 1, cursor: sourceDisabled ? 'not-allowed' : 'pointer',
              minWidth: 200,
            }}
          >
            {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Preview area */}
      <div style={{ flex: 1, padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', overflow: 'hidden' }}>
        <div style={{
          ...premiumGlassPanel, flex: 1, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0c',
        }}>
          <video
            ref={previewRef}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              display: state === 'idle' && !downloadUrl ? 'none' : 'block',
            }}
          />
          {state === 'idle' && !downloadUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--color-text-muted)' }}>
              <DexIcon name="video" size={48} color="var(--color-text-muted)" />
              <span style={{ fontSize: 13 }}>Press Start to begin recording</span>
            </div>
          )}
          {state === 'recording' && (
            <div style={{
              position: 'absolute', top: 12, left: 12,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: 'rgba(255,69,58,0.18)', border: '1px solid rgba(255,69,58,0.4)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-error)' }} />
              <span style={{ fontSize: 11, color: 'var(--color-error)', fontWeight: 600, letterSpacing: 0.4 }}>REC</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={handleStart}
            disabled={startDisabled}
            style={controlButtonStyle(startDisabled, 'var(--color-error)')}
          >Start</button>
          <button
            onClick={handlePause}
            disabled={pauseDisabled}
            style={controlButtonStyle(pauseDisabled, 'var(--color-warning)')}
          >{state === 'paused' ? 'Resume' : 'Pause'}</button>
          <button
            onClick={handleStop}
            disabled={stopDisabled}
            style={controlButtonStyle(stopDisabled, 'var(--color-text-secondary)')}
          >Stop</button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={downloadName}
              style={{
                marginLeft: 'var(--space-2)', padding: 'var(--space-2) 14px', borderRadius: 6,
                background: 'var(--color-accent)', color: '#fff', textDecoration: 'none',
                fontSize: 13, fontWeight: 500,
              }}
            >Save recording</a>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        fontSize: 11, color: 'var(--color-text-muted)',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
        <span style={{ color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
        {errorMsg && <span style={{ color: 'var(--color-error)', marginLeft: 'var(--space-2)' }}>{errorMsg}</span>}
      </div>
    </div>
  );
};

function controlButtonStyle(disabled: boolean, accent: string): React.CSSProperties {
  return {
    padding: 'var(--space-2) 18px', borderRadius: 6, fontSize: 13, fontWeight: 500,
    background: disabled ? 'var(--color-bg-hover)' : accent,
    color: disabled ? 'var(--color-text-muted)' : '#fff',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'opacity 120ms ease, transform 100ms ease',
    minWidth: 88,
  };
}

export default memo(ScreenRecorder);
