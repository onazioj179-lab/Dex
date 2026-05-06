// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Timeline Controller
// Phase 67: Unified chronological view of all activity
// ===========================================================================

import { ipcMain } from 'electron';
import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type EventType = 'file' | 'session' | 'image' | 'audio' | 'folder' | 'project' | 'action';

export interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  description?: string;
  timestamp: number;
  duration?: number;
  path?: string;
  thumbnail?: string;
  projectId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

interface GetEventsOptions {
  projectId?: string;
  timeRange?: 'today' | 'week' | 'month' | 'all';
  types?: EventType[];
  limit?: number;
  offset?: number;
}

// ===========================================================================
// Timeline Controller
// ===========================================================================

export class TimelineController {
  private dataStore: DataStore;
  private logger: Logger;
  private events: TimelineEvent[] = [];
  private maxEvents: number = 10000; // Keep last 10k events
  private initialized: boolean = false;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('[Timeline] Initializing...');

    // Load saved timeline data
    await this.loadTimelineData();

    // Register IPC handlers
    this.registerHandlers();

    this.initialized = true;
    this.logger.info(`[Timeline] Initialized with ${this.events.length} events`);
  }

  // -------------------------------------------------------------------------
  // IPC Handlers
  // -------------------------------------------------------------------------

  private registerHandlers(): void {
    // Get timeline events
    ipcMain.handle('timeline:getEvents', async (_, options?: GetEventsOptions) => {
      return this.getEvents(options);
    });

    // Add event
    ipcMain.handle('timeline:addEvent', async (_, event: Omit<TimelineEvent, 'id'>) => {
      return this.addEvent(event);
    });

    // Get event by ID
    ipcMain.handle('timeline:getEvent', async (_, id: string) => {
      return this.events.find(e => e.id === id) || null;
    });

    // Get events for date
    ipcMain.handle('timeline:getByDate', async (_, date: string) => {
      return this.getEventsByDate(date);
    });

    // Get project timeline
    ipcMain.handle('timeline:getProjectTimeline', async (_, projectId: string) => {
      return this.events.filter(e => e.projectId === projectId);
    });

    // Get session timeline
    ipcMain.handle('timeline:getSessionTimeline', async (_, sessionId: string) => {
      return this.events.filter(e => e.sessionId === sessionId);
    });

    // Clear old events
    ipcMain.handle('timeline:clearOld', async (_, olderThan: number) => {
      return this.clearOldEvents(olderThan);
    });

    // Get stats
    ipcMain.handle('timeline:getStats', async () => {
      return this.getStats();
    });
  }

  // -------------------------------------------------------------------------
  // Core Methods
  // -------------------------------------------------------------------------

  private async loadTimelineData(): Promise<void> {
    try {
      const data = await this.dataStore.get('timeline:events');
      if (data) {
        this.events = data;
      }
    } catch (error) {
      this.logger.error('[Timeline] Failed to load data:', error);
    }
  }

  private async saveTimelineData(): Promise<void> {
    try {
      await this.dataStore.set('timeline:events', this.events);
    } catch (error) {
      this.logger.error('[Timeline] Failed to save data:', error);
    }
  }

  private getEvents(options?: GetEventsOptions): TimelineEvent[] {
    let filtered = [...this.events];

    // Filter by project
    if (options?.projectId) {
      filtered = filtered.filter(e => e.projectId === options.projectId);
    }

    // Filter by types
    if (options?.types && options.types.length > 0) {
      const typeSet = new Set(options.types);
      filtered = filtered.filter(e => typeSet.has(e.type));
    }

    // Filter by time range
    if (options?.timeRange && options.timeRange !== 'all') {
      const now = Date.now();
      let cutoff: number;

      switch (options.timeRange) {
        case 'today':
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          cutoff = today.getTime();
          break;
        case 'week':
          cutoff = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case 'month':
          cutoff = now - 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          cutoff = 0;
      }

      filtered = filtered.filter(e => e.timestamp >= cutoff);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Add a new event to the timeline
   */
  async addEvent(eventData: Omit<TimelineEvent, 'id'>): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      ...eventData,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: eventData.timestamp || Date.now(),
    };

    this.events.unshift(event);

    // Trim old events if we exceed max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    await this.saveTimelineData();
    return event;
  }

  private getEventsByDate(dateStr: string): TimelineEvent[] {
    const date = new Date(dateStr);
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.events.filter(e => 
      e.timestamp >= startOfDay.getTime() && 
      e.timestamp <= endOfDay.getTime()
    );
  }

  private async clearOldEvents(olderThan: number): Promise<number> {
    const initialCount = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= olderThan);
    await this.saveTimelineData();
    return initialCount - this.events.length;
  }

  private getStats(): {
    totalEvents: number;
    byType: Record<EventType, number>;
    byDay: { date: string; count: number }[];
  } {
    const byType: Record<EventType, number> = {
      file: 0,
      session: 0,
      image: 0,
      audio: 0,
      folder: 0,
      project: 0,
      action: 0,
    };

    const byDayMap = new Map<string, number>();

    for (const event of this.events) {
      byType[event.type]++;
      
      const date = new Date(event.timestamp).toDateString();
      byDayMap.set(date, (byDayMap.get(date) || 0) + 1);
    }

    const byDay = Array.from(byDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30); // Last 30 days

    return {
      totalEvents: this.events.length,
      byType,
      byDay,
    };
  }

  // -------------------------------------------------------------------------
  // Public API for other controllers to log events
  // -------------------------------------------------------------------------

  /**
   * Log a file event
   */
  async logFileEvent(
    action: string, 
    filePath: string, 
    projectId?: string
  ): Promise<void> {
    await this.addEvent({
      type: 'file',
      title: `${action}: ${filePath.split(/[/\\]/).pop()}`,
      description: filePath,
      timestamp: Date.now(),
      path: filePath,
      projectId,
    });
  }

  /**
   * Log a session event
   */
  async logSessionEvent(
    title: string, 
    sessionId: string, 
    duration?: number
  ): Promise<void> {
    await this.addEvent({
      type: 'session',
      title,
      timestamp: Date.now(),
      sessionId,
      duration,
    });
  }

  /**
   * Log a media event (image/audio)
   */
  async logMediaEvent(
    type: 'image' | 'audio',
    title: string,
    path: string,
    projectId?: string
  ): Promise<void> {
    await this.addEvent({
      type,
      title,
      timestamp: Date.now(),
      path,
      projectId,
    });
  }

  /**
   * Log an action event
   */
  async logAction(title: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.addEvent({
      type: 'action',
      title,
      timestamp: Date.now(),
      metadata,
    });
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    await this.saveTimelineData();
    this.logger.info('[Timeline] Shutdown complete');
  }
}
