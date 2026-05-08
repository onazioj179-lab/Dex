// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentMethodPicker } from '../../src/renderer/components/account/PaymentMethodPicker';

const BTC_ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ETH_ADDR = '0x742d35Cc6634C0532925a3b844Bc454e4438f44E';

describe('PaymentMethodPicker', () => {
  it('lists at least the email method when no config is provided', () => {
    render(
      <PaymentMethodPicker
        planId="pro"
        period="monthly"
        config={{}}
        onContinue={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText(/Choose how to pay/i)).toBeInTheDocument();
    expect(screen.getByTestId('method-email')).toBeInTheDocument();
    expect(screen.getByText(/Compose email/i)).toBeInTheDocument();
  });

  it('shows the BTC address and amount when configured with a rate', () => {
    render(
      <PaymentMethodPicker
        planId="personal"
        period="monthly"
        config={{ btcAddress: BTC_ADDR, ethAddress: ETH_ADDR, rates: { btc: 50000, eth: 2000 } }}
        onContinue={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId('address-bitcoin').textContent).toBe(BTC_ADDR);
    expect(screen.getByTestId('amount-bitcoin').textContent).toMatch(/BTC$/);
    expect(screen.getByTestId('address-ethereum').textContent).toBe(ETH_ADDR);
  });

  it('fires onContinue with the chosen method', () => {
    const onContinue = vi.fn();
    render(
      <PaymentMethodPicker
        planId="pro"
        period="monthly"
        config={{ baseUrl: 'https://buy.dex.app/c' }}
        onContinue={onContinue}
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('Open checkout'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    const [method, plan] = onContinue.mock.calls[0]!;
    expect(method.id).toBe('card');
    expect(plan.totalCents).toBeGreaterThan(0);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <PaymentMethodPicker
        planId="pro"
        period="monthly"
        config={{}}
        onContinue={() => undefined}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
