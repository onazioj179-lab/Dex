// ═══════════════════════════════════════════════════════════════════════════
// DEX - Video Player System
// Apple TV-level feel video player with hardware acceleration
// No autoplay, subtitle/caption support, minimal UI, keyboard-driven
// ═══════════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import { app, ipcMain, BrowserWindow, globalShortcut, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type VideoPlaybackState = 'stopped' | 'playing' | 'paused' | 'loading' | 'buffering';
export type VideoRepeatMode = 'off' | 'one' | 'all';

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  src: string; // Path to subtitle file
  format: 'srt' | 'vtt' | 'ass' | 'ssa';
  isExternal: boolean;
  isDefault?: boolean;
}

export interface AudioTrackInfo {
  id: string;
  label: string;
  language: string;
  codec?: string;
  channels?: number;
}

export interface VideoMetadata {
  title: string;
  duration: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  container?: string;
  subtitleTracks: SubtitleTrack[];
  audioTracks: AudioTrackInfo[];
}

export interface VideoFile {
  id: string;
  path: string;
  filename: string;
  metadata: VideoMetadata;
  addedAt: number;
  lastPlayedAt?: number;
  lastPosition?: number; // Resume position in seconds
  playCount: number;
  favorite: boolean;
  thumbnail?: string;
  tags: string[];
  folder?: string;
}

export interface VideoPlaylist {
  id: string;
  name: string;
  description?: string;
  videos: string[]; // Video IDs
  createdAt: number;
  updatedAt: number;
}

export interface PlaybackPosition {
  current: number;
  duration: number;
  percentage: number;
  buffered?: number;
}

export interface VideoConfig {
  volume: number;
  muted: boolean;
  repeatMode: VideoRepeatMode;
  defaultSubtitleLanguage?: string;
  defaultAudioLanguage?: string;
  subtitlesEnabled: boolean;
  subtitleFontSize: number;
  subtitleColor: string;
  subtitleBackground: boolean;
  hardwareAcceleration: boolean;
  preferHDR: boolean;
  autoResumePlayback: boolean;
  skipForwardSeconds: number;
  skipBackwardSeconds: number;
  playbackSpeed: number;
  fitMode: 'contain' | 'cover' | 'fill' | 'none';
  deinterlace: boolean;
  pipEnabled: boolean;
}

export interface VideoQueueState {
  videos: VideoFile[];
  currentIndex: number;
}

export interface VideoStats {
  totalVideos: number;
  totalPlaylists: number;
  totalDuration: number;
  recentlyWatched: VideoFile[];
  mostWatched: VideoFile[];
  favorites: VideoFile[];
  byFolder: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO PLAYER SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

class VideoPlayerSystemClass extends EventEmitter {
  private videos: Map<string, VideoFile> = new Map();
  private playlists: Map<string, VideoPlaylist> = new Map();
  private queue: VideoQueueState = { videos: [], currentIndex: -1 };
  private config: VideoConfig;
  private state: VideoPlaybackState = 'stopped';
  private position: PlaybackPosition = { current: 0, duration: 0, percentage: 0 };
  private currentSubtitleTrack: string | null = null;
  private currentAudioTrack: string | null = null;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private pipWindow: BrowserWindow | null = null;

  private readonly supportedFormats = [
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
    '.m4v', '.mpg', '.mpeg', '.3gp', '.ts', '.mts', '.m2ts', '.vob'
  ];

  private readonly subtitleFormats = ['.srt', '.vtt', '.ass', '.ssa', '.sub'];

  constructor() {
    super();
    this.config = {
      volume: 1.0,
      muted: false,
      repeatMode: 'off',
      subtitlesEnabled: true,
      subtitleFontSize: 24,
      subtitleColor: '#ffffff',
      subtitleBackground: true,
      hardwareAcceleration: true,
      preferHDR: true,
      autoResumePlayback: true,
      skipForwardSeconds: 10,
      skipBackwardSeconds: 10,
      playbackSpeed: 1.0,
      fitMode: 'contain',
      deinterlace: false,
      pipEnabled: true,
    };
    this.setupIPC();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'video');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadLibrary();
      await this.loadPlaylists();
      await this.loadConfig();
      
      log.info(`[VideoPlayer] Initialized with ${this.videos.size} videos`);
    } catch (error) {
      log.error('[VideoPlayer] Initialization failed:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IPC SETUP
  // ─────────────────────────────────────────────────────────────────────────

  private setupIPC(): void {
    // Playback controls
    ipcMain.handle('video:play', async (_event, videoId?: string) => {
      return this.play(videoId);
    });

    ipcMain.handle('video:pause', () => this.pause());
    ipcMain.handle('video:stop', () => this.stop());
    ipcMain.handle('video:next', () => this.next());
    ipcMain.handle('video:previous', () => this.previous());
    ipcMain.handle('video:seek', (_event, position: number) => this.seek(position));
    ipcMain.handle('video:skipForward', () => this.skipForward());
    ipcMain.handle('video:skipBackward', () => this.skipBackward());

    // Volume
    ipcMain.handle('video:setVolume', async (_event, volume: number) => {
      return this.setVolume(volume);
    });

    ipcMain.handle('video:mute', () => this.mute());
    ipcMain.handle('video:unmute', () => this.unmute());
    ipcMain.handle('video:toggleMute', () => this.toggleMute());

    // Playback speed
    ipcMain.handle('video:setSpeed', async (_event, speed: number) => {
      return this.setPlaybackSpeed(speed);
    });

    // State
    ipcMain.handle('video:getState', () => this.getState());
    ipcMain.handle('video:getCurrentVideo', () => this.getCurrentVideo());
    ipcMain.handle('video:getPosition', () => this.position);
    ipcMain.handle('video:getQueue', () => this.getQueue());

    // Queue management
    ipcMain.handle('video:setQueue', async (_event, videoIds: string[]) => {
      return this.setQueue(videoIds);
    });

    ipcMain.handle('video:addToQueue', async (_event, videoId: string) => {
      return this.addToQueue(videoId);
    });

    ipcMain.handle('video:removeFromQueue', async (_event, index: number) => {
      return this.removeFromQueue(index);
    });

    ipcMain.handle('video:clearQueue', () => this.clearQueue());

    // Subtitles
    ipcMain.handle('video:getSubtitleTracks', () => this.getSubtitleTracks());
    
    ipcMain.handle('video:setSubtitleTrack', async (_event, trackId: string | null) => {
      return this.setSubtitleTrack(trackId);
    });

    ipcMain.handle('video:loadExternalSubtitle', async (_event, filePath: string) => {
      return this.loadExternalSubtitle(filePath);
    });

    ipcMain.handle('video:searchSubtitles', async (_event, videoId: string) => {
      return this.searchSubtitles(videoId);
    });

    // Audio tracks
    ipcMain.handle('video:getAudioTracks', () => this.getAudioTracks());
    
    ipcMain.handle('video:setAudioTrack', async (_event, trackId: string) => {
      return this.setAudioTrack(trackId);
    });

    // Library management
    ipcMain.handle('video:addVideos', async (_event, paths: string[]) => {
      return this.addVideos(paths);
    });

    ipcMain.handle('video:scanFolder', async (_event, folderPath: string) => {
      return this.scanFolder(folderPath);
    });

    ipcMain.handle('video:removeVideo', async (_event, videoId: string) => {
      return this.removeVideo(videoId);
    });

    ipcMain.handle('video:getVideo', (_event, videoId: string) => {
      return this.videos.get(videoId);
    });

    ipcMain.handle('video:getVideos', (_event, filter?: { folder?: string; tags?: string[] }) => {
      return this.getVideos(filter);
    });

    ipcMain.handle('video:searchVideos', (_event, query: string) => {
      return this.searchVideos(query);
    });

    ipcMain.handle('video:toggleFavorite', async (_event, videoId: string) => {
      return this.toggleFavorite(videoId);
    });

    ipcMain.handle('video:setTags', async (_event, videoId: string, tags: string[]) => {
      return this.setTags(videoId, tags);
    });

    // Playlists
    ipcMain.handle('video:createPlaylist', async (_event, name: string, videoIds?: string[]) => {
      return this.createPlaylist(name, videoIds);
    });

    ipcMain.handle('video:getPlaylists', () => this.getPlaylists());
    
    ipcMain.handle('video:getPlaylist', (_event, playlistId: string) => {
      return this.playlists.get(playlistId);
    });

    ipcMain.handle('video:updatePlaylist', async (_event, playlistId: string, data: Partial<VideoPlaylist>) => {
      return this.updatePlaylist(playlistId, data);
    });

    ipcMain.handle('video:deletePlaylist', async (_event, playlistId: string) => {
      return this.deletePlaylist(playlistId);
    });

    ipcMain.handle('video:addToPlaylist', async (_event, playlistId: string, videoIds: string[]) => {
      return this.addToPlaylist(playlistId, videoIds);
    });

    ipcMain.handle('video:playPlaylist', async (_event, playlistId: string, startIndex?: number) => {
      return this.playPlaylist(playlistId, startIndex);
    });

    // Display modes
    ipcMain.handle('video:enterFullscreen', () => this.enterFullscreen());
    ipcMain.handle('video:exitFullscreen', () => this.exitFullscreen());
    ipcMain.handle('video:toggleFullscreen', () => this.toggleFullscreen());
    ipcMain.handle('video:enterPiP', () => this.enterPiP());
    ipcMain.handle('video:exitPiP', () => this.exitPiP());
    ipcMain.handle('video:setFitMode', async (_event, mode: VideoConfig['fitMode']) => {
      return this.setFitMode(mode);
    });

    // Screenshot
    ipcMain.handle('video:screenshot', async () => {
      return this.takeScreenshot();
    });

    // Stats
    ipcMain.handle('video:getStats', () => this.getStats());
    ipcMain.handle('video:getRecentlyWatched', (_event, limit?: number) => this.getRecentlyWatched(limit));
    ipcMain.handle('video:getContinueWatching', () => this.getContinueWatching());
    ipcMain.handle('video:getFolders', () => this.getFolders());

    // Config
    ipcMain.handle('video:config', () => this.config);
    ipcMain.handle('video:setConfig', async (_event, config: Partial<VideoConfig>) => {
      return this.setConfig(config);
    });

    // Open file dialog
    ipcMain.handle('video:openDialog', async () => {
      return this.openFileDialog();
    });

    // Position updates from renderer
    ipcMain.on('video:positionUpdate', (_event, position: PlaybackPosition) => {
      this.updatePosition(position);
    });

    ipcMain.on('video:trackEnded', () => {
      this.onVideoEnd();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLAYBACK CONTROLS
  // ─────────────────────────────────────────────────────────────────────────

  async play(videoId?: string): Promise<{ success: boolean }> {
    try {
      if (videoId) {
        const video = this.videos.get(videoId);
        if (!video) return { success: false };

        const queueIndex = this.queue.videos.findIndex(v => v.id === videoId);
        if (queueIndex >= 0) {
          this.queue.currentIndex = queueIndex;
        } else {
          this.queue.videos.push(video);
          this.queue.currentIndex = this.queue.videos.length - 1;
        }
      }

      if (this.queue.currentIndex < 0 || this.queue.videos.length === 0) {
        return { success: false };
      }

      const currentVideo = this.queue.videos[this.queue.currentIndex];
      
      this.state = 'loading';
      this.notifyRenderer('video:stateChange', this.state);

      // Get resume position
      let startPosition = 0;
      if (this.config.autoResumePlayback && currentVideo.lastPosition) {
        // Don't resume if near the end (last 30 seconds)
        if (currentVideo.lastPosition < currentVideo.metadata.duration - 30) {
          startPosition = currentVideo.lastPosition;
        }
      }

      // Load video in renderer
      this.notifyRenderer('video:loadVideo', {
        video: currentVideo,
        startPosition,
        config: {
          volume: this.config.volume,
          muted: this.config.muted,
          speed: this.config.playbackSpeed,
          fitMode: this.config.fitMode,
          subtitlesEnabled: this.config.subtitlesEnabled,
          subtitleStyle: {
            fontSize: this.config.subtitleFontSize,
            color: this.config.subtitleColor,
            background: this.config.subtitleBackground,
          },
        },
      });

      this.state = 'playing';
      
      // Update video stats
      currentVideo.lastPlayedAt = Date.now();
      currentVideo.playCount++;
      await this.saveVideo(currentVideo);

      // Auto-select subtitle track
      if (this.config.subtitlesEnabled && currentVideo.metadata.subtitleTracks.length > 0) {
        const defaultTrack = this.findDefaultSubtitleTrack(currentVideo);
        if (defaultTrack) {
          this.setSubtitleTrack(defaultTrack.id);
        }
      }

      this.emit('video:play', currentVideo);
      this.notifyRenderer('video:stateChange', this.state);
      this.notifyRenderer('video:videoChange', currentVideo);

      return { success: true };
    } catch (error) {
      log.error('[VideoPlayer] Play failed:', error);
      return { success: false };
    }
  }

  pause(): { success: boolean } {
    if (this.state !== 'playing') return { success: false };
    
    this.state = 'paused';
    this.notifyRenderer('video:paused', true);
    this.notifyRenderer('video:stateChange', this.state);
    
    // Save position
    this.saveCurrentPosition();
    this.emit('playback:pause');

    return { success: true };
  }

  stop(): { success: boolean } {
    // Save position before stopping
    this.saveCurrentPosition();
    
    this.state = 'stopped';
    this.position = { current: 0, duration: 0, percentage: 0 };
    
    this.notifyRenderer('video:stopped', true);
    this.notifyRenderer('video:stateChange', this.state);
    this.emit('playback:stop');

    // Close PiP if open
    this.exitPiP();

    return { success: true };
  }

  async next(): Promise<{ success: boolean }> {
    if (this.queue.videos.length === 0) return { success: false };

    if (this.config.repeatMode === 'one') {
      this.seek(0);
      return this.play();
    }

    let nextIndex = this.queue.currentIndex + 1;

    if (nextIndex >= this.queue.videos.length) {
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
    if (this.queue.videos.length === 0) return { success: false };

    // If past 5 seconds, restart current video
    if (this.position.current > 5) {
      return this.seek(0);
    }

    let prevIndex = this.queue.currentIndex - 1;

    if (prevIndex < 0) {
      if (this.config.repeatMode === 'all') {
        prevIndex = this.queue.videos.length - 1;
      } else {
        prevIndex = 0;
      }
    }

    this.queue.currentIndex = prevIndex;
    return this.play();
  }

  seek(position: number): { success: boolean } {
    if (this.state === 'stopped') return { success: false };
    
    this.notifyRenderer('video:seek', position);
    this.emit('playback:seek', position);

    return { success: true };
  }

  skipForward(): { success: boolean } {
    const newPosition = Math.min(
      this.position.current + this.config.skipForwardSeconds,
      this.position.duration
    );
    return this.seek(newPosition);
  }

  skipBackward(): { success: boolean } {
    const newPosition = Math.max(
      this.position.current - this.config.skipBackwardSeconds,
      0
    );
    return this.seek(newPosition);
  }

  updatePosition(position: PlaybackPosition): void {
    this.position = position;
    this.emit('position:update', position);
  }

  async onVideoEnd(): Promise<void> {
    // Clear last position (video completed)
    const currentVideo = this.getCurrentVideo();
    if (currentVideo) {
      currentVideo.lastPosition = undefined;
      await this.saveVideo(currentVideo);
    }
    
    await this.next();
  }

  private async saveCurrentPosition(): Promise<void> {
    const currentVideo = this.getCurrentVideo();
    if (currentVideo && this.position.current > 0) {
      currentVideo.lastPosition = this.position.current;
      await this.saveVideo(currentVideo);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VOLUME & SPEED
  // ─────────────────────────────────────────────────────────────────────────

  setVolume(volume: number): { success: boolean } {
    this.config.volume = Math.max(0, Math.min(1, volume));
    this.notifyRenderer('video:setVolume', this.config.volume);
    this.saveConfig();
    return { success: true };
  }

  mute(): { success: boolean } {
    this.config.muted = true;
    this.notifyRenderer('video:setMute', true);
    this.saveConfig();
    return { success: true };
  }

  unmute(): { success: boolean } {
    this.config.muted = false;
    this.notifyRenderer('video:setMute', false);
    this.saveConfig();
    return { success: true };
  }

  toggleMute(): { success: boolean } {
    return this.config.muted ? this.unmute() : this.mute();
  }

  setPlaybackSpeed(speed: number): { success: boolean } {
    this.config.playbackSpeed = Math.max(0.25, Math.min(4, speed));
    this.notifyRenderer('video:setSpeed', this.config.playbackSpeed);
    this.saveConfig();
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────

  getState(): {
    playbackState: VideoPlaybackState;
    currentVideo: VideoFile | null;
    position: PlaybackPosition;
    config: VideoConfig;
    subtitleTrack: string | null;
    audioTrack: string | null;
  } {
    return {
      playbackState: this.state,
      currentVideo: this.getCurrentVideo(),
      position: this.position,
      config: this.config,
      subtitleTrack: this.currentSubtitleTrack,
      audioTrack: this.currentAudioTrack,
    };
  }

  getCurrentVideo(): VideoFile | null {
    if (this.queue.currentIndex < 0 || this.queue.currentIndex >= this.queue.videos.length) {
      return null;
    }
    return this.queue.videos[this.queue.currentIndex];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUEUE
  // ─────────────────────────────────────────────────────────────────────────

  getQueue(): { videos: VideoFile[]; currentIndex: number } {
    return {
      videos: this.queue.videos,
      currentIndex: this.queue.currentIndex,
    };
  }

  setQueue(videoIds: string[]): { success: boolean } {
    const videos = videoIds
      .map(id => this.videos.get(id))
      .filter((v): v is VideoFile => v !== undefined);

    this.queue = {
      videos,
      currentIndex: videos.length > 0 ? 0 : -1,
    };

    this.notifyRenderer('video:queueChange', this.getQueue());
    return { success: true };
  }

  addToQueue(videoId: string): { success: boolean } {
    const video = this.videos.get(videoId);
    if (!video) return { success: false };

    this.queue.videos.push(video);

    if (this.queue.currentIndex < 0) {
      this.queue.currentIndex = 0;
    }

    this.notifyRenderer('video:queueChange', this.getQueue());
    return { success: true };
  }

  removeFromQueue(index: number): { success: boolean } {
    if (index < 0 || index >= this.queue.videos.length) {
      return { success: false };
    }

    this.queue.videos.splice(index, 1);

    if (index < this.queue.currentIndex) {
      this.queue.currentIndex--;
    } else if (index === this.queue.currentIndex) {
      if (this.queue.currentIndex >= this.queue.videos.length) {
        this.queue.currentIndex = this.queue.videos.length - 1;
      }
    }

    this.notifyRenderer('video:queueChange', this.getQueue());
    return { success: true };
  }

  clearQueue(): { success: boolean } {
    this.stop();
    this.queue = { videos: [], currentIndex: -1 };
    this.notifyRenderer('video:queueChange', this.getQueue());
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBTITLES
  // ─────────────────────────────────────────────────────────────────────────

  getSubtitleTracks(): SubtitleTrack[] {
    const currentVideo = this.getCurrentVideo();
    return currentVideo?.metadata.subtitleTracks || [];
  }

  setSubtitleTrack(trackId: string | null): { success: boolean } {
    this.currentSubtitleTrack = trackId;
    
    if (trackId) {
      const currentVideo = this.getCurrentVideo();
      const track = currentVideo?.metadata.subtitleTracks.find(t => t.id === trackId);
      this.notifyRenderer('video:setSubtitle', track);
    } else {
      this.notifyRenderer('video:setSubtitle', null);
    }

    return { success: true };
  }

  async loadExternalSubtitle(filePath: string): Promise<{ success: boolean; track?: SubtitleTrack }> {
    const currentVideo = this.getCurrentVideo();
    if (!currentVideo) return { success: false };

    try {
      const ext = path.extname(filePath).toLowerCase();
      if (!this.subtitleFormats.includes(ext)) {
        return { success: false };
      }

      const track: SubtitleTrack = {
        id: `sub-ext-${this.idCounter++}`,
        label: path.basename(filePath, ext),
        language: 'unknown',
        src: filePath,
        format: ext.slice(1) as SubtitleTrack['format'],
        isExternal: true,
      };

      currentVideo.metadata.subtitleTracks.push(track);
      await this.saveVideo(currentVideo);

      this.setSubtitleTrack(track.id);
      
      return { success: true, track };
    } catch (error) {
      log.error('[VideoPlayer] Failed to load subtitle:', error);
      return { success: false };
    }
  }

  async searchSubtitles(videoId: string): Promise<{ path: string; language: string }[]> {
    const video = this.videos.get(videoId);
    if (!video) return [];

    // Search for subtitle files in same directory
    const videoDir = path.dirname(video.path);
    const videoName = path.basename(video.path, path.extname(video.path));
    const subtitles: { path: string; language: string }[] = [];

    try {
      const files = await fs.readdir(videoDir);
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!this.subtitleFormats.includes(ext)) continue;

        const fileName = path.basename(file, ext);
        
        // Match by video name or video name + language code
        if (fileName === videoName || fileName.startsWith(`${videoName}.`)) {
          const language = fileName.includes('.') 
            ? fileName.split('.').pop() || 'unknown'
            : 'unknown';
          
          subtitles.push({
            path: path.join(videoDir, file),
            language,
          });
        }
      }
    } catch (error) {
      log.error('[VideoPlayer] Failed to search subtitles:', error);
    }

    return subtitles;
  }

  private findDefaultSubtitleTrack(video: VideoFile): SubtitleTrack | null {
    const tracks = video.metadata.subtitleTracks;
    if (tracks.length === 0) return null;

    // Try to find track matching preferred language
    if (this.config.defaultSubtitleLanguage) {
      const langTrack = tracks.find(t => 
        t.language.toLowerCase() === this.config.defaultSubtitleLanguage?.toLowerCase()
      );
      if (langTrack) return langTrack;
    }

    // Return default track or first track
    return tracks.find(t => t.isDefault) || tracks[0];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO TRACKS
  // ─────────────────────────────────────────────────────────────────────────

  getAudioTracks(): AudioTrackInfo[] {
    const currentVideo = this.getCurrentVideo();
    return currentVideo?.metadata.audioTracks || [];
  }

  setAudioTrack(trackId: string): { success: boolean } {
    this.currentAudioTrack = trackId;
    this.notifyRenderer('video:setAudioTrack', trackId);
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIBRARY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  async addVideos(paths: string[]): Promise<{ added: number; failed: number }> {
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
        const existing = Array.from(this.videos.values()).find(v => v.path === filePath);
        if (existing) continue;

        const id = `video-${++this.idCounter}-${Date.now()}`;
        
        const video: VideoFile = {
          id,
          path: filePath,
          filename: path.basename(filePath),
          metadata: {
            title: path.basename(filePath, ext),
            duration: 0,
            subtitleTracks: [],
            audioTracks: [],
          },
          addedAt: Date.now(),
          playCount: 0,
          favorite: false,
          tags: [],
          folder: path.dirname(filePath),
        };

        // Auto-discover subtitles
        const subtitles = await this.searchSubtitles(id);
        for (const sub of subtitles) {
          const subExt = path.extname(sub.path).toLowerCase();
          video.metadata.subtitleTracks.push({
            id: `sub-${this.idCounter++}`,
            label: sub.language,
            language: sub.language,
            src: sub.path,
            format: subExt.slice(1) as SubtitleTrack['format'],
            isExternal: true,
          });
        }

        this.videos.set(id, video);
        await this.saveVideo(video);
        added++;

        this.emit('video:added', video);
      } catch (error) {
        log.error(`[VideoPlayer] Failed to add video ${filePath}:`, error);
        failed++;
      }
    }

    if (added > 0) {
      this.notifyRenderer('video:libraryChange', { added, failed });
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
        log.error(`[VideoPlayer] Failed to scan ${dir}:`, error);
      }
    };

    await scanDir(folderPath);
    return this.addVideos(files);
  }

  async removeVideo(videoId: string): Promise<{ success: boolean }> {
    const video = this.videos.get(videoId);
    if (!video) return { success: false };

    // Remove from playlists
    for (const playlist of this.playlists.values()) {
      const index = playlist.videos.indexOf(videoId);
      if (index >= 0) {
        playlist.videos.splice(index, 1);
        await this.savePlaylist(playlist);
      }
    }

    // Remove from queue
    const queueIndex = this.queue.videos.findIndex(v => v.id === videoId);
    if (queueIndex >= 0) {
      this.removeFromQueue(queueIndex);
    }

    // Delete video file
    const videoPath = path.join(this.dataPath, 'library', `${videoId}.json`);
    await fs.unlink(videoPath).catch(() => {});

    this.videos.delete(videoId);
    this.emit('video:removed', videoId);

    return { success: true };
  }

  getVideos(filter?: { folder?: string; tags?: string[] }): VideoFile[] {
    let videos = Array.from(this.videos.values());

    if (filter) {
      if (filter.folder) {
        videos = videos.filter(v => v.folder === filter.folder);
      }
      if (filter.tags?.length) {
        videos = videos.filter(v => filter.tags!.some(tag => v.tags.includes(tag)));
      }
    }

    return videos.sort((a, b) => 
      a.metadata.title.localeCompare(b.metadata.title)
    );
  }

  searchVideos(query: string): VideoFile[] {
    const q = query.toLowerCase();
    
    return Array.from(this.videos.values())
      .filter(video => 
        video.metadata.title.toLowerCase().includes(q) ||
        video.filename.toLowerCase().includes(q) ||
        video.tags.some(tag => tag.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }

  async toggleFavorite(videoId: string): Promise<{ success: boolean; favorite: boolean }> {
    const video = this.videos.get(videoId);
    if (!video) return { success: false, favorite: false };

    video.favorite = !video.favorite;
    await this.saveVideo(video);

    this.emit('video:updated', video);
    return { success: true, favorite: video.favorite };
  }

  async setTags(videoId: string, tags: string[]): Promise<{ success: boolean }> {
    const video = this.videos.get(videoId);
    if (!video) return { success: false };

    video.tags = tags;
    await this.saveVideo(video);

    this.emit('video:updated', video);
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLAYLISTS
  // ─────────────────────────────────────────────────────────────────────────

  async createPlaylist(name: string, videoIds?: string[]): Promise<VideoPlaylist> {
    const id = `playlist-${++this.idCounter}-${Date.now()}`;
    const now = Date.now();

    const playlist: VideoPlaylist = {
      id,
      name,
      videos: videoIds || [],
      createdAt: now,
      updatedAt: now,
    };

    this.playlists.set(id, playlist);
    await this.savePlaylist(playlist);

    this.emit('playlist:created', playlist);
    return playlist;
  }

  getPlaylists(): VideoPlaylist[] {
    return Array.from(this.playlists.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async updatePlaylist(playlistId: string, data: Partial<VideoPlaylist>): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return { success: false };

    if (data.name !== undefined) playlist.name = data.name;
    if (data.description !== undefined) playlist.description = data.description;
    if (data.videos !== undefined) playlist.videos = data.videos;
    
    playlist.updatedAt = Date.now();
    await this.savePlaylist(playlist);

    this.emit('playlist:updated', playlist);
    return { success: true };
  }

  async deletePlaylist(playlistId: string): Promise<{ success: boolean }> {
    if (!this.playlists.has(playlistId)) return { success: false };

    const playlistPath = path.join(this.dataPath, 'playlists', `${playlistId}.json`);
    await fs.unlink(playlistPath).catch(() => {});

    this.playlists.delete(playlistId);
    this.emit('playlist:deleted', playlistId);

    return { success: true };
  }

  async addToPlaylist(playlistId: string, videoIds: string[]): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return { success: false };

    for (const id of videoIds) {
      if (this.videos.has(id) && !playlist.videos.includes(id)) {
        playlist.videos.push(id);
      }
    }

    playlist.updatedAt = Date.now();
    await this.savePlaylist(playlist);

    this.emit('playlist:updated', playlist);
    return { success: true };
  }

  async playPlaylist(playlistId: string, startIndex = 0): Promise<{ success: boolean }> {
    const playlist = this.playlists.get(playlistId);
    if (!playlist || playlist.videos.length === 0) return { success: false };

    this.setQueue(playlist.videos);
    this.queue.currentIndex = Math.min(startIndex, this.queue.videos.length - 1);

    return this.play();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DISPLAY MODES
  // ─────────────────────────────────────────────────────────────────────────

  enterFullscreen(): { success: boolean } {
    if (this.mainWindow) {
      this.mainWindow.setFullScreen(true);
      this.notifyRenderer('video:fullscreenChange', true);
      return { success: true };
    }
    return { success: false };
  }

  exitFullscreen(): { success: boolean } {
    if (this.mainWindow) {
      this.mainWindow.setFullScreen(false);
      this.notifyRenderer('video:fullscreenChange', false);
      return { success: true };
    }
    return { success: false };
  }

  toggleFullscreen(): { success: boolean } {
    if (this.mainWindow) {
      const isFullscreen = this.mainWindow.isFullScreen();
      return isFullscreen ? this.exitFullscreen() : this.enterFullscreen();
    }
    return { success: false };
  }

  enterPiP(): { success: boolean } {
    if (!this.config.pipEnabled) return { success: false };
    
    // Create PiP window
    this.notifyRenderer('video:enterPiP', true);
    return { success: true };
  }

  exitPiP(): { success: boolean } {
    if (this.pipWindow && !this.pipWindow.isDestroyed()) {
      this.pipWindow.close();
      this.pipWindow = null;
    }
    this.notifyRenderer('video:exitPiP', true);
    return { success: true };
  }

  setFitMode(mode: VideoConfig['fitMode']): { success: boolean } {
    this.config.fitMode = mode;
    this.notifyRenderer('video:setFitMode', mode);
    this.saveConfig();
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCREENSHOT
  // ─────────────────────────────────────────────────────────────────────────

  async takeScreenshot(): Promise<{ success: boolean; path?: string }> {
    const currentVideo = this.getCurrentVideo();
    if (!currentVideo || this.state === 'stopped') {
      return { success: false };
    }

    try {
      const screenshotsDir = path.join(this.dataPath, 'screenshots');
      await fs.mkdir(screenshotsDir, { recursive: true });
      
      const timestamp = Math.floor(this.position.current);
      const filename = `${currentVideo.id}_${timestamp}_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotsDir, filename);

      // Tell renderer to capture frame
      this.notifyRenderer('video:captureFrame', screenshotPath);

      return { success: true, path: screenshotPath };
    } catch (error) {
      log.error('[VideoPlayer] Screenshot failed:', error);
      return { success: false };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────

  getStats(): VideoStats {
    const videos = Array.from(this.videos.values());
    const byFolder: Record<string, number> = {};

    for (const video of videos) {
      const folder = video.folder || 'Unknown';
      byFolder[folder] = (byFolder[folder] || 0) + 1;
    }

    return {
      totalVideos: videos.length,
      totalPlaylists: this.playlists.size,
      totalDuration: videos.reduce((sum, v) => sum + (v.metadata.duration || 0), 0),
      recentlyWatched: this.getRecentlyWatched(10),
      mostWatched: videos
        .filter(v => v.playCount > 0)
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 10),
      favorites: videos.filter(v => v.favorite),
      byFolder,
    };
  }

  getRecentlyWatched(limit = 20): VideoFile[] {
    return Array.from(this.videos.values())
      .filter(v => v.lastPlayedAt)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, limit);
  }

  getContinueWatching(): VideoFile[] {
    return Array.from(this.videos.values())
      .filter(v => v.lastPosition && v.lastPosition > 0)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, 20);
  }

  getFolders(): { path: string; count: number }[] {
    const folders = new Map<string, number>();
    
    for (const video of this.videos.values()) {
      const folder = video.folder || 'Unknown';
      folders.set(folder, (folders.get(folder) || 0) + 1);
    }

    return Array.from(folders.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FILE DIALOG
  // ─────────────────────────────────────────────────────────────────────────

  async openFileDialog(): Promise<string[]> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: this.supportedFormats.map(f => f.slice(1)) },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      await this.addVideos(result.filePaths);
      return result.filePaths;
    }

    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────────────────────

  async setConfig(config: Partial<VideoConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    this.notifyRenderer('video:configChange', this.config);
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  private async loadLibrary(): Promise<void> {
    try {
      const libraryPath = path.join(this.dataPath, 'library');
      await fs.mkdir(libraryPath, { recursive: true });
      
      const files = await fs.readdir(libraryPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(libraryPath, file), 'utf-8');
            const video = JSON.parse(data) as VideoFile;
            this.videos.set(video.id, video);
            
            const match = video.id.match(/video-(\d+)-/);
            if (match) {
              this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch (error) {
      log.error('[VideoPlayer] Failed to load library:', error);
    }
  }

  private async saveVideo(video: VideoFile): Promise<void> {
    try {
      const libraryPath = path.join(this.dataPath, 'library');
      await fs.mkdir(libraryPath, { recursive: true });
      
      const videoPath = path.join(libraryPath, `${video.id}.json`);
      await fs.writeFile(videoPath, JSON.stringify(video, null, 2));
    } catch (error) {
      log.error('[VideoPlayer] Failed to save video:', error);
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
            const playlist = JSON.parse(data) as VideoPlaylist;
            this.playlists.set(playlist.id, playlist);
            
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
      log.error('[VideoPlayer] Failed to load playlists:', error);
    }
  }

  private async savePlaylist(playlist: VideoPlaylist): Promise<void> {
    try {
      const playlistsPath = path.join(this.dataPath, 'playlists');
      await fs.mkdir(playlistsPath, { recursive: true });
      
      const playlistPath = path.join(playlistsPath, `${playlist.id}.json`);
      await fs.writeFile(playlistPath, JSON.stringify(playlist, null, 2));
    } catch (error) {
      log.error('[VideoPlayer] Failed to save playlist:', error);
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
      log.error('[VideoPlayer] Failed to save config:', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHUTDOWN
  // ─────────────────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.saveCurrentPosition();
    await this.saveConfig();
    this.exitPiP();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const VideoPlayerSystem = new VideoPlayerSystemClass();
export default VideoPlayerSystem;
