// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Ledger from '../../src/renderer/DEXAPPLICATIONS/standalone/Ledger';
import {
  decimalLedgerAmount, ledgerCsv, parseLedgerAmount, readLedgerCsv, type LedgerRow,
} from '../../src/renderer/DEXAPPLICATIONS/standalone/ledgerModel';
import { answerLocalSystemQuestion } from '../../src/renderer/uki/systemAnswers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row: LedgerRow = {
  id: 42, revision: 1, date: '2024-02-29', kind: 'expense',
  currency: 'USD', amountMinor: 10, category: 'Supplies', description: 'Notebook',
};

describe('Ledger', () => {
  it('uses integer minor units and round-trips spreadsheet-safe CSV descriptions', () => {
    expect(parseLedgerAmount('0.10', 'USD') + parseLedgerAmount('0.20', 'USD')).toBe(30);
    expect(parseLedgerAmount('10', 'JPY')).toBe(10);
    expect(() => parseLedgerAmount('10.1', 'JPY')).toThrow('whole amount');
    expect(decimalLedgerAmount(9223372036854775807n, 'USD')).toBe('92233720368547758.07');
    const entry = { ...row, description: '=2+2', category: 'Books, art' };
    const csv = ledgerCsv([entry]);
    expect(csv).toContain("'=2+2");
    expect(readLedgerCsv(csv)).toEqual([{ date: row.date, kind: 'expense', currency: 'USD',
      amountMinor: 10, category: 'Books, art', description: '=2+2' }]);
  });

  it('saves a transaction through its modal and submits an edit with the native row revision', async () => {
    let entries: LedgerRow[] = [];
    const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
      if (channel === 'ledger:list') return { success: true, entries, count: entries.length,
        offset: 0, pageSize: 100, expenseMinor: entries[0]?.amountMinor.toString() ?? '0', incomeMinor: '0', categories: [] };
      if (channel === 'ledger:save') {
        entries = [{ ...row, ...args[0] as object, revision: args[1] ? 2 : 1 }];
        return { success: true };
      }
      return null;
    });
    vi.stubGlobal('electron', { invoke });
    render(<Ledger />);
    await screen.findByText('No USD transactions yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    const editor = within(await screen.findByRole('dialog', { name: 'Add transaction' }));
    fireEvent.change(editor.getByLabelText('Amount'), { target: { value: '0.10' } });
    fireEvent.change(editor.getByLabelText('Description'), { target: { value: 'Notebook' } });
    fireEvent.click(editor.getByRole('button', { name: 'Save transaction' }));
    await screen.findByText('Notebook');
    expect(invoke).toHaveBeenCalledWith('ledger:save', expect.objectContaining({ amountMinor: 10 }), null, null);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Notebook' }));
    const edit = within(await screen.findByRole('dialog', { name: 'Edit transaction' }));
    fireEvent.change(edit.getByLabelText('Amount'), { target: { value: '0.20' } });
    fireEvent.click(edit.getByRole('button', { name: 'Save transaction' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('ledger:save', expect.objectContaining({ amountMinor: 20 }), 42, 1));
  });
});

describe('UKI live system answers', () => {
  it('reads explicit metric questions through native IPC and leaves advice queries untouched', async () => {
    const invoke = vi.fn(async () => ({ success: true, cpu: { usage: 23.4 }, memory: { used: 1024, total: 4096 } }));
    vi.stubGlobal('electron', { invoke });
    expect(await answerLocalSystemQuestion('Show CPU usage')).toBe('CPU usage is 23%.');
    expect(await answerLocalSystemQuestion('How can I reduce my CPU usage?')).toBeNull();
    expect(invoke).toHaveBeenCalledExactlyOnceWith('system:getStatus');
  });
});
