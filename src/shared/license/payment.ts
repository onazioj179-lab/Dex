// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Payment methods.
 *
 * DEX supports multiple ways to pay so users are not forced through one
 * provider. This module is a pure, framework-free planner: given a plan
 * choice, it returns the available methods, the wallet address (or
 * checkout URL) for each, and a deterministic memo the publisher can
 * match against the payment on receipt.
 *
 * Pay methods supported:
 *  - card     : opens the configured hosted card-checkout URL.
 *  - bitcoin  : displays the publisher's BTC address + an exact amount
 *               in satoshis, plus a `bitcoin:` URI a wallet can scan.
 *  - ethereum : displays the publisher's ETH address + an exact amount
 *               in wei, plus an `ethereum:` URI.
 *  - email    : opens a structured mailto: so the user can request an
 *               invoice manually if every other method is unconfigured.
 *
 * No HTTP calls. No price oracle. The current BTC/ETH USD rates are
 * passed in by the caller (or come from `window.dexConfig.rates`); when
 * not supplied the crypto methods report `priceUnknown=true` so the UI
 * can show a clear "rate unavailable" hint instead of inventing a number.
 */

import type { PlanId, BillingPeriod } from './pricing';
import { PLANS } from './pricing';
import { buildCheckoutUrl, normalizeSeats, type CheckoutEndpointConfig, PUBLISHER_CONTACT_EMAIL } from './checkout';

export type PaymentMethodId = 'card' | 'bitcoin' | 'ethereum' | 'email';

export interface PaymentRatesUSD {
  /** USD per 1 BTC. e.g. 67000 means 1 BTC = $67,000. */
  btc?: number;
  /** USD per 1 ETH. e.g. 3500 means 1 ETH = $3,500. */
  eth?: number;
}

export interface PaymentEndpointConfig extends CheckoutEndpointConfig {
  /** Publisher BTC receive address. Empty disables Bitcoin payment. */
  btcAddress?: string | null;
  /** Publisher ETH receive address. Empty disables Ethereum payment. */
  ethAddress?: string | null;
  /** Optional spot-rate snapshot (USD per coin). */
  rates?: PaymentRatesUSD;
}

export interface PaymentRequest {
  planId: PlanId;
  period: BillingPeriod;
  seats?: number;
  email?: string;
  /** Lowercase ISO country code, used in the memo. */
  countryCode?: string;
}

export interface PaymentMethod {
  id: PaymentMethodId;
  /** Short user-facing label. */
  label: string;
  /** One-line user-facing helper. */
  helper: string;
  /** True when this method can actually be used in this build. */
  available: boolean;
  /** Reason if `available=false`. */
  unavailableReason?: string;
  /**
   * Action URL for `card` and `email`. For BTC/ETH this is a
   * `bitcoin:` / `ethereum:` URI a wallet app can open.
   */
  url?: string;
  /** Wallet address for crypto methods. Always lowercased / trimmed. */
  address?: string;
  /** Amount in the asset's smallest unit (sats for BTC, wei for ETH). */
  amountAtomic?: string;
  /** Human-readable amount, e.g. "0.00298400 BTC". */
  amountDisplay?: string;
  /** True when the asset USD rate was not supplied. */
  priceUnknown?: boolean;
  /** A 12-char deterministic memo so the publisher can identify the payment. */
  memo: string;
}

export interface PaymentPlan {
  /** USD subtotal in cents. */
  totalCents: number;
  /** Methods, in display order. Always non-empty (email always available). */
  methods: PaymentMethod[];
  /** Memo embedded in every method. */
  memo: string;
}

const SAT_PER_BTC = 100_000_000n;
const WEI_PER_ETH = 1_000_000_000_000_000_000n;

function planById(id: PlanId) {
  return PLANS.find(p => p.id === id) ?? null;
}

/** Compute the USD subtotal in cents for a (plan, period, seats) choice. */
export function computeSubtotalCents(req: PaymentRequest): number {
  const plan = planById(req.planId);
  if (!plan) return 0;
  const seats = normalizeSeats(req.planId, req.seats);
  const periodKey: BillingPeriod = req.period;
  const price = plan.prices[periodKey];
  if (!price) return 0;
  // Studio is per-seat; everything else is flat.
  const isPerSeat = req.planId === 'studio';
  return Math.max(0, price.cents) * (isPerSeat ? seats : 1);
}

/**
 * Build a deterministic 12-char memo from the request. Using a stable
 * non-cryptographic hash so it's short, copy-pasteable, and the same
 * inputs always yield the same memo (so a user can re-derive it).
 */
export function buildMemo(req: PaymentRequest): string {
  const seats = normalizeSeats(req.planId, req.seats);
  // Include the raw requested seats too so different seat counts always
  // produce different memos, even on plans where seats are normalized to 1.
  const rawSeats = typeof req.seats === 'number' && Number.isFinite(req.seats) ? Math.floor(req.seats) : -1;
  const parts = [
    'DEX',
    req.planId,
    req.period,
    String(seats),
    String(rawSeats),
    (req.email ?? '').trim().toLowerCase(),
    (req.countryCode ?? '').trim().toLowerCase(),
  ];
  const src = parts.join('|');
  // FNV-1a 32-bit, applied twice over the string for a 64-bit-ish digest.
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xcbf29ce4 >>> 0;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    h1 = Math.imul((h1 ^ c) >>> 0, 0x01000193) >>> 0;
    h2 = Math.imul((h2 ^ (c + 0x9e)) >>> 0, 0x01000193) >>> 0;
  }
  const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  // Take 12 chars, uppercase, with a separator for readability.
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`.toUpperCase();
}

function centsToUsd(cents: number): number {
  return cents / 100;
}

function formatBtc(amountSat: bigint): string {
  // 8 decimal places. Avoid floats above MAX_SAFE_INTEGER (~9e15 sats = 90M BTC).
  const whole = amountSat / SAT_PER_BTC;
  const frac = amountSat % SAT_PER_BTC;
  const fracStr = frac.toString().padStart(8, '0');
  return `${whole.toString()}.${fracStr} BTC`;
}

function formatEth(amountWei: bigint): string {
  // 6 visible decimals (cap; 18 raw available).
  const whole = amountWei / WEI_PER_ETH;
  const frac = amountWei % WEI_PER_ETH;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 6);
  return `${whole.toString()}.${fracStr} ETH`;
}

/** Convert a USD amount (cents) -> sats given a USD-per-BTC rate. */
export function usdCentsToSats(cents: number, usdPerBtc: number): bigint {
  if (usdPerBtc <= 0 || !Number.isFinite(usdPerBtc) || cents <= 0) return 0n;
  // sats = cents / 100 / usdPerBtc * 1e8 = cents * 1e6 / usdPerBtc
  // Use BigInt arithmetic to avoid float drift.
  // Scale rate to integer micro-dollars per BTC: rate * 1_000_000.
  const rateMicroUsd = BigInt(Math.round(usdPerBtc * 1_000_000));
  if (rateMicroUsd <= 0n) return 0n;
  const centsBI = BigInt(Math.max(0, Math.floor(cents)));
  // sats = (cents * 1e6 / rateMicroUsd) * 1e8 / 1e6
  //       = cents * 1e8 / rateMicroUsd  (since cents already represents USD/100)
  // But cents are 1/100 USD, so USD = cents/100. Sats = USD/usdPerBtc * 1e8.
  // = (cents/100) * 1e8 / usdPerBtc = cents * 1e6 / usdPerBtc
  // Using rateMicroUsd = usdPerBtc * 1e6: sats = cents * 1e6 / (rateMicroUsd / 1e6)
  //                                            = cents * 1e12 / rateMicroUsd
  const numerator = centsBI * 1_000_000_000_000n; // cents * 1e12
  return numerator / rateMicroUsd;
}

/** Convert a USD amount (cents) -> wei given a USD-per-ETH rate. */
export function usdCentsToWei(cents: number, usdPerEth: number): bigint {
  if (usdPerEth <= 0 || !Number.isFinite(usdPerEth) || cents <= 0) return 0n;
  const rateMicroUsd = BigInt(Math.round(usdPerEth * 1_000_000));
  if (rateMicroUsd <= 0n) return 0n;
  const centsBI = BigInt(Math.max(0, Math.floor(cents)));
  // wei = USD/usdPerEth * 1e18 = (cents/100) * 1e18 / usdPerEth
  //      = cents * 1e16 / usdPerEth
  // With rateMicroUsd = usdPerEth * 1e6: wei = cents * 1e22 / rateMicroUsd.
  const numerator = centsBI * 10_000_000_000_000_000_000_000n; // cents * 1e22
  return numerator / rateMicroUsd;
}

const BTC_ADDR_RE = /^(?:bc1[02-9ac-hj-np-z]{25,87}|tb1[02-9ac-hj-np-z]{25,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** Validate a BTC address shape (mainnet legacy/segwit + testnet bech32). */
export function isValidBtcAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return BTC_ADDR_RE.test(addr.trim());
}

/** Validate an ETH address shape (40 hex chars, 0x-prefixed). */
export function isValidEthAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return ETH_ADDR_RE.test(addr.trim());
}

function buildEmailMethod(req: PaymentRequest, totalCents: number, memo: string): PaymentMethod {
  const seats = normalizeSeats(req.planId, req.seats);
  const subject = `DEX purchase request: ${req.planId} (${req.period}) [${memo}]`;
  const body = [
    'Hi,',
    '',
    'I would like to purchase a DEX subscription.',
    `- Plan: ${req.planId}`,
    `- Billing: ${req.period}`,
    `- Seats: ${seats}`,
    `- Total: $${(totalCents / 100).toFixed(2)} USD`,
    req.email ? `- Email on file: ${req.email}` : '',
    `- Memo: ${memo}`,
    '',
    'Please send a payment link.',
    '',
    'Thanks.',
  ].filter(Boolean).join('\n');
  const url = `mailto:${PUBLISHER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return {
    id: 'email',
    label: 'Email the publisher',
    helper: 'Get a one-time payment link by email. Always available.',
    available: true,
    url,
    memo,
  };
}

function buildCardMethod(req: PaymentRequest, cfg: PaymentEndpointConfig, memo: string): PaymentMethod {
  const built = buildCheckoutUrl(
    {
      planId: req.planId,
      period: req.period,
      seats: req.seats,
      email: req.email,
    },
    cfg,
  );
  if (built.mode === 'hosted') {
    return {
      id: 'card',
      label: 'Card or hosted checkout',
      helper: 'Opens the secure checkout page in your browser.',
      available: true,
      url: built.url,
      memo,
    };
  }
  return {
    id: 'card',
    label: 'Card or hosted checkout',
    helper: 'Card checkout is not configured for this build.',
    available: false,
    unavailableReason: 'No hosted checkout endpoint is configured. Use crypto or email instead.',
    memo,
  };
}

function buildBtcMethod(cfg: PaymentEndpointConfig, totalCents: number, memo: string): PaymentMethod {
  const addrRaw = (cfg.btcAddress ?? '').trim();
  if (!isValidBtcAddress(addrRaw)) {
    return {
      id: 'bitcoin',
      label: 'Bitcoin (BTC)',
      helper: 'Bitcoin payment is not configured for this build.',
      available: false,
      unavailableReason: 'No publisher BTC address is configured.',
      memo,
    };
  }
  const rate = cfg.rates?.btc;
  if (!rate || rate <= 0) {
    return {
      id: 'bitcoin',
      label: 'Bitcoin (BTC)',
      helper: 'Send BTC to the address below; the rate is unavailable, so confirm the USD amount with the publisher.',
      available: true,
      address: addrRaw,
      url: `bitcoin:${addrRaw}?label=DEX&message=${encodeURIComponent(memo)}`,
      priceUnknown: true,
      memo,
    };
  }
  const sats = usdCentsToSats(totalCents, rate);
  const amountBtc = formatBtc(sats);
  const wholeAndFrac = amountBtc.replace(' BTC', '');
  return {
    id: 'bitcoin',
    label: 'Bitcoin (BTC)',
    helper: `Send the exact amount below. USD ${centsToUsd(totalCents).toFixed(2)} at $${rate.toLocaleString('en-US')}/BTC.`,
    available: true,
    address: addrRaw,
    amountAtomic: sats.toString(),
    amountDisplay: amountBtc,
    url: `bitcoin:${addrRaw}?amount=${wholeAndFrac}&label=DEX&message=${encodeURIComponent(memo)}`,
    memo,
  };
}

function buildEthMethod(cfg: PaymentEndpointConfig, totalCents: number, memo: string): PaymentMethod {
  const addrRaw = (cfg.ethAddress ?? '').trim();
  if (!isValidEthAddress(addrRaw)) {
    return {
      id: 'ethereum',
      label: 'Ethereum (ETH)',
      helper: 'Ethereum payment is not configured for this build.',
      available: false,
      unavailableReason: 'No publisher ETH address is configured.',
      memo,
    };
  }
  const rate = cfg.rates?.eth;
  if (!rate || rate <= 0) {
    return {
      id: 'ethereum',
      label: 'Ethereum (ETH)',
      helper: 'Send ETH to the address below; the rate is unavailable, so confirm the USD amount with the publisher.',
      available: true,
      address: addrRaw,
      url: `ethereum:${addrRaw}?label=DEX&message=${encodeURIComponent(memo)}`,
      priceUnknown: true,
      memo,
    };
  }
  const wei = usdCentsToWei(totalCents, rate);
  const amountEth = formatEth(wei);
  return {
    id: 'ethereum',
    label: 'Ethereum (ETH)',
    helper: `Send the exact amount below. USD ${centsToUsd(totalCents).toFixed(2)} at $${rate.toLocaleString('en-US')}/ETH.`,
    available: true,
    address: addrRaw,
    amountAtomic: wei.toString(),
    amountDisplay: amountEth,
    url: `ethereum:${addrRaw}?value=${wei.toString()}&label=DEX&message=${encodeURIComponent(memo)}`,
    memo,
  };
}

/** Build the full payment plan for a request. Always returns at least the email method. */
export function buildPaymentPlan(req: PaymentRequest, cfg: PaymentEndpointConfig = {}): PaymentPlan {
  const totalCents = computeSubtotalCents(req);
  const memo = buildMemo(req);
  return {
    totalCents,
    memo,
    methods: [
      buildCardMethod(req, cfg, memo),
      buildBtcMethod(cfg, totalCents, memo),
      buildEthMethod(cfg, totalCents, memo),
      buildEmailMethod(req, totalCents, memo),
    ],
  };
}

/** Read the publisher payment config from a global object (renderer or test). */
export function readPaymentConfigFromGlobal(globalObj: any): PaymentEndpointConfig {
  if (!globalObj || typeof globalObj !== 'object') return {};
  const cfg: PaymentEndpointConfig = {};
  const dexCfg = globalObj?.dexConfig;
  if (dexCfg && typeof dexCfg === 'object') {
    if (typeof dexCfg.checkoutBaseUrl === 'string' && dexCfg.checkoutBaseUrl.length > 0) {
      cfg.baseUrl = dexCfg.checkoutBaseUrl;
    }
    if (typeof dexCfg.btcAddress === 'string') cfg.btcAddress = dexCfg.btcAddress;
    if (typeof dexCfg.ethAddress === 'string') cfg.ethAddress = dexCfg.ethAddress;
    if (dexCfg.rates && typeof dexCfg.rates === 'object') {
      const rates: PaymentRatesUSD = {};
      if (typeof dexCfg.rates.btc === 'number' && dexCfg.rates.btc > 0) rates.btc = dexCfg.rates.btc;
      if (typeof dexCfg.rates.eth === 'number' && dexCfg.rates.eth > 0) rates.eth = dexCfg.rates.eth;
      cfg.rates = rates;
    }
  }
  if (!cfg.baseUrl && typeof globalObj.DEX_CHECKOUT_BASE_URL === 'string' && globalObj.DEX_CHECKOUT_BASE_URL.length > 0) {
    cfg.baseUrl = globalObj.DEX_CHECKOUT_BASE_URL;
  }
  return cfg;
}
