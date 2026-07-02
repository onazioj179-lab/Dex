// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Unit tests for the injectable ad-block content script generator
 * (adblockContentScript). Verifies: off-toggles produce nothing, the script is
 * a self-contained IIFE embedding the domains, hostile entries can't break out
 * of the string, and — by evaluating the embedded matcher in a stub page
 * context — that fetch/XHR/beacon to blocked hosts are actually aborted while
 * legit requests pass.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildAdblockScript, ADBLOCK_CONSOLE_PREFIX } from '../../src/renderer/DEXAPPLICATIONS/browser/adblockContentScript';

const domains = ['doubleclick.net', 'google-analytics.com', 'facebook.com/tr'];
const both = { blockAds: true, blockTrackers: true };

describe('buildAdblockScript — structure', () => {
  it('returns empty when both toggles are off', () => {
    expect(buildAdblockScript(domains, { blockAds: false, blockTrackers: false })).toBe('');
  });

  it('produces a self-invoking function embedding the hosts', () => {
    const s = buildAdblockScript(domains, both);
    expect(s.startsWith('(function()')).toBe(true);
    expect(s.trimEnd().endsWith('})();')).toBe(true);
    expect(s).toContain('doubleclick.net');
    expect(s).toContain('MutationObserver');
    expect(s).toContain('window.fetch');
    expect(s).toContain(ADBLOCK_CONSOLE_PREFIX);
  });

  it('omits tracking patterns when trackers are off', () => {
    const s = buildAdblockScript(domains, { blockAds: true, blockTrackers: false });
    // PATTERNS array is empty
    expect(s).toContain('var PATTERNS = []');
  });

  it('safely encodes a hostile blocklist entry (no code breakout when evaluated)', () => {
    // A malicious entry tries to close the array literal and run code. JSON
    // encoding must keep it inert DATA. Prove it by evaluating the script in a
    // sandbox and asserting the payload never executed.
    const evil = ['evil.com"];globalThis.__pwned=1;//'];
    const s = buildAdblockScript(evil, both);
    const sandbox: any = { __dexAdblockInstalled: false, MutationObserver: class { observe() {} } };
    (globalThis as any).__pwned = undefined;
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'location', 'URL', 'setTimeout', 'console',
      `with(window){ ${s} }`)(
      sandbox, { documentElement: {}, addEventListener() {} }, { href: 'https://x.com/' },
      URL, (cb: () => void) => 0, { log() {} });
    expect((globalThis as any).__pwned).toBeUndefined(); // never executed
  });
});

/**
 * Evaluate the generated script inside a controlled fake window to prove the
 * behavior: blocked hosts abort, legit hosts pass. We stub only what the script
 * touches (fetch, XHR, sendBeacon, MutationObserver, document, location, URL).
 */
function runInFakeGuest(script: string) {
  const realFetch = vi.fn(() => Promise.resolve('OK'));
  const beaconReal = vi.fn(() => true);
  const xhrOpened: string[] = [];
  const xhrSent: string[] = [];

  class FakeXHR {
    _url = '';
    open(_m: string, u: string) { this._url = u; xhrOpened.push(u); }
    send() { xhrSent.push(this._url); }
  }

  const fakeWindow: any = {
    __dexAdblockInstalled: false,
    fetch: realFetch,
    XMLHttpRequest: FakeXHR,
    Image: function () { return { setAttribute() {}, getAttribute() { return ''; } }; },
    MutationObserver: class { observe() {} },
  };
  const fakeNavigator: any = { sendBeacon: beaconReal };
  const fakeDocument: any = {
    documentElement: {},
    addEventListener() {},
  };
  const fakeLocation = { href: 'https://news.example.com/' };

  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'window', 'navigator', 'document', 'location', 'URL', 'setTimeout', 'console',
    `with (window) { ${script} }`,
  );
  fn(fakeWindow, fakeNavigator, fakeDocument, fakeLocation, URL,
    (cb: () => void) => { cb(); return 0; }, { log() {} });

  return { fakeWindow, fakeNavigator, realFetch, beaconReal, xhrOpened, xhrSent };
}

describe('buildAdblockScript — behavior (evaluated)', () => {
  it('aborts fetch to a blocked host but passes legit ones', async () => {
    const { fakeWindow, realFetch } = runInFakeGuest(buildAdblockScript(domains, both));
    await expect(fakeWindow.fetch('https://doubleclick.net/ad.js')).rejects.toThrow(/Blocked by DEX/);
    expect(realFetch).not.toHaveBeenCalled();
    await expect(fakeWindow.fetch('https://api.example.com/data')).resolves.toBe('OK');
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks fetch to a subdomain of a blocked host', async () => {
    const { fakeWindow } = runInFakeGuest(buildAdblockScript(domains, both));
    await expect(fakeWindow.fetch('https://ads.g.doubleclick.net/x')).rejects.toThrow(/Blocked by DEX/);
  });

  it('suppresses XHR.send for a blocked host, allows others', () => {
    const { fakeWindow, xhrSent } = runInFakeGuest(buildAdblockScript(domains, both));
    const x1 = new fakeWindow.XMLHttpRequest();
    x1.open('GET', 'https://google-analytics.com/collect');
    x1.send();
    const x2 = new fakeWindow.XMLHttpRequest();
    x2.open('GET', 'https://cdn.example.com/app.js');
    x2.send();
    expect(xhrSent).toEqual(['https://cdn.example.com/app.js']);
  });

  it('drops sendBeacon to a blocked host but reports success (analytics no-op)', () => {
    const { fakeNavigator, beaconReal } = runInFakeGuest(buildAdblockScript(domains, both));
    expect(fakeNavigator.sendBeacon('https://google-analytics.com/collect', 'x')).toBe(true);
    expect(beaconReal).not.toHaveBeenCalled();
    fakeNavigator.sendBeacon('https://example.com/ok', 'y');
    expect(beaconReal).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — a second install is a no-op', () => {
    const script = buildAdblockScript(domains, both);
    const { fakeWindow, realFetch } = runInFakeGuest(script);
    const firstFetch = fakeWindow.fetch;
    // Re-run against the SAME window (already installed)
    // eslint-disable-next-line no-new-func
    new Function('window', `with(window){ ${script} }`)(fakeWindow);
    expect(fakeWindow.fetch).toBe(firstFetch); // not re-wrapped
    void realFetch;
  });
});
