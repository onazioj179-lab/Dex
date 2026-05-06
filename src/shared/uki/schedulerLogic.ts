// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UKI Scheduler — pure logic.
 * Kept separate from Scheduler.ts so vitest can import it without dragging
 * the `electron` module into the renderer/test environment.
 */

// DEX v3.8.0 - UKI Scheduler logic

export type TriggerSpec =
  | { kind: 'everyMinutes'; minutes: number }
  | { kind: 'dailyAt'; time: string /* "HH:MM" 24h */ }
  | { kind: 'weekly'; dow: number /* 0..6 */; time: string }
  | { kind: 'onIdleMs'; ms: number }
  | { kind: 'onSystemEvent'; event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen' };

export interface ScheduledTrigger {
  id: string;
  spec: TriggerSpec;
  action: string;
  payload?: Record<string, unknown>;
  label: string;
  enabled: boolean;
  createdAt: number;
  lastFiredAt?: number;
}

export function shouldFireTimeBased(t: ScheduledTrigger, now: Date): boolean {
  if (!t.enabled) return false;
  const last = t.lastFiredAt || 0;
  const ageMs = now.getTime() - last;
  switch (t.spec.kind) {
    case 'everyMinutes':
      return ageMs >= t.spec.minutes * 60_000 - 5_000;
    case 'dailyAt': {
      const [hh, mm] = t.spec.time.split(':').map(Number);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
      if (now.getHours() !== hh || now.getMinutes() !== mm) return false;
      return ageMs > 60_000;
    }
    case 'weekly': {
      if (now.getDay() !== t.spec.dow) return false;
      const [hh, mm] = t.spec.time.split(':').map(Number);
      if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
      if (now.getHours() !== hh || now.getMinutes() !== mm) return false;
      return ageMs > 60_000;
    }
    default:
      return false;
  }
}
