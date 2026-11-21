// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Calculator from '../../src/renderer/DEXAPPLICATIONS/standalone/Calculator';
import Calendar from '../../src/renderer/DEXAPPLICATIONS/standalone/Calendar';
import PomodoroTimer from '../../src/renderer/DEXAPPLICATIONS/standalone/PomodoroTimer';
import QRCodeGenerator from '../../src/renderer/DEXAPPLICATIONS/standalone/QRCodeGenerator';
import Stopwatch from '../../src/renderer/DEXAPPLICATIONS/standalone/Stopwatch';
import UnitConverter from '../../src/renderer/DEXAPPLICATIONS/standalone/UnitConverter';
import { ClipboardHistory } from '../../src/renderer/components/ClipboardHistory';
import { getFlowTargets, registerFlowIntake, sendFlow, unregisterFlowIntake } from '../../src/renderer/services/FlowTransfer';
import { dueAlerts } from '../../src/renderer/services/calendarReminders';
import { useClipboardStore } from '../../src/renderer/store/clipboardStore';
import { summarizeFocus, useTimerStore } from '../../src/renderer/store/timerStore';
import { readExcludedDates } from '../../src/shared/calendar/recurrence';
import { calendarDayKey, evaluateCalendarMath, parseQuickCalendarEvent } from '../../src/shared/time/naturalCalendar';

const initialTimers = useTimerStore.getState();
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));
const typeInto = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const naturalInput = () => screen.getByRole('textbox', { name: 'Natural calculation input' });
const calculate = (text: string) => { typeInto(naturalInput(), text); click('Evaluate expression'); };
const display = (value: string) => expect(screen.getByLabelText('Display ' + value, { exact: true })).toBeVisible();
const today = new Date(2026, 10, 18, 10);

beforeEach(() => {
  localStorage.clear();
  useClipboardStore.setState({ entries: [] });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(today);
});
afterEach(() => {
  cleanup();
  useTimerStore.setState(initialTimers);
  useClipboardStore.setState({ entries: [] });
  unregisterFlowIntake('notes');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Calculator and Unit Converter', () => {
  it('keeps memory slots separate, changes display formatting and keeps pinned expressions reusable', () => {
    const view = render(<Calculator />);
    calculate('6172 / 5');
    display('1,234.4');
    click('Calculator tools');
    click('Store');
    const slot = screen.getByRole('combobox', { name: 'Memory slot' });
    typeInto(slot, '3');
    click('Recall');
    display('0');
    typeInto(slot, '0');
    click('Recall');
    display('1,234.4');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thousands separator' }));
    typeInto(screen.getByRole('combobox', { name: 'Calculator precision' }), '0');
    display('1234');
    click('Toggle history');
    click('Pin 6172 / 5');
    calculate('2 + 3');
    click('Clear unpinned calculations');
    view.unmount();

    render(<Calculator />);
    click('Toggle history');
    click('Reuse expression 6172 / 5');
    expect(naturalInput()).toHaveValue('6172 / 5');
    display('1234');
    expect(screen.queryByRole('button', { name: 'Reuse expression 2 + 3' })).toBeNull();
  });

  it('handles dates, percentage helpers, constants and a lossless precision override in the converter handoff', () => {
    render(<><Calculator /><UnitConverter /></>);
    calculate('today + 30d');
    display('2026-12-18');
    click('2');
    display('2');
    calculate('days until friday');
    display('2');
    click('Calculator tools');
    calculate('100');
    click('Tip');
    display('115');
    click('Tax');
    display('132.25');
    click('Markup');
    display('152.0875');
    for (const constant of ['pi', 'e', 'c', 'g']) expect(screen.getByRole('button', { name: 'Insert ' + constant, exact: true })).toBeEnabled();
    click('Insert g');
    click('Evaluate expression');
    display('9.80665');
    typeInto(screen.getByRole('combobox', { name: 'Calculator precision' }), '2');
    display('9.81');
    click('Open in Unit Converter');
    expect(screen.getByRole('textbox', { name: 'Value to convert' })).toHaveValue('9.80665');
  });

  it('converts fuel and density, persists custom units and sends results to both apps', async () => {
    const note = vi.fn().mockResolvedValue(true);
    registerFlowIntake('notes', note);
    const view = render(<><Calculator /><UnitConverter /></>);
    fireEvent.click(screen.getByRole('tab', { name: 'Fuel economy' }));
    const converter = screen.getByRole('region', { name: 'Unit Converter' });
    expect(within(converter).getByText('235.214583')).toBeVisible();
    typeInto(within(converter).getByRole('textbox', { name: 'Value to convert' }), '0');
    expect(within(converter).getByRole('button', { name: 'Copy result' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Density' }));
    typeInto(within(converter).getByRole('combobox', { name: 'Convert from unit' }), '1');
    typeInto(within(converter).getByRole('combobox', { name: 'Convert to unit' }), '0');
    expect(within(converter).getByText('1,000')).toBeVisible();
    click('Open in Calculator');
    expect(naturalInput()).toHaveValue('1000');
    await act(async () => { click('Send to Notes'); });
    expect(note).toHaveBeenCalledWith(expect.objectContaining({ content: '1 g/cm³ = 1,000 kg/m³' }));

    click('Custom units');
    typeInto(screen.getByLabelText('Custom unit name'), 'Test density');
    typeInto(screen.getByLabelText('Custom unit symbol'), 'td');
    typeInto(screen.getByLabelText('Custom unit factor in kg/m³'), '25');
    click('Add unit');
    expect(within(converter).getByText('25', { exact: true })).toBeVisible();
    click('Pin pair');
    view.unmount();

    render(<UnitConverter />);
    click('Test density → Kilograms per cubic meter');
    expect(screen.getByRole('button', { name: 'Unpin pair' })).toBeEnabled();
    click('Custom units');
    click('Remove Test density');
    expect(screen.queryByRole('option', { name: 'Test density (td)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test density → Kilograms per cubic meter' })).toBeNull();
  });
});

describe('Clipboard workflows', () => {
  function Editor() {
    const [value, setValue] = useState('prefix suffix');
    const [open, setOpen] = useState(false);
    return <>
      <textarea aria-label="Target editor" value={value} onChange={event => setValue(event.target.value)} />
      <button type="button" onClick={() => setOpen(true)}>Open clips</button>
      <ClipboardHistory isOpen={open} onClose={() => setOpen(false)} />
    </>;
  }

  it('pastes literal text into the previously focused controlled field, merges in selection order and applies transformations', () => {
    const clips = useClipboardStore.getState();
    clips.add('<b>One</b>');
    clips.add(' Second Item! ');
    render(<Editor />);
    const editor = screen.getByRole('textbox', { name: 'Target editor' }) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(7, 13);
    click('Open clips');
    fireEvent.mouseEnter(screen.getByText('<b>One</b>'));
    click('Paste plain text');
    expect(editor).toHaveValue('prefix <b>One</b>');

    click('Open clips');
    click('Merge clips');
    fireEvent.click(screen.getByRole('checkbox', { name: /Include <b>One/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Include Second Item/ }));
    click('Paste 2 clips');
    expect(editor.value).toContain('<b>One</b>\n Second Item!');

    editor.select();
    click('Open clips');
    click('Transform');
    typeInto(screen.getByRole('combobox', { name: 'Text transform' }), 'slug');
    click('Paste transformed text');
    expect(editor).toHaveValue('second-item');
  });

  it('persists named snippets and delivers text to Notes, Calculator and QR', async () => {
    useClipboardStore.getState().add('5 + 7');
    const view = render(<Editor />);
    click('Open clips');
    click('Snippets');
    typeInto(screen.getByRole('textbox', { name: 'Snippet name' }), 'Reusable formula');
    click('Save selected text');
    view.unmount();
    render(<><Editor /><Calculator /><QRCodeGenerator /></>);
    const editor = screen.getByRole('textbox', { name: 'Target editor' }) as HTMLTextAreaElement;
    editor.focus();
    editor.select();
    click('Open clips');
    click('Snippets');
    click('Reusable formula');
    expect(editor).toHaveValue('5 + 7');

    const note = vi.fn().mockResolvedValue(true);
    registerFlowIntake('notes', note);
    const payload = { kind: 'text' as const, content: '5 + 7' };
    expect(getFlowTargets(payload).map(target => target.id)).toEqual(expect.arrayContaining(['notes', 'calculator', 'qrcode']));
    await act(async () => {
      await sendFlow('notes', payload);
      await sendFlow('calculator', payload);
      await sendFlow('qrcode', payload);
    });
    expect(note).toHaveBeenCalledWith(payload);
    expect(naturalInput()).toHaveValue('5 + 7');
    expect(screen.getByRole('textbox', { name: 'Text to encode' })).toHaveValue('5 + 7');
    click('Evaluate expression');
    display('12');
  });
});

describe('Calendar and timer workflows', () => {
  it('validates local dates, relative weekdays and times', () => {
    expect(evaluateCalendarMath('today + 30d', today)).toBe('2026-12-18');
    expect(evaluateCalendarMath('days until 2026-11-21', today)).toBe('3');
    expect(evaluateCalendarMath('2026-02-30 + 1d', today)).toBeNull();
    const draft = parseQuickCalendarEvent('Lunch fri at 12 pm', today)!;
    expect(draft.title).toBe('Lunch');
    expect(calendarDayKey(draft.start)).toBe('2026-11-20');
    expect(draft.start.getHours()).toBe(12);
    expect(draft.end.getMinutes()).toBe(30);
    expect(parseQuickCalendarEvent('Lunch fri at 25:00', today)).toBeNull();
  });

  it('navigates the mini-month, searches notes and skips and restores a recurring occurrence', () => {
    const event = { id: 'series', title: 'Standup', date: '2026-11-11', time: '09:30', endTime: '10:00',
      color: '#eee', description: 'Review the service queue', recurring: 'weekly', alertMinutes: 15 };
    localStorage.setItem('dex-calendar-events', JSON.stringify([event]));
    render(<Calendar />);
    click('Next mini-calendar month');
    expect(screen.getByLabelText('Jump to date')).toHaveValue('2026-12-01');
    click('Mini-calendar today');
    expect(screen.getByLabelText('Jump to date')).toHaveValue('2026-11-18');
    const search = screen.getByRole('textbox', { name: 'Search events and notes' });
    typeInto(search, 'queue');
    const standup = () => screen.getByRole('button', { name: /Standup.*09:30/ });
    expect(standup()).toBeVisible();
    typeInto(search, 'unmatched');
    expect(screen.queryByRole('button', { name: /Standup.*09:30/ })).toBeNull();
    typeInto(search, 'queue');
    fireEvent.click(standup());
    click('Skip this occurrence');
    expect(screen.queryByRole('button', { name: /Standup.*09:30/ })).toBeNull();
    const updated = JSON.parse(localStorage.getItem('dex-calendar-events')!)[0];
    expect(updated.excludedDates).toEqual(['2026-11-18']);
    const alertTime = new Date(2026, 10, 18, 9, 15).getTime();
    expect(dueAlerts([updated], alertTime - 30_000, alertTime, new Set())).toEqual([]);
    expect(readExcludedDates('EXDATE:20261118T093000,\r\n 20261125T093000\r\nEXDATE;VALUE=DATE:20261202')).toEqual(['2026-11-18', '2026-11-25', '2026-12-02']);
    fireEvent.click(screen.getByText('Skipped occurrences'));
    click('Restore Standup · 2026-11-18');
    expect(standup()).toBeVisible();
    expect(dueAlerts([JSON.parse(localStorage.getItem('dex-calendar-events')!)[0]], alertTime - 30_000, alertTime, new Set())).toHaveLength(1);
  });

  it('opens a reviewable Calendar draft from quick add and creates it on save', () => {
    render(<Calendar />);
    typeInto(screen.getByRole('textbox', { name: 'Quick add event' }), 'Lunch Fri 12');
    click('Quick add');
    const draft = screen.getByRole('dialog', { name: 'New Event' });
    expect(within(draft).getByPlaceholderText('Event title')).toHaveValue('Lunch');
    expect(within(draft).getByLabelText('Event date')).toHaveValue('2026-11-20');
    expect(within(draft).getByLabelText('Start time')).toHaveValue('12:00');
    expect(within(draft).getByLabelText('End time')).toHaveValue('12:30');
    expect(JSON.parse(localStorage.getItem('dex-calendar-events')!)).toHaveLength(0);
    click('Save event');
    expect(JSON.parse(localStorage.getItem('dex-calendar-events')!)).toHaveLength(1);
  });

  it('retains daily focus at rollover, reports the streak and does not count skipped work', () => {
    useTimerStore.setState({ pomodoroLog: { date: '2026-11-17', sessions: 1, focusMin: 25, entries: [], pastFocusMin: { '2026-11-16': 30 } } });
    render(<PomodoroTimer />);
    const chart = screen.getByRole('region', { name: 'Weekly focus' });
    expect(within(chart).getByText('Last 7 days · 55 min')).toBeVisible();
    expect(within(chart).getByText('2 days streak')).toBeVisible();
    expect(within(chart).getAllByRole('listitem')).toHaveLength(7);
    act(() => {
      useTimerStore.getState().setPomodoroPhase('work');
      useTimerStore.getState().advancePomodoro({ silent: true, skip: true });
    });
    expect(useTimerStore.getState().pomodoroLog.focusMin).toBe(0);
    act(() => {
      useTimerStore.getState().setPomodoroPhase('work');
      useTimerStore.getState().advancePomodoro({ silent: true });
    });
    expect(summarizeFocus(useTimerStore.getState().pomodoroLog, today).streak).toBe(3);
  });

  it('sends a stopped session and chronological laps to Notes', async () => {
    const note = vi.fn().mockResolvedValue(true);
    registerFlowIntake('notes', note);
    useTimerStore.setState({ stopwatch: { startedAt: null, accumulatedMs: 5200, running: false, laps: [5000, 2400] } });
    render(<Stopwatch />);
    await act(async () => { click('Send session to Notes'); });
    expect(note).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Stopwatch session\nElapsed: 00:05.20\nLap 1 · 00:02.40 split · 00:02.40 elapsed\nLap 2 · 00:02.60 split · 00:05.00 elapsed',
    }));
  });
});
