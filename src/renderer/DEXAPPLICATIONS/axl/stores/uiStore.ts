// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL UI Store -- panel visibility, modals, AI chat, toasts
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';

export type PanelTab = 'properties' | 'material' | 'constraints' | 'features' | 'history';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface UIStore {
  // Panel overlays
  showPartsLibrary: boolean;
  togglePartsLibrary: () => void;
  showFeatureCreate: boolean;
  toggleFeatureCreate: () => void;
  showGDTCreate: boolean;
  toggleGDTCreate: () => void;
  showConstraintPanel: boolean;
  toggleConstraintPanel: () => void;
  showBOM: boolean;
  toggleBOM: () => void;
  showSimulation: boolean;
  toggleSimulation: () => void;
  showExport: boolean;
  toggleExport: () => void;
  showSettings: boolean;
  toggleSettings: () => void;
  showDrawing: boolean;
  toggleDrawing: () => void;

  // AI assistant
  showAI: boolean;
  toggleAI: () => void;
  aiMessages: AIMessage[];
  addAIMessage: (msg: AIMessage) => void;
  clearAIMessages: () => void;
  aiLoading: boolean;
  setAILoading: (v: boolean) => void;

  // Right-panel tab
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;

  // Toast notifications
  toastMsg: string;
  showToast: (msg: string, durationMs?: number) => void;

  // Status
  statusText: string;
  setStatusText: (text: string) => void;

  // Layout
  leftPanelWidth: number;
  setLeftPanelWidth: (w: number) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (w: number) => void;
  leftPanelCollapsed: boolean;
  toggleLeftPanel: () => void;
  rightPanelCollapsed: boolean;
  toggleRightPanel: () => void;

  // Close all overlays
  closeAllOverlays: () => void;
}

let toastClearTimer: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIStore>()((set) => ({
  showPartsLibrary: false,
  togglePartsLibrary: () => set(s => ({ showPartsLibrary: !s.showPartsLibrary })),
  showFeatureCreate: false,
  toggleFeatureCreate: () => set(s => ({ showFeatureCreate: !s.showFeatureCreate })),
  showGDTCreate: false,
  toggleGDTCreate: () => set(s => ({ showGDTCreate: !s.showGDTCreate })),
  showConstraintPanel: false,
  toggleConstraintPanel: () => set(s => ({ showConstraintPanel: !s.showConstraintPanel })),
  showBOM: false,
  toggleBOM: () => set(s => ({ showBOM: !s.showBOM })),
  showSimulation: false,
  toggleSimulation: () => set(s => ({ showSimulation: !s.showSimulation })),
  showExport: false,
  toggleExport: () => set(s => ({ showExport: !s.showExport })),
  showSettings: false,
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  showDrawing: false,
  toggleDrawing: () => set(s => ({ showDrawing: !s.showDrawing })),

  showAI: false,
  toggleAI: () => set(s => ({ showAI: !s.showAI })),
  aiMessages: [],
  addAIMessage: (msg) => set(s => ({ aiMessages: [...s.aiMessages, msg] })),
  clearAIMessages: () => set({ aiMessages: [] }),
  aiLoading: false,
  setAILoading: (v) => set({ aiLoading: v }),

  panelTab: 'properties',
  setPanelTab: (tab) => set({ panelTab: tab }),

  toastMsg: '',
  showToast: (msg, durationMs = 3000) => {
    if (toastClearTimer) clearTimeout(toastClearTimer);
    set({ toastMsg: msg });
    toastClearTimer = setTimeout(() => {
      toastClearTimer = null;
      set({ toastMsg: '' });
    }, durationMs);
  },

  statusText: 'Ready',
  setStatusText: (text) => set({ statusText: text }),

  leftPanelWidth: 260,
  setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(180, Math.min(500, w)) }),
  rightPanelWidth: 280,
  setRightPanelWidth: (w) => set({ rightPanelWidth: Math.max(200, Math.min(500, w)) }),
  leftPanelCollapsed: false,
  toggleLeftPanel: () => set(s => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  rightPanelCollapsed: false,
  toggleRightPanel: () => set(s => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),

  closeAllOverlays: () => set({
    showPartsLibrary: false,
    showFeatureCreate: false,
    showGDTCreate: false,
    showConstraintPanel: false,
    showBOM: false,
    showSimulation: false,
    showExport: false,
    showSettings: false,
    showDrawing: false,
    showAI: false,
  }),
}));
