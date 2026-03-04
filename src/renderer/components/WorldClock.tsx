/**
 * DEX World Clock
 * Display multiple time zones, compare times, and manage favorites
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useEffect, useMemo, memo } from 'react';

// ============================================================================
// TIMEZONE DATA
// ============================================================================

interface TimeZoneInfo {
  id: string;
  label: string;
  utcOffset: number; // hours from UTC
  city: string;
  region: string;
}

const TIMEZONES: TimeZoneInfo[] = [
  { id: 'utc', label: 'UTC', utcOffset: 0, city: 'UTC', region: 'Universal' },
  { id: 'est', label: 'EST (New York)', utcOffset: -5, city: 'New York', region: 'Americas' },
  { id: 'cst', label: 'CST (Chicago)', utcOffset: -6, city: 'Chicago', region: 'Americas' },
  { id: 'mst', label: 'MST (Denver)', utcOffset: -7, city: 'Denver', region: 'Americas' },
  { id: 'pst', label: 'PST (Los Angeles)', utcOffset: -8, city: 'Los Angeles', region: 'Americas' },
  { id: 'akst', label: 'AKST (Anchorage)', utcOffset: -9, city: 'Anchorage', region: 'Americas' },
  { id: 'hst', label: 'HST (Honolulu)', utcOffset: -10, city: 'Honolulu', region: 'Americas' },
  { id: 'brt', label: 'BRT (Sao Paulo)', utcOffset: -3, city: 'Sao Paulo', region: 'Americas' },
  { id: 'art', label: 'ART (Buenos Aires)', utcOffset: -3, city: 'Buenos Aires', region: 'Americas' },
  { id: 'gmt', label: 'GMT (London)', utcOffset: 0, city: 'London', region: 'Europe' },
  { id: 'cet', label: 'CET (Paris)', utcOffset: 1, city: 'Paris', region: 'Europe' },
  { id: 'eet', label: 'EET (Athens)', utcOffset: 2, city: 'Athens', region: 'Europe' },
  { id: 'msk', label: 'MSK (Moscow)', utcOffset: 3, city: 'Moscow', region: 'Europe' },
  { id: 'ist', label: 'IST (Mumbai)', utcOffset: 5.5, city: 'Mumbai', region: 'Asia' },
  { id: 'bst', label: 'BST (Dhaka)', utcOffset: 6, city: 'Dhaka', region: 'Asia' },
  { id: 'ict', label: 'ICT (Bangkok)', utcOffset: 7, city: 'Bangkok', region: 'Asia' },
  { id: 'cst_cn', label: 'CST (Shanghai)', utcOffset: 8, city: 'Shanghai', region: 'Asia' },
  { id: 'jst', label: 'JST (Tokyo)', utcOffset: 9, city: 'Tokyo', region: 'Asia' },
  { id: 'kst', label: 'KST (Seoul)', utcOffset: 9, city: 'Seoul', region: 'Asia' },
  { id: 'aest', label: 'AEST (Sydney)', utcOffset: 10, city: 'Sydney', region: 'Oceania' },
  { id: 'nzst', label: 'NZST (Auckland)', utcOffset: 12, city: 'Auckland', region: 'Oceania' },
  { id: 'wat', label: 'WAT (Lagos)', utcOffset: 1, city: 'Lagos', region: 'Africa' },
  { id: 'eat', label: 'EAT (Nairobi)', utcOffset: 3, city: 'Nairobi', region: 'Africa' },
  { id: 'sast', label: 'SAST (Johannesburg)', utcOffset: 2, city: 'Johannesburg', region: 'Africa' },
  { id: 'gst', label: 'GST (Dubai)', utcOffset: 4, city: 'Dubai', region: 'Middle East' },
  { id: 'irst', label: 'IRST (Tehran)', utcOffset: 3.5, city: 'Tehran', region: 'Middle East' },
];

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-world-clock';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return ['utc', 'est', 'gmt', 'jst', 'ist'];
}

function saveFavorites(ids: string[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeInZone(utcOffset: number): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + utcOffset * 3600000);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function getTimePeriod(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = date.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

const PERIOD_COLORS: Record<string, string> = {
  morning: '#fbbf24',
  afternoon: '#f59e0b',
  evening: '#f97316',
  night: '#6366f1',
};

function utcOffsetStr(offset: number): string {
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const h = Math.floor(abs);
  const m = (abs - h) * 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const WorldClock: React.FC = memo(() => {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareHour, setCompareHour] = useState(new Date().getHours());

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const persist = useCallback((ids: string[]) => { setFavorites(ids); saveFavorites(ids); }, []);

  const toggleFavorite = useCallback((id: string) => {
    persist(favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id]);
  }, [favorites, persist]);

  const moveFavorite = useCallback((id: string, dir: -1 | 1) => {
    const idx = favorites.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= favorites.length) return;
    const next = [...favorites];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    persist(next);
  }, [favorites, persist]);

  const favoriteZones = useMemo(
    () => favorites.map(id => TIMEZONES.find(tz => tz.id === id)).filter(Boolean) as TimeZoneInfo[],
    [favorites]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz =>
      tz.label.toLowerCase().includes(q) ||
      tz.city.toLowerCase().includes(q) ||
      tz.region.toLowerCase().includes(q)
    );
  }, [search]);

  // Local time info
  const localOffset = -new Date().getTimezoneOffset() / 60;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>World Clock</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setCompareMode(!compareMode)}
            style={{ ...styles.headerBtn, ...(compareMode ? { background: 'rgba(59,130,246,0.12)', color: '#3b82f6' } : {}) }}>
            Compare
          </button>
          <button onClick={() => setShowAddPanel(!showAddPanel)} style={styles.headerBtn}>
            {showAddPanel ? 'Done' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Compare slider */}
      {compareMode && (
        <div style={styles.comparePanel}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Compare hour:</span>
          <input type="range" min={0} max={23} value={compareHour} onChange={e => setCompareHour(Number(e.target.value))}
            style={{ flex: 1 }} aria-label="Compare hour" />
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', minWidth: 30 }}>
            {String(compareHour).padStart(2, '0')}:00
          </span>
        </div>
      )}

      {/* Add panel */}
      {showAddPanel && (
        <div style={styles.addPanel}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search cities or time zones..." style={styles.searchInput} aria-label="Search time zones" autoFocus />
          {searchResults.length > 0 && (
            <div style={styles.searchResults}>
              {searchResults.map(tz => (
                <div key={tz.id} style={styles.searchResultItem} onClick={() => toggleFavorite(tz.id)}>
                  <span style={{ fontSize: 12 }}>{tz.city} ({tz.label})</span>
                  <span style={{ fontSize: 10, color: favorites.includes(tz.id) ? '#10b981' : 'var(--color-text-muted)' }}>
                    {favorites.includes(tz.id) ? 'Added' : 'Add'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clock cards */}
      <div style={styles.clockGrid}>
        {/* Local time card */}
        <ClockCard key="local" tz={{ id: 'local', label: 'Local Time', utcOffset: localOffset, city: 'You', region: 'Local' }}
          isLocal compareMode={compareMode} compareHour={compareHour}
          onRemove={() => {}} onMove={() => {}} canMoveUp={false} canMoveDown={false} />

        {favoriteZones.map((tz, idx) => (
          <ClockCard key={tz.id} tz={tz}
            compareMode={compareMode} compareHour={compareHour}
            onRemove={() => toggleFavorite(tz.id)}
            onMove={(dir) => moveFavorite(tz.id, dir)}
            canMoveUp={idx > 0} canMoveDown={idx < favoriteZones.length - 1} />
        ))}
      </div>
    </div>
  );
});

WorldClock.displayName = 'WorldClock';

// ============================================================================
// CLOCK CARD
// ============================================================================

interface ClockCardProps {
  tz: TimeZoneInfo;
  isLocal?: boolean;
  compareMode: boolean;
  compareHour: number;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const ClockCard: React.FC<ClockCardProps> = memo(({
  tz, isLocal, compareMode, compareHour, onRemove, onMove, canMoveUp, canMoveDown
}) => {
  const time = getTimeInZone(tz.utcOffset);
  const period = getTimePeriod(time);

  // In compare mode, show what hour it is when it's compareHour locally
  let displayTime = formatTime(time);
  let displayDate = formatDate(time);
  if (compareMode && !isLocal) {
    const localOffset = -new Date().getTimezoneOffset() / 60;
    const diff = tz.utcOffset - localOffset;
    const adjustedHour = ((compareHour + diff) % 24 + 24) % 24;
    displayTime = `${String(Math.floor(adjustedHour)).padStart(2, '0')}:00`;
    displayDate = 'compared';
  }

  return (
    <div style={{ ...styles.clockCard, borderLeft: `3px solid ${PERIOD_COLORS[period]}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tz.city}</span>
          {isLocal && <span style={styles.localBadge}>You</span>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', marginTop: 2 }}>{displayTime}</div>
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{displayDate} -- {utcOffsetStr(tz.utcOffset)}</div>
      </div>
      {!isLocal && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {canMoveUp && <button onClick={() => onMove(-1)} style={styles.moveBtn}>^</button>}
          {canMoveDown && <button onClick={() => onMove(1)} style={styles.moveBtn}>v</button>}
          <button onClick={onRemove} style={{ ...styles.moveBtn, color: '#ef4444' }}>x</button>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  comparePanel: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' },
  addPanel: { display: 'flex', flexDirection: 'column', gap: 6 },
  searchInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none', fontFamily: 'inherit' },
  searchResults: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflow: 'auto' },
  searchResultItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.02)' },
  clockGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  clockCard: { display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border, rgba(255,255,255,0.04))' },
  localBadge: { fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(16,185,129,0.12)', color: '#10b981' },
  moveBtn: { width: 20, height: 18, borderRadius: 3, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.02)', color: 'inherit', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

export default WorldClock;
