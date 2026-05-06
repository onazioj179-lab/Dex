// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * VINX -- PlaybackEngine
 * AudioContext master clock for frame-accurate playback.
 * All timeline positions are integer frame numbers.
 */

import type { VinxSequence, Track, Clip, RenderQuality } from './VinxTypes';
import { frameToSeconds, secondsToFrame } from './VinxTypes';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface TrackAudioNode {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
  element: HTMLVideoElement | HTMLAudioElement;
}

interface PlaybackCallbacks {
  onFrameUpdate: (frame: number) => void;
  onPlaybackEnd: () => void;
  onScopeData?: (data: Float32Array) => void;
}

type QualityScale = 1 | 0.5 | 0.25;

// ---------------------------------------------------------------------------
// PlaybackEngine
// ---------------------------------------------------------------------------

export class PlaybackEngine {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private trackNodes: Map<string, TrackAudioNode> = new Map();
  private videoElements: Map<string, HTMLVideoElement> = new Map();
  private sourceElements: WeakSet<HTMLMediaElement> = new WeakSet();
  private animFrameId: number = 0;
  private startAudioTime: number = 0;
  private startFrame: number = 0;
  private frameRate: number = 30;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1;
  private volume: number = 1;
  private muted: boolean = false;
  private loopEnabled: boolean = false;
  private sequenceDuration: number = 0;
  private inPoint: number | null = null;
  private outPoint: number | null = null;
  private callbacks: PlaybackCallbacks;
  private scopeFrameCounter: number = 0;
  private scopeUpdateInterval: number = 4;
  private renderQuality: RenderQuality = 'auto';
  private lastRenderedFrame: number = -1;
  private sequence: VinxSequence | null = null;
  private disposed: boolean = false;
  private isSeeking: boolean = false;
  private seekTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: PlaybackCallbacks) {
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // INIT
  // -----------------------------------------------------------------------

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: 48000 });
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // -----------------------------------------------------------------------
  // SEQUENCE BINDING
  // -----------------------------------------------------------------------

  setSequence(sequence: VinxSequence, frameRate: number, duration: number): void {
    this.sequence = sequence;
    this.frameRate = frameRate;
    this.sequenceDuration = duration;
    this.inPoint = sequence.inPoint;
    this.outPoint = sequence.outPoint;
  }

  // -----------------------------------------------------------------------
  // MEDIA ELEMENT MANAGEMENT
  // -----------------------------------------------------------------------

  registerVideoElement(clipId: string, element: HTMLVideoElement): void {
    this.videoElements.set(clipId, element);
  }

  unregisterVideoElement(clipId: string): void {
    this.videoElements.delete(clipId);
  }

  registerAudioElement(clipId: string, element: HTMLVideoElement | HTMLAudioElement): void {
    const ctx = this.ensureAudioContext();
    if (this.trackNodes.has(clipId)) return;

    // Guard: an HTMLMediaElement can only have one MediaElementSourceNode.
    // Re-calling createMediaElementSource on the same element throws
    // InvalidStateError. Track elements that already own a source node.
    if (this.sourceElements.has(element)) return;

    let source: MediaElementAudioSourceNode;
    try {
      source = ctx.createMediaElementSource(element);
    } catch {
      // Element already connected to a (possibly different) AudioContext
      return;
    }
    this.sourceElements.add(element);

    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain!);

    this.trackNodes.set(clipId, { source, gain, panner, element });
  }

  unregisterAudioElement(clipId: string): void {
    const node = this.trackNodes.get(clipId);
    if (node) {
      try {
        node.source.disconnect();
        node.gain.disconnect();
        node.panner.disconnect();
      } catch { /* already disconnected */ }
      this.trackNodes.delete(clipId);
    }
  }

  // -----------------------------------------------------------------------
  // TRANSPORT
  // -----------------------------------------------------------------------

  play(fromFrame: number, speed: number): void {
    if (this.disposed) return;
    this.ensureAudioContext();
    this.isPlaying = true;
    this.playbackSpeed = speed;
    this.startFrame = fromFrame;
    this.startAudioTime = this.audioCtx!.currentTime;
    this.lastRenderedFrame = -1;
    this.scopeFrameCounter = 0;
    this.syncMediaElements(fromFrame);
    this.startMediaPlayback(speed);
    this.tick();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.pauseAllMedia();
  }

  stop(): void {
    this.pause();
    this.seekToFrame(0);
  }

  seekToFrame(frame: number): void {
    const clamped = Math.max(0, Math.min(frame, this.sequenceDuration));
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }
    this.isSeeking = true;
    this.startFrame = clamped;
    if (this.audioCtx) {
      this.startAudioTime = this.audioCtx.currentTime;
    }
    this.syncMediaElements(clamped);
    this.callbacks.onFrameUpdate(clamped);
    this.lastRenderedFrame = clamped;

    // Wait for video elements to settle on the new frame before rendering
    const videos = Array.from(this.videoElements.values());
    const pending = videos.filter(v => v.readyState < 2);
    if (pending.length === 0) {
      this.isSeeking = false;
      this.renderFrame(clamped);
    } else {
      let settled = 0;
      const onReady = () => {
        settled++;
        if (settled >= pending.length) {
          if (this.seekTimeoutId) {
            clearTimeout(this.seekTimeoutId);
            this.seekTimeoutId = null;
          }
          pending.forEach(v => v.removeEventListener('seeked', onReady));
          this.isSeeking = false;
          this.renderFrame(clamped);
        }
      };
      pending.forEach(v => v.addEventListener('seeked', onReady, { once: false }));
      // Safety timeout: render after 150ms even if seeked never fires
      this.seekTimeoutId = setTimeout(() => {
        this.seekTimeoutId = null;
        pending.forEach(v => v.removeEventListener('seeked', onReady));
        this.isSeeking = false;
        this.renderFrame(clamped);
      }, 150);
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(2, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : this.volume;
    }
  }

  setLoopEnabled(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  setPlaybackSpeed(speed: number): void {
    if (this.isPlaying) {
      const currentFrame = this.getCurrentFrame();
      this.startFrame = currentFrame;
      this.startAudioTime = this.audioCtx!.currentTime;
      this.playbackSpeed = speed;
      this.updateMediaPlaybackRate(speed);
    } else {
      this.playbackSpeed = speed;
    }
  }

  setRenderQuality(quality: RenderQuality): void {
    this.renderQuality = quality;
  }

  setScopeUpdateInterval(interval: number): void {
    this.scopeUpdateInterval = Math.max(1, interval);
  }

  setTrackVolume(clipId: string, vol: number): void {
    const node = this.trackNodes.get(clipId);
    if (node) {
      node.gain.gain.value = Math.max(0, Math.min(2, vol));
    }
  }

  setTrackPan(clipId: string, pan: number): void {
    const node = this.trackNodes.get(clipId);
    if (node) {
      node.panner.pan.value = Math.max(-1, Math.min(1, pan));
    }
  }

  setTrackMuted(clipId: string, muted: boolean): void {
    const node = this.trackNodes.get(clipId);
    if (node) {
      node.gain.gain.value = muted ? 0 : 1;
    }
  }

  // -----------------------------------------------------------------------
  // PLAYBACK LOOP
  // -----------------------------------------------------------------------

  private tick = (): void => {
    if (!this.isPlaying || this.disposed) return;

    const currentFrame = this.getCurrentFrame();
    const endFrame = this.outPoint !== null ? this.outPoint : this.sequenceDuration;

    if (currentFrame >= endFrame) {
      if (this.loopEnabled) {
        const loopStart = this.inPoint !== null ? this.inPoint : 0;
        this.startFrame = loopStart;
        this.startAudioTime = this.audioCtx!.currentTime;
        this.syncMediaElements(loopStart);
        this.startMediaPlayback(this.playbackSpeed);
      } else {
        this.isPlaying = false;
        this.pauseAllMedia();
        this.callbacks.onPlaybackEnd();
        return;
      }
    }

    if (currentFrame !== this.lastRenderedFrame) {
      this.lastRenderedFrame = currentFrame;
      this.callbacks.onFrameUpdate(currentFrame);
      this.renderFrame(currentFrame);
      this.updateActiveClips(currentFrame);

      this.scopeFrameCounter++;
      if (this.scopeFrameCounter >= this.scopeUpdateInterval && this.callbacks.onScopeData && this.analyser) {
        const data = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatTimeDomainData(data);
        this.callbacks.onScopeData(data);
        this.scopeFrameCounter = 0;
      }
    }

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  getCurrentFrame(): number {
    if (!this.audioCtx) return this.startFrame;
    const elapsed = this.audioCtx.currentTime - this.startAudioTime;
    const frameOffset = Math.floor(elapsed * this.playbackSpeed * this.frameRate);
    return this.startFrame + frameOffset;
  }

  // -----------------------------------------------------------------------
  // MEDIA SYNC
  // -----------------------------------------------------------------------

  private syncMediaElements(frame: number): void {
    if (!this.sequence) return;
    const seconds = frameToSeconds(frame, this.frameRate);

    for (const track of this.sequence.tracks) {
      for (const clip of track.clips) {
        const clipStart = frameToSeconds(clip.startFrame, this.frameRate);
        const clipEnd = frameToSeconds(clip.endFrame, this.frameRate);
        const mediaIn = frameToSeconds(clip.mediaInFrame, this.frameRate);
        const offsetInMedia = seconds - clipStart + mediaIn;

        const video = this.videoElements.get(clip.id);
        if (video) {
          if (seconds >= clipStart && seconds < clipEnd) {
            try { video.currentTime = offsetInMedia; } catch { /* seek may fail on detached/cross-origin element */ }
            video.style.display = '';
          } else {
            video.style.display = 'none';
          }
        }

        const audioNode = this.trackNodes.get(clip.id);
        if (audioNode?.element) {
          if (seconds >= clipStart && seconds < clipEnd) {
            try { audioNode.element.currentTime = offsetInMedia; } catch { /* seek may fail */ }
          }
        }
      }
    }
  }

  private startMediaPlayback(speed: number): void {
    if (!this.sequence) return;
    const currentSeconds = frameToSeconds(this.getCurrentFrame(), this.frameRate);

    for (const track of this.sequence.tracks) {
      if (track.muted) continue;
      for (const clip of track.clips) {
        const clipStart = frameToSeconds(clip.startFrame, this.frameRate);
        const clipEnd = frameToSeconds(clip.endFrame, this.frameRate);

        if (currentSeconds >= clipStart && currentSeconds < clipEnd) {
          const video = this.videoElements.get(clip.id);
          if (video) {
            video.playbackRate = speed;
            video.play().catch((e: unknown) => { console.warn('[DEX]', e); });
          }
          const audioNode = this.trackNodes.get(clip.id);
          if (audioNode?.element) {
            audioNode.element.playbackRate = speed;
            audioNode.element.play().catch((e: unknown) => { console.warn('[DEX]', e); });
          }
        }
      }
    }
  }

  private pauseAllMedia(): void {
    for (const [, element] of this.videoElements) {
      element.pause();
    }
    for (const [, node] of this.trackNodes) {
      node.element?.pause();
    }
  }

  private updateMediaPlaybackRate(speed: number): void {
    for (const [, element] of this.videoElements) {
      element.playbackRate = speed;
    }
    for (const [, node] of this.trackNodes) {
      if (node.element) node.element.playbackRate = speed;
    }
  }

  private updateActiveClips(frame: number): void {
    if (!this.sequence) return;
    const seconds = frameToSeconds(frame, this.frameRate);

    for (const track of this.sequence.tracks) {
      if (track.muted) continue;
      for (const clip of track.clips) {
        const clipStart = frameToSeconds(clip.startFrame, this.frameRate);
        const clipEnd = frameToSeconds(clip.endFrame, this.frameRate);
        const isInRange = seconds >= clipStart && seconds < clipEnd;

        const video = this.videoElements.get(clip.id);
        if (video) {
          if (isInRange && video.paused && this.isPlaying) {
            const mediaIn = frameToSeconds(clip.mediaInFrame, this.frameRate);
            video.currentTime = seconds - clipStart + mediaIn;
            video.playbackRate = this.playbackSpeed;
            video.play().catch((e: unknown) => { console.warn('[DEX]', e); });
          } else if (!isInRange && !video.paused) {
            video.pause();
          }
          video.style.display = isInRange ? '' : 'none';
        }

        const audioNode = this.trackNodes.get(clip.id);
        if (audioNode) {
          if (isInRange && audioNode.element.paused && this.isPlaying) {
            const mediaIn = frameToSeconds(clip.mediaInFrame, this.frameRate);
            audioNode.element.currentTime = seconds - clipStart + mediaIn;
            audioNode.element.playbackRate = this.playbackSpeed;
            audioNode.element.play().catch((e: unknown) => { console.warn('[DEX]', e); });
          } else if (!isInRange && !audioNode.element.paused) {
            audioNode.element.pause();
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // RENDERING
  // -----------------------------------------------------------------------

  private renderFrame(frame: number): void {
    // Frame rendering handled by React viewer via onFrameUpdate callback.
    // Offscreen composition handled per-clip by the Viewer component.
  }

  getQualityScale(): QualityScale {
    if (this.renderQuality === 'full') return 1;
    if (this.renderQuality === 'half') return 0.5;
    if (this.renderQuality === 'quarter') return 0.25;
    // auto: reduce during playback
    return this.isPlaying ? 0.5 : 1;
  }

  // -----------------------------------------------------------------------
  // SCOPE DATA
  // -----------------------------------------------------------------------

  getWaveformData(): Float32Array | null {
    if (!this.analyser) return null;
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatTimeDomainData(data);
    return data;
  }

  getFrequencyData(): Float32Array | null {
    if (!this.analyser) return null;
    const data = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(data);
    return data;
  }

  // -----------------------------------------------------------------------
  // SCRUB AUDIO
  // -----------------------------------------------------------------------

  scrubToFrame(frame: number): void {
    this.seekToFrame(frame);
  }

  // -----------------------------------------------------------------------
  // DISPOSE
  // -----------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    this.pause();
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }

    for (const [id] of this.trackNodes) {
      this.unregisterAudioElement(id);
    }
    this.trackNodes.clear();
    this.videoElements.clear();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch((e: unknown) => { console.warn('[DEX]', e); });
    }
    this.audioCtx = null;
    this.masterGain = null;
    this.analyser = null;
  }
}
