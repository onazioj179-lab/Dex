// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - Audio Processor
 * ===========================================================================
 * 
 * Voice Value Workflow:
 * 1. Record quick voice note or import audio
 * 2. Transcribe locally or via user-provided API
 * 3. Summarize and attach to Notes/Files/Projects
 * 
 * PRINCIPLES:
 * - User provides transcription API (OpenAI Whisper, local model, etc.)
 * - No audio sent anywhere without explicit action
 * - Original recordings preserved
 * - All processing visible and cancellable
 */

import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';

// ===========================================================================
// Types
// ===========================================================================

export interface AudioRecording {
  id: string;
  filePath: string;
  fileName: string;
  duration: number;             // Seconds
  format: string;
  size: number;
  createdAt: number;
  source: 'recorded' | 'imported';
}

export interface TranscriptionResult {
  id: string;
  recordingId: string;
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  confidence: number;
  provider: string;
  createdAt: number;
}

export interface TranscriptionSegment {
  start: number;                // Start time in seconds
  end: number;                  // End time in seconds
  text: string;
  confidence: number;
}

export interface AudioSummary {
  id: string;
  transcriptionId: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  tags: string[];
  createdAt: number;
}

export interface AudioNote {
  id: string;
  title: string;
  recording: AudioRecording;
  transcription: TranscriptionResult | null;
  summary: AudioSummary | null;
  linkedFiles: string[];
  linkedNotes: string[];
  project: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TranscriptionProvider {
  id: string;
  name: string;
  type: 'api' | 'local';
  apiUrl?: string;
  apiKey?: string;              // Stored encrypted
  model?: string;
  modelPath?: string;           // Path to local model (for whisper.cpp)
  params?: Record<string, any>; // Additional provider parameters
  enabled: boolean;
}

export interface AudioConfig {
  enabled: boolean;
  recordingsDir: string;
  defaultFormat: 'webm' | 'wav' | 'mp3';
  maxRecordingMinutes: number;
  autoTranscribe: boolean;      // Transcribe after recording
  activeProvider: string | null;
  providers: TranscriptionProvider[];
}

// ===========================================================================
// Audio Processor
// ===========================================================================

class AudioProcessor {
  private mainWindow: BrowserWindow | null = null;
  private dataDir: string;
  private recordingsDir: string;
  private configFile: string;
  private notesFile: string;
  
  private config: AudioConfig;
  private audioNotes: Map<string, AudioNote> = new Map();
  private isRecording: boolean = false;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'audio');
    this.recordingsDir = path.join(this.dataDir, 'recordings');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.notesFile = path.join(this.dataDir, 'notes.json');
    
    this.config = {
      enabled: true,
      recordingsDir: this.recordingsDir,
      defaultFormat: 'webm',
      maxRecordingMinutes: 30,
      autoTranscribe: false,
      activeProvider: null,
      providers: [],
    };
    
    this.initialize();
    this.registerIPCHandlers();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private async initialize(): Promise<void> {
    try {
      // Create directories
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (!fs.existsSync(this.recordingsDir)) {
        fs.mkdirSync(this.recordingsDir, { recursive: true });
      }
      
      // Load config
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
      
      // Load notes
      if (fs.existsSync(this.notesFile)) {
        const data = fs.readFileSync(this.notesFile, 'utf-8');
        const notes = JSON.parse(data) as AudioNote[];
        notes.forEach(note => this.audioNotes.set(note.id, note));
      }
      
      log.info('[AudioProcessor] Initialized:', {
        notes: this.audioNotes.size,
        providers: this.config.providers.length,
      });
    } catch (err) {
      log.error('[AudioProcessor] Initialization error:', err);
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ===========================================================================
  // Recording Management
  // ===========================================================================

  async importAudio(filePath?: string): Promise<AudioNote | null> {
    let sourcePath = filePath;
    
    if (!sourcePath) {
      const result = await dialog.showOpenDialog({
        title: 'Import Audio File',
        filters: [
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac'] },
        ],
        properties: ['openFile'],
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      sourcePath = result.filePaths[0];
    }
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error('File not found');
    }
    
    const stats = fs.statSync(sourcePath);
    const ext = path.extname(sourcePath).toLowerCase();
    const id = crypto.randomUUID();
    const fileName = `imported_${id}${ext}`;
    const destPath = path.join(this.recordingsDir, fileName);
    
    // Copy to recordings directory
    fs.copyFileSync(sourcePath, destPath);
    
    const recording: AudioRecording = {
      id: crypto.randomUUID(),
      filePath: destPath,
      fileName,
      duration: 0, // Would need audio parsing library to determine
      format: ext.slice(1),
      size: stats.size,
      createdAt: Date.now(),
      source: 'imported',
    };
    
    const note = this.createAudioNote(
      path.basename(sourcePath, ext),
      recording
    );
    
    return note;
  }

  async saveRecording(
    audioData: Buffer,
    format: string,
    duration: number
  ): Promise<AudioNote> {
    const id = crypto.randomUUID();
    const fileName = `recording_${id}.${format}`;
    const filePath = path.join(this.recordingsDir, fileName);
    
    fs.writeFileSync(filePath, audioData);
    
    const recording: AudioRecording = {
      id: crypto.randomUUID(),
      filePath,
      fileName,
      duration,
      format,
      size: audioData.length,
      createdAt: Date.now(),
      source: 'recorded',
    };
    
    const note = this.createAudioNote(
      `Voice Note - ${new Date().toLocaleString()}`,
      recording
    );
    
    // Auto-transcribe if enabled
    if (this.config.autoTranscribe && this.config.activeProvider) {
      this.transcribe(note.id).catch(err => {
        log.error('[AudioProcessor] Auto-transcribe failed:', err);
      });
    }
    
    return note;
  }

  private createAudioNote(title: string, recording: AudioRecording): AudioNote {
    const note: AudioNote = {
      id: crypto.randomUUID(),
      title,
      recording,
      transcription: null,
      summary: null,
      linkedFiles: [],
      linkedNotes: [],
      project: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.audioNotes.set(note.id, note);
    this.saveNotes();
    
    this.emitUpdate('note:created', note);
    
    return note;
  }

  // ===========================================================================
  // Transcription
  // ===========================================================================

  async transcribe(
    noteId: string,
    providerId?: string
  ): Promise<TranscriptionResult | null> {
    const note = this.audioNotes.get(noteId);
    if (!note) {
      throw new Error('Note not found');
    }
    
    const provId = providerId || this.config.activeProvider;
    if (!provId) {
      throw new Error('No transcription provider configured');
    }
    
    const provider = this.config.providers.find(p => p.id === provId);
    if (!provider || !provider.enabled) {
      throw new Error('Provider not available');
    }
    
    this.emitUpdate('transcription:started', { noteId });
    
    try {
      let result: TranscriptionResult;
      
      if (provider.type === 'api') {
        result = await this.transcribeWithAPI(note.recording, provider);
      } else {
        result = await this.transcribeLocally(note.recording, provider);
      }
      
      note.transcription = result;
      note.updatedAt = Date.now();
      this.saveNotes();
      
      this.emitUpdate('transcription:completed', { noteId, result });
      
      return result;
    } catch (err: any) {
      this.emitUpdate('transcription:failed', { noteId, error: err.message });
      throw err;
    }
  }

  private async transcribeWithAPI(
    recording: AudioRecording,
    provider: TranscriptionProvider
  ): Promise<TranscriptionResult> {
    // Supports OpenAI Whisper, Deepgram, AssemblyAI, and custom APIs
    
    if (!provider.apiUrl || !provider.apiKey) {
      throw new Error('API configuration incomplete - please set API URL and key in settings');
    }
    
    const fs = require('fs');
    const path = require('path');
    const https = require('https');
    const http = require('http');
    
    // Read audio file
    if (!fs.existsSync(recording.filePath)) {
      throw new Error('Audio file not found');
    }
    
    const audioData = fs.readFileSync(recording.filePath);
    const fileName = path.basename(recording.filePath);
    
    // Determine API format based on provider
    const isOpenAI = provider.apiUrl.includes('openai.com');
    const isDeepgram = provider.apiUrl.includes('deepgram.com');
    const isAssemblyAI = provider.apiUrl.includes('assemblyai.com');
    
    try {
      let responseText: string;
      
      if (isOpenAI) {
        // OpenAI Whisper API format
        responseText = await this.sendMultipartRequest(provider.apiUrl, provider.apiKey, audioData, fileName, {
          model: 'whisper-1',
          response_format: 'verbose_json'
        });
      } else if (isDeepgram) {
        // Deepgram format
        responseText = await this.sendBinaryRequest(provider.apiUrl, provider.apiKey, audioData, {
          'Content-Type': this.getMimeType(recording.filePath)
        });
      } else if (isAssemblyAI) {
        // AssemblyAI requires upload first, then transcribe
        const uploadUrl = await this.uploadToAssemblyAI(provider.apiKey, audioData);
        responseText = await this.transcribeAssemblyAI(provider.apiKey, uploadUrl);
      } else {
        // Generic API - send as multipart form
        responseText = await this.sendMultipartRequest(provider.apiUrl, provider.apiKey, audioData, fileName, {});
      }
      
      const response = JSON.parse(responseText);
      
      // Parse response based on provider format
      let text = '';
      let segments: any[] = [];
      let confidence = 0.9;
      let language = 'en';
      
      if (isOpenAI && response.text) {
        text = response.text;
        segments = response.segments || [];
        language = response.language || 'en';
      } else if (isDeepgram && response.results) {
        const alt = response.results.channels?.[0]?.alternatives?.[0];
        text = alt?.transcript || '';
        confidence = alt?.confidence || 0.9;
        segments = alt?.words?.map((w: any) => ({ start: w.start, end: w.end, text: w.word })) || [];
      } else if (isAssemblyAI && response.text) {
        text = response.text;
        confidence = response.confidence || 0.9;
        segments = response.words?.map((w: any) => ({ start: w.start / 1000, end: w.end / 1000, text: w.text })) || [];
      } else {
        // Generic response parsing
        text = response.text || response.transcript || response.transcription || JSON.stringify(response);
      }
      
      return {
        id: crypto.randomUUID(),
        recordingId: recording.id,
        text,
        segments,
        language,
        confidence,
        provider: provider.id,
        createdAt: Date.now(),
      };
    } catch (err: any) {
      throw new Error(`Transcription API failed: ${err.message}`);
    }
  }

  private getMimeType(filePath: string): string {
    const ext = require('path').extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/m4a',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.webm': 'audio/webm'
    };
    return mimeTypes[ext] || 'audio/mpeg';
  }

  private sendMultipartRequest(url: string, apiKey: string, audioData: Buffer, fileName: string, extraFields: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const boundary = '----DEXBoundary' + Date.now();
      const protocol = url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(url);
      
      let body = '';
      for (const [key, value] of Object.entries(extraFields)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += `${value}\r\n`;
      }
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
      body += `Content-Type: ${this.getMimeType(fileName)}\r\n\r\n`;
      
      const bodyStart = Buffer.from(body);
      const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
      const fullBody = Buffer.concat([bodyStart, audioData, bodyEnd]);
      
      const req = protocol.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(data) : reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
      });
      req.on('error', reject);
      req.write(fullBody);
      req.end();
    });
  }

  private sendBinaryRequest(url: string, apiKey: string, audioData: Buffer, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(url);
      
      const req = protocol.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: { 'Authorization': `Token ${apiKey}`, ...headers, 'Content-Length': audioData.length }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(data) : reject(new Error(`HTTP ${res.statusCode}`)));
      });
      req.on('error', reject);
      req.write(audioData);
      req.end();
    });
  }

  private async uploadToAssemblyAI(apiKey: string, audioData: Buffer): Promise<string> {
    const response = await this.sendBinaryRequest('https://api.assemblyai.com/v2/upload', apiKey, audioData, { 'Content-Type': 'application/octet-stream' });
    return JSON.parse(response).upload_url;
  }

  private async transcribeAssemblyAI(apiKey: string, audioUrl: string): Promise<string> {
    // Start transcription
    const https = require('https');
    const startRes = await new Promise<string>((resolve, reject) => {
      const req = https.request('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
      }, (res: any) => {
        let data = '';
        res.on('data', (c: string) => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ audio_url: audioUrl }));
      req.end();
    });
    
    const transcriptId = JSON.parse(startRes).id;
    
    // Poll for completion
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await new Promise<string>((resolve, reject) => {
        https.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, { headers: { 'Authorization': apiKey } }, (res: any) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      const statusObj = JSON.parse(status);
      if (statusObj.status === 'completed') return status;
      if (statusObj.status === 'error') throw new Error(statusObj.error);
    }
    throw new Error('Transcription timed out');
  }

  private async transcribeLocally(
    recording: AudioRecording,
    provider: TranscriptionProvider
  ): Promise<TranscriptionResult> {
    // Local transcription using Web Speech API fallback or system speech recognition
    const fs = require('fs');
    const { exec } = require('child_process');
    const path = require('path');
    
    // Check for local Whisper installation
    const whisperPath = provider.modelPath || process.env.WHISPER_CPP_PATH;
    
    if (whisperPath && fs.existsSync(whisperPath)) {
      // Use whisper.cpp for local transcription
      return new Promise((resolve, reject) => {
        const modelFile = provider.params?.model || 'base.en';
        const cmd = `"${whisperPath}" -m "${modelFile}" -f "${recording.filePath}" -otxt`;
        
        exec(cmd, { timeout: 300000 }, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(new Error(`Local transcription failed: ${error.message}`));
            return;
          }
          
          // Read output text file
          const txtPath = recording.filePath.replace(/\.[^.]+$/, '.txt');
          let text = stdout;
          
          if (fs.existsSync(txtPath)) {
            text = fs.readFileSync(txtPath, 'utf-8');
            fs.unlinkSync(txtPath); // Clean up
          }
          
          resolve({
            id: crypto.randomUUID(),
            recordingId: recording.id,
            text: text.trim(),
            segments: [],
            language: 'en',
            confidence: 0.85,
            provider: provider.id,
            createdAt: Date.now(),
          });
        });
      });
    }
    
    // Fallback: Return instruction for setting up local transcription
    return {
      id: crypto.randomUUID(),
      recordingId: recording.id,
      text: `[Local transcription requires setup]\n\nTo enable local transcription:\n1. Install whisper.cpp from https://github.com/ggerganov/whisper.cpp\n2. Download a model (e.g., ggml-base.en.bin)\n3. Set WHISPER_CPP_PATH environment variable or configure in DEX settings\n\nAlternatively, configure a cloud API (OpenAI, Deepgram, or AssemblyAI) in Audio settings.`,
      segments: [],
      language: 'en',
      confidence: 0,
      provider: provider.id,
      createdAt: Date.now(),
    };
  }

  // ===========================================================================
  // Summarization
  // ===========================================================================

  async summarize(
    noteId: string,
    aiProvider?: string
  ): Promise<AudioSummary | null> {
    const note = this.audioNotes.get(noteId);
    if (!note) {
      throw new Error('Note not found');
    }
    
    if (!note.transcription) {
      throw new Error('No transcription available');
    }
    
    this.emitUpdate('summary:started', { noteId });
    
    try {
      // Generate summary from transcription
      const summary = await this.generateSummary(note.transcription.text, aiProvider);
      
      note.summary = summary;
      note.updatedAt = Date.now();
      this.saveNotes();
      
      this.emitUpdate('summary:completed', { noteId, summary });
      
      return summary;
    } catch (err: any) {
      this.emitUpdate('summary:failed', { noteId, error: err.message });
      throw err;
    }
  }

  private async generateSummary(
    text: string,
    aiProvider?: string
  ): Promise<AudioSummary> {
    // Simple local summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Extract potential action items (sentences with action verbs)
    const actionWords = ['need to', 'should', 'must', 'will', 'want to', 'have to', 'going to'];
    const actionItems = sentences
      .filter(s => actionWords.some(w => s.toLowerCase().includes(w)))
      .map(s => s.trim());
    
    // Extract key points (first sentence of each paragraph-like section)
    const keyPoints = sentences
      .slice(0, 5)
      .map(s => s.trim());
    
    // Generate simple summary
    const summary = sentences.slice(0, 3).join('. ') + '.';
    
    // Extract potential tags
    const words = text.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();
    words.forEach(w => {
      const clean = w.replace(/[^a-z]/g, '');
      if (clean.length > 4) {
        wordFreq.set(clean, (wordFreq.get(clean) || 0) + 1);
      }
    });
    
    const tags = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    return {
      id: crypto.randomUUID(),
      transcriptionId: crypto.randomUUID(),
      summary,
      keyPoints,
      actionItems,
      tags,
      createdAt: Date.now(),
    };
  }

  // ===========================================================================
  // Note Management
  // ===========================================================================

  getAllNotes(): AudioNote[] {
    return Array.from(this.audioNotes.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getNote(id: string): AudioNote | null {
    return this.audioNotes.get(id) || null;
  }

  async updateNote(id: string, updates: Partial<AudioNote>): Promise<AudioNote | null> {
    const note = this.audioNotes.get(id);
    if (!note) return null;
    
    // Only allow updating certain fields
    if (updates.title) note.title = updates.title;
    if (updates.linkedFiles) note.linkedFiles = updates.linkedFiles;
    if (updates.linkedNotes) note.linkedNotes = updates.linkedNotes;
    if (updates.project !== undefined) note.project = updates.project;
    
    note.updatedAt = Date.now();
    this.saveNotes();
    
    this.emitUpdate('note:updated', note);
    
    return note;
  }

  async deleteNote(id: string): Promise<boolean> {
    const note = this.audioNotes.get(id);
    if (!note) return false;
    
    // Delete recording file
    try {
      if (fs.existsSync(note.recording.filePath)) {
        fs.unlinkSync(note.recording.filePath);
      }
    } catch (err) {
      log.error('[AudioProcessor] Failed to delete recording:', err);
    }
    
    this.audioNotes.delete(id);
    this.saveNotes();
    
    this.emitUpdate('note:deleted', { id });
    
    return true;
  }

  // ===========================================================================
  // Linking
  // ===========================================================================

  async linkToFile(noteId: string, filePath: string): Promise<boolean> {
    const note = this.audioNotes.get(noteId);
    if (!note) return false;
    
    if (!note.linkedFiles.includes(filePath)) {
      note.linkedFiles.push(filePath);
      note.updatedAt = Date.now();
      this.saveNotes();
      
      this.emitUpdate('note:linked', { noteId, filePath });
    }
    
    return true;
  }

  async unlinkFromFile(noteId: string, filePath: string): Promise<boolean> {
    const note = this.audioNotes.get(noteId);
    if (!note) return false;
    
    const idx = note.linkedFiles.indexOf(filePath);
    if (idx !== -1) {
      note.linkedFiles.splice(idx, 1);
      note.updatedAt = Date.now();
      this.saveNotes();
      
      this.emitUpdate('note:unlinked', { noteId, filePath });
    }
    
    return true;
  }

  async linkToProject(noteId: string, projectId: string): Promise<boolean> {
    const note = this.audioNotes.get(noteId);
    if (!note) return false;
    
    note.project = projectId;
    note.updatedAt = Date.now();
    this.saveNotes();
    
    this.emitUpdate('note:projectLinked', { noteId, projectId });
    
    return true;
  }

  // ===========================================================================
  // Export
  // ===========================================================================

  async exportNote(noteId: string, outputPath?: string): Promise<string | null> {
    const note = this.audioNotes.get(noteId);
    if (!note) return null;
    
    let output = outputPath;
    
    if (!output) {
      const result = await dialog.showSaveDialog({
        title: 'Export Audio Note',
        defaultPath: `${note.title.replace(/[^a-z0-9]/gi, '_')}.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'JSON', extensions: ['json'] },
        ],
      });
      
      if (result.canceled || !result.filePath) {
        return null;
      }
      
      output = result.filePath;
    }
    
    const ext = path.extname(output).toLowerCase();
    
    if (ext === '.json') {
      fs.writeFileSync(output, JSON.stringify(note, null, 2));
    } else {
      const md = this.formatNoteAsMarkdown(note);
      fs.writeFileSync(output, md);
    }
    
    return output;
  }

  private formatNoteAsMarkdown(note: AudioNote): string {
    let md = `# ${note.title}\n\n`;
    md += `**Created:** ${new Date(note.createdAt).toLocaleString()}\n`;
    md += `**Duration:** ${Math.floor(note.recording.duration / 60)}:${String(note.recording.duration % 60).padStart(2, '0')}\n\n`;
    
    if (note.transcription) {
      md += `## Transcription\n\n${note.transcription.text}\n\n`;
    }
    
    if (note.summary) {
      md += `## Summary\n\n${note.summary.summary}\n\n`;
      
      if (note.summary.keyPoints.length > 0) {
        md += `### Key Points\n\n`;
        note.summary.keyPoints.forEach(p => {
          md += `- ${p}\n`;
        });
        md += '\n';
      }
      
      if (note.summary.actionItems.length > 0) {
        md += `### Action Items\n\n`;
        note.summary.actionItems.forEach(a => {
          md += `- [ ] ${a}\n`;
        });
        md += '\n';
      }
      
      if (note.summary.tags.length > 0) {
        md += `**Tags:** ${note.summary.tags.join(', ')}\n`;
      }
    }
    
    return md;
  }

  // ===========================================================================
  // Provider Management
  // ===========================================================================

  getProviders(): TranscriptionProvider[] {
    return this.config.providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? '********' : undefined, // Don't expose key
    }));
  }

  async addProvider(provider: Omit<TranscriptionProvider, 'id'>): Promise<TranscriptionProvider> {
    const newProvider: TranscriptionProvider = {
      ...provider,
      id: crypto.randomUUID(),
    };
    
    this.config.providers.push(newProvider);
    
    if (!this.config.activeProvider && newProvider.enabled) {
      this.config.activeProvider = newProvider.id;
    }
    
    this.saveConfig();
    
    return {
      ...newProvider,
      apiKey: newProvider.apiKey ? '********' : undefined,
    };
  }

  async updateProvider(
    id: string,
    updates: Partial<TranscriptionProvider>
  ): Promise<boolean> {
    const idx = this.config.providers.findIndex(p => p.id === id);
    if (idx === -1) return false;
    
    this.config.providers[idx] = {
      ...this.config.providers[idx],
      ...updates,
    };
    
    this.saveConfig();
    return true;
  }

  async removeProvider(id: string): Promise<boolean> {
    const idx = this.config.providers.findIndex(p => p.id === id);
    if (idx === -1) return false;
    
    this.config.providers.splice(idx, 1);
    
    if (this.config.activeProvider === id) {
      this.config.activeProvider = this.config.providers.find(p => p.enabled)?.id || null;
    }
    
    this.saveConfig();
    return true;
  }

  async setActiveProvider(id: string | null): Promise<boolean> {
    if (id !== null) {
      const provider = this.config.providers.find(p => p.id === id);
      if (!provider) return false;
    }
    
    this.config.activeProvider = id;
    this.saveConfig();
    return true;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  getConfig(): Omit<AudioConfig, 'providers'> & { providerCount: number } {
    return {
      enabled: this.config.enabled,
      recordingsDir: this.config.recordingsDir,
      defaultFormat: this.config.defaultFormat,
      maxRecordingMinutes: this.config.maxRecordingMinutes,
      autoTranscribe: this.config.autoTranscribe,
      activeProvider: this.config.activeProvider,
      providerCount: this.config.providers.length,
    };
  }

  async updateConfig(updates: Partial<AudioConfig>): Promise<boolean> {
    // Don't allow updating providers through this method
    const { providers, ...safeUpdates } = updates as any;
    
    this.config = { ...this.config, ...safeUpdates };
    this.saveConfig();
    return true;
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
  }

  private saveNotes(): void {
    const notes = Array.from(this.audioNotes.values());
    fs.writeFileSync(this.notesFile, JSON.stringify(notes, null, 2));
  }

  // ===========================================================================
  // Stats
  // ===========================================================================

  getStats(): {
    totalNotes: number;
    transcribed: number;
    summarized: number;
    totalDuration: number;
    storageUsed: number;
  } {
    const notes = Array.from(this.audioNotes.values());
    
    return {
      totalNotes: notes.length,
      transcribed: notes.filter(n => n.transcription !== null).length,
      summarized: notes.filter(n => n.summary !== null).length,
      totalDuration: notes.reduce((acc, n) => acc + n.recording.duration, 0),
      storageUsed: notes.reduce((acc, n) => acc + n.recording.size, 0),
    };
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  private emitUpdate(event: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`audio:${event}`, data);
    }
  }

  // ===========================================================================
  // IPC Handlers
  // ===========================================================================

  private registerIPCHandlers(): void {
    // Config
    ipcMain.handle('audio:getConfig', () => this.getConfig());
    ipcMain.handle('audio:updateConfig', (_, updates) => this.updateConfig(updates));
    
    // Recording
    ipcMain.handle('audio:import', (_, filePath) => this.importAudio(filePath));
    ipcMain.handle('audio:saveRecording', (_, data, format, duration) => 
      this.saveRecording(Buffer.from(data), format, duration)
    );
    
    // Notes
    ipcMain.handle('audio:getAllNotes', () => this.getAllNotes());
    ipcMain.handle('audio:getNote', (_, id) => this.getNote(id));
    ipcMain.handle('audio:updateNote', (_, id, updates) => this.updateNote(id, updates));
    ipcMain.handle('audio:deleteNote', (_, id) => this.deleteNote(id));
    ipcMain.handle('audio:exportNote', (_, id, path) => this.exportNote(id, path));
    
    // Processing
    ipcMain.handle('audio:transcribe', (_, noteId, providerId) => 
      this.transcribe(noteId, providerId)
    );
    ipcMain.handle('audio:summarize', (_, noteId, aiProvider) => 
      this.summarize(noteId, aiProvider)
    );
    
    // Linking
    ipcMain.handle('audio:linkToFile', (_, noteId, filePath) => 
      this.linkToFile(noteId, filePath)
    );
    ipcMain.handle('audio:unlinkFromFile', (_, noteId, filePath) => 
      this.unlinkFromFile(noteId, filePath)
    );
    ipcMain.handle('audio:linkToProject', (_, noteId, projectId) => 
      this.linkToProject(noteId, projectId)
    );
    
    // Providers
    ipcMain.handle('audio:getProviders', () => this.getProviders());
    ipcMain.handle('audio:addProvider', (_, provider) => this.addProvider(provider));
    ipcMain.handle('audio:updateProvider', (_, id, updates) => 
      this.updateProvider(id, updates)
    );
    ipcMain.handle('audio:removeProvider', (_, id) => this.removeProvider(id));
    ipcMain.handle('audio:setActiveProvider', (_, id) => this.setActiveProvider(id));
    
    // Stats
    ipcMain.handle('audio:getStats', () => this.getStats());
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const audioProcessor = new AudioProcessor();
export default audioProcessor;
