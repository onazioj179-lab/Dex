// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI assistant policy: the rules every model call and tool call passes through.
 *
 *  1. PROCESSING MODE (privacy boundary). Local only / Hybrid / Cloud only /
 *     Manual. Enforced at the provider choke points (orchestrator `chat()` and
 *     the streaming path), not just in routing, so a pinned model or a fallback
 *     can never send text to a cloud provider while the user chose Local only.
 *  2. REASONING PROFILES. Fast / Balanced / Deep pick the step budget and output
 *     length for a request. They change how much work UKI does; they do NOT
 *     claim provider-side reasoning controls (none of the wired providers expose
 *     one through this text protocol).
 *  3. TOOL RISK. Each tool has a risk level; the decision is allow / confirm /
 *     deny, with a reason the agent and the audit log can show.
 *  4. PATH SCOPE. File tools only touch paths inside the user's file scopes
 *     (Documents, Desktop, Downloads by default) — no traversal, no device paths.
 *
 * Pure and dependency-free so it is unit-tested and shared by main + renderer.
 */

// ---- 1. processing mode -----------------------------------------------------

export type ProcessingMode = 'hybrid' | 'local-only' | 'cloud-only' | 'manual';

export const PROCESSING_MODES: readonly ProcessingMode[] = ['hybrid', 'local-only', 'cloud-only', 'manual'];

export function processingModeLabel(mode: ProcessingMode): string {
  switch (mode) {
    case 'local-only': return 'Local only';
    case 'cloud-only': return 'Cloud only';
    case 'manual': return 'Manual (one model)';
    case 'hybrid':
    default: return 'Hybrid';
  }
}

export function processingModeHint(mode: ProcessingMode): string {
  switch (mode) {
    case 'local-only': return 'Nothing leaves this device. Only an on-device model (Ollama on localhost) answers; web search is off unless you grant Network access.';
    case 'cloud-only': return 'Only the cloud providers you added a key for answer. On-device models are skipped.';
    case 'manual': return 'Exactly the model you pick below. No automatic fallback to any other model.';
    case 'hybrid':
    default: return 'On-device first for routine requests when available, your cloud providers otherwise.';
  }
}

export function isProcessingMode(v: unknown): v is ProcessingMode {
  return typeof v === 'string' && (PROCESSING_MODES as readonly string[]).includes(v);
}

/** What the policy needs to know about a model's endpoint. */
export interface EndpointInfo {
  providerId: string;
  /** True for hosted providers that need an API key. */
  requiresKey: boolean;
  /** Custom base URL, if one is configured (e.g. a remote Ollama). */
  baseUrl?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True only when requests stay on this machine: a keyless provider whose base
 * URL is unset (defaults to localhost) or explicitly loopback. A keyless
 * provider pointed at a remote host is NOT local.
 */
export function isLocalEndpoint(info: EndpointInfo): boolean {
  if (info.requiresKey) return false;
  if (!info.baseUrl) return true;
  try {
    return LOCAL_HOSTS.has(new URL(info.baseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** May a request go to this endpoint under `mode`? (`manualModel` for 'manual'.) */
export function endpointAllowed(mode: ProcessingMode, info: EndpointInfo): boolean {
  const local = isLocalEndpoint(info);
  if (mode === 'local-only') return local;
  if (mode === 'cloud-only') return !local;
  return true;
}

/**
 * Filter an ordered model list to what `mode` permits. Order is preserved.
 * In 'manual' mode only `manualModel` survives (and only if it was offered or
 * is resolvable) — no silent fallback to anything else.
 */
export function filterModelsForMode(
  mode: ProcessingMode,
  modelIds: readonly string[],
  endpointOf: (modelId: string) => EndpointInfo | null,
  manualModel?: string | null,
): string[] {
  if (mode === 'manual') {
    if (!manualModel) return [];
    return endpointOf(manualModel) ? [manualModel] : [];
  }
  return modelIds.filter((id) => {
    const info = endpointOf(id);
    return !!info && endpointAllowed(mode, info);
  });
}

// ---- 2. reasoning profiles --------------------------------------------------

export type ReasoningProfile = 'fast' | 'balanced' | 'deep';
export type ReasoningPreference = 'auto' | ReasoningProfile;

export const REASONING_PREFERENCES: readonly ReasoningPreference[] = ['auto', 'fast', 'balanced', 'deep'];

export interface ReasoningBudget {
  profile: ReasoningProfile;
  /** Max agent tool steps before a forced final answer. */
  maxSteps: number;
  /** Output token cap per model call. */
  maxTokens: number;
  temperature: number;
}

export const REASONING_BUDGETS: Record<ReasoningProfile, ReasoningBudget> = {
  fast: { profile: 'fast', maxSteps: 2, maxTokens: 350, temperature: 0.4 },
  balanced: { profile: 'balanced', maxSteps: 5, maxTokens: 700, temperature: 0.5 },
  deep: { profile: 'deep', maxSteps: 10, maxTokens: 1600, temperature: 0.4 },
};

const FAST_RE = /^(?:please\s+)?(?:open|launch|start|close|quit|show|hide|mute|unmute|play|pause|lock|what(?:'s| is) the (?:time|date|weather))\b/i;
const DEEP_RE = /\b(?:architect(?:ure)?|design (?:a|the) system|refactor|debug|root cause|research|compare|trade-?offs?|analy[sz]e|plan(?: out)?|step[- ]by[- ]step|investigate|prove|migrat(?:e|ion)|optimi[sz]e|review (?:this|the|my) code|write (?:a|an) (?:app|program|script|report|essay))\b/i;

/**
 * Classify how much effort a request deserves. Short imperative app/settings
 * commands are Fast; engineering, research and planning are Deep; everything
 * else is Balanced. Long inputs (pasted documents/code) are at least Balanced.
 */
export function classifyReasoning(text: string): ReasoningProfile {
  const t = (text || '').trim();
  if (!t) return 'fast';
  if (DEEP_RE.test(t)) return 'deep';
  const words = t.split(/\s+/).length;
  if (words > 300 || t.includes('```')) return 'deep';
  if (FAST_RE.test(t) && words <= 12) return 'fast';
  if (words <= 6 && !/[?]/.test(t)) return 'fast';
  return 'balanced';
}

/** The budget for a request given the user's preference ('auto' = classify). */
export function reasoningBudget(text: string, preference: ReasoningPreference = 'auto'): ReasoningBudget {
  const profile = preference === 'auto' ? classifyReasoning(text) : preference;
  return REASONING_BUDGETS[profile];
}

// ---- 3. tool risk ---------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

/** Capabilities a tool may need (mirrors UKI's permission capabilities). */
export type ToolCapability = 'network' | 'file-read' | 'file-write' | 'notifications' | 'shell';

export interface ToolRiskSpec {
  risk: RiskLevel;
  /** Capability that must be granted (if any). */
  capability?: ToolCapability;
  /** Sends data off the device (blocked in Local only unless Network is granted). */
  external?: boolean;
  /** Always ask the user first, with this reason (standing automations). */
  confirmReason?: string;
}

/** Risk table for the core tools. App actions are classified by their `mutates` flag. */
export const TOOL_RISK: Record<string, ToolRiskSpec> = {
  web_search: { risk: 'low', external: true },
  open_app: { risk: 'low' },
  close_app: { risk: 'medium' },
  notify: { risk: 'low' },
  get_context: { risk: 'low' },
  list_apps: { risk: 'low' },
  system_processes: { risk: 'low' },
  find_files: { risk: 'low' },
  // Umari (src-tauri/src/umari.rs): excerpts are file contents, so they need file-read.
  find_context: { risk: 'low', capability: 'file-read' },
  list_projects: { risk: 'low' },
  recall_conversations: { risk: 'low' },
  read_file: { risk: 'low', capability: 'file-read' },
  write_file: { risk: 'medium', capability: 'file-write' },
  create_folder: { risk: 'medium', capability: 'file-write' },
  rename_file: { risk: 'medium', capability: 'file-write' },
  move_file: { risk: 'medium', capability: 'file-write' },
  trash_file: { risk: 'high', capability: 'file-write' },
  schedule_task: { risk: 'medium', confirmReason: 'creates a task that runs on its own later' },
  list_scheduled_tasks: { risk: 'low' },
  cancel_scheduled_task: { risk: 'medium', confirmReason: 'deletes a scheduled task' },
  // Terminal broker (src-tauri/src/uki_terminal.rs). High risk: always asks;
  // the "shell" grant is never assumed; privileged commands are refused natively.
  run_command: { risk: 'high', capability: 'shell' },
  command_status: { risk: 'low' },
  cancel_command: { risk: 'medium', confirmReason: 'stops a running command' },
};

export function toolRisk(tool: string, mutatesAppAction?: boolean): ToolRiskSpec {
  return TOOL_RISK[tool] ?? { risk: mutatesAppAction ? 'medium' : 'low' };
}

export type ToolDecision =
  | { kind: 'allow' }
  | { kind: 'confirm'; reason: string }
  | { kind: 'deny'; reason: string };

export interface ToolDecisionInput {
  tool: string;
  mode: ProcessingMode;
  granted: ReadonlySet<string>;
  mutatesAppAction?: boolean;
}

/**
 * Decide whether a tool call may run. Order: capability grant → privacy mode →
 * risk. High-risk calls always need an explicit confirmation; medium-risk file
 * changes need one too (they move or rename the user's files). A missing grant
 * is a denial the agent reports — it never escalates its own permissions.
 */
export function decideToolCall(input: ToolDecisionInput): ToolDecision {
  const spec = toolRisk(input.tool, input.mutatesAppAction);
  if (spec.capability && !input.granted.has(spec.capability)) {
    return { kind: 'deny', reason: `needs the "${spec.capability}" permission, which is not granted. Ask the user to allow it in Permissions.` };
  }
  if (spec.external && input.mode === 'local-only' && !input.granted.has('network')) {
    return { kind: 'deny', reason: 'Local only mode is on, so nothing is sent off this device (grant Network access to allow web search).' };
  }
  if (spec.risk === 'high') return { kind: 'confirm', reason: 'high-risk action' };
  if (spec.confirmReason) return { kind: 'confirm', reason: spec.confirmReason };
  if (spec.risk === 'medium' && spec.capability === 'file-write') return { kind: 'confirm', reason: 'changes your files' };
  return { kind: 'allow' };
}

// ---- 4. path scope ------------------------------------------------------------

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

function normalizeSeparators(p: string): string {
  return p.replace(/\//g, '\\');
}

/**
 * Validate a path for a file tool: absolute, no NUL, no `..` segments, no
 * device/UNC namespace, and inside one of `roots`. Comparison is
 * case-insensitive (Windows). Returns the normalized path.
 */
export function checkPathInScope(raw: string, roots: readonly string[]): PathCheck {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'No path given.' };
  if (input.includes('\0')) return { ok: false, error: 'Invalid path.' };
  const p = normalizeSeparators(input);
  if (p.startsWith('\\\\')) return { ok: false, error: 'Network and device paths are not allowed.' };
  if (!/^[a-zA-Z]:\\/.test(p)) return { ok: false, error: 'Use a full path (for example C:\\Users\\you\\Documents\\file.txt).' };
  const segments = p.split('\\');
  if (segments.some((s) => s === '..' || s === '.')) return { ok: false, error: 'Relative segments (.. or .) are not allowed.' };
  const clean = p.replace(/\\+$/, '');
  const lower = clean.toLowerCase();
  for (const root of roots) {
    const r = normalizeSeparators(String(root || '')).replace(/\\+$/, '').toLowerCase();
    if (!r) continue;
    if (lower === r || lower.startsWith(r + '\\')) return { ok: true, path: clean };
  }
  return { ok: false, error: 'That location is outside your allowed folders (Documents, Desktop, Downloads).' };
}

/** A plain file/folder name (rename target): no separators, no reserved names. */
export function checkPlainName(name: string): { ok: true; name: string } | { ok: false; error: string } {
  const n = String(name ?? '').trim();
  if (!n) return { ok: false, error: 'No name given.' };
  if (/[\\/:*?"<>|\0]/.test(n)) return { ok: false, error: 'Names cannot contain \\ / : * ? " < > |.' };
  if (n === '.' || n === '..') return { ok: false, error: 'Invalid name.' };
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) return { ok: false, error: 'That name is reserved by Windows.' };
  return { ok: true, name: n };
}
