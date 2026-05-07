// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Strict Content-Security-Policy builder for the renderer.
 *
 * Every renderer surface gets a CSP. This module produces the header
 * string in a single place so a careless inline-script can never slip
 * through review.
 */

// DEX v3.8.9 - CSP builder

export interface CspOptions {
  /** Extra script hosts beyond 'self'. */
  scriptHosts?: string[];
  /** Extra connect-src hosts (XHR/fetch/ws). */
  connectHosts?: string[];
  /** Extra image hosts. */
  imageHosts?: string[];
  /** Extra style hosts. */
  styleHosts?: string[];
  /** Extra font hosts. */
  fontHosts?: string[];
  /** Allow inline styles (only for tightly-scoped admin views). */
  allowInlineStyle?: boolean;
  /** Allow blob: in img-src and media-src (for cropper / canvas exports). */
  allowBlobMedia?: boolean;
  /** Report URI (defaults to omitted). */
  reportUri?: string;
}

export function buildCsp(opts: CspOptions = {}): string {
  const directives: Record<string, string[]> = {
    'default-src':  [`'self'`],
    'script-src':   [`'self'`, ...(opts.scriptHosts ?? [])],
    'style-src':    [`'self'`, ...(opts.allowInlineStyle ? [`'unsafe-inline'`] : []), ...(opts.styleHosts ?? [])],
    'font-src':     [`'self'`, 'data:', ...(opts.fontHosts ?? [])],
    'img-src':      [`'self'`, 'data:', ...(opts.allowBlobMedia ? ['blob:'] : []), ...(opts.imageHosts ?? [])],
    'media-src':    [`'self'`, ...(opts.allowBlobMedia ? ['blob:'] : [])],
    'connect-src':  [`'self'`, ...(opts.connectHosts ?? [])],
    'frame-src':    [`'none'`],
    'object-src':   [`'none'`],
    'base-uri':     [`'self'`],
    'form-action':  [`'self'`],
    'frame-ancestors': [`'none'`],
    'worker-src':   [`'self'`, 'blob:'],
  };
  if (opts.reportUri) directives['report-uri'] = [opts.reportUri];
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

/** Strict default suitable for the main renderer. */
export function strictRendererCsp(): string {
  return buildCsp({ allowBlobMedia: true });
}
