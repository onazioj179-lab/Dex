// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// UKI Blueprint Generator (Track A2: "Uki Axl Dex")
// ---------------------------------------------------------------------------
// Translates a natural-language request into a structured project blueprint
// (tree of files + scaffold contents + initial parameters) that downstream
// consumers (renderer wizards, AXL CAD, Imosion, VINX, Prism, generic code
// scaffolders) can render or commit to disk.
//
// Pure data: no filesystem writes, no IPC. Easy to unit-test, easy to wire
// into a controller / IPC handler.
// ===========================================================================

export type BlueprintKind =
  | 'web-app'
  | 'cad-part'
  | 'music-track'
  | 'video-storyboard'
  | 'image-series'
  | 'code-project'
  | 'design-system';

export interface BlueprintFile {
  /** Path relative to blueprint root, forward slashes. */
  path: string;
  /** Plain text contents. Binary blobs are out of scope for a blueprint. */
  contents: string;
  /** Free-form per-file metadata. */
  metadata?: Record<string, unknown>;
}

export interface BlueprintParameter {
  key: string;
  label: string;
  value: string | number | boolean;
  /** When true the renderer should expose this in the tweak UI. */
  tweakable: boolean;
}

export interface Blueprint {
  /** Stable id usable for follow-up tweak/apply calls. */
  id: string;
  kind: BlueprintKind;
  title: string;
  description: string;
  files: BlueprintFile[];
  parameters: BlueprintParameter[];
  createdAt: number;
  /** Echo of the original NL request for traceability. */
  prompt: string;
}

export interface GenerateOptions {
  /** Override `Date.now()` in tests. */
  now?: () => number;
  /** Override id generation in tests. */
  idFn?: () => string;
  /** When provided, overrides the auto-detected kind. */
  kind?: BlueprintKind;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectBlueprintKind(prompt: string): BlueprintKind {
  const p = prompt.toLowerCase();
  if (/\b(web|landing|site|page|html|css|react|vue)\b/.test(p)) return 'web-app';
  if (/\b(cad|axl|part|bracket|mount|stl|step|gear|enclosure)\b/.test(p)) return 'cad-part';
  if (/\b(song|track|chord progression|music|melody|imosion|midi)\b/.test(p)) return 'music-track';
  if (/\b(video|storyboard|edit|cut|scene|vinx)\b/.test(p)) return 'video-storyboard';
  if (/\b(image|photo|illustration|prism|series|gallery)\b/.test(p)) return 'image-series';
  if (/\b(design system|tokens|theme|palette)\b/.test(p)) return 'design-system';
  return 'code-project';
}

export function generateBlueprint(prompt: string, options: GenerateOptions = {}): Blueprint {
  const trimmed = (prompt || '').trim();
  if (!trimmed) {
    throw new Error('Blueprint prompt cannot be empty');
  }
  const now = options.now ? options.now() : Date.now();
  const id = options.idFn ? options.idFn() : `bp-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const kind = options.kind ?? detectBlueprintKind(trimmed);
  const title = derivedTitle(trimmed, kind);
  const builder = BUILDERS[kind];
  const { files, parameters, description } = builder(trimmed, title);

  return {
    id,
    kind,
    title,
    description,
    files,
    parameters,
    createdAt: now,
    prompt: trimmed,
  };
}

export interface TweakRequest {
  /** Parameter key to update. Must match an existing parameter. */
  key: string;
  value: string | number | boolean;
}

/**
 * Apply a parameter change. Returns a new blueprint with the parameter and
 * any affected file contents updated. Throws if the key is unknown or not
 * tweakable.
 */
export function tweakBlueprint(blueprint: Blueprint, change: TweakRequest): Blueprint {
  const param = blueprint.parameters.find(p => p.key === change.key);
  if (!param) throw new Error(`Unknown parameter "${change.key}"`);
  if (!param.tweakable) throw new Error(`Parameter "${change.key}" is not tweakable`);
  if (typeof param.value !== typeof change.value) {
    throw new Error(`Type mismatch for "${change.key}"`);
  }

  const nextParams = blueprint.parameters.map(p =>
    p.key === change.key ? { ...p, value: change.value } : p,
  );
  const nextFiles = applyParameterToFiles(blueprint.files, change.key, change.value);
  return { ...blueprint, parameters: nextParams, files: nextFiles };
}

// ---------------------------------------------------------------------------
// Builders -- one per BlueprintKind
// ---------------------------------------------------------------------------

interface BuilderResult {
  files: BlueprintFile[];
  parameters: BlueprintParameter[];
  description: string;
}

const BUILDERS: Record<BlueprintKind, (prompt: string, title: string) => BuilderResult> = {
  'web-app': buildWebApp,
  'cad-part': buildCadPart,
  'music-track': buildMusicTrack,
  'video-storyboard': buildVideoStoryboard,
  'image-series': buildImageSeries,
  'code-project': buildCodeProject,
  'design-system': buildDesignSystem,
};

function buildWebApp(_prompt: string, title: string): BuilderResult {
  const themeColor = '#0a84ff';
  return {
    description: `Single-page web application titled "${title}".`,
    parameters: [
      { key: 'title', label: 'Title', value: title, tweakable: true },
      { key: 'themeColor', label: 'Theme color', value: themeColor, tweakable: true },
    ],
    files: [
      {
        path: 'index.html',
        contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="${themeColor}" />
    <link rel="stylesheet" href="main.css" />
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>Generated by UKI.</p>
    </main>
    <script src="main.js"></script>
  </body>
</html>
`,
      },
      {
        path: 'main.css',
        contents: `:root { --accent: ${themeColor}; }
body { margin: 0; font-family: system-ui, sans-serif; }
main { padding: 2rem; max-width: 720px; margin: 0 auto; color: #111; }
h1 { color: var(--accent); }
`,
      },
      {
        path: 'main.js',
        contents: `console.log("${title} ready");\n`,
      },
    ],
  };
}

function buildCadPart(prompt: string, title: string): BuilderResult {
  return {
    description: `Parametric CAD part stub for "${title}".`,
    parameters: [
      { key: 'name', label: 'Part name', value: title, tweakable: true },
      { key: 'lengthMm', label: 'Length (mm)', value: 100, tweakable: true },
      { key: 'widthMm', label: 'Width (mm)', value: 50, tweakable: true },
      { key: 'heightMm', label: 'Height (mm)', value: 10, tweakable: true },
      { key: 'material', label: 'Material', value: 'PLA', tweakable: true },
    ],
    files: [
      {
        path: `${slug(title)}.axl.json`,
        contents: JSON.stringify({
          name: title,
          prompt,
          dimensions: { lengthMm: 100, widthMm: 50, heightMm: 10 },
          material: 'PLA',
          features: [],
        }, null, 2),
      },
      {
        path: 'README.md',
        contents: `# ${title}\n\nGenerated AXL part. Edit \`${slug(title)}.axl.json\` to adjust dimensions.\n`,
      },
    ],
  };
}

function buildMusicTrack(prompt: string, title: string): BuilderResult {
  const progression = ['C', 'Am', 'F', 'G'];
  return {
    description: `Imosion song scaffold for "${title}".`,
    parameters: [
      { key: 'tempoBpm', label: 'Tempo (BPM)', value: 120, tweakable: true },
      { key: 'key', label: 'Key', value: 'C major', tweakable: true },
      { key: 'timeSignature', label: 'Time signature', value: '4/4', tweakable: true },
      { key: 'progression', label: 'Chord progression', value: progression.join(' '), tweakable: true },
    ],
    files: [
      {
        path: 'song.imosion.json',
        contents: JSON.stringify({
          title,
          prompt,
          tempoBpm: 120,
          key: 'C major',
          timeSignature: '4/4',
          structure: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
          progression,
          tracks: [
            { name: 'Lead Vocal', kind: 'audio' },
            { name: 'Piano', kind: 'midi' },
            { name: 'Drums', kind: 'midi' },
            { name: 'Bass', kind: 'midi' },
          ],
        }, null, 2),
      },
    ],
  };
}

function buildVideoStoryboard(_prompt: string, title: string): BuilderResult {
  return {
    description: `VINX storyboard scaffold for "${title}".`,
    parameters: [
      { key: 'durationSec', label: 'Total duration (s)', value: 60, tweakable: true },
      { key: 'aspect', label: 'Aspect ratio', value: '16:9', tweakable: true },
    ],
    files: [
      {
        path: 'storyboard.vinx.json',
        contents: JSON.stringify({
          title,
          aspect: '16:9',
          scenes: [
            { id: 'scene-1', name: 'Opening', durationSec: 5, notes: 'Title card' },
            { id: 'scene-2', name: 'Main', durationSec: 45, notes: 'Body of the piece' },
            { id: 'scene-3', name: 'Closing', durationSec: 10, notes: 'Outro / credits' },
          ],
        }, null, 2),
      },
    ],
  };
}

function buildImageSeries(_prompt: string, title: string): BuilderResult {
  return {
    description: `Prism image series presets for "${title}".`,
    parameters: [
      { key: 'count', label: 'Number of images', value: 4, tweakable: true },
      { key: 'style', label: 'Style', value: 'cinematic', tweakable: true },
    ],
    files: [
      {
        path: 'series.prism.json',
        contents: JSON.stringify({
          title,
          style: 'cinematic',
          images: [
            { id: 'img-1', preset: 'cinematic-warm' },
            { id: 'img-2', preset: 'cinematic-cool' },
            { id: 'img-3', preset: 'cinematic-mono' },
            { id: 'img-4', preset: 'cinematic-warm' },
          ],
        }, null, 2),
      },
    ],
  };
}

function buildCodeProject(_prompt: string, title: string): BuilderResult {
  const slugged = slug(title);
  return {
    description: `TypeScript project scaffold "${title}".`,
    parameters: [
      { key: 'name', label: 'Package name', value: slugged, tweakable: true },
      { key: 'version', label: 'Version', value: '0.1.0', tweakable: true },
    ],
    files: [
      {
        path: 'package.json',
        contents: JSON.stringify({
          name: slugged,
          version: '0.1.0',
          description: title,
          main: 'src/index.ts',
          scripts: { build: 'tsc', test: 'vitest' },
          devDependencies: { typescript: '^5', vitest: '^1' },
        }, null, 2),
      },
      {
        path: 'tsconfig.json',
        contents: JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            moduleResolution: 'bundler',
            strict: true,
            outDir: 'dist',
          },
          include: ['src'],
        }, null, 2),
      },
      {
        path: 'src/index.ts',
        contents: `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n`,
      },
      {
        path: 'README.md',
        contents: `# ${title}\n\nGenerated by UKI.\n`,
      },
    ],
  };
}

function buildDesignSystem(_prompt: string, title: string): BuilderResult {
  return {
    description: `Design token starter for "${title}".`,
    parameters: [
      { key: 'accent', label: 'Accent color', value: '#0a84ff', tweakable: true },
      { key: 'radius', label: 'Base radius (px)', value: 8, tweakable: true },
    ],
    files: [
      {
        path: 'tokens.json',
        contents: JSON.stringify({
          name: title,
          color: { accent: '#0a84ff', bg: '#0d0f12', fg: '#e6e8eb' },
          radius: { sm: 4, md: 8, lg: 16 },
          spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
          font: { sans: 'system-ui, sans-serif', mono: 'ui-monospace, monospace' },
        }, null, 2),
      },
      {
        path: 'tokens.css',
        contents: `:root {\n  --accent: #0a84ff;\n  --radius-md: 8px;\n}\n`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function derivedTitle(prompt: string, kind: BlueprintKind): string {
  // Strip leading verbs.
  const cleaned = prompt
    .replace(/^(make|create|build|generate|scaffold|design)\s+(me\s+)?(an?\s+|the\s+)?/i, '')
    .trim();
  if (cleaned.length === 0) return defaultTitleFor(kind);
  // Take first 8 words, capitalize.
  const words = cleaned.split(/\s+/).slice(0, 8);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function defaultTitleFor(kind: BlueprintKind): string {
  switch (kind) {
    case 'web-app': return 'New Web App';
    case 'cad-part': return 'New CAD Part';
    case 'music-track': return 'New Track';
    case 'video-storyboard': return 'New Storyboard';
    case 'image-series': return 'New Image Series';
    case 'design-system': return 'New Design System';
    default: return 'New Project';
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled';
}

function applyParameterToFiles(
  files: BlueprintFile[],
  key: string,
  value: string | number | boolean,
): BlueprintFile[] {
  // Conservative parameter substitution: only rewrite JSON files when the key
  // exists at the top level. Treat the value verbatim. Keeps behavior
  // predictable for downstream consumers.
  return files.map(f => {
    if (!f.path.endsWith('.json')) return f;
    let parsed: unknown;
    try { parsed = JSON.parse(f.contents); } catch { return f; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return f;
    const obj = parsed as Record<string, unknown>;
    if (!(key in obj)) return f;
    obj[key] = value;
    return { ...f, contents: JSON.stringify(obj, null, 2) };
  });
}
