import { describe, it, expect } from 'vitest';
import { classifyUrl, pickTabsToDiscard, downloadEta, type Tab, type BrowserProfile, type DownloadItem } from '../../src/shared/apps/browser/browserModel';
import { runSmartFolder, previewRename, type SmartFolder, type FileMeta } from '../../src/shared/apps/files/smartFolder';
import { extractBacklinks, buildBacklinkGraph, moveBlock, type NoteDoc } from '../../src/shared/apps/notes/noteDoc';
import { makeQueue, enqueue, next, prev, gaplessOrCrossfadeMs, type Track } from '../../src/shared/apps/music/library';
import { assignPlace, runSmartAlbum, haversineKm, type PhotoMeta, type PlaceCluster } from '../../src/shared/apps/gallery/photoLibrary';

const profile: BrowserProfile = { id: 'p', name: 'P', vaultBucket: 'v', thirdPartyCookies: false, tracking: 'strict', searchEngine: 'duckduckgo' };

describe('Browser model', () => {
  it('classifies https as ok', () => {
    expect(classifyUrl('https://example.com', profile).ok).toBe(true);
  });
  it('blocks tracker on strict', () => {
    expect(classifyUrl('https://ad.doubleclick.net', profile).ok).toBe(false);
  });
  it('discards idle non-pinned tabs', () => {
    const tabs: Tab[] = [
      { id: '1', profileId: 'p', url: 'https://a', title: 'A', pinned: false, lastActiveMs: 0, loaded: true },
      { id: '2', profileId: 'p', url: 'https://b', title: 'B', pinned: true, lastActiveMs: 0, loaded: true },
    ];
    expect(pickTabsToDiscard(tabs, 100_000, 1000, 5)).toEqual(['1']);
  });
  it('download eta computes', () => {
    const d: DownloadItem = { id: 'd', url: 'x', filename: 'f', bytesTotal: 1000, bytesDone: 500, state: 'active', startedAtMs: 0 };
    expect(downloadEta(d, 1000)).toBe(1);
  });
});

describe('Files smart folder', () => {
  const files: FileMeta[] = [
    { path: '/a.png', name: 'a.png', bytes: 100, modifiedAtMs: 10, ext: 'png', tags: ['hero'], kind: 'image' },
    { path: '/b.txt', name: 'b.txt', bytes: 50, modifiedAtMs: 20, ext: 'txt', tags: [], kind: 'doc' },
  ];
  it('runs predicate', () => {
    const sf: SmartFolder = { id: 's', name: 'Hero Images', predicate: { op: 'and', preds: [{ op: 'kind', value: 'image' }, { op: 'tag', value: 'hero' }] }, sort: 'name', ascending: true };
    expect(runSmartFolder(files, sf).map(f => f.name)).toEqual(['a.png']);
  });
  it('preview rename produces template substitution', () => {
    const out = previewRename(files, '{n}-{name}.{ext}');
    expect(out[0]!.target).toBe('001-a.png');
  });
});

describe('DexNotes', () => {
  const docs: NoteDoc[] = [
    { id: 'n1', title: 'A', blocks: [{ id: 'b1', type: 'paragraph', text: 'see [[B]] and [[C]]' }], tags: [], createdAtMs: 0, modifiedAtMs: 0 },
    { id: 'n2', title: 'B', blocks: [{ id: 'b2', type: 'paragraph', text: 'no links' }], tags: [], createdAtMs: 0, modifiedAtMs: 0 },
  ];
  it('extracts backlinks', () => {
    expect(extractBacklinks(docs[0]!).sort()).toEqual(['B', 'C']);
  });
  it('graph contains inbound', () => {
    const g = buildBacklinkGraph(docs);
    expect(g.inbound.get('B')?.has('n1')).toBe(true);
  });
  it('moveBlock reorders', () => {
    const d: NoteDoc = { id: 'x', title: 'X', tags: [], createdAtMs: 0, modifiedAtMs: 0, blocks: [
      { id: '1', type: 'paragraph', text: 'A' },
      { id: '2', type: 'paragraph', text: 'B' },
    ]};
    expect(moveBlock(d, 0, 1).blocks[0]!.text).toBe('B');
  });
});

describe('Music queue', () => {
  it('enqueue + next advances', () => {
    let q = makeQueue();
    q = enqueue(q, 't1');
    q = enqueue(q, 't2');
    q = next(q);
    expect(q.current).toBe('t1');
    q = next(q);
    expect(q.current).toBe('t2');
    q = prev(q);
    expect(q.current).toBe('t1');
  });
  it('gapless mode for FLAC pair', () => {
    const t: Track = { id: 't', title: 'T', durationSec: 10, source: { kind: 'path', path: 'x' }, gaplessCapable: true };
    expect(gaplessOrCrossfadeMs(t, t).mode).toBe('gapless');
  });
});

describe('Gallery', () => {
  const places: PlaceCluster[] = [{ id: 'paris', name: 'Paris', center: { lat: 48.8566, lon: 2.3522 }, radiusKm: 30 }];
  const photo: PhotoMeta = { id: 'p1', path: 'x', gps: { lat: 48.857, lon: 2.353 }, faces: ['f1'], labels: ['outdoors'], width: 0, height: 0 };
  it('assigns place', () => {
    expect(assignPlace(photo, places)).toBe('paris');
  });
  it('haversine is symmetric', () => {
    const a = { lat: 0, lon: 0 }, b = { lat: 0, lon: 1 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a));
  });
  it('smart album filter', () => {
    expect(runSmartAlbum([photo], { id: 'a', name: 'Paris faces', faces: ['f1'], placeId: 'paris' }, places).length).toBe(1);
  });
});
