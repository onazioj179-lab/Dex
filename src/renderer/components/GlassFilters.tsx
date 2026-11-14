// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// GlassFilters -- the SVG filter behind Liquid Glass refraction. Mounted once
// at the root; `.dex-glass-refract` references it from `backdrop-filter`, so
// whatever sits behind the dock, the search orb and notification cards bends
// slightly through the glass, like looking through water. Low, slow noise and a
// small displacement keep text behind it legible.

import React from 'react';

export const GlassFilters: React.FC = () => (
  <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    <defs>
      <filter id="dex-glass-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="10" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
);

export default GlassFilters;
