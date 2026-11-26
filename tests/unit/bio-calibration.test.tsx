// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Bioengineering from '../../src/renderer/DEXAPPLICATIONS/standalone/Bioengineering';
import { calibrate, estimateCalibration, readStandardsCsv } from '../../src/renderer/DEXAPPLICATIONS/standalone/bioCalibration';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Bioengineering calibration', () => {
  it('fits replicate observations and accepts only estimates within the measured range', () => {
    const points = readStandardsCsv('response,concentration\n4,1\n4,1\n8,3\n12,5');
    const fit = calibrate(points)!;
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(2);
    expect(fit.r2).toBeCloseTo(1);
    expect(estimateCalibration(fit, 6)).toBeCloseTo(2);
    expect(estimateCalibration(fit, 12)).toBe(5);
    expect(estimateCalibration(fit, 14)).toBeNull();
    const flat = calibrate([{ concentration: 0, response: 2 }, { concentration: 1, response: 2 }])!;
    expect(flat.r2).toBeNull();
    expect(estimateCalibration(flat, 2)).toBeNull();
    expect(() => readStandardsCsv('concentration,response\n2,no reading')).toThrow('row 2');
  });

  it('keeps local worksheet edits and presents the calibrated plot and estimate', () => {
    const first = render(<Bioengineering />);
    fireEvent.change(screen.getByLabelText('Concentration 1'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Response 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Concentration 2'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Response 2'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Unknown response'), { target: { value: '5' } });
    expect(screen.getByRole('img', { name: /Scatter plot of 2 standards/ })).toBeInTheDocument();
    expect(screen.getByText('Estimated concentration 2')).toBeInTheDocument();
    first.unmount();
    render(<Bioengineering />);
    expect(screen.getByLabelText('Concentration 2')).toHaveValue('5');
    expect(screen.getByText('Estimated concentration 2')).toBeInTheDocument();
  });
});
