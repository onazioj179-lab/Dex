// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  validatePublisher, isVerified, recognitionBadge, publisherForKeyId, emptyPublisher,
  type PublisherProfile,
} from '../../src/shared/store/publisher';

const KEY = 'a'.repeat(16);
function pub(over: Partial<PublisherProfile> = {}): PublisherProfile {
  return { id: 'dex.app', name: 'DEX', keyIds: [KEY], verified: true, recognition: 'first-party', ...over };
}

describe('publisher model', () => {
  it('validatePublisher accepts a good profile and flags bad fields', () => {
    expect(validatePublisher(pub())).toEqual([]);
    expect(validatePublisher({ id: 'NotRevDNS', name: '', keyIds: ['xyz'], verified: 'no' }).length).toBeGreaterThan(0);
    expect(validatePublisher(null).length).toBeGreaterThan(0);
  });

  it('isVerified requires verified + at least one key', () => {
    expect(isVerified(pub())).toBe(true);
    expect(isVerified(pub({ verified: false }))).toBe(false);
    expect(isVerified(pub({ keyIds: [] }))).toBe(false);
    expect(isVerified(undefined)).toBe(false);
  });

  it('recognitionBadge reflects level; null when unverified', () => {
    expect(recognitionBadge(pub({ recognition: 'first-party' }))).toMatchObject({ label: 'DEX', level: 'first-party' });
    expect(recognitionBadge(pub({ recognition: 'partner' }))).toMatchObject({ label: 'Partner' });
    expect(recognitionBadge(pub({ recognition: undefined }))).toMatchObject({ label: 'Verified', level: 'recognized' });
    expect(recognitionBadge(pub({ verified: false }))).toBeNull();
  });

  it('publisherForKeyId finds the owner of a signing key', () => {
    const list = [pub(), pub({ id: 'com.other', keyIds: ['b'.repeat(16)] })];
    expect(publisherForKeyId(list, KEY)?.id).toBe('dex.app');
    expect(publisherForKeyId(list, 'c'.repeat(16))).toBeUndefined();
  });

  it('emptyPublisher is unverified with no keys', () => {
    expect(emptyPublisher('com.x', 'X')).toMatchObject({ id: 'com.x', name: 'X', keyIds: [], verified: false });
  });
});
