// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX - Mission Board Types
// Strategic workspace where each Mission represents a real-world goal
// =============================================================================

// -----------------------------------------------------------------------------
// MISSION STATUS
// -----------------------------------------------------------------------------

export type MissionStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';

export type MissionPriority = 'critical' | 'high' | 'normal' | 'low';

// -----------------------------------------------------------------------------
// MISSION LINKS - Everything connected to a mission
// -----------------------------------------------------------------------------

export interface MissionLink {
  id: string;
  type: 'session' | 'note' | 'file' | 'workflow' | 'action' | 'artifact' | 'snapshot';
  targetId: string;
  label?: string;
  linkedAt: number;
  linkedBy: 'user' | 'system';
}

export interface MissionNote {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
}

export interface MissionObjective {
  id: string;
  description: string;
  completed: boolean;
  completedAt?: number;
  order: number;
}

export interface MissionTimeline {
  timestamp: number;
  event: 'created' | 'activated' | 'paused' | 'completed' | 'archived' | 'objective_added' | 'objective_completed' | 'link_added' | 'note_added' | 'resumed';
  details?: string;
}

// -----------------------------------------------------------------------------
// MISSION
// -----------------------------------------------------------------------------

export interface Mission {
  id: string;
  
  // Core identity
  name: string;
  codename?: string;  // Optional short identifier (e.g., "PHOENIX", "ATLAS")
  description: string;
  
  // Status
  status: MissionStatus;
  priority: MissionPriority;
  
  // Time tracking
  createdAt: number;
  updatedAt: number;
  activatedAt?: number;
  completedAt?: number;
  archivedAt?: number;
  
  // Deadline (optional)
  deadline?: number;
  
  // Content
  objectives: MissionObjective[];
  notes: MissionNote[];
  links: MissionLink[];
  
  // History
  timeline: MissionTimeline[];
  
  // Metrics
  totalSessionTime: number;  // Accumulated from linked sessions
  
  // Organization
  tags: string[];
  color?: string;  // Subtle accent color for identification
}

// -----------------------------------------------------------------------------
// MISSION BOARD STATE
// -----------------------------------------------------------------------------

export interface MissionBoardState {
  missions: Mission[];
  activeMissionId: string | null;
  viewMode: 'board' | 'list' | 'timeline';
  filter: {
    status: MissionStatus | 'all';
    priority: MissionPriority | 'all';
    tags: string[];
  };
  sortBy: 'priority' | 'deadline' | 'updated' | 'created' | 'name';
  sortOrder: 'asc' | 'desc';
}

// -----------------------------------------------------------------------------
// MISSION OPERATIONS
// -----------------------------------------------------------------------------

export interface CreateMissionInput {
  name: string;
  codename?: string;
  description: string;
  priority?: MissionPriority;
  deadline?: number;
  tags?: string[];
  color?: string;
}

export interface UpdateMissionInput {
  id: string;
  name?: string;
  codename?: string;
  description?: string;
  priority?: MissionPriority;
  deadline?: number;
  tags?: string[];
  color?: string;
}

// -----------------------------------------------------------------------------
// MISSION SUMMARY (for quick display)
// -----------------------------------------------------------------------------

export interface MissionSummary {
  id: string;
  name: string;
  codename?: string;
  status: MissionStatus;
  priority: MissionPriority;
  objectivesCompleted: number;
  objectivesTotal: number;
  linkCount: number;
  deadline?: number;
  isOverdue: boolean;
  daysSinceUpdate: number;
}

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

export function createMissionSummary(mission: Mission): MissionSummary {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  return {
    id: mission.id,
    name: mission.name,
    codename: mission.codename,
    status: mission.status,
    priority: mission.priority,
    objectivesCompleted: mission.objectives.filter(o => o.completed).length,
    objectivesTotal: mission.objectives.length,
    linkCount: mission.links.length,
    deadline: mission.deadline,
    isOverdue: mission.deadline ? now > mission.deadline && mission.status !== 'completed' : false,
    daysSinceUpdate: Math.floor((now - mission.updatedAt) / dayMs),
  };
}

export function getMissionProgress(mission: Mission): number {
  if (mission.objectives.length === 0) return 0;
  const completed = mission.objectives.filter(o => o.completed).length;
  return Math.round((completed / mission.objectives.length) * 100);
}

export function isMissionStale(mission: Mission, staleDays = 7): boolean {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const daysSinceUpdate = (now - mission.updatedAt) / dayMs;
  return mission.status === 'active' && daysSinceUpdate > staleDays;
}
