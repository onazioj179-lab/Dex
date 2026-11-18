// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Creative Studio component library: save an object (a frame brings along
// everything inside it) once, insert it on any board. Components are copies
// with fresh ids, positioned relative to their own top-left corner; connectors
// inside a component keep pointing at the copies. Stored on this PC (IndexedDB).
// Pure helpers are unit-tested.

import { persistGet, persistSetStrict } from '../../../utils/persistentStore';
import { newObjectId, sanitizeObjects, type BoardObject } from '../canvasObjects';

export interface BoardComponent { id: string; name: string; createdAt: number; objects: BoardObject[] }

const KEY = 'creative:components';
const MAX = 200;

/** The object plus, for a frame, every object whose centre is inside it (and connectors between them). */
export function collectComponent(objects: readonly BoardObject[], rootId: string): BoardObject[] {
  const root = objects.find((o) => o.id === rootId);
  if (!root || root.kind === 'connector') return [];
  const inside = (o: BoardObject) => o.x + o.w / 2 >= root.x && o.x + o.w / 2 <= root.x + root.w && o.y + o.h / 2 >= root.y && o.y + o.h / 2 <= root.y + root.h;
  const members = root.kind === 'frame' ? objects.filter((o) => o.id === root.id || (o.kind !== 'connector' && inside(o))) : [root];
  const ids = new Set(members.map((o) => o.id));
  const links = objects.filter((o) => o.kind === 'connector' && o.from && o.to && ids.has(o.from) && ids.has(o.to));
  const x0 = Math.min(...members.map((o) => o.x)), y0 = Math.min(...members.map((o) => o.y));
  return [...members, ...links].map((o) => (o.kind === 'connector' ? { ...o } : { ...o, x: o.x - x0, y: o.y - y0, locked: undefined }));
}

/** Fresh copies placed with their top-left at `at` (new ids, connectors remapped). */
export function instantiateComponent(c: Pick<BoardComponent, 'objects'>, at: { x: number; y: number }): BoardObject[] {
  const map = new Map<string, string>();
  for (const o of c.objects) map.set(o.id, newObjectId());
  return c.objects.map((o) => o.kind === 'connector'
    ? { ...o, id: map.get(o.id)!, from: map.get(o.from ?? '') ?? o.from, to: map.get(o.to ?? '') ?? o.to }
    : { ...o, id: map.get(o.id)!, x: Math.round(o.x + at.x), y: Math.round(o.y + at.y) });
}

export async function loadComponents(): Promise<BoardComponent[]> {
  const v = await persistGet<BoardComponent[]>(KEY).catch(() => undefined);
  return Array.isArray(v) ? v.filter((c) => c && typeof c.id === 'string').map((c) => ({ ...c, objects: sanitizeObjects(c.objects) })) : [];
}

export async function saveComponents(list: BoardComponent[]): Promise<void> {
  await persistSetStrict(KEY, list.slice(0, MAX));
}

export function newComponentId(): string { return `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
