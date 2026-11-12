/**
 * DEX Platform - Weather data (Open-Meteo, keyless).
 * Shared by the Weather app and the Home weather widget so both read the same
 * cache and the widget can refresh it itself instead of showing stale numbers.
 */

export interface WeatherDay {
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

export interface HourlyData {
  hour: string;
  temp: number;
  icon: string;
}

export interface CurrentData {
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

export interface WeatherData {
  current: CurrentData;
  forecast: WeatherDay[];
  hourly: HourlyData[];
  fetchedAt: number;
}

export const WEATHER_ICONS: Record<string, string> = {
  sunny: 'sun', clear: 'sun', cloudy: 'cloud', partlyCloudy: 'cloud',
  rain: 'cloud-rain', thunderstorm: 'cloud-lightning', snow: 'cloud-snow', fog: 'cloud-drizzle',
  windy: 'wind', haze: 'cloud',
};

// localStorage keys
export const LS_LOCATIONS = 'dex-weather-locations';
export const LS_ACTIVE = 'dex-weather-active';
export const LS_UNIT = 'dex-weather-unit';
export const LS_WIND = 'dex-weather-wind-unit';
export const LS_CACHE_PREFIX = 'dex-weather-cache:';

export const DEFAULT_LOCATIONS = ['New York', 'London', 'Tokyo', 'Sydney'];
export const REFRESH_MS = 15 * 60 * 1000; // 15 minutes

// WMO weather code → condition key
export const wmoToCondition = (code: number): string => {
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
export const loadLocations = (): string[] => {
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

export const loadActive = (locations: string[]): string => {
  try {
    const a = localStorage.getItem(LS_ACTIVE);
    if (a && locations.includes(a)) return a;
  } catch { /* ignore */ }
  return locations[0] ?? 'New York';
};

export const loadUnit = (): 'C' | 'F' => {
  try { return localStorage.getItem(LS_UNIT) === 'F' ? 'F' : 'C'; } catch { return 'C'; }
};

export const loadWindUnit = (): 'kmh' | 'mph' => {
  try { return localStorage.getItem(LS_WIND) === 'mph' ? 'mph' : 'kmh'; } catch { return 'kmh'; }
};

export const cacheKeyFor = (loc: string) => `${LS_CACHE_PREFIX}${loc.trim().toLowerCase()}`;

export const readCache = (loc: string): WeatherData | null => {
  try {
    const raw = localStorage.getItem(cacheKeyFor(loc));
    if (raw) return JSON.parse(raw) as WeatherData;
  } catch { /* ignore */ }
  return null;
};

export const writeCache = (loc: string, data: WeatherData) => {
  try { localStorage.setItem(cacheKeyFor(loc), JSON.stringify(data)); } catch { /* ignore */ }
};

// Geocoding via Open-Meteo (free, no API key)
export const geocodeCity = async (city: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string } | null> => {
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
export const searchCities = async (q: string, signal?: AbortSignal): Promise<string[]> => {
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
export const fetchWeather = async (lat: number, lon: number, signal?: AbortSignal): Promise<WeatherData | null> => {
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

/** Short age label, e.g. "just now", "12 min ago", "3 h ago". */
export const ageLabel = (fetchedAt: number, now = Date.now()): string => {
  const min = Math.max(0, Math.round((now - fetchedAt) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

/**
 * Weather for the location the Weather app has active: cached data when it is
 * younger than `maxAgeMs`, otherwise a fresh Open-Meteo fetch (written back to
 * the shared cache). Falls back to the stale cache when offline; null when
 * there is no active location and no data at all. Never invents values.
 */
export const loadActiveWeather = async (
  maxAgeMs = 30 * 60 * 1000,
  signal?: AbortSignal,
): Promise<{ location: string; data: WeatherData; stale: boolean } | null> => {
  let location: string | null = null;
  try { location = localStorage.getItem(LS_ACTIVE); } catch { /* storage blocked */ }
  if (!location) return null;
  const cached = readCache(location);
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return { location, data: cached, stale: false };
  const geo = await geocodeCity(location, signal);
  const fresh = geo ? await fetchWeather(geo.lat, geo.lon, signal) : null;
  if (fresh) {
    writeCache(location, fresh);
    return { location, data: fresh, stale: false };
  }
  return cached ? { location, data: cached, stale: true } : null;
};
