// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Media Playback Engine
// Universal media playback with hardware acceleration
// ===========================================================================

import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type MediaType = 'audio' | 'video' | 'unknown';

export interface MediaInfo {
  path: string;
  type: MediaType;
  name: string;
  duration?: number;
  format: string;
  size: number;
  width?: number;
  height?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  hasSubtitles?: boolean;
  subtitleTracks?: SubtitleTrack[];
  audioTracks?: AudioTrack[];
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  path?: string;
  embedded?: boolean;
}

export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  channels: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: number;
  loop: boolean;
}

export interface QueueItem {
  id: string;
  path: string;
  name: string;
  type: MediaType;
  duration?: number;
  thumbnail?: string;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.opus', '.webm'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.flv', '.m4v', '.ogv'
]);

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt', '.sub', '.ass', '.ssa']);

// ===========================================================================
// Media Playback Engine
// ===========================================================================

export class MediaPlaybackEngine {
  private logger: Logger;
  private currentMedia: MediaInfo | null = null;
  private playbackState: PlaybackState;
  private queue: QueueItem[] = [];
  private queueIndex: number = -1;
  private shuffle: boolean = false;
  private repeat: 'none' | 'one' | 'all' = 'none';
  private mainWindow: BrowserWindow | null = null;
  private subtitlePreferences: {
    fontSize: number;
    color: string;
    background: string;
  };
  private initialized: boolean = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.playbackState = this.getDefaultState();
    this.subtitlePreferences = {
      fontSize: 24,
      color: '#ffffff',
      background: 'rgba(0, 0, 0, 0.75)',
    };
  }

  private getDefaultState(): PlaybackState {
    return {
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
      buffered: 0,
      loop: false,
    };
  }

  async initialize(mainWindow: BrowserWindow): Promise<void> {
    if (this.initialized) return;

    this.mainWindow = mainWindow;
    this.logger.info('[MediaEngine] Initializing...');

    // Register IPC handlers
    this.registerHandlers();

    // Load saved preferences
    await this.loadPreferences();

    this.initialized = true;
    this.logger.info('[MediaEngine] Initialized');
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  private registerHandlers(): void {
    // Media info
    ipcMain.handle('media:getInfo', async (_, filePath: string) => {
      return this.getMediaInfo(filePath);
    });

    // Playback control (renderer handles actual playback)
    ipcMain.handle('media:load', async (_, filePath: string) => {
      return this.loadMedia(filePath);
    });

    ipcMain.handle('media:getState', async () => {
      return this.playbackState;
    });

    ipcMain.handle('media:updateState', async (_, state: Partial<PlaybackState>) => {
      this.playbackState = { ...this.playbackState, ...state };
      this.broadcastState();
      return this.playbackState;
    });

    // Queue management
    ipcMain.handle('media:getQueue', async () => {
      return { queue: this.queue, index: this.queueIndex };
    });

    ipcMain.handle('media:setQueue', async (_, items: QueueItem[], startIndex?: number) => {
      this.queue = items;
      this.queueIndex = startIndex ?? 0;
      return { queue: this.queue, index: this.queueIndex };
    });

    ipcMain.handle('media:addToQueue', async (_, item: QueueItem) => {
      this.queue.push(item);
      return { queue: this.queue, index: this.queueIndex };
    });

    ipcMain.handle('media:removeFromQueue', async (_, index: number) => {
      this.queue.splice(index, 1);
      if (this.queueIndex >= index && this.queueIndex > 0) {
        this.queueIndex--;
      }
      return { queue: this.queue, index: this.queueIndex };
    });

    ipcMain.handle('media:clearQueue', async () => {
      this.queue = [];
      this.queueIndex = -1;
      return { queue: this.queue, index: this.queueIndex };
    });

    ipcMain.handle('media:next', async () => {
      return this.getNextItem();
    });

    ipcMain.handle('media:previous', async () => {
      return this.getPreviousItem();
    });

    // Settings
    ipcMain.handle('media:setShuffle', async (_, enabled: boolean) => {
      this.shuffle = enabled;
      return this.shuffle;
    });

    ipcMain.handle('media:setRepeat', async (_, mode: 'none' | 'one' | 'all') => {
      this.repeat = mode;
      return this.repeat;
    });

    ipcMain.handle('media:getSettings', async () => {
      return { shuffle: this.shuffle, repeat: this.repeat };
    });

    // Subtitles
    ipcMain.handle('media:getSubtitlePrefs', async () => {
      return this.subtitlePreferences;
    });

    ipcMain.handle('media:setSubtitlePrefs', async (_, prefs: Partial<typeof this.subtitlePreferences>) => {
      this.subtitlePreferences = { ...this.subtitlePreferences, ...prefs };
      await this.savePreferences();
      return this.subtitlePreferences;
    });

    ipcMain.handle('media:findSubtitles', async (_, videoPath: string) => {
      return this.findSubtitleFiles(videoPath);
    });

    // Picture-in-picture
    ipcMain.handle('media:enterPiP', async () => {
      // Handled by renderer via HTML5 PiP API
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // Media Info
  // -------------------------------------------------------------------------

  private async getMediaInfo(filePath: string): Promise<MediaInfo | null> {
    try {
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = this.getMediaType(ext);

      if (type === 'unknown') {
        this.logger.warn(`[MediaEngine] Unsupported format: ${ext}`);
        return null;
      }

      const info: MediaInfo = {
        path: filePath,
        type,
        name: path.basename(filePath, ext),
        format: ext.substring(1).toUpperCase(),
        size: stats.size,
      };

      // Find subtitle files for videos
      if (type === 'video') {
        info.subtitleTracks = await this.findSubtitleFiles(filePath);
        info.hasSubtitles = info.subtitleTracks.length > 0;
      }

      return info;
    } catch (error) {
      this.logger.error('[MediaEngine] Failed to get media info:', error);
      return null;
    }
  }

  private getMediaType(ext: string): MediaType {
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    return 'unknown';
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  private async loadMedia(filePath: string): Promise<MediaInfo | null> {
    const info = await this.getMediaInfo(filePath);
    if (!info) return null;

    this.currentMedia = info;
    this.playbackState = {
      ...this.getDefaultState(),
      volume: this.playbackState.volume,
      muted: this.playbackState.muted,
    };

    this.broadcastState();
    return info;
  }

  private getNextItem(): QueueItem | null {
    if (this.queue.length === 0) return null;

    if (this.repeat === 'one') {
      return this.queue[this.queueIndex];
    }

    let nextIndex: number;
    if (this.shuffle) {
      nextIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      nextIndex = this.queueIndex + 1;
      if (nextIndex >= this.queue.length) {
        if (this.repeat === 'all') {
          nextIndex = 0;
        } else {
          return null;
        }
      }
    }

    this.queueIndex = nextIndex;
    return this.queue[this.queueIndex];
  }

  private getPreviousItem(): QueueItem | null {
    if (this.queue.length === 0) return null;

    // If more than 3 seconds in, restart current track
    if (this.playbackState.currentTime > 3) {
      return this.queue[this.queueIndex];
    }

    let prevIndex = this.queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.repeat === 'all' ? this.queue.length - 1 : 0;
    }

    this.queueIndex = prevIndex;
    return this.queue[this.queueIndex];
  }

  // -------------------------------------------------------------------------
  // Subtitles
  // -------------------------------------------------------------------------

  private async findSubtitleFiles(videoPath: string): Promise<SubtitleTrack[]> {
    const tracks: SubtitleTrack[] = [];
    const dir = path.dirname(videoPath);
    const baseName = path.basename(videoPath, path.extname(videoPath));

    try {
      const files = await fs.promises.readdir(dir);
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!SUBTITLE_EXTENSIONS.has(ext)) continue;

        // Check if subtitle matches video name
        if (file.startsWith(baseName)) {
          const fullPath = path.join(dir, file);
          
          // Try to extract language from filename
          const langMatch = file.match(/\.([a-z]{2,3})\.[^.]+$/i);
          const language = langMatch ? langMatch[1].toUpperCase() : 'Unknown';

          tracks.push({
            id: `sub-${tracks.length}`,
            label: `${language} (${ext.substring(1).toUpperCase()})`,
            language,
            path: fullPath,
            embedded: false,
          });
        }
      }
    } catch (error) {
      this.logger.error('[MediaEngine] Error finding subtitles:', error);
    }

    return tracks;
  }

  // -------------------------------------------------------------------------
  // State Broadcasting
  // -------------------------------------------------------------------------

  private broadcastState(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('media:stateChanged', {
        state: this.playbackState,
        media: this.currentMedia,
        queue: { items: this.queue, index: this.queueIndex },
        settings: { shuffle: this.shuffle, repeat: this.repeat },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  private async loadPreferences(): Promise<void> {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'media-prefs.json');
      if (fs.existsSync(prefsPath)) {
        const data = JSON.parse(await fs.promises.readFile(prefsPath, 'utf-8'));
        this.subtitlePreferences = { ...this.subtitlePreferences, ...data.subtitles };
        this.playbackState.volume = data.volume ?? 1;
      }
    } catch (error) {
      this.logger.error('[MediaEngine] Failed to load preferences:', error);
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      const prefsPath = path.join(app.getPath('userData'), 'media-prefs.json');
      await fs.promises.writeFile(prefsPath, JSON.stringify({
        subtitles: this.subtitlePreferences,
        volume: this.playbackState.volume,
      }, null, 2));
    } catch (error) {
      this.logger.error('[MediaEngine] Failed to save preferences:', error);
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.savePreferences();
    this.logger.info('[MediaEngine] Shutdown complete');
  }
}
