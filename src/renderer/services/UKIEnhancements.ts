// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI Assistant Enhancements (Items 81-100)
 * Intelligent assistant features, context awareness, and response handling
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  status: MessageStatus;
  metadata?: {
    tokens?: number;
    model?: string;
    latency?: number;
    actions?: AssistantAction[];
  };
}

export interface AssistantAction {
  type: 'open-app' | 'open-file' | 'run-command' | 'search' | 'setting' | 'navigate';
  label: string;
  payload: Record<string, unknown>;
  executed?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  context?: ConversationContext;
}

export interface ConversationContext {
  activeApp?: string;
  selectedText?: string;
  currentFile?: string;
  recentActions?: string[];
}

// ============================================================================
// Prompt Templates
// ============================================================================

export const QUICK_PROMPTS = [
  { id: 'help', label: 'Help me with...', prompt: 'Help me with ' },
  { id: 'explain', label: 'Explain', prompt: 'Explain ' },
  { id: 'summarize', label: 'Summarize', prompt: 'Summarize ' },
  { id: 'write', label: 'Write', prompt: 'Write ' },
  { id: 'translate', label: 'Translate', prompt: 'Translate to English: ' },
  { id: 'fix', label: 'Fix this', prompt: 'Fix this: ' },
  { id: 'improve', label: 'Improve', prompt: 'Improve this: ' },
  { id: 'simplify', label: 'Simplify', prompt: 'Simplify this: ' },
];

export const SYSTEM_PROMPTS: Record<string, string> = {
  default: `You are UKI, a helpful AI assistant integrated into DEX, a creative desktop operating system. You help users with their creative work, system tasks, and general questions. Be concise, helpful, and friendly. When appropriate, suggest using DEX's built-in apps like VINX (video), Imosion (audio), Prism (images), Flux (motion graphics), Forge (encoding), and AXL (3D/CAD).`,
  
  creative: `You are UKI, a creative AI assistant specialized in helping with digital content creation. You have expertise in video editing (VINX), audio production (Imosion), image editing (Prism), motion graphics (Flux), media encoding (Forge), and 3D/CAD design (AXL). Provide specific, actionable advice for creative projects.`,
  
  technical: `You are UKI, a technical AI assistant. Help users with system configuration, troubleshooting, file management, and technical questions about DEX. Be precise and provide step-by-step instructions when appropriate.`,
  
  learning: `You are UKI, an educational AI assistant. Explain concepts clearly, break down complex topics, and help users learn new skills. Use examples and analogies when helpful.`,
};

// ============================================================================
// Context Extraction
// ============================================================================

export function extractContext(): ConversationContext {
  // This would integrate with the actual app state
  return {
    activeApp: undefined,
    selectedText: undefined,
    currentFile: undefined,
    recentActions: [],
  };
}

export function buildContextPrompt(context: ConversationContext): string {
  const parts: string[] = [];
  
  if (context.activeApp) {
    parts.push(`The user is currently using ${context.activeApp}.`);
  }
  
  if (context.selectedText) {
    parts.push(`Selected text: "${context.selectedText.slice(0, 500)}${context.selectedText.length > 500 ? '...' : ''}"`);
  }
  
  if (context.currentFile) {
    parts.push(`Current file: ${context.currentFile}`);
  }
  
  if (context.recentActions && context.recentActions.length > 0) {
    parts.push(`Recent actions: ${context.recentActions.slice(0, 3).join(', ')}`);
  }
  
  return parts.join(' ');
}

// ============================================================================
// Action Parsing
// ============================================================================

const ACTION_PATTERNS = [
  { pattern: /open\s+(\w+)/i, type: 'open-app' as const },
  { pattern: /go\s+to\s+(\w+)/i, type: 'navigate' as const },
  { pattern: /search\s+(?:for\s+)?(.+)/i, type: 'search' as const },
  { pattern: /set\s+(\w+)\s+to\s+(.+)/i, type: 'setting' as const },
  { pattern: /run\s+(.+)/i, type: 'run-command' as const },
];

export function parseActions(content: string): AssistantAction[] {
  const actions: AssistantAction[] = [];
  
  // Look for action blocks in markdown
  const actionBlockRegex = /```action\n([\s\S]*?)\n```/g;
  let match;
  
  while ((match = actionBlockRegex.exec(content)) !== null) {
    try {
      const action = JSON.parse(match[1]) as AssistantAction;
      if (action.type && action.label) {
        actions.push(action);
      }
    } catch {
      // Invalid action block, skip
    }
  }
  
  // Look for inline actions
  const inlineActionRegex = /\[action:(\w+):([^\]]+)\]/g;
  while ((match = inlineActionRegex.exec(content)) !== null) {
    actions.push({
      type: match[1] as AssistantAction['type'],
      label: match[2],
      payload: {},
    });
  }
  
  return actions;
}

// ============================================================================
// Response Formatting
// ============================================================================

export function formatResponseForDisplay(content: string): string {
  // Remove action blocks from display
  let formatted = content.replace(/```action\n[\s\S]*?\n```/g, '');
  
  // Remove inline actions markers
  formatted = formatted.replace(/\[action:\w+:([^\]]+)\]/g, '**$1**');
  
  // Clean up extra whitespace
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();
  
  return formatted;
}

// ============================================================================
// Conversation Store
// ============================================================================

interface UKIStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  isMinimized: boolean;
  mode: 'default' | 'creative' | 'technical' | 'learning';
  
  // Actions
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Omit<ConversationMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ConversationMessage>) => void;
  clearConversation: (id: string) => void;
  setOpen: (open: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setMode: (mode: UKIStore['mode']) => void;
  getActiveConversation: () => Conversation | null;
}

let conversationIdCounter = 0;
let messageIdCounter = 0;

export const useUKIStore = create<UKIStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isOpen: false,
      isMinimized: false,
      mode: 'default',

      createConversation: () => {
        const id = `conv_${Date.now()}_${++conversationIdCounter}`;
        const conversation: Conversation = {
          id,
          title: 'New Conversation',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set(state => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));

        return id;
      },

      deleteConversation: (id) => {
        set(state => {
          const newConversations = state.conversations.filter(c => c.id !== id);
          return {
            conversations: newConversations,
            activeConversationId: state.activeConversationId === id
              ? (newConversations[0]?.id ?? null)
              : state.activeConversationId,
          };
        });
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      addMessage: (conversationId, message) => {
        const messageId = `msg_${Date.now()}_${++messageIdCounter}`;
        const fullMessage: ConversationMessage = {
          ...message,
          id: messageId,
          timestamp: Date.now(),
        };

        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, fullMessage],
                  updatedAt: Date.now(),
                  // Auto-generate title from first user message
                  title: conv.messages.length === 0 && message.role === 'user'
                    ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                    : conv.title,
                }
              : conv
          ),
        }));

        return messageId;
      },

      updateMessage: (conversationId, messageId, updates) => {
        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id === messageId ? { ...msg, ...updates } : msg
                  ),
                  updatedAt: Date.now(),
                }
              : conv
          ),
        }));
      },

      clearConversation: (id) => {
        set(state => ({
          conversations: state.conversations.map(conv =>
            conv.id === id
              ? { ...conv, messages: [], title: 'New Conversation', updatedAt: Date.now() }
              : conv
          ),
        }));
      },

      setOpen: (open) => set({ isOpen: open, isMinimized: false }),
      setMinimized: (minimized) => set({ isMinimized: minimized }),
      setMode: (mode) => set({ mode }),

      getActiveConversation: () => {
        const state = get();
        return state.conversations.find(c => c.id === state.activeConversationId) ?? null;
      },
    }),
    {
      name: 'dex-uki-store',
      partialize: (state) => ({
        conversations: state.conversations.slice(0, 50), // Keep last 50 conversations
        mode: state.mode,
      }),
    }
  )
);

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

export const UKI_SHORTCUTS = [
  { key: 'Ctrl+Shift+U', action: 'toggle', description: 'Open/Close UKI' },
  { key: 'Escape', action: 'minimize', description: 'Minimize UKI' },
  { key: 'Ctrl+N', action: 'new-conversation', description: 'New conversation' },
  { key: 'Ctrl+Enter', action: 'send', description: 'Send message' },
  { key: 'Ctrl+/', action: 'focus-input', description: 'Focus input' },
];

// ============================================================================
// Voice Input — Web Speech API (browser-native, no model bundled)
// ============================================================================

export interface VoiceInputState {
  isListening: boolean;
  transcript: string;
  error: string | null;
}

export function startVoiceInput(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  onEnd: () => void
): () => void {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    onError('Speech recognition not supported');
    onEnd();
    return () => {};
  }

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onError('Speech recognition not available');
    onEnd();
    return () => {};
  }
  
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    if (finalTranscript) {
      onTranscript(finalTranscript, true);
    } else if (interimTranscript) {
      onTranscript(interimTranscript, false);
    }
  };

  recognition.onerror = (event: { error: string }) => {
    onError(event.error);
  };

  recognition.onend = onEnd;

  recognition.start();

  return () => {
    recognition.stop();
  };
}

// ============================================================================
// Suggested Responses
// ============================================================================

export function getSuggestedResponses(lastMessage: string): string[] {
  const suggestions: string[] = [];
  
  // Common follow-up patterns
  if (lastMessage.includes('?')) {
    suggestions.push('Tell me more');
    suggestions.push('Give an example');
  }
  
  if (lastMessage.includes('error') || lastMessage.includes('problem')) {
    suggestions.push('How do I fix this?');
    suggestions.push('What caused this?');
  }
  
  if (lastMessage.includes('file') || lastMessage.includes('project')) {
    suggestions.push('Open it');
    suggestions.push('Show me the location');
  }
  
  if (lastMessage.includes('app') || lastMessage.includes('application')) {
    suggestions.push('Open it');
    suggestions.push('What can it do?');
  }
  
  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push('Thanks!');
    suggestions.push('Tell me more');
    suggestions.push('What else?');
  }
  
  return suggestions.slice(0, 3);
}

// ============================================================================
// Smart Intent Detection (81-84)
// ============================================================================

export type UserIntent = 
  | 'question' 
  | 'command' 
  | 'search' 
  | 'creative' 
  | 'system' 
  | 'navigation'
  | 'conversation'
  | 'learning';

const INTENT_PATTERNS: { pattern: RegExp; intent: UserIntent; confidence: number }[] = [
  { pattern: /^(what|who|when|where|why|how|can you|could you|would you|is it|are there)/i, intent: 'question', confidence: 0.9 },
  { pattern: /^(open|launch|start|run|execute|show|close|quit|exit)/i, intent: 'command', confidence: 0.95 },
  { pattern: /^(search|find|look for|locate|where is)/i, intent: 'search', confidence: 0.9 },
  { pattern: /(edit|create|make|design|render|export|import|convert)/i, intent: 'creative', confidence: 0.8 },
  { pattern: /(settings?|preference|configure|install|update|system|memory|cpu|disk)/i, intent: 'system', confidence: 0.85 },
  { pattern: /^(go to|navigate to|take me to|switch to)/i, intent: 'navigation', confidence: 0.9 },
  { pattern: /(teach me|explain|learn|understand|tutorial|guide)/i, intent: 'learning', confidence: 0.8 },
  { pattern: /^(hi|hello|hey|thanks|thank you|bye|goodbye)/i, intent: 'conversation', confidence: 0.9 },
];

export function detectIntent(message: string): { intent: UserIntent; confidence: number } {
  for (const { pattern, intent, confidence } of INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return { intent, confidence };
    }
  }
  return { intent: 'question', confidence: 0.5 };
}

// ============================================================================
// Action Execution (85-88)
// ============================================================================

export async function executeAction(action: AssistantAction): Promise<{ success: boolean; result?: string; error?: string }> {
  try {
    const ipc = (window as any).electron;
    
    switch (action.type) {
      case 'open-app': {
        const appId = action.payload.appId as string || action.label.toLowerCase();
        window.dispatchEvent(new CustomEvent('dex-spotlight-navigate', { detail: { appId } }));
        return { success: true, result: `Opened ${action.label}` };
      }
      
      case 'open-file': {
        const filePath = action.payload.path as string;
        if (ipc?.invoke) {
          await ipc.invoke('shell:openPath', filePath);
        }
        return { success: true, result: `Opened ${filePath}` };
      }
      
      case 'run-command': {
        const command = action.payload.command as string;
        if (ipc?.invoke) {
          const result = await ipc.invoke('shell:executeCommand', command);
          return { success: true, result: result || 'Command executed' };
        }
        return { success: false, error: 'IPC not available' };
      }
      
      case 'search': {
        const query = action.payload.query as string || action.label;
        window.dispatchEvent(new CustomEvent('dex-spotlight-open', { detail: { query } }));
        return { success: true, result: `Searching for "${query}"` };
      }
      
      case 'setting': {
        const settingKey = action.payload.key as string;
        const settingValue = action.payload.value;
        // Store setting change
        try {
          const settings = JSON.parse(localStorage.getItem('dex-settings') || '{}');
          settings[settingKey] = settingValue;
          localStorage.setItem('dex-settings', JSON.stringify(settings));
          return { success: true, result: `Set ${settingKey} to ${settingValue}` };
        } catch {
          return { success: false, error: 'Failed to update setting' };
        }
      }
      
      case 'navigate': {
        const destination = action.payload.destination as string || action.label;
        window.dispatchEvent(new CustomEvent('dex-navigate', { detail: { destination } }));
        return { success: true, result: `Navigating to ${destination}` };
      }
      
      default:
        return { success: false, error: 'Unknown action type' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Action failed' };
  }
}

// ============================================================================
// Conversation Summarization (89-91)
// ============================================================================

export function summarizeConversation(messages: ConversationMessage[]): string {
  if (messages.length === 0) return 'Empty conversation';
  if (messages.length <= 3) return messages.map(m => m.content.slice(0, 50)).join(' → ');
  
  // Extract key topics
  const userMessages = messages.filter(m => m.role === 'user');
  const topics = new Set<string>();
  
  userMessages.forEach(msg => {
    // Extract nouns and key terms (simple heuristic)
    const words = msg.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 4 && !STOP_WORDS.has(word)) {
        topics.add(word);
      }
    });
  });
  
  const topTopics = Array.from(topics).slice(0, 5);
  const firstQuestion = userMessages[0]?.content.slice(0, 40) || '';
  
  return `${firstQuestion}... (${messages.length} messages, topics: ${topTopics.join(', ')})`;
}

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'have', 'with', 'this', 'will', 'from', 'they',
  'been', 'would', 'could', 'should', 'about', 'which', 'there', 'their',
  'what', 'when', 'where', 'while', 'being', 'these', 'those', 'does',
  'please', 'thanks', 'thank', 'hello', 'help', 'want', 'need', 'like',
]);

// ============================================================================
// Learning from Feedback (92-94)
// ============================================================================

export interface UserFeedback {
  messageId: string;
  conversationId: string;
  type: 'helpful' | 'not-helpful' | 'incorrect' | 'offensive';
  details?: string;
  timestamp: number;
}

const FEEDBACK_STORAGE_KEY = 'dex-uki-feedback';

export function saveFeedback(feedback: UserFeedback): void {
  try {
    const existing = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]') as UserFeedback[];
    existing.push(feedback);
    // Keep last 100 feedback items
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(existing.slice(-100)));
  } catch { /* ignore */ }
}

export function getFeedbackStats(): { helpful: number; notHelpful: number; total: number } {
  try {
    const feedback = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]') as UserFeedback[];
    return {
      helpful: feedback.filter(f => f.type === 'helpful').length,
      notHelpful: feedback.filter(f => f.type === 'not-helpful').length,
      total: feedback.length,
    };
  } catch {
    return { helpful: 0, notHelpful: 0, total: 0 };
  }
}

// ============================================================================
// Multi-language Support (95-97)
// ============================================================================

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', flag: 'US' },
  { code: 'es', name: 'Español', flag: 'ES' },
  { code: 'fr', name: 'Français', flag: 'FR' },
  { code: 'de', name: 'Deutsch', flag: 'DE' },
  { code: 'ja', name: '日本語', flag: 'JP' },
  { code: 'zh', name: '中文', flag: 'CN' },
  { code: 'ko', name: '한국어', flag: 'KR' },
  { code: 'pt', name: 'Português', flag: 'BR' },
  { code: 'it', name: 'Italiano', flag: 'IT' },
  { code: 'ru', name: 'Русский', flag: 'RU' },
];

export function detectLanguage(text: string): string {
  // Simple heuristics for common scripts
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  
  // Default to English
  return 'en';
}

export function getLanguageSystemPrompt(langCode: string): string {
  const prompts: Record<string, string> = {
    es: 'Responde en español.',
    fr: 'Réponds en français.',
    de: 'Antworte auf Deutsch.',
    ja: '日本語で回答してください。',
    zh: '请用中文回答。',
    ko: '한국어로 답변해 주세요.',
    pt: 'Responda em português.',
    it: 'Rispondi in italiano.',
    ru: 'Отвечай на русском.',
  };
  return prompts[langCode] || '';
}

// ============================================================================
// Proactive Assistance (98-100)
// ============================================================================

export interface ProactiveHint {
  id: string;
  trigger: 'time' | 'context' | 'pattern' | 'error';
  message: string;
  action?: AssistantAction;
  priority: number;
  shown?: boolean;
}

export function getProactiveHints(context: ConversationContext): ProactiveHint[] {
  const hints: ProactiveHint[] = [];
  const now = new Date();
  const hour = now.getHours();
  
  // Time-based hints
  if (hour >= 9 && hour < 10) {
    hints.push({
      id: 'morning-greeting',
      trigger: 'time',
      message: 'Good morning! Ready to start a productive day?',
      priority: 1,
    });
  }
  
  if (hour >= 17 && hour < 18) {
    hints.push({
      id: 'end-of-day',
      trigger: 'time',
      message: 'Wrapping up for the day? I can help you organize your work.',
      priority: 1,
    });
  }
  
  // Context-based hints
  if (context.activeApp) {
    hints.push({
      id: 'app-tip',
      trigger: 'context',
      message: `Need help with ${context.activeApp}? I know some useful tips!`,
      action: { type: 'search', label: `${context.activeApp} tips`, payload: { query: `${context.activeApp} tips` } },
      priority: 2,
    });
  }
  
  // Pattern-based hints (would analyze user patterns)
  const recentSearches = context.recentActions?.filter(a => a.startsWith('search:')) || [];
  if (recentSearches.length >= 3) {
    hints.push({
      id: 'search-pattern',
      trigger: 'pattern',
      message: 'Looks like you\'re searching a lot. Can I help narrow things down?',
      priority: 3,
    });
  }
  
  return hints.sort((a, b) => a.priority - b.priority);
}

export function shouldShowProactiveHint(hint: ProactiveHint): boolean {
  // Check if hint was shown recently
  try {
    const shownHints = JSON.parse(localStorage.getItem('dex-uki-shown-hints') || '{}') as Record<string, number>;
    const lastShown = shownHints[hint.id];
    if (lastShown) {
      const hoursSince = (Date.now() - lastShown) / (1000 * 60 * 60);
      // Don't show same hint within 4 hours
      if (hoursSince < 4) return false;
    }
  } catch { /* ignore */ }
  return true;
}

export function markHintAsShown(hintId: string): void {
  try {
    const shownHints = JSON.parse(localStorage.getItem('dex-uki-shown-hints') || '{}') as Record<string, number>;
    shownHints[hintId] = Date.now();
    localStorage.setItem('dex-uki-shown-hints', JSON.stringify(shownHints));
  } catch { /* ignore */ }
}
