// =============================================================================
// DEX Platform - DEX v3.10.0 wave V - OS shell parity (macOS Tahoe + Win11)
// =============================================================================

export interface Bounds { x: number; y: number; width: number; height: number }

// ---- Win11 snap layouts ----
export type SnapLayout = 'leftHalf'|'rightHalf'|'topHalf'|'bottomHalf'|'topLeft'|'topRight'|'bottomLeft'|'bottomRight'|'leftThird'|'centerThird'|'rightThird'|'leftTwoThird'|'rightTwoThird'|'maximize';

export function applySnapLayout(screen: Bounds, layout: SnapLayout): Bounds {
  const { x, y, width: w, height: h } = screen;
  switch (layout) {
    case 'leftHalf': return { x, y, width: w/2, height: h };
    case 'rightHalf': return { x: x + w/2, y, width: w/2, height: h };
    case 'topHalf': return { x, y, width: w, height: h/2 };
    case 'bottomHalf': return { x, y: y + h/2, width: w, height: h/2 };
    case 'topLeft': return { x, y, width: w/2, height: h/2 };
    case 'topRight': return { x: x + w/2, y, width: w/2, height: h/2 };
    case 'bottomLeft': return { x, y: y + h/2, width: w/2, height: h/2 };
    case 'bottomRight': return { x: x + w/2, y: y + h/2, width: w/2, height: h/2 };
    case 'leftThird': return { x, y, width: w/3, height: h };
    case 'centerThird': return { x: x + w/3, y, width: w/3, height: h };
    case 'rightThird': return { x: x + 2*w/3, y, width: w/3, height: h };
    case 'leftTwoThird': return { x, y, width: 2*w/3, height: h };
    case 'rightTwoThird': return { x: x + w/3, y, width: 2*w/3, height: h };
    case 'maximize': return { x, y, width: w, height: h };
  }
}

// ---- virtual desktops / Spaces ----
export interface Desktop { id: string; name: string; windowIds: readonly string[] }
export interface DesktopState { desktops: readonly Desktop[]; activeId: string }

export function createDesktop(state: DesktopState, name: string, id: string): DesktopState {
  return { desktops: [...state.desktops, { id, name, windowIds: [] }], activeId: state.activeId };
}
export function switchDesktop(state: DesktopState, id: string): DesktopState {
  if (!state.desktops.some((d) => d.id === id)) return state;
  return { desktops: state.desktops, activeId: id };
}
export function moveWindowToDesktop(state: DesktopState, windowId: string, desktopId: string): DesktopState {
  return {
    activeId: state.activeId,
    desktops: state.desktops.map((d) => ({
      ...d,
      windowIds: d.id === desktopId
        ? (d.windowIds.includes(windowId) ? d.windowIds : [...d.windowIds, windowId])
        : d.windowIds.filter((w) => w !== windowId),
    })),
  };
}

// ---- hot corners / edge gestures ----
export type HotCorner = 'tl'|'tr'|'bl'|'br';
export function detectHotCorner(x: number, y: number, screen: Bounds, threshold: number = 8): HotCorner | null {
  const left = x <= screen.x + threshold;
  const right = x >= screen.x + screen.width - threshold;
  const top = y <= screen.y + threshold;
  const bottom = y >= screen.y + screen.height - threshold;
  if (left && top) return 'tl';
  if (right && top) return 'tr';
  if (left && bottom) return 'bl';
  if (right && bottom) return 'br';
  return null;
}

// ---- force touch pressure curve ----
export function forceTouchActivation(pressure: number, threshold: number = 0.6): boolean {
  return pressure >= threshold;
}

// ---- Spotlight superset query parser ----
export type SpotlightAction = 'open'|'calc'|'unit'|'define'|'web'|'emoji'|'file';
export interface SpotlightResult { action: SpotlightAction; payload: string }

export function parseSpotlight(query: string): SpotlightResult {
  const q = query.trim();
  if (/^[\d().+\-*/\s]+$/.test(q) && /[+\-*/]/.test(q)) {
    try { /* eslint-disable-next-line no-new-func */
      const v = Function(`"use strict";return (${q})`)();
      return { action: 'calc', payload: String(v) };
    } catch { /* fall through */ }
  }
  if (/^\d+(\.\d+)?\s*(km|m|mi|ft|kg|lb|c|f)\s+to\s+\w+$/i.test(q)) return { action: 'unit', payload: q };
  if (/^def(ine)?:/i.test(q)) return { action: 'define', payload: q.replace(/^def(ine)?:/i, '').trim() };
  if (/^:/.test(q)) return { action: 'emoji', payload: q.slice(1) };
  if (/^https?:\/\//.test(q)) return { action: 'web', payload: q };
  if (/[/\\.]/.test(q)) return { action: 'file', payload: q };
  return { action: 'open', payload: q };
}

// ---- AirDrop-style local share peer scoring ----
export interface Peer { id: string; rssi: number; name: string }
export function rankPeers(peers: readonly Peer[]): Peer[] {
  return [...peers].sort((a, b) => b.rssi - a.rssi);
}

// ---- Continuity handoff ----
export interface HandoffPayload { app: string; documentId: string; cursor: number; ts: number }
export function shouldAcceptHandoff(payload: HandoffPayload, now: number, ttlMs: number = 30000): boolean {
  return now - payload.ts <= ttlMs && now - payload.ts >= 0;
}

// ---- screen capture: hdr metadata ----
export function buildCaptureMetadata(width: number, height: number, hdr: boolean): { width: number; height: number; colorPrimaries: string; transfer: string } {
  return { width, height, colorPrimaries: hdr ? 'rec2020' : 'rec709', transfer: hdr ? 'pq' : 'srgb' };
}

// ---- multi-monitor scale + Night Shift colour temp ----
export function computeNightShiftKelvin(now: number, sunset: number, sunrise: number, dayK: number = 6500, nightK: number = 3400): number {
  const tod = ((now % 86400) + 86400) % 86400;
  const inNight = tod >= sunset || tod < sunrise;
  return inNight ? nightK : dayK;
}

export function dpiScaleFor(width: number, height: number, diagonalInches: number): number {
  const dpi = Math.hypot(width, height) / diagonalInches;
  if (dpi >= 250) return 2;
  if (dpi >= 180) return 1.5;
  if (dpi >= 120) return 1.25;
  return 1;
}

// ---- Activity Monitor: aggregate process CPU% ----
export interface ProcessSample { pid: number; cpuPercent: number; memBytes: number }
export function aggregateProcesses(samples: readonly ProcessSample[]): { totalCpu: number; totalMem: number; count: number } {
  let cpu = 0, mem = 0;
  for (const s of samples) { cpu += s.cpuPercent; mem += s.memBytes; }
  return { totalCpu: cpu, totalMem: mem, count: samples.length };
}

// ---- Time Machine snapshot retention plan ----
export function planSnapshotRetention(now: number, snapshots: readonly number[]): number[] {
  const keep = new Set<number>();
  // last 24 hourly
  for (let i = 0; i < 24; i++) {
    const target = now - i * 3600;
    let best = -Infinity;
    for (const s of snapshots) if (s <= target && s > best && now - s < 86400) best = s;
    if (best !== -Infinity) keep.add(best);
  }
  // daily for 30 days
  for (let i = 0; i < 30; i++) {
    const target = now - i * 86400;
    let best = -Infinity;
    for (const s of snapshots) if (s <= target && s > best) best = s;
    if (best !== -Infinity) keep.add(best);
  }
  return [...keep].sort((a, b) => b - a);
}

// ---- migration assistant size estimate ----
export function estimateMigrationTime(bytes: number, mbpsLink: number): number {
  if (mbpsLink <= 0) return Infinity;
  return bytes / ((mbpsLink * 1024 * 1024) / 8);
}
