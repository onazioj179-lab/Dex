// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toCsv } from '../../../shared/format/csv';
import DexIcon from '../../components/DexIcon';
import { downloadText } from '../../improvements500/downloadBlob';
import { Button, IconButton } from '../../ui/Button';
import {
  CALIBRATION_LIMIT, calibrate, estimateCalibration, fittedResponse, measurement,
  readStandardsCsv, type Curve, type Standard,
} from './bioCalibration';
import './bioengineering.css';

interface Row { id: string; concentration: string; response: string }
interface Sheet { rows: Row[]; unit: string; unknown: string }
const STORAGE = 'dex-bio-calibration-v1';
const pill = { borderRadius: 999 };
const number = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 });
const makeRow = (concentration = '', response = ''): Row => ({ id: crypto.randomUUID(), concentration, response });

function readSheet(): Sheet {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Sheet | null;
    if (saved && Array.isArray(saved.rows) && saved.rows.length <= CALIBRATION_LIMIT &&
      saved.rows.every(row => row && typeof row.id === 'string' && typeof row.concentration === 'string' && typeof row.response === 'string') &&
      new Set(saved.rows.map(row => row.id)).size === saved.rows.length && typeof saved.unit === 'string' && typeof saved.unknown === 'string') {
      return saved;
    }
  } catch { /* Start a new worksheet when storage is unavailable. */ }
  return { rows: [makeRow(), makeRow()], unit: '', unknown: '' };
}

function CalibrationPlot({ points, curve, unit }: { points: Standard[]; curve: Curve; unit: string }) {
  const minFit = fittedResponse(curve, curve.min);
  const maxFit = fittedResponse(curve, curve.max);
  const minimum = Math.min(minFit, maxFit, ...points.map(point => point.response));
  const maximum = Math.max(minFit, maxFit, ...points.map(point => point.response));
  const padding = minimum === maximum ? Math.max(Math.abs(minimum) * .05, .01) : 0;
  const low = Number.isFinite(minimum - padding) ? minimum - padding : minimum;
  const high = Number.isFinite(maximum + padding) ? maximum + padding : maximum;
  const range = high - low;
  const x = (value: number) => 72 + (value - curve.min) / (curve.max - curve.min) * 444;
  const y = (value: number) => 220 - (value - low) / range * 208;
  const steps = [0, .25, .5, .75, 1];
  return (
    <svg role="img" aria-label={'Scatter plot of ' + points.length + ' standards and their fitted linear curve'}
      viewBox="0 0 548 270" className="dex-bio__plot">
      {steps.map(step => {
        const value = low + step * range;
        return <g key={step}>
          <path d={'M72 ' + y(value) + 'H516'} stroke="var(--color-border)" strokeDasharray="3 4" />
          <text x={64} y={y(value) + 4} textAnchor="end">{number.format(value)}</text>
        </g>;
      })}
      <path d="M72 12V220H516" fill="none" stroke="var(--color-text-tertiary)" />
      {steps.map(step => {
        const value = curve.min + step * (curve.max - curve.min);
        return <text key={step} x={x(value)} y={239} textAnchor="middle">{number.format(value)}</text>;
      })}
      <text x={294} y={262} textAnchor="middle">{unit.trim() ? 'Concentration (' + unit.trim() + ')' : 'Concentration'}</text>
      <text transform="translate(12 116) rotate(-90)" textAnchor="middle">Response</text>
      <path d={'M' + x(curve.min) + ' ' + y(minFit) + 'L' + x(curve.max) + ' ' + y(maxFit)}
        stroke="var(--color-accent)" strokeWidth={2} fill="none" />
      {points.map((point, index) => <circle key={index} cx={x(point.concentration)} cy={y(point.response)} r={3.2}
        fill="var(--color-accent)" stroke="var(--color-bg-elevated)" strokeWidth={1} />)}
    </svg>
  );
}

export default function Bioengineering() {
  const [sheet, setSheet] = useState(readSheet);
  const latestSheet = useRef(sheet);
  latestSheet.current = sheet;
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(sheet));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [sheet]);

  const { points, incomplete } = useMemo(() => {
    const points: Standard[] = [];
    let incomplete = 0;
    for (const row of sheet.rows) {
      if (!row.concentration.trim() && !row.response.trim()) continue;
      const concentration = measurement(row.concentration);
      const response = measurement(row.response);
      if (concentration === null || concentration < 0 || response === null) incomplete++;
      else points.push({ concentration, response });
    }
    return { points, incomplete };
  }, [sheet.rows]);

  const curve = useMemo(() => calibrate(points), [points]);
  const unknown = measurement(sheet.unknown);
  const estimate = curve && unknown !== null ? estimateCalibration(curve, unknown) : null;

  const importFile = async (file: File) => {
    setError('');
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV file up to 1 MiB.');
      const incoming = readStandardsCsv(await file.text());
      if (!mounted.current) return;
      const previous = latestSheet.current.rows.filter(row => row.concentration.trim() || row.response.trim());
      if (previous.length + incoming.length > CALIBRATION_LIMIT) throw new Error('The worksheet can hold up to ' + CALIBRATION_LIMIT + ' standards.');
      const added = incoming.map(point => makeRow(String(point.concentration), String(point.response)));
      setSheet(current => {
        const rows = current.rows.filter(row => row.concentration.trim() || row.response.trim());
        if (rows.length + added.length > CALIBRATION_LIMIT) return current;
        return { ...current, rows: [...rows, ...added] };
      });
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not read the worksheet.');
    }
  };

  const updateRow = (id: string, field: 'concentration' | 'response', text: string) => setSheet(current => ({
    ...current,
    rows: current.rows.map(row => row.id === id ? { ...row, [field]: text } : row),
  }));

  return (
    <div className="dex-bio">
      <header>
        <h1><DexIcon name="activity" size={22} /> Bioengineering</h1>
        <div className="dex-bio__actions">
          <Button size="sm" style={pill} onClick={() => picker.current?.click()}>Import standards</Button>
          <input hidden type="file" accept=".csv,text/csv" ref={picker} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importFile(file);
          }} />
          <Button size="sm" style={pill} disabled={!points.length || !!incomplete} onClick={() => downloadText('calibration-standards.csv',
            toCsv([['concentration', 'response'], ...points.map(point => [point.concentration, point.response])]), 'text/csv;charset=utf-8')}>
            Export standards
          </Button>
        </div>
      </header>

      {storageError && <p role="alert">This worksheet could not be saved locally. Export the standards to keep a copy.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="dex-bio__workspace">
        <section aria-labelledby="bio-standards">
          <div className="dex-bio__panel-heading"><h2 id="bio-standards">Calibration standards</h2>
            <label>Unit<input value={sheet.unit} maxLength={20} onChange={event => {
              const unit = event.target.value;
              setSheet(current => ({ ...current, unit }));
            }} placeholder="Optional" /></label>
          </div>
          <div className="dex-bio__rows">
            <table><thead><tr><th scope="col">Concentration</th><th scope="col">Response</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{sheet.rows.map((row, index) => (
                <tr key={row.id}>
                  <td><input aria-label={'Concentration ' + (index + 1)} value={row.concentration} inputMode="decimal"
                    maxLength={40} onChange={event => updateRow(row.id, 'concentration', event.target.value)} /></td>
                  <td><input aria-label={'Response ' + (index + 1)} value={row.response} inputMode="decimal"
                    maxLength={40} onChange={event => updateRow(row.id, 'response', event.target.value)} /></td>
                  <td><IconButton size="xs" ariaLabel={'Remove standard ' + (index + 1)} icon={<DexIcon name="close" size={13} />}
                    onClick={() => setSheet(current => ({ ...current, rows: current.rows.filter(item => item.id !== row.id) }))} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Button size="sm" style={pill} variant="ghost" disabled={sheet.rows.length >= CALIBRATION_LIMIT}
            onClick={() => setSheet(current => current.rows.length >= CALIBRATION_LIMIT
              ? current : { ...current, rows: [...current.rows, makeRow()] })}>Add standard</Button>
          {incomplete > 0 && <p role="status">{incomplete} incomplete or invalid {incomplete === 1 ? 'row is' : 'rows are'} excluded.</p>}
        </section>

        <section aria-labelledby="bio-fit">
          <h2 id="bio-fit">Linear fit</h2>
          {curve ? (
            <>
              <CalibrationPlot points={points} curve={curve} unit={sheet.unit} />
              <dl className="dex-bio__stats">
                <div><dt>Slope</dt><dd>{number.format(curve.slope)}</dd></div>
                <div><dt>Intercept</dt><dd>{number.format(curve.intercept)}</dd></div>
                <div><dt>R²</dt><dd>{curve.r2 === null ? '—' : number.format(curve.r2)}</dd></div>
              </dl>
              <div className="dex-bio__estimate">
                <label>Unknown response<input value={sheet.unknown} inputMode="decimal" maxLength={40}
                  onChange={event => { const unknown = event.target.value; setSheet(current => ({ ...current, unknown })); }} /></label>
                {sheet.unknown.trim() && <output aria-live="polite">{curve.slope === 0 ? 'A flat fit cannot estimate concentration.'
                  : unknown === null ? 'Enter a numeric response.'
                  : estimate === null ? 'Outside the measured concentration range.'
                  : 'Estimated concentration ' + number.format(estimate) + (sheet.unit.trim() ? ' ' + sheet.unit.trim() : '')}</output>}
              </div>
            </>
          ) : <p>Enter at least two standards with different concentrations.</p>}
        </section>
      </div>
    </div>
  );
}
