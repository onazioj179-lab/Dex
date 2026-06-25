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
 *   - Selecting a node routes it to the UKI assistant (the draggable popup) via
 *     the `dex-uki-ask` bridge. Nexus itself has no inline chat surface.
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
import { isReduceMotion } from '../../utils/MotionController';
import type { NexusEntityKind } from '../../../shared/nexus/model';

const PREFERS_REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

// ---------------------------------------------------------------------------
// Sci-fi "tech HUD" energy accents (Omnitrix teal/green + Generator-Rex nanite
// amber). These are deliberate, fixed signature hues layered ON TOP of the
// theme-aware DEX tokens — used only for structural glow: ring strokes, the
// selected/active marker, the scan motifs and chrome border-glow. They are
// NEVER applied to body text, which stays on the high-contrast token colours.
// ---------------------------------------------------------------------------
const ENERGY = '#2ee6c6';      // primary HUD glow (Omnitrix teal)
const ENERGY_HOT = '#19ffb0';  // hotter green for the active/selected core
const NANITE = '#ffae3c';      // secondary "nanite" amber for armed/active state
const ENERGY_RGB: RGB = { r: 46, g: 230, b: 198 };
const ENERGY_HOT_RGB: RGB = { r: 25, g: 255, b: 176 };
const NANITE_RGB: RGB = { r: 255, g: 174, b: 60 };
const rgba = (c: RGB, a: number): string => `rgba(${c.r},${c.g},${c.b},${a})`;
// CSS-ready glow strings reused across the DOM chrome (search pill / list).
const ENERGY_GLOW = `0 0 0 1px ${rgba(ENERGY_RGB, 0.35)}, 0 0 18px ${rgba(ENERGY_RGB, 0.28)}`;
const NANITE_GLOW = `0 0 0 1px ${rgba(NANITE_RGB, 0.40)}, 0 0 18px ${rgba(NANITE_RGB, 0.26)}`;

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

// Marker ring cap by device perf tier — denser HUDs only where the GPU/CPU can
// keep the RAF smooth. The overflow count is surfaced so nothing is silently hidden.
function markerCapForTier(tier: ReturnType<typeof getPerfTier>): number {
  return tier === 'low' ? 16 : tier === 'mid' ? 28 : tier === 'high' ? 40 : 56;
}

// Active marker filter — a free-text query plus an optional kind allow-set.
// Empty query + null kinds means "everything" (the default).
interface MarkerFilter {
  query: string;
  /** When set, only these entity kinds pass. Knowledge ('MEM') markers use the
   *  pseudo-kind 'memory' so they can be toggled alongside the real kinds. */
  kinds: Set<string> | null;
}

const EMPTY_FILTER: MarkerFilter = { query: '', kinds: null };

// Pull a bounded, recency-ranked marker set from the live model + UKI knowledge,
// narrowed by the active filter. Returns the visible slice, the post-filter total
// (for the "shown/total" read-out), and the unfiltered grand total so the UI can
// tell the difference between "nothing here" and "filtered everything out".
function collectMarkers(
  knowledge: ReadonlyArray<{ id: string; label: string; color: string; weight: number; timestamp: number }>,
  pal: Palette,
  cap: number,
  filter: MarkerFilter = EMPTY_FILTER,
): { markers: Marker[]; total: number; grandTotal: number } {
  const model = getNexusModel();
  const out: Marker[] = [];
  const seen = new Set<string>();
  const q = filter.query.trim().toLowerCase();
  const kinds = filter.kinds;
  let grandTotal = 0;

  const passes = (label: string, tag: string, kind: string): boolean => {
    if (kinds && !kinds.has(kind)) return false;
    if (q && !label.toLowerCase().includes(q) && !tag.toLowerCase().includes(q)) return false;
    return true;
  };

  for (const kind of ALL_KINDS) {
    for (const e of model.byKind(kind)) {
      const key = (e.label || e.id).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      grandTotal++;
      const meta = KIND_META[kind];
      const label = e.label || e.id;
      if (!passes(label, meta.tag, kind)) continue;
      out.push({ id: e.id, label, colorKey: meta.key, tag: meta.tag, ts: e.ts, weight: 1, sx: 0, sy: 0 });
    }
  }
  for (const k of knowledge) {
    const key = (k.label || k.id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    grandTotal++;
    const label = k.label || k.id;
    if (!passes(label, 'MEM', 'memory')) continue;
    out.push({ id: k.id, label, rawColor: resolveColor(k.color, pal), tag: 'MEM', ts: k.timestamp || 0, weight: k.weight || 0.5, sx: 0, sy: 0 });
  }

  out.sort((a, b) => b.ts - a.ts);
  return { markers: out.slice(0, cap), total: out.length, grandTotal };
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
  // Live reduced-motion gate (in addition to the static PREFERS_REDUCED_MOTION
  // snapshot) so the new scan-sweep respects a toggle made after mount.
  const reduceMotionRef = useRef(isReduceMotion());

  const markersRef = useRef<Marker[]>([]);
  const rotationRef = useRef(0);
  const dragRef = useRef({ active: false, startX: 0, startRot: 0, moved: false });
  const mouseRef = useRef({ x: -999, y: -999 });
  const hoverRef = useRef(-1);
  const selectedRef = useRef(-1);
  const hitRafRef = useRef(0);

  const [selected, setSelected] = useState<Marker | null>(null);
  const [hover, setHover] = useState<Marker | null>(null);
  const [markerCount, setMarkerCount] = useState(0);
  const [markerTotal, setMarkerTotal] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  // Visible marker set, mirrored into React so the list panel can render the same
  // nodes the canvas ring shows (single source of truth: markersRef).
  const [visible, setVisible] = useState<Marker[]>([]);

  // --- Search + kind filter (narrows the ring, the list, and the read-outs) ---
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<Set<string> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Default-collapsed node list: progressive disclosure of the ring contents.
  // Auto-opens while a search is active so results are pickable without hunting
  // for a small dot on a slowly rotating ring.
  const [listOpen, setListOpen] = useState(false);
  const filterRef = useRef<MarkerFilter>(EMPTY_FILTER);
  useEffect(() => {
    filterRef.current = { query, kinds: kindFilter };
  }, [query, kindFilter]);
  const toggleKind = useCallback((kind: string) => {
    setKindFilter(prev => {
      const next = new Set(prev ?? []);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next.size === 0 ? null : next;
    });
  }, []);
  const clearFilters = useCallback(() => { setQuery(''); setKindFilter(null); }, []);
  const filtering = query.trim().length > 0 || (kindFilter !== null && kindFilter.size > 0);

  // Minimal mode (persisted) collapses the read-outs/gauges to just the reticle;
  // a narrow container auto-collapses too. `compact` is the effective state.
  const [minimal, setMinimal] = useState(() => {
    try { return localStorage.getItem('dex-nexus-minimal') === '1'; } catch { return false; }
  });
  const [narrow, setNarrow] = useState(false);
  const compact = minimal || narrow;
  const compactRef = useRef(compact);
  useEffect(() => { compactRef.current = compact; }, [compact]);
  const toggleMinimal = useCallback(() => {
    setMinimal(v => { const n = !v; try { localStorage.setItem('dex-nexus-minimal', n ? '1' : '0'); } catch { /* noop */ } return n; });
  }, []);
  const closeApp = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dex-close-app', { detail: { id: 'nexus' } }));
  }, []);

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

  // --- Live data: subscribe Nexus ingest + rebuild markers on change ---------
  // Reads the active filter from filterRef (not deps) so rapid search keystrokes
  // don't re-create rebuild and churn the onNexusChange subscription.
  const rebuild = useCallback(() => {
    const { markers: next, total, grandTotal: gt } = collectMarkers(
      knowledgeNodes, paletteRef.current, markerCapForTier(getPerfTier()), filterRef.current,
    );
    markersRef.current = next;
    setVisible(next);
    setMarkerCount(next.length);
    setMarkerTotal(total);
    setGrandTotal(gt);
    if (selectedRef.current >= 0) {
      const sel = selected;
      const idx = sel ? next.findIndex(m => m.id === sel.id) : -1;
      selectedRef.current = idx;
      if (idx < 0) setSelected(null);
    }
  }, [knowledgeNodes, selected]);

  // Re-derive the marker set whenever the filter changes.
  useEffect(() => { rebuild(); }, [query, kindFilter, rebuild]);

  useEffect(() => {
    const off = installNexusIngest();
    return off;
  }, []);

  // Auto-collapse the HUD chrome on a narrow container so a small window stays legible.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setNarrow(w < 520);
    });
    obs.observe(el);
    return () => obs.disconnect();
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
      reduceMotionRef.current = isReduceMotion(); // honour a live reduced-motion toggle
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

    const onUp = () => {
      // Only act on gestures that actually started on the canvas (onDown set
      // `active`). A mouseup that began on the search/list panel must not clear
      // the canvas selection out from under the list's own click handler.
      const wasCanvasGesture = dragRef.current.active;
      const wasDrag = dragRef.current.moved;
      dragRef.current.active = false;
      canvas.style.cursor = hoverRef.current >= 0 ? 'pointer' : 'grab';
      if (!wasCanvasGesture || wasDrag) return;
      if (hoverRef.current >= 0) {
        const m = markersRef.current[hoverRef.current];
        selectedRef.current = hoverRef.current;
        setSelected(m);
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

  // --- Keyboard: "/" focuses search, Esc clears (selection -> filter -> close) -
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      // "/" focuses the node search (wires up the long-documented shortcut).
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setListOpen(true);
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        // While typing, Esc first clears the query, then blurs the field.
        if (typing && tag === 'INPUT') {
          if (searchRef.current?.value) { setQuery(''); }
          else { searchRef.current?.blur(); }
          return;
        }
        // First Esc clears a selection; next clears any active filter; finally a
        // bare Esc closes the app -- fixes the "Esc does nothing" glitch.
        if (selectedRef.current >= 0) { selectedRef.current = -1; setSelected(null); }
        else if (filterRef.current.query || (filterRef.current.kinds?.size ?? 0) > 0) { clearFilters(); }
        else { closeApp(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeApp, clearFilters]);

  // --- The render loop -------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tier = getPerfTier();
    const dotStep = tier === 'low' ? 14 : tier === 'mid' ? 10 : 8; // dotted-ring density (deg)
    const lowTier = tier === 'low'; // drop the most expensive passes on weak GPUs

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
      // Live reduced-motion: kill the new scan-sweep animation when requested.
      const sweepMotion = motion && !reduceMotionRef.current;

      // (0) Sci-fi backdrop motif — faint hex grid + concentric scan-rings in the
      // Omnitrix energy hue, drawn UNDER the existing reticle so it reads as a
      // tech console without competing with the data. Hex grid is a flat-tier
      // decoration; concentric rings are cheap and always drawn.
      // ---- (0a) Faint hex grid (skipped on low tier to protect the budget) ----
      if (!lowTier) {
        const hexR = R * 0.30;                 // hex "radius" (centre→vertex)
        const hexW = Math.sqrt(3) * hexR;      // flat-to-flat width
        const colStep = hexW;
        const rowStep = hexR * 1.5;
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(ENERGY_RGB, 0.05);
        for (let row = -1, ry = 0; ry < h + rowStep; row++, ry = row * rowStep) {
          const xOff = (row & 1) ? hexW / 2 : 0;
          for (let cx = -hexW + xOff; cx < w + hexW; cx += colStep) {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const ang = (Math.PI / 3) * k + Math.PI / 6; // pointy-top hexes
              const px = cx + Math.cos(ang) * hexR;
              const py = ry + Math.sin(ang) * hexR;
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      // ---- (0b) Concentric scan-rings — soft energy halos around the reticle ---
      for (let ri = 0; ri < 3; ri++) {
        const rr = R * (0.46 + ri * 0.30);
        ctx.beginPath();
        ctx.arc(ccx, ccy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(ENERGY_RGB, 0.06 + ri * 0.015);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // ---- (0c) Energy scan-sweep — a thin rotating wedge of the hex backdrop.
      // Cheap (one arc + radial fade), respects reduced-motion + low tier.
      if (sweepMotion && !lowTier) {
        const scan = (t * 0.5) % (Math.PI * 2);
        const span = 0.5;
        const sg = ctx.createRadialGradient(ccx, ccy, R * 0.4, ccx, ccy, R * 1.18);
        sg.addColorStop(0, rgba(ENERGY_RGB, 0));
        sg.addColorStop(1, rgba(ENERGY_HOT_RGB, 0.10));
        ctx.beginPath();
        ctx.moveTo(ccx, ccy);
        ctx.arc(ccx, ccy, R * 1.18, scan, scan + span);
        ctx.closePath();
        ctx.fillStyle = sg;
        ctx.fill();
      }

      // (1) Diagonal framing lines to the corners, with endpoint pips. Skipped on
      // low-tier devices (a pure-decoration pass) to protect the frame budget.
      if (!lowTier) {
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

      // (3) Main + inner rings — theme-accent base with an Omnitrix energy overlay
      // so the HUD reads as "powered" while still re-colouring with the accent.
      ctx.strokeStyle = accentA(pal, 0.42);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ccx, ccy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(ENERGY_RGB, 0.30);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ccx, ccy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accentA(pal, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ccx, ccy, R * 0.82, 0, Math.PI * 2);
      ctx.stroke();

      // (4) Cardinal accent arcs — the "armed" segments, in nanite amber with a
      // soft glow (the secondary/active energy accent).
      ctx.save();
      ctx.strokeStyle = NANITE;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      if (!lowTier) { ctx.shadowColor = rgba(NANITE_RGB, 0.7); ctx.shadowBlur = 6; }
      const arcSpan = 0.34;
      for (const base of [-Math.PI * 0.75, -Math.PI * 0.25, Math.PI * 0.15]) {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(ccx, ccy, R, base, base + arcSpan);
        ctx.stroke();
      }
      ctx.restore();
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

      // (6) Sweep arc — radar style, tinted by UKI state. Off on low tier.
      if (motion && !lowTier) {
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

      // (7) Marker ring — live entities, recency-ranked around the reticle.
      const markers = markersRef.current;
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
        const isHover = hoverRef.current === i;
        const isSel = selectedRef.current === i;

        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(ccx + Math.cos(a) * R * 0.34, ccy + Math.sin(a) * R * 0.34);
        ctx.lineTo(mx, my);
        ctx.stroke();

        const rad = (isSel ? 6 : isHover ? 5 : 3.4) + (m.weight > 0.7 ? 1 : 0);
        if (isHover || isSel) {
          // Soft outer energy halo — the "powered up" glow on the active node.
          const glowC = isSel ? ENERGY_HOT_RGB : ENERGY_RGB;
          const glow = ctx.createRadialGradient(mx, my, rad, mx, my, rad + (isSel ? 14 : 10));
          glow.addColorStop(0, rgba(glowC, isSel ? 0.55 : 0.35));
          glow.addColorStop(1, rgba(glowC, 0));
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(mx, my, rad + (isSel ? 14 : 10), 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
          // Crisp energy ring around the marker.
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(mx, my, rad + 4, 0, Math.PI * 2);
          ctx.strokeStyle = isSel ? ENERGY_HOT : ENERGY;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
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

      // (9) The reticle — UKI core, wrapped in an Omnitrix-style energy aura.
      const coreR = R * 0.1 + uki.audio * R * 0.05;
      if (!lowTier) {
        const auraR = coreR + 12 + pulse * 6;
        const aura = ctx.createRadialGradient(ccx, ccy, coreR * 0.5, ccx, ccy, auraR);
        aura.addColorStop(0, rgba(ENERGY_HOT_RGB, 0.30 + pulse * 0.18));
        aura.addColorStop(1, rgba(ENERGY_RGB, 0));
        ctx.beginPath();
        ctx.arc(ccx, ccy, auraR, 0, Math.PI * 2);
        ctx.fillStyle = aura;
        ctx.fill();
      }
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
      if (!compactRef.current) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = stateColor;
        ctx.font = `700 8px ${pal.fontUI || FALLBACK_FONT_UI}`;
        ctx.fillText(sm.label, ccx, ccy + coreR + 14);
        ctx.globalAlpha = 1;
      }

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

  // Select a marker from the list panel: highlight it on the canvas ring (via the
  // shared selectedRef) and surface the focused read-out -- same path a canvas
  // click takes, so the two stay in lock-step.
  const selectMarker = useCallback((m: Marker) => {
    const idx = markersRef.current.findIndex(x => x.id === m.id);
    selectedRef.current = idx;
    setSelected(idx >= 0 ? markersRef.current[idx] : m);
  }, []);

  // Marker selection routes the node to the UKI assistant (the draggable popup)
  // and opens it, so Nexus stays a pure visualisation -- no inline chat surface.
  const inspectMarker = useCallback((m: Marker | null) => {
    if (!m) return;
    window.dispatchEvent(new CustomEvent('dex-uki-ask', { detail: { query: `Tell me about "${m.label}" (${m.tag})` } }));
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { id: 'uki' } }));
  }, []);

  const stateVar = (STATE_META[ukiState] || STATE_META.idle).cssVar;

  // ---------------------------------------------------------------------------
  return (
    <div ref={containerRef} style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      // Theme-accent wash layered over a faint Omnitrix energy bloom + a nanite
      // amber glow rising from the bottom, for the "powered console" backdrop.
      background: [
        'radial-gradient(circle at 50% 50%, var(--color-accent-soft, rgba(74,158,255,0.06)), transparent 55%)',
        `radial-gradient(circle at 50% 46%, ${rgba(ENERGY_RGB, 0.07)}, transparent 60%)`,
        `radial-gradient(circle at 50% 116%, ${rgba(NANITE_RGB, 0.06)}, transparent 50%)`,
        'var(--color-bg-base)',
      ].join(', '),
      fontFamily: 'var(--dex-font-ui)',
    }}>
      <canvas ref={canvasRef} role="img" aria-label="Nexus command HUD" style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Window controls: minimal-mode toggle + close (fixes the no-close glitch) */}
      <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 18, display: 'flex', gap: 6, pointerEvents: 'auto' }}>
        <button className="dex-liquid-glass" onClick={toggleMinimal} aria-label={minimal ? 'Show HUD details' : 'Minimal mode'} title={minimal ? 'Show HUD details' : 'Minimal mode'} style={hudCtrlBtn}
          onMouseEnter={e => { e.currentTarget.style.color = ENERGY; e.currentTarget.style.boxShadow = ENERGY_GLOW; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.boxShadow = 'none'; }}>
          {minimal
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
        </button>
        <button className="dex-liquid-glass" onClick={closeApp} aria-label="Close Nexus" title="Close Nexus" style={hudCtrlBtn}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.boxShadow = `0 0 0 1px var(--color-error), 0 0 14px rgba(255,69,58,0.30)`; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.boxShadow = 'none'; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {!compact && (<>
      {/* Top-left identity */}
      <div style={cornerBox('tl')}>
        <div style={chipLabel}>NEXUS</div>
        <div style={{ ...chipValue, color: 'var(--color-accent)' }}>UKI COMMAND HUD</div>
        <div style={{ ...chipSub, color: 'var(--color-text-muted)' }}>TIER · {readout.tier}</div>
      </div>

      {/* Top-right status — "target locator" (offset below the window controls) */}
      <div style={{ ...cornerBox('tr'), top: 46, alignItems: 'flex-end', textAlign: 'right' }}>
        <div style={{ ...chipLabel, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: stateVar, boxShadow: `0 0 6px ${stateVar}` }} />
          TARGET LOCATOR
        </div>
        <div style={{ ...chipValue, color: filtering ? 'var(--color-info)' : 'var(--color-accent)' }}>{markerCount}{markerTotal > markerCount ? `/${markerTotal}` : ''} {filtering ? 'MATCHED' : 'TRACKED'}</div>
        <div style={{ ...chipSub, color: 'var(--color-text-muted)' }}>
          {filtering
            ? `OF ${grandTotal} · ${readout.active} ACTIVE`
            : `${readout.active} ACTIVE · 5M WINDOW${markerTotal > markerCount ? ` · +${markerTotal - markerCount}` : ''}`}
        </div>
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
      </>)}

      {/* Search + filter + progressive node list. Docked bottom-centre so it never
          fights the corner read-outs. Collapsed to a single search row by default;
          the list (full node set) is opt-in, auto-opening while a search is active. */}
      <div
        style={{
          position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)',
          zIndex: 16, pointerEvents: 'auto',
          width: 'min(420px, calc(100% - 28px))',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        {/* Search row — real see-through liquid glass with an energy border-glow
            while a filter is active (background/blur/rim come from the class). */}
        <div className="dex-liquid-glass" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 6px 5px 10px', borderRadius: 'var(--radius-xl)',
          boxShadow: filtering
            ? `0 6px 18px rgba(0,0,0,0.35), ${ENERGY_GLOW}`
            : '0 6px 18px rgba(0,0,0,0.35)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={e => { setQuery(e.target.value); if (e.target.value) setListOpen(true); }}
            placeholder="Search nodes  (press /)"
            aria-label="Search Nexus nodes"
            spellCheck={false}
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600,
              fontFamily: 'var(--dex-font-ui)', padding: 0,
            }}
          />
          {filtering && (
            <button onClick={clearFilters} aria-label="Clear filters" title="Clear filters (Esc)" style={hudPillBtn}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
          <button
            onClick={() => setListOpen(v => !v)}
            aria-label={listOpen ? 'Hide node list' : 'Show node list'}
            aria-expanded={listOpen}
            title={listOpen ? 'Hide node list' : 'Show node list'}
            style={{ ...hudPillBtn, color: listOpen ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
            onMouseEnter={e => { if (!listOpen) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={e => { if (!listOpen) e.currentTarget.style.color = 'var(--color-text-muted)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        </div>

        {/* Expanded panel: kind filters + the node list (progressive disclosure).
            Liquid glass with a soft energy rim so the active surface reads as a
            powered console; background/blur/border come from the class. */}
        {listOpen && (
          <div className="dex-liquid-glass" style={{
            display: 'flex', flexDirection: 'column',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            boxShadow: `0 8px 22px rgba(0,0,0,0.4), ${ENERGY_GLOW}`,
          }}>
            {/* Kind filter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '7px 8px', borderBottom: '1px solid var(--color-border)' }}>
              {ALL_KINDS.map(kind => {
                const on = kindFilter?.has(kind) ?? false;
                const c = `var(--color-${KIND_META[kind].key === 'text' ? 'text-primary' : KIND_META[kind].key})`;
                return (
                  <button key={kind} onClick={() => toggleKind(kind)} aria-pressed={on} title={kind}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 7px', borderRadius: 5, cursor: 'pointer',
                      fontSize: 8, fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--dex-font-ui)',
                      color: on ? c : 'var(--color-text-muted)',
                      background: on ? 'var(--color-bg-hover)' : 'transparent',
                      border: `1px solid ${on ? c : 'var(--color-border)'}`,
                      transition: 'all 0.12s ease',
                    }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: c, opacity: on ? 1 : 0.5 }} />
                    {KIND_META[kind].tag}
                  </button>
                );
              })}
            </div>
            {/* Node list — the same set the ring shows, recency-ranked */}
            <div className="dex-scroll" style={{ maxHeight: 200, padding: '4px 0' }}>
              {visible.length === 0 ? (
                <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {grandTotal === 0 ? 'No activity tracked yet.' : 'No nodes match the current filter.'}
                </div>
              ) : visible.map(m => {
                const c = markerColor(m, paletteRef.current);
                const isSel = selected?.id === m.id;
                return (
                  <button key={m.id} onClick={() => selectMarker(m)} onDoubleClick={() => inspectMarker(m)}
                    title="Click to focus · double-click to ask UKI"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '6px 12px', cursor: 'pointer', textAlign: 'left',
                      background: isSel ? 'var(--color-bg-hover)' : 'transparent',
                      border: 'none', borderLeft: `2px solid ${isSel ? c : 'transparent'}`,
                      fontFamily: 'var(--dex-font-ui)', transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: c, flexShrink: 0 }}>{m.tag}</span>
                    <span style={{ fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{ago(m.ts)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hover tooltip — glass surface; the marker-colour border (inline) wins
          over the class border so the node's kind still reads at a glance. */}
      {hover && (
        <div className="dex-liquid-glass" style={{
          position: 'absolute', left: hover.sx + 14, top: hover.sy - 10,
          pointerEvents: 'none', zIndex: 20,
          border: `1px solid ${markerColor(hover, paletteRef.current)}`,
          borderRadius: 'var(--radius-lg)', padding: '5px 9px', maxWidth: 220,
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hover.label}</div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: markerColor(hover, paletteRef.current), marginTop: 1 }}>{hover.tag} · {ago(hover.ts)}</div>
        </div>
      )}

      {/* Selected read-out — the floating "ask" pill. Suppressed while the list
          panel is open, where the selected row is already highlighted (and the
          panel would otherwise overlap this pill). */}
      {selected && !listOpen && (
        <div
          className="dex-liquid-glass"
          role="button"
          tabIndex={0}
          title="Ask UKI about this node"
          onClick={() => inspectMarker(selected)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectMarker(selected); } }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = NANITE_GLOW)}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = ENERGY_GLOW)}
          style={{
          position: 'absolute', top: 'calc(50% + 12px)', left: '50%', transform: 'translate(-50%, 0)',
          marginTop: 90, zIndex: 14, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 'var(--radius-lg)',
          boxShadow: ENERGY_GLOW,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: markerColor(selected, paletteRef.current), boxShadow: `0 0 8px ${markerColor(selected, paletteRef.current)}` }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: markerColor(selected, paletteRef.current) }}>{selected.tag}</span>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{ago(selected.ts)}</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: ENERGY, marginLeft: 2 }}>ASK ↵</span>
        </div>
      )}

    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components + style helpers
// ---------------------------------------------------------------------------

// Background/blur/border come from the .dex-liquid-glass class; only the box
// geometry + the hover colour/glow transition live here.
const hudCtrlBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 'var(--radius-lg)',
  color: 'var(--color-text-muted)', cursor: 'pointer',
  transition: 'color 0.15s ease, box-shadow 0.15s ease',
};

// Borderless icon button used inside the search pill (clear / list-toggle).
const hudPillBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
  background: 'transparent', border: 'none',
  color: 'var(--color-text-muted)', cursor: 'pointer', transition: 'color 0.12s ease',
};

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
