// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI screen capture — grabs a still of the desktop so UKI can "look at the
 * screen" and answer about what the user is seeing. Reuses the existing
 * `screencapture:getSources` main-process handler (Electron desktopCapturer), so
 * no new native surface is introduced. Returns a data URL, or null under the web
 * shell / when capture is unavailable. Image is a thumbnail-resolution frame
 * (the shared handler caps thumbnail size) — enough for layout/context, not
 * pixel-perfect OCR.
 */

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string; // data URL
}

function bridge(): { invoke?: (c: string) => Promise<unknown> } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electron?: { invoke?: (c: string) => Promise<unknown> } }).electron;
}

type DisplayMediaFn = (opts: { video: boolean | Record<string, unknown>; audio: boolean }) => Promise<MediaStream>;

function displayMedia(): DisplayMediaFn | null {
  const md = typeof navigator !== 'undefined' ? (navigator.mediaDevices as unknown as { getDisplayMedia?: DisplayMediaFn } | undefined) : undefined;
  return md?.getDisplayMedia ? md.getDisplayMedia.bind(md) : null;
}

/** True when a capture path exists (native bridge or the WebView's screen picker). */
export function isScreenCaptureAvailable(): boolean {
  return !!bridge()?.invoke || !!displayMedia();
}

/** Longest side of the shared frame; enough for layout/text, small to send. */
const MAX_SIDE = 1600;

/**
 * Capture ONE frame through the system screen picker (getDisplayMedia). The
 * user chooses exactly which window or screen to share, the OS shows its own
 * sharing indicator, and every track is stopped as soon as the frame is read,
 * so nothing keeps recording. Returns a JPEG data URL, or null if the user
 * cancels the picker or capture is unsupported.
 */
export async function captureViaPicker(getDisplayMedia: DisplayMediaFn | null = displayMedia()): Promise<string | null> {
  if (!getDisplayMedia) return null;
  let stream: MediaStream | null = null;
  try {
    stream = await getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.srcObject = null;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null; // picker cancelled or capture blocked
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Capture a still image of the primary screen as a data URL, or null if capture
 * is unavailable / fails. Prefers a full-screen source over an individual window.
 */
export async function captureScreenImage(): Promise<string | null> {
  const native = await captureViaBridge();
  // The Tauri shell has no `screencapture:getSources` handler, so this falls
  // through to the user-driven system picker.
  return native ?? captureViaPicker();
}

async function captureViaBridge(): Promise<string | null> {
  const ipc = bridge();
  if (!ipc?.invoke) return null;
  try {
    const sources = (await ipc.invoke('screencapture:getSources')) as CaptureSource[] | undefined;
    if (!Array.isArray(sources) || sources.length === 0) return null;
    const screenSrc = sources.find((s) => /screen|entire|display/i.test(s.name)) ?? sources[0];
    return typeof screenSrc?.thumbnail === 'string' && screenSrc.thumbnail.startsWith('data:')
      ? screenSrc.thumbnail
      : null;
  } catch {
    return null;
  }
}
