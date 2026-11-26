// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import DOMPurify from 'dompurify';
import { deserializeDoc, docToHTML, docToMarkdown, docToPlainText, type DocNode } from './NotesDocumentModel';

interface ExportNote {
  title: string;
  content: string;
  plain_text: string;
}

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/';
const WORD_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const escapeXml = (text: string) => Array.from(text).filter(char => {
  const code = char.codePointAt(0)!;
  return code === 9 || code === 10 || code === 13 ||
    (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
}).join('').replace(/[&<>"']/g, char => XML_ENTITIES[char]);

const ALIGNMENTS = { left: 'left', right: 'right', center: 'center', justify: 'both' } as const;
const WORD_MARKS = {
  bold: '<w:b/>',
  italic: '<w:i/>',
  underline: '<w:u w:val="single"/>',
  strikethrough: '<w:strike/>',
  code: '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>',
  highlight: '<w:highlight w:val="yellow"/>',
} as const;

interface EmbeddedImage {
  format: 'png' | 'jpeg' | 'gif';
  base64: string;
  width: number;
  height: number;
}

interface FormattedNote {
  extension: string;
  title: string;
  content: string;
  relationships?: string;
  numbering?: string;
  images?: Array<Pick<EmbeddedImage, 'format' | 'base64'>>;
}

function jpegSize(data: string): [number, number] | null {
  const byte = (offset: number) => data.charCodeAt(offset);
  const word = (offset: number) => byte(offset) * 256 + byte(offset + 1);
  if (word(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 3 < data.length && byte(offset++) === 0xff) {
    while (byte(offset) === 0xff) offset++;
    const marker = byte(offset++);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const size = word(offset);
    if (size < 2 || offset + size > data.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && size >= 7) {
      return [word(offset + 5), word(offset + 3)];
    }
    offset += size;
  }
  return null;
}

function embeddedImage(source: unknown): EmbeddedImage | null {
  if (typeof source !== 'string') return null;
  const match = /^data:image\/(png|jpeg|gif);base64,([a-z0-9+/]+={0,2})$/i.exec(source);
  if (!match) return null;
  const format = match[1].toLowerCase() as EmbeddedImage['format'];
  const base64 = match[2];
  let bytes: string;
  try { bytes = atob(format === 'jpeg' ? base64 : base64.slice(0, 32)); } catch { return null; }
  let size: [number, number] | null = null;
  if (format === 'png' && bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.slice(12, 16) === 'IHDR') {
    const word = (offset: number) => [0, 1, 2, 3].reduce((result, index) => result * 256 + bytes.charCodeAt(offset + index), 0);
    size = [word(16), word(20)];
  } else if (format === 'gif' && /^GIF8[79]a/.test(bytes)) {
    const word = (offset: number) => bytes.charCodeAt(offset) + 256 * bytes.charCodeAt(offset + 1);
    size = [word(6), word(8)];
  } else if (format === 'jpeg') {
    size = jpegSize(bytes);
  }
  if (!size || !size.every(value => Number.isInteger(value) && value > 0)) return null;
  return { format, base64, width: size[0], height: size[1] };
}

function wordExport(title: string, nodes: DocNode[]) {
  const links = new Map<string, string>();
  const numberingInstances: string[] = [];
  const images = new Map<string, EmbeddedImage & { index: number }>();
  let drawingId = 0;

  function picture(node: DocNode): string | null {
    const source: unknown = node.attrs?.src;
    if (typeof source !== 'string') return null;
    let image = images.get(source);
    if (!image) {
      const embedded = embeddedImage(source);
      if (!embedded) return null;
      image = { ...embedded, index: images.size + 1 };
      images.set(source, image);
    }
    const id = ++drawingId;
    const alt = typeof node.attrs?.alt === 'string' ? escapeXml(node.attrs.alt) : '';
    const scale = Math.min(9525, 5_943_600 / image.width, 8_229_600 / image.height);
    const cx = Math.max(1, Math.round(image.width * scale));
    const cy = Math.max(1, Math.round(image.height * scale));
    const extent = ' cx="' + cx + '" cy="' + cy + '"';
    const name = 'Picture ' + id;
    return '<w:r><w:drawing><wp:inline><wp:extent' + extent + '/><wp:docPr id="' + id + '" name="' + name +
      '" descr="' + alt + '"/><a:graphic><a:graphicData uri="' + DRAWING_NS + 'picture"><pic:pic><pic:nvPicPr>' +
      '<pic:cNvPr id="' + id + '" name="' + name + '" descr="' + alt + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdImage' + image.index + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext' + extent + '/></a:xfrm><a:prstGeom prst="rect"><a:avLst/>' +
      '</a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  function runs(node: DocNode, style = '', allowLink = true): string {
    if (node.text === undefined) {
      if (node.type === 'image') return picture(node) ??
        runs({ type: 'paragraph', text: '[Image' + (node.attrs?.alt ? ' · ' + node.attrs.alt : '') + ']' }, style);
      return (node.content ?? []).map(child => runs(child, style, allowLink)).join('');
    }
    const marks = new Set(node.marks?.map(mark => mark.type));
    const format = Object.entries(WORD_MARKS).filter(([mark]) => marks.has(mark as keyof typeof WORD_MARKS)).map(([, xml]) => xml).join('');
    const address = allowLink && node.marks?.find(mark => mark.type === 'link')?.attrs?.href;
    const href = address && /^(https?:\/\/|mailto:)/i.test(address) ? address : null;
    const linkStyle = href ? '<w:color w:val="0563C1"/>' : '';
    const text = node.text.split(/(\r\n|\n|\r|\t)/).map(part => {
      if (part === '\t') return '<w:tab/>';
      if (part.includes('\r') || part.includes('\n')) return '<w:br/>';
      return '<w:t xml:space="preserve">' + escapeXml(part) + '</w:t>';
    }).join('');
    const run = '<w:r>' + (style || format || linkStyle ? '<w:rPr>' + style + format + linkStyle + '</w:rPr>' : '') + text + '</w:r>';
    if (!href) return run;
    const id = links.get(href) ?? 'rId' + (links.size + 1);
    links.set(href, id);
    return '<w:hyperlink r:id="' + id + '">' + run + '</w:hyperlink>';
  }

  function paragraph(node: DocNode, options: {
    indent?: number;
    marker?: string;
    numbering?: { id: number; level: number };
    title?: boolean;
    quote?: boolean;
  } = {}) {
    const heading = node.type === 'heading' ? Math.max(1, Math.min(6, Number(node.attrs?.level) || 1)) : 0;
    const alignmentKey = node.attrs?.alignment as keyof typeof ALIGNMENTS | undefined;
    const alignment = alignmentKey && Object.hasOwn(ALIGNMENTS, alignmentKey) ? ALIGNMENTS[alignmentKey] : undefined;
    const props = [
      heading || options.title ? '<w:keepNext/>' : '',
      options.numbering ? '<w:numPr><w:ilvl w:val="' + options.numbering.level + '"/><w:numId w:val="' +
        options.numbering.id + '"/></w:numPr>' : '',
      node.type === 'horizontal_rule' || node.type === 'divider' ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:color="94A3B8"/></w:pBdr>' : '',
      '<w:spacing w:after="120"/>',
      options.indent || options.quote ? '<w:ind w:left="' + ((options.indent ?? 1) * 360) + '"/>' : '',
      alignment ? '<w:jc w:val="' + alignment + '"/>' : '',
      heading ? '<w:outlineLvl w:val="' + (heading - 1) + '"/>' : '',
    ].join('');
    const style = options.title ? '<w:b/><w:sz w:val="48"/>'
      : heading ? '<w:b/><w:sz w:val="' + Math.max(24, 44 - heading * 4) + '"/>'
      : node.type === 'code_block' ? WORD_MARKS.code : options.quote ? '<w:i/>' : '';
    return '<w:p><w:pPr>' + props + '</w:pPr>' +
      (options.marker ? runs({ type: 'paragraph', text: options.marker + ' ' }) : '') + runs(node, style) + '</w:p>';
  }

  function block(node: DocNode, depth = 0): string {
    if (node.type === 'table') {
      const rows = (node.content ?? []).filter(row => row.content?.length);
      if (!rows.length) return '';
      const columns = Math.max(...rows.map(row => row.content!.length));
      const cellWidth = Math.floor(9000 / columns);
      const grid = '<w:gridCol w:w="' + cellWidth + '"/>';
      const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map(side => '<w:' + side + ' w:val="single" w:sz="4" w:color="94A3B8"/>').join('');
      const emptyCell: DocNode = { type: 'table_cell' };
      return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>' + borders +
        '</w:tblBorders></w:tblPr><w:tblGrid>' + grid.repeat(columns) + '</w:tblGrid>' +
        rows.map(row => '<w:tr>' + Array.from({ length: columns }, (_, column) => {
          const cell = row.content?.[column] ?? emptyCell;
          return '<w:tc><w:tcPr><w:tcW w:w="' + cellWidth + '" w:type="dxa"/>' +
            (cell.attrs?.header ? '<w:shd w:fill="E2E8F0"/>' : '') +
            '</w:tcPr>' + paragraph(cell) + '</w:tc>';
        }).join('') + '</w:tr>').join('') + '</w:tbl>';
    }
    if (node.type === 'bullet_list' || node.type === 'ordered_list') {
      const ordered = node.type === 'ordered_list';
      const level = Math.min(depth, 8);
      const parsedStart = Number(node.attrs?.start ?? 1);
      const start = Number.isSafeInteger(parsedStart) && parsedStart >= 0 && parsedStart <= 2147483647 ? parsedStart : 1;
      let id: number | undefined;
      return (node.content ?? []).map(item => {
        const checklist = item.type === 'checklist_item';
        if (!checklist && id === undefined) {
          id = numberingInstances.length + 1;
          numberingInstances.push('<w:num w:numId="' + id + '"><w:abstractNumId w:val="' + (ordered ? 1 : 0) + '"/>' +
            (ordered ? '<w:lvlOverride w:ilvl="' + level + '"><w:startOverride w:val="' + start + '"/></w:lvlOverride>' : '') +
            '</w:num>');
        }
        const children = item.content ?? [];
        const nested = children.filter(child => child.type === 'bullet_list' || child.type === 'ordered_list');
        return paragraph({ ...item, content: children.filter(child => !nested.includes(child)) },
          checklist ? { indent: depth + 1, marker: item.attrs?.checked ? '☑' : '☐' }
            : { numbering: { id: id!, level } }) + nested.map(child => block(child, depth + 1)).join('');
      }).join('');
    }
    if (node.type === 'blockquote') return (node.content ?? []).map(child => paragraph(child, { quote: true })).join('');
    return paragraph(node);
  }

  const content = DECLARATION + '<w:document xmlns:w="' + WORD_NS + '" xmlns:r="' + REL_NS +
    '" xmlns:a="' + DRAWING_NS + 'main" xmlns:wp="' + WORD_DRAWING_NS + '" xmlns:pic="' + DRAWING_NS + 'picture"><w:body>' +
    paragraph({ type: 'paragraph', text: title }, { title: true }) + nodes.map(node => block(node)).join('') +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const relationships = DECLARATION + '<Relationships xmlns="' + PACKAGE_NS + '">' +
    Array.from(links, ([target, id]) => '<Relationship Id="' + id + '" Type="' + REL_NS +
      '/hyperlink" Target="' + escapeXml(target) + '" TargetMode="External"/>').join('') +
    (numberingInstances.length ? '<Relationship Id="rIdNumbering" Type="' + REL_NS + '/numbering" Target="numbering.xml"/>' : '') +
    Array.from(images.values(), image => '<Relationship Id="rIdImage' + image.index + '" Type="' + REL_NS +
      '/image" Target="media/image' + image.index + '.' + image.format + '"/>').join('') +
    '</Relationships>';
  const numbering = numberingInstances.length
    ? DECLARATION + '<w:numbering xmlns:w="' + WORD_NS + '">' +
      abstractNumbering(0, 'bullet') + abstractNumbering(1, 'decimal') + numberingInstances.join('') + '</w:numbering>'
    : '';
  return { content, relationships, numbering,
    images: Array.from(images.values(), ({ format, base64 }) => ({ format, base64 })) };
}

function abstractNumbering(id: number, format: 'bullet' | 'decimal'): string {
  return '<w:abstractNum w:abstractNumId="' + id + '"><w:multiLevelType w:val="multilevel"/>' +
    Array.from({ length: 9 }, (_, level) => {
      const left = 480 * (level + 1);
      const marker = format === 'decimal' ? '%' + (level + 1) + '.' : ['•', '◦', '▪'][level % 3];
      return '<w:lvl w:ilvl="' + level + '"><w:start w:val="1"/><w:numFmt w:val="' + format +
        '"/><w:lvlText w:val="' + marker + '"/><w:lvlJc w:val="left"/><w:pPr><w:tabs>' +
        '<w:tab w:val="num" w:pos="' + left + '"/></w:tabs><w:ind w:left="' + left +
        '" w:hanging="240"/></w:pPr></w:lvl>';
    }).join('') + '</w:abstractNum>';
}

export function formatNoteExport(note: ExportNote, format: string): FormattedNote {
  const doc = deserializeDoc(note.content);
  const title = note.title || 'Untitled';
  switch (format) {
    case 'docx': return { extension: 'docx', title, ...wordExport(title, doc.content) };
    case 'markdown': return { extension: 'md', title, content: '# ' + title + '\n\n' + docToMarkdown(doc) };
    case 'txt': return { extension: 'txt', title, content: title + '\n\n' + (docToPlainText(doc) || note.plain_text) };
    case 'html': return { extension: 'html', title, content: '<!doctype html><html><head><meta charset="utf-8"><title>' +
      escapeXml(title) + '</title></head><body><h1>' + escapeXml(title) + '</h1>' + DOMPurify.sanitize(docToHTML(doc)) + '</body></html>' };
    case 'json': return { extension: 'json', title, content: JSON.stringify({ title, document: doc }, null, 2) };
    default: throw new Error('Unsupported note export format.');
  }
}
