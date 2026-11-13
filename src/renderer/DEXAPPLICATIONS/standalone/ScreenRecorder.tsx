/**
 * DEX Platform - Screen Recorder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Captures screen via getDisplayMedia + MediaRecorder, mixes optional mic audio,
 * exports webm/mp4, and supports still-frame screenshots.
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassPanel, premiumGlassToolbar } from '../../styles/glassMenu';

type RecState = 'idle' | 'countdown' | 'recording' | 'paused';
type CaptureMode = 'screen' | 'window' | 'browser';
type OutputFormat = 'webm-vp9' | 'webm-vp8' | 'mp4';

interface RecentCapture {
  id: string;
  name: string;
  url: string;
  size: number;
  kind: 'video' | 'image';
  createdAt: number;
}

interface FormatOption {
  id: OutputFormat;
  label: string;
  mimeType: string;
  ext: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'webm-vp9', label: 'WebM (VP9)', mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM (VP8)', mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { id: 'mp4', label: 'MP4 (H.264)', mimeType: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
];

const FRAME_RATES = [15, 24, 30, 60];

const pad = (n: number) => n.toString().padStart(2, '0');
const fmtClock = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const fmtTimestamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
const fmtBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toast = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
  window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } }));
};

// Resolve a usable MediaRecorder mime type from the preferred format, with graceful fallback.
const resolveMimeType = (preferred: OutputFormat): { mimeType: string; ext: string } => {
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  const ordered = [
    ...FORMAT_OPTIONS.filter(f => f.id === preferred),
    ...FORMAT_OPTIONS.filter(f => f.id !== preferred),
  ];
  for (const opt of ordered) {
    if (!canRecord || MediaRecorder.isTypeSupported(opt.mimeType)) {
      return { mimeType: opt.mimeType, ext: opt.ext };
    }
  }
  // Last-resort container with no codec hint.
  if (canRecord && MediaRecorder.isTypeSupported('video/webm')) return { mimeType: 'video/webm', ext: 'webm' };
  return { mimeType: '', ext: 'webm' };
};

const ScreenRecorder: React.FC = () => {
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Capture options
  const [captureMode, setCaptureMode] = useState<CaptureMode>('screen');
  const [systemAudio, setSystemAudio] = useState(true);
  const [micAudio, setMicAudio] = useState(false);
  const [format, setFormat] = useState<OutputFormat>('webm-vp9');
  const [frameRate, setFrameRate] = useState(30);
  const [countdownSecs, setCountdownSecs] = useState(3);

  const [recent, setRecent] = useState<RecentCapture[]>([]);
  const [supported] = useState(() =>
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function');

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeMimeRef = useRef<{ mimeType: string; ext: string }>({ mimeType: '', ext: 'webm' });
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  // Track recent capture object URLs so we can revoke them on unmount.
  const recentUrlsRef = useRef<string[]>([]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Stop every track on every captured stream and detach the preview.
  const cleanupStreams = useCallback(() => {
    [displayStreamRef, micStreamRef, recordStreamRef].forEach(ref => {
      if (ref.current) {
        ref.current.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
        ref.current = null;
      }
    });
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const pushRecent = useCallback((capture: RecentCapture) => {
    recentUrlsRef.current.push(capture.url);
    setRecent(prev => [capture, ...prev].slice(0, 12));
  }, []);

  const triggerDownload = useCallback((url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  // Cleanup on unmount: timers, live streams, in-flight recorder, and object URLs.
  useEffect(() => () => {
    stopTimer();
    clearCountdown();
    cleanupStreams();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    recentUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
    recentUrlsRef.current = [];
  }, [stopTimer, clearCountdown, cleanupStreams]);

  // Build the combined recording stream and start the MediaRecorder.
  const beginRecording = useCallback(async () => {
    setErrorMsg(null);
    chunksRef.current = [];

    if (!supported) {
      const msg = 'Screen capture is not available in this environment.';
      setErrorMsg(msg);
      toast('error', msg);
      setState('idle');
      return;
    }

    let displayStream: MediaStream;
    try {
      const displayConstraints: DisplayMediaStreamOptions = {
        video: {
          frameRate: { ideal: frameRate, max: frameRate },
          // displaySurface hints the picker toward the chosen capture mode.
          displaySurface: captureMode === 'window' ? 'window' : captureMode === 'browser' ? 'browser' : 'monitor',
        } as MediaTrackConstraints,
        audio: systemAudio,
      };
      displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
    } catch (err) {
      // User cancelled the picker, denied permission, or the API is blocked.
      const aborted = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError');
      const msg = aborted
        ? 'Screen capture was cancelled.'
        : 'Screen capture failed. Check recording permissions and try again.';
      setErrorMsg(aborted ? null : msg);
      toast(aborted ? 'info' : 'error', msg);
      setState('idle');
      return;
    }

    displayStreamRef.current = displayStream;

    // Optionally capture the microphone and mix it with system audio.
    const audioTracks: MediaStreamTrack[] = [...displayStream.getAudioTracks()];
    if (micAudio) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = micStream;
        audioTracks.push(...micStream.getAudioTracks());
      } catch {
        toast('warning', 'Microphone unavailable — recording without mic.');
      }
    }

    // Assemble the final recording stream (video + all collected audio tracks).
    const recordStream = new MediaStream();
    displayStream.getVideoTracks().forEach(t => recordStream.addTrack(t));
    audioTracks.forEach(t => recordStream.addTrack(t));
    recordStreamRef.current = recordStream;

    if (previewRef.current) {
      previewRef.current.srcObject = displayStream;
      previewRef.current.play().catch(() => { /* ignore autoplay rejection */ });
    }

    // If the user stops sharing from the browser's native bar, end the recording cleanly.
    const videoTrack = displayStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.onended = () => { handleStopRef.current?.(); };

    const resolved = resolveMimeType(format);
    activeMimeRef.current = resolved;

    let recorder: MediaRecorder;
    try {
      recorder = resolved.mimeType
        ? new MediaRecorder(recordStream, { mimeType: resolved.mimeType })
        : new MediaRecorder(recordStream);
    } catch (err) {
      console.error('[ScreenRecorder] MediaRecorder init failed:', err);
      toast('error', 'Could not start the recorder with the selected format.');
      cleanupStreams();
      setState('idle');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const type = (recorder.mimeType || resolved.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size === 0) return;
      const url = URL.createObjectURL(blob);
      const name = `dex-screen-${fmtTimestamp(new Date())}.${resolved.ext}`;
      pushRecent({ id: `${Date.now()}`, name, url, size: blob.size, kind: 'video', createdAt: Date.now() });
      toast('success', `Recording saved (${fmtBytes(blob.size)})`);
    };

    try {
      recorder.start(1000);
    } catch (err) {
      console.error('[ScreenRecorder] recorder.start failed:', err);
      toast('error', 'Recorder failed to start.');
      cleanupStreams();
      setState('idle');
      return;
    }

    setElapsed(0);
    setState('recording');
    stopTimer();
    timerRef.current = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
  }, [supported, frameRate, captureMode, systemAudio, micAudio, format, cleanupStreams, pushRecent, stopTimer]);

  // Run the configurable countdown, then begin recording.
  const handleStart = useCallback(() => {
    if (state !== 'idle') return;
    if (!supported) {
      const msg = 'Screen capture is not available in this environment.';
      setErrorMsg(msg);
      toast('error', msg);
      return;
    }
    if (countdownSecs <= 0) {
      beginRecording();
      return;
    }
    setErrorMsg(null);
    setCountdown(countdownSecs);
    setState('countdown');
    clearCountdown();
    countdownRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearCountdown();
          beginRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [state, supported, countdownSecs, beginRecording, clearCountdown]);

  const handlePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (state === 'recording' && rec.state === 'recording') {
      try { rec.pause(); } catch { return; }
      stopTimer();
      setState('paused');
    } else if (state === 'paused' && rec.state === 'paused') {
      try { rec.resume(); } catch { return; }
      setState('recording');
      stopTimer();
      timerRef.current = window.setInterval(() => setElapsed(p => p + 1), 1000);
    }
  }, [state, stopTimer]);

  const handleStop = useCallback(() => {
    stopTimer();
    clearCountdown();
    if (state === 'countdown') {
      setCountdown(0);
      setState('idle');
      return;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* noop */ }
    }
    cleanupStreams();
    setState('idle');
  }, [state, stopTimer, clearCountdown, cleanupStreams]);

  // Keep a stable ref to handleStop so the track 'onended' handler always calls the latest version.
  const handleStopRef = useRef<typeof handleStop>(handleStop);
  useEffect(() => { handleStopRef.current = handleStop; }, [handleStop]);

  // Capture a single still frame from a fresh display stream.
  const captureStill = useCallback(async (mode: 'download' | 'clipboard') => {
    if (!supported) {
      toast('error', 'Screen capture is not available in this environment.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: captureMode === 'window' ? 'window' : captureMode === 'browser' ? 'browser' : 'monitor' } as MediaTrackConstraints,
        audio: false,
      });
    } catch (err) {
      const aborted = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError');
      if (!aborted) toast('error', 'Screenshot capture failed.');
      return;
    }

    try {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => { /* ignore */ });
      // Wait for the first frame so canvas draw is non-empty.
      await new Promise<void>(resolve => {
        if (video.readyState >= 2) { resolve(); return; }
        const t = window.setTimeout(() => resolve(), 600);
        video.onloadeddata = () => { window.clearTimeout(t); resolve(); };
      });

      const w = video.videoWidth || 1920;
      const h = video.videoHeight || 1080;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas context unavailable');
      ctx.drawImage(video, 0, 0, w, h);

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
      if (!blob) throw new Error('encode failed');

      if (mode === 'clipboard') {
        try {
          // ClipboardItem may be undefined in some environments.
          const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
          if (navigator.clipboard && ClipboardItemCtor) {
            await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
            toast('success', 'Screenshot copied to clipboard');
          } else {
            throw new Error('clipboard image write unsupported');
          }
        } catch {
          // Fall back to a download if clipboard image write is blocked.
          const url = URL.createObjectURL(blob);
          const name = `dex-shot-${fmtTimestamp(new Date())}.png`;
          triggerDownload(url, name);
          pushRecent({ id: `${Date.now()}`, name, url, size: blob.size, kind: 'image', createdAt: Date.now() });
          toast('warning', 'Clipboard blocked — screenshot downloaded instead.');
        }
      } else {
        const url = URL.createObjectURL(blob);
        const name = `dex-shot-${fmtTimestamp(new Date())}.png`;
        triggerDownload(url, name);
        pushRecent({ id: `${Date.now()}`, name, url, size: blob.size, kind: 'image', createdAt: Date.now() });
        toast('success', 'Screenshot saved');
      }
    } catch (err) {
      console.error('[ScreenRecorder] still capture failed:', err);
      toast('error', 'Could not grab the frame.');
    } finally {
      stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
    }
  }, [supported, captureMode, triggerDownload, pushRecent]);

  const removeRecent = useCallback((id: string) => {
    setRecent(prev => {
      const target = prev.find(r => r.id === id);
      if (target) {
        try { URL.revokeObjectURL(target.url); } catch { /* noop */ }
        recentUrlsRef.current = recentUrlsRef.current.filter(u => u !== target.url);
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const busy = state !== 'idle';
  const optionsDisabled = busy;
  const startDisabled = busy || !supported;
  const pauseDisabled = state !== 'recording' && state !== 'paused';
  const stopDisabled = state === 'idle';

  const statusLabel =
    state === 'idle' ? 'Ready' :
    state === 'countdown' ? 'Starting…' :
    state === 'recording' ? 'Recording' : 'Paused';
  const statusColor =
    state === 'recording' ? 'var(--color-error)' :
    state === 'paused' ? 'var(--color-warning)' :
    state === 'countdown' ? 'var(--color-accent)' : 'var(--color-text-secondary)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family)',
    }}>
      {/* Header / toolbar */}
      <div style={{ ...premiumGlassToolbar, padding: '10px var(--space-4)', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DexIcon name="video" size={18} color="var(--color-text-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Screen Recorder</span>
        </div>
        <span style={{
          fontSize: 13, fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-secondary)', minWidth: 56, textAlign: 'right',
        }}>{fmtClock(elapsed)}</span>
      </div>

      {/* Options row */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center',
        padding: '8px var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-elevated)',
      }}>
        <label style={fieldLabelStyle}>
          Capture
          <select
            value={captureMode}
            disabled={optionsDisabled}
            onChange={e => setCaptureMode(e.target.value as CaptureMode)}
            style={selectStyle(optionsDisabled)}
            aria-label="Capture mode"
          >
            <option value="screen">Full screen</option>
            <option value="window">Window</option>
            <option value="browser">Browser tab</option>
          </select>
        </label>

        <label style={fieldLabelStyle}>
          Format
          <select
            value={format}
            disabled={optionsDisabled}
            onChange={e => setFormat(e.target.value as OutputFormat)}
            style={selectStyle(optionsDisabled)}
            aria-label="Output format"
          >
            {FORMAT_OPTIONS.map(f => {
              const ok = typeof MediaRecorder === 'undefined' ||
                typeof MediaRecorder.isTypeSupported !== 'function' ||
                MediaRecorder.isTypeSupported(f.mimeType);
              return (
                <option key={f.id} value={f.id} disabled={!ok}>
                  {f.label}{ok ? '' : ' (unsupported)'}
                </option>
              );
            })}
          </select>
        </label>

        <label style={fieldLabelStyle}>
          FPS
          <select
            value={frameRate}
            disabled={optionsDisabled}
            onChange={e => setFrameRate(Number(e.target.value))}
            style={selectStyle(optionsDisabled)}
            aria-label="Frame rate"
          >
            {FRAME_RATES.map(fr => <option key={fr} value={fr}>{fr}</option>)}
          </select>
        </label>

        <label style={fieldLabelStyle}>
          Countdown
          <select
            value={countdownSecs}
            disabled={optionsDisabled}
            onChange={e => setCountdownSecs(Number(e.target.value))}
            style={selectStyle(optionsDisabled)}
            aria-label="Countdown"
          >
            <option value={0}>Off</option>
            <option value={3}>3s</option>
            <option value={5}>5s</option>
            <option value={10}>10s</option>
          </select>
        </label>

        <label style={toggleLabelStyle(optionsDisabled)}>
          <input
            type="checkbox"
            checked={systemAudio}
            disabled={optionsDisabled}
            onChange={e => setSystemAudio(e.target.checked)}
            aria-label="System audio"
          />
          System audio
        </label>

        <label style={toggleLabelStyle(optionsDisabled)}>
          <input
            type="checkbox"
            checked={micAudio}
            disabled={optionsDisabled}
            onChange={e => setMicAudio(e.target.checked)}
            aria-label="Microphone audio"
          />
          Microphone
        </label>
      </div>

      {/* Preview + recent area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
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
                display: state === 'recording' || state === 'paused' ? 'block' : 'none',
              }}
            />
            {(state === 'idle' || state === 'countdown') && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--color-text-muted)' }}>
                {state === 'countdown' ? (
                  <span style={{ fontSize: 72, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {countdown}
                  </span>
                ) : (
                  <>
                    <DexIcon name="video" size={48} color="var(--color-text-muted)" />
                    <span style={{ fontSize: 13 }}>
                      {supported ? 'Press Start to begin recording' : 'Screen capture unavailable here'}
                    </span>
                  </>
                )}
              </div>
            )}
            {state === 'recording' && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 9999,
                background: 'rgba(255,69,58,0.18)', border: '1px solid rgba(255,69,58,0.4)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-error)' }} />
                <span style={{ fontSize: 11, color: 'var(--color-error)', fontWeight: 600, letterSpacing: 0.4 }}>REC</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
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
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border-subtle)', margin: '0 var(--space-1)' }} />
            <button
              onClick={() => captureStill('download')}
              disabled={busy || !supported}
              style={controlButtonStyle(busy || !supported, 'var(--color-accent)')}
            >Screenshot</button>
            <button
              onClick={() => captureStill('clipboard')}
              disabled={busy || !supported}
              style={controlButtonStyle(busy || !supported, 'var(--color-bg-hover)', 'var(--color-text-primary)')}
            >Copy frame</button>
          </div>
        </div>

        {/* Recent captures */}
        <div className="dex-liquid-glass-strong" style={{
          width: 260, borderRadius: 0, display: 'flex', flexDirection: 'column',
          minHeight: 0,
        }}>
          <div style={{
            padding: '10px var(--space-3)', fontSize: 12, fontWeight: 600,
            color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)',
          }}>Recent captures</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
            {recent.length === 0 ? (
              <div style={{ padding: 'var(--space-3)', fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No captures yet.
              </div>
            ) : recent.map(item => (
              <div key={item.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: 'var(--space-2)',
                marginBottom: 'var(--space-2)', borderRadius: 10,
                background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DexIcon name={item.kind === 'image' ? 'image' : 'video'} size={14} color="var(--color-text-secondary)" />
                  <span style={{
                    fontSize: 11, color: 'var(--color-text-primary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }} title={item.name}>{item.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{fmtBytes(item.size)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => triggerDownload(item.url, item.name)}
                      style={miniButtonStyle('var(--color-accent)')}
                    >Download</button>
                    <button
                      onClick={() => removeRecent(item.id)}
                      style={miniButtonStyle('var(--color-bg-hover)', 'var(--color-text-secondary)')}
                    >Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500,
};

function selectStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 8px', borderRadius: 10, fontSize: 12,
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border-subtle)',
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function toggleLabelStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500,
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

function controlButtonStyle(disabled: boolean, accent: string, textColor = '#fff'): React.CSSProperties {
  return {
    padding: 'var(--space-2) 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    background: disabled ? 'var(--color-bg-hover)' : accent,
    color: disabled ? 'var(--color-text-muted)' : textColor,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'opacity 120ms ease, transform 100ms ease',
    minWidth: 88,
  };
}

function miniButtonStyle(bg: string, textColor = '#fff'): React.CSSProperties {
  return {
    padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500,
    background: bg, color: textColor, border: 'none', cursor: 'pointer',
  };
}

export default memo(ScreenRecorder);
