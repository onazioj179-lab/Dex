// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect, vi } from 'vitest';
vi.mock('maplibre-gl', () => ({ default: {}, setWorkerUrl: () => {} }));
import { parseMapView } from '../../src/renderer/DEXAPPLICATIONS/standalone/Maps';

describe('Maps remembers the last view', () => {
  it('reads a saved view and clamps tilt/zoom', () => {
    expect(parseMapView(JSON.stringify({ center: [3.4, 6.5], zoom: 30, bearing: 45, pitch: 120, style: 'satellite' })))
      .toEqual({ center: [3.4, 6.5], zoom: 22, bearing: 45, pitch: 85, style: 'satellite' });
  });
  it('rejects corrupt or impossible values', () => {
    expect(parseMapView('nope')).toBeNull();
    expect(parseMapView(JSON.stringify({ center: [500, 6], zoom: 3 }))).toBeNull();
    expect(parseMapView(null)).toBeNull();
  });
});
