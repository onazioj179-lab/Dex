// ═══════════════════════════════════════════════════════════════════════════
// DEX - AI Hub
// Phase 56: BYO-AI Integration - Centralized AI Provider Management
// Secure, provider-agnostic, user-controlled AI assistance
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AIProviderType = 'claude' | 'openai' | 'custom';

export interface AIProviderConfig {
  id: string;
  type: AIProviderType;
  name: string;
  enabled: boolean;
  isDefault: boolean;
  model?: string;
  baseUrl?: string; // For custom providers
  addedAt: number;
  lastUsed?: number;
  usageCount: number;
}

export interface AIRequest {
  prompt: string;
  context?: AIContext;
  providerId?: string; // Use specific provider, or default
  maxTokens?: number;
  temperature?: number;
}

export interface AIContext {
  page?: string;
  selectedText?: string;
  selectedItems?: Array<{ name: string; type: string }>;
  sessionInfo?: string;
  customContext?: string;
}

export interface AIResponse {
  success: boolean;
  content?: string;
  error?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
  duration: number;
}

export interface AIUsageLog {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  scope: string;
  tokensUsed?: number;
  success: boolean;
  latency?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Hub - Central Management
// ─────────────────────────────────────────────────────────────────────────────

export class AIHub extends EventEmitter {
  private providers: Map<string, AIProviderConfig> = new Map();
  private apiKeys: Map<string, string> = new Map(); // In-memory only, encrypted on disk
  private usageLogs: AIUsageLog[] = [];
  private configPath: string;
  private keysPath: string;
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;
  private activeStreams: Map<string, { cancelled: boolean }> = new Map();

  // Settings
  private aiEnabled = false;
  private logPrompts = false;
  private confirmBeforeSend = true;

  constructor() {
    super();
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'ai-config.json');
    this.keysPath = path.join(userDataPath, 'ai-keys.enc');
  }

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    if (this.initialized) return;
    
    this.mainWindow = mainWindow;
    
    // Load configuration
    await this.loadConfig();
    await this.loadEncryptedKeys();
    
    // Register IPC handlers
    this.registerHandlers();
    
    this.initialized = true;
    console.log('[AIHub] Initialized');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider Management
  // ─────────────────────────────────────────────────────────────────────────

  async addProvider(
    type: AIProviderType,
    name: string,
    apiKey: string,
    options?: { model?: string; baseUrl?: string }
  ): Promise<{ success: boolean; providerId?: string; error?: string }> {
    try {
      // Validate API key format
      if (!apiKey || apiKey.length < 10) {
        return { success: false, error: 'Invalid API key format' };
      }

      const providerId = `${type}-${Date.now()}`;
      
      const config: AIProviderConfig = {
        id: providerId,
        type,
        name,
        enabled: true,
        isDefault: this.providers.size === 0, // First provider becomes default
        model: options?.model || this.getDefaultModel(type),
        baseUrl: options?.baseUrl,
        addedAt: Date.now(),
        usageCount: 0,
      };

      // Store config (without key)
      this.providers.set(providerId, config);
      
      // Store key separately (encrypted)
      this.apiKeys.set(providerId, apiKey);
      
      // Persist
      await this.saveConfig();
      await this.saveEncryptedKeys();

      this.emit('provider-added', config);
      console.log(`[AIHub] Provider added: ${name} (${type})`);

      return { success: true, providerId };
    } catch (error: any) {
      console.error('[AIHub] Failed to add provider:', error);
      return { success: false, error: error.message };
    }
  }

  async removeProvider(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    this.providers.delete(providerId);
    this.apiKeys.delete(providerId);

    // If this was default, set a new default
    if (provider.isDefault) {
      const firstProvider = this.providers.values().next().value;
      if (firstProvider) {
        firstProvider.isDefault = true;
      }
    }

    await this.saveConfig();
    await this.saveEncryptedKeys();

    this.emit('provider-removed', providerId);
    console.log(`[AIHub] Provider removed: ${provider.name}`);

    return true;
  }

  async setProviderEnabled(providerId: string, enabled: boolean): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    provider.enabled = enabled;
    await this.saveConfig();

    return true;
  }

  async setDefaultProvider(providerId: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    // Clear existing default
    for (const p of this.providers.values()) {
      p.isDefault = false;
    }

    provider.isDefault = true;
    await this.saveConfig();

    return true;
  }

  getProviders(): AIProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getDefaultProvider(): AIProviderConfig | null {
    for (const provider of this.providers.values()) {
      if (provider.isDefault && provider.enabled) {
        return provider;
      }
    }
    // Return first enabled provider if no default
    for (const provider of this.providers.values()) {
      if (provider.enabled) {
        return provider;
      }
    }
    return null;
  }

  private getDefaultModel(type: AIProviderType): string {
    switch (type) {
      case 'claude': return 'claude-sonnet-4-20250514';
      case 'openai': return 'gpt-4o';
      default: return 'default';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────

  private emitToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Process streaming request with real-time updates to renderer
   */
  private async processStreamRequest(streamId: string, request: any): Promise<void> {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    try {
      // Get provider
      const provider = request.providerId 
        ? this.providers.get(request.providerId) 
        : this.getDefaultProvider();

      if (!provider) {
        throw new Error('No AI provider configured');
      }

      const apiKey = this.apiKeys.get(provider.id);
      if (!apiKey) {
        throw new Error('API key not found');
      }

      // Build prompt
      const fullPrompt = this.buildPrompt({
        prompt: request.prompt,
        context: request.context,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      // Start streaming based on provider
      this.emitToRenderer('ai:streamStart', { streamId, provider: provider.name });

      let fullContent = '';
      let tokensUsed = 0;

      if (provider.type === 'claude') {
        // Claude streaming via fetch with ReadableStream
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: provider.model || 'claude-sonnet-4-20250514',
            max_tokens: request.maxTokens || 4096,
            messages: [{ role: 'user', content: fullPrompt }],
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`Claude API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            if (stream.cancelled) break;

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
              if (stream.cancelled) break;

              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'content_block_delta' && data.delta?.text) {
                  fullContent += data.delta.text;
                  this.emitToRenderer('ai:streamChunk', { 
                    streamId, 
                    chunk: data.delta.text,
                    fullContent,
                  });
                }
                if (data.usage) {
                  tokensUsed = data.usage.output_tokens || 0;
                }
              } catch (err: any) {
                console.warn('[AIHub] Failed to parse Anthropic SSE chunk:', err.message);
              }
            }
          }
        }
      } else if (provider.type === 'openai') {
        // OpenAI streaming
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: provider.model || 'gpt-4o',
            messages: [{ role: 'user', content: fullPrompt }],
            max_tokens: request.maxTokens || 4096,
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            if (stream.cancelled) break;

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
              if (stream.cancelled) break;
              if (line === 'data: [DONE]') continue;

              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  this.emitToRenderer('ai:streamChunk', { 
                    streamId, 
                    chunk: content,
                    fullContent,
                  });
                }
              } catch (err: any) {
                console.warn('[AIHub] Failed to parse OpenAI SSE chunk:', err.message);
              }
            }
          }
        }
      } else {
        // Non-streaming fallback for custom providers
        const result = await this.sendRequest({
          prompt: request.prompt,
          context: request.context,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        });
        fullContent = result.content || '';
        tokensUsed = result.tokensUsed || 0;
        this.emitToRenderer('ai:streamChunk', { streamId, chunk: fullContent, fullContent });
      }

      // Stream complete
      if (!stream.cancelled) {
        this.emitToRenderer('ai:streamComplete', { 
          streamId, 
          content: fullContent,
          tokensUsed,
        });
      }

      // Log usage with latency
      this.logUsage({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        provider: provider.name,
        model: provider.model || 'unknown',
        scope: request.context?.page || 'stream',
        tokensUsed,
        success: true,
        latency: Date.now() - parseInt(streamId.split('-')[1], 10),
      });

    } catch (error: any) {
      if (!stream.cancelled) {
        this.emitToRenderer('ai:streamError', { streamId, error: error.message });
      }
    } finally {
      this.activeStreams.delete(streamId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI Requests
  // ─────────────────────────────────────────────────────────────────────────

  async sendRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    if (!this.aiEnabled) {
      return {
        success: false,
        error: 'AI is disabled. Enable it in Settings → AI Hub.',
        provider: 'none',
        model: 'none',
        duration: 0,
      };
    }

    // Get provider
    let provider: AIProviderConfig | null;
    if (request.providerId) {
      provider = this.providers.get(request.providerId) || null;
    } else {
      provider = this.getDefaultProvider();
    }

    if (!provider) {
      return {
        success: false,
        error: 'No AI provider configured. Add one in Settings → AI Hub.',
        provider: 'none',
        model: 'none',
        duration: 0,
      };
    }

    if (!provider.enabled) {
      return {
        success: false,
        error: `Provider "${provider.name}" is disabled.`,
        provider: provider.name,
        model: provider.model || 'unknown',
        duration: 0,
      };
    }

    const apiKey = this.apiKeys.get(provider.id);
    if (!apiKey) {
      return {
        success: false,
        error: 'API key not found for provider.',
        provider: provider.name,
        model: provider.model || 'unknown',
        duration: 0,
      };
    }

    try {
      // Build the full prompt with context
      const fullPrompt = this.buildPrompt(request);

      // Make the API call based on provider type
      let response: AIResponse;
      
      switch (provider.type) {
        case 'claude':
          response = await this.callClaude(apiKey, fullPrompt, provider, request);
          break;
        case 'openai':
          response = await this.callOpenAI(apiKey, fullPrompt, provider, request);
          break;
        default:
          response = await this.callCustom(apiKey, fullPrompt, provider, request);
      }

      // Update usage
      provider.lastUsed = Date.now();
      provider.usageCount++;
      await this.saveConfig();

      // Log usage
      this.logUsage({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        provider: provider.name,
        model: provider.model || 'unknown',
        scope: request.context?.page || 'general',
        tokensUsed: response.tokensUsed,
        success: response.success,
      });

      response.duration = Date.now() - startTime;
      return response;

    } catch (error: any) {
      console.error('[AIHub] Request failed:', error);
      
      return {
        success: false,
        error: error.message || 'AI request failed',
        provider: provider.name,
        model: provider.model || 'unknown',
        duration: Date.now() - startTime,
      };
    }
  }

  private buildPrompt(request: AIRequest): string {
    let prompt = request.prompt;

    if (request.context) {
      const contextParts: string[] = [];

      if (request.context.page) {
        contextParts.push(`Current page: ${request.context.page}`);
      }
      if (request.context.selectedText) {
        contextParts.push(`Selected text:\n${request.context.selectedText}`);
      }
      if (request.context.selectedItems?.length) {
        const items = request.context.selectedItems
          .map(i => `- ${i.name} (${i.type})`)
          .join('\n');
        contextParts.push(`Selected items:\n${items}`);
      }
      if (request.context.sessionInfo) {
        contextParts.push(`Session: ${request.context.sessionInfo}`);
      }
      if (request.context.customContext) {
        contextParts.push(request.context.customContext);
      }

      if (contextParts.length > 0) {
        prompt = `Context:\n${contextParts.join('\n\n')}\n\n---\n\n${prompt}`;
      }
    }

    return prompt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Provider API Calls
  // ─────────────────────────────────────────────────────────────────────────

  private async callClaude(
    apiKey: string,
    prompt: string,
    provider: AIProviderConfig,
    request: AIRequest
  ): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model || 'claude-sonnet-4-20250514',
          max_tokens: request.maxTokens || 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        content: data.content?.[0]?.text || '',
        provider: provider.name,
        model: provider.model || 'claude-sonnet-4-20250514',
        tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
        duration: 0,
      };

    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  private async callOpenAI(
    apiKey: string,
    prompt: string,
    provider: AIProviderConfig,
    request: AIRequest
  ): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model || 'gpt-4o',
          max_tokens: request.maxTokens || 1024,
          temperature: request.temperature || 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        content: data.choices?.[0]?.message?.content || '',
        provider: provider.name,
        model: provider.model || 'gpt-4o',
        tokensUsed: data.usage?.total_tokens,
        duration: 0,
      };

    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  private async callCustom(
    apiKey: string,
    prompt: string,
    provider: AIProviderConfig,
    request: AIRequest
  ): Promise<AIResponse> {
    if (!provider.baseUrl) {
      throw new Error('Custom provider requires a base URL');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      // Assume OpenAI-compatible API
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model || 'default',
          max_tokens: request.maxTokens || 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        content: data.choices?.[0]?.message?.content || data.content || '',
        provider: provider.name,
        model: provider.model || 'custom',
        duration: 0,
      };

    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Usage Logging
  // ─────────────────────────────────────────────────────────────────────────

  private logUsage(log: AIUsageLog): void {
    this.usageLogs.push(log);
    
    // Keep only last 1000 logs
    if (this.usageLogs.length > 1000) {
      this.usageLogs = this.usageLogs.slice(-1000);
    }

    this.emit('usage-logged', log);
  }

  getUsageLogs(limit = 100): AIUsageLog[] {
    return this.usageLogs.slice(-limit);
  }

  clearUsageLogs(): void {
    this.usageLogs = [];
    this.emit('logs-cleared');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settings
  // ─────────────────────────────────────────────────────────────────────────

  setAIEnabled(enabled: boolean): void {
    this.aiEnabled = enabled;
    this.saveConfig();
  }

  isAIEnabled(): boolean {
    return this.aiEnabled;
  }

  setConfirmBeforeSend(confirm: boolean): void {
    this.confirmBeforeSend = confirm;
    this.saveConfig();
  }

  getConfirmBeforeSend(): boolean {
    return this.confirmBeforeSend;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Persistence
  // ─────────────────────────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        
        this.aiEnabled = data.aiEnabled ?? false;
        this.logPrompts = data.logPrompts ?? false;
        this.confirmBeforeSend = data.confirmBeforeSend ?? true;
        
        if (data.providers) {
          this.providers.clear();
          for (const p of data.providers) {
            this.providers.set(p.id, p);
          }
        }
        
        if (data.usageLogs) {
          this.usageLogs = data.usageLogs;
        }
      }
    } catch (error) {
      console.error('[AIHub] Failed to load config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const data = {
        aiEnabled: this.aiEnabled,
        logPrompts: this.logPrompts,
        confirmBeforeSend: this.confirmBeforeSend,
        providers: Array.from(this.providers.values()),
        usageLogs: this.usageLogs.slice(-1000),
      };
      
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[AIHub] Failed to save config:', error);
    }
  }

  private async loadEncryptedKeys(): Promise<void> {
    try {
      if (fs.existsSync(this.keysPath) && safeStorage.isEncryptionAvailable()) {
        const encrypted = fs.readFileSync(this.keysPath);
        const decrypted = safeStorage.decryptString(encrypted);
        const keys = JSON.parse(decrypted);
        
        this.apiKeys.clear();
        for (const [id, key] of Object.entries(keys)) {
          this.apiKeys.set(id, key as string);
        }
      }
    } catch (error) {
      console.error('[AIHub] Failed to load encrypted keys:', error);
    }
  }

  private async saveEncryptedKeys(): Promise<void> {
    try {
      const keys: Record<string, string> = {};
      for (const [id, key] of this.apiKeys) {
        keys[id] = key;
      }
      
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(keys));
        fs.writeFileSync(this.keysPath, encrypted);
      } else {
        // Fallback: store with basic encoding (not secure, but functional)
        const encoded = Buffer.from(JSON.stringify(keys)).toString('base64');
        fs.writeFileSync(this.keysPath, encoded);
        console.warn('[AIHub] safeStorage not available, using basic encoding');
      }
    } catch (error) {
      console.error('[AIHub] Failed to save encrypted keys:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  async wipeAllData(): Promise<void> {
    this.providers.clear();
    this.apiKeys.clear();
    this.usageLogs = [];
    this.aiEnabled = false;

    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
      if (fs.existsSync(this.keysPath)) {
        fs.unlinkSync(this.keysPath);
      }
    } catch (error) {
      console.error('[AIHub] Failed to wipe data:', error);
    }

    this.emit('data-wiped');
    console.log('[AIHub] All data wiped');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC Handlers
  // ─────────────────────────────────────────────────────────────────────────

  private registerHandlers(): void {
    // Get status
    ipcMain.handle('ai:getStatus', () => ({
      enabled: this.aiEnabled,
      hasProviders: this.providers.size > 0,
      activeProvider: this.getDefaultProvider()?.id || null,
      providers: this.getProviders().map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        enabled: p.enabled,
        hasKey: this.apiKeys.has(p.id),
      })),
    }));

    // Enable/disable AI
    ipcMain.handle('ai:setEnabled', (_, enabled: boolean) => {
      this.setAIEnabled(enabled);
      return enabled;
    });

    // Get providers
    ipcMain.handle('ai:getProviders', () => {
      return this.getProviders().map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        enabled: p.enabled,
        hasKey: this.apiKeys.has(p.id),
        model: p.model,
        endpoint: p.baseUrl,
      }));
    });

    // Add provider (new format from preload)
    ipcMain.handle('ai:addProvider', async (_, providerData: {
      id: string;
      name: string;
      type: AIProviderType;
      apiKey: string;
      model?: string;
      endpoint?: string;
    }) => {
      const result = await this.addProvider(
        providerData.type,
        providerData.name,
        providerData.apiKey,
        { model: providerData.model, baseUrl: providerData.endpoint }
      );
      return result.success;
    });

    // Update provider
    ipcMain.handle('ai:updateProvider', async (_, providerId: string, updates: {
      name?: string;
      apiKey?: string;
      model?: string;
      endpoint?: string;
      enabled?: boolean;
    }) => {
      const provider = this.providers.get(providerId);
      if (!provider) return false;

      if (updates.name) provider.name = updates.name;
      if (updates.model) provider.model = updates.model;
      if (updates.endpoint) provider.baseUrl = updates.endpoint;
      if (updates.enabled !== undefined) provider.enabled = updates.enabled;
      if (updates.apiKey) {
        this.apiKeys.set(providerId, updates.apiKey);
        await this.saveEncryptedKeys();
      }
      
      await this.saveConfig();
      return true;
    });

    // Remove provider
    ipcMain.handle('ai:removeProvider', async (_, providerId: string) => {
      return this.removeProvider(providerId);
    });

    // Set active provider
    ipcMain.handle('ai:setActiveProvider', async (_, providerId: string | null) => {
      if (providerId === null) {
        for (const p of this.providers.values()) {
          p.isDefault = false;
        }
        await this.saveConfig();
        return true;
      }
      return this.setDefaultProvider(providerId);
    });

    // Test provider connection
    ipcMain.handle('ai:testProvider', async (_, providerId: string) => {
      const provider = this.providers.get(providerId);
      if (!provider) return { success: false, message: 'Provider not found' };
      
      const apiKey = this.apiKeys.get(providerId);
      if (!apiKey) return { success: false, message: 'No API key stored' };

      const startTime = Date.now();
      try {
        // Make a minimal test request
        const testResponse = await this.makeTestRequest(provider, apiKey);
        const latency = Date.now() - startTime;
        
        if (testResponse.success) {
          return { success: true, message: 'Connection successful', latency };
        } else {
          return { success: false, message: testResponse.error || 'Test failed' };
        }
      } catch (error: any) {
        return { success: false, message: error.message || 'Connection failed' };
      }
    });

    // Send AI request
    ipcMain.handle('ai:send', async (_, request: {
      prompt: string;
      context?: any;
      maxTokens?: number;
      temperature?: number;
    }) => {
      const result = await this.sendRequest({
        prompt: request.prompt,
        context: request.context,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });
      
      return {
        success: result.success,
        response: result.content,
        error: result.error,
        provider: result.provider,
        tokensUsed: result.tokensUsed,
        latency: result.duration,
      };
    });

    // Stream request with real-time updates
    ipcMain.handle('ai:sendStream', async (_, request: any) => {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store active stream for cancellation
      this.activeStreams.set(streamId, { cancelled: false });
      
      // Start streaming in background
      this.processStreamRequest(streamId, request).catch(err => {
        console.error(`[AIHub] Stream ${streamId} error:`, err);
        this.emitToRenderer('ai:streamError', { streamId, error: err.message });
      });
      
      return streamId;
    });

    // Cancel stream
    ipcMain.handle('ai:cancelStream', async (_, streamId: string) => {
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        stream.cancelled = true;
        this.activeStreams.delete(streamId);
        this.emitToRenderer('ai:streamCancelled', { streamId });
        return true;
      }
      return false;
    });

    // Get usage logs
    ipcMain.handle('ai:getUsageLogs', (_, limit?: number) => {
      const logs = this.getUsageLogs(limit);
      return logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        provider: log.provider,
        prompt: log.scope, // Using scope as prompt summary
        tokensUsed: log.tokensUsed || 0,
        latency: log.latency || 0,
        success: log.success,
      }));
    });

    // Clear usage logs
    ipcMain.handle('ai:clearUsageLogs', () => {
      this.clearUsageLogs();
      return true;
    });

    // Get usage stats
    ipcMain.handle('ai:getUsageStats', () => {
      const logs = this.usageLogs;
      const totalRequests = logs.length;
      const totalTokens = logs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0);
      
      const byProvider: Record<string, { requests: number; tokens: number }> = {};
      for (const log of logs) {
        if (!byProvider[log.provider]) {
          byProvider[log.provider] = { requests: 0, tokens: 0 };
        }
        byProvider[log.provider].requests++;
        byProvider[log.provider].tokens += log.tokensUsed || 0;
      }

      // Calculate average latency from logs that have latency data
      const logsWithLatency = logs.filter(log => typeof log.latency === 'number');
      const avgLatency = logsWithLatency.length > 0
        ? logsWithLatency.reduce((sum, log) => sum + (log.latency || 0), 0) / logsWithLatency.length
        : 0;

      return {
        totalRequests,
        totalTokens,
        avgLatency: Math.round(avgLatency),
        byProvider,
      };
    });

    // Wipe all API keys
    ipcMain.handle('ai:wipeAllKeys', async () => {
      await this.wipeAllData();
      return true;
    });

    // Get context suggestions
    ipcMain.handle('ai:getContextSuggestions', (_, scope: string) => {
      switch (scope) {
        case 'note':
          return [
            'Summarize this note',
            'Suggest improvements',
            'Add headings and structure',
            'Find action items',
          ];
        case 'workflow':
          return [
            'Explain this workflow',
            'Suggest optimizations',
            'Add error handling',
            'Create documentation',
          ];
        case 'search':
          return [
            'Refine my search',
            'Explain these results',
            'Find related items',
            'Summarize findings',
          ];
        case 'file':
          return [
            'Describe these files',
            'Suggest organization',
            'Find duplicates',
            'Generate summary',
          ];
        default:
          return [
            'Help me get started',
            'What can you assist with?',
            'Explain something',
            'Suggest actions',
          ];
      }
    });

    console.log('[AIHub] IPC handlers registered');
  }

  // Make a test request to verify API key works
  private async makeTestRequest(
    provider: AIProviderConfig,
    apiKey: string
  ): Promise<{ success: boolean; error?: string }> {
    const testPrompt = 'Reply with "OK" to confirm the connection works.';
    
    try {
      switch (provider.type) {
        case 'claude': {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: provider.model || 'claude-3-5-sonnet-20241022',
              max_tokens: 10,
              messages: [{ role: 'user', content: testPrompt }],
            }),
          });
          
          if (!response.ok) {
            const error = await response.text();
            return { success: false, error: `API error: ${response.status}` };
          }
          return { success: true };
        }
        
        case 'openai': {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: provider.model || 'gpt-4o',
              max_tokens: 10,
              messages: [{ role: 'user', content: testPrompt }],
            }),
          });
          
          if (!response.ok) {
            return { success: false, error: `API error: ${response.status}` };
          }
          return { success: true };
        }
        
        case 'custom': {
          if (!provider.baseUrl) {
            return { success: false, error: 'No endpoint configured' };
          }
          
          const response = await fetch(provider.baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: provider.model || 'gpt-3.5-turbo',
              max_tokens: 10,
              messages: [{ role: 'user', content: testPrompt }],
            }),
          });
          
          if (!response.ok) {
            return { success: false, error: `API error: ${response.status}` };
          }
          return { success: true };
        }
        
        default:
          return { success: false, error: 'Unknown provider type' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Network error' };
    }
  }
}

// Singleton
export const aiHub = new AIHub();

export function initializeAIHub(mainWindow: BrowserWindow): void {
  aiHub.initialize(mainWindow);
}

export function shutdownAIHub(): void {
  // Clean shutdown if needed
  console.log('[AIHub] Shutdown');
}
