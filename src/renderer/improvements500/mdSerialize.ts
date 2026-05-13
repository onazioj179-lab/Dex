// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Build canonical Markdown text from a structured node model. Counterpart to
 * markdownLite's parser; produces deterministic output suitable for diffs.
 */

export type MdNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bulletList'; items: string[] }
  | { type: 'orderedList'; items: string[]; start?: number }
  | { type: 'codeBlock'; lang?: string; code: string }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'table'; header: string[]; rows: string[][] };

export function mdSerialize(nodes: MdNode[]): string {
  const blocks = nodes.map((n) => renderNode(n));
  return `${blocks.join('\n\n')}\n`;
}

function renderNode(n: MdNode): string {
  switch (n.type) {
    case 'heading':
      return `${'#'.repeat(n.level)} ${n.text}`;
    case 'paragraph':
      return n.text;
    case 'bulletList':
      return n.items.map((i) => `- ${i}`).join('\n');
    case 'orderedList': {
      const start = n.start ?? 1;
      return n.items.map((item, idx) => `${start + idx}. ${item}`).join('\n');
    }
    case 'codeBlock':
      return `\`\`\`${n.lang ?? ''}\n${n.code}\n\`\`\``;
    case 'blockquote':
      return n.text.split('\n').map((line) => `> ${line}`).join('\n');
    case 'hr':
      return '---';
    case 'table': {
      const sep = n.header.map(() => '---').join(' | ');
      const head = n.header.join(' | ');
      const body = n.rows.map((r) => r.join(' | ')).join('\n');
      return `${head}\n${sep}${body ? `\n${body}` : ''}`;
    }
    default:
      return '';
  }
}
