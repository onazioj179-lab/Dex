import { describe, it, expect } from 'vitest';
import { normalizeAddress } from '../../src/renderer/services/browserAddress';

const S = 'https://duckduckgo.com/?q=';
const n = (s: string) => normalizeAddress(s, S);

describe('Browser address bar', () => {
  it('loads http(s) URLs as typed', () => {
    expect(n('https://example.com/a?b=1')).toEqual({ kind: 'url', url: 'https://example.com/a?b=1' });
    expect(n('http://example.com')).toEqual({ kind: 'url', url: 'http://example.com/' });
  });

  it('adds https to bare domains, keeping ports and paths', () => {
    expect(n('example.com')).toEqual({ kind: 'url', url: 'https://example.com/' });
    expect(n('docs.example.co.uk/guide#x')).toEqual({ kind: 'url', url: 'https://docs.example.co.uk/guide#x' });
    expect(n('example.com:8443/x')).toEqual({ kind: 'url', url: 'https://example.com:8443/x' });
  });

  it('opens localhost and IP addresses over http instead of searching for them', () => {
    expect(n('localhost:5173')).toEqual({ kind: 'url', url: 'http://localhost:5173/' });
    expect(n('192.168.1.10/admin')).toEqual({ kind: 'url', url: 'http://192.168.1.10/admin' });
    expect(n('[::1]:8080')).toEqual({ kind: 'url', url: 'http://[::1]:8080/' });
  });

  it('searches for text, numbers and version strings', () => {
    expect(n('weather in lagos')).toEqual({ kind: 'search', url: `${S}weather%20in%20lagos` });
    expect(n('1.5')).toEqual({ kind: 'search', url: `${S}1.5` });
    expect(n('node v2.0 release')).toMatchObject({ kind: 'search' });
  });

  it('refuses script, data, file and other schemes', () => {
    for (const bad of ['javascript:alert(1)', ' JaVa script:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///C:/Windows/win.ini', 'chrome://settings', 'tauri://localhost', 'ms-settings:privacy']) {
      expect(n(bad).kind, bad).toBe('blocked');
    }
    expect(n('about:blank')).toEqual({ kind: 'url', url: 'about:blank' });
    expect(n('   ').kind).toBe('blocked');
  });
});
