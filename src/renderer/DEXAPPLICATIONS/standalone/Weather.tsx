/**
 * DEX Platform - Weather
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Weather conditions with 7-day forecast, hourly strip, saved locations,
 * unit toggles, sunrise/sunset, and 15-min auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { AppErrorState, AppLoadingState } from '../../ui/AppStates';
import { evaluateWeatherAlerts } from '../../../shared/weather/alerts';

interface WeatherDay {
  day: string;
  high: number;
  low: number;
  icon: string;
  condition: string;
  humidity: number;
  wind: number;
  precipitation: number;
  sunrise: string | null;
  sunset: string | null;
}

interface HourlyData {
  hour: string;
  temp: number;
  icon: string;
}

interface CurrentData {
  temp: number;
  feelsLike: number;
  condition: string;
  humidity: number;
  wind: number;
  uvIndex: number;
  visibility: number;
  pressure: number;
  sunrise: string | null;
  sunset: string | null;
}

interface WeatherData {
  current: CurrentData;
  forecast: WeatherDay[];
  hourly: HourlyData[];
  fetchedAt: number;
}

const WEATHER_ICONS: Record<string, string> = {
  sunny: 'sun', clear: 'sun', cloudy: 'cloud', partlyCloudy: 'cloud',
  rain: 'cloud-rain', thunderstorm: 'cloud-lightning', snow: 'cloud-snow', fog: 'cloud-drizzle',
  windy: 'wind', haze: 'cloud',
};

// localStorage keys
const LS_LOCATIONS = 'dex-weather-locations';
const LS_ACTIVE = 'dex-weather-active';
const LS_UNIT = 'dex-weather-unit';
const LS_WIND = 'dex-weather-wind-unit';
const LS_CACHE_PREFIX = 'dex-weather-cache:';

const DEFAULT_LOCATIONS = ['New York', 'London', 'Tokyo', 'Sydney'];
const REFRESH_MS = 15 * 60 * 1000; // 15 minutes

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

// ---------- persisted state helpers ----------
const loadLocations = (): string[] => {
  try {
    const raw = localStorage.getItem(LS_LOCATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length && parsed.every(x => typeof x === 'string')) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_LOCATIONS;
};

const loadActive = (locations: string[]): string => {
  try {
    const a = localStorage.getItem(LS_ACTIVE);
    if (a && locations.includes(a)) return a;
  } catch { /* ignore */ }
  return locations[0] ?? 'New York';
};

const loadUnit = (): 'C' | 'F' => {
  try { return localStorage.getItem(LS_UNIT) === 'F' ? 'F' : 'C'; } catch { return 'C'; }
};

const loadWindUnit = (): 'kmh' | 'mph' => {
  try { return localStorage.getItem(LS_WIND) === 'mph' ? 'mph' : 'kmh'; } catch { return 'kmh'; }
};

const cacheKeyFor = (loc: string) => `${LS_CACHE_PREFIX}${loc.trim().toLowerCase()}`;

const readCache = (loc: string): WeatherData | null => {
  try {
    const raw = localStorage.getItem(cacheKeyFor(loc));
    if (raw) return JSON.parse(raw) as WeatherData;
  } catch { /* ignore */ }
  return null;
};

const writeCache = (loc: string, data: WeatherData) => {
  try { localStorage.setItem(cacheKeyFor(loc), JSON.stringify(data)); } catch { /* ignore */ }
};

// Geocoding via Open-Meteo (free, no API key)
const geocodeCity = async (city: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string } | null> => {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results?.[0]) {
      const r = data.results[0];
      return { lat: r.latitude, lon: r.longitude, name: r.country ? `${r.name}, ${r.country}` : r.name };
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') console.warn('[Weather] Geocode failed for city lookup:', err);
  }
  return null;
};

// City-search suggestions for "add location" (returns up to 5 hits)
const searchCities = async (q: string, signal?: AbortSignal): Promise<string[]> => {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.results)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of data.results) {
      const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      if (label && !seen.has(label)) { seen.add(label); out.push(label); }
    }
    return out;
  } catch {
    return [];
  }
};

// Fetch real weather from Open-Meteo (free, no API key)
const fetchWeather = async (lat: number, lon: number, signal?: AbortSignal): Promise<WeatherData | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,surface_pressure,uv_index,visibility` +
      `&hourly=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,relative_humidity_2m_max,wind_speed_10m_max,uv_index_max,sunrise,sunset` +
      `&timezone=auto&forecast_days=7`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.current || !data?.daily || !data?.hourly) return null;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const current: CurrentData = {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      condition: wmoToCondition(data.current.weather_code),
      humidity: data.current.relative_humidity_2m,
      wind: Math.round(data.current.wind_speed_10m),
      uvIndex: Math.round(data.current.uv_index ?? 0),
      visibility: Math.round((data.current.visibility ?? 10000) / 1000),
      pressure: Math.round(data.current.surface_pressure),
      sunrise: data.daily.sunrise?.[0] ?? null,
      sunset: data.daily.sunset?.[0] ?? null,
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
        sunrise: data.daily.sunrise?.[i] ?? null,
        sunset: data.daily.sunset?.[i] ?? null,
      };
    });

    const now = new Date();
    const startHour = now.getHours();
    const hourly: HourlyData[] = Array.from({ length: 12 }, (_, i) => {
      const idx = startHour + i;
      return {
        hour: i === 0 ? 'Now' : `${String((startHour + i) % 24).padStart(2, '0')}:00`,
        temp: Math.round(data.hourly.temperature_2m?.[idx] ?? current.temp),
        icon: wmoToCondition(data.hourly.weather_code?.[idx] ?? 0),
      };
    });

    return { current, forecast, hourly, fetchedAt: Date.now() };
  } catch {
    return null;
  }
};

// ---------- display formatting ----------
const formatClockFromISO = (iso: string | null): string => {
  if (!iso) return '—';
  // Open-Meteo returns local-time ISO like "2026-06-21T05:14"
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return '—';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
};

const formatUpdated = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
};

const Weather: React.FC = () => {
  const [locations, setLocations] = useState<string[]>(loadLocations);
  const [location, setLocation] = useState<string>(() => loadActive(loadLocations()));
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false); // showing cached data after a failed refresh
  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [unit, setUnit] = useState<'C' | 'F'>(loadUnit);
  const [windUnit, setWindUnit] = useState<'kmh' | 'mph'>(loadWindUnit);
  const [retryNonce, setRetryNonce] = useState(0);
  const [nowTick, setNowTick] = useState(0); // forces "last updated" label to recompute

  // Persist locations / active location / units
  useEffect(() => { try { localStorage.setItem(LS_LOCATIONS, JSON.stringify(locations)); } catch { /* ignore */ } }, [locations]);
  useEffect(() => { try { localStorage.setItem(LS_ACTIVE, location); } catch { /* ignore */ } }, [location]);
  useEffect(() => { try { localStorage.setItem(LS_UNIT, unit); } catch { /* ignore */ } }, [unit]);
  useEffect(() => { try { localStorage.setItem(LS_WIND, windUnit); } catch { /* ignore */ } }, [windUnit]);

  // Core loader — reused by location changes, manual retry, and auto-refresh.
  const loadWeather = useCallback(async (loc: string, signal: AbortSignal, opts: { silent?: boolean } = {}) => {
    const cached = readCache(loc);
    if (!opts.silent) {
      // Show cached data immediately while we refresh in the background.
      if (cached) { setWeather(cached); setLoading(false); }
      else { setLoading(true); }
      setError(null);
      setStale(false);
    }

    const geo = await geocodeCity(loc, signal);
    if (signal.aborted) return;
    if (!geo) {
      if (cached) { setWeather(cached); setStale(true); setLoading(false); }
      else { setError('City not found'); setLoading(false); }
      return;
    }
    const data = await fetchWeather(geo.lat, geo.lon, signal);
    if (signal.aborted) return;
    if (!data) {
      if (cached) { setWeather(cached); setStale(true); setLoading(false); }
      else { setError('Could not reach the weather service. Check your connection.'); setLoading(false); }
      return;
    }
    writeCache(loc, data);
    setWeather(data);
    setStale(false);
    setLoading(false);
  }, []);

  // Fetch when active location changes or on manual retry.
  useEffect(() => {
    const controller = new AbortController();
    setSelectedDay(null);
    loadWeather(location, controller.signal);
    return () => controller.abort();
  }, [location, retryNonce, loadWeather]);

  // Auto-refresh every ~15 min (silent background refresh of the active location).
  useEffect(() => {
    let activeController: AbortController | null = null;
    const id = window.setInterval(() => {
      activeController?.abort();
      activeController = new AbortController();
      loadWeather(location, activeController.signal, { silent: true });
    }, REFRESH_MS);
    return () => { window.clearInterval(id); activeController?.abort(); };
  }, [location, loadWeather]);

  // Keep the "last updated" relative label fresh (tick every 60s).
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Debounced city suggestions while adding a location.
  const suggestSeq = useRef(0);
  useEffect(() => {
    const q = newLocation.trim();
    if (!addingLocation || q.length < 2) { setSuggestions([]); return; }
    const seq = ++suggestSeq.current;
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      const hits = await searchCities(q, controller.signal);
      if (seq === suggestSeq.current) setSuggestions(hits);
    }, 300);
    return () => { window.clearTimeout(id); controller.abort(); };
  }, [newLocation, addingLocation]);

  // ---------- unit conversion ----------
  const toF = (c: number) => Math.round(c * 9 / 5 + 32);
  const displayTemp = (c: number) => unit === 'F' ? toF(c) : c;
  const displayWind = (kmh: number) => windUnit === 'mph' ? Math.round(kmh * 0.621371) : kmh;
  const windLabel = windUnit === 'mph' ? 'mph' : 'km/h';

  const addLocation = useCallback((value?: string) => {
    const loc = (value ?? newLocation).trim();
    if (loc) {
      setLocations(prev => prev.includes(loc) ? prev : [...prev, loc]);
      setLocation(loc);
    }
    setNewLocation('');
    setSuggestions([]);
    setAddingLocation(false);
  }, [newLocation]);

  const removeLocation = useCallback((loc: string) => {
    setLocations(prev => {
      const next = prev.filter(l => l !== loc);
      if (location === loc) setLocation(next[0] ?? 'New York');
      return next.length ? next : DEFAULT_LOCATIONS;
    });
    try { localStorage.removeItem(cacheKeyFor(loc)); } catch { /* ignore */ }
  }, [location]);

  const current = weather?.current;
  const forecast = weather?.forecast ?? [];
  const hourly = weather?.hourly ?? [];
  const detail = selectedDay !== null ? forecast[selectedDay] : null;

  const alerts = current
    ? evaluateWeatherAlerts({
        tempC: current.temp,
        feelsLikeC: current.feelsLike,
        windKph: current.wind,
        uvIndex: current.uvIndex,
        visibilityKm: current.visibility,
        condition: current.condition,
      })
    : [];

  void nowTick; // referenced so the 60s tick re-renders the "updated" label

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
          <button style={s.iconBtn} onClick={() => { setAddingLocation(a => !a); setNewLocation(''); setSuggestions([]); }} aria-label="Add location" title="Add location"><DexIcon name="plus" size={16} /></button>
          {locations.length > 1 && (
            <button style={{ ...s.iconBtn, color: 'var(--color-error)' }} onClick={() => removeLocation(location)} aria-label="Remove location" title="Remove location"><DexIcon name="close" size={16} /></button>
          )}
          <button style={{ ...s.unitBtn, fontWeight: 700 }} onClick={() => setUnit(unit === 'C' ? 'F' : 'C')} aria-label="Toggle temperature unit" title={`Switch to ${unit === 'C' ? 'Fahrenheit' : 'Celsius'}`}>
            °{unit}
          </button>
          <button style={s.unitBtn} onClick={() => setWindUnit(windUnit === 'kmh' ? 'mph' : 'kmh')} aria-label="Toggle wind speed unit" title={`Switch to ${windUnit === 'kmh' ? 'mph' : 'km/h'}`}>
            {windLabel}
          </button>
        </div>

        {/* Quick-switch row */}
        {locations.length > 1 && (
          <div style={s.quickRow}>
            {locations.map(loc => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                style={{
                  ...s.quickChip,
                  background: loc === location ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                  color: loc === location ? 'var(--color-text-inverse, #fff)' : 'var(--color-text-secondary)',
                  fontWeight: loc === location ? 600 : 400,
                }}
                title={loc}
              >
                {loc.split(',')[0]}
              </button>
            ))}
          </div>
        )}

        {addingLocation && (
          <div style={s.addWrap}>
            <div style={s.addRow}>
              <input
                style={s.addInput}
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
                placeholder="Search a city..."
                onKeyDown={e => { if (e.key === 'Enter') addLocation(suggestions[0]); if (e.key === 'Escape') setAddingLocation(false); }}
                autoFocus
                aria-label="Search for a city"
              />
              <button style={s.addBtn} onClick={() => addLocation(suggestions[0])}>Add</button>
            </div>
            {suggestions.length > 0 && (
              <div style={s.suggestList}>
                {suggestions.map(sug => (
                  <button key={sug} style={s.suggestItem} onClick={() => addLocation(sug)}>
                    <DexIcon name="map-pin" size={13} />
                    <span>{sug}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading / Error states */}
      {loading && !weather && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
          <AppLoadingState rows={3} label="Loading weather" />
        </div>
      )}
      {error && !loading && !weather && (
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
      {current && (<>
      {stale && (
        <div style={s.staleBanner}>
          <DexIcon name="wifi-off" size={12} />
          <span>Showing saved data — could not refresh.</span>
          <button style={s.staleRetry} onClick={() => setRetryNonce(n => n + 1)}>Retry</button>
        </div>
      )}
      <div style={s.currentCard}>
        <div style={s.currentMain}>
          <span style={s.currentIcon}><DexIcon name={WEATHER_ICONS[current.condition] || 'cloud'} size={48} /></span>
          <span style={s.currentTemp}>{displayTemp(current.temp)}°</span>
        </div>
        <div style={s.currentCondition}>{current.condition.replace(/([A-Z])/g, ' $1').trim()}</div>
        <div style={s.currentSub}>Feels like {displayTemp(current.feelsLike)}°</div>
        <div style={s.detailGrid}>
          <div style={s.detailItem}><span style={s.detailLabel}>Humidity</span><span style={s.detailValue}>{current.humidity}%</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Wind</span><span style={s.detailValue}>{displayWind(current.wind)} {windLabel}</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>UV Index</span><span style={s.detailValue}>{current.uvIndex}</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Visibility</span><span style={s.detailValue}>{current.visibility} km</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Pressure</span><span style={s.detailValue}>{current.pressure} hPa</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Sunrise</span><span style={s.detailValue}>{formatClockFromISO(current.sunrise)}</span></div>
          <div style={s.detailItem}><span style={s.detailLabel}>Sunset</span><span style={s.detailValue}>{formatClockFromISO(current.sunset)}</span></div>
        </div>
        {weather && (
          <div style={s.updatedRow}>
            <DexIcon name="refresh" size={11} />
            <span>Updated {formatUpdated(weather.fetchedAt)}</span>
          </div>
        )}
      </div>

      {/* Advisories */}
      {alerts.length > 0 && (
        <div style={s.alertRow}>
          {alerts.map((a, i) => (
            <span
              key={i}
              style={{
                ...s.alertChip,
                color: a.severity === 'warning' ? 'var(--color-error)' : 'var(--color-warning)',
                background: a.severity === 'warning'
                  ? 'var(--color-error-muted, rgba(255,69,58,0.15))'
                  : 'var(--color-warning-muted, rgba(255,159,10,0.15))',
              }}
            >
              <DexIcon name="alert-triangle" size={12} />
              {a.label}
            </span>
          ))}
        </div>
      )}

      {/* Hourly Scroll */}
      <div style={s.section}>
        <div className="dex-label-caps" style={s.sectionTitle}>Next 12 Hours</div>
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
            <div style={s.detailItem}><span style={s.detailLabel}>Wind</span><span style={s.detailValue}>{displayWind(detail.wind)} {windLabel}</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Rain</span><span style={s.detailValue}>{detail.precipitation}%</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Sunrise</span><span style={s.detailValue}>{formatClockFromISO(detail.sunrise)}</span></div>
            <div style={s.detailItem}><span style={s.detailLabel}>Sunset</span><span style={s.detailValue}>{formatClockFromISO(detail.sunset)}</span></div>
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
    flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
    borderRadius: 6, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-family)', outline: 'none', cursor: 'pointer',
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 6, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  unitBtn: {
    padding: '6px 10px', borderRadius: 6, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-family)', whiteSpace: 'nowrap' as const,
  },
  quickRow: {
    display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)',
    overflowX: 'auto' as const, paddingBottom: 2,
  },
  quickChip: {
    padding: '4px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
    fontSize: 12, fontFamily: 'var(--font-family)', whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
  addWrap: {
    marginTop: 'var(--space-2)',
  },
  addRow: {
    display: 'flex', gap: 'var(--space-2)',
  },
  addInput: {
    flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
    borderRadius: 6, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'var(--font-family)',
  },
  addBtn: {
    padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none',
    background: 'var(--color-accent)', color: 'var(--color-text-inverse, #fff)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  suggestList: {
    display: 'flex', flexDirection: 'column' as const, gap: 1, marginTop: 'var(--space-2)',
    background: 'var(--color-bg-hover)', borderRadius: 8, padding: 4,
    border: '1px solid var(--color-border)',
  },
  suggestItem: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '7px var(--space-3)', borderRadius: 6, border: 'none', background: 'transparent',
    color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left' as const,
    fontFamily: 'var(--font-family)', width: '100%',
  },
  staleBanner: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    margin: '0 var(--space-5) var(--space-2)', padding: '6px 10px', borderRadius: 8,
    fontSize: 12, color: 'var(--color-warning)',
    background: 'var(--color-warning-muted, rgba(255,159,10,0.15))',
  },
  staleRetry: {
    marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-family)',
  },
  currentCard: {
    padding: 'var(--space-5)', margin: 'var(--space-2) var(--space-5) var(--space-3)', borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(10,132,255,0.15), rgba(94,92,230,0.1))',
    border: '1px solid var(--color-bg-hover)',
  },
  alertRow: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 'var(--space-2)',
    margin: '0 var(--space-5) var(--space-3)',
  },
  alertChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 600,
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
  updatedRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-secondary)',
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
