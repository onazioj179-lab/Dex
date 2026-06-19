// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Weather advisory evaluation (DEX v6 Track G). Given current conditions in
 * metric units (the Open-Meteo default the app fetches in), returns any built-in
 * advisories worth surfacing. Pure + unit-tested; the Weather app renders these
 * as a banner. Thresholds are deliberately conservative and in metric, so they
 * are independent of the C/F display toggle.
 */

export interface WeatherConditions {
  /** Air temperature, degrees Celsius. */
  tempC: number;
  /** Apparent ("feels like") temperature, degrees Celsius. */
  feelsLikeC: number;
  /** Wind speed, km/h. */
  windKph: number;
  /** UV index (0+). */
  uvIndex: number;
  /** Visibility, km. */
  visibilityKm: number;
  /** Condition key (e.g. 'thunderstorm', 'snow'). */
  condition: string;
}

export interface WeatherAlert {
  /** 'warning' is the more severe tier; 'advisory' is informational. */
  severity: 'advisory' | 'warning';
  label: string;
}

/**
 * Evaluate built-in advisories. Returns the most relevant ones, most severe
 * first. An empty array means nothing notable.
 */
export function evaluateWeatherAlerts(c: WeatherConditions): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  // Heat
  if (c.feelsLikeC >= 40) alerts.push({ severity: 'warning', label: 'Extreme heat' });
  else if (c.feelsLikeC >= 32) alerts.push({ severity: 'advisory', label: 'Hot' });

  // Cold
  if (c.feelsLikeC <= -10) alerts.push({ severity: 'warning', label: 'Extreme cold' });
  else if (c.tempC <= 0) alerts.push({ severity: 'advisory', label: 'Freezing' });

  // Wind
  if (c.windKph >= 50) alerts.push({ severity: 'warning', label: 'High wind' });
  else if (c.windKph >= 30) alerts.push({ severity: 'advisory', label: 'Windy' });

  // Storms
  if (c.condition === 'thunderstorm') alerts.push({ severity: 'warning', label: 'Thunderstorm' });

  // UV
  if (c.uvIndex >= 8) alerts.push({ severity: 'warning', label: 'Very high UV' });
  else if (c.uvIndex >= 6) alerts.push({ severity: 'advisory', label: 'High UV' });

  // Visibility
  if (c.visibilityKm < 1) alerts.push({ severity: 'advisory', label: 'Low visibility' });

  // Warnings first, then advisories; preserve evaluation order within a tier.
  return alerts.sort((a, b) =>
    (a.severity === 'warning' ? 0 : 1) - (b.severity === 'warning' ? 0 : 1),
  );
}
