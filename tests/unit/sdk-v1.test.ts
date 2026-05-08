import { describe, it, expect } from 'vitest';
import { isHostV1Compatible, SDK_VERSION, type DexHostInfo } from '../../src/shared/plugin/sdk/v1';

describe('SDK v1 surface', () => {
  it('compat check accepts v1 hosts', () => {
    expect(isHostV1Compatible({ sdkVersion: '1.4.0' })).toBe(true);
  });
  it('compat check rejects v2 hosts', () => {
    expect(isHostV1Compatible({ sdkVersion: '2.0.0' })).toBe(false);
  });
  it('SDK_VERSION pinned', () => {
    expect(SDK_VERSION).toBe('1.0.0');
    const info: DexHostInfo = { hostVersion: '4.1.1', sdkVersion: SDK_VERSION, platform: 'win', sandboxed: true };
    expect(info.sdkVersion).toBe('1.0.0');
  });
});
