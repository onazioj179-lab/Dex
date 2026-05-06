// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Audio Player System
// Apple Music-level feel audio player with hardware acceleration
// No autoplay, keyboard-driven, minimal resource usage at idle
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, globalShortcut } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type PlaybackState = 'stopped' | 'playing' | 'paused' | 'loading';
export type RepeatMode = 'off' | 'one' | 'all';
export type ShuffleMode = 'off' | 'on';

export interface AudioMetadata {
  title: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  trackTotal?: number;
  discNumber?: number;
  discTotal?: number;
  duration: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  format?: string;
  artwork?: string; // Base64 or path
}

export interface AudioTrack {
  id: string;
  path: string;
  filename: string;
  metadata: AudioMetadata;
  addedAt: number;
  lastPlayedAt?: number;
  playCount: number;
  rating?: number; // 1-5 stars
  favorite: boolean;
  color?: string; // Extracted dominant color
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: string[]; // Track IDs
  artwork?: string;
  createdAt: number;
  updatedAt: number;
  isSmartPlaylist: boolean;
  smartRules?: SmartPlaylistRule[];
}

export interface SmartPlaylistRule {
  field: 'artist' | 'album' | 'genre' | 'year' | 'rating' | 'playCount' | 'addedAt';
  operator: 'is' | 'contains' | 'startsWith' | 'greaterThan' | 'lessThan';
  value: string | number;
}

export interface PlaybackPosition {
  current: number;
  duration: number;
  percentage: number;
}

export interface AudioEqualizerPreset {
  name: string;
  bands: number[]; // 10-band EQ values (-12 to +12 dB)
}

export interface AudioConfig {
  volume: number; // 0-1
  muted: boolean;
  repeatMode: RepeatMode;
  shuffleMode: ShuffleMode;
  gaplessPlayback: boolean;
  crossfadeDuration: number; // seconds
  equalizerEnabled: boolean;
  equalizerPreset: string;
  normalizeVolume: boolean;
  mediaKeysEnabled: boolean;
  scrobbleEnabled: boolean;
  visualizerEnabled: boolean;
}

export interface QueueState {
  tracks: AudioTrack[];
  currentIndex: number;
  originalOrder: string[]; // For unshuffle
}

export interface PlayerStats {
  totalTracks: number;
  totalPlaylists: number;
  totalDuration: number;
  topArtists: { name: string; count: number }[];
  topAlbums: { name: string; count: number }[];
  recentlyPlayed: AudioTrack[];
  mostPlayed: AudioTrack[];
}

// ===========================================================================
// AUDIO PLAYER SYSTEM
// ===========================================================================

class AudioPlayerSystemClass extends EventEmitter {
  private tracks: Map<string, AudioTrack> = new Map();
  private playlists: Map<string, Playlist> = new Map();
  private queue: QueueState = { tracks: [], currentIndex: -1, originalOrder: [] };
  private config: AudioConfig;
  private state: PlaybackState = 'stopped';
  private position: PlaybackPosition = { current: 0, duration: 0, percentage: 0 };
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;

  // Default EQ presets
  private readonly eqPresets: Map<string, AudioEqualizerPreset> = new Map([
    ['flat', { name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    ['bass-boost', { name: 'Bass Boost', bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] }],
    ['treble-boost', { name: 'Treble Boost', bands: [0, 0, 0, 0, 0, 2, 4, 5, 6, 6] }],
    ['vocal', { name: 'Vocal', bands: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2] }],
    ['electronic', { name: 'Electronic', bands: [4, 3, 0, -2, -1, 1, 0, 2, 4, 5] }],
    ['rock', { name: 'Rock', bands: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4] }],
    ['jazz', { name: 'Jazz', bands: [3, 2, 0, 1, -1, -1, 0, 1, 2, 3] }],
    ['classical', { name: 'Classical', bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] }],
  ]);

  private readonly supportedFormats = [
    '.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg',
    '.opus', '.wma', '.aiff', '.alac', '.ape', '.webm'
  ];

  constructor() {
    super();
    this.config = {
      volume: 0.8,
      muted: false,
      repeatMode: 'off',
      shuffleMode: 'off',
      gaplessPlayback: true,
      crossfadeDuration: 0,
      equalizerEnabled: false,
      equalizerPreset: 'flat',
      normalizeVolume: false,
      mediaKeysEnabled: true,
      scrobbleEnabled: false,
      visualizerEnabled: false,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'audio');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadLibrary();
      await this.loadPlaylists();
      await this.loadConfig();
      
      if (this.config.mediaKeysEnabled) {
        this.registerMediaKeys();
      }
      
      log.info(`[AudioPlayer] Initialized with ${this.tracks.size} tracks`);
    } catch (error) {
      log.error('[AudioPlayer] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Playback controls
    ipcMain.handle('audio:play', async (_event, trackId?: string) => {
      return this.play(trackId);
    });

    ipcMain.handle('audio:pause', () => this.pause());
    ipcMain.handle('audio:stop', () => this.stop());
    ipcMain.handle('audio:next', () => this.next());
    ipcMain.handle('audio:previous', () => this.previous());
    ipcMain.handle('audio:seek', (_event, position: number) => this.seek(position));

    // Volume
    ipcMain.handle('audio:setVolume', async (_event, volume: number) => {
      return this.setVolume(volume);
    });

    ipcMain.handle('audio:mute', () => this.mute());
    ipcMain.handle('audio:unmute', () => this.unmute());
    ipcMain.handle('audio:toggleMute', () => this.toggleMute());

    // State
    ipcMain.handle('audio:getState', () => this.getState());
    ipcMain.handle('audio:getCurrentTrack', () => this.getCurrentTrack());
    ipcMain.handle('audio:getPosition', () => this.position);
    ipcMain.handle('audio:getQueue', () => this.getQueue());

    // Queue management
    ipcMain.handle('audio:setQueue', async (_event, trackIds: string[]) => {
      return this.setQueue(trackIds);
    });

    ipcMain.handle('audio:addToQueue', async (_event, trackId: string) => {
      return this.addToQueue(trackId);
    });

    ipcMain.handle('audio:removeFromQueue', async (_event, index: number) => {
      return this.removeFromQueue(index);
    });

    ipcMain.handle('audio:clearQueue', () => this.clearQueue());
    ipcMain.handle('audio:shuffleQueue', () => this.shuffleQueue());

    // Playback modes
    ipcMain.handle('audio:setRepeatMode', async (_event, mode: RepeatMode) => {
      return this.setRepeatMode(mode);
    });

    ipcMain.handle('audio:setShuffleMode', async (_event, mode: ShuffleMode) => {
      return this.setShuffleMode(mode);
    });

    // Library management
    ipcMain.handle('audio:addTracks', async (_event, paths: string[]) => {
      return this.addTracks(paths);
    });

    ipcMain.handle('audio:scanFolder', async (_event, folderPath: string) => {
      return this.scanFolder(folderPath);
    });

    ipcMain.handle('audio:removeTrack', async (_event, trackId: string) => {
      return this.removeTrack(trackId);
    });

    ipcMain.handle('audio:getTrack', (_event, trackId: string) => {
      return this.tracks.get(trackId);
    });

    ipcMain.handle('audio:getTracks', (_event, filter?: Partial<AudioTrack>) => {
      return this.getTracks(filter);
    });

    ipcMain.handle('audio:searchTracks', (_event, query: string) => {
      return this.searchTracks(query);
    });

    // Metadata
    ipcMain.handle('audio:updateMetadata', async (_event, trackId: string, metadata: Partial<AudioMetadata>) => {
      return this.updateMetadata(trackId, metadata);
    });

    ipcMain.handle('audio:setRating', async (_event, trackId: string, rating: number) => {
      return this.setRating(trackId, rating);
    });

    ipcMain.handle('audio:toggleFavorite', async (_event, trackId: string) => {
      return this.toggleFavorite(trackId);
    });

    // Playlists
    ipcMain.handle('audio:createPlaylist', async (_event, name: string, trackIds?: string[]) => {
      return this.createPlaylist(name, trackIds);
    });

    ipcMain.handle('audio:getPlaylists', () => this.getPlaylists());

    ipcMain.handle('audio:getPlaylist', (_event, playlistId: string) => {
      return this.playlists.get(playlistId);
    });

    ipcMain.handle('audio:updatePlaylist', async (_event, playlistId: string, data: Partial<Playlist>) => {
      return this.updatePlaylist(playlistId, data);
    });

    ipcMain.handle('audio:deletePlaylist', async (_event, playlistId: string) => {
      return this.deletePlaylist(playlistId);
    });

    ipcMain.handle('audio:addToPlaylist', async (_event, playlistId: string, trackIds: string[]) => {
      return this.addToPlaylist(playlistId, trackIds);
    });

    ipcMain.handle('audio:removeFromPlaylist', async (_event, playlistId: string, trackIds: string[]) => {
      return this.removeFromPlaylist(playlistId, trackIds);
    });

    ipcMain.handle('audio:playPlaylist', async (_event, playlistId: string, shuffle?: boolean) => {
      return this.playPlaylist(playlistId, shuffle);
    });

    // Smart playlists
    ipcMain.handle('audio:createSmartPlaylist', async (_event, name: string, rules: SmartPlaylistRule[]) => {
      return this.createSmartPlaylist(name, rules);
    });

    // Equalizer
    ipcMain.handle('audio:getEqPresets', () => {
      return Array.from(this.eqPresets.entries()).map(([id, preset]) => ({ id, ...preset }));
    });

    ipcMain.handle('audio:setEqPreset', async (_event, presetId: string) => {
      return this.setEqPreset(presetId);
    });

    ipcMain.handle('audio:setEqBand', async (_event, band: number, value: number) => {
      return this.setEqBand(band, value);
    });

    // Browse
    ipcMain.handle('audio:getArtists', () => this.getArtists());
    ipcMain.handle('audio:getAlbums', (_event, artist?: string) => this.getAlbums(artist));
    ipcMain.handle('audio:getGenres', () => this.getGenres());

    ipcMain.handle('audio:getTracksByArtist', (_event, artist: string) => {
      return this.getTracksByArtist(artist);
    });

    ipcMain.handle('audio:getTracksByAlbum', (_event, album: string, artist?: string) => {
      return this.getTracksByAlbum(album, artist);
    });

    ipcMain.handle('audio:getTracksByGenre', (_event, genre: string) => {
      return this.getTracksByGenre(genre);
    });

    // Stats
    ipcMain.handle('audio:getStats', () => this.getStats());
    ipcMain.handle('audio:getRecentlyPlayed', (_event, limit?: number) => this.getRecentlyPlayed(limit));
    ipcMain.handle('audio:getMostPlayed', (_event, limit?: number) => this.getMostPlayed(limit));
    ipcMain.handle('audio:getFavorites', () => this.getFavorites());

    // Config
    ipcMain.handle('audio:config', () => this.config);
    ipcMain.handle('audio:setConfig', async (_event, config: Partial<AudioConfig>) => {
      return this.setConfig(config);
    });

    // Visualizer data request (for renderer to poll)
    ipcMain.handle('audio:getVisualizerData', () => {
      // Return audio analysis data if visualizer enabled
      return this.config.visualizerEnabled ? this.getVisualizerData() : null;
    });
  }

  // -------------------------------------------------------------------------
  // PLAYBACK CONTROLS
  // -------------------------------------------------------------------------

  async play(trackId?: string): Promise<{ success: boolean }> {
    try {
      if (trackId) {
        // Find track in queue or add it
        const track = this.tracks.get(trackId);
        if (!track) return { success: false };

        const queueIndex = this.queue.tracks.findIndex(t => t.id === trackId);
        if (queueIndex >= 0) {
          this.queue.currentIndex = queueIndex;
        } else {
          // Add track to queue
          this.queue.tracks.push(track);
          this.queue.currentIndex = this.queue.tracks.length - 1;
        }
      }

      if (this.queue.currentIndex < 0 || this.queue.tracks.length === 0) {
        return { success: false };
      }

      const currentTrack = this.queue.tracks[this.queue.currentIndex];
      
      this.state = 'loading';
      this.notifyRenderer('audio:stateChange', this.state);

      // Send play command to renderer (actual audio playback)
      this.notifyRenderer('audio:loadTrack', {
        track: currentTrack,
        config: {
          volume: this.config.volume,
          muted: this.config.muted,
        },
      });

      this.state = 'playing';
      
      // Update track stats
      currentTrack.lastPlayedAt = Date.now();
      currentTrack.playCount++;
      await this.saveTrack(currentTrack);

      this.emit('track:play', currentTrack);
      this.notifyRenderer('audio:stateChange', this.state);
      this.notifyRenderer('audio:trackChange', currentTrack);

      return { success: true };
    } catch (error) {
      log.error('[AudioPlayer] Play failed:', error);
      return { success: false };
    }
  }

  pause(): { success: boolean } {
    if (this.state !== 'playing') return { success: false };
    
    this.state = 'paused';
    this.notifyRenderer('audio:paused', true);
    this.notifyRenderer('audio:stateChange', this.state);
    this.emit('playback:pause');

    return { success: true };
  }

  stop(): { success: boolean } {
    this.state = 'stopped';
    this.position = { current: 0, duration: 0, percentage: 0 };
    
    this.notifyRenderer('audio:stopped', true);
    this.notifyRenderer('audio:stateChange', this.state);
    this.emit('playback:stop');

    return { success: true };
  }

  async next(): Promise<{ success: boolean }> {
    if (this.queue.tracks.length === 0) return { success: false };

    if (this.config.repeatMode === 'one') {
      // Restart current track
      return this.play();
    }

    let nextIndex = this.queue.currentIndex + 1;

    if (nextIndex >= this.queue.tracks.length) {
      if (this.config.repeatMode === 'all') {
        nextIndex = 0;
      } else {
        this.stop();
        return { success: true };
      }
    }

    this.queue.currentIndex = nextIndex;
    return this.play();
  }

  async previous(): Promise<{ success: boolean }> {
    if (this.queue.tracks.length === 0) return { success: false };

    // If past 3 seconds, restart current track
    if (this.position.current > 3) {
      return this.seek(0);
    }

    let prevIndex = this.queue.currentIndex - 1;

    if (prevIndex < 0) {
      if (this.config.repeatMode === 'all') {
        prevIndex = this.queue.tracks.length - 1;
      } else {
        prevIndex = 0;
      }
    }

    this.queue.currentIndex = prevIndex;
    return this.play();
  }

  seek(position: number): { success: boolean } {
    if (this.state === 'stopped') return { success: false };
    
    this.notifyRenderer('audio:seek', position);
    this.emit('playback:seek', position);

    return { success: true };
  }

  // Called from renderer when position updates
  updatePosition(position: PlaybackPosition): void {
    this.position = position;
    this.emit('position:update', position);
  }

  // Called from renderer when track ends
  async onTrackEnd(): Promise<void> {
    await this.next();
  }

  // -------------------------------------------------------------------------
  // VOLUME CONTROLS
  // -------------------------------------------------------------------------

  setVolume(volume: number): { success: boolean } {
    this.config.volume = Math.max(0, Math.min(1, volume));
    this.notifyRenderer('audio:setVolume', this.config.volume);
    this.saveConfig();
    return { success: true };
  }

  mute(): { success: boolean } {
    this.config.muted = true;
    this.notifyRenderer('audio:setMute', true);
    this.saveConfig();
    return { success: true };
  }

  unmute(): { success: boolean } {
    this.config.muted = false;
    this.notifyRenderer('audio:setMute', false);
    this.saveConfig();
    return { success: true };
  }

  toggleMute(): { success: boolean } {
    return this.config.muted ? this.unmute() : this.mute();
  }

  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------

  getState(): {
    playbackState: PlaybackState;
    currentTrack: AudioTrack | null;
    position: PlaybackPosition;
    config: AudioConfig;
  } {
    return {
      playbackState: this.state,
      currentTrack: this.getCurrentTrack(),
      position: this.position,
      config: this.config,
    };
  }

  getCurrentTrack(): AudioTrack | null {
    if (this.queue.currentIndex < 0 || this.queue.currentIndex >= this.queue.tracks.length) {
      return null;
    }
    return this.queue.tracks[this.queue.currentIndex];
  }

  // -------------------------------------------------------------------------
  // QUEUE MANAGEMENT
  // -------------------------------------------------------------------------

  getQueue(): { tracks: AudioTrack[]; currentIndex: number } {
    return {
      tracks: this.queue.tracks,
      currentIndex: this.queue.currentIndex,
    };
  }

  setQueue(trackIds: string[]): { success: boolean } {
    const tracks = trackIds
      .map(id => this.tracks.get(id))
      .filter((t): t is AudioTrack => t !== undefined);

    this.queue = {
      tracks,
      currentIndex: tracks.length > 0 ? 0 : -1,
      originalOrder: trackIds,
    };

    this.notifyRenderer('audio:queueChange', this.getQueue());
    return { success: true };
  }

  addToQueue(trackId: string): { success: boolean } {
    const track = this.tracks.get(trackId);
    if (!track) return { success: false };

    this.queue.tracks.push(track);
    this.queue.originalOrder.push(trackId);

    if (this.queue.currentIndex < 0) {
      this.queue.currentIndex = 0;
    }

    this.notifyRenderer('audio:queueChange', this.getQueue());
    return { success: true };
  }

  removeFromQueue(index: number): { success: boolean } {
    if (index < 0 || index >= this.queue.tracks.length) {
      return { success: false };
    }

    this.queue.tracks.splice(index, 1);
    this.queue.originalOrder.splice(index, 1);

    // Adjust current index
    if (index < this.queue.currentIndex) {
      this.queue.currentIndex--;
    } else if (index === this.queue.currentIndex) {
      if (this.queue.currentIndex >= this.queue.tracks.length) {
        this.queue.currentIndex = this.queue.tracks.length - 1;
      }
    }

    this.notifyRenderer('audio:queueChange', this.getQueue());
    return { success: true };
  }

  clearQueue(): { success: boolean } {
    this.stop();
    this.queue = { tracks: [], currentIndex: -1, originalOrder: [] };
    this.notifyRenderer('audio:queueChange', this.getQueue());
    return { success: true };
  }

  shuffleQueue(): { success: boolean } {
    if (this.queue.tracks.length <= 1) return { success: true };

    const currentTrack = this.getCurrentTrack();
    
    // Fisher-Yates shuffle
    const tracks = [...this.queue.tracks];
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }

    this.queue.tracks = tracks;

    // Keep current track at current position
    if (currentTrack) {
      const newIndex = tracks.findIndex(t => t.id === currentTrack.id);
      if (newIndex >= 0 && newIndex !== this.queue.currentIndex) {
        // Swap with current position
        [tracks[this.queue.currentIndex], tracks[newIndex]] = 
        [tracks[newIndex], tracks[this.queue.currentIndex]];
      }
    }

    this.notifyRenderer('audio:queueChange', this.getQueue());
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // PLAYBACK MODES
  // -------------------------------------------------------------------------

  setRepeatMode(mode: RepeatMode): { success: boolean } {
    this.config.repeatMode = mode;
    this.notifyRenderer('audio:configChange', this.config);
    this.saveConfig();
    return { success: true };
  }

  setShuffleMode(mode: ShuffleMode): { success: boolean } {
    this.config.shuffleMode = mode;
    
    if (mode === 'on') {
      this.shuffleQueue();
    } else {
      // Restore original order
      const currentTrack = this.getCurrentTrack();
      const tracks = this.queue.originalOrder
        .map(id => this.tracks.get(id))
        .filter((t): t is AudioTrack => t !== undefined);
      
      this.queue.tracks = tracks;
      
      if (currentTrack) {
        this.queue.currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
      }
    }

    this.notifyRenderer('audio:configChange', this.config);
    this.saveConfig();
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // LIBRARY MANAGEMENT
  // -------------------------------------------------------------------------

  async addTracks(paths: string[]): Promise<{ added: number; failed: number }> {
    let added = 0;
    let failed = 0;

    for (const filePath of paths) {
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (!this.supportedFormats.includes(ext)) {
          failed++;
          continue;
        }

        // Check if already exists
        const existing = Array.from(this.tracks.values()).find(t => t.path === filePath);
        if (existing) continue;

        const id = `track-${++this.idCounter}-${Date.now()}`;
        const stats = await fs.stat(filePath);
        
        const track: AudioTrack = {
          id,
          path: filePath,
          filename: path.basename(filePath),
          metadata: {
            title: path.basename(filePath, ext),
            duration: 0, // Will be updated when played
          },
          addedAt: Date.now(),
          playCount: 0,
          favorite: false,
        };

        this.tracks.set(id, track);
        await this.saveTrack(track);
        added++;

        this.emit('track:added', track);
      } catch (error) {
        log.error(`[AudioPlayer] Failed to add track ${filePath}:`, error);
        failed++;
      }
    }

    if (added > 0) {
      this.notifyRenderer('audio:libraryChange', { added, failed });
    }

    return { added, failed };
  }

  async scanFolder(folderPath: string): Promise<{ added: number; failed: number }> {
    const files: string[] = [];

    const scanDir = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.supportedFormats.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        log.error(`[AudioPlayer] Failed to scan ${dir}:`, error);
      }
    };

    await scanDir(folderPath);
    return this.addTracks(files);
  }

  async removeTrack(trackId: string): Promise<{ success: boolean }> {
    const track = this.tracks.get(trackId);
    if (!track) return { success: false };

    // Remove from playlists
    for (const playlist of this.playlists.values()) {
      const index = playlist.tracks.indexOf(trackId);
      if (index >= 0) {
        playlist.tracks.splice(index, 1);
        await this.savePlaylist(playlist);
      }
    }

    // Remove from queue
    const queueIndex = this.queue.tracks.findIndex(t => t.id === trackId);
    if (queueIndex >= 0) {
      this.removeFromQueue(queueIndex);
    }

    // Delete track file
    const trackPath = path.join(this.dataPath, 'library', `${trackId}.json`);
    await fs.unlink(trackPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    this.tracks.delete(trackId);
    this.emit('track:removed', trackId);

    return { success: true };
  }

  getTracks(filter?: Partial<AudioTrack>): AudioTrack[] {
    let tracks = Array.from(this.tracks.values());

    if (filter) {
      if (filter.favorite !== undefined) {
        tracks = tracks.filter(t => t.favorite === filter.favorite);
      }
    }

    return tracks.sort((a, b) => 
      a.metadata.title.localeCompare(b.metadata.title)
    );
  }

  searchTracks(query: string): AudioTrack[] {
    const q = query.toLowerCase();
    
    return Array.from(this.tracks.values())
      .filter(track => 
        track.metadata.title.toLowerCase().includes(q) ||
        track.metadata.artist?.toLowerCase().includes(q) ||
        track.metadata.album?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }

  // -------------------------------------------------------------------------
  // METADATA
  // -------------------------------------------------------------------------

  async updateMetadata(trackId: string, metadata: Partial<AudioMetadata>): Promise<{ success: boolean }> {
    const track = this.tracks.get(trackId);
    if (!track) return { success: false };

    track.metadata = { ...track.metadata, ...metadata };
    await this.saveTrack(track);

    this.emit('track:updated', track);
    return { success: true };
  }

  async setRating(trackId: string, rating: number): Promise<{ success: boolean }> {
    const track = this.tracks.get(trackId);
    if (!track) return { success: false };

    track.rating = Math.max(1, Math.min(5, rating));
    await this.saveTrack(track);

    this.emit('track:updated', track);
    return { success: true };
  }

  async toggleFavorite(trackId: string): Promise<{ success: boolean; favorite: boolean }> {
    const track = this.tracks.get(trackId);
    if (!track) return { success: false, favorite: false };

    track.favorite = !track.favorite;
    await this.saveTrack(track);

    this.emit('track:updated', track);
    return { success: true, favorite: track.favorite };
  }

  // -------------------------------------------------------------------------
  // PLAYLISTS
  // -------------------------------------------------------------------------

  async createPlaylist(name: string, trackIds?: string[]): Promise<Playlist> {
    const id = `playlist-${++this.idCounter}-${Date.now()}`;
    const now = Date.now();

    const playlist: Playlist = {
      id,
      name,
      tracks: trackIds || [],
      createdAt: now,
      updatedAt: now,
      isSmartPlaylist: false,
    };

    this.playlists.set(id, playlist);
    await this.savePlaylist(playlist);

    this.emit('playlist:created', playlist);
    return playlist;
  }

  getPlaylists(): Playlist[] {
    return Array.from(this.playlists.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async updatePlaylist(playlistId: string, data: Partial<Playlist>): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return { success: false };

    if (data.name !== undefined) playlist.name = data.name;
    if (data.description !== undefined) playlist.description = data.description;
    if (data.artwork !== undefined) playlist.artwork = data.artwork;
    if (data.tracks !== undefined) playlist.tracks = data.tracks;
    
    playlist.updatedAt = Date.now();
    await this.savePlaylist(playlist);

    this.emit('playlist:updated', playlist);
    return { success: true };
  }

  async deletePlaylist(playlistId: string): Promise<{ success: boolean }> {
    if (!this.playlists.has(playlistId)) return { success: false };

    const playlistPath = path.join(this.dataPath, 'playlists', `${playlistId}.json`);
    await fs.unlink(playlistPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    this.playlists.delete(playlistId);
    this.emit('playlist:deleted', playlistId);

    return { success: true };
  }

  async addToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist || playlist.isSmartPlaylist) return { success: false };

    // Add only tracks that exist and aren't already in playlist
    for (const id of trackIds) {
      if (this.tracks.has(id) && !playlist.tracks.includes(id)) {
        playlist.tracks.push(id);
      }
    }

    playlist.updatedAt = Date.now();
    await this.savePlaylist(playlist);

    this.emit('playlist:updated', playlist);
    return { success: true };
  }

  async removeFromPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist || playlist.isSmartPlaylist) return { success: false };

    playlist.tracks = playlist.tracks.filter(id => !trackIds.includes(id));
    playlist.updatedAt = Date.now();
    await this.savePlaylist(playlist);

    this.emit('playlist:updated', playlist);
    return { success: true };
  }

  async playPlaylist(playlistId: string, shuffle = false): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return { success: false };

    let trackIds = playlist.isSmartPlaylist 
      ? this.evaluateSmartPlaylist(playlist)
      : [...playlist.tracks];

    if (trackIds.length === 0) return { success: false };

    this.setQueue(trackIds);

    if (shuffle) {
      this.shuffleQueue();
    }

    return this.play();
  }

  async createSmartPlaylist(name: string, rules: SmartPlaylistRule[]): Promise<Playlist> {
    const playlist = await this.createPlaylist(name);
    playlist.isSmartPlaylist = true;
    playlist.smartRules = rules;
    
    await this.savePlaylist(playlist);
    return playlist;
  }

  private evaluateSmartPlaylist(playlist: Playlist): string[] {
    if (!playlist.smartRules?.length) return [];

    return Array.from(this.tracks.values())
      .filter(track => {
        return playlist.smartRules!.every(rule => {
          const value = this.getTrackFieldValue(track, rule.field);
          return this.evaluateRule(value, rule.operator, rule.value);
        });
      })
      .map(t => t.id);
  }

  private getTrackFieldValue(track: AudioTrack, field: SmartPlaylistRule['field']): string | number | undefined {
    switch (field) {
      case 'artist': return track.metadata.artist;
      case 'album': return track.metadata.album;
      case 'genre': return track.metadata.genre;
      case 'year': return track.metadata.year;
      case 'rating': return track.rating;
      case 'playCount': return track.playCount;
      case 'addedAt': return track.addedAt;
      default: return undefined;
    }
  }

  private evaluateRule(value: string | number | undefined, operator: SmartPlaylistRule['operator'], target: string | number): boolean {
    if (value === undefined) return false;

    switch (operator) {
      case 'is':
        return String(value).toLowerCase() === String(target).toLowerCase();
      case 'contains':
        return String(value).toLowerCase().includes(String(target).toLowerCase());
      case 'startsWith':
        return String(value).toLowerCase().startsWith(String(target).toLowerCase());
      case 'greaterThan':
        return Number(value) > Number(target);
      case 'lessThan':
        return Number(value) < Number(target);
      default:
        return false;
    }
  }

  // -------------------------------------------------------------------------
  // EQUALIZER
  // -------------------------------------------------------------------------

  setEqPreset(presetId: string): { success: boolean } {
    if (!this.eqPresets.has(presetId)) return { success: false };
    
    this.config.equalizerPreset = presetId;
    this.config.equalizerEnabled = true;
    
    this.notifyRenderer('audio:eqChange', this.eqPresets.get(presetId));
    this.saveConfig();
    
    return { success: true };
  }

  setEqBand(band: number, value: number): { success: boolean } {
    if (band < 0 || band > 9) return { success: false };
    
    // Create custom preset if needed
    if (!this.eqPresets.has('custom')) {
      const current = this.eqPresets.get(this.config.equalizerPreset);
      this.eqPresets.set('custom', {
        name: 'Custom',
        bands: current?.bands ? [...current.bands] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      });
    }

    const custom = this.eqPresets.get('custom')!;
    custom.bands[band] = Math.max(-12, Math.min(12, value));
    
    this.config.equalizerPreset = 'custom';
    this.config.equalizerEnabled = true;
    
    this.notifyRenderer('audio:eqChange', custom);
    this.saveConfig();
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // BROWSE
  // -------------------------------------------------------------------------

  getArtists(): { name: string; trackCount: number; albumCount: number }[] {
    const artists = new Map<string, { tracks: Set<string>; albums: Set<string> }>();
    
    for (const track of this.tracks.values()) {
      const artist = track.metadata.artist || 'Unknown Artist';
      
      if (!artists.has(artist)) {
        artists.set(artist, { tracks: new Set(), albums: new Set() });
      }
      
      const data = artists.get(artist)!;
      data.tracks.add(track.id);
      if (track.metadata.album) {
        data.albums.add(track.metadata.album);
      }
    }

    return Array.from(artists.entries())
      .map(([name, data]) => ({
        name,
        trackCount: data.tracks.size,
        albumCount: data.albums.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getAlbums(artist?: string): { name: string; artist?: string; trackCount: number; year?: number }[] {
    const albums = new Map<string, { artist?: string; tracks: Set<string>; year?: number }>();
    
    for (const track of this.tracks.values()) {
      if (artist && track.metadata.artist !== artist) continue;
      
      const album = track.metadata.album || 'Unknown Album';
      const key = `${album}|||${track.metadata.artist || ''}`;
      
      if (!albums.has(key)) {
        albums.set(key, { artist: track.metadata.artist, tracks: new Set(), year: track.metadata.year });
      }
      
      albums.get(key)!.tracks.add(track.id);
    }

    return Array.from(albums.entries())
      .map(([key, data]) => ({
        name: key.split('|||')[0],
        artist: data.artist,
        trackCount: data.tracks.size,
        year: data.year,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getGenres(): { name: string; trackCount: number }[] {
    const genres = new Map<string, number>();
    
    for (const track of this.tracks.values()) {
      const genre = track.metadata.genre || 'Unknown';
      genres.set(genre, (genres.get(genre) || 0) + 1);
    }

    return Array.from(genres.entries())
      .map(([name, trackCount]) => ({ name, trackCount }))
      .sort((a, b) => b.trackCount - a.trackCount);
  }

  getTracksByArtist(artist: string): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.metadata.artist === artist)
      .sort((a, b) => {
        // Sort by album, then track number
        const albumCompare = (a.metadata.album || '').localeCompare(b.metadata.album || '');
        if (albumCompare !== 0) return albumCompare;
        return (a.metadata.trackNumber || 0) - (b.metadata.trackNumber || 0);
      });
  }

  getTracksByAlbum(album: string, artist?: string): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.metadata.album === album && (!artist || t.metadata.artist === artist))
      .sort((a, b) => (a.metadata.trackNumber || 0) - (b.metadata.trackNumber || 0));
  }

  getTracksByGenre(genre: string): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.metadata.genre === genre)
      .sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): PlayerStats {
    const tracks = Array.from(this.tracks.values());
    
    // Top artists
    const artistCounts = new Map<string, number>();
    for (const track of tracks) {
      const artist = track.metadata.artist || 'Unknown';
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
    const topArtists = Array.from(artistCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top albums
    const albumCounts = new Map<string, number>();
    for (const track of tracks) {
      const album = track.metadata.album || 'Unknown';
      albumCounts.set(album, (albumCounts.get(album) || 0) + 1);
    }
    const topAlbums = Array.from(albumCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTracks: tracks.length,
      totalPlaylists: this.playlists.size,
      totalDuration: tracks.reduce((sum, t) => sum + (t.metadata.duration || 0), 0),
      topArtists,
      topAlbums,
      recentlyPlayed: this.getRecentlyPlayed(10),
      mostPlayed: this.getMostPlayed(10),
    };
  }

  getRecentlyPlayed(limit = 20): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.lastPlayedAt)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, limit);
  }

  getMostPlayed(limit = 20): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  }

  getFavorites(): AudioTrack[] {
    return Array.from(this.tracks.values())
      .filter(t => t.favorite)
      .sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
  }

  // -------------------------------------------------------------------------
  // VISUALIZER
  // -------------------------------------------------------------------------

  private getVisualizerData(): { frequencies: number[]; waveform: number[] } | null {
    // This would be fed by the audio context analyzer in the renderer
    // Here we just define the interface
    return null;
  }

  // -------------------------------------------------------------------------
  // MEDIA KEYS
  // -------------------------------------------------------------------------

  private registerMediaKeys(): void {
    try {
      globalShortcut.register('MediaPlayPause', () => {
        if (this.state === 'playing') this.pause();
        else this.play();
      });

      globalShortcut.register('MediaNextTrack', () => {
        this.next();
      });

      globalShortcut.register('MediaPreviousTrack', () => {
        this.previous();
      });

      globalShortcut.register('MediaStop', () => {
        this.stop();
      });
    } catch (error) {
      log.warn('[AudioPlayer] Failed to register media keys:', error);
    }
  }

  private unregisterMediaKeys(): void {
    globalShortcut.unregister('MediaPlayPause');
    globalShortcut.unregister('MediaNextTrack');
    globalShortcut.unregister('MediaPreviousTrack');
    globalShortcut.unregister('MediaStop');
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------

  async setConfig(config: Partial<AudioConfig>): Promise<{ success: boolean }> {
    const oldMediaKeys = this.config.mediaKeysEnabled;
    
    this.config = { ...this.config, ...config };
    
    // Handle media keys toggle
    if (config.mediaKeysEnabled !== undefined && config.mediaKeysEnabled !== oldMediaKeys) {
      if (config.mediaKeysEnabled) {
        this.registerMediaKeys();
      } else {
        this.unregisterMediaKeys();
      }
    }
    
    await this.saveConfig();
    this.notifyRenderer('audio:configChange', this.config);
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadLibrary(): Promise<void> {
    try {
      const libraryPath = path.join(this.dataPath, 'library');
      await fs.mkdir(libraryPath, { recursive: true });
      
      const files = await fs.readdir(libraryPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(libraryPath, file), 'utf-8');
            const track = JSON.parse(data) as AudioTrack;
            this.tracks.set(track.id, track);
            
            // Extract ID counter
            const match = track.id.match(/track-(\d+)-/);
            if (match) {
              this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      log.error('[AudioPlayer] Failed to load library:', error);
    }
  }

  private async saveTrack(track: AudioTrack): Promise<void> {
    try {
      const libraryPath = path.join(this.dataPath, 'library');
      await fs.mkdir(libraryPath, { recursive: true });
      
      const trackPath = path.join(libraryPath, `${track.id}.json`);
      await fs.writeFile(trackPath, JSON.stringify(track, null, 2));
    } catch (error) {
      log.error('[AudioPlayer] Failed to save track:', error);
    }
  }

  private async loadPlaylists(): Promise<void> {
    try {
      const playlistsPath = path.join(this.dataPath, 'playlists');
      await fs.mkdir(playlistsPath, { recursive: true });
      
      const files = await fs.readdir(playlistsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(playlistsPath, file), 'utf-8');
            const playlist = JSON.parse(data) as Playlist;
            this.playlists.set(playlist.id, playlist);
            
            // Extract ID counter
            const match = playlist.id.match(/playlist-(\d+)-/);
            if (match) {
              this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      log.error('[AudioPlayer] Failed to load playlists:', error);
    }
  }

  private async savePlaylist(playlist: Playlist): Promise<void> {
    try {
      const playlistsPath = path.join(this.dataPath, 'playlists');
      await fs.mkdir(playlistsPath, { recursive: true });
      
      const playlistPath = path.join(playlistsPath, `${playlist.id}.json`);
      await fs.writeFile(playlistPath, JSON.stringify(playlist, null, 2));
    } catch (error) {
      log.error('[AudioPlayer] Failed to save playlist:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[AudioPlayer] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.unregisterMediaKeys();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const AudioPlayerSystem = new AudioPlayerSystemClass();
export default AudioPlayerSystem;
