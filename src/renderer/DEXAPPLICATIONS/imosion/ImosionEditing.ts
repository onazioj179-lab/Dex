// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - IMOSION Audio Editing System
// Professional audio editing rivaling Pro Tools/Audition quality
// Items 401-425 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface AudioClip {
  id: string;
  name: string;
  trackId: string;
  
  // Source
  sourceBuffer: AudioBuffer;
  sourceUrl?: string;
  
  // Timing (in samples)
  startTime: number;        // Position on timeline
  offset: number;           // Offset into source buffer
  duration: number;         // Clip length
  
  // Processing
  gain: number;             // dB
  fadeIn: FadeConfig;
  fadeOut: FadeConfig;
  timeStretch: TimeStretchConfig;
  pitchShift: PitchShiftConfig;
  
  // State
  locked: boolean;
  muted: boolean;
  selected: boolean;
  color: string;
  
  // Waveform cache
  waveformPeaks?: Float32Array[];
}

export interface FadeConfig {
  duration: number;         // Samples
  curve: FadeCurve;
}

export type FadeCurve = 'linear' | 'logarithmic' | 'exponential' | 'scurve' | 'cosine';

export interface TimeStretchConfig {
  enabled: boolean;
  ratio: number;            // 0.5 = half speed, 2 = double speed
  algorithm: TimeStretchAlgorithm;
  preserveFormants: boolean;
}

export type TimeStretchAlgorithm = 'wsola' | 'phase-vocoder' | 'elastic' | 'granular';

export interface PitchShiftConfig {
  enabled: boolean;
  semitones: number;        // -24 to +24
  cents: number;            // -100 to +100
  algorithm: PitchShiftAlgorithm;
  preserveFormants: boolean;
}

export type PitchShiftAlgorithm = 'phase-vocoder' | 'tdhs' | 'granular';

export interface AudioRegion {
  id: string;
  clipId: string;
  startOffset: number;      // Within clip
  endOffset: number;
  markers: RegionMarker[];
}

export interface RegionMarker {
  id: string;
  position: number;
  type: 'transient' | 'slice' | 'beat' | 'marker' | 'loop-start' | 'loop-end';
  label?: string;
}

export interface EditOperation {
  type: EditOperationType;
  clipIds: string[];
  before: Partial<AudioClip>[];
  after: Partial<AudioClip>[];
  timestamp: number;
}

export type EditOperationType = 
  | 'cut' | 'copy' | 'paste' | 'delete' | 'trim' | 'split'
  | 'move' | 'resize' | 'fade' | 'normalize' | 'reverse'
  | 'timestretch' | 'pitchshift' | 'gain' | 'crossfade';

export interface Crossfade {
  id: string;
  clipAId: string;
  clipBId: string;
  duration: number;
  curve: FadeCurve;
  position: 'equal-power' | 'equal-gain' | 'custom';
}

export interface SliceSettings {
  mode: 'transient' | 'grid' | 'region' | 'silence';
  sensitivity: number;      // For transient detection (0-100)
  minSliceLength: number;   // Samples
  gridDivision: number;     // For grid mode (beats or ms)
  silenceThreshold: number; // dB for silence detection
  silenceDuration: number;  // Min silence duration (samples)
}

// =============================================================================
// ITEM 401: AUDIO EDITING ENGINE
// =============================================================================

export class AudioEditingEngine {
  private audioContext: AudioContext | null = null;
  private clips: Map<string, AudioClip> = new Map();
  private regions: Map<string, AudioRegion> = new Map();
  private crossfades: Map<string, Crossfade> = new Map();
  private clipboard: AudioClip[] = [];
  private undoStack: EditOperation[] = [];
  private redoStack: EditOperation[] = [];
  private sampleRate: number = 48000;
  
  constructor() {}
  
  async initialize(sampleRate: number = 48000): Promise<void> {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate });
  }
  
  // =============================================================================
  // ITEM 402-405: CLIP MANAGEMENT
  // =============================================================================
  
  async importAudio(file: File, trackId: string, startTime: number = 0): Promise<AudioClip> {
    if (!this.audioContext) throw new Error('Audio context not initialized');
    
    const arrayBuffer = await file.arrayBuffer();
    const sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    const clip: AudioClip = {
      id: this.generateId(),
      name: file.name.replace(/\.[^/.]+$/, ''),
      trackId,
      sourceBuffer,
      sourceUrl: URL.createObjectURL(file),
      startTime,
      offset: 0,
      duration: sourceBuffer.length,
      gain: 0,
      fadeIn: { duration: 0, curve: 'linear' },
      fadeOut: { duration: 0, curve: 'linear' },
      timeStretch: { enabled: false, ratio: 1, algorithm: 'wsola', preserveFormants: true },
      pitchShift: { enabled: false, semitones: 0, cents: 0, algorithm: 'phase-vocoder', preserveFormants: true },
      locked: false,
      muted: false,
      selected: false,
      color: this.generateClipColor()
    };
    
    // Generate waveform peaks
    clip.waveformPeaks = this.generateWaveformPeaks(sourceBuffer);
    
    this.clips.set(clip.id, clip);
    return clip;
  }
  
  createClipFromBuffer(buffer: AudioBuffer, trackId: string, startTime: number, name: string): AudioClip {
    const clip: AudioClip = {
      id: this.generateId(),
      name,
      trackId,
      sourceBuffer: buffer,
      startTime,
      offset: 0,
      duration: buffer.length,
      gain: 0,
      fadeIn: { duration: 0, curve: 'linear' },
      fadeOut: { duration: 0, curve: 'linear' },
      timeStretch: { enabled: false, ratio: 1, algorithm: 'wsola', preserveFormants: true },
      pitchShift: { enabled: false, semitones: 0, cents: 0, algorithm: 'phase-vocoder', preserveFormants: true },
      locked: false,
      muted: false,
      selected: false,
      color: this.generateClipColor(),
      waveformPeaks: this.generateWaveformPeaks(buffer)
    };
    
    this.clips.set(clip.id, clip);
    return clip;
  }
  
  deleteClip(clipId: string): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    this.saveOperation('delete', [clipId], [clip], []);
    this.clips.delete(clipId);
    
    // Remove associated crossfades
    for (const [id, crossfade] of this.crossfades) {
      if (crossfade.clipAId === clipId || crossfade.clipBId === clipId) {
        this.crossfades.delete(id);
      }
    }
  }
  
  duplicateClip(clipId: string, newStartTime?: number): AudioClip | null {
    const original = this.clips.get(clipId);
    if (!original) return null;
    
    const duplicate: AudioClip = {
      ...original,
      id: this.generateId(),
      name: `${original.name} (copy)`,
      startTime: newStartTime ?? original.startTime + original.duration,
      selected: false
    };
    
    this.clips.set(duplicate.id, duplicate);
    return duplicate;
  }
  
  // =============================================================================
  // ITEM 406-410: BASIC EDITING
  // =============================================================================
  
  moveClip(clipId: string, newStartTime: number, newTrackId?: string): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    const before = { startTime: clip.startTime, trackId: clip.trackId };
    
    clip.startTime = Math.max(0, newStartTime);
    if (newTrackId) {
      clip.trackId = newTrackId;
    }
    
    this.saveOperation('move', [clipId], [before], [{ startTime: clip.startTime, trackId: clip.trackId }]);
  }
  
  trimClipStart(clipId: string, newOffset: number): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    const maxOffset = clip.offset + clip.duration;
    const clampedOffset = Math.max(0, Math.min(newOffset, maxOffset - 100));
    const delta = clampedOffset - clip.offset;
    
    const before = { offset: clip.offset, startTime: clip.startTime, duration: clip.duration };
    
    clip.offset = clampedOffset;
    clip.startTime += delta;
    clip.duration -= delta;
    
    this.saveOperation('trim', [clipId], [before], [{ offset: clip.offset, startTime: clip.startTime, duration: clip.duration }]);
  }
  
  trimClipEnd(clipId: string, newDuration: number): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    const maxDuration = clip.sourceBuffer.length - clip.offset;
    const clampedDuration = Math.max(100, Math.min(newDuration, maxDuration));
    
    const before = { duration: clip.duration };
    clip.duration = clampedDuration;
    
    this.saveOperation('trim', [clipId], [before], [{ duration: clip.duration }]);
  }
  
  splitClip(clipId: string, splitPosition: number): [AudioClip, AudioClip] | null {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return null;
    
    // Split position is relative to clip start
    const localSplit = splitPosition - clip.startTime;
    if (localSplit <= 0 || localSplit >= clip.duration) return null;
    
    // Create second clip
    const clip2: AudioClip = {
      ...clip,
      id: this.generateId(),
      name: `${clip.name}_2`,
      startTime: splitPosition,
      offset: clip.offset + localSplit,
      duration: clip.duration - localSplit,
      fadeIn: { duration: 0, curve: 'linear' },
      selected: false
    };
    
    // Modify first clip
    const originalDuration = clip.duration;
    clip.duration = localSplit;
    clip.fadeOut = { duration: 0, curve: 'linear' };
    clip.name = `${clip.name}_1`;
    
    this.clips.set(clip2.id, clip2);
    
    this.saveOperation('split', [clipId, clip2.id], [{ duration: originalDuration }], [{ duration: clip.duration }, clip2]);
    
    return [clip, clip2];
  }
  
  joinClips(clipIds: string[]): AudioClip | null {
    if (clipIds.length < 2) return null;
    if (!this.audioContext) return null;
    
    const clips = clipIds.map(id => this.clips.get(id)).filter((c): c is AudioClip => c !== undefined);
    if (clips.length < 2) return null;
    
    // Sort by start time
    clips.sort((a, b) => a.startTime - b.startTime);
    
    // Check if clips are adjacent (within small tolerance)
    for (let i = 1; i < clips.length; i++) {
      const gap = clips[i].startTime - (clips[i-1].startTime + clips[i-1].duration);
      if (Math.abs(gap) > 100) return null; // Not adjacent
    }
    
    // Calculate total length
    const totalLength = clips.reduce((sum, c) => sum + c.duration, 0);
    
    // Create new buffer
    const newBuffer = this.audioContext.createBuffer(
      clips[0].sourceBuffer.numberOfChannels,
      totalLength,
      this.sampleRate
    );
    
    // Copy data
    let writeOffset = 0;
    for (const clip of clips) {
      for (let ch = 0; ch < newBuffer.numberOfChannels; ch++) {
        const channelData = newBuffer.getChannelData(ch);
        const sourceData = clip.sourceBuffer.getChannelData(ch);
        for (let i = 0; i < clip.duration; i++) {
          channelData[writeOffset + i] = sourceData[clip.offset + i];
        }
      }
      writeOffset += clip.duration;
    }
    
    // Create joined clip
    const joinedClip = this.createClipFromBuffer(
      newBuffer,
      clips[0].trackId,
      clips[0].startTime,
      clips[0].name.replace(/_\d+$/, '')
    );
    
    // Delete original clips
    for (const clip of clips) {
      this.clips.delete(clip.id);
    }
    
    return joinedClip;
  }
  
  // =============================================================================
  // ITEM 411-415: CLIPBOARD & HISTORY
  // =============================================================================
  
  cut(clipIds: string[]): void {
    this.clipboard = clipIds
      .map(id => this.clips.get(id))
      .filter((c): c is AudioClip => c !== undefined && !c.locked)
      .map(c => ({ ...c }));
    
    for (const id of clipIds) {
      const clip = this.clips.get(id);
      if (clip && !clip.locked) {
        this.clips.delete(id);
      }
    }
    
    this.saveOperation('cut', clipIds, this.clipboard, []);
  }
  
  copy(clipIds: string[]): void {
    this.clipboard = clipIds
      .map(id => this.clips.get(id))
      .filter((c): c is AudioClip => c !== undefined)
      .map(c => ({ ...c, id: this.generateId() }));
  }
  
  paste(trackId: string, startTime: number): AudioClip[] {
    const pasted: AudioClip[] = [];
    
    // Find earliest start time in clipboard
    const earliestTime = Math.min(...this.clipboard.map(c => c.startTime));
    
    for (const clipTemplate of this.clipboard) {
      const clip: AudioClip = {
        ...clipTemplate,
        id: this.generateId(),
        trackId,
        startTime: startTime + (clipTemplate.startTime - earliestTime),
        selected: false
      };
      
      this.clips.set(clip.id, clip);
      pasted.push(clip);
    }
    
    this.saveOperation('paste', pasted.map(c => c.id), [], pasted);
    
    return pasted;
  }
  
  undo(): void {
    const operation = this.undoStack.pop();
    if (!operation) return;
    
    this.applyOperation(operation, true);
    this.redoStack.push(operation);
  }
  
  redo(): void {
    const operation = this.redoStack.pop();
    if (!operation) return;
    
    this.applyOperation(operation, false);
    this.undoStack.push(operation);
  }
  
  private saveOperation(type: EditOperationType, clipIds: string[], before: Partial<AudioClip>[], after: Partial<AudioClip>[]): void {
    this.undoStack.push({
      type,
      clipIds,
      before,
      after,
      timestamp: Date.now()
    });
    this.redoStack = [];
  }
  
  private applyOperation(operation: EditOperation, isUndo: boolean): void {
    const data = isUndo ? operation.before : operation.after;
    
    for (let i = 0; i < operation.clipIds.length; i++) {
      const clipId = operation.clipIds[i];
      const clip = this.clips.get(clipId);
      
      if (operation.type === 'delete' || operation.type === 'cut') {
        if (isUndo && operation.before[i]) {
          // Restore clip
          this.clips.set(clipId, operation.before[i] as AudioClip);
        } else {
          this.clips.delete(clipId);
        }
      } else if (clip && data[i]) {
        Object.assign(clip, data[i]);
      }
    }
  }
  
  // =============================================================================
  // ITEM 416-420: FADES & CROSSFADES
  // =============================================================================
  
  setFadeIn(clipId: string, duration: number, curve: FadeCurve = 'linear'): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    clip.fadeIn = {
      duration: Math.min(duration, clip.duration / 2),
      curve
    };
  }
  
  setFadeOut(clipId: string, duration: number, curve: FadeCurve = 'linear'): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    clip.fadeOut = {
      duration: Math.min(duration, clip.duration / 2),
      curve
    };
  }
  
  createCrossfade(clipAId: string, clipBId: string, duration: number, curve: FadeCurve = 'cosine'): Crossfade | null {
    const clipA = this.clips.get(clipAId);
    const clipB = this.clips.get(clipBId);
    
    if (!clipA || !clipB) return null;
    
    // Verify clips are adjacent
    const endA = clipA.startTime + clipA.duration;
    const overlap = endA - clipB.startTime;
    
    if (overlap < 0 || overlap > Math.min(clipA.duration, clipB.duration) / 2) {
      return null;
    }
    
    const crossfade: Crossfade = {
      id: this.generateId(),
      clipAId,
      clipBId,
      duration,
      curve,
      position: 'equal-power'
    };
    
    // Apply fades to clips
    clipA.fadeOut = { duration, curve };
    clipB.fadeIn = { duration, curve };
    
    this.crossfades.set(crossfade.id, crossfade);
    return crossfade;
  }
  
  removeCrossfade(crossfadeId: string): void {
    const crossfade = this.crossfades.get(crossfadeId);
    if (!crossfade) return;
    
    const clipA = this.clips.get(crossfade.clipAId);
    const clipB = this.clips.get(crossfade.clipBId);
    
    if (clipA) clipA.fadeOut = { duration: 0, curve: 'linear' };
    if (clipB) clipB.fadeIn = { duration: 0, curve: 'linear' };
    
    this.crossfades.delete(crossfadeId);
  }
  
  calculateFadeCurve(position: number, duration: number, curve: FadeCurve, isFadeIn: boolean): number {
    if (duration === 0) return 1;
    
    const t = Math.max(0, Math.min(1, position / duration));
    const x = isFadeIn ? t : 1 - t;
    
    switch (curve) {
      case 'linear':
        return x;
      case 'logarithmic':
        return Math.pow(x, 0.5);
      case 'exponential':
        return Math.pow(x, 2);
      case 'scurve':
        return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
      case 'cosine':
        return (1 - Math.cos(x * Math.PI)) / 2;
      default:
        return x;
    }
  }
  
  // =============================================================================
  // ITEM 421-423: TIME STRETCH & PITCH SHIFT
  // =============================================================================
  
  setTimeStretch(clipId: string, ratio: number, algorithm: TimeStretchAlgorithm = 'wsola'): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    clip.timeStretch = {
      enabled: ratio !== 1,
      ratio: Math.max(0.25, Math.min(4, ratio)),
      algorithm,
      preserveFormants: clip.timeStretch.preserveFormants
    };
    
    // Duration changes with time stretch
    clip.duration = Math.round(clip.sourceBuffer.length / ratio);
  }
  
  setPitchShift(clipId: string, semitones: number, cents: number = 0): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    clip.pitchShift = {
      enabled: semitones !== 0 || cents !== 0,
      semitones: Math.max(-24, Math.min(24, semitones)),
      cents: Math.max(-100, Math.min(100, cents)),
      algorithm: clip.pitchShift.algorithm,
      preserveFormants: clip.pitchShift.preserveFormants
    };
  }
  
  async processTimeStretch(clip: AudioClip): Promise<AudioBuffer> {
    if (!this.audioContext || !clip.timeStretch.enabled) {
      return clip.sourceBuffer;
    }
    
    const ratio = clip.timeStretch.ratio;
    const newLength = Math.round(clip.sourceBuffer.length / ratio);
    const newBuffer = this.audioContext.createBuffer(
      clip.sourceBuffer.numberOfChannels,
      newLength,
      this.sampleRate
    );
    
    // Simple time stretch using linear interpolation
    // Real implementation would use WSOLA or phase vocoder
    for (let ch = 0; ch < clip.sourceBuffer.numberOfChannels; ch++) {
      const sourceData = clip.sourceBuffer.getChannelData(ch);
      const outputData = newBuffer.getChannelData(ch);
      
      for (let i = 0; i < newLength; i++) {
        const sourceIndex = i * ratio;
        const index1 = Math.floor(sourceIndex);
        const index2 = Math.min(index1 + 1, sourceData.length - 1);
        const frac = sourceIndex - index1;
        
        outputData[i] = sourceData[index1] * (1 - frac) + sourceData[index2] * frac;
      }
    }
    
    return newBuffer;
  }
  
  // =============================================================================
  // ITEM 424-425: SLICING & TRANSIENT DETECTION
  // =============================================================================
  
  detectTransients(clipId: string, sensitivity: number = 50): number[] {
    const clip = this.clips.get(clipId);
    if (!clip) return [];
    
    const transients: number[] = [];
    const sourceData = clip.sourceBuffer.getChannelData(0);
    
    // Simple onset detection using spectral flux approximation
    const windowSize = 1024;
    const hopSize = 256;
    const threshold = (100 - sensitivity) / 100 * 0.5;
    
    let prevEnergy = 0;
    
    for (let i = 0; i < sourceData.length - windowSize; i += hopSize) {
      // Calculate frame energy
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += sourceData[i + j] * sourceData[i + j];
      }
      energy /= windowSize;
      
      // Detect onset
      const diff = energy - prevEnergy;
      if (diff > threshold && diff / (prevEnergy + 0.0001) > 2) {
        // Avoid duplicate nearby transients
        if (transients.length === 0 || i - transients[transients.length - 1] > windowSize * 4) {
          transients.push(clip.offset + i);
        }
      }
      
      prevEnergy = energy;
    }
    
    return transients;
  }
  
  sliceAtTransients(clipId: string, sensitivity: number = 50): AudioClip[] {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return [];
    
    const transients = this.detectTransients(clipId, sensitivity);
    if (transients.length === 0) return [clip];
    
    const slices: AudioClip[] = [];
    let currentPosition = clip.startTime;
    
    for (let i = 0; i <= transients.length; i++) {
      const sliceStart = i === 0 ? clip.offset : transients[i - 1];
      const sliceEnd = i === transients.length ? clip.offset + clip.duration : transients[i];
      
      if (sliceEnd > sliceStart) {
        const sliceClip: AudioClip = {
          ...clip,
          id: this.generateId(),
          name: `${clip.name}_${i + 1}`,
          startTime: currentPosition,
          offset: sliceStart,
          duration: sliceEnd - sliceStart,
          fadeIn: { duration: 10, curve: 'linear' },
          fadeOut: { duration: 10, curve: 'linear' }
        };
        
        sliceClip.waveformPeaks = this.generateWaveformPeaks(clip.sourceBuffer, sliceStart, sliceEnd);
        
        this.clips.set(sliceClip.id, sliceClip);
        slices.push(sliceClip);
        
        currentPosition += sliceClip.duration;
      }
    }
    
    // Remove original
    this.clips.delete(clipId);
    
    return slices;
  }
  
  sliceToGrid(clipId: string, gridDivision: number): AudioClip[] {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return [];
    
    const sliceLength = Math.round(this.sampleRate * gridDivision / 1000);
    const numSlices = Math.ceil(clip.duration / sliceLength);
    
    const slices: AudioClip[] = [];
    
    for (let i = 0; i < numSlices; i++) {
      const sliceStart = clip.offset + i * sliceLength;
      const sliceEnd = Math.min(sliceStart + sliceLength, clip.offset + clip.duration);
      
      const sliceClip: AudioClip = {
        ...clip,
        id: this.generateId(),
        name: `${clip.name}_${i + 1}`,
        startTime: clip.startTime + i * sliceLength,
        offset: sliceStart,
        duration: sliceEnd - sliceStart,
        fadeIn: { duration: 5, curve: 'linear' },
        fadeOut: { duration: 5, curve: 'linear' }
      };
      
      this.clips.set(sliceClip.id, sliceClip);
      slices.push(sliceClip);
    }
    
    this.clips.delete(clipId);
    return slices;
  }
  
  detectSilence(clipId: string, threshold: number = -60, minDuration: number = 100): { start: number; end: number }[] {
    const clip = this.clips.get(clipId);
    if (!clip) return [];
    
    const silenceRegions: { start: number; end: number }[] = [];
    const sourceData = clip.sourceBuffer.getChannelData(0);
    const thresholdLinear = Math.pow(10, threshold / 20);
    const minSamples = Math.round(minDuration / 1000 * this.sampleRate);
    
    let inSilence = false;
    let silenceStart = 0;
    
    for (let i = 0; i < sourceData.length; i++) {
      const isSilent = Math.abs(sourceData[i]) < thresholdLinear;
      
      if (isSilent && !inSilence) {
        silenceStart = i;
        inSilence = true;
      } else if (!isSilent && inSilence) {
        if (i - silenceStart >= minSamples) {
          silenceRegions.push({ start: silenceStart, end: i });
        }
        inSilence = false;
      }
    }
    
    // Handle trailing silence
    if (inSilence && sourceData.length - silenceStart >= minSamples) {
      silenceRegions.push({ start: silenceStart, end: sourceData.length });
    }
    
    return silenceRegions;
  }
  
  stripSilence(clipId: string, threshold: number = -60, minDuration: number = 100): AudioClip[] {
    const silenceRegions = this.detectSilence(clipId, threshold, minDuration);
    const clip = this.clips.get(clipId);
    if (!clip || silenceRegions.length === 0) return clip ? [clip] : [];
    
    // Create clips from non-silent regions
    const nonSilentClips: AudioClip[] = [];
    let prevEnd = clip.offset;
    let currentTime = clip.startTime;
    
    for (const region of silenceRegions) {
      if (region.start > prevEnd) {
        const audioClip: AudioClip = {
          ...clip,
          id: this.generateId(),
          name: `${clip.name}_${nonSilentClips.length + 1}`,
          startTime: currentTime,
          offset: prevEnd,
          duration: region.start - prevEnd
        };
        
        this.clips.set(audioClip.id, audioClip);
        nonSilentClips.push(audioClip);
        currentTime += audioClip.duration;
      }
      prevEnd = region.end;
    }
    
    // Handle remaining audio after last silence
    if (prevEnd < clip.offset + clip.duration) {
      const audioClip: AudioClip = {
        ...clip,
        id: this.generateId(),
        name: `${clip.name}_${nonSilentClips.length + 1}`,
        startTime: currentTime,
        offset: prevEnd,
        duration: clip.offset + clip.duration - prevEnd
      };
      
      this.clips.set(audioClip.id, audioClip);
      nonSilentClips.push(audioClip);
    }
    
    this.clips.delete(clipId);
    return nonSilentClips;
  }
  
  // =============================================================================
  // WAVEFORM GENERATION
  // =============================================================================
  
  private generateWaveformPeaks(buffer: AudioBuffer, startOffset: number = 0, endOffset?: number): Float32Array[] {
    const peaks: Float32Array[] = [];
    const samplesPerPixel = 256;
    const end = endOffset ?? buffer.length;
    const numPeaks = Math.ceil((end - startOffset) / samplesPerPixel);
    
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const channelData = buffer.getChannelData(ch);
      const channelPeaks = new Float32Array(numPeaks * 2); // min and max for each
      
      for (let i = 0; i < numPeaks; i++) {
        const start = startOffset + i * samplesPerPixel;
        const blockEnd = Math.min(start + samplesPerPixel, end);
        
        let min = 1;
        let max = -1;
        
        for (let j = start; j < blockEnd; j++) {
          const sample = channelData[j];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        
        channelPeaks[i * 2] = min;
        channelPeaks[i * 2 + 1] = max;
      }
      
      peaks.push(channelPeaks);
    }
    
    return peaks;
  }
  
  // =============================================================================
  // AUDIO PROCESSING
  // =============================================================================
  
  normalize(clipId: string, targetDb: number = -1): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    // Find peak
    let maxPeak = 0;
    for (let ch = 0; ch < clip.sourceBuffer.numberOfChannels; ch++) {
      const channelData = clip.sourceBuffer.getChannelData(ch);
      for (let i = clip.offset; i < clip.offset + clip.duration; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }
    
    if (maxPeak > 0) {
      const targetLinear = Math.pow(10, targetDb / 20);
      const gainLinear = targetLinear / maxPeak;
      const gainDb = 20 * Math.log10(gainLinear);
      
      clip.gain = gainDb;
    }
  }
  
  reverse(clipId: string): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked || !this.audioContext) return;
    
    const newBuffer = this.audioContext.createBuffer(
      clip.sourceBuffer.numberOfChannels,
      clip.duration,
      this.sampleRate
    );
    
    for (let ch = 0; ch < clip.sourceBuffer.numberOfChannels; ch++) {
      const sourceData = clip.sourceBuffer.getChannelData(ch);
      const outputData = newBuffer.getChannelData(ch);
      
      for (let i = 0; i < clip.duration; i++) {
        outputData[i] = sourceData[clip.offset + clip.duration - 1 - i];
      }
    }
    
    clip.sourceBuffer = newBuffer;
    clip.offset = 0;
    clip.waveformPeaks = this.generateWaveformPeaks(newBuffer);
    
    this.saveOperation('reverse', [clipId], [], []);
  }
  
  setGain(clipId: string, gainDb: number): void {
    const clip = this.clips.get(clipId);
    if (!clip || clip.locked) return;
    
    clip.gain = Math.max(-60, Math.min(24, gainDb));
  }
  
  // =============================================================================
  // GETTERS
  // =============================================================================
  
  getClip(id: string): AudioClip | undefined {
    return this.clips.get(id);
  }
  
  getAllClips(): AudioClip[] {
    return Array.from(this.clips.values());
  }
  
  getClipsOnTrack(trackId: string): AudioClip[] {
    return Array.from(this.clips.values()).filter(c => c.trackId === trackId);
  }
  
  getClipsInRange(startTime: number, endTime: number): AudioClip[] {
    return Array.from(this.clips.values()).filter(c => 
      c.startTime < endTime && c.startTime + c.duration > startTime
    );
  }
  
  getCrossfades(): Crossfade[] {
    return Array.from(this.crossfades.values());
  }
  
  // =============================================================================
  // UTILITY
  // =============================================================================
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private generateClipColor(): string {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  dispose(): void {
    this.clips.clear();
    this.regions.clear();
    this.crossfades.clear();
    this.clipboard = [];
    this.undoStack = [];
    this.redoStack = [];
    this.audioContext?.close();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createAudioEditingEngine = () => new AudioEditingEngine();

export default AudioEditingEngine;
