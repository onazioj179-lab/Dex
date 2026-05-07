// =============================================================================
// DEX Platform - DEX v3.10.0 wave Y - UKI super-intelligence primitives
// =============================================================================

// ---- tree-of-thought + self-consistency vote ----
export interface ThoughtNode { id: string; value: string; score: number; parentId?: string }
export function selfConsistencyVote(answers: readonly string[]): { answer: string; votes: number } {
  const counts = new Map<string, number>();
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best = ''; let n = 0;
  for (const [a, c] of counts) if (c > n) { best = a; n = c; }
  return { answer: best, votes: n };
}

// ---- tool router with cost weighting ----
export interface ToolDescriptor { name: string; costMs: number; sideEffect: 'none'|'read'|'write'|'network'; relevance: number }
export function routeTool(candidates: readonly ToolDescriptor[]): ToolDescriptor | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]; let bestScore = -Infinity;
  for (const c of candidates) {
    const sideCost = c.sideEffect === 'write' ? 50 : c.sideEffect === 'network' ? 30 : c.sideEffect === 'read' ? 5 : 0;
    const score = c.relevance * 100 - c.costMs - sideCost;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// ---- hierarchical memory ----
export type MemoryTier = 'working'|'episodic'|'semantic'|'procedural';
export interface MemoryEntry { id: string; tier: MemoryTier; content: string; importance: number; lastAccessedAt: number }
export function consolidateMemory(entries: readonly MemoryEntry[], now: number, workingTtlMs: number = 60000): MemoryEntry[] {
  return entries.map((e) => {
    if (e.tier === 'working' && now - e.lastAccessedAt > workingTtlMs) {
      return { ...e, tier: e.importance >= 0.7 ? 'semantic' : 'episodic' };
    }
    return e;
  });
}
export function forgetCascade(entries: readonly MemoryEntry[], now: number, ageMs: number, importanceThreshold: number = 0.3): MemoryEntry[] {
  return entries.filter((e) => !(now - e.lastAccessedAt > ageMs && e.importance < importanceThreshold));
}

// ---- HNSW toy: brute-force k-NN ----
export interface VectorEntry { id: string; vector: readonly number[] }
export function knn(query: readonly number[], entries: readonly VectorEntry[], k: number): { id: string; distance: number }[] {
  const out = entries.map((e) => {
    let s = 0;
    for (let i = 0; i < query.length; i++) s += (query[i] - e.vector[i]) ** 2;
    return { id: e.id, distance: Math.sqrt(s) };
  }).sort((a, b) => a.distance - b.distance).slice(0, k);
  return out;
}

// ---- reciprocal rank fusion ----
export function reciprocalRankFusion(rankings: readonly (readonly string[])[], k: number = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, idx) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}

// ---- citation span / hallucination detection ----
export interface Citation { sourceId: string; spanStart: number; spanEnd: number; quote: string }
export function detectHallucination(answer: string, citations: readonly Citation[], sources: ReadonlyMap<string, string>): { unsupported: string[] } {
  const unsupported: string[] = [];
  const sentences = answer.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  for (const s of sentences) {
    let supported = false;
    for (const c of citations) {
      const src = sources.get(c.sourceId);
      if (src && src.slice(c.spanStart, c.spanEnd).toLowerCase().includes(s.toLowerCase().slice(0, Math.min(20, s.length)))) {
        supported = true; break;
      }
    }
    if (!supported) unsupported.push(s);
  }
  return { unsupported };
}

// ---- prompt-injection guard ----
const INJECTION_PATTERNS = [
  /ignore (all )?previous instructions/i,
  /disregard (the )?system prompt/i,
  /you are now/i,
  /reveal your (system )?prompt/i,
  /print the contents of/i,
  /<\/?script\b/i,
];
export function isPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

// ---- multi-agent debate judge ----
export interface DebateOpinion { agentId: string; answer: string; confidence: number; reasoning: string }
export function judgeDebate(opinions: readonly DebateOpinion[]): { winner: string; answer: string } {
  // weighted by confidence + agreement with majority
  const counts = new Map<string, number>();
  for (const o of opinions) counts.set(o.answer, (counts.get(o.answer) ?? 0) + o.confidence);
  let bestAnswer = ''; let bestScore = -Infinity;
  for (const [a, s] of counts) if (s > bestScore) { bestAnswer = a; bestScore = s; }
  const winner = opinions.filter((o) => o.answer === bestAnswer).sort((a, b) => b.confidence - a.confidence)[0];
  return { winner: winner?.agentId ?? '', answer: bestAnswer };
}

// ---- rubric scorer ----
export interface RubricCriterion { name: string; weight: number; score: number }
export function rubricScore(criteria: readonly RubricCriterion[]): number {
  let total = 0; let weight = 0;
  for (const c of criteria) { total += c.score * c.weight; weight += c.weight; }
  return weight === 0 ? 0 : total / weight;
}

// ---- patch applier with hunks ----
export interface Hunk { start: number; remove: number; insert: readonly string[] }
export function applyHunks(lines: readonly string[], hunks: readonly Hunk[]): string[] {
  const sorted = [...hunks].sort((a, b) => b.start - a.start);
  const out = lines.slice();
  for (const h of sorted) {
    out.splice(h.start, h.remove, ...h.insert);
  }
  return out;
}
export function rollbackHunks(original: readonly string[]): string[] { return original.slice(); }

// ---- macro recorder ----
export interface MacroStep { kind: string; params: Readonly<Record<string, unknown>>; conditional?: { when: string }; loopCount?: number }
export interface Macro { id: string; name: string; steps: readonly MacroStep[]; trigger?: string }
export function expandMacro(m: Macro): MacroStep[] {
  const out: MacroStep[] = [];
  for (const s of m.steps) {
    const reps = s.loopCount ?? 1;
    for (let i = 0; i < reps; i++) out.push(s);
  }
  return out;
}

// ---- A/B compare ----
export interface AbResult<T> { a: T; b: T; preferA: boolean; rationale: string }
export function abChoose<T>(a: T, b: T, scoreFn: (x: T) => number, rationale: string): AbResult<T> {
  return { a, b, preferA: scoreFn(a) >= scoreFn(b), rationale };
}

// ---- self-critique ----
export function selfCritique(answer: string, criteria: readonly string[]): { passed: string[]; failed: string[] } {
  const passed: string[] = []; const failed: string[] = [];
  for (const c of criteria) {
    if (answer.toLowerCase().includes(c.toLowerCase())) passed.push(c);
    else failed.push(c);
  }
  return { passed, failed };
}
