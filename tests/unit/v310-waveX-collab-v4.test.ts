// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX v3.10.0 wave X - collab v4 tests
import { describe, expect, it } from 'vitest';
import {
  applySeqOps, canAccess, diffBlocks, emptyOrSet, hashTree, isShareLinkValid, lockExpired,
  mergeLww, mergeStrokes, orderMessages, orSetAdd, orSetRemove, orSetValues, otCompose,
  pickColdTier, planChunks, tallyPoll,
} from '../../src/shared/collab/v4';

const h = (s: string) => `H(${s})`;

describe('wave X collab v4', () => {
  it('LWW takes higher ts; tiebreaks by replicaId', () => {
    expect(mergeLww({value:1,ts:1,replicaId:'a'},{value:2,ts:2,replicaId:'b'}).value).toBe(2);
    expect(mergeLww({value:1,ts:1,replicaId:'b'},{value:2,ts:1,replicaId:'a'}).value).toBe(1);
  });
  it('OR-set add/remove semantics', () => {
    let s = emptyOrSet<string>();
    s = orSetAdd(s, 'x', 't1');
    s = orSetAdd(s, 'y', 't2');
    s = orSetRemove(s, 'x');
    expect(orSetValues(s)).toEqual(['y']);
    s = orSetAdd(s, 'x', 't3');
    expect(orSetValues(s).sort()).toEqual(['x','y']);
  });
  it('text seq ops apply in order', () => {
    const out = applySeqOps('', [
      { kind: 'insert', pos: 0, char: 'a', ts: 1, replicaId: 'r1' },
      { kind: 'insert', pos: 1, char: 'b', ts: 2, replicaId: 'r1' },
      { kind: 'insert', pos: 2, char: 'c', ts: 3, replicaId: 'r1' },
    ]);
    expect(out).toBe('abc');
  });
  it('OT compose concatenates ops', () => {
    expect(otCompose([{retain:1}], [{insert:'x'}]).length).toBe(2);
  });
  it('ACL respects permission ranks', () => {
    const acl = [{ userId:'u1', permission:'write' as const }, { userId:'*', permission:'read' as const }];
    expect(canAccess(acl, 'u1', 'read')).toBe(true);
    expect(canAccess(acl, 'u1', 'admin')).toBe(false);
    expect(canAccess(acl, 'u2', 'read')).toBe(true);
    expect(canAccess(acl, 'u2', 'write')).toBe(false);
  });
  it('share link validity', () => {
    const link = { token:'t', expiresAt: 100, password:'pw', allowedDomains:['acme.com'] };
    expect(isShareLinkValid(link, 50, 'pw', 'acme.com')).toBe(true);
    expect(isShareLinkValid(link, 200, 'pw', 'acme.com')).toBe(false);
    expect(isShareLinkValid(link, 50, 'wrong', 'acme.com')).toBe(false);
    expect(isShareLinkValid(link, 50, 'pw', 'evil.com')).toBe(false);
  });
  it('chunk planner', () => {
    const c = planChunks(2500, 1000);
    expect(c.length).toBe(3);
    expect(c[2].size).toBe(500);
  });
  it('hash tree builds nodes', () => {
    const t = hashTree(['a','b','c','d'], h);
    expect(t.length).toBeGreaterThan(4);
  });
  it('diffBlocks finds changes', () => {
    expect(diffBlocks(['a','b','c'], ['a','x','c'])).toEqual([1]);
    expect(diffBlocks(['a'], ['a','b'])).toEqual([1]);
  });
  it('cold tier finds stale files', () => {
    const cold = pickColdTier([{id:'a',lastAccessedAt:0,sizeBytes:1},{id:'b',lastAccessedAt:1e9,sizeBytes:1}], 86400 * 365);
    expect(cold).toEqual(['a']);
  });
  it('lock expiry', () => {
    expect(lockExpired({fileId:'f',ownerId:'u',lastHeartbeat:0}, 100000)).toBe(true);
    expect(lockExpired({fileId:'f',ownerId:'u',lastHeartbeat:99999}, 100000)).toBe(false);
  });
  it('order messages by ts then id', () => {
    const m = orderMessages([
      {id:'b',ts:2,from:'u',text:'x'},
      {id:'a',ts:2,from:'u',text:'y'},
      {id:'c',ts:1,from:'u',text:'z'},
    ]);
    expect(m.map((x) => x.id)).toEqual(['c','a','b']);
  });
  it('poll tally dedupes user', () => {
    const t = tallyPoll([{userId:'u1',option:'A'},{userId:'u1',option:'B'},{userId:'u2',option:'A'}]);
    expect(t.A).toBe(2); expect(t.B).toBeUndefined();
  });
  it('whiteboard merges strokes', () => {
    const a = [{id:'s1',points:[],color:'#000',width:1,ts:1}];
    const b = [{id:'s1',points:[],color:'#000',width:1,ts:1},{id:'s2',points:[],color:'#000',width:1,ts:2}];
    expect(mergeStrokes(a, b).length).toBe(2);
  });
});
