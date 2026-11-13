// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// File-system bridge for DexCode (open / save / recent files).

import { pickOpenPath, pickSavePath, readTextFile, writeTextFile } from '../../../services/nativeFiles';

const RECENT_FILES_KEY = 'dex-code-recent-files-v1';
const MAX_RECENT_FILES = 10;

export function getRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentFile(filePath: string): void {
  try {
    const recent = getRecentFiles().filter((f) => f !== filePath);
    recent.unshift(filePath);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_FILES)));
  } catch { /* ignore */ }
}

export function removeRecentFile(filePath: string): string[] {
  try {
    const updated = getRecentFiles().filter((f) => f !== filePath);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export async function openFileDialog(): Promise<{ path: string; content: string } | null> {
  const filePath = await pickOpenPath([
    { name: 'DexScript', extensions: ['dex'] },
    { name: 'JavaScript', extensions: ['js'] },
    { name: 'TypeScript', extensions: ['ts'] },
    { name: 'All Files', extensions: ['*'] },
  ]);
  if (!filePath) return null;
  return { path: filePath, content: await readTextFile(filePath) };
}

/** Returns the saved path, null on cancel; throws with the reason when writing fails. */
export async function saveFileDialog(content: string, defaultPath?: string): Promise<string | null> {
  const filePath = await pickSavePath(defaultPath || 'untitled.dex', [
    { name: 'DexScript', extensions: ['dex'] },
    { name: 'JavaScript', extensions: ['js'] },
    { name: 'All Files', extensions: ['*'] },
  ]);
  if (!filePath) return null;
  await writeTextFile(filePath, content);
  return filePath;
}

/** True only when the file was really written. */
export async function saveFile(filePath: string, content: string): Promise<boolean> {
  try {
    await writeTextFile(filePath, content);
    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    return false;
  }
}

export { readTextFile };
