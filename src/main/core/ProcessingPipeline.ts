/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX - Processing Pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Download → Process → Summarize workflow:
 * 1. User downloads content (file, document, media)
 * 2. Dex detects the new item (with permission)
 * 3. User is prompted to: Organize, Analyze, Summarize
 * 4. Dex processes the content
 * 5. Output is saved as Note, Metadata, or Linked file summary
 * 
 * PRINCIPLES:
 * - Nothing runs automatically without approval
 * - User chooses tools used
 * - Results are editable
 * - Original content untouched
 */

import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessingJob {
  id: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  stages: ProcessingStage[];
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: ProcessingResult | null;
  error: string | null;
}

export interface ProcessingStage {
  id: string;
  name: string;
  type: 'extract' | 'analyze' | 'summarize' | 'organize' | 'transcribe';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;
  result: any;
  error: string | null;
}

export interface ProcessingResult {
  extractedText: string | null;
  summary: string | null;
  keyPoints: string[];
  metadata: {
    wordCount: number;
    language: string;
    contentType: string;
    topics: string[];
  };
  suggestedTags: string[];
  suggestedLocation: string | null;
  transcription: string | null;
}

export interface ProcessingOptions {
  extract: boolean;
  analyze: boolean;
  summarize: boolean;
  organize: boolean;
  transcribe: boolean;
  aiProvider?: string;              // Optional AI for summarization
  outputFormat: 'note' | 'metadata' | 'file';
  outputPath?: string;
}

export interface PipelineConfig {
  enabled: boolean;
  watchDownloads: boolean;          // Watch downloads folder
  autoPrompt: boolean;              // Prompt on new files
  defaultOptions: ProcessingOptions;
  supportedTypes: string[];
  maxFileSizeMB: number;
}

export interface PendingFile {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  detectedAt: number;
  source: 'downloads' | 'manual' | 'drop';
}

// ═══════════════════════════════════════════════════════════════════════════
// Processing Pipeline
// ═══════════════════════════════════════════════════════════════════════════

class ProcessingPipeline {
  private mainWindow: BrowserWindow | null = null;
  private dataDir: string;
  private configFile: string;
  private jobsFile: string;
  
  private config: PipelineConfig;
  private pendingFiles: Map<string, PendingFile> = new Map();
  private activeJobs: Map<string, ProcessingJob> = new Map();
  private completedJobs: ProcessingJob[] = [];
  private downloadWatcher: fs.FSWatcher | null = null;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'pipeline');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.jobsFile = path.join(this.dataDir, 'jobs.json');
    
    this.config = {
      enabled: true,
      watchDownloads: false,          // Disabled by default - requires permission
      autoPrompt: true,
      defaultOptions: {
        extract: true,
        analyze: true,
        summarize: false,             // Requires AI
        organize: false,
        transcribe: false,            // Requires audio
        outputFormat: 'note',
      },
      supportedTypes: [
        '.txt', '.md', '.pdf', '.doc', '.docx',
        '.json', '.csv', '.xml', '.html',
        '.mp3', '.wav', '.m4a', '.ogg',
        '.jpg', '.jpeg', '.png', '.gif',
      ],
      maxFileSizeMB: 100,
    };
    
    this.initialize();
    this.registerIPCHandlers();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  private async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      
      // Load config
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
      
      // Load completed jobs
      if (fs.existsSync(this.jobsFile)) {
        const data = fs.readFileSync(this.jobsFile, 'utf-8');
        this.completedJobs = JSON.parse(data);
        // Keep only last 50 jobs
        if (this.completedJobs.length > 50) {
          this.completedJobs = this.completedJobs.slice(-50);
          this.saveJobs();
        }
      }
      
      // Start downloads watcher if enabled
      if (this.config.watchDownloads) {
        this.startDownloadsWatcher();
      }
      
      console.log('[ProcessingPipeline] Initialized:', {
        watchDownloads: this.config.watchDownloads,
        completedJobs: this.completedJobs.length,
      });
    } catch (err) {
      console.error('[ProcessingPipeline] Initialization error:', err);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // File Detection
  // ═══════════════════════════════════════════════════════════════════════════

  private startDownloadsWatcher(): void {
    const downloadsPath = app.getPath('downloads');
    
    if (this.downloadWatcher) {
      this.downloadWatcher.close();
    }
    
    try {
      this.downloadWatcher = fs.watch(downloadsPath, (eventType, filename) => {
        if (eventType === 'rename' && filename) {
          const fullPath = path.join(downloadsPath, filename);
          
          // Delay to ensure file is fully written
          setTimeout(() => {
            if (fs.existsSync(fullPath)) {
              this.onFileDetected(fullPath, 'downloads');
            }
          }, 1000);
        }
      });
      
      console.log('[ProcessingPipeline] Watching downloads folder');
    } catch (err) {
      console.error('[ProcessingPipeline] Failed to watch downloads:', err);
    }
  }

  private stopDownloadsWatcher(): void {
    if (this.downloadWatcher) {
      this.downloadWatcher.close();
      this.downloadWatcher = null;
    }
  }

  private onFileDetected(filePath: string, source: PendingFile['source']): void {
    const ext = path.extname(filePath).toLowerCase();
    
    // Check if supported type
    if (!this.config.supportedTypes.includes(ext)) {
      return;
    }
    
    // Check file size
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.config.maxFileSizeMB * 1024 * 1024) {
        return;
      }
      
      const pending: PendingFile = {
        id: crypto.randomUUID(),
        path: filePath,
        name: path.basename(filePath),
        type: ext,
        size: stats.size,
        detectedAt: Date.now(),
        source,
      };
      
      this.pendingFiles.set(pending.id, pending);
      
      // Prompt user if enabled
      if (this.config.autoPrompt) {
        this.promptForProcessing(pending);
      }
    } catch (err) {
      console.error('[ProcessingPipeline] File detection error:', err);
    }
  }

  private promptForProcessing(file: PendingFile): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('pipeline:fileDetected', file);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Processing
  // ═══════════════════════════════════════════════════════════════════════════

  async processFile(
    filePath: string,
    options: Partial<ProcessingOptions>
  ): Promise<ProcessingJob> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    const opts: ProcessingOptions = {
      ...this.config.defaultOptions,
      ...options,
    };
    
    // Create job
    const job: ProcessingJob = {
      id: crypto.randomUUID(),
      filePath,
      fileName: path.basename(filePath),
      fileType: ext,
      fileSize: stats.size,
      status: 'pending',
      stages: this.createStages(opts, ext),
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
    };
    
    this.activeJobs.set(job.id, job);
    this.emitJobUpdate(job);
    
    // Execute processing
    try {
      job.status = 'processing';
      job.startedAt = Date.now();
      this.emitJobUpdate(job);
      
      const result: ProcessingResult = {
        extractedText: null,
        summary: null,
        keyPoints: [],
        metadata: {
          wordCount: 0,
          language: 'en',
          contentType: ext,
          topics: [],
        },
        suggestedTags: [],
        suggestedLocation: null,
        transcription: null,
      };
      
      // Execute stages
      for (const stage of job.stages) {
        if (stage.status === 'skipped') continue;
        
        stage.status = 'running';
        this.emitJobUpdate(job);
        
        try {
          await this.executeStage(stage, job, result, opts);
          stage.status = 'completed';
          stage.progress = 100;
        } catch (err: any) {
          stage.status = 'failed';
          stage.error = err.message;
          // Continue with other stages
        }
        
        this.emitJobUpdate(job);
      }
      
      // Save output
      await this.saveOutput(job, result, opts);
      
      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;
      
    } catch (err: any) {
      job.status = 'failed';
      job.completedAt = Date.now();
      job.error = err.message;
    }
    
    // Move to completed
    this.activeJobs.delete(job.id);
    this.completedJobs.push(job);
    this.saveJobs();
    
    this.emitJobUpdate(job);
    
    return job;
  }

  private createStages(options: ProcessingOptions, fileType: string): ProcessingStage[] {
    const stages: ProcessingStage[] = [];
    
    if (options.extract) {
      stages.push({
        id: crypto.randomUUID(),
        name: 'Extract Content',
        type: 'extract',
        status: 'pending',
        progress: 0,
        result: null,
        error: null,
      });
    }
    
    if (options.transcribe && this.isAudioFile(fileType)) {
      stages.push({
        id: crypto.randomUUID(),
        name: 'Transcribe Audio',
        type: 'transcribe',
        status: 'pending',
        progress: 0,
        result: null,
        error: null,
      });
    }
    
    if (options.analyze) {
      stages.push({
        id: crypto.randomUUID(),
        name: 'Analyze Content',
        type: 'analyze',
        status: 'pending',
        progress: 0,
        result: null,
        error: null,
      });
    }
    
    if (options.summarize) {
      stages.push({
        id: crypto.randomUUID(),
        name: 'Generate Summary',
        type: 'summarize',
        status: options.aiProvider ? 'pending' : 'skipped',
        progress: 0,
        result: null,
        error: options.aiProvider ? null : 'No AI provider configured',
      });
    }
    
    if (options.organize) {
      stages.push({
        id: crypto.randomUUID(),
        name: 'Organize File',
        type: 'organize',
        status: 'pending',
        progress: 0,
        result: null,
        error: null,
      });
    }
    
    return stages;
  }

  private async executeStage(
    stage: ProcessingStage,
    job: ProcessingJob,
    result: ProcessingResult,
    options: ProcessingOptions
  ): Promise<void> {
    switch (stage.type) {
      case 'extract':
        result.extractedText = await this.extractContent(job.filePath, job.fileType);
        stage.result = { length: result.extractedText?.length || 0 };
        break;
        
      case 'transcribe':
        result.transcription = await this.transcribeAudio(job.filePath);
        stage.result = { length: result.transcription?.length || 0 };
        break;
        
      case 'analyze':
        const analysis = await this.analyzeContent(
          result.extractedText || result.transcription || ''
        );
        result.metadata = analysis.metadata;
        result.suggestedTags = analysis.suggestedTags;
        result.keyPoints = analysis.keyPoints;
        stage.result = analysis;
        break;
        
      case 'summarize':
        if (options.aiProvider) {
          result.summary = await this.generateSummary(
            result.extractedText || result.transcription || '',
            options.aiProvider
          );
        }
        stage.result = { summary: result.summary };
        break;
        
      case 'organize':
        result.suggestedLocation = await this.suggestLocation(
          job.filePath,
          result.metadata
        );
        stage.result = { suggestedLocation: result.suggestedLocation };
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Content Processing
  // ═══════════════════════════════════════════════════════════════════════════

  private async extractContent(filePath: string, fileType: string): Promise<string> {
    const textTypes = ['.txt', '.md', '.json', '.csv', '.xml', '.html'];
    
    if (textTypes.includes(fileType)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    
    // For other types, return placeholder
    // Real implementation would use libraries like pdf-parse, mammoth, etc.
    return `[Content extraction for ${fileType} files - requires additional processing libraries]`;
  }

  private async transcribeAudio(filePath: string): Promise<string> {
    // Placeholder - real implementation would use whisper or similar
    return `[Audio transcription placeholder for ${path.basename(filePath)}]`;
  }

  private async analyzeContent(text: string): Promise<{
    metadata: ProcessingResult['metadata'];
    suggestedTags: string[];
    keyPoints: string[];
  }> {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    // Simple keyword extraction
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '');
      if (lower.length > 4) {
        wordFreq.set(lower, (wordFreq.get(lower) || 0) + 1);
      }
    }
    
    const sortedWords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    // Extract key sentences (simple heuristic: first sentences of paragraphs)
    const paragraphs = text.split(/\n\n+/);
    const keyPoints = paragraphs
      .slice(0, 5)
      .map(p => {
        const sentences = p.split(/[.!?]+/);
        return sentences[0]?.trim();
      })
      .filter(s => s && s.length > 20)
      .slice(0, 3);
    
    return {
      metadata: {
        wordCount,
        language: 'en', // Could detect language
        contentType: 'text',
        topics: sortedWords.slice(0, 5),
      },
      suggestedTags: sortedWords.slice(0, 5),
      keyPoints,
    };
  }

  private async generateSummary(text: string, aiProvider: string): Promise<string> {
    // This would integrate with the AI system
    // For now, return a simple excerpt
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 3).join('. ') + '.';
  }

  private async suggestLocation(filePath: string, metadata: ProcessingResult['metadata']): Promise<string> {
    // Simple suggestion based on content type
    const docsPath = app.getPath('documents');
    const topics = metadata.topics;
    
    if (topics.length > 0) {
      return path.join(docsPath, 'Processed', topics[0]);
    }
    
    return path.join(docsPath, 'Processed');
  }

  private isAudioFile(fileType: string): boolean {
    return ['.mp3', '.wav', '.m4a', '.ogg', '.flac'].includes(fileType);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Output
  // ═══════════════════════════════════════════════════════════════════════════

  private async saveOutput(
    job: ProcessingJob,
    result: ProcessingResult,
    options: ProcessingOptions
  ): Promise<void> {
    const outputDir = path.join(this.dataDir, 'outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    switch (options.outputFormat) {
      case 'note': {
        const noteContent = this.formatAsNote(job, result);
        const notePath = path.join(outputDir, `${job.id}.md`);
        fs.writeFileSync(notePath, noteContent);
        break;
      }
      
      case 'metadata': {
        const metaPath = path.join(outputDir, `${job.id}.json`);
        fs.writeFileSync(metaPath, JSON.stringify({
          originalFile: job.filePath,
          processedAt: Date.now(),
          result,
        }, null, 2));
        break;
      }
      
      case 'file': {
        if (options.outputPath) {
          const dir = path.dirname(options.outputPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(options.outputPath, JSON.stringify(result, null, 2));
        }
        break;
      }
    }
  }

  private formatAsNote(job: ProcessingJob, result: ProcessingResult): string {
    let note = `# ${job.fileName}\n\n`;
    note += `**Processed:** ${new Date().toLocaleString()}\n`;
    note += `**Original:** ${job.filePath}\n\n`;
    
    if (result.summary) {
      note += `## Summary\n\n${result.summary}\n\n`;
    }
    
    if (result.keyPoints.length > 0) {
      note += `## Key Points\n\n`;
      result.keyPoints.forEach(point => {
        note += `- ${point}\n`;
      });
      note += '\n';
    }
    
    if (result.metadata.topics.length > 0) {
      note += `## Topics\n\n`;
      note += result.metadata.topics.map(t => `\`${t}\``).join(' ') + '\n\n';
    }
    
    if (result.suggestedTags.length > 0) {
      note += `**Tags:** ${result.suggestedTags.join(', ')}\n`;
    }
    
    return note;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Manual Operations
  // ═══════════════════════════════════════════════════════════════════════════

  async selectAndProcess(options?: Partial<ProcessingOptions>): Promise<ProcessingJob | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select File to Process',
      filters: [
        { name: 'All Supported', extensions: this.config.supportedTypes.map(t => t.slice(1)) },
        { name: 'Documents', extensions: ['txt', 'md', 'pdf', 'doc', 'docx'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] },
      ],
      properties: ['openFile'],
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    return this.processFile(result.filePaths[0], options || {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Job Management
  // ═══════════════════════════════════════════════════════════════════════════

  getPendingFiles(): PendingFile[] {
    return Array.from(this.pendingFiles.values());
  }

  dismissPendingFile(id: string): boolean {
    return this.pendingFiles.delete(id);
  }

  getActiveJobs(): ProcessingJob[] {
    return Array.from(this.activeJobs.values());
  }

  getCompletedJobs(limit?: number): ProcessingJob[] {
    const jobs = this.completedJobs.sort((a, b) => b.createdAt - a.createdAt);
    return limit ? jobs.slice(0, limit) : jobs;
  }

  getJob(id: string): ProcessingJob | null {
    return this.activeJobs.get(id) || 
           this.completedJobs.find(j => j.id === id) || 
           null;
  }

  async cancelJob(id: string): Promise<boolean> {
    const job = this.activeJobs.get(id);
    if (!job) return false;
    
    job.status = 'cancelled';
    job.completedAt = Date.now();
    
    this.activeJobs.delete(id);
    this.completedJobs.push(job);
    this.saveJobs();
    
    this.emitJobUpdate(job);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Configuration
  // ═══════════════════════════════════════════════════════════════════════════

  getConfig(): PipelineConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<PipelineConfig>): Promise<boolean> {
    const wasWatching = this.config.watchDownloads;
    this.config = { ...this.config, ...updates };
    
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    
    // Handle downloads watcher
    if (updates.watchDownloads !== undefined) {
      if (!wasWatching && this.config.watchDownloads) {
        this.startDownloadsWatcher();
      } else if (wasWatching && !this.config.watchDownloads) {
        this.stopDownloadsWatcher();
      }
    }
    
    return true;
  }

  private saveJobs(): void {
    fs.writeFileSync(this.jobsFile, JSON.stringify(this.completedJobs, null, 2));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════════════════════════════════════

  private emitJobUpdate(job: ProcessingJob): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('pipeline:jobUpdated', job);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IPC Handlers
  // ═══════════════════════════════════════════════════════════════════════════

  private registerIPCHandlers(): void {
    ipcMain.handle('pipeline:getConfig', () => this.getConfig());
    ipcMain.handle('pipeline:updateConfig', (_, updates) => this.updateConfig(updates));
    
    ipcMain.handle('pipeline:processFile', (_, filePath, options) => 
      this.processFile(filePath, options)
    );
    ipcMain.handle('pipeline:selectAndProcess', (_, options) => 
      this.selectAndProcess(options)
    );
    
    ipcMain.handle('pipeline:getPendingFiles', () => this.getPendingFiles());
    ipcMain.handle('pipeline:dismissPending', (_, id) => this.dismissPendingFile(id));
    
    ipcMain.handle('pipeline:getActiveJobs', () => this.getActiveJobs());
    ipcMain.handle('pipeline:getCompletedJobs', (_, limit) => this.getCompletedJobs(limit));
    ipcMain.handle('pipeline:getJob', (_, id) => this.getJob(id));
    ipcMain.handle('pipeline:cancelJob', (_, id) => this.cancelJob(id));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export const processingPipeline = new ProcessingPipeline();
export default processingPipeline;
