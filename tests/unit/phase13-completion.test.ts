import { describe, it, expect, vi } from 'vitest';
import {
  TerminalOutputRing,
  CommandHistoryStore,
  cullGraph,
  MonitoringSampler,
  AutosaveCoordinator,
  ResumableExportPipeline,
  snapZoneRect,
  detectSnapZone,
  MultiMonitorMemory,
  AppLauncherIndex,
} from '../../src/shared/phase13/completionKit';

describe('Phase 13 - TerminalOutputRing', () => {
  it('caps line count and reports drops', () => {
    const r = new TerminalOutputRing({ maxLines: 3, maxBytes: 1_000_000 });
    for (let i = 0; i < 5; i++) r.push(`L${i}`);
    expect(r.size()).toBe(3);
    expect(r.dropped()).toBe(2);
    expect(r.tail(10).map((l) => l.text)).toEqual(['L2', 'L3', 'L4']);
  });

  it('caps byte total', () => {
    const r = new TerminalOutputRing({ maxLines: 1000, maxBytes: 10 });
    r.push('aaaaa'); // 5
    r.push('bbbbb'); // +5 = 10
    r.push('ccccc'); // +5 -> evict aaaaa
    expect(r.size()).toBe(2);
    expect(r.byteSize()).toBe(10);
  });

  it('slice by seq range and find by substring', () => {
    const r = new TerminalOutputRing();
    r.push('hello world');
    r.push('foo bar');
    r.push('Hello again');
    expect(r.slice(1, 3).length).toBe(2);
    expect(r.find('hello').length).toBe(2);
    expect(r.find('').length).toBe(0);
  });

  it('tail handles n<=0', () => {
    const r = new TerminalOutputRing();
    r.push('x');
    expect(r.tail(0)).toEqual([]);
  });
});

describe('Phase 13 - CommandHistoryStore', () => {
  it('records entries, dedupes adjacent repeats, and rejects empty', () => {
    const h = new CommandHistoryStore();
    expect(h.record('ls')).toBe(true);
    expect(h.record('ls')).toBe(false);
    expect(h.record('pwd')).toBe(true);
    expect(h.record('   ')).toBe(false);
    expect(h.list().map((e) => e.command)).toEqual(['ls', 'pwd']);
  });

  it('partitions are independent', () => {
    const h = new CommandHistoryStore();
    h.record('a', 'p1');
    h.record('b', 'p2');
    expect(h.list('p1').length).toBe(1);
    expect(h.list('p2').length).toBe(1);
    expect(h.partitionCount()).toBe(2);
  });

  it('searchPrefix returns newest-first matches', () => {
    const h = new CommandHistoryStore();
    h.record('git status');
    h.record('npm test');
    h.record('git log');
    const r = h.searchPrefix('git');
    expect(r.map((e) => e.command)).toEqual(['git log', 'git status']);
  });

  it('searchSubstring is case-insensitive', () => {
    const h = new CommandHistoryStore();
    h.record('Build Project');
    h.record('npm run build');
    const r = h.searchSubstring('BUILD');
    expect(r.length).toBe(2);
  });

  it('caps per-partition history', () => {
    const h = new CommandHistoryStore({ maxPerPartition: 2 });
    h.record('a');
    h.record('b');
    h.record('c');
    expect(h.list().map((e) => e.command)).toEqual(['b', 'c']);
  });
});

describe('Phase 13 - cullGraph', () => {
  const nodes = [
    { id: 'a', x: 10, y: 10 },
    { id: 'b', x: 200, y: 200 },
    { id: 'c', x: 1000, y: 1000 },
  ];
  const edges = [
    { id: 'e1', from: 'a', to: 'b' },
    { id: 'e2', from: 'b', to: 'c' },
  ];

  it('culls offscreen nodes', () => {
    const r = cullGraph(nodes, edges, { x: 0, y: 0, width: 300, height: 300, zoom: 1 }, 0);
    expect(r.visibleNodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(r.culledNodes).toBe(1);
  });

  it('omits edges when both endpoints not visible', () => {
    const r = cullGraph(nodes, edges, { x: 0, y: 0, width: 300, height: 300, zoom: 1 }, 0);
    expect(r.visibleEdges.map((e) => e.id)).toEqual(['e1']);
  });

  it('skips edges in low-detail tier', () => {
    const r = cullGraph(nodes, edges, { x: 0, y: 0, width: 5000, height: 5000, zoom: 0.2 }, 0);
    expect(r.visibleEdges.length).toBe(0);
    expect(r.tier).toBe('overview');
  });

  it('classifies tier by zoom', () => {
    const v = (z: number) =>
      cullGraph([], [], { x: 0, y: 0, width: 100, height: 100, zoom: z }).tier;
    expect(v(1.5)).toBe('detail');
    expect(v(0.8)).toBe('normal');
    expect(v(0.4)).toBe('lowDetail');
    expect(v(0.1)).toBe('overview');
  });

  it('rejects bad viewport', () => {
    expect(() => cullGraph([], [], { x: 0, y: 0, width: 0, height: 100, zoom: 1 })).toThrow();
  });
});

describe('Phase 13 - MonitoringSampler', () => {
  it('caps to capacity', () => {
    const s = new MonitoringSampler({ capacity: 3 });
    for (let i = 0; i < 5; i++) s.add(i);
    expect(s.size()).toBe(3);
    expect(s.recent(10).map((x) => x.value)).toEqual([2, 3, 4]);
  });

  it('axisMax grows immediately', () => {
    const s = new MonitoringSampler({ capacity: 10, hysteresis: 0.5 });
    s.add(10);
    expect(s.axisMax()).toBe(10);
    s.add(50);
    expect(s.axisMax()).toBe(50);
  });

  it('axisMax shrinks only past hysteresis threshold', () => {
    const s = new MonitoringSampler({ capacity: 10, hysteresis: 0.5 });
    s.add(100);
    expect(s.axisMax()).toBe(100);
    // small drops keep prior axis
    s.add(80);
    s.add(70);
    expect(s.axisMax()).toBe(100);
  });

  it('rejects bad inputs', () => {
    expect(() => new MonitoringSampler({ hysteresis: 1.0 })).toThrow();
    const s = new MonitoringSampler();
    expect(() => s.add(NaN)).toThrow();
  });
});

describe('Phase 13 - AutosaveCoordinator', () => {
  it('coalesces rapid requests into one flush per interval', () => {
    let now = 0;
    const a = new AutosaveCoordinator<number>({ minIntervalMs: 100, now: () => now });
    a.request(1); a.request(2); a.request(3);
    let r = a.tick();
    expect(r.flushed).toBe(true);
    expect(r.state).toBe(3);
    now = 50;
    a.request(4);
    expect(a.tick().flushed).toBe(false);
    now = 200;
    expect(a.tick().flushed).toBe(true);
  });

  it('forceFlush bypasses interval', () => {
    let now = 0;
    const a = new AutosaveCoordinator<string>({ minIntervalMs: 1000, now: () => now });
    a.request('x');
    expect(a.forceFlush().flushed).toBe(true);
    expect(a.hasPending()).toBe(false);
    expect(a.forceFlush().flushed).toBe(false);
  });

  it('rejects bad interval', () => {
    expect(() => new AutosaveCoordinator<number>({ minIntervalMs: 0 })).toThrow();
  });
});

describe('Phase 13 - ResumableExportPipeline', () => {
  it('runs all stages on success', async () => {
    const log: string[] = [];
    const p = new ResumableExportPipeline<{ log: string[] }>([
      { id: 's1', run: (c) => { c.log.push('1'); } },
      { id: 's2', run: (c) => { c.log.push('2'); } },
    ]);
    const r = await p.run({ log });
    expect(r.completed).toBe(true);
    expect(log).toEqual(['1', '2']);
  });

  it('resumes from failed stage on rerun', async () => {
    let attempts = 0;
    const log: string[] = [];
    const p = new ResumableExportPipeline<{ log: string[] }>([
      { id: 'a', run: (c) => { c.log.push('a'); } },
      { id: 'b', run: () => {
        attempts++;
        if (attempts === 1) throw new Error('boom');
      } },
      { id: 'c', run: (c) => { c.log.push('c'); } },
    ]);
    const r1 = await p.run({ log });
    expect(r1.completed).toBe(false);
    expect(r1.failedStage).toBe('b');
    expect(p.remaining()).toEqual(['b', 'c']);
    const r2 = await p.run({ log });
    expect(r2.completed).toBe(true);
    expect(r2.completedStages).toEqual(['b', 'c']);
    expect(log).toEqual(['a', 'c']); // 'a' did not re-run
  });

  it('rejects empty stages and duplicate ids', () => {
    expect(() => new ResumableExportPipeline([])).toThrow();
    expect(() => new ResumableExportPipeline([
      { id: 'x', run: vi.fn() },
      { id: 'x', run: vi.fn() },
    ])).toThrow();
  });
});

describe('Phase 13 - Snap presets', () => {
  const display = { x: 0, y: 0, width: 1000, height: 600 };

  it('maximize fills the display', () => {
    expect(snapZoneRect('maximize', display)).toEqual(display);
  });

  it('left/right split the display halves', () => {
    expect(snapZoneRect('left', display)).toEqual({ x: 0, y: 0, width: 500, height: 600 });
    expect(snapZoneRect('right', display)).toEqual({ x: 500, y: 0, width: 500, height: 600 });
  });

  it('quadrants are correct', () => {
    expect(snapZoneRect('topRight', display)).toEqual({ x: 500, y: 0, width: 500, height: 300 });
    expect(snapZoneRect('bottomLeft', display)).toEqual({ x: 0, y: 300, width: 500, height: 300 });
  });

  it('detectSnapZone identifies edges and corners', () => {
    expect(detectSnapZone(0, 0, display, 16)).toBe('topLeft');
    expect(detectSnapZone(999, 0, display, 16)).toBe('topRight');
    expect(detectSnapZone(500, 0, display, 16)).toBe('maximize');
    expect(detectSnapZone(500, 300, display, 16)).toBeNull();
  });
});

describe('Phase 13 - MultiMonitorMemory', () => {
  it('remembers and recalls per-display placement', () => {
    const m = new MultiMonitorMemory();
    m.remember('w1', 'd1', { x: 10, y: 10, width: 100, height: 100 });
    m.remember('w1', 'd2', { x: 0, y: 0, width: 50, height: 50 });
    expect(m.recall('w1', 'd1')!.x).toBe(10);
    expect(m.recall('w1', 'd2')!.width).toBe(50);
    expect(m.recall('w1', 'unknown')).toBeNull();
    expect(m.knownDisplays('w1').sort()).toEqual(['d1', 'd2']);
  });

  it('forget removes window', () => {
    const m = new MultiMonitorMemory();
    m.remember('w1', 'd1', { x: 0, y: 0, width: 1, height: 1 });
    m.forget('w1');
    expect(m.recall('w1', 'd1')).toBeNull();
    expect(m.windowCount()).toBe(0);
  });

  it('rejects empty ids', () => {
    const m = new MultiMonitorMemory();
    expect(() => m.remember('', 'd', { x: 0, y: 0, width: 1, height: 1 })).toThrow();
    expect(() => m.remember('w', '', { x: 0, y: 0, width: 1, height: 1 })).toThrow();
  });
});

describe('Phase 13 - AppLauncherIndex', () => {
  it('exact name beats prefix beats word-prefix beats substring', () => {
    const ix = new AppLauncherIndex();
    ix.add({ id: '1', name: 'Notes' });
    ix.add({ id: '2', name: 'Notepad Plus' });
    ix.add({ id: '3', name: 'My Notebook' });
    ix.add({ id: '4', name: 'Synonyms', keywords: ['notes'] });
    const r = ix.search('Notes');
    expect(r[0]!.item.id).toBe('1');
    expect(r.findIndex((m) => m.item.id === '4')).toBeGreaterThan(0);
  });

  it('returns empty on empty query', () => {
    const ix = new AppLauncherIndex();
    ix.add({ id: '1', name: 'X' });
    expect(ix.search('')).toEqual([]);
  });

  it('boost breaks ties; id breaks remaining ties', () => {
    const ix = new AppLauncherIndex();
    ix.add({ id: 'a', name: 'Same Name', boost: 1 });
    ix.add({ id: 'b', name: 'Same Name', boost: 5 });
    ix.add({ id: 'c', name: 'Same Name', boost: 5 });
    const r = ix.search('Same Name');
    expect(r.map((m) => m.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('rejects duplicate id and remove returns false for unknown', () => {
    const ix = new AppLauncherIndex();
    ix.add({ id: '1', name: 'A' });
    expect(() => ix.add({ id: '1', name: 'B' })).toThrow();
    expect(ix.remove('99')).toBe(false);
    expect(ix.remove('1')).toBe(true);
    expect(ix.size()).toBe(0);
  });

  it('respects limit', () => {
    const ix = new AppLauncherIndex();
    for (let i = 0; i < 20; i++) ix.add({ id: `id${i}`, name: `Item ${i}` });
    expect(ix.search('Item', 5).length).toBe(5);
  });
});
