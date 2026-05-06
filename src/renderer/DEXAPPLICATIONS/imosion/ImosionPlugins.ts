// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - IMOSION Plugins System
// Professional audio plugins rivaling Waves/FabFilter/Native Instruments
// Items 376-400 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface PluginInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
  type: 'effect' | 'instrument' | 'analyzer' | 'utility';
  category: PluginCategory;
  format: 'builtin' | 'wasm' | 'worklet';
  inputs: number;
  outputs: number;
  sidechain: boolean;
  presets: string[];
}

export type PluginCategory = 
  | 'eq' | 'dynamics' | 'reverb' | 'delay' | 'modulation'
  | 'distortion' | 'filter' | 'utility' | 'analyzer'
  | 'synth' | 'sampler' | 'drums' | 'bass' | 'keys' | 'strings' | 'pads';

export interface PluginInstance {
  id: string;
  info: PluginInfo;
  parameters: Map<string, PluginParameter>;
  state: PluginState;
  audioNode?: AudioNode | AudioWorkletNode;
  processor?: AudioProcessor;
}

export interface PluginParameter {
  id: string;
  name: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  unit: string;
  steps?: number;       // For discrete parameters
  curve: 'linear' | 'log' | 'exp' | 'discrete';
  automatable: boolean;
}

export interface PluginState {
  bypassed: boolean;
  wet: number;
  preset?: string;
  customState?: Record<string, unknown>;
}

export interface AudioProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Map<string, number>): void;
  reset(): void;
}

// Synth Types
export interface OscillatorConfig {
  type: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise' | 'wavetable';
  detune: number;       // cents
  octave: number;       // -2 to +2
  semitone: number;     // -12 to +12
  phase: number;        // 0-360
  level: number;        // 0-100
  pan: number;          // -100 to 100
  wavetable?: Float32Array;
  wavetablePosition?: number;
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass' | 'lowshelf' | 'highshelf' | 'peak';
  frequency: number;    // Hz
  resonance: number;    // Q
  drive: number;        // 0-100
  keyTracking: number;  // 0-100
}

export interface EnvelopeConfig {
  attack: number;       // seconds
  decay: number;        // seconds
  sustain: number;      // 0-1
  release: number;      // seconds
  attackCurve: number;  // -100 to 100 (curve shape)
  decayCurve: number;
  releaseCurve: number;
}

export interface LFOConfig {
  type: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'random' | 'sample-hold';
  rate: number;         // Hz or sync division
  sync: boolean;
  amount: number;       // -100 to 100
  phase: number;        // 0-360
  target: string;       // Parameter ID to modulate
}

export interface ModulationMatrix {
  sources: ModSource[];
  destinations: ModDestination[];
  routings: ModRouting[];
}

export interface ModSource {
  id: string;
  name: string;
  bipolar: boolean;
}

export interface ModDestination {
  id: string;
  name: string;
  range: { min: number; max: number };
}

export interface ModRouting {
  source: string;
  destination: string;
  amount: number;
  via?: string;         // Secondary modulator
  viaAmount?: number;
}

// Sampler Types
export interface SamplerZone {
  id: string;
  sampleUrl: string;
  sampleData?: AudioBuffer;
  rootNote: number;
  keyLow: number;
  keyHigh: number;
  velocityLow: number;
  velocityHigh: number;
  tune: number;
  pan: number;
  volume: number;
  loop: { enabled: boolean; start: number; end: number; crossfade: number };
  envelope: EnvelopeConfig;
}

// =============================================================================
// ITEM 376: PLUGIN MANAGER
// =============================================================================

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private instances: Map<string, PluginInstance> = new Map();
  private audioContext: AudioContext | null = null;
  private workletRegistered: boolean = false;
  
  constructor() {
    this.registerBuiltinPlugins();
  }
  
  async initialize(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;
    
    if (!this.workletRegistered) {
      await this.registerWorklets();
      this.workletRegistered = true;
    }
  }
  
  private registerBuiltinPlugins(): void {
    // EQ Plugins
    this.registerPlugin({
      id: 'imosion-eq8',
      name: 'EQ-8',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'eq',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Flat', 'Vocal Presence', 'Bass Boost', 'High Cut', 'Telephone']
    });
    
    // Dynamics
    this.registerPlugin({
      id: 'imosion-compressor',
      name: 'Compressor',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'dynamics',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: true,
      presets: ['Gentle', 'Punchy', 'Limiting', 'Parallel', 'Vocal']
    });
    
    this.registerPlugin({
      id: 'imosion-limiter',
      name: 'Limiter',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'dynamics',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Transparent', 'Loud', 'Broadcast', 'Master']
    });
    
    // Reverbs
    this.registerPlugin({
      id: 'imosion-reverb',
      name: 'Reverb',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'reverb',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Small Room', 'Large Hall', 'Plate', 'Chamber', 'Cathedral', 'Ambient']
    });
    
    this.registerPlugin({
      id: 'imosion-convolver',
      name: 'Convolution Reverb',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'reverb',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: []
    });
    
    // Delays
    this.registerPlugin({
      id: 'imosion-delay',
      name: 'Delay',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'delay',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Slapback', 'Stereo', 'Ping Pong', 'Tape', 'Dub']
    });
    
    // Modulation
    this.registerPlugin({
      id: 'imosion-chorus',
      name: 'Chorus',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'modulation',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Classic', 'Wide', 'Ensemble', 'Subtle']
    });
    
    this.registerPlugin({
      id: 'imosion-phaser',
      name: 'Phaser',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'modulation',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Classic', 'Deep', 'Subtle', 'Psychedelic']
    });
    
    this.registerPlugin({
      id: 'imosion-flanger',
      name: 'Flanger',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'modulation',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Jet', 'Subtle', 'Metallic', 'Through Zero']
    });
    
    // Distortion
    this.registerPlugin({
      id: 'imosion-saturator',
      name: 'Saturator',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'distortion',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Warm', 'Tape', 'Tube', 'Transistor', 'Digital Clip']
    });
    
    // Filters
    this.registerPlugin({
      id: 'imosion-filter',
      name: 'Filter',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'effect',
      category: 'filter',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: ['Lowpass', 'Highpass', 'Bandpass', 'Notch', 'Formant']
    });
    
    // Utility
    this.registerPlugin({
      id: 'imosion-utility',
      name: 'Utility',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'utility',
      category: 'utility',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: []
    });
    
    // Analyzers
    this.registerPlugin({
      id: 'imosion-spectrum',
      name: 'Spectrum Analyzer',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'analyzer',
      category: 'analyzer',
      format: 'builtin',
      inputs: 2,
      outputs: 2,
      sidechain: false,
      presets: []
    });
    
    // Instruments
    this.registerPlugin({
      id: 'imosion-synth',
      name: 'IMOSION Synth',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'instrument',
      category: 'synth',
      format: 'builtin',
      inputs: 0,
      outputs: 2,
      sidechain: false,
      presets: ['Init', 'Classic Saw', 'Fat Bass', 'Pad', 'Lead', 'Pluck', 'Keys']
    });
    
    this.registerPlugin({
      id: 'imosion-sampler',
      name: 'IMOSION Sampler',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'instrument',
      category: 'sampler',
      format: 'builtin',
      inputs: 0,
      outputs: 2,
      sidechain: false,
      presets: []
    });
    
    this.registerPlugin({
      id: 'imosion-drums',
      name: 'IMOSION Drums',
      vendor: 'IMOSION',
      version: '1.0.0',
      type: 'instrument',
      category: 'drums',
      format: 'builtin',
      inputs: 0,
      outputs: 2,
      sidechain: false,
      presets: ['808 Kit', '909 Kit', 'Acoustic Kit', 'Lo-Fi Kit', 'Electronic Kit']
    });
  }
  
  private registerPlugin(info: PluginInfo): void {
    this.plugins.set(info.id, info);
  }
  
  private async registerWorklets(): Promise<void> {
    if (!this.audioContext) return;
    
    // Register custom audio worklet processors
    const workletCode = `
      // Saturation processor
      class SaturatorProcessor extends AudioWorkletProcessor {
        static get parameterDescriptors() {
          return [
            { name: 'drive', defaultValue: 1, minValue: 0, maxValue: 10 },
            { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1 }
          ];
        }
        
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          const output = outputs[0];
          
          if (!input || !input[0]) return true;
          
          const drive = parameters.drive.length > 1 ? parameters.drive : [parameters.drive[0]];
          const mix = parameters.mix.length > 1 ? parameters.mix : [parameters.mix[0]];
          
          for (let ch = 0; ch < output.length; ch++) {
            for (let i = 0; i < output[ch].length; i++) {
              const d = drive[i] || drive[0];
              const m = mix[i] || mix[0];
              const dry = input[ch][i];
              const wet = Math.tanh(dry * d) / Math.tanh(d);
              output[ch][i] = dry * (1 - m) + wet * m;
            }
          }
          
          return true;
        }
      }
      
      registerProcessor('saturator-processor', SaturatorProcessor);
      
      // Chorus processor
      class ChorusProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferSize = 4096;
          this.buffer = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
          this.writeIndex = 0;
          this.phase = 0;
        }
        
        static get parameterDescriptors() {
          return [
            { name: 'rate', defaultValue: 0.5, minValue: 0.01, maxValue: 10 },
            { name: 'depth', defaultValue: 0.002, minValue: 0, maxValue: 0.02 },
            { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1 }
          ];
        }
        
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          const output = outputs[0];
          
          if (!input || !input[0]) return true;
          
          const rate = parameters.rate[0];
          const depth = parameters.depth[0];
          const mix = parameters.mix[0];
          
          for (let ch = 0; ch < output.length; ch++) {
            for (let i = 0; i < output[ch].length; i++) {
              // Write to buffer
              this.buffer[ch][this.writeIndex] = input[ch][i];
              
              // Calculate modulated delay
              const lfo = Math.sin(this.phase * 2 * Math.PI);
              const delay = depth * sampleRate * (1 + lfo);
              const readIndex = (this.writeIndex - delay + this.bufferSize) % this.bufferSize;
              
              // Linear interpolation
              const readIndexFloor = Math.floor(readIndex);
              const frac = readIndex - readIndexFloor;
              const a = this.buffer[ch][readIndexFloor % this.bufferSize];
              const b = this.buffer[ch][(readIndexFloor + 1) % this.bufferSize];
              const wet = a + (b - a) * frac;
              
              output[ch][i] = input[ch][i] * (1 - mix) + wet * mix;
            }
            
            this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
            this.phase += rate / sampleRate;
            if (this.phase >= 1) this.phase -= 1;
          }
          
          return true;
        }
      }
      
      registerProcessor('chorus-processor', ChorusProcessor);
    `;
    
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    try {
      await this.audioContext.audioWorklet.addModule(url);
    } catch (e) {
      console.warn('Failed to register worklets:', e);
    }
    
    URL.revokeObjectURL(url);
  }
  
  // =============================================================================
  // ITEM 377-380: PLUGIN INSTANTIATION
  // =============================================================================
  
  getAvailablePlugins(category?: PluginCategory): PluginInfo[] {
    const plugins = Array.from(this.plugins.values());
    return category ? plugins.filter(p => p.category === category) : plugins;
  }
  
  createInstance(pluginId: string): PluginInstance | null {
    const info = this.plugins.get(pluginId);
    if (!info) return null;
    
    const instance: PluginInstance = {
      id: this.generateId(),
      info,
      parameters: this.createDefaultParameters(pluginId),
      state: {
        bypassed: false,
        wet: 100
      }
    };
    
    this.instances.set(instance.id, instance);
    this.createAudioNode(instance);
    
    return instance;
  }
  
  private createDefaultParameters(pluginId: string): Map<string, PluginParameter> {
    const params = new Map<string, PluginParameter>();
    
    // Define parameters based on plugin type
    switch (pluginId) {
      case 'imosion-compressor':
        params.set('threshold', { id: 'threshold', name: 'Threshold', value: -20, defaultValue: -20, min: -60, max: 0, unit: 'dB', curve: 'linear', automatable: true });
        params.set('ratio', { id: 'ratio', name: 'Ratio', value: 4, defaultValue: 4, min: 1, max: 20, unit: ':1', curve: 'log', automatable: true });
        params.set('attack', { id: 'attack', name: 'Attack', value: 10, defaultValue: 10, min: 0.1, max: 100, unit: 'ms', curve: 'log', automatable: true });
        params.set('release', { id: 'release', name: 'Release', value: 100, defaultValue: 100, min: 10, max: 1000, unit: 'ms', curve: 'log', automatable: true });
        params.set('knee', { id: 'knee', name: 'Knee', value: 6, defaultValue: 6, min: 0, max: 40, unit: 'dB', curve: 'linear', automatable: true });
        params.set('makeup', { id: 'makeup', name: 'Makeup', value: 0, defaultValue: 0, min: -12, max: 24, unit: 'dB', curve: 'linear', automatable: true });
        params.set('mix', { id: 'mix', name: 'Mix', value: 100, defaultValue: 100, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        break;
        
      case 'imosion-reverb':
        params.set('roomSize', { id: 'roomSize', name: 'Room Size', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('decay', { id: 'decay', name: 'Decay', value: 2.5, defaultValue: 2.5, min: 0.1, max: 10, unit: 's', curve: 'log', automatable: true });
        params.set('damping', { id: 'damping', name: 'Damping', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('predelay', { id: 'predelay', name: 'Pre-delay', value: 20, defaultValue: 20, min: 0, max: 200, unit: 'ms', curve: 'linear', automatable: true });
        params.set('diffusion', { id: 'diffusion', name: 'Diffusion', value: 70, defaultValue: 70, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('lowcut', { id: 'lowcut', name: 'Low Cut', value: 200, defaultValue: 200, min: 20, max: 2000, unit: 'Hz', curve: 'log', automatable: true });
        params.set('highcut', { id: 'highcut', name: 'High Cut', value: 8000, defaultValue: 8000, min: 1000, max: 20000, unit: 'Hz', curve: 'log', automatable: true });
        params.set('mix', { id: 'mix', name: 'Mix', value: 30, defaultValue: 30, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        break;
        
      case 'imosion-delay':
        params.set('timeL', { id: 'timeL', name: 'Time L', value: 375, defaultValue: 375, min: 1, max: 2000, unit: 'ms', curve: 'linear', automatable: true });
        params.set('timeR', { id: 'timeR', name: 'Time R', value: 500, defaultValue: 500, min: 1, max: 2000, unit: 'ms', curve: 'linear', automatable: true });
        params.set('feedback', { id: 'feedback', name: 'Feedback', value: 40, defaultValue: 40, min: 0, max: 99, unit: '%', curve: 'linear', automatable: true });
        params.set('pingpong', { id: 'pingpong', name: 'Ping Pong', value: 0, defaultValue: 0, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('filter', { id: 'filter', name: 'Filter', value: 8000, defaultValue: 8000, min: 500, max: 20000, unit: 'Hz', curve: 'log', automatable: true });
        params.set('mix', { id: 'mix', name: 'Mix', value: 30, defaultValue: 30, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        break;
        
      case 'imosion-saturator':
        params.set('drive', { id: 'drive', name: 'Drive', value: 0, defaultValue: 0, min: 0, max: 24, unit: 'dB', curve: 'linear', automatable: true });
        params.set('type', { id: 'type', name: 'Type', value: 0, defaultValue: 0, min: 0, max: 4, unit: '', steps: 5, curve: 'discrete', automatable: false });
        params.set('tone', { id: 'tone', name: 'Tone', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('output', { id: 'output', name: 'Output', value: 0, defaultValue: 0, min: -24, max: 0, unit: 'dB', curve: 'linear', automatable: true });
        params.set('mix', { id: 'mix', name: 'Mix', value: 100, defaultValue: 100, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        break;
        
      case 'imosion-chorus':
        params.set('rate', { id: 'rate', name: 'Rate', value: 0.5, defaultValue: 0.5, min: 0.01, max: 10, unit: 'Hz', curve: 'log', automatable: true });
        params.set('depth', { id: 'depth', name: 'Depth', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('voices', { id: 'voices', name: 'Voices', value: 2, defaultValue: 2, min: 1, max: 6, unit: '', steps: 6, curve: 'discrete', automatable: false });
        params.set('spread', { id: 'spread', name: 'Spread', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('mix', { id: 'mix', name: 'Mix', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        break;
        
      case 'imosion-synth':
        // Oscillators
        params.set('osc1_type', { id: 'osc1_type', name: 'Osc 1 Type', value: 2, defaultValue: 2, min: 0, max: 5, unit: '', steps: 6, curve: 'discrete', automatable: false });
        params.set('osc1_level', { id: 'osc1_level', name: 'Osc 1 Level', value: 100, defaultValue: 100, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('osc1_detune', { id: 'osc1_detune', name: 'Osc 1 Detune', value: 0, defaultValue: 0, min: -100, max: 100, unit: 'cents', curve: 'linear', automatable: true });
        params.set('osc2_type', { id: 'osc2_type', name: 'Osc 2 Type', value: 1, defaultValue: 1, min: 0, max: 5, unit: '', steps: 6, curve: 'discrete', automatable: false });
        params.set('osc2_level', { id: 'osc2_level', name: 'Osc 2 Level', value: 50, defaultValue: 50, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
        params.set('osc2_detune', { id: 'osc2_detune', name: 'Osc 2 Detune', value: 7, defaultValue: 7, min: -100, max: 100, unit: 'cents', curve: 'linear', automatable: true });
        // Filter
        params.set('filter_type', { id: 'filter_type', name: 'Filter Type', value: 0, defaultValue: 0, min: 0, max: 7, unit: '', steps: 8, curve: 'discrete', automatable: false });
        params.set('filter_freq', { id: 'filter_freq', name: 'Filter Freq', value: 2000, defaultValue: 2000, min: 20, max: 20000, unit: 'Hz', curve: 'log', automatable: true });
        params.set('filter_res', { id: 'filter_res', name: 'Filter Res', value: 1, defaultValue: 1, min: 0.1, max: 20, unit: '', curve: 'log', automatable: true });
        params.set('filter_env', { id: 'filter_env', name: 'Filter Env', value: 50, defaultValue: 50, min: -100, max: 100, unit: '%', curve: 'linear', automatable: true });
        // Amp Envelope
        params.set('amp_attack', { id: 'amp_attack', name: 'Amp Attack', value: 0.01, defaultValue: 0.01, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        params.set('amp_decay', { id: 'amp_decay', name: 'Amp Decay', value: 0.3, defaultValue: 0.3, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        params.set('amp_sustain', { id: 'amp_sustain', name: 'Amp Sustain', value: 0.7, defaultValue: 0.7, min: 0, max: 1, unit: '', curve: 'linear', automatable: true });
        params.set('amp_release', { id: 'amp_release', name: 'Amp Release', value: 0.5, defaultValue: 0.5, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        // Filter Envelope
        params.set('flt_attack', { id: 'flt_attack', name: 'Flt Attack', value: 0.01, defaultValue: 0.01, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        params.set('flt_decay', { id: 'flt_decay', name: 'Flt Decay', value: 0.5, defaultValue: 0.5, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        params.set('flt_sustain', { id: 'flt_sustain', name: 'Flt Sustain', value: 0.3, defaultValue: 0.3, min: 0, max: 1, unit: '', curve: 'linear', automatable: true });
        params.set('flt_release', { id: 'flt_release', name: 'Flt Release', value: 0.3, defaultValue: 0.3, min: 0.001, max: 10, unit: 's', curve: 'log', automatable: true });
        break;
        
      default:
        // Generic parameters
        params.set('mix', { id: 'mix', name: 'Mix', value: 100, defaultValue: 100, min: 0, max: 100, unit: '%', curve: 'linear', automatable: true });
    }
    
    return params;
  }
  
  private createAudioNode(instance: PluginInstance): void {
    if (!this.audioContext) return;
    
    switch (instance.info.id) {
      case 'imosion-compressor':
        instance.audioNode = this.audioContext.createDynamicsCompressor();
        break;
        
      case 'imosion-reverb':
        instance.audioNode = this.createReverbNode(instance);
        break;
        
      case 'imosion-delay':
        instance.audioNode = this.createDelayNode(instance);
        break;
        
      case 'imosion-chorus':
        if (this.workletRegistered) {
          instance.audioNode = new AudioWorkletNode(this.audioContext, 'chorus-processor');
        }
        break;
        
      case 'imosion-saturator':
        if (this.workletRegistered) {
          instance.audioNode = new AudioWorkletNode(this.audioContext, 'saturator-processor');
        }
        break;
        
      case 'imosion-filter':
        instance.audioNode = this.audioContext.createBiquadFilter();
        break;
        
      case 'imosion-eq8':
        instance.audioNode = this.createEQNode(instance);
        break;
        
      case 'imosion-synth':
        instance.processor = new SynthProcessor(this.audioContext);
        break;
    }
  }
  
  private createReverbNode(instance: PluginInstance): ConvolverNode {
    const convolver = this.audioContext!.createConvolver();
    
    // Generate impulse response
    const sampleRate = this.audioContext!.sampleRate;
    const decay = instance.parameters.get('decay')?.value || 2.5;
    const length = sampleRate * decay;
    const impulse = this.audioContext!.createBuffer(2, length, sampleRate);
    
    for (let ch = 0; ch < 2; ch++) {
      const channelData = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * decay / 3));
      }
    }
    
    convolver.buffer = impulse;
    return convolver;
  }
  
  private createDelayNode(instance: PluginInstance): DelayNode {
    const delay = this.audioContext!.createDelay(2.0);
    const time = (instance.parameters.get('timeL')?.value || 375) / 1000;
    delay.delayTime.value = time;
    return delay;
  }
  
  private createEQNode(instance: PluginInstance): GainNode {
    // Would create a chain of biquad filters
    // Simplified: return gain node
    return this.audioContext!.createGain();
  }
  
  // =============================================================================
  // ITEM 381-385: PARAMETER CONTROL
  // =============================================================================
  
  setParameter(instanceId: string, parameterId: string, value: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    const param = instance.parameters.get(parameterId);
    if (!param) return;
    
    param.value = Math.max(param.min, Math.min(param.max, value));
    
    this.applyParameter(instance, param);
  }
  
  private applyParameter(instance: PluginInstance, param: PluginParameter): void {
    if (!instance.audioNode) return;
    
    const ctx = this.audioContext;
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    switch (instance.info.id) {
      case 'imosion-compressor':
        const comp = instance.audioNode as DynamicsCompressorNode;
        switch (param.id) {
          case 'threshold': comp.threshold.setValueAtTime(param.value, now); break;
          case 'ratio': comp.ratio.setValueAtTime(param.value, now); break;
          case 'attack': comp.attack.setValueAtTime(param.value / 1000, now); break;
          case 'release': comp.release.setValueAtTime(param.value / 1000, now); break;
          case 'knee': comp.knee.setValueAtTime(param.value, now); break;
        }
        break;
        
      case 'imosion-delay':
        const delay = instance.audioNode as DelayNode;
        if (param.id === 'timeL' || param.id === 'timeR') {
          delay.delayTime.setValueAtTime(param.value / 1000, now);
        }
        break;
        
      case 'imosion-filter':
        const filter = instance.audioNode as BiquadFilterNode;
        switch (param.id) {
          case 'frequency': filter.frequency.setValueAtTime(param.value, now); break;
          case 'q': filter.Q.setValueAtTime(param.value, now); break;
          case 'gain': filter.gain.setValueAtTime(param.value, now); break;
        }
        break;
    }
    
    // Handle AudioWorkletNode parameters
    if (instance.audioNode instanceof AudioWorkletNode) {
      const workletParam = instance.audioNode.parameters.get(param.id);
      if (workletParam) {
        workletParam.setValueAtTime(param.value, now);
      }
    }
  }
  
  getParameter(instanceId: string, parameterId: string): number | undefined {
    const instance = this.instances.get(instanceId);
    return instance?.parameters.get(parameterId)?.value;
  }
  
  resetParameter(instanceId: string, parameterId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    const param = instance.parameters.get(parameterId);
    if (param) {
      param.value = param.defaultValue;
      this.applyParameter(instance, param);
    }
  }
  
  // =============================================================================
  // ITEM 386-390: PRESETS
  // =============================================================================
  
  loadPreset(instanceId: string, presetName: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    // Load preset values based on plugin and preset name
    const presetValues = this.getPresetValues(instance.info.id, presetName);
    
    for (const [paramId, value] of Object.entries(presetValues)) {
      this.setParameter(instanceId, paramId, value);
    }
    
    instance.state.preset = presetName;
  }
  
  private getPresetValues(pluginId: string, presetName: string): Record<string, number> {
    // Preset definitions
    const presets: Record<string, Record<string, Record<string, number>>> = {
      'imosion-compressor': {
        'Gentle': { threshold: -15, ratio: 2, attack: 20, release: 150, knee: 12, makeup: 3 },
        'Punchy': { threshold: -20, ratio: 4, attack: 5, release: 80, knee: 6, makeup: 6 },
        'Limiting': { threshold: -10, ratio: 20, attack: 0.5, release: 50, knee: 0, makeup: 10 },
        'Parallel': { threshold: -30, ratio: 8, attack: 10, release: 100, knee: 6, makeup: 12, mix: 50 },
        'Vocal': { threshold: -18, ratio: 3, attack: 10, release: 120, knee: 8, makeup: 4 }
      },
      'imosion-reverb': {
        'Small Room': { roomSize: 20, decay: 0.5, damping: 70, predelay: 5, diffusion: 50, mix: 20 },
        'Large Hall': { roomSize: 80, decay: 3.0, damping: 40, predelay: 30, diffusion: 80, mix: 30 },
        'Plate': { roomSize: 50, decay: 2.0, damping: 50, predelay: 0, diffusion: 90, mix: 25 },
        'Chamber': { roomSize: 40, decay: 1.5, damping: 60, predelay: 10, diffusion: 60, mix: 25 },
        'Cathedral': { roomSize: 95, decay: 5.0, damping: 30, predelay: 50, diffusion: 85, mix: 35 },
        'Ambient': { roomSize: 70, decay: 4.0, damping: 60, predelay: 40, diffusion: 70, mix: 40 }
      },
      'imosion-delay': {
        'Slapback': { timeL: 80, timeR: 80, feedback: 10, pingpong: 0, mix: 30 },
        'Stereo': { timeL: 250, timeR: 375, feedback: 35, pingpong: 0, mix: 25 },
        'Ping Pong': { timeL: 375, timeR: 375, feedback: 45, pingpong: 100, mix: 30 },
        'Tape': { timeL: 300, timeR: 300, feedback: 40, pingpong: 0, filter: 4000, mix: 25 },
        'Dub': { timeL: 500, timeR: 750, feedback: 60, pingpong: 50, filter: 2000, mix: 35 }
      }
    };
    
    return presets[pluginId]?.[presetName] || {};
  }
  
  savePreset(instanceId: string, presetName: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    const presetData: Record<string, number> = {};
    for (const [paramId, param] of instance.parameters) {
      presetData[paramId] = param.value;
    }
    
    // Would save to storage
    console.log('Saving preset:', presetName, presetData);
  }
  
  // =============================================================================
  // ITEM 391-395: SYNTH ENGINE
  // =============================================================================
  
  triggerNote(instanceId: string, note: number, velocity: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance?.processor) return;
    
    (instance.processor as SynthProcessor).noteOn(note, velocity);
  }
  
  releaseNote(instanceId: string, note: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance?.processor) return;
    
    (instance.processor as SynthProcessor).noteOff(note);
  }
  
  // =============================================================================
  // ITEM 396-400: PLUGIN LIFECYCLE
  // =============================================================================
  
  bypassPlugin(instanceId: string, bypass: boolean): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.state.bypassed = bypass;
    }
  }
  
  destroyInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    if (instance.audioNode) {
      instance.audioNode.disconnect();
    }
    
    if (instance.processor) {
      (instance.processor as SynthProcessor).dispose?.();
    }
    
    this.instances.delete(instanceId);
  }
  
  getAudioNode(instanceId: string): AudioNode | undefined {
    return this.instances.get(instanceId)?.audioNode || undefined;
  }
  
  getInstance(instanceId: string): PluginInstance | undefined {
    return this.instances.get(instanceId);
  }
  
  // =============================================================================
  // UTILITY
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// SYNTH PROCESSOR CLASS
// =============================================================================

class SynthProcessor implements AudioProcessor {
  private context: AudioContext;
  private voices: Map<number, SynthVoice> = new Map();
  private output: GainNode;
  private parameters: Map<string, number> = new Map();
  
  constructor(context: AudioContext) {
    this.context = context;
    this.output = context.createGain();
    this.output.connect(context.destination);
  }
  
  process(_inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Map<string, number>): void {
    // Processing handled by Web Audio nodes
  }
  
  reset(): void {
    for (const voice of this.voices.values()) {
      voice.stop();
    }
    this.voices.clear();
  }
  
  noteOn(note: number, velocity: number): void {
    // Stop existing voice on same note
    this.noteOff(note);
    
    const voice = new SynthVoice(this.context, note, velocity / 127, this.parameters);
    voice.connect(this.output);
    voice.start();
    this.voices.set(note, voice);
  }
  
  noteOff(note: number): void {
    const voice = this.voices.get(note);
    if (voice) {
      voice.stop();
      this.voices.delete(note);
    }
  }
  
  setParameter(id: string, value: number): void {
    this.parameters.set(id, value);
  }
  
  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }
  
  dispose(): void {
    for (const voice of this.voices.values()) {
      voice.stop();
    }
    this.voices.clear();
    this.output.disconnect();
  }
}

class SynthVoice {
  private context: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private filter: BiquadFilterNode;
  private ampEnv: GainNode;
  private output: GainNode;
  private note: number;
  private velocity: number;
  
  constructor(context: AudioContext, note: number, velocity: number, params: Map<string, number>) {
    this.context = context;
    this.note = note;
    this.velocity = velocity;
    
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    
    // Create oscillators
    const oscTypes: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
    
    const osc1 = context.createOscillator();
    osc1.type = oscTypes[params.get('osc1_type') || 2];
    osc1.frequency.value = freq;
    osc1.detune.value = params.get('osc1_detune') || 0;
    
    const osc2 = context.createOscillator();
    osc2.type = oscTypes[params.get('osc2_type') || 1];
    osc2.frequency.value = freq;
    osc2.detune.value = params.get('osc2_detune') || 7;
    
    this.oscillators = [osc1, osc2];
    
    // Oscillator gains
    const osc1Gain = context.createGain();
    osc1Gain.gain.value = (params.get('osc1_level') || 100) / 100;
    
    const osc2Gain = context.createGain();
    osc2Gain.gain.value = (params.get('osc2_level') || 50) / 100;
    
    // Filter
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = params.get('filter_freq') || 2000;
    this.filter.Q.value = params.get('filter_res') || 1;
    
    // Amp envelope
    this.ampEnv = context.createGain();
    this.ampEnv.gain.value = 0;
    
    // Output
    this.output = context.createGain();
    this.output.gain.value = velocity;
    
    // Connect
    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    osc1Gain.connect(this.filter);
    osc2Gain.connect(this.filter);
    this.filter.connect(this.ampEnv);
    this.ampEnv.connect(this.output);
  }
  
  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }
  
  start(): void {
    const now = this.context.currentTime;
    const attack = 0.01;
    const decay = 0.3;
    const sustain = 0.7;
    
    // Start oscillators
    for (const osc of this.oscillators) {
      osc.start(now);
    }
    
    // Amp envelope
    this.ampEnv.gain.setValueAtTime(0, now);
    this.ampEnv.gain.linearRampToValueAtTime(1, now + attack);
    this.ampEnv.gain.linearRampToValueAtTime(sustain, now + attack + decay);
  }
  
  stop(): void {
    const now = this.context.currentTime;
    const release = 0.5;
    
    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.linearRampToValueAtTime(0, now + release);
    
    for (const osc of this.oscillators) {
      osc.stop(now + release);
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createPluginManager = () => new PluginManager();

export default PluginManager;
