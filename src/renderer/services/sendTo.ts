// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Cross-app "Send to ..." sink. Any small app (Calculator, Color Picker, Unit
 * Converter, Terminal output, ...) can hand a piece of text to Notes or the
 * clipboard through one place, so the behaviour + toast are identical everywhere.
 *
 * Previously the `uki:create-note` event was dispatched by slash-commands but
 * NOTHING consumed it (the note was never created). `installSendToBridge()` wires
 * a global listener so that event -- and the new `dex-send-to-notes` -- actually
 * create a note, regardless of whether the Notes UI is mounted.
 */

import { useNotesStore } from '../store/notesStore';

/** Build a minimal ProseMirror-style doc JSON from plain text (one para/line). */
function textToDoc(text: string): string {
  const lines = (text || '').split('\n');
  const paras = lines.map(line =>
    line
      ? `{"type":"paragraph","content":[{"type":"text","text":${JSON.stringify(line)}}]}`
      : '{"type":"paragraph","content":[]}',
  ).join(',');
  return `{"type":"doc","content":[${paras || '{"type":"paragraph","content":[]}'}]}`;
}

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

/**
 * Create a Notes note from arbitrary text and open Notes on it. Works even when
 * the Notes app is not currently mounted (drives the store directly).
 */
export async function sendToNotes(text: string, title?: string): Promise<void> {
  const trimmed = (text || '').trim();
  if (!trimmed) return;
  const noteTitle = (title || trimmed.split('\n')[0] || 'Note').slice(0, 80);
  try {
    const store = useNotesStore.getState();
    const id = await store.createNote();
    if (id) {
      await store.updateNote(id, { title: noteTitle, content: textToDoc(trimmed), plain_text: trimmed });
      await store.loadNote(id);
    }
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: 'notes' } }));
    toast('success', 'Sent to Notes');
  } catch {
    toast('error', 'Could not send to Notes');
  }
}

/** Copy text to the clipboard with a standard confirmation toast. */
export async function copyToClipboard(text: string, label = 'Copied'): Promise<void> {
  try {
    await navigator.clipboard?.writeText(text);
    toast('success', label);
  } catch {
    toast('error', 'Could not copy');
  }
}

let bridgeInstalled = false;
/**
 * Install the global send-to-Notes bridge once. Consumes `uki:create-note`
 * (previously dead) and `dex-send-to-notes` ({ text, title }).
 */
export function installSendToBridge(): void {
  if (bridgeInstalled || typeof window === 'undefined') return;
  bridgeInstalled = true;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ text?: string; title?: string }>).detail || {};
    if (detail.text) void sendToNotes(detail.text, detail.title);
  };
  window.addEventListener('uki:create-note', handler as EventListener);
  window.addEventListener('dex-send-to-notes', handler as EventListener);
}
