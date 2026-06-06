// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Third-party integration registry (GOAL-6D) — one framework for connecting
 * external services (GitHub/Figma/Slack/Gmail/Drive/Notion/...). Declares each
 * integration's category + auth type so the settings UI can render them
 * uniformly. Pure data + lookups; testable.
 */

export type IntegrationCategory = 'vcs' | 'design' | 'communication' | 'storage' | 'productivity';
export type AuthType = 'oauth' | 'token' | 'apikey';

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  auth: AuthType;
}

export const INTEGRATIONS: Integration[] = [
  { id: 'github', name: 'GitHub', category: 'vcs', auth: 'oauth' },
  { id: 'gitlab', name: 'GitLab', category: 'vcs', auth: 'oauth' },
  { id: 'figma', name: 'Figma', category: 'design', auth: 'oauth' },
  { id: 'discord', name: 'Discord', category: 'communication', auth: 'oauth' },
  { id: 'slack', name: 'Slack', category: 'communication', auth: 'oauth' },
  { id: 'gmail', name: 'Gmail', category: 'communication', auth: 'oauth' },
  { id: 'outlook', name: 'Outlook', category: 'communication', auth: 'oauth' },
  { id: 'gdrive', name: 'Google Drive', category: 'storage', auth: 'oauth' },
  { id: 'dropbox', name: 'Dropbox', category: 'storage', auth: 'oauth' },
  { id: 'notion', name: 'Notion', category: 'productivity', auth: 'token' },
];

const BY_ID = new Map(INTEGRATIONS.map((i) => [i.id, i]));

export function getIntegration(id: string): Integration | undefined {
  return BY_ID.get(id);
}

export function listByCategory(category: IntegrationCategory): Integration[] {
  return INTEGRATIONS.filter((i) => i.category === category);
}

/** Validate a connection request against the registry. */
export function validateConnection(id: string, credential: string): { ok: boolean; error?: string } {
  const integ = getIntegration(id);
  if (!integ) return { ok: false, error: `unknown integration: ${id}` };
  if (!credential || credential.trim() === '') {
    return { ok: false, error: `${integ.name} requires a ${integ.auth} credential` };
  }
  return { ok: true };
}
