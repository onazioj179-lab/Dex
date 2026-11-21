// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Calendar from '../../src/renderer/DEXAPPLICATIONS/standalone/Calendar';
import { MeetingPlanner, workingOverlaps } from '../../src/renderer/DEXAPPLICATIONS/standalone/MeetingPlanner';
import QRCodeGenerator from '../../src/renderer/DEXAPPLICATIONS/standalone/QRCodeGenerator';
import Stopwatch from '../../src/renderer/DEXAPPLICATIONS/standalone/Stopwatch';
import UnitConverter from '../../src/renderer/DEXAPPLICATIONS/standalone/UnitConverter';
import { takeCalendarDraft } from '../../src/renderer/services/calendarDraft';
import { saveBlobAs } from '../../src/renderer/services/nativeSave';
import { useTimerStore } from '../../src/renderer/store/timerStore';
import { createQrBatch, createQrMatrix, qrBatchToSVG } from '../../src/renderer/DEXAPPLICATIONS/standalone/qrEncoding';
import { calendarQrPayload, mailtoPayload } from '../../src/shared/format/qrPayloads';

vi.mock('../../src/renderer/services/nativeSave', () => ({ saveBlobAs: vi.fn().mockResolvedValue(null) }));
const stopwatch = useTimerStore.getState().stopwatch;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  takeCalendarDraft();
  useTimerStore.setState({ stopwatch });
  vi.clearAllMocks();
});

describe('utility backlog', () => {
  it('converts cooking measurements into every unit at the configured precision and persists a pinned pair', () => {
    const view = render(<UnitConverter />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cooking' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Precision digits' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'All units' }));
    const results = screen.getByRole('region', { name: 'All converted units' });
    expect(within(results).getByText('236.59 mL')).toBeVisible();
    expect(within(results).getByText('16 tbsp')).toBeVisible();
    expect(within(results).getByText('48 tsp')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pin pair' }));
    view.unmount();
    render(<UnitConverter />);
    fireEvent.click(screen.getByRole('button', { name: 'US Cups → Milliliters' }));
    expect(screen.getByRole('button', { name: 'Unpin pair' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Precision digits' })).toHaveValue('2');
  });

  it('computes overlap at the selected date including daylight saving and weekends', () => {
    const day = (date: string) => [new Date(date + 'T00:00:00Z'), new Date(date + 'T23:59:00Z')] as const;
    const zones = ['Europe/London', 'America/New_York'];
    expect(workingOverlaps(zones, ...day('2026-07-06'))).toEqual([
      { start: Date.parse('2026-07-06T13:00:00Z'), end: Date.parse('2026-07-06T16:00:00Z') },
    ]);
    expect(workingOverlaps(zones, ...day('2026-11-23'))).toEqual([
      { start: Date.parse('2026-11-23T14:00:00Z'), end: Date.parse('2026-11-23T17:00:00Z') },
    ]);
    expect(workingOverlaps(zones, ...day('2026-11-21'))).toEqual([]);
  });

  it('opens a Calendar draft at the selected time without saving it', async () => {
    render(<><MeetingPlanner cities={[{ id: 'lon', label: 'London', timezone: 'Europe/London' }]} is24h /><Calendar /></>);
    fireEvent.change(screen.getByLabelText('Meeting date'), { target: { value: '2026-11-23' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Meeting time' }), { target: { value: '600' } });
    expect(screen.getByRole('list', { name: 'Time in each city' })).toHaveTextContent('London');
    fireEvent.click(screen.getByRole('button', { name: 'Open in Calendar' }));
    const draft = await screen.findByRole('dialog', { name: 'New Event' });
    expect(within(draft).getByPlaceholderText('Event title')).toHaveValue('Meeting');
    expect(within(draft).getByLabelText('Event date')).toHaveValue('2026-11-23');
    expect(within(draft).getByLabelText('Start time')).toHaveValue('10:00');
    expect(within(draft).getByLabelText('End time')).toHaveValue('10:30');
  });

  it('saves chronological lap numbers and millisecond values as CSV', async () => {
    useTimerStore.setState({ stopwatch: { startedAt: null, accumulatedMs: 5000, running: false, laps: [5000, 2400] } });
    render(<Stopwatch />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save laps as CSV' })); });
    const [name, blob] = vi.mocked(saveBlobAs).mock.calls[0];
    expect(name).toBe('dex-stopwatch-laps.csv');
    const data = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(data).toBe('Lap,Split (ms),Elapsed (ms)\r\n1,2400,2400\r\n2,2600,5000\r\n');
  });

  it('generates one QR per nonempty line and refuses a partial sheet', async () => {
    render(<QRCodeGenerator />);
    fireEvent.click(screen.getByRole('button', { name: 'Batch mode' }));
    const input = screen.getByRole('textbox', { name: 'Batch data, one code per line' });
    fireEvent.change(input, { target: { value: 'one\n\ntwo' } });
    expect(screen.getByRole('img', { name: 'QR code for line 1' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'QR code for line 3' })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save QR sheet' })); });
    expect(saveBlobAs).toHaveBeenCalledWith('dex-qr-batch.svg', expect.any(Blob), expect.any(Object));
    expect(createQrBatch('one\n' + 'x'.repeat(4000), 'M').items[1].matrix).toBeNull();
    const matrices = [createQrMatrix('one', 'M'), createQrMatrix('two', 'M')];
    expect(qrBatchToSVG(matrices, { pixelSize: 240 })).toContain('<svg x="264" y="12"');
  });

  it('encodes complete email and calendar payloads with escaping and UTC times', () => {
    const email = mailtoPayload('user@example.test', 'A & B', 'One\nTwo');
    expect(email).toBe('mailto:user@example.test?subject=A%20%26%20B&body=One%0D%0ATwo');
    const start = new Date('2026-11-23T18:00:00Z');
    const end = new Date('2026-11-23T18:30:00Z');
    const calendar = calendarQrPayload('Review, build; plan', start, end, 'fixture', start);
    expect(calendar).toContain('DTSTART:20261123T180000Z\r\nDTEND:20261123T183000Z');
    expect(calendar).toContain('SUMMARY:Review\\, build\\; plan');
    expect(calendarQrPayload('Invalid', end, start, 'fixture', start)).toBe('');
    expect(createQrMatrix(email, 'M').length).toBeGreaterThan(21);
    expect(createQrMatrix(calendar, 'M').length).toBeGreaterThan(37);
  });
});
