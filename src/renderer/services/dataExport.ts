/**
 * DEX Data Export/Import Service
 * Export and import user data (notes, tasks, settings, etc.)
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

import { getBundledAppVersion } from '../utils/appVersion';

// ============================================================================
// TYPES
// ============================================================================

export type ExportFormat = 'json' | 'csv' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includeSettings: boolean;
  includeNotes: boolean;
  includeTasks: boolean;
  includeCalendar: boolean;
  includeKanban: boolean;
  includeEngagement: boolean;
  includeAnalytics: boolean;
  includeClipboard: boolean;
  compressed: boolean;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  timestamp: number;
  error?: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  timestamp: number;
}

export interface DataSection {
  key: string;
  label: string;
  description: string;
  storageKey: string;
  estimatedSize: number;
}

// ============================================================================
// DATA SECTIONS REGISTRY
// ============================================================================

export const DATA_SECTIONS: DataSection[] = [
  { key: 'settings', label: 'Settings', description: 'App preferences and configuration', storageKey: 'dex-settings', estimatedSize: 0 },
  { key: 'notes', label: 'Notes', description: 'All saved notes and content', storageKey: 'dex-notes', estimatedSize: 0 },
  { key: 'tasks', label: 'Tasks', description: 'Tasks, sub-tasks, and recurring items', storageKey: 'dex-tasks', estimatedSize: 0 },
  { key: 'calendar', label: 'Calendar', description: 'Events and reminders', storageKey: 'dex-calendar', estimatedSize: 0 },
  { key: 'kanban', label: 'Kanban Boards', description: 'Project boards and cards', storageKey: 'dex-kanban', estimatedSize: 0 },
  { key: 'engagement', label: 'Engagement', description: 'Achievements, streaks, and progress', storageKey: 'dex-engagement-state', estimatedSize: 0 },
  { key: 'analytics', label: 'Analytics', description: 'Usage statistics and trends', storageKey: 'dex-analytics', estimatedSize: 0 },
  { key: 'challenges', label: 'Challenges', description: 'Daily challenges progress', storageKey: 'dex-challenges', estimatedSize: 0 },
  { key: 'clipboard', label: 'Clipboard History', description: 'Saved clipboard entries', storageKey: 'dex-clipboard', estimatedSize: 0 },
  { key: 'pinnedApps', label: 'Pinned Apps', description: 'Home screen pinned apps', storageKey: 'dex-pinned-apps', estimatedSize: 0 },
  { key: 'focusMode', label: 'Focus Settings', description: 'Focus mode preferences', storageKey: 'dex-focus', estimatedSize: 0 },
  { key: 'theme', label: 'Theme', description: 'Theme and accent color', storageKey: 'dex-theme', estimatedSize: 0 },
  { key: 'windowLayout', label: 'Window Layout', description: 'Window arrangements', storageKey: 'dex-window-manager', estimatedSize: 0 },
  { key: 'recentActions', label: 'Recent Actions', description: 'Quick action history', storageKey: 'dex-recent-actions', estimatedSize: 0 },
];

// ============================================================================
// SIZE ESTIMATION
// ============================================================================

export function estimateDataSize(): { sections: DataSection[]; totalBytes: number } {
  const sections = DATA_SECTIONS.map(section => {
    try {
      const data = localStorage.getItem(section.storageKey);
      return { ...section, estimatedSize: data ? new Blob([data]).size : 0 };
    } catch {
      return { ...section, estimatedSize: 0 };
    }
  });
  return {
    sections,
    totalBytes: sections.reduce((sum, s) => sum + s.estimatedSize, 0),
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export function exportData(options: Partial<ExportOptions> = {}): ExportResult {
  const opts: ExportOptions = {
    format: 'json',
    includeSettings: true,
    includeNotes: true,
    includeTasks: true,
    includeCalendar: true,
    includeKanban: true,
    includeEngagement: true,
    includeAnalytics: true,
    includeClipboard: false,
    compressed: false,
    ...options,
  };

  try {
    const exportPayload: Record<string, any> = {
      __dex_export: true,
      version: getBundledAppVersion(),
      exportDate: new Date().toISOString(),
      format: opts.format,
    };

    const sectionMap: Record<string, boolean> = {
      settings: opts.includeSettings,
      notes: opts.includeNotes,
      tasks: opts.includeTasks,
      calendar: opts.includeCalendar,
      kanban: opts.includeKanban,
      engagement: opts.includeEngagement,
      analytics: opts.includeAnalytics,
      clipboard: opts.includeClipboard,
    };

    // Always include pinned apps, theme, window layout
    const alwaysInclude = ['pinnedApps', 'theme', 'windowLayout', 'recentActions', 'challenges', 'focusMode'];

    const sectionsToExport = DATA_SECTIONS.filter(s => sectionMap[s.key] !== false || alwaysInclude.includes(s.key));

    for (const section of sectionsToExport) {
      try {
        const raw = localStorage.getItem(section.storageKey);
        if (raw) {
          exportPayload[section.key] = JSON.parse(raw);
        }
      } catch {
        // Skip sections that fail to parse
      }
    }

    let content: string;
    let ext: string;

    if (opts.format === 'json') {
      content = JSON.stringify(exportPayload, null, 2);
      ext = 'json';
    } else if (opts.format === 'markdown') {
      content = convertToMarkdown(exportPayload);
      ext = 'md';
    } else {
      content = convertToCSV(exportPayload);
      ext = 'csv';
    }

    const filename = `DEX-Export-${new Date().toISOString().split('T')[0]}.${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename, size: blob.size, timestamp: Date.now() };
  } catch (error: any) {
    return { success: false, filename: '', size: 0, timestamp: Date.now(), error: error.message };
  }
}

// ============================================================================
// IMPORT
// ============================================================================

export function importData(jsonString: string): ImportResult {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  try {
    const data = JSON.parse(jsonString);
    if (!data.__dex_export) {
      return { success: false, imported: 0, skipped: 0, errors: ['Invalid DEX export file'], timestamp: Date.now() };
    }

    for (const section of DATA_SECTIONS) {
      if (data[section.key] !== undefined) {
        try {
          localStorage.setItem(section.storageKey, JSON.stringify(data[section.key]));
          imported++;
        } catch (e: any) {
          errors.push(`Failed to import ${section.label}: ${e.message}`);
          skipped++;
        }
      }
    }

    return { success: true, imported, skipped, errors, timestamp: Date.now() };
  } catch (e: any) {
    return { success: false, imported: 0, skipped: 0, errors: [`Parse error: ${e.message}`], timestamp: Date.now() };
  }
}

export function importFromFile(): Promise<ImportResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve({ success: false, imported: 0, skipped: 0, errors: ['No file selected'], timestamp: Date.now() });
        return;
      }
      try {
        const text = await file.text();
        resolve(importData(text));
      } catch (err: any) {
        resolve({ success: false, imported: 0, skipped: 0, errors: [err.message], timestamp: Date.now() });
      }
    };
    input.click();
  });
}

// ============================================================================
// FORMAT CONVERTERS
// ============================================================================

function convertToMarkdown(data: Record<string, any>): string {
  const lines: string[] = [
    `# DEX Data Export`,
    ``,
    `**Date:** ${data.exportDate}`,
    `**Version:** ${data.version}`,
    ``,
  ];

  for (const section of DATA_SECTIONS) {
    if (!data[section.key]) continue;
    lines.push(`## ${section.label}`);
    lines.push(``);
    const val = data[section.key];
    if (Array.isArray(val)) {
      val.forEach((item: any, i: number) => {
        lines.push(`### ${i + 1}. ${item.title || item.name || `Item ${i + 1}`}`);
        lines.push(`\`\`\`json`);
        lines.push(JSON.stringify(item, null, 2));
        lines.push(`\`\`\``);
        lines.push(``);
      });
    } else if (typeof val === 'object') {
      lines.push(`\`\`\`json`);
      lines.push(JSON.stringify(val, null, 2));
      lines.push(`\`\`\``);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

function convertToCSV(data: Record<string, any>): string {
  const rows: string[] = ['Section,Key,Value'];
  for (const section of DATA_SECTIONS) {
    if (!data[section.key]) continue;
    const val = data[section.key];
    if (Array.isArray(val)) {
      val.forEach((item: any, i: number) => {
        Object.entries(item).forEach(([k, v]) => {
          rows.push(`${section.label},${k},"${String(v).replace(/"/g, '""')}"`);
        });
      });
    } else if (typeof val === 'object') {
      Object.entries(val).forEach(([k, v]) => {
        rows.push(`${section.label},${k},"${String(v).replace(/"/g, '""')}"`);
      });
    }
  }
  return rows.join('\n');
}

// ============================================================================
// RESET / CLEAR
// ============================================================================

export function clearAllData(): void {
  DATA_SECTIONS.forEach(section => {
    try { localStorage.removeItem(section.storageKey); } catch (e) { console.warn('[DEX]', e); }
  });
}

export function clearSection(key: string): void {
  const section = DATA_SECTIONS.find(s => s.key === key);
  if (section) {
    try { localStorage.removeItem(section.storageKey); } catch (e) { console.warn('[DEX]', e); }
  }
}

export default { exportData, importData, importFromFile, estimateDataSize, clearAllData, clearSection, DATA_SECTIONS };
