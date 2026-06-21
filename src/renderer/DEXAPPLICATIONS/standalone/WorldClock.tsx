/**
 * DEX Platform - World Clock
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Multiple timezone display with analog/digital toggle
 */
import React, { useState, useEffect, useCallback, memo } from 'react';

interface ClockZone {
  id: string;
  label: string;
  timezone: string;
  offset: number; // hours from UTC
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
];

const WorldClock: React.FC = () => {
  const [now, setNow] = useState(new Date());
  const [activeZones, setActiveZones] = useState<ClockZone[]>(() => {
    try {
      const saved = localStorage.getItem('dex-worldclock-zones');
      if (saved) {
        const ids: string[] = JSON.parse(saved);
        const zones = ids.map(id => PRESET_ZONES.find(z => z.id === id)).filter(Boolean) as ClockZone[];
        if (zones.length > 0) return zones;
      }
    } catch { /* ignore */ }
    return [PRESET_ZONES[0], PRESET_ZONES[1], PRESET_ZONES[6], PRESET_ZONES[7]];
  });
  const [showAnalog, setShowAnalog] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [is24h, setIs24h] = useState(true);

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

  useEffect(() => {
    localStorage.setItem('dex-worldclock-zones', JSON.stringify(activeZones.map(z => z.id)));
  }, [activeZones]);

  const addZone = useCallback((zone: ClockZone) => {
    if (!activeZones.find(z => z.id === zone.id)) {
      setActiveZones(prev => [...prev, zone]);
    }
    setShowAdd(false);
  }, [activeZones]);

  const removeZone = useCallback((id: string) => {
    setActiveZones(prev => prev.filter(z => z.id !== id));
  }, []);

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

  const AnalogClock: React.FC<{ time: Date; size: number }> = ({ time, size }) => {
    const cx = size / 2, cy = size / 2;
    const hr = time.getHours() % 12 + time.getMinutes() / 60;
    const mn = time.getMinutes() + time.getSeconds() / 60;
    const sc = time.getSeconds();
    // Angles: 0 deg = 12 o'clock, rotate clockwise
    const hAngle = (hr / 12) * 360;
    const mAngle = (mn / 60) * 360;
    const sAngle = (sc / 60) * 360;
    const rad = (deg: number) => (deg * Math.PI) / 180;

    // Hand rendered as vertical line from center going up, rotated by transform
    const Hand: React.FC<{ angle: number; len: number; w: number; color: string; smooth?: boolean }> = 
      ({ angle, len, w, color, smooth = true }) => (
        <line
          x1={cx} y1={cy} x2={cx} y2={cy - len}
          stroke={color} strokeWidth={w} strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${angle}deg)`,
            transition: smooth ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        />
      );

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={cx - 2} fill="none" stroke="var(--color-border)" strokeWidth="1.5" />
        {[...Array(12)].map((_, i) => {
          const a = rad((i / 12) * 360 - 90);
          const r1 = cx - 6, r2 = cx - 12;
          return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke="var(--color-text-tertiary)" strokeWidth="1.5" />;
        })}
        <Hand angle={hAngle} len={cx * 0.5} w={3} color="var(--color-text-primary)" />
        <Hand angle={mAngle} len={cx * 0.7} w={2} color="var(--color-text-primary)" />
        <Hand angle={sAngle} len={cx * 0.75} w={1} color="var(--color-error)" smooth={false} />
        <circle cx={cx} cy={cy} r={3} fill="var(--color-error, #FF453A)" />
      </svg>
    );
  };

  const isDayTime = (d: Date) => d.getHours() >= 6 && d.getHours() < 18;

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.title}>World Clock</span>
        <div style={s.toolbarRight}>
          <button style={{ ...s.toggleBtn, fontWeight: is24h ? 700 : 400 }} onClick={() => setIs24h(!is24h)} aria-label="Toggle 12/24 hour">
            {is24h ? '24h' : '12h'}
          </button>
          <button
            style={{ ...s.toggleBtn, background: showAnalog ? 'var(--color-accent-light, rgba(10,132,255,0.2))' : 'transparent', color: showAnalog ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
            onClick={() => setShowAnalog(!showAnalog)}
            aria-label="Toggle analog clocks"
          >CLK</button>
          <button style={s.addBtn} onClick={() => setShowAdd(!showAdd)} aria-label="Add timezone">+</button>
        </div>
      </div>

      {/* Add Zone Panel */}
      {showAdd && (
        <div style={s.addPanel}>
          <div style={s.addGrid}>
            {PRESET_ZONES.filter(z => !activeZones.find(a => a.id === z.id)).map(zone => (
              <button key={zone.id} style={s.zoneOption} onClick={() => addZone(zone)} aria-label={`Add ${zone.label}`}>
                <span style={s.zoneOptLabel}>{zone.label}</span>
                <span style={s.zoneOptOffset}>UTC{zone.offset >= 0 ? '+' : ''}{zone.offset}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clock Grid */}
      {activeZones.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyTitle}>No timezones added</div>
          <div style={s.emptyHint}>Use the + button to add a city.</div>
        </div>
      ) : (
      <div style={s.clockGrid}>
        {activeZones.map(zone => {
          const zoneTime = getTimeInZone(zone);
          const isDay = isDayTime(zoneTime);
          return (
            <div key={zone.id} style={{ ...s.clockCard, background: isDay ? 'var(--color-border-subtle)' : 'rgba(0,0,0,0.2)' }}>
              <button style={s.removeBtn} onClick={() => removeZone(zone.id)} aria-label={`Remove ${zone.label}`}>×</button>
              <div style={s.clockLabel}>{zone.label}</div>
              <div style={s.clockOffset}>{formatOffset(zone)}</div>
              {(() => {
                // Hour difference vs the user's local time (DST-correct: both are
                // wall-clock Dates, so the ms delta is the true offset).
                const dh = Math.round((zoneTime.getTime() - now.getTime()) / 3600000);
                return <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{dh === 0 ? 'Same as here' : `${dh > 0 ? '+' : ''}${dh}h vs here`}</div>;
              })()}
              {showAnalog && <AnalogClock time={zoneTime} size={100} />}
              <div style={s.clockTime}>{formatTime(zoneTime)}</div>
              <div style={s.clockDate}>{formatDate(zoneTime)}</div>
              <div style={{ fontSize: 16, marginTop: 4 }}>{isDay ? 'DAY' : 'NIGHT'}</div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border, var(--color-border-subtle))',
    flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' },
  toolbarRight: { display: 'flex', gap: 6 },
  toggleBtn: {
    padding: '5px 10px', borderRadius: 4, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)',
    fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  addBtn: {
    width: 28, height: 28, borderRadius: 4, border: 'none',
    background: 'var(--color-accent)', color: 'var(--color-text-inverse, #fff)', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  addPanel: {
    padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border, var(--color-border-subtle))',
  },
  addGrid: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 6,
  },
  zoneOption: {
    padding: '6px var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border, var(--color-border))',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-family)',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2,
  },
  zoneOptLabel: { fontWeight: 600, fontSize: 12 },
  zoneOptOffset: { fontSize: 10, color: 'var(--color-text-secondary)' },
  clockGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 'var(--space-3)', padding: 'var(--space-5)', flex: 1,
  },
  clockCard: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: 'var(--space-5) var(--space-4)', borderRadius: 10,
    border: '1px solid var(--color-border, var(--color-bg-hover))',
    position: 'relative' as const, gap: 4,
  },
  removeBtn: {
    position: 'absolute' as const, top: 6, right: 8,
    background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
    fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1,
  },
  clockLabel: { fontSize: 14, fontWeight: 600 },
  clockOffset: { fontSize: 11, color: 'var(--color-text-secondary)' },
  clockTime: {
    fontSize: 24, fontWeight: 300, fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em', marginTop: 4,
  },
  clockDate: { fontSize: 11, color: 'var(--color-text-secondary)' },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-5)', textAlign: 'center' as const,
  },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' },
  emptyHint: { fontSize: 12, color: 'var(--color-text-tertiary)' },
};

export default memo(WorldClock);
