// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - IMOSION Recording System
// Professional audio recording rivaling Ableton Live / Logic Pro
// Items 301-325 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface AudioDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
  channels: number;
  sampleRates: number[];
  bufferSizes: number[];
  isDefault: boolean;
  driver: 'wasapi' | 'asio' | 'coreaudio' | 'alsa' | 'jack';
}

export interface RecordingSettings {
  inputDevice: string;
  outputDevice: string;
  sampleRate: number;
  bitDepth: 16 | 24 | 32;
  bufferSize: number;
  channels: RecordingChannel[];
  latencyCompensation: number;  // samples
  monitoringMode: 'off' | 'auto' | 'on';
  countIn: CountInSettings;
  punch: PunchSettings;
  loop: LoopSettings;
}

export interface RecordingChannel {
  id: string;
  name: string;
  inputIndex: number;
  armed: boolean;
  monitoring: boolean;
  gain: number;         // dB
  pan: number;          // -1 to 1
  muted: boolean;
  solo: boolean;
  phase: boolean;       // Phase invert
  mono: boolean;        // Mono/stereo
  linkGroup?: string;   // Stereo link group
}

export interface CountInSettings {
  enabled: boolean;
  bars: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  clickTrack: boolean;
  clickSound: 'woodblock' | 'metronome' | 'cowbell' | 'custom';
  clickVolume: number;
}

export interface PunchSettings {
  enabled: boolean;
  mode: 'manual' | 'auto';
  punchIn: number;      // Time in samples
  punchOut: number;
  preRoll: number;      // Bars
  postRoll: number;
}

export interface LoopSettings {
  enabled: boolean;
  start: number;        // Time in samples
  end: number;
  takes: RecordingTake[];
  compMode: boolean;    // Take comping mode
}

export interface RecordingTake {
  id: string;
  index: number;
  audioData: Float32Array[];
  startTime: number;
  duration: number;
  rating: number;       // 1-5 stars
  color: string;
  selected: boolean;
  muted: boolean;
}

export interface RecordingRegion {
  id: string;
  channelId: string;
  startTime: number;
  endTime: number;
  audioData: Float32Array[];
  waveform: Float32Array;
  takes: RecordingTake[];
  selectedTakeId: string;
  fadeIn: number;
  fadeOut: number;
  gain: number;
}

export interface InputMeter {
  channelId: string;
  peak: number;         // 0-1
  rms: number;          // 0-1
  peakHold: number;
  clip: boolean;
  history: Float32Array;
}

export interface RecordingSession {
  id: string;
  name: string;
  projectPath: string;
  createdAt: number;
  settings: RecordingSettings;
  regions: Map<string, RecordingRegion>;
  markers: RecordingMarker[];
  notes: string;
}

export interface RecordingMarker {
  id: string;
  time: number;
  name: string;
  color: string;
  type: 'marker' | 'region' | 'cue';
}

// =============================================================================
// ITEM 301: RECORDING ENGINE
// =============================================================================

export class RecordingEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private inputNode: MediaStreamAudioSourceNode | null = null;
  private analyserNodes: Map<string, AnalyserNode> = new Map();
  private gainNodes: Map<string, GainNode> = new Map();
  private panNodes: Map<string, StereoPannerNode> = new Map();
  private recorderNodes: Map<string, AudioWorkletNode> = new Map();
  
  private settings: RecordingSettings;
  private session: RecordingSession | null = null;
  private devices: AudioDevice[] = [];
  private meters: Map<string, InputMeter> = new Map();
  
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private recordingStartTime: number = 0;
  private recordingPosition: number = 0;
  
  private buffers: Map<string, Float32Array[]> = new Map();
  private meterCallback?: (meters: Map<string, InputMeter>) => void;
  
  constructor() {
    this.settings = this.createDefaultSettings();
  }
  
  // =============================================================================
  // ITEM 302: DEVICE ENUMERATION
  // =============================================================================
  
  async enumerateDevices(): Promise<AudioDevice[]> {
    try {
      // Request permissions first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = [];
      
      for (const device of devices) {
        if (device.kind === 'audioinput' || device.kind === 'audiooutput') {
          this.devices.push({
            id: device.deviceId,
            name: device.label || `Device ${this.devices.length + 1}`,
            type: device.kind === 'audioinput' ? 'input' : 'output',
            channels: 2, // Default, would need to probe
            sampleRates: [44100, 48000, 88200, 96000, 176400, 192000],
            bufferSizes: [32, 64, 128, 256, 512, 1024, 2048],
            isDefault: device.deviceId === 'default',
            driver: this.detectDriver()
          });
        }
      }
      
      // Listen for device changes
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.enumerateDevices();
      });
      
      return this.devices;
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  }
  
  private detectDriver(): AudioDevice['driver'] {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'wasapi';
    if (ua.includes('mac')) return 'coreaudio';
    if (ua.includes('linux')) return 'alsa';
    return 'wasapi';
  }
  
  getInputDevices(): AudioDevice[] {
    return this.devices.filter(d => d.type === 'input');
  }
  
  getOutputDevices(): AudioDevice[] {
    return this.devices.filter(d => d.type === 'output');
  }
  
  // =============================================================================
  // ITEM 303: AUDIO CONTEXT SETUP
  // =============================================================================
  
  async initialize(settings?: Partial<RecordingSettings>): Promise<void> {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
    
    // Create audio context with specified sample rate
    this.audioContext = new AudioContext({
      sampleRate: this.settings.sampleRate,
      latencyHint: 'interactive'
    });
    
    // Register audio worklet for recording
    await this.audioContext.audioWorklet.addModule(
      this.createRecorderWorklet()
    );
    
    // Set up input stream
    await this.setupInputStream();
    
    // Initialize channel routing
    this.setupChannelRouting();
    
    // Start metering
    this.startMetering();
  }
  
  private createRecorderWorklet(): string {
    const workletCode = `
      class RecorderProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffers = [];
          this.isRecording = false;
          
          this.port.onmessage = (event) => {
            if (event.data.type === 'start') {
              this.isRecording = true;
              this.buffers = [];
            } else if (event.data.type === 'stop') {
              this.isRecording = false;
              this.port.postMessage({ type: 'data', buffers: this.buffers });
              this.buffers = [];
            }
          };
        }
        
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0 && this.isRecording) {
            const channelData = [];
            for (let ch = 0; ch < input.length; ch++) {
              channelData.push(new Float32Array(input[ch]));
            }
            this.buffers.push(channelData);
          }
          return true;
        }
      }
      
      registerProcessor('recorder-processor', RecorderProcessor);
    `;
    
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }
  
  private async setupInputStream(): Promise<void> {
    if (!this.audioContext) return;
    
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: this.settings.inputDevice ? { exact: this.settings.inputDevice } : undefined,
        sampleRate: this.settings.sampleRate,
        channelCount: Math.max(...this.settings.channels.map(c => c.inputIndex + 1)),
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    };
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.inputNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    } catch (error) {
      console.error('Failed to get input stream:', error);
      throw error;
    }
  }
  
  private setupChannelRouting(): void {
    if (!this.audioContext || !this.inputNode) return;
    
    // Create channel splitter
    const inputChannels = this.inputNode.channelCount;
    const splitter = this.audioContext.createChannelSplitter(inputChannels);
    this.inputNode.connect(splitter);
    
    // Create processing chain for each recording channel
    for (const channel of this.settings.channels) {
      // Gain node
      const gain = this.audioContext.createGain();
      gain.gain.value = this.dbToLinear(channel.gain);
      this.gainNodes.set(channel.id, gain);
      
      // Pan node
      const pan = this.audioContext.createStereoPanner();
      pan.pan.value = channel.pan;
      this.panNodes.set(channel.id, pan);
      
      // Analyser for metering
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      this.analyserNodes.set(channel.id, analyser);
      
      // Recorder worklet
      const recorder = new AudioWorkletNode(this.audioContext, 'recorder-processor');
      this.recorderNodes.set(channel.id, recorder);
      
      // Connect chain
      if (channel.inputIndex < inputChannels) {
        splitter.connect(gain, channel.inputIndex);
      }
      gain.connect(pan);
      pan.connect(analyser);
      analyser.connect(recorder);
      
      // Monitoring
      if (channel.monitoring) {
        pan.connect(this.audioContext.destination);
      }
      
      // Handle recorder messages
      recorder.port.onmessage = (event) => {
        if (event.data.type === 'data') {
          this.handleRecordedData(channel.id, event.data.buffers);
        }
      };
      
      // Initialize meter
      this.meters.set(channel.id, {
        channelId: channel.id,
        peak: 0,
        rms: 0,
        peakHold: 0,
        clip: false,
        history: new Float32Array(100)
      });
    }
  }
  
  // =============================================================================
  // ITEM 304-308: RECORDING CONTROL
  // =============================================================================
  
  async startRecording(): Promise<void> {
    if (this.isRecording) return;
    
    // Count-in if enabled
    if (this.settings.countIn.enabled) {
      await this.playCountIn();
    }
    
    // Punch-in pre-roll
    if (this.settings.punch.enabled && this.settings.punch.mode === 'auto') {
      await this.playPreRoll();
    }
    
    this.isRecording = true;
    this.recordingStartTime = this.audioContext?.currentTime || 0;
    
    // Initialize buffers
    for (const channel of this.settings.channels) {
      if (channel.armed) {
        this.buffers.set(channel.id, []);
        this.recorderNodes.get(channel.id)?.port.postMessage({ type: 'start' });
      }
    }
  }
  
  pauseRecording(): void {
    if (!this.isRecording) return;
    this.isPaused = true;
    this.recordingPosition = (this.audioContext?.currentTime || 0) - this.recordingStartTime;
  }
  
  resumeRecording(): void {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this.recordingStartTime = (this.audioContext?.currentTime || 0) - this.recordingPosition;
  }
  
  async stopRecording(): Promise<RecordingRegion[]> {
    if (!this.isRecording) return [];
    
    this.isRecording = false;
    this.isPaused = false;
    
    const regions: RecordingRegion[] = [];
    
    // Stop all recorders and collect data
    for (const channel of this.settings.channels) {
      if (channel.armed) {
        const recorder = this.recorderNodes.get(channel.id);
        if (recorder) {
          recorder.port.postMessage({ type: 'stop' });
        }
      }
    }
    
    // Wait for data to be collected (handled in message callback)
    await this.sleep(100);
    
    // Create regions from buffers
    for (const channel of this.settings.channels) {
      if (channel.armed) {
        const buffer = this.buffers.get(channel.id);
        if (buffer && buffer.length > 0) {
          const region = this.createRegion(channel.id, buffer);
          regions.push(region);
          
          if (this.session) {
            this.session.regions.set(region.id, region);
          }
        }
      }
    }
    
    return regions;
  }
  
  private handleRecordedData(channelId: string, buffers: Float32Array[][]): void {
    const existingBuffer = this.buffers.get(channelId) || [];
    
    for (const chunk of buffers) {
      existingBuffer.push(...chunk);
    }
    
    this.buffers.set(channelId, existingBuffer);
  }
  
  private createRegion(channelId: string, buffer: Float32Array[]): RecordingRegion {
    // Merge all chunks into a single buffer
    const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    
    const mergedData = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of buffer) {
      mergedData.set(chunk, offset);
      offset += chunk.length;
    }
    
    const audioData: Float32Array[] = [mergedData];
    
    // Generate waveform
    const waveform = this.generateWaveform(audioData[0], 1000);
    
    return {
      id: this.generateId(),
      channelId,
      startTime: Math.round(this.recordingStartTime * this.settings.sampleRate),
      endTime: Math.round((this.audioContext?.currentTime || 0) * this.settings.sampleRate),
      audioData,
      waveform,
      takes: [{
        id: this.generateId(),
        index: 0,
        audioData,
        startTime: 0,
        duration: totalLength / this.settings.sampleRate,
        rating: 0,
        color: '#3b82f6',
        selected: true,
        muted: false
      }],
      selectedTakeId: '',
      fadeIn: 0,
      fadeOut: 0,
      gain: 0
    };
  }
  
  private generateWaveform(data: Float32Array, samples: number): Float32Array {
    const waveform = new Float32Array(samples);
    const blockSize = Math.floor(data.length / samples);
    
    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      const end = start + blockSize;
      let max = 0;
      
      for (let j = start; j < end && j < data.length; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      
      waveform[i] = max;
    }
    
    return waveform;
  }
  
  // =============================================================================
  // ITEM 309-312: COUNT-IN & CLICK TRACK
  // =============================================================================
  
  private async playCountIn(): Promise<void> {
    if (!this.audioContext || !this.settings.countIn.enabled) return;
    
    const { bars, tempo, timeSignature, clickTrack, clickSound, clickVolume } = this.settings.countIn;
    const beatsPerBar = timeSignature.numerator;
    const beatDuration = 60 / tempo;
    const totalBeats = bars * beatsPerBar;
    
    if (!clickTrack) {
      // Just wait
      await this.sleep(totalBeats * beatDuration * 1000);
      return;
    }
    
    // Generate click sounds
    const highClick = await this.generateClickSound(clickSound, 1000, clickVolume);
    const lowClick = await this.generateClickSound(clickSound, 800, clickVolume);
    
    const startTime = this.audioContext.currentTime;
    
    for (let beat = 0; beat < totalBeats; beat++) {
      const isDownbeat = beat % beatsPerBar === 0;
      const clickBuffer = isDownbeat ? highClick : lowClick;
      
      const source = this.audioContext.createBufferSource();
      source.buffer = clickBuffer;
      source.connect(this.audioContext.destination);
      source.start(startTime + beat * beatDuration);
    }
    
    await this.sleep(totalBeats * beatDuration * 1000);
  }
  
  private async generateClickSound(
    type: string,
    frequency: number,
    volume: number
  ): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('No audio context');
    
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.05;
    const samples = Math.floor(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    
    const gain = this.dbToLinear(volume);
    
    switch (type) {
      case 'woodblock':
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          const envelope = Math.exp(-t * 50);
          data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * gain;
        }
        break;
        
      case 'metronome':
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          const envelope = Math.exp(-t * 30);
          const harmonics = Math.sin(2 * Math.PI * frequency * t) +
                           0.5 * Math.sin(4 * Math.PI * frequency * t) +
                           0.25 * Math.sin(6 * Math.PI * frequency * t);
          data[i] = harmonics * envelope * gain * 0.5;
        }
        break;
        
      case 'cowbell':
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          const envelope = Math.exp(-t * 20);
          const metallic = Math.sin(2 * Math.PI * frequency * t) +
                          0.8 * Math.sin(2 * Math.PI * frequency * 1.5 * t) +
                          0.4 * Math.sin(2 * Math.PI * frequency * 2 * t);
          data[i] = metallic * envelope * gain * 0.3;
        }
        break;
        
      default:
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 40) * gain;
        }
    }
    
    return buffer;
  }
  
  // =============================================================================
  // ITEM 313-316: PUNCH RECORDING
  // =============================================================================
  
  private async playPreRoll(): Promise<void> {
    if (!this.settings.punch.enabled) return;
    
    const { preRoll, tempo } = this.settings.punch as any;
    const { numerator: beatsPerBar } = this.settings.countIn.timeSignature;
    const beatDuration = 60 / (tempo || this.settings.countIn.tempo);
    const preRollDuration = preRoll * beatsPerBar * beatDuration;
    
    // Would play existing audio during pre-roll
    await this.sleep(preRollDuration * 1000);
  }
  
  setPunchPoints(punchIn: number, punchOut: number): void {
    this.settings.punch.punchIn = punchIn;
    this.settings.punch.punchOut = punchOut;
    this.settings.punch.enabled = true;
  }
  
  clearPunchPoints(): void {
    this.settings.punch.enabled = false;
    this.settings.punch.punchIn = 0;
    this.settings.punch.punchOut = 0;
  }
  
  isPunchActive(): boolean {
    if (!this.settings.punch.enabled) return false;
    
    const currentSample = Math.round((this.audioContext?.currentTime || 0) * this.settings.sampleRate);
    return currentSample >= this.settings.punch.punchIn && 
           currentSample <= this.settings.punch.punchOut;
  }
  
  // =============================================================================
  // ITEM 317-320: LOOP RECORDING & TAKES
  // =============================================================================
  
  setLoopRegion(start: number, end: number): void {
    this.settings.loop.start = start;
    this.settings.loop.end = end;
    this.settings.loop.enabled = true;
    this.settings.loop.takes = [];
  }
  
  clearLoopRegion(): void {
    this.settings.loop.enabled = false;
  }
  
  enableCompMode(enabled: boolean): void {
    this.settings.loop.compMode = enabled;
  }
  
  async recordLoopTake(): Promise<RecordingTake | null> {
    if (!this.isRecording || !this.settings.loop.enabled) return null;
    
    const takeIndex = this.settings.loop.takes.length;
    
    // Record for loop duration
    const loopDuration = (this.settings.loop.end - this.settings.loop.start) / this.settings.sampleRate;
    await this.sleep(loopDuration * 1000);
    
    // Create take from current buffer
    const buffer = this.buffers.get(this.settings.channels[0].id);
    if (!buffer) return null;
    
    const take: RecordingTake = {
      id: this.generateId(),
      index: takeIndex,
      audioData: this.mergeBufferChunks(buffer),
      startTime: this.settings.loop.start,
      duration: loopDuration,
      rating: 0,
      color: this.generateTakeColor(takeIndex),
      selected: false,
      muted: false
    };
    
    this.settings.loop.takes.push(take);
    
    // Clear buffer for next take
    this.buffers.set(this.settings.channels[0].id, []);
    
    return take;
  }
  
  selectTake(regionId: string, takeId: string): void {
    const region = this.session?.regions.get(regionId);
    if (!region) return;
    
    region.takes.forEach(t => t.selected = t.id === takeId);
    region.selectedTakeId = takeId;
  }
  
  rateTake(regionId: string, takeId: string, rating: number): void {
    const region = this.session?.regions.get(regionId);
    if (!region) return;
    
    const take = region.takes.find(t => t.id === takeId);
    if (take) {
      take.rating = Math.max(0, Math.min(5, rating));
    }
  }
  
  deleteTake(regionId: string, takeId: string): void {
    const region = this.session?.regions.get(regionId);
    if (!region) return;
    
    const index = region.takes.findIndex(t => t.id === takeId);
    if (index !== -1) {
      region.takes.splice(index, 1);
    }
  }
  
  compTakes(regionId: string, segments: Array<{ takeId: string; start: number; end: number }>): Float32Array[] {
    const region = this.session?.regions.get(regionId);
    if (!region) return [];
    
    const sampleRate = this.settings.sampleRate;
    const duration = region.endTime - region.startTime;
    const channels = region.audioData.length;
    
    const result: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      result.push(new Float32Array(duration));
    }
    
    // Copy segments from each take
    for (const segment of segments) {
      const take = region.takes.find(t => t.id === segment.takeId);
      if (!take) continue;
      
      const startSample = Math.floor(segment.start * sampleRate);
      const endSample = Math.floor(segment.end * sampleRate);
      
      for (let ch = 0; ch < channels; ch++) {
        for (let i = startSample; i < endSample && i < duration; i++) {
          const takeIndex = i - Math.floor(take.startTime * sampleRate);
          if (takeIndex >= 0 && takeIndex < take.audioData[ch].length) {
            result[ch][i] = take.audioData[ch][takeIndex];
          }
        }
      }
    }
    
    return result;
  }
  
  private mergeBufferChunks(buffer: Float32Array[]): Float32Array[] {
    const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const channelCount = 2; // Assume stereo
    
    const result: Float32Array[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      result.push(new Float32Array(totalLength));
    }
    
    let offset = 0;
    for (const chunk of buffer) {
      result[0].set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }
  
  private generateTakeColor(index: number): string {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    return colors[index % colors.length];
  }
  
  // =============================================================================
  // ITEM 321-323: INPUT METERING
  // =============================================================================
  
  private startMetering(): void {
    const update = () => {
      for (const channel of this.settings.channels) {
        const analyser = this.analyserNodes.get(channel.id);
        const meter = this.meters.get(channel.id);
        
        if (analyser && meter) {
          const dataArray = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(dataArray);
          
          // Calculate peak and RMS
          let peak = 0;
          let sumSquares = 0;
          
          for (let i = 0; i < dataArray.length; i++) {
            const abs = Math.abs(dataArray[i]);
            if (abs > peak) peak = abs;
            sumSquares += dataArray[i] * dataArray[i];
          }
          
          const rms = Math.sqrt(sumSquares / dataArray.length);
          
          // Update meter
          meter.peak = peak;
          meter.rms = rms;
          meter.clip = peak >= 0.99;
          
          // Peak hold (decay over time)
          if (peak > meter.peakHold) {
            meter.peakHold = peak;
          } else {
            meter.peakHold *= 0.99;
          }
          
          // Update history
          meter.history.copyWithin(0, 1);
          meter.history[meter.history.length - 1] = peak;
        }
      }
      
      this.meterCallback?.(this.meters);
      
      if (this.audioContext && this.audioContext.state === 'running') {
        requestAnimationFrame(update);
      }
    };
    
    update();
  }
  
  setMeterCallback(callback: (meters: Map<string, InputMeter>) => void): void {
    this.meterCallback = callback;
  }
  
  getMeter(channelId: string): InputMeter | undefined {
    return this.meters.get(channelId);
  }
  
  resetClip(channelId: string): void {
    const meter = this.meters.get(channelId);
    if (meter) {
      meter.clip = false;
      meter.peakHold = 0;
    }
  }
  
  resetAllClips(): void {
    for (const meter of this.meters.values()) {
      meter.clip = false;
      meter.peakHold = 0;
    }
  }
  
  // =============================================================================
  // ITEM 324-325: CHANNEL CONTROL
  // =============================================================================
  
  armChannel(channelId: string, armed: boolean): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    if (channel) {
      channel.armed = armed;
    }
  }
  
  armAllChannels(armed: boolean): void {
    for (const channel of this.settings.channels) {
      channel.armed = armed;
    }
  }
  
  setChannelGain(channelId: string, gainDb: number): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    const gainNode = this.gainNodes.get(channelId);
    
    if (channel && gainNode) {
      channel.gain = gainDb;
      gainNode.gain.value = this.dbToLinear(gainDb);
    }
  }
  
  setChannelPan(channelId: string, pan: number): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    const panNode = this.panNodes.get(channelId);
    
    if (channel && panNode) {
      channel.pan = Math.max(-1, Math.min(1, pan));
      panNode.pan.value = channel.pan;
    }
  }
  
  setChannelMonitoring(channelId: string, monitoring: boolean): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    if (!channel || !this.audioContext) return;
    
    const panNode = this.panNodes.get(channelId);
    if (!panNode) return;
    
    if (monitoring && !channel.monitoring) {
      panNode.connect(this.audioContext.destination);
    } else if (!monitoring && channel.monitoring) {
      panNode.disconnect(this.audioContext.destination);
    }
    
    channel.monitoring = monitoring;
  }
  
  toggleChannelPhase(channelId: string): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    if (channel) {
      channel.phase = !channel.phase;
      // Would need to insert phase inverter node
    }
  }
  
  toggleChannelMono(channelId: string): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    if (channel) {
      channel.mono = !channel.mono;
      // Would need to adjust channel merger/splitter
    }
  }
  
  linkChannels(channelIds: string[]): void {
    const groupId = this.generateId();
    for (const id of channelIds) {
      const channel = this.settings.channels.find(c => c.id === id);
      if (channel) {
        channel.linkGroup = groupId;
      }
    }
  }
  
  unlinkChannel(channelId: string): void {
    const channel = this.settings.channels.find(c => c.id === channelId);
    if (channel) {
      channel.linkGroup = undefined;
    }
  }
  
  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================
  
  createSession(name: string, projectPath: string): RecordingSession {
    this.session = {
      id: this.generateId(),
      name,
      projectPath,
      createdAt: Date.now(),
      settings: { ...this.settings },
      regions: new Map(),
      markers: [],
      notes: ''
    };
    
    return this.session;
  }
  
  getSession(): RecordingSession | null {
    return this.session;
  }
  
  addMarker(time: number, name: string, type: RecordingMarker['type'] = 'marker'): RecordingMarker {
    const marker: RecordingMarker = {
      id: this.generateId(),
      time,
      name,
      color: '#f59e0b',
      type
    };
    
    this.session?.markers.push(marker);
    return marker;
  }
  
  deleteMarker(markerId: string): void {
    if (!this.session) return;
    const index = this.session.markers.findIndex(m => m.id === markerId);
    if (index !== -1) {
      this.session.markers.splice(index, 1);
    }
  }
  
  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  
  private createDefaultSettings(): RecordingSettings {
    return {
      inputDevice: '',
      outputDevice: '',
      sampleRate: 48000,
      bitDepth: 24,
      bufferSize: 256,
      channels: [
        {
          id: '1',
          name: 'Input 1',
          inputIndex: 0,
          armed: true,
          monitoring: false,
          gain: 0,
          pan: 0,
          muted: false,
          solo: false,
          phase: false,
          mono: false
        },
        {
          id: '2',
          name: 'Input 2',
          inputIndex: 1,
          armed: true,
          monitoring: false,
          gain: 0,
          pan: 0,
          muted: false,
          solo: false,
          phase: false,
          mono: false
        }
      ],
      latencyCompensation: 0,
      monitoringMode: 'auto',
      countIn: {
        enabled: false,
        bars: 1,
        tempo: 120,
        timeSignature: { numerator: 4, denominator: 4 },
        clickTrack: true,
        clickSound: 'woodblock',
        clickVolume: -6
      },
      punch: {
        enabled: false,
        mode: 'manual',
        punchIn: 0,
        punchOut: 0,
        preRoll: 1,
        postRoll: 1
      },
      loop: {
        enabled: false,
        start: 0,
        end: 0,
        takes: [],
        compMode: false
      }
    };
  }
  
  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
  
  private linearToDb(linear: number): number {
    return 20 * Math.log10(Math.max(0.0001, linear));
  }
  
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // =============================================================================
  // CLEANUP
  // =============================================================================
  
  async dispose(): Promise<void> {
    this.isRecording = false;
    
    // Stop all recorders
    for (const recorder of this.recorderNodes.values()) {
      recorder.port.postMessage({ type: 'stop' });
      recorder.disconnect();
    }
    
    // Disconnect nodes
    for (const node of this.gainNodes.values()) node.disconnect();
    for (const node of this.panNodes.values()) node.disconnect();
    for (const node of this.analyserNodes.values()) node.disconnect();
    
    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
    }
    
    // Clear maps
    this.gainNodes.clear();
    this.panNodes.clear();
    this.analyserNodes.clear();
    this.recorderNodes.clear();
    this.meters.clear();
    this.buffers.clear();
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createRecordingEngine = () => new RecordingEngine();

export default RecordingEngine;
