// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 15 — Release Readiness Audit
 * ----------------------------------------------------------------------------
 * Pure functions the build pipeline can invoke to assert no shell-language
 * regressions slipped in: forbidden tokens (placeholder copy, dev-only
 * markers), hardcoded colors that should be tokens, and orphan z-index
 * values outside the documented buckets.
 */

export interface AuditFinding {
    file: string;
    line: number;
    rule: string;
    excerpt: string;
}

export interface AuditReport {
    findings: AuditFinding[];
    /** Total files scanned (caller-provided count for context). */
    filesScanned: number;
    /** True iff there are no findings. */
    clean: boolean;
}

export interface SourceFile {
    path: string;
    text: string;
}

export interface AuditConfig {
    /** Substrings that are never allowed in shipped source. */
    forbiddenSubstrings: string[];
    /** Regex of color literals that should be CSS tokens, not inline. */
    inlineColorRe: RegExp;
    /** Allowed z-index integers; anything else is flagged. */
    allowedZIndices: ReadonlyArray<number>;
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
    forbiddenSubstrings: ['TODO_BLOCKER', 'XXX:', 'PLACEHOLDER_COPY'],
    inlineColorRe: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/,
    allowedZIndices: [0, 1, 10, 50, 100, 500, 1000, 1500, 2000, 5000, 9000, 9999],
};

export function auditSources(files: SourceFile[], config: AuditConfig = DEFAULT_AUDIT_CONFIG): AuditReport {
    const findings: AuditFinding[] = [];
    for (const file of files) {
        const lines = file.text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            for (const needle of config.forbiddenSubstrings) {
                if (line.includes(needle)) {
                    findings.push({
                        file: file.path,
                        line: i + 1,
                        rule: 'forbidden-substring',
                        excerpt: line.trim(),
                    });
                }
            }

            const zMatch = /z-?index\s*:\s*(-?\d+)/i.exec(line);
            if (zMatch) {
                const z = Number.parseInt(zMatch[1], 10);
                if (Number.isFinite(z) && !config.allowedZIndices.includes(z)) {
                    findings.push({
                        file: file.path,
                        line: i + 1,
                        rule: 'orphan-z-index',
                        excerpt: line.trim(),
                    });
                }
            }

            // Only flag inline colors inside obvious `style={{...}}` or `style="..."`.
            if (/style\s*[:=]/.test(line) && config.inlineColorRe.test(line)) {
                findings.push({
                    file: file.path,
                    line: i + 1,
                    rule: 'inline-color',
                    excerpt: line.trim(),
                });
            }
        }
    }
    return {
        findings,
        filesScanned: files.length,
        clean: findings.length === 0,
    };
}
