// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * File-type categorization (Files smart collections, AssetLibrary kinds, search
 * filters). Maps an extension/filename to a coarse category and a DexIcon hint.
 * Pure: no DOM, no IO.
 */

export type FileCategory =
  | 'image' | 'video' | 'audio' | 'document'
  | 'code' | 'archive' | 'font' | 'data' | 'other';

const EXT_CATEGORY: Record<string, FileCategory> = {};
const register = (cat: FileCategory, exts: string[]) => exts.forEach((e) => { EXT_CATEGORY[e] = cat; });

register('image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico', 'heic', 'avif']);
register('video', ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg']);
register('audio', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'aiff', 'aif', 'opus', 'wma']);
register('document', ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages', 'key', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'epub']);
register('code', ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'c', 'cpp', 'h', 'hpp', 'java', 'go', 'rb', 'php', 'html', 'css', 'json', 'yml', 'yaml', 'sh', 'sql']);
register('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso']);
register('font', ['ttf', 'otf', 'woff', 'woff2', 'eot']);
register('data', ['db', 'sqlite', 'log', 'bin', 'dat']);

const CATEGORY_ICON: Record<FileCategory, string> = {
  image: 'gallery', video: 'videoeditor', audio: 'audio', document: 'file',
  code: 'dexcode', archive: 'archive', font: 'text', data: 'files', other: 'file',
};

/** Lowercase extension without the dot, or '' if none. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Coarse category for a filename or bare extension. */
export function categorize(filenameOrExt: string): FileCategory {
  const ext = filenameOrExt.includes('.') || /[\\/]/.test(filenameOrExt)
    ? extensionOf(filenameOrExt)
    : filenameOrExt.toLowerCase().replace(/^\./, '');
  return EXT_CATEGORY[ext] ?? 'other';
}

/** DexIcon hint for a file. */
export function iconHintForFile(filename: string): string {
  return CATEGORY_ICON[categorize(filename)];
}

/** True when the file is a given category (convenience). */
export function isCategory(filename: string, category: FileCategory): boolean {
  return categorize(filename) === category;
}
