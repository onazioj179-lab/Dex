// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Comprehensive SVG Icon Library
// Sharp, professional icons for all creative apps
// =============================================================================

import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

const defaultProps: Required<IconProps> = {
  size: 16,
  color: 'currentColor',
  strokeWidth: 1.5,
  className: '',
};

// Helper to create icon components
const createIcon = (paths: React.ReactNode, viewBox = '0 0 24 24') => {
  return ({ size = 16, color = 'currentColor', strokeWidth = 1.5, className = '' }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths}
    </svg>
  );
};

// =============================================================================
// SELECTION TOOLS
// =============================================================================

export const IconPointer = createIcon(
  <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
);

export const IconRectSelect = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="4 2" />
    <path d="M8 3v2M16 3v2M8 19v2M16 19v2M3 8h2M19 8h2M3 16h2M19 16h2" />
  </>
);

export const IconEllipseSelect = createIcon(
  <>
    <ellipse cx="12" cy="12" rx="9" ry="7" strokeDasharray="4 2" />
    <path d="M12 5v-2M12 21v-2M3 12h2M19 12h2" />
  </>
);

export const IconLasso = createIcon(
  <>
    <path d="M7 22a5 5 0 0 1-2-4" />
    <path d="M7 16.93c.96.43 1.96.74 2.99.91" />
    <path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2" />
    <circle cx="5" cy="18" r="2" />
  </>
);

export const IconPolygonLasso = createIcon(
  <>
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" strokeDasharray="4 2" />
    <circle cx="12" cy="2" r="1" fill="currentColor" />
    <circle cx="22" cy="8.5" r="1" fill="currentColor" />
    <circle cx="22" cy="15.5" r="1" fill="currentColor" />
    <circle cx="12" cy="22" r="1" fill="currentColor" />
    <circle cx="2" cy="15.5" r="1" fill="currentColor" />
    <circle cx="2" cy="8.5" r="1" fill="currentColor" />
  </>
);

export const IconMagicWand = createIcon(
  <>
    <path d="m15 4-3 3" />
    <path d="m12 7-9 9 3 3 9-9" />
    <path d="m19 4-3 3" />
    <path d="m22 7-3 3" />
    <path d="m5 3 2 2" />
    <path d="m3 5 2 2" />
  </>
);

export const IconQuickSelect = createIcon(
  <>
    <path d="M12 2a10 10 0 1 0 10 10" />
    <path d="M22 2 12 12" />
    <path d="M16 2h6v6" />
  </>
);

export const IconObjectSelect = createIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 9h6v6H9z" fill="currentColor" opacity="0.3" />
    <path d="M4 9h2M18 9h2M4 15h2M18 15h2M9 4v2M15 4v2M9 18v2M15 18v2" />
  </>
);

export const IconColorRange = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M3 12h18" />
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
  </>
);

export const IconRefineEdge = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
    <path d="M7 12h10" />
    <path d="M12 7v10" />
    <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    <circle cx="17" cy="17" r="1.5" fill="currentColor" />
  </>
);

// =============================================================================
// BRUSH & PAINT TOOLS
// =============================================================================

export const IconBrush = createIcon(
  <>
    <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
    <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
  </>
);

export const IconPencil = createIcon(
  <>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </>
);

export const IconEraser = createIcon(
  <>
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </>
);

export const IconAirbrush = createIcon(
  <>
    <path d="M6 18V7c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v11" />
    <path d="M4 22h16" />
    <path d="M12 2v3" />
    <circle cx="12" cy="12" r="3" />
    <path d="M9 12H4M15 12h5" />
  </>
);

export const IconSpray = createIcon(
  <>
    <path d="M4 18v3h16v-3" />
    <path d="M8 18V7l4-4 4 4v11" />
    <circle cx="10" cy="10" r="0.5" fill="currentColor" />
    <circle cx="14" cy="11" r="0.5" fill="currentColor" />
    <circle cx="11" cy="13" r="0.5" fill="currentColor" />
    <circle cx="13" cy="9" r="0.5" fill="currentColor" />
    <circle cx="12" cy="15" r="0.5" fill="currentColor" />
  </>
);

export const IconMixerBrush = createIcon(
  <>
    <path d="M9.06 11.9 17.13 3.84a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
    <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    <path d="M14 6c-1 1-2 0-3 1s0 2-1 3" />
  </>
);

export const IconSmudge = createIcon(
  <>
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="M8 12c2-2 4-2 6 0s4 2 6 0" />
    <path d="M4 12c2-2 4-2 6 0" />
  </>
);

export const IconBlur = createIcon(
  <>
    <circle cx="12" cy="12" r="9" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="5" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="1" />
  </>
);

export const IconSharpen = createIcon(
  <>
    <polygon points="12 2 22 22 2 22" />
    <path d="M12 7v10" />
    <path d="M7 17h10" />
  </>
);

export const IconDodge = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9" />
    <path d="M12 12 6 21" />
    <path d="m12 12 6 9" />
  </>
);

export const IconBurn = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 8c2 2 4 2 6 0" />
    <path d="M8 12c2 2 4 2 6 0" />
    <path d="M8 16c2 2 4 2 6 0" />
  </>
);

export const IconSponge = createIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="8" cy="8" r="1" />
    <circle cx="12" cy="8" r="1" />
    <circle cx="16" cy="8" r="1" />
    <circle cx="8" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="16" cy="12" r="1" />
    <circle cx="8" cy="16" r="1" />
    <circle cx="12" cy="16" r="1" />
    <circle cx="16" cy="16" r="1" />
  </>
);

// =============================================================================
// CLONE & HEALING TOOLS
// =============================================================================

export const IconCloneStamp = createIcon(
  <>
    <circle cx="8" cy="8" r="5" strokeDasharray="2 2" />
    <circle cx="16" cy="16" r="5" />
    <path d="M8 8l8 8" strokeDasharray="3 3" />
  </>
);

export const IconHealBrush = createIcon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
    <circle cx="12" cy="12" r="9" />
  </>
);

export const IconSpotHeal = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </>
);

export const IconPatch = createIcon(
  <>
    <rect x="3" y="3" width="8" height="8" rx="1" strokeDasharray="2 2" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
    <path d="M11 7l6 6" strokeDasharray="3 3" />
  </>
);

export const IconRedEye = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <path d="M12 3v2M12 19v2" />
  </>
);

// =============================================================================
// TRANSFORM & CROP TOOLS
// =============================================================================

export const IconMove = createIcon(
  <>
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </>
);

export const IconScale = createIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M14 4v6h6" />
    <path d="M4 14h6v6" />
    <path d="M14 10l6-6M4 20l6-6" />
  </>
);

export const IconRotate = createIcon(
  <>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </>
);

export const IconSkew = createIcon(
  <>
    <path d="M4 20L8 4h8l4 16" />
    <path d="M6 12h12" />
  </>
);

export const IconDistort = createIcon(
  <>
    <path d="M3 5l5-2 8 2 5-2v16l-5 2-8-2-5 2z" />
    <circle cx="3" cy="5" r="1" fill="currentColor" />
    <circle cx="8" cy="3" r="1" fill="currentColor" />
    <circle cx="16" cy="5" r="1" fill="currentColor" />
    <circle cx="21" cy="3" r="1" fill="currentColor" />
  </>
);

export const IconPerspective = createIcon(
  <>
    <path d="M6 4l12 0" />
    <path d="M4 20l16 0" />
    <path d="M6 4L4 20" />
    <path d="M18 4l4 16" />
    <circle cx="6" cy="4" r="1.5" fill="currentColor" />
    <circle cx="18" cy="4" r="1.5" fill="currentColor" />
    <circle cx="4" cy="20" r="1.5" fill="currentColor" />
    <circle cx="22" cy="20" r="1.5" fill="currentColor" />
  </>
);

export const IconWarp = createIcon(
  <>
    <path d="M3 6c3 0 5 6 9 6s6-6 9-6" />
    <path d="M3 12c3 0 5 6 9 6s6-6 9-6" />
    <path d="M3 18c3 0 5 3 9 3s6-3 9-3" />
  </>
);

export const IconCrop = createIcon(
  <>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </>
);

export const IconSlice = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M12 3v18" />
    <path d="M3 12h18" />
  </>
);

// =============================================================================
// TEXT & SHAPE TOOLS
// =============================================================================

export const IconText = createIcon(
  <>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </>
);

export const IconTextVertical = createIcon(
  <>
    <polyline points="7 20 4 20 4 4 7 4" />
    <line x1="20" y1="9" x2="20" y2="15" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </>
);

export const IconTextPath = createIcon(
  <>
    <path d="M4 18c2-4 6-6 8-6s6 2 8 6" strokeDasharray="3 2" />
    <text x="6" y="14" fontSize="8" fill="currentColor" stroke="none">T</text>
    <text x="11" y="12" fontSize="8" fill="currentColor" stroke="none">e</text>
    <text x="15" y="12" fontSize="8" fill="currentColor" stroke="none">x</text>
  </>
);

export const IconRectangle = createIcon(
  <rect x="3" y="3" width="18" height="18" rx="2" />
);

export const IconEllipse = createIcon(
  <ellipse cx="12" cy="12" rx="9" ry="7" />
);

export const IconPolygon = createIcon(
  <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
);

export const IconStar = createIcon(
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
);

export const IconLine = createIcon(
  <>
    <line x1="5" y1="19" x2="19" y2="5" />
    <circle cx="5" cy="19" r="1.5" fill="currentColor" />
    <circle cx="19" cy="5" r="1.5" fill="currentColor" />
  </>
);

export const IconArrow = createIcon(
  <>
    <line x1="5" y1="19" x2="19" y2="5" />
    <polyline points="13 5 19 5 19 11" />
  </>
);

export const IconPen = createIcon(
  <>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </>
);

export const IconCurvature = createIcon(
  <>
    <path d="M4 20c2-8 6-14 8-14s6 6 8 14" />
    <circle cx="4" cy="20" r="1.5" fill="currentColor" />
    <circle cx="12" cy="6" r="1.5" fill="currentColor" />
    <circle cx="20" cy="20" r="1.5" fill="currentColor" />
  </>
);

// =============================================================================
// COLOR TOOLS
// =============================================================================

export const IconEyedropper = createIcon(
  <>
    <path d="m2 22 1-1h3l9-9" />
    <path d="M3 21v-3l9-9" />
    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
  </>
);

export const IconGradient = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="21" x2="21" y2="3" />
  </>
);

export const IconBucket = createIcon(
  <>
    <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
    <path d="m5 2 5 5" />
    <path d="M2 13h15" />
    <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
  </>
);

export const IconColorWheel = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v4M21 12h-4M12 21v-4M3 12h4" />
  </>
);

export const IconSwatches = createIcon(
  <>
    <rect x="2" y="2" width="6" height="6" rx="1" />
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <rect x="16" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <rect x="16" y="9" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="9" y="16" width="6" height="6" rx="1" />
    <rect x="16" y="16" width="6" height="6" rx="1" />
  </>
);

// =============================================================================
// LAYER ICONS
// =============================================================================

export const IconLayers = createIcon(
  <>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </>
);

export const IconLayerPlus = createIcon(
  <>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <path d="M2 12l10 5 10-5" />
    <path d="M12 17v5" />
    <path d="M9 20h6" />
  </>
);

export const IconLayerMinus = createIcon(
  <>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <path d="M2 12l10 5 10-5" />
    <path d="M9 20h6" />
  </>
);

export const IconLayerGroup = createIcon(
  <>
    <rect x="3" y="8" width="14" height="12" rx="1" />
    <path d="M7 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
  </>
);

export const IconLayerMask = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18" />
    <path d="M3 12h9" fill="currentColor" fillOpacity="0.3" stroke="none" />
    <rect x="3" y="3" width="9" height="18" fill="currentColor" fillOpacity="0.3" stroke="none" />
  </>
);

export const IconClippingMask = createIcon(
  <>
    <rect x="3" y="10" width="18" height="11" rx="1" />
    <path d="M7 10V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" />
    <path d="M12 10v11" strokeDasharray="2 2" />
  </>
);

export const IconEye = createIcon(
  <>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const IconEyeOff = createIcon(
  <>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </>
);

export const IconLock = createIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>
);

export const IconUnlock = createIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </>
);

// =============================================================================
// VIEW & NAVIGATION ICONS
// =============================================================================

export const IconZoomIn = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </>
);

export const IconZoomOut = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </>
);

export const IconZoomFit = createIcon(
  <>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </>
);

export const IconZoom100 = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <text x="7" y="14" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">1:1</text>
  </>
);

export const IconHand = createIcon(
  <>
    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </>
);

export const IconRotateView = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 9 9" />
    <path d="M21 9l-3 3 3 3" />
  </>
);

export const IconFlipH = createIcon(
  <>
    <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
    <path d="M12 20v2" />
    <path d="M12 14v2" />
    <path d="M12 8v2" />
    <path d="M12 2v2" />
  </>
);

export const IconFlipV = createIcon(
  <>
    <path d="M3 8V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M20 12h2" />
    <path d="M14 12h2" />
    <path d="M8 12h2" />
    <path d="M2 12h2" />
  </>
);

export const IconGrid = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M9 3v18" />
    <path d="M15 3v18" />
  </>
);

export const IconRuler = createIcon(
  <>
    <path d="M21.3 8.7 8.7 21.3c-.39.39-1.02.39-1.41 0L2.7 16.7c-.39-.39-.39-1.02 0-1.41L15.3 2.7c.39-.39 1.02-.39 1.41 0l4.59 4.59c.39.39.39 1.02 0 1.41z" />
    <path d="m7.5 10.5 1 1" />
    <path d="m10.5 7.5 1 1" />
    <path d="m13.5 4.5 1 1" />
    <path d="m4.5 13.5 1 1" />
  </>
);

export const IconGuides = createIcon(
  <>
    <path d="M12 3v18" strokeDasharray="4 2" />
    <path d="M3 12h18" strokeDasharray="4 2" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </>
);

export const IconSnap = createIcon(
  <>
    <path d="M4 12a2 2 0 0 1 2-2h2a2 2 0 0 1 0 4H6a2 2 0 0 1-2-2z" />
    <path d="M14 12a2 2 0 0 1 2-2h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-2-2z" />
    <path d="M8 12h6" />
  </>
);

// =============================================================================
// HISTORY & FILE ICONS
// =============================================================================

export const IconUndo = createIcon(
  <>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </>
);

export const IconRedo = createIcon(
  <>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </>
);

export const IconHistory = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 15" />
  </>
);

export const IconSave = createIcon(
  <>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </>
);

export const IconSaveAs = createIcon(
  <>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <path d="M14 3v4h4" />
    <path d="M9 3v2" />
    <path d="M12 3v2" />
  </>
);

export const IconOpen = createIcon(
  <>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <path d="M12 11v6" />
    <path d="M9 14l3-3 3 3" />
  </>
);

export const IconExport = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </>
);

export const IconImport = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>
);

export const IconImage = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </>
);

// =============================================================================
// FILTER & ADJUSTMENT ICONS
// =============================================================================

export const IconBrightness = createIcon(
  <>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </>
);

export const IconContrast = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" fillOpacity="0.3" stroke="none" />
  </>
);

export const IconSaturation = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3c-3 3-3 6 0 9s3 6 0 9" />
  </>
);

export const IconHue = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3l6 9-6 9-6-9z" />
  </>
);

export const IconCurves = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 18c4-2 6-6 9-9s5-4 9-6" />
    <circle cx="8" cy="14" r="1.5" fill="currentColor" />
    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
  </>
);

export const IconLevels = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 15l4-8 4 4 4-6 6 10" />
  </>
);

export const IconColorBalance = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="16" cy="12" r="2" />
  </>
);

export const IconExposure = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M12 7v10" />
    <path d="M7 12h10" />
    <path d="M7 17h10" />
  </>
);

export const IconVibrance = createIcon(
  <>
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" />
    <circle cx="12" cy="9" r="3" />
  </>
);

export const IconBlackWhite = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" fillOpacity="0.5" stroke="none" />
  </>
);

export const IconFilter = createIcon(
  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
);

export const IconNoise = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <circle cx="6" cy="6" r="0.5" fill="currentColor" />
    <circle cx="10" cy="8" r="0.5" fill="currentColor" />
    <circle cx="14" cy="6" r="0.5" fill="currentColor" />
    <circle cx="18" cy="7" r="0.5" fill="currentColor" />
    <circle cx="7" cy="11" r="0.5" fill="currentColor" />
    <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    <circle cx="17" cy="11" r="0.5" fill="currentColor" />
    <circle cx="6" cy="16" r="0.5" fill="currentColor" />
    <circle cx="11" cy="17" r="0.5" fill="currentColor" />
    <circle cx="15" cy="15" r="0.5" fill="currentColor" />
    <circle cx="18" cy="17" r="0.5" fill="currentColor" />
  </>
);

export const IconLiquify = createIcon(
  <>
    <path d="M12 3c-2 3-2 5 0 7s2 5 0 8" />
    <path d="M8 5c-2 2-2 4 0 6s2 4 0 6" />
    <path d="M16 5c2 2 2 4 0 6s-2 4 0 6" />
  </>
);

// =============================================================================
// GENERAL UI ICONS
// =============================================================================

export const IconPlus = createIcon(
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>
);

export const IconMinus = createIcon(
  <line x1="5" y1="12" x2="19" y2="12" />
);

export const IconClose = createIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

export const IconCheck = createIcon(
  <polyline points="20 6 9 17 4 12" />
);

export const IconChevronDown = createIcon(
  <polyline points="6 9 12 15 18 9" />
);

export const IconChevronUp = createIcon(
  <polyline points="18 15 12 9 6 15" />
);

export const IconChevronLeft = createIcon(
  <polyline points="15 18 9 12 15 6" />
);

export const IconChevronRight = createIcon(
  <polyline points="9 18 15 12 9 6" />
);

export const IconMenu = createIcon(
  <>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </>
);

export const IconMoreH = createIcon(
  <>
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
    <circle cx="5" cy="12" r="1" fill="currentColor" />
  </>
);

export const IconMoreV = createIcon(
  <>
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </>
);

export const IconSettings = createIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
);

export const IconInfo = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </>
);

export const IconWarning = createIcon(
  <>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>
);

export const IconTrash = createIcon(
  <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>
);

export const IconCopy = createIcon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);

export const IconPaste = createIcon(
  <>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </>
);

export const IconSearch = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>
);

export const IconFolder = createIcon(
  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
);

export const IconFile = createIcon(
  <>
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <polyline points="13 2 13 9 20 9" />
  </>
);

export const IconDownload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>
);

export const IconUpload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </>
);

export const IconLink = createIcon(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>
);

export const IconUnlink = createIcon(
  <>
    <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
    <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    <line x1="8" y1="2" x2="8" y2="5" />
    <line x1="2" y1="8" x2="5" y2="8" />
    <line x1="16" y1="19" x2="16" y2="22" />
    <line x1="19" y1="16" x2="22" y2="16" />
  </>
);

export const IconHeart = createIcon(
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
);

export const IconHome = createIcon(
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </>
);

export const IconUser = createIcon(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>
);

export const IconBell = createIcon(
  <>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </>
);

export const IconCalendar = createIcon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </>
);

export const IconClock = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>
);

export const IconHelp = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>
);

// =============================================================================
// MEDIA & PLAYBACK ICONS
// =============================================================================

export const IconPlay = createIcon(
  <polygon points="5 3 19 12 5 21 5 3" />
);

export const IconPause = createIcon(
  <>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </>
);

export const IconStop = createIcon(
  <rect x="4" y="4" width="16" height="16" rx="1" />
);

export const IconSkipBack = createIcon(
  <>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" y1="19" x2="5" y2="5" />
  </>
);

export const IconSkipForward = createIcon(
  <>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </>
);

export const IconRewind = createIcon(
  <>
    <polygon points="11 19 2 12 11 5 11 19" />
    <polygon points="22 19 13 12 22 5 22 19" />
  </>
);

export const IconFastForward = createIcon(
  <>
    <polygon points="13 19 22 12 13 5 13 19" />
    <polygon points="2 19 11 12 2 5 2 19" />
  </>
);

export const IconVolume = createIcon(
  <>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </>
);

export const IconVolumeMute = createIcon(
  <>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </>
);

export const IconMic = createIcon(
  <>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </>
);

export const IconVideo = createIcon(
  <>
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </>
);

export const IconMusic = createIcon(
  <>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </>
);

// =============================================================================
// SPECIAL CREATIVE ICONS
// =============================================================================

export const IconArtboard = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </>
);

export const IconPipeline = createIcon(
  <>
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="18" r="3" />
    <path d="M9 6h6" />
    <path d="M6 9v6" />
    <path d="M18 9v6" />
    <path d="M9 18h6" />
  </>
);

export const IconNode = createIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v6" />
    <path d="M12 16v6" />
    <path d="M2 12h6" />
    <path d="M16 12h6" />
  </>
);

export const IconKeyframe = createIcon(
  <>
    <path d="M12 2l4 10-4 10-4-10z" fill="currentColor" fillOpacity="0.2" />
    <path d="M12 2l4 10-4 10-4-10z" />
  </>
);

export const IconTimeline = createIcon(
  <>
    <rect x="2" y="4" width="20" height="4" rx="1" />
    <rect x="2" y="10" width="12" height="4" rx="1" />
    <rect x="2" y="16" width="16" height="4" rx="1" />
  </>
);

export const IconWaveform = createIcon(
  <>
    <path d="M2 12h2v4H2z" />
    <path d="M6 8h2v8H6z" />
    <path d="M10 4h2v16h-2z" />
    <path d="M14 6h2v12h-2z" />
    <path d="M18 10h2v4h-2z" />
    <path d="M22 11h0" />
  </>
);

export const IconSpectrum = createIcon(
  <>
    <rect x="2" y="14" width="3" height="6" rx="1" />
    <rect x="6" y="10" width="3" height="10" rx="1" />
    <rect x="10" y="6" width="3" height="14" rx="1" />
    <rect x="14" y="4" width="3" height="16" rx="1" />
    <rect x="18" y="8" width="3" height="12" rx="1" />
  </>
);

export const IconParticle = createIcon(
  <>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="6" cy="6" r="1" />
    <circle cx="18" cy="6" r="1.5" />
    <circle cx="4" cy="14" r="1" />
    <circle cx="20" cy="16" r="1.5" />
    <circle cx="8" cy="20" r="1" />
    <circle cx="16" cy="18" r="1" />
    <path d="M12 12L6 6M12 12l6-6M12 12l-8 2M12 12l8 4M12 12l-4 8M12 12l4 6" strokeDasharray="2 2" />
  </>
);

export const IconCamera3D = createIcon(
  <>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
    <path d="M12 9v1" />
    <path d="M9.5 11l.9.5" />
    <path d="M9.5 15l.9-.5" />
    <path d="M12 17v-1" />
    <path d="M14.5 15l-.9-.5" />
    <path d="M14.5 11l-.9.5" />
  </>
);

export const IconLight = createIcon(
  <>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2" />
    <path d="M12 21v2" />
    <path d="M4.22 4.22l1.42 1.42" />
    <path d="M18.36 18.36l1.42 1.42" />
    <path d="M1 12h2" />
    <path d="M21 12h2" />
    <path d="M4.22 19.78l1.42-1.42" />
    <path d="M18.36 5.64l1.42-1.42" />
  </>
);

export const IconMaterial = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="3" ry="9" />
    <path d="M3 12h18" />
  </>
);

export const IconRender = createIcon(
  <>
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <path d="M2 12h20" />
    <path d="M12 2v20" />
    <circle cx="7" cy="7" r="2" />
    <circle cx="17" cy="17" r="2" />
  </>
);

// Export all icons as a collection
export const CreativeIcons = {
  // Selection
  pointer: IconPointer,
  rectSelect: IconRectSelect,
  ellipseSelect: IconEllipseSelect,
  lasso: IconLasso,
  polygonLasso: IconPolygonLasso,
  magicWand: IconMagicWand,
  quickSelect: IconQuickSelect,
  objectSelect: IconObjectSelect,
  colorRange: IconColorRange,
  refineEdge: IconRefineEdge,
  
  // Brush & Paint
  brush: IconBrush,
  pencil: IconPencil,
  eraser: IconEraser,
  airbrush: IconAirbrush,
  spray: IconSpray,
  mixerBrush: IconMixerBrush,
  smudge: IconSmudge,
  blur: IconBlur,
  sharpen: IconSharpen,
  dodge: IconDodge,
  burn: IconBurn,
  sponge: IconSponge,
  
  // Clone & Healing
  cloneStamp: IconCloneStamp,
  healBrush: IconHealBrush,
  spotHeal: IconSpotHeal,
  patch: IconPatch,
  redEye: IconRedEye,
  
  // Transform
  move: IconMove,
  scale: IconScale,
  rotate: IconRotate,
  skew: IconSkew,
  distort: IconDistort,
  perspective: IconPerspective,
  warp: IconWarp,
  crop: IconCrop,
  slice: IconSlice,
  
  // Text & Shapes
  text: IconText,
  textVertical: IconTextVertical,
  textPath: IconTextPath,
  rectangle: IconRectangle,
  ellipse: IconEllipse,
  polygon: IconPolygon,
  star: IconStar,
  line: IconLine,
  arrow: IconArrow,
  pen: IconPen,
  curvature: IconCurvature,
  
  // Color
  eyedropper: IconEyedropper,
  gradient: IconGradient,
  bucket: IconBucket,
  colorWheel: IconColorWheel,
  swatches: IconSwatches,
  
  // Layers
  layers: IconLayers,
  layerPlus: IconLayerPlus,
  layerMinus: IconLayerMinus,
  layerGroup: IconLayerGroup,
  layerMask: IconLayerMask,
  clippingMask: IconClippingMask,
  eye: IconEye,
  eyeOff: IconEyeOff,
  lock: IconLock,
  unlock: IconUnlock,
  
  // View & Navigation
  zoomIn: IconZoomIn,
  zoomOut: IconZoomOut,
  zoomFit: IconZoomFit,
  zoom100: IconZoom100,
  hand: IconHand,
  rotateView: IconRotateView,
  flipH: IconFlipH,
  flipV: IconFlipV,
  grid: IconGrid,
  ruler: IconRuler,
  guides: IconGuides,
  
  // History & File
  undo: IconUndo,
  redo: IconRedo,
  history: IconHistory,
  save: IconSave,
  saveAs: IconSaveAs,
  open: IconOpen,
  export: IconExport,
  import: IconImport,
  image: IconImage,
  
  // Filters & Adjustments
  brightness: IconBrightness,
  contrast: IconContrast,
  saturation: IconSaturation,
  hue: IconHue,
  curves: IconCurves,
  levels: IconLevels,
  colorBalance: IconColorBalance,
  exposure: IconExposure,
  vibrance: IconVibrance,
  blackWhite: IconBlackWhite,
  filter: IconFilter,
  noise: IconNoise,
  liquify: IconLiquify,
  
  // General UI
  plus: IconPlus,
  minus: IconMinus,
  close: IconClose,
  check: IconCheck,
  chevronDown: IconChevronDown,
  chevronUp: IconChevronUp,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  menu: IconMenu,
  moreH: IconMoreH,
  moreV: IconMoreV,
  settings: IconSettings,
  info: IconInfo,
  warning: IconWarning,
  trash: IconTrash,
  copy: IconCopy,
  paste: IconPaste,
  search: IconSearch,
  folder: IconFolder,
  file: IconFile,
  download: IconDownload,
  upload: IconUpload,
  link: IconLink,
  unlink: IconUnlink,
  heart: IconHeart,
  home: IconHome,
  user: IconUser,
  bell: IconBell,
  calendar: IconCalendar,
  clock: IconClock,
  help: IconHelp,
  
  // Media
  play: IconPlay,
  pause: IconPause,
  stop: IconStop,
  skipBack: IconSkipBack,
  skipForward: IconSkipForward,
  rewind: IconRewind,
  fastForward: IconFastForward,
  volume: IconVolume,
  volumeMute: IconVolumeMute,
  mic: IconMic,
  video: IconVideo,
  music: IconMusic,
  
  // Special Creative
  artboard: IconArtboard,
  pipeline: IconPipeline,
  node: IconNode,
  keyframe: IconKeyframe,
  timeline: IconTimeline,
  waveform: IconWaveform,
  spectrum: IconSpectrum,
  particle: IconParticle,
  camera3D: IconCamera3D,
  light: IconLight,
  material: IconMaterial,
  render: IconRender,
};

export default CreativeIcons;
