// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX AI/ML Integration (Phase P: Items 886-900)
// Local AI features, intelligent assistance, and model management
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MLModel {
  id: string;
  name: string;
  type: 'classification' | 'detection' | 'generation' | 'embedding' | 'nlp';
  version: string;
  size: number;
  loaded: boolean;
  path?: string;
}

export interface ClassificationResult {
  label: string;
  confidence: number;
}

export interface DetectionResult {
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
}

export interface NLPResult {
  intent?: string;
  entities?: { type: string; value: string; start: number; end: number }[];
  sentiment?: { score: number; label: 'positive' | 'negative' | 'neutral' };
  tokens?: string[];
}

export interface PredictionContext {
  recentActions: string[];
  currentTool: string;
  selectionType?: string;
  timeOfDay: string;
  sessionDuration: number;
}

export interface SmartSuggestion {
  id: string;
  type: 'action' | 'tool' | 'value' | 'content';
  label: string;
  confidence: number;
  data?: unknown;
}

export interface ModelConfig {
  batchSize: number;
  maxTokens: number;
  temperature: number;
  topK: number;
  useGPU: boolean;
}

// ---------------------------------------------------------------------------
// 886-890. Local AI Features
// ---------------------------------------------------------------------------

export class ImageClassifier {
  private model: MLModel | null = null;
  private worker: Worker | null = null;

  // 886. Load Model
  async loadModel(modelPath: string): Promise<boolean> {
    try {
      // In production, this would load a TensorFlow.js or ONNX model
      this.model = {
        id: 'image-classifier',
        name: 'Image Classifier',
        type: 'classification',
        version: '1.0.0',
        size: 25000000,
        loaded: true,
        path: modelPath,
      };
      return true;
    } catch {
      return false;
    }
  }

  // 887. Classify Image
  async classify(imageData: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<ClassificationResult[]> {
    if (!this.model?.loaded) {
      throw new Error('Model not loaded');
    }

    // Simulate classification
    return [
      { label: 'landscape', confidence: 0.85 },
      { label: 'nature', confidence: 0.72 },
      { label: 'outdoor', confidence: 0.68 },
    ];
  }

  // 888. Batch Classify
  async classifyBatch(images: (ImageData | HTMLImageElement)[]): Promise<ClassificationResult[][]> {
    return Promise.all(images.map(img => this.classify(img)));
  }

  isLoaded(): boolean {
    return this.model?.loaded ?? false;
  }

  unload(): void {
    this.model = null;
    this.worker?.terminate();
    this.worker = null;
  }
}

export class ObjectDetector {
  private model: MLModel | null = null;

  // 889. Load Detection Model
  async loadModel(modelPath: string): Promise<boolean> {
    try {
      this.model = {
        id: 'object-detector',
        name: 'Object Detector',
        type: 'detection',
        version: '1.0.0',
        size: 45000000,
        loaded: true,
        path: modelPath,
      };
      return true;
    } catch {
      return false;
    }
  }

  // 890. Detect Objects
  async detect(imageData: ImageData | HTMLImageElement | HTMLCanvasElement): Promise<DetectionResult[]> {
    if (!this.model?.loaded) {
      throw new Error('Model not loaded');
    }

    // Simulate detection
    return [
      { label: 'person', confidence: 0.92, boundingBox: { x: 100, y: 50, width: 200, height: 400 } },
      { label: 'car', confidence: 0.88, boundingBox: { x: 400, y: 200, width: 300, height: 150 } },
    ];
  }

  async detectInRegion(
    imageData: ImageData | HTMLImageElement,
    region: { x: number; y: number; width: number; height: number }
  ): Promise<DetectionResult[]> {
    const results = await this.detect(imageData);
    return results.filter(r => 
      r.boundingBox.x >= region.x &&
      r.boundingBox.y >= region.y &&
      r.boundingBox.x + r.boundingBox.width <= region.x + region.width &&
      r.boundingBox.y + r.boundingBox.height <= region.y + region.height
    );
  }

  isLoaded(): boolean {
    return this.model?.loaded ?? false;
  }

  unload(): void {
    this.model = null;
  }
}

export const imageClassifier = new ImageClassifier();
export const objectDetector = new ObjectDetector();

// ---------------------------------------------------------------------------
// 891-895. Intelligent Assistance
// ---------------------------------------------------------------------------

export class ActionPredictor {
  private history: string[] = [];
  private patterns: Map<string, { next: string; count: number }[]> = new Map();
  private maxHistory = 100;

  // 891. Record Action
  recordAction(action: string): void {
    this.history.push(action);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.updatePatterns(action);
  }

  private updatePatterns(action: string): void {
    if (this.history.length < 2) return;

    const prev = this.history[this.history.length - 2];
    if (!this.patterns.has(prev)) {
      this.patterns.set(prev, []);
    }

    const nextActions = this.patterns.get(prev)!;
    const existing = nextActions.find(n => n.next === action);
    if (existing) {
      existing.count++;
    } else {
      nextActions.push({ next: action, count: 1 });
    }
  }

  // 892. Predict Next Action
  predictNext(currentAction?: string): SmartSuggestion[] {
    const action = currentAction || this.history[this.history.length - 1];
    if (!action) return [];

    const nextActions = this.patterns.get(action);
    if (!nextActions) return [];

    const total = nextActions.reduce((sum, n) => sum + n.count, 0);
    return nextActions
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((n, i) => ({
        id: `pred-${i}`,
        type: 'action' as const,
        label: n.next,
        confidence: n.count / total,
      }));
  }

  // 893. Context-Aware Suggestions
  getSuggestions(context: PredictionContext): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];

    // Tool-based suggestions
    const toolSuggestions = this.getToolSuggestions(context.currentTool);
    suggestions.push(...toolSuggestions);

    // Time-based suggestions
    if (context.sessionDuration > 3600000) { // 1 hour
      suggestions.push({
        id: 'break',
        type: 'action',
        label: 'Take a break',
        confidence: 0.6,
      });
    }

    // Action history suggestions
    const predictions = this.predictNext();
    suggestions.push(...predictions);

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  private getToolSuggestions(tool: string): SmartSuggestion[] {
    const toolHints: Record<string, SmartSuggestion[]> = {
      brush: [
        { id: 'size', type: 'value', label: 'Adjust brush size', confidence: 0.7 },
        { id: 'opacity', type: 'value', label: 'Adjust opacity', confidence: 0.6 },
      ],
      selection: [
        { id: 'feather', type: 'action', label: 'Feather selection', confidence: 0.65 },
        { id: 'invert', type: 'action', label: 'Invert selection', confidence: 0.55 },
      ],
    };
    return toolHints[tool] || [];
  }

  clearHistory(): void {
    this.history = [];
    this.patterns.clear();
  }
}

export class NLPProcessor {
  // 894. Process Natural Language
  async processText(text: string): Promise<NLPResult> {
    // Tokenize
    const tokens = this.tokenize(text);
    
    // Detect intent
    const intent = this.detectIntent(text);
    
    // Extract entities
    const entities = this.extractEntities(text);
    
    // Analyze sentiment
    const sentiment = this.analyzeSentiment(text);

    return { intent, entities, sentiment, tokens };
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
  }

  private detectIntent(text: string): string {
    const lower = text.toLowerCase();
    
    if (lower.includes('create') || lower.includes('new') || lower.includes('add')) {
      return 'create';
    }
    if (lower.includes('delete') || lower.includes('remove')) {
      return 'delete';
    }
    if (lower.includes('edit') || lower.includes('change') || lower.includes('modify')) {
      return 'edit';
    }
    if (lower.includes('find') || lower.includes('search') || lower.includes('look for')) {
      return 'search';
    }
    if (lower.includes('export') || lower.includes('save as')) {
      return 'export';
    }
    if (lower.includes('help') || lower.includes('how to')) {
      return 'help';
    }
    
    return 'unknown';
  }

  private extractEntities(text: string): NLPResult['entities'] {
    const entities: NLPResult['entities'] = [];
    
    // Color detection
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white'];
    colors.forEach(color => {
      const index = text.toLowerCase().indexOf(color);
      if (index !== -1) {
        entities!.push({ type: 'color', value: color, start: index, end: index + color.length });
      }
    });

    // Number detection
    const numberMatch = text.match(/\d+/g);
    numberMatch?.forEach(num => {
      const index = text.indexOf(num);
      entities!.push({ type: 'number', value: num, start: index, end: index + num.length });
    });

    // Tool detection
    const tools = ['brush', 'eraser', 'selection', 'crop', 'text', 'shape'];
    tools.forEach(tool => {
      const index = text.toLowerCase().indexOf(tool);
      if (index !== -1) {
        entities!.push({ type: 'tool', value: tool, start: index, end: index + tool.length });
      }
    });

    return entities;
  }

  private analyzeSentiment(text: string): NLPResult['sentiment'] {
    const lower = text.toLowerCase();
    
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'like', 'best'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible'];
    
    let score = 0;
    positiveWords.forEach(w => { if (lower.includes(w)) score += 0.2; });
    negativeWords.forEach(w => { if (lower.includes(w)) score -= 0.2; });
    
    score = Math.max(-1, Math.min(1, score));
    
    return {
      score,
      label: score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral',
    };
  }

  // 895. Command Parsing
  parseCommand(text: string): { action: string; parameters: Record<string, unknown> } | null {
    const result = {
      action: this.detectIntent(text),
      parameters: {} as Record<string, unknown>,
    };

    const entities = this.extractEntities(text);
    entities?.forEach(e => {
      if (e.type === 'number') {
        result.parameters.value = parseInt(e.value);
      }
      if (e.type === 'color') {
        result.parameters.color = e.value;
      }
      if (e.type === 'tool') {
        result.parameters.tool = e.value;
      }
    });

    return result.action !== 'unknown' ? result : null;
  }
}

export const actionPredictor = new ActionPredictor();
export const nlpProcessor = new NLPProcessor();

// ---------------------------------------------------------------------------
// 896-900. Model Management
// ---------------------------------------------------------------------------

export class ModelManager {
  private models: Map<string, MLModel> = new Map();
  private loadingPromises: Map<string, Promise<boolean>> = new Map();
  private config: ModelConfig = {
    batchSize: 32,
    maxTokens: 512,
    temperature: 0.7,
    topK: 40,
    useGPU: true,
  };

  // 896. Register Model
  registerModel(model: Omit<MLModel, 'loaded'>): void {
    this.models.set(model.id, { ...model, loaded: false });
  }

  // 897. Load Model
  async loadModel(modelId: string): Promise<boolean> {
    const model = this.models.get(modelId);
    if (!model) return false;
    if (model.loaded) return true;

    // Prevent duplicate loading
    if (this.loadingPromises.has(modelId)) {
      return this.loadingPromises.get(modelId)!;
    }

    const loadPromise = this.performLoad(model);
    this.loadingPromises.set(modelId, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(modelId);
    }
  }

  private async performLoad(model: MLModel): Promise<boolean> {
    try {
      // Simulate model loading
      await new Promise(resolve => setTimeout(resolve, 100));
      model.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  // 898. Unload Model
  unloadModel(modelId: string): boolean {
    const model = this.models.get(modelId);
    if (!model) return false;

    model.loaded = false;
    return true;
  }

  // 899. Model Info
  getModel(modelId: string): MLModel | undefined {
    return this.models.get(modelId);
  }

  getLoadedModels(): MLModel[] {
    return Array.from(this.models.values()).filter(m => m.loaded);
  }

  getAllModels(): MLModel[] {
    return Array.from(this.models.values());
  }

  getMemoryUsage(): number {
    return this.getLoadedModels().reduce((sum, m) => sum + m.size, 0);
  }

  // 900. Configuration
  getConfig(): ModelConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  async checkGPUSupport(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    } catch {
      return false;
    }
  }
}

export const modelManager = new ModelManager();

// ---------------------------------------------------------------------------
// Embedding & Similarity
// ---------------------------------------------------------------------------

export class EmbeddingEngine {
  private cache: Map<string, EmbeddingResult> = new Map();

  async embed(text: string): Promise<EmbeddingResult> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    // Simulate embedding generation
    const vector = this.generateMockEmbedding(text);
    const result: EmbeddingResult = {
      vector,
      dimensions: vector.length,
    };

    this.cache.set(text, result);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  async findSimilar(query: string, candidates: string[], topK = 5): Promise<{ text: string; similarity: number }[]> {
    const queryEmbedding = await this.embed(query);
    const candidateEmbeddings = await this.embedBatch(candidates);

    const similarities = candidates.map((text, i) => ({
      text,
      similarity: this.cosineSimilarity(queryEmbedding.vector, candidateEmbeddings[i].vector),
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private generateMockEmbedding(text: string): number[] {
    // Generate deterministic mock embedding based on text
    const vector: number[] = [];
    for (let i = 0; i < 128; i++) {
      const charCode = text.charCodeAt(i % text.length) || 0;
      vector.push(Math.sin(charCode * (i + 1)) * 0.5 + 0.5);
    }
    return vector;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const embeddingEngine = new EmbeddingEngine();

// ---------------------------------------------------------------------------
// Smart Content Generation
// ---------------------------------------------------------------------------

export class ContentGenerator {
  private templates: Map<string, string> = new Map();

  registerTemplate(name: string, template: string): void {
    this.templates.set(name, template);
  }

  async generateFromTemplate(templateName: string, variables: Record<string, string>): Promise<string> {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template not found: ${templateName}`);

    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });

    return result;
  }

  async suggestCompletions(prefix: string, _context?: string): Promise<string[]> {
    // Simulate auto-completion suggestions
    const suggestions = [
      `${prefix}...`,
      `${prefix} and more`,
      `${prefix} with details`,
    ];
    return suggestions;
  }

  async summarize(text: string, maxLength = 100): Promise<string> {
    // Simple extractive summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let summary = '';
    
    for (const sentence of sentences) {
      if (summary.length + sentence.length > maxLength) break;
      summary += sentence.trim() + '. ';
    }

    return summary.trim() || text.slice(0, maxLength);
  }
}

export const contentGenerator = new ContentGenerator();

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

export function useImageClassifier() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (modelPath: string) => {
    setLoading(true);
    const success = await imageClassifier.loadModel(modelPath);
    setLoaded(success);
    setLoading(false);
    return success;
  }, []);

  const classify = useCallback(async (image: ImageData | HTMLImageElement | HTMLCanvasElement) => {
    return imageClassifier.classify(image);
  }, []);

  return { loaded, loading, load, classify };
}

export function useObjectDetector() {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (modelPath: string) => {
    setLoading(true);
    const success = await objectDetector.loadModel(modelPath);
    setLoaded(success);
    setLoading(false);
    return success;
  }, []);

  const detect = useCallback(async (image: ImageData | HTMLImageElement | HTMLCanvasElement) => {
    return objectDetector.detect(image);
  }, []);

  return { loaded, loading, load, detect };
}

export function useActionPrediction() {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);

  const recordAction = useCallback((action: string) => {
    actionPredictor.recordAction(action);
    setSuggestions(actionPredictor.predictNext());
  }, []);

  const getSuggestions = useCallback((context: PredictionContext) => {
    const newSuggestions = actionPredictor.getSuggestions(context);
    setSuggestions(newSuggestions);
    return newSuggestions;
  }, []);

  return { suggestions, recordAction, getSuggestions };
}

export function useNLP() {
  const [processing, setProcessing] = useState(false);

  const process = useCallback(async (text: string) => {
    setProcessing(true);
    try {
      return await nlpProcessor.processText(text);
    } finally {
      setProcessing(false);
    }
  }, []);

  const parseCommand = useCallback((text: string) => {
    return nlpProcessor.parseCommand(text);
  }, []);

  return { processing, process, parseCommand };
}

export function useModelManager() {
  const [models, setModels] = useState<MLModel[]>([]);
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    setModels(modelManager.getAllModels());
    setMemoryUsage(modelManager.getMemoryUsage());
  }, []);

  const loadModel = useCallback(async (modelId: string) => {
    const success = await modelManager.loadModel(modelId);
    setModels(modelManager.getAllModels());
    setMemoryUsage(modelManager.getMemoryUsage());
    return success;
  }, []);

  const unloadModel = useCallback((modelId: string) => {
    modelManager.unloadModel(modelId);
    setModels(modelManager.getAllModels());
    setMemoryUsage(modelManager.getMemoryUsage());
  }, []);

  const registerModel = useCallback((model: Omit<MLModel, 'loaded'>) => {
    modelManager.registerModel(model);
    setModels(modelManager.getAllModels());
  }, []);

  return {
    models,
    memoryUsage,
    loadModel,
    unloadModel,
    registerModel,
    config: modelManager.getConfig(),
    setConfig: modelManager.setConfig.bind(modelManager),
  };
}

export function useEmbeddings() {
  const embed = useCallback(async (text: string) => {
    return embeddingEngine.embed(text);
  }, []);

  const findSimilar = useCallback(async (query: string, candidates: string[], topK?: number) => {
    return embeddingEngine.findSimilar(query, candidates, topK);
  }, []);

  const similarity = useCallback((a: number[], b: number[]) => {
    return embeddingEngine.cosineSimilarity(a, b);
  }, []);

  return { embed, findSimilar, similarity };
}
