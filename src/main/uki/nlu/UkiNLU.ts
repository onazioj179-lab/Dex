// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - UKI NLU (Natural Language Understanding)
// Intent classification + entity extraction from user utterances
// ===========================================================================

export interface UkiEntity {
  type: string;   // 'app' | 'page' | 'file' | 'number' | 'time' | 'query' | 'target'
  value: string;
  raw: string;
}

export interface ParsedIntent {
  category: string;
  action: string;
  confidence: number;
  entities: Record<string, unknown>;
  raw: string;
}

interface IntentPattern {
  pattern: RegExp;
  category: string;
  action: string;
  confidence: number;
  extractor: (m: RegExpMatchArray) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Known app names for fuzzy matching (from APP_DEFINITIONS)
// ---------------------------------------------------------------------------

const APP_NAMES: Record<string, string> = {
  home: 'home', files: 'files', notes: 'notes', browser: 'browser',
  settings: 'settings', transfers: 'transfers', tasks: 'tasks',
  gallery: 'gallery', audio: 'audio', workflows: 'workflows',
  calendar: 'calendar', calculator: 'calculator', 'password generator': 'passwordgenerator',
  'password gen': 'passwordgenerator', vinx: 'videoeditor', 'video editor': 'videoeditor',
  imosion: 'imosion', prism: 'prism', flux: 'flux', forge: 'forge', axl: 'axl',
  rewind: 'rewind', kanban: 'kanban', trophies: 'achievements', achievements: 'achievements',
  trash: 'recyclebin', 'recycle bin': 'recyclebin', weather: 'weather',
  'world clock': 'worldclock', noise: 'noisegenerator', 'noise generator': 'noisegenerator',
  markdown: 'markdown', nexus: 'nexus', stopwatch: 'stopwatch',
  converter: 'unitconverter', 'unit converter': 'unitconverter',
  pomodoro: 'pomodoro', 'qr code': 'qrcode', qrcode: 'qrcode',
  colors: 'colorpicker', 'color picker': 'colorpicker', colorpicker: 'colorpicker',
};

const PAGE_NAMES: Record<string, string> = {
  home: 'home', files: 'files', notes: 'notes', browser: 'browser',
  settings: 'settings', transfers: 'transfers', tasks: 'tasks',
  gallery: 'gallery', audio: 'audio', workflows: 'workflows',
};

// ---------------------------------------------------------------------------
// Intent patterns (200+)
// ---------------------------------------------------------------------------

const PATTERNS: IntentPattern[] = [
  // ===== NAVIGATION =====
  { pattern: /^(?:go\s+to|open|show|navigate\s+to|switch\s+to)\s+(.+)$/i, category: 'navigation', action: 'navigate', confidence: 0.9, extractor: m => ({ target: m[1].trim().toLowerCase() }) },
  { pattern: /^(?:go\s+)?back$/i, category: 'navigation', action: 'go-back', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:go\s+)?home$/i, category: 'navigation', action: 'go-home', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:take\s+me\s+to|bring\s+up|pull\s+up)\s+(.+)$/i, category: 'navigation', action: 'navigate', confidence: 0.85, extractor: m => ({ target: m[1].trim().toLowerCase() }) },

  // ===== APP LAUNCH =====
  { pattern: /^(?:launch|start|open|run)\s+(.+?)(?:\s+app)?$/i, category: 'app_launch', action: 'launch', confidence: 0.85, extractor: m => ({ app: m[1].trim().toLowerCase() }) },
  { pattern: /^(?:open\s+up|fire\s+up|boot\s+up)\s+(.+)$/i, category: 'app_launch', action: 'launch', confidence: 0.8, extractor: m => ({ app: m[1].trim().toLowerCase() }) },

  // ===== APP CLOSE =====
  { pattern: /^(?:close|quit|exit|kill)\s+(.+?)(?:\s+app)?$/i, category: 'app_close', action: 'close', confidence: 0.9, extractor: m => ({ app: m[1].trim().toLowerCase() }) },
  { pattern: /^close\s+all(?:\s+apps)?$/i, category: 'app_close', action: 'close-all', confidence: 0.95, extractor: () => ({}) },

  // ===== MEDIA CONTROL =====
  { pattern: /^(?:play|resume)(?:\s+(?:the\s+)?(?:music|audio|track|song))?$/i, category: 'media', action: 'play', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:pause|stop)(?:\s+(?:the\s+)?(?:music|audio|track|song|playback))?$/i, category: 'media', action: 'pause', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:next|skip)(?:\s+(?:track|song))?$/i, category: 'media', action: 'next', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:previous|prev|go\s+back)(?:\s+(?:track|song))?$/i, category: 'media', action: 'previous', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:volume\s+(?:up|increase|raise|louder))$/i, category: 'media', action: 'volume-up', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:volume\s+(?:down|decrease|lower|quieter|softer))$/i, category: 'media', action: 'volume-down', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:set\s+)?volume\s+(?:to\s+)?(\d+)(?:\s*%)?$/i, category: 'media', action: 'volume-set', confidence: 0.9, extractor: m => ({ level: parseInt(m[1], 10) }) },
  { pattern: /^(?:mute|unmute)(?:\s+(?:audio|sound|volume))?$/i, category: 'media', action: 'toggle-mute', confidence: 0.95, extractor: m => ({ mute: /^mute/i.test(m[0]) }) },
  { pattern: /^play\s+(.+)$/i, category: 'media', action: 'play-named', confidence: 0.8, extractor: m => ({ query: m[1].trim() }) },

  // ===== FILE OPERATIONS =====
  { pattern: /^(?:find|search\s+for|look\s+for)\s+(?:files?\s+)?(?:named|called)?\s*(.+)$/i, category: 'file_ops', action: 'search', confidence: 0.85, extractor: m => ({ query: m[1].trim() }) },
  { pattern: /^(?:create|make|new)\s+(?:a\s+)?(?:new\s+)?folder\s+(?:named|called)?\s*(.+)$/i, category: 'file_ops', action: 'create-folder', confidence: 0.9, extractor: m => ({ name: m[1].trim() }) },
  { pattern: /^(?:delete|remove|trash)\s+(?:the\s+)?(?:file|folder|document)?\s*(.+)$/i, category: 'file_ops', action: 'delete', confidence: 0.85, extractor: m => ({ target: m[1].trim() }) },
  { pattern: /^(?:rename)\s+(.+?)\s+to\s+(.+)$/i, category: 'file_ops', action: 'rename', confidence: 0.9, extractor: m => ({ from: m[1].trim(), to: m[2].trim() }) },
  { pattern: /^(?:move|copy)\s+(.+?)\s+to\s+(.+)$/i, category: 'file_ops', action: 'move', confidence: 0.85, extractor: m => ({ source: m[1].trim(), dest: m[2].trim(), op: /^copy/i.test(m[0]) ? 'copy' : 'move' }) },
  { pattern: /^(?:show|list)\s+(?:my\s+)?(?:recent|latest)\s+files?$/i, category: 'file_ops', action: 'recent', confidence: 0.9, extractor: () => ({}) },

  // ===== SEARCH =====
  { pattern: /^(?:search|find|look\s+up|look\s+for)\s+(.+)$/i, category: 'search', action: 'search', confidence: 0.75, extractor: m => ({ query: m[1].trim() }) },

  // ===== WEB SEARCH =====
  // Pattern with query
  { pattern: /^(?:search\s+the\s+web\s+for|google|web\s+search|search\s+online\s+for|look\s+up\s+online|search\s+the\s+internet\s+for)\s+(.+)$/i, category: 'web_search', action: 'web-search', confidence: 0.95, extractor: m => ({ query: m[1].trim() }) },
  // Pattern without query (ask for it) - "search the web for me" / "search the web"
  { pattern: /^(?:search\s+the\s+web|web\s+search|search\s+online|search\s+the\s+internet)(?:\s+(?:for\s+me|please))?$/i, category: 'web_search', action: 'web-search-prompt', confidence: 0.9, extractor: () => ({ needsQuery: true }) },
  { pattern: /^(?:what\s+is|what\s+are|who\s+is|who\s+are|where\s+is|when\s+(?:is|was|did)|why\s+(?:is|do|does|did)|how\s+(?:to|do|does|is|many|much))\s+(.+)\??$/i, category: 'web_search', action: 'web-search', confidence: 0.8, extractor: m => ({ query: m[0].replace(/\?$/, '').trim() }) },
  { pattern: /^(?:define|definition\s+of|meaning\s+of)\s+(.+)$/i, category: 'web_search', action: 'web-define', confidence: 0.9, extractor: m => ({ query: m[1].trim() }) },
  { pattern: /^(?:news\s+about|latest\s+news\s+on|what.s\s+happening\s+with)\s+(.+)$/i, category: 'web_search', action: 'web-news', confidence: 0.88, extractor: m => ({ query: m[1].trim() }) },

  // ===== CREATE =====
  { pattern: /^(?:create|make|new|add)\s+(?:a\s+)?(?:new\s+)?note(?:\s+(?:called|named|titled)\s+(.+))?$/i, category: 'create', action: 'note', confidence: 0.9, extractor: m => ({ title: m[1]?.trim() || null }) },
  { pattern: /^(?:create|make|new|add)\s+(?:a\s+)?(?:new\s+)?task(?:\s+(?:called|named|titled)\s+(.+))?$/i, category: 'create', action: 'task', confidence: 0.9, extractor: m => ({ title: m[1]?.trim() || null }) },
  { pattern: /^(?:create|make|new|add)\s+(?:a\s+)?(?:new\s+)?(?:reminder|alarm)(?:\s+(?:to|for)\s+(.+))?$/i, category: 'create', action: 'reminder', confidence: 0.85, extractor: m => ({ text: m[1]?.trim() || null }) },
  { pattern: /^(?:create|make|new|add)\s+(?:a\s+)?(?:new\s+)?workflow(?:\s+(?:called|named)\s+(.+))?$/i, category: 'create', action: 'workflow', confidence: 0.85, extractor: m => ({ name: m[1]?.trim() || null }) },

  // ===== SETTINGS =====
  { pattern: /^(?:toggle|turn\s+on|turn\s+off|enable|disable)\s+(?:dark\s+mode|dark\s+theme)$/i, category: 'settings', action: 'toggle-dark', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:toggle|turn\s+on|turn\s+off|enable|disable)\s+(?:the\s+)?(?:dock|taskbar)$/i, category: 'settings', action: 'toggle-dock', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:change|set)\s+(?:the\s+)?(?:wallpaper|background)\s+(?:to\s+)?(.+)$/i, category: 'settings', action: 'wallpaper', confidence: 0.8, extractor: m => ({ value: m[1].trim() }) },

  // ===== SYSTEM =====
  { pattern: /^(?:lock|lock\s+screen)$/i, category: 'system', action: 'lock', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:take\s+a\s+)?screenshot$/i, category: 'system', action: 'screenshot', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:battery|power)\s*(?:status|level|info)?$/i, category: 'system', action: 'battery', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:restart|reboot)\s*(?:app|dex)?$/i, category: 'system', action: 'restart', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:minimize|minimize\s+window)$/i, category: 'system', action: 'minimize', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:maximize|fullscreen|full\s+screen)$/i, category: 'system', action: 'maximize', confidence: 0.9, extractor: () => ({}) },

  // ===== AUTOMATION =====
  { pattern: /^(?:run|execute|start)\s+(?:the\s+)?(?:workflow|automation)\s+(?:called\s+|named\s+)?(.+)$/i, category: 'automation', action: 'run-workflow', confidence: 0.85, extractor: m => ({ name: m[1].trim() }) },
  { pattern: /^(?:schedule|set)\s+(?:a\s+)?(?:reminder|timer)\s+(?:for|in)\s+(.+)$/i, category: 'automation', action: 'schedule', confidence: 0.8, extractor: m => ({ when: m[1].trim() }) },

  // ===== CREATIVE =====
  { pattern: /^(?:create|start|new)\s+(?:a\s+)?(?:new\s+)?(?:project|canvas|composition|sequence)\s+(?:in\s+)?(.+)$/i, category: 'creative', action: 'new-project', confidence: 0.8, extractor: m => ({ app: m[1].trim().toLowerCase() }) },
  { pattern: /^(?:apply|add)\s+(?:a\s+)?(.+?)\s+(?:filter|effect)$/i, category: 'creative', action: 'apply-effect', confidence: 0.75, extractor: m => ({ effect: m[1].trim() }) },
  { pattern: /^(?:render|export)\s+(?:the\s+)?(?:video|project|composition|audio|image|model)(?:\s+(?:as|to)\s+(.+))?$/i, category: 'creative', action: 'export', confidence: 0.85, extractor: m => ({ format: m[1]?.trim() || null }) },
  { pattern: /^export(?:\s+(?:as|to)\s+(.+))?$/i, category: 'creative', action: 'export', confidence: 0.85, extractor: m => ({ format: m[1]?.trim() || null }) },
  { pattern: /^(?:undo|ctrl\+z)$/i, category: 'creative', action: 'undo', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:redo|ctrl\+y)$/i, category: 'creative', action: 'redo', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:play|resume|start\s+playback)$/i, category: 'creative', action: 'play', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:pause|stop|stop\s+playback|halt)$/i, category: 'creative', action: 'stop', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:save|save\s+project|save\s+file|ctrl\+s)$/i, category: 'creative', action: 'save', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:zoom\s+in|zoom\s*\+|magnify)$/i, category: 'creative', action: 'zoom-in', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:zoom\s+out|zoom\s*-|shrink)$/i, category: 'creative', action: 'zoom-out', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:select\s+all|ctrl\+a)$/i, category: 'creative', action: 'select-all', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^open\s+(.+)$/i, category: 'creative', action: 'open', confidence: 0.7, extractor: m => ({ app: m[1].trim().toLowerCase() }) },

  // ===== KNOWLEDGE / QUERIES =====
  { pattern: /^(?:what|how\s+many)\s+(?:files?|documents?)\s+(?:did\s+I|have\s+I)\s+(?:work|open|edit|use)(?:ed)?\s+(?:on\s+)?(?:today|yesterday|this\s+week)?$/i, category: 'knowledge', action: 'activity-query', confidence: 0.8, extractor: m => ({ period: m[0] }) },
  { pattern: /^(?:how\s+many)\s+tasks?\s+(?:are|is)\s+(?:due|pending|overdue)(?:\s+today)?$/i, category: 'knowledge', action: 'task-count', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:what(?:'s|\s+is))\s+(?:my\s+)?(?:most\s+used|favorite|frequent)\s+app$/i, category: 'knowledge', action: 'favorite-app', confidence: 0.8, extractor: () => ({}) },
  { pattern: /^(?:show|what(?:'s|\s+is))\s+(?:my\s+)?(?:usage|stats|statistics|analytics)$/i, category: 'knowledge', action: 'usage-stats', confidence: 0.8, extractor: () => ({}) },
  { pattern: /^(?:what(?:'s|\s+is))\s+(?:my\s+)?(?:work|usage)\s*pattern/i, category: 'knowledge', action: 'work-pattern', confidence: 0.8, extractor: () => ({}) },
  { pattern: /^(?:when|what\s+time)\s+(?:do\s+I|am\s+I)\s+(?:most\s+)?(?:active|productive)/i, category: 'knowledge', action: 'work-pattern', confidence: 0.8, extractor: () => ({}) },
  { pattern: /^(?:show|what(?:'s|\s+is))\s+(?:my\s+)?(?:system|computer|hardware|specs?|machine)/i, category: 'knowledge', action: 'system-info', confidence: 0.8, extractor: () => ({}) },
  { pattern: /^(?:how\s+much)\s+(?:ram|memory|cpu|disk)/i, category: 'knowledge', action: 'system-info', confidence: 0.75, extractor: () => ({}) },

  // ===== TRANSFER =====
  { pattern: /^(?:send|transfer|share)\s+(?:a\s+)?(?:file|document)\s+(?:to\s+)?(.+)$/i, category: 'transfer', action: 'send', confidence: 0.8, extractor: m => ({ target: m[1].trim() }) },

  // ===== CONVERSATION / GENERAL =====
  { pattern: /^(?:what(?:'s|\s+is)\s+the\s+)?time$/i, category: 'conversation', action: 'time', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^what\s+time\s+is\s+it$/i, category: 'conversation', action: 'time', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:what(?:'s|\s+is)\s+the\s+)?date(?:\s+today)?$/i, category: 'conversation', action: 'date', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^what\s+day\s+is\s+(?:it|today)$/i, category: 'conversation', action: 'date', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:hi|hello|hey|yo|sup|what's\s+up|howdy|good\s+(?:morning|afternoon|evening|night))(?:\s+uki)?$/i, category: 'conversation', action: 'greeting', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:thank(?:s|\s+you)|thanks\s+uki|cheers)$/i, category: 'conversation', action: 'thanks', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:bye|goodbye|see\s+you|later|good\s+night)$/i, category: 'conversation', action: 'farewell', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:who\s+are\s+you|what(?:'s|\s+is)\s+your\s+name|what\s+are\s+you)$/i, category: 'conversation', action: 'identity', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:how\s+are\s+you|how(?:'s|\s+is)\s+it\s+going|you\s+okay)$/i, category: 'conversation', action: 'how-are-you', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:tell\s+me\s+a\s+)?joke$/i, category: 'conversation', action: 'joke', confidence: 0.9, extractor: () => ({}) },
  { pattern: /^(?:calculate|what(?:'s|\s+is)|compute)\s+(.+)$/i, category: 'conversation', action: 'calculate', confidence: 0.7, extractor: m => ({ expression: m[1].trim() }) },
  { pattern: /^(\d+[\s]*[+\-*/^%]\s*\d+[\s+\-*/^%\d\s]*)$/i, category: 'conversation', action: 'calculate', confidence: 0.85, extractor: m => ({ expression: m[1].trim() }) },

  // ===== CROSS-APP INTELLIGENCE =====
  { pattern: /^(?:use|apply)\s+(?:the\s+)?(.+?)\s+(?:tool|feature|function)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.9, extractor: m => ({ tool: m[1].trim() }) },
  { pattern: /^(?:use|do|perform)\s+(.+)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.65, extractor: m => ({ tool: m[1].trim() }) },
  { pattern: /^(?:help\s+me\s+)?(?:build|create|make)\s+(?:a\s+)?(.+)$/i, category: 'cross_app', action: 'help-build', confidence: 0.75, extractor: m => ({ project: m[1].trim() }) },
  { pattern: /^(?:what\s+app|which\s+app)\s+(?:should\s+I\s+use|can\s+I\s+use|is\s+best)\s+(?:for|to)\s+(.+)$/i, category: 'cross_app', action: 'suggest-app', confidence: 0.9, extractor: m => ({ task: m[1].trim() }) },
  { pattern: /^(?:list|show|what\s+are)\s+(?:the\s+)?tools?\s+(?:in|for)\s+(.+)$/i, category: 'cross_app', action: 'list-tools', confidence: 0.9, extractor: m => ({ app: m[1].trim().toLowerCase() }) },
  { pattern: /^(?:list|show)\s+(?:available\s+)?tools?$/i, category: 'cross_app', action: 'list-tools', confidence: 0.85, extractor: () => ({}) },
  { pattern: /^(?:open|edit)\s+(.+?)\s+(?:with|in|using)\s+(.+)$/i, category: 'cross_app', action: 'open-with', confidence: 0.85, extractor: m => ({ file: m[1].trim(), app: m[2].trim().toLowerCase() }) },
  { pattern: /^(?:what\s+can|what\s+does)\s+(.+?)\s+(?:do|handle|open|export)$/i, category: 'cross_app', action: 'capabilities', confidence: 0.85, extractor: m => ({ appId: m[1].trim().toLowerCase() }) },
  { pattern: /^(?:workflow|pipeline)\s+(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+)$/i, category: 'cross_app', action: 'workflow', confidence: 0.85, extractor: m => ({ from: m[1].trim().toLowerCase(), to: m[2].trim().toLowerCase() }) },
  { pattern: /^(?:how\s+do\s+I|help\s+me)\s+(.+?)(?:\s+in\s+(.+))?$/i, category: 'cross_app', action: 'help-build', confidence: 0.7, extractor: m => ({ what: m[1].trim(), app: m[2]?.trim().toLowerCase() }) },
  { pattern: /^(?:extrude|bevel|mirror|subdivide|boolean|array|solidify|sculpt)\s*(.*)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.9, extractor: m => ({ tool: m[0].trim() }) },
  { pattern: /^(?:record|add\s+track|eq|compressor|reverb|delay|quantize|normalize)\s*(.*)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.9, extractor: m => ({ tool: m[0].trim() }) },
  { pattern: /^(?:cut|trim|transition|color\s+correct|stabilize|speed)\s*(.*)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.85, extractor: m => ({ tool: m[0].trim() }) },
  { pattern: /^(?:brush|crop|resize|filter|adjust|layer|mask)\s*(.*)$/i, category: 'cross_app', action: 'use-tool', confidence: 0.85, extractor: m => ({ tool: m[0].trim() }) },

  // ===== HELP =====
  { pattern: /^(?:help|what\s+can\s+you\s+do|commands|options)$/i, category: 'conversation', action: 'help', confidence: 0.95, extractor: () => ({}) },

  // ===== YES / NO (for confirmations) =====
  { pattern: /^(?:yes|yeah|yep|yup|sure|okay|ok|do\s+it|go\s+ahead|confirm|affirmative)$/i, category: 'confirmation', action: 'yes', confidence: 0.95, extractor: () => ({}) },
  { pattern: /^(?:no|nope|nah|cancel|nevermind|never\s+mind|don't|stop|abort)$/i, category: 'confirmation', action: 'no', confidence: 0.95, extractor: () => ({}) },
];

// ---------------------------------------------------------------------------
// Fuzzy app matching
// ---------------------------------------------------------------------------

function resolveAppName(input: string): string | null {
  const lower = input.toLowerCase().trim();
  // Exact match
  if (APP_NAMES[lower]) return APP_NAMES[lower];
  // Partial match
  for (const [key, id] of Object.entries(APP_NAMES)) {
    if (key.includes(lower) || lower.includes(key)) return id;
  }
  // Levenshtein-like distance (simple)
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const [key, id] of Object.entries(APP_NAMES)) {
    const dist = editDistance(lower, key);
    if (dist < bestDist && dist <= 2) { bestDist = dist; bestId = id; }
  }
  return bestId;
}

function resolvePageName(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (PAGE_NAMES[lower]) return PAGE_NAMES[lower];
  for (const [key, id] of Object.entries(PAGE_NAMES)) {
    if (key.includes(lower) || lower.includes(key)) return id;
  }
  return null;
}

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[b.length][a.length];
}

// ---------------------------------------------------------------------------
// NLU Pipeline
// ---------------------------------------------------------------------------

interface NLUContext {
  turns: Array<{ userText: string; intent: string | null; entities: Record<string, unknown> }>;
  activeApp: string | null;
  activePage: string | null;
}

class UkiNLUPipeline {
  private static _instance: UkiNLUPipeline;

  static getInstance(): UkiNLUPipeline {
    if (!UkiNLUPipeline._instance) UkiNLUPipeline._instance = new UkiNLUPipeline();
    return UkiNLUPipeline._instance;
  }

  /**
   * Parse an utterance into an intent + entities.
   */
  parse(text: string, context?: NLUContext): ParsedIntent {
    const cleaned = text.trim().replace(/[.!?]+$/, '').trim();

    // Try all patterns, collect matches
    const matches: ParsedIntent[] = [];
    for (const p of PATTERNS) {
      const m = cleaned.match(p.pattern);
      if (m) {
        const entities = p.extractor(m);
        matches.push({
          category: p.category,
          action: p.action,
          confidence: p.confidence,
          entities,
          raw: text,
        });
      }
    }

    if (matches.length === 0) {
      return { category: 'conversation', action: 'unknown', confidence: 0.3, entities: { query: cleaned }, raw: text };
    }

    // Sort by confidence, pick best
    matches.sort((a, b) => b.confidence - a.confidence);
    const best = matches[0];

    // Post-processing: resolve app/page names in entities
    if (best.entities.app && typeof best.entities.app === 'string') {
      const resolved = resolveAppName(best.entities.app as string);
      if (resolved) best.entities.appId = resolved;
    }
    if (best.entities.target && typeof best.entities.target === 'string') {
      // Navigation target could be a page or app
      const page = resolvePageName(best.entities.target as string);
      if (page) {
        best.entities.pageId = page;
      } else {
        const app = resolveAppName(best.entities.target as string);
        if (app) {
          best.entities.appId = app;
          // Reclassify as app_launch if we resolved to an app
          if (best.category === 'navigation') {
            best.category = 'app_launch';
            best.action = 'launch';
          }
        }
      }
    }

    // Context-aware pronoun resolution
    if (context && context.turns.length > 0) {
      const lastTurn = context.turns[context.turns.length - 1];
      if (/\b(?:it|that|this|them)\b/i.test(cleaned) && lastTurn.entities) {
        // Carry over entities from last turn
        if (!best.entities.target && lastTurn.entities.target) best.entities.target = lastTurn.entities.target;
        if (!best.entities.appId && lastTurn.entities.appId) best.entities.appId = lastTurn.entities.appId;
        if (!best.entities.query && lastTurn.entities.query) best.entities.query = lastTurn.entities.query;
      }
    }

    return best;
  }
}

export const UkiNLU = UkiNLUPipeline;
