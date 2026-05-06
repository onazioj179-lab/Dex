// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - IMOSION MIDI System
// Professional MIDI handling rivaling Ableton Live / Logic Pro
// Items 326-350 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface MIDIDevice {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

export interface MIDIMessage {
  type: MIDIMessageType;
  channel: number;        // 0-15
  data1: number;          // Note number, CC number, etc.
  data2: number;          // Velocity, CC value, etc.
  timestamp: number;      // Performance timestamp
}

export type MIDIMessageType = 
  | 'note-on' | 'note-off' | 'control-change' | 'program-change'
  | 'pitch-bend' | 'aftertouch' | 'poly-aftertouch'
  | 'sysex' | 'timing-clock' | 'start' | 'stop' | 'continue'
  | 'active-sensing' | 'reset';

export interface MIDINote {
  id: string;
  pitch: number;          // 0-127
  velocity: number;       // 0-127
  startTime: number;      // Ticks
  duration: number;       // Ticks
  channel: number;        // 0-15
  selected: boolean;
  muted: boolean;
  color?: string;
}

export interface MIDIClip {
  id: string;
  name: string;
  notes: MIDINote[];
  length: number;         // Ticks
  loopStart: number;
  loopEnd: number;
  loopEnabled: boolean;
  timeSignature: { numerator: number; denominator: number };
  color: string;
}

export interface MIDITrack {
  id: string;
  name: string;
  clips: Map<number, MIDIClip>;  // Position -> Clip
  channel: number;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  instrument?: VirtualInstrument;
  effects: MIDIEffect[];
  input?: string;         // Device ID
  output?: string;        // Device ID
  quantize: QuantizeSettings;
}

export interface QuantizeSettings {
  enabled: boolean;
  grid: QuantizeGrid;
  strength: number;       // 0-100
  swing: number;          // -100 to 100
  swingGrid: QuantizeGrid;
}

export type QuantizeGrid = 
  | '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64'
  | '1/4T' | '1/8T' | '1/16T' | '1/32T'  // Triplets
  | '1/4D' | '1/8D' | '1/16D';            // Dotted

export interface VirtualInstrument {
  id: string;
  name: string;
  type: 'synth' | 'sampler' | 'drum-machine' | 'plugin';
  preset?: string;
  parameters: Map<string, number>;
  audioNode?: AudioNode;
}

export interface MIDIEffect {
  id: string;
  type: MIDIEffectType;
  enabled: boolean;
  parameters: Record<string, number>;
}

export type MIDIEffectType = 
  | 'arpeggiator' | 'chord' | 'scale' | 'random' | 'velocity'
  | 'note-length' | 'delay' | 'transpose' | 'note-echo' | 'humanize';

export interface ArpeggiatorSettings {
  pattern: 'up' | 'down' | 'up-down' | 'down-up' | 'random' | 'order' | 'chord';
  rate: QuantizeGrid;
  gate: number;           // 0-200%
  octaves: number;        // 1-4
  steps: number;
  swing: number;
  velocity: 'as-played' | 'fixed' | 'random';
  hold: boolean;
  restarts: 'off' | 'on-note' | 'on-chord';
}

export interface ScaleSettings {
  root: number;           // 0-11 (C=0)
  scale: ScaleType;
  mode: 'fold' | 'filter' | 'nearest';
}

export type ScaleType = 
  | 'major' | 'minor' | 'harmonic-minor' | 'melodic-minor'
  | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian'
  | 'pentatonic-major' | 'pentatonic-minor' | 'blues'
  | 'whole-tone' | 'chromatic' | 'diminished' | 'augmented';

// =============================================================================
// ITEM 326: MIDI ENGINE
// =============================================================================

export class MIDIEngine {
  private midiAccess: MIDIAccess | null = null;
  private inputs: Map<string, MIDIDevice> = new Map();
  private outputs: Map<string, MIDIDevice> = new Map();
  private tracks: Map<string, MIDITrack> = new Map();
  private activeNotes: Map<string, MIDINote> = new Map();  // id -> note being played
  
  private tempo: number = 120;
  private ppq: number = 480;                // Pulses per quarter note
  private playing: boolean = false;
  private playbackPosition: number = 0;     // Ticks
  private startTime: number = 0;
  
  private onNoteOn?: (note: MIDINote, track: MIDITrack) => void;
  private onNoteOff?: (note: MIDINote, track: MIDITrack) => void;
  private onMIDIMessage?: (message: MIDIMessage, device: MIDIDevice) => void;
  private onDeviceChange?: (devices: MIDIDevice[]) => void;
  
  private audioContext: AudioContext | null = null;
  private instruments: Map<string, VirtualInstrument> = new Map();
  
  constructor() {}
  
  // =============================================================================
  // ITEM 327: MIDI ACCESS & DEVICE ENUMERATION
  // =============================================================================
  
  async initialize(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not supported');
      return;
    }
    
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      this.enumerateDevices();
      
      // Listen for device changes
      this.midiAccess.onstatechange = () => {
        this.enumerateDevices();
        this.onDeviceChange?.(this.getAllDevices());
      };
      
      // Create audio context for virtual instruments
      this.audioContext = new AudioContext();
      
    } catch (error) {
      console.error('Failed to access MIDI:', error);
      throw error;
    }
  }
  
  private enumerateDevices(): void {
    if (!this.midiAccess) return;
    
    this.inputs.clear();
    this.outputs.clear();
    
    // Enumerate inputs
    for (const [id, input] of this.midiAccess.inputs) {
      const device: MIDIDevice = {
        id,
        name: input.name || 'Unknown Input',
        manufacturer: input.manufacturer || 'Unknown',
        type: 'input',
        state: input.state,
        connection: input.connection
      };
      this.inputs.set(id, device);
      
      // Set up message handler
      input.onmidimessage = (event: Event) => {
        const midiEvent = event as MIDIMessageEvent;
        if (midiEvent.data) {
          this.handleMIDIMessage(midiEvent, device);
        }
      };
    }
    
    // Enumerate outputs
    for (const [id, output] of this.midiAccess.outputs) {
      this.outputs.set(id, {
        id,
        name: output.name || 'Unknown Output',
        manufacturer: output.manufacturer || 'Unknown',
        type: 'output',
        state: output.state,
        connection: output.connection
      });
    }
  }
  
  getInputDevices(): MIDIDevice[] {
    return Array.from(this.inputs.values());
  }
  
  getOutputDevices(): MIDIDevice[] {
    return Array.from(this.outputs.values());
  }
  
  getAllDevices(): MIDIDevice[] {
    return [...this.getInputDevices(), ...this.getOutputDevices()];
  }
  
  // =============================================================================
  // ITEM 328-330: MIDI MESSAGE HANDLING
  // =============================================================================
  
  private handleMIDIMessage(event: MIDIMessageEvent, device: MIDIDevice): void {
    if (!event.data) return;
    const data = Array.from(event.data);
    const [status, data1, data2] = data;
    const channel = status & 0x0F;
    const messageType = status & 0xF0;
    
    const message: MIDIMessage = {
      type: this.getMessageType(messageType),
      channel,
      data1: data1 || 0,
      data2: data2 || 0,
      timestamp: event.timeStamp
    };
    
    this.onMIDIMessage?.(message, device);
    
    // Route to armed tracks
    for (const track of this.tracks.values()) {
      if (track.armed && (!track.input || track.input === device.id)) {
        this.routeToTrack(message, track);
      }
    }
  }
  
  private getMessageType(status: number): MIDIMessageType {
    switch (status) {
      case 0x80: return 'note-off';
      case 0x90: return 'note-on';
      case 0xA0: return 'poly-aftertouch';
      case 0xB0: return 'control-change';
      case 0xC0: return 'program-change';
      case 0xD0: return 'aftertouch';
      case 0xE0: return 'pitch-bend';
      case 0xF0: return 'sysex';
      case 0xF8: return 'timing-clock';
      case 0xFA: return 'start';
      case 0xFB: return 'continue';
      case 0xFC: return 'stop';
      case 0xFE: return 'active-sensing';
      case 0xFF: return 'reset';
      default: return 'note-on';
    }
  }
  
  private routeToTrack(message: MIDIMessage, track: MIDITrack): void {
    // Apply MIDI effects
    let processedMessage = this.applyMIDIEffects(message, track.effects);
    
    // Apply quantize if recording
    if (track.quantize.enabled) {
      processedMessage = this.quantizeMessage(processedMessage, track.quantize);
    }
    
    switch (processedMessage.type) {
      case 'note-on':
        if (processedMessage.data2 > 0) {
          const note = this.createNote(processedMessage);
          this.activeNotes.set(note.id, note);
          this.triggerInstrument(track, note, true);
          this.onNoteOn?.(note, track);
        } else {
          this.handleNoteOff(processedMessage, track);
        }
        break;
        
      case 'note-off':
        this.handleNoteOff(processedMessage, track);
        break;
        
      case 'control-change':
        this.handleControlChange(processedMessage, track);
        break;
        
      case 'pitch-bend':
        this.handlePitchBend(processedMessage, track);
        break;
    }
    
    // Forward to output device
    if (track.output) {
      this.sendMessage(track.output, processedMessage);
    }
  }
  
  private handleNoteOff(message: MIDIMessage, track: MIDITrack): void {
    // Find matching note
    for (const [id, note] of this.activeNotes) {
      if (note.pitch === message.data1 && note.channel === message.channel) {
        note.duration = this.playbackPosition - note.startTime;
        this.activeNotes.delete(id);
        this.triggerInstrument(track, note, false);
        this.onNoteOff?.(note, track);
        break;
      }
    }
  }
  
  private handleControlChange(message: MIDIMessage, track: MIDITrack): void {
    const ccNumber = message.data1;
    const value = message.data2;
    
    // Handle standard CCs
    switch (ccNumber) {
      case 1:   // Modulation
      case 7:   // Volume
      case 10:  // Pan
      case 11:  // Expression
      case 64:  // Sustain
      case 74:  // Filter cutoff
        if (track.instrument) {
          track.instrument.parameters.set(`cc${ccNumber}`, value);
        }
        break;
    }
  }
  
  private handlePitchBend(message: MIDIMessage, track: MIDITrack): void {
    const value = (message.data2 << 7) | message.data1;
    const normalizedValue = (value - 8192) / 8192;  // -1 to 1
    
    if (track.instrument) {
      track.instrument.parameters.set('pitchBend', normalizedValue);
    }
  }
  
  // =============================================================================
  // ITEM 331-335: MIDI OUTPUT & SENDING
  // =============================================================================
  
  sendMessage(deviceId: string, message: MIDIMessage): void {
    if (!this.midiAccess) return;
    
    const output = this.midiAccess.outputs.get(deviceId);
    if (!output) return;
    
    const data = this.encodeMessage(message);
    output.send(data);
  }
  
  private encodeMessage(message: MIDIMessage): number[] {
    const statusMap: Record<MIDIMessageType, number> = {
      'note-off': 0x80,
      'note-on': 0x90,
      'poly-aftertouch': 0xA0,
      'control-change': 0xB0,
      'program-change': 0xC0,
      'aftertouch': 0xD0,
      'pitch-bend': 0xE0,
      'sysex': 0xF0,
      'timing-clock': 0xF8,
      'start': 0xFA,
      'continue': 0xFB,
      'stop': 0xFC,
      'active-sensing': 0xFE,
      'reset': 0xFF
    };
    
    const status = statusMap[message.type] | message.channel;
    
    switch (message.type) {
      case 'program-change':
      case 'aftertouch':
        return [status, message.data1];
      case 'timing-clock':
      case 'start':
      case 'continue':
      case 'stop':
        return [status];
      default:
        return [status, message.data1, message.data2];
    }
  }
  
  sendNoteOn(deviceId: string, note: number, velocity: number, channel: number = 0): void {
    this.sendMessage(deviceId, {
      type: 'note-on',
      channel,
      data1: note,
      data2: velocity,
      timestamp: performance.now()
    });
  }
  
  sendNoteOff(deviceId: string, note: number, channel: number = 0): void {
    this.sendMessage(deviceId, {
      type: 'note-off',
      channel,
      data1: note,
      data2: 0,
      timestamp: performance.now()
    });
  }
  
  sendCC(deviceId: string, cc: number, value: number, channel: number = 0): void {
    this.sendMessage(deviceId, {
      type: 'control-change',
      channel,
      data1: cc,
      data2: value,
      timestamp: performance.now()
    });
  }
  
  sendProgramChange(deviceId: string, program: number, channel: number = 0): void {
    this.sendMessage(deviceId, {
      type: 'program-change',
      channel,
      data1: program,
      data2: 0,
      timestamp: performance.now()
    });
  }
  
  sendPitchBend(deviceId: string, value: number, channel: number = 0): void {
    // value: -1 to 1
    const midiValue = Math.round((value + 1) * 8192);
    this.sendMessage(deviceId, {
      type: 'pitch-bend',
      channel,
      data1: midiValue & 0x7F,
      data2: (midiValue >> 7) & 0x7F,
      timestamp: performance.now()
    });
  }
  
  sendAllNotesOff(deviceId: string, channel: number = 0): void {
    this.sendCC(deviceId, 123, 0, channel);
  }
  
  sendAllSoundOff(deviceId: string, channel: number = 0): void {
    this.sendCC(deviceId, 120, 0, channel);
  }
  
  // =============================================================================
  // ITEM 336-340: MIDI SEQUENCING
  // =============================================================================
  
  createTrack(name: string): MIDITrack {
    const id = this.generateId();
    
    const track: MIDITrack = {
      id,
      name,
      clips: new Map(),
      channel: 0,
      armed: false,
      muted: false,
      solo: false,
      volume: 100,
      pan: 0,
      effects: [],
      quantize: {
        enabled: true,
        grid: '1/16',
        strength: 100,
        swing: 0,
        swingGrid: '1/8'
      }
    };
    
    this.tracks.set(id, track);
    return track;
  }
  
  createClip(trackId: string, position: number, length: number): MIDIClip | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;
    
    const clip: MIDIClip = {
      id: this.generateId(),
      name: `Clip ${track.clips.size + 1}`,
      notes: [],
      length,
      loopStart: 0,
      loopEnd: length,
      loopEnabled: false,
      timeSignature: { numerator: 4, denominator: 4 },
      color: this.generateClipColor()
    };
    
    track.clips.set(position, clip);
    return clip;
  }
  
  addNote(clipId: string, note: Omit<MIDINote, 'id' | 'selected' | 'muted'>): MIDINote | null {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          const newNote: MIDINote = {
            ...note,
            id: this.generateId(),
            selected: false,
            muted: false
          };
          clip.notes.push(newNote);
          return newNote;
        }
      }
    }
    return null;
  }
  
  deleteNote(clipId: string, noteId: string): void {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          const index = clip.notes.findIndex(n => n.id === noteId);
          if (index !== -1) {
            clip.notes.splice(index, 1);
          }
          return;
        }
      }
    }
  }
  
  moveNote(clipId: string, noteId: string, pitch: number, startTime: number): void {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          const note = clip.notes.find(n => n.id === noteId);
          if (note) {
            note.pitch = Math.max(0, Math.min(127, pitch));
            note.startTime = Math.max(0, startTime);
          }
          return;
        }
      }
    }
  }
  
  resizeNote(clipId: string, noteId: string, duration: number): void {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          const note = clip.notes.find(n => n.id === noteId);
          if (note) {
            note.duration = Math.max(1, duration);
          }
          return;
        }
      }
    }
  }
  
  setNoteVelocity(clipId: string, noteId: string, velocity: number): void {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          const note = clip.notes.find(n => n.id === noteId);
          if (note) {
            note.velocity = Math.max(1, Math.min(127, velocity));
          }
          return;
        }
      }
    }
  }
  
  // =============================================================================
  // ITEM 341-345: QUANTIZATION
  // =============================================================================
  
  quantizeNotes(clipId: string, settings: QuantizeSettings): void {
    for (const track of this.tracks.values()) {
      for (const clip of track.clips.values()) {
        if (clip.id === clipId) {
          for (const note of clip.notes) {
            note.startTime = this.quantizeTick(note.startTime, settings);
          }
          return;
        }
      }
    }
  }
  
  private quantizeTick(tick: number, settings: QuantizeSettings): number {
    const gridTicks = this.getGridTicks(settings.grid);
    const nearestGrid = Math.round(tick / gridTicks) * gridTicks;
    
    // Apply strength
    const strength = settings.strength / 100;
    let quantized = tick + (nearestGrid - tick) * strength;
    
    // Apply swing
    if (settings.swing !== 0) {
      const swingGridTicks = this.getGridTicks(settings.swingGrid);
      const swingBeat = Math.floor(quantized / swingGridTicks);
      
      if (swingBeat % 2 === 1) {
        const swingAmount = (settings.swing / 100) * (swingGridTicks / 2);
        quantized += swingAmount;
      }
    }
    
    return Math.round(quantized);
  }
  
  private quantizeMessage(message: MIDIMessage, settings: QuantizeSettings): MIDIMessage {
    // Real-time quantization would use lookahead buffer
    return message;
  }
  
  private getGridTicks(grid: QuantizeGrid): number {
    const gridMap: Record<QuantizeGrid, number> = {
      '1/1': this.ppq * 4,
      '1/2': this.ppq * 2,
      '1/4': this.ppq,
      '1/8': this.ppq / 2,
      '1/16': this.ppq / 4,
      '1/32': this.ppq / 8,
      '1/64': this.ppq / 16,
      '1/4T': Math.round(this.ppq * 2 / 3),
      '1/8T': Math.round(this.ppq / 3),
      '1/16T': Math.round(this.ppq / 6),
      '1/32T': Math.round(this.ppq / 12),
      '1/4D': Math.round(this.ppq * 1.5),
      '1/8D': Math.round(this.ppq * 0.75),
      '1/16D': Math.round(this.ppq * 0.375)
    };
    
    return gridMap[grid] || this.ppq / 4;
  }
  
  // =============================================================================
  // ITEM 346-350: MIDI EFFECTS
  // =============================================================================
  
  private applyMIDIEffects(message: MIDIMessage, effects: MIDIEffect[]): MIDIMessage {
    let processed = { ...message };
    
    for (const effect of effects) {
      if (!effect.enabled) continue;
      
      switch (effect.type) {
        case 'transpose':
          if (processed.type === 'note-on' || processed.type === 'note-off') {
            processed.data1 = Math.max(0, Math.min(127, 
              processed.data1 + (effect.parameters.semitones || 0)
            ));
          }
          break;
          
        case 'velocity':
          if (processed.type === 'note-on') {
            const vMin = effect.parameters.min || 0;
            const vMax = effect.parameters.max || 127;
            const scale = effect.parameters.scale || 100;
            processed.data2 = Math.max(1, Math.min(127,
              Math.round(vMin + (processed.data2 - vMin) * (scale / 100))
            ));
            processed.data2 = Math.max(vMin, Math.min(vMax, processed.data2));
          }
          break;
          
        case 'scale':
          if (processed.type === 'note-on' || processed.type === 'note-off') {
            processed.data1 = this.applyScale(
              processed.data1,
              effect.parameters as unknown as ScaleSettings
            );
          }
          break;
          
        case 'humanize':
          if (processed.type === 'note-on') {
            const timing = effect.parameters.timing || 0;
            const velocity = effect.parameters.velocity || 0;
            processed.data2 = Math.max(1, Math.min(127,
              processed.data2 + Math.round((Math.random() - 0.5) * velocity)
            ));
            // Timing humanization would need lookahead
          }
          break;
      }
    }
    
    return processed;
  }
  
  private applyScale(pitch: number, settings: ScaleSettings): number {
    const scales: Record<ScaleType, number[]> = {
      'major': [0, 2, 4, 5, 7, 9, 11],
      'minor': [0, 2, 3, 5, 7, 8, 10],
      'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
      'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
      'dorian': [0, 2, 3, 5, 7, 9, 10],
      'phrygian': [0, 1, 3, 5, 7, 8, 10],
      'lydian': [0, 2, 4, 6, 7, 9, 11],
      'mixolydian': [0, 2, 4, 5, 7, 9, 10],
      'locrian': [0, 1, 3, 5, 6, 8, 10],
      'pentatonic-major': [0, 2, 4, 7, 9],
      'pentatonic-minor': [0, 3, 5, 7, 10],
      'blues': [0, 3, 5, 6, 7, 10],
      'whole-tone': [0, 2, 4, 6, 8, 10],
      'chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      'diminished': [0, 2, 3, 5, 6, 8, 9, 11],
      'augmented': [0, 3, 4, 7, 8, 11]
    };
    
    const scaleNotes = scales[settings.scale];
    const noteInOctave = (pitch - settings.root + 12) % 12;
    
    if (scaleNotes.includes(noteInOctave)) {
      return pitch;
    }
    
    switch (settings.mode) {
      case 'filter':
        return -1;  // Mute out-of-scale notes
        
      case 'nearest':
        // Find nearest scale note
        let minDist = 12;
        let nearest = noteInOctave;
        for (const scaleNote of scaleNotes) {
          const dist = Math.min(
            Math.abs(scaleNote - noteInOctave),
            12 - Math.abs(scaleNote - noteInOctave)
          );
          if (dist < minDist) {
            minDist = dist;
            nearest = scaleNote;
          }
        }
        return pitch - noteInOctave + nearest;
        
      case 'fold':
      default:
        // Round down to nearest scale note
        for (let i = scaleNotes.length - 1; i >= 0; i--) {
          if (scaleNotes[i] <= noteInOctave) {
            return pitch - noteInOctave + scaleNotes[i];
          }
        }
        return pitch - noteInOctave + scaleNotes[scaleNotes.length - 1] - 12;
    }
  }
  
  createArpeggiator(settings: ArpeggiatorSettings): MIDIEffect {
    return {
      id: this.generateId(),
      type: 'arpeggiator',
      enabled: true,
      parameters: settings as unknown as Record<string, number>
    };
  }
  
  // =============================================================================
  // VIRTUAL INSTRUMENTS
  // =============================================================================
  
  createSynth(name: string): VirtualInstrument {
    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }
    
    const instrument: VirtualInstrument = {
      id: this.generateId(),
      name,
      type: 'synth',
      parameters: new Map([
        ['attack', 0.01],
        ['decay', 0.1],
        ['sustain', 0.7],
        ['release', 0.3],
        ['waveform', 0],  // 0=sine, 1=square, 2=sawtooth, 3=triangle
        ['filter', 2000],
        ['resonance', 1]
      ])
    };
    
    this.instruments.set(instrument.id, instrument);
    return instrument;
  }
  
  private triggerInstrument(track: MIDITrack, note: MIDINote, on: boolean): void {
    const instrument = track.instrument;
    if (!instrument || !this.audioContext) return;
    
    if (instrument.type === 'synth') {
      if (on) {
        this.playSynthNote(instrument, note);
      } else {
        this.stopSynthNote(instrument, note);
      }
    }
  }
  
  private synthVoices: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();
  
  private playSynthNote(instrument: VirtualInstrument, note: MIDINote): void {
    if (!this.audioContext) return;
    
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const velocity = note.velocity / 127;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    const waveforms: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
    osc.type = waveforms[instrument.parameters.get('waveform') || 0];
    osc.frequency.value = freq;
    
    filter.type = 'lowpass';
    filter.frequency.value = instrument.parameters.get('filter') || 2000;
    filter.Q.value = instrument.parameters.get('resonance') || 1;
    
    const attack = instrument.parameters.get('attack') || 0.01;
    const decay = instrument.parameters.get('decay') || 0.1;
    const sustain = instrument.parameters.get('sustain') || 0.7;
    
    const now = this.audioContext.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity, now + attack);
    gain.gain.linearRampToValueAtTime(velocity * sustain, now + attack + decay);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    osc.start();
    
    const voiceId = `${instrument.id}-${note.pitch}`;
    this.synthVoices.set(voiceId, { osc, gain });
  }
  
  private stopSynthNote(instrument: VirtualInstrument, note: MIDINote): void {
    if (!this.audioContext) return;
    
    const voiceId = `${instrument.id}-${note.pitch}`;
    const voice = this.synthVoices.get(voiceId);
    
    if (voice) {
      const release = instrument.parameters.get('release') || 0.3;
      const now = this.audioContext.currentTime;
      
      voice.gain.gain.linearRampToValueAtTime(0, now + release);
      voice.osc.stop(now + release);
      
      setTimeout(() => {
        this.synthVoices.delete(voiceId);
      }, release * 1000);
    }
  }
  
  // =============================================================================
  // PLAYBACK
  // =============================================================================
  
  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.startTime = performance.now();
    this.tick();
  }
  
  stop(): void {
    this.playing = false;
    
    // Stop all notes
    for (const track of this.tracks.values()) {
      if (track.output) {
        for (let ch = 0; ch < 16; ch++) {
          this.sendAllNotesOff(track.output, ch);
        }
      }
      
      if (track.instrument) {
        for (const voice of this.synthVoices.values()) {
          voice.osc.stop();
        }
        this.synthVoices.clear();
      }
    }
  }
  
  setPosition(ticks: number): void {
    this.playbackPosition = ticks;
  }
  
  private tick(): void {
    if (!this.playing) return;
    
    const elapsed = (performance.now() - this.startTime) / 1000;
    const ticksPerSecond = (this.tempo / 60) * this.ppq;
    this.playbackPosition = Math.round(elapsed * ticksPerSecond);
    
    // Play scheduled notes
    for (const track of this.tracks.values()) {
      if (track.muted) continue;
      
      for (const [clipPos, clip] of track.clips) {
        this.playClipNotes(track, clip, clipPos);
      }
    }
    
    requestAnimationFrame(() => this.tick());
  }
  
  private scheduledNotes: Set<string> = new Set();
  
  private playClipNotes(track: MIDITrack, clip: MIDIClip, clipPosition: number): void {
    const currentTick = this.playbackPosition;
    
    for (const note of clip.notes) {
      if (note.muted) continue;
      
      const noteStart = clipPosition + note.startTime;
      const noteEnd = noteStart + note.duration;
      const noteKey = `${clip.id}-${note.id}`;
      
      // Note on
      if (noteStart <= currentTick && !this.scheduledNotes.has(noteKey)) {
        this.scheduledNotes.add(noteKey);
        
        if (track.output) {
          this.sendNoteOn(track.output, note.pitch, note.velocity, track.channel);
        }
        
        if (track.instrument) {
          this.triggerInstrument(track, note, true);
        }
      }
      
      // Note off
      if (noteEnd <= currentTick && this.scheduledNotes.has(noteKey)) {
        this.scheduledNotes.delete(noteKey);
        
        if (track.output) {
          this.sendNoteOff(track.output, note.pitch, track.channel);
        }
        
        if (track.instrument) {
          this.triggerInstrument(track, note, false);
        }
      }
    }
  }
  
  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================
  
  private createNote(message: MIDIMessage): MIDINote {
    return {
      id: this.generateId(),
      pitch: message.data1,
      velocity: message.data2,
      startTime: this.playbackPosition,
      duration: 0,
      channel: message.channel,
      selected: false,
      muted: false
    };
  }
  
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
  
  // Event handlers
  setNoteOnHandler(handler: (note: MIDINote, track: MIDITrack) => void): void {
    this.onNoteOn = handler;
  }
  
  setNoteOffHandler(handler: (note: MIDINote, track: MIDITrack) => void): void {
    this.onNoteOff = handler;
  }
  
  setMIDIMessageHandler(handler: (message: MIDIMessage, device: MIDIDevice) => void): void {
    this.onMIDIMessage = handler;
  }
  
  setDeviceChangeHandler(handler: (devices: MIDIDevice[]) => void): void {
    this.onDeviceChange = handler;
  }
  
  // Getters/Setters
  getTempo(): number { return this.tempo; }
  setTempo(bpm: number): void { this.tempo = Math.max(20, Math.min(999, bpm)); }
  
  getPPQ(): number { return this.ppq; }
  
  getPosition(): number { return this.playbackPosition; }
  
  isPlaying(): boolean { return this.playing; }
  
  getTrack(id: string): MIDITrack | undefined { return this.tracks.get(id); }
  
  getAllTracks(): MIDITrack[] { return Array.from(this.tracks.values()); }
  
  // Cleanup
  dispose(): void {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createMIDIEngine = () => new MIDIEngine();

export default MIDIEngine;
