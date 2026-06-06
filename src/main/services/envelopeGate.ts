// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Envelope validation gate (DEX Developer Platform). Composes the existing
 * verifySignedPackage (trust-store signature check), verifyEnvelope (integrity
 * + forbidden-code scan), validateManifestV2, the publisher registry, and the
 * capability audit into a single ValidationReport for a signed `.dexplug`.
 *
 * Lives in its own module so BOTH the publish flow (PublishService) and the
 * local developer install (AppStoreService) can run the exact same gate without
 * a circular import (PublishService -> AppStoreService for the catalog upsert).
 */

import { app } from 'electron';
import * as path from 'path';
import { evaluateAppValidation, type ValidationInput, type ValidationReport } from '../../shared/store/validationGate';
import { undeclaredSensitive } from '../../shared/store/capabilityExplain';
import { validateManifestV2 } from '../../shared/dexpkg/manifestV2';
import { verifySignedPackage } from '../security/codeSigningGate';
import { loadTrustStore } from '../security/trustStore';
import { verifyEnvelope } from '../plugins/PluginPublisher';
import { publisherByKeyId } from './PublisherService';

export const TRUST_FILE = (): string => path.join(app.getPath('userData'), 'dex-trust-store.json');
export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

/** Total decoded size of an envelope's base64 file map. */
export function bundleBytes(files: Record<string, string>): number {
  let n = 0;
  for (const b of Object.values(files || {})) n += Buffer.from(b, 'base64').length;
  return n;
}

/** Compute the full validation report for a signed dexplug envelope. */
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
