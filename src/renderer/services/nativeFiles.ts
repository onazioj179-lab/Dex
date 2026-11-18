// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Text files through the native bridge, with honest results. Every call either
 * returns real data or throws with the reason; nothing reports success it did
 * not get. Channels: dialog:showOpenDialog, dialog:showSaveDialog,
 * fs:readText, fs:writeText (src-tauri/src/native_ops.rs).
 */

type Bridge = { invoke: (channel: string, ...args: unknown[]) => Promise<any> };

/** Looked up per call: window.dex isn't ready at module load in the packaged app. */
function bridge(): Bridge | null {
  const d = (globalThis as { dex?: Bridge }).dex;
  return d && typeof d.invoke === 'function' ? d : null;
}

export function hasNativeFiles(): boolean {
  return bridge() !== null;
}

export interface FileFilter { name: string; extensions: string[] }

function need(): Bridge {
  const b = bridge();
  if (!b) throw new Error('Files on disk need the DEX desktop app.');
  return b;
}

/** Ask for one file to open. Null when the user cancels. */
export async function pickOpenPath(filters?: FileFilter[], defaultPath?: string): Promise<string | null> {
  const r = await need().invoke('dialog:showOpenDialog', { filters, defaultPath, properties: ['openFile'] });
  return r && !r.canceled && Array.isArray(r.filePaths) && r.filePaths[0] ? String(r.filePaths[0]) : null;
}

/** Pick a folder. Null when the user cancels. */
export async function pickFolder(title?: string, defaultPath?: string): Promise<string | null> {
  const r = await need().invoke('dialog:showOpenDialog', { title, defaultPath, properties: ['openDirectory'] });
  return r && !r.canceled && Array.isArray(r.filePaths) && r.filePaths[0] ? String(r.filePaths[0]) : null;
}

/** Ask where to save. Null when the user cancels. */
export async function pickSavePath(defaultPath?: string, filters?: FileFilter[], title?: string): Promise<string | null> {
  const r = await need().invoke('dialog:showSaveDialog', { defaultPath, filters, title });
  return r && !r.canceled && r.filePath ? String(r.filePath) : null;
}

export async function readTextFile(path: string): Promise<string> {
  const r = await need().invoke('fs:readText', path);
  if (!r?.ok) throw new Error(r?.error || `Could not read ${path}.`);
  return String(r.content);
}

/** Atomic write (temp file + rename on the native side). Throws on failure. */
export async function writeTextFile(path: string, content: string): Promise<void> {
  const r = await need().invoke('fs:writeText', path, content);
  if (!r?.ok) throw new Error(r?.error || `Could not write ${path}.`);
}
