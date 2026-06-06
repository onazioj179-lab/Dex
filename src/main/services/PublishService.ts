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

import { ipcMain } from 'electron';
import type { ValidationReport } from '../../shared/store/validationGate';
import { planPublish } from '../../shared/store/publishPipeline';
import type { CatalogEntry } from '../../shared/store/catalog';
import type { DexPkgManifestV2 } from '../../shared/dexpkg/manifestV2';
import { publisherByKeyId } from './PublisherService';
import { upsertCatalogEntry } from './AppStoreService';
import { validateEnvelope, bundleBytes } from './envelopeGate';

interface SubmitOptions { bundleUrl?: string; iconUrl?: string; requireApproved?: boolean }

// Re-exported so existing importers keep working; the gate itself lives in
// ./envelopeGate (shared by the local developer-install path in AppStoreService).
export { validateEnvelope };

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
