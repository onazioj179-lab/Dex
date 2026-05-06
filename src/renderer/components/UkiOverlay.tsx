// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * UKI Voice Assistant Transcript Overlay
 * Floating panel that shows listening state, transcript, and responses
 * 
 * ENHANCED v2.0: Smart understanding with typo correction, slang support,
 * screen reading, improved TTS/STT, and accessibility tools
 */
import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useUkiStore } from '../store/ukiStore';
import type { UkiConversationTurn, UkiKnowledgeNode } from '../store/ukiStore';

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
    const store = (window as any).__dexRunningApps;
    const state = store?.getState?.();
    if (state?.focusedAppId) {
      context.activeApp = state.focusedAppId;
      const app = state.runningApps?.find((a: any) => a.id === state.focusedAppId);
      context.windowTitle = app?.name || state.focusedAppId;
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
if (typeof window !== 'undefined') {
  loadA11yPreferences();
  // Pre-load voices
  window.speechSynthesis?.getVoices();
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
    findBestVoice();
  });
}

// ---------------------------------------------------------------------------
// App control command parser — "open notes", "close browser", etc.
// ---------------------------------------------------------------------------

const APP_COMMAND_MAP: Record<string, string> = {
  notes: 'DexNotes', note: 'DexNotes', notepad: 'DexNotes',
  browser: 'Browser', web: 'Browser', chrome: 'Browser', safari: 'Browser', internet: 'Browser',
  files: 'Files', finder: 'Files', explorer: 'Files', documents: 'Files', folder: 'Files',
  music: 'Imosion', audio: 'Imosion', imosion: 'Imosion', player: 'Imosion', spotify: 'Imosion',
  settings: 'Settings', preferences: 'Settings', config: 'Settings', options: 'Settings',
  power: 'Power', activity: 'Power', monitor: 'Power', performance: 'Power', cpu: 'Power',
  terminal: 'Terminal', shell: 'Terminal', console: 'Terminal', command: 'Terminal', cli: 'Terminal',
  prism: 'Prism', code: 'Prism', editor: 'Prism', ide: 'Prism',
  forge: 'Forge', design: 'Forge', draw: 'Forge', illustration: 'Forge',
  vinx: 'Vinx', video: 'Vinx', movie: 'Vinx', clip: 'Vinx',
  flux: 'Flux', ai: 'Flux', assistant: 'Flux', chat: 'Flux',
  axl: 'Axl', image: 'Axl', photo: 'Axl', picture: 'Axl', gallery: 'Axl',
  calendar: 'Calendar', schedule: 'Calendar', events: 'Calendar',
  calculator: 'Calculator', calc: 'Calculator', math: 'Calculator',
  mail: 'Mail', email: 'Mail',
  nexus: 'Nexus', memory: 'Nexus', knowledge: 'Nexus',
  store: 'AppStore', apps: 'AppStore', download: 'AppStore',
  launchpad: 'Launchpad', launcher: 'Launchpad',
  books: 'Library', library: 'Library', reading: 'Library',
  weather: 'Weather', forecast: 'Weather',
  maps: 'Maps', location: 'Maps', directions: 'Maps', navigate: 'Maps',
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
  const [action, appName] = cmd.split(':');
  if (action === 'open') {
    window.dispatchEvent(new CustomEvent('dex-open-app', { detail: { appName } }));
    return `Opening ${appName}...`;
  }
  if (action === 'close') {
    window.dispatchEvent(new CustomEvent('dex-close-app', { detail: { appName } }));
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
      const store = (window as any).__dexRunningApps;
      const state = store ? store.getState?.() : null;
      const apps = state?.runningApps;
      if (apps && apps.length > 0) {
        const names = apps.map((a: any) => a.name || a.id);
        return { handled: true, response: `Currently running: ${names.join(', ')} (${apps.length} app${apps.length > 1 ? 's' : ''} open).` };
      }
      return { handled: true, response: 'No apps are currently running. Say "open notes" to launch one!' };
    } catch {
      return { handled: true, response: 'Unable to query running apps right now.' };
    }
  }

  // System info
  if (/(?:system|device|hardware|sys|hw)\s*(?:info|status|specs?)|about\s*(?:this|my|the)\s*(?:system|device|computer|pc)|my (?:specs|computer|pc|system)/.test(lower)) {
    const nav = navigator as any;
    const mem = nav.deviceMemory ? `${nav.deviceMemory}GB RAM` : 'RAM info unavailable';
    const cores = nav.hardwareConcurrency ? `${nav.hardwareConcurrency} CPU cores` : 'cores unknown';
    const platform = nav.userAgentData?.platform || nav.platform || 'unknown';
    return { handled: true, response: `DEX v3.6.0 on ${platform}. ${cores}, ${mem}. Display: ${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x.` };
  }

  // Battery
  if (/(?:battery|power|charge|batt)\s*(?:level|status|life|%)?|how much (?:battery|power|charge)/.test(lower)) {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
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
    const perf = (performance as any);
    if (perf.memory) {
      const used = (perf.memory.usedJSHeapSize / 1048576).toFixed(0);
      const total = (perf.memory.totalJSHeapSize / 1048576).toFixed(0);
      const pct = Math.round((perf.memory.usedJSHeapSize / perf.memory.totalJSHeapSize) * 100);
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
    /^(?:search|search for|look up|lookup|google|find|find me)\s+(.+)$/,
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
  idle: { label: 'Idle', color: 'var(--color-text-tertiary)' },
  listening: { label: 'Listening...', color: 'var(--color-accent)' },
  processing: { label: 'Processing...', color: '#BF5AF2' },
  thinking: { label: 'Thinking...', color: 'var(--color-warning)' },
  speaking: { label: 'Speaking', color: 'var(--color-success)' },
  error: { label: 'Error', color: 'var(--color-error)' },
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  // Animated waveform state — use refs to avoid 60fps state re-renders
  const [waveHeights, setWaveHeights] = useState([4, 4, 4, 4, 4]);
  const waveRafRef = useRef<number>(0);
  const waveThrottleRef = useRef(0);

  const isActive = state === 'listening' || state === 'processing' || state === 'thinking' || state === 'speaking';
  const isVisible = isActive || showPanel || (showTranscript && (transcript || response));

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

  useEffect(() => {
    if (panelPos) return;
    setPanelPos({
      x: Math.max(20, Math.round((window.innerWidth - 380) / 2)),
      y: Math.max(20, window.innerHeight - 260),
    });
  }, [panelPos]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      setPanelPos(prev => {
        const width = 380;
        const height = 320;
        const nextX = Math.min(Math.max(12, event.clientX - dragOffsetRef.current.x), Math.max(12, window.innerWidth - width - 12));
        const nextY = Math.min(Math.max(12, event.clientY - dragOffsetRef.current.y), Math.max(12, window.innerHeight - height - 12));
        if (prev && prev.x === nextX && prev.y === nextY) return prev;
        return { x: nextX, y: nextY };
      });
    };
    const handleUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const [streamingResponse, setStreamingResponse] = useState('');
  const streamTarget = useRef('');
  const streamTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [speakResponses, setSpeakResponses] = useState(true); // TTS toggle

  /** Stream response with typewriter effect and optional TTS */
  const streamResponse = useCallback((reply: string, intent: string, userText: string, speakIt = true) => {
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
        useUkiStore.getState().setResponse(reply);
        useUkiStore.getState().addConversationTurn({ 
          id: `${intent}-${Date.now()}`, 
          userText, 
          response: reply, 
          intent, 
          success: true, 
          timestamp: Date.now() 
        });
        // Speak response if enabled and not too long
        if (speakIt && speakResponses && reply.length < 300) {
          speakWithVoice(reply);
        }
      }
    };
    streamTimerRef.current = setTimeout(tick, speed);
  }, [speakResponses]);

  const handleSendText = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    // Cancel any in-progress streaming animation
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);

    // Normalize text for better understanding
    const normalized = normalizeText(text);

    // Check for screen reading commands (async)
    const screenResponse = await tryScreenQuestion(text);
    if (screenResponse) {
      streamResponse(screenResponse, 'screen-read', text);
      return;
    }

    // Check for app control commands
    const appCmd = tryAppCommand(text);
    if (appCmd) {
      const reply = dispatchAppCommand(appCmd);
      streamResponse(reply, 'app-command', text);
      return;
    }

    // Check for internal system tool queries
    const toolResult = trySystemTool(text);
    if (toolResult.handled) {
      streamResponse(toolResult.response, 'system-tool', text);
      return;
    }

    // Check for web search commands
    const searchQuery = trySearchCommand(text);
    if (searchQuery) {
      const reply = dispatchWebSearch(searchQuery);
      streamResponse(reply, 'web-search', text);
      return;
    }

    // Fallback to AI query if available
    useUkiStore.getState().setTranscript(text);
    setStreamingResponse('');
    const dex = (window as any).dex;
    if (dex?.uki?.query) {
      try {
        const result = await dex.uki.query(normalized);
        const finalResp = result?.response ?? '';
        if (finalResp) {
          streamResponse(finalResp, 'ai-query', text);
        } else {
          // Fallback response if no AI response
          const fallback = "I'm not sure about that. Try asking differently, or say 'help' to see what I can do!";
          streamResponse(fallback, 'fallback', text, false);
        }
      } catch {
        useUkiStore.getState().setError('Failed to process query');
      }
    } else {
      // No AI backend available - give helpful fallback
      const fallback = "I understood you, but I need more context. Try commands like 'open notes', 'what time is it', or 'tell me a joke'!";
      streamResponse(fallback, 'fallback', text, false);
    }
  }, [inputText, streamResponse]);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, partialTranscript, response, conversationHistory]);

  // Auto-hide after response shown for 8s (pauses on hover)
  useEffect(() => {
    if (state === 'idle' && showTranscript && response) {
      const startTimer = () => {
        if (hoveredRef.current) return;
        autoHideRef.current = setTimeout(() => {
          useUkiStore.getState().reset();
        }, 8000);
      };
      startTimer();
      return () => { if (autoHideRef.current) clearTimeout(autoHideRef.current); };
    }
  }, [state, showTranscript, response]);

  if (!isVisible) return null;

  const stateInfo = STATE_LABELS[state] || { label: '', color: 'var(--color-text-tertiary)' };
  const displayText = transcript || partialTranscript;
  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, a, [role="button"]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    draggingRef.current = true;
  };

  return (
    <div
      onMouseEnter={() => { hoveredRef.current = true; if (autoHideRef.current) { clearTimeout(autoHideRef.current); autoHideRef.current = null; } }}
      onMouseLeave={() => { hoveredRef.current = false; if (state === 'idle' && showTranscript && response) { if (autoHideRef.current) clearTimeout(autoHideRef.current); autoHideRef.current = setTimeout(() => { useUkiStore.getState().reset(); }, 8000); } }}
      style={{
      position: 'fixed',
      top: panelPos?.y ?? 80,
      left: panelPos?.x ?? 20,
      width: 380,
      maxWidth: 'calc(100vw - 40px)',
      zIndex: 'var(--z-overlay)' as any,
      pointerEvents: 'auto',
      animation: panelPos ? 'none' : 'ukiOverlayIn 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
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
      `}</style>

      <div onMouseDown={handleDragStart} style={{
        background: 'var(--color-bg-surface-solid)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 0.5px var(--color-bg-hover)',
        overflow: 'hidden',
        cursor: draggingRef.current ? 'grabbing' : 'grab',
      }}>
        {/* State bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-bg-hover)',
        }}>
          {/* Animated indicator */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stateInfo.color,
            boxShadow: `0 0 8px ${stateInfo.color}80`,
            animation: isActive ? 'ukiPulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 600, color: stateInfo.color,
            letterSpacing: '0.02em',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
            {stateInfo.label}
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

          {/* Close button */}
          <button
            onClick={() => useUkiStore.getState().reset()}
            style={{
              marginLeft: 'auto',
              width: 20, height: 20, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              color: 'var(--color-text-tertiary)', cursor: 'pointer',
              fontSize: 14, lineHeight: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-border-subtle)'; }}
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
          maxHeight: 260,
          overflowY: 'auto',
          padding: '8px 14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          {/* Previous conversation turns */}
          {conversationHistory.slice(-6).map((turn) => (
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
                  color: turn.success ? 'rgba(10,132,255,0.5)' : 'rgba(255,69,58,0.5)',
                  letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 2,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  UKI
                  {!turn.success && (
                    <span style={{ fontSize: 8, color: 'var(--color-error)', fontWeight: 400 }}>failed</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>{turn.response}</div>
              </div>
            </div>
          ))}

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

          {/* UKI response (streaming or committed) */}
          {(response || streamingResponse) && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'rgba(10,132,255,0.6)',
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
            <div style={{
              fontSize: 12, color: 'var(--color-error)', lineHeight: 1.4,
              padding: '6px 8px', background: 'rgba(255,69,58,0.08)',
              borderRadius: 8, border: '1px solid rgba(255,69,58,0.15)',
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
        {state === 'listening' && (
          <div style={{
            borderTop: '1px solid var(--color-bg-hover)',
            padding: '6px 14px 8px',
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
                gap: '3px 12px', fontSize: 11, lineHeight: 1.6,
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
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendText(); }}
            placeholder="Ask UKI anything..."
            style={{
              flex: 1, background: 'var(--color-bg-hover)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 8, padding: '6px 10px',
              fontSize: 12, color: 'var(--color-text-primary)',
              outline: 'none',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
            disabled={state === 'processing' || state === 'thinking'}
          />
          <button
            onClick={handleSendText}
            disabled={!inputText.trim() || state === 'processing' || state === 'thinking'}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: inputText.trim() ? 'rgba(10,132,255,0.25)' : 'transparent',
              border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
              transition: 'background 0.15s ease',
            }}
            aria-label="Send to UKI"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={inputText.trim() ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(UkiOverlay);
