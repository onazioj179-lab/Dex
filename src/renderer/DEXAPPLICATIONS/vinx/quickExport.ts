// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Quick Export (WebM)
 *
 * A REAL, browser-native render of the timeline as it plays. It composites the
 * live program-viewer <video>/title content into an offscreen <canvas> every
 * animation frame, captures that canvas via canvas.captureStream(fps), taps the
 * audio of the live media elements into a single MediaStreamAudioDestinationNode,
 * combines both into one MediaStream, and pipes it through MediaRecorder. On stop
 * it produces a real WebM Blob downloaded via an anchor.
 *
 * No new dependencies, no native encoder. For containers/codecs MediaRecorder
 * cannot produce (ProRes / H.265 / etc.) the caller is told honestly that the
 * native encoder is required; this path only ever produces WebM.
 */

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/** WebM codecs MediaRecorder can natively produce here, best-first. */
const WEBM_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * Codecs/containers that browser MediaRecorder genuinely cannot encode. These
 * require the native encoder; we never fake completion for them.
 */
const NATIVE_ONLY_FORMATS = new Set([
  'prores', 'prores422', 'prores4444', 'prores-hq', 'prores-lt', 'prores-proxy', 'prores-xq',
  'h265', 'hevc', 'dnxhd', 'dnxhr', 'av1', 'cineform', 'jpeg2000', 'mxf', 'avi', 'dpx', 'exr',
]);

export function isNativeOnlyFormat(format: string): boolean {
  return NATIVE_ONLY_FORMATS.has(String(format || '').toLowerCase());
}

/** True when canvas capture + MediaRecorder WebM are both available. */
export function isQuickExportSupported(): boolean {
  try {
    if (typeof MediaRecorder === 'undefined') return false;
    const c = document.createElement('canvas');
    if (typeof (c as any).captureStream !== 'function') return false;
    return WEBM_CANDIDATES.some(m => MediaRecorder.isTypeSupported(m));
  } catch {
    return false;
  }
}

function pickMimeType(): string | null {
  for (const m of WEBM_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* keep trying */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickExportOptions {
  /** Container element of the program viewer (the [data-vinx-program-canvas] div). */
  programCanvas: HTMLElement | null;
  /** Output width in px. */
  width: number;
  /** Output height in px. */
  height: number;
  /** Capture frame rate. */
  fps: number;
  /** Total timeline duration in frames (export start=0 -> end). */
  durationFrames: number;
  /** Download file name (without extension). */
  filename: string;
  /** Target video bitrate in bits/sec. */
  videoBitsPerSecond?: number;
  /** Start timeline playback at frame 0 at the project's natural speed. */
  startPlayback: () => void;
  /** Stop/pause timeline playback. */
  stopPlayback: () => void;
  /** Seek the timeline to a frame (used to reset to 0 before recording). */
  seek: (frame: number) => void;
  /** Progress callback: elapsedMs / totalMs, and a 0-100 percent. */
  onProgress?: (elapsedMs: number, totalMs: number, percent: number) => void;
  /** Called once with the produced Blob (already downloaded). */
  onComplete?: (blob: Blob) => void;
  /** Called on any failure with a human-readable message. */
  onError?: (message: string) => void;
}

export interface QuickExportController {
  /** Stop early and finalize whatever was recorded so far. */
  stop: () => void;
  /** Abort without producing a file (cleans up). */
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// Quick export
// ---------------------------------------------------------------------------

export function runQuickExport(opts: QuickExportOptions): QuickExportController {
  const fail = (msg: string) => { try { opts.onError?.(msg); } catch { /* ignore */ } };

  if (!isQuickExportSupported()) {
    fail('Quick Export needs canvas.captureStream + MediaRecorder, unavailable in this environment.');
    return { stop: () => {}, cancel: () => {} };
  }
  const mimeType = pickMimeType();
  if (!mimeType) {
    fail('No supported WebM codec for MediaRecorder.');
    return { stop: () => {}, cancel: () => {} };
  }

  const width = Math.max(2, Math.round(opts.width) || 1920);
  const height = Math.max(2, Math.round(opts.height) || 1080);
  const fps = Math.max(1, Math.round(opts.fps) || 30);
  const totalFrames = Math.max(1, Math.round(opts.durationFrames) || 1);
  const totalMs = (totalFrames / fps) * 1000;

  // --- Offscreen compositing canvas -----------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    fail('Cannot create a 2D rendering context for export.');
    return { stop: () => {}, cancel: () => {} };
  }

  // --- Audio: tap the live media elements into one capture destination -------
  // The preview <video> elements are muted for playback; we create a dedicated
  // capture AudioContext and route each element's audio into a shared
  // MediaStreamAudioDestinationNode AND back to the speakers, then temporarily
  // unmute them so the render actually carries sound. State is restored on stop.
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  const restoreMuted: Array<{ el: HTMLMediaElement; muted: boolean }> = [];
  const tappedSources: MediaElementAudioSourceNode[] = [];

  const mediaEls: HTMLMediaElement[] = opts.programCanvas
    ? Array.from(opts.programCanvas.querySelectorAll<HTMLMediaElement>('video, audio'))
    : [];

  try {
    if (mediaEls.length > 0) {
      audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => { /* ignore */ });
      audioDest = audioCtx.createMediaStreamDestination();
      for (const el of mediaEls) {
        try {
          // createMediaElementSource throws if the element already owns a source
          // node (one per element). Skip those gracefully — they simply won't be
          // tapped, but the render still proceeds.
          const src = audioCtx.createMediaElementSource(el);
          src.connect(audioDest);
          src.connect(audioCtx.destination);
          tappedSources.push(src);
          if (el.muted) {
            restoreMuted.push({ el, muted: el.muted });
            el.muted = false;
          }
        } catch {
          /* element already routed elsewhere — leave it be */
        }
      }
    }
  } catch {
    // Audio tap failed entirely — proceed video-only rather than aborting.
    audioCtx = null;
    audioDest = null;
  }

  // --- Build the combined capture stream -------------------------------------
  let videoStream: MediaStream;
  try {
    videoStream = (canvas as any).captureStream(fps) as MediaStream;
  } catch (err) {
    fail('canvas.captureStream failed: ' + (err instanceof Error ? err.message : String(err)));
    cleanupAudio();
    return { stop: () => {}, cancel: () => {} };
  }

  const combined = new MediaStream();
  videoStream.getVideoTracks().forEach(t => combined.addTrack(t));
  if (audioDest) audioDest.stream.getAudioTracks().forEach(t => combined.addTrack(t));

  // --- MediaRecorder ----------------------------------------------------------
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: opts.videoBitsPerSecond && opts.videoBitsPerSecond > 0
        ? opts.videoBitsPerSecond
        : undefined,
    });
  } catch (err) {
    fail('MediaRecorder init failed: ' + (err instanceof Error ? err.message : String(err)));
    cleanupAll();
    return { stop: () => {}, cancel: () => {} };
  }

  const chunks: Blob[] = [];
  let rafId = 0;
  let startTs = 0;
  let finished = false;
  let aborted = false;

  function cleanupAudio(): void {
    for (const { el, muted } of restoreMuted) {
      try { el.muted = muted; } catch { /* ignore */ }
    }
    restoreMuted.length = 0;
    for (const s of tappedSources) {
      try { s.disconnect(); } catch { /* ignore */ }
    }
    tappedSources.length = 0;
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => { /* ignore */ });
    }
    audioCtx = null;
    audioDest = null;
  }

  function cleanupStreams(): void {
    try { videoStream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    try { combined.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
  }

  function cleanupAll(): void {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    cleanupStreams();
    cleanupAudio();
  }

  // Render loop: copy the live program content onto the export canvas each frame.
  // We draw every <video> within the program canvas in DOM order, honoring the
  // contained aspect of each (the preview uses objectFit:'contain'), so the
  // recorded canvas mirrors what the user sees playing.
  const draw = () => {
    if (aborted || finished) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    for (const el of mediaEls) {
      if (el.tagName !== 'VIDEO') continue;
      const v = el as HTMLVideoElement;
      // Only draw visible, ready clips (the engine toggles display:none off-range).
      if (v.style.display === 'none' || v.readyState < 2 || v.videoWidth === 0) continue;
      try {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        const scale = Math.min(width / vw, height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const dx = (width - dw) / 2;
        const dy = (height - dh) / 2;
        ctx.drawImage(v, dx, dy, dw, dh);
      } catch {
        /* cross-origin/tainted frame — skip this element */
      }
    }

    // Titles are live DOM overlays, not part of the underlying video frames.
    drawExportTitles(ctx, opts.programCanvas, width, height);
    const now = performance.now();
    const elapsed = now - startTs;
    const percent = Math.min(99, Math.round((elapsed / totalMs) * 100));
    try { opts.onProgress?.(elapsed, totalMs, percent); } catch { /* ignore */ }

    if (elapsed >= totalMs) {
      stop();
      return;
    }
    rafId = requestAnimationFrame(draw);
  };

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onerror = () => {
    if (finished || aborted) return;
    aborted = true;
    try { opts.stopPlayback(); } catch { /* ignore */ }
    cleanupAll();
    fail('MediaRecorder encoding failed mid-render.');
  };

  recorder.onstop = () => {
    try { opts.stopPlayback(); } catch { /* ignore */ }
    cleanupAll();
    if (aborted) return;
    try {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${opts.filename || 'export'}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      try { opts.onProgress?.(totalMs, totalMs, 100); } catch { /* ignore */ }
      try { opts.onComplete?.(blob); } catch { /* ignore */ }
    } catch (err) {
      fail('Failed to finalize export file: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  function stop(): void {
    if (finished) return;
    finished = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
  }

  function cancel(): void {
    if (finished) return;
    aborted = true;
    finished = true;
    try { opts.stopPlayback(); } catch { /* ignore */ }
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
    cleanupAll();
  }

  // --- Kick off ---------------------------------------------------------------
  try {
    opts.seek(0);
    recorder.start(250); // periodic chunks so a long render isn't held in one blob
    startTs = performance.now();
    opts.startPlayback();
    rafId = requestAnimationFrame(draw);
  } catch (err) {
    aborted = true;
    cleanupAll();
    fail('Could not start Quick Export: ' + (err instanceof Error ? err.message : String(err)));
    return { stop: () => {}, cancel: () => {} };
  }

  return { stop, cancel };
}

/** Composite visible title overlays using their resolved preview typography. */
export function drawExportTitles(ctx: CanvasRenderingContext2D, host: HTMLElement | null, width: number, height: number): void {
  if (!host) return;
  const scale = host.clientWidth > 0 ? width / host.clientWidth : 1;
  for (const overlay of host.querySelectorAll<HTMLElement>('[data-vinx-export-title]')) {
    const text = overlay.querySelector('span');
    if (!text) continue;
    const outer = getComputedStyle(overlay), style = getComputedStyle(text);
    if (outer.display === 'none' || outer.visibility === 'hidden') continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, Number(outer.opacity) || 0));
    const fontSize = (parseFloat(style.fontSize) || 48) * scale;
    ctx.font = style.fontWeight + ' ' + fontSize + 'px ' + style.fontFamily;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8 * scale; ctx.shadowOffsetY = 2 * scale;
    const lines = (text.textContent || '').split('\n');
    lines.forEach((line, index) => ctx.fillText(line, width / 2, height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.2, width));
    ctx.restore();
  }
}
