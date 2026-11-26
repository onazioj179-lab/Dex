// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import { stripTrackingParams } from '../../src/renderer/services/browserAddress';

describe('Browser: tracking tags are removed from links', () => {
  it('drops utm, click ids and newsletter tags, keeps real parameters', () => {
    expect(stripTrackingParams('https://shop.example/item?id=42&utm_source=x&utm_medium=email&fbclid=abc')).toBe('https://shop.example/item?id=42');
    expect(stripTrackingParams('https://a.example/?gclid=1&msclkid=2&q=dex')).toBe('https://a.example/?q=dex');
    expect(stripTrackingParams('https://a.example/p?mc_eid=1&_hsenc=2')).toBe('https://a.example/p');
  });
  it('leaves clean, non-web and invalid addresses alone', () => {
    expect(stripTrackingParams('https://a.example/?q=utm')).toBe('https://a.example/?q=utm');
    expect(stripTrackingParams('https://a.example/path#utm_source=x')).toBe('https://a.example/path#utm_source=x');
    expect(stripTrackingParams('not a url')).toBe('not a url');
  });
});
