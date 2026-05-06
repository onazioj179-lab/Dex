// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// File-system bridge for DexCode (open / save / recent files).

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
  try {
    const result = await window.dex?.invoke('dialog:open-file', {
      filters: [
        { name: 'DexScript', extensions: ['dex'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (!result || result.canceled) return null;
    const filePath = result.filePaths[0];
    const content = await window.dex?.invoke('fs:read-file', filePath);
    return { path: filePath, content };
  } catch (err) {
    console.error('Failed to open file:', err);
    return null;
  }
}

export async function saveFileDialog(content: string, defaultPath?: string): Promise<string | null> {
  try {
    const result = await window.dex?.invoke('dialog:save-file', {
      defaultPath: defaultPath || 'untitled.dex',
      filters: [
        { name: 'DexScript', extensions: ['dex'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!result || result.canceled) return null;
    const filePath = result.filePath;
    await window.dex?.invoke('fs:write-file', filePath, content);
    return filePath;
  } catch (err) {
    console.error('Failed to save file:', err);
    return null;
  }
}

export async function saveFile(filePath: string, content: string): Promise<boolean> {
  try {
    await window.dex?.invoke('fs:write-file', filePath, content);
    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    return false;
  }
}
