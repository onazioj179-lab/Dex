// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Nexus — the UKI command HUD (DEX 5.6 rewrite).
 *
 * A single, sharp, interactable "target-locator" heads-up display:
 *
 *   - A central reticle that IS UKI — its colour, pulse, and sweep reflect the
 *     live UKI state (standby / listening / thinking / speaking) and mic level.
 *   - A ring of markers drawn from REAL activity: the live Nexus memory graph
 *     (ContextBus-fed entities) plus UKI's knowledge nodes. Hover to read,
 *     click to focus, search to filter.
 *   - Sharp corner read-outs wired to real numbers (tier, activity count,
 *     security blocks) and two live dial gauges.
 *   - A command cradle: ask UKI a question or arm the mic. The ask field drives
 *     the full UKI reasoning pipeline via the `dex-uki-ask` bridge.
 *
 * COLOUR: everything is sourced from the DEX design tokens so Nexus inherits the
 * app's accent and theme. DOM chrome uses `var(--color-*)` directly; the canvas
 * reads the same tokens via `getComputedStyle` into a palette (refreshed on the
 * read-out interval) so a theme/accent change re-colours the HUD too — no
 * hardcoded blues.
 */
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { getPerfTier } from '../../utils/adaptiveCanvas';
import { useAppActive } from '../../utils/perfAware';
import { parseAccentColor, type RGB } from '../../utils/accentFamily';
import { useUkiStore } from '../../store/ukiStore';
import { getSecuritySummary } from '../../store/permissionStore';
import { getStoredTier, getTierLabel } from '../../services/TierManager';
import { getNexusModel, onNexusChange, installNexusIngest } from '../../services/nexus/nexusLiveStore';
import type { NexusEntityKind } from '../../../shared/nexus/model';

const PREFERS_REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// ---------------------------------------------------------------------------
// Palette — resolved from the DEX design tokens at runtime (theme-aware).
// ---------------------------------------------------------------------------
type PaletteKey = 'accent' | 'info' | 'success' | 'warning' | 'error' | 'text' | 'textDim';

interface Palette {
  accent: string;
  info: string;
  success: string;
  warning: string;
  error: string;
  text: string;
  textDim: string;
  bg: string;
  accentRGB: RGB;
  /** Resolved UI font family — canvas ctx.font cannot read var(--dex-font-ui). */
  fontUI: string;
}

const FALLBACK_FONT_UI = 'system-ui';

const FALLBACK: Palette = {
  accent: '#4A9EFF', info: '#64D2FF', success: '#34C759', warning: '#FF9F0A',
  error: '#FF453A', text: '#FFFFFF', textDim: '#A0A0A5', bg: '#0C0C0E',
  accentRGB: { r: 74, g: 158, b: 255 },
  fontUI: FALLBACK_FONT_UI,
};

function readPalette(): Palette {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const g = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;
  const accent = g('--color-accent', FALLBACK.accent);
  return {
    accent,
    info: g('--color-info', FALLBACK.info),
    success: g('--color-success', FALLBACK.success),
    warning: g('--color-warning', FALLBACK.warning),
    error: g('--color-error', FALLBACK.error),
    text: g('--color-text-primary', FALLBACK.text),
    textDim: g('--color-text-muted', FALLBACK.textDim),
    bg: g('--color-bg-base', FALLBACK.bg),
    accentRGB: parseAccentColor(accent) || FALLBACK.accentRGB,
    fontUI: g('--dex-font-ui', FALLBACK_FONT_UI),
  };
}

const palKey = (p: Palette, k: PaletteKey): string =>
  k === 'accent' ? p.accent : k === 'info' ? p.info : k === 'success' ? p.success
    : k === 'warning' ? p.warning : k === 'error' ? p.error : k === 'text' ? p.text : p.textDim;

/** Translucent accent — for structural strokes that should read as "the app colour". */
const accentA = (p: Palette, a: number): string => `rgba(${p.accentRGB.r},${p.accentRGB.g},${p.accentRGB.b},${a})`;

/** Resolve a possibly-`var(--token)` colour (e.g. from UKI knowledge nodes) to a literal. */
function resolveColor(raw: string, p: Palette): string {
  const s = (raw || '').trim();
  if (!s) return p.info;
  if (s.startsWith('var(')) {
    const m = s.match(/var\(\s*(--[\w-]+)/);
    if (m && typeof getComputedStyle === 'function') {
      const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
      if (v) return v;
    }
    return p.accent;
  }
  return s;
}

// Entity-kind → token key + short tag (kinds come from shared/nexus/model).
// Colours stay on the DEX semantic palette so the whole HUD re-themes together.
const KIND_META: Record<NexusEntityKind, { key: PaletteKey; tag: string }> = {
  project: { key: 'warning', tag: 'PRJ' },
  idea: { key: 'info', tag: 'IDEA' },
  person: { key: 'success', tag: 'PER' },
  file: { key: 'accent', tag: 'FILE' },
  asset: { key: 'info', tag: 'AST' },
  session: { key: 'accent', tag: 'SESS' },
  research: { key: 'error', tag: 'RES' },
  conversation: { key: 'text', tag: 'CHAT' },
};
const ALL_KINDS = Object.keys(KIND_META) as NexusEntityKind[];

// State → token key + label. Drives the centre of the HUD + the cradle accents.
const STATE_META: Record<string, { key: PaletteKey; label: string; cssVar: string }> = {
  dormant: { key: 'accent', label: 'STANDBY', cssVar: 'var(--color-accent)' },
  idle: { key: 'accent', label: 'STANDBY', cssVar: 'var(--color-accent)' },
  listening: { key: 'success', label: 'LISTENING', cssVar: 'var(--color-success)' },
  processing: { key: 'warning', label: 'PROCESSING', cssVar: 'var(--color-warning)' },
  thinking: { key: 'warning', label: 'THINKING', cssVar: 'var(--color-warning)' },
  speaking: { key: 'info', label: 'SPEAKING', cssVar: 'var(--color-info)' },
  error: { key: 'error', label: 'FAULT', cssVar: 'var(--color-error)' },
};

interface Marker {
  id: string;
  label: string;
  /** Entity markers carry a token key (live-themed); knowledge markers a literal. */
  colorKey?: PaletteKey;
  rawColor?: string;
  tag: string;
  ts: number;
  weight: number;
  // Per-frame screen position (CSS px) for hit-testing.
  sx: number;
  sy: number;
}

const markerColor = (m: Marker, p: Palette): string =>
  m.colorKey ? palKey(p, m.colorKey) : (m.rawColor || p.info);

// Pull a bounded, recency-ranked marker set from the live model + UKI knowledge.
function collectMarkers(
  knowledge: ReadonlyArray<{ id: string; label: string; color: string; weight: number; timestamp: number }>,
  pal: Palette,
): Marker[] {
  const model = getNexusModel();
  const out: Marker[] = [];
  const seen = new Set<string>();

  for (const kind of ALL_KINDS) {
    for (const e of model.byKind(kind)) {
      const key = (e.label || e.id).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = KIND_META[kind];
      out.push({ id: e.id, label: e.label || e.id, colorKey: meta.key, tag: meta.tag, ts: e.ts, weight: 1, sx: 0, sy: 0 });
    }
  }
  for (const k of knowledge) {
    const key = (k.label || k.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: k.id, label: k.label || k.id, rawColor: resolveColor(k.color, pal), tag: 'MEM', ts: k.timestamp || 0, weight: k.weight || 0.5, sx: 0, sy: 0 });
  }

  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, 28);
}

function ago(ts: number): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Nexus: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const lastTsRef = useRef(0);
  const paletteRef = useRef<Palette>(readPalette());

  const markersRef = useRef<Marker[]>([]);
  const rotationRef = useRef(0);
  const dragRef = useRef({ active: false, startX: 0, startRot: 0, moved: false });
  const mouseRef = useRef({ x: -999, y: -999 });
  const hoverRef = useRef(-1);
  const selectedRef = useRef(-1);
  const hitRafRef = useRef(0);

  const [selected, setSelected] = useState<Marker | null>(null);
  const [hover, setHover] = useState<Marker | null>(null);
  const [query, setQuery] = useState('');
  const queryRef = useRef('');
  const [markerCount, setMarkerCount] = useState(0);
  const askInputRef = useRef<HTMLInputElement>(null);

  // Live, throttled HUD read-outs (tier + security). Refreshed on an interval.
  const [readout, setReadout] = useState(() => ({
    tier: getTierLabel(getStoredTier() ?? 'mid'),
    blocks: 0,
    shield: 0,
    active: 0,
  }));

  // UKI reactive state (drives the reticle + cradle). Mirrored into a ref for RAF.
  const ukiState = useUkiStore(s => s.state);
  const ukiAudio = useUkiStore(s => s.audioLevel);
  const knowledgeNodes = useUkiStore(s => s.knowledgeNodes);
  const ukiRef = useRef({ state: ukiState, audio: ukiAudio });
  useEffect(() => { ukiRef.current = { state: ukiState, audio: ukiAudio }; }, [ukiState, ukiAudio]);

  const isActive = useAppActive();
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => { queryRef.current = query.trim().toLowerCase(); }, [query]);

  // --- Live data: subscribe Nexus ingest + rebuild markers on change ---------
  const rebuild = useCallback(() => {
    const next = collectMarkers(knowledgeNodes, paletteRef.current);
    markersRef.current = next;
    setMarkerCount(next.length);
    if (selectedRef.current >= 0) {
      const sel = selected;
      const idx = sel ? next.findIndex(m => m.id === sel.id) : -1;
      selectedRef.current = idx;
      if (idx < 0) setSelected(null);
    }
  }, [knowledgeNodes, selected]);

  useEffect(() => {
    const off = installNexusIngest();
    return off;
  }, []);

  useEffect(() => {
    rebuild();
    const off = onNexusChange(rebuild);
    return off;
  }, [rebuild]);

  // --- Live read-outs + palette refresh, every few seconds -------------------
  useEffect(() => {
    const refresh = () => {
      paletteRef.current = readPalette(); // stay in sync with theme/accent changes
      try {
        const sec = getSecuritySummary();
        const model = getNexusModel();
        let recent = 0;
        const cutoff = Date.now() - 5 * 60_000;
        for (const kind of ALL_KINDS) {
          for (const e of model.byKind(kind)) { if (e.ts >= cutoff) recent++; }
        }
        setReadout({
          tier: getTierLabel(getStoredTier() ?? 'mid'),
          blocks: sec.recentBlocksLastHour,
          shield: sec.shieldScore,
          active: recent,
        });
      } catch { /* stores not ready */ }
    };
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  // --- Canvas sizing (DPR-aware) ---------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = container.getBoundingClientRect();
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // --- Pointer interaction: hover hit-test, drag-rotate, click-select --------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hitTest = () => {
      hitRafRef.current = 0;
      const markers = markersRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      let best = -1;
      let bestD = 18 * 18;
      for (let i = 0; i < markers.length; i++) {
        const dx = mx - markers[i].sx;
        const dy = my - markers[i].sy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best !== hoverRef.current) {
        hoverRef.current = best;
        setHover(best >= 0 ? markers[best] : null);
        canvas.style.cursor = best >= 0 ? 'pointer' : 'grab';
      }
    };

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        if (Math.abs(dx) > 3) dragRef.current.moved = true;
        rotationRef.current = dragRef.current.startRot + dx * 0.005;
        return;
      }
      if (!hitRafRef.current) hitRafRef.current = requestAnimationFrame(hitTest);
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { active: true, startX: e.clientX, startRot: rotationRef.current, moved: false };
      canvas.style.cursor = 'grabbing';
    };

    const isOverCore = () => {
      const r = canvas.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      const dx = mouseRef.current.x - cx;
      const dy = mouseRef.current.y - cy;
      const coreR = Math.min(r.width, r.height) * 0.34 * 0.34;
      return dx * dx + dy * dy < coreR * coreR;
    };

    const onUp = () => {
      const wasDrag = dragRef.current.moved;
      dragRef.current.active = false;
      canvas.style.cursor = hoverRef.current >= 0 ? 'pointer' : 'grab';
      if (wasDrag) return;
      if (hoverRef.current >= 0) {
        const m = markersRef.current[hoverRef.current];
        selectedRef.current = hoverRef.current;
        setSelected(m);
      } else if (isOverCore()) {
        const uki = useUkiStore.getState();
        if (uki.state === 'listening') uki.stopListening();
        else uki.startListening();
      } else {
        selectedRef.current = -1;
        setSelected(null);
      }
    };

    const onLeave = () => {
      mouseRef.current = { x: -999, y: -999 };
      hoverRef.current = -1;
      setHover(null);
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onLeave);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // --- Keyboard: "/" focuses ask, Esc clears selection -----------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === '/' && !typing) { e.preventDefault(); askInputRef.current?.focus(); }
      else if (e.key === 'Escape' && !typing) { selectedRef.current = -1; setSelected(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- The render loop -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tier = getPerfTier();
    const dotStep = tier === 'low' ? 14 : tier === 'mid' ? 10 : 8; // dotted-ring density (deg)

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (!isActiveRef.current) return; // pause when backgrounded

      const dt = lastTsRef.current ? Math.min(0.05, (now - lastTsRef.current) / 1000) : 0.016;
      lastTsRef.current = now;
      const motion = PREFERS_REDUCED_MOTION ? 0 : 1;
      timeRef.current += dt;
      const t = timeRef.current;
      const pal = paletteRef.current;

      if (!dragRef.current.active) rotationRef.current += dt * 0.06 * motion;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = W / dpr;
      const h = H / dpr;
      const ccx = w / 2;
      const ccy = h / 2;
      const R = Math.min(w, h) * 0.34; // master radius

      const uki = ukiRef.current;
      const sm = STATE_META[uki.state] || STATE_META.idle;
      const stateColor = palKey(pal, sm.key);
      const live = uki.state === 'listening' || uki.state === 'speaking' || uki.state === 'processing' || uki.state === 'thinking';
      const pulse = 0.5 + 0.5 * Math.sin(t * (live ? 3.2 : 1.1));

      // (1) Diagonal framing lines to the corners, with endpoint pips.
      ctx.lineWidth = 1;
      ctx.strokeStyle = accentA(pal, 0.10);
      const corners = [[0.10, 0.16], [0.90, 0.16], [0.10, 0.84], [0.90, 0.84]];
      for (const [fx, fy] of corners) {
        const ex = w * fx;
        const ey = h * fy;
        const a = Math.atan2(ey - ccy, ex - ccx);
        ctx.beginPath();
        ctx.moveTo(ccx + Math.cos(a) * R * 1.18, ccy + Math.sin(a) * R * 1.18);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = accentA(pal, 0.28);
        ctx.fill();
      }

      // (2) Outer dotted tick ring.
      const dotR = R * 1.16;
      for (let deg = 0; deg < 360; deg += dotStep) {
        const a = (deg * Math.PI) / 180 + rotationRef.current * 0.3;
        const major = deg % 30 === 0;
        ctx.beginPath();
        ctx.arc(ccx + Math.cos(a) * dotR, ccy + Math.sin(a) * dotR, major ? 1.6 : 0.9, 0, Math.PI * 2);
        ctx.fillStyle = accentA(pal, major ? 0.30 : 0.16);
        ctx.fill();
      }

      // (3) Main + inner rings.
      ctx.strokeStyle = accentA(pal, 0.42);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ccx, ccy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accentA(pal, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ccx, ccy, R * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      // (4) Cardinal accent arcs — the "armed" segments (warning hue).
      ctx.strokeStyle = pal.warning;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      const arcSpan = 0.34;
      for (const base of [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.15]) {
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(ccx, ccy, R, base, base + arcSpan);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';

      // (5) Inner tick marks.
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const major = i % 9 === 0;
        const r1 = R * 0.82;
        const r2 = r1 - (major ? 8 : 4);
        ctx.beginPath();
        ctx.moveTo(ccx + Math.cos(a) * r1, ccy + Math.sin(a) * r1);
        ctx.lineTo(ccx + Math.cos(a) * r2, ccy + Math.sin(a) * r2);
        ctx.strokeStyle = accentA(pal, major ? 0.30 : 0.12);
        ctx.lineWidth = major ? 1.1 : 0.7;
        ctx.stroke();
      }

      // (6) Sweep arc — radar style, tinted by UKI state.
      if (motion) {
        const sweep = (t * (live ? 1.8 : 0.7)) % (Math.PI * 2);
        const ex = ccx + Math.cos(sweep) * R * 0.8;
        const ey = ccy + Math.sin(sweep) * R * 0.8;
        const grad = ctx.createLinearGradient(ccx, ccy, ex, ey);
        grad.addColorStop(0, accentA(pal, 0));
        grad.addColorStop(1, stateColor);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ccx, ccy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // (7) Marker ring — live entities. Filtered/dimmed by the search query.
      const markers = markersRef.current;
      const q = queryRef.current;
      const markerR = R * 0.6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const a = (i / Math.max(markers.length, 1)) * Math.PI * 2 + rotationRef.current;
        const mx = ccx + Math.cos(a) * markerR;
        const my = ccy + Math.sin(a) * markerR;
        m.sx = mx;
        m.sy = my;
        const color = markerColor(m, pal);
        const match = !q || m.label.toLowerCase().includes(q);
        const isHover = hoverRef.current === i;
        const isSel = selectedRef.current === i;
        const alpha = match ? 1 : 0.16;

        ctx.globalAlpha = alpha * 0.18;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ccx + Math.cos(a) * R * 0.34, ccy + Math.sin(a) * R * 0.34);
        ctx.lineTo(mx, my);
        ctx.stroke();

        const rad = (isSel ? 6 : isHover ? 5 : 3.4) + (m.weight > 0.7 ? 1 : 0);
        if (isHover || isSel) {
          ctx.globalAlpha = alpha * 0.9;
          ctx.beginPath();
          ctx.arc(mx, my, rad + 4, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(mx, my, rad, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // (8) Crosshair through the centre with a clear gap for the reticle.
      ctx.strokeStyle = accentA(pal, 0.20);
      ctx.lineWidth = 1;
      const gap = R * 0.12;
      const reach = R * 0.5;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.beginPath();
        ctx.moveTo(ccx + dx * gap, ccy + dy * gap);
        ctx.lineTo(ccx + dx * reach, ccy + dy * reach);
        ctx.stroke();
      }

      // (9) The reticle — UKI core.
      const coreR = R * 0.1 + uki.audio * R * 0.05;
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      ctx.strokeStyle = stateColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ccx, ccy, coreR + 6 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const cg = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, coreR);
      cg.addColorStop(0, stateColor);
      cg.addColorStop(1, accentA(pal, 0.13));
      ctx.beginPath();
      ctx.arc(ccx, ccy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ccx, ccy, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = pal.bg;
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = stateColor;
      ctx.font = `700 8px ${pal.fontUI || FALLBACK_FONT_UI}`;
      ctx.fillText(sm.label, ccx, ccy + coreR + 14);
      ctx.globalAlpha = 1;

      // (10) Corner brackets framing the HUD box.
      ctx.strokeStyle = accentA(pal, 0.30);
      ctx.lineWidth = 1.2;
      const bx = R * 1.3;
      const len = 16;
      const box = [
        [ccx - bx, ccy - bx, 1, 1], [ccx + bx, ccy - bx, -1, 1],
        [ccx - bx, ccy + bx, 1, -1], [ccx + bx, ccy + bx, -1, -1],
      ];
      for (const [x, y, sxd, syd] of box) {
        ctx.beginPath();
        ctx.moveTo(x + sxd * len, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + syd * len);
        ctx.stroke();
      }

      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // --- Ask UKI ---------------------------------------------------------------
  const askUki = useCallback(() => {
    const q = (askInputRef.current?.value || '').trim();
    if (!q) return;
    window.dispatchEvent(new CustomEvent('dex-uki-ask', { detail: { query: q } }));
    // Open UKI so the user actually SEES the answer (was fire-and-forget before).
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { id: 'uki' } }));
    if (askInputRef.current) askInputRef.current.value = '';
  }, []);

  // Marker selection used to be a dead end (highlight only). Inspecting a node now
  // routes it to UKI and opens the assistant, so the HUD becomes a real query
  // surface over the knowledge graph.
  const inspectMarker = useCallback((m: Marker | null) => {
    if (!m) return;
    window.dispatchEvent(new CustomEvent('dex-uki-ask', { detail: { query: `Tell me about "${m.label}" (${m.tag})` } }));
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { id: 'uki' } }));
  }, []);

  const toggleMic = useCallback(() => {
    const uki = useUkiStore.getState();
    if (uki.state === 'listening') uki.stopListening();
    else uki.startListening();
  }, []);

  const micArmed = ukiState === 'listening';
  const stateVar = (STATE_META[ukiState] || STATE_META.idle).cssVar;

  // ---------------------------------------------------------------------------
  return (
    <div ref={containerRef} style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 50%, var(--color-accent-soft, rgba(74,158,255,0.06)), transparent 55%), var(--color-bg-base)',
      fontFamily: 'var(--dex-font-ui)',
    }}>
      <canvas ref={canvasRef} role="img" aria-label="Nexus command HUD" style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Top-left identity */}
      <div style={cornerBox('tl')}>
        <div style={chipLabel}>NEXUS</div>
        <div style={{ ...chipValue, color: 'var(--color-accent)' }}>UKI COMMAND HUD</div>
        <div style={{ ...chipSub, color: 'var(--color-text-muted)' }}>TIER · {readout.tier}</div>
      </div>

      {/* Top-right status — "target locator" */}
      <div style={{ ...cornerBox('tr'), alignItems: 'flex-end', textAlign: 'right' }}>
        <div style={{ ...chipLabel, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateVar, boxShadow: `0 0 6px ${stateVar}` }} />
          TARGET LOCATOR
        </div>
        <div style={{ ...chipValue, color: 'var(--color-accent)' }}>{markerCount} TRACKED</div>
        <div style={{ ...chipSub, color: 'var(--color-text-muted)' }}>{readout.active} ACTIVE · 5M</div>
      </div>

      {/* Bottom-left warning chip (real numbers) */}
      <div style={cornerBox('bl')}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 9px', borderRadius: 6,
          border: `1px solid ${readout.blocks > 0 ? 'var(--color-error)' : 'var(--color-success)'}`,
          background: readout.blocks > 0 ? 'var(--color-error-muted, rgba(255,69,58,0.12))' : 'var(--color-success-muted, rgba(52,199,89,0.10))',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={readout.blocks > 0 ? 'var(--color-error)' : 'var(--color-success)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: readout.blocks > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            {readout.blocks > 0 ? `${readout.blocks} BLOCKED · 1H` : 'ALL CLEAR'}
          </span>
        </div>
      </div>

      {/* Bottom-right tracking engine */}
      <div style={{ ...cornerBox('br'), alignItems: 'flex-end', textAlign: 'right' }}>
        <div style={{ ...chipLabel, color: 'var(--color-text-muted)' }}>TRACKING ENGINE</div>
        <div style={{ ...chipValue, color: 'var(--color-accent)' }}>SHIELD {readout.shield}</div>
        <div style={{ ...chipSub, color: 'var(--color-text-muted)' }}>{markerCount} NODES MAPPED</div>
      </div>

      {/* Left dial — memory load */}
      <Gauge side="left" label="MEMORY" value={Math.min(100, markerCount * 4)} color="var(--color-accent)" />
      {/* Right dial — activity */}
      <Gauge side="right" label="ACTIVITY" value={Math.min(100, readout.active * 12)} color={readout.active > 0 ? 'var(--color-success)' : 'var(--color-accent)'} />

      {/* Hover tooltip */}
      {hover && (
        <div style={{
          position: 'absolute', left: hover.sx + 14, top: hover.sy - 10,
          pointerEvents: 'none', zIndex: 20,
          background: 'var(--color-bg-elevated)', border: `1px solid ${markerColor(hover, paletteRef.current)}`,
          borderRadius: 6, padding: '5px 9px', maxWidth: 220,
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hover.label}</div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: markerColor(hover, paletteRef.current), marginTop: 1 }}>{hover.tag} · {ago(hover.ts)}</div>
        </div>
      )}

      {/* Selected read-out */}
      {selected && (
        <div
          role="button"
          tabIndex={0}
          title="Ask UKI about this node"
          onClick={() => inspectMarker(selected)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectMarker(selected); } }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-elevated)')}
          style={{
          position: 'absolute', top: 'calc(50% + 12px)', left: '50%', transform: 'translate(-50%, 0)',
          marginTop: 90, zIndex: 14, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 8,
          background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: markerColor(selected, paletteRef.current), boxShadow: `0 0 8px ${markerColor(selected, paletteRef.current)}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: markerColor(selected, paletteRef.current) }}>{selected.tag}</span>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{ago(selected.ts)}</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: 'var(--color-accent)', marginLeft: 2 }}>ASK ↵</span>
        </div>
      )}

      {/* Command cradle — search + ask + mic */}
      <div style={{
        position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, zIndex: 16,
        maxWidth: 'calc(100% - 32px)',
        padding: '7px 8px 7px 12px', borderRadius: 12,
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}>
        {/* Filter markers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8, borderRight: '1px solid var(--color-border-subtle)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter nodes"
            aria-label="Filter Nexus nodes"
            style={{ width: 110, background: 'none', border: 'none', outline: 'none', color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--dex-font-ui)' }}
          />
        </div>
        {/* Ask UKI */}
        <span style={{ color: stateVar, fontSize: 12, fontWeight: 800, fontFamily: 'var(--dex-font-ui)' }}>›</span>
        <input
          ref={askInputRef}
          placeholder="Ask UKI…"
          aria-label="Ask UKI"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); askUki(); } }}
          style={{ width: 'min(34vw, 240px)', minWidth: 120, background: 'none', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--dex-font-ui)' }}
        />
        <button
          onClick={askUki}
          aria-label="Send to UKI"
          title="Send to UKI"
          style={cradleBtn(false)}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.25)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
        <button
          onClick={toggleMic}
          aria-label={micArmed ? 'Stop listening' : 'Start listening'}
          title={micArmed ? 'Stop listening' : 'Start listening'}
          aria-pressed={micArmed}
          style={cradleBtn(micArmed)}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.25)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components + style helpers
// ---------------------------------------------------------------------------

const chipLabel: React.CSSProperties = { fontSize: 8, fontWeight: 700, letterSpacing: 1.6, color: 'var(--color-text-muted)' };
const chipValue: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, marginTop: 2, fontVariantNumeric: 'tabular-nums' };
const chipSub: React.CSSProperties = { fontSize: 8, fontWeight: 700, letterSpacing: 1, marginTop: 1, fontVariantNumeric: 'tabular-nums' };

function cornerBox(pos: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', zIndex: 12, pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', gap: 1,
    maxWidth: 'min(180px, 36vw)',
  };
  const m = 14;
  if (pos === 'tl') return { ...base, top: m, left: m };
  if (pos === 'tr') return { ...base, top: m, right: m };
  if (pos === 'bl') return { ...base, bottom: m, left: m };
  return { ...base, bottom: m, right: m };
}

function cradleBtn(armed: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    background: armed ? 'var(--color-success-muted, rgba(52,199,89,0.16))' : 'var(--color-accent-light)',
    border: `1px solid ${armed ? 'var(--color-success)' : 'var(--color-accent)'}`,
    color: armed ? 'var(--color-success)' : 'var(--color-accent)',
    cursor: 'pointer', transition: 'all 0.15s ease',
  };
}

const Gauge = memo(({ side, label, value, color }: { side: 'left' | 'right'; label: string; value: number; color: string }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div style={{
      position: 'absolute', top: '50%', transform: 'translateY(-50%)',
      [side]: 16, zIndex: 12, pointerEvents: 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    } as React.CSSProperties}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        <text x="22" y="23" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill={color} style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}</text>
      </svg>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 1.2, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
});
Gauge.displayName = 'NexusGauge';

export default Nexus;
