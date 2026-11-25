// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Notes → Microsoft Word (.docx), with no dependency.
 *
 * The note's HTML is walked once and written as WordprocessingML: Title and
 * Heading 1-3 styles, paragraphs, bold / italic / underline / strikethrough /
 * superscript / subscript / highlight / inline code runs, bulleted and
 * numbered lists (real Word numbering, nested by indent), checklists, quotes,
 * code blocks, dividers, tables and links (as underlined text with the URL
 * kept). The parts are packed into a ZIP (stored, CRC-32) that Word, Pages,
 * LibreOffice and Google Docs open.
 */

// --- ZIP (stored) ------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A minimal ZIP writer (no compression): enough for an Office document. */
export function zipStored(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true); lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, f.data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + f.data.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

// --- HTML → WordprocessingML ---------------------------------------------------

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // XML 1.0 forbids most control characters.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

interface RunStyle { b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean; code?: boolean; hl?: boolean }

function runXml(text: string, st: RunStyle): string {
  if (!text) return '';
  const pr = [
    st.b && '<w:b/>', st.i && '<w:i/>', st.u && '<w:u w:val="single"/>', st.s && '<w:strike/>',
    st.code && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>',
    st.hl && '<w:highlight w:val="yellow"/>',
    st.sup && '<w:vertAlign w:val="superscript"/>', st.sub && '<w:vertAlign w:val="subscript"/>',
  ].filter(Boolean).join('');
  const parts = text.split('\n');
  return parts.map((t, i) => `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`).join('');
}

function inlineRuns(node: Node, st: RunStyle = {}): string {
  if (node.nodeType === 3) return runXml((node.textContent || '').replace(/\s+/g, ' '), st);
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '<w:r><w:br/></w:r>';
  if (tag === 'input' && (el as HTMLInputElement).type === 'checkbox') return runXml((el as HTMLInputElement).checked ? '☑ ' : '☐ ', st);
  const next: RunStyle = { ...st };
  if (tag === 'b' || tag === 'strong') next.b = true;
  if (tag === 'i' || tag === 'em') next.i = true;
  if (tag === 'u') next.u = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
  if (tag === 'sup') next.sup = true;
  if (tag === 'sub') next.sub = true;
  if (tag === 'code' || tag === 'kbd') next.code = true;
  if (tag === 'mark') next.hl = true;
  if (tag === 'a') {
    next.u = true;
    const href = el.getAttribute('href') || '';
    const inner = Array.from(el.childNodes).map((c) => inlineRuns(c, next)).join('');
    return href && href !== el.textContent ? `${inner}${runXml(` (${href})`, st)}` : inner;
  }
  return Array.from(el.childNodes).map((c) => inlineRuns(c, next)).join('');
}

function para(runs: string, pPr = ''): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
}

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'section', 'article', 'aside', 'figure', 'details', 'summary']);

function blocks(node: Node, ctx: { list?: { ordered: boolean; level: number }; quote?: boolean }): string {
  if (node.nodeType === 3) {
    const t = (node.textContent || '').trim();
    return t ? para(runXml(t, {}), ctx.quote ? '<w:pStyle w:val="Quote"/>' : '') : '';
  }
  if (node.nodeType !== 1) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes);
  const hasBlockChild = kids().some((c) => c.nodeType === 1 && BLOCK.has((c as Element).tagName.toLowerCase()));
  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const lvl = Math.min(3, Number(tag[1]));
      return para(inlineRuns(el), `<w:pStyle w:val="Heading${lvl}"/>`);
    }
    case 'hr':
      return para('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr>');
    case 'pre':
      return (el.textContent || '').replace(/\n$/, '').split('\n').map((line) => para(runXml(line || ' ', { code: true }), '<w:pStyle w:val="Code"/>')).join('');
    case 'blockquote':
      return kids().map((c) => blocks(c, { ...ctx, quote: true })).join('') || para(inlineRuns(el), '<w:pStyle w:val="Quote"/>');
    case 'ul': case 'ol': {
      const level = ctx.list ? Math.min(8, ctx.list.level + 1) : 0;
      return kids().map((c) => blocks(c, { ...ctx, list: { ordered: tag === 'ol', level } })).join('');
    }
    case 'li': {
      const list = ctx.list ?? { ordered: false, level: 0 };
      const numId = list.ordered ? 2 : 1;
      const inline = kids().filter((c) => !(c.nodeType === 1 && ['ul', 'ol'].includes((c as Element).tagName.toLowerCase())));
      const nested = kids().filter((c) => c.nodeType === 1 && ['ul', 'ol'].includes((c as Element).tagName.toLowerCase()));
      const isTask = el.getAttribute('data-checked') != null || el.closest('[data-type="checklist"], .checklist, ul.task-list') != null;
      const checked = el.getAttribute('data-checked') === 'true' || !!el.querySelector(':scope > input[type="checkbox"]:checked');
      const prefix = isTask && !el.querySelector(':scope > input[type="checkbox"]') ? runXml(checked ? '☑ ' : '☐ ', {}) : '';
      const pPr = isTask ? `<w:ind w:left="${360 + list.level * 360}"/>` : `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${numId}"/></w:numPr>`;
      return para(prefix + inline.map((c) => inlineRuns(c)).join(''), pPr) + nested.map((c) => blocks(c, { ...ctx, list })).join('');
    }
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (!rows.length) return '';
      const cols = Math.max(...rows.map((r) => r.children.length));
      const grid = `<w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(cols)}</w:tblGrid>`;
      const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('') + '</w:tblBorders>';
      const trs = rows.map((r) => `<w:tr>${Array.from(r.children).map((cell) => {
        const head = cell.tagName.toLowerCase() === 'th';
        return `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${para(inlineRuns(cell, head ? { b: true } : {}))}</w:tc>`;
      }).join('')}</w:tr>`).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}</w:tblPr>${grid}${trs}</w:tbl>${para('')}`;
    }
    default:
      if (hasBlockChild) return kids().map((c) => blocks(c, ctx)).join('');
      if (tag === 'p' || tag === 'div' || BLOCK.has(tag)) {
        const runs = inlineRuns(el);
        const align = (el as HTMLElement).style?.textAlign;
        const jc = align === 'center' ? '<w:jc w:val="center"/>' : align === 'right' ? '<w:jc w:val="right"/>' : align === 'justify' ? '<w:jc w:val="both"/>' : '';
        return para(runs, `${ctx.quote ? '<w:pStyle w:val="Quote"/>' : ''}${jc}`);
      }
      return para(inlineRuns(el));
  }
}

export function htmlToDocumentXml(title: string, html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = Array.from(doc.body.childNodes).map((n) => blocks(n, {})).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + para(runXml(title, {}), '<w:pStyle w:val="Title"/>')
    + body
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
  + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>'
  + [['1', 36], ['2', 30], ['3', 26]].map(([n, sz]) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${Number(n) - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`).join('')
  + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="0A84FF"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>'
  + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
  + '</w:styles>';

function numberingXml(): string {
  const lvls = (ordered: boolean) => Array.from({ length: 9 }, (_, l) => {
    const fmt = ordered ? ['decimal', 'lowerLetter', 'lowerRoman'][l % 3] : 'bullet';
    const text = ordered ? `%${l + 1}.` : ['•', '◦', '▪'][l % 3];
    return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(false)}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(true)}</w:abstractNum>`
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>'
    + '</w:numbering>';
}

/** The complete .docx file for a note. */
export function noteToDocx(title: string, html: string, now = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const iso = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const files: Array<[string, string]> = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'],
    ['word/document.xml', htmlToDocumentXml(title, html)],
    ['word/styles.xml', STYLES],
    ['word/numbering.xml', numberingXml()],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>DEX Notes</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`],
  ];
  return zipStored(files.map(([name, s]) => ({ name, data: enc.encode(s) })));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
