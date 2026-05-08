// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  decidePermission,
  batchPrompts,
  buildGrant,
  pruneExpired,
  findActiveGrant,
  isPermissionCapability,
  PERMISSION_GROUPS,
  type PermissionGrant,
  type PermissionRequest,
} from '../../src/shared/permissions/permissionsPolicy';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

const sampleRequest: PermissionRequest = {
  capability: 'screen-record',
  origin: 'app:dexcode',
  reason: 'Recording a tutorial',
};

describe('permissionsPolicy', () => {
  it('prompts when no grant exists', () => {
    expect(decidePermission([], sampleRequest, NOW)).toBe('prompt');
  });

  it('allows when an unexpired allow grant exists', () => {
    const grants: PermissionGrant[] = [
      buildGrant(sampleRequest, 'allow', NOW - 1000, false),
    ];
    expect(decidePermission(grants, sampleRequest, NOW)).toBe('allow');
  });

  it('denies when a deny grant exists, even if other allow grants exist', () => {
    const grants: PermissionGrant[] = [
      buildGrant(sampleRequest, 'deny', NOW - 1000, false),
    ];
    expect(decidePermission(grants, sampleRequest, NOW)).toBe('deny');
  });

  it('prompts when grant has expired', () => {
    const expired: PermissionGrant = {
      ...buildGrant(sampleRequest, 'allow', NOW - 100 * HOUR, false),
      expiresAt: NOW - 1,
    };
    expect(decidePermission([expired], sampleRequest, NOW)).toBe('prompt');
  });

  it('treats expiresAt=0 as never expiring', () => {
    const forever: PermissionGrant = {
      ...buildGrant(sampleRequest, 'allow', NOW - 100 * HOUR, false),
      expiresAt: 0,
    };
    expect(decidePermission([forever], sampleRequest, NOW)).toBe('allow');
  });

  it('findActiveGrant scopes to (capability, origin)', () => {
    const grants: PermissionGrant[] = [
      buildGrant(sampleRequest, 'allow', NOW - 1000, false),
    ];
    expect(findActiveGrant(grants, 'screen-record', 'app:dexcode', NOW)).not.toBeNull();
    expect(findActiveGrant(grants, 'screen-record', 'app:other', NOW)).toBeNull();
    expect(findActiveGrant(grants, 'camera', 'app:dexcode', NOW)).toBeNull();
  });

  it('pruneExpired drops only expired entries', () => {
    const live = buildGrant(sampleRequest, 'allow', NOW, false);
    const dead: PermissionGrant = {
      ...buildGrant(sampleRequest, 'allow', NOW - 100 * HOUR, false),
      expiresAt: NOW - 1,
    };
    const pruned = pruneExpired([live, dead], NOW);
    expect(pruned).toHaveLength(1);
    expect(pruned[0]).toBe(live);
  });

  describe('batchPrompts', () => {
    it('groups capture group capabilities into one batch', () => {
      const requests: PermissionRequest[] = [
        { capability: 'screen-record', origin: 'app:dexcode', reason: 'rec' },
        { capability: 'camera', origin: 'app:dexcode', reason: 'rec' },
        { capability: 'microphone', origin: 'app:dexcode', reason: 'rec' },
      ];
      const result = batchPrompts([], requests, NOW);
      expect(result.allowed).toEqual([]);
      expect(result.denied).toEqual([]);
      expect(result.batches.capture).toEqual(['screen-record', 'camera', 'microphone']);
    });

    it('skips capabilities that already have an allow grant', () => {
      const grants: PermissionGrant[] = [
        buildGrant({ capability: 'camera', origin: 'app:x', reason: 'r' }, 'allow', NOW, false),
      ];
      const requests: PermissionRequest[] = [
        { capability: 'camera', origin: 'app:x', reason: 'r' },
        { capability: 'microphone', origin: 'app:x', reason: 'r' },
      ];
      const result = batchPrompts(grants, requests, NOW);
      expect(result.allowed).toEqual(['camera']);
      expect(result.batches.capture).toEqual(['microphone']);
    });

    it('places ungrouped capabilities under "individual"', () => {
      const requests: PermissionRequest[] = [
        { capability: 'biometric', origin: 'app:x', reason: 'r' },
        { capability: 'system-events', origin: 'app:x', reason: 'r' },
      ];
      const result = batchPrompts([], requests, NOW);
      expect(result.batches.individual).toContain('biometric');
      expect(result.batches.individual).toContain('system-events');
    });

    it('records denied separately', () => {
      const grants: PermissionGrant[] = [
        buildGrant({ capability: 'location', origin: 'app:x', reason: 'r' }, 'deny', NOW, false),
      ];
      const result = batchPrompts(grants, [{ capability: 'location', origin: 'app:x', reason: 'r' }], NOW);
      expect(result.denied).toEqual(['location']);
      expect(result.batches).toEqual({});
    });
  });

  it('buildGrant respects ttlMs override', () => {
    const g = buildGrant({ ...sampleRequest, ttlMs: 1000 }, 'allow', NOW, true);
    expect(g.expiresAt).toBe(NOW + 1000);
    expect(g.fromGroup).toBe(true);
  });

  it('buildGrant uses default TTL per capability when omitted', () => {
    const g = buildGrant(sampleRequest, 'allow', NOW, false);
    expect(g.expiresAt).toBeGreaterThan(NOW);
  });

  it('isPermissionCapability validates known + rejects unknown', () => {
    expect(isPermissionCapability('camera')).toBe(true);
    expect(isPermissionCapability('system-events')).toBe(true);
    expect(isPermissionCapability('not-a-thing')).toBe(false);
    expect(isPermissionCapability(42)).toBe(false);
    expect(isPermissionCapability(null)).toBe(false);
  });

  it('groups cover the expected sensitive surfaces', () => {
    expect(PERMISSION_GROUPS.capture).toContain('screen-record');
    expect(PERMISSION_GROUPS.capture).toContain('camera');
    expect(PERMISSION_GROUPS.capture).toContain('microphone');
    expect(PERMISSION_GROUPS.files).toContain('files-read');
    expect(PERMISSION_GROUPS.files).toContain('files-write');
  });
});
