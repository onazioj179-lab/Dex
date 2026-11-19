// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Creative Studio project file (.dexstudio): the board on screen and the deck
// in one JSON file, so a whole piece of work moves between PCs or into a
// backup as one thing. Opening one never overwrites anything: the board comes
// in as a new board and the slides are added after the current ones (undoable).
// Pure format; unit-tested.

import type { BoardPayload } from '../canvasBoards';

export const STUDIO_FORMAT = 'dex-studio';
export const STUDIO_VERSION = 1;

export interface StudioProject {
  format: typeof STUDIO_FORMAT;
  version: typeof STUDIO_VERSION;
  savedAt: string;
  board: { name: string; payload: BoardPayload } | null;
  deck: { slides: unknown[]; theme: string | null } | null;
}

export function serializeStudioProject(board: StudioProject['board'], deck: StudioProject['deck'], now = new Date()): string {
  const p: StudioProject = { format: STUDIO_FORMAT, version: STUDIO_VERSION, savedAt: now.toISOString(), board, deck };
  return JSON.stringify(p);
}

/** Read a project file; throws with a reason the user can act on. */
export function parseStudioProject(text: string): StudioProject {
  let v: unknown;
  try { v = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.format !== STUDIO_FORMAT) throw new Error('Not a Creative Studio project.');
  if (o.version !== STUDIO_VERSION) throw new Error(`Unsupported project version: ${String(o.version)}.`);
  const b = o.board as StudioProject['board'];
  const board = b && typeof b === 'object' && typeof b.name === 'string' && b.payload && Array.isArray((b.payload as BoardPayload).layers)
    ? { name: b.name.slice(0, 120) || 'Imported board', payload: b.payload } : null;
  const d = o.deck as StudioProject['deck'];
  const deck = d && typeof d === 'object' && Array.isArray(d.slides) ? { slides: d.slides, theme: typeof d.theme === 'string' ? d.theme : null } : null;
  if (!board && !deck) throw new Error('The project has no board and no slides.');
  return { format: STUDIO_FORMAT, version: STUDIO_VERSION, savedAt: typeof o.savedAt === 'string' ? o.savedAt : '', board, deck };
}
