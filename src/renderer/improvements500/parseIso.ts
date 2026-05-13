// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ISO 8601 date/time parser. Returns a Date or null. Accepts:
//   YYYY-MM-DD
//   YYYY-MM-DDTHH:mm:ss
//   YYYY-MM-DDTHH:mm:ss.sss
//   ...with optional Z or +HH:mm / -HH:mm timezone.
const RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function parseIso(input: string): Date | null {
  const m = RE.exec(input);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;
  const second = m[6] ? Number(m[6]) : 0;
  const fracStr = m[7] ?? '';
  const ms = fracStr ? Math.round(Number(`0.${fracStr}`) * 1000) : 0;
  const tz = m[8];
  let utc = Date.UTC(year, month, day, hour, minute, second, ms);
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '+' ? 1 : -1;
    const cleaned = tz.slice(1).replace(':', '');
    const tzH = Number(cleaned.slice(0, 2));
    const tzM = Number(cleaned.slice(2, 4));
    utc -= sign * (tzH * 60 + tzM) * 60000;
  } else if (!tz) {
    // No timezone: treat as local time.
    return new Date(year, month, day, hour, minute, second, ms);
  }
  if (Number.isNaN(utc)) return null;
  return new Date(utc);
}
