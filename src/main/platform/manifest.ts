// =============================================================================
// DEX Platform — App Manifest spec + validator
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// The ONLY thing the platform core knows about an installable app. Generic by
// design: future apps install with zero changes to DEX core. Validation is pure
// (no I/O) so it can run anywhere — install flow, tests, or a publisher CLI.

export interface AppManifest {
  id: string;            // stable namespaced id, e.g. "dex.app.magnify"
  name: string;
  version: string;
  publisher: string;
  entry: string;         // bundle-relative entry DEX mounts (e.g. "ui/dist/index.html")
  icon: string;          // bundle-relative icon path
  capabilities: string[]; // declared, never assumed
}

// Capabilities an app may declare. Anything outside this set is rejected so a
// typo or a rogue manifest can't smuggle in undefined access.
export const KNOWN_CAPABILITIES = [
  'fs.read', 'fs.write', 'fs.copy', 'fs.list', 'fs.pick',
  'system.scan', 'system.info',
] as const;
export type Capability = (typeof KNOWN_CAPABILITIES)[number];

// Namespaced, lowercase, dot-separated — and crucially no path separators, so an
// id can be safely used as a directory name under the apps dir.
const ID_RE = /^[a-z0-9]+(?:\.[a-z0-9-]+)+$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  manifest?: AppManifest;
}

export function validateManifest(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  const m = input as Record<string, unknown>;

  for (const k of ['id', 'name', 'version', 'publisher', 'entry', 'icon']) {
    if (typeof m[k] !== 'string' || !(m[k] as string).trim()) {
      errors.push(`${k} must be a non-empty string`);
    }
  }
  if (typeof m.id === 'string' && !ID_RE.test(m.id)) {
    errors.push('id must be a namespaced lowercase string like "dex.app.name" (no path separators)');
  }

  // entry / icon must be bundle-relative — no absolute paths, drive letters or traversal.
  for (const k of ['entry', 'icon']) {
    const v = m[k];
    if (typeof v === 'string' && (v.startsWith('/') || v.startsWith('\\') || v.includes('..') || /^[a-zA-Z]:[\\/]/.test(v))) {
      errors.push(`${k} must be a relative path inside the bundle`);
    }
  }

  if (!Array.isArray(m.capabilities) || !m.capabilities.every((c) => typeof c === 'string')) {
    errors.push('capabilities must be an array of strings');
  } else {
    const unknown = (m.capabilities as string[]).filter((c) => !(KNOWN_CAPABILITIES as readonly string[]).includes(c));
    if (unknown.length) errors.push(`unknown capabilities: ${unknown.join(', ')}`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    manifest: {
      id: m.id as string,
      name: m.name as string,
      version: m.version as string,
      publisher: m.publisher as string,
      entry: m.entry as string,
      icon: m.icon as string,
      capabilities: m.capabilities as string[],
    },
  };
}
