// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// FILE TYPE REGISTRY - Maps file extensions to capable DEX apps
// ===========================================================================

export interface FileTypeMapping {
  extensions: string[];
  mimePrefix?: string;
  defaultApp: string;
  alternateApps?: string[];
  category: 'video' | 'audio' | 'image' | 'document' | 'code' | 'archive' | '3d' | 'project' | 'other';
}

const registry: FileTypeMapping[] = [
  // Video
  {
    extensions: ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.ts', '.3gp'],
    mimePrefix: 'video/',
    defaultApp: 'videoeditor',
    alternateApps: ['gallery'],
    category: 'video',
  },
  // Audio
  {
    extensions: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus', '.aiff', '.alac'],
    mimePrefix: 'audio/',
    defaultApp: 'audio',
    alternateApps: ['imosion'],
    category: 'audio',
  },
  // Imosion project files
  {
    extensions: ['.imo', '.imosion'],
    defaultApp: 'imosion',
    category: 'project',
  },
  // Images
  {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.ico', '.avif', '.heic', '.heif'],
    mimePrefix: 'image/',
    defaultApp: 'gallery',
    alternateApps: ['prism', 'flux'],
    category: 'image',
  },
  // RAW photo formats → PRISM
  {
    extensions: ['.raw', '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.rw2', '.pef', '.raf'],
    defaultApp: 'prism',
    alternateApps: ['gallery'],
    category: 'image',
  },
  // Photoshop / layered → PRISM
  {
    extensions: ['.psd', '.psb', '.xcf', '.kra'],
    defaultApp: 'prism',
    category: 'image',
  },
  // Motion graphics / After Effects → FLUX
  {
    extensions: ['.aep', '.mogrt', '.lottie', '.json'],
    defaultApp: 'flux',
    alternateApps: ['dexcode'],
    category: 'project',
  },
  // 3D / CAD → AXL
  {
    extensions: ['.obj', '.stl', '.fbx', '.gltf', '.glb', '.step', '.stp', '.iges', '.igs', '.3ds', '.blend', '.dae'],
    defaultApp: 'axl',
    category: '3d',
  },
  // Encoding presets → FORGE
  {
    extensions: ['.ffpreset', '.enc', '.fgproj'],
    defaultApp: 'forge',
    category: 'project',
  },
  // Markdown
  {
    extensions: ['.md', '.mdx', '.markdown'],
    defaultApp: 'dexcode',
    alternateApps: ['notes'],
    category: 'document',
  },
  // Plain text / notes
  {
    extensions: ['.txt', '.rtf', '.log'],
    defaultApp: 'notes',
    alternateApps: ['dexcode'],
    category: 'document',
  },
  // Code files
  {
    extensions: ['.js', '.ts', '.tsx', '.jsx', '.py', '.rs', '.c', '.cpp', '.h', '.css', '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.sh', '.bat', '.ps1'],
    defaultApp: 'dexcode',
    category: 'code',
  },
  // Archives
  {
    extensions: ['.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz'],
    defaultApp: 'files',
    category: 'archive',
  },
  // PDF / Documents
  {
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.csv'],
    defaultApp: 'files',
    category: 'document',
  },
];

// Pre-built lookup map for O(1) extension resolution
const extMap = new Map<string, FileTypeMapping>();
for (const mapping of registry) {
  for (const ext of mapping.extensions) {
    if (!extMap.has(ext)) extMap.set(ext, mapping);
  }
}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

export function resolveApp(filename: string): { appId: string; alternates: string[]; category: FileTypeMapping['category'] } | null {
  const ext = getExtension(filename);
  if (!ext) return null;
  const mapping = extMap.get(ext);
  if (!mapping) return null;
  return {
    appId: mapping.defaultApp,
    alternates: mapping.alternateApps ?? [],
    category: mapping.category,
  };
}

export function getAppsForFile(filename: string): string[] {
  const result = resolveApp(filename);
  if (!result) return [];
  return [result.appId, ...result.alternates];
}

export function getCategoryForFile(filename: string): FileTypeMapping['category'] | null {
  const ext = getExtension(filename);
  if (!ext) return null;
  return extMap.get(ext)?.category ?? null;
}

export function getAllMappings(): readonly FileTypeMapping[] {
  return registry;
}
