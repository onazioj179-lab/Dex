// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Publish service (DEX Developer Platform — E3). Runs the pre-publish
 * validation gate over a real signed envelope (composing the existing
 * verifySignedPackage, verifyEnvelope/scanFiles, validateManifestV2, the
 * publisher registry, and the capability audit) and, on success, upserts a
 * catalog entry with its validation status + publisher. Thin adapter over the
 * pure shared modules.
 *
 * IPC:
 *   store:publish:validate (envelope)        -> ValidationReport
 *   store:publish:submit   (envelope, opts)  -> { ok, status, reason?, report }
 */

import { app, ipcMain } from 'electron';
import * as path from 'path';
import { evaluateAppValidation, type ValidationInput, type ValidationReport } from '../../shared/store/validationGate';
import { planPublish } from '../../shared/store/publishPipeline';
import { undeclaredSensitive } from '../../shared/store/capabilityExplain';
import type { CatalogEntry } from '../../shared/store/catalog';
import type { DexPkgManifestV2 } from '../../shared/dexpkg/manifestV2';
import { validateManifestV2 } from '../../shared/dexpkg/manifestV2';
import { verifySignedPackage } from '../security/codeSigningGate';
import { loadTrustStore } from '../security/trustStore';
import { verifyEnvelope } from '../plugins/PluginPublisher';
import { publisherByKeyId } from './PublisherService';
import { upsertCatalogEntry } from './AppStoreService';

const TRUST_FILE = (): string => path.join(app.getPath('userData'), 'dex-trust-store.json');
const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

interface SubmitOptions { bundleUrl?: string; iconUrl?: string; requireApproved?: boolean }

function bundleBytes(files: Record<string, string>): number {
  let n = 0;
  for (const b of Object.values(files || {})) n += Buffer.from(b, 'base64').length;
  return n;
}

/** Compute the validation report for a signed dexplug envelope. */
export function validateEnvelope(envelope: any): ValidationReport {
  const manifest = (envelope && envelope.manifest) || {};
  const files: Record<string, string> = (envelope && envelope.files) || {};
  const block = envelope && envelope.signature;

  const manifestIssues = validateManifestV2(manifest);
  const gate = verifySignedPackage(envelope, loadTrustStore(TRUST_FILE()));
  const env = verifyEnvelope(envelope);
  const publisherKnown = !!(block && block.keyId && publisherByKeyId(block.keyId));
  const declaredCaps: string[] = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];

  const input: ValidationInput = {
    manifestIssues,
    signatureOk: gate.ok,
    signatureReason: gate.reason,
    integrityOk: env.sha256Ok,
    scanIssues: env.scanIssues.map((s) => ({ file: s.file, line: s.line, reason: s.reason })),
    // Static capability-usage analysis is a backlog item; until then no
    // undeclared use can be detected (callers pass [] for "used").
    undeclaredSensitiveCaps: undeclaredSensitive([], declaredCaps),
    publisherKnown,
    sizeBytes: bundleBytes(files),
    maxSizeBytes: MAX_BUNDLE_BYTES,
    metadata: {
      name: manifest.name,
      description: manifest.description,
      hasCategory: Array.isArray(manifest.categories) && manifest.categories.length > 0,
      hasContentRating: typeof manifest.contentRating === 'string',
      hasIcon: !!manifest.icon,
    },
  };
  return evaluateAppValidation(input);
}

export interface SubmitResult { ok: boolean; status: ValidationReport['status']; reason?: string; report: ValidationReport }

/** Validate + (on approval) upsert a catalog entry for a signed envelope. */
export function submit(envelope: any, opts: SubmitOptions = {}): SubmitResult {
  const report = validateEnvelope(envelope);
  const manifest = (envelope && envelope.manifest) || {};
  const packageId: string = manifest.packageId || manifest.id || '';
  const version: string = manifest.packageVersion || manifest.version || '';
  const block = envelope && envelope.signature;

  const plan = planPublish({
    packageId, version,
    hasSignature: !!(block && block.signature),
    validation: report,
    requireApproved: opts.requireApproved,
  });
  if (!plan.ok) return { ok: false, status: report.status, reason: plan.reason, report };

  const publisher = block && block.keyId ? publisherByKeyId(block.keyId) : undefined;
  const entry: CatalogEntry = {
    manifest: manifest as DexPkgManifestV2,
    bundleUrl: opts.bundleUrl ?? '',
    bundleBytes: bundleBytes((envelope && envelope.files) || {}),
    bundleSha256: (envelope && envelope.published && envelope.published.sha256) || '',
    iconUrl: opts.iconUrl,
    publisherId: publisher?.id,
    validationStatus: report.status,
    validationReport: report,
  };
  upsertCatalogEntry(entry);
  return { ok: true, status: report.status, report };
}

export function registerPublishIpc(): void {
  ipcMain.handle('store:publish:validate', (_e, envelope: unknown) => validateEnvelope(envelope));
  ipcMain.handle('store:publish:submit', (_e, envelope: unknown, opts?: SubmitOptions) => submit(envelope, opts ?? {}));
}
