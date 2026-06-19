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

/** True when the native screen-capture bridge is present (Electron, not web). */
export function isScreenCaptureAvailable(): boolean {
  return !!bridge()?.invoke;
}

/**
 * Capture a still image of the primary screen as a data URL, or null if capture
 * is unavailable / fails. Prefers a full-screen source over an individual window.
 */
export async function captureScreenImage(): Promise<string | null> {
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
