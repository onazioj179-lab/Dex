// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
#!/usr/bin/env node
/**
 * Fix untyped catch parameters from the empty-catch codemod.
 * 
 * Transforms:
 *   .catch((e) => { console.warn('[DEX]', e); })
 *   → .catch((e: unknown) => { console.warn('[DEX]', e); })
 * 
 *   catch (e) { console.warn('[DEX]', e); }
 *   → catch (e: unknown) { console.warn('[DEX]', e); }
 *   (only in .ts/.tsx files, not applicable for catch blocks — TypeScript 4.0+ uses `unknown` by default for catch)
 *   Actually catch clause variables are typed automatically. The issue is with .catch() arrow params.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const EXTENSIONS = ['.ts', '.tsx'];

// Fix .catch((e) => ... — the arrow function param needs typing
const patterns = [
  {
    // .catch((e) => { console.warn('[DEX]', e); })
    pattern: /\.catch\(\(e\)\s*=>/g,
    replacement: '.catch((e: unknown) =>',
  },
  {
    // .catch((_) => { console.warn('[DEX]', _); })
    pattern: /\.catch\(\(_\)\s*=>/g,
    replacement: '.catch((_: unknown) =>',
  },
];

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      walkDir(fullPath, callback);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      callback(fullPath);
    }
  }
}

let totalFixed = 0;
let filesModified = 0;

walkDir(srcDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let count = 0;
  
  for (const { pattern, replacement } of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      count += matches.length;
      content = content.replace(pattern, replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), filePath);
    console.log(`  Typed ${count} catch param(s) in ${rel}`);
    totalFixed += count;
    filesModified++;
  }
});

console.log(`\nDone: Typed ${totalFixed} catch parameters across ${filesModified} files.`);
