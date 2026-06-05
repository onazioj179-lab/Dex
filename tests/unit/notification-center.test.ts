// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  selectVisible,
  unreadCount,
  partitionByRead,
  applyDnd,
  buildCenterModel,
} from '../../src/shared/notifications/center';
import type { NotificationRecord, NotificationPriority } from '../../src/shared/notifications/group';

let seq = 0;
const note = (priority: NotificationPriority, source = 's', ts = ++seq): NotificationRecord => ({
  id: `n${seq}_${priority}`,
  title: `${priority}-${ts}`,
  source,
  priority,
  ts,
});

describe('selectVisible', () => {
  it('caps visible and reports overflow', () => {
    const items = [note('low'), note('normal'), note('high'), note('urgent')];
    const sel = selectVisible(items, 2);
    expect(sel.visible).toHaveLength(2);
    expect(sel.visible[0].priority).toBe('urgent'); // priority ordered
    expect(sel.overflow).toBe(2);
    expect(sel.overflowLabel).toBe('+2 more');
  });

  it('no overflow label when everything fits', () => {
    const sel = selectVisible([note('normal')], 3);
    expect(sel.overflow).toBe(0);
    expect(sel.overflowLabel).toBe('');
  });
});

describe('unreadCount / partitionByRead', () => {
  it('counts and partitions by read ids (array or Set)', () => {
    const a = note('high'); const b = note('low'); const c = note('normal');
    const items = [a, b, c];
    expect(unreadCount(items, [a.id])).toBe(2);
    expect(unreadCount(items, new Set([a.id, b.id]))).toBe(1);
    expect(unreadCount(items)).toBe(3);

    const part = partitionByRead(items, [b.id]);
    expect(part.read.map((n) => n.id)).toEqual([b.id]);
    expect(part.unread.map((n) => n.id).sort()).toEqual([a.id, c.id].sort());
  });
});

describe('applyDnd', () => {
  it('passes everything when disabled', () => {
    const items = [note('low'), note('urgent')];
    expect(applyDnd(items, { enabled: false })).toHaveLength(2);
  });

  it('suppresses below the floor when enabled (default urgent-only)', () => {
    const items = [note('low'), note('high'), note('urgent')];
    expect(applyDnd(items, { enabled: true }).map((n) => n.priority)).toEqual(['urgent']);
    expect(applyDnd(items, { enabled: true, allowAtLeast: 'high' }).map((n) => n.priority).sort())
      .toEqual(['high', 'urgent']);
  });
});

describe('buildCenterModel', () => {
  it('assembles visible/overflow/groups/unread, DND-first', () => {
    const items = [
      note('low', 'mail'), note('normal', 'mail'),
      note('high', 'calendar'), note('urgent', 'system'),
    ];
    const model = buildCenterModel(items, { maxVisible: 2, dnd: { enabled: false } });
    expect(model.total).toBe(4);
    expect(model.visible).toHaveLength(2);
    expect(model.overflow).toBe(2);
    expect(model.groups.map((g) => g.source)).toContain('system');
    expect(model.unread).toBe(4);
  });

  it('unread + total reflect the post-DND set', () => {
    const items = [note('low'), note('low'), note('urgent')];
    const model = buildCenterModel(items, { dnd: { enabled: true } }); // only urgent survives
    expect(model.total).toBe(1);
    expect(model.unread).toBe(1);
    expect(model.visible).toHaveLength(1);
  });
});
