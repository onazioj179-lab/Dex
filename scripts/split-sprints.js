// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
#!/usr/bin/env node
/*
 Splits MASTER_BACKLOG_1000.json into:
   - docs/sprints/WEEK_01.md .. WEEK_12.md   (creative-priority queue, ~46 items/week)
   - docs/sprints/IDEAS_QUEUE.md             (all 500 IDEAS items, ranked, full list)
   - docs/sprints/IDEAS_WEEK_01.md .. IDEAS_WEEK_10.md (ideas-only weekly chunks, 50 items each)
   - docs/sprints/INDEX.md
*/

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MASTER_JSON = path.join(ROOT, 'docs', 'MASTER_BACKLOG_1000.json');
const SPRINTS_DIR = path.join(ROOT, 'docs', 'sprints');

const CREATIVE_WEEKS = 12;
const IDEAS_PER_WEEK = 50;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function renderItem(item) {
  const rank = item.rank ? `#${item.rank} ` : '';
  return `- [ ] ${rank}\`${item.itemId}\` (${item.priority}) [${item.areaCode} - ${item.area}] - ${item.title}`;
}

function writeMarkdown(filePath, title, intro, items) {
  const body = items.map(renderItem).join('\n');
  const out = `# ${title}\n\n${intro}\n\nTotal items: ${items.length}\n\n## Items\n\n${body}\n`;
  fs.writeFileSync(filePath, out);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function main() {
  const master = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'));
  const all = master.items;

  ensureDir(SPRINTS_DIR);

  // Creative queue (top 550 by creativeScore)
  const creative = [...all]
    .sort((a, b) => b.creativeScore - a.creativeScore || a.itemId.localeCompare(b.itemId))
    .slice(0, 550)
    .map((it, idx) => ({ ...it, rank: idx + 1 }));

  const perWeek = Math.ceil(creative.length / CREATIVE_WEEKS);
  const weeks = chunk(creative, perWeek);

  weeks.forEach((items, idx) => {
    const wk = pad2(idx + 1);
    writeMarkdown(
      path.join(SPRINTS_DIR, `WEEK_${wk}.md`),
      `Creative Sprint Week ${wk}`,
      `Target train: ${master.targetVersion}\nGenerated: ${master.generatedAt}\nSource: docs/CREATIVE_500_PLUS_QUEUE.csv`,
      items,
    );
  });

  // Ideas-only queue (all 500 IDEAS, ranked by creativeScore then id)
  const ideas = all
    .filter((it) => it.source === 'IDEAS')
    .sort((a, b) => b.creativeScore - a.creativeScore || a.itemId.localeCompare(b.itemId))
    .map((it, idx) => ({ ...it, rank: idx + 1 }));

  writeMarkdown(
    path.join(SPRINTS_DIR, 'IDEAS_QUEUE.md'),
    'IDEAS Master Queue (500)',
    `All IDEAS_500 items ranked for the same-version train.\nTarget train: ${master.targetVersion}`,
    ideas,
  );

  const ideaWeeks = chunk(ideas, IDEAS_PER_WEEK);
  ideaWeeks.forEach((items, idx) => {
    const wk = pad2(idx + 1);
    writeMarkdown(
      path.join(SPRINTS_DIR, `IDEAS_WEEK_${wk}.md`),
      `IDEAS Sprint Week ${wk}`,
      `IDEAS-only weekly chunk (${IDEAS_PER_WEEK} items).\nTarget train: ${master.targetVersion}`,
      items,
    );
  });

  // Improvements-only queue
  const improvements = all
    .filter((it) => it.source === 'IMPROVEMENTS')
    .sort((a, b) => b.creativeScore - a.creativeScore || a.itemId.localeCompare(b.itemId))
    .map((it, idx) => ({ ...it, rank: idx + 1 }));

  writeMarkdown(
    path.join(SPRINTS_DIR, 'IMPROVEMENTS_QUEUE.md'),
    'IMPROVEMENTS Master Queue (500)',
    `All IMPROVEMENTS_500 items ranked for the same-version train.\nTarget train: ${master.targetVersion}`,
    improvements,
  );

  // Index
  const lines = [];
  lines.push('# Sprints Index');
  lines.push('');
  lines.push(`Target train: ${master.targetVersion}`);
  lines.push(`Generated: ${master.generatedAt}`);
  lines.push('');
  lines.push('## Creative Weekly Sprints (550 items / 12 weeks)');
  weeks.forEach((items, idx) => {
    const wk = pad2(idx + 1);
    lines.push(`- [Week ${wk}](WEEK_${wk}.md) - ${items.length} items`);
  });
  lines.push('');
  lines.push('## Ideas Weekly Sprints (500 items / 10 weeks)');
  ideaWeeks.forEach((items, idx) => {
    const wk = pad2(idx + 1);
    lines.push(`- [Ideas Week ${wk}](IDEAS_WEEK_${wk}.md) - ${items.length} items`);
  });
  lines.push('');
  lines.push('## Master Queues');
  lines.push('- [IDEAS Master Queue](IDEAS_QUEUE.md)');
  lines.push('- [IMPROVEMENTS Master Queue](IMPROVEMENTS_QUEUE.md)');
  lines.push('');
  fs.writeFileSync(path.join(SPRINTS_DIR, 'INDEX.md'), lines.join('\n'));

  console.log(`Sprints written to ${SPRINTS_DIR}`);
  console.log(`  creative weeks: ${weeks.length} (~${perWeek} items/week)`);
  console.log(`  ideas weeks: ${ideaWeeks.length} (${IDEAS_PER_WEEK} items/week)`);
  console.log(`  ideas total: ${ideas.length}`);
  console.log(`  improvements total: ${improvements.length}`);
}

main();
