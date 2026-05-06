// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - VINX Timeline Core System
// Professional video timeline rivaling Premiere Pro/DaVinci Resolve/Final Cut
// Items 151-175 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export type ClipType = 'video' | 'audio' | 'image' | 'title' | 'adjustment' | 'nested';

export interface TimelineClip {
  id: string;
  type: ClipType;
  name: string;
  sourceId: string;
  
  // Timeline position
  trackIndex: number;
  startFrame: number;      // Position on timeline
  endFrame: number;
  
  // Source timing
  sourceInPoint: number;   // In point in source media
  sourceOutPoint: number;
  
  // Playback
  speed: number;           // 1.0 = normal, 2.0 = 2x, -1.0 = reverse
  reversed: boolean;
  
  // Visual
  color: string;
  locked: boolean;
  disabled: boolean;
  
  // Effects
  effects: ClipEffect[];
  
  // Audio
  volume: number;          // 0-200
  pan: number;             // -100 to 100
  muted: boolean;
  
  // Transitions
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  height: number;
  visible: boolean;
  locked: boolean;
  muted: boolean;          // For audio tracks
  solo: boolean;           // For audio tracks
  collapsed: boolean;
  clips: TimelineClip[];
  
  // Track-level settings
  volume: number;
  pan: number;
  blendMode: string;
  opacity: number;
}

export interface ClipEffect {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
  keyframes: Keyframe[];
}

export interface Keyframe {
  frame: number;
  value: unknown;
  easing: EasingType;
  bezierHandles?: {
    in: { x: number; y: number };
    out: { x: number; y: number };
  };
}

export type EasingType = 
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'bezier'
  | 'hold';

export interface Transition {
  id: string;
  type: string;
  duration: number;
  params: Record<string, unknown>;
}

export interface Marker {
  id: string;
  frame: number;
  name: string;
  color: string;
  type: 'marker' | 'chapter' | 'todo' | 'comment';
  comment?: string;
}

export interface TimelineRange {
  inPoint: number;
  outPoint: number;
}

export interface TimelineState {
  tracks: Track[];
  markers: Marker[];
  playhead: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  workArea: TimelineRange | null;
  selection: {
    clips: string[];
    range: TimelineRange | null;
  };
  snapping: boolean;
  rippleEdit: boolean;
  linkedSelection: boolean;
}

// =============================================================================
// ITEM 151: TIMELINE ENGINE
// =============================================================================

export class TimelineEngine {
  private state: TimelineState;
  private frameRate: number;
  private listeners: Set<(state: TimelineState) => void> = new Set();
  private undoStack: TimelineState[] = [];
  private redoStack: TimelineState[] = [];
  private maxUndoSteps = 100;
  
  constructor(frameRate: number = 24) {
    this.frameRate = frameRate;
    this.state = this.createInitialState();
  }
  
  private createInitialState(): TimelineState {
    return {
      tracks: [
        this.createTrack('Video 1', 'video'),
        this.createTrack('Audio 1', 'audio')
      ],
      markers: [],
      playhead: 0,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      workArea: null,
      selection: { clips: [], range: null },
      snapping: true,
      rippleEdit: false,
      linkedSelection: true
    };
  }
  
  private createTrack(name: string, type: 'video' | 'audio'): Track {
    return {
      id: generateId(),
      name,
      type,
      height: type === 'video' ? 80 : 60,
      visible: true,
      locked: false,
      muted: false,
      solo: false,
      collapsed: false,
      clips: [],
      volume: 100,
      pan: 0,
      blendMode: 'normal',
      opacity: 100
    };
  }
  
  // State management
  getState(): TimelineState {
    return this.state;
  }
  
  subscribe(listener: (state: TimelineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private setState(newState: Partial<TimelineState>, addToHistory = true) {
    if (addToHistory) {
      this.undoStack.push({ ...this.state });
      if (this.undoStack.length > this.maxUndoSteps) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }
    
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }
  
  private notifyListeners() {
    this.listeners.forEach(l => l(this.state));
  }
  
  // =============================================================================
  // ITEM 152: UNDO/REDO SYSTEM
  // =============================================================================
  
  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    
    this.redoStack.push({ ...this.state });
    this.state = this.undoStack.pop()!;
    this.notifyListeners();
    return true;
  }
  
  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    
    this.undoStack.push({ ...this.state });
    this.state = this.redoStack.pop()!;
    this.notifyListeners();
    return true;
  }
  
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  
  // =============================================================================
  // ITEM 153: TRACK MANAGEMENT
  // =============================================================================
  
  addTrack(type: 'video' | 'audio', index?: number): Track {
    const existingCount = this.state.tracks.filter(t => t.type === type).length;
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${existingCount + 1}`;
    const track = this.createTrack(name, type);
    
    const tracks = [...this.state.tracks];
    if (index !== undefined) {
      tracks.splice(index, 0, track);
    } else {
      // Insert video tracks at top, audio at bottom
      const insertIndex = type === 'video' 
        ? tracks.filter(t => t.type === 'video').length
        : tracks.length;
      tracks.splice(insertIndex, 0, track);
    }
    
    this.setState({ tracks });
    return track;
  }
  
  removeTrack(trackId: string): void {
    const tracks = this.state.tracks.filter(t => t.id !== trackId);
    this.setState({ tracks });
  }
  
  duplicateTrack(trackId: string): Track | null {
    const sourceTrack = this.state.tracks.find(t => t.id === trackId);
    if (!sourceTrack) return null;
    
    const newTrack: Track = {
      ...sourceTrack,
      id: generateId(),
      name: `${sourceTrack.name} Copy`,
      clips: sourceTrack.clips.map(c => ({ ...c, id: generateId() }))
    };
    
    const tracks = [...this.state.tracks];
    const index = tracks.findIndex(t => t.id === trackId);
    tracks.splice(index + 1, 0, newTrack);
    
    this.setState({ tracks });
    return newTrack;
  }
  
  reorderTrack(trackId: string, newIndex: number): void {
    const tracks = [...this.state.tracks];
    const currentIndex = tracks.findIndex(t => t.id === trackId);
    if (currentIndex === -1) return;
    
    const [track] = tracks.splice(currentIndex, 1);
    tracks.splice(newIndex, 0, track);
    
    this.setState({ tracks });
  }
  
  setTrackProperty<K extends keyof Track>(trackId: string, property: K, value: Track[K]): void {
    const tracks = this.state.tracks.map(t => 
      t.id === trackId ? { ...t, [property]: value } : t
    );
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 154: CLIP MANAGEMENT
  // =============================================================================
  
  addClip(clip: Omit<TimelineClip, 'id'>): TimelineClip {
    const newClip: TimelineClip = {
      ...clip,
      id: generateId()
    };
    
    const tracks = this.state.tracks.map(t => {
      if (t.id === this.state.tracks[clip.trackIndex]?.id) {
        return { ...t, clips: [...t.clips, newClip] };
      }
      return t;
    });
    
    this.setState({ tracks });
    return newClip;
  }
  
  removeClip(clipId: string): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.filter(c => c.id !== clipId)
    }));
    
    const selection = {
      ...this.state.selection,
      clips: this.state.selection.clips.filter(id => id !== clipId)
    };
    
    this.setState({ tracks, selection });
  }
  
  removeSelectedClips(): void {
    const { clips: selectedIds } = this.state.selection;
    if (selectedIds.length === 0) return;
    
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.filter(c => !selectedIds.includes(c.id))
    }));
    
    this.setState({ 
      tracks, 
      selection: { ...this.state.selection, clips: [] } 
    });
  }
  
  duplicateClip(clipId: string): TimelineClip | null {
    for (const track of this.state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        const duration = clip.endFrame - clip.startFrame;
        const newClip: TimelineClip = {
          ...clip,
          id: generateId(),
          startFrame: clip.endFrame,
          endFrame: clip.endFrame + duration
        };
        
        const tracks = this.state.tracks.map(t => 
          t.id === track.id 
            ? { ...t, clips: [...t.clips, newClip] }
            : t
        );
        
        this.setState({ tracks });
        return newClip;
      }
    }
    return null;
  }
  
  // =============================================================================
  // ITEM 155: CLIP POSITIONING
  // =============================================================================
  
  moveClip(clipId: string, newTrackIndex: number, newStartFrame: number): void {
    // Find the clip first
    let foundClip: TimelineClip | undefined;
    let sourceTrackId: string | null = null;
    
    for (const t of this.state.tracks) {
      const clip = t.clips.find(c => c.id === clipId);
      if (clip) {
        foundClip = clip;
        sourceTrackId = t.id;
        break;
      }
    }
    
    if (!foundClip) return;
    const movedClip = foundClip;
    
    // Remove from current track
    let tracks = this.state.tracks.map(t => {
      if (t.id === sourceTrackId) {
        return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
      }
      return t;
    });
    
    if (!movedClip) return;
    
    // Apply snapping
    if (this.state.snapping) {
      newStartFrame = this.snapToGrid(newStartFrame);
    }
    
    // Calculate duration and update position
    const clip = movedClip;
    const duration = clip.endFrame - clip.startFrame;
    const updatedClip: TimelineClip = {
      ...clip,
      startFrame: newStartFrame,
      endFrame: newStartFrame + duration,
      trackIndex: newTrackIndex
    };
    
    // Add to target track
    const targetTrack = tracks[newTrackIndex];
    if (targetTrack) {
      tracks = tracks.map((t, i) => 
        i === newTrackIndex 
          ? { ...t, clips: [...t.clips, updatedClip] }
          : t
      );
    }
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 156: CLIP TRIMMING
  // =============================================================================
  
  trimClipStart(clipId: string, newStartFrame: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          // Don't allow trimming past the end
          const maxStart = c.endFrame - 1;
          const trimmedStart = Math.min(newStartFrame, maxStart);
          
          // Adjust source in point
          const frameDiff = trimmedStart - c.startFrame;
          const newSourceIn = c.sourceInPoint + frameDiff;
          
          return {
            ...c,
            startFrame: trimmedStart,
            sourceInPoint: newSourceIn
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  trimClipEnd(clipId: string, newEndFrame: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          // Don't allow trimming before the start
          const minEnd = c.startFrame + 1;
          const trimmedEnd = Math.max(newEndFrame, minEnd);
          
          // Adjust source out point
          const frameDiff = trimmedEnd - c.endFrame;
          const newSourceOut = c.sourceOutPoint + frameDiff;
          
          return {
            ...c,
            endFrame: trimmedEnd,
            sourceOutPoint: newSourceOut
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 157: RIPPLE EDIT
  // =============================================================================
  
  rippleTrimClipStart(clipId: string, newStartFrame: number): void {
    let delta = 0;
    let affectedTrackIndex = -1;
    let clipPosition = 0;
    
    // Find the clip and calculate delta
    for (let i = 0; i < this.state.tracks.length; i++) {
      const track = this.state.tracks[i];
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex !== -1) {
        const clip = track.clips[clipIndex];
        delta = newStartFrame - clip.startFrame;
        affectedTrackIndex = i;
        clipPosition = clip.startFrame;
        break;
      }
    }
    
    if (affectedTrackIndex === -1) return;
    
    const tracks = this.state.tracks.map((t, trackIndex) => {
      if (trackIndex !== affectedTrackIndex) return t;
      
      return {
        ...t,
        clips: t.clips.map(c => {
          if (c.id === clipId) {
            // Trim this clip
            return {
              ...c,
              startFrame: newStartFrame,
              sourceInPoint: c.sourceInPoint + delta
            };
          } else if (c.startFrame < clipPosition) {
            // Shift all clips before this one
            return {
              ...c,
              startFrame: c.startFrame - delta,
              endFrame: c.endFrame - delta
            };
          }
          return c;
        })
      };
    });
    
    this.setState({ tracks });
  }
  
  rippleTrimClipEnd(clipId: string, newEndFrame: number): void {
    let delta = 0;
    let affectedTrackIndex = -1;
    let clipPosition = 0;
    
    // Find the clip and calculate delta
    for (let i = 0; i < this.state.tracks.length; i++) {
      const track = this.state.tracks[i];
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex !== -1) {
        const clip = track.clips[clipIndex];
        delta = newEndFrame - clip.endFrame;
        affectedTrackIndex = i;
        clipPosition = clip.endFrame;
        break;
      }
    }
    
    if (affectedTrackIndex === -1) return;
    
    const tracks = this.state.tracks.map((t, trackIndex) => {
      if (trackIndex !== affectedTrackIndex) return t;
      
      return {
        ...t,
        clips: t.clips.map(c => {
          if (c.id === clipId) {
            // Trim this clip
            return {
              ...c,
              endFrame: newEndFrame,
              sourceOutPoint: c.sourceOutPoint + delta
            };
          } else if (c.startFrame >= clipPosition) {
            // Shift all clips after this one
            return {
              ...c,
              startFrame: c.startFrame + delta,
              endFrame: c.endFrame + delta
            };
          }
          return c;
        })
      };
    });
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 158: ROLL EDIT
  // =============================================================================
  
  rollEdit(leftClipId: string, rightClipId: string, newEditPoint: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === leftClipId) {
          const delta = newEditPoint - c.endFrame;
          return {
            ...c,
            endFrame: newEditPoint,
            sourceOutPoint: c.sourceOutPoint + delta
          };
        }
        if (c.id === rightClipId) {
          const delta = newEditPoint - c.startFrame;
          return {
            ...c,
            startFrame: newEditPoint,
            sourceInPoint: c.sourceInPoint + delta
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 159: SLIP EDIT
  // =============================================================================
  
  slipClip(clipId: string, deltaFrames: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          // Shift source in/out points while keeping timeline position fixed
          return {
            ...c,
            sourceInPoint: c.sourceInPoint + deltaFrames,
            sourceOutPoint: c.sourceOutPoint + deltaFrames
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 160: SLIDE EDIT
  // =============================================================================
  
  slideClip(clipId: string, deltaFrames: number): void {
    let affectedTrackIndex = -1;
    let clipData: TimelineClip | null = null;
    
    for (let i = 0; i < this.state.tracks.length; i++) {
      const clip = this.state.tracks[i].clips.find(c => c.id === clipId);
      if (clip) {
        affectedTrackIndex = i;
        clipData = clip;
        break;
      }
    }
    
    if (!clipData || affectedTrackIndex === -1) return;
    
    const tracks = this.state.tracks.map((t, idx) => {
      if (idx !== affectedTrackIndex) return t;
      
      return {
        ...t,
        clips: t.clips.map(c => {
          if (c.id === clipId) {
            // Move this clip
            return {
              ...c,
              startFrame: c.startFrame + deltaFrames,
              endFrame: c.endFrame + deltaFrames
            };
          }
          // Adjust adjacent clips
          if (c.endFrame === clipData!.startFrame) {
            // Clip on the left - extend/contract
            return { ...c, endFrame: c.endFrame + deltaFrames };
          }
          if (c.startFrame === clipData!.endFrame) {
            // Clip on the right - extend/contract
            return { ...c, startFrame: c.startFrame + deltaFrames };
          }
          return c;
        })
      };
    });
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 161: SPLIT CLIP
  // =============================================================================
  
  splitClip(clipId: string, splitFrame: number): [TimelineClip, TimelineClip] | null {
    let result: [TimelineClip, TimelineClip] | null = null;
    
    const tracks = this.state.tracks.map(t => {
      const clipIndex = t.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return t;
      
      const clip = t.clips[clipIndex];
      
      // Validate split point
      if (splitFrame <= clip.startFrame || splitFrame >= clip.endFrame) {
        return t;
      }
      
      const sourceFrameAtSplit = clip.sourceInPoint + (splitFrame - clip.startFrame);
      
      const leftClip: TimelineClip = {
        ...clip,
        id: generateId(),
        name: `${clip.name} (1)`,
        endFrame: splitFrame,
        sourceOutPoint: sourceFrameAtSplit,
        transitionOut: undefined
      };
      
      const rightClip: TimelineClip = {
        ...clip,
        id: generateId(),
        name: `${clip.name} (2)`,
        startFrame: splitFrame,
        sourceInPoint: sourceFrameAtSplit,
        transitionIn: undefined
      };
      
      result = [leftClip, rightClip];
      
      const newClips = [...t.clips];
      newClips.splice(clipIndex, 1, leftClip, rightClip);
      
      return { ...t, clips: newClips };
    });
    
    if (result) {
      this.setState({ tracks });
    }
    
    return result;
  }
  
  splitAtPlayhead(): void {
    const { playhead } = this.state;
    
    // Find all clips at playhead
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (playhead > clip.startFrame && playhead < clip.endFrame) {
          this.splitClip(clip.id, playhead);
        }
      }
    }
  }
  
  // =============================================================================
  // ITEM 162: SELECTION
  // =============================================================================
  
  selectClip(clipId: string, additive = false): void {
    const clips = additive 
      ? [...this.state.selection.clips, clipId]
      : [clipId];
    
    this.setState({ 
      selection: { ...this.state.selection, clips } 
    }, false);
  }
  
  deselectClip(clipId: string): void {
    const clips = this.state.selection.clips.filter(id => id !== clipId);
    this.setState({ 
      selection: { ...this.state.selection, clips } 
    }, false);
  }
  
  selectAll(): void {
    const clips = this.state.tracks.flatMap(t => t.clips.map(c => c.id));
    this.setState({ 
      selection: { ...this.state.selection, clips } 
    }, false);
  }
  
  deselectAll(): void {
    this.setState({ 
      selection: { clips: [], range: null } 
    }, false);
  }
  
  selectRange(start: number, end: number): void {
    const clips = this.state.tracks.flatMap(t => 
      t.clips
        .filter(c => c.startFrame < end && c.endFrame > start)
        .map(c => c.id)
    );
    
    this.setState({ 
      selection: { 
        clips, 
        range: { inPoint: start, outPoint: end } 
      } 
    }, false);
  }
  
  // =============================================================================
  // ITEM 163: SNAPPING
  // =============================================================================
  
  setSnapping(enabled: boolean): void {
    this.setState({ snapping: enabled }, false);
  }
  
  snapToGrid(frame: number): number {
    // Snap to nearest clip edge, marker, or playhead
    const snapPoints: number[] = [0, this.state.playhead];
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        snapPoints.push(clip.startFrame, clip.endFrame);
      }
    }
    
    for (const marker of this.state.markers) {
      snapPoints.push(marker.frame);
    }
    
    const snapThreshold = 5 / this.state.zoom; // Threshold in frames
    
    let closestPoint = frame;
    let closestDist = Infinity;
    
    for (const point of snapPoints) {
      const dist = Math.abs(frame - point);
      if (dist < closestDist && dist < snapThreshold) {
        closestDist = dist;
        closestPoint = point;
      }
    }
    
    return closestPoint;
  }
  
  // =============================================================================
  // ITEM 164: MARKERS
  // =============================================================================
  
  addMarker(frame: number, name: string, color = '#ff0000', type: Marker['type'] = 'marker'): Marker {
    const marker: Marker = {
      id: generateId(),
      frame,
      name,
      color,
      type
    };
    
    this.setState({ 
      markers: [...this.state.markers, marker].sort((a, b) => a.frame - b.frame) 
    });
    
    return marker;
  }
  
  removeMarker(markerId: string): void {
    this.setState({ 
      markers: this.state.markers.filter(m => m.id !== markerId) 
    });
  }
  
  updateMarker(markerId: string, updates: Partial<Omit<Marker, 'id'>>): void {
    this.setState({
      markers: this.state.markers.map(m => 
        m.id === markerId ? { ...m, ...updates } : m
      )
    });
  }
  
  goToNextMarker(): void {
    const current = this.state.playhead;
    const next = this.state.markers.find(m => m.frame > current);
    if (next) {
      this.setPlayhead(next.frame);
    }
  }
  
  goToPreviousMarker(): void {
    const current = this.state.playhead;
    const prev = [...this.state.markers].reverse().find(m => m.frame < current);
    if (prev) {
      this.setPlayhead(prev.frame);
    }
  }
  
  // =============================================================================
  // ITEM 165: PLAYHEAD CONTROL
  // =============================================================================
  
  setPlayhead(frame: number): void {
    this.setState({ playhead: Math.max(0, frame) }, false);
  }
  
  movePlayhead(delta: number): void {
    this.setPlayhead(this.state.playhead + delta);
  }
  
  goToStart(): void {
    this.setPlayhead(0);
  }
  
  goToEnd(): void {
    const endFrame = this.getTimelineEndFrame();
    this.setPlayhead(endFrame);
  }
  
  goToNextClip(): void {
    const current = this.state.playhead;
    let nextStart = Infinity;
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.startFrame > current && clip.startFrame < nextStart) {
          nextStart = clip.startFrame;
        }
      }
    }
    
    if (nextStart !== Infinity) {
      this.setPlayhead(nextStart);
    }
  }
  
  goToPreviousClip(): void {
    const current = this.state.playhead;
    let prevEnd = -1;
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.endFrame < current && clip.endFrame > prevEnd) {
          prevEnd = clip.endFrame;
        }
      }
    }
    
    if (prevEnd !== -1) {
      this.setPlayhead(prevEnd);
    }
  }
  
  // =============================================================================
  // ITEM 166: WORK AREA
  // =============================================================================
  
  setWorkArea(inPoint: number, outPoint: number): void {
    this.setState({ 
      workArea: { inPoint, outPoint } 
    }, false);
  }
  
  clearWorkArea(): void {
    this.setState({ workArea: null }, false);
  }
  
  setWorkAreaToSelection(): void {
    const { clips } = this.state.selection;
    if (clips.length === 0) return;
    
    let minStart = Infinity;
    let maxEnd = -Infinity;
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clips.includes(clip.id)) {
          minStart = Math.min(minStart, clip.startFrame);
          maxEnd = Math.max(maxEnd, clip.endFrame);
        }
      }
    }
    
    if (minStart !== Infinity && maxEnd !== -Infinity) {
      this.setWorkArea(minStart, maxEnd);
    }
  }
  
  // =============================================================================
  // ITEM 167: ZOOM
  // =============================================================================
  
  setZoom(zoom: number): void {
    this.setState({ 
      zoom: Math.max(0.01, Math.min(100, zoom)) 
    }, false);
  }
  
  zoomIn(): void {
    this.setZoom(this.state.zoom * 1.5);
  }
  
  zoomOut(): void {
    this.setZoom(this.state.zoom / 1.5);
  }
  
  zoomToFit(): void {
    const endFrame = this.getTimelineEndFrame();
    // Assuming viewport width is available - this would be passed in
    // For now, use a reasonable default
    const viewportWidth = 1200;
    const zoom = viewportWidth / (endFrame * 10); // 10px per frame base
    this.setZoom(zoom);
  }
  
  zoomToSelection(): void {
    const { clips } = this.state.selection;
    if (clips.length === 0) return;
    
    let minStart = Infinity;
    let maxEnd = -Infinity;
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clips.includes(clip.id)) {
          minStart = Math.min(minStart, clip.startFrame);
          maxEnd = Math.max(maxEnd, clip.endFrame);
        }
      }
    }
    
    if (minStart !== Infinity && maxEnd !== -Infinity) {
      const viewportWidth = 1200;
      const duration = maxEnd - minStart;
      const zoom = viewportWidth / (duration * 10);
      this.setZoom(zoom);
      this.setScrollX(minStart);
    }
  }
  
  setScrollX(x: number): void {
    this.setState({ scrollX: Math.max(0, x) }, false);
  }
  
  setScrollY(y: number): void {
    this.setState({ scrollY: Math.max(0, y) }, false);
  }
  
  // =============================================================================
  // ITEM 168: CLIP SPEED
  // =============================================================================
  
  setClipSpeed(clipId: string, speed: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const currentDuration = c.endFrame - c.startFrame;
          const sourceDuration = c.sourceOutPoint - c.sourceInPoint;
          const newSourceDuration = sourceDuration * (c.speed / speed);
          const newDuration = currentDuration * (c.speed / speed);
          
          return {
            ...c,
            speed,
            endFrame: c.startFrame + newDuration,
            sourceOutPoint: c.sourceInPoint + newSourceDuration
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  fitToFill(clipId: string, targetDuration: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const currentDuration = c.endFrame - c.startFrame;
          const newSpeed = currentDuration / targetDuration * c.speed;
          
          return {
            ...c,
            speed: newSpeed,
            endFrame: c.startFrame + targetDuration
          };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  reverseClip(clipId: string): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => 
        c.id === clipId ? { ...c, reversed: !c.reversed } : c
      )
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 169: FREEZE FRAME
  // =============================================================================
  
  createFreezeFrame(clipId: string, frame: number, duration: number): TimelineClip | null {
    let sourceClip: TimelineClip | null = null;
    let trackIndex = -1;
    
    for (let i = 0; i < this.state.tracks.length; i++) {
      const clip = this.state.tracks[i].clips.find(c => c.id === clipId);
      if (clip) {
        sourceClip = clip;
        trackIndex = i;
        break;
      }
    }
    
    if (!sourceClip) return null;
    
    const freezeClip: TimelineClip = {
      ...sourceClip,
      id: generateId(),
      name: `${sourceClip.name} (Freeze)`,
      type: 'image',
      startFrame: sourceClip.endFrame,
      endFrame: sourceClip.endFrame + duration,
      sourceInPoint: frame,
      sourceOutPoint: frame + 1,
      speed: 0 // Indicates freeze frame
    };
    
    const tracks = this.state.tracks.map((t, i) => 
      i === trackIndex 
        ? { ...t, clips: [...t.clips, freezeClip] }
        : t
    );
    
    this.setState({ tracks });
    return freezeClip;
  }
  
  // =============================================================================
  // ITEM 170: LINKED CLIPS
  // =============================================================================
  
  linkClips(clipIds: string[]): void {
    const linkGroupId = generateId();
    
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => 
        clipIds.includes(c.id) 
          ? { ...c, linkGroupId } as TimelineClip & { linkGroupId: string }
          : c
      )
    }));
    
    this.setState({ tracks });
  }
  
  unlinkClips(clipIds: string[]): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (clipIds.includes(c.id)) {
          const { linkGroupId, ...rest } = c as TimelineClip & { linkGroupId?: string };
          return rest;
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 171: COPY/PASTE
  // =============================================================================
  
  private clipboard: TimelineClip[] = [];
  
  copySelectedClips(): void {
    this.clipboard = [];
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (this.state.selection.clips.includes(clip.id)) {
          this.clipboard.push({ ...clip });
        }
      }
    }
  }
  
  cutSelectedClips(): void {
    this.copySelectedClips();
    this.removeSelectedClips();
  }
  
  pasteClips(targetFrame?: number): void {
    if (this.clipboard.length === 0) return;
    
    const insertFrame = targetFrame ?? this.state.playhead;
    const minStart = Math.min(...this.clipboard.map(c => c.startFrame));
    const offset = insertFrame - minStart;
    
    const pastedClips: TimelineClip[] = this.clipboard.map(c => ({
      ...c,
      id: generateId(),
      startFrame: c.startFrame + offset,
      endFrame: c.endFrame + offset
    }));
    
    const tracks = this.state.tracks.map((t, idx) => {
      const clipsForTrack = pastedClips.filter(c => c.trackIndex === idx);
      if (clipsForTrack.length > 0) {
        return { ...t, clips: [...t.clips, ...clipsForTrack] };
      }
      return t;
    });
    
    this.setState({ 
      tracks,
      selection: { 
        ...this.state.selection, 
        clips: pastedClips.map(c => c.id) 
      }
    });
  }
  
  // =============================================================================
  // ITEM 172: NEST CLIPS
  // =============================================================================
  
  nestSelectedClips(name = 'Nested Sequence'): TimelineClip | null {
    const selectedIds = this.state.selection.clips;
    if (selectedIds.length === 0) return null;
    
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let targetTrackIndex = 0;
    
    const selectedClips: TimelineClip[] = [];
    
    for (let i = 0; i < this.state.tracks.length; i++) {
      for (const clip of this.state.tracks[i].clips) {
        if (selectedIds.includes(clip.id)) {
          selectedClips.push(clip);
          minStart = Math.min(minStart, clip.startFrame);
          maxEnd = Math.max(maxEnd, clip.endFrame);
          targetTrackIndex = Math.min(targetTrackIndex, i);
        }
      }
    }
    
    // Create nested clip
    const nestedClip: TimelineClip = {
      id: generateId(),
      type: 'nested',
      name,
      sourceId: generateId(), // Would reference a nested sequence
      trackIndex: targetTrackIndex,
      startFrame: minStart,
      endFrame: maxEnd,
      sourceInPoint: 0,
      sourceOutPoint: maxEnd - minStart,
      speed: 1,
      reversed: false,
      color: '#9933ff',
      locked: false,
      disabled: false,
      effects: [],
      volume: 100,
      pan: 0,
      muted: false
    };
    
    // Remove original clips and add nested
    const tracks = this.state.tracks.map((t, idx) => ({
      ...t,
      clips: idx === targetTrackIndex
        ? [...t.clips.filter(c => !selectedIds.includes(c.id)), nestedClip]
        : t.clips.filter(c => !selectedIds.includes(c.id))
    }));
    
    this.setState({ 
      tracks,
      selection: { clips: [nestedClip.id], range: null }
    });
    
    return nestedClip;
  }
  
  // =============================================================================
  // ITEM 173: CLIP EFFECTS
  // =============================================================================
  
  addEffectToClip(clipId: string, effect: Omit<ClipEffect, 'id'>): ClipEffect {
    const newEffect: ClipEffect = {
      ...effect,
      id: generateId()
    };
    
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => 
        c.id === clipId 
          ? { ...c, effects: [...c.effects, newEffect] }
          : c
      )
    }));
    
    this.setState({ tracks });
    return newEffect;
  }
  
  removeEffectFromClip(clipId: string, effectId: string): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => 
        c.id === clipId 
          ? { ...c, effects: c.effects.filter(e => e.id !== effectId) }
          : c
      )
    }));
    
    this.setState({ tracks });
  }
  
  reorderEffects(clipId: string, fromIndex: number, toIndex: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const effects = [...c.effects];
          const [moved] = effects.splice(fromIndex, 1);
          effects.splice(toIndex, 0, moved);
          return { ...c, effects };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  setEffectEnabled(clipId: string, effectId: string, enabled: boolean): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => 
        c.id === clipId 
          ? { 
              ...c, 
              effects: c.effects.map(e => 
                e.id === effectId ? { ...e, enabled } : e
              ) 
            }
          : c
      )
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 174: TRANSITIONS
  // =============================================================================
  
  addTransition(clipId: string, position: 'in' | 'out', transition: Omit<Transition, 'id'>): Transition {
    const newTransition: Transition = {
      ...transition,
      id: generateId()
    };
    
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          return position === 'in'
            ? { ...c, transitionIn: newTransition }
            : { ...c, transitionOut: newTransition };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
    return newTransition;
  }
  
  removeTransition(clipId: string, position: 'in' | 'out'): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          return position === 'in'
            ? { ...c, transitionIn: undefined }
            : { ...c, transitionOut: undefined };
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  setTransitionDuration(clipId: string, position: 'in' | 'out', duration: number): void {
    const tracks = this.state.tracks.map(t => ({
      ...t,
      clips: t.clips.map(c => {
        if (c.id === clipId) {
          const transKey = position === 'in' ? 'transitionIn' : 'transitionOut';
          const trans = c[transKey];
          if (trans) {
            return { ...c, [transKey]: { ...trans, duration } };
          }
        }
        return c;
      })
    }));
    
    this.setState({ tracks });
  }
  
  // =============================================================================
  // ITEM 175: UTILITIES
  // =============================================================================
  
  getTimelineEndFrame(): number {
    let maxEnd = 0;
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        maxEnd = Math.max(maxEnd, clip.endFrame);
      }
    }
    
    return maxEnd;
  }
  
  getTimelineDuration(): number {
    return this.getTimelineEndFrame() / this.frameRate;
  }
  
  frameToTimecode(frame: number): string {
    const totalSeconds = frame / this.frameRate;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor(frame % this.frameRate);
    
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
  }
  
  timecodeToFrame(timecode: string): number {
    const parts = timecode.split(':').map(Number);
    const [hours, minutes, seconds, frames] = parts;
    
    return (hours * 3600 + minutes * 60 + seconds) * this.frameRate + frames;
  }
  
  getClipAtFrame(trackIndex: number, frame: number): TimelineClip | null {
    const track = this.state.tracks[trackIndex];
    if (!track) return null;
    
    return track.clips.find(c => 
      frame >= c.startFrame && frame < c.endFrame
    ) || null;
  }
  
  getClipsInRange(start: number, end: number): TimelineClip[] {
    const clips: TimelineClip[] = [];
    
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.startFrame < end && clip.endFrame > start) {
          clips.push(clip);
        }
      }
    }
    
    return clips;
  }
  
  exportEDL(): string {
    let edl = 'TITLE: DEX Export\n';
    edl += `FCM: ${this.frameRate === 30 ? 'DROP FRAME' : 'NON-DROP FRAME'}\n\n`;
    
    let eventNum = 1;
    const allClips = this.state.tracks
      .flatMap(t => t.clips)
      .sort((a, b) => a.startFrame - b.startFrame);
    
    for (const clip of allClips) {
      const srcIn = this.frameToTimecode(clip.sourceInPoint);
      const srcOut = this.frameToTimecode(clip.sourceOutPoint);
      const recIn = this.frameToTimecode(clip.startFrame);
      const recOut = this.frameToTimecode(clip.endFrame);
      
      edl += `${pad(eventNum, 3)}  ${clip.sourceId.slice(0, 8)}  V  C  ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
      edl += `* FROM CLIP NAME: ${clip.name}\n\n`;
      eventNum++;
    }
    
    return edl;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function pad(num: number, length = 2): string {
  return String(num).padStart(length, '0');
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createTimeline = (frameRate = 24) => new TimelineEngine(frameRate);

export default TimelineEngine;
