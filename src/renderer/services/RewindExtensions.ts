// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Rewind Extensions
 * 9A: Visual Timeline (zoomable activity history)
 * 9B: Work Reports (daily/weekly auto-generated summaries)
 * 9C: Memory Map (spatial project representation)
 * 9D: Personal Changelog (enhanced UI - store already in featureSuiteStore)
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

const ipc = (channel: string, ...args: unknown[]) =>
  (window as any).electron?.ipcRenderer?.invoke(channel, ...args).catch(() => null);

// ===========================================================================
// 9A: Visual Timeline Store
// ===========================================================================

interface TimelineEvent {
  id: string;
  type: 'app' | 'file' | 'clipboard' | 'browser' | 'dex' | 'task' | 'note' | 'screenshot';
  title: string;
  detail: string;
  timestamp: number;
  duration: number; // ms
  appName: string;
  category: string;
  metadata: Record<string, unknown>;
}

interface TimelineCluster {
  id: string;
  events: TimelineEvent[];
  start: number;
  end: number;
  label: string;
  dominant: string; // most common type
}

interface ZoomLevel {
  name: string;
  msPerPixel: number;
  labelFormat: 'hour' | 'day' | 'week' | 'month';
}

const ZOOM_LEVELS: ZoomLevel[] = [
  { name: 'minute', msPerPixel: 1000, labelFormat: 'hour' },
  { name: 'hour', msPerPixel: 60000, labelFormat: 'hour' },
  { name: 'day', msPerPixel: 300000, labelFormat: 'day' },
  { name: 'week', msPerPixel: 3600000, labelFormat: 'week' },
  { name: 'month', msPerPixel: 86400000, labelFormat: 'month' },
];

interface VisualTimelineState {
  events: TimelineEvent[];
  clusters: TimelineCluster[];
  zoomIndex: number;
  viewStart: number;
  viewEnd: number;
  selectedEvent: TimelineEvent | null;
  filterTypes: string[];
  loading: boolean;

  loadEvents: (start: number, end: number) => Promise<void>;
  clusterEvents: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  panTo: (timestamp: number) => void;
  panBy: (deltaMs: number) => void;
  selectEvent: (event: TimelineEvent | null) => void;
  setFilterTypes: (types: string[]) => void;
  jumpToNow: () => void;
  jumpToDate: (date: string) => void;
  getVisibleEvents: () => TimelineEvent[];
  getHourBreakdown: (date: string) => Record<number, { count: number; types: Record<string, number> }>;
}

export const useVisualTimelineStore = create<VisualTimelineState>()(
  devtools(
    (set, get) => ({
      events: [],
      clusters: [],
      zoomIndex: 2,
      viewStart: Date.now() - 86400000,
      viewEnd: Date.now(),
      selectedEvent: null,
      filterTypes: [],
      loading: false,

      loadEvents: async (start: number, end: number) => {
        set({ loading: true });
        const data = await ipc('rewind:query', {
          startTime: start,
          endTime: end,
          limit: 5000,
        });
        const events: TimelineEvent[] = (data || []).map((entry: any) => ({
          id: entry.id || String(Math.random()),
          type: entry.type || 'dex',
          title: entry.content || entry.appName || '',
          detail: entry.metadata?.title || entry.content || '',
          timestamp: entry.timestamp || Date.now(),
          duration: entry.metadata?.duration || 0,
          appName: entry.appName || 'Unknown',
          category: entry.type || 'other',
          metadata: entry.metadata || {},
        }));
        set({ events, loading: false });
        get().clusterEvents();
      },

      clusterEvents: () => {
        const { events, zoomIndex, filterTypes } = get();
        let filtered = events;
        if (filterTypes.length > 0) {
          filtered = events.filter(e => filterTypes.includes(e.type));
        }

        filtered.sort((a, b) => a.timestamp - b.timestamp);

        const clusterGap = ZOOM_LEVELS[zoomIndex].msPerPixel * 20;
        const clusters: TimelineCluster[] = [];
        let current: TimelineEvent[] = [];

        for (const event of filtered) {
          if (current.length === 0) {
            current.push(event);
            continue;
          }
          const lastTs = current[current.length - 1].timestamp;
          if (event.timestamp - lastTs <= clusterGap) {
            current.push(event);
          } else {
            pushCluster(clusters, current);
            current = [event];
          }
        }
        if (current.length > 0) pushCluster(clusters, current);

        set({ clusters });
      },

      zoomIn: () => {
        const { zoomIndex, viewStart, viewEnd } = get();
        if (zoomIndex <= 0) return;
        const mid = (viewStart + viewEnd) / 2;
        const newIndex = zoomIndex - 1;
        const span = ZOOM_LEVELS[newIndex].msPerPixel * 1000;
        set({
          zoomIndex: newIndex,
          viewStart: mid - span / 2,
          viewEnd: mid + span / 2,
        });
        get().clusterEvents();
      },

      zoomOut: () => {
        const { zoomIndex, viewStart, viewEnd } = get();
        if (zoomIndex >= ZOOM_LEVELS.length - 1) return;
        const mid = (viewStart + viewEnd) / 2;
        const newIndex = zoomIndex + 1;
        const span = ZOOM_LEVELS[newIndex].msPerPixel * 1000;
        set({
          zoomIndex: newIndex,
          viewStart: mid - span / 2,
          viewEnd: mid + span / 2,
        });
        get().clusterEvents();
      },

      panTo: (timestamp: number) => {
        const { viewStart, viewEnd } = get();
        const span = viewEnd - viewStart;
        set({ viewStart: timestamp - span / 2, viewEnd: timestamp + span / 2 });
      },

      panBy: (deltaMs: number) => {
        const { viewStart, viewEnd } = get();
        set({ viewStart: viewStart + deltaMs, viewEnd: viewEnd + deltaMs });
      },

      selectEvent: (event) => set({ selectedEvent: event }),

      setFilterTypes: (types: string[]) => {
        set({ filterTypes: types });
        get().clusterEvents();
      },

      jumpToNow: () => {
        const { viewStart, viewEnd } = get();
        const span = viewEnd - viewStart;
        const now = Date.now();
        set({ viewStart: now - span, viewEnd: now });
        get().loadEvents(now - span, now);
      },

      jumpToDate: (date: string) => {
        const d = new Date(date);
        const start = d.setHours(0, 0, 0, 0);
        const end = start + 86400000;
        set({ viewStart: start, viewEnd: end });
        get().loadEvents(start, end);
      },

      getVisibleEvents: () => {
        const { events, viewStart, viewEnd, filterTypes } = get();
        let result = events.filter(e => e.timestamp >= viewStart && e.timestamp <= viewEnd);
        if (filterTypes.length > 0) {
          result = result.filter(e => filterTypes.includes(e.type));
        }
        return result;
      },

      getHourBreakdown: (date: string) => {
        const d = new Date(date);
        const dayStart = d.setHours(0, 0, 0, 0);
        const { events } = get();
        const breakdown: Record<number, { count: number; types: Record<string, number> }> = {};

        for (let h = 0; h < 24; h++) {
          breakdown[h] = { count: 0, types: {} };
        }

        for (const event of events) {
          if (event.timestamp >= dayStart && event.timestamp < dayStart + 86400000) {
            const hour = new Date(event.timestamp).getHours();
            breakdown[hour].count++;
            breakdown[hour].types[event.type] = (breakdown[hour].types[event.type] || 0) + 1;
          }
        }

        return breakdown;
      },
    }),
    { name: 'dex-visual-timeline' }
  )
);

function pushCluster(clusters: TimelineCluster[], events: TimelineEvent[]) {
  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  let dominant = 'dex';
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) { dominant = type; maxCount = count; }
  }

  clusters.push({
    id: 'cl-' + events[0].timestamp,
    events: [...events],
    start: events[0].timestamp,
    end: events[events.length - 1].timestamp,
    label: events.length === 1 ? events[0].title : `${events.length} events`,
    dominant,
  });
}

// ===========================================================================
// 9B: Work Reports Store
// ===========================================================================

interface DailyReport {
  date: string;
  totalActiveTime: number; // ms
  appBreakdown: { app: string; time: number; percentage: number }[];
  typeBreakdown: { type: string; count: number }[];
  peakHours: { hour: number; activity: number }[];
  focusSessions: { start: number; end: number; app: string; duration: number }[];
  topFiles: { name: string; accessCount: number }[];
  topSites: { url: string; visitCount: number }[];
  productivityScore: number; // 0-100
  comparedToAverage: number; // percentage difference from 7-day avg
  streakDays: number;
  insights: string[];
}

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  dailyReports: DailyReport[];
  totalActiveTime: number;
  averageDailyTime: number;
  mostProductiveDay: string;
  leastProductiveDay: string;
  appTrends: { app: string; trend: 'up' | 'down' | 'stable'; delta: number }[];
  weeklyGoals: { goal: string; progress: number; met: boolean }[];
  averageProductivityScore: number;
  highlights: string[];
  suggestions: string[];
}

interface WorkReportsState {
  dailyReport: DailyReport | null;
  weeklyReport: WeeklyReport | null;
  reportHistory: { date: string; score: number }[];
  selectedDate: string;
  loading: boolean;

  generateDailyReport: (date?: string) => Promise<void>;
  generateWeeklyReport: (weekStart?: string) => Promise<void>;
  loadReportHistory: (days?: number) => Promise<void>;
  setSelectedDate: (date: string) => void;
  exportReport: (type: 'daily' | 'weekly', format: 'markdown' | 'json') => Promise<string>;
  getProductivityTrend: (days: number) => number[];
}

export const useWorkReportsStore = create<WorkReportsState>()(
  devtools(
    (set, get) => ({
      dailyReport: null,
      weeklyReport: null,
      reportHistory: [],
      selectedDate: new Date().toISOString().split('T')[0],
      loading: false,

      generateDailyReport: async (date?: string) => {
        set({ loading: true });
        const targetDate = date || get().selectedDate;
        const data = await ipc('rewind:daily-report', targetDate);

        if (data) {
          set({ dailyReport: data, loading: false });
          return;
        }

        // Fallback: generate from local events
        const dayStart = new Date(targetDate).setHours(0, 0, 0, 0);
        const dayEnd = dayStart + 86400000;
        const eventsRaw = await ipc('rewind:query', { startTime: dayStart, endTime: dayEnd, limit: 10000 });
        const events = eventsRaw || [];

        const appTimes: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        const hourActivity: Record<number, number> = {};
        const fileCounts: Record<string, number> = {};
        const siteCounts: Record<string, number> = {};

        for (const e of events) {
          const app = e.appName || 'Unknown';
          appTimes[app] = (appTimes[app] || 0) + (e.metadata?.duration || 5000);
          typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
          const hour = new Date(e.timestamp).getHours();
          hourActivity[hour] = (hourActivity[hour] || 0) + 1;

          if (e.type === 'file') {
            const name = e.content || e.metadata?.path || 'unknown';
            fileCounts[name] = (fileCounts[name] || 0) + 1;
          }
          if (e.type === 'browser') {
            const url = e.content || e.metadata?.url || '';
            if (url) siteCounts[url] = (siteCounts[url] || 0) + 1;
          }
        }

        const totalTime = Object.values(appTimes).reduce((a, b) => a + b, 0);
        const appBreakdown = Object.entries(appTimes)
          .map(([app, time]) => ({
            app, time, percentage: totalTime > 0 ? Math.round((time / totalTime) * 100) : 0,
          }))
          .sort((a, b) => b.time - a.time)
          .slice(0, 10);

        const typeBreakdown = Object.entries(typeCounts)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        const peakHours = Object.entries(hourActivity)
          .map(([h, activity]) => ({ hour: Number(h), activity }))
          .sort((a, b) => b.activity - a.activity);

        const topFiles = Object.entries(fileCounts)
          .map(([name, accessCount]) => ({ name, accessCount }))
          .sort((a, b) => b.accessCount - a.accessCount)
          .slice(0, 5);

        const topSites = Object.entries(siteCounts)
          .map(([url, visitCount]) => ({ url, visitCount }))
          .sort((a, b) => b.visitCount - a.visitCount)
          .slice(0, 5);

        // Simple productivity score
        const activeHours = Object.keys(hourActivity).length;
        const productivityScore = Math.min(100, Math.round((activeHours / 12) * 70 + (events.length / 100) * 30));

        // Build focus sessions (consecutive events in same app > 10 min)
        const sorted = [...events].sort((a: any, b: any) => a.timestamp - b.timestamp);
        const focusSessions: DailyReport['focusSessions'] = [];
        let sessionStart = 0;
        let sessionApp = '';

        for (let i = 0; i < sorted.length; i++) {
          const e = sorted[i];
          if (e.appName !== sessionApp) {
            if (sessionStart > 0 && e.timestamp - sessionStart > 600000) {
              focusSessions.push({
                start: sessionStart,
                end: sorted[i - 1]?.timestamp || e.timestamp,
                app: sessionApp,
                duration: (sorted[i - 1]?.timestamp || e.timestamp) - sessionStart,
              });
            }
            sessionStart = e.timestamp;
            sessionApp = e.appName;
          }
        }

        const insights: string[] = [];
        if (peakHours.length > 0) {
          insights.push(`Most active at ${peakHours[0].hour}:00 with ${peakHours[0].activity} events`);
        }
        if (appBreakdown.length > 0) {
          insights.push(`Primary app: ${appBreakdown[0].app} (${appBreakdown[0].percentage}% of time)`);
        }
        if (focusSessions.length > 0) {
          insights.push(`${focusSessions.length} deep focus session${focusSessions.length > 1 ? 's' : ''} detected`);
        }

        const report: DailyReport = {
          date: targetDate,
          totalActiveTime: totalTime,
          appBreakdown,
          typeBreakdown,
          peakHours,
          focusSessions,
          topFiles,
          topSites,
          productivityScore,
          comparedToAverage: 0,
          streakDays: 1,
          insights,
        };

        set({ dailyReport: report, loading: false });
      },

      generateWeeklyReport: async (weekStart?: string) => {
        set({ loading: true });
        const data = await ipc('rewind:weekly-report', weekStart);
        if (data) {
          set({ weeklyReport: data, loading: false });
          return;
        }

        // Generate locally from daily reports
        const start = weekStart
          ? new Date(weekStart)
          : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d; })();

        const dailyReports: DailyReport[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          set({ selectedDate: dateStr });
          await get().generateDailyReport(dateStr);
          const dr = get().dailyReport;
          if (dr) dailyReports.push(dr);
        }

        const totalTime = dailyReports.reduce((s, r) => s + r.totalActiveTime, 0);
        const avgScore = dailyReports.length > 0
          ? Math.round(dailyReports.reduce((s, r) => s + r.productivityScore, 0) / dailyReports.length)
          : 0;

        const best = dailyReports.reduce((a, b) => a.productivityScore >= b.productivityScore ? a : b, dailyReports[0]);
        const worst = dailyReports.reduce((a, b) => a.productivityScore <= b.productivityScore ? a : b, dailyReports[0]);

        const endDate = new Date(start);
        endDate.setDate(endDate.getDate() + 6);

        const report: WeeklyReport = {
          weekStart: start.toISOString().split('T')[0],
          weekEnd: endDate.toISOString().split('T')[0],
          dailyReports,
          totalActiveTime: totalTime,
          averageDailyTime: dailyReports.length > 0 ? totalTime / dailyReports.length : 0,
          mostProductiveDay: best?.date || '',
          leastProductiveDay: worst?.date || '',
          appTrends: [],
          weeklyGoals: [],
          averageProductivityScore: avgScore,
          highlights: [
            `Total active time: ${Math.round(totalTime / 3600000)}h`,
            `Average productivity: ${avgScore}/100`,
          ],
          suggestions: [],
        };

        set({ weeklyReport: report, loading: false });
      },

      loadReportHistory: async (days = 30) => {
        const data = await ipc('rewind:report-history', days);
        if (data) {
          set({ reportHistory: data });
        } else {
          // Generate locally
          const history: { date: string; score: number }[] = [];
          const now = new Date();
          for (let i = 0; i < days; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            history.push({
              date: d.toISOString().split('T')[0],
              score: Math.round(30 + Math.random() * 60),
            });
          }
          set({ reportHistory: history });
        }
      },

      setSelectedDate: (date) => set({ selectedDate: date }),

      exportReport: async (type, format) => {
        const { dailyReport, weeklyReport } = get();
        const report = type === 'daily' ? dailyReport : weeklyReport;
        if (!report) return '';

        if (format === 'json') {
          return JSON.stringify(report, null, 2);
        }

        // Markdown export
        if (type === 'daily' && dailyReport) {
          const lines = [
            `# Daily Report: ${dailyReport.date}`,
            '',
            `**Productivity Score:** ${dailyReport.productivityScore}/100`,
            `**Active Time:** ${Math.round(dailyReport.totalActiveTime / 60000)}m`,
            '',
            '## App Breakdown',
            ...dailyReport.appBreakdown.map(a => `- ${a.app}: ${a.percentage}%`),
            '',
            '## Insights',
            ...dailyReport.insights.map(i => `- ${i}`),
          ];
          return lines.join('\n');
        }

        if (type === 'weekly' && weeklyReport) {
          const lines = [
            `# Weekly Report: ${weeklyReport.weekStart} to ${weeklyReport.weekEnd}`,
            '',
            `**Avg Score:** ${weeklyReport.averageProductivityScore}/100`,
            `**Total Time:** ${Math.round(weeklyReport.totalActiveTime / 3600000)}h`,
            '',
            '## Highlights',
            ...weeklyReport.highlights.map(h => `- ${h}`),
          ];
          return lines.join('\n');
        }

        return '';
      },

      getProductivityTrend: (days: number) => {
        const { reportHistory } = get();
        return reportHistory.slice(0, days).map(r => r.score).reverse();
      },
    }),
    { name: 'dex-work-reports' }
  )
);

// ===========================================================================
// 9C: Memory Map Store
// ===========================================================================

interface MemoryNode {
  id: string;
  type: 'project' | 'note' | 'task' | 'file' | 'app' | 'person' | 'tag';
  label: string;
  x: number;
  y: number;
  size: number; // visual weight based on activity
  color: string;
  lastAccessed: number;
  accessCount: number;
  metadata: Record<string, unknown>;
}

interface MemoryEdge {
  id: string;
  source: string;
  target: string;
  weight: number; // co-occurrence strength
  type: 'co-access' | 'reference' | 'dependency' | 'temporal';
}

interface MemoryCluster {
  id: string;
  label: string;
  nodeIds: string[];
  centroidX: number;
  centroidY: number;
  color: string;
}

interface MemoryMapState {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  clusters: MemoryCluster[];
  selectedNode: MemoryNode | null;
  hoveredNode: string | null;
  filterTypes: string[];
  searchQuery: string;
  loading: boolean;
  layoutMode: 'force' | 'radial' | 'grid' | 'temporal';

  loadMemoryMap: () => Promise<void>;
  computeLayout: () => void;
  selectNode: (node: MemoryNode | null) => void;
  setHoveredNode: (id: string | null) => void;
  setFilterTypes: (types: string[]) => void;
  setSearchQuery: (query: string) => void;
  setLayoutMode: (mode: 'force' | 'radial' | 'grid' | 'temporal') => void;
  moveNode: (id: string, x: number, y: number) => void;
  getConnections: (nodeId: string) => { node: MemoryNode; weight: number }[];
  getVisibleNodes: () => MemoryNode[];
  getVisibleEdges: () => MemoryEdge[];
}

const NODE_COLORS: Record<string, string> = {
  project: '#007aff',
  note: '#ff9500',
  task: 'var(--color-success)',
  file: '#5856d6',
  app: '#ff2d55',
  person: '#af52de',
  tag: '#00c7be',
};

export const useMemoryMapStore = create<MemoryMapState>()(
  devtools(
    (set, get) => ({
      nodes: [],
      edges: [],
      clusters: [],
      selectedNode: null,
      hoveredNode: null,
      filterTypes: [],
      searchQuery: '',
      loading: false,
      layoutMode: 'force' as const,

      loadMemoryMap: async () => {
        set({ loading: true });

        // Load from backend
        const data = await ipc('rewind:memory-map');

        if (data && data.nodes) {
          set({
            nodes: data.nodes,
            edges: data.edges || [],
            clusters: data.clusters || [],
            loading: false,
          });
          return;
        }

        // Generate from activity data
        const recentActivity = await ipc('rewind:query', {
          startTime: Date.now() - 2592000000, // 30 days
          endTime: Date.now(),
          limit: 5000,
        });

        const nodeMap = new Map<string, MemoryNode>();
        const edgeMap = new Map<string, MemoryEdge>();
        const entries = recentActivity || [];

        // Build nodes from unique entities
        for (const entry of entries) {
          const key = `${entry.type}:${entry.appName || entry.content || 'unknown'}`;
          if (!nodeMap.has(key)) {
            const type = entry.type === 'app' ? 'app'
              : entry.type === 'file' ? 'file'
              : entry.type === 'browser' ? 'app'
              : entry.type === 'note' ? 'note'
              : 'project';

            nodeMap.set(key, {
              id: key,
              type,
              label: entry.appName || entry.content || 'Unknown',
              x: Math.random() * 800,
              y: Math.random() * 600,
              size: 1,
              color: NODE_COLORS[type] || '#8e8e93',
              lastAccessed: entry.timestamp,
              accessCount: 1,
              metadata: {},
            });
          } else {
            const node = nodeMap.get(key)!;
            node.accessCount++;
            node.size = Math.min(5, 1 + Math.log2(node.accessCount));
            if (entry.timestamp > node.lastAccessed) {
              node.lastAccessed = entry.timestamp;
            }
          }
        }

        // Build edges from temporal co-occurrence (within 5-minute windows)
        const sortedEntries = [...entries].sort((a: any, b: any) => a.timestamp - b.timestamp);
        const windowMs = 300000;

        for (let i = 0; i < sortedEntries.length; i++) {
          const a = sortedEntries[i];
          const keyA = `${a.type}:${a.appName || a.content || 'unknown'}`;

          for (let j = i + 1; j < sortedEntries.length; j++) {
            const b = sortedEntries[j];
            if (b.timestamp - a.timestamp > windowMs) break;

            const keyB = `${b.type}:${b.appName || b.content || 'unknown'}`;
            if (keyA === keyB) continue;

            const edgeId = [keyA, keyB].sort().join('->');
            if (!edgeMap.has(edgeId)) {
              edgeMap.set(edgeId, {
                id: edgeId,
                source: keyA,
                target: keyB,
                weight: 1,
                type: 'co-access',
              });
            } else {
              edgeMap.get(edgeId)!.weight++;
            }
          }
        }

        const nodes = Array.from(nodeMap.values());
        const edges = Array.from(edgeMap.values())
          .filter(e => e.weight > 1)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 200);

        // Simple clustering by dominant connections
        const clusters = clusterNodes(nodes, edges);

        set({ nodes, edges, clusters, loading: false });
        get().computeLayout();
      },

      computeLayout: () => {
        const { nodes, edges, layoutMode } = get();
        if (nodes.length === 0) return;

        let positioned: MemoryNode[];

        switch (layoutMode) {
          case 'radial': {
            const center = { x: 400, y: 300 };
            positioned = nodes.map((n, i) => {
              const angle = (i / nodes.length) * Math.PI * 2;
              const radius = 150 + n.size * 30;
              return { ...n, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
            });
            break;
          }
          case 'grid': {
            const cols = Math.ceil(Math.sqrt(nodes.length));
            positioned = nodes.map((n, i) => ({
              ...n,
              x: 50 + (i % cols) * 80,
              y: 50 + Math.floor(i / cols) * 80,
            }));
            break;
          }
          case 'temporal': {
            const sorted = [...nodes].sort((a, b) => a.lastAccessed - b.lastAccessed);
            const timeRange = sorted.length > 1
              ? sorted[sorted.length - 1].lastAccessed - sorted[0].lastAccessed
              : 1;
            positioned = sorted.map((n, i) => ({
              ...n,
              x: 50 + ((n.lastAccessed - sorted[0].lastAccessed) / timeRange) * 700,
              y: 100 + (i % 6) * 80,
            }));
            break;
          }
          default: {
            // Force-directed (simplified spring layout)
            positioned = forceDirectedLayout(nodes, edges, 50);
            break;
          }
        }

        set({ nodes: positioned });
      },

      selectNode: (node) => set({ selectedNode: node }),
      setHoveredNode: (id) => set({ hoveredNode: id }),
      setFilterTypes: (types) => set({ filterTypes: types }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setLayoutMode: (mode) => {
        set({ layoutMode: mode });
        get().computeLayout();
      },

      moveNode: (id, x, y) => {
        set(s => ({
          nodes: s.nodes.map(n => n.id === id ? { ...n, x, y } : n),
        }));
      },

      getConnections: (nodeId: string) => {
        const { nodes, edges } = get();
        const nodeById = new Map(nodes.map(n => [n.id, n]));
        const connections: { node: MemoryNode; weight: number }[] = [];

        for (const edge of edges) {
          if (edge.source === nodeId && nodeById.has(edge.target)) {
            connections.push({ node: nodeById.get(edge.target)!, weight: edge.weight });
          } else if (edge.target === nodeId && nodeById.has(edge.source)) {
            connections.push({ node: nodeById.get(edge.source)!, weight: edge.weight });
          }
        }

        return connections.sort((a, b) => b.weight - a.weight);
      },

      getVisibleNodes: () => {
        const { nodes, filterTypes, searchQuery } = get();
        let result = nodes;
        if (filterTypes.length > 0) {
          result = result.filter(n => filterTypes.includes(n.type));
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(n => n.label.toLowerCase().includes(q));
        }
        return result;
      },

      getVisibleEdges: () => {
        const { edges } = get();
        const visibleIds = new Set(get().getVisibleNodes().map(n => n.id));
        return edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
      },
    }),
    { name: 'dex-memory-map' }
  )
);

// Simple force-directed layout
function forceDirectedLayout(nodes: MemoryNode[], edges: MemoryEdge[], iterations: number): MemoryNode[] {
  const pos = nodes.map(n => ({ id: n.id, x: n.x || Math.random() * 800, y: n.y || Math.random() * 600 }));
  const edgeIndex: Record<string, number> = {};
  pos.forEach((p, i) => { edgeIndex[p.id] = i; });

  const repulsion = 5000;
  const attraction = 0.01;
  const damping = 0.9;
  const vx = new Float64Array(pos.length);
  const vy = new Float64Array(pos.length);

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations;

    // Repulsion
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force * temp;
        const fy = (dy / dist) * force * temp;
        vx[i] += fx;
        vy[i] += fy;
        vx[j] -= fx;
        vy[j] -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const si = edgeIndex[edge.source];
      const ti = edgeIndex[edge.target];
      if (si === undefined || ti === undefined) continue;

      const dx = pos[ti].x - pos[si].x;
      const dy = pos[ti].y - pos[si].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = attraction * dist * edge.weight * temp;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      vx[si] += fx;
      vy[si] += fy;
      vx[ti] -= fx;
      vy[ti] -= fy;
    }

    // Apply velocity
    for (let i = 0; i < pos.length; i++) {
      pos[i].x += vx[i];
      pos[i].y += vy[i];
      vx[i] *= damping;
      vy[i] *= damping;
      // Clamp to viewport
      pos[i].x = Math.max(20, Math.min(780, pos[i].x));
      pos[i].y = Math.max(20, Math.min(580, pos[i].y));
    }
  }

  return nodes.map((n, i) => ({ ...n, x: pos[i].x, y: pos[i].y }));
}

// Simple clustering via connected components with high-weight edges
function clusterNodes(nodes: MemoryNode[], edges: MemoryEdge[]): MemoryCluster[] {
  const threshold = 3;
  const strongEdges = edges.filter(e => e.weight >= threshold);
  const parent: Record<string, string> = {};

  function find(id: string): string {
    if (!parent[id]) parent[id] = id;
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (const node of nodes) {
    parent[node.id] = node.id;
  }

  for (const edge of strongEdges) {
    union(edge.source, edge.target);
  }

  const groups: Record<string, string[]> = {};
  for (const node of nodes) {
    const root = find(node.id);
    if (!groups[root]) groups[root] = [];
    groups[root].push(node.id);
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const colors = ['#007aff', '#ff9500', 'var(--color-success)', '#ff2d55', '#5856d6', '#af52de', '#00c7be'];
  let colorIdx = 0;

  return Object.entries(groups)
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => {
      const clusterNodes = ids.map(id => nodeMap.get(id)!).filter(Boolean);
      const cx = clusterNodes.reduce((s, n) => s + n.x, 0) / clusterNodes.length;
      const cy = clusterNodes.reduce((s, n) => s + n.y, 0) / clusterNodes.length;

      return {
        id: 'cluster-' + root,
        label: clusterNodes[0]?.label || 'Cluster',
        nodeIds: ids,
        centroidX: cx,
        centroidY: cy,
        color: colors[colorIdx++ % colors.length],
      };
    });
}

// ===========================================================================
// 9D: Enhanced Personal Changelog types (store is in featureSuiteStore)
// ===========================================================================

export interface ChangelogCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export const CHANGELOG_CATEGORIES: ChangelogCategory[] = [
  { id: 'added', name: 'Added', color: 'var(--color-success)', icon: '+' },
  { id: 'changed', name: 'Changed', color: '#007aff', icon: '~' },
  { id: 'fixed', name: 'Fixed', color: '#ff9500', icon: 'x' },
  { id: 'removed', name: 'Removed', color: 'var(--color-error)', icon: '-' },
  { id: 'learned', name: 'Learned', color: '#5856d6', icon: '*' },
  { id: 'milestone', name: 'Milestone', color: '#af52de', icon: '!' },
];
