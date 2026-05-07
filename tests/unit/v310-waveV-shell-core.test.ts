// DEX v3.10.0 wave V - shell tests
import { describe, expect, it } from 'vitest';
import {
  aggregateProcesses, applySnapLayout, buildCaptureMetadata, computeNightShiftKelvin,
  createDesktop, detectHotCorner, dpiScaleFor, estimateMigrationTime, forceTouchActivation,
  moveWindowToDesktop, parseSpotlight, planSnapshotRetention, rankPeers, shouldAcceptHandoff,
  switchDesktop,
} from '../../src/shared/shell';

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

describe('wave V shell', () => {
  it('snap leftHalf', () => {
    expect(applySnapLayout(screen, 'leftHalf')).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
  });
  it('snap maximize', () => {
    expect(applySnapLayout(screen, 'maximize')).toEqual(screen);
  });
  it('snap thirds widths', () => {
    expect(applySnapLayout(screen, 'leftThird').width).toBeCloseTo(640, 4);
    expect(applySnapLayout(screen, 'rightTwoThird').width).toBeCloseTo(1280, 4);
  });
  it('virtual desktop create + switch + move', () => {
    let s = { desktops: [{ id: 'a', name: 'A', windowIds: [] as string[] }], activeId: 'a' };
    s = createDesktop(s, 'B', 'b');
    s = switchDesktop(s, 'b');
    expect(s.activeId).toBe('b');
    s = moveWindowToDesktop(s, 'win1', 'b');
    expect(s.desktops.find((d) => d.id === 'b')?.windowIds).toEqual(['win1']);
  });
  it('hot corner detection', () => {
    expect(detectHotCorner(0, 0, screen)).toBe('tl');
    expect(detectHotCorner(1919, 1079, screen)).toBe('br');
    expect(detectHotCorner(960, 540, screen)).toBeNull();
  });
  it('force touch threshold', () => {
    expect(forceTouchActivation(0.7)).toBe(true);
    expect(forceTouchActivation(0.5)).toBe(false);
  });
  it('spotlight parsing', () => {
    expect(parseSpotlight('2+3').action).toBe('calc');
    expect(parseSpotlight('5 km to mi').action).toBe('unit');
    expect(parseSpotlight('def: ephemeral').action).toBe('define');
    expect(parseSpotlight(':smile').action).toBe('emoji');
    expect(parseSpotlight('https://x').action).toBe('web');
    expect(parseSpotlight('/path/to/file').action).toBe('file');
    expect(parseSpotlight('Safari').action).toBe('open');
  });
  it('rank peers by RSSI', () => {
    const r = rankPeers([{id:'a',rssi:-80,name:'A'},{id:'b',rssi:-50,name:'B'}]);
    expect(r[0].id).toBe('b');
  });
  it('handoff TTL accept/reject', () => {
    expect(shouldAcceptHandoff({ app:'x', documentId:'d', cursor:0, ts: 100 }, 200, 5000)).toBe(true);
    expect(shouldAcceptHandoff({ app:'x', documentId:'d', cursor:0, ts: 100 }, 99999, 5000)).toBe(false);
  });
  it('capture metadata HDR vs SDR', () => {
    expect(buildCaptureMetadata(1920, 1080, true).colorPrimaries).toBe('rec2020');
    expect(buildCaptureMetadata(1920, 1080, false).transfer).toBe('srgb');
  });
  it('night shift kelvin', () => {
    // sunset at 18:00 (64800), sunrise at 6:00 (21600)
    expect(computeNightShiftKelvin(75600, 64800, 21600)).toBe(3400); // 21:00 night
    expect(computeNightShiftKelvin(43200, 64800, 21600)).toBe(6500); // 12:00 day
  });
  it('dpi scale', () => {
    expect(dpiScaleFor(3840, 2160, 15)).toBeGreaterThanOrEqual(2);
    expect(dpiScaleFor(1920, 1080, 24)).toBe(1);
  });
  it('aggregate processes', () => {
    const a = aggregateProcesses([{pid:1,cpuPercent:10,memBytes:1000},{pid:2,cpuPercent:20,memBytes:2000}]);
    expect(a.totalCpu).toBe(30); expect(a.totalMem).toBe(3000); expect(a.count).toBe(2);
  });
  it('snapshot retention keeps recent', () => {
    const now = 86400 * 30;
    const snaps = [];
    for (let i = 0; i < 60; i++) snaps.push(now - i * 3600);
    const keep = planSnapshotRetention(now, snaps);
    expect(keep.length).toBeGreaterThan(0);
  });
  it('migration time', () => {
    expect(estimateMigrationTime(1024 * 1024 * 8, 8)).toBeCloseTo(8, 0);
    expect(estimateMigrationTime(100, 0)).toBe(Infinity);
  });
});
