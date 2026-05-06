// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - IMOSION Mixing System
// Professional mixing console rivaling SSL/Neve quality in Ableton/Logic
// Items 351-375 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface MixerChannel {
  id: string;
  name: string;
  type: ChannelType;
  color: string;
  
  // Levels
  volume: number;       // dB (-inf to +12)
  pan: number;          // -1 to 1
  width: number;        // 0 to 200% (stereo width)
  muted: boolean;
  solo: boolean;
  armed: boolean;
  
  // Routing
  input?: string;       // Device or bus ID
  output: string;       // Bus ID or 'master'
  sends: Send[];
  
  // Processing
  inserts: InsertSlot[];
  eq: ChannelEQ;
  dynamics: ChannelDynamics;
  
  // Metering
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
  clip: boolean;
  
  // Automation
  automationMode: AutomationMode;
  automationData: Map<string, AutomationLane>;
}

export type ChannelType = 'audio' | 'midi' | 'bus' | 'aux' | 'master' | 'group';

export type AutomationMode = 'off' | 'read' | 'write' | 'touch' | 'latch';

export interface Send {
  id: string;
  destination: string;  // Bus ID
  level: number;        // dB
  pan: number;
  preFader: boolean;
  enabled: boolean;
}

export interface InsertSlot {
  id: string;
  index: number;
  plugin?: AudioPlugin;
  bypass: boolean;
  wet: number;          // 0-100%
}

export interface AudioPlugin {
  id: string;
  name: string;
  type: PluginType;
  category: PluginCategory;
  parameters: Map<string, PluginParameter>;
  preset?: string;
  bypassed: boolean;
  audioNode?: AudioNode;
}

export type PluginType = 'builtin' | 'vst' | 'au' | 'js';
export type PluginCategory = 
  | 'eq' | 'dynamics' | 'reverb' | 'delay' | 'modulation'
  | 'distortion' | 'filter' | 'utility' | 'analyzer' | 'synth' | 'sampler';

export interface PluginParameter {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  default: number;
  unit: string;
  curve: 'linear' | 'log' | 'exp';
}

export interface ChannelEQ {
  enabled: boolean;
  bands: EQBand[];
}

export interface EQBand {
  id: string;
  type: EQBandType;
  frequency: number;    // Hz
  gain: number;         // dB
  q: number;            // 0.1 to 20
  enabled: boolean;
}

export type EQBandType = 
  | 'lowcut' | 'lowshelf' | 'peak' | 'highshelf' | 'highcut'
  | 'bandpass' | 'notch' | 'allpass';

export interface ChannelDynamics {
  enabled: boolean;
  gate: GateSettings;
  compressor: CompressorSettings;
  limiter: LimiterSettings;
}

export interface GateSettings {
  enabled: boolean;
  threshold: number;    // dB
  attack: number;       // ms
  hold: number;         // ms
  release: number;      // ms
  range: number;        // dB
  lookahead: number;    // ms
  sidechain?: string;   // Channel ID
}

export interface CompressorSettings {
  enabled: boolean;
  threshold: number;    // dB
  ratio: number;        // 1:1 to inf:1
  attack: number;       // ms
  release: number;      // ms
  knee: number;         // dB
  makeupGain: number;   // dB
  autoMakeup: boolean;
  sidechain?: string;
  sidechainFilter?: { type: EQBandType; frequency: number; q: number };
}

export interface LimiterSettings {
  enabled: boolean;
  ceiling: number;      // dB
  release: number;      // ms
  lookahead: number;    // ms
}

export interface AutomationLane {
  parameter: string;
  points: AutomationPoint[];
  visible: boolean;
  armed: boolean;
}

export interface AutomationPoint {
  time: number;         // Samples
  value: number;
  curve: 'linear' | 'bezier' | 'step';
  bezierHandles?: { inX: number; inY: number; outX: number; outY: number };
}

export interface Bus {
  id: string;
  name: string;
  type: 'bus' | 'aux' | 'vca';
  channels: string[];   // Channel IDs routed to this bus
  channel: MixerChannel;
}

// =============================================================================
// ITEM 351: MIXER ENGINE
// =============================================================================

export class MixerEngine {
  private audioContext: AudioContext | null = null;
  private channels: Map<string, MixerChannel> = new Map();
  private buses: Map<string, Bus> = new Map();
  private masterChannel: MixerChannel | null = null;
  
  // Audio nodes
  private channelGains: Map<string, GainNode> = new Map();
  private channelPans: Map<string, StereoPannerNode> = new Map();
  private channelAnalysers: Map<string, AnalyserNode> = new Map();
  private channelSplitters: Map<string, ChannelSplitterNode> = new Map();
  private channelMergers: Map<string, ChannelMergerNode> = new Map();
  
  // Plugin chain nodes
  private pluginNodes: Map<string, AudioNode[]> = new Map();
  
  // EQ nodes
  private eqNodes: Map<string, BiquadFilterNode[]> = new Map();
  
  // Dynamics nodes
  private dynamicsNodes: Map<string, DynamicsCompressorNode> = new Map();
  
  private sampleRate: number = 48000;
  private meterCallback?: (channels: Map<string, MixerChannel>) => void;
  
  constructor() {}
  
  // =============================================================================
  // ITEM 352: INITIALIZATION
  // =============================================================================
  
  async initialize(sampleRate: number = 48000): Promise<void> {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate });
    
    // Create master channel
    this.masterChannel = this.createChannel('master', 'Master', 'master');
    
    // Start metering
    this.startMetering();
  }
  
  // =============================================================================
  // ITEM 353-355: CHANNEL MANAGEMENT
  // =============================================================================
  
  createChannel(id: string, name: string, type: ChannelType): MixerChannel {
    const channel: MixerChannel = {
      id,
      name,
      type,
      color: this.generateChannelColor(),
      
      volume: 0,
      pan: 0,
      width: 100,
      muted: false,
      solo: false,
      armed: false,
      
      output: type === 'master' ? '' : 'master',
      sends: [],
      
      inserts: [],
      eq: {
        enabled: true,
        bands: [
          { id: '1', type: 'lowcut', frequency: 80, gain: 0, q: 0.7, enabled: false },
          { id: '2', type: 'lowshelf', frequency: 200, gain: 0, q: 0.7, enabled: true },
          { id: '3', type: 'peak', frequency: 1000, gain: 0, q: 1.4, enabled: true },
          { id: '4', type: 'peak', frequency: 3000, gain: 0, q: 1.4, enabled: true },
          { id: '5', type: 'highshelf', frequency: 8000, gain: 0, q: 0.7, enabled: true },
          { id: '6', type: 'highcut', frequency: 16000, gain: 0, q: 0.7, enabled: false }
        ]
      },
      dynamics: {
        enabled: false,
        gate: {
          enabled: false,
          threshold: -40,
          attack: 0.5,
          hold: 10,
          release: 50,
          range: -80,
          lookahead: 0
        },
        compressor: {
          enabled: false,
          threshold: -20,
          ratio: 4,
          attack: 10,
          release: 100,
          knee: 6,
          makeupGain: 0,
          autoMakeup: true
        },
        limiter: {
          enabled: false,
          ceiling: -0.3,
          release: 50,
          lookahead: 1
        }
      },
      
      peakL: -Infinity,
      peakR: -Infinity,
      rmsL: -Infinity,
      rmsR: -Infinity,
      clip: false,
      
      automationMode: 'read',
      automationData: new Map()
    };
    
    this.channels.set(id, channel);
    this.setupChannelAudio(channel);
    
    return channel;
  }
  
  deleteChannel(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel || channel.type === 'master') return;
    
    // Disconnect audio nodes
    this.channelGains.get(channelId)?.disconnect();
    this.channelPans.get(channelId)?.disconnect();
    this.channelAnalysers.get(channelId)?.disconnect();
    
    // Remove from maps
    this.channelGains.delete(channelId);
    this.channelPans.delete(channelId);
    this.channelAnalysers.delete(channelId);
    this.channels.delete(channelId);
    
    // Remove from buses
    for (const bus of this.buses.values()) {
      const index = bus.channels.indexOf(channelId);
      if (index !== -1) {
        bus.channels.splice(index, 1);
      }
    }
  }
  
  private setupChannelAudio(channel: MixerChannel): void {
    if (!this.audioContext) return;
    
    // Create audio nodes
    const gain = this.audioContext.createGain();
    const pan = this.audioContext.createStereoPanner();
    const analyser = this.audioContext.createAnalyser();
    const splitter = this.audioContext.createChannelSplitter(2);
    const merger = this.audioContext.createChannelMerger(2);
    
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;
    
    // Store nodes
    this.channelGains.set(channel.id, gain);
    this.channelPans.set(channel.id, pan);
    this.channelAnalysers.set(channel.id, analyser);
    this.channelSplitters.set(channel.id, splitter);
    this.channelMergers.set(channel.id, merger);
    
    // Set initial values
    gain.gain.value = this.dbToLinear(channel.volume);
    pan.pan.value = channel.pan;
    
    // Connect chain: input -> EQ -> dynamics -> gain -> pan -> analyser -> output
    this.setupChannelChain(channel);
  }
  
  private setupChannelChain(channel: MixerChannel): void {
    if (!this.audioContext) return;
    
    const gain = this.channelGains.get(channel.id);
    const pan = this.channelPans.get(channel.id);
    const analyser = this.channelAnalysers.get(channel.id);
    
    if (!gain || !pan || !analyser) return;
    
    // Setup EQ nodes
    const eqNodes: BiquadFilterNode[] = [];
    for (const band of channel.eq.bands) {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = this.mapEQType(band.type);
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;
      eqNodes.push(filter);
    }
    this.eqNodes.set(channel.id, eqNodes);
    
    // Setup dynamics (using built-in compressor as base)
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = channel.dynamics.compressor.threshold;
    compressor.ratio.value = channel.dynamics.compressor.ratio;
    compressor.attack.value = channel.dynamics.compressor.attack / 1000;
    compressor.release.value = channel.dynamics.compressor.release / 1000;
    compressor.knee.value = channel.dynamics.compressor.knee;
    this.dynamicsNodes.set(channel.id, compressor);
    
    // Connect: EQ chain -> dynamics -> gain -> pan -> analyser
    let lastNode: AudioNode | null = null;
    
    for (let i = 0; i < eqNodes.length; i++) {
      if (lastNode) {
        lastNode.connect(eqNodes[i]);
      }
      lastNode = eqNodes[i];
    }
    
    if (lastNode && channel.dynamics.enabled && channel.dynamics.compressor.enabled) {
      lastNode.connect(compressor);
      lastNode = compressor;
    }
    
    if (lastNode) {
      lastNode.connect(gain);
    }
    
    gain.connect(pan);
    pan.connect(analyser);
    
    // Route to output
    if (channel.output === 'master' && this.masterChannel) {
      const masterGain = this.channelGains.get(this.masterChannel.id);
      if (masterGain) {
        analyser.connect(masterGain);
      }
    } else if (channel.output === '' && channel.type === 'master') {
      analyser.connect(this.audioContext.destination);
    } else {
      const bus = this.buses.get(channel.output);
      if (bus) {
        const busGain = this.channelGains.get(bus.channel.id);
        if (busGain) {
          analyser.connect(busGain);
        }
      }
    }
  }
  
  private mapEQType(type: EQBandType): BiquadFilterType {
    const typeMap: Record<EQBandType, BiquadFilterType> = {
      'lowcut': 'highpass',
      'lowshelf': 'lowshelf',
      'peak': 'peaking',
      'highshelf': 'highshelf',
      'highcut': 'lowpass',
      'bandpass': 'bandpass',
      'notch': 'notch',
      'allpass': 'allpass'
    };
    return typeMap[type];
  }
  
  // =============================================================================
  // ITEM 356-360: VOLUME, PAN & ROUTING
  // =============================================================================
  
  setVolume(channelId: string, volumeDb: number): void {
    const channel = this.channels.get(channelId);
    const gain = this.channelGains.get(channelId);
    
    if (channel && gain) {
      channel.volume = Math.max(-Infinity, Math.min(12, volumeDb));
      gain.gain.value = channel.muted ? 0 : this.dbToLinear(channel.volume);
    }
  }
  
  setPan(channelId: string, pan: number): void {
    const channel = this.channels.get(channelId);
    const panNode = this.channelPans.get(channelId);
    
    if (channel && panNode) {
      channel.pan = Math.max(-1, Math.min(1, pan));
      panNode.pan.value = channel.pan;
    }
  }
  
  setMute(channelId: string, muted: boolean): void {
    const channel = this.channels.get(channelId);
    const gain = this.channelGains.get(channelId);
    
    if (channel && gain) {
      channel.muted = muted;
      gain.gain.value = muted ? 0 : this.dbToLinear(channel.volume);
    }
  }
  
  setSolo(channelId: string, solo: boolean): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    channel.solo = solo;
    
    // Update all channels based on solo state
    const anySolo = Array.from(this.channels.values()).some(c => c.solo);
    
    for (const [id, ch] of this.channels) {
      const gain = this.channelGains.get(id);
      if (gain && ch.type !== 'master') {
        if (anySolo && !ch.solo && !ch.muted) {
          // Mute non-soloed channels
          gain.gain.value = 0;
        } else if (!ch.muted) {
          gain.gain.value = this.dbToLinear(ch.volume);
        }
      }
    }
  }
  
  setOutput(channelId: string, output: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    channel.output = output;
    this.setupChannelChain(channel);
  }
  
  // =============================================================================
  // ITEM 361-365: SENDS & BUSES
  // =============================================================================
  
  createBus(name: string, type: 'bus' | 'aux' | 'vca' = 'bus'): Bus {
    const id = this.generateId();
    const busChannel = this.createChannel(id, name, 'bus');
    
    const bus: Bus = {
      id,
      name,
      type,
      channels: [],
      channel: busChannel
    };
    
    this.buses.set(id, bus);
    return bus;
  }
  
  addSend(channelId: string, busId: string, level: number = -6): Send {
    const channel = this.channels.get(channelId);
    const bus = this.buses.get(busId);
    
    if (!channel || !bus) throw new Error('Invalid channel or bus');
    
    const send: Send = {
      id: this.generateId(),
      destination: busId,
      level,
      pan: 0,
      preFader: false,
      enabled: true
    };
    
    channel.sends.push(send);
    this.setupSendRouting(channel, send);
    
    return send;
  }
  
  setSendLevel(channelId: string, sendId: string, level: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const send = channel.sends.find(s => s.id === sendId);
    if (send) {
      send.level = level;
      // Would update send gain node
    }
  }
  
  setSendEnabled(channelId: string, sendId: string, enabled: boolean): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const send = channel.sends.find(s => s.id === sendId);
    if (send) {
      send.enabled = enabled;
    }
  }
  
  removeSend(channelId: string, sendId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const index = channel.sends.findIndex(s => s.id === sendId);
    if (index !== -1) {
      channel.sends.splice(index, 1);
    }
  }
  
  private setupSendRouting(channel: MixerChannel, send: Send): void {
    // Would create additional routing nodes for send
    // This is simplified - real implementation needs separate send gain/pan
  }
  
  // =============================================================================
  // ITEM 366-370: EQ & DYNAMICS
  // =============================================================================
  
  setEQBand(channelId: string, bandId: string, params: Partial<EQBand>): void {
    const channel = this.channels.get(channelId);
    const eqNodes = this.eqNodes.get(channelId);
    
    if (!channel || !eqNodes) return;
    
    const bandIndex = channel.eq.bands.findIndex(b => b.id === bandId);
    if (bandIndex === -1) return;
    
    const band = channel.eq.bands[bandIndex];
    const node = eqNodes[bandIndex];
    
    if (params.frequency !== undefined) {
      band.frequency = params.frequency;
      node.frequency.value = params.frequency;
    }
    if (params.gain !== undefined) {
      band.gain = params.gain;
      node.gain.value = params.gain;
    }
    if (params.q !== undefined) {
      band.q = params.q;
      node.Q.value = params.q;
    }
    if (params.type !== undefined) {
      band.type = params.type;
      node.type = this.mapEQType(params.type);
    }
    if (params.enabled !== undefined) {
      band.enabled = params.enabled;
      // Would bypass/enable in chain
    }
  }
  
  setEQEnabled(channelId: string, enabled: boolean): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.eq.enabled = enabled;
      // Would reconnect chain bypassing EQ
    }
  }
  
  setCompressor(channelId: string, params: Partial<CompressorSettings>): void {
    const channel = this.channels.get(channelId);
    const compressor = this.dynamicsNodes.get(channelId);
    
    if (!channel || !compressor) return;
    
    const comp = channel.dynamics.compressor;
    
    if (params.threshold !== undefined) {
      comp.threshold = params.threshold;
      compressor.threshold.value = params.threshold;
    }
    if (params.ratio !== undefined) {
      comp.ratio = params.ratio;
      compressor.ratio.value = Math.min(20, params.ratio);
    }
    if (params.attack !== undefined) {
      comp.attack = params.attack;
      compressor.attack.value = params.attack / 1000;
    }
    if (params.release !== undefined) {
      comp.release = params.release;
      compressor.release.value = params.release / 1000;
    }
    if (params.knee !== undefined) {
      comp.knee = params.knee;
      compressor.knee.value = params.knee;
    }
    if (params.makeupGain !== undefined) {
      comp.makeupGain = params.makeupGain;
    }
    if (params.enabled !== undefined) {
      comp.enabled = params.enabled;
      // Would reconnect chain
    }
  }
  
  setGate(channelId: string, params: Partial<GateSettings>): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    Object.assign(channel.dynamics.gate, params);
    // Gate would need custom implementation
  }
  
  setLimiter(channelId: string, params: Partial<LimiterSettings>): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    Object.assign(channel.dynamics.limiter, params);
    // Limiter would use separate node
  }
  
  // =============================================================================
  // ITEM 371-375: PLUGINS & INSERTS
  // =============================================================================
  
  addInsert(channelId: string, plugin: AudioPlugin, index?: number): InsertSlot {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error('Channel not found');
    
    const slot: InsertSlot = {
      id: this.generateId(),
      index: index ?? channel.inserts.length,
      plugin,
      bypass: false,
      wet: 100
    };
    
    if (index !== undefined) {
      channel.inserts.splice(index, 0, slot);
      // Reindex
      channel.inserts.forEach((s, i) => s.index = i);
    } else {
      channel.inserts.push(slot);
    }
    
    this.setupPluginAudio(channel, slot);
    return slot;
  }
  
  removeInsert(channelId: string, slotId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const index = channel.inserts.findIndex(s => s.id === slotId);
    if (index !== -1) {
      channel.inserts.splice(index, 1);
      channel.inserts.forEach((s, i) => s.index = i);
      this.setupChannelChain(channel);
    }
  }
  
  moveInsert(channelId: string, slotId: string, newIndex: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const currentIndex = channel.inserts.findIndex(s => s.id === slotId);
    if (currentIndex === -1) return;
    
    const [slot] = channel.inserts.splice(currentIndex, 1);
    channel.inserts.splice(newIndex, 0, slot);
    channel.inserts.forEach((s, i) => s.index = i);
    
    this.setupChannelChain(channel);
  }
  
  setInsertBypass(channelId: string, slotId: string, bypass: boolean): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const slot = channel.inserts.find(s => s.id === slotId);
    if (slot) {
      slot.bypass = bypass;
      // Would reconnect chain
    }
  }
  
  setInsertWet(channelId: string, slotId: string, wet: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const slot = channel.inserts.find(s => s.id === slotId);
    if (slot) {
      slot.wet = Math.max(0, Math.min(100, wet));
      // Would adjust wet/dry mix
    }
  }
  
  setPluginParameter(channelId: string, slotId: string, paramId: string, value: number): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    const slot = channel.inserts.find(s => s.id === slotId);
    if (slot?.plugin) {
      const param = slot.plugin.parameters.get(paramId);
      if (param) {
        param.value = Math.max(param.min, Math.min(param.max, value));
        // Would update plugin audio node
      }
    }
  }
  
  private setupPluginAudio(channel: MixerChannel, slot: InsertSlot): void {
    if (!this.audioContext || !slot.plugin) return;
    
    // Create appropriate audio node based on plugin type
    // This is simplified - real plugins would have their own audio processing
  }
  
  // Built-in plugins
  createReverbPlugin(): AudioPlugin {
    return {
      id: this.generateId(),
      name: 'IMOSION Reverb',
      type: 'builtin',
      category: 'reverb',
      parameters: new Map([
        ['roomSize', { id: 'roomSize', name: 'Room Size', value: 50, min: 0, max: 100, default: 50, unit: '%', curve: 'linear' }],
        ['decay', { id: 'decay', name: 'Decay', value: 2.5, min: 0.1, max: 10, default: 2.5, unit: 's', curve: 'log' }],
        ['damping', { id: 'damping', name: 'Damping', value: 5000, min: 500, max: 20000, default: 5000, unit: 'Hz', curve: 'log' }],
        ['predelay', { id: 'predelay', name: 'Pre-delay', value: 20, min: 0, max: 200, default: 20, unit: 'ms', curve: 'linear' }],
        ['mix', { id: 'mix', name: 'Mix', value: 30, min: 0, max: 100, default: 30, unit: '%', curve: 'linear' }]
      ]),
      bypassed: false
    };
  }
  
  createDelayPlugin(): AudioPlugin {
    return {
      id: this.generateId(),
      name: 'IMOSION Delay',
      type: 'builtin',
      category: 'delay',
      parameters: new Map([
        ['timeL', { id: 'timeL', name: 'Time L', value: 375, min: 1, max: 2000, default: 375, unit: 'ms', curve: 'linear' }],
        ['timeR', { id: 'timeR', name: 'Time R', value: 500, min: 1, max: 2000, default: 500, unit: 'ms', curve: 'linear' }],
        ['feedback', { id: 'feedback', name: 'Feedback', value: 40, min: 0, max: 100, default: 40, unit: '%', curve: 'linear' }],
        ['filter', { id: 'filter', name: 'Filter', value: 8000, min: 500, max: 20000, default: 8000, unit: 'Hz', curve: 'log' }],
        ['sync', { id: 'sync', name: 'Sync', value: 0, min: 0, max: 1, default: 0, unit: '', curve: 'linear' }],
        ['mix', { id: 'mix', name: 'Mix', value: 30, min: 0, max: 100, default: 30, unit: '%', curve: 'linear' }]
      ]),
      bypassed: false
    };
  }
  
  // =============================================================================
  // METERING
  // =============================================================================
  
  private startMetering(): void {
    const update = () => {
      for (const [channelId, channel] of this.channels) {
        const analyser = this.channelAnalysers.get(channelId);
        if (!analyser) continue;
        
        const bufferLength = analyser.fftSize;
        const dataArray = new Float32Array(bufferLength);
        analyser.getFloatTimeDomainData(dataArray);
        
        // Calculate peak and RMS
        let peak = 0;
        let sumSquares = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          const abs = Math.abs(dataArray[i]);
          if (abs > peak) peak = abs;
          sumSquares += dataArray[i] * dataArray[i];
        }
        
        const rms = Math.sqrt(sumSquares / bufferLength);
        
        // For stereo, we'd split and calculate L/R separately
        channel.peakL = this.linearToDb(peak);
        channel.peakR = this.linearToDb(peak);
        channel.rmsL = this.linearToDb(rms);
        channel.rmsR = this.linearToDb(rms);
        channel.clip = peak >= 1.0;
      }
      
      this.meterCallback?.(this.channels);
      
      if (this.audioContext?.state === 'running') {
        requestAnimationFrame(update);
      }
    };
    
    update();
  }
  
  setMeterCallback(callback: (channels: Map<string, MixerChannel>) => void): void {
    this.meterCallback = callback;
  }
  
  // =============================================================================
  // AUTOMATION
  // =============================================================================
  
  setAutomationMode(channelId: string, mode: AutomationMode): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.automationMode = mode;
    }
  }
  
  addAutomationPoint(
    channelId: string,
    parameter: string,
    time: number,
    value: number,
    curve: AutomationPoint['curve'] = 'linear'
  ): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    
    let lane = channel.automationData.get(parameter);
    if (!lane) {
      lane = {
        parameter,
        points: [],
        visible: true,
        armed: false
      };
      channel.automationData.set(parameter, lane);
    }
    
    // Insert in sorted order
    const point: AutomationPoint = { time, value, curve };
    const insertIndex = lane.points.findIndex(p => p.time > time);
    
    if (insertIndex === -1) {
      lane.points.push(point);
    } else {
      lane.points.splice(insertIndex, 0, point);
    }
  }
  
  readAutomation(channelId: string, parameter: string, time: number): number | undefined {
    const channel = this.channels.get(channelId);
    if (!channel || channel.automationMode === 'off') return undefined;
    
    const lane = channel.automationData.get(parameter);
    if (!lane || lane.points.length === 0) return undefined;
    
    // Find surrounding points
    let prevPoint: AutomationPoint | undefined;
    let nextPoint: AutomationPoint | undefined;
    
    for (const point of lane.points) {
      if (point.time <= time) {
        prevPoint = point;
      } else {
        nextPoint = point;
        break;
      }
    }
    
    if (!prevPoint) return nextPoint?.value;
    if (!nextPoint) return prevPoint.value;
    
    // Interpolate
    const t = (time - prevPoint.time) / (nextPoint.time - prevPoint.time);
    
    switch (prevPoint.curve) {
      case 'step':
        return prevPoint.value;
      case 'bezier':
        // Would use bezier curve interpolation
        return prevPoint.value + (nextPoint.value - prevPoint.value) * t;
      case 'linear':
      default:
        return prevPoint.value + (nextPoint.value - prevPoint.value) * t;
    }
  }
  
  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  
  private dbToLinear(db: number): number {
    if (db <= -100) return 0;
    return Math.pow(10, db / 20);
  }
  
  private linearToDb(linear: number): number {
    if (linear <= 0) return -Infinity;
    return 20 * Math.log10(linear);
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private generateChannelColor(): string {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  // Getters
  getChannel(id: string): MixerChannel | undefined {
    return this.channels.get(id);
  }
  
  getAllChannels(): MixerChannel[] {
    return Array.from(this.channels.values());
  }
  
  getMasterChannel(): MixerChannel | null {
    return this.masterChannel;
  }
  
  getBus(id: string): Bus | undefined {
    return this.buses.get(id);
  }
  
  getAllBuses(): Bus[] {
    return Array.from(this.buses.values());
  }
  
  // Connect external source to channel
  connectSource(channelId: string, source: AudioNode): void {
    const eqNodes = this.eqNodes.get(channelId);
    if (eqNodes && eqNodes.length > 0) {
      source.connect(eqNodes[0]);
    }
  }
  
  // Cleanup
  dispose(): void {
    for (const gain of this.channelGains.values()) gain.disconnect();
    for (const pan of this.channelPans.values()) pan.disconnect();
    for (const analyser of this.channelAnalysers.values()) analyser.disconnect();
    
    this.audioContext?.close();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createMixerEngine = () => new MixerEngine();

export default MixerEngine;
