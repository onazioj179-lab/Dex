// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Phase 34: Mission Board Store
// State management for the strategic mission workspace
// ===========================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { debouncedJsonStorage } from '../utils/debouncedStorage';
import type {
  Mission,
  MissionStatus,
  MissionPriority,
  MissionBoardState,
  MissionObjective,
  MissionNote,
  MissionLink,
  MissionTimeline,
  CreateMissionInput,
  UpdateMissionInput,
} from '../../shared/missionTypes';

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

import { generateId } from '../../shared/util/id';

function generateCodename(): string {
  const adjectives = ['IRON', 'SHADOW', 'PHOENIX', 'ATLAS', 'NOVA', 'DELTA', 'OMEGA', 'APEX', 'CIPHER', 'PRISM'];
  const nouns = ['FORGE', 'GATE', 'PULSE', 'CORE', 'NEXUS', 'VAULT', 'ECHO', 'WAVE', 'SPARK', 'DRIFT'];
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

// -----------------------------------------------------------------------------
// STORE INTERFACE
// -----------------------------------------------------------------------------

interface MissionBoardStore extends MissionBoardState {
  // Mission CRUD
  createMission: (input: CreateMissionInput) => Mission;
  updateMission: (input: UpdateMissionInput) => void;
  deleteMission: (id: string) => void;
  
  // Status changes
  activateMission: (id: string) => void;
  pauseMission: (id: string) => void;
  completeMission: (id: string) => void;
  archiveMission: (id: string) => void;
  resumeMission: (id: string) => void;
  
  // Active mission
  setActiveMission: (id: string | null) => void;
  getActiveMission: () => Mission | null;
  getMission: (id: string) => Mission | null;
  
  // Objectives
  addObjective: (missionId: string, description: string) => void;
  toggleObjective: (missionId: string, objectiveId: string) => void;
  removeObjective: (missionId: string, objectiveId: string) => void;
  reorderObjectives: (missionId: string, objectiveIds: string[]) => void;
  
  // Notes
  addNote: (missionId: string, content: string) => void;
  updateNote: (missionId: string, noteId: string, content: string) => void;
  removeNote: (missionId: string, noteId: string) => void;
  pinNote: (missionId: string, noteId: string, pinned: boolean) => void;
  
  // Links
  addLink: (missionId: string, link: Omit<MissionLink, 'id' | 'linkedAt' | 'linkedBy'>) => void;
  removeLink: (missionId: string, linkId: string) => void;
  
  // View controls
  setViewMode: (mode: MissionBoardState['viewMode']) => void;
  setFilter: (filter: Partial<MissionBoardState['filter']>) => void;
  setSortBy: (sortBy: MissionBoardState['sortBy']) => void;
  setSortOrder: (order: MissionBoardState['sortOrder']) => void;
  
  // Queries
  getFilteredMissions: () => Mission[];
  getMissionsByStatus: (status: MissionStatus) => Mission[];
  getRecentMissions: (limit?: number) => Mission[];
  searchMissions: (query: string) => Mission[];
  
  // Timeline
  addTimelineEvent: (missionId: string, event: MissionTimeline['event'], details?: string) => void;
  
  // Session time tracking
  addSessionTime: (missionId: string, duration: number) => void;
}

// -----------------------------------------------------------------------------
// STORE IMPLEMENTATION
// -----------------------------------------------------------------------------

export const useMissionBoard = create<MissionBoardStore>()(
  persist(
    (set, get) => ({
      // Initial state
      missions: [],
      activeMissionId: null,
      viewMode: 'board',
      filter: {
        status: 'all',
        priority: 'all',
        tags: [],
      },
      sortBy: 'priority',
      sortOrder: 'desc',

      // ---------------------------------------------------------------------
      // Mission CRUD
      // ---------------------------------------------------------------------

      createMission: (input) => {
        const now = Date.now();
        const mission: Mission = {
          id: generateId(),
          name: input.name,
          codename: input.codename || generateCodename(),
          description: input.description,
          status: 'planning',
          priority: input.priority || 'normal',
          createdAt: now,
          updatedAt: now,
          deadline: input.deadline,
          objectives: [],
          notes: [],
          links: [],
          timeline: [{ timestamp: now, event: 'created' }],
          totalSessionTime: 0,
          tags: input.tags || [],
          color: input.color,
        };

        set(state => ({
          missions: [...state.missions, mission],
        }));

        return mission;
      },

      updateMission: (input) => {
        set(state => ({
          missions: state.missions.map(m => 
            m.id === input.id
              ? {
                  ...m,
                  ...input,
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      deleteMission: (id) => {
        set(state => ({
          missions: state.missions.filter(m => m.id !== id),
          activeMissionId: state.activeMissionId === id ? null : state.activeMissionId,
        }));
      },

      // ---------------------------------------------------------------------
      // Status changes
      // ---------------------------------------------------------------------

      activateMission: (id) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === id
              ? {
                  ...m,
                  status: 'active' as MissionStatus,
                  activatedAt: m.activatedAt || now,
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'activated' as const }],
                }
              : m
          ),
        }));
      },

      pauseMission: (id) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === id
              ? {
                  ...m,
                  status: 'paused' as MissionStatus,
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'paused' as const }],
                }
              : m
          ),
        }));
      },

      completeMission: (id) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === id
              ? {
                  ...m,
                  status: 'completed' as MissionStatus,
                  completedAt: now,
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'completed' as const }],
                }
              : m
          ),
        }));
      },

      archiveMission: (id) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === id
              ? {
                  ...m,
                  status: 'archived' as MissionStatus,
                  archivedAt: now,
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'archived' as const }],
                }
              : m
          ),
          activeMissionId: state.activeMissionId === id ? null : state.activeMissionId,
        }));
      },

      resumeMission: (id) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === id
              ? {
                  ...m,
                  status: 'active' as MissionStatus,
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'resumed' as const }],
                }
              : m
          ),
        }));
      },

      // ---------------------------------------------------------------------
      // Active mission
      // ---------------------------------------------------------------------

      setActiveMission: (id) => {
        set({ activeMissionId: id });
      },

      getActiveMission: () => {
        const { missions, activeMissionId } = get();
        return missions.find(m => m.id === activeMissionId) || null;
      },

      getMission: (id) => {
        return get().missions.find(m => m.id === id) || null;
      },

      // ---------------------------------------------------------------------
      // Objectives
      // ---------------------------------------------------------------------

      addObjective: (missionId, description) => {
        const now = Date.now();
        const objective: MissionObjective = {
          id: generateId(),
          description,
          completed: false,
          order: get().missions.find(m => m.id === missionId)?.objectives.length || 0,
        };

        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  objectives: [...m.objectives, objective],
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'objective_added' as const, details: description }],
                }
              : m
          ),
        }));
      },

      toggleObjective: (missionId, objectiveId) => {
        const now = Date.now();
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  objectives: m.objectives.map(o =>
                    o.id === objectiveId
                      ? { ...o, completed: !o.completed, completedAt: !o.completed ? now : undefined }
                      : o
                  ),
                  updatedAt: now,
                  timeline: m.objectives.find(o => o.id === objectiveId && !o.completed)
                    ? [...m.timeline, { timestamp: now, event: 'objective_completed' as const }]
                    : m.timeline,
                }
              : m
          ),
        }));
      },

      removeObjective: (missionId, objectiveId) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  objectives: m.objectives.filter(o => o.id !== objectiveId),
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      reorderObjectives: (missionId, objectiveIds) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  objectives: objectiveIds.map((id, index) => ({
                    ...m.objectives.find(o => o.id === id)!,
                    order: index,
                  })),
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      // ---------------------------------------------------------------------
      // Notes
      // ---------------------------------------------------------------------

      addNote: (missionId, content) => {
        const now = Date.now();
        const note: MissionNote = {
          id: generateId(),
          content,
          createdAt: now,
          updatedAt: now,
          pinned: false,
        };

        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  notes: [...m.notes, note],
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'note_added' as const }],
                }
              : m
          ),
        }));
      },

      updateNote: (missionId, noteId, content) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  notes: m.notes.map(n =>
                    n.id === noteId
                      ? { ...n, content, updatedAt: Date.now() }
                      : n
                  ),
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      removeNote: (missionId, noteId) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  notes: m.notes.filter(n => n.id !== noteId),
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      pinNote: (missionId, noteId, pinned) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  notes: m.notes.map(n =>
                    n.id === noteId ? { ...n, pinned } : n
                  ),
                }
              : m
          ),
        }));
      },

      // ---------------------------------------------------------------------
      // Links
      // ---------------------------------------------------------------------

      addLink: (missionId, link) => {
        const now = Date.now();
        const newLink: MissionLink = {
          ...link,
          id: generateId(),
          linkedAt: now,
          linkedBy: 'user',
        };

        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  links: [...m.links, newLink],
                  updatedAt: now,
                  timeline: [...m.timeline, { timestamp: now, event: 'link_added' as const, details: `${link.type}: ${link.targetId}` }],
                }
              : m
          ),
        }));
      },

      removeLink: (missionId, linkId) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  links: m.links.filter(l => l.id !== linkId),
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },

      // ---------------------------------------------------------------------
      // View controls
      // ---------------------------------------------------------------------

      setViewMode: (viewMode) => set({ viewMode }),

      setFilter: (filter) => set(state => ({
        filter: { ...state.filter, ...filter },
      })),

      setSortBy: (sortBy) => set({ sortBy }),

      setSortOrder: (sortOrder) => set({ sortOrder }),

      // ---------------------------------------------------------------------
      // Queries
      // ---------------------------------------------------------------------

      getFilteredMissions: () => {
        const { missions, filter, sortBy, sortOrder } = get();
        
        let filtered = missions.filter(m => {
          if (filter.status !== 'all' && m.status !== filter.status) return false;
          if (filter.priority !== 'all' && m.priority !== filter.priority) return false;
          if (filter.tags.length > 0 && !filter.tags.some(t => m.tags.includes(t))) return false;
          return true;
        });

        // Sort
        const priorityOrder: Record<MissionPriority, number> = { critical: 4, high: 3, normal: 2, low: 1 };
        
        filtered.sort((a, b) => {
          let comparison = 0;
          switch (sortBy) {
            case 'priority':
              comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
              break;
            case 'deadline':
              comparison = (a.deadline || Infinity) - (b.deadline || Infinity);
              break;
            case 'updated':
              comparison = a.updatedAt - b.updatedAt;
              break;
            case 'created':
              comparison = a.createdAt - b.createdAt;
              break;
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
          }
          return sortOrder === 'desc' ? -comparison : comparison;
        });

        return filtered;
      },

      getMissionsByStatus: (status) => {
        return get().missions.filter(m => m.status === status);
      },

      getRecentMissions: (limit = 5) => {
        return [...get().missions]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit);
      },

      searchMissions: (query) => {
        const lower = query.toLowerCase();
        return get().missions.filter(m =>
          m.name.toLowerCase().includes(lower) ||
          m.codename?.toLowerCase().includes(lower) ||
          m.description.toLowerCase().includes(lower) ||
          m.tags.some(t => t.toLowerCase().includes(lower))
        );
      },

      // ---------------------------------------------------------------------
      // Timeline
      // ---------------------------------------------------------------------

      addTimelineEvent: (missionId, event, details) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  timeline: [...m.timeline, { timestamp: Date.now(), event, details }],
                }
              : m
          ),
        }));
      },

      // ---------------------------------------------------------------------
      // Session time tracking
      // ---------------------------------------------------------------------

      addSessionTime: (missionId, duration) => {
        set(state => ({
          missions: state.missions.map(m =>
            m.id === missionId
              ? {
                  ...m,
                  totalSessionTime: m.totalSessionTime + duration,
                  updatedAt: Date.now(),
                }
              : m
          ),
        }));
      },
    }),
    {
      name: 'dex-mission-board',
      storage: debouncedJsonStorage,
      partialize: (state) => ({
        missions: state.missions,
        activeMissionId: state.activeMissionId,
        viewMode: state.viewMode,
        filter: state.filter,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
      }),
    }
  )
);
