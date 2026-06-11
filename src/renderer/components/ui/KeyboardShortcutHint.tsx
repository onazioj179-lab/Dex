// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * KeyboardShortcutHint -- inline keyboard shortcut badge.
 *
 * Renders one or more keys (e.g. ["Ctrl", "K"]) as individual keycap pills.
 * Used in menus, tooltips, command palette, and onboarding hints.
 * Adapts label automatically between Windows (Ctrl) and macOS (Cmd).
 *
 * W8#417: keyboard shortcut hint component
 */

import React, { useMemo } from 'react';

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

function adaptKey(key: string): string {
  if (!IS_MAC) return key;
  // Normalize common cross-platform labels
  return key
    .replace(/\bCtrl\b/i, '\u2318')  // Cmd
    .replace(/\bAlt\b/i, '\u2325')   // Option
    .replace(/\bShift\b/i, '\u21e7') // Shift
    .replace(/\bBackspace\b/i, '\u232b')
    .replace(/\bEnter\b/i, '\u21a9')
    .replace(/\bTab\b/i, '\u21e5')
    .replace(/\bEsc\b/i, '\u238b');
}

export interface KeyboardShortcutHintProps {
  /** Keys to display. Pass as array e.g. ["Ctrl","K"] or single string "F5". */
  keys: string | string[];
  /** Size variant. Default sm. */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_STYLES: Record<'xs' | 'sm' | 'md', React.CSSProperties> = {
  xs: { fontSize: 9, padding: '1px 4px', borderRadius: 2 },
  sm: { fontSize: 10, padding: '1px 5px', borderRadius: 3 },
  md: { fontSize: 12, padding: '2px 7px', borderRadius: 4 },
};

export const KeyboardShortcutHint: React.FC<KeyboardShortcutHintProps> = ({
  keys,
  size = 'sm',
  className,
  style,
}) => {
  const keyArr = useMemo(() => {
    const arr = Array.isArray(keys) ? keys : [keys];
    return arr.map(adaptKey);
  }, [keys]);

  const sizeStyle = SIZE_STYLES[size];

  return (
    <span
      className={`dex-kbd${className ? ` ${className}` : ''}`}
      aria-label={Array.isArray(keys) ? keys.join('+') : keys}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, ...style }}
    >
      {keyArr.map((k, i) => (
        <kbd
          key={i}
          style={{
            ...sizeStyle,
            display: 'inline-block',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderBottomWidth: 2,
            color: 'var(--pg-text-secondary, rgba(255,255,255,0.6))',
            fontFamily: 'var(--font-sans, system-ui)',
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
};

export default KeyboardShortcutHint;
