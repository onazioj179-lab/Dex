// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Agent Core - Central AI Reasoning Engine
// Coordinates NLP, memory, tools, and task execution
// =============================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import Store from 'electron-store';
import { EventEmitter } from 'events';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    intent?: string;
    entities?: Entity[];
    confidence?: number;
    toolsUsed?: string[];
    reasoning?: string[];
  };
}

export interface Entity {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface AgentContext {
  conversationId: string;
  messages: AgentMessage[];
  activeTools: string[];
  userPreferences: Record<string, unknown>;
  sessionData: Record<string, unknown>;
}

export interface AgentIntent {
  name: string;
  confidence: number;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'home' | 'computer' | 'productivity' | 'system' | 'custom';
  parameters: ToolParameter[];
  handler: (params: Record<string, unknown>, context: AgentContext) => Promise<ToolResult>;
  requiresConfirmation?: boolean;
  privacyLevel: 'local' | 'network' | 'cloud';
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  message: string;
  actions?: AgentAction[];
}

export interface AgentAction {
  type: 'notify' | 'execute' | 'confirm' | 'learn' | 'schedule';
  payload: unknown;
}

export interface AgentConfig {
  enabled: boolean;
  privacyMode: 'strict' | 'balanced' | 'permissive';
  localProcessing: boolean;
  learningEnabled: boolean;
  proactiveMode: boolean;
  maxContextMessages: number;
  responseTimeout: number;
}

export interface AgentStats {
  totalConversations: number;
  totalMessages: number;
  toolsExecuted: number;
  successfulActions: number;
  learningEvents: number;
  averageResponseTime: number;
}

// -----------------------------------------------------------------------------
// Agent Core Class
// -----------------------------------------------------------------------------

class AgentCore extends EventEmitter {
  private store: Store<Record<string, unknown>>;
  private contextStore: Store<Record<string, unknown>>;
  private mainWindow: BrowserWindow | null = null;
  private tools: Map<string, ToolDefinition> = new Map();
  private activeContext: AgentContext | null = null;
  private config: AgentConfig;
  private stats: AgentStats;
  private processingQueue: Array<{ message: AgentMessage; resolve: Function; reject: Function }> = [];
  private isProcessing = false;

  constructor() {
    super();
    
    this.store = new Store({
      name: 'dex-agent-config',
      defaults: {
        config: {
          enabled: true,
          privacyMode: 'balanced',
          localProcessing: true,
          learningEnabled: true,
          proactiveMode: false,
          maxContextMessages: 50,
          responseTimeout: 30000,
        },
        stats: {
          totalConversations: 0,
          totalMessages: 0,
          toolsExecuted: 0,
          successfulActions: 0,
          learningEvents: 0,
          averageResponseTime: 0,
        },
      },
    }) as unknown as Store<Record<string, unknown>>;

    this.contextStore = new Store({
      name: 'dex-agent-context',
      defaults: {
        conversations: {},
        userPreferences: {},
        learnedPatterns: [],
      },
    }) as unknown as Store<Record<string, unknown>>;

    this.config = this.store.get('config') as AgentConfig;
    this.stats = this.store.get('stats') as AgentStats;
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPCHandlers();
    this.registerBuiltInTools();
    this.emit('initialized');
  }

  private registerIPCHandlers(): void {
    // Message handling
    ipcMain.handle('agent:send-message', async (_, message: string, conversationId?: string) => {
      return this.processMessage(message, conversationId);
    });

    ipcMain.handle('agent:get-conversation', async (_, conversationId: string) => {
      return this.getConversation(conversationId);
    });

    ipcMain.handle('agent:get-conversations', async () => {
      return this.getAllConversations();
    });

    ipcMain.handle('agent:clear-conversation', async (_, conversationId: string) => {
      return this.clearConversation(conversationId);
    });

    ipcMain.handle('agent:new-conversation', async () => {
      return this.createConversation();
    });

    // Tool management
    ipcMain.handle('agent:get-tools', async () => {
      return this.getAvailableTools();
    });

    ipcMain.handle('agent:execute-tool', async (_, toolId: string, params: Record<string, unknown>) => {
      return this.executeTool(toolId, params);
    });

    // Configuration
    ipcMain.handle('agent:get-config', async () => {
      return this.config;
    });

    ipcMain.handle('agent:update-config', async (_, updates: Partial<AgentConfig>) => {
      return this.updateConfig(updates);
    });

    ipcMain.handle('agent:get-stats', async () => {
      return this.stats;
    });

    // Memory and learning
    ipcMain.handle('agent:get-memory', async () => {
      return this.getMemory();
    });

    ipcMain.handle('agent:learn-preference', async (_, key: string, value: unknown) => {
      return this.learnPreference(key, value);
    });

    ipcMain.handle('agent:get-suggestions', async () => {
      return this.getProactiveSuggestions();
    });

    // Privacy
    ipcMain.handle('agent:export-data', async () => {
      return this.exportAllData();
    });

    ipcMain.handle('agent:clear-all-data', async () => {
      return this.clearAllData();
    });
  }

  // ---------------------------------------------------------------------------
  // Message Processing
  // ---------------------------------------------------------------------------

  async processMessage(content: string, conversationId?: string): Promise<AgentMessage> {
    const startTime = Date.now();
    
    // Get or create conversation context
    if (!conversationId) {
      conversationId = this.createConversation();
    }
    
    this.activeContext = this.loadContext(conversationId);

    // Create user message
    const userMessage: AgentMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    this.activeContext.messages.push(userMessage);
    this.stats.totalMessages++;

    // Process through NLP pipeline
    const intent = await this.analyzeIntent(content);
    const entities = await this.extractEntities(content);

    // Update message metadata
    userMessage.metadata = {
      intent: intent.name,
      entities,
      confidence: intent.confidence,
    };

    // Generate response based on intent
    const response = await this.generateResponse(intent, entities, this.activeContext);

    // Create agent response message
    const agentMessage: AgentMessage = {
      id: this.generateId(),
      role: 'agent',
      content: response.message,
      timestamp: Date.now(),
      metadata: {
        toolsUsed: response.toolsUsed,
        reasoning: response.reasoning,
      },
    };

    this.activeContext.messages.push(agentMessage);
    this.stats.totalMessages++;

    // Trim context if too long
    if (this.activeContext.messages.length > this.config.maxContextMessages) {
      this.activeContext.messages = this.activeContext.messages.slice(-this.config.maxContextMessages);
    }

    // Save context
    this.saveContext(conversationId, this.activeContext);

    // Update stats
    const responseTime = Date.now() - startTime;
    this.updateAverageResponseTime(responseTime);
    this.store.set('stats', this.stats);

    // Emit event for UI updates
    this.mainWindow?.webContents.send('agent:message', agentMessage);

    // Learn from interaction if enabled
    if (this.config.learningEnabled) {
      this.learnFromInteraction(userMessage, agentMessage, intent);
    }

    return agentMessage;
  }

  private async analyzeIntent(content: string): Promise<AgentIntent> {
    // Intent patterns for local processing
    const intentPatterns: Array<{ pattern: RegExp; intent: string; priority: number }> = [
      // Home automation
      { pattern: /turn\s+(on|off)\s+(.+)/i, intent: 'home.device.control', priority: 1 },
      { pattern: /set\s+(?:the\s+)?(?:temperature|thermostat)\s+(?:to\s+)?(\d+)/i, intent: 'home.thermostat.set', priority: 1 },
      { pattern: /(?:start|run)\s+(?:the\s+)?(?:laundry|washer|dryer)/i, intent: 'home.appliance.start', priority: 1 },
      { pattern: /(?:brew|make)\s+(?:some\s+)?coffee/i, intent: 'home.appliance.coffee', priority: 1 },
      { pattern: /(?:check|show)\s+(?:security|cameras?)/i, intent: 'home.security.check', priority: 1 },
      { pattern: /(?:lock|unlock)\s+(?:the\s+)?(?:doors?|house)/i, intent: 'home.security.lock', priority: 1 },
      { pattern: /energy\s+(?:usage|consumption|report)/i, intent: 'home.energy.report', priority: 1 },

      // Computer tasks
      { pattern: /(?:check|read|show)\s+(?:my\s+)?(?:email|inbox|mail)/i, intent: 'computer.email.check', priority: 1 },
      { pattern: /(?:send|compose|write)\s+(?:an?\s+)?email/i, intent: 'computer.email.compose', priority: 1 },
      { pattern: /(?:reply|respond)\s+to\s+(.+)/i, intent: 'computer.email.reply', priority: 1 },
      { pattern: /(?:search|find|look\s+for)\s+(.+)/i, intent: 'computer.search', priority: 2 },
      { pattern: /(?:open|launch|start)\s+(.+)/i, intent: 'computer.app.open', priority: 3 },
      { pattern: /(?:schedule|create|add)\s+(?:a\s+)?(?:meeting|event|appointment)/i, intent: 'computer.calendar.create', priority: 1 },
      { pattern: /(?:what|show)\s+(?:are\s+)?(?:my\s+)?(?:meetings?|schedule|calendar)/i, intent: 'computer.calendar.show', priority: 1 },

      // Productivity
      { pattern: /(?:create|add|new)\s+(?:a\s+)?(?:task|todo)/i, intent: 'productivity.task.create', priority: 1 },
      { pattern: /(?:show|list|what\s+are)\s+(?:my\s+)?tasks?/i, intent: 'productivity.task.list', priority: 1 },
      { pattern: /(?:take|create|add)\s+(?:a\s+)?note/i, intent: 'productivity.note.create', priority: 1 },
      { pattern: /(?:set|start)\s+(?:a\s+)?timer/i, intent: 'productivity.timer.set', priority: 1 },
      { pattern: /(?:remind|reminder)\s+(?:me\s+)?(?:to\s+)?(.+)/i, intent: 'productivity.reminder.set', priority: 1 },

      // System
      { pattern: /(?:run|execute|start)\s+(?:workflow|automation)\s+(.+)/i, intent: 'system.workflow.run', priority: 1 },
      { pattern: /(?:what|show|how)\s+(?:is\s+)?(?:the\s+)?(?:system|status)/i, intent: 'system.status', priority: 2 },
      { pattern: /(?:optimize|clean|speed\s+up)\s+(?:the\s+)?(?:system|computer)/i, intent: 'system.optimize', priority: 1 },

      // Conversational
      { pattern: /(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))/i, intent: 'conversation.greeting', priority: 5 },
      { pattern: /(?:thank|thanks)/i, intent: 'conversation.thanks', priority: 5 },
      { pattern: /(?:help|what\s+can\s+you\s+do)/i, intent: 'conversation.help', priority: 4 },
      { pattern: /(?:who\s+are\s+you|what\s+are\s+you)/i, intent: 'conversation.identity', priority: 4 },
    ];

    // Match against patterns
    let bestMatch: AgentIntent = {
      name: 'unknown',
      confidence: 0,
      parameters: {},
    };

    for (const { pattern, intent, priority } of intentPatterns) {
      const match = content.match(pattern);
      if (match) {
        const confidence = 0.9 - (priority * 0.1);
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            name: intent,
            confidence,
            parameters: this.extractParameters(match, intent),
          };
        }
      }
    }

    // If no strong match, try semantic similarity with learned patterns
    if (bestMatch.confidence < 0.5 && this.config.learningEnabled) {
      const learnedIntent = this.matchLearnedPattern(content);
      if (learnedIntent && learnedIntent.confidence > bestMatch.confidence) {
        bestMatch = learnedIntent;
      }
    }

    return bestMatch;
  }

  private extractParameters(match: RegExpMatchArray, intent: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    switch (intent) {
      case 'home.device.control':
        params.action = match[1]?.toLowerCase();
        params.device = match[2]?.toLowerCase();
        break;
      case 'home.thermostat.set':
        params.temperature = parseInt(match[1] || '70', 10);
        break;
      case 'computer.email.reply':
      case 'computer.search':
      case 'productivity.reminder.set':
        params.query = match[1];
        break;
      case 'system.workflow.run':
        params.workflowName = match[1];
        break;
    }

    return params;
  }

  private async extractEntities(content: string): Promise<Entity[]> {
    const entities: Entity[] = [];

    // Time extraction
    const timePatterns = [
      { pattern: /(\d{1,2}):(\d{2})\s*(am|pm)?/gi, type: 'time' },
      { pattern: /(tomorrow|today|tonight|next\s+\w+)/gi, type: 'relative_time' },
      { pattern: /in\s+(\d+)\s+(minutes?|hours?|days?)/gi, type: 'duration' },
    ];

    for (const { pattern, type } of timePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        entities.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.9,
        });
      }
    }

    // Number extraction
    const numberPattern = /\b(\d+(?:\.\d+)?)\b/g;
    let numMatch;
    while ((numMatch = numberPattern.exec(content)) !== null) {
      entities.push({
        type: 'number',
        value: numMatch[1],
        start: numMatch.index,
        end: numMatch.index + numMatch[0].length,
        confidence: 1.0,
      });
    }

    // Device name extraction (from known devices)
    const knownDevices = this.contextStore.get('userPreferences.knownDevices', []) as string[];
    for (const device of knownDevices) {
      const devicePattern = new RegExp(`\\b${device}\\b`, 'gi');
      let deviceMatch;
      while ((deviceMatch = devicePattern.exec(content)) !== null) {
        entities.push({
          type: 'device',
          value: device,
          start: deviceMatch.index,
          end: deviceMatch.index + deviceMatch[0].length,
          confidence: 0.95,
        });
      }
    }

    return entities;
  }

  private async generateResponse(
    intent: AgentIntent,
    entities: Entity[],
    context: AgentContext
  ): Promise<{ message: string; toolsUsed: string[]; reasoning: string[] }> {
    const toolsUsed: string[] = [];
    const reasoning: string[] = [];

    // Handle based on intent category
    const [category, action, subAction] = intent.name.split('.');

    reasoning.push(`Identified intent: ${intent.name} (confidence: ${(intent.confidence * 100).toFixed(0)}%)`);

    // Conversational intents
    if (category === 'conversation') {
      return this.handleConversationalIntent(action, context);
    }

    // Unknown intent
    if (category === 'unknown') {
      return {
        message: "I'm not sure I understood that. Could you rephrase? You can ask me to control smart home devices, manage emails, run workflows, or help with productivity tasks.",
        toolsUsed: [],
        reasoning: ['Could not match intent with sufficient confidence'],
      };
    }

    // Try to execute relevant tool
    const toolId = `${category}.${action}${subAction ? '.' + subAction : ''}`;
    const tool = this.tools.get(toolId) || this.findSimilarTool(toolId);

    if (tool) {
      reasoning.push(`Found matching tool: ${tool.name}`);
      
      // Check privacy level
      if (this.config.privacyMode === 'strict' && tool.privacyLevel !== 'local') {
        return {
          message: `This action requires ${tool.privacyLevel} access, but you have strict privacy mode enabled. Would you like to adjust your privacy settings?`,
          toolsUsed: [],
          reasoning: ['Action blocked by privacy settings'],
        };
      }

      // Check if confirmation required
      if (tool.requiresConfirmation) {
        return {
          message: `I can ${tool.description.toLowerCase()}. Should I proceed?`,
          toolsUsed: [],
          reasoning: ['Awaiting user confirmation for sensitive action'],
        };
      }

      // Execute tool
      try {
        const result = await tool.handler(intent.parameters, context);
        toolsUsed.push(tool.id);
        this.stats.toolsExecuted++;
        
        if (result.success) {
          this.stats.successfulActions++;
          reasoning.push(`Tool executed successfully`);
          return {
            message: result.message,
            toolsUsed,
            reasoning,
          };
        } else {
          reasoning.push(`Tool execution failed: ${result.message}`);
          return {
            message: `I tried to help but encountered an issue: ${result.message}`,
            toolsUsed,
            reasoning,
          };
        }
      } catch (error) {
        reasoning.push(`Tool execution error: ${error}`);
        return {
          message: "I encountered an error while trying to complete that action. Please try again.",
          toolsUsed,
          reasoning,
        };
      }
    }

    // No tool found, provide helpful response
    reasoning.push('No matching tool found');
    return {
      message: `I understand you want to ${intent.name.replace(/\./g, ' ')}, but I don't have that capability set up yet. You can add integrations in Settings.`,
      toolsUsed: [],
      reasoning,
    };
  }

  private handleConversationalIntent(
    action: string,
    context: AgentContext
  ): { message: string; toolsUsed: string[]; reasoning: string[] } {
    switch (action) {
      case 'greeting':
        const hour = new Date().getHours();
        let greeting = 'Hello';
        if (hour < 12) greeting = 'Good morning';
        else if (hour < 17) greeting = 'Good afternoon';
        else greeting = 'Good evening';
        return {
          message: `${greeting}! I'm your Dex assistant. I can help you control smart home devices, manage emails and tasks, run automations, and more. What would you like to do?`,
          toolsUsed: [],
          reasoning: ['Responding to greeting'],
        };

      case 'thanks':
        return {
          message: "You're welcome! Let me know if you need anything else.",
          toolsUsed: [],
          reasoning: ['Acknowledging thanks'],
        };

      case 'help':
        return {
          message: `Here's what I can help you with:

- Home Control: Turn devices on/off, adjust thermostat, start appliances, check security
- Email: Check inbox, compose emails, send replies
- Calendar: View schedule, create events
- Tasks: Create and manage tasks, set reminders
- Automations: Run workflows, check system status
- Productivity: Take notes, set timers

Just tell me what you'd like to do in natural language.`,
          toolsUsed: [],
          reasoning: ['Providing help information'],
        };

      case 'identity':
        return {
          message: "I'm the Dex AI assistant, running locally on your computer. I help you automate tasks, control smart devices, and stay productive - all while keeping your data private.",
          toolsUsed: [],
          reasoning: ['Explaining identity'],
        };

      default:
        return {
          message: "I'm here to help! What would you like to do?",
          toolsUsed: [],
          reasoning: ['Generic conversational response'],
        };
    }
  }

  // ---------------------------------------------------------------------------
  // Tool Management
  // ---------------------------------------------------------------------------

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
    this.emit('tool:registered', tool);
  }

  unregisterTool(toolId: string): boolean {
    const result = this.tools.delete(toolId);
    if (result) {
      this.emit('tool:unregistered', toolId);
    }
    return result;
  }

  private registerBuiltInTools(): void {
    // System status tool
    this.registerTool({
      id: 'system.status',
      name: 'System Status',
      description: 'Check the current system status',
      category: 'system',
      parameters: [],
      privacyLevel: 'local',
      handler: async () => {
        const memory = process.memoryUsage();
        const uptime = process.uptime();
        return {
          success: true,
          message: `System is running well. Memory usage: ${Math.round(memory.heapUsed / 1024 / 1024)}MB, Uptime: ${Math.round(uptime / 60)} minutes.`,
          data: { memory, uptime },
        };
      },
    });

    // Conversation greeting tool (internal)
    this.registerTool({
      id: 'conversation.greeting',
      name: 'Greeting',
      description: 'Respond to greetings',
      category: 'system',
      parameters: [],
      privacyLevel: 'local',
      handler: async () => ({
        success: true,
        message: 'Hello! How can I help you today?',
      }),
    });
  }

  private findSimilarTool(toolId: string): ToolDefinition | undefined {
    const parts = toolId.split('.');
    
    // Try progressively shorter matches
    for (let i = parts.length; i > 0; i--) {
      const prefix = parts.slice(0, i).join('.');
      for (const [id, tool] of this.tools) {
        if (id.startsWith(prefix)) {
          return tool;
        }
      }
    }

    return undefined;
  }

  async executeTool(toolId: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        success: false,
        message: `Tool not found: ${toolId}`,
      };
    }

    if (!this.activeContext) {
      this.activeContext = this.loadContext(this.createConversation());
    }

    return tool.handler(params, this.activeContext);
  }

  getAvailableTools(): Array<Omit<ToolDefinition, 'handler'>> {
    return Array.from(this.tools.values()).map(({ handler, ...tool }) => tool);
  }

  // ---------------------------------------------------------------------------
  // Conversation Management
  // ---------------------------------------------------------------------------

  createConversation(): string {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const context: AgentContext = {
      conversationId: id,
      messages: [],
      activeTools: Array.from(this.tools.keys()),
      userPreferences: this.contextStore.get('userPreferences', {}) as Record<string, unknown>,
      sessionData: {},
    };

    this.saveContext(id, context);
    this.stats.totalConversations++;
    this.store.set('stats', this.stats);

    return id;
  }

  getConversation(conversationId: string): AgentContext | null {
    return this.loadContext(conversationId);
  }

  getAllConversations(): Array<{ id: string; preview: string; timestamp: number; messageCount: number }> {
    const conversations = this.contextStore.get('conversations', {}) as Record<string, AgentContext>;
    
    return Object.entries(conversations)
      .map(([id, context]) => ({
        id,
        preview: context.messages[0]?.content?.substring(0, 100) || 'New conversation',
        timestamp: context.messages[context.messages.length - 1]?.timestamp || Date.now(),
        messageCount: context.messages.length,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  clearConversation(conversationId: string): boolean {
    const conversations = this.contextStore.get('conversations', {}) as Record<string, AgentContext>;
    if (conversations[conversationId]) {
      delete conversations[conversationId];
      this.contextStore.set('conversations', conversations);
      return true;
    }
    return false;
  }

  private loadContext(conversationId: string): AgentContext {
    const conversations = this.contextStore.get('conversations', {}) as Record<string, AgentContext>;
    return conversations[conversationId] || {
      conversationId,
      messages: [],
      activeTools: Array.from(this.tools.keys()),
      userPreferences: this.contextStore.get('userPreferences', {}) as Record<string, unknown>,
      sessionData: {},
    };
  }

  private saveContext(conversationId: string, context: AgentContext): void {
    const conversations = this.contextStore.get('conversations', {}) as Record<string, AgentContext>;
    conversations[conversationId] = context;
    this.contextStore.set('conversations', conversations);
  }

  // ---------------------------------------------------------------------------
  // Learning and Memory
  // ---------------------------------------------------------------------------

  private matchLearnedPattern(content: string): AgentIntent | null {
    const patterns = this.contextStore.get('learnedPatterns', []) as Array<{
      pattern: string;
      intent: string;
      confidence: number;
    }>;

    const contentLower = content.toLowerCase();
    for (const learned of patterns) {
      if (contentLower.includes(learned.pattern.toLowerCase())) {
        return {
          name: learned.intent,
          confidence: learned.confidence * 0.8, // Slightly lower confidence for learned patterns
          parameters: {},
        };
      }
    }

    return null;
  }

  private learnFromInteraction(
    userMessage: AgentMessage,
    agentMessage: AgentMessage,
    intent: AgentIntent
  ): void {
    if (intent.confidence > 0.7 && agentMessage.metadata?.toolsUsed?.length) {
      // Store successful pattern
      const patterns = this.contextStore.get('learnedPatterns', []) as Array<{
        pattern: string;
        intent: string;
        confidence: number;
        count: number;
      }>;

      const existingIndex = patterns.findIndex(p => p.intent === intent.name);
      if (existingIndex >= 0) {
        patterns[existingIndex].count++;
        patterns[existingIndex].confidence = Math.min(0.95, patterns[existingIndex].confidence + 0.01);
      } else {
        patterns.push({
          pattern: userMessage.content.substring(0, 50),
          intent: intent.name,
          confidence: intent.confidence,
          count: 1,
        });
      }

      // Keep only top patterns
      patterns.sort((a, b) => b.count - a.count);
      this.contextStore.set('learnedPatterns', patterns.slice(0, 100));
      this.stats.learningEvents++;
    }
  }

  learnPreference(key: string, value: unknown): void {
    const prefs = this.contextStore.get('userPreferences', {}) as Record<string, unknown>;
    prefs[key] = value;
    this.contextStore.set('userPreferences', prefs);
    this.stats.learningEvents++;
    this.store.set('stats', this.stats);
  }

  getMemory(): {
    preferences: Record<string, unknown>;
    patterns: Array<{ pattern: string; intent: string; count: number }>;
    conversationCount: number;
  } {
    const conversations = this.contextStore.get('conversations', {}) as Record<string, AgentContext>;
    return {
      preferences: this.contextStore.get('userPreferences', {}) as Record<string, unknown>,
      patterns: (this.contextStore.get('learnedPatterns', []) as Array<{
        pattern: string;
        intent: string;
        count: number;
      }>).slice(0, 20),
      conversationCount: Object.keys(conversations).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Proactive Suggestions
  // ---------------------------------------------------------------------------

  async getProactiveSuggestions(): Promise<Array<{ type: string; message: string; action: string }>> {
    if (!this.config.proactiveMode) {
      return [];
    }

    const suggestions: Array<{ type: string; message: string; action: string }> = [];
    const now = new Date();
    const hour = now.getHours();

    // Time-based suggestions
    if (hour >= 8 && hour <= 9) {
      suggestions.push({
        type: 'morning',
        message: 'Good morning! Would you like me to check your schedule and emails?',
        action: 'computer.calendar.show',
      });
    }

    if (hour >= 17 && hour <= 18) {
      suggestions.push({
        type: 'evening',
        message: 'End of workday approaching. Want me to summarize what you accomplished today?',
        action: 'productivity.task.summary',
      });
    }

    // Usage-based suggestions
    const patterns = this.contextStore.get('learnedPatterns', []) as Array<{
      intent: string;
      count: number;
    }>;

    const topPatterns = patterns.sort((a, b) => b.count - a.count).slice(0, 3);
    for (const pattern of topPatterns) {
      if (pattern.count > 10) {
        suggestions.push({
          type: 'frequent',
          message: `You often ${pattern.intent.replace(/\./g, ' ')}. Want me to do that now?`,
          action: pattern.intent,
        });
      }
    }

    return suggestions.slice(0, 5);
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(updates: Partial<AgentConfig>): AgentConfig {
    this.config = { ...this.config, ...updates };
    this.store.set('config', this.config);
    this.emit('config:updated', this.config);
    return this.config;
  }

  // ---------------------------------------------------------------------------
  // Privacy and Data Management
  // ---------------------------------------------------------------------------

  exportAllData(): {
    config: AgentConfig;
    stats: AgentStats;
    conversations: Record<string, AgentContext>;
    preferences: Record<string, unknown>;
    patterns: unknown[];
    exportedAt: number;
  } {
    return {
      config: this.config,
      stats: this.stats,
      conversations: this.contextStore.get('conversations', {}) as Record<string, AgentContext>,
      preferences: this.contextStore.get('userPreferences', {}) as Record<string, unknown>,
      patterns: this.contextStore.get('learnedPatterns', []) as unknown[],
      exportedAt: Date.now(),
    };
  }

  clearAllData(): void {
    this.contextStore.clear();
    this.stats = {
      totalConversations: 0,
      totalMessages: 0,
      toolsExecuted: 0,
      successfulActions: 0,
      learningEvents: 0,
      averageResponseTime: 0,
    };
    this.store.set('stats', this.stats);
    this.activeContext = null;
    this.emit('data:cleared');
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateAverageResponseTime(newTime: number): void {
    const totalResponses = this.stats.totalMessages / 2; // Approximate
    if (totalResponses === 0) {
      this.stats.averageResponseTime = newTime;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (totalResponses - 1) + newTime) / totalResponses;
    }
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  shutdown(): void {
    if (this.activeContext) {
      this.saveContext(this.activeContext.conversationId, this.activeContext);
    }
    this.store.set('stats', this.stats);
    this.emit('shutdown');
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const agentCore = new AgentCore();

export function initializeAgent(mainWindow: BrowserWindow): void {
  agentCore.initialize(mainWindow);
}

export function shutdownAgent(): void {
  agentCore.shutdown();
}
