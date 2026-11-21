// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Project browsing and desktop-scoped editing for DexCode.

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
  writable?: boolean;
  limited?: boolean;
  unreadable?: number;
}

export interface ProjectDocument {
  root: string;
  path: string;
  content: string;
  revision: string;
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

function comparisonPath(value: string): string {
  const plain = value.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
  return /^[A-Za-z]:|^\\\\/.test(plain) ? plain.replaceAll('\\', '/').toLowerCase() : plain;
}

export function sameProjectPath(left: string, right: string): boolean {
  return comparisonPath(left) === comparisonPath(right);
}

export function projectContains(project: DexProject, file: string): boolean {
  const root = comparisonPath(project.root);
  return comparisonPath(file).startsWith(root.endsWith('/') ? root : root + '/');
}

function publishProject(result: unknown): DexProject | null {
  if (!result || typeof result !== 'object') return null;
  const project = result as Partial<DexProject> & { success?: boolean; canceled?: boolean; error?: string };
  if (project.success === false) throw new Error(project.error || 'The project could not be opened.');
  if (!project.root || project.canceled || !Array.isArray(project.files)) return null;
  try { localStorage.setItem(PROJECT_KEY, project.root); } catch { /* Storage may be unavailable. */ }
  return {
    root: project.root,
    files: project.files,
    writable: project.writable,
    limited: project.limited,
    unreadable: project.unreadable,
  };
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

/** Read a folder's source files without granting write access. */
export async function loadProject(root: string): Promise<DexProject | null> {
  const dex = bridge();
  if (!dex) return null;
  const native = await dex.invoke('codeProject:list', { root });
  if (native != null) return publishProject(native);
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

export async function restoreProject(): Promise<DexProject | null> {
  const result = await bridge()?.invoke('codeProject:restore');
  // Old saved paths can still be browsed. Only the native record grants editing.
  const root = getStoredProjectRoot();
  const restored = result?.success === false && root ? null : publishProject(result);
  return restored ?? (root ? await loadProject(root) : null);
}

/** Prompt for a folder and load it as the active project. */
export async function pickProjectFolder(): Promise<DexProject | null> {
  const dex = bridge();
  if (!dex) return null;
  const native = await dex.invoke('codeProject:choose');
  if (native != null) return publishProject(native);
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

export async function closeProjectFolder(project: DexProject): Promise<void> {
  const result = await bridge()?.invoke('codeProject:close', { root: project.root });
  if (result?.success === false || project.writable && !result?.success) {
    throw new Error(result?.error || 'The project could not be closed.');
  }
  clearStoredProject();
}

export async function openProjectDocument(project: DexProject, path: string): Promise<ProjectDocument> {
  const result = await bridge()?.invoke('codeProject:openFile', { root: project.root, path });
  const document = result?.document;
  if (!result?.success || typeof document?.path !== 'string' ||
    typeof document?.content !== 'string' || typeof document?.revision !== 'string') {
    throw new Error(result?.error || 'The project file could not be opened.');
  }
  return { root: project.root, ...document };
}

export async function saveProjectDocument(document: Omit<ProjectDocument, 'content'>, content: string): Promise<string> {
  const result = await bridge()?.invoke('codeProject:saveFile', { ...document, content });
  if (!result?.success || typeof result.revision !== 'string') {
    throw new Error(result?.error || 'The project file could not be saved.');
  }
  return result.revision;
}

export async function readProjectFile(path: string): Promise<string | null> {
  const dex = bridge();
  if (!dex) return null;
  try {
    const content = await dex.invoke('fs:read-file', path);
    return typeof content === 'string' ? content : null;
  } catch { return null; }
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
export async function buildSymbolIndex(project: DexProject, maxFiles = 200, signal?: AbortSignal): Promise<Map<string, ProjectSymbol[]>> {
  const index = new Map<string, ProjectSymbol[]>();
  for (const file of project.files.slice(0, maxFiles)) {
    if (signal?.aborted) break;
    const content = await readProjectFile(file.path);
    if (signal?.aborted) break;
    if (!content) continue;
    for (const sym of extractSymbols(content)) {
      const arr = index.get(sym.name);
      if (arr) arr.push({ ...sym, file });
      else index.set(sym.name, [{ ...sym, file }]);
    }
  }
  return index;
}

export async function searchProject(project: DexProject, query: string, maxHits = 200, signal?: AbortSignal): Promise<WorkspaceHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: WorkspaceHit[] = [];
  for (const f of project.files) {
    if (signal?.aborted || hits.length >= maxHits) break;
    const content = await readProjectFile(f.path);
    if (signal?.aborted) break;
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

let searchTicket = Date.now() * 1024;

export async function searchWorkspaceFiles(project: DexProject, query: string, signal: AbortSignal): Promise<{
  hits: WorkspaceHit[]; limited?: boolean; skipped?: number;
}> {
  if (typeof project.writable !== 'boolean') {
    return { hits: await searchProject(project, query, 200, signal) };
  }
  const dex = bridge();
  if (!dex || signal.aborted) return { hits: [] };
  const ticket = ++searchTicket;
  const cancel = () => { void dex.invoke('codeProject:cancelSearch', { ticket }).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await dex.invoke('codeProject:search', { root: project.root, query, ticket });
    if (signal.aborted) return { hits: [] };
    if (!result?.success || !Array.isArray(result.hits)) {
      throw new Error(result?.error || 'Project search failed.');
    }
    return { hits: result.hits, limited: result.limited, skipped: result.skipped };
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
