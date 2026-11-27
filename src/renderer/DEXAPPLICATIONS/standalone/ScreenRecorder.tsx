/**
 * DEX Platform - Screen Recorder
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Captures screen via getDisplayMedia + MediaRecorder, mixes optional mic audio,
 * exports webm/mp4, and supports still-frame screenshots.
 */
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { premiumGlassPanel, premiumGlassToolbar } from '../../styles/glassMenu';
import { useRunningApps } from '../../store/runningApps';
import { Button } from '../../ui/Button';

type RecState = 'idle' | 'choosing' | 'countdown' | 'recording' | 'paused' | 'finishing' | 'capturing';
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
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'webm-vp9', label: 'WebM (VP9)', mimeType: 'video/webm;codecs=vp9,opus' },
  { id: 'webm-vp8', label: 'WebM (VP8)', mimeType: 'video/webm;codecs=vp8,opus' },
  { id: 'mp4', label: 'MP4 (H.264)', mimeType: 'video/mp4;codecs=h264,aac' },
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

function stopTracks(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

// Resolve a usable MediaRecorder mime type from the preferred format, with graceful fallback.
const resolveMimeType = (preferred: OutputFormat): string => {
  const canRecord = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function';
  const ordered = [
    ...FORMAT_OPTIONS.filter(f => f.id === preferred),
    ...FORMAT_OPTIONS.filter(f => f.id !== preferred),
  ];
  for (const opt of ordered) {
    if (!canRecord || MediaRecorder.isTypeSupported(opt.mimeType)) {
      return opt.mimeType;
    }
  }
  // Last-resort container with no codec hint.
  return canRecord && MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mixerRef = useRef<AudioContext | null>(null);
  const captureRequest = useRef(0);
  const phase = useRef<RecState>('idle');
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  // Track recent capture object URLs so we can revoke them on unmount.
  const capturesRef = useRef<RecentCapture[]>([]);

  const changePhase = useCallback((next: RecState) => {
    phase.current = next;
    setState(next);
  }, []);

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
    [displayStreamRef, micStreamRef].forEach(ref => {
      if (ref.current) {
        stopTracks(ref.current);
        ref.current = null;
      }
    });
    if (mixerRef.current) {
      void mixerRef.current.close().catch(() => {});
      mixerRef.current = null;
    }
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const pushRecent = useCallback((capture: RecentCapture) => {
    const captures = [capture, ...capturesRef.current];
    const evicted = captures.splice(12);
    evicted.forEach(item => URL.revokeObjectURL(item.url));
    capturesRef.current = captures;
    setRecent(captures);
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
    ++captureRequest.current;
    phase.current = 'idle';
    stopTimer();
    clearCountdown();
    cleanupStreams();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    recorderRef.current = null;
    capturesRef.current.forEach(item => URL.revokeObjectURL(item.url));
    capturesRef.current = [];
  }, [stopTimer, clearCountdown, cleanupStreams]);

  const handleStop = useCallback(() => {
    if (phase.current === 'idle' || phase.current === 'finishing') return;
    stopTimer();
    clearCountdown();
    const recorder = recorderRef.current;
    if (recorder) {
      changePhase('finishing');
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        cleanupStreams();
        return;
      } catch {
        recorderRef.current = null;
        setErrorMsg('The recording could not finish.');
      }
    }
    ++captureRequest.current;
    cleanupStreams();
    setCountdown(0);
    changePhase('idle');
  }, [stopTimer, clearCountdown, cleanupStreams, changePhase]);

  useEffect(() => useRunningApps.subscribe((state, previous) => {
    if (previous.runningApps.some(app => app.id === 'screenrecorder') &&
        !state.runningApps.some(app => app.id === 'screenrecorder')) handleStop();
  }), [handleStop]);

  const handleStart = useCallback(async () => {
    if (phase.current !== 'idle' || !supported || typeof MediaRecorder === 'undefined') return;
    const request = ++captureRequest.current;
    changePhase('choosing');
    setElapsed(0);
    setErrorMsg(null);

    let display: MediaStream;
    try {
      // The picker needs the user's click. Count down after a source is chosen.
      display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: frameRate, max: frameRate },
          displaySurface: captureMode === 'window' ? 'window' : captureMode === 'browser' ? 'browser' : 'monitor',
        } as MediaTrackConstraints,
        audio: systemAudio,
      });
    } catch (error) {
      if (request !== captureRequest.current) return;
      if (!(error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name))) {
        setErrorMsg('Screen capture failed. Check recording permissions and try again.');
      }
      changePhase('idle');
      return;
    }
    if (request !== captureRequest.current) { stopTracks(display); return; }
    displayStreamRef.current = display;
    const videoTrack = display.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState === 'ended') {
      cleanupStreams();
      setErrorMsg('The selected source is no longer available.');
      changePhase('idle');
      return;
    }
    videoTrack.onended = handleStop;

    if (micAudio) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (request !== captureRequest.current) { stopTracks(mic); return; }
        micStreamRef.current = mic;
      } catch {
        if (request !== captureRequest.current) return;
        toast('warning', 'Microphone unavailable. Recording without it.');
      }
    }

    const startRecorder = () => {
      if (request !== captureRequest.current) return;
      const resolved = resolveMimeType(format);
      const chunks: Blob[] = [];
      try {
        const audioTracks = [...display.getAudioTracks(), ...(micStreamRef.current?.getAudioTracks() ?? [])];
        const recording = new MediaStream([videoTrack]);
        if (audioTracks.length > 1) {
          const mixer = new AudioContext();
          mixerRef.current = mixer;
          const output = mixer.createMediaStreamDestination();
          for (const track of audioTracks) {
            mixer.createMediaStreamSource(new MediaStream([track])).connect(output);
          }
          recording.addTrack(output.stream.getAudioTracks()[0]);
          void mixer.resume().catch(() => {});
        } else if (audioTracks.length) {
          recording.addTrack(audioTracks[0]);
        }
        const recorder = resolved
          ? new MediaRecorder(recording, { mimeType: resolved })
          : new MediaRecorder(recording);
        recorderRef.current = recorder;
        recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
        recorder.onerror = () => {
          if (request === captureRequest.current) setErrorMsg('The recorder encountered an error.');
        };
        recorder.onstop = () => {
          if (request !== captureRequest.current) return;
          recorderRef.current = null;
          stopTimer();
          cleanupStreams();
          changePhase('idle');
          const type = (recorder.mimeType || resolved || 'video/webm').split(';')[0];
          const blob = new Blob(chunks, { type });
          if (!blob.size) { setErrorMsg('No video was captured.'); return; }
          const url = URL.createObjectURL(blob);
          const ext = type === 'video/mp4' ? 'mp4' : 'webm';
          const name = 'dex-screen-' + fmtTimestamp(new Date()) + '.' + ext;
          pushRecent({ id: url, name, url, size: blob.size, kind: 'video', createdAt: Date.now() });
          toast('success', 'Recording ready to download');
        };
        recorder.start(1000);
        if (previewRef.current) {
          previewRef.current.srcObject = display;
          void previewRef.current.play().catch(() => {});
        }
        changePhase('recording');
        timerRef.current = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
      } catch {
        recorderRef.current = null;
        cleanupStreams();
        setErrorMsg('The recorder could not start. Try a different format.');
        changePhase('idle');
      }
    };

    if (!countdownSecs) { startRecorder(); return; }
    let seconds = countdownSecs;
    setCountdown(seconds);
    changePhase('countdown');
    countdownRef.current = window.setInterval(() => {
      setCountdown(--seconds);
      if (seconds === 0) {
        clearCountdown();
        startRecorder();
      }
    }, 1000);
  }, [supported, frameRate, captureMode, systemAudio, micAudio, format, countdownSecs,
    changePhase, handleStop, clearCountdown, cleanupStreams, pushRecent, stopTimer]);

  const handlePause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (phase.current === 'recording' && recorder.state === 'recording') {
      try { recorder.pause(); } catch { return; }
      stopTimer();
      changePhase('paused');
    } else if (phase.current === 'paused' && recorder.state === 'paused') {
      try { recorder.resume(); } catch { return; }
      changePhase('recording');
      timerRef.current = window.setInterval(() => setElapsed(prev => prev + 1), 1000);
    }
  }, [stopTimer, changePhase]);

  // Capture a single still frame from a fresh display stream.
  const captureStill = useCallback(async (mode: 'download' | 'clipboard') => {
    if (!supported || phase.current !== 'idle') return;
    const request = ++captureRequest.current;
    const current = () => request === captureRequest.current;
    changePhase('capturing');
    setErrorMsg(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: captureMode === 'window' ? 'window' : captureMode === 'browser' ? 'browser' : 'monitor' } as MediaTrackConstraints,
        audio: false,
      });
    } catch (err) {
      if (!current()) return;
      const aborted = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError');
      if (!aborted) setErrorMsg('Screenshot capture failed.');
      changePhase('idle');
      return;
    }
    if (!current()) { stopTracks(stream); return; }
    displayStreamRef.current = stream;

    const video = document.createElement('video');
    try {
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => { /* ignore */ });
      // Wait for the first frame so canvas draw is non-empty.
      await new Promise<void>(resolve => {
        if (video.readyState >= 2) { resolve(); return; }
        const t = window.setTimeout(() => resolve(), 600);
        video.onloadeddata = () => { window.clearTimeout(t); resolve(); };
      });

      if (!current()) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h || video.readyState < 2) throw new Error('No video frame received');
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas context unavailable');
      ctx.drawImage(video, 0, 0, w, h);

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
      if (!blob) throw new Error('encode failed');
      if (!current()) return;
      cleanupStreams();

      if (mode === 'clipboard') {
        try {
          // ClipboardItem may be undefined in some environments.
          const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
          if (navigator.clipboard && ClipboardItemCtor) {
            await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
            if (current()) toast('success', 'Screenshot copied to clipboard');
          } else {
            throw new Error('clipboard image write unsupported');
          }
        } catch {
          if (!current()) return;
          // Fall back to a download if clipboard image write is blocked.
          const url = URL.createObjectURL(blob);
          const name = `dex-shot-${fmtTimestamp(new Date())}.png`;
          triggerDownload(url, name);
          pushRecent({ id: url, name, url, size: blob.size, kind: 'image', createdAt: Date.now() });
          toast('warning', 'Clipboard blocked — screenshot downloaded instead.');
        }
      } else {
        const url = URL.createObjectURL(blob);
        const name = `dex-shot-${fmtTimestamp(new Date())}.png`;
        triggerDownload(url, name);
        pushRecent({ id: url, name, url, size: blob.size, kind: 'image', createdAt: Date.now() });
        toast('success', 'Screenshot download started');
      }
    } catch (err) {
      if (current()) setErrorMsg('Could not capture a video frame.');
    } finally {
      video.srcObject = null;
      if (current()) {
        cleanupStreams();
        changePhase('idle');
      }
    }
  }, [supported, captureMode, triggerDownload, pushRecent, changePhase, cleanupStreams]);

  const removeRecent = useCallback((id: string) => {
    const target = capturesRef.current.find(item => item.id === id);
    if (!target) return;
    URL.revokeObjectURL(target.url);
    capturesRef.current = capturesRef.current.filter(item => item.id !== id);
    setRecent(capturesRef.current);
  }, []);

  const busy = state !== 'idle';
  const optionsDisabled = busy;
  const startDisabled = busy || !supported || typeof MediaRecorder === 'undefined';
  const pauseDisabled = state !== 'recording' && state !== 'paused';
  const stopDisabled = state === 'idle' || state === 'finishing';
  const cancelPending = state === 'choosing' || state === 'countdown' || state === 'capturing';
  const statusLabel: Record<RecState, string> = {
    idle: supported ? 'Ready' : 'Screen capture unavailable', choosing: 'Choose a source…',
    countdown: 'Starting…', recording: 'Recording', paused: 'Paused', finishing: 'Finishing…', capturing: 'Capturing screenshot…',
  };
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
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', minHeight: 0, overflow: 'auto' }}>
        <div style={{ flex: '3 1 420px', minWidth: 0, minHeight: 260, padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{
            // A solid black video well: no backdrop blur (nothing shows through
            // it, and an inline blur made the low-tier rule repaint it white).
            border: premiumGlassPanel.border, borderRadius: premiumGlassPanel.borderRadius,
            flex: 1, position: 'relative', overflow: 'hidden',
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
            {pauseDisabled && (
              // The preview well is black in both themes; dark text tokens here.
              <div className="dex-theme-dark" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--color-text-muted)', background: 'transparent' }}>
                {state === 'countdown' ? (
                  <span style={{ fontSize: 72, fontWeight: 700, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {countdown}
                  </span>
                ) : (
                  <>
                    <DexIcon name="video" size={48} color="var(--color-text-muted)" />
                    <span style={{ fontSize: 13 }}>
                      {state === 'idle' && supported ? 'Choose a source to begin recording' : statusLabel[state]}
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
            <Button variant="primary" onClick={handleStart} disabled={startDisabled}>Start recording</Button>
            <Button onClick={handlePause} disabled={pauseDisabled}>{state === 'paused' ? 'Resume' : 'Pause'}</Button>
            <Button onClick={handleStop} disabled={stopDisabled}>{cancelPending ? 'Cancel' : 'Stop'}</Button>
            <Button variant="ghost" onClick={() => captureStill('download')} disabled={busy || !supported}>Screenshot</Button>
            <Button variant="ghost" onClick={() => captureStill('clipboard')} disabled={busy || !supported}>Copy frame</Button>
          </div>
        </div>

        {/* Recent captures */}
        <div className="dex-liquid-glass-strong" style={{
          flex: '1 1 200px', borderRadius: 0, display: 'flex', flexDirection: 'column',
          minHeight: 110, minWidth: 0,
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
                    <Button size="sm" aria-label={`Download ${item.name}`} onClick={() => triggerDownload(item.url, item.name)}>Download</Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${item.name} from recent captures`} onClick={() => removeRecent(item.id)}>Remove</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div role="status" style={{
        padding: 'var(--space-2) var(--space-4)', borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-elevated)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        fontSize: 11, color: 'var(--color-text-muted)',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
        <span style={{ color: statusColor, fontWeight: 500 }}>{statusLabel[state]}</span>
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

export default memo(ScreenRecorder);
