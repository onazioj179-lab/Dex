// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Publish pipeline (DEX Developer Platform — E3). Pure planner that turns a
 * publish submission into an ordered, fail-closed step list (mirroring
 * planInstall's shape) and decides whether the app may go into the catalog.
 * Policy: an app must be signed AND its validation report must be `approved`
 * (the gate's `pending` and `rejected` never auto-publish). The main-process
 * PublishService runs the steps and upserts the catalog entry.
 */

import type { ValidationReport, ValidationStatus } from './validationGate';

export type PublishStep =
  | { kind: 'validate' }
  | { kind: 'require-signature' }
  | { kind: 'cosign'; role: 'cosign' }            // DEX co-sign (infra; release ceremony)
  | { kind: 'catalog-upsert'; packageId: string; version: string; status: ValidationStatus };

export interface PublishSubmission {
  packageId: string;
  version: string;
  hasSignature: boolean;
  validation: ValidationReport;
  /** Require an `approved` report to publish. Default true. */
  requireApproved?: boolean;
}

export type PublishResult =
  | { ok: true; status: ValidationStatus; steps: PublishStep[] }
  | { ok: false; reason: string; status: ValidationStatus };

export function planPublish(sub: PublishSubmission): PublishResult {
  const status = sub.validation.status;
  if (!sub.hasSignature) return { ok: false, reason: 'unsigned: a signature is required to publish', status };
  if (status === 'rejected') {
    return { ok: false, reason: `validation rejected: ${sub.validation.reasons.join('; ')}`, status };
  }
  const requireApproved = sub.requireApproved ?? true;
  if (requireApproved && status !== 'approved') {
    return { ok: false, reason: `validation not approved (${status}): ${sub.validation.reasons.join('; ')}`, status };
  }
  const steps: PublishStep[] = [
    { kind: 'validate' },
    { kind: 'require-signature' },
    { kind: 'cosign', role: 'cosign' },
    { kind: 'catalog-upsert', packageId: sub.packageId, version: sub.version, status },
  ];
  return { ok: true, status, steps };
}
