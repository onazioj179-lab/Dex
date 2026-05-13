#!/usr/bin/env node
// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * release-audit.js
 *
 * Phase 15 ReleaseKit: scan src/ for shell-language regressions using
 * `auditSources()` from src/shared/phase15/releaseAudit.ts.
 *
 * Usage:
 *   node scripts/release-audit.js              # report only
 *   node scripts/release-audit.js --strict     # exit non-zero on findings
 *   node scripts/release-audit.js --top=50     # cap printed findings
 *
 * Exit codes: 0 = pass, 1 = findings + --strict, 2 = run error.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
// Scope: only the React renderer + shared modules. Main-process HTML string
// literals (error fallback pages, file-transfer pages) are not React JSX
// and would generate ~1100 false-positive inline-color findings.
const SCAN_DIRS = [
    path.join(ROOT, 'src', 'renderer'),
    path.join(ROOT, 'src', 'shared'),
];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', 'target', '.git', 'release-staging']);
const EXTS = ['.ts', '.tsx'];
// Files where rule definitions naturally contain forbidden substrings.
const SELF_EXCLUDE = new Set([
    'src/shared/phase15/releaseAudit.ts',
    'src/shared/phase15/index.ts',
]);

const STRICT = process.argv.includes('--strict');
const TOP = (() => {
    const arg = process.argv.find(a => a.startsWith('--top='));
    if (!arg) return 200;
    const n = Number.parseInt(arg.slice(6), 10);
    return Number.isFinite(n) && n > 0 ? n : 200;
})();

function collectFiles(dir) {
    const out = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (SKIP_DIRS.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...collectFiles(full));
        else if (EXTS.some(x => e.name.endsWith(x))) out.push(full);
    }
    return out;
}

const filePaths = SCAN_DIRS.flatMap(d => collectFiles(d));
if (filePaths.length === 0) {
    console.error('[release-audit] No source files found under', SCAN_DIRS.join(', '));
    process.exit(2);
}

console.log(`[release-audit] Scanning ${filePaths.length} files under ${SCAN_DIRS.length} root(s) ...`);

const sourceFiles = filePaths
    .map(p => ({
        path: path.relative(ROOT, p).replace(/\\/g, '/'),
        text: fs.readFileSync(p, 'utf8'),
    }))
    .filter(f => !SELF_EXCLUDE.has(f.path));

let auditSources;
let DEFAULT_AUDIT_CONFIG;
try {
    const builtPath = path.join(ROOT, 'dist', 'shared', 'phase15', 'releaseAudit.js');
    if (fs.existsSync(builtPath)) {
        ({ auditSources, DEFAULT_AUDIT_CONFIG } = require(builtPath));
    }
} catch { /* fall through */ }

if (typeof auditSources !== 'function') {
    DEFAULT_AUDIT_CONFIG = {
        forbiddenSubstrings: ['TODO_BLOCKER', 'XXX:', 'PLACEHOLDER_COPY'],
        inlineColorRe: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/,
        allowedZIndices: [0, 1, 10, 50, 100, 500, 1000, 1500, 2000, 5000, 9000, 9999],
    };
    auditSources = function inlineAudit(files, config) {
        const findings = [];
        for (const file of files) {
            const lines = file.text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const needle of config.forbiddenSubstrings) {
                    if (line.includes(needle)) {
                        findings.push({ file: file.path, line: i + 1, rule: 'forbidden-substring', excerpt: line.trim() });
                    }
                }
                const zMatch = /z-?index\s*:\s*(-?\d+)/i.exec(line);
                if (zMatch) {
                    const z = Number.parseInt(zMatch[1], 10);
                    if (Number.isFinite(z) && !config.allowedZIndices.includes(z)) {
                        findings.push({ file: file.path, line: i + 1, rule: 'orphan-z-index', excerpt: line.trim() });
                    }
                }
                if (/style\s*[:=]/.test(line) && config.inlineColorRe.test(line)) {
                    findings.push({ file: file.path, line: i + 1, rule: 'inline-color', excerpt: line.trim() });
                }
            }
        }
        return { findings, filesScanned: files.length, clean: findings.length === 0 };
    };
}

const t0 = Date.now();
const rawReport = auditSources(sourceFiles, DEFAULT_AUDIT_CONFIG);
const durationMs = Date.now() - t0;

// Post-filter: an "inline-color" finding is a false positive when every
// color literal on the line is wrapped inside a `var(--token, <color>)`
// fallback expression. Those are proper design-token usage.
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g;
function isAllInsideVarFallback(line) {
    const colorMatches = [...line.matchAll(COLOR_RE)].map(m => m.index);
    if (colorMatches.length === 0) return false;
    // For each color, check it sits inside the (...) of a `var(` further left.
    return colorMatches.every(idx => {
        const before = line.slice(0, idx);
        const lastVar = before.lastIndexOf('var(');
        if (lastVar === -1) return false;
        // Scan from lastVar onward and ensure parens are not yet closed at idx.
        let depth = 0;
        for (let k = lastVar + 3; k < idx; k++) {
            if (line[k] === '(') depth++;
            else if (line[k] === ')') depth--;
            if (depth <= 0 && k > lastVar + 3) return false;
        }
        return depth > 0;
    });
}

const report = {
    ...rawReport,
    findings: rawReport.findings.filter(f => {
        if (f.rule !== 'inline-color') return true;
        return !isAllInsideVarFallback(f.excerpt);
    }),
};
report.clean = report.findings.length === 0;

const counts = report.findings.reduce((acc, f) => {
    acc[f.rule] = (acc[f.rule] ?? 0) + 1;
    return acc;
}, {});

if (report.clean) {
    console.log(`[release-audit] Clean. Scanned ${report.filesScanned} files in ${durationMs}ms.`);
    process.exit(0);
}

console.log(`\n[release-audit] ${report.findings.length} finding(s) across ${report.filesScanned} files (${durationMs}ms)`);
for (const [rule, n] of Object.entries(counts)) {
    console.log(`  - ${rule}: ${n}`);
}

console.log(`\nTop ${Math.min(TOP, report.findings.length)} findings:\n`);
for (const f of report.findings.slice(0, TOP)) {
    const excerpt = f.excerpt.length > 120 ? f.excerpt.slice(0, 117) + '...' : f.excerpt;
    console.log(`  [${f.rule}] ${f.file}:${f.line}\n      ${excerpt}`);
}

process.exit(STRICT && report.findings.length > 0 ? 1 : 0);
