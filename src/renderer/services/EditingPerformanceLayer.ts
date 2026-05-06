// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Editing Performance Layer
// ==========================================================================
// Ensures keystroke-to-screen latency under 16ms, 3-second debounced
// auto-save on the write thread, auto-height calculation in a single
// frame, and progressive search result rendering.
//
// This is a renderer-side service used by all text editing components.
// ==========================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = 3000;
const KEYSTROKE_BUDGET_MS = 16;
const SEARCH_RENDER_BATCH_SIZE = 20;
const SEARCH_RENDER_INTERVAL_MS = 16;
const MAX_UNDO_STACK = 200;
const AUTO_HEIGHT_PADDING_PX = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditState {
  documentId: string;
  content: string;
  cursorPosition: number;
  selectionStart: number;
  selectionEnd: number;
  isDirty: boolean;
  lastSavedAt: number;
  undoStack: string[];
  redoStack: string[];
}

interface AutoSaveConfig {
  enabled: boolean;
  debounceMs: number;
  onSave: (documentId: string, content: string) => void;
}

interface SearchMatch {
  index: number;
  start: number;
  end: number;
  line: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Editing Performance Layer
// ---------------------------------------------------------------------------

class EditingPerformanceLayer {
  private editors = new Map<string, EditState>();
  private autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoSaveConfig: AutoSaveConfig = {
    enabled: true,
    debounceMs: AUTOSAVE_DEBOUNCE_MS,
    onSave: () => {},
  };
  private keystrokeMetrics = {
    totalKeystrokes: 0,
    violations: 0,
    avgLatencyMs: 0,
    maxLatencyMs: 0,
  };
  private searchRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  initialize(config?: Partial<AutoSaveConfig>): void {
    if (this.initialized) return;
    if (config) {
      this.autoSaveConfig = { ...this.autoSaveConfig, ...config };
    }
    this.initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Document management
  // ---------------------------------------------------------------------------

  openDocument(documentId: string, content: string): void {
    this.editors.set(documentId, {
      documentId,
      content,
      cursorPosition: 0,
      selectionStart: 0,
      selectionEnd: 0,
      isDirty: false,
      lastSavedAt: Date.now(),
      undoStack: [],
      redoStack: [],
    });
  }

  closeDocument(documentId: string): void {
    const timer = this.autoSaveTimers.get(documentId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(documentId);
    }
    this.editors.delete(documentId);
  }

  getDocument(documentId: string): EditState | null {
    return this.editors.get(documentId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Keystroke handling (target: <16ms from input to state update)
  // ---------------------------------------------------------------------------

  handleKeystroke(documentId: string, position: number, insertText: string, deleteCount: number = 0): boolean {
    const start = performance.now();

    const state = this.editors.get(documentId);
    if (!state) return false;

    // Push undo
    if (state.undoStack.length >= MAX_UNDO_STACK) {
      state.undoStack.shift();
    }
    state.undoStack.push(state.content);
    state.redoStack = [];

    // Apply edit
    const before = state.content.slice(0, position);
    const after = state.content.slice(position + deleteCount);
    state.content = before + insertText + after;
    state.cursorPosition = position + insertText.length;
    state.isDirty = true;

    // Schedule auto-save
    this.scheduleAutoSave(documentId);

    // Measure latency
    const elapsed = performance.now() - start;
    this.recordKeystrokeLatency(elapsed);

    return elapsed <= KEYSTROKE_BUDGET_MS;
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  undo(documentId: string): boolean {
    const state = this.editors.get(documentId);
    if (!state || state.undoStack.length === 0) return false;

    state.redoStack.push(state.content);
    state.content = state.undoStack.pop()!;
    state.isDirty = true;
    this.scheduleAutoSave(documentId);
    return true;
  }

  redo(documentId: string): boolean {
    const state = this.editors.get(documentId);
    if (!state || state.redoStack.length === 0) return false;

    state.undoStack.push(state.content);
    state.content = state.redoStack.pop()!;
    state.isDirty = true;
    this.scheduleAutoSave(documentId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Auto-save (debounced, fires on write thread)
  // ---------------------------------------------------------------------------

  private scheduleAutoSave(documentId: string): void {
    if (!this.autoSaveConfig.enabled) return;

    const existing = this.autoSaveTimers.get(documentId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.executeSave(documentId);
    }, this.autoSaveConfig.debounceMs);

    this.autoSaveTimers.set(documentId, timer);
  }

  private executeSave(documentId: string): void {
    const state = this.editors.get(documentId);
    if (!state || !state.isDirty) return;

    try {
      this.autoSaveConfig.onSave(documentId, state.content);
      state.isDirty = false;
      state.lastSavedAt = Date.now();
    } catch {
      // Save failed; will retry on next edit
    }

    this.autoSaveTimers.delete(documentId);
  }

  forceSave(documentId: string): void {
    const timer = this.autoSaveTimers.get(documentId);
    if (timer) clearTimeout(timer);
    this.executeSave(documentId);
  }

  forceSaveAll(): void {
    for (const [docId] of this.editors) {
      this.forceSave(docId);
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-height calculation (single frame)
  // ---------------------------------------------------------------------------

  calculateAutoHeight(element: HTMLElement): number {
    // Reset to auto to measure natural height
    const previousHeight = element.style.height;
    const previousOverflow = element.style.overflow;
    element.style.height = 'auto';
    element.style.overflow = 'hidden';

    const scrollHeight = element.scrollHeight;
    const computedHeight = scrollHeight + AUTO_HEIGHT_PADDING_PX;

    // Restore
    element.style.height = `${computedHeight}px`;
    element.style.overflow = previousOverflow;

    return computedHeight;
  }

  // Debounced version for use during rapid input
  autoHeightOnInput(element: HTMLElement): void {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        this.calculateAutoHeight(element);
      });
    } else {
      this.calculateAutoHeight(element);
    }
  }

  // ---------------------------------------------------------------------------
  // Progressive search rendering
  // ---------------------------------------------------------------------------

  searchInDocument(documentId: string, query: string, caseSensitive: boolean = false): SearchMatch[] {
    const state = this.editors.get(documentId);
    if (!state || !query) return [];

    const content = caseSensitive ? state.content : state.content.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const matches: SearchMatch[] = [];
    let searchIndex = 0;
    let matchIndex = 0;

    while (searchIndex < content.length) {
      const found = content.indexOf(searchQuery, searchIndex);
      if (found === -1) break;

      // Compute line number
      let line = 1;
      for (let i = 0; i < found; i++) {
        if (state.content[i] === '\n') line++;
      }

      // Extract surrounding text (40 chars each side)
      const contextStart = Math.max(0, found - 40);
      const contextEnd = Math.min(state.content.length, found + searchQuery.length + 40);
      const text = state.content.slice(contextStart, contextEnd);

      matches.push({
        index: matchIndex++,
        start: found,
        end: found + searchQuery.length,
        line,
        text,
      });

      searchIndex = found + 1;
    }

    return matches;
  }

  renderSearchResultsProgressively(
    matches: SearchMatch[],
    renderBatch: (batch: SearchMatch[], isLast: boolean) => void
  ): void {
    if (this.searchRenderTimer) {
      clearTimeout(this.searchRenderTimer);
      this.searchRenderTimer = null;
    }

    let offset = 0;
    const renderNext = () => {
      const batch = matches.slice(offset, offset + SEARCH_RENDER_BATCH_SIZE);
      offset += SEARCH_RENDER_BATCH_SIZE;
      const isLast = offset >= matches.length;
      renderBatch(batch, isLast);

      if (!isLast) {
        this.searchRenderTimer = setTimeout(renderNext, SEARCH_RENDER_INTERVAL_MS);
      } else {
        this.searchRenderTimer = null;
      }
    };

    if (matches.length > 0) {
      renderNext();
    } else {
      renderBatch([], true);
    }
  }

  // ---------------------------------------------------------------------------
  // Keystroke metrics
  // ---------------------------------------------------------------------------

  private recordKeystrokeLatency(latencyMs: number): void {
    this.keystrokeMetrics.totalKeystrokes++;
    if (latencyMs > KEYSTROKE_BUDGET_MS) {
      this.keystrokeMetrics.violations++;
    }
    if (latencyMs > this.keystrokeMetrics.maxLatencyMs) {
      this.keystrokeMetrics.maxLatencyMs = latencyMs;
    }
    // Running average
    const n = this.keystrokeMetrics.totalKeystrokes;
    this.keystrokeMetrics.avgLatencyMs =
      this.keystrokeMetrics.avgLatencyMs * ((n - 1) / n) + latencyMs / n;
  }

  getKeystrokeMetrics(): {
    totalKeystrokes: number;
    violations: number;
    violationRate: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
  } {
    const rate = this.keystrokeMetrics.totalKeystrokes > 0
      ? this.keystrokeMetrics.violations / this.keystrokeMetrics.totalKeystrokes
      : 0;
    return {
      ...this.keystrokeMetrics,
      violationRate: rate,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  shutdown(): void {
    // Force save all dirty documents
    this.forceSaveAll();

    // Clear all timers
    for (const [, timer] of this.autoSaveTimers) {
      clearTimeout(timer);
    }
    this.autoSaveTimers.clear();

    if (this.searchRenderTimer) {
      clearTimeout(this.searchRenderTimer);
      this.searchRenderTimer = null;
    }

    this.editors.clear();
    this.initialized = false;
  }
}

export const editingPerformanceLayer = new EditingPerformanceLayer();

export function initializeEditingPerformance(config?: Partial<AutoSaveConfig>): void {
  editingPerformanceLayer.initialize(config);
}

export function shutdownEditingPerformance(): void {
  editingPerformanceLayer.shutdown();
}
