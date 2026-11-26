// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI works where you can see it.
 *
 * When UKI acts inside an app (DEX Code, AXL, Notes, Ledger …) the app comes
 * to the front and a pill at the top of DEX says what she is doing, then that
 * it is done (or why it failed). Apps that are not open are opened for her
 * first, instead of her replying "open it first".
 */

export type UkiActivityPhase = 'start' | 'done' | 'failed';
export interface UkiActivity { id: number; appId: string; appName: string; label: string; phase: UkiActivityPhase; detail?: string; at: number }

export const UKI_ACTIVITY_EVENT = 'dex-uki-activity';
let seq = 0;

/** A short, human label from an action description ("run the open file (asks first)" -> "Run the open file"). */
export function activityLabel(description: string): string {
  let s = description.replace(/\s*\([^)]*\)\s*/g, ' ').split(/[.;:]/)[0].trim();
  if (s.length > 60) s = `${s.slice(0, 57).trimEnd()}…`;
  return s ? s[0].toUpperCase() + s.slice(1) : 'Working';
}

export function announceUkiActivity(a: Omit<UkiActivity, 'id' | 'at'> & { id?: number }): number {
  const id = a.id ?? ++seq;
  try { window.dispatchEvent(new CustomEvent<UkiActivity>(UKI_ACTIVITY_EVENT, { detail: { ...a, id, at: Date.now() } })); } catch { /* non-DOM */ }
  return id;
}

/** Wait until `test()` is true (polling), up to `timeoutMs`. */
export async function waitFor(test: () => boolean, timeoutMs = 6000, stepMs = 100): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return test();
}
