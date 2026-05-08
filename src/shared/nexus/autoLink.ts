// =============================================================================
// DEX Platform — Wave 6.3 Nexus: auto-link by content similarity
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Auto-link — given a set of nodes (each with a precomputed embedding
 * vector) suggest edges between nodes whose cosine similarity exceeds a
 * threshold. Also returns a per-node "orphan score" (low = well-connected).
 *
 * Pure math; the embedding pipeline lives elsewhere (Wave 0.3 ONNX manager
 * loads gte-small for this purpose).
 */

export interface NexusNode {
  id: string;
  /** Unit-normalized embedding (any dimension). */
  embedding: Float32Array;
}

export interface SuggestedLink {
  a: string;
  b: string;
  similarity: number;
}

export interface AutoLinkResult {
  links: SuggestedLink[];
  /** Per-node degree from the suggested links. */
  degrees: Map<string, number>;
  /** Nodes with zero suggested links. */
  orphans: string[];
}

export interface AutoLinkOptions {
  threshold?: number;     // default 0.78
  maxPerNode?: number;    // default 5
  /** Skip nodes whose embedding length doesn't match. */
  expectedDim?: number;
}

export function autoLink(nodes: NexusNode[], opts: AutoLinkOptions = {}): AutoLinkResult {
  const threshold = opts.threshold ?? 0.78;
  const maxPerNode = opts.maxPerNode ?? 5;

  // Filter out nodes with mismatched/empty embeddings
  const valid = nodes.filter(n => {
    if (!n.embedding || n.embedding.length === 0) return false;
    if (opts.expectedDim && n.embedding.length !== opts.expectedDim) return false;
    return true;
  });

  // Compute pairwise similarities; collect top-K per node first to bound output.
  const candidates = new Map<string, { other: string; sim: number }[]>();
  for (let i = 0; i < valid.length; i++) {
    const a = valid[i]!;
    const aList: { other: string; sim: number }[] = [];
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const b = valid[j]!;
      if (a.embedding.length !== b.embedding.length) continue;
      const s = cosine(a.embedding, b.embedding);
      if (s >= threshold) aList.push({ other: b.id, sim: s });
    }
    aList.sort((x, y) => y.sim - x.sim);
    candidates.set(a.id, aList.slice(0, maxPerNode));
  }

  // De-duplicate undirected pairs.
  const seen = new Set<string>();
  const links: SuggestedLink[] = [];
  for (const [id, list] of candidates) {
    for (const c of list) {
      const key = id < c.other ? `${id}|${c.other}` : `${c.other}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a: id, b: c.other, similarity: c.sim });
    }
  }

  const degrees = new Map<string, number>();
  for (const l of links) {
    degrees.set(l.a, (degrees.get(l.a) ?? 0) + 1);
    degrees.set(l.b, (degrees.get(l.b) ?? 0) + 1);
  }
  const orphans = valid.filter(n => (degrees.get(n.id) ?? 0) === 0).map(n => n.id);

  return { links, degrees, orphans };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!, bv = b[i]!;
    dot += av * bv; na += av * av; nb += bv * bv;
  }
  const denom = Math.sqrt(na * nb);
  return denom === 0 ? 0 : dot / denom;
}
