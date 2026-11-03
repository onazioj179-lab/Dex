import { describe, it, expect, vi } from 'vitest';
vi.mock('maplibre-gl', () => ({ default: {}, Map: class {}, Marker: class {} }));
import { geocode, locationErrorMessage } from '../../src/renderer/DEXAPPLICATIONS/standalone/Maps';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('Maps geocode: failures are not "no places found"', () => {
  it('maps real results and drops malformed rows', async () => {
    const f = vi.fn(async () => res(200, { results: [
      { name: 'Lagos', latitude: 6.45, longitude: 3.39, admin1: 'Lagos', country: 'Nigeria' },
      { name: 'Broken', latitude: 'x', longitude: 1 },
    ] }));
    const out = await geocode('lagos', f as unknown as typeof fetch);
    expect(out.error).toBeNull();
    expect(out.results).toEqual([{ name: 'Lagos', lat: 6.45, lon: 3.39, detail: 'Lagos, Nigeria' }]);
  });

  it('an empty answer is no results, not an error', async () => {
    const out = await geocode('zzzz', (async () => res(200, {})) as unknown as typeof fetch);
    expect(out).toEqual({ results: [], error: null });
  });

  it('an HTTP failure or network error is reported as an error', async () => {
    expect((await geocode('x', (async () => res(503, {})) as unknown as typeof fetch)).error).toBe('service');
    expect((await geocode('x', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch)).error).toMatch(/offline|service/);
  });

  it('does not call the network for a blank query', async () => {
    const f = vi.fn();
    expect(await geocode('   ', f as unknown as typeof fetch)).toEqual({ results: [], error: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('explains each geolocation failure', () => {
    expect(locationErrorMessage(1)).toMatch(/denied/);
    expect(locationErrorMessage(3)).toMatch(/too long/);
    expect(locationErrorMessage(2)).toMatch(/not available/);
  });
});
