// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
#!/usr/bin/env node
/**
 * Codemod: Replace empty catch blocks with proper error logging.
 * 
 * Transforms:
 *   .catch(() => {})  →  .catch((e) => { console.warn('[DEX]', e); })
 *   catch {}           →  catch (e) { console.warn('[DEX]', e); }
 *   catch (e) {}       →  catch (e) { console.warn('[DEX]', e); }
 *   catch (_) {}       →  catch (_) { console.warn('[DEX]', _); }
 * 
 * Run: node scripts/fix-empty-catches.js
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

const EXTENSIONS = ['.ts', '.tsx'];

// Patterns and their replacements
const replacements = [
  // .catch(() => {}) — arrow with parens
  { pattern: /\.catch\(\(\)\s*=>\s*\{\s*\}\)/g, replacement: '.catch((e) => { console.warn(\'[DEX]\', e); })' },
  // .catch(() => { }) — arrow with space inside
  { pattern: /\.catch\(\(\)\s*=>\s*\{\s+\}\)/g, replacement: '.catch((e) => { console.warn(\'[DEX]\', e); })' },
  // catch {} — bare catch no param
  { pattern: /\bcatch\s*\{\s*\}/g, replacement: 'catch (e) { console.warn(\'[DEX]\', e); }' },
  // catch { } — bare catch with space
  { pattern: /\bcatch\s*\{\s+\}/g, replacement: 'catch (e) { console.warn(\'[DEX]\', e); }' },
  // catch (e) {} — catch with param empty body
  { pattern: /\bcatch\s*\(\s*(\w+)\s*\)\s*\{\s*\}/g, replacement: 'catch ($1) { console.warn(\'[DEX]\', $1); }' },
  // catch (e) { } — catch with param space body
  { pattern: /\bcatch\s*\(\s*(\w+)\s*\)\s*\{\s+\}/g, replacement: 'catch ($1) { console.warn(\'[DEX]\', $1); }' },
  // catch (_) {} — underscore param
  { pattern: /\bcatch\s*\(\s*_\s*\)\s*\{\s*\}/g, replacement: 'catch (_) { console.warn(\'[DEX]\', _); }' },
];

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
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
  let fileFixCount = 0;

  for (const { pattern, replacement } of replacements) {
    const matches = content.match(pattern);
    if (matches) {
      fileFixCount += matches.length;
      content = content.replace(pattern, replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), filePath);
    console.log(`  Fixed ${fileFixCount} catch block(s) in ${rel}`);
    totalFixed += fileFixCount;
    filesModified++;
  }
});

console.log(`\nDone: Fixed ${totalFixed} empty catch blocks across ${filesModified} files.`);
