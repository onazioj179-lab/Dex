// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI screen capture — grabs a still of the desktop so UKI can "look at the
 * screen" and answer about what the user is seeing. Uses the WebView's system
 * screen picker (getDisplayMedia): the user chooses the window or screen and
 * the OS shows its sharing indicator. (The old Electron `screencapture:getSources`
 * path was removed: nothing in the Tauri build answers it, so every capture
 * paid for a failed IPC round trip first.)
 */

type DisplayMediaFn = (opts: { video: boolean | Record<string, unknown>; audio: boolean }) => Promise<MediaStream>;

function displayMedia(): DisplayMediaFn | null {
  const md = typeof navigator !== 'undefined' ? (navigator.mediaDevices as unknown as { getDisplayMedia?: DisplayMediaFn } | undefined) : undefined;
  return md?.getDisplayMedia ? md.getDisplayMedia.bind(md) : null;
}

/** True when a capture path exists (native bridge or the WebView's screen picker). */
export function isScreenCaptureAvailable(): boolean {
  return !!displayMedia();
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
 * Capture a still image of the screen (through the system picker) as a data
 * URL, or null if the user cancels or capture is unavailable.
 */
export async function captureScreenImage(): Promise<string | null> {
  return captureViaPicker();
}

// ---- Camera: one explicit frame ---------------------------------------------

type UserMediaFn = (opts: { video: boolean | Record<string, unknown>; audio: boolean }) => Promise<MediaStream>;

function userMedia(): UserMediaFn | null {
  const md = typeof navigator !== 'undefined' ? (navigator.mediaDevices as unknown as { getUserMedia?: UserMediaFn } | undefined) : undefined;
  return md?.getUserMedia ? md.getUserMedia.bind(md) : null;
}

/** True when a camera capture path exists (the OS still asks for permission). */
export function isCameraCaptureAvailable(): boolean {
  return !!userMedia();
}

/**
 * Take ONE camera frame for the next message. The camera turns on only for
 * this call (Windows shows its camera indicator), a short warm-up lets the
 * exposure settle, and every track is stopped before returning. Never runs
 * continuously. Returns a JPEG data URL, or null if denied/unavailable.
 */
export async function captureCameraFrame(getUserMedia: UserMediaFn | null = userMedia(), warmupMs = 400): Promise<string | null> {
  if (!getUserMedia) return null;
  let stream: MediaStream | null = null;
  try {
    stream = await getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    if (!stream.getVideoTracks()[0]) return null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    if (warmupMs > 0) await new Promise((r) => setTimeout(r, warmupMs));
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
    return null; // permission denied, no camera, or playback blocked
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}
