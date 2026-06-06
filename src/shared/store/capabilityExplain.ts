// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Capability awareness (DEX Developer Platform — E6) — "DEX knows what apps can
 * do." Pure mapping from a package's declared capability ids to plain-English
 * explanations + a sensitivity flag. Powers the storefront "What this app can
 * do" panel, the install consent dialog, and the validation gate's capability
 * audit (undeclared sensitive use). No I/O.
 */

export interface CapabilityExplanation {
  capability: string;
  title: string;
  detail: string;
  sensitive: boolean;
}

const CATALOG: Record<string, { title: string; detail: string; sensitive: boolean }> = {
  'files.read':    { title: 'Read files you choose',    detail: 'Open and read files you explicitly pick.',            sensitive: true },
  'files.write':   { title: 'Save and change files',    detail: 'Write or modify files you choose.',                   sensitive: true },
  'network':       { title: 'Access the internet',      detail: 'Connect to remote servers to send and receive data.', sensitive: true },
  'network.local': { title: 'Access your local network',detail: 'Connect to devices on your local network.',           sensitive: true },
  'clipboard':     { title: 'Use the clipboard',        detail: 'Read and write copied content.',                      sensitive: true },
  'capture':       { title: 'Record your screen',       detail: 'Capture screenshots or screen video.',                sensitive: true },
  'audio.in':      { title: 'Use your microphone',      detail: 'Record audio input.',                                 sensitive: true },
  'autostart':     { title: 'Start automatically',      detail: 'Launch when DEX starts.',                             sensitive: true },
  'audio.out':     { title: 'Play audio',               detail: 'Output sound to your speakers.',                      sensitive: false },
  'gpu':           { title: 'Use the GPU',              detail: 'Hardware-accelerated graphics.',                      sensitive: false },
  'gpu.compute':   { title: 'Run GPU compute',          detail: 'Use the GPU for computation.',                        sensitive: false },
  'storage':       { title: 'Store its own data',       detail: 'Keep local data for this app.',                       sensitive: false },
  'notify':        { title: 'Send notifications',       detail: 'Show desktop notifications.',                         sensitive: false },
  'background':    { title: 'Run in the background',     detail: 'Keep working when not in focus.',                     sensitive: false },
};

/** Capability ids that always require explicit user awareness/consent. */
export function isSensitiveCapability(cap: string): boolean {
  const e = CATALOG[cap];
  return e ? e.sensitive : false;
}

export function explainCapability(cap: string): CapabilityExplanation {
  const e = CATALOG[cap];
  if (e) return { capability: cap, title: e.title, detail: e.detail, sensitive: e.sensitive };
  return { capability: cap, title: cap, detail: `Capability: ${cap}`, sensitive: false };
}

/** De-duplicated, explained capability list for a package (storefront/consent). */
export function explainCapabilities(caps: string[]): CapabilityExplanation[] {
  const seen = new Set<string>();
  const out: CapabilityExplanation[] = [];
  for (const c of caps) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(explainCapability(c));
  }
  return out;
}

/**
 * Capability-declaration audit: sensitive capabilities the app actually uses
 * but did NOT declare in its manifest. Feeds the validation gate as a blocking
 * check. (`used` comes from static analysis; until that lands, callers pass an
 * empty set and this returns nothing.)
 */
export function undeclaredSensitive(used: string[], declared: string[]): string[] {
  const decl = new Set(declared);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of used) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (isSensitiveCapability(c) && !decl.has(c)) out.push(c);
  }
  return out;
}
