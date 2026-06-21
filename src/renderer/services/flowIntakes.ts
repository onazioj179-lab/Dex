// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Flow -- Built-in rich intakes
 * -----------------------------------------------------------------------------
 * Registers RICH receivers for DEX Flow so "Send to <app>" does something real
 * instead of the copy-and-paste fallback. Kept separate from FlowTransfer.ts so
 * the transfer core stays free of store/IPC imports.
 *
 * Each intake returns true only when it genuinely handled the payload; on a
 * falsey return (or a throw) DEX Flow degrades to the universal fallback. That
 * matters for the headless/web preview where the dex.db IPC backend is absent:
 * `createNote` returns null, the intake returns false, and the user still gets
 * "copy + open Notes + paste".
 */

import { registerFlowIntake, type FlowPayload } from './FlowTransfer';
import { useNotesStore } from '../store/notesStore';
import { useCreativeSuite, createAssetId } from './CreativeSuiteBridge';

/** Creative image editors that already consume the CreativeSuiteBridge inbox. */
const CREATIVE_IMAGE_APPS = ['prism', 'flux', 'forge', 'axl'] as const;

/** Convert plain text into the TipTap doc JSON the Notes store expects, one
 *  paragraph per line. */
function textToTiptapDoc(text: string): string {
  const lines = text.split('\n');
  const content = lines.map((line) =>
    line
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph', content: [] as unknown[] },
  );
  return JSON.stringify({
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  });
}

let wired = false;

/** Register DEX Flow's built-in rich intakes. Idempotent. */
export function wireFlowIntakes(): void {
  if (wired) return;
  wired = true;

  // Notes: create a real note from text (title = first line). Uses the Notes
  // app's own store, so the new note is exactly what the app shows. Images fall
  // through to the universal handler (open Notes + paste the image).
  registerFlowIntake('notes', async (payload: FlowPayload) => {
    if (payload.kind === 'image') return false;
    const ns = useNotesStore.getState();
    const id = await ns.createNote();
    if (!id) return false; // IPC unavailable -> universal fallback
    const text = payload.content;
    const title = (text.split('\n')[0] || 'Note').trim().slice(0, 80) || 'Note';
    await ns.updateNote(id, { title, content: textToTiptapDoc(text), plain_text: text });
    return true;
  });

  // Creative image editors: hand an image clip straight to the app's existing
  // CreativeSuiteBridge inbox (which they already consume on mount), so "Send
  // image to Prism" lands as a real import rather than a manual paste.
  for (const app of CREATIVE_IMAGE_APPS) {
    registerFlowIntake(app, async (payload: FlowPayload) => {
      if (payload.kind !== 'image') return false;
      return useCreativeSuite.getState().sendToApp({
        id: createAssetId(),
        kind: 'image',
        name: payload.label || 'Clipboard image',
        sourceApp: 'files',
        data: payload.content,
        mimeType: 'image/png',
        createdAt: Date.now(),
      }, app);
    });
  }
}
