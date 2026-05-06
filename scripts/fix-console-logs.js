// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
#!/usr/bin/env node
/**
 * Replaces console.log/warn/error with electron-log equivalents in src/main/.
 * Skips: preload.ts, worker files (worker_threads context).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'main');

// Files to skip (renderer/worker context or intentional)
const SKIP_FILES = new Set([
  'preload.ts',
  'rewind-logger.worker.ts',
  'database-write.worker.ts',
]);

const ELECTRON_LOG_IMPORT = "import log from 'electron-log';";

let totalReplaced = 0;
let totalFiles = 0;
let filesNeedingImport = 0;

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

function processFile(filePath) {
  const basename = path.basename(filePath);
  if (SKIP_FILES.has(basename)) return;

  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Count console calls before replacement
  const logMatches = (content.match(/console\.log\(/g) || []).length;
  const warnMatches = (content.match(/console\.warn\(/g) || []).length;
  const errorMatches = (content.match(/console\.error\(/g) || []).length;
  const total = logMatches + warnMatches + errorMatches;
  
  if (total === 0) return;

  // Replace console calls
  let newContent = content
    .replace(/console\.log\(/g, 'log.info(')
    .replace(/console\.warn\(/g, 'log.warn(')
    .replace(/console\.error\(/g, 'log.error(');

  // Check if electron-log is already imported
  const hasLogImport = /import\s+log\s+from\s+['"]electron-log['"]/.test(content) ||
                       /import\s+\*\s+as\s+log\s+from\s+['"]electron-log['"]/.test(content);

  if (!hasLogImport) {
    // Find the watermark end (line 16 = end of comment block) and insert after
    const lines = newContent.split('\n');
    // Find first import line
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].startsWith('import{')) {
        insertIdx = i;
        break;
      }
    }
    if (insertIdx >= 0) {
      lines.splice(insertIdx, 0, ELECTRON_LOG_IMPORT);
      newContent = lines.join('\n');
      filesNeedingImport++;
    }
  }

  fs.writeFileSync(filePath, newContent, 'utf-8');
  totalReplaced += total;
  totalFiles++;
  const rel = path.relative(path.resolve(__dirname, '..'), filePath);
  console.log(`  ${rel}: ${total} replacements (log:${logMatches} warn:${warnMatches} err:${errorMatches})`);
}

console.log('Scanning src/main/ for console.log/warn/error...\n');
const files = walkDir(ROOT);
for (const f of files) {
  processFile(f);
}

console.log(`\nDone: ${totalReplaced} replacements across ${totalFiles} files`);
console.log(`Added electron-log import to ${filesNeedingImport} files`);
