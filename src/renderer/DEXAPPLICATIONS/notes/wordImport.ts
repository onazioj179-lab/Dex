// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import type { DocNode, DocRoot, Mark } from './NotesDocumentModel';

export interface WordImportParts {
  document: string;
  numbering?: string | null;
  relationships?: string | null;
  images?: Record<string, string>;
}

const WORD_NS = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
]);

function parsePart(xml: string | undefined | null): Document | null {
  if (!xml) return null;
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('The Word file contains unsupported XML declarations.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('The Word file contains invalid XML.');
  return document;
}

function children(parent?: Element | null, name?: string): Element[] {
  return parent ? Array.from(parent.children).filter(child => !name || child.localName === name) : [];
}

const child = (parent: Element | undefined | null, name: string) => children(parent, name)[0];
const attr = (element: Element | undefined, name: string) =>
  Array.from(element?.attributes ?? []).find(attribute => attribute.localName === name)?.value;
const value = (parent: Element | undefined, name: string) => attr(child(parent, name), 'val');
const descendants = (element: Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name));

function safeImagePath(target: string) {
  try {
    const path = decodeURIComponent(target).replace(/^\//, '').replace(/^media\//, 'word/media/');
    return /^word\/media\/[^/\\]+$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

interface NumberingLevel {
  start: number;
  ordered: boolean;
}

function numberingLevels(document: Document | null): Map<string, NumberingLevel> {
  const root = document?.documentElement;
  const abstract = new Map<string, Map<string, NumberingLevel>>();
  for (const node of children(root, 'abstractNum')) {
    const id = attr(node, 'abstractNumId');
    if (id === undefined) continue;
    abstract.set(id, new Map(children(node, 'lvl').map(level => [
      attr(level, 'ilvl') ?? '0',
      { ordered: value(level, 'numFmt') !== 'bullet', start: Number(value(level, 'start') ?? 1) },
    ])));
  }
  const definitions = new Map<string, NumberingLevel>();
  for (const num of children(root, 'num')) {
    const id = attr(num, 'numId');
    if (!id) continue;
    const levels = new Map(abstract.get(value(num, 'abstractNumId') ?? ''));
    for (const override of children(num, 'lvlOverride')) {
      const level = attr(override, 'ilvl') ?? '0';
      const explicit = child(override, 'lvl');
      const base = levels.get(level) ?? { ordered: false, start: 1 };
      levels.set(level, {
        ordered: explicit ? value(explicit, 'numFmt') !== 'bullet' : base.ordered,
        start: Number(value(override, 'startOverride') ?? value(explicit, 'start') ?? base.start),
      });
    }
    for (const [level, definition] of levels) definitions.set(id + '/' + level, definition);
  }
  return definitions;
}

const RUN_MARKS: Record<string, Mark['type']> = {
  b: 'bold', i: 'italic', u: 'underline', strike: 'strikethrough', dstrike: 'strikethrough', highlight: 'highlight',
};

export function importWordDocument(parts: WordImportParts): DocRoot {
  const root = parsePart(parts.document)?.documentElement;
  const body = child(root, 'body');
  if (!root || root.localName !== 'document' || !WORD_NS.has(root.namespaceURI ?? '') || !body) {
    throw new Error('The file does not contain a supported Word document.');
  }
  const relationships = new Map(children(parsePart(parts.relationships)?.documentElement, 'Relationship')
    .map(node => [attr(node, 'Id'), { target: attr(node, 'Target') ?? '', type: attr(node, 'Type') ?? '' }]));
  const numbering = numberingLevels(parsePart(parts.numbering));

  function linkId(node: Element) {
    const relation = relationships.get(attr(node, 'id'));
    return relation?.type.endsWith('/hyperlink') && /^(https?:\/\/|mailto:)/i.test(relation.target) ? relation.target : undefined;
  }

  function readInline(node: Element, href?: string, depth = 0): DocNode[] {
    if (depth >= 40) return [];
    return children(node).flatMap((element): DocNode[] => {
      if (element.localName === 'hyperlink') return readInline(element, linkId(element), depth + 1);
      if (element.localName !== 'r') {
        return ['sdt', 'sdtContent', 'ins', 'smartTag', 'fldSimple'].includes(element.localName)
          ? readInline(element, href, depth + 1) : [];
      }
      const marks: Mark[] = [];
      if (href) marks.push({ type: 'link', attrs: { href } });
      for (const mark of children(child(element, 'rPr'))) {
        const type = Object.hasOwn(RUN_MARKS, mark.localName) ? RUN_MARKS[mark.localName] : undefined;
        if (type && !/^(?:0|false|off|none)$/i.test(attr(mark, 'val') ?? '')) marks.push({ type });
      }
      return children(element).flatMap((run): DocNode[] => {
        if (run.localName === 'drawing') {
          const properties = descendants(run, 'docPr')[0];
          const alt = attr(properties, 'descr') ?? attr(properties, 'name') ?? 'Image';
          const relation = relationships.get(attr(descendants(run, 'blip')[0], 'embed'));
          const path = relation?.type.endsWith('/image') ? safeImagePath(relation.target) : null;
          const src = path ? parts.images?.[path] : undefined;
          if (src && /^data:image\/(?:png|jpeg|gif);base64,/i.test(src)) return [{ type: 'image', attrs: { src, alt } }];
          return [{ type: 'paragraph', text: '[Image · ' + alt + ']' }];
        }
        const text = run.localName === 't' ? run.textContent ?? ''
          : run.localName === 'tab' ? '\t' : ['br', 'cr'].includes(run.localName) ? '\n' : '';
        return text ? [{ type: 'paragraph', text, ...(marks.length ? { marks } : {}) }] : [];
      });
    });
  }

  function paragraph(node: Element): DocNode {
    const props = child(node, 'pPr');
    const outline = value(props, 'outlineLvl');
    const heading = /^heading\s*([1-6])$/i.exec(value(props, 'pStyle') ?? '');
    const level = heading ? Number(heading[1]) : outline && /^[0-5]$/.test(outline) ? Number(outline) + 1 : 0;
    const justify = value(props, 'jc');
    const alignment = justify === 'both' ? 'justify' : justify;
    return {
      type: level ? 'heading' : 'paragraph',
      attrs: { ...(level ? { level } : {}), ...(/^(left|right|center|justify)$/.test(alignment ?? '') ? { alignment } : {}) },
      content: readInline(node),
    };
  }

  function table(node: Element): DocNode {
    return {
      type: 'table',
      content: children(node, 'tr').map(row => ({
        type: 'table_row',
        content: children(row, 'tc').map(cell => ({
          type: 'table_cell',
          attrs: { header: !!child(child(row, 'trPr'), 'tblHeader') },
          content: children(cell, 'p').flatMap((p, i) => [
            ...(i ? [{ type: 'paragraph' as const, text: '\n' }] : []), ...readInline(p),
          ]),
        })),
      })),
    };
  }

  const content: DocNode[] = [];
  const stack: { level: number; id: string; list: DocNode }[] = [];
  for (const element of children(body)) {
    if (element.localName === 'tbl') {
      stack.length = 0;
      content.push(table(element));
      continue;
    }
    if (element.localName !== 'p') continue;
    const node = paragraph(element);
    const num = child(child(element, 'pPr'), 'numPr');
    const id = value(num, 'numId');
    if (!id || id === '0') {
      stack.length = 0;
      content.push(node);
      continue;
    }
    const parsed = value(num, 'ilvl') ?? '0';
    const level = /^[0-8]$/.test(parsed) ? Number(parsed) : 0;
    while (stack.length && (stack.at(-1)!.level > level ||
      (stack.at(-1)!.level === level && stack.at(-1)!.id !== id))) stack.pop();
    let current = stack.at(-1);
    if (!current || current.level !== level) {
      const definition = numbering.get(id + '/' + level);
      const list: DocNode = {
        type: definition?.ordered ? 'ordered_list' : 'bullet_list',
        attrs: definition?.ordered ? { start: Number.isSafeInteger(definition.start) ? definition.start : 1 } : undefined,
        content: [],
      };
      const parent = current?.list.content?.at(-1);
      (parent?.content ?? content).push(list);
      current = { level, id, list };
      stack.push(current);
    }
    current.list.content!.push({ type: 'list_item', content: node.content ?? [] });
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph', content: [] }] };
}
