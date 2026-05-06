// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX UI -- Field
// Standard label + description + error wrapper for any form control.
// Uses native <label htmlFor> binding for accessibility.
// ===========================================================================
import React from 'react';
import { space, fontSize, fontWeight } from '../styles/tokens';

export interface FieldProps {
  /** Field label, shown above the control. */
  label?: React.ReactNode;
  /** Optional help text rendered under the label. */
  description?: React.ReactNode;
  /** Error message (overrides description visually). */
  error?: React.ReactNode;
  /** ID applied to the control via aria/htmlFor. */
  htmlFor?: string;
  /** Mark field as required. */
  required?: boolean;
  /** Inline label on the right (for toggles / checkboxes). */
  inline?: boolean;
  /** The form control to wrap. */
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Field: React.FC<FieldProps> = ({
  label, description, error, htmlFor, required, inline = false, children, className, style,
}) => {
  if (inline) {
    return (
      <div
        className={className}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: space[3], padding: `${space[2]}px 0`,
          ...style,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          {label && (
            <label
              htmlFor={htmlFor}
              style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: 'var(--color-text-primary)' }}
            >
              {label}{required && <span style={{ color: 'var(--color-error)', marginLeft: 2 }}>*</span>}
            </label>
          )}
          {(description || error) && (
            <span style={{
              fontSize: fontSize.xs,
              color: error ? 'var(--color-error, #FF453A)' : 'var(--color-text-tertiary, #8E8E93)',
              lineHeight: 1.45,
            }}>
              {error ?? description}
            </span>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>{children}</div>
      </div>
    );
  }
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: space[1], ...style }}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{
            fontSize: fontSize.sm, fontWeight: fontWeight.medium,
            color: 'var(--color-text-primary, #fff)',
          }}
        >
          {label}{required && <span style={{ color: 'var(--color-error, #FF453A)', marginLeft: 2 }}>*</span>}
        </label>
      )}
      {description && !error && (
        <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-tertiary, #8E8E93)', lineHeight: 1.45 }}>
          {description}
        </span>
      )}
      <div style={{ marginTop: 2 }}>{children}</div>
      {error && (
        <span
          role="alert"
          style={{ fontSize: fontSize.xs, color: 'var(--color-error, #FF453A)', lineHeight: 1.45 }}
        >
          {error}
        </span>
      )}
    </div>
  );
};
