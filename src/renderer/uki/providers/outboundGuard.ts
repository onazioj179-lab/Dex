// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Last stop before a request leaves the machine. When the provider is a cloud
// service, credentials are removed from every message: what the user typed,
// the history, and tool results (a file UKI read may hold an API key or a
// private key). Only high-confidence patterns are removed, so commit hashes,
// file hashes and ids pass through untouched. The user is told what was
// removed; a local model gets the text as it is.
import type { ChatMessage } from './types';
import { redactHighConfidenceSecrets, type SecretFinding } from '../../../shared/security/secretRedactor';

const LABEL: Record<string, string> = {
  'aws-access-key': 'AWS access key', 'github-token': 'GitHub token', 'slack-token': 'Slack token',
  'stripe-key': 'Stripe key', jwt: 'sign-in token (JWT)', 'private-key-block': 'private key',
  'openai-key': 'OpenAI key', 'anthropic-key': 'Anthropic key', 'google-api-key': 'Google API key',
};

export interface GuardResult {
  messages: ChatMessage[];
  removed: SecretFinding['kind'][];
}

/** Strip credentials from messages bound for a cloud provider. Local: unchanged. */
export function guardOutbound(messages: ChatMessage[], cloud: boolean): GuardResult {
  if (!cloud) return { messages, removed: [] };
  const removed: SecretFinding['kind'][] = [];
  const out = messages.map((m) => {
    if (typeof m.content !== 'string' || !m.content) return m;
    const r = redactHighConfidenceSecrets(m.content);
    if (!r.removed.length) return m;
    removed.push(...r.removed);
    return { ...m, content: r.text };
  });
  return { messages: removed.length ? out : messages, removed };
}

/** One sentence for the user, e.g. "Removed 1 OpenAI key before sending to OpenAI." */
export function describeRemoved(removed: SecretFinding['kind'][], providerLabel: string): string {
  const counts = new Map<string, number>();
  for (const k of removed) counts.set(k, (counts.get(k) ?? 0) + 1);
  const parts = [...counts].map(([k, n]) => `${n} ${LABEL[k] ?? k}${n > 1 ? 's' : ''}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `Removed ${list} before sending to ${providerLabel}.`;
}

/** Guard + tell the user. Notices go through the shell's toast event. */
export function guardAndNotify(messages: ChatMessage[], provider: { label: string; requiresKey?: boolean }): ChatMessage[] {
  const { messages: out, removed } = guardOutbound(messages, !!provider.requiresKey);
  if (removed.length) {
    try {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'info', message: describeRemoved(removed, provider.label) } }));
    } catch { /* non-DOM environment */ }
  }
  return out;
}
