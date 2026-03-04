/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMOSION PLUGIN HOST - VST3/AU Plugin Management
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Handles:
 * - VST3/AU plugin hosting with sandboxing
 * - MIDI learn and external hardware integration
 * - Scripting API for automation
 * - Plugin parameter management
 * - Plugin state serialization
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type PluginFormat = 'vst3' | 'au' | 'builtin' | 'clap';

export interface PluginInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: PluginFormat;
  path: string;
  category: PluginCategory;
  isInstrument: boolean;
  inputChannels: number;
  outputChannels: number;
  parameters: PluginParameter[];
  presets: PluginPreset[];
  latency: number;
  tailTime: number;
}

export type PluginCategory = 
  | 'effect' | 'instrument' | 'analyzer' | 'dynamics' | 'eq' 
  | 'filter' | 'reverb' | 'delay' | 'modulation' | 'distortion'
  | 'utility' | 'synth' | 'sampler' | 'drum' | 'other';

export interface PluginParameter {
  id: number;
  name: string;
  label: string;
  unit: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  stepCount: number;
  flags: {
    isAutomatable: boolean;
    isBypassed: boolean;
    isHidden: boolean;
    isReadOnly: boolean;
  };
}

export interface PluginPreset {
  id: string;
  name: string;
  category?: string;
  vendor?: string;
  isFactory: boolean;
  data: Uint8Array;
}

export interface PluginInstance {
  id: string;
  pluginId: string;
  info: PluginInfo;
  state: PluginState;
  parameters: Map<number, number>;
  midiLearn: MidiLearnMapping[];
  bypass: boolean;
  active: boolean;
}

export interface PluginState {
  data: Uint8Array | null;
  presetName: string | null;
  parameterValues: Map<number, number>;
}

export interface MidiLearnMapping {
  parameterId: number;
  channel: number;
  cc: number;
  minValue: number;
  maxValue: number;
}

export interface MidiMessage {
  status: number;
  channel: number;
  data1: number;
  data2: number;
  timestamp: number;
}

export interface PluginScanResult {
  found: number;
  failed: number;
  newPlugins: PluginInfo[];
  errors: { path: string; error: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUGIN SANDBOX - Isolated Plugin Execution
// ═══════════════════════════════════════════════════════════════════════════

class PluginSandbox {
  private processId: string;
  private isActive = false;
  private memoryLimit = 512 * 1024 * 1024; // 512 MB
  private cpuLimit = 50; // 50% CPU
  private lastCrash: Date | null = null;
  private crashCount = 0;
  
  constructor(pluginId: string) {
    this.processId = `sandbox_${pluginId}_${Date.now()}`;
  }
  
  async start(): Promise<void> {
    // In a real implementation, this would spawn a sandboxed subprocess
    this.isActive = true;
    console.log(`[PluginSandbox] Started sandbox: ${this.processId}`);
  }
  
  async stop(): Promise<void> {
    this.isActive = false;
    console.log(`[PluginSandbox] Stopped sandbox: ${this.processId}`);
  }
  
  async processAudio(input: Float32Array[], output: Float32Array[]): Promise<void> {
    if (!this.isActive) return;
    
    // Would send audio to sandboxed process and receive output
    // For now, just copy input to output
    for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
      output[ch].set(input[ch]);
    }
  }
  
  async processMidi(messages: MidiMessage[]): Promise<void> {
    if (!this.isActive) return;
    // Would send MIDI to sandboxed process
  }
  
  async setParameter(id: number, value: number): Promise<void> {
    if (!this.isActive) return;
    // Would send parameter update to sandboxed process
  }
  
  handleCrash(): boolean {
    this.crashCount++;
    this.lastCrash = new Date();
    
    // Allow restart if fewer than 3 crashes in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (this.lastCrash && this.lastCrash < fiveMinutesAgo) {
      this.crashCount = 1;
    }
    
    return this.crashCount < 3;
  }
  
  getStats(): { memory: number; cpu: number; crashes: number } {
    return {
      memory: 0, // Would get actual memory usage
      cpu: 0, // Would get actual CPU usage
      crashes: this.crashCount
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDI LEARN MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class MidiLearnManager extends EventEmitter {
  private isLearning = false;
  private learningTarget: { instanceId: string; parameterId: number } | null = null;
  private mappings: Map<string, MidiLearnMapping[]> = new Map();
  
  startLearning(instanceId: string, parameterId: number): void {
    this.isLearning = true;
    this.learningTarget = { instanceId, parameterId };
    this.emit('learningStarted', { instanceId, parameterId });
  }
  
  stopLearning(): void {
    this.isLearning = false;
    this.learningTarget = null;
    this.emit('learningStopped');
  }
  
  handleMidiInput(message: MidiMessage): MidiLearnMapping | null {
    if (!this.isLearning || !this.learningTarget) return null;
    
    // Only learn from CC messages
    if ((message.status & 0xF0) !== 0xB0) return null;
    
    const mapping: MidiLearnMapping = {
      parameterId: this.learningTarget.parameterId,
      channel: message.channel,
      cc: message.data1,
      minValue: 0,
      maxValue: 1
    };
    
    // Store mapping
    const instanceMappings = this.mappings.get(this.learningTarget.instanceId) || [];
    
    // Remove existing mapping for this parameter
    const filtered = instanceMappings.filter(m => m.parameterId !== mapping.parameterId);
    filtered.push(mapping);
    
    this.mappings.set(this.learningTarget.instanceId, filtered);
    
    this.stopLearning();
    this.emit('mappingCreated', { instanceId: this.learningTarget.instanceId, mapping });
    
    return mapping;
  }
  
  getMappings(instanceId: string): MidiLearnMapping[] {
    return this.mappings.get(instanceId) || [];
  }
  
  removeMapping(instanceId: string, parameterId: number): void {
    const mappings = this.mappings.get(instanceId) || [];
    const filtered = mappings.filter(m => m.parameterId !== parameterId);
    this.mappings.set(instanceId, filtered);
    this.emit('mappingRemoved', { instanceId, parameterId });
  }
  
  clearMappings(instanceId: string): void {
    this.mappings.delete(instanceId);
    this.emit('mappingsCleared', instanceId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILT-IN PLUGINS
// ═══════════════════════════════════════════════════════════════════════════

const BUILTIN_PLUGINS: PluginInfo[] = [
  {
    id: 'builtin:eq',
    name: 'Imosion EQ',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:eq',
    category: 'eq',
    isInstrument: false,
    inputChannels: 2,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Low Gain', label: 'Low', unit: 'dB', minValue: -24, maxValue: 24, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Low Freq', label: 'Low Hz', unit: 'Hz', minValue: 20, maxValue: 500, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Mid Gain', label: 'Mid', unit: 'dB', minValue: -24, maxValue: 24, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Mid Freq', label: 'Mid Hz', unit: 'Hz', minValue: 200, maxValue: 5000, defaultValue: 1000, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'High Gain', label: 'High', unit: 'dB', minValue: -24, maxValue: 24, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 5, name: 'High Freq', label: 'High Hz', unit: 'Hz', minValue: 2000, maxValue: 20000, defaultValue: 8000, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  },
  {
    id: 'builtin:compressor',
    name: 'Imosion Compressor',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:compressor',
    category: 'dynamics',
    isInstrument: false,
    inputChannels: 2,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Threshold', label: 'Thresh', unit: 'dB', minValue: -60, maxValue: 0, defaultValue: -20, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Ratio', label: 'Ratio', unit: ':1', minValue: 1, maxValue: 20, defaultValue: 4, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Attack', label: 'Atk', unit: 'ms', minValue: 0.1, maxValue: 100, defaultValue: 10, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Release', label: 'Rel', unit: 'ms', minValue: 10, maxValue: 1000, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Makeup Gain', label: 'Gain', unit: 'dB', minValue: 0, maxValue: 24, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  },
  {
    id: 'builtin:reverb',
    name: 'Imosion Reverb',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:reverb',
    category: 'reverb',
    isInstrument: false,
    inputChannels: 2,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Room Size', label: 'Size', unit: '%', minValue: 0, maxValue: 100, defaultValue: 50, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Damping', label: 'Damp', unit: '%', minValue: 0, maxValue: 100, defaultValue: 50, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Pre-Delay', label: 'Pre', unit: 'ms', minValue: 0, maxValue: 200, defaultValue: 20, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Decay', label: 'Decay', unit: 's', minValue: 0.1, maxValue: 10, defaultValue: 2, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Mix', label: 'Mix', unit: '%', minValue: 0, maxValue: 100, defaultValue: 30, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 5000 // 5 second tail
  },
  {
    id: 'builtin:delay',
    name: 'Imosion Delay',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:delay',
    category: 'delay',
    isInstrument: false,
    inputChannels: 2,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Time', label: 'Time', unit: 'ms', minValue: 1, maxValue: 2000, defaultValue: 250, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Feedback', label: 'FB', unit: '%', minValue: 0, maxValue: 100, defaultValue: 40, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Ping-Pong', label: 'PP', unit: '%', minValue: 0, maxValue: 100, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'High Cut', label: 'HiCut', unit: 'Hz', minValue: 1000, maxValue: 20000, defaultValue: 8000, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Mix', label: 'Mix', unit: '%', minValue: 0, maxValue: 100, defaultValue: 30, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 2000
  },
  {
    id: 'builtin:distortion',
    name: 'Imosion Distortion',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:distortion',
    category: 'distortion',
    isInstrument: false,
    inputChannels: 2,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Drive', label: 'Drive', unit: '%', minValue: 0, maxValue: 100, defaultValue: 50, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Tone', label: 'Tone', unit: '%', minValue: 0, maxValue: 100, defaultValue: 50, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Output', label: 'Out', unit: 'dB', minValue: -24, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Mix', label: 'Mix', unit: '%', minValue: 0, maxValue: 100, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  },
  {
    id: 'builtin:synth',
    name: 'Imosion Synth',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:synth',
    category: 'synth',
    isInstrument: true,
    inputChannels: 0,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Osc 1 Wave', label: 'Osc1', unit: '', minValue: 0, maxValue: 3, defaultValue: 0, stepCount: 4, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Osc 2 Wave', label: 'Osc2', unit: '', minValue: 0, maxValue: 3, defaultValue: 1, stepCount: 4, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Osc Mix', label: 'Mix', unit: '%', minValue: 0, maxValue: 100, defaultValue: 50, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Filter Cutoff', label: 'Cutoff', unit: 'Hz', minValue: 20, maxValue: 20000, defaultValue: 5000, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Filter Resonance', label: 'Res', unit: '%', minValue: 0, maxValue: 100, defaultValue: 20, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 5, name: 'Attack', label: 'Atk', unit: 'ms', minValue: 1, maxValue: 5000, defaultValue: 10, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 6, name: 'Decay', label: 'Dec', unit: 'ms', minValue: 1, maxValue: 5000, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 7, name: 'Sustain', label: 'Sus', unit: '%', minValue: 0, maxValue: 100, defaultValue: 70, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 8, name: 'Release', label: 'Rel', unit: 'ms', minValue: 1, maxValue: 10000, defaultValue: 200, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  },
  {
    id: 'builtin:sampler',
    name: 'Imosion Sampler',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:sampler',
    category: 'sampler',
    isInstrument: true,
    inputChannels: 0,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Root Key', label: 'Root', unit: '', minValue: 0, maxValue: 127, defaultValue: 60, stepCount: 128, flags: { isAutomatable: false, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Start', label: 'Start', unit: '%', minValue: 0, maxValue: 100, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'End', label: 'End', unit: '%', minValue: 0, maxValue: 100, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Loop', label: 'Loop', unit: '', minValue: 0, maxValue: 1, defaultValue: 0, stepCount: 2, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Attack', label: 'Atk', unit: 'ms', minValue: 0, maxValue: 5000, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 5, name: 'Release', label: 'Rel', unit: 'ms', minValue: 0, maxValue: 10000, defaultValue: 100, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  },
  {
    id: 'builtin:drums',
    name: 'Imosion Drums',
    vendor: 'Imosion',
    version: '1.0.0',
    format: 'builtin',
    path: 'builtin:drums',
    category: 'drum',
    isInstrument: true,
    inputChannels: 0,
    outputChannels: 2,
    parameters: [
      { id: 0, name: 'Kick Level', label: 'Kick', unit: 'dB', minValue: -60, maxValue: 6, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 1, name: 'Snare Level', label: 'Snare', unit: 'dB', minValue: -60, maxValue: 6, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 2, name: 'Hi-Hat Level', label: 'HH', unit: 'dB', minValue: -60, maxValue: 6, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 3, name: 'Tom Level', label: 'Tom', unit: 'dB', minValue: -60, maxValue: 6, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 4, name: 'Cymbal Level', label: 'Cym', unit: 'dB', minValue: -60, maxValue: 6, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
      { id: 5, name: 'Tune', label: 'Tune', unit: 'st', minValue: -12, maxValue: 12, defaultValue: 0, stepCount: 0, flags: { isAutomatable: true, isBypassed: false, isHidden: false, isReadOnly: false } },
    ],
    presets: [],
    latency: 0,
    tailTime: 0
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PLUGIN HOST CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ImosionPluginHost extends EventEmitter {
  private pluginRegistry: Map<string, PluginInfo> = new Map();
  private instances: Map<string, PluginInstance> = new Map();
  private sandboxes: Map<string, PluginSandbox> = new Map();
  private midiLearn: MidiLearnManager;
  
  private pluginPaths: string[] = [];
  private isScanning = false;
  private lastScanTime: Date | null = null;
  
  constructor() {
    super();
    
    this.midiLearn = new MidiLearnManager();
    
    // Register built-in plugins
    for (const plugin of BUILTIN_PLUGINS) {
      this.pluginRegistry.set(plugin.id, plugin);
    }
    
    // Setup default plugin paths
    this.setupDefaultPluginPaths();
    
    console.log('[ImosionPluginHost] Initialized with', BUILTIN_PLUGINS.length, 'built-in plugins');
  }
  
  private setupDefaultPluginPaths(): void {
    const platform = process.platform;
    
    if (platform === 'win32') {
      this.pluginPaths = [
        'C:\\Program Files\\Common Files\\VST3',
        'C:\\Program Files (x86)\\Common Files\\VST3',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Common', 'VST3')
      ];
    } else if (platform === 'darwin') {
      this.pluginPaths = [
        '/Library/Audio/Plug-Ins/VST3',
        '/Library/Audio/Plug-Ins/Components',
        path.join(process.env.HOME || '', 'Library/Audio/Plug-Ins/VST3'),
        path.join(process.env.HOME || '', 'Library/Audio/Plug-Ins/Components')
      ];
    } else {
      this.pluginPaths = [
        '/usr/lib/vst3',
        '/usr/local/lib/vst3',
        path.join(process.env.HOME || '', '.vst3')
      ];
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Plugin Scanning
  // ─────────────────────────────────────────────────────────────────────────
  
  async scanPlugins(): Promise<PluginScanResult> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }
    
    this.isScanning = true;
    this.emit('scanStarted');
    
    const result: PluginScanResult = {
      found: BUILTIN_PLUGINS.length,
      failed: 0,
      newPlugins: [],
      errors: []
    };
    
    try {
      for (const pluginPath of this.pluginPaths) {
        try {
          if (fs.existsSync(pluginPath)) {
            await this.scanDirectory(pluginPath, result);
          }
        } catch (error: any) {
          result.errors.push({ path: pluginPath, error: error?.message || 'Unknown error' });
        }
      }
      
      this.lastScanTime = new Date();
      this.emit('scanCompleted', result);
    } finally {
      this.isScanning = false;
    }
    
    return result;
  }
  
  private async scanDirectory(dirPath: string, result: PluginScanResult): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if it's a VST3 bundle
          if (entry.name.endsWith('.vst3')) {
            await this.scanPlugin(fullPath, 'vst3', result);
          } else if (entry.name.endsWith('.component')) {
            await this.scanPlugin(fullPath, 'au', result);
          } else {
            // Recurse into subdirectory
            await this.scanDirectory(fullPath, result);
          }
        }
      }
    } catch (error: any) {
      result.errors.push({ path: dirPath, error: error?.message || 'Unknown error' });
    }
  }
  
  private async scanPlugin(pluginPath: string, format: PluginFormat, result: PluginScanResult): Promise<void> {
    try {
      // In a real implementation, this would load and validate the plugin
      const pluginName = path.basename(pluginPath, path.extname(pluginPath));
      const pluginId = `${format}:${pluginName}`;
      
      if (!this.pluginRegistry.has(pluginId)) {
        const pluginInfo: PluginInfo = {
          id: pluginId,
          name: pluginName,
          vendor: 'Unknown',
          version: '1.0.0',
          format,
          path: pluginPath,
          category: 'other',
          isInstrument: false,
          inputChannels: 2,
          outputChannels: 2,
          parameters: [],
          presets: [],
          latency: 0,
          tailTime: 0
        };
        
        this.pluginRegistry.set(pluginId, pluginInfo);
        result.newPlugins.push(pluginInfo);
      }
      
      result.found++;
    } catch (error: any) {
      result.failed++;
      result.errors.push({ path: pluginPath, error: error?.message || 'Unknown error' });
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Plugin Instance Management
  // ─────────────────────────────────────────────────────────────────────────
  
  async createInstance(pluginId: string): Promise<PluginInstance> {
    const pluginInfo = this.pluginRegistry.get(pluginId);
    if (!pluginInfo) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const instance: PluginInstance = {
      id: instanceId,
      pluginId,
      info: pluginInfo,
      state: {
        data: null,
        presetName: null,
        parameterValues: new Map()
      },
      parameters: new Map(),
      midiLearn: [],
      bypass: false,
      active: true
    };
    
    // Initialize parameters with defaults
    for (const param of pluginInfo.parameters) {
      instance.parameters.set(param.id, param.defaultValue);
    }
    
    // Create sandbox for external plugins
    if (pluginInfo.format !== 'builtin') {
      const sandbox = new PluginSandbox(instanceId);
      await sandbox.start();
      this.sandboxes.set(instanceId, sandbox);
    }
    
    this.instances.set(instanceId, instance);
    this.emit('instanceCreated', instance);
    
    return instance;
  }
  
  async destroyInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    // Stop sandbox
    const sandbox = this.sandboxes.get(instanceId);
    if (sandbox) {
      await sandbox.stop();
      this.sandboxes.delete(instanceId);
    }
    
    // Clear MIDI learn mappings
    this.midiLearn.clearMappings(instanceId);
    
    this.instances.delete(instanceId);
    this.emit('instanceDestroyed', instanceId);
  }
  
  getInstance(instanceId: string): PluginInstance | undefined {
    return this.instances.get(instanceId);
  }
  
  getAllInstances(): PluginInstance[] {
    return Array.from(this.instances.values());
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Parameter Control
  // ─────────────────────────────────────────────────────────────────────────
  
  setParameter(instanceId: string, parameterId: number, value: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    const param = instance.info.parameters.find(p => p.id === parameterId);
    if (!param) return;
    
    // Clamp value to valid range
    const clampedValue = Math.max(param.minValue, Math.min(param.maxValue, value));
    instance.parameters.set(parameterId, clampedValue);
    
    // Update sandbox if applicable
    const sandbox = this.sandboxes.get(instanceId);
    if (sandbox) {
      sandbox.setParameter(parameterId, clampedValue);
    }
    
    this.emit('parameterChanged', { instanceId, parameterId, value: clampedValue });
  }
  
  getParameter(instanceId: string, parameterId: number): number | undefined {
    const instance = this.instances.get(instanceId);
    return instance?.parameters.get(parameterId);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────
  
  async saveState(instanceId: string): Promise<Uint8Array> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }
    
    // Serialize parameters
    const state = {
      pluginId: instance.pluginId,
      parameters: Object.fromEntries(instance.parameters),
      bypass: instance.bypass,
      midiLearn: instance.midiLearn
    };
    
    const stateJson = JSON.stringify(state);
    const encoder = new TextEncoder();
    return encoder.encode(stateJson);
  }
  
  async loadState(instanceId: string, data: Uint8Array): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error('Instance not found');
    }
    
    try {
      const decoder = new TextDecoder();
      const stateJson = decoder.decode(data);
      const state = JSON.parse(stateJson);
      
      // Restore parameters
      for (const [paramId, value] of Object.entries(state.parameters)) {
        this.setParameter(instanceId, parseInt(paramId), value as number);
      }
      
      instance.bypass = state.bypass || false;
      instance.midiLearn = state.midiLearn || [];
      
      this.emit('stateLoaded', instanceId);
    } catch (error) {
      console.error('[ImosionPluginHost] Failed to load state:', error);
      throw error;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // MIDI Learn
  // ─────────────────────────────────────────────────────────────────────────
  
  startMidiLearn(instanceId: string, parameterId: number): void {
    this.midiLearn.startLearning(instanceId, parameterId);
  }
  
  stopMidiLearn(): void {
    this.midiLearn.stopLearning();
  }
  
  handleMidiInput(message: MidiMessage): void {
    const mapping = this.midiLearn.handleMidiInput(message);
    
    if (mapping) return; // Learning mode handled it
    
    // Apply learned mappings
    for (const instance of this.instances.values()) {
      const mappings = this.midiLearn.getMappings(instance.id);
      
      for (const m of mappings) {
        if (m.channel === message.channel && m.cc === message.data1) {
          // Map CC value (0-127) to parameter range
          const normalizedValue = message.data2 / 127;
          const value = m.minValue + normalizedValue * (m.maxValue - m.minValue);
          this.setParameter(instance.id, m.parameterId, value);
        }
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Audio Processing
  // ─────────────────────────────────────────────────────────────────────────
  
  async processAudio(instanceId: string, input: Float32Array[], output: Float32Array[]): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.bypass) {
      // Pass through when bypassed
      for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
        output[ch].set(input[ch]);
      }
      return;
    }
    
    const sandbox = this.sandboxes.get(instanceId);
    if (sandbox) {
      await sandbox.processAudio(input, output);
    } else {
      // Built-in plugin processing
      await this.processBuiltinPlugin(instance, input, output);
    }
  }
  
  private async processBuiltinPlugin(instance: PluginInstance, input: Float32Array[], output: Float32Array[]): Promise<void> {
    // Simple pass-through for now - real implementation would have actual DSP
    for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
      output[ch].set(input[ch]);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Plugin Registry
  // ─────────────────────────────────────────────────────────────────────────
  
  getAvailablePlugins(): PluginInfo[] {
    return Array.from(this.pluginRegistry.values());
  }
  
  getPluginsByCategory(category: PluginCategory): PluginInfo[] {
    return this.getAvailablePlugins().filter(p => p.category === category);
  }
  
  getInstruments(): PluginInfo[] {
    return this.getAvailablePlugins().filter(p => p.isInstrument);
  }
  
  getEffects(): PluginInfo[] {
    return this.getAvailablePlugins().filter(p => !p.isInstrument);
  }
  
  getPluginInfo(pluginId: string): PluginInfo | undefined {
    return this.pluginRegistry.get(pluginId);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  
  async dispose(): Promise<void> {
    // Destroy all instances
    for (const instanceId of this.instances.keys()) {
      await this.destroyInstance(instanceId);
    }
    
    this.pluginRegistry.clear();
    this.removeAllListeners();
    console.log('[ImosionPluginHost] Disposed');
  }
}

// Export singleton
let pluginHostInstance: ImosionPluginHost | null = null;

export function getPluginHost(): ImosionPluginHost {
  if (!pluginHostInstance) {
    pluginHostInstance = new ImosionPluginHost();
  }
  return pluginHostInstance;
}

export default ImosionPluginHost;
