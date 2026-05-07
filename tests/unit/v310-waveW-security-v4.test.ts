// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// DEX v3.10.0 wave W - security v4 tests
import { describe, expect, it } from 'vitest';
import {
  attemptUnlock, buildMerkleRoot, buildWebAuthnChallenge, bumpSignCount, canRecover,
  compliancePosture, describeKemCiphertextSize, describeKemPublicKeySize,
  describeSignSignatureSize, diffFim, evaluateBehaviour, evaluateFirewall, extendPcr,
  impossibleTravel, isChallengeValid, recommendArgon2, scanForDlp, shouldBlockTraffic,
  tlsPinMatches,
} from '../../src/shared/security/v4';

const concat = (a: string, b: string) => `H(${a}|${b})`;

describe('wave W security v4', () => {
  it('webauthn challenge ttl', () => {
    const c = buildWebAuthnChallenge('rp', 'u', 'abc', 1000, 5000);
    expect(isChallengeValid(c, 5000)).toBe(true);
    expect(isChallengeValid(c, 9999)).toBe(false);
  });
  it('PCR extend updates value', () => {
    const b = extendPcr({ bank: 0, values: ['init'] }, 'measurement', concat);
    expect(b.values[0]).toBe('H(init|measurement)');
  });
  it('passkey sign count bump', () => {
    const k = bumpSignCount({ id:'i', rpId:'r', userHandle:'u', createdAt:0, signCount:1 });
    expect(k.signCount).toBe(2);
  });
  it('argon2 stronger for higher target', () => {
    expect(recommendArgon2(1000).memoryKb).toBeGreaterThan(recommendArgon2(100).memoryKb);
  });
  it('shamir threshold check', () => {
    expect(canRecover([{index:1,value:'a'},{index:2,value:'b'},{index:3,value:'c'}], 3)).toBe(true);
    expect(canRecover([{index:1,value:'a'},{index:2,value:'b'}], 3)).toBe(false);
  });
  it('merkle root deterministic', () => {
    const r1 = buildMerkleRoot(['a','b','c','d'], concat);
    const r2 = buildMerkleRoot(['a','b','c','d'], concat);
    expect(r1).toBe(r2);
    expect(r1.length).toBeGreaterThan(0);
  });
  it('FIM diff', () => {
    const d = diffFim([{path:'/a',hash:'1'},{path:'/b',hash:'2'}], [{path:'/a',hash:'9'},{path:'/c',hash:'3'}]);
    expect(d.added).toEqual(['/c']);
    expect(d.removed).toEqual(['/b']);
    expect(d.changed).toEqual(['/a']);
  });
  it('behaviour rules fire', () => {
    const fired = evaluateBehaviour(
      [{ kind: 'login', ts: 1 }, { kind: 'login', ts: 2 }, { kind: 'login', ts: 3 }],
      [{ name: 'burst', severity: 'medium', predicate: (e) => e.length >= 3 }],
    );
    expect(fired).toEqual([{ name: 'burst', severity: 'medium' }]);
  });
  it('impossible travel detector', () => {
    expect(impossibleTravel({ts:0,lat:0,lon:0},{ts:60,lat:50,lon:50})).toBe(true);
    expect(impossibleTravel({ts:0,lat:0,lon:0},{ts:36000,lat:0,lon:0.01})).toBe(false);
  });
  it('DLP scan finds patterns', () => {
    const out = scanForDlp('card 4111-1111-1111-1111 here', [{ name:'card', pattern: /\d{4}-\d{4}-\d{4}-\d{4}/g, action: 'block' }]);
    expect(out[0].matches.length).toBe(1);
  });
  it('panic mode duress vs real vs destroy', () => {
    let s = { realPin:'1234', duressPin:'9999', selfDestructAfter:3, failedAttempts:0 };
    expect(attemptUnlock(s, '9999').result).toBe('duress');
    expect(attemptUnlock(s, '1234').result).toBe('ok');
    s = attemptUnlock(s, 'x').nextState;
    s = attemptUnlock(s, 'x').nextState;
    const r = attemptUnlock(s, 'x');
    expect(r.result).toBe('destroyed');
  });
  it('compliance posture aggregates', () => {
    const p = compliancePosture([
      { id:'c1', tags:['HIPAA','SOC2'], passing:true },
      { id:'c2', tags:['HIPAA'], passing:false },
    ]);
    expect(p.HIPAA.total).toBe(2);
    expect(p.HIPAA.passing).toBe(1);
    expect(p.SOC2.score).toBe(1);
    expect(p.PCI.score).toBe(1);
  });
  it('TLS pin', () => {
    expect(tlsPinMatches('abc', ['abc','def'])).toBe(true);
    expect(tlsPinMatches('zzz', ['abc'])).toBe(false);
  });
  it('firewall rules + default deny', () => {
    expect(evaluateFirewall('app1','host.com',[{app:'app1',host:'host.com',verdict:'allow'}])).toBe('allow');
    expect(evaluateFirewall('app1','evil.com',[])).toBe('deny');
    expect(evaluateFirewall('app1','sub.host.com',[{app:'*',host:'host.com',verdict:'allow'}])).toBe('allow');
  });
  it('VPN kill switch blocks when down', () => {
    expect(shouldBlockTraffic({ vpnUp:false, killSwitch:true })).toBe(true);
    expect(shouldBlockTraffic({ vpnUp:true, killSwitch:true })).toBe(false);
  });
  it('post-quantum sizes', () => {
    expect(describeKemPublicKeySize()).toBe(1184);
    expect(describeKemCiphertextSize()).toBe(1088);
    expect(describeSignSignatureSize()).toBe(2420);
  });
});
