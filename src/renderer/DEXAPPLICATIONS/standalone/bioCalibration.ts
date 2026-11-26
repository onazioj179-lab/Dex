// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { parseCsv } from '../../../shared/format/csv';
import { linearRegression } from '../../improvements500/linearRegression';

export const CALIBRATION_LIMIT = 500;
export interface Standard { concentration: number; response: number }
export interface Curve {
  slope: number;
  intercept: number;
  r2: number | null;
  min: number;
  max: number;
  origin: number;
  responseAtOrigin: number;
}

export function measurement(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function calibrate(standards: readonly Standard[]): Curve | null {
  if (standards.length < 2) return null;
  const xs = standards.map(standard => standard.concentration);
  const ys = standards.map(standard => standard.response);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite) || min === max) return null;
  // Recenter before fitting so a large baseline does not erase small differences.
  const origin = xs[0];
  const baseline = ys[0];
  const regression = linearRegression(xs.map(x => x - origin), ys.map(y => y - baseline));
  const responseAtOrigin = baseline + regression.intercept;
  const intercept = responseAtOrigin - regression.slope * origin;
  const responseMin = responseAtOrigin + (min - origin) * regression.slope;
  const responseMax = responseAtOrigin + (max - origin) * regression.slope;
  if (![regression.slope, intercept, regression.r2, responseAtOrigin, responseMin, responseMax].every(Number.isFinite)) return null;
  return { ...regression, r2: ys.every(y => y === baseline) ? null : regression.r2,
    intercept, min, max, origin, responseAtOrigin };
}

export function fittedResponse(curve: Curve, concentration: number): number {
  return curve.responseAtOrigin + (concentration - curve.origin) * curve.slope;
}

export function estimateCalibration(curve: Curve, response: number): number | null {
  if (!Number.isFinite(response) || curve.slope === 0) return null;
  const estimate = curve.origin + (response - curve.responseAtOrigin) / curve.slope;
  // Allow rounding drift at a measured endpoint.
  const epsilon = (curve.max - curve.min) * 1e-10;
  return Number.isFinite(estimate) && estimate >= curve.min - epsilon && estimate <= curve.max + epsilon
    ? Math.max(curve.min, Math.min(curve.max, estimate)) : null;
}

export function readStandardsCsv(source: string): Standard[] {
  const [fields, ...rows] = parseCsv(source.replace(/^\ufeff/, ''));
  const names = fields?.map(field => field.trim().toLowerCase()) ?? [];
  const x = names.indexOf('concentration');
  const y = names.indexOf('response');
  if (names.length !== 2 || x < 0 || y < 0) throw new Error('Use the columns concentration and response.');
  const standards: Standard[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.every(cell => !cell.trim())) continue;
    const concentration = measurement(row[x] ?? '');
    const response = measurement(row[y] ?? '');
    if (row.length !== 2 || concentration === null || concentration < 0 || response === null) {
      throw new Error('Check the two numeric values on row ' + (index + 2) + '.');
    }
    standards.push({ concentration, response });
  }
  if (!standards.length || standards.length > CALIBRATION_LIMIT) {
    throw new Error('Import 1 to ' + CALIBRATION_LIMIT + ' standards at a time.');
  }
  return standards;
}
