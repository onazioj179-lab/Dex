// DEX v3.10.0 wave Z - power tests
import { describe, expect, it } from 'vitest';
import {
  addChild, addCursor, buildHeatmap, classifyFile, dedupeByHash, expandSnippet, hydrationCadence,
  indent, lookupBinding, matchChord, panZoom, parseVerbNoun, pickRandomUnused, pushClip, reviewCard,
  setMark, shouldTriggerTwentyTwentyTwenty, sliceTreemap, tickTimer, vimTransition,
} from '../../src/shared/power';

describe('wave Z power', () => {
  it('vim transitions normal->insert', () => {
    const s = vimTransition({ mode:'normal', cursor:0, buffer:'hello' }, 'i');
    expect(s.mode).toBe('insert');
  });
  it('vim escape returns to normal', () => {
    const s = vimTransition({ mode:'insert', cursor:0, buffer:'' }, 'Escape');
    expect(s.mode).toBe('normal');
  });
  it('verb-noun parser', () => {
    expect(parseVerbNoun('open file foo.txt')).toEqual({ verb:'open', noun:'file', modifier:'foo.txt' });
    expect(parseVerbNoun('only')).toBeNull();
  });
  it('leader chord match', () => {
    expect(matchChord(['Space','f','f'], [{ keys:['Space','f','f'], action:'find' }])).toBe('find');
  });
  it('keybinding pack lookup', () => {
    expect(lookupBinding('blender', 'G')).toBe('grab');
    expect(lookupBinding('logic', 'R')).toBe('record');
  });
  it('marks set position', () => {
    const m = setMark({ marks: new Map() }, 'a', 42);
    expect(m.marks.get('a')).toBe(42);
  });
  it('multi-cursor add dedupes and sorts', () => {
    const mc = addCursor(addCursor({ positions:[5] }, 1), 5);
    expect(mc.positions).toEqual([1,5]);
  });
  it('snippet expand', () => {
    expect(expandSnippet('hi ${name}', { name:'dex' })).toBe('hi dex');
  });
  it('keystroke heatmap counts', () => {
    const h = buildHeatmap([{key:'a'},{key:'a'},{key:'b'}]);
    expect(h.get('a')).toBe(2);
  });
  it('clip ring keeps newest, dedupes, caps', () => {
    let r = { items:[], max:3 };
    r = pushClip(r,'a'); r = pushClip(r,'b'); r = pushClip(r,'a'); r = pushClip(r,'c'); r = pushClip(r,'d');
    expect(r.items).toEqual(['d','c','a']);
  });
  it('pan zoom clamps', () => {
    const t = panZoom({ x:0, y:0, zoom:1 }, 10, 5, 0);
    expect(t.x).toBe(10);
    expect(panZoom({x:0,y:0,zoom:1}, 0, 0, 100).zoom).toBeLessThanOrEqual(64);
  });
  it('mind map add child', () => {
    const n = addChild({ id:'p', text:'p', childIds:['a'] }, 'b');
    expect(n.childIds).toEqual(['a','b']);
  });
  it('outline indent clamps at zero', () => {
    const out = indent([{id:'x',text:'',depth:0}], 'x', -1);
    expect(out[0].depth).toBe(0);
  });
  it('SRS schedules card after good review', () => {
    const c = reviewCard({ id:'c', ease:2.5, interval:0, reps:0 }, 5);
    expect(c.reps).toBe(1);
    expect(c.interval).toBe(1);
    const c2 = reviewCard(c, 5);
    expect(c2.interval).toBe(6);
  });
  it('classify file by extension', () => {
    expect(classifyFile('a.PNG')).toBe('images');
    expect(classifyFile('a.zzz')).toBe('other');
  });
  it('dedupe by hash', () => {
    expect(dedupeByHash([{hash:'a'},{hash:'a'},{hash:'b'}]).length).toBe(2);
  });
  it('treemap covers width', () => {
    const r = sliceTreemap([{id:'a',size:1},{id:'b',size:1}], 100, 50);
    expect(r.reduce((s,x)=>s+x.w, 0)).toBeCloseTo(100);
  });
  it('timer tick switches phase', () => {
    const t = tickTimer({ remainingSec:0.5, totalSec:25*60, phase:'work' }, 1, 5*60);
    expect(t.phase).toBe('break');
    expect(t.remainingSec).toBe(5*60);
  });
  it('20-20-20 reminder triggers at 20m', () => {
    expect(shouldTriggerTwentyTwentyTwenty(20*60*1000)).toBe(true);
    expect(shouldTriggerTwentyTwentyTwenty(60*1000)).toBe(false);
  });
  it('hydration cadence positive', () => {
    expect(hydrationCadence(70)).toBeGreaterThan(0);
  });
  it('crazy mode picks unused', () => {
    const f = pickRandomUnused(['a','b','c'], ['a','c'], () => 0);
    expect(f).toBe('b');
    expect(pickRandomUnused(['a'],['a'],()=>0)).toBeNull();
  });
});
