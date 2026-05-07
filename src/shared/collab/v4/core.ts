// =============================================================================
// DEX Platform - DEX v3.10.0 wave X - real collab + cloud sync primitives
// =============================================================================

// ---- LWW register CRDT ----
export interface LwwRegister<T> { value: T; ts: number; replicaId: string }
export function mergeLww<T>(a: LwwRegister<T>, b: LwwRegister<T>): LwwRegister<T> {
  if (a.ts > b.ts) return a;
  if (b.ts > a.ts) return b;
  return a.replicaId > b.replicaId ? a : b;
}

// ---- OR-set CRDT add/remove with tags ----
export interface OrSet<T> { adds: ReadonlyMap<T, ReadonlySet<string>>; removes: ReadonlyMap<T, ReadonlySet<string>> }
export function emptyOrSet<T>(): OrSet<T> { return { adds: new Map(), removes: new Map() }; }
export function orSetAdd<T>(s: OrSet<T>, value: T, tag: string): OrSet<T> {
  const adds = new Map(s.adds);
  const tags = new Set(adds.get(value) ?? []);
  tags.add(tag);
  adds.set(value, tags);
  return { adds, removes: s.removes };
}
export function orSetRemove<T>(s: OrSet<T>, value: T): OrSet<T> {
  const removes = new Map(s.removes);
  const tags = new Set(removes.get(value) ?? []);
  for (const t of (s.adds.get(value) ?? [])) tags.add(t);
  removes.set(value, tags);
  return { adds: s.adds, removes };
}
export function orSetValues<T>(s: OrSet<T>): T[] {
  const out: T[] = [];
  for (const [v, addTags] of s.adds) {
    const removed = s.removes.get(v) ?? new Set();
    let alive = false;
    for (const t of addTags) if (!removed.has(t)) { alive = true; break; }
    if (alive) out.push(v);
  }
  return out;
}

// ---- text CRDT: simple sequence with positional ids ----
export interface SeqOp { kind: 'insert'|'delete'; pos: number; char?: string; ts: number; replicaId: string }
export function applySeqOps(initial: string, ops: readonly SeqOp[]): string {
  // sort by ts, replicaId
  const sorted = [...ops].sort((a, b) => a.ts - b.ts || a.replicaId.localeCompare(b.replicaId));
  let s = initial;
  for (const op of sorted) {
    if (op.kind === 'insert' && op.char !== undefined) {
      s = s.slice(0, op.pos) + op.char + s.slice(op.pos);
    } else if (op.kind === 'delete') {
      s = s.slice(0, op.pos) + s.slice(op.pos + 1);
    }
  }
  return s;
}

// ---- OT compose: insert/delete ----
export type OtOp = { retain: number } | { insert: string } | { delete: number };
export function otCompose(a: readonly OtOp[], b: readonly OtOp[]): OtOp[] {
  // simple non-conflicting compose: just concatenate
  return [...a, ...b];
}

// ---- per-block ACL ----
export type Permission = 'read'|'write'|'admin';
export interface AclEntry { userId: string; permission: Permission }
export function canAccess(entries: readonly AclEntry[], userId: string, required: Permission): boolean {
  const order: Record<Permission, number> = { read: 1, write: 2, admin: 3 };
  for (const e of entries) {
    if (e.userId === userId || e.userId === '*') {
      if (order[e.permission] >= order[required]) return true;
    }
  }
  return false;
}

// ---- share link generator ----
export interface ShareLink { token: string; expiresAt: number; password?: string; allowedDomains?: readonly string[] }
export function isShareLinkValid(link: ShareLink, now: number, providedPassword: string | undefined, requesterDomain: string | undefined): boolean {
  if (now > link.expiresAt) return false;
  if (link.password && link.password !== providedPassword) return false;
  if (link.allowedDomains && link.allowedDomains.length > 0) {
    if (!requesterDomain || !link.allowedDomains.includes(requesterDomain)) return false;
  }
  return true;
}

// ---- chunked upload planner ----
export interface UploadChunk { index: number; offset: number; size: number }
export function planChunks(totalSize: number, chunkSize: number): UploadChunk[] {
  const out: UploadChunk[] = [];
  let i = 0;
  for (let off = 0; off < totalSize; off += chunkSize) {
    out.push({ index: i++, offset: off, size: Math.min(chunkSize, totalSize - off) });
  }
  return out;
}

// ---- merkle hash tree for sync diff ----
export function hashTree(blocks: readonly string[], hash: (a: string) => string): string[] {
  const leaves = blocks.map(hash);
  const out = leaves.slice();
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hash(a + b));
    }
    out.push(...next);
    level = next;
  }
  return out;
}

// ---- xdelta differential: find changed block indices ----
export function diffBlocks(prev: readonly string[], curr: readonly string[]): number[] {
  const out: number[] = [];
  const n = Math.max(prev.length, curr.length);
  for (let i = 0; i < n; i++) if ((prev[i] ?? '') !== (curr[i] ?? '')) out.push(i);
  return out;
}

// ---- cold-tier policy ----
export interface FileMeta { id: string; lastAccessedAt: number; sizeBytes: number }
export function pickColdTier(files: readonly FileMeta[], now: number, ageDaysThreshold: number = 90): string[] {
  const cutoff = now - ageDaysThreshold * 86400;
  return files.filter((f) => f.lastAccessedAt < cutoff).map((f) => f.id);
}

// ---- file lock heartbeat ----
export interface FileLock { fileId: string; ownerId: string; lastHeartbeat: number }
export function lockExpired(lock: FileLock, now: number, ttlMs: number = 30000): boolean {
  return now - lock.lastHeartbeat > ttlMs;
}

// ---- room chat message ordering ----
export interface ChatMessage { id: string; ts: number; from: string; text: string }
export function orderMessages(msgs: readonly ChatMessage[]): ChatMessage[] {
  return [...msgs].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}

// ---- poll tally ----
export interface PollVote { userId: string; option: string }
export function tallyPoll(votes: readonly PollVote[]): Record<string, number> {
  const out: Record<string, number> = {};
  const seen = new Set<string>();
  for (const v of votes) {
    if (seen.has(v.userId)) continue;
    seen.add(v.userId);
    out[v.option] = (out[v.option] ?? 0) + 1;
  }
  return out;
}

// ---- whiteboard CRDT: stroke add ----
export interface Stroke { id: string; points: readonly [number, number][]; color: string; width: number; ts: number }
export function mergeStrokes(a: readonly Stroke[], b: readonly Stroke[]): Stroke[] {
  const map = new Map<string, Stroke>();
  for (const s of a) map.set(s.id, s);
  for (const s of b) if (!map.has(s.id)) map.set(s.id, s);
  return [...map.values()].sort((x, y) => x.ts - y.ts || x.id.localeCompare(y.id));
}
