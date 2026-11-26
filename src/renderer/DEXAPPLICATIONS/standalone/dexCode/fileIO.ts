// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// File-system bridge for DexCode (open / save / recent files).

const RECENT_FILES_KEY = 'dex-code-recent-files-v1';
const MAX_RECENT_FILES = 10;

export function getRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string' && path.length > 0).slice(0, MAX_RECENT_FILES) : [];
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
    if (result.success === false) throw new Error(result.error || 'File dialog failed');
    const filePath = result.filePaths?.[0];
    if (typeof filePath !== 'string' || !filePath) throw new Error('No file was selected');
    const content = await window.dex?.invoke('fs:read-file', filePath);
    if (typeof content !== 'string') throw new Error(content?.error || 'The file could not be read');
    return { path: filePath, content };
  } catch (err) {
    console.error('Failed to open file:', err);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: err instanceof Error ? err.message : 'File open failed' } }));
    return null;
  }
}

export async function saveFileDialog(
  content: string,
  defaultPath?: string,
  canWrite?: (path: string) => boolean,
): Promise<string | null> {
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
    if (typeof filePath !== 'string' || !filePath) throw new Error('No save destination was selected');
    if (canWrite && !canWrite(filePath)) return null;
    return await saveFile(filePath, content) ? filePath : null;
  } catch (err) {
    console.error('Failed to save file:', err);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: err instanceof Error ? err.message : 'File save failed' } }));
    return null;
  }
}

export async function saveFile(filePath: string, content: string): Promise<boolean> {
  try {
    if (typeof window.dex?.invoke !== 'function') throw new Error('Native file access is unavailable');
    const result = await window.dex.invoke('fs:write-file', filePath, content);
    if (result !== true && result?.success !== true) throw new Error(result?.error || 'The file was not saved');
    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: err instanceof Error ? err.message : 'File save failed' } }));
    return false;
  }
}
