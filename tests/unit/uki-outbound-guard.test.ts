// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Credentials never reach a cloud AI provider: the request body is checked,
// not just the helper.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { askConfiguredLLM } from '../../src/renderer/uki/providers/connect';
import { setApiKey } from '../../src/renderer/uki/keystore';
import type { FetchLike } from '../../src/renderer/uki/providers/orchestrator';
import { guardOutbound, describeRemoved } from '../../src/renderer/uki/providers/outboundGuard';
import { redactHighConfidenceSecrets } from '../../src/shared/security/secretRedactor';

beforeEach(() => localStorage.clear());

const OPENAI_KEY = 'sk-proj-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6';
const GITHUB_TOKEN = 'ghp_' + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----';

describe('redactHighConfidenceSecrets', () => {
  it('removes provider keys, tokens and private keys', () => {
    const r = redactHighConfidenceSecrets(`key=${OPENAI_KEY} gh=${GITHUB_TOKEN}\n${PEM}\nAIza${'x'.repeat(35)}`);
    expect(r.text).not.toContain(OPENAI_KEY);
    expect(r.text).not.toContain(GITHUB_TOKEN);
    expect(r.text).not.toContain('BEGIN PRIVATE KEY');
    expect(r.removed.sort()).toEqual(['github-token', 'google-api-key', 'openai-key', 'private-key-block']);
  });

  it('leaves commit hashes, file hashes, uuids and prose alone', () => {
    const text = [
      'commit 3c52e029a1f04b7d8e9c0a1b2c3d4e5f6a7b8c9d',
      'sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      'id 550e8400e29b41d4a716446655440000',
      'skills like sk-learning matter',
    ].join('\n');
    expect(redactHighConfidenceSecrets(text)).toEqual({ text, removed: [] });
  });
});

describe('guardOutbound', () => {
  it('redacts every message for a cloud provider, including tool results', () => {
    const msgs = [
      { role: 'system' as const, content: 'You are UKI.' },
      { role: 'user' as const, content: `use ${OPENAI_KEY}` },
      { role: 'tool' as const, content: `.env\nGITHUB=${GITHUB_TOKEN}` },
    ];
    const r = guardOutbound(msgs as never, true);
    expect(JSON.stringify(r.messages)).not.toMatch(/sk-proj-|ghp_/);
    expect(r.removed).toEqual(['openai-key', 'github-token']);
    expect(msgs[1].content).toContain(OPENAI_KEY); // input not mutated
  });

  it('a local model gets the text as it is', () => {
    const msgs = [{ role: 'user' as const, content: `use ${OPENAI_KEY}` }];
    expect(guardOutbound(msgs as never, false).messages).toBe(msgs);
  });

  it('says what was removed', () => {
    expect(describeRemoved(['openai-key'], 'OpenAI')).toBe('Removed 1 OpenAI key before sending to OpenAI.');
    expect(describeRemoved(['github-token', 'github-token', 'private-key-block'], 'Anthropic'))
      .toBe('Removed 2 GitHub tokens and 1 private key before sending to Anthropic.');
  });
});

describe('the request that leaves the machine', () => {
  it('carries no credential and the user is told', async () => {
    setApiKey('openai', 'sk-test');
    let body = '';
    const capture: FetchLike = async (_url, init) => {
      body = init.body || '';
      return { ok: true, status: 200, json: async () => ({ model: 'gpt-4o', choices: [{ message: { content: 'ok' } }] }), text: async () => '' };
    };
    const toast = vi.fn();
    window.addEventListener('dex-toast', toast);
    await askConfiguredLLM(`why does ${OPENAI_KEY} fail?`, 'SYSTEM', {
      history: [{ role: 'user', content: PEM }],
      fetchImpl: capture,
    });
    window.removeEventListener('dex-toast', toast);
    expect(body).toContain('[REDACTED:openai-key]');
    expect(body).not.toContain(OPENAI_KEY);
    expect(body).not.toContain('BEGIN PRIVATE KEY');
    expect(toast).toHaveBeenCalledTimes(1);
    expect((toast.mock.calls[0][0] as CustomEvent).detail.message).toMatch(/^Removed 1 private key and 1 OpenAI key before sending to /);
  });
});
