/**
 * DEX Platform - World Clock
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Multiple timezone display with analog/digital toggle, timezone search,
 * reordering, home pinning, day/night shading and working-hours highlight.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useReducedMotion } from '../../utils/useReducedMotion';
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';

interface ClockZone {
  id: string;
  label: string;
  timezone: string;
  offset: number; // hours from UTC (static fallback / sort hint)
}

const PRESET_ZONES: ClockZone[] = [
  { id: 'nyc', label: 'New York', timezone: 'America/New_York', offset: -5 },
  { id: 'lon', label: 'London', timezone: 'Europe/London', offset: 0 },
  { id: 'par', label: 'Paris', timezone: 'Europe/Paris', offset: 1 },
  { id: 'dub', label: 'Dubai', timezone: 'Asia/Dubai', offset: 4 },
  { id: 'mum', label: 'Mumbai', timezone: 'Asia/Kolkata', offset: 5.5 },
  { id: 'sha', label: 'Shanghai', timezone: 'Asia/Shanghai', offset: 8 },
  { id: 'tok', label: 'Tokyo', timezone: 'Asia/Tokyo', offset: 9 },
  { id: 'syd', label: 'Sydney', timezone: 'Australia/Sydney', offset: 11 },
  { id: 'la', label: 'Los Angeles', timezone: 'America/Los_Angeles', offset: -8 },
  { id: 'chi', label: 'Chicago', timezone: 'America/Chicago', offset: -6 },
  { id: 'den', label: 'Denver', timezone: 'America/Denver', offset: -7 },
  { id: 'ber', label: 'Berlin', timezone: 'Europe/Berlin', offset: 1 },
  { id: 'mos', label: 'Moscow', timezone: 'Europe/Moscow', offset: 3 },
  { id: 'sin', label: 'Singapore', timezone: 'Asia/Singapore', offset: 8 },
  { id: 'hk', label: 'Hong Kong', timezone: 'Asia/Hong_Kong', offset: 8 },
  { id: 'seo', label: 'Seoul', timezone: 'Asia/Seoul', offset: 9 },
  // Extra named cities so the static catalog has good search coverage.
  { id: 'sf', label: 'San Francisco', timezone: 'America/Los_Angeles', offset: -8 },
  { id: 'tor', label: 'Toronto', timezone: 'America/Toronto', offset: -5 },
  { id: 'mex', label: 'Mexico City', timezone: 'America/Mexico_City', offset: -6 },
  { id: 'sao', label: 'Sao Paulo', timezone: 'America/Sao_Paulo', offset: -3 },
  { id: 'bue', label: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires', offset: -3 },
  { id: 'mad', label: 'Madrid', timezone: 'Europe/Madrid', offset: 1 },
  { id: 'rom', label: 'Rome', timezone: 'Europe/Rome', offset: 1 },
  { id: 'ams', label: 'Amsterdam', timezone: 'Europe/Amsterdam', offset: 1 },
  { id: 'ist', label: 'Istanbul', timezone: 'Europe/Istanbul', offset: 3 },
  { id: 'cai', label: 'Cairo', timezone: 'Africa/Cairo', offset: 2 },
  { id: 'jnb', label: 'Johannesburg', timezone: 'Africa/Johannesburg', offset: 2 },
  { id: 'lag', label: 'Lagos', timezone: 'Africa/Lagos', offset: 1 },
  { id: 'nbo', label: 'Nairobi', timezone: 'Africa/Nairobi', offset: 3 },
  { id: 'tlv', label: 'Tel Aviv', timezone: 'Asia/Jerusalem', offset: 2 },
  { id: 'kar', label: 'Karachi', timezone: 'Asia/Karachi', offset: 5 },
  { id: 'dha', label: 'Dhaka', timezone: 'Asia/Dhaka', offset: 6 },
  { id: 'bkk', label: 'Bangkok', timezone: 'Asia/Bangkok', offset: 7 },
  { id: 'jak', label: 'Jakarta', timezone: 'Asia/Jakarta', offset: 7 },
  { id: 'man', label: 'Manila', timezone: 'Asia/Manila', offset: 8 },
  { id: 'akl', label: 'Auckland', timezone: 'Pacific/Auckland', offset: 13 },
  { id: 'hnl', label: 'Honolulu', timezone: 'Pacific/Honolulu', offset: -10 },
];

const LS_ZONES = 'dex-worldclock-zones';
const LS_24H = 'dex-worldclock-24h';
const LS_HOME = 'dex-worldclock-home';
const LS_CUSTOM = 'dex-worldclock-custom';

// Day/night and working-hours thresholds (local wall-clock hour).
const DAY_START = 6;
const DAY_END = 18;
const WORK_START = 9;
const WORK_END = 17;

// Friendly label from an IANA timezone id, e.g. "Asia/Kolkata" -> "Kolkata".
const labelFromTimezone = (tz: string) =>
  (tz.split('/').pop() || tz).replace(/_/g, ' ');

// Best-effort list of all supported IANA timezones for autocomplete.
const ALL_TIMEZONES: string[] = (() => {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') return fn('timeZone');
  } catch { /* ignore */ }
  return [];
})();

const WorldClock: React.FC = () => {
  const [now, setNow] = useState(new Date());
  // Honour OS reduced-motion: the analog hands sweep with an easing transition
  // by default; when reduced motion is requested we let them tick instantly.
  const reducedMotion = useReducedMotion();

  // User-created zones (from timezone search) kept separately so they survive
  // reloads even though they are not in PRESET_ZONES.
  const [customZones, setCustomZones] = useState<ClockZone[]>(() => {
    try {
      const saved = localStorage.getItem(LS_CUSTOM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter(
          (z): z is ClockZone => z && typeof z.id === 'string' && typeof z.timezone === 'string',
        );
      }
    } catch { /* ignore */ }
    return [];
  });

  // Combined catalog used to resolve ids and to search.
  const catalog = useMemo(() => {
    const map = new Map<string, ClockZone>();
    for (const z of PRESET_ZONES) map.set(z.id, z);
    for (const z of customZones) map.set(z.id, z);
    return map;
  }, [customZones]);

  const [activeZones, setActiveZones] = useState<ClockZone[]>(() => {
    try {
      const saved = localStorage.getItem(LS_ZONES);
      if (saved) {
        const ids: string[] = JSON.parse(saved);
        const all = new Map<string, ClockZone>();
        for (const z of PRESET_ZONES) all.set(z.id, z);
        try {
          const custom = JSON.parse(localStorage.getItem(LS_CUSTOM) || '[]');
          if (Array.isArray(custom)) for (const z of custom) if (z?.id) all.set(z.id, z);
        } catch { /* ignore */ }
        const zones = ids.map(id => all.get(id)).filter(Boolean) as ClockZone[];
        if (zones.length > 0) return zones;
      }
    } catch { /* ignore */ }
    return [PRESET_ZONES[0], PRESET_ZONES[1], PRESET_ZONES[6], PRESET_ZONES[7]];
  });

  const [showAnalog, setShowAnalog] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  // Active row in the search list for keyboard (Arrow/Enter) navigation.
  const [activeResult, setActiveResult] = useState(0);

  const [is24h, setIs24h] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS_24H);
      if (saved !== null) return saved === 'true';
    } catch { /* ignore */ }
    return true;
  });

  const [homeId, setHomeId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_HOME);
    } catch { /* ignore */ }
    return null;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => setNow(new Date()), 1000);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null; }
      } else if (!timer) {
        setNow(new Date());
        timer = setInterval(() => setNow(new Date()), 1000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // --- Persistence (each in its own safe try/catch) ---
  useEffect(() => {
    try { localStorage.setItem(LS_ZONES, JSON.stringify(activeZones.map(z => z.id))); } catch { /* ignore */ }
  }, [activeZones]);

  useEffect(() => {
    try { localStorage.setItem(LS_CUSTOM, JSON.stringify(customZones)); } catch { /* ignore */ }
  }, [customZones]);

  useEffect(() => {
    try { localStorage.setItem(LS_24H, String(is24h)); } catch { /* ignore */ }
  }, [is24h]);

  useEffect(() => {
    try {
      if (homeId) localStorage.setItem(LS_HOME, homeId);
      else localStorage.removeItem(LS_HOME);
    } catch { /* ignore */ }
  }, [homeId]);

  // If the home zone is removed, clear the home pin so offsets stay coherent.
  useEffect(() => {
    if (homeId && !activeZones.find(z => z.id === homeId)) setHomeId(null);
  }, [activeZones, homeId]);

  // UKI app-context: expose the displayed cities, the pinned home city, and the
  // 12/24h preference. A ref keeps the resolver reading live state so we
  // register once at mount (no churn as clocks tick).
  const ukiCtxRef = useRef({ activeZones, homeId, is24h });
  ukiCtxRef.current = { activeZones, homeId, is24h };
  useEffect(() => {
    registerUkiAppContext('worldclock', () => {
      const s = ukiCtxRef.current;
      const home = s.homeId ? s.activeZones.find(z => z.id === s.homeId) : undefined;
      return {
        appId: 'worldclock',
        focusedItemId: s.homeId || undefined,
        custom: {
          cities: s.activeZones.map(z => z.label).join(', ') || '(none)',
          cityCount: s.activeZones.length,
          home: home?.label || '(none)',
          hourFormat: s.is24h ? '24h' : '12h',
        },
      };
    });
    return () => unregisterUkiAppContext('worldclock');
  }, []);

  const addZone = useCallback((zone: ClockZone) => {
    setActiveZones(prev => (prev.find(z => z.id === zone.id) ? prev : [...prev, zone]));
  }, []);

  const removeZone = useCallback((id: string) => {
    setActiveZones(prev => prev.filter(z => z.id !== id));
  }, []);

  const moveZone = useCallback((id: string, dir: -1 | 1) => {
    setActiveZones(prev => {
      const idx = prev.findIndex(z => z.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }, []);

  // --- Drag & drop reordering ---
  const [dragId, setDragId] = useState<string | null>(null);
  const onDrop = useCallback((targetId: string) => {
    setActiveZones(prev => {
      if (!dragId || dragId === targetId) return prev;
      const from = prev.findIndex(z => z.id === dragId);
      const to = prev.findIndex(z => z.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDragId(null);
  }, [dragId]);

  // --- Search results: catalog cities first, then raw IANA timezones ---
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeIds = new Set(activeZones.map(z => z.id));
    const results: ClockZone[] = [];
    const seenTz = new Set<string>();

    const catalogList = Array.from(catalog.values());
    for (const z of catalogList) {
      if (activeIds.has(z.id)) continue;
      const hay = `${z.label} ${z.timezone}`.toLowerCase();
      if (!q || hay.includes(q)) {
        results.push(z);
        seenTz.add(z.timezone);
      }
      if (results.length >= 40) break;
    }

    if (q) {
      for (const tz of ALL_TIMEZONES) {
        if (results.length >= 40) break;
        if (seenTz.has(tz)) continue;
        if (!tz.toLowerCase().includes(q)) continue;
        const id = `tz:${tz}`;
        if (activeIds.has(id)) continue;
        results.push({
          id,
          label: labelFromTimezone(tz),
          timezone: tz,
          offset: liveOffsetHours(tz, now),
        });
        seenTz.add(tz);
      }
    }
    return results;
  }, [query, activeZones, catalog, now]);

  // When a raw-timezone result is chosen, remember it as a custom zone.
  const chooseResult = useCallback((zone: ClockZone) => {
    if (zone.id.startsWith('tz:')) {
      setCustomZones(prev => (prev.find(z => z.id === zone.id) ? prev : [...prev, zone]));
    }
    addZone(zone);
    setQuery('');
    setActiveResult(0);
  }, [addZone]);

  // Keep the keyboard cursor in range as the result set shrinks/grows.
  useEffect(() => { setActiveResult(0); }, [query]);

  // Arrow/Enter/Escape navigation over the search results.
  const onSearchKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResult(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResult(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = searchResults[activeResult];
      if (pick) chooseResult(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else setShowAdd(false);
    }
  }, [searchResults, activeResult, chooseResult, query]);

  const getTimeInZone = (zone: ClockZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);
    return new Date(
      getPart('year'),
      getPart('month') - 1,
      getPart('day'),
      getPart('hour'),
      getPart('minute'),
      getPart('second'),
    );
  };

  const formatOffset = (zone: ClockZone) => {
    try {
      const offset = new Intl.DateTimeFormat('en-US', {
        timeZone: zone.timezone,
        timeZoneName: 'shortOffset',
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value;
      if (offset) return offset.replace('GMT', 'UTC');
    } catch {
      // Fall back to the static offset when the runtime lacks shortOffset support.
    }
    return `UTC${zone.offset >= 0 ? '+' : ''}${zone.offset}`;
  };

  const formatTime = (d: Date) => {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    if (is24h) return `${String(h).padStart(2, '0')}:${m}:${sec}`;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m}:${sec} ${ampm}`;
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Whole-day delta between a zone's wall-clock date and the reference date,
  // independent of the sub-day hour delta. Used to label "tomorrow"/"yesterday".
  const dayDelta = (zoneTime: Date, ref: Date) => {
    const a = new Date(zoneTime.getFullYear(), zoneTime.getMonth(), zoneTime.getDate());
    const b = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  };

  // Human relative-offset string, e.g. "+3h, tomorrow" or "Same as home".
  const relativeLabel = (zoneTime: Date, ref: Date, refLabel: string) => {
    const dh = Math.round((zoneTime.getTime() - ref.getTime()) / 3600000);
    const dd = dayDelta(zoneTime, ref);
    const dayWord = dd === 1 ? 'tomorrow' : dd === -1 ? 'yesterday'
      : dd > 1 ? `+${dd} days` : dd < -1 ? `${dd} days` : '';
    if (dh === 0 && !dayWord) return `Same as ${refLabel}`;
    const hourPart = dh === 0 ? `Same hour` : `${dh > 0 ? '+' : ''}${dh}h`;
    const suffix = dayWord ? `, ${dayWord}` : ` vs ${refLabel}`;
    return `${hourPart}${suffix}`;
  };

  const AnalogClock: React.FC<{ time: Date; size: number; day?: boolean }> = ({ time, size, day = true }) => {
    const cx = size / 2, cy = size / 2;
    const hr = time.getHours() % 12 + time.getMinutes() / 60;
    const mn = time.getMinutes() + time.getSeconds() / 60;
    const sc = time.getSeconds();
    // Angles: 0 deg = 12 o'clock, rotate clockwise
    const hAngle = (hr / 12) * 360;
    const mAngle = (mn / 60) * 360;
    const sAngle = (sc / 60) * 360;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    // The dial face and hands invert their contrast for night zones so the
    // little clocks read like a real day/night world map at a glance.
    const faceFill = day ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.35)';
    const handColor = 'var(--color-text-primary)';
    const tickColor = day ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)';

    // Hand rendered as vertical line from center going up, rotated by transform
    const Hand: React.FC<{ angle: number; len: number; w: number; color: string; smooth?: boolean }> =
      ({ angle, len, w, color, smooth = true }) => (
        <line
          x1={cx} y1={cy} x2={cx} y2={cy - len}
          stroke={color} strokeWidth={w} strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
            transition: smooth && !reducedMotion ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        />
      );

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Analog clock showing ${formatTime(time)}`}>
        <circle cx={cx} cy={cy} r={cx - 2} fill={faceFill} stroke="var(--color-border)" strokeWidth="1.5" />
        {[...Array(12)].map((_, i) => {
          const a = rad((i / 12) * 360 - 90);
          // Quarter ticks (12/3/6/9) are longer and bolder, like a real dial.
          const major = i % 3 === 0;
          const r1 = cx - 5, r2 = cx - (major ? 13 : 9);
          return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke={tickColor} strokeWidth={major ? 2 : 1} strokeLinecap="round" />;
        })}
        <Hand angle={hAngle} len={cx * 0.5} w={3} color={handColor} />
        <Hand angle={mAngle} len={cx * 0.7} w={2} color={handColor} />
        <Hand angle={sAngle} len={cx * 0.75} w={1} color="var(--color-error, #FF453A)" smooth={false} />
        <circle cx={cx} cy={cy} r={3} fill="var(--color-error, #FF453A)" />
      </svg>
    );
  };

  const isDayTime = (d: Date) => d.getHours() >= DAY_START && d.getHours() < DAY_END;
  const isWorkingHours = (d: Date) => d.getHours() >= WORK_START && d.getHours() < WORK_END;

  // Home reference time used to compute relative offsets.
  const homeZone = homeId ? activeZones.find(z => z.id === homeId) : undefined;
  const homeTime = homeZone ? getTimeInZone(homeZone) : null;

  return (
    <div style={s.container}>
      {/* Scoped polish: hover border, control reveal. Focus uses the one global ring. */}
      <style>{`
        .wc-card { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
        .wc-card:hover { border-color: var(--color-border-strong) !important; }
        .wc-card .wc-icon-btn { opacity: 0; transition: opacity 0.15s ease; }
        .wc-card:hover .wc-icon-btn,
        .wc-card:focus-within .wc-icon-btn { opacity: 1; }
        .wc-icon-btn { border-radius: 6px; }
        .wc-icon-btn:hover { color: var(--color-text-primary); background: var(--color-bg-hover, rgba(255,255,255,0.08)); }
        .wc-result-row { transition: background 0.12s ease; }
        .wc-result-row:hover { background: var(--color-bg-hover, rgba(255,255,255,0.08)) !important; }
        @media (prefers-reduced-motion: reduce) {
          .wc-card, .wc-card .wc-icon-btn, .wc-result-row { transition: none; }
        }
      `}</style>
      {/* Toolbar */}
      <div className="dex-liquid-glass" style={s.toolbar}>
        <span style={s.title}>World Clock</span>
        <div style={s.toolbarRight}>
          <button className="dex-liquid-glass" style={{ ...s.toggleBtn, fontWeight: is24h ? 700 : 400 }} onClick={() => setIs24h(!is24h)} aria-label="Toggle 12/24 hour">
            {is24h ? '24h' : '12h'}
          </button>
          <button
            style={{ ...s.toggleBtn, background: showAnalog ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : 'transparent', color: showAnalog ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
            onClick={() => setShowAnalog(!showAnalog)}
            aria-label="Toggle analog clocks"
          >CLK</button>
          <button
            style={{ ...s.addBtn, background: showAdd ? 'var(--color-text-secondary)' : 'var(--color-accent-fill)' }}
            onClick={() => setShowAdd(!showAdd)}
            aria-label="Add city"
          >+</button>
        </div>
      </div>

      {/* Add City Panel with search + autocomplete */}
      {showAdd && (
        <div className="dex-liquid-glass-strong" style={s.addPanel}>
          <input
            className="dex-liquid-glass wc-search"
            style={s.searchInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search a city or timezone (e.g. Tokyo, America/Denver)"
            aria-label="Search city or timezone"
            role="combobox"
            aria-expanded={searchResults.length > 0}
            aria-controls="wc-results"
            aria-activedescendant={searchResults[activeResult] ? `wc-result-${searchResults[activeResult].id}` : undefined}
            autoFocus
          />
          {searchResults.length === 0 ? (
            <div style={s.searchEmpty}>
              {query.trim()
                ? `No cities or timezones match "${query.trim()}".`
                : 'Start typing to search the timezone catalog.'}
            </div>
          ) : (
            <div style={s.resultsList} id="wc-results" role="listbox">
              {searchResults.map((zone, ri) => (
                <button
                  key={zone.id}
                  id={`wc-result-${zone.id}`}
                  className="wc-result-row"
                  role="option"
                  aria-selected={ri === activeResult}
                  style={{
                    ...s.resultRow,
                    background: ri === activeResult ? 'var(--color-bg-hover, rgba(255,255,255,0.08))' : 'transparent',
                  }}
                  onClick={() => chooseResult(zone)}
                  onMouseEnter={() => setActiveResult(ri)}
                  aria-label={`Add ${zone.label}`}
                >
                  <span style={s.resultLabel}>{zone.label}</span>
                  <span style={s.resultTz}>{zone.timezone}</span>
                  <span style={s.resultOffset}>{formatOffset(zone)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clock Grid */}
      {activeZones.length === 0 ? (
        <div style={s.emptyState}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ opacity: 0.5 }}>
            <circle cx="12" cy="12" r="9" stroke="var(--color-text-tertiary)" strokeWidth="1.5" />
            <path d="M12 7.5V12l3 2" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={s.emptyTitle}>No cities yet</div>
          <div style={s.emptyHint}>Track time around the world. Add your first city to begin.</div>
          <button
            className="wc-search"
            style={s.emptyCta}
            onClick={() => setShowAdd(true)}
          >Add a city</button>
        </div>
      ) : (
      <div style={s.clockGrid}>
        {activeZones.map((zone, idx) => {
          const zoneTime = getTimeInZone(zone);
          const isDay = isDayTime(zoneTime);
          const working = isWorkingHours(zoneTime);
          const isHome = zone.id === homeId;

          // Offset relative to the home clock when one is pinned, otherwise
          // relative to the user's local time. Both sides are wall-clock Dates
          // so the ms delta is DST-correct.
          const ref = homeTime ?? now;
          const refLabel = homeTime ? 'home' : 'here';
          const relLabel = relativeLabel(zoneTime, ref, refLabel);

          const cardBg = isHome
            ? 'var(--color-accent-light, rgba(10,132,255,0.14))'
            : isDay ? 'var(--color-border-subtle)' : 'rgba(0,0,0,0.2)';

          return (
            <div
              key={zone.id}
              className="wc-card"
              draggable
              onDragStart={() => setDragId(zone.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(zone.id)}
              onDragEnd={() => setDragId(null)}
              style={{
                ...s.clockCard,
                background: cardBg,
                border: isHome
                  ? '1px solid var(--color-accent)'
                  : working
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--color-border, var(--color-bg-hover))',
                opacity: dragId === zone.id ? 0.5 : 1,
                cursor: 'grab',
              }}
            >
              {/* Top-right controls */}
              <div style={s.cardControls}>
                <button
                  className="wc-icon-btn"
                  style={{ ...s.iconBtn, color: isHome ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                  onClick={() => setHomeId(isHome ? null : zone.id)}
                  aria-label={isHome ? `Unpin ${zone.label} as home` : `Pin ${zone.label} as home`}
                  title={isHome ? 'Home (click to unpin)' : 'Set as home'}
                >{isHome ? '★' : '☆'}</button>
                <button
                  className="wc-icon-btn"
                  style={{ ...s.iconBtn, opacity: idx === 0 ? 0.3 : 1 }}
                  onClick={() => moveZone(zone.id, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${zone.label} left`}
                  title="Move left"
                >{'‹'}</button>
                <button
                  className="wc-icon-btn"
                  style={{ ...s.iconBtn, opacity: idx === activeZones.length - 1 ? 0.3 : 1 }}
                  onClick={() => moveZone(zone.id, 1)}
                  disabled={idx === activeZones.length - 1}
                  aria-label={`Move ${zone.label} right`}
                  title="Move right"
                >{'›'}</button>
                <button
                  className="wc-icon-btn"
                  style={s.iconBtn}
                  onClick={() => removeZone(zone.id)}
                  aria-label={`Remove ${zone.label}`}
                  title="Remove"
                >{'×'}</button>
              </div>

              <div style={s.clockLabel}>
                {zone.label}
                {isHome && <span style={s.homeTag}>HOME</span>}
              </div>
              <div style={s.clockOffset}>{formatOffset(zone)}</div>
              <div style={s.relOffset}>{relLabel}</div>
              {showAnalog && <AnalogClock time={zoneTime} size={100} day={isDay} />}
              <div style={s.clockTime}>{formatTime(zoneTime)}</div>
              <div style={s.clockDate}>{formatDate(zoneTime)}</div>
              <div style={s.statusRow}>
                <span style={s.dayNight}>
                  {isDay ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="4.5" fill="var(--color-warning, #FFD60A)" />
                      {[...Array(8)].map((_, i) => {
                        const a = (i / 8) * Math.PI * 2;
                        return <line key={i} x1={12 + Math.cos(a) * 7} y1={12 + Math.sin(a) * 7} x2={12 + Math.cos(a) * 9.5} y2={12 + Math.sin(a) * 9.5} stroke="var(--color-warning, #FFD60A)" strokeWidth="1.6" strokeLinecap="round" />;
                      })}
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M21 12.8A8 8 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" fill="var(--color-text-secondary)" />
                    </svg>
                  )}
                  {isDay ? 'Day' : 'Night'}
                </span>
                {working && <span style={s.workBadge}>Working hours</span>}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

// Live UTC offset (hours) for a timezone at a given instant, used to seed the
// static `offset` field of search-created custom zones.
function liveOffsetHours(timezone: string, at: Date): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      .formatToParts(at).find(p => p.type === 'timeZoneName')?.value;
    if (name) {
      const m = name.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
      if (m) {
        const h = Number(m[1]);
        const min = m[2] ? Number(m[2]) : 0;
        return h + (h < 0 ? -min / 60 : min / 60);
      }
    }
  } catch { /* ignore */ }
  return 0;
}

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-5)', borderRadius: 0,
    flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
  toolbarRight: { display: 'flex', gap: 6 },
  toggleBtn: {
    padding: '5px 10px', borderRadius: 10, border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  addBtn: {
    width: 28, height: 28, borderRadius: 10, border: 'none',
    background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  addPanel: {
    padding: 'var(--space-3) var(--space-5)', borderRadius: 0,
    display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-2)',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box' as const,
    padding: '8px var(--space-3)', borderRadius: 10,
    color: 'var(--color-text-primary)',
    fontSize: 13, fontFamily: 'var(--font-family)', outline: 'none',
  },
  searchEmpty: { fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 2px' },
  resultsList: {
    display: 'flex', flexDirection: 'column' as const, gap: 2,
    maxHeight: 220, overflowY: 'auto' as const,
  },
  resultRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: '6px var(--space-3)', borderRadius: 10, border: 'none',
    background: 'transparent', color: 'var(--color-text-primary)',
    cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-family)',
    textAlign: 'left' as const, width: '100%',
  },
  resultLabel: { fontWeight: 600, flex: '0 0 auto' },
  resultTz: { color: 'var(--color-text-tertiary)', flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  resultOffset: { color: 'var(--color-text-secondary)', fontSize: 11, flex: '0 0 auto' },
  clockGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-3)', padding: 'var(--space-5)', flex: 1,
  },
  clockCard: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: 'var(--space-5) var(--space-4)', borderRadius: 14,
    border: '1px solid var(--color-border, var(--color-bg-hover))',
    position: 'relative' as const, gap: 4,
  },
  cardControls: {
    position: 'absolute' as const, top: 6, right: 6,
    display: 'flex', alignItems: 'center', gap: 2,
  },
  iconBtn: {
    background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
    fontSize: 15, cursor: 'pointer', padding: 2, lineHeight: 1,
    fontFamily: 'var(--font-family)',
  },
  homeTag: {
    marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
    color: 'var(--color-text-tertiary)', verticalAlign: 'middle',
  },
  clockLabel: { fontSize: 14, fontWeight: 600, marginTop: 12 },
  clockOffset: { fontSize: 11, color: 'var(--color-text-secondary)' },
  relOffset: { fontSize: 11, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' },
  dayNight: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-secondary)' },
  clockTime: {
    fontSize: 24, fontWeight: 300, fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em', marginTop: 4,
  },
  clockDate: { fontSize: 11, color: 'var(--color-text-secondary)' },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' as const, justifyContent: 'center',
  },
  workBadge: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
    color: 'var(--color-text-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 10, padding: '1px 5px',
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-5)', textAlign: 'center' as const,
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' },
  emptyHint: { fontSize: 12, color: 'var(--color-text-tertiary)', maxWidth: 260 },
  emptyCta: {
    marginTop: 'var(--space-2)', padding: '7px 16px', borderRadius: 10,
    border: 'none', background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
};

export default memo(WorldClock);
