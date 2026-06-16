/**
 * DEX Platform - Weather
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Weather conditions with 5-day forecast and location management
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { AppErrorState, AppLoadingState } from '../../ui/AppStates';

interface WeatherDay {
  day: string;
  high: number;
  low: number;
  icon: string;
  condition: string;
  humidity: number;
  wind: number;
  precipitation: number;
}

interface HourlyData {
  hour: string;
  temp: number;
  icon: string;
}

const WEATHER_ICONS: Record<string, string> = {
  sunny: 'sun', clear: 'sun', cloudy: 'cloud', partlyCloudy: 'cloud',
  rain: 'cloud-rain', thunderstorm: 'cloud-lightning', snow: 'cloud-snow', fog: 'cloud-drizzle',
  windy: 'wind', haze: 'cloud',
};

// WMO weather code → condition key
const wmoToCondition = (code: number): string => {
  if (code === 0) return 'clear';
  if (code <= 3) return code <= 1 ? 'sunny' : 'partlyCloudy';
  if (code <= 48) return code <= 45 ? 'fog' : 'haze';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  if (code <= 99) return 'thunderstorm';
  return 'cloudy';
};

// Geocoding via Open-Meteo (free, no API key)
const geocodeCity = async (city: string): Promise<{ lat: number; lon: number; name: string } | null> => {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
    const data = await res.json();
    if (data.results?.[0]) {
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, name: r.name };
    }
  } catch (err) {
    console.warn('[Weather] Geocode failed for city lookup:', err);
  }
  return null;
};

// Fetch real weather from Open-Meteo (free, no API key)
const fetchWeather = async (lat: number, lon: number): Promise<{ current: any; forecast: WeatherDay[]; hourly: HourlyData[] } | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,uv_index,visibility&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,relative_humidity_2m_max,wind_speed_10m_max,uv_index_max&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    const data = await res.json();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const current = {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      condition: wmoToCondition(data.current.weather_code),
      humidity: data.current.relative_humidity_2m,
      wind: Math.round(data.current.wind_speed_10m),
      uvIndex: Math.round(data.current.uv_index ?? 0),
      visibility: Math.round((data.current.visibility ?? 10000) / 1000),
      pressure: Math.round(data.current.surface_pressure),
    };

    const forecast: WeatherDay[] = data.daily.time.map((t: string, i: number) => {
      const d = new Date(t);
      const cond = wmoToCondition(data.daily.weather_code?.[i] ?? 0);
      return {
        day: days[d.getDay()],
        high: Math.round(data.daily.temperature_2m_max?.[i] ?? 0),
        low: Math.round(data.daily.temperature_2m_min?.[i] ?? 0),
        icon: cond,
        condition: cond.replace(/([A-Z])/g, ' $1').trim(),
        humidity: data.daily.relative_humidity_2m_max?.[i] ?? 0,
        wind: Math.round(data.daily.wind_speed_10m_max?.[i] ?? 0),
        precipitation: data.daily.precipitation_probability_max?.[i] ?? 0,
      };
    });

    const now = new Date();
    const startHour = now.getHours();
    const hourly: HourlyData[] = Array.from({ length: 24 }, (_, i) => {
      const idx = startHour + i;
      return {
        hour: `${String((startHour + i) % 24).padStart(2, '0')}:00`,
        temp: Math.round(data.hourly.temperature_2m[idx] ?? current.temp),
        icon: wmoToCondition(data.hourly.weather_code?.[idx] ?? 0),
      };
    });

    return { current, forecast, hourly };
  } catch {
    return null;
  }
};

const Weather: React.FC = () => {
  const [location, setLocation] = useState('New York');
  const [locations, setLocations] = useState<string[]>(['New York', 'London', 'Tokyo', 'Sydney']);
  const [weather, setWeather] = useState<{ current: any; forecast: WeatherDay[]; hourly: HourlyData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [retryNonce, setRetryNonce] = useState(0);

  // Fetch real weather data when location changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedDay(null);

    (async () => {
      const geo = await geocodeCity(location);
      if (cancelled) return;
      if (!geo) { setError('City not found'); setLoading(false); return; }
      const data = await fetchWeather(geo.lat, geo.lon);
      if (cancelled) return;
      if (!data) { setError('Failed to fetch weather'); setLoading(false); return; }
      setWeather(data);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [location, retryNonce]);

  const toF = (c: number) => Math.round(c * 9 / 5 + 32);
  const displayTemp = (c: number) => unit === 'F' ? toF(c) : c;

  const addLocation = useCallback(() => {
    const loc = newLocation.trim();
    if (loc && !locations.includes(loc)) {
      setLocations(prev => [...prev, loc]);
      setLocation(loc);
    }
    setNewLocation('');
    setAddingLocation(false);
  }, [newLocation, locations]);

  const removeLocation = useCallback((loc: string) => {
    setLocations(prev => prev.filter(l => l !== loc));
    if (location === loc) setLocation(locations[0] === loc ? locations[1] || 'New York' : locations[0]);
  }, [location, locations]);

  const current = weather?.current;
  const forecast = weather?.forecast ?? [];
  const hourly = weather?.hourly ?? [];
  const detail = selectedDay !== null ? forecast[selectedDay] : null;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.locationRow}>
          <select
            value={location}
            onChange={e => setLocation(e.target.value)}
            style={s.locationSelect}
            aria-label="Select location"
          >
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <button style={s.iconBtn} onClick={() => setAddingLocation(!addingLocation)} aria-label="Add location" title="Add location">+</button>
          {locations.length > 1 && (
            <button style={{ ...s.iconBtn, color: 'var(--color-error)' }} onClick={() => removeLocation(location)} aria-label="Remove location" title="Remove location">×</button>
          )}
          <button style={{ ...s.unitBtn, fontWeight: unit === 'C' ? 700 : 400 }} onClick={() => setUnit(unit === 'C' ? 'F' : 'C')} aria-label="Toggle temperature unit">
            °{unit}
          </button>
        </div>
        {addingLocation && (
          <div style={s.addRow}>
            <input
              style={s.addInput}
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              placeholder="City name..."
              onKeyDown={e => e.key === 'Enter' && addLocation()}
              autoFocus
              aria-label="New city name"
            />
            <button style={s.addBtn} onClick={addLocation}>Add</button>
          </div>
        )}
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
          <AppLoadingState rows={3} label="Loading weather" />
        </div>
      )}
      {error && !loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
          <AppErrorState
            title="Weather unavailable"
            description={error}
            icon="cloud-off"
            onRetry={() => setRetryNonce(n => n + 1)}
          />
        </div>
      )}

      {/* Current Conditions */}
      {current && !loading && (<>
      <div style={s.currentCard}>
        <div style={s.currentMain}>
          <span style={s.currentIcon}><DexIcon name={WEATHER_ICONS[current.condition] || 'cloud'} size={48} /></span>
          <span style={s.currentTemp}>{displayTemp(current.temp)}°</span>
        </div>
        <div style={s.currentCondition}>{current.condition.replace(/([A-Z])/g, ' $1').trim()}</div>
        <div style={s.currentSub}>Feels like {displayTemp(current.feelsLike)}°</div>
        <div style={s.detailGrid}>
          <div style={s.detailItem}><span style={s.detailLabel}>Humidity</span><span style={s.detailValue}>{current.humidity}%</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Wind</span><span style={s.detailValue}>{current.wind} km/h</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>UV Index</span><span style={s.detailValue}>{current.uvIndex}</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Visibility</span><span style={s.detailValue}>{current.visibility} km</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Pressure</span><span style={s.detailValue}>{current.pressure} hPa</span></div>
        </div>
      </div>

      {/* Hourly Scroll */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionTitle}>Hourly</div>
        <div style={s.hourlyScroll}>
          {hourly.map((h, i) => (
            <div key={i} style={s.hourlyItem}>
              <span style={s.hourlyTime}>{h.hour}</span>
              <span style={{ fontSize: 18 }}><DexIcon name={WEATHER_ICONS[h.icon] || 'cloud'} size={18} /></span>
              <span style={s.hourlyTemp}>{displayTemp(h.temp)}°</span>
            </div>
          ))}
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionTitle}>7-Day Forecast</div>
        <div style={s.forecastList}>
          {forecast.map((day, i) => (
            <button
              key={i}
              style={{ ...s.forecastRow, background: selectedDay === i ? 'var(--color-accent-light, rgba(10, 132, 255, 0.15))' : 'transparent' }}
              onClick={() => setSelectedDay(selectedDay === i ? null : i)}
              aria-label={`${day.day}: ${day.condition}, high ${displayTemp(day.high)}°, low ${displayTemp(day.low)}°`}
            >
              <span style={s.forecastDay}>{i === 0 ? 'Today' : day.day}</span>
              <span style={{ fontSize: 18 }}><DexIcon name={WEATHER_ICONS[day.icon] || 'cloud'} size={18} /></span>
              {day.precipitation > 0 && <span style={s.precip}>{day.precipitation}%</span>}
              <span style={s.forecastTemps}>
                <span style={s.forecastHigh}>{displayTemp(day.high)}°</span>
                <span style={s.forecastLow}>{displayTemp(day.low)}°</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Day Detail Panel */}
      {detail && (
        <div style={s.dayDetail}>
          <div className="dex-label-caps" style={s.sectionTitle}>{forecast[selectedDay!].day} Details</div>
          <div style={s.detailGrid}>
            <div style={s.detailItem}><span style={s.detailLabel}>High</span><span style={s.detailValue}>{displayTemp(detail.high)}°</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Low</span><span style={s.detailValue}>{displayTemp(detail.low)}°</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Humidity</span><span style={s.detailValue}>{detail.humidity}%</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Wind</span><span style={s.detailValue}>{detail.wind} km/h</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Rain</span><span style={s.detailValue}>{detail.precipitation}%</span></div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  container: {
    height: '100%', display: 'flex', flexDirection: 'column',
    background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)', overflow: 'auto',
  },
  header: {
    padding: 'var(--space-4) var(--space-5) var(--space-2)', flexShrink: 0,
  },
  locationRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  },
  locationSelect: {
    flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 6, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-family)', outline: 'none', cursor: 'pointer',
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 6, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  unitBtn: {
    padding: '6px 10px', borderRadius: 6, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  addRow: {
    display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)',
  },
  addInput: {
    flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border, var(--color-border))',
    borderRadius: 6, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'var(--font-family)',
  },
  addBtn: {
    padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none',
    background: 'var(--color-accent)', color: 'var(--color-text-inverse, #fff)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  currentCard: {
    padding: 'var(--space-5)', margin: 'var(--space-2) var(--space-5) var(--space-3)', borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(10,132,255,0.15), rgba(94,92,230,0.1))',
    border: '1px solid var(--color-bg-hover)',
  },
  currentMain: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
  },
  currentIcon: { fontSize: 48 },
  currentTemp: { fontSize: 56, fontWeight: 200, letterSpacing: '-0.02em' },
  currentCondition: {
    textAlign: 'center' as const, fontSize: 16, fontWeight: 500, marginTop: 4,
    textTransform: 'capitalize' as const,
  },
  currentSub: {
    textAlign: 'center' as const, fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2,
  },
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: 'var(--space-2)', marginTop: 'var(--space-4)',
  },
  detailItem: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: 'var(--space-2)', borderRadius: 6, background: 'var(--color-border-subtle)',
  },
  detailLabel: { fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 2 },
  detailValue: { fontSize: 15, fontWeight: 600 },
  section: {
    padding: '0 var(--space-5) var(--space-3)',
  },
  sectionTitle: {
    marginBottom: 'var(--space-2)',
  },
  hourlyScroll: {
    display: 'flex', gap: 2, overflowX: 'auto' as const, paddingBottom: 4,
  },
  hourlyItem: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    padding: 'var(--space-2) 10px', borderRadius: 8, background: 'var(--color-border-subtle)',
    minWidth: 54, flexShrink: 0,
  },
  hourlyTime: { fontSize: 11, color: 'var(--color-text-secondary)' },
  hourlyTemp: { fontSize: 13, fontWeight: 600 },
  forecastList: {
    display: 'flex', flexDirection: 'column' as const, gap: 2,
  },
  forecastRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px var(--space-3)',
    borderRadius: 8, border: 'none', cursor: 'pointer', width: '100%',
    fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)',
    transition: 'background 0.15s',
  },
  forecastDay: { width: 50, fontSize: 13, fontWeight: 500 },
  precip: { fontSize: 11, color: 'var(--color-accent)', marginLeft: -4 },
  forecastTemps: { marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' },
  forecastHigh: { fontSize: 14, fontWeight: 600 },
  forecastLow: { fontSize: 14, color: 'var(--color-text-secondary)' },
  dayDetail: {
    padding: 'var(--space-3) var(--space-5) var(--space-5)',
  },
};

export default memo(Weather);
