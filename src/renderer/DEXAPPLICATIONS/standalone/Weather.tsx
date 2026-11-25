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
import { registerUkiAppContext, unregisterUkiAppContext } from '../../uki/appContextRegistry';
import {
  type WeatherData,
  WEATHER_ICONS,
  LS_LOCATIONS,
  LS_ACTIVE,
  LS_UNIT,
  LS_WIND,
  DEFAULT_LOCATIONS,
  REFRESH_MS,
  loadLocations,
  loadActive,
  loadUnit,
  loadWindUnit,
  cacheKeyFor,
  readCache,
  writeCache,
  geocodeCity,
  searchCities,
  fetchWeather,
} from './weatherData';


// ---------- condition-driven hero gradient (Apple Weather feel) ----------
// Returns a backdrop gradient + whether it's a "night" scene, derived from the
// current condition and whether the local clock sits between sunset and sunrise.
const isNightNow = (sunrise: string | null, sunset: string | null, localTime?: string): boolean => {
  const toMin = (iso: string | null): number | null => {
    if (!iso) return null;
    const m = iso.match(/T(\d{2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  // The city's clock (from the forecast), not this computer's.
  const now = new Date();
  const cur = toMin(localTime ?? null) ?? now.getHours() * 60 + now.getMinutes();
  const sr = toMin(sunrise);
  const ss = toMin(sunset);
  if (sr === null || ss === null) return cur < 360 || cur >= 1200;
  return cur < sr || cur >= ss;
};

const heroGradientFor = (condition: string, night: boolean): string => {
  if (night) {
    if (condition === 'thunderstorm') return 'linear-gradient(160deg, #1a1730 0%, #0e1424 60%, #05070f 100%)';
    if (condition === 'rain' || condition === 'snow') return 'linear-gradient(160deg, #232a3a 0%, #141a28 55%, #080b14 100%)';
    return 'linear-gradient(160deg, #2a2350 0%, #16183a 55%, #070912 100%)';
  }
  switch (condition) {
    case 'sunny':
    case 'clear':
      return 'linear-gradient(160deg, #3a9bff 0%, #2d7ce6 45%, #5a8fd6 100%)';
    case 'partlyCloudy':
      return 'linear-gradient(160deg, #4a93e0 0%, #6c93bc 55%, #8aa4c0 100%)';
    case 'cloudy':
    case 'haze':
      return 'linear-gradient(160deg, #6d7d92 0%, #58697e 55%, #46566a 100%)';
    case 'fog':
      return 'linear-gradient(160deg, #8593a3 0%, #6c7989 55%, #586575 100%)';
    case 'rain':
      return 'linear-gradient(160deg, #4a5d75 0%, #36475c 55%, #283645 100%)';
    case 'thunderstorm':
      return 'linear-gradient(160deg, #3d4256 0%, #2a2d3e 55%, #1a1c28 100%)';
    case 'snow':
      return 'linear-gradient(160deg, #8fa6bf 0%, #7b91ab 55%, #6a7f98 100%)';
    case 'windy':
      return 'linear-gradient(160deg, #5b8aab 0%, #4a7592 55%, #3c6178 100%)';
    default:
      return 'linear-gradient(160deg, #4a93e0 0%, #3a7cc8 55%, #5a8fd6 100%)';
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

  // Condition-driven hero backdrop (Apple Weather feel).
  const night = current ? isNightNow(current.sunrise, current.sunset, current.localTime) : false;
  const heroGradient = current ? heroGradientFor(current.condition, night) : '';

  // Span of all daily highs/lows, used to render the proportional range bars.
  const tempSpan = forecast.length
    ? { min: Math.min(...forecast.map(d => d.low)), max: Math.max(...forecast.map(d => d.high)) }
    : { min: 0, max: 1 };
  const spanRange = Math.max(1, tempSpan.max - tempSpan.min);

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

  // UKI app-context: expose the active location + current temperature + condition
  // + units so the assistant knows what weather the user is looking at. A ref
  // keeps the resolver reading live state, so we register once at mount.
  const ukiCtxRef = useRef({ location, current, unit, windUnit });
  ukiCtxRef.current = { location, current, unit, windUnit };
  useEffect(() => {
    registerUkiAppContext('weather', () => {
      const s = ukiCtxRef.current;
      const cur = s.current;
      return {
        appId: 'weather',
        focusedItemId: s.location,
        custom: {
          location: s.location,
          temperature: cur ? `${s.unit === 'F' ? Math.round(cur.temp * 9 / 5 + 32) : cur.temp}°${s.unit}` : undefined,
          feelsLike: cur ? `${s.unit === 'F' ? Math.round(cur.feelsLike * 9 / 5 + 32) : cur.feelsLike}°${s.unit}` : undefined,
          condition: cur ? cur.condition.replace(/([A-Z])/g, ' $1').trim() : undefined,
          tempUnit: `°${s.unit}`,
          windUnit: s.windUnit === 'mph' ? 'mph' : 'km/h',
        },
      };
    });
    return () => unregisterUkiAppContext('weather');
  }, []);

  return (
    <div style={s.container}>
      <style>{`
        .dex-weather-forecast-row:hover { background: var(--color-bg-hover) !important; }
        .dex-weather-loc-btn { transition: background 0.15s ease, transform 0.1s ease; }
        .dex-weather-loc-btn:hover { background: var(--color-border) !important; }
        .dex-weather-loc-btn:active { transform: scale(0.94); }
      `}</style>
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
          <button className="dex-weather-loc-btn" style={s.iconBtn} onClick={() => { setAddingLocation(a => !a); setNewLocation(''); setSuggestions([]); }} aria-label="Add location" title="Add location"><DexIcon name="plus" size={16} /></button>
          {locations.length > 1 && (
            <button className="dex-weather-loc-btn" style={{ ...s.iconBtn, color: 'var(--color-error)' }} onClick={() => removeLocation(location)} aria-label="Remove location" title="Remove location"><DexIcon name="close" size={16} /></button>
          )}
          <button className="dex-weather-loc-btn" style={{ ...s.unitBtn, fontWeight: 700, background: unit === 'F' ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)', color: unit === 'F' ? 'var(--color-accent-text, #fff)' : 'var(--color-text-primary)' }} onClick={() => setUnit(unit === 'C' ? 'F' : 'C')} aria-label="Toggle temperature unit" title={`Switch to ${unit === 'C' ? 'Fahrenheit' : 'Celsius'}`}>
            °{unit}
          </button>
          <button className="dex-weather-loc-btn" style={s.unitBtn} onClick={() => setWindUnit(windUnit === 'kmh' ? 'mph' : 'kmh')} aria-label="Toggle wind speed unit" title={`Switch to ${windUnit === 'kmh' ? 'mph' : 'km/h'}`}>
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
                  background: loc === location ? 'var(--color-accent-fill)' : 'var(--color-bg-hover)',
                  color: loc === location ? 'var(--color-accent-text, #fff)' : 'var(--color-text-secondary)',
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
              <div className="dex-liquid-glass-strong" style={s.suggestList}>
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
      <div style={{ ...s.currentCard, background: heroGradient }}>
        <div style={s.heroContent}>
          <div style={s.currentMain}>
            <span style={s.currentIcon}><DexIcon name={WEATHER_ICONS[current.condition] || 'cloud'} size={52} /></span>
            <span style={s.currentTemp}>{displayTemp(current.temp)}<span style={s.tempDeg}>°</span></span>
          </div>
          <div style={s.currentCondition}>{current.condition.replace(/([A-Z])/g, ' $1').trim()}</div>
          <div style={s.currentSub}>Feels like {displayTemp(current.feelsLike)}°</div>
          {forecast[0] && (
            <div style={s.heroRange}>
              <span style={s.heroHigh}>H:{displayTemp(forecast[0].high)}°</span>
              <span style={s.heroDot} aria-hidden>·</span>
              <span style={s.heroLow}>L:{displayTemp(forecast[0].low)}°</span>
            </div>
          )}
        </div>
        <div style={s.detailGrid}>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Humidity</span><span style={s.heroDetailValue}>{current.humidity}%</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Wind</span><span style={s.heroDetailValue}>{displayWind(current.wind)} {windLabel}</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>UV Index</span><span style={s.heroDetailValue}>{current.uvIndex}</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Visibility</span><span style={s.heroDetailValue}>{current.visibility} km</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Pressure</span><span style={s.heroDetailValue}>{current.pressure} hPa</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Sunrise</span><span style={s.heroDetailValue}>{formatClockFromISO(current.sunrise)}</span></div>
          <div style={s.heroDetailItem}><span style={s.heroDetailLabel}>Sunset</span><span style={s.heroDetailValue}>{formatClockFromISO(current.sunset)}</span></div>
        </div>
        {weather && (
          <div style={s.heroUpdatedRow}>
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
            <div key={i} className="dex-weather-hourly-item" style={s.hourlyItem}>
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
          {forecast.map((day, i) => {
            const lowPct = ((day.low - tempSpan.min) / spanRange) * 100;
            const highPct = ((day.high - tempSpan.min) / spanRange) * 100;
            return (
            <button
              key={i}
              className="dex-weather-forecast-row"
              style={{ ...s.forecastRow, background: selectedDay === i ? 'var(--color-accent-light, rgba(10, 132, 255, 0.15))' : 'transparent' }}
              onClick={() => setSelectedDay(selectedDay === i ? null : i)}
              aria-label={`${day.day}: ${day.condition}, high ${displayTemp(day.high)}°, low ${displayTemp(day.low)}°`}
            >
              <span style={s.forecastDay}>{i === 0 ? 'Today' : day.day}</span>
              <span style={{ fontSize: 18, display: 'flex', width: 22, justifyContent: 'center' }}><DexIcon name={WEATHER_ICONS[day.icon] || 'cloud'} size={18} /></span>
              <span style={s.precipSlot}>{day.precipitation > 0 ? <span style={s.precip}><DexIcon name="cloud-rain" size={10} />{day.precipitation}%</span> : null}</span>
              <span style={s.forecastLow}>{displayTemp(day.low)}°</span>
              <span style={s.rangeTrack} aria-hidden>
                <span
                  style={{
                    ...s.rangeFill,
                    left: `${lowPct}%`,
                    width: `${Math.max(8, highPct - lowPct)}%`,
                  }}
                />
              </span>
              <span style={s.forecastHigh}>{displayTemp(day.high)}°</span>
            </button>
          );})}
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
    // Stays at the top while the forecast scrolls.
    position: 'sticky', top: 0, zIndex: 2, background: 'var(--color-bg-base)',
  },
  locationRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  },
  locationSelect: {
    flex: 1, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)',
    borderRadius: 10, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-family)', outline: 'none', cursor: 'pointer',
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 10, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  unitBtn: {
    padding: '6px 10px', borderRadius: 10, border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-family)', whiteSpace: 'nowrap' as const,
  },
  quickRow: {
    display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)',
    overflowX: 'auto' as const, paddingBottom: 2,
  },
  quickChip: {
    padding: '4px 12px', borderRadius: 9999, border: 'none', cursor: 'pointer',
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
    borderRadius: 10, padding: 'var(--space-2) var(--space-3)', color: 'var(--color-text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'var(--font-family)',
  },
  addBtn: {
    padding: 'var(--space-2) var(--space-4)', borderRadius: 10, border: 'none',
    background: 'var(--color-accent-fill)', color: 'var(--color-accent-text, #fff)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-family)',
  },
  suggestList: {
    display: 'flex', flexDirection: 'column' as const, gap: 1, marginTop: 'var(--space-2)',
    borderRadius: 'var(--radius-lg)', padding: 4,
  },
  suggestItem: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '7px var(--space-3)', borderRadius: 10, border: 'none', background: 'transparent',
    color: 'var(--color-text-primary)', cursor: 'pointer', fontSize: 13, textAlign: 'left' as const,
    fontFamily: 'var(--font-family)', width: '100%',
  },
  staleBanner: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    margin: '0 var(--space-5) var(--space-2)', padding: '6px 10px', borderRadius: 'var(--radius-lg)',
    fontSize: 12, color: 'var(--color-warning)',
    background: 'var(--color-warning-muted, rgba(255,159,10,0.15))',
  },
  staleRetry: {
    marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--color-accent)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-family)',
  },
  currentCard: {
    // flexShrink 0: in the scrolling column an overflow:hidden child shrinks
    // to fit, which squashed current conditions into a 40 px strip in a
    // window-sized Weather.
    position: 'relative' as const, overflow: 'hidden', flexShrink: 0,
    padding: 'var(--space-5)', margin: 'var(--space-2) var(--space-5) var(--space-3)', borderRadius: 18,
    background: 'linear-gradient(160deg, #4a93e0 0%, #3a7cc8 55%, #5a8fd6 100%)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
    color: '#fff',
    transition: 'background 0.6s ease',
  },
  heroContent: { position: 'relative' as const, zIndex: 1 },
  tempDeg: { fontWeight: 200, opacity: 0.85 },
  heroRange: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 6, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
  },
  heroHigh: { color: '#fff' },
  heroLow: { color: 'rgba(255,255,255,0.7)' },
  heroDot: { opacity: 0.6 },
  heroDetailItem: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    padding: 'var(--space-2)', borderRadius: 14,
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.08)',
  },
  heroDetailLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  heroDetailValue: { fontSize: 15, fontWeight: 600, color: '#fff' },
  heroUpdatedRow: {
    position: 'relative' as const, zIndex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    marginTop: 'var(--space-3)', fontSize: 11, color: 'rgba(255,255,255,0.72)',
  },
  alertRow: {
    display: 'flex', flexWrap: 'wrap' as const, gap: 'var(--space-2)',
    margin: '0 var(--space-5) var(--space-3)',
  },
  alertChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 'var(--radius-lg)', fontSize: 11, fontWeight: 600,
  },
  currentMain: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)',
  },
  currentIcon: { fontSize: 52, display: 'flex', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' },
  currentTemp: { fontSize: 72, fontWeight: 200, letterSpacing: '-0.03em', lineHeight: 1 },
  currentCondition: {
    textAlign: 'center' as const, fontSize: 16, fontWeight: 500, marginTop: 6,
    textTransform: 'capitalize' as const, color: 'rgba(255,255,255,0.95)',
  },
  currentSub: {
    textAlign: 'center' as const, fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 2,
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
    padding: 'var(--space-2)', borderRadius: 10, background: 'var(--color-border-subtle)',
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
    padding: 'var(--space-2) 10px', borderRadius: 'var(--radius-lg)', background: 'var(--color-border-subtle)',
    minWidth: 54, flexShrink: 0,
  },
  hourlyTime: { fontSize: 11, color: 'var(--color-text-secondary)' },
  hourlyTemp: { fontSize: 13, fontWeight: 600 },
  forecastList: {
    display: 'flex', flexDirection: 'column' as const, gap: 2,
  },
  forecastRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '10px var(--space-3)',
    borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', width: '100%',
    fontFamily: 'var(--font-family)', color: 'var(--color-text-primary)',
    transition: 'background 0.15s',
  },
  forecastDay: { width: 50, fontSize: 13, fontWeight: 500, flexShrink: 0, textAlign: 'left' as const },
  precipSlot: { width: 42, flexShrink: 0, display: 'flex' },
  precip: {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    fontSize: 11, color: '#5ac8fa', fontWeight: 600,
  },
  forecastHigh: { fontSize: 14, fontWeight: 600, width: 34, textAlign: 'right' as const, flexShrink: 0 },
  forecastLow: { fontSize: 14, color: 'var(--color-text-secondary)', width: 34, textAlign: 'right' as const, flexShrink: 0 },
  rangeTrack: {
    position: 'relative' as const, flex: 1, height: 5, minWidth: 40,
    borderRadius: 9999, background: 'var(--color-border-subtle)', overflow: 'hidden',
  },
  rangeFill: {
    position: 'absolute' as const, top: 0, bottom: 0,
    borderRadius: 9999,
    background: 'linear-gradient(90deg, #5ac8fa 0%, #ffd60a 55%, #ff9f0a 100%)',
  },
  dayDetail: {
    padding: 'var(--space-3) var(--space-5) var(--space-5)',
  },
};

export default memo(Weather);
