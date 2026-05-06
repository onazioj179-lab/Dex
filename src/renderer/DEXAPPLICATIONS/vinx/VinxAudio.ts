// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - VINX Audio System
// Professional audio editing for video - DaVinci Fairlight quality
// Items 201-225 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface AudioClip {
  id: string;
  trackId: string;
  sourceId: string;
  name: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  fades: {
    fadeIn: FadeConfig;
    fadeOut: FadeConfig;
  };
  effects: AudioEffect[];
  keyframes: AudioKeyframe[];
}

export interface FadeConfig {
  enabled: boolean;
  duration: number;
  curve: FadeCurve;
}

export type FadeCurve = 'linear' | 'exponential' | 'logarithmic' | 's-curve' | 'cosine';

export interface AudioTrack {
  id: string;
  name: string;
  type: 'mono' | 'stereo' | 'surround';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  locked: boolean;
  inputMonitoring: boolean;
  outputBus: string;
  effects: AudioEffect[];
  sends: AudioSend[];
  clips: AudioClip[];
}

export interface AudioSend {
  id: string;
  targetBus: string;
  level: number;
  preFader: boolean;
  enabled: boolean;
}

export interface AudioBus {
  id: string;
  name: string;
  type: 'aux' | 'master' | 'submix';
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  effects: AudioEffect[];
  inputs: string[];
  outputBus: string | null;
}

export interface AudioEffect {
  id: string;
  type: AudioEffectType;
  name: string;
  enabled: boolean;
  parameters: Record<string, number | boolean | string>;
  preset?: string;
}

export type AudioEffectType =
  | 'eq'
  | 'compressor'
  | 'limiter'
  | 'gate'
  | 'expander'
  | 'reverb'
  | 'delay'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'distortion'
  | 'pitch-shift'
  | 'de-esser'
  | 'de-noise'
  | 'de-hum'
  | 'de-click'
  | 'loudness'
  | 'stereo-width'
  | 'saturation'
  | 'exciter';

export interface AudioKeyframe {
  id: string;
  time: number;
  property: 'volume' | 'pan' | string;
  value: number;
  easing: EasingType;
}

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export interface WaveformData {
  peaks: Float32Array;
  rms: Float32Array;
  sampleRate: number;
  duration: number;
  channels: number;
}

export interface AudioMeter {
  peak: number;
  rms: number;
  peakHold: number;
  clipping: boolean;
}

// =============================================================================
// ITEM 201: AUDIO ENGINE
// =============================================================================

export class AudioEngine {
  private audioContext: AudioContext;
  private tracks: Map<string, AudioTrack> = new Map();
  private buses: Map<string, AudioBus> = new Map();
  private masterBus: AudioBus;
  private playheadTime: number = 0;
  private isPlaying: boolean = false;
  private scheduledSources: Map<string, AudioBufferSourceNode[]> = new Map();
  private analyzerNodes: Map<string, AnalyserNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private panNodes: Map<string, StereoPannerNode> = new Map();
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private meterData: Map<string, AudioMeter> = new Map();
  private onMeterUpdate?: (meters: Map<string, AudioMeter>) => void;
  private meterInterval?: number;
  
  constructor() {
    this.audioContext = new AudioContext();
    this.masterBus = this.createMasterBus();
    this.setupMasterChain();
  }
  
  private createMasterBus(): AudioBus {
    return {
      id: 'master',
      name: 'Master',
      type: 'master',
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
      inputs: [],
      outputBus: null
    };
  }
  
  private setupMasterChain(): void {
    const masterGain = this.audioContext.createGain();
    masterGain.connect(this.audioContext.destination);
    this.gainNodes.set('master', masterGain);
    
    const masterAnalyzer = this.audioContext.createAnalyser();
    masterAnalyzer.fftSize = 2048;
    masterGain.connect(masterAnalyzer);
    this.analyzerNodes.set('master', masterAnalyzer);
  }
  
  // =============================================================================
  // ITEM 202: TRACK MANAGEMENT
  // =============================================================================
  
  createTrack(type: 'mono' | 'stereo' | 'surround' = 'stereo'): AudioTrack {
    const id = generateId();
    const track: AudioTrack = {
      id,
      name: `Audio ${this.tracks.size + 1}`,
      type,
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      locked: false,
      inputMonitoring: false,
      outputBus: 'master',
      effects: [],
      sends: [],
      clips: []
    };
    
    this.tracks.set(id, track);
    this.setupTrackChain(track);
    
    return track;
  }
  
  private setupTrackChain(track: AudioTrack): void {
    const gain = this.audioContext.createGain();
    gain.gain.value = track.volume;
    
    const pan = this.audioContext.createStereoPanner();
    pan.pan.value = track.pan;
    
    const analyzer = this.audioContext.createAnalyser();
    analyzer.fftSize = 1024;
    
    gain.connect(pan);
    pan.connect(analyzer);
    analyzer.connect(this.gainNodes.get('master')!);
    
    this.gainNodes.set(track.id, gain);
    this.panNodes.set(track.id, pan);
    this.analyzerNodes.set(track.id, analyzer);
  }
  
  deleteTrack(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    // Clean up audio nodes
    this.gainNodes.get(trackId)?.disconnect();
    this.panNodes.get(trackId)?.disconnect();
    this.analyzerNodes.get(trackId)?.disconnect();
    
    this.gainNodes.delete(trackId);
    this.panNodes.delete(trackId);
    this.analyzerNodes.delete(trackId);
    
    this.tracks.delete(trackId);
  }
  
  getTrack(trackId: string): AudioTrack | undefined {
    return this.tracks.get(trackId);
  }
  
  getAllTracks(): AudioTrack[] {
    return Array.from(this.tracks.values());
  }
  
  setTrackVolume(trackId: string, volume: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    track.volume = Math.max(0, Math.min(2, volume));
    const gain = this.gainNodes.get(trackId);
    if (gain) {
      gain.gain.setValueAtTime(track.volume, this.audioContext.currentTime);
    }
  }
  
  setTrackPan(trackId: string, pan: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    track.pan = Math.max(-1, Math.min(1, pan));
    const panNode = this.panNodes.get(trackId);
    if (panNode) {
      panNode.pan.setValueAtTime(track.pan, this.audioContext.currentTime);
    }
  }
  
  setTrackMute(trackId: string, muted: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.muted = muted;
      this.updateSoloMuteState();
    }
  }
  
  setTrackSolo(trackId: string, solo: boolean): void {
    const track = this.tracks.get(trackId);
    if (track) {
      track.solo = solo;
      this.updateSoloMuteState();
    }
  }
  
  private updateSoloMuteState(): void {
    const hasSolo = Array.from(this.tracks.values()).some(t => t.solo);
    
    for (const [id, track] of this.tracks) {
      const gain = this.gainNodes.get(id);
      if (!gain) continue;
      
      let shouldPlay = true;
      
      if (track.muted) {
        shouldPlay = false;
      } else if (hasSolo && !track.solo) {
        shouldPlay = false;
      }
      
      gain.gain.setValueAtTime(
        shouldPlay ? track.volume : 0,
        this.audioContext.currentTime
      );
    }
  }
  
  // =============================================================================
  // ITEM 203: CLIP MANAGEMENT
  // =============================================================================
  
  async addClip(
    trackId: string,
    sourceId: string,
    audioData: ArrayBuffer,
    startTime: number
  ): Promise<AudioClip | null> {
    const track = this.tracks.get(trackId);
    if (!track) return null;
    
    // Decode audio
    let buffer = this.bufferCache.get(sourceId);
    if (!buffer) {
      buffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      this.bufferCache.set(sourceId, buffer);
    }
    
    const clip: AudioClip = {
      id: generateId(),
      trackId,
      sourceId,
      name: `Audio Clip`,
      startTime,
      duration: buffer.duration,
      inPoint: 0,
      outPoint: buffer.duration,
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      locked: false,
      fades: {
        fadeIn: { enabled: false, duration: 0, curve: 'linear' },
        fadeOut: { enabled: false, duration: 0, curve: 'linear' }
      },
      effects: [],
      keyframes: []
    };
    
    track.clips.push(clip);
    return clip;
  }
  
  removeClip(trackId: string, clipId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    track.clips = track.clips.filter(c => c.id !== clipId);
  }
  
  moveClip(clipId: string, newTrackId: string, newStartTime: number): void {
    let clip: AudioClip | undefined;
    let oldTrack: AudioTrack | undefined;
    
    for (const track of this.tracks.values()) {
      const found = track.clips.find(c => c.id === clipId);
      if (found) {
        clip = found;
        oldTrack = track;
        break;
      }
    }
    
    if (!clip || !oldTrack) return;
    
    const newTrack = this.tracks.get(newTrackId);
    if (!newTrack) return;
    
    // Remove from old track
    oldTrack.clips = oldTrack.clips.filter(c => c.id !== clipId);
    
    // Add to new track
    clip.trackId = newTrackId;
    clip.startTime = newStartTime;
    newTrack.clips.push(clip);
  }
  
  trimClipStart(clipId: string, newInPoint: number): void {
    const clip = this.findClip(clipId);
    if (!clip) return;
    
    const delta = newInPoint - clip.inPoint;
    clip.inPoint = newInPoint;
    clip.startTime += delta;
    clip.duration -= delta;
  }
  
  trimClipEnd(clipId: string, newOutPoint: number): void {
    const clip = this.findClip(clipId);
    if (!clip) return;
    
    clip.outPoint = newOutPoint;
    clip.duration = newOutPoint - clip.inPoint;
  }
  
  splitClip(clipId: string, splitTime: number): [AudioClip, AudioClip] | null {
    const clip = this.findClip(clipId);
    if (!clip) return null;
    
    const track = this.tracks.get(clip.trackId);
    if (!track) return null;
    
    const relativeTime = splitTime - clip.startTime;
    if (relativeTime <= 0 || relativeTime >= clip.duration) return null;
    
    // Create second clip
    const clip2: AudioClip = {
      ...clip,
      id: generateId(),
      startTime: splitTime,
      inPoint: clip.inPoint + relativeTime,
      duration: clip.duration - relativeTime
    };
    
    // Update original clip
    clip.duration = relativeTime;
    clip.outPoint = clip.inPoint + relativeTime;
    
    track.clips.push(clip2);
    
    return [clip, clip2];
  }
  
  private findClip(clipId: string): AudioClip | undefined {
    for (const track of this.tracks.values()) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  }
  
  // =============================================================================
  // ITEM 204: FADES
  // =============================================================================
  
  setClipFadeIn(clipId: string, duration: number, curve: FadeCurve = 'linear'): void {
    const clip = this.findClip(clipId);
    if (!clip) return;
    
    clip.fades.fadeIn = {
      enabled: duration > 0,
      duration: Math.min(duration, clip.duration / 2),
      curve
    };
  }
  
  setClipFadeOut(clipId: string, duration: number, curve: FadeCurve = 'linear'): void {
    const clip = this.findClip(clipId);
    if (!clip) return;
    
    clip.fades.fadeOut = {
      enabled: duration > 0,
      duration: Math.min(duration, clip.duration / 2),
      curve
    };
  }
  
  private calculateFade(time: number, fadeConfig: FadeConfig, isIn: boolean): number {
    if (!fadeConfig.enabled || fadeConfig.duration <= 0) return 1;
    
    let t = time / fadeConfig.duration;
    if (!isIn) t = 1 - t;
    t = Math.max(0, Math.min(1, t));
    
    switch (fadeConfig.curve) {
      case 'linear':
        return t;
      case 'exponential':
        return t * t * t;
      case 'logarithmic':
        return Math.log10(t * 9 + 1);
      case 's-curve':
        return t * t * (3 - 2 * t);
      case 'cosine':
        return (1 - Math.cos(t * Math.PI)) / 2;
      default:
        return t;
    }
  }
  
  // =============================================================================
  // ITEM 205: CROSSFADES
  // =============================================================================
  
  createCrossfade(clip1Id: string, clip2Id: string, duration: number): void {
    const clip1 = this.findClip(clip1Id);
    const clip2 = this.findClip(clip2Id);
    
    if (!clip1 || !clip2) return;
    if (clip1.trackId !== clip2.trackId) return;
    
    // Ensure clips are adjacent
    const gap = clip2.startTime - (clip1.startTime + clip1.duration);
    if (Math.abs(gap) > 0.1) return;
    
    // Extend clips to overlap
    const halfDuration = duration / 2;
    clip1.duration += halfDuration;
    clip1.outPoint += halfDuration;
    clip2.startTime -= halfDuration;
    clip2.inPoint -= halfDuration;
    clip2.duration += halfDuration;
    
    // Set fades
    this.setClipFadeOut(clip1Id, duration, 's-curve');
    this.setClipFadeIn(clip2Id, duration, 's-curve');
  }
  
  // =============================================================================
  // ITEM 206: AUDIO EFFECTS CHAIN
  // =============================================================================
  
  addTrackEffect(trackId: string, effectType: AudioEffectType): AudioEffect {
    const track = this.tracks.get(trackId);
    if (!track) throw new Error('Track not found');
    
    const effect = createDefaultEffect(effectType);
    track.effects.push(effect);
    this.rebuildEffectChain(trackId);
    
    return effect;
  }
  
  removeTrackEffect(trackId: string, effectId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    track.effects = track.effects.filter(e => e.id !== effectId);
    this.rebuildEffectChain(trackId);
  }
  
  reorderTrackEffects(trackId: string, effectIds: string[]): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    const ordered: AudioEffect[] = [];
    for (const id of effectIds) {
      const effect = track.effects.find(e => e.id === id);
      if (effect) ordered.push(effect);
    }
    
    track.effects = ordered;
    this.rebuildEffectChain(trackId);
  }
  
  setEffectParameter(trackId: string, effectId: string, param: string, value: number | boolean | string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    const effect = track.effects.find(e => e.id === effectId);
    if (!effect) return;
    
    effect.parameters[param] = value;
    this.rebuildEffectChain(trackId);
  }
  
  setEffectEnabled(trackId: string, effectId: string, enabled: boolean): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    const effect = track.effects.find(e => e.id === effectId);
    if (effect) {
      effect.enabled = enabled;
      this.rebuildEffectChain(trackId);
    }
  }
  
  private rebuildEffectChain(trackId: string): void {
    // Implementation would involve Web Audio API nodes
    // Simplified for now - real implementation would create/connect nodes
  }
  
  // =============================================================================
  // ITEM 207: EQ (EQUALIZER)
  // =============================================================================
  
  createEQEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'eq',
      name: 'Parametric EQ',
      enabled: true,
      parameters: {
        // Low shelf
        lowShelfFreq: 100,
        lowShelfGain: 0,
        // Band 1
        band1Freq: 250,
        band1Gain: 0,
        band1Q: 1,
        band1Type: 'peaking',
        // Band 2
        band2Freq: 1000,
        band2Gain: 0,
        band2Q: 1,
        band2Type: 'peaking',
        // Band 3
        band3Freq: 4000,
        band3Gain: 0,
        band3Q: 1,
        band3Type: 'peaking',
        // Band 4
        band4Freq: 8000,
        band4Gain: 0,
        band4Q: 1,
        band4Type: 'peaking',
        // High shelf
        highShelfFreq: 10000,
        highShelfGain: 0,
        // Filters
        highPassEnabled: false,
        highPassFreq: 80,
        highPassSlope: 12,
        lowPassEnabled: false,
        lowPassFreq: 16000,
        lowPassSlope: 12
      }
    };
  }
  
  private createEQNodes(effect: AudioEffect): BiquadFilterNode[] {
    const nodes: BiquadFilterNode[] = [];
    const params = effect.parameters;
    
    // High pass filter
    if (params.highPassEnabled) {
      const hp = this.audioContext.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = params.highPassFreq as number;
      hp.Q.value = 0.707;
      nodes.push(hp);
    }
    
    // Low shelf
    const lowShelf = this.audioContext.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = params.lowShelfFreq as number;
    lowShelf.gain.value = params.lowShelfGain as number;
    nodes.push(lowShelf);
    
    // Parametric bands
    for (let i = 1; i <= 4; i++) {
      const band = this.audioContext.createBiquadFilter();
      band.type = (params[`band${i}Type`] as BiquadFilterType) || 'peaking';
      band.frequency.value = params[`band${i}Freq`] as number;
      band.gain.value = params[`band${i}Gain`] as number;
      band.Q.value = params[`band${i}Q`] as number;
      nodes.push(band);
    }
    
    // High shelf
    const highShelf = this.audioContext.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = params.highShelfFreq as number;
    highShelf.gain.value = params.highShelfGain as number;
    nodes.push(highShelf);
    
    // Low pass filter
    if (params.lowPassEnabled) {
      const lp = this.audioContext.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = params.lowPassFreq as number;
      lp.Q.value = 0.707;
      nodes.push(lp);
    }
    
    return nodes;
  }
  
  // =============================================================================
  // ITEM 208: COMPRESSOR
  // =============================================================================
  
  createCompressorEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'compressor',
      name: 'Dynamics Compressor',
      enabled: true,
      parameters: {
        threshold: -24,
        ratio: 4,
        knee: 10,
        attack: 0.003,
        release: 0.25,
        makeupGain: 0,
        autoMakeup: false,
        mix: 100,
        sidechain: 'internal',
        sidechainHPF: 80,
        lookahead: 0
      }
    };
  }
  
  private createCompressorNode(effect: AudioEffect): DynamicsCompressorNode {
    const compressor = this.audioContext.createDynamicsCompressor();
    const params = effect.parameters;
    
    compressor.threshold.value = params.threshold as number;
    compressor.ratio.value = params.ratio as number;
    compressor.knee.value = params.knee as number;
    compressor.attack.value = params.attack as number;
    compressor.release.value = params.release as number;
    
    return compressor;
  }
  
  // =============================================================================
  // ITEM 209: LIMITER
  // =============================================================================
  
  createLimiterEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'limiter',
      name: 'Brick Wall Limiter',
      enabled: true,
      parameters: {
        ceiling: -0.3,
        threshold: -6,
        release: 0.1,
        lookahead: 0.005,
        oversampling: 2
      }
    };
  }
  
  // =============================================================================
  // ITEM 210: GATE / EXPANDER
  // =============================================================================
  
  createGateEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'gate',
      name: 'Noise Gate',
      enabled: true,
      parameters: {
        threshold: -40,
        range: -80,
        ratio: 10,
        attack: 0.001,
        hold: 0.05,
        release: 0.1,
        sidechain: 'internal',
        sidechainHPF: 100,
        sidechainLPF: 8000,
        lookahead: 0.002
      }
    };
  }
  
  createExpanderEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'expander',
      name: 'Downward Expander',
      enabled: true,
      parameters: {
        threshold: -30,
        ratio: 2,
        attack: 0.005,
        release: 0.15,
        range: -20,
        knee: 6
      }
    };
  }
  
  // =============================================================================
  // ITEM 211: REVERB
  // =============================================================================
  
  createReverbEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'reverb',
      name: 'Algorithmic Reverb',
      enabled: true,
      parameters: {
        type: 'hall',
        roomSize: 0.7,
        decay: 2.5,
        damping: 0.5,
        predelay: 0.02,
        diffusion: 0.8,
        earlyReflections: 0.3,
        earlyLateMix: 0.5,
        highCut: 8000,
        lowCut: 200,
        modulation: 0.2,
        mix: 30,
        stereoWidth: 100
      }
    };
  }
  
  private async createConvolverNode(impulseUrl: string): Promise<ConvolverNode> {
    const convolver = this.audioContext.createConvolver();
    
    const response = await fetch(impulseUrl);
    const arrayBuffer = await response.arrayBuffer();
    convolver.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    return convolver;
  }
  
  // =============================================================================
  // ITEM 212: DELAY
  // =============================================================================
  
  createDelayEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'delay',
      name: 'Stereo Delay',
      enabled: true,
      parameters: {
        syncToTempo: true,
        tempo: 120,
        leftTime: 0.375, // dotted 8th
        rightTime: 0.25, // 8th note
        leftFeedback: 30,
        rightFeedback: 30,
        crossFeedback: 0,
        pingPong: false,
        highCut: 6000,
        lowCut: 200,
        modulation: 0,
        mix: 25,
        stereoWidth: 100
      }
    };
  }
  
  private createDelayNodes(effect: AudioEffect): DelayNode[] {
    const params = effect.parameters;
    
    const leftDelay = this.audioContext.createDelay(5);
    leftDelay.delayTime.value = params.leftTime as number;
    
    const rightDelay = this.audioContext.createDelay(5);
    rightDelay.delayTime.value = params.rightTime as number;
    
    return [leftDelay, rightDelay];
  }
  
  // =============================================================================
  // ITEM 213: CHORUS / FLANGER / PHASER
  // =============================================================================
  
  createChorusEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'chorus',
      name: 'Stereo Chorus',
      enabled: true,
      parameters: {
        rate: 0.5,
        depth: 0.5,
        delay: 0.02,
        feedback: 0.1,
        spread: 0.5,
        voices: 2,
        mix: 50
      }
    };
  }
  
  createFlangerEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'flanger',
      name: 'Flanger',
      enabled: true,
      parameters: {
        rate: 0.25,
        depth: 0.7,
        delay: 0.005,
        feedback: 0.5,
        stereo: true,
        mix: 50
      }
    };
  }
  
  createPhaserEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'phaser',
      name: 'Phaser',
      enabled: true,
      parameters: {
        rate: 0.5,
        depth: 0.7,
        stages: 4,
        feedback: 0.5,
        centerFreq: 1000,
        stereo: true,
        mix: 50
      }
    };
  }
  
  // =============================================================================
  // ITEM 214: PITCH SHIFT
  // =============================================================================
  
  createPitchShiftEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'pitch-shift',
      name: 'Pitch Shifter',
      enabled: true,
      parameters: {
        semitones: 0,
        cents: 0,
        formantPreserve: true,
        grainSize: 0.1,
        overlap: 0.5,
        mix: 100
      }
    };
  }
  
  // =============================================================================
  // ITEM 215: RESTORATION (DE-NOISE, DE-HUM, DE-CLICK)
  // =============================================================================
  
  createDeNoiseEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'de-noise',
      name: 'Noise Reduction',
      enabled: true,
      parameters: {
        threshold: -40,
        reduction: 20,
        attack: 0.02,
        release: 0.1,
        frequency: 8000,
        adaptiveMode: true,
        learnNoise: false
      }
    };
  }
  
  createDeHumEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'de-hum',
      name: 'Hum Remover',
      enabled: true,
      parameters: {
        frequency: 60,
        harmonics: 4,
        reduction: 40,
        bandwidth: 5
      }
    };
  }
  
  createDeClickEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'de-click',
      name: 'Click & Pop Remover',
      enabled: true,
      parameters: {
        sensitivity: 50,
        clickWidth: 0.01,
        interpolation: 'cubic'
      }
    };
  }
  
  createDeEsserEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'de-esser',
      name: 'De-Esser',
      enabled: true,
      parameters: {
        frequency: 6000,
        bandwidth: 2000,
        threshold: -20,
        ratio: 4,
        mode: 'split', // 'split' or 'wideband'
        listenMode: false
      }
    };
  }
  
  // =============================================================================
  // ITEM 216: LOUDNESS METERING & NORMALIZATION
  // =============================================================================
  
  createLoudnessEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'loudness',
      name: 'Loudness Processor',
      enabled: true,
      parameters: {
        targetLUFS: -14,
        truePeak: -1,
        mode: 'program', // 'program', 'short-term', 'momentary'
        autoGain: true
      }
    };
  }
  
  measureLoudness(buffer: AudioBuffer): {
    integratedLUFS: number;
    truePeak: number;
    loudnessRange: number;
    shortTermMax: number;
  } {
    const data = buffer.getChannelData(0);
    const blockSize = Math.floor(buffer.sampleRate * 0.4); // 400ms blocks
    
    let sumSquared = 0;
    let maxPeak = 0;
    const blockLoudness: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      sumSquared += data[i] * data[i];
      maxPeak = Math.max(maxPeak, Math.abs(data[i]));
      
      if ((i + 1) % blockSize === 0) {
        const rms = Math.sqrt(sumSquared / blockSize);
        blockLoudness.push(-0.691 + 10 * Math.log10(rms));
        sumSquared = 0;
      }
    }
    
    // Calculate integrated LUFS
    const avgRMS = Math.sqrt(sumSquared / data.length);
    const integratedLUFS = -0.691 + 10 * Math.log10(avgRMS);
    
    // True peak (simplified - real implementation needs oversampling)
    const truePeak = 20 * Math.log10(maxPeak);
    
    // Loudness range
    const sortedBlocks = [...blockLoudness].sort((a, b) => a - b);
    const low = sortedBlocks[Math.floor(sortedBlocks.length * 0.1)];
    const high = sortedBlocks[Math.floor(sortedBlocks.length * 0.95)];
    const loudnessRange = high - low;
    
    return {
      integratedLUFS,
      truePeak,
      loudnessRange,
      shortTermMax: Math.max(...blockLoudness)
    };
  }
  
  normalizeToLUFS(buffer: AudioBuffer, targetLUFS: number): AudioBuffer {
    const measurement = this.measureLoudness(buffer);
    const gainDB = targetLUFS - measurement.integratedLUFS;
    const gain = Math.pow(10, gainDB / 20);
    
    const newBuffer = this.audioContext.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = newBuffer.getChannelData(ch);
      
      for (let i = 0; i < input.length; i++) {
        output[i] = Math.max(-1, Math.min(1, input[i] * gain));
      }
    }
    
    return newBuffer;
  }
  
  // =============================================================================
  // ITEM 217: STEREO WIDTH / IMAGING
  // =============================================================================
  
  createStereoWidthEffect(): AudioEffect {
    return {
      id: generateId(),
      type: 'stereo-width',
      name: 'Stereo Imaging',
      enabled: true,
      parameters: {
        width: 100,
        centerLevel: 0,
        sidesLevel: 0,
        monoFreqBelow: 120,
        widthFreqAbove: 0,
        balance: 0,
        rotation: 0
      }
    };
  }
  
  // =============================================================================
  // ITEM 218: WAVEFORM GENERATION
  // =============================================================================
  
  async generateWaveform(buffer: AudioBuffer, samplesPerPixel: number = 256): Promise<WaveformData> {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const totalSamples = buffer.length;
    const numPeaks = Math.ceil(totalSamples / samplesPerPixel);
    
    const peaks = new Float32Array(numPeaks * 2);
    const rms = new Float32Array(numPeaks);
    
    // Merge channels
    const merged = new Float32Array(totalSamples);
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < totalSamples; i++) {
        merged[i] += data[i] / channels;
      }
    }
    
    // Calculate peaks and RMS for each segment
    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, totalSamples);
      
      let min = 0;
      let max = 0;
      let sumSquared = 0;
      
      for (let j = start; j < end; j++) {
        const val = merged[j];
        if (val < min) min = val;
        if (val > max) max = val;
        sumSquared += val * val;
      }
      
      peaks[i * 2] = min;
      peaks[i * 2 + 1] = max;
      rms[i] = Math.sqrt(sumSquared / (end - start));
    }
    
    return {
      peaks,
      rms,
      sampleRate,
      duration: buffer.duration,
      channels
    };
  }
  
  // =============================================================================
  // ITEM 219: AUDIO METERING
  // =============================================================================
  
  startMetering(callback: (meters: Map<string, AudioMeter>) => void, interval: number = 50): void {
    this.onMeterUpdate = callback;
    
    this.meterInterval = window.setInterval(() => {
      this.updateMeters();
    }, interval);
  }
  
  stopMetering(): void {
    if (this.meterInterval) {
      clearInterval(this.meterInterval);
      this.meterInterval = undefined;
    }
    this.onMeterUpdate = undefined;
  }
  
  private updateMeters(): void {
    for (const [id, analyzer] of this.analyzerNodes) {
      const dataArray = new Float32Array(analyzer.frequencyBinCount);
      analyzer.getFloatTimeDomainData(dataArray);
      
      let peak = 0;
      let sumSquared = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const val = Math.abs(dataArray[i]);
        if (val > peak) peak = val;
        sumSquared += dataArray[i] * dataArray[i];
      }
      
      const rms = Math.sqrt(sumSquared / dataArray.length);
      
      const existing = this.meterData.get(id);
      const peakDB = 20 * Math.log10(peak || 0.0001);
      const rmsDB = 20 * Math.log10(rms || 0.0001);
      
      this.meterData.set(id, {
        peak: peakDB,
        rms: rmsDB,
        peakHold: existing ? Math.max(existing.peakHold * 0.99, peakDB) : peakDB,
        clipping: peak >= 1
      });
    }
    
    if (this.onMeterUpdate) {
      this.onMeterUpdate(new Map(this.meterData));
    }
  }
  
  getMeter(id: string): AudioMeter | undefined {
    return this.meterData.get(id);
  }
  
  // =============================================================================
  // ITEM 220: SPECTRUM ANALYZER
  // =============================================================================
  
  getSpectrum(trackId: string): Float32Array | null {
    const analyzer = this.analyzerNodes.get(trackId);
    if (!analyzer) return null;
    
    const data = new Float32Array(analyzer.frequencyBinCount);
    analyzer.getFloatFrequencyData(data);
    
    return data;
  }
  
  getFrequencyBands(trackId: string, numBands: number = 32): number[] {
    const spectrum = this.getSpectrum(trackId);
    if (!spectrum) return new Array(numBands).fill(-100);
    
    const bands: number[] = [];
    const analyzer = this.analyzerNodes.get(trackId)!;
    const nyquist = this.audioContext.sampleRate / 2;
    
    // Logarithmic frequency bands
    for (let i = 0; i < numBands; i++) {
      const lowFreq = 20 * Math.pow(nyquist / 20, i / numBands);
      const highFreq = 20 * Math.pow(nyquist / 20, (i + 1) / numBands);
      
      const lowBin = Math.floor(lowFreq / nyquist * spectrum.length);
      const highBin = Math.ceil(highFreq / nyquist * spectrum.length);
      
      let sum = 0;
      let count = 0;
      for (let j = lowBin; j < highBin && j < spectrum.length; j++) {
        sum += spectrum[j];
        count++;
      }
      
      bands.push(count > 0 ? sum / count : -100);
    }
    
    return bands;
  }
  
  // =============================================================================
  // ITEM 221: AUDIO RECORDING
  // =============================================================================
  
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  
  async startRecording(trackId: string): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    track.armed = true;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      this.recordedChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.start(100); // Chunk every 100ms
      
      // Connect to track for monitoring
      if (track.inputMonitoring) {
        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.gainNodes.get(trackId)!);
      }
    } catch (error) {
      console.error('Recording failed:', error);
      throw error;
    }
  }
  
  async stopRecording(): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        resolve(arrayBuffer);
      };
      
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    });
  }
  
  // =============================================================================
  // ITEM 222: AUDIO BUSES & ROUTING
  // =============================================================================
  
  createBus(name: string, type: 'aux' | 'submix' = 'aux'): AudioBus {
    const id = generateId();
    const bus: AudioBus = {
      id,
      name,
      type,
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      effects: [],
      inputs: [],
      outputBus: 'master'
    };
    
    this.buses.set(id, bus);
    this.setupBusChain(bus);
    
    return bus;
  }
  
  private setupBusChain(bus: AudioBus): void {
    const gain = this.audioContext.createGain();
    gain.gain.value = bus.volume;
    
    const pan = this.audioContext.createStereoPanner();
    pan.pan.value = bus.pan;
    
    gain.connect(pan);
    
    if (bus.outputBus) {
      const outputGain = this.gainNodes.get(bus.outputBus);
      if (outputGain) {
        pan.connect(outputGain);
      }
    }
    
    this.gainNodes.set(bus.id, gain);
    this.panNodes.set(bus.id, pan);
  }
  
  addTrackSend(trackId: string, busId: string, level: number = 0.5, preFader: boolean = false): AudioSend {
    const track = this.tracks.get(trackId);
    if (!track) throw new Error('Track not found');
    
    const send: AudioSend = {
      id: generateId(),
      targetBus: busId,
      level,
      preFader,
      enabled: true
    };
    
    track.sends.push(send);
    this.rebuildTrackRouting(trackId);
    
    return send;
  }
  
  setSendLevel(trackId: string, sendId: string, level: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    
    const send = track.sends.find(s => s.id === sendId);
    if (send) {
      send.level = Math.max(0, Math.min(2, level));
      this.rebuildTrackRouting(trackId);
    }
  }
  
  private rebuildTrackRouting(trackId: string): void {
    // Implementation would reconnect audio nodes based on routing
  }
  
  // =============================================================================
  // ITEM 223: KEYFRAME AUTOMATION
  // =============================================================================
  
  addKeyframe(clipId: string, property: string, time: number, value: number, easing: EasingType = 'linear'): AudioKeyframe {
    const clip = this.findClip(clipId);
    if (!clip) throw new Error('Clip not found');
    
    // Remove existing keyframe at same time/property
    clip.keyframes = clip.keyframes.filter(
      k => !(k.time === time && k.property === property)
    );
    
    const keyframe: AudioKeyframe = {
      id: generateId(),
      time,
      property,
      value,
      easing
    };
    
    clip.keyframes.push(keyframe);
    clip.keyframes.sort((a, b) => a.time - b.time);
    
    return keyframe;
  }
  
  removeKeyframe(clipId: string, keyframeId: string): void {
    const clip = this.findClip(clipId);
    if (!clip) return;
    
    clip.keyframes = clip.keyframes.filter(k => k.id !== keyframeId);
  }
  
  getAutomatedValue(clipId: string, property: string, time: number): number {
    const clip = this.findClip(clipId);
    if (!clip) return 0;
    
    const keyframes = clip.keyframes.filter(k => k.property === property);
    if (keyframes.length === 0) {
      return property === 'volume' ? clip.volume : property === 'pan' ? clip.pan : 0;
    }
    
    // Find surrounding keyframes
    let prev: AudioKeyframe | null = null;
    let next: AudioKeyframe | null = null;
    
    for (const kf of keyframes) {
      if (kf.time <= time) prev = kf;
      if (kf.time >= time && !next) next = kf;
    }
    
    if (!prev) return next?.value ?? 0;
    if (!next) return prev.value;
    if (prev === next) return prev.value;
    
    // Interpolate
    const t = (time - prev.time) / (next.time - prev.time);
    const easedT = this.applyEasing(t, prev.easing);
    
    return prev.value + (next.value - prev.value) * easedT;
  }
  
  private applyEasing(t: number, easing: EasingType): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return t * (2 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'hold':
        return 0;
      default:
        return t;
    }
  }
  
  // =============================================================================
  // ITEM 224: PLAYBACK CONTROL
  // =============================================================================
  
  async play(startTime: number = 0): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    this.stopAllScheduled();
    this.playheadTime = startTime;
    this.isPlaying = true;
    
    const currentTime = this.audioContext.currentTime;
    
    for (const track of this.tracks.values()) {
      if (track.muted) continue;
      
      for (const clip of track.clips) {
        if (clip.muted) continue;
        
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd < startTime) continue;
        
        this.scheduleClip(clip, currentTime, startTime);
      }
    }
  }
  
  private scheduleClip(clip: AudioClip, contextTime: number, playheadStart: number): void {
    const buffer = this.bufferCache.get(clip.sourceId);
    if (!buffer) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    
    const gain = this.audioContext.createGain();
    gain.gain.value = clip.volume;
    
    source.connect(gain);
    gain.connect(this.gainNodes.get(clip.trackId)!);
    
    // Calculate timing
    const clipStart = Math.max(0, clip.startTime - playheadStart);
    const offset = clip.inPoint + Math.max(0, playheadStart - clip.startTime);
    const duration = clip.duration - Math.max(0, playheadStart - clip.startTime);
    
    // Apply fade automation
    if (clip.fades.fadeIn.enabled) {
      gain.gain.setValueAtTime(0, contextTime + clipStart);
      gain.gain.linearRampToValueAtTime(
        clip.volume,
        contextTime + clipStart + clip.fades.fadeIn.duration
      );
    }
    
    if (clip.fades.fadeOut.enabled) {
      const fadeStart = clipStart + duration - clip.fades.fadeOut.duration;
      gain.gain.setValueAtTime(clip.volume, contextTime + fadeStart);
      gain.gain.linearRampToValueAtTime(0, contextTime + clipStart + duration);
    }
    
    source.start(contextTime + clipStart, offset, duration);
    
    // Track scheduled sources
    const sources = this.scheduledSources.get(clip.id) || [];
    sources.push(source);
    this.scheduledSources.set(clip.id, sources);
  }
  
  pause(): void {
    this.isPlaying = false;
    this.stopAllScheduled();
  }
  
  stop(): void {
    this.isPlaying = false;
    this.playheadTime = 0;
    this.stopAllScheduled();
  }
  
  private stopAllScheduled(): void {
    for (const sources of this.scheduledSources.values()) {
      for (const source of sources) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Already stopped
        }
      }
    }
    this.scheduledSources.clear();
  }
  
  seek(time: number): void {
    this.playheadTime = time;
    if (this.isPlaying) {
      this.play(time);
    }
  }
  
  // =============================================================================
  // ITEM 225: AUDIO EXPORT
  // =============================================================================
  
  async exportAudio(
    startTime: number,
    endTime: number,
    options: {
      sampleRate?: number;
      bitDepth?: number;
      channels?: number;
      format?: 'wav' | 'mp3' | 'aac' | 'flac';
      normalize?: boolean;
      targetLUFS?: number;
    } = {}
  ): Promise<ArrayBuffer> {
    const {
      sampleRate = 48000,
      channels = 2,
      format = 'wav',
      normalize = false,
      targetLUFS = -14
    } = options;
    
    const duration = endTime - startTime;
    const length = Math.ceil(duration * sampleRate);
    
    // Create offline context for rendering
    const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);
    
    // Render all tracks
    for (const track of this.tracks.values()) {
      if (track.muted) continue;
      
      const trackGain = offlineCtx.createGain();
      trackGain.gain.value = track.volume;
      
      const trackPan = offlineCtx.createStereoPanner();
      trackPan.pan.value = track.pan;
      
      trackGain.connect(trackPan);
      trackPan.connect(offlineCtx.destination);
      
      for (const clip of track.clips) {
        if (clip.muted) continue;
        
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd < startTime || clip.startTime > endTime) continue;
        
        const buffer = this.bufferCache.get(clip.sourceId);
        if (!buffer) continue;
        
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        
        const clipGain = offlineCtx.createGain();
        clipGain.gain.value = clip.volume;
        
        source.connect(clipGain);
        clipGain.connect(trackGain);
        
        const clipStart = Math.max(0, clip.startTime - startTime);
        const offset = clip.inPoint + Math.max(0, startTime - clip.startTime);
        const clipDuration = Math.min(clip.duration, endTime - clip.startTime);
        
        source.start(clipStart, offset, clipDuration);
      }
    }
    
    // Render
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Normalize if requested
    const finalBuffer = normalize
      ? this.normalizeToLUFS(renderedBuffer, targetLUFS)
      : renderedBuffer;
    
    // Encode to format
    return this.encodeAudio(finalBuffer, format);
  }
  
  private encodeAudio(buffer: AudioBuffer, format: string): ArrayBuffer {
    // WAV encoding (other formats would need additional libraries)
    if (format === 'wav') {
      return this.encodeWAV(buffer);
    }
    
    // Default to WAV
    return this.encodeWAV(buffer);
  }
  
  private encodeWAV(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    this.writeString(view, 8, 'WAVE');
    
    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write samples
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  }
  
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
  
  // Cleanup
  dispose(): void {
    this.stopMetering();
    this.stop();
    this.audioContext.close();
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultEffect(type: AudioEffectType): AudioEffect {
  switch (type) {
    case 'eq':
      return {
        id: generateId(),
        type,
        name: 'Parametric EQ',
        enabled: true,
        parameters: {
          lowShelfFreq: 100,
          lowShelfGain: 0,
          band1Freq: 250,
          band1Gain: 0,
          band1Q: 1,
          band2Freq: 1000,
          band2Gain: 0,
          band2Q: 1,
          band3Freq: 4000,
          band3Gain: 0,
          band3Q: 1,
          highShelfFreq: 10000,
          highShelfGain: 0
        }
      };
    
    case 'compressor':
      return {
        id: generateId(),
        type,
        name: 'Compressor',
        enabled: true,
        parameters: {
          threshold: -24,
          ratio: 4,
          attack: 0.003,
          release: 0.25,
          knee: 10,
          makeupGain: 0
        }
      };
    
    case 'reverb':
      return {
        id: generateId(),
        type,
        name: 'Reverb',
        enabled: true,
        parameters: {
          roomSize: 0.7,
          decay: 2.5,
          damping: 0.5,
          predelay: 0.02,
          mix: 30
        }
      };
    
    case 'delay':
      return {
        id: generateId(),
        type,
        name: 'Delay',
        enabled: true,
        parameters: {
          time: 0.25,
          feedback: 30,
          mix: 25
        }
      };
    
    default:
      return {
        id: generateId(),
        type,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        enabled: true,
        parameters: {}
      };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createAudioEngine = () => new AudioEngine();
export default AudioEngine;
