// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pre-publish app validation gate (DEX Developer Platform — E2). The single
 * source of truth for "is this app allowed to be published" — composed of the
 * checks an app MUST pass (Apple-review style). Pure + deterministic: the
 * caller (CLI `dex-codesign validate` or the in-app PublishService) computes
 * the raw signals using existing modules (validateManifestV2, codeSigningGate
 * verifySignedPackage, PluginPublisher scanFiles/verifyEnvelope, the publisher
 * registry) and passes them in; this function turns them into an ordered,
 * fail-closed checklist + status.
 *
 *   block check fails  -> rejected
 *   only warn fails    -> pending  (publishable after attention, not auto-approved)
 *   all pass           -> approved
 */

export type ValidationStatus = 'pending' | 'approved' | 'rejected';

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: 'block' | 'warn';
  detail?: string;
}

export interface ValidationReport {
  status: ValidationStatus;
  checks: ValidationCheck[];
  reasons: string[];
  evaluatedAt: number;
}

export interface ValidationInput {
  /** Issues from validateManifestV2 (empty = valid). */
  manifestIssues: string[];
  /** codeSigningGate.verifySignedPackage(...).ok */
  signatureOk: boolean;
  signatureReason?: string;
  /** Recomputed bundle digest matches the signed one and sha256 of files matches. */
  integrityOk: boolean;
  /** PluginPublisher.scanFiles results (empty = clean). */
  scanIssues: Array<{ file: string; line: number; reason: string }>;
  /** Sensitive capabilities the code/app uses but did NOT declare in the manifest. */
  undeclaredSensitiveCaps: string[];
  /** Declared capabilities that appear unused (warn only). */
  extraDeclaredCaps?: string[];
  /** The signing keyId resolves to a known publisher whose keyIds include it. */
  publisherKnown: boolean;
  sizeBytes: number;
  maxSizeBytes: number;
  metadata: { name?: string; description?: string; hasCategory?: boolean; hasContentRating?: boolean; hasIcon?: boolean };
  now?: number;
}

const SIZE_DEFAULT = 50 * 1024 * 1024; // 50 MB

export function evaluateAppValidation(input: ValidationInput): ValidationReport {
  const checks: ValidationCheck[] = [];
  const add = (id: string, label: string, passed: boolean, severity: 'block' | 'warn', detail?: string) =>
    checks.push({ id, label, passed, severity, detail });

  add('manifest-valid', 'Manifest is valid', input.manifestIssues.length === 0, 'block', input.manifestIssues[0]);
  add('signature', 'Signed by a trusted key', input.signatureOk, 'block', input.signatureOk ? undefined : input.signatureReason);
  add('integrity', 'Bundle is intact (no tampering)', input.integrityOk, 'block');
  add(
    'code-scan', 'No forbidden code patterns', input.scanIssues.length === 0, 'block',
    input.scanIssues[0] ? `${input.scanIssues[0].file}:${input.scanIssues[0].line} ${input.scanIssues[0].reason}` : undefined,
  );
  add(
    'capability-declared', 'All sensitive capabilities are declared',
    input.undeclaredSensitiveCaps.length === 0, 'block',
    input.undeclaredSensitiveCaps.length ? `undeclared: ${input.undeclaredSensitiveCaps.join(', ')}` : undefined,
  );
  add('publisher-known', 'Signing key belongs to a known publisher', input.publisherKnown, 'block');

  const maxSize = input.maxSizeBytes > 0 ? input.maxSizeBytes : SIZE_DEFAULT;
  add('size', 'Bundle within size limit', input.sizeBytes <= maxSize, 'block',
    input.sizeBytes <= maxSize ? undefined : `${input.sizeBytes} > ${maxSize} bytes`);

  // Warnings — keep an app out of auto-approve but do not block.
  const metaComplete = !!(input.metadata.name && input.metadata.description && input.metadata.hasCategory && input.metadata.hasContentRating);
  add('metadata', 'Complete store metadata', metaComplete, 'warn',
    metaComplete ? undefined : 'missing name/description/category/content-rating');
  add('icon', 'Has an icon', !!input.metadata.hasIcon, 'warn');
  if (input.extraDeclaredCaps && input.extraDeclaredCaps.length > 0) {
    add('extra-caps', 'No unused declared capabilities', false, 'warn', input.extraDeclaredCaps.join(', '));
  }

  const blockFails = checks.filter((c) => c.severity === 'block' && !c.passed);
  const warnFails = checks.filter((c) => c.severity === 'warn' && !c.passed);
  const status: ValidationStatus = blockFails.length > 0 ? 'rejected' : warnFails.length > 0 ? 'pending' : 'approved';
  const reasons = [...blockFails, ...warnFails].map((c) => (c.detail ? `${c.label}: ${c.detail}` : c.label));

  return { status, checks, reasons, evaluatedAt: input.now ?? Date.now() };
}

/** True when the validation report permits publishing (approved, or pending = soft). */
export function isApproved(report: ValidationReport): boolean {
  return report.status === 'approved';
}
