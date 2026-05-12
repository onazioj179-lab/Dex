// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Pin Registry
 * -----------------------------------------------------------------------------
 * A unified read/write API across the existing pin sources (dock, home apps,
 * home files) plus *new* pin kinds (project, savedSearch, workspace, view).
 * Apps and the command palette query a single surface here instead of touching
 * each underlying store directly.
 *
 * Design: the registry does not duplicate state. It delegates to the source
 * stores for the kinds they own, and persists only the new kinds itself.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import { useDockPins } from './dockPinStore';
import { useHomePinnedAppsStore } from './homePinnedAppsStore';
import { useHomePinnedFilesStore } from './homePinnedFilesStore';

export type PinKind =
  | 'app'
  | 'file'
  | 'folder'
  | 'project'
  | 'workspace'
  | 'savedSearch'
  | 'view';

export interface BasePin {
  id: string;
  kind: PinKind;
  label: string;
  /** Source surface that owns the underlying record. */
  source: 'dock' | 'home-app' | 'home-file' | 'registry';
  /** Optional secondary text for UI (path, query, posture). */
  detail?: string;
  /** Optional accent (hex) for chips/badges. */
  accent?: string;
  /** ms epoch -- registry-managed kinds only; dock/home pins read from source. */
  createdAt?: number;
}

export interface FolderPin extends BasePin { kind: 'folder'; path: string }
export interface ProjectPin extends BasePin { kind: 'project'; projectPath: string; primaryAppId?: string }
export interface WorkspacePin extends BasePin { kind: 'workspace'; stageId: string }
export interface SavedSearchPin extends BasePin { kind: 'savedSearch'; query: string; scope?: string }
export interface ViewPin extends BasePin { kind: 'view'; path: string; appId?: string }

type RegistryOwnedPin = FolderPin | ProjectPin | WorkspacePin | SavedSearchPin | ViewPin;

interface PinRegistryState {
  /** Only the kinds that this store owns. App/file are loaded from source stores at read time. */
  ownedPins: RegistryOwnedPin[];

  pinFolder: (path: string, label?: string) => string;
  pinProject: (projectPath: string, label?: string, primaryAppId?: string) => string;
  pinWorkspace: (stageId: string, label: string, accent?: string) => string;
  pinSavedSearch: (query: string, label?: string, scope?: string) => string;
  pinView: (path: string, label: string, appId?: string) => string;
  unpin: (id: string) => void;
  exists: (id: string) => boolean;

  /** Read-only aggregated view across all sources. Recomputed on call -- cheap. */
  list: () => BasePin[];
  /** Filter helper. */
  listByKind: (kind: PinKind) => BasePin[];
}

const MAX_OWNED = 200;
const newId = (k: PinKind) => `${k}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export const usePinRegistry = create<PinRegistryState>()(
  persist(
    (set, get) => ({
      ownedPins: [],

      pinFolder: (path, label) => {
        const trimmed = path.trim();
        if (!trimmed) return '';
        const existing = get().ownedPins.find((p) => p.kind === 'folder' && (p as FolderPin).path === trimmed);
        if (existing) return existing.id;
        const id = newId('folder');
        const pin: FolderPin = {
          id, kind: 'folder', source: 'registry',
          label: label || trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed,
          path: trimmed, detail: trimmed, createdAt: Date.now(),
        };
        set({ ownedPins: [pin, ...get().ownedPins].slice(0, MAX_OWNED) });
        return id;
      },

      pinProject: (projectPath, label, primaryAppId) => {
        const trimmed = projectPath.trim();
        if (!trimmed) return '';
        const existing = get().ownedPins.find((p) => p.kind === 'project' && (p as ProjectPin).projectPath === trimmed);
        if (existing) return existing.id;
        const id = newId('project');
        const pin: ProjectPin = {
          id, kind: 'project', source: 'registry',
          label: label || trimmed.split(/[\\/]/).filter(Boolean).pop() || 'Project',
          projectPath: trimmed, primaryAppId, detail: trimmed, createdAt: Date.now(),
        };
        set({ ownedPins: [pin, ...get().ownedPins].slice(0, MAX_OWNED) });
        return id;
      },

      pinWorkspace: (stageId, label, accent) => {
        const existing = get().ownedPins.find((p) => p.kind === 'workspace' && (p as WorkspacePin).stageId === stageId);
        if (existing) return existing.id;
        const id = newId('workspace');
        const pin: WorkspacePin = {
          id, kind: 'workspace', source: 'registry', label, stageId, accent, createdAt: Date.now(),
        };
        set({ ownedPins: [pin, ...get().ownedPins].slice(0, MAX_OWNED) });
        return id;
      },

      pinSavedSearch: (query, label, scope) => {
        const trimmed = query.trim();
        if (!trimmed) return '';
        const existing = get().ownedPins.find(
          (p) => p.kind === 'savedSearch' && (p as SavedSearchPin).query === trimmed && (p as SavedSearchPin).scope === scope
        );
        if (existing) return existing.id;
        const id = newId('savedSearch');
        const pin: SavedSearchPin = {
          id, kind: 'savedSearch', source: 'registry',
          label: label || trimmed,
          query: trimmed, scope, detail: scope, createdAt: Date.now(),
        };
        set({ ownedPins: [pin, ...get().ownedPins].slice(0, MAX_OWNED) });
        return id;
      },

      pinView: (path, label, appId) => {
        const trimmed = path.trim();
        if (!trimmed) return '';
        const existing = get().ownedPins.find((p) => p.kind === 'view' && (p as ViewPin).path === trimmed);
        if (existing) return existing.id;
        const id = newId('view');
        const pin: ViewPin = {
          id, kind: 'view', source: 'registry', label, path: trimmed, appId, detail: trimmed, createdAt: Date.now(),
        };
        set({ ownedPins: [pin, ...get().ownedPins].slice(0, MAX_OWNED) });
        return id;
      },

      unpin: (id) => {
        set({ ownedPins: get().ownedPins.filter((p) => p.id !== id) });
      },

      exists: (id) => get().ownedPins.some((p) => p.id === id),

      list: () => {
        const out: BasePin[] = [];

        // 1. Apps from dock pin store
        try {
          const dockState = useDockPins.getState();
          for (const dp of dockState.pins) {
            out.push({
              id: `dock:${dp.id}`,
              kind: 'app',
              label: dp.id,
              source: 'dock',
            });
          }
        } catch { /* dock store unavailable */ }

        // 2. Home-pinned apps
        try {
          const home = useHomePinnedAppsStore.getState();
          for (const hp of home.pinnedApps ?? []) {
            out.push({
              id: `home-app:${hp.id}`,
              kind: 'app',
              label: hp.appId,
              source: 'home-app',
            });
          }
        } catch { /* optional */ }

        // 3. Home-pinned files
        try {
          const files = useHomePinnedFilesStore.getState();
          for (const f of files.pinnedFiles ?? []) {
            out.push({
              id: `home-file:${f.id}`,
              kind: 'file',
              label: f.name,
              detail: f.path,
              source: 'home-file',
            });
          }
        } catch { /* optional */ }

        // 4. Registry-owned
        out.push(...get().ownedPins);
        return out;
      },

      listByKind: (kind) => get().list().filter((p) => p.kind === kind),
    }),
    {
      name: 'dex-pin-registry',
      storage: debouncedJsonStorage,
      version: 1,
      // Only persist the owned pins; aggregate view is derived.
      partialize: (s) => ({ ownedPins: s.ownedPins }),
    }
  )
);
