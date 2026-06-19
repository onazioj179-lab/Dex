// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Verifies Weather advisory evaluation (DEX v6 Track G).

import { describe, it, expect } from 'vitest';
import { evaluateWeatherAlerts, WeatherConditions } from '../../src/shared/weather/alerts';

const base: WeatherConditions = {
  tempC: 20, feelsLikeC: 20, windKph: 5, uvIndex: 2, visibilityKm: 10, condition: 'clear',
};

describe('evaluateWeatherAlerts', () => {
  it('returns nothing for mild conditions', () => {
    expect(evaluateWeatherAlerts(base)).toEqual([]);
  });

  it('warns on extreme heat and advises on merely hot', () => {
    expect(evaluateWeatherAlerts({ ...base, feelsLikeC: 41 })[0])
      .toEqual({ severity: 'warning', label: 'Extreme heat' });
    expect(evaluateWeatherAlerts({ ...base, feelsLikeC: 33 })[0])
      .toEqual({ severity: 'advisory', label: 'Hot' });
  });

  it('flags freezing and extreme cold', () => {
    expect(evaluateWeatherAlerts({ ...base, tempC: -2, feelsLikeC: -2 }))
      .toContainEqual({ severity: 'advisory', label: 'Freezing' });
    expect(evaluateWeatherAlerts({ ...base, tempC: -5, feelsLikeC: -12 }))
      .toContainEqual({ severity: 'warning', label: 'Extreme cold' });
  });

  it('flags wind, UV, storms and low visibility', () => {
    expect(evaluateWeatherAlerts({ ...base, windKph: 55 }))
      .toContainEqual({ severity: 'warning', label: 'High wind' });
    expect(evaluateWeatherAlerts({ ...base, uvIndex: 9 }))
      .toContainEqual({ severity: 'warning', label: 'Very high UV' });
    expect(evaluateWeatherAlerts({ ...base, condition: 'thunderstorm' }))
      .toContainEqual({ severity: 'warning', label: 'Thunderstorm' });
    expect(evaluateWeatherAlerts({ ...base, visibilityKm: 0.5 }))
      .toContainEqual({ severity: 'advisory', label: 'Low visibility' });
  });

  it('orders warnings before advisories', () => {
    // Hot (advisory) + very high UV (warning) -> warning must come first.
    const out = evaluateWeatherAlerts({ ...base, feelsLikeC: 33, uvIndex: 9 });
    expect(out[0].severity).toBe('warning');
    expect(out.some(a => a.severity === 'advisory')).toBe(true);
  });
});
