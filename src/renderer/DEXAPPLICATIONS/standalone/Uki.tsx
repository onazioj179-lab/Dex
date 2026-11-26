// =============================================================================
// DEX 6.0 — uki AI (chat-style assistant app)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Conversation-history chat app for the uki assistant. Conversations + messages
// persist natively in dex.db via the `uki-chat:*` channels (src-tauri/src/
// uki_chat.rs); AI replies stream from the configured provider through the uki
// orchestrator (src/renderer/uki/providers/connect.ts). Text input today; voice
// capture is a planned follow-up. The system prompt is enriched with a live
// on-screen context snapshot (foreground/open/recent apps, time, connectivity).
// Degrades cleanly when no provider key is set or under the web shell.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DexSearchInput } from '../../styles/components';
import {
  streamConfiguredLLM,
  hasConfiguredProvider,
  hasVisionProvider,
} from '../../uki/providers/connect';
import { captureScreenImage, isScreenCaptureAvailable, captureCameraFrame, isCameraCaptureAvailable } from '../../uki/screenCapture';
import { liveContext, ensureDeviceInfo, type DeviceInfo } from '../../uki/context';
import { coreSystemPrompt, reasoningForTurn, isCreatorQuestion, creatorAnswer } from '../../uki/identity';
import { formatUkiContexts } from '../../uki/appContextRegistry';
import { relevantSkillPacks, formatSkillPacksForPrompt } from '../../uki/skillPacks';
import { buildChatCommand, runChatCommand, planNeedsProvider, type ChatCommand } from '../../uki/chatActions';
import { classifyKnowledgeIntent, answerFactualQuestion, groundingLine } from '../../uki/answerEngine';
import { classifyOperatorIntent, diagnose } from '../../uki/operator';
import { useSpinnerVerb } from '../../uki/spinnerVerbs';
import { APP_DEFINITIONS } from '../../store/runningApps';
import type { ChatMessage } from '../../uki/providers/types';
import {
  attachmentFromFile, attachmentFromPath, pickFilePaths, attachmentsPrompt, attachmentImages, attachmentsLabel,
  replyFileName, saveTextAs, MAX_ATTACHMENTS, UKI_ATTACH_EVENT, takeHandedOffAttachments, type UkiAttachment,
} from '../../uki/attachments';
import { summarizeText } from '../../uki/assistive';
import { recallFromHistory, isHistoryRequest, recentWindow } from '../../uki/chatHistory';
import { updateRelationship } from '../../uki/philosophy';

function toast(type: 'success' | 'error' | 'info', message: string): void {
  try { window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type, message } })); } catch { /* noop */ }
}

interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}
interface Message {
  id: string;
  role: 'user' | 'copilot' | 'system';
  content: string;
  timestamp: number;
}

// The chat app shares UKI's one identity (uki/identity.ts) instead of keeping
// its own differently-worded copy; it only adds the chat-specific format rule.
const SYSTEM_PROMPT = `${coreSystemPrompt()}\nUse markdown for code.`;

const OS_NAMES: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

/** Compact one-liner describing the user's machine, for the [Live context] block. */
function formatDevice(d: DeviceInfo): string {
  const os = [OS_NAMES[d.platform ?? ''] ?? d.platform, d.osVersion].filter(Boolean).join(' ');
  const arch = d.arch ? ` (${d.arch})` : '';
  const cpu = d.cpuModel
    ? `, ${d.cpuModel}${d.cpuCores ? ` ${d.cpuCores}-core` : ''}`
    : (d.cpuCores ? `, ${d.cpuCores}-core CPU` : '');
  const ram = d.totalMemoryBytes ? `, ${Math.round(d.totalMemoryBytes / (1024 ** 3))} GB RAM` : '';
  return `${os}${arch}${cpu}${ram}`.trim();
}

/** Compact live-context block appended to the system prompt so uki knows what the
 *  user is looking at (foreground/open/recent apps, local time, connectivity) and
 *  what machine it is running on (DEX 5.7 device awareness).
 *  Built per-send from the dependency-light snapshot in uki/context.ts. */
function buildSystemPrompt(grounding?: string | null, userText = ''): string {
  const c = liveContext();
  const parts = [
    `Local time: ${c.localTime}.`,
    c.device ? `Device: ${formatDevice(c.device)}.` : '',
    c.activeWorkspace ? `Active workspace: "${c.activeWorkspace.name}" (a ${c.activeWorkspace.kind} space).` : '',
    c.foregroundAppId ? `The user is currently in the "${c.foregroundAppId}" app.` : '',
    c.openAppIds.length ? `Open apps: ${c.openAppIds.join(', ')}.` : '',
    c.sessionHistory.length ? `Recently used: ${c.sessionHistory.slice(-5).join(', ')}.` : '',
    c.recentFiles.length ? `Recent files: ${c.recentFiles.join(', ')}.` : '',
    `Network: ${c.online ? 'online' : 'offline'}.`,
  ].filter(Boolean);
  let prompt = `${SYSTEM_PROMPT}\n\n${reasoningForTurn(userText, { foregroundAppId: c.foregroundAppId })}\n\n[Live context] ${parts.join(' ')}`;
  // Domain skill packs relevant to the active Project Space and/or open apps
  // (DEX 5.6) — e.g. Git/Refactor/Debug for a development space. Compact and
  // token-bounded so the prompt stays lean; see uki/skillPacks.ts.
  const packs = relevantSkillPacks({ activeKind: c.activeWorkspace?.kind, openApps: c.openAppIds });
  const skillBlock = formatSkillPacksForPrompt(packs);
  if (skillBlock) prompt += `\n\n[Relevant skill packs]\n${skillBlock}`;
  // Deep per-app context (e.g. the open note's title + selection) when any app
  // has registered a resolver — see uki/appContextRegistry.ts.
  const appCtx = formatUkiContexts();
  if (appCtx) prompt += `\n\n[What the user is looking at]\n${appCtx}`;
  // Fresh facts pulled from public APIs for this turn (weather/currency/lookup),
  // so the model answers with current data instead of stale training knowledge.
  if (grounding) prompt += `\n\n[Live facts retrieved just now -- use these, they are current]\n${grounding}`;
  return prompt;
}

/** Thin wrapper over the native bridge; returns null under the web shell. */
async function dexInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  const d = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<T> } }).dex;
  if (!d?.invoke) return null;
  try {
    return await d.invoke(channel, ...args);
  } catch {
    return null;
  }
}

const newId = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Launch a DEX app by id or name via the same `dex-open-app` event AppManager
 *  listens for. Returns the resolved app name, or null when nothing matches. */
function launchAppByName(name: string): string | null {
  const norm = name.toLowerCase().trim();
  if (!norm) return null;
  const entries = Object.entries(APP_DEFINITIONS);
  let hit = entries.find(([id]) => id === norm);
  if (!hit) hit = entries.find(([, d]) => d.name.toLowerCase() === norm);
  if (!hit) hit = entries.find(([, d]) => d.name.toLowerCase().startsWith(norm));
  if (!hit) return null;
  const [id, def] = hit;
  try {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: id, appName: def.name } }));
  } catch {
    return null;
  }
  return def.name;
}

/** Result of a slash command: either a reply to show, or null when the input
 *  is not a (recognized) slash command and should fall through to normal chat. */
interface SlashOutcome { reply: string; role: 'copilot' | 'system'; }

/**
 * Self-contained slash commands wired to real DEX mechanisms (no new backend
 * channels). Anything not handled here returns null and falls through to the
 * action planner / LLM. `/summarize` is deliberately NOT handled so it routes
 * through the existing `uki.summarize` planner action.
 */
async function runSlashCommand(text: string): Promise<SlashOutcome | null> {
  if (!text.startsWith('/')) return null;
  const space = text.indexOf(' ');
  const cmd = (space === -1 ? text.slice(1) : text.slice(1, space)).toLowerCase();
  const arg = (space === -1 ? '' : text.slice(space + 1)).trim();
  switch (cmd) {
    case 'help':
    case '?':
      return {
        role: 'system',
        reply:
          'Slash commands: /open <app>, /note <text>, /task <text>, /find <query>, /run <workflow>, ' +
          '/summarize <text>, /timer [minutes], /clipboard, /focus, /mute, /notify <text>, /help.',
      };
    case 'open': {
      if (!arg) return { role: 'system', reply: 'Usage: /open <app name>. Try /open notes or /open files.' };
      const name = launchAppByName(arg);
      return { role: 'system', reply: name ? `Opening ${name}…` : `No app matches "${arg}". Try /help.` };
    }
    case 'note': {
      launchAppByName('notes');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:create-note', { detail: { text: arg } })); } catch { /* best effort */ }
      }
      return { role: 'system', reply: arg ? `Note drafted: "${arg.slice(0, 80)}"` : 'Notes opened.' };
    }
    case 'task': {
      launchAppByName('tasks');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:create-task', { detail: { text: arg } })); } catch { /* best effort */ }
      }
      return { role: 'system', reply: arg ? `Task added: "${arg.slice(0, 80)}"` : 'Tasks opened.' };
    }
    case 'find': {
      launchAppByName('files');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:files-search', { detail: { query: arg } })); } catch { /* best effort */ }
      }
      return { role: 'system', reply: arg ? `Searching files for "${arg}"…` : 'Files opened. Type a query.' };
    }
    case 'run': {
      launchAppByName('workflows');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:workflow-run', { detail: { name: arg } })); } catch { /* best effort */ }
      }
      return { role: 'system', reply: arg ? `Running workflow "${arg}"…` : 'Workflows opened.' };
    }
    case 'timer': {
      // The Timer app keeps its own state with no event-driven start API, so the
      // safe, real action is to open it; we echo the requested minutes to enter.
      const mins = arg ? Math.max(1, Math.min(1440, Math.round(parseFloat(arg)))) : NaN;
      const name = launchAppByName('timer');
      if (!name) return { role: 'system', reply: 'Timer app is unavailable.' };
      if (Number.isFinite(mins)) {
        return { role: 'system', reply: `Timer opened — enter ${mins} minute${mins === 1 ? '' : 's'} and press start.` };
      }
      return { role: 'system', reply: 'Timer opened. Tip: /timer 10 to suggest 10 minutes.' };
    }
    case 'clipboard': {
      try {
        const clip = await navigator.clipboard?.readText?.();
        if (clip == null || clip === '') return { role: 'system', reply: 'Clipboard is empty.' };
        return { role: 'copilot', reply: `Clipboard:\n\n${clip.slice(0, 4000)}` };
      } catch {
        return { role: 'system', reply: 'Could not read the clipboard (permission denied).' };
      }
    }
    case 'focus': {
      // Toggle the distraction-free focus-mode class (the same mechanism the UKI
      // overlay's accessibility action uses); persisted so it survives reloads.
      const on = !document.documentElement.classList.contains('focus-mode');
      document.documentElement.classList.toggle('focus-mode', on);
      try {
        if (on) localStorage.setItem('dex:a11y:focusMode', 'true');
        else localStorage.removeItem('dex:a11y:focusMode');
      } catch { /* localStorage unavailable */ }
      return { role: 'system', reply: on ? 'Focus mode on. Non-essential UI hidden — /focus again to exit.' : 'Focus mode off.' };
    }
    case 'mute': {
      // Mute by setting system volume to 0: persist + broadcast the same
      // `dex-system-volume` event AppManager fires, and zero live media elements.
      try {
        localStorage.setItem('dex-system-volume', '0');
        document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => { el.volume = 0; });
        window.dispatchEvent(new CustomEvent('dex-system-volume', { detail: 0 }));
      } catch { /* best effort */ }
      return { role: 'system', reply: 'System muted. Adjust volume from the top bar to restore.' };
    }
    case 'notify': {
      if (!arg) return { role: 'system', reply: 'Usage: /notify <text>.' };
      try {
        window.dispatchEvent(new CustomEvent('dex-notification', {
          detail: { title: 'uki', body: arg, type: 'info', source: 'uki' },
        }));
      } catch { /* best effort */ }
      return { role: 'system', reply: `Notification sent: "${arg.slice(0, 80)}"` };
    }
    default:
      // Unknown slash word — let it fall through to the normal chat path.
      return null;
  }
}

/** When the user clearly describes a problem and on-device troubleshooting
 *  knowledge has a confident hit, answer locally (no LLM round-trip). Returns
 *  null otherwise so normal chat / LLM fallback proceeds unchanged. */
function tryOperatorLocalAnswer(text: string): string | null {
  if (classifyOperatorIntent(text) !== 'diagnose') return null;
  const hits = diagnose(text, 1);
  const top = hits[0];
  if (!top) return null;
  const steps = top.fix.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `${top.symptom}\n\nLikely cause: ${top.cause}\n\nTry this:\n${steps}`;
}

export default function Uki(): React.ReactElement {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // History is unlimited; draw the latest part and page back on request, so a
  // conversation with thousands of messages opens instantly.
  const PAGE = 200;
  const [shownCount, setShownCount] = useState(PAGE);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  // Lively thinking verb shown after send, before the first token streams in.
  const verb = useSpinnerVerb(busy && !streamingText);
  const [search, setSearch] = useState('');
  const [contentMatchIds, setContentMatchIds] = useState<Set<string>>(() => new Set());
  // Provider config is re-checked (not memoized once) so adding a key in
  // Settings takes effect when the user returns — see the focus effect below.
  const [configured, setConfigured] = useState<boolean>(() => hasConfiguredProvider());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<{ plan: ChatCommand['plan']; summary: string } | null>(null);
  // "Look at my screen": when armed, the next free-form message attaches a
  // screenshot for a vision-capable model. Only offered when both screen capture
  // (Electron) and a vision provider are available.
  const [lookAtScreen, setLookAtScreen] = useState(false);
  // Files the user attached for the next message (dropped or picked).
  const [attachments, setAttachments] = useState<UkiAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedPath, setSavedPath] = useState<{ id: string; path: string } | null>(null);
  const screenVisionReady = isScreenCaptureAvailable() && hasVisionProvider();
  const [lookWithCamera, setLookWithCamera] = useState(false);
  const cameraVisionReady = isCameraCaptureAvailable() && hasVisionProvider();
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshConversations = useCallback(async () => {
    const list = await dexInvoke<Conversation[]>('uki-chat:listConversations', 100000);
    if (Array.isArray(list)) { setConversations(list); updateRelationship(list); }
  }, []);
  // Chats in the floating UKI panel are saved here too; show them as they land.
  useEffect(() => {
    const onChange = () => { void refreshConversations(); };
    window.addEventListener('dex-uki-history-changed', onChange);
    return () => window.removeEventListener('dex-uki-history-changed', onChange);
  }, [refreshConversations]);

  const loadMessages = useCallback(async (cid: string) => {
    setShownCount(PAGE);
    const msgs = await dexInvoke<Message[]>('uki-chat:getMessages', cid);
    setMessages(Array.isArray(msgs) ? msgs : []);
  }, []);

  useEffect(() => {
    void refreshConversations();
    // Warm the device/hardware cache once so uki can answer questions about the
    // user's computer (CPU/RAM/OS) from its [Live context] block (DEX 5.7).
    void ensureDeviceInfo();
  }, [refreshConversations]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId, loadMessages]);

  // Auto-scroll the thread on new content.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, streamingText]);

  // Re-check provider config when the window regains focus (the user may have
  // just added a key in Settings) so the unconfigured hint clears without reload.
  useEffect(() => {
    const recheck = () => setConfigured(hasConfiguredProvider());
    window.addEventListener('focus', recheck);
    return () => window.removeEventListener('focus', recheck);
  }, []);

  // Cancel any in-flight stream if the app unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Native cross-conversation content search: find conversations by something
  // said in them (wires uki-chat:search). Title filtering stays local + instant.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setContentMatchIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const hits = await dexInvoke<Array<{ conversation_id: string }>>('uki-chat:search', q, 50);
      if (!cancelled && Array.isArray(hits)) {
        setContentMatchIds(new Set(hits.map((h) => h.conversation_id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const newConversation = useCallback(async () => {
    const conv = await dexInvoke<Conversation>('uki-chat:createConversation', 'New Conversation');
    await refreshConversations();
    if (conv?.id) setActiveId(conv.id);
    else setActiveId(null);
    setMessages([]);
    inputRef.current?.focus();
  }, [refreshConversations]);

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await dexInvoke('uki-chat:deleteConversation', id);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      await refreshConversations();
    },
    [activeId, refreshConversations],
  );

  const startRename = useCallback((c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  }, []);

  const commitRename = useCallback(async () => {
    const id = editingId;
    if (!id) return;
    const title = editTitle.trim();
    setEditingId(null);
    if (title) {
      await dexInvoke('uki-chat:renameConversation', id, title);
      await refreshConversations();
    }
  }, [editingId, editTitle, refreshConversations]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const confirmAction = useCallback(async () => {
    const pa = pendingAction;
    if (!pa) return;
    setPendingAction(null);
    setBusy(true);
    let out = '';
    try {
      out = await runChatCommand(pa.plan, buildSystemPrompt());
    } catch {
      out = 'Action failed.';
    }
    setBusy(false);
    const reply: Message = { id: newId(), role: 'copilot', content: out, timestamp: Date.now() };
    setMessages((m) => [...m, reply]);
    if (activeId) {
      void dexInvoke('uki-chat:appendMessage', activeId, reply);
      void refreshConversations();
    }
  }, [pendingAction, activeId, refreshConversations]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    const note: Message = { id: newId(), role: 'system', content: 'Action cancelled.', timestamp: Date.now() };
    setMessages((m) => [...m, note]);
  }, []);

  const addAttachments = useCallback((items: Array<UkiAttachment | string>) => {
    const errors = items.filter((x): x is string => typeof x === 'string');
    const ok = items.filter((x): x is UkiAttachment => typeof x !== 'string');
    if (errors.length) toast('error', errors.join(' '));
    if (!ok.length) return;
    setAttachments((prev) => {
      const next = [...prev, ...ok].slice(0, MAX_ATTACHMENTS);
      if (prev.length + ok.length > MAX_ATTACHMENTS) toast('info', `Up to ${MAX_ATTACHMENTS} files per message.`);
      return next;
    });
    inputRef.current?.focus();
  }, []);
  // Files dropped on the floating UKI panel arrive here.
  useEffect(() => {
    const take = () => { const got = takeHandedOffAttachments(); if (got.length) addAttachments(got); };
    take();
    window.addEventListener(UKI_ATTACH_EVENT, take);
    return () => window.removeEventListener(UKI_ATTACH_EVENT, take);
  }, [addAttachments]);
  const attachFiles = useCallback(async (files: FileList | File[]) => {
    addAttachments(await Promise.all(Array.from(files).map((f) => attachmentFromFile(f).catch(() => `Could not read ${f.name}.`))));
  }, [addAttachments]);
  const pickAttachments = useCallback(async () => {
    const dex = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
    if (dex?.invoke) {
      const invoke = dex.invoke.bind(dex);
      const paths = await pickFilePaths(invoke);
      if (paths.length) addAttachments(await Promise.all(paths.map((p) => attachmentFromPath(invoke, p))));
      return;
    }
    fileInputRef.current?.click();
  }, [addAttachments]);
  const saveReply = useCallback(async (m: Message) => {
    const dex = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
    if (!dex?.invoke) {
      // Web preview: hand the reply over as a download instead.
      const url = URL.createObjectURL(new Blob([m.content], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url; a.download = replyFileName(m.content); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    try {
      const path = await saveTextAs(dex.invoke.bind(dex), m.content, replyFileName(m.content));
      if (path) { setSavedPath({ id: m.id, path }); toast('success', `Saved ${path.split(/[\\/]/).pop()}`); }
    } catch (e) {
      toast('error', `Could not save: ${(e as Error).message}`);
    }
  }, []);

  const send = useCallback(async () => {
    const typed = input.trim();
    const atts = attachments;
    if ((!typed && !atts.length) || busy) return;
    // With files attached, an empty message means "look at these".
    const text = typed || (atts.some((a) => a.kind === 'text') ? 'Summarize the attached file.' : 'Describe the attached image.');

    // Ensure a conversation exists.
    let cid = activeId;
    if (!cid) {
      const conv = await dexInvoke<Conversation>('uki-chat:createConversation', text.slice(0, 48));
      cid = conv?.id ?? null;
      if (cid) setActiveId(cid);
      await refreshConversations();
    }

    const label = attachmentsLabel(atts);
    const userMsg: Message = { id: newId(), role: 'user', content: label ? `${typed}${typed ? '\n' : ''}${label}` : text, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setAttachments([]);
    autosize(inputRef.current);
    if (cid) void dexInvoke('uki-chat:appendMessage', cid, userMsg);

    // Slash commands run first against real DEX mechanisms (open/note/task/find/
    // run/timer/clipboard/focus/mute/notify). `/summarize` is intentionally left
    // to the planner below (uki.summarize). Unknown slashes fall through.
    if (!atts.length && text.startsWith('/') && !/^\/summari[sz]e\b/i.test(text)) {
      const outcome = await runSlashCommand(text);
      if (outcome) {
        const reply: Message = { id: newId(), role: outcome.role, content: outcome.reply, timestamp: Date.now() };
        setMessages((m) => [...m, reply]);
        if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
        return;
      }
    }

    // Imperative action? Decompose into a plan, then either hold for explicit
    // approval (mutating, e.g. opening an app) or run read-only LLM transforms.
    const command = buildChatCommand(text);
    if (!atts.length && command.understood) {
      if (command.tier === 'forbidden') {
        const note: Message = { id: newId(), role: 'system', content: 'That action is not allowed.', timestamp: Date.now() };
        setMessages((m) => [...m, note]);
        if (cid) void dexInvoke('uki-chat:appendMessage', cid, note);
        return;
      }
      if (command.tier === 'confirm') {
        setPendingAction({ plan: command.plan, summary: command.summary });
        return;
      }
      // Auto (read-only) — the LLM transforms still need a configured provider.
      if (planNeedsProvider(command.plan) && !hasConfiguredProvider()) {
        setConfigured(false);
        const note: Message = { id: newId(), role: 'system', content: 'No AI provider configured.', timestamp: Date.now() };
        setMessages((m) => [...m, note]);
        if (cid) void dexInvoke('uki-chat:appendMessage', cid, note);
        return;
      }
      setBusy(true);
      let out = '';
      try { out = await runChatCommand(command.plan, buildSystemPrompt()); } catch { out = 'Action failed.'; }
      setBusy(false);
      const reply: Message = { id: newId(), role: 'copilot', content: out, timestamp: Date.now() };
      setMessages((m) => [...m, reply]);
      if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
      return;
    }

    // Knowledge question? Pull a grounded answer from the keyless public APIs.
    // With no provider configured we reply with it directly (so factual questions
    // work without a key); with one configured we fold it into the prompt below.
    let grounding: string | null = null;
    if (!atts.length && classifyKnowledgeIntent(text) !== 'none') {
      const knowledge = await answerFactualQuestion(text);
      if (knowledge) {
        if (!hasConfiguredProvider()) {
          const sourced = knowledge.sourceLabel ? `${knowledge.text}\n\n_Source: ${knowledge.sourceLabel}_` : knowledge.text;
          const reply: Message = { id: newId(), role: 'copilot', content: sourced, timestamp: Date.now() };
          setMessages((m) => [...m, reply]);
          if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
          return;
        }
        grounding = groundingLine(knowledge);
      }
    }

    // Operator (light touch): if the message clearly describes a problem and the
    // on-device troubleshooting knowledge has a confident hit, answer locally
    // instead of falling back to the raw LLM. Guarded so normal chat is untouched.
    const localAnswer = atts.length ? null : isCreatorQuestion(text) ? creatorAnswer() : tryOperatorLocalAnswer(text);
    if (localAnswer) {
      const reply: Message = { id: newId(), role: 'copilot', content: localAnswer, timestamp: Date.now() };
      setMessages((m) => [...m, reply]);
      if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
      return;
    }

    // Her saved conversations: what the user asked before about this topic.
    const bridgeInvoke = (window as unknown as { dex?: { invoke?: (c: string, ...a: unknown[]) => Promise<unknown> } }).dex;
    const recall = bridgeInvoke?.invoke && !atts.length
      ? await recallFromHistory(bridgeInvoke.invoke.bind(bridgeInvoke), text, { excludeConversation: cid })
      : '';

    // Re-check live (the once-on-mount value can be stale if a key was just added).
    const isConfigured = hasConfiguredProvider();
    if (!isConfigured && isHistoryRequest(text)) {
      // No model: answer "what did we talk about…" straight from the saved history.
      const found = recall ? recall.split('\n').slice(1).join('\n') : '';
      const reply: Message = { id: newId(), role: 'copilot', content: found ? `Here is what I found in our earlier conversations:\n${found}` : 'I could not find that in our earlier conversations.', timestamp: Date.now() };
      setMessages((m) => [...m, reply]);
      if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
      return;
    }
    if (isConfigured !== configured) setConfigured(isConfigured);
    if (!isConfigured && atts.some((a) => a.kind === 'text')) {
      // No model: summarize the attached text on this device instead of refusing.
      const parts = atts.filter((a) => a.kind === 'text' && a.text).map((a) => `${a.name}: ${summarizeText(a.text as string, 4) || '(empty)'}`);
      const reply: Message = { id: newId(), role: 'copilot', content: `${parts.join('\n\n')}\n\nSummarized on this device. Add an AI provider for full answers about files.`, timestamp: Date.now() };
      setMessages((m) => [...m, reply]);
      if (cid) { void dexInvoke('uki-chat:appendMessage', cid, reply); void refreshConversations(); }
      return;
    }
    if (!isConfigured) {
      const note: Message = {
        id: newId(),
        role: 'system',
        content: 'No AI provider configured.',
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, note]);
      if (cid) void dexInvoke('uki-chat:appendMessage', cid, note);
      return;
    }

    setBusy(true);
    setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;
    // The live prompt carries the recent part of this conversation; older turns
    // (and other conversations) come back through recall when they are relevant.
    const history: ChatMessage[] = recentWindow(messages, 40).map((m) => ({
      role: m.role === 'copilot' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }));
    // "Look at my screen": grab a still for this turn, then disarm the toggle so
    // it only applies to this one message. Capture failure degrades to text-only.
    let images: string[] | undefined = atts.length ? attachmentImages(atts) : undefined;
    if (images && !images.length) images = undefined;
    if (lookAtScreen) {
      setLookAtScreen(false);
      const shot = await captureScreenImage();
      if (shot) images = [...(images ?? []), shot];
    }
    // "Use my camera": one frame for this message only; the camera is off again
    // before the request is sent.
    if (lookWithCamera) {
      setLookWithCamera(false);
      const frame = await captureCameraFrame();
      if (frame) images = [...(images ?? []), frame];
    }
    let full = '';
    try {
      const filesBlock = attachmentsPrompt(atts);
      const result = await streamConfiguredLLM(
        filesBlock ? `${text}\n\n${filesBlock}` : text,
        recall ? `${buildSystemPrompt(grounding, text)}\n\n${recall}` : buildSystemPrompt(grounding, text),
        (_token, running) => {
          full = running;
          setStreamingText(running);
        },
        { history, signal: controller.signal, images },
      );
      full = (result ?? full).trim();
    } catch {
      full = full.trim();
    }
    const wasAborted = controller.signal.aborted;
    abortRef.current = null;
    setStreamingText('');
    setBusy(false);

    // Stopped before any text arrived: nothing to record, just bail.
    if (wasAborted && !full) return;

    const reply: Message = {
      id: newId(),
      role: 'copilot',
      content: full || 'Sorry — I could not generate a reply. Check your AI provider key and try again.',
      timestamp: Date.now(),
    };
    setMessages((m) => [...m, reply]);
    if (cid) {
      void dexInvoke('uki-chat:appendMessage', cid, reply);
      void refreshConversations();
    }
  }, [input, attachments, busy, activeId, configured, messages, refreshConversations, autosize]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || contentMatchIds.has(c.id),
    );
  }, [conversations, search, contentMatchIds]);

  return (
    <div style={S.root}>
      {/* Sidebar: conversation history */}
      <aside style={S.sidebar}>
        <div style={S.sidebarHead}>
          <span style={S.brand}>uki</span>
          <button style={S.newBtn} onClick={() => void newConversation()} aria-label="New conversation">
            + New
          </button>
        </div>
        <DexSearchInput
          size="sm"
          fullWidth
          style={S.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search"
          aria-label="Search conversations"
        />
        <div style={S.convList}>
          {visibleConversations.length === 0 && (
            <div style={S.convEmpty}>{search.trim() ? 'No matches' : 'No conversations yet'}</div>
          )}
          {visibleConversations.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveId(c.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveId(c.id)}
              style={{ ...S.convItem, ...(c.id === activeId ? S.convItemActive : null) }}
            >
              {editingId === c.id ? (
                <input
                  autoFocus
                  style={S.editInput}
                  value={editTitle}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') void commitRename();
                    else if (e.key === 'Escape') setEditingId(null);
                  }}
                  aria-label="Rename conversation"
                />
              ) : (
                <span
                  style={S.convTitle}
                  title="Double-click to rename"
                  onDoubleClick={(e) => startRename(c, e)}
                >
                  {c.title}
                </span>
              )}
              <button
                style={S.convDelete}
                onClick={(e) => void deleteConversation(c.id, e)}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error, #ff6b6b)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                aria-label={`Delete ${c.title}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main: thread + composer */}
      <main
        style={S.main}
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          void attachFiles(e.dataTransfer.files);
        }}
      >
        {dragOver && (
          <div style={S.dropZone} aria-hidden="true">Drop files to attach them to your message</div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { if (e.target.files?.length) void attachFiles(e.target.files); e.target.value = ''; }}
        />
        <div ref={threadRef} style={S.thread} role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && !streamingText && (
            <div style={S.welcome}>
              <div style={S.welcomeMark}>uki</div>
              <div style={S.welcomeTitle}>How can I help?</div>
              <div style={S.welcomeSub}>
                Ask anything, or tell me to do something across your apps. Your conversations are saved here.
              </div>
            </div>
          )}
          {messages.length > shownCount && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <button type="button" onClick={() => setShownCount((c) => c + PAGE)}
                style={{ height: 28, padding: '0 14px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                Show earlier messages ({(messages.length - shownCount).toLocaleString()} more)
              </button>
            </div>
          )}
          {(messages.length > shownCount ? messages.slice(-shownCount) : messages).map((m) => (
            <div key={m.id} style={{ ...S.row, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4, maxWidth: '76%' }}>
                <div style={{ ...S.bubble, maxWidth: '100%', ...(m.role === 'user' ? S.bubbleUser : m.role === 'system' ? S.bubbleSystem : S.bubbleAi) }}>
                  {m.content}
                </div>
                {m.role === 'copilot' && m.content.length > 40 && (
                  <button type="button" style={S.replyAction} onClick={() => void saveReply(m)} aria-label="Save this reply as a file">
                    {savedPath?.id === m.id ? 'Saved' : 'Save as file'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {pendingAction && (
            <div style={S.actionCard}>
              <div style={S.actionTitle}>uki wants to run this action</div>
              <pre style={S.actionSummary}>{pendingAction.summary}</pre>
              <div style={S.actionRow}>
                <button style={S.runBtn} onClick={() => void confirmAction()} disabled={busy}>
                  {busy ? '…' : 'Run'}
                </button>
                <button style={S.cancelBtn} onClick={cancelAction} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {busy && !streamingText && (
            <div style={{ ...S.row, justifyContent: 'flex-start' }}>
              <div style={{ ...S.bubble, ...S.bubbleAi, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--color-accent-fill)',
                  animation: 'ukiPulse 0.9s ease-in-out infinite',
                }} />
                <span style={{ transition: 'opacity 0.2s ease' }}>{verb}&hellip;</span>
              </div>
            </div>
          )}
          {streamingText && (
            <div style={{ ...S.row, justifyContent: 'flex-start' }}>
              <div style={{ ...S.bubble, ...S.bubbleAi }}>
                {streamingText}
                <span style={S.caret}>▋</span>
              </div>
            </div>
          )}
        </div>

        <div style={S.composer} className="dex-mat-frosted">
          {attachments.length > 0 && (
            <div style={S.chips} aria-label="Attached files">
              {attachments.map((a) => (
                <span key={a.id} style={S.chip}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}{a.truncated ? ' (cut)' : ''}</span>
                  <button
                    type="button"
                    style={S.chipRemove}
                    onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                    aria-label={`Remove ${a.name}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          <button type="button" onClick={() => void pickAttachments()} aria-label="Attach files" style={S.attachBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            style={S.textarea}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autosize(e.target);
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              if (e.clipboardData.files.length) { e.preventDefault(); void attachFiles(e.clipboardData.files); }
            }}
            placeholder={busy ? 'Thinking…' : 'Message UKI'}
            rows={1}
            aria-label="Message uki"
          />
          {screenVisionReady && (
            <button
              type="button"
              onClick={() => setLookAtScreen((v) => !v)}
              title={lookAtScreen ? 'A screenshot will be attached to your next message' : 'Look at my screen (attach a screenshot for vision)'}
              aria-label="Look at my screen"
              aria-pressed={lookAtScreen}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 10px', flexShrink: 0, cursor: 'pointer',
                background: lookAtScreen ? 'var(--color-accent-light)' : 'transparent',
                color: lookAtScreen ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                border: 'none', borderRadius: 9999,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>
          )}
          {cameraVisionReady && (
            <button
              type="button"
              onClick={() => setLookWithCamera((v) => !v)}
              title={lookWithCamera ? 'One camera photo will be taken when you send' : 'Use my camera (one photo for your next message)'}
              aria-label="Use my camera for the next message"
              aria-pressed={lookWithCamera}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 10px', flexShrink: 0, cursor: 'pointer',
                background: lookWithCamera ? 'var(--color-accent-light)' : 'transparent',
                color: lookWithCamera ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                border: 'none', borderRadius: 9999,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            </button>
          )}
          <button
            style={{ ...S.sendBtn, ...(!busy && !input.trim() && !attachments.length ? S.sendBtnDisabled : null) }}
            onClick={() => (busy ? stop() : void send())}
            disabled={!busy && !input.trim() && !attachments.length}
            aria-label={busy ? 'Stop generating' : 'Send message'}
          >
            {busy ? 'Stop' : 'Send'}
          </button>
        </div>
      </main>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100%', width: '100%', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: 14 },
  sidebar: { width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-bg-surface)' },
  sidebarHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px var(--space-2)' },
  brand: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' },
  newBtn: { background: 'var(--color-accent-fill)', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  // fullWidth is 100%: the side margins come off the width, or it overran the sidebar.
  searchInput: { margin: '0 var(--space-3) 10px', width: 'calc(100% - 2 * var(--space-3))', boxSizing: 'border-box' },
  convList: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 var(--space-2) var(--space-2)' },
  convEmpty: { padding: 'var(--space-3) var(--space-2)', color: 'var(--color-text-tertiary)', fontSize: 12 },
  convItem: { display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2 },
  convItemActive: { background: 'var(--color-bg-hover)' },
  convTitle: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 },
  editInput: { flex: 1, minWidth: 0, fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-accent)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' },
  convDelete: { background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' },
  // The conversation runs under the floating composer (content-under-glass):
  // bottom padding keeps the last message scrollable clear of it.
  thread: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-5) max(18px, calc((100% - 760px) / 2)) 120px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', scrollPaddingBottom: 120 },
  welcome: { margin: 'auto', textAlign: 'center', maxWidth: 420 },
  welcomeMark: { fontSize: 40, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.03em' },
  welcomeTitle: { fontSize: 22, fontWeight: 600, marginTop: 'var(--space-2)' },
  welcomeSub: { fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)', lineHeight: 1.5 },
  row: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '76%', padding: '9px 14px', borderRadius: 18, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  bubbleUser: { background: 'var(--color-accent-fill)', color: '#fff', borderBottomRightRadius: 6 },
  bubbleAi: { background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', borderBottomLeftRadius: 6 },
  bubbleSystem: { background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 13, fontStyle: 'italic' },
  caret: { opacity: 0.6, marginLeft: 1 },
  actionCard: { alignSelf: 'flex-start', maxWidth: '80%', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 'var(--space-3)', boxShadow: 'var(--pg-shadow-panel)' },
  actionTitle: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 },
  actionSummary: { margin: 0, fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', color: 'var(--color-text-secondary)', lineHeight: 1.5 },
  actionRow: { display: 'flex', gap: 'var(--space-2)', marginTop: 10 },
  runBtn: { background: 'var(--color-accent-fill)', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', borderRadius: 9999, padding: '6px var(--space-4)', fontSize: 13, cursor: 'pointer' },
  // Floating composer (DEX Floating Surface System, frosted material).
  composer: { position: 'absolute', left: 0, right: 0, bottom: 14, margin: '0 auto', width: 'min(760px, calc(100% - 28px))', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end', padding: 6, borderRadius: 24, zIndex: 2 },
  textarea: { flex: 1, minWidth: 0, resize: 'none', maxHeight: 160, padding: '9px 12px', borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.4, outline: 'none', fontFamily: 'inherit' },
  sendBtn: { background: 'var(--color-accent-fill)', color: '#fff', border: 'none', borderRadius: 9999, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  sendBtnDisabled: { opacity: 0.5, cursor: 'default' },
  attachBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, cursor: 'pointer', background: 'transparent', color: 'var(--color-text-tertiary)', border: 'none', borderRadius: 9999 },
  chips: { flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 4px 0' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 240, height: 26, padding: '0 4px 0 12px', borderRadius: 9999, background: 'var(--color-bg-hover)', color: 'var(--color-text-primary)', fontSize: 12 },
  chipRemove: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flexShrink: 0, borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer' },
  replyAction: { height: 24, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer' },
  dropZone: { position: 'absolute', inset: 10, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, border: '2px dashed var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 600, pointerEvents: 'none' },
};
