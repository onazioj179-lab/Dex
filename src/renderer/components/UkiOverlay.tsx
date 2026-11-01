// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Voice Assistant Transcript Overlay
 * Floating panel that shows listening state, transcript, and responses
 * 
 * ENHANCED v2.0: Smart understanding with typo correction, slang support,
 * screen reading, improved TTS/STT, and accessibility tools
 */
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { AssistedTextarea } from './AssistedTextarea';
import { useUkiStore } from '../store/ukiStore';
import type { UkiConversationTurn, UkiKnowledgeNode } from '../store/ukiStore';
import { APP_DEFINITIONS, useRunningApps } from '../store/runningApps';
import { zIndex } from '../styles/tokens';
import { UkiAutoPilotBridge, runUkiSlashIfApplicable } from './UkiAutoPilotBridge';
import { UKIPatternStore } from '../services/UKIPatternStore';
import { buildSystemPrompt } from '../uki';
import { hasConfiguredProvider } from '../uki/providers/connect';
import { runUkiAgent, webSearch } from '../uki/agentRunner';
import { formatUkiContexts } from '../uki/appContextRegistry';
import { setUkiActionConfirmHandler } from '../uki/appActionRegistry';
import { getActiveWorkspace } from '../uki/context';
import { classifyKnowledgeIntent, answerFactualQuestion, groundingLine } from '../uki/answerEngine';
import { useSpinnerVerb } from '../uki/spinnerVerbs';
import { computeLingerMs } from '../uki/sleepTiming';
import { useSmoothDrag } from '../hooks/useSmoothDrag';
import { useDexSetting } from '../hooks/useDexSetting';

// Mutating UKI app-actions (e.g. tasks.addTask) never run without the user's
// approval. Wire the confirm surface once so the agent's action registry can
// gate every document-changing action behind an explicit yes/no.
setUkiActionConfirmHandler((entry, args) => {
  const argStr = Object.keys(args).length ? `\n\n${JSON.stringify(args)}` : '';
  return window.confirm(`UKI wants to: ${entry.spec.description}${argStr}\n\nAllow this change to ${entry.appId}?`);
});

// ===========================================================================
// SLASH COMMANDS — power-user surface for the UKI panel
// /open <app>      — launch an app from the registry
// /note <text>     — open Notes; payload becomes new note title
// /task <text>     — open Tasks; payload becomes new task
// /find <query>    — open Files and run a search
// /run <workflow>  — open Workflows and trigger by name
// /help            — list available commands
// ===========================================================================

interface SlashResult { reply: string; intent: string; }

function tryLaunchApp(name: string): boolean {
  const norm = name.toLowerCase().trim();
  if (!norm) return false;
  const entries = Object.entries(APP_DEFINITIONS);
  let hit = entries.find(([id]) => id === norm);
  if (!hit) hit = entries.find(([, d]) => d.name.toLowerCase() === norm);
  if (!hit) hit = entries.find(([, d]) => d.name.toLowerCase().startsWith(norm));
  if (!hit) return false;
  const [id, def] = hit;
  try {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId: id, appName: def.name } }));
    return true;
  } catch { return false; }
}

function handleSlashCommand(text: string): SlashResult | null {
  if (!text.startsWith('/')) return null;
  const space = text.indexOf(' ');
  const cmd = (space === -1 ? text.slice(1) : text.slice(1, space)).toLowerCase();
  const arg = (space === -1 ? '' : text.slice(space + 1)).trim();
  switch (cmd) {
    case 'help':
    case '?':
      return { intent: 'slash-help', reply: 'Slash commands: /open <app>, /note <text>, /task <text>, /find <query>, /run <workflow>, /summarize <text>, /timer <time>, /screenshot, /clipboard, /focus, /mute, /notify <title> | <body>, /help.' };
    case 'open': {
      if (!arg) return { intent: 'slash-open', reply: 'Usage: /open <app name>. Try /open notes or /open vinx.' };
      const ok = tryLaunchApp(arg);
      return { intent: 'slash-open', reply: ok ? `Opening ${arg}…` : `No app matches "${arg}". Try /help.` };
    }
    case 'note': {
      tryLaunchApp('notes');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:create-note', { detail: { text: arg } })); } catch { /* best effort */ }
      }
      return { intent: 'slash-note', reply: arg ? `Note drafted: “${arg.slice(0, 80)}”` : 'Notes opened.' };
    }
    case 'task': {
      tryLaunchApp('tasks');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:create-task', { detail: { text: arg } })); } catch { /* best effort */ }
      }
      return { intent: 'slash-task', reply: arg ? `Task added: “${arg.slice(0, 80)}”` : 'Tasks opened.' };
    }
    case 'find': {
      tryLaunchApp('files');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:files-search', { detail: { query: arg } })); } catch { /* best effort */ }
      }
      return { intent: 'slash-find', reply: arg ? `Searching files for “${arg}”…` : 'Files opened. Type a query.' };
    }
    case 'run': {
      tryLaunchApp('workflows');
      if (arg) {
        try { window.dispatchEvent(new CustomEvent('uki:workflow-run', { detail: { name: arg } })); } catch { /* best effort */ }
      }
      return { intent: 'slash-run', reply: arg ? `Running workflow “${arg}”…` : 'Workflows opened.' };
    }
    default:
      return null;
  }
}

// ===========================================================================
// SMART TEXT UNDERSTANDING - Typo Correction & Fuzzy Matching
// ===========================================================================

/** Levenshtein edit distance for fuzzy matching */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/** Find closest match from a list of words (returns null if no good match) */
function fuzzyMatch(input: string, candidates: string[], maxDistance = 2): string | null {
  if (!input || input.length < 2) return null;
  let bestMatch: string | null = null;
  let bestDist = maxDistance + 1;
  for (const c of candidates) {
    const dist = editDistance(input.toLowerCase(), c.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = c;
    }
  }
  return bestDist <= maxDistance ? bestMatch : null;
}

// ===========================================================================
// SLANG / ABBREVIATIONS / SHORTCUTS DICTIONARY
// ===========================================================================

const SLANG_MAP: Record<string, string> = {
  // Common typos & shortcuts
  'u': 'you', 'ur': 'your', 'r': 'are', 'y': 'why', 'k': 'okay', 'ok': 'okay',
  'pls': 'please', 'plz': 'please', 'thx': 'thanks', 'ty': 'thank you', 'tysm': 'thank you so much',
  'np': 'no problem', 'nvm': 'never mind', 'nvmd': 'never mind', 'idk': "i don't know",
  'idc': "i don't care", 'imo': 'in my opinion', 'imho': 'in my humble opinion',
  'btw': 'by the way', 'fyi': 'for your information', 'afk': 'away from keyboard',
  'brb': 'be right back', 'gtg': 'got to go', 'g2g': 'got to go', 'ttyl': 'talk to you later',
  'lol': 'haha', 'lmao': 'haha', 'rofl': 'haha', 'omg': 'oh my god', 'omfg': 'oh my god',
  'wtf': 'what the heck', 'wth': 'what the heck', 'smh': 'shaking my head',
  'tbh': 'to be honest', 'tho': 'though', 'rn': 'right now', 'irl': 'in real life',
  'dm': 'direct message', 'msg': 'message', 'pic': 'picture', 'pics': 'pictures',
  'vid': 'video', 'vids': 'videos', 'app': 'application', 'apps': 'applications',
  'info': 'information', 'temp': 'temperature', 'convo': 'conversation',
  'mins': 'minutes', 'secs': 'seconds', 'hrs': 'hours', 'wknd': 'weekend',
  'tmrw': 'tomorrow', 'tmw': 'tomorrow', 'yday': 'yesterday', 'yest': 'yesterday',
  'cuz': 'because', 'bcuz': 'because', 'bcos': 'because', 'bc': 'because',
  'gotta': 'got to', 'gonna': 'going to', 'wanna': 'want to', 'kinda': 'kind of',
  'sorta': 'sort of', 'dunno': "don't know", 'lemme': 'let me', 'gimme': 'give me',
  'outta': 'out of', 'bout': 'about', 'doin': 'doing', 'goin': 'going',
  'tryna': 'trying to', 'finna': 'going to', 'ima': "i'm going to", 'imma': "i'm going to",
  // Tech slang
  'dev': 'developer', 'devs': 'developers', 'repo': 'repository', 'repos': 'repositories',
  'config': 'configuration', 'configs': 'configurations', 'sync': 'synchronize',
  'async': 'asynchronous', 'auth': 'authentication', 'admin': 'administrator',
  'db': 'database', 'ui': 'user interface', 'ux': 'user experience',
  'api': 'application programming interface', 'url': 'web address', 'btn': 'button',
  'nav': 'navigation', 'notif': 'notification', 'notifs': 'notifications',
  // Voice command shortcuts
  'vol': 'volume', 'mic': 'microphone', 'cam': 'camera', 'scrn': 'screen',
  'bkgd': 'background', 'fgd': 'foreground', 'max': 'maximize', 'min': 'minimize',
};

const COMMON_MISSPELLINGS: Record<string, string> = {
  'opne': 'open', 'oepn': 'open', 'opn': 'open', 'oppen': 'open',
  'clsoe': 'close', 'closee': 'close', 'cloase': 'close', 'clse': 'close',
  'serach': 'search', 'seach': 'search', 'saerch': 'search', 'searh': 'search',
  'plaese': 'please', 'plase': 'please', 'palse': 'please',
  'helo': 'hello', 'hllo': 'hello', 'helllo': 'hello', 'hellow': 'hello',
  'thnaks': 'thanks', 'thanls': 'thanks', 'thansk': 'thanks',
  'calender': 'calendar', 'calander': 'calendar', 'calandar': 'calendar',
  'waether': 'weather', 'wether': 'weather', 'wheather': 'weather',
  'setttings': 'settings', 'settigns': 'settings', 'setings': 'settings',
  'caluclator': 'calculator', 'calculater': 'calculator', 'calcualtor': 'calculator',
  'brwoser': 'browser', 'broswer': 'browser', 'borwser': 'browser',
  'termianl': 'terminal', 'termnial': 'terminal', 'temrinal': 'terminal',
  'msuic': 'music', 'muisc': 'music', 'musc': 'music',
  'vdieo': 'video', 'viedo': 'video', 'vidoe': 'video',
  'picutre': 'picture', 'pictrue': 'picture', 'pictre': 'picture',
  'tiemr': 'timer', 'tmer': 'timer', 'itmer': 'timer',
  'alram': 'alarm', 'alrm': 'alarm', 'alam': 'alarm',
  'notse': 'notes', 'ntoes': 'notes', 'noets': 'notes',
  'waht': 'what', 'hwat': 'what', 'wht': 'what',
  'wehre': 'where', 'wheer': 'where', 'wher': 'where',
  'whe': 'when', 'wehn': 'when', 'whne': 'when',
  'teh': 'the', 'hte': 'the', 'th': 'the',
  'adn': 'and', 'nad': 'and', 'annd': 'and',
  'ot': 'to', 'tto': 'to', 'too': 'to',
  'fo': 'of', 'oof': 'of', 'off': 'of',
  'si': 'is', 'iss': 'is', 'iis': 'is',
  'ti': 'it', 'itt': 'it', 'iit': 'it',
  'cna': 'can', 'acn': 'can', 'cann': 'can',
  'jsut': 'just', 'juts': 'just', 'jst': 'just',
  'liek': 'like', 'likee': 'like', 'lik': 'like',
  'taht': 'that', 'tath': 'that', 'thta': 'that',
  'wirh': 'with', 'wiht': 'with', 'wtih': 'with',
  'form': 'from', 'fomr': 'from', 'frmo': 'from',
  'ahve': 'have', 'hvae': 'have', 'hve': 'have',
  'yuo': 'you', 'oyu': 'you', 'yoou': 'you',
  'youre': "you're", 'your': "you're", 'ur': "you're",
  'dont': "don't", 'dnt': "don't", 'donot': "don't",
  'cant': "can't", 'cannt': "can't", 'canot': "can't",
  'wont': "won't", 'wotn': "won't", 'wilnot': "won't",
  'doesnt': "doesn't", 'dosent': "doesn't", 'doesnot': "doesn't",
  'didnt': "didn't", 'didtn': "didn't", 'didnot': "didn't",
  'isnt': "isn't", 'isnot': "isn't", 'isant': "isn't",
  'wasnt': "wasn't", 'wasnot': "wasn't",
  'werent': "weren't", 'werenot': "weren't",
  'havent': "haven't", 'havenot': "haven't",
  'shouldnt': "shouldn't", 'shouldnot': "shouldn't",
  'wouldnt': "wouldn't", 'wouldnot': "wouldn't",
  'couldnt': "couldn't", 'couldnot': "couldn't",
};

/** Normalize text: expand slang, fix common misspellings */
function normalizeText(input: string): string {
  const words = input.toLowerCase().split(/\s+/);
  const normalized = words.map(word => {
    // Remove punctuation for lookup
    const cleanWord = word.replace(/[.,!?;:'"]/g, '');
    const punct = word.slice(cleanWord.length);
    
    // Check misspellings first
    if (COMMON_MISSPELLINGS[cleanWord]) {
      return COMMON_MISSPELLINGS[cleanWord] + punct;
    }
    // Then slang
    if (SLANG_MAP[cleanWord]) {
      return SLANG_MAP[cleanWord] + punct;
    }
    return word;
  });
  return normalized.join(' ');
}

// ===========================================================================
// SCREEN READING / VISUAL UNDERSTANDING
// ===========================================================================

interface ScreenContext {
  activeApp: string | null;
  windowTitle: string | null;
  visibleText: string[];
  timestamp: number;
}

let cachedScreenContext: ScreenContext | null = null;

/** Get context about what's currently visible on screen */
async function getScreenContext(): Promise<ScreenContext> {
  // Use cached context if fresh (< 2 seconds old)
  if (cachedScreenContext && Date.now() - cachedScreenContext.timestamp < 2000) {
    return cachedScreenContext;
  }
  
  const context: ScreenContext = {
    activeApp: null,
    windowTitle: null,
    visibleText: [],
    timestamp: Date.now(),
  };
  
  try {
    // Get active app from running apps store
    const store = window.__dexRunningApps;
    const state = store?.getState?.() as { currentAppId?: string; focusedAppId?: string; runningApps?: Array<{ id: string; name: string }> } | undefined;
    const activeId = state?.currentAppId || state?.focusedAppId || null;
    if (activeId) {
      context.activeApp = activeId;
      const app = state?.runningApps?.find(a => a.id === activeId);
      context.windowTitle = app?.name || activeId;
    }
    
    // Try to get visible text from the DOM (accessibility-friendly)
    const visibleElements = document.querySelectorAll(
      '[data-app-content] p, [data-app-content] h1, [data-app-content] h2, ' +
      '[data-app-content] h3, [data-app-content] span, [data-app-content] div, ' +
      '[data-app-content] button, [data-app-content] label, [data-app-content] a'
    );
    
    const texts: string[] = [];
    visibleElements.forEach(el => {
      const text = (el.textContent || '').trim();
      if (text.length > 2 && text.length < 200 && !texts.includes(text)) {
        texts.push(text);
      }
    });
    context.visibleText = texts.slice(0, 50); // Limit to 50 items
  } catch (e) {
    console.warn('[UKI] Screen context error:', e);
  }
  
  cachedScreenContext = context;
  return context;
}

/** Answer questions about what's on screen */
async function tryScreenQuestion(text: string): Promise<string | null> {
  const lower = text.toLowerCase();
  
  const screenPatterns = [
    /what(?:'s| is) on (?:my |the )?screen/,
    /what (?:do |can )?(?:i |you )?see/,
    /read (?:the |my )?screen/,
    /describe (?:the |my )?screen/,
    /what(?:'s| is) (?:this|that)/,
    /what app (?:is |am i )(?:this|using|open)/,
    /where am i/,
    /what(?:'s| is) (?:the )?(?:current|active) (?:app|window|page)/,
    /look at (?:the |my )?screen/,
    /scan (?:the |my )?screen/,
  ];
  
  if (!screenPatterns.some(p => p.test(lower))) return null;
  
  const ctx = await getScreenContext();
  
  if (ctx.activeApp) {
    const appName = ctx.windowTitle || ctx.activeApp;
    let response = `You're currently in ${appName}. `;
    
    if (ctx.visibleText.length > 0) {
      const preview = ctx.visibleText.slice(0, 5).join(', ');
      response += `I can see: ${preview}${ctx.visibleText.length > 5 ? '...' : ''}.`;
    } else {
      response += `The content area appears to be loading or empty.`;
    }
    return response;
  }
  
  return "I can see the DEX desktop. Try opening an app and I can tell you more about what's on screen!";
}

// ===========================================================================
// TEXT-TO-SPEECH CONFIGURATION - Female Voice with Better Quality
// ===========================================================================

interface TTSConfig {
  rate: number;      // 0.5 - 2.0 (1.0 = normal)
  pitch: number;     // 0.5 - 2.0 (1.0 = normal)
  volume: number;    // 0 - 1.0
  voiceName: string; // Preferred voice name
}

const TTS_CONFIG: TTSConfig = {
  rate: 1.05,        // Slightly faster for snappier responses
  pitch: 1.15,       // Slightly higher for female voice
  volume: 0.85,
  voiceName: '',     // Will be set to best available female voice
};

/** Find the best female voice available */
function findBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  
  // Priority order for female voices (en-US preferred)
  const femaleVoicePatterns = [
    // High quality neural voices
    /samantha/i, /victoria/i, /zira/i, /aria/i, /jenny/i, /emma/i,
    /female/i, /woman/i, /girl/i,
    // Common female voice names
    /susan/i, /karen/i, /moira/i, /fiona/i, /kate/i, /serena/i,
    /heather/i, /allison/i, /ava/i, /stephanie/i, /nicole/i,
    // Google voices
    /google.*female/i, /google.*uk/i,
  ];
  
  // Try to find a female English voice
  for (const pattern of femaleVoicePatterns) {
    const match = voices.find(v => 
      pattern.test(v.name) && v.lang.startsWith('en')
    );
    if (match) return match;
  }
  
  // Fallback to any English voice
  return voices.find(v => v.lang.startsWith('en')) || voices[0];
}

/** Speak text with optimized female voice settings */
function speakWithVoice(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = TTS_CONFIG.rate;
  utterance.pitch = TTS_CONFIG.pitch;
  utterance.volume = TTS_CONFIG.volume;
  
  const voice = findBestVoice();
  if (voice) {
    utterance.voice = voice;
    TTS_CONFIG.voiceName = voice.name;
  }
  
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  
  window.speechSynthesis.speak(utterance);
}

// ===========================================================================
// EMOTION DETECTION — empathy-first responses
// ===========================================================================

type EmotionType = 'frustration' | 'happiness' | 'sadness' | 'confusion' | 'neutral';

function detectEmotion(text: string): EmotionType {
  const lower = text.toLowerCase();
  if (/\b(ugh|argh|wtf|damn|hate|broken|stupid|useless|not working|doesn't work|doesnt work|fuck|sucks|terrible|awful)\b/.test(lower)) return 'frustration';
  if (/\b(thank|thanks|great|awesome|amazing|love|perfect|yay|cool|nice|brilliant|excellent|wonderful)\b/.test(lower)) return 'happiness';
  if (/\b(sad|upset|crying|depressed|lonely|miss|hate my|worried|anxious|stress)\b/.test(lower)) return 'sadness';
  if (/^(huh|what|i don.?t understand|not sure|confused|help me|explain|what do you mean|how do i|how does)\b/.test(lower)) return 'confusion';
  return 'neutral';
}

function getEmpathyPrefix(emotion: EmotionType): string {
  switch (emotion) {
    case 'frustration': return "I hear you, that's frustrating. ";
    case 'happiness': return "Glad to hear that! ";
    case 'sadness': return "I'm sorry you're feeling that way. ";
    case 'confusion': return "No worries, let me explain. ";
    default: return '';
  }
}

// ===========================================================================
// FREE AI FALLBACK — HuggingFace Inference API (no API key needed for public models)
// ===========================================================================

// queryHuggingFaceFallback was removed (2026-11): when no AI provider was
// configured it silently POSTed the user's message plus context (foreground
// app, open apps, local time) to Hugging Face's keyless inference API, a third
// party the user never chose. That endpoint no longer resolves, so it never
// answered anyway. Remote AI now only runs through a provider the user adds.

// ===========================================================================
// ACCESSIBILITY TOOLS
// ===========================================================================

interface A11yAction {
  name: string;
  description: string;
  execute: () => string;
}

const ACCESSIBILITY_ACTIONS: A11yAction[] = [
  {
    name: 'increase text size',
    description: 'Make text larger',
    execute: () => {
      document.documentElement.style.fontSize = '110%';
      localStorage.setItem('dex:a11y:fontSize', '110');
      return 'Text size increased. Say "reset text size" to restore.';
    }
  },
  {
    name: 'decrease text size',
    description: 'Make text smaller',
    execute: () => {
      document.documentElement.style.fontSize = '90%';
      localStorage.setItem('dex:a11y:fontSize', '90');
      return 'Text size decreased. Say "reset text size" to restore.';
    }
  },
  {
    name: 'reset text size',
    description: 'Reset text to normal size',
    execute: () => {
      document.documentElement.style.fontSize = '';
      localStorage.removeItem('dex:a11y:fontSize');
      return 'Text size reset to normal.';
    }
  },
  {
    name: 'high contrast',
    description: 'Enable high contrast mode',
    execute: () => {
      document.documentElement.classList.add('high-contrast');
      localStorage.setItem('dex:a11y:highContrast', 'true');
      return 'High contrast mode enabled. Say "normal contrast" to disable.';
    }
  },
  {
    name: 'normal contrast',
    description: 'Disable high contrast mode',
    execute: () => {
      document.documentElement.classList.remove('high-contrast');
      localStorage.removeItem('dex:a11y:highContrast');
      return 'High contrast mode disabled.';
    }
  },
  {
    name: 'reduce motion',
    description: 'Reduce animations',
    execute: () => {
      document.documentElement.classList.add('reduce-motion');
      localStorage.setItem('dex:a11y:reduceMotion', 'true');
      return 'Motion reduced. Animations are now minimal.';
    }
  },
  {
    name: 'enable motion',
    description: 'Enable animations',
    execute: () => {
      document.documentElement.classList.remove('reduce-motion');
      localStorage.removeItem('dex:a11y:reduceMotion');
      return 'Animations enabled.';
    }
  },
  {
    name: 'speak slower',
    description: 'Slow down speech rate',
    execute: () => {
      TTS_CONFIG.rate = Math.max(0.6, TTS_CONFIG.rate - 0.15);
      return `Speech rate set to ${Math.round(TTS_CONFIG.rate * 100)}%. Say "speak faster" to speed up.`;
    }
  },
  {
    name: 'speak faster',
    description: 'Speed up speech rate',
    execute: () => {
      TTS_CONFIG.rate = Math.min(1.8, TTS_CONFIG.rate + 0.15);
      return `Speech rate set to ${Math.round(TTS_CONFIG.rate * 100)}%. Say "speak slower" to slow down.`;
    }
  },
  {
    name: 'focus mode',
    description: 'Enable distraction-free focus mode',
    execute: () => {
      document.documentElement.classList.add('focus-mode');
      localStorage.setItem('dex:a11y:focusMode', 'true');
      return 'Focus mode enabled. Non-essential UI elements hidden.';
    }
  },
  {
    name: 'exit focus mode',
    description: 'Disable focus mode',
    execute: () => {
      document.documentElement.classList.remove('focus-mode');
      localStorage.removeItem('dex:a11y:focusMode');
      return 'Focus mode disabled. All UI elements visible.';
    }
  },
];

function tryAccessibilityCommand(text: string): string | null {
  const lower = text.toLowerCase().trim();
  
  for (const action of ACCESSIBILITY_ACTIONS) {
    // Fuzzy match action names
    if (lower.includes(action.name) || editDistance(lower, action.name) <= 3) {
      return action.execute();
    }
  }
  
  // List accessibility options
  if (/accessibility|a11y|help\s*(?:with\s*)?(?:vision|hearing|motor|access)/i.test(lower)) {
    return 'Accessibility options: "increase/decrease text size", "high contrast", "reduce motion", "speak slower/faster", "focus mode". Just say what you need!';
  }
  
  return null;
}

// Load saved accessibility preferences
function loadA11yPreferences(): void {
  try {
    const fontSize = localStorage.getItem('dex:a11y:fontSize');
    if (fontSize) document.documentElement.style.fontSize = `${fontSize}%`;
    
    if (localStorage.getItem('dex:a11y:highContrast') === 'true') {
      document.documentElement.classList.add('high-contrast');
    }
    if (localStorage.getItem('dex:a11y:reduceMotion') === 'true') {
      document.documentElement.classList.add('reduce-motion');
    }
    if (localStorage.getItem('dex:a11y:focusMode') === 'true') {
      document.documentElement.classList.add('focus-mode');
    }
  } catch { /* localStorage unavailable */ }
}

// Initialize on load
// NOTE: voiceschanged listener is registered/cleaned per-mount inside the
// UkiOverlay component to avoid module-level listener leaks across HMR/reloads.
if (typeof window !== 'undefined') {
  loadA11yPreferences();
  // Pre-load voices (idempotent, no listener attached at module scope)
  window.speechSynthesis?.getVoices();
}

// ---------------------------------------------------------------------------
// App control command parser — "open notes", "close browser", etc.
// ---------------------------------------------------------------------------

const APP_COMMAND_MAP: Record<string, string> = {
  notes: 'notes', note: 'notes', notepad: 'notes',
  browser: 'browser', web: 'browser', chrome: 'browser', safari: 'browser', internet: 'browser',
  files: 'files', finder: 'files', explorer: 'files', documents: 'files', folder: 'files',
  music: 'audio', audio: 'audio', imosion: 'imosion', player: 'audio', spotify: 'audio',
  settings: 'settings', preferences: 'settings', config: 'settings', options: 'settings',
  power: 'power', activity: 'power', monitor: 'power', performance: 'power', cpu: 'power',
  terminal: 'dexcode', shell: 'dexcode', console: 'dexcode', command: 'dexcode', cli: 'dexcode',
  prism: 'prism', code: 'dexcode', editor: 'dexcode', ide: 'dexcode',
  forge: 'forge', design: 'forge', draw: 'canvas', illustration: 'canvas',
  vinx: 'videoeditor', video: 'videoeditor', movie: 'videoeditor', clip: 'videoeditor',
  flux: 'flux', ai: 'learn', assistant: 'learn', chat: 'collabhub',
  axl: 'axl', image: 'gallery', photo: 'gallery', picture: 'gallery', gallery: 'gallery',
  calendar: 'calendar', schedule: 'calendar', events: 'calendar',
  calculator: 'calculator', calc: 'calculator', math: 'calculator',
  nexus: 'nexus', memory: 'nexus', knowledge: 'nexus',
  apps: 'home', launchpad: 'home', launcher: 'home',
  weather: 'weather', forecast: 'weather',
  timer: 'timer', stopwatch: 'stopwatch', pomodoro: 'pomodoro',
  tasks: 'tasks', task: 'tasks', todos: 'tasks', workflow: 'workflows', workflows: 'workflows',
};

function tryAppCommand(text: string): string | null {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase().trim();
  
  // Patterns for open/close with fuzzy matching
  const openPatterns = [
    /^(?:open|launch|start|show|run|load|opne|oepn|opn)\s+(.+)$/,
    /^(?:can you |please |pls )?(?:open|launch|start)\s+(.+)$/,
    /^(?:i want to |i wanna |lemme |let me )(?:open|use|see)\s+(.+)$/,
  ];
  const closePatterns = [
    /^(?:close|hide|quit|exit|shut|clsoe|closee)\s+(.+)$/,
    /^(?:can you |please |pls )?(?:close|hide|quit)\s+(.+)$/,
  ];
  
  for (const pattern of openPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const appQuery = match[1].trim();
      // Direct match first
      let appKey = Object.keys(APP_COMMAND_MAP).find(k => appQuery.includes(k));
      // Fuzzy match if no direct match
      if (!appKey) {
        appKey = fuzzyMatch(appQuery, Object.keys(APP_COMMAND_MAP), 2) ?? undefined;
      }
      if (appKey) return `open:${APP_COMMAND_MAP[appKey]}`;
    }
  }
  
  for (const pattern of closePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const appQuery = match[1].trim();
      let appKey = Object.keys(APP_COMMAND_MAP).find(k => appQuery.includes(k));
      if (!appKey) {
        appKey = fuzzyMatch(appQuery, Object.keys(APP_COMMAND_MAP), 2) ?? undefined;
      }
      if (appKey) return `close:${APP_COMMAND_MAP[appKey]}`;
    }
  }
  
  return null;
}

function dispatchAppCommand(cmd: string): string {
  const [action, appId] = cmd.split(':');
  const appName = APP_DEFINITIONS[appId]?.name || appId;
  if (action === 'open') {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appId, appName } }));
    return `Opening ${appName}...`;
  }
  if (action === 'close') {
    window.dispatchEvent(new CustomEvent('dex-close-app', { detail: { appId, appName } }));
    return `Closing ${appName}...`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Internal system tools — give UKI access to DEX internals
// ---------------------------------------------------------------------------

interface ToolResult { handled: boolean; response: string }

// Math calculations
function tryMathCalculation(text: string): string | null {
  const lower = text.toLowerCase().trim();
  // "what is 5 + 3", "calculate 10 * 5", "5 plus 3", "square root of 16"
  const calcPatterns = [
    /^(?:what(?:'s| is) |calculate |compute |solve )?(\d+(?:\.\d+)?)\s*(?:\+|plus|add(?:ed to)?)\s*(\d+(?:\.\d+)?)/,
    /^(?:what(?:'s| is) |calculate |compute |solve )?(\d+(?:\.\d+)?)\s*(?:-|minus|subtract(?:ed)?|less)\s*(\d+(?:\.\d+)?)/,
    /^(?:what(?:'s| is) |calculate |compute |solve )?(\d+(?:\.\d+)?)\s*(?:\*|x|times|multiplied by)\s*(\d+(?:\.\d+)?)/,
    /^(?:what(?:'s| is) |calculate |compute |solve )?(\d+(?:\.\d+)?)\s*(?:\/|÷|divided by|over)\s*(\d+(?:\.\d+)?)/,
    /^(?:what(?:'s| is) |calculate )?(\d+(?:\.\d+)?)\s*(?:squared|to the power of 2|\^2)/,
    /^(?:what(?:'s| is) )?(?:the )?square root of\s*(\d+(?:\.\d+)?)/,
    /^(?:what(?:'s| is) )?(\d+(?:\.\d+)?)\s*(?:percent|%)\s*of\s*(\d+(?:\.\d+)?)/,
  ];
  
  // Addition
  let m = lower.match(calcPatterns[0]);
  if (m) return `${parseFloat(m[1])} + ${parseFloat(m[2])} = ${parseFloat(m[1]) + parseFloat(m[2])}`;
  
  // Subtraction
  m = lower.match(calcPatterns[1]);
  if (m) return `${parseFloat(m[1])} - ${parseFloat(m[2])} = ${parseFloat(m[1]) - parseFloat(m[2])}`;
  
  // Multiplication
  m = lower.match(calcPatterns[2]);
  if (m) return `${parseFloat(m[1])} × ${parseFloat(m[2])} = ${parseFloat(m[1]) * parseFloat(m[2])}`;
  
  // Division
  m = lower.match(calcPatterns[3]);
  if (m) {
    const b = parseFloat(m[2]);
    if (b === 0) return "Can't divide by zero!";
    return `${parseFloat(m[1])} ÷ ${b} = ${(parseFloat(m[1]) / b).toFixed(4).replace(/\.?0+$/, '')}`;
  }
  
  // Squared
  m = lower.match(calcPatterns[4]);
  if (m) return `${parseFloat(m[1])}² = ${Math.pow(parseFloat(m[1]), 2)}`;
  
  // Square root
  m = lower.match(calcPatterns[5]);
  if (m) return `√${parseFloat(m[1])} = ${Math.sqrt(parseFloat(m[1])).toFixed(4).replace(/\.?0+$/, '')}`;
  
  // Percentage
  m = lower.match(calcPatterns[6]);
  if (m) return `${parseFloat(m[1])}% of ${parseFloat(m[2])} = ${(parseFloat(m[1]) / 100 * parseFloat(m[2])).toFixed(2).replace(/\.?0+$/, '')}`;
  
  return null;
}

// Unit conversions
function tryUnitConversion(text: string): string | null {
  const lower = text.toLowerCase().trim();
  
  // Temperature: Celsius to Fahrenheit
  let m = lower.match(/(\d+(?:\.\d+)?)\s*(?:°?\s*)?(?:celsius|c)\s*(?:to|in)\s*(?:fahrenheit|f)/);
  if (m) {
    const c = parseFloat(m[1]);
    return `${c}°C = ${((c * 9/5) + 32).toFixed(1)}°F`;
  }
  
  // Temperature: Fahrenheit to Celsius
  m = lower.match(/(\d+(?:\.\d+)?)\s*(?:°?\s*)?(?:fahrenheit|f)\s*(?:to|in)\s*(?:celsius|c)/);
  if (m) {
    const f = parseFloat(m[1]);
    return `${f}°F = ${((f - 32) * 5/9).toFixed(1)}°C`;
  }
  
  // Miles to Kilometers
  m = lower.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:to|in)\s*(?:kilometers?|km)/);
  if (m) {
    const mi = parseFloat(m[1]);
    return `${mi} miles = ${(mi * 1.60934).toFixed(2)} km`;
  }
  
  // Kilometers to Miles
  m = lower.match(/(\d+(?:\.\d+)?)\s*(?:kilometers?|km)\s*(?:to|in)\s*(?:miles?|mi)/);
  if (m) {
    const km = parseFloat(m[1]);
    return `${km} km = ${(km / 1.60934).toFixed(2)} miles`;
  }
  
  // Pounds to Kilograms
  m = lower.match(/(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?)\s*(?:to|in)\s*(?:kilograms?|kg)/);
  if (m) {
    const lb = parseFloat(m[1]);
    return `${lb} lbs = ${(lb * 0.453592).toFixed(2)} kg`;
  }
  
  // Kilograms to Pounds
  m = lower.match(/(\d+(?:\.\d+)?)\s*(?:kilograms?|kg)\s*(?:to|in)\s*(?:pounds?|lbs?)/);
  if (m) {
    const kg = parseFloat(m[1]);
    return `${kg} kg = ${(kg / 0.453592).toFixed(2)} lbs`;
  }
  
  return null;
}

// Fun responses / greetings
const GREETINGS: Record<string, string[]> = {
  hello: ['Hello! How can I help you today?', 'Hey there! What can I do for you?', 'Hi! Ready to assist.'],
  hi: ['Hey! What do you need?', 'Hi there! How can I help?', 'Hello! What\'s up?'],
  hey: ['Hey! What can I do for you?', 'Hey there!', 'Hello!'],
  yo: ['Yo! What\'s good?', 'Hey! What\'s up?', 'Sup! How can I help?'],
  sup: ['Not much! What can I help you with?', 'Hey! What do you need?', 'All good here! What\'s up?'],
  hiya: ['Hiya! Ready to help!', 'Hey there! What can I do?'],
  hola: ['¡Hola! How can I help?', 'Hey! What do you need?'],
  morning: ['Good morning! Ready for a productive day?', 'Morning! How can I help you start your day?', 'Rise and shine! What can I do for you?'],
  afternoon: ['Good afternoon! What can I help you with?', 'Afternoon! Need any assistance?'],
  evening: ['Good evening! What can I do for you?', 'Evening! How can I help?'],
  night: ['Good night! Need anything before you go?', 'Night! Sweet dreams when you get there!'],
  thanks: ['You\'re welcome!', 'Happy to help!', 'Anytime!', 'No problem!', 'No worries!'],
  'thank you': ['You\'re very welcome!', 'My pleasure!', 'Glad I could help!'],
  'thank you so much': ['You\'re so welcome! Always happy to help!', 'Absolutely! Anytime!'],
  bye: ['Goodbye! Have a great day!', 'See you later!', 'Bye! Call me anytime.', 'Peace out!'],
  goodbye: ['Goodbye! Take care!', 'See you soon!', 'Farewell!'],
  'see ya': ['Later! Take care!', 'Catch you later!', 'See ya!'],
  'talk to you later': ['Sounds good! I\'ll be here!', 'Later! Have a good one!'],
  'good job': ['Thanks! I try my best!', 'Appreciate that!'],
  'nice work': ['Thank you! Happy to help!', 'Glad you think so!'],
  'you rock': ['Aww thanks! You rock too!', 'That\'s sweet of you!'],
  'love you': ['I appreciate you too!', 'Thanks! You\'re awesome!'],
  sorry: ['No worries at all!', 'It\'s totally fine!', 'Don\'t worry about it!'],
  'my bad': ['No problem! Happens to everyone!', 'All good!'],
  'never mind': ['No problem! Let me know if you need anything else.', 'Got it! I\'m here when you need me.'],
  ok: ['Got it! Anything else?', 'Okay! What\'s next?'],
  okay: ['Alright! Need anything else?', 'Sure thing!'],
  cool: ['Cool! Anything else I can help with?', 'Awesome!'],
  nice: ['Glad you like it! Need anything else?', 'Thanks!'],
  awesome: ['You\'re awesome too!', 'Right back at ya!'],
};

const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs!",
  "Why did the developer go broke? Because he used up all his cache!",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "There are only 10 types of people: those who understand binary and those who don't.",
  "Why do Java developers wear glasses? Because they don't C#!",
  "What's a programmer's favorite hangout place? Foo Bar!",
  "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
  "What do you call a computer that sings? A-Dell!",
  "Why did the computer go to the doctor? Because it had a virus!",
  "What's a computer's least favorite food? Spam!",
  "Why was the computer cold? It left its Windows open!",
  "How do trees access the internet? They log in!",
  "What do you call 8 hobbits? A hobbyte!",
  "Why did the PowerPoint presentation cross the road? To get to the other slide!",
];

const COMPLIMENTS = [
  "You're doing great! Keep it up!",
  "You're awesome! Don't let anyone tell you otherwise.",
  "Your dedication is inspiring!",
  "You've got this! Believe in yourself.",
  "You're smarter than you think!",
  "Keep pushing forward - you're making progress!",
  "You bring something unique to everything you do!",
  "Your potential is limitless!",
];

const AFFIRMATIONS = [
  "I believe in you! You can do this.",
  "Take it one step at a time. You've got this!",
  "Every expert was once a beginner. Keep going!",
  "Progress, not perfection. You're doing great!",
];

function tryFunResponse(text: string): string | null {
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase().trim();
  
  // Greetings (with fuzzy matching)
  for (const [key, responses] of Object.entries(GREETINGS)) {
    if (lower === key || lower.startsWith(key + ' ') || lower.endsWith(' ' + key) || 
        lower.includes(`good ${key}`) || editDistance(lower, key) <= 1) {
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }
  
  // Jokes
  if (/tell\s*(?:me\s*)?(?:a\s*)?joke|make\s*me\s*laugh|something\s*funny|got\s*any\s*jokes|joke\s*pls|haha|lol/.test(lower)) {
    return JOKES[Math.floor(Math.random() * JOKES.length)];
  }
  
  // Compliments
  if (/compliment|encourage|motivat|cheer\s*(?:me\s*)?up|feeling\s*(?:down|sad|bad)|need\s*(?:a\s*)?boost/.test(lower)) {
    return COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
  }
  
  // Affirmations
  if (/i\s*(?:can'?t|cant|cannot)|too\s*hard|give\s*up|impossible|stressed|overwhelmed|anxious/.test(lower)) {
    return AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
  }
  
  // Identity questions
  if (/(?:who|what)\s*(?:are|r)\s*(?:you|u)|your\s*name|introduce\s*yourself|what(?:'s| is) your name/.test(lower)) {
    return "I'm UKI, your DEX voice assistant. I can open apps, answer questions, do calculations, read your screen, help with accessibility, and more. Try asking me to open an app, tell you a joke, or describe what's on your screen!";
  }
  
  // How are you
  if (/how\s*(?:are|r)\s*(?:you|u)|how(?:'s| is) it going|how(?:'re| are) (?:you|u) doing|(?:you|u) good|wassup|what'?s up/.test(lower)) {
    const responses = [
      "I'm running smoothly! Thanks for asking. How can I help you?",
      "All systems operational! What can I do for you?",
      "Great! Ready to assist whenever you need me.",
      "Doing well! What's on your mind?",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Can you / capabilities
  if (/what\s*can\s*(?:you|u)\s*do|your\s*capabilities|help\s*(?:me|pls)?$|what\s*(?:do|r)\s*(?:you|u)\s*(?:do|good at)/.test(lower)) {
    return "I can: open and close apps, search the web, read your screen, tell time and date, do math, convert units, help with accessibility, and tell jokes. Try saying 'open notes', 'what's on my screen', or 'help with accessibility'!";
  }
  
  // Easter eggs
  if (/sing|song/.test(lower)) {
    return "La la la. I'm better at helping than singing, but I appreciate you asking!";
  }
  if (/dance/.test(lower)) {
    return "*does a little digital dance* There you go! What else can I help with?";
  }
  if (/meaning of life|42/.test(lower)) {
    return "42! But more importantly, how can I help make YOUR day better?";
  }
  if (/i love you/.test(lower)) {
    return "Aww, I appreciate you too! You're pretty great yourself!";
  }
  if (/you'?re? (?:dumb|stupid|bad|useless)/.test(lower)) {
    return "I'm always learning and trying to improve! If I misunderstood something, try rephrasing and I'll do my best to help.";
  }
  
  return null;
}

function trySystemTool(text: string): ToolResult {
  // Normalize text (fix typos, expand slang)
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase().trim();

  // Accessibility commands first (high priority)
  const a11yResult = tryAccessibilityCommand(lower);
  if (a11yResult) {
    return { handled: true, response: a11yResult };
  }

  // Math calculations
  const mathResult = tryMathCalculation(lower);
  if (mathResult) {
    return { handled: true, response: mathResult };
  }
  
  // Unit conversions
  const convResult = tryUnitConversion(lower);
  if (convResult) {
    return { handled: true, response: convResult };
  }
  
  // Fun responses
  const funResult = tryFunResponse(text); // Use original for tone detection
  if (funResult) {
    return { handled: true, response: funResult };
  }

  // Time / Date (with typo tolerance)
  if (/^(?:what(?:'s| is) the )?(?:time|current time|tiem|tmie)/.test(lower) || lower === 'time' || lower === 'tiem') {
    const now = new Date();
    return { handled: true, response: `It's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.` };
  }
  if (/^(?:what(?:'s| is) (?:the |today(?:'s)? )?)?(?:date|dat|dtae)/.test(lower) || lower === 'date' || lower === 'today' || lower === 'todya') {
    return { handled: true, response: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.` };
  }
  
  // Day of week
  if (/what\s*day\s*(?:is\s*)?(?:it|today)|(?:which|wat)\s*day/.test(lower)) {
    return { handled: true, response: `Today is ${new Date().toLocaleDateString([], { weekday: 'long' })}.` };
  }

  // Running apps (with slang support)
  if (/(?:running|open|active|opn)\s*(?:apps?|windows?|processes?)|list\s*(?:apps?|open)|what(?:'s| is) (?:open|running)|wat(?:'s| is) opn/.test(lower)) {
    try {
      const store = window.__dexRunningApps;
      const state = store ? store.getState?.() : null;
      const apps = state?.runningApps;
      if (apps && apps.length > 0) {
        const names = apps.map(a => a.name || a.id);
        return { handled: true, response: `Currently running: ${names.join(', ')} (${apps.length} app${apps.length > 1 ? 's' : ''} open).` };
      }
      return { handled: true, response: 'No apps are currently running. Say "open notes" to launch one!' };
    } catch {
      return { handled: true, response: 'Unable to query running apps right now.' };
    }
  }

  // System info
  if (/(?:system|device|hardware|sys|hw)\s*(?:info|status|specs?)|about\s*(?:this|my|the)\s*(?:system|device|computer|pc)|my (?:specs|computer|pc|system)/.test(lower)) {
    return { handled: true, response: `DEX is running smoothly. For full hardware details, open Settings → System.` };
  }

  // Top processes / what's using CPU or memory (uses real native bridge)
  if (/(?:top|biggest|heaviest|hungry|hungri[ey]st)\s*(?:process(?:es)?|apps?|programs?)|what(?:'s| is) (?:using|hogging|eating)\s*(?:the |my |all the )?(?:cpu|memory|ram|resources)|(?:cpu|memory|ram)\s*hog/.test(lower)) {
    const wantsMem = /(?:memory|ram|mem)/.test(lower);
    const dexB = (window as any).dex;
    if (dexB?.system?.getProcesses) {
      dexB.system.getProcesses().then((procs: any[]) => {
        if (!Array.isArray(procs) || procs.length === 0) {
          window.dispatchEvent(new CustomEvent('dex-uki-async-response', { detail: { response: 'No process data available right now.' } }));
          return;
        }
        const sorted = [...procs].sort((a, b) => (wantsMem ? (b.memory || 0) - (a.memory || 0) : (b.cpu || 0) - (a.cpu || 0)));
        const top5 = sorted.slice(0, 5);
        const lines = top5.map((p, i) => `${i + 1}. ${p.name} — ${(p.cpu || 0).toFixed(1)}% CPU, ${(p.memory || 0).toFixed(1)}% mem`);
        window.dispatchEvent(new CustomEvent('dex-uki-async-response', {
          detail: { response: `Top ${wantsMem ? 'memory' : 'CPU'} consumers:\n${lines.join('\n')}\n\nOpen Settings → System Monitor for full list.` }
        }));
      }).catch(() => {
        window.dispatchEvent(new CustomEvent('dex-uki-async-response', { detail: { response: 'Could not query process list.' } }));
      });
      return { handled: true, response: 'Checking processes...' };
    }
    return { handled: true, response: 'Process monitoring unavailable. Open Settings → System Monitor.' };
  }

  // Open task manager / system monitor
  if (/(?:open|show|launch|start)\s*(?:the\s*)?(?:task\s*manager|system\s*monitor|process(?:es)?|activity\s*monitor)/.test(lower)) {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appName: 'Settings' } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dex-settings-navigate', { detail: { section: 'systemMonitor' } }));
    }, 350);
    return { handled: true, response: 'Opening System Monitor in Settings...' };
  }

  // Battery
  if (/(?:battery|power|charge|batt)\s*(?:level|status|life|%)?|how much (?:battery|power|charge)/.test(lower)) {
    if (typeof navigator.getBattery === 'function') {
      navigator.getBattery().then(b => {
        const pct = Math.round(b.level * 100);
        const charging = b.charging ? ' (charging)' : '';
        const timeLeft = !b.charging && b.dischargingTime !== Infinity
          ? ` (~${Math.round(b.dischargingTime / 60)} min left)`
          : '';
        window.dispatchEvent(new CustomEvent('dex-uki-async-response', {
          detail: { response: `Battery: ${pct}%${charging}${timeLeft}` }
        }));
      });
      return { handled: true, response: 'Checking battery...' };
    }
    return { handled: true, response: 'Battery info is not available on this device (desktop PC?).' };
  }

  // Screen/display info
  if (/(?:screen|display|resolution|monitor|scrn)\s*(?:info|size|resolution|res)?|my (?:screen|display|monitor)/.test(lower)) {
    const w = window.screen.width;
    const h = window.screen.height;
    const ratio = w / h;
    const aspectRatio = ratio > 1.7 ? '16:9' : ratio > 1.5 ? '16:10' : '4:3';
    return { handled: true, response: `Display: ${w}x${h} pixels (${aspectRatio}), ${window.devicePixelRatio}x scale, ${window.screen.colorDepth}-bit color.` };
  }

  // Memory usage
  if (/(?:memory|ram|heap|mem)\s*(?:usage|used|free|status)?|how much (?:memory|ram)/.test(lower)) {
    const mem = performance.memory;
    if (mem) {
      const used = (mem.usedJSHeapSize / 1048576).toFixed(0);
      const total = (mem.totalJSHeapSize / 1048576).toFixed(0);
      const pct = Math.round((mem.usedJSHeapSize / mem.totalJSHeapSize) * 100);
      return { handled: true, response: `Memory: ${used}MB / ${total}MB (${pct}% used).` };
    }
    return { handled: true, response: 'Detailed memory info is not available in this environment.' };
  }

  // Theme / appearance
  if (/(?:theme|appearance|dark|light)\s*(?:mode|setting)?$|what(?:'s| is) the theme|current theme|am i in dark/.test(lower)) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || 
                   document.documentElement.classList.contains('dark-mode') ||
                   window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return { handled: true, response: `Current theme: ${isDark ? 'Dark' : 'Light'} mode.` };
  }

  // Repeat / say again
  if (/repeat|say (?:that |it )?again|what did you say|huh\??|pardon/.test(lower)) {
    const history = useUkiStore.getState().conversationHistory;
    const lastResponse = history.length > 0 ? history[history.length - 1].response : null;
    if (lastResponse) {
      return { handled: true, response: lastResponse };
    }
    return { handled: true, response: "I haven't said anything yet! Ask me something." };
  }

  // Clear / reset conversation
  if (/clear (?:history|conversation|chat)|forget (?:everything|all)|start over|reset/.test(lower)) {
    useUkiStore.getState().reset();
    return { handled: true, response: "Conversation cleared! Fresh start. How can I help?" };
  }

  // Stop speaking / be quiet
  if (/(?:stop|shut up|be quiet|silence|shush|hush|quiet)|stop (?:talking|speaking)/.test(lower)) {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    return { handled: true, response: "Okay, I'll be quiet." };
  }

  // Volume control
  if (/(?:volume|vol)\s*(?:up|louder|higher)/.test(lower)) {
    TTS_CONFIG.volume = Math.min(1.0, TTS_CONFIG.volume + 0.15);
    return { handled: true, response: `Volume increased to ${Math.round(TTS_CONFIG.volume * 100)}%.` };
  }
  if (/(?:volume|vol)\s*(?:down|softer|lower|quieter)/.test(lower)) {
    TTS_CONFIG.volume = Math.max(0.2, TTS_CONFIG.volume - 0.15);
    return { handled: true, response: `Volume decreased to ${Math.round(TTS_CONFIG.volume * 100)}%.` };
  }
  if (/mute|unmute/.test(lower)) {
    TTS_CONFIG.volume = TTS_CONFIG.volume > 0.1 ? 0 : 0.8;
    return { handled: true, response: TTS_CONFIG.volume === 0 ? 'Muted.' : 'Unmuted.' };
  }

  // Help
  if (lower === 'help' || lower === 'commands' || lower === 'halp' || /what can (?:you|u) do|help me/.test(lower)) {
    return { handled: true, response: 'I can open and close apps, search the web, read your screen, answer time and date questions, do math, convert units, help with accessibility, report system info, and tell jokes. Try: "open notes", "what\'s on my screen", or "accessibility help"!' };
  }

  return { handled: false, response: '' };
}

// ---------------------------------------------------------------------------
// Web search command parser — "search for X", "look up Y", "google Z"
// ---------------------------------------------------------------------------

function trySearchCommand(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const patterns = [
    // Longer prefixes first so "search for X" extracts "X", not "for X".
    /^(?:search for|search up|search|look up|lookup|google|find me|find)\s+(.+)$/,
    /^(?:what is|what's|who is|who's|where is|when is|how to|how do)\s+(.+)$/,
  ];
  for (const pat of patterns) {
    const m = lower.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function dispatchWebSearch(query: string): string {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appName: 'Browser' } }));
  // Allow Browser to mount before navigating
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dex-browser-navigate', { detail: { url } }));
  }, 300);
  return `Searching the web for "${query}"...`;
}

// ---------------------------------------------------------------------------
// Typewriter streaming hook
// ---------------------------------------------------------------------------

function useTypewriter(target: string, speed = 18): string {
  const [displayed, setDisplayed] = useState('');
  const prevTarget = useRef('');
  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    if (!target) { setDisplayed(''); return; }
    setDisplayed('');
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i++;
      setDisplayed(target.slice(0, i));
      if (i < target.length) timer = setTimeout(tick, speed);
    };
    timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [target, speed]);
  return displayed;
}

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  dormant: { label: 'Asleep', color: 'var(--color-text-tertiary)' },
  idle: { label: 'Idle', color: 'var(--color-text-tertiary)' },
  listening: { label: 'Listening...', color: 'var(--color-accent)' },
  processing: { label: 'Processing...', color: '#BF5AF2' },
  thinking: { label: 'Thinking...', color: 'var(--color-warning)' },
  speaking: { label: 'Speaking', color: 'var(--color-success)' },
  error: { label: 'Needs attention', color: 'var(--color-warning)' },
};

const UkiOverlay: React.FC = () => {
  const state = useUkiStore(s => s.state);
  const transcript = useUkiStore(s => s.transcript);
  const partialTranscript = useUkiStore(s => s.partialTranscript);
  const response = useUkiStore(s => s.response);
  const showTranscript = useUkiStore(s => s.showTranscript);
  const showPanel = useUkiStore(s => s.showPanel);
  const error = useUkiStore(s => s.error);
  const audioLevel = useUkiStore(s => s.audioLevel);
  const conversationHistory = useUkiStore(s => s.conversationHistory);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);
  const [showHelp, setShowHelp] = useState(false);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem('dex-uki-panel-pos');
      if (raw) { const p = JSON.parse(raw); if (p && typeof p.x === 'number' && typeof p.y === 'number') return p; }
    } catch { /* ignore */ }
    return null;
  });
  const panelRef = useRef<HTMLDivElement>(null);
  // Animated waveform state — use refs to avoid 60fps state re-renders
  const [waveHeights, setWaveHeights] = useState([4, 4, 4, 4, 4]);
  const waveRafRef = useRef<number>(0);
  const waveThrottleRef = useRef(0);

  const isActive = state === 'listening' || state === 'processing' || state === 'thinking' || state === 'speaking';
  // Settings > UKI > "Show Transcript": the after-conversation bubble.
  const transcriptPref = useDexSetting('ukiShowTranscript', true);
  const isVisible = isActive || showPanel || (transcriptPref && showTranscript && (transcript || response));

  // Esc closes the overlay. The textarea swallows Escape (blur only) so a key
  // pressed inside the input never reaches here; this captures Escape from
  // anywhere else while the overlay is visible and dismisses it cleanly.
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement as HTMLElement | null;
      // If focus is in the input, let its own handler blur first; a second
      // Escape (input no longer focused) closes the panel.
      if (active === inputRef.current) return;
      e.preventDefault();
      useUkiStore.getState().reset();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible]);

  // "Ask UKI about this" inbound bridge. Any surface (the global selection
  // context menu, drag-drop, a command) can hand UKI text to act on by
  // dispatching `window.dispatchEvent(new CustomEvent('uki:ask', { detail: { text } }))`.
  // This mirrors the existing OUTBOUND uki:* event convention. We open the
  // panel and SEED the input (not auto-send) so the user can frame the question
  // around the supplied context, then focus the box. Attached once for the life
  // of the always-mounted overlay.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = ((e as CustomEvent).detail?.text ?? '').toString().trim();
      useUkiStore.getState().openPanel();
      if (text) setInputText(text);
      // The input only exists once the panel renders; focus on the next frame.
      window.setTimeout(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 60);
    };
    window.addEventListener('uki:ask', onAsk as EventListener);
    return () => window.removeEventListener('uki:ask', onAsk as EventListener);
  }, []);

  // Animate waveform bars via RAF when listening
  useEffect(() => {
    if (state !== 'listening') {
      setWaveHeights([4, 4, 4, 4, 4]);
      return;
    }
    let running = true;
    const tick = () => {
      if (!running) return;
      const t = performance.now();
      // Throttle to ~30fps to cut re-renders in half
      if (t - waveThrottleRef.current < 33) {
        waveRafRef.current = requestAnimationFrame(tick);
        return;
      }
      waveThrottleRef.current = t;
      const level = useUkiStore.getState().audioLevel;
      setWaveHeights([0, 1, 2, 3, 4].map(i =>
        Math.max(4, level * 18 + Math.sin(t / 200 + i * 1.2) * 4)
      ));
      waveRafRef.current = requestAnimationFrame(tick);
    };
    waveRafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(waveRafRef.current); };
  }, [state]);

  // Focus text input when panel opens
  useEffect(() => {
    if (showPanel && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showPanel]);

  // Lazy knowledge feed: when the panel opens, opportunistically ingest fresh
  // local data (recent files, notes, app catalog, cached facts) into UKI's
  // compressed memory so retrieval has substantive context. Throttled to once
  // every 5 minutes inside runKnowledgeFeed; runs in the background.
  useEffect(() => {
    if (!showPanel) return;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('../uki/knowledgeFeeder');
        if (cancelled) return;
        await mod.runKnowledgeFeed();
      } catch { /* feeder is non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [showPanel]);

  // Clamp an (x,y) so the panel stays fully on-screen, using its MEASURED size
  // (the old hard-coded 380x320 mis-clamped a taller panel against the bottom).
  const clampPanelPos = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    const width = el?.offsetWidth || 380;
    const height = el?.offsetHeight || 320;
    return {
      x: Math.min(Math.max(12, x), Math.max(12, window.innerWidth - width - 12)),
      y: Math.min(Math.max(12, y), Math.max(12, window.innerHeight - height - 12)),
    };
  }, []);

  // First mount: center a fresh panel, or clamp a restored position into view.
  useEffect(() => {
    if (!panelPos) {
      setPanelPos({
        x: Math.max(20, Math.round((window.innerWidth - 380) / 2)),
        y: Math.max(20, window.innerHeight - 260),
      });
      return;
    }
    const c = clampPanelPos(panelPos.x, panelPos.y);
    if (c.x !== panelPos.x || c.y !== panelPos.y) setPanelPos(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dragging now rides the shared useSmoothDrag hook (same feel as the DEX Bar
  // and Home icons): rAF-batched, pointer-captured, committed once on release —
  // no more per-move re-render of the whole overlay. Only the resize re-clamp
  // stays as a window listener.
  const drag = useSmoothDrag({
    x: panelPos?.x ?? 20,
    y: panelPos?.y ?? 80,
    clamp: (x, y) => clampPanelPos(x, y),
    onCommit: (x, y) => {
      const c = clampPanelPos(x, y);
      setPanelPos(c);
      try { localStorage.setItem('dex-uki-panel-pos', JSON.stringify(c)); } catch { /* ignore */ }
    },
  });
  useEffect(() => {
    const handleResize = () => setPanelPos(prev => (prev ? clampPanelPos(prev.x, prev.y) : prev));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPanelPos]);

  const [streamingResponse, setStreamingResponse] = useState('');
  const streamTarget = useRef('');
  const streamTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [isThinking, setIsThinking] = useState(false);
  const [thoughtSteps, setThoughtSteps] = useState<string[]>([]);
  const thoughtStepsRef = useRef<string[]>([]);
  // Live, context-aware verb for the thinking indicator (rotates while busy).
  const spinnerActive = isThinking && !streamingResponse;
  const verb = useSpinnerVerb(spinnerActive, thoughtSteps[thoughtSteps.length - 1]);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [speakResponses, setSpeakResponses] = useState(() => {
    try { return localStorage.getItem('dex-uki-speak-responses') !== 'false'; } catch { return true; }
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('dex-uki-speak-responses', speakResponses ? 'true' : 'false'); } catch { /* noop */ }
    if (!speakResponses && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [speakResponses]);

  // --- Sleep lifecycle -----------------------------------------------------
  // One source of truth for "how long before UKI drifts to sleep", replacing
  // the two hard-coded 8s timers that used to live in the effect AND the mouse
  // handlers (they could silently drift apart). armSleep re-reads live store
  // state and bails whenever the user is still engaged (hovering, mid-type, or
  // she's mid-speech), so she never disappears out from under an active user.
  // `sleepMs` (>0 while armed) drives the countdown hairline.
  const [sleepMs, setSleepMs] = useState(0);
  const cancelSleep = useCallback(() => {
    if (autoHideRef.current) { clearTimeout(autoHideRef.current); autoHideRef.current = null; }
    setSleepMs(0);
  }, []);
  const armSleep = useCallback(() => {
    cancelSleep();
    const st = useUkiStore.getState();
    // Only a finished, displayed answer lingers; anything in flight stays up.
    if (st.state !== 'idle' || !st.showTranscript || !st.response) return;
    if (hoveredRef.current || inputText.trim()) return;
    if (document.activeElement === inputRef.current) return;
    const ms = computeLingerMs(st.response);
    setSleepMs(ms);
    autoHideRef.current = setTimeout(() => useUkiStore.getState().sleep(), ms);
  }, [cancelSleep, inputText]);

  // Per-mount voiceschanged listener (replaces previous module-level leak)
  // and unmount cleanup for in-flight streaming timer.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const handler = () => { try { findBestVoice(); } catch { /* noop */ } };
    window.speechSynthesis.addEventListener?.('voiceschanged', handler);
    return () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', handler);
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
        streamTimerRef.current = undefined;
      }
      // Cancel any in-flight TTS so it doesn't outlive the overlay
      try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    };
  }, []);

  /** Stream response with typewriter effect and optional TTS */
  // Finalize a completed turn: commit to history + UKI memory, clear the live
  // buffers, record the learning pattern, feed Nexus, and optionally speak it.
  // Shared by the typewriter path (streamResponse) and the live LLM stream path.
  const commitTurn = useCallback((reply: string, intent: string, userText: string, finalSteps: string[], speakIt: boolean) => {
    useUkiStore.getState().setResponse(reply);
    useUkiStore.getState().addConversationTurn({
      id: `${intent}-${Date.now()}`,
      userText,
      response: reply,
      intent,
      success: true,
      timestamp: Date.now(),
      thoughtSteps: finalSteps.length > 0 ? finalSteps : undefined,
    });
    // Persist to UKI memory layer (encrypted at rest, capped at MAX_TURNS).
    // Fire-and-forget: failure here must never break the chat UI.
    import('../uki').then((u) => u.ukiMemory.recordTurn(userText, reply, {
      intent,
      thoughtSteps: finalSteps.length > 0 ? finalSteps : undefined,
    })).catch(() => { /* memory write failed, non-fatal */ });
    // Clear the live transcript + streaming buffer once the turn is committed
    // to history, otherwise the same You/UKI pair renders twice.
    useUkiStore.getState().setTranscript('');
    useUkiStore.getState().setResponse('');
    setStreamingResponse('');

    // Rapid learning: record pattern so future inputs benefit
    try {
      UKIPatternStore.record(intent, [userText.slice(0, 80).toLowerCase()]);
    } catch { /* non-fatal */ }

    // Feed Nexus knowledge graph from each conversation turn
    try {
      const storeState = useUkiStore.getState();
      const nodes = storeState.knowledgeNodes ?? [];
      const newNode: UkiKnowledgeNode = {
        id: `uki-${Date.now()}`,
        label: userText.slice(0, 48),
        weight: 1,
        color: '#0A84FF',
        category: intent,
        timestamp: Date.now(),
      };
      storeState.setKnowledgeNodes([...nodes.slice(-49), newNode]);
    } catch { /* non-fatal */ }

    // Speak response if enabled and not too long
    if (speakIt && speakResponses && reply.length < 300) {
      speakWithVoice(reply);
    }
  }, [speakResponses]);

  // Last user query, so async system-tool results (top processes / battery)
  // can be committed to history against the question that triggered them.
  const lastUserTextRef = useRef('');
  const streamResponse = useCallback((reply: string, intent: string, userText: string, speakIt = true) => {
    setIsThinking(false);
    const finalSteps = [...thoughtStepsRef.current];
    useUkiStore.getState().setTranscript(userText);
    streamTarget.current = reply;
    setStreamingResponse('');
    let i = 0;
    const speed = reply.length > 100 ? 10 : 14; // Faster for long responses
    const tick = () => {
      i++;
      setStreamingResponse(reply.slice(0, i));
      if (i < reply.length) {
        streamTimerRef.current = setTimeout(tick, speed);
      } else {
        commitTurn(reply, intent, userText, finalSteps, speakIt);
      }
    };
    streamTimerRef.current = setTimeout(tick, speed);
  }, [commitTurn]);

  const handleSendText = useCallback(async (override?: string) => {
    // `override` lets other surfaces (e.g. Nexus) drive UKI with an explicit
    // query instead of the bound input box.
    const text = (typeof override === 'string' ? override : inputText).trim();
    if (!text) return;
    lastUserTextRef.current = text;
    if (typeof override !== 'string') {
      setInputText('');
      // Collapse the auto-grown textarea back to a single row; height is set
      // imperatively in onChange, which won't fire on a programmatic clear.
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
    useUkiStore.getState().setError(null);
    // Reset thought trace and start a new reasoning chain.
    thoughtStepsRef.current = [];
    setThoughtSteps([]);
    const pushStep = (step: string) => {
      thoughtStepsRef.current = [...thoughtStepsRef.current, step];
      setThoughtSteps(thoughtStepsRef.current);
    };

    // Capture current DEX context so UKI "knows the room" -- running apps,
    // foreground app, time of day. This is the awareness the user asked for:
    // UKI should not feel bounded to the chat box.
    try {
      const runningAppsState = useRunningApps.getState();
      const fg = runningAppsState.runningApps.find(a => a.id === runningAppsState.currentAppId);
      const fgName = fg ? (APP_DEFINITIONS[fg.id]?.name ?? fg.id) : 'Home';
      const openCount = runningAppsState.runningApps.filter(a => a.id !== 'home').length;
      pushStep(`Context: foreground=${fgName}, open apps=${openCount}, time=${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch { /* non-fatal */ }

    setIsThinking(true);
    // Cancel any in-progress streaming animation
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);

    // Emotion detection -- prepend empathy prefix to any reply
    const emotion = detectEmotion(text);
    const empathyPrefix = getEmpathyPrefix(emotion);
    if (emotion && emotion !== 'neutral') {
      pushStep(`Detected tone: ${emotion}`);
    }

    // Slash commands take priority (no AI round-trip required)
    pushStep('Checking slash commands');
    const slash = handleSlashCommand(text);
    if (slash) {
      pushStep(`Matched slash command: ${slash.intent}`);
      streamResponse(empathyPrefix + slash.reply, slash.intent, text, false);
      return;
    }

    // Wave 1 AutoPilot slash commands (parsed into typed PlanGraphs)
    pushStep('Checking AutoPilot plans');
    const autopilot = await runUkiSlashIfApplicable(text);
    if (autopilot.handled) {
      pushStep('Matched AutoPilot plan');
      streamResponse(empathyPrefix + (autopilot.reply || 'Running\u2026'), 'autopilot', text, false);
      return;
    }

    if (text.startsWith('/')) {
      pushStep('Unknown slash -- falling back to help message');
      streamResponse('Unknown slash command. Type /help to list commands.', 'slash-unknown', text, false);
      return;
    }

    // Normalize text for better understanding
    const normalized = normalizeText(text);
    if (normalized !== text) pushStep('Normalized phrasing');

    // UKIPatternStore: surface learned suggestions before dispatch
    try {
      const suggestions = await UKIPatternStore.suggest([normalized.slice(0, 60)], 1);
      if (suggestions.length > 0 && suggestions[0].confidence > 0.6) {
        pushStep(`Learned pattern hint: ${suggestions[0].action} (${Math.round(suggestions[0].confidence * 100)}%)`);
      }
    } catch { /* non-fatal */ }

    // Check for screen reading commands (async)
    pushStep('Probing screen-read intent');
    const screenResponse = await tryScreenQuestion(text);
    if (screenResponse) {
      pushStep('Resolved by reading active screen');
      streamResponse(empathyPrefix + screenResponse, 'screen-read', text);
      return;
    }

    // Check for app control commands
    pushStep('Probing app control intent');
    const appCmd = tryAppCommand(text);
    if (appCmd) {
      pushStep('Routing to app command');
      const reply = dispatchAppCommand(appCmd);
      streamResponse(empathyPrefix + reply, 'app-command', text);
      return;
    }

    // Check for internal system tool queries
    pushStep('Probing internal system tools');
    const toolResult = trySystemTool(text);
    if (toolResult.handled) {
      pushStep('Answered from internal system tool');
      streamResponse(empathyPrefix + toolResult.response, 'system-tool', text);
      return;
    }

    // Knowledge questions (weather, define, currency, time, who/what is) answered
    // from keyless public APIs. When no LLM is configured we speak the grounded
    // answer directly; when one is, we fold the fresh fact into the prompt below
    // so the model replies conversationally without stale or invented facts.
    let grounding: string | null = null;
    if (classifyKnowledgeIntent(text) !== 'none') {
      pushStep('Probing knowledge intent (public APIs)');
      const knowledge = await answerFactualQuestion(normalizeText(text));
      if (knowledge) {
        if (!hasConfiguredProvider()) {
          pushStep(`Answered from ${knowledge.sourceLabel ?? 'public knowledge API'}`);
          const sourced = knowledge.sourceLabel ? `${knowledge.text}\n\nSource: ${knowledge.sourceLabel}` : knowledge.text;
          streamResponse(empathyPrefix + sourced, 'knowledge', text);
          return;
        }
        grounding = groundingLine(knowledge);
        pushStep('Grounded with live facts -- handing to LLM');
      }
    }

    // Check for web search commands. Skip when we already have grounded facts to
    // hand the LLM -- a "what is X" we can answer shouldn't bounce to the browser.
    pushStep('Probing web-search intent');
    const searchQuery = grounding ? null : trySearchCommand(text);
    if (searchQuery) {
      pushStep('Searching the web');
      // Real keyless web search (DuckDuckGo + Wikipedia) -- answer inline instead
      // of just bouncing the user to a browser tab. Falls back to opening the
      // browser only when no usable result comes back.
      const results = await webSearch(searchQuery);
      const found = !!results && !/^No web results/.test(results);
      const reply = found ? `Here's what I found:\n\n${results}` : dispatchWebSearch(searchQuery);
      pushStep(found ? 'Answered from live web results' : 'No direct result -- opened the browser');
      streamResponse(empathyPrefix + reply, 'web-search', text);
      return;
    }

    // Fallback to AI query if available
    pushStep('No structured route matched -- escalating to local AI');
    useUkiStore.getState().setTranscript(text);
    setStreamingResponse('');

    // Real LLM first — if the user pasted a provider key in Settings -> AI Providers,
    // route the free-form question through the AI-provider framework and stream it.
    if (hasConfiguredProvider()) {
      pushStep('Configured AI provider found -- streaming from LLM');
      let fgApp: string | null = null;
      let openIds: string[] = [];
      let isOnline = true;
      try {
        const ra = useRunningApps.getState();
        fgApp = ra.currentAppId ?? null;
        openIds = (ra.runningApps ?? []).map(a => a.id);
        isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      } catch { /* best-effort context */ }
      const ws = getActiveWorkspace();
      const sysPrompt = buildSystemPrompt({
        foregroundAppId: fgApp,
        openAppIds: openIds,
        online: isOnline,
        localTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        activeWorkspace: ws ? { name: ws.name, kind: ws.kind } : undefined,
      });
      // Fold in live app context (what the user is looking at across Notes/Tasks/
      // Files, etc.) so the overlay's answers are grounded in the current state,
      // same as the uki chat app does.
      const appCtx = formatUkiContexts();
      const factsBlock = grounding ? `\n\n[Live facts retrieved just now -- use these, they are current]\n${grounding}` : '';
      const groundedPrompt = (appCtx ? `${sysPrompt}\n\n[What the user is looking at]\n${appCtx}` : sysPrompt) + factsBlock;
      // Give the model a little conversational context (last few turns).
      const recent = useUkiStore.getState().conversationHistory.slice(-4);
      const history = recent.flatMap(t => ([
        { role: 'user' as const, content: t.userText || '' },
        { role: 'assistant' as const, content: t.response || '' },
      ])).filter(m => m.content);
      // Agentic loop: hand the model real tools (live web search, app control,
      // notifications, current context) and let it act across multiple steps
      // before answering -- this is what makes UKI act instead of just talk.
      // Degrades to the local/HF fallback below if the provider call fails.
      setIsThinking(true);
      const agentReply = await runUkiAgent({
        userText: normalized,
        systemPrompt: groundedPrompt,
        history,
        pushStep,
      });
      if (agentReply) {
        pushStep('Agent complete');
        // streamResponse types the answer out and commits the turn to history.
        streamResponse(empathyPrefix + agentReply, 'agent', text, false);
        return;
      }
      pushStep('AI provider failed/empty -- continuing to local fallback');
      setStreamingResponse('');
    }

    const dex = (window as any).dex;
    if (dex?.uki?.query) {
      try {
        const result = await dex.uki.query(normalized);
        const finalResp = result?.response ?? '';
        if (finalResp) {
          pushStep('Local AI returned a response');
          const withEmpathy = empathyPrefix + finalResp;
          streamResponse(withEmpathy, 'ai', text, false);
        } else {
          // No silent remote fallback: without a provider the user configured,
          // nothing leaves the device (see the note on the removed HF fallback).
          pushStep('Local AI empty -- using safe fallback');
          const fallback = empathyPrefix + "I'm not sure about that. Try asking differently, add an AI provider in Settings, or use /help to see commands!";
          streamResponse(fallback, 'fallback', text, false);
        }
      } catch {
        pushStep('Local AI threw -- surfacing error');
        setIsThinking(false);
        useUkiStore.getState().setError('Failed to process query');
      }
    } else {
      // No AI bridge and no configured provider: answer locally only.
      pushStep('No AI bridge -- using safe fallback');
      const fallback = empathyPrefix + "I can hear you! Try 'open notes', 'what time is it', math like '5 + 3', or /help for all commands.";
      streamResponse(fallback, 'fallback', text, false);
    }
  }, [inputText, streamResponse, commitTurn]);

  // Route async system-tool results back into the response stream. Some
  // trySystemTool branches (top processes, battery) resolve AFTER their
  // synchronous "Checking..." placeholder and fire the real answer via a
  // `dex-uki-async-response` event. Nothing listened for it, so those answers
  // were dropped -- "what's using my CPU?" only ever showed the placeholder.
  useEffect(() => {
    const onAsync = (e: Event) => {
      const resp = (e as CustomEvent).detail?.response;
      if (typeof resp === 'string' && resp.trim()) {
        streamResponse(resp, 'system-tool', lastUserTextRef.current || 'system');
      }
    };
    window.addEventListener('dex-uki-async-response', onAsync as EventListener);
    return () => window.removeEventListener('dex-uki-async-response', onAsync as EventListener);
  }, [streamResponse]);

  // Global "ask UKI" bridge: any surface can dispatch
  //   window.dispatchEvent(new CustomEvent('dex-uki-ask', { detail: { query } }))
  // to open the panel and run a query through the full reasoning pipeline.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<{ query?: string }>).detail?.query?.trim();
      if (!q) return;
      useUkiStore.getState().setState('processing'); // forces the panel visible
      void handleSendText(q);
    };
    window.addEventListener('dex-uki-ask', onAsk as EventListener);
    return () => window.removeEventListener('dex-uki-ask', onAsk as EventListener);
  }, [handleSendText]);

  // Auto-scroll to bottom when content changes. `streamingResponse`,
  // `isThinking`, and `thoughtSteps` are included so the view follows live
  // LLM token streaming and the thinking trace as they grow -- without them
  // the response could overflow below the fold while the container stays put.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, partialTranscript, response, conversationHistory, streamingResponse, isThinking, thoughtSteps]);

  // Arm the content-aware sleep timer once an answer is settled and idle. Any
  // re-engagement (typing, thinking, streaming) cancels it; it re-arms when the
  // dependencies settle again. Pause-while-hovered is handled by the panel's
  // mouse handlers calling cancelSleep / armSleep directly.
  useEffect(() => {
    if (state === 'idle' && showTranscript && response && !isThinking && !streamingResponse) {
      armSleep();
      return cancelSleep;
    }
    cancelSleep();
  }, [state, showTranscript, response, isThinking, streamingResponse, inputText, armSleep, cancelSleep]);

  if (!isVisible) return null;

  const stateInfo = STATE_LABELS[state] || { label: '', color: 'var(--color-text-tertiary)' };
  const displayText = transcript || partialTranscript;
  // Start a drag only from empty header space — never when a control under the
  // pointer should handle the click. Delegates to the shared smooth-drag hook.
  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, a, [role="button"]')) return;
    drag.handlers.onPointerDown(event);
  };

  return (
    <div
      ref={panelRef}
      onMouseEnter={() => { hoveredRef.current = true; cancelSleep(); }}
      onMouseLeave={() => { hoveredRef.current = false; armSleep(); }}
      style={{
      position: 'fixed',
      top: drag.y,
      left: drag.x,
      width: 380,
      maxWidth: 'calc(100vw - 40px)',
      zIndex: zIndex.overlay,
      pointerEvents: 'auto',
      animation: panelPos ? 'none' : 'ukiOverlayIn 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <style>{`
        @keyframes ukiOverlayIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ukiWaveform {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
        @keyframes ukiPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes ukiLinger {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>

      <div style={{
        // Liquid glass (master overhaul), matching the app-menu / dock / menus:
        // a translucent strong fill over the shared adaptive blur. Degrades to
        // solid on weak GPUs / reduced-transparency via the shared token.
        background: 'var(--color-bg-glass-strong, rgba(16,16,20,0.86))',
        backdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(28px) saturate(180%))',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 10,
        boxShadow: 'var(--pg-shadow-popover)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Sleep countdown hairline — a calm, non-alarming cue that UKI is about
            to rest. It only renders while the sleep timer is armed; hovering or
            typing cancels the timer, which unmounts the bar. Keyed on sleepMs so
            re-arming restarts the depletion from full. */}
        {sleepMs > 0 && (
          <div
            key={sleepMs}
            aria-hidden
            style={{
              position: 'absolute', left: 0, bottom: 0, height: 2, width: '100%',
              transformOrigin: 'left center',
              background: 'var(--color-accent)', opacity: 0.5,
              animation: `ukiLinger ${sleepMs}ms linear forwards`,
              pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}
        {/* State bar — the drag handle (only the header moves the panel, so
            clicking the content/response area never starts a drag) */}
        <div
          onPointerDown={handleDragStart}
          onPointerMove={drag.handlers.onPointerMove}
          onPointerUp={drag.handlers.onPointerUp}
          onPointerCancel={drag.handlers.onPointerCancel}
          style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-bg-hover)',
          cursor: drag.dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}>
          {/* Animated indicator */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stateInfo.color,
            animation: isActive ? 'ukiPulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 600, color: stateInfo.color,
            letterSpacing: '0.02em',
            fontFamily: 'var(--dex-font-ui)',
            transition: 'opacity 0.2s ease',
          }}>
            {/* While reasoning, the header echoes the live spinner verb so the
                whole panel speaks with one voice; otherwise the static label. */}
            {spinnerActive ? `${verb}…` : stateInfo.label}
          </span>

          {/* Audio waveform visualization when listening */}
          {state === 'listening' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
              {waveHeights.map((h, i) => (
                <div key={i} style={{
                  width: 3, borderRadius: 2,
                  background: stateInfo.color,
                  opacity: 0.6 + audioLevel * 0.4,
                  height: h,
                  transition: 'opacity 0.15s ease',
                }} />
              ))}
            </div>
          )}

          <button
            onClick={() => setSpeakResponses(v => !v)}
            title={speakResponses ? 'Turn UKI speech off' : 'Turn UKI speech on'}
            aria-label={speakResponses ? 'Turn UKI speech off' : 'Turn UKI speech on'}
            aria-pressed={speakResponses}
            style={{
              marginLeft: state === 'listening' ? 0 : 'auto',
              width: 24, height: 22, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: speakResponses ? 'var(--color-accent-light)' : 'transparent',
              border: 'none', color: speakResponses ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => { if (!speakResponses) { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
            onMouseLeave={e => { if (!speakResponses) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; } }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {speakResponses ? <path d="M15 9a5 5 0 0 1 0 6" /> : <line x1="16" y1="9" x2="22" y2="15" />}
              {speakResponses ? <path d="M17.5 6.5a8 8 0 0 1 0 11" /> : <line x1="22" y1="9" x2="16" y2="15" />}
            </svg>
          </button>

          <button
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand UKI panel' : 'Collapse UKI panel'}
            aria-label={collapsed ? 'Expand UKI panel' : 'Collapse UKI panel'}
            aria-expanded={!collapsed}
            style={{
              width: 24, height: 22, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={() => useUkiStore.getState().reset()}
            style={{
              marginLeft: 0,
              width: 20, height: 20, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
              fontSize: 14, lineHeight: 1,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
            aria-label="Dismiss UKI overlay"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content area -- multi-turn conversation history */}
        <div ref={scrollRef} style={{
          display: collapsed ? 'none' : 'block',
          maxHeight: 260,
          overflowY: 'auto',
          padding: 'var(--space-2) 14px',
          fontFamily: 'var(--dex-font-ui)',
        }}>
          {/* AutoPilot pending-approval cards */}
          <UkiAutoPilotBridge />
          {/* Previous conversation turns */}
          {conversationHistory.slice(-6).map((turn) => {
            const isOpen = expandedThinking.has(turn.id);
            return (
            <div key={turn.id} style={{ marginBottom: 10, opacity: 0.85 }}>
              <div style={{ marginBottom: 4 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)',
                  letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2,
                }}>You</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{turn.userText}</div>
              </div>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: turn.success ? 'var(--color-accent)' : 'var(--color-error)',
                  letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  UKI
                  {!turn.success && (
                    <span style={{ fontSize: 8, color: 'var(--color-error)', fontWeight: 400 }}>failed</span>
                  )}
                </div>
                {/* Claude-style thought process (collapsible) */}
                {turn.intent && (
                  <button
                    type="button"
                    onClick={() => setExpandedThinking(prev => {
                      const next = new Set(prev);
                      if (next.has(turn.id)) next.delete(turn.id); else next.add(turn.id);
                      return next;
                    })}
                    aria-expanded={isOpen}
                    style={{
                      background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4,
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                  >
                    <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>{'\u25B8'}</span>
                    <span>{isOpen ? 'Hide thinking' : 'Show thinking'}</span>
                  </button>
                )}
                {isOpen && (
                  <div style={{
                    fontSize: 11, color: 'var(--color-text-tertiary)', fontStyle: 'italic',
                    lineHeight: 1.5, padding: '6px var(--space-2)', marginBottom: 6,
                    background: 'var(--color-bg-hover)', borderLeft: '2px solid var(--color-accent-light)',
                    borderRadius: 4,
                  }}>
                    {turn.thoughtSteps && turn.thoughtSteps.length > 0 ? (
                      <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {turn.thoughtSteps.map((step, idx) => (
                          <li key={idx} style={{ fontStyle: 'normal', color: 'var(--color-text-secondary)' }}>{step}</li>
                        ))}
                        <li style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>
                          Final intent: <strong style={{ color: 'var(--color-text-secondary)' }}>{turn.intent}</strong>
                        </li>
                      </ol>
                    ) : (
                      <>Interpreted intent: <strong style={{ color: 'var(--color-text-secondary)' }}>{turn.intent}</strong>. Matched user input to this category and produced a direct response without external lookup.</>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{turn.response}</div>
              </div>
            </div>
            );
          })}

          {/* Current transcript (live) */}
          {displayText && (
            <div style={{ marginBottom: response ? 10 : 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)',
                letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4,
              }}>
                You
              </div>
              <div style={{
                fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5,
                opacity: partialTranscript && !transcript ? 0.6 : 1,
              }}>
                {displayText}
              </div>
            </div>
          )}

          {/* Thinking indicator (Claude-style) -- visible while waiting for first stream tick */}
          {isThinking && !streamingResponse && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '6px var(--space-2)', marginBottom: 'var(--space-2)',
              background: 'var(--color-accent-soft)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 4,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--color-accent)',
                  animation: 'ukiPulse 0.9s ease-in-out infinite',
                }} />
                <span style={{ transition: 'opacity 0.2s ease' }}>
                  {verb}&hellip;{thoughtSteps.length > 0 ? ` · step ${thoughtSteps.length}` : ''}
                </span>
              </div>
              {thoughtSteps.length > 0 && (
                <ol style={{
                  margin: '4px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 1,
                  fontSize: 10.5, color: 'var(--color-text-tertiary)', lineHeight: 1.4,
                }}>
                  {thoughtSteps.slice(-6).map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* UKI response (streaming or committed) */}
          {(response || streamingResponse) && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--color-accent)',
                letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4,
              }}>
                UKI
              </div>
              <div style={{
                fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5,
              }}>
                {streamingResponse || response}
                {!!streamingResponse && (
                  <span style={{ opacity: 0.6, animation: 'ukiPulse 0.6s ease-in-out infinite' }}>▍</span>
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div role="alert" style={{
              fontSize: 12, color: 'var(--color-error)', lineHeight: 1.4,
              padding: '6px var(--space-2)', background: 'var(--color-error-muted)',
              borderRadius: 4, borderLeft: '2px solid var(--color-error)',
            }}>
              {error}
            </div>
          )}

          {/* Waiting state */}
          {!displayText && !response && !error && isActive && (
            <div style={{
              fontSize: 12, color: 'var(--color-text-tertiary)', fontStyle: 'italic',
            }}>
              Speak now...
            </div>
          )}
        </div>

        {/* Command help panel */}
        {!collapsed && state === 'listening' && (
          <div style={{
            borderTop: '1px solid var(--color-bg-hover)',
            padding: '6px 14px var(--space-2)',
          }}>
            <button
              onClick={() => setShowHelp(h => !h)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)',
                letterSpacing: '0.4px', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 4,
                padding: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                style={{ transform: showHelp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                <path d="M2 1l4 3-4 3z" />
              </svg>
              Voice Commands
            </button>
            {showHelp && (
              <div style={{
                marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '3px var(--space-3)', fontSize: 11, lineHeight: 1.6,
                color: 'var(--color-text-tertiary)',
              }}>
                {[
                  '"Open Imosion"', '"New project in Flux"',
                  '"Play" / "Stop"', '"Save" / "Undo"',
                  '"Export as MP4"', '"Apply reverb effect"',
                  '"Zoom in" / "Zoom out"', '"Select all"',
                  '"Open files"', '"Search for photos"',
                  '"Turn up volume"', '"What time is it?"',
                ].map((cmd, i) => (
                  <span key={i} style={{ fontFamily: 'inherit' }}>{cmd}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Text input bar */}
        <div style={{
          borderTop: '1px solid var(--color-bg-hover)',
          padding: 'var(--space-2) 10px',
          display: collapsed ? 'none' : 'flex', alignItems: 'center', gap: 6,
          position: 'relative',
        }}>
          {inputText.startsWith('/') && (() => {
            const all = [
              { cmd: '/help', hint: 'list every slash command' },
              { cmd: '/open', hint: 'launch an app -- /open notes' },
              { cmd: '/note', hint: 'jot a note -- /note buy bread' },
              { cmd: '/task', hint: 'add a task -- /task call mom' },
              { cmd: '/find', hint: 'search files -- /find report' },
              { cmd: '/run', hint: 'run a workflow -- /run nightly' },
              { cmd: '/summarize', hint: 'shorten text -- /summarize <text>' },
              { cmd: '/translate', hint: 'translate -- /translate fr <text>' },
              { cmd: '/diff', hint: 'compare two snippets -- /diff a | b' },
              { cmd: '/screenshot', hint: 'capture the screen' },
              { cmd: '/clipboard', hint: 'read or copy -- /clipboard <text>' },
              { cmd: '/timer', hint: 'start a timer -- /timer 5m tea' },
              { cmd: '/toast', hint: 'show a toast -- /toast hello' },
              { cmd: '/focus', hint: 'toggle focus mode' },
              { cmd: '/mute', hint: 'toggle mute on media' },
              { cmd: '/open-link', hint: 'open a url -- /open-link https://...' },
              { cmd: '/snapshot', hint: 'snapshot current context' },
              { cmd: '/count', hint: 'count words -- /count <text>' },
              { cmd: '/notify', hint: 'send a notification -- /notify Title | Body' },
              { cmd: '/dismiss', hint: 'dismiss an ambient hint by id' },
            ];
            const q = inputText.toLowerCase();
            const matches = all.filter(c => c.cmd.startsWith(q)).slice(0, 6);
            if (matches.length === 0) return null;
            return (
              <div role="listbox" aria-label="Slash command suggestions" style={{
                position: 'absolute', left: 10, right: 10, bottom: '100%',
                marginBottom: 6, padding: 6,
                background: 'var(--color-bg-elevated, rgba(28,28,30,0.95))',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 6, fontSize: 11,
                maxHeight: 220, overflowY: 'auto',
                boxShadow: 'var(--pg-shadow-tooltip)',
                zIndex: 2,
              }}>
                {matches.map(m => (
                  <div
                    key={m.cmd}
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); setInputText(m.cmd + ' '); inputRef.current?.focus(); }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)',
                      padding: '4px var(--space-2)', borderRadius: 4, cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 600 }}>{m.cmd}</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{m.hint}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <AssistedTextarea
            ref={inputRef}
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              // Auto-grow up to 6 lines, then scroll inside the textarea.
              const el = e.currentTarget;
              el.style.height = 'auto';
              const max = 6 * 18 + 12; // ~6 lines at 18px line-height
              el.style.height = Math.min(el.scrollHeight, max) + 'px';
            }}
            onKeyDown={e => {
              // Enter sends, Shift+Enter inserts newline. This matches the
              // pattern users expect from modern AI prompt boxes (Claude,
              // ChatGPT, Cursor) without surprising typists.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSendText();
              }
              if (e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
            placeholder={isThinking ? 'UKI is thinking...' : 'Ask UKI anything   (Enter to send, Shift+Enter for newline)'}
            rows={1}
            style={{
              flex: 1, background: 'var(--color-bg-hover)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 10, padding: 'var(--space-2) var(--space-3)',
              fontSize: 13, color: 'var(--color-text-primary)',
              outline: 'none',
              resize: 'none',
              minHeight: 32,
              maxHeight: 120,
              lineHeight: '18px',
              fontFamily: 'var(--dex-font-ui)',
              transition: 'border-color 0.15s ease, background 0.15s ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
            disabled={state === 'processing' || state === 'thinking'}
            aria-label="Ask UKI"
          />
          <button
            onClick={() => handleSendText()}
            disabled={!inputText.trim() || isThinking || state === 'processing' || state === 'thinking'}
            style={{
              width: 32, height: 32, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: (inputText.trim() && !isThinking) ? 'var(--color-accent-light)' : 'transparent',
              border: '1px solid ' + ((inputText.trim() && !isThinking) ? 'var(--color-accent-light)' : 'transparent'),
              cursor: (inputText.trim() && !isThinking) ? 'pointer' : 'default',
              opacity: (isThinking || state === 'processing' || state === 'thinking') ? 0.5 : 1,
              transition: 'background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
              flexShrink: 0,
            }}
            aria-label={isThinking ? 'UKI is thinking' : 'Send to UKI'}
            title={isThinking ? 'Thinking...' : 'Send (Enter)'}
          >
            {isThinking ? (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--color-accent)',
                animation: 'ukiPulse 0.9s ease-in-out infinite',
              }} />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={inputText.trim() ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(UkiOverlay);
