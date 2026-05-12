#!/usr/bin/env node
/*
 Builds unified backlog artifacts from docs/IDEAS_500.md and docs/IMPROVEMENTS_500.md.
 Outputs:
   - docs/MASTER_BACKLOG_1000.csv
   - docs/MASTER_BACKLOG_1000.json
   - docs/CREATIVE_500_PLUS_QUEUE.csv
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IDEAS_PATH = path.join(ROOT, 'docs', 'IDEAS_500.md');
const IMPROVEMENTS_PATH = path.join(ROOT, 'docs', 'IMPROVEMENTS_500.md');
const OUT_MASTER_CSV = path.join(ROOT, 'docs', 'MASTER_BACKLOG_1000.csv');
const OUT_MASTER_JSON = path.join(ROOT, 'docs', 'MASTER_BACKLOG_1000.json');
const OUT_CREATIVE_CSV = path.join(ROOT, 'docs', 'CREATIVE_500_PLUS_QUEUE.csv');

const SAME_VERSION_TRAIN = '4.3.x-same-train';
const CREATIVE_TARGET_COUNT = 550;

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function parseIdeas(md) {
  const lines = md.split(/\r?\n/);
  let currentSection = 'Uncategorized';
  let currentCode = 'X';
  const items = [];

  const sectionRe = /^##\s+([A-Z])\.\s+(.+?)\s+\((\d+)[\u2013\-](\d+)\)/;
  const itemRe = /^\s*(\d+)\.\s+\[([A-Z])\]\s+(.*)$/;

  for (const line of lines) {
    const sm = line.match(sectionRe);
    if (sm) {
      currentCode = sm[1];
      currentSection = sm[2].trim();
      continue;
    }

    const im = line.match(itemRe);
    if (!im) continue;

    const idx = Number(im[1]);
    const tag = im[2].trim();
    const title = im[3].trim();

    items.push({
      source: 'IDEAS',
      sourceId: idx,
      itemId: `IDEAS-${pad3(idx)}`,
      areaCode: currentCode,
      area: currentSection,
      tag,
      title,
    });
  }

  return items;
}

function expandImprovementIds(rawId) {
  // Supports:
  // - T3-001
  // - T2-001..T2-030
  const rangeMatch = rawId.match(/^(T\d+)-(\d{3})\.\.(T\d+)-(\d{3})$/);
  if (!rangeMatch) {
    return [rawId];
  }

  const prefixA = rangeMatch[1];
  const start = Number(rangeMatch[2]);
  const prefixB = rangeMatch[3];
  const end = Number(rangeMatch[4]);

  if (prefixA !== prefixB || end < start) {
    return [rawId];
  }

  const out = [];
  for (let n = start; n <= end; n += 1) {
    out.push(`${prefixA}-${pad3(n)}`);
  }
  return out;
}

function parseImprovements(md) {
  const lines = md.split(/\r?\n/);
  let currentTheme = 'Unknown';
  let currentCode = 'T0';
  const items = [];

  const themeRe = /^##\s+(T\d+)\s+\u2014\s+(.+?)\s+\((\d+)\)/;
  const bulletRe = /^-\s+\[\s?[x~]?\s?\]\s+([^\s]+)\s+\u2014\s+(.*)$/i;

  for (const line of lines) {
    const tm = line.match(themeRe);
    if (tm) {
      currentCode = tm[1].trim();
      currentTheme = tm[2].trim();
      continue;
    }

    const bm = line.match(bulletRe);
    if (!bm) continue;

    const rawId = bm[1].trim();
    const title = bm[2].trim();
    const expandedIds = expandImprovementIds(rawId);

    for (const itemId of expandedIds) {
      const seqMatch = itemId.match(/-(\d{3})$/);
      const sourceId = seqMatch ? Number(seqMatch[1]) : 0;
      items.push({
        source: 'IMPROVEMENTS',
        sourceId,
        itemId,
        areaCode: currentCode,
        area: currentTheme,
        tag: 'U',
        title,
      });
    }
  }

  return items;
}

function computePriority(tag) {
  if (tag === 'N' || tag === 'M') return 'P0';
  if (tag === 'P') return 'P1';
  if (tag === 'U') return 'P2';
  return 'P3';
}

function creativeScore(item) {
  const s = `${item.areaCode} ${item.area} ${item.title}`.toLowerCase();
  const keywords = [
    'creative', 'vinx', 'imosion', 'prism', 'flux', 'forge', 'axl', 'timeline', 'audio', 'video',
    'motion', 'cad', '3d', 'design', 'editor', 'export', 'render', 'brush', 'midi', 'collab',
    'plugin', 'accessibility', 'ux', 'shell', 'touch', 'pen', 'dock', 'knowledge', 'uki',
  ];
  let score = 0;
  for (const kw of keywords) {
    if (s.includes(kw)) score += 1;
  }

  if (item.source === 'IMPROVEMENTS') score += 2;
  if (['D', 'E', 'G', 'I', 'J', 'K', 'L', 'O'].includes(item.areaCode)) score += 2;
  if (item.areaCode.startsWith('T')) score += 2;

  return score;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, columns) {
  const header = columns.join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsv(row[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function main() {
  const ideas = parseIdeas(readText(IDEAS_PATH));
  const improvements = parseImprovements(readText(IMPROVEMENTS_PATH));

  const all = [...ideas, ...improvements].map((item) => ({
    ...item,
    priority: computePriority(item.tag),
    status: 'open',
    targetVersion: SAME_VERSION_TRAIN,
    creativeScore: creativeScore(item),
  }));

  const creativeSorted = [...all]
    .sort((a, b) => b.creativeScore - a.creativeScore || a.itemId.localeCompare(b.itemId))
    .slice(0, Math.min(CREATIVE_TARGET_COUNT, all.length))
    .map((item, idx) => ({
      rank: idx + 1,
      ...item,
    }));

  fs.writeFileSync(
    OUT_MASTER_JSON,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      targetVersion: SAME_VERSION_TRAIN,
      counts: {
        ideas: ideas.length,
        improvements: improvements.length,
        total: all.length,
        creativeQueue: creativeSorted.length,
      },
      items: all,
    }, null, 2),
    'utf8'
  );

  const masterColumns = [
    'itemId', 'source', 'sourceId', 'areaCode', 'area', 'tag', 'priority', 'status',
    'targetVersion', 'creativeScore', 'title',
  ];
  fs.writeFileSync(OUT_MASTER_CSV, toCsv(all, masterColumns), 'utf8');

  const creativeColumns = ['rank', ...masterColumns];
  fs.writeFileSync(OUT_CREATIVE_CSV, toCsv(creativeSorted, creativeColumns), 'utf8');

  console.log('[backlog] generated');
  console.log(`[backlog] ideas=${ideas.length}`);
  console.log(`[backlog] improvements=${improvements.length}`);
  console.log(`[backlog] total=${all.length}`);
  console.log(`[backlog] creativeQueue=${creativeSorted.length}`);
  console.log(`[backlog] out=${path.relative(ROOT, OUT_MASTER_CSV)}`);
  console.log(`[backlog] out=${path.relative(ROOT, OUT_MASTER_JSON)}`);
  console.log(`[backlog] out=${path.relative(ROOT, OUT_CREATIVE_CSV)}`);
}

main();
