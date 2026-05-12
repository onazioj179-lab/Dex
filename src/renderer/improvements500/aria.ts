// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * 500-improvement wave — shared aria-attribute helpers (T1).
 *
 * Goal: one-line aria coverage for buttons/inputs/menus across every app
 * surface so axe-core reports 0 unlabeled controls.
 *
 *   <button {...ariaButton('Mute track')} onClick={...}>...</button>
 */

export interface AriaButtonAttrs {
  'aria-label': string;
  'aria-pressed'?: boolean;
  'aria-disabled'?: boolean;
  type?: 'button';
  role?: string;
}

/** Standard aria attrs for an interactive button-shaped surface. */
export function ariaButton(
  label: string,
  options: { pressed?: boolean; disabled?: boolean; role?: string } = {},
): AriaButtonAttrs {
  const out: AriaButtonAttrs = { 'aria-label': label, type: 'button' };
  if (options.pressed !== undefined) out['aria-pressed'] = options.pressed;
  if (options.disabled !== undefined) out['aria-disabled'] = options.disabled;
  if (options.role) out.role = options.role;
  return out;
}

/** aria attrs for a toggle button that has a pressed state. */
export function ariaToggle(label: string, pressed: boolean): AriaButtonAttrs {
  return ariaButton(label, { pressed });
}

/** aria attrs for a control that opens a popup/menu. */
export function ariaTrigger(label: string, expanded: boolean, controls?: string) {
  return {
    'aria-label': label,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': expanded,
    ...(controls ? { 'aria-controls': controls } : {}),
    type: 'button' as const,
  };
}

/** aria attrs for a current/active item in a list (e.g. dock active app). */
export function ariaCurrent(label: string, current: boolean): AriaButtonAttrs & { 'aria-current'?: 'true' } {
  const out: AriaButtonAttrs & { 'aria-current'?: 'true' } = ariaButton(label);
  if (current) out['aria-current'] = 'true';
  return out;
}

/** aria-live region attributes for status announcements. */
export function ariaLive(politeness: 'polite' | 'assertive' = 'polite') {
  return {
    role: 'status' as const,
    'aria-live': politeness,
    'aria-atomic': true,
  };
}

/** Associate an input with a label by id. */
export function ariaInput(id: string, label: string, opts: { describedBy?: string; invalid?: boolean } = {}) {
  return {
    id,
    'aria-label': label,
    ...(opts.describedBy ? { 'aria-describedby': opts.describedBy } : {}),
    ...(opts.invalid !== undefined ? { 'aria-invalid': opts.invalid } : {}),
  };
}
