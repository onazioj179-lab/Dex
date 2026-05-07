// =============================================================================
// DEX Platform - DEX v3.10.0 wave W - cybersecurity hardening primitives
// All deterministic shapes; real cryptographic operations are routed elsewhere.
// =============================================================================

// ---- WebAuthn / FIDO2 challenge ----
export interface WebAuthnChallenge { challenge: string; rpId: string; userId: string; ts: number; ttlMs: number }
export function buildWebAuthnChallenge(rpId: string, userId: string, randomHex: string, now: number, ttlMs: number = 60000): WebAuthnChallenge {
  return { challenge: randomHex, rpId, userId, ts: now, ttlMs };
}
export function isChallengeValid(c: WebAuthnChallenge, now: number): boolean {
  return now - c.ts >= 0 && now - c.ts <= c.ttlMs;
}

// ---- TPM PCR / measured boot ----
export interface PcrBank { bank: number; values: readonly string[] }
export function extendPcr(bank: PcrBank, measurement: string, hash: (a: string, b: string) => string): PcrBank {
  const values = bank.values.slice();
  values[bank.bank] = hash(values[bank.bank] ?? '', measurement);
  return { bank: bank.bank, values };
}

// ---- PassKeys store shape ----
export interface PassKey { id: string; rpId: string; userHandle: string; createdAt: number; signCount: number }
export function bumpSignCount(key: PassKey): PassKey { return { ...key, signCount: key.signCount + 1 }; }

// ---- Argon2id parameter recommender ----
export interface Argon2Params { memoryKb: number; iterations: number; parallelism: number }
export function recommendArgon2(targetMs: number): Argon2Params {
  if (targetMs >= 1000) return { memoryKb: 64 * 1024, iterations: 3, parallelism: 4 };
  if (targetMs >= 500) return { memoryKb: 32 * 1024, iterations: 2, parallelism: 2 };
  return { memoryKb: 16 * 1024, iterations: 2, parallelism: 1 };
}

// ---- Shamir 3-of-5 share index validation ----
export interface SecretShare { index: number; value: string }
export function canRecover(shares: readonly SecretShare[], threshold: number): boolean {
  const seen = new Set(shares.map((s) => s.index));
  return seen.size >= threshold;
}

// ---- Merkle audit log ----
export function buildMerkleRoot(leaves: readonly string[], hash: (a: string, b: string) => string): string {
  if (leaves.length === 0) return '';
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hash(a, b));
    }
    level = next;
  }
  return level[0];
}

// ---- file integrity monitor ----
export interface FimEntry { path: string; hash: string }
export function diffFim(prev: readonly FimEntry[], curr: readonly FimEntry[]): { added: string[]; removed: string[]; changed: string[] } {
  const prevMap = new Map(prev.map((e) => [e.path, e.hash]));
  const currMap = new Map(curr.map((e) => [e.path, e.hash]));
  const added: string[] = []; const removed: string[] = []; const changed: string[] = [];
  for (const [p, h] of currMap) {
    if (!prevMap.has(p)) added.push(p);
    else if (prevMap.get(p) !== h) changed.push(p);
  }
  for (const [p] of prevMap) if (!currMap.has(p)) removed.push(p);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

// ---- behaviour rule engine ----
export interface BehaviourEvent { kind: string; ts: number; meta?: Record<string, unknown> }
export interface BehaviourRule { name: string; predicate: (events: readonly BehaviourEvent[]) => boolean; severity: 'low'|'medium'|'high' }
export function evaluateBehaviour(events: readonly BehaviourEvent[], rules: readonly BehaviourRule[]): { name: string; severity: string }[] {
  return rules.filter((r) => r.predicate(events)).map((r) => ({ name: r.name, severity: r.severity }));
}

// ---- impossible travel detector ----
export interface LoginEvent { ts: number; lat: number; lon: number }
function haversineKm(a: LoginEvent, b: LoginEvent): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function impossibleTravel(prev: LoginEvent, next: LoginEvent, maxKmh: number = 1000): boolean {
  const distKm = haversineKm(prev, next);
  const hours = (next.ts - prev.ts) / 3600;
  if (hours <= 0) return distKm > 0;
  return distKm / hours > maxKmh;
}

// ---- DLP rule engine ----
export interface DlpRule { name: string; pattern: RegExp; action: 'block'|'warn'|'redact' }
export function scanForDlp(text: string, rules: readonly DlpRule[]): { rule: string; matches: string[]; action: string }[] {
  const out: { rule: string; matches: string[]; action: string }[] = [];
  for (const r of rules) {
    const matches = text.match(r.pattern);
    if (matches) out.push({ rule: r.name, matches: [...matches], action: r.action });
  }
  return out;
}

// ---- panic mode / duress passcode ----
export interface VaultState { realPin: string; duressPin: string; selfDestructAfter: number; failedAttempts: number }
export function attemptUnlock(state: VaultState, pin: string): { result: 'ok'|'duress'|'fail'|'destroyed'; nextState: VaultState } {
  if (state.failedAttempts >= state.selfDestructAfter) return { result: 'destroyed', nextState: state };
  if (pin === state.realPin) return { result: 'ok', nextState: { ...state, failedAttempts: 0 } };
  if (pin === state.duressPin) return { result: 'duress', nextState: { ...state, failedAttempts: 0 } };
  const next = { ...state, failedAttempts: state.failedAttempts + 1 };
  if (next.failedAttempts >= state.selfDestructAfter) return { result: 'destroyed', nextState: next };
  return { result: 'fail', nextState: next };
}

// ---- compliance pack flag aggregator ----
export type ComplianceTag = 'HIPAA'|'PCI'|'SOC2'|'GDPR'|'ISO27001';
export interface ComplianceControl { id: string; tags: readonly ComplianceTag[]; passing: boolean }
export function compliancePosture(controls: readonly ComplianceControl[]): Record<ComplianceTag, { total: number; passing: number; score: number }> {
  const tags: ComplianceTag[] = ['HIPAA','PCI','SOC2','GDPR','ISO27001'];
  const out = {} as Record<ComplianceTag, { total: number; passing: number; score: number }>;
  for (const t of tags) {
    const relevant = controls.filter((c) => c.tags.includes(t));
    const passing = relevant.filter((c) => c.passing).length;
    out[t] = { total: relevant.length, passing, score: relevant.length === 0 ? 1 : passing / relevant.length };
  }
  return out;
}

// ---- TLS pinning check ----
export function tlsPinMatches(presentedSpkiSha256: string, pinned: readonly string[]): boolean {
  return pinned.includes(presentedSpkiSha256);
}

// ---- per-app firewall policy ----
export type FirewallVerdict = 'allow'|'deny';
export interface FirewallRule { app: string; host: string; verdict: FirewallVerdict }
export function evaluateFirewall(app: string, host: string, rules: readonly FirewallRule[], defaultVerdict: FirewallVerdict = 'deny'): FirewallVerdict {
  for (const r of rules) {
    if ((r.app === '*' || r.app === app) && (r.host === '*' || r.host === host || host.endsWith('.' + r.host))) return r.verdict;
  }
  return defaultVerdict;
}

// ---- VPN kill switch ----
export interface NetworkState { vpnUp: boolean; killSwitch: boolean }
export function shouldBlockTraffic(state: NetworkState): boolean {
  return state.killSwitch && !state.vpnUp;
}

// ---- post-quantum primitive shapes ----
export interface KemKeyPair { publicKey: string; secretKey: string; algorithm: 'kyber768' }
export interface SignKeyPair { publicKey: string; secretKey: string; algorithm: 'dilithium2' }
export function describeKemPublicKeySize(): number { return 1184; }
export function describeKemCiphertextSize(): number { return 1088; }
export function describeSignSignatureSize(): number { return 2420; }
