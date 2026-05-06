// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================

import { DATA_POLICY_VERSION, getRequiredPolicyVersions } from '../../shared/policies';

export const POLICY_ACCEPTANCE_STORAGE_KEY = 'dex-policy-acceptance-v2';
export const OPTIONAL_ANALYTICS_STORAGE_KEY = 'dex-optional-analytics-enabled';

export interface PolicyAcceptanceRecord {
  acceptedAt: string;
  appVersion: string;
  dataPolicyVersion: string;
  policies: Record<string, string>;
}

function readAppVersion(): string {
  try {
    return (import.meta as any).env?.VITE_APP_VERSION || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function readPolicyAcceptance(): PolicyAcceptanceRecord | null {
  try {
    const raw = localStorage.getItem(POLICY_ACCEPTANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PolicyAcceptanceRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentPolicies(record = readPolicyAcceptance()): boolean {
  if (!record) return false;
  if (record.dataPolicyVersion !== DATA_POLICY_VERSION) return false;
  const required = getRequiredPolicyVersions();
  return Object.entries(required).every(([slug, version]) => record.policies?.[slug] === version);
}

export function acceptCurrentPolicies(): PolicyAcceptanceRecord {
  const record: PolicyAcceptanceRecord = {
    acceptedAt: new Date().toISOString(),
    appVersion: readAppVersion(),
    dataPolicyVersion: DATA_POLICY_VERSION,
    policies: getRequiredPolicyVersions(),
  };
  localStorage.setItem(POLICY_ACCEPTANCE_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function clearPolicyAcceptance(): void {
  localStorage.removeItem(POLICY_ACCEPTANCE_STORAGE_KEY);
}

export function isOptionalAnalyticsEnabled(): boolean {
  try {
    return localStorage.getItem(OPTIONAL_ANALYTICS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOptionalAnalyticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(OPTIONAL_ANALYTICS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // storage unavailable
  }
}
