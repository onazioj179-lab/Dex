// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Minimal safe-by-default markdown renderer (Notes / Comments preview).
 *
 * Supports: headings (#..####), paragraphs, bold (**), italic (*), inline
 * code (`), code blocks (```), links [text](url), unordered lists.
 * Escapes HTML and refuses dangerous URL schemes (javascript:, data:).
 */

export function renderMarkdownLite(src: string): string {
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  const codeBuf: string[] = [];

  const flushList = (): void => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (inCode) { out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`); codeBuf.length = 0; inCode = false; }
      else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (heading) {
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(raw);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    if (raw.trim() === '') { flushList(); continue; }
    flushList();
    out.push(`<p>${inline(raw)}</p>`);
  }
  flushList();
  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return out.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function safeUrl(url: string): string {
  const t = url.trim().toLowerCase();
  if (t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('vbscript:')) return '#';
  return url;
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // code first (so its content is not re-formatted).
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) =>
    `<a href="${escapeHtml(safeUrl(url))}">${text}</a>`);
  return out;
}
