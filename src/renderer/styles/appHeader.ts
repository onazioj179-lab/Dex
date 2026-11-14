// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// One title block for app bars. Fixed line heights make the block a known
// 40 px (22 + 2 + 16), so every bar with a subtitle is the same height
// (40 + 8 px padding above and below + 1 px bottom rule = 57 px) and a bar
// without one sits at --app-header-height (44 px).
import type React from 'react';

export const APP_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: '22px',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--color-text-primary)',
};

export const APP_SUBTITLE: React.CSSProperties = {
  display: 'block',
  margin: 0,
  marginTop: 2,
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 400,
  color: 'var(--color-text-tertiary)',
};
