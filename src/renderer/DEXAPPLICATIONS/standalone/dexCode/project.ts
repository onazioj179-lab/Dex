// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Project awareness for DexCode: open a folder, list its source files, read
// them, and search across them. Uses the same IPC bridge as fileIO (proven in
// Forge's folder import): `dialog:showOpenDialog` + `fs:readdir` + `fs:readText`.
//
// `fs:readdir` returns a flat list of entry NAMES (no stat/type), so this lists
// the folder's top level and keeps only entries that look like source files. It
// does not fake a recursive tree it cannot reliably build.

import { extractSymbols, type CodeSymbol } from './symbols';

const PROJECT_KEY = 'dex-code-project-v1';

const SOURCE_EXT = /\.(dex|js|jsx|mjs|cjs|ts|tsx|json|md|txt|css|scss|html|xml|py|rs|go|java|kt|c|h|cpp|hpp|cs|rb|php|sh|bash|zsh|sql|yml|yaml|toml|ini|env)$/i;

export interface ProjectFile {
  name: string;
  path: string;
}

export interface DexProject {
  root: string;
  files: ProjectFile[];
}

export interface WorkspaceHit {
  path: string;
  name: string;
  line: number;
  text: string;
}

function bridge(): { invoke: (channel: string, ...args: unknown[]) => Promise<any> } | null {
  const dex = (typeof window !== 'undefined' ? (window as any).dex : null) || null;
  return dex && typeof dex.invoke === 'function' ? dex : null;
}

/** Join a folder root and an entry name using the root's own path separator. */
function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.endsWith('\\') || root.endsWith('/') ? root + name : root + sep + name;
}

/** Short display name for the project root (last path segment). */
export function projectName(root: string): string {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || root;
}

export function getStoredProjectRoot(): string | null {
  try { return localStorage.getItem(PROJECT_KEY); } catch { return null; }
}

export function clearStoredProject(): void {
  try { localStorage.removeItem(PROJECT_KEY); } catch { /* ignore */ }
}

/** Read a folder's top-level source files into a project model. */
export async function loadProject(root: string): Promise<DexProject | null> {
  const dex = bridge();
  if (!dex) return null;
  try {
    const names: string[] = (await dex.invoke('fs:readdir', root)) || [];
    const files = names
      .filter(n => SOURCE_EXT.test(n))
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ name, path: joinPath(root, name) }));
    try { localStorage.setItem(PROJECT_KEY, root); } catch { /* ignore */ }
    return { root, files };
  } catch (err) {
    console.warn('[DexCode] loadProject failed', err);
    return null;
  }
}

/** Prompt for a folder and load it as the active project. */
export async function pickProjectFolder(): Promise<DexProject | null> {
  const dex = bridge();
  if (!dex) return null;
  try {
    const result = await dex.invoke('dialog:showOpenDialog', {
      properties: ['openDirectory'],
      title: 'Open Project Folder',
    });
    if (!result || result.canceled || !result.filePaths?.length) return null;
    return loadProject(result.filePaths[0]);
  } catch (err) {
    console.warn('[DexCode] pickProjectFolder failed', err);
    return null;
  }
}

export async function readProjectFile(path: string): Promise<string | null> {
  const dex = bridge();
  if (!dex) return null;
  try { const r = await dex.invoke('fs:readText', path); return r?.ok ? String(r.content) : null; } catch { return null; }
}

/**
 * Grep the project's files for a query (case-insensitive substring), returning
 * file:line hits. Bounded by maxHits so a large project can't stall the UI.
 */
export interface ProjectSymbol extends CodeSymbol {
  file: ProjectFile;
}

/**
 * Index every project file's top-level symbols (functions/classes/vars) by name,
 * so "go to definition" can jump across files. Bounded by maxFiles.
 */
export async function buildSymbolIndex(project: DexProject, maxFiles = 200): Promise<Map<string, ProjectSymbol[]>> {
  const index = new Map<string, ProjectSymbol[]>();
  for (const file of project.files.slice(0, maxFiles)) {
    const content = await readProjectFile(file.path);
    if (!content) continue;
    for (const sym of extractSymbols(content)) {
      const arr = index.get(sym.name);
      if (arr) arr.push({ ...sym, file });
      else index.set(sym.name, [{ ...sym, file }]);
    }
  }
  return index;
}

export async function searchProject(project: DexProject, query: string, maxHits = 200): Promise<WorkspaceHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: WorkspaceHit[] = [];
  for (const f of project.files) {
    if (hits.length >= maxHits) break;
    const content = await readProjectFile(f.path);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        hits.push({ path: f.path, name: f.name, line: i + 1, text: lines[i].trim().slice(0, 200) });
        if (hits.length >= maxHits) break;
      }
    }
  }
  return hits;
}
