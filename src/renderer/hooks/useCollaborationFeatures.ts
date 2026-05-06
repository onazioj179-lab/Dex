/**
 * DEX Platform - Collaboration Hook for Creative Apps
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * 
 * Provides easy integration of collaboration features into creative apps.
 * Handles checkpoint creation, sharing, and real-time collaboration.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCollaborationStore, hasPermission, CollaboratorRole } from '../services/CollaborationSystem';

interface UseCollaborationOptions {
  appId: string;
  projectName?: string;
  autoCheckpointInterval?: number; // ms, 0 to disable
}

interface CollaborationFeatures {
  // Project state
  projectId: string | null;
  isCollaborative: boolean;
  collaborators: Array<{ id: string; name: string; color?: string; isOnline: boolean }>;
  activeCollaboratorCount: number;
  
  // Permissions
  canEdit: boolean;
  canShare: boolean;
  canCheckpoint: boolean;
  
  // Actions
  createCheckpoint: (name: string, data: string) => void;
  openShareDialog: () => void;
  openChatPanel: () => void;
  openCheckpointPanel: () => void;
  
  // Auto-checkpoint
  scheduleAutoCheckpoint: (data: string) => void;
  
  // UI state
  showShareButton: boolean;
  showChatButton: boolean;
  showCollaboratorAvatars: boolean;
}

export function useCollaborationFeatures(options: UseCollaborationOptions): CollaborationFeatures {
  const { appId, projectName = 'Untitled', autoCheckpointInterval = 0 } = options;
  
  const [lastAutoCheckpointData, setLastAutoCheckpointData] = useState<string | null>(null);
  
  const {
    currentUser,
    projects,
    activeProjectId,
    createProject,
    setActiveProject,
    createCheckpoint,
    toggleShareDialog,
    toggleChatPanel,
    toggleCheckpointPanel,
  } = useCollaborationStore();
  
  // Get or create project for this app
  const projectId = useMemo(() => {
    // Check if there's an active project for this app
    if (activeProjectId) {
      const project = projects.get(activeProjectId);
      if (project?.appId === appId) return activeProjectId;
    }
    return null;
  }, [activeProjectId, projects, appId]);
  
  const project = projectId ? projects.get(projectId) : null;
  
  // Current user's role in the project
  const userRole = useMemo((): CollaboratorRole => {
    if (!project || !currentUser) return 'viewer';
    const collab = project.collaborators.find(c => c.id === currentUser.id);
    return collab?.role || 'viewer';
  }, [project, currentUser]);
  
  // Permissions
  const canEdit = hasPermission(userRole, 'edit');
  const canShare = hasPermission(userRole, 'share');
  const canCheckpoint = hasPermission(userRole, 'checkpoint');
  
  // Collaborators
  const collaborators = useMemo(() => {
    if (!project) return [];
    return project.collaborators.map(c => ({
      id: c.id,
      name: c.name,
      color: c.cursor?.color,
      isOnline: c.isOnline,
    }));
  }, [project]);
  
  const activeCollaboratorCount = useMemo(() => {
    return collaborators.filter(c => c.isOnline).length;
  }, [collaborators]);
  
  // Create checkpoint action
  const handleCreateCheckpoint = useCallback((name: string, data: string) => {
    if (!projectId || !canCheckpoint) return;
    createCheckpoint(projectId, name, data);
  }, [projectId, canCheckpoint, createCheckpoint]);
  
  // Auto-checkpoint scheduling
  const scheduleAutoCheckpoint = useCallback((data: string) => {
    if (!projectId || !canCheckpoint || autoCheckpointInterval <= 0) return;
    setLastAutoCheckpointData(data);
  }, [projectId, canCheckpoint, autoCheckpointInterval]);
  
  // Auto-checkpoint effect
  useEffect(() => {
    if (!lastAutoCheckpointData || !projectId || autoCheckpointInterval <= 0) return;
    
    const timer = setTimeout(() => {
      if (lastAutoCheckpointData) {
        createCheckpoint(projectId, 'Auto-save', lastAutoCheckpointData, true);
        setLastAutoCheckpointData(null);
      }
    }, autoCheckpointInterval);
    
    return () => clearTimeout(timer);
  }, [lastAutoCheckpointData, projectId, autoCheckpointInterval, createCheckpoint]);
  
  // UI toggles
  const openShareDialog = useCallback(() => {
    if (projectId) toggleShareDialog();
  }, [projectId, toggleShareDialog]);
  
  const openChatPanel = useCallback(() => {
    if (projectId) toggleChatPanel();
  }, [projectId, toggleChatPanel]);
  
  const openCheckpointPanel = useCallback(() => {
    if (projectId) toggleCheckpointPanel();
  }, [projectId, toggleCheckpointPanel]);
  
  return {
    projectId,
    isCollaborative: !!projectId && collaborators.length > 1,
    collaborators,
    activeCollaboratorCount,
    
    canEdit,
    canShare,
    canCheckpoint,
    
    createCheckpoint: handleCreateCheckpoint,
    openShareDialog,
    openChatPanel,
    openCheckpointPanel,
    
    scheduleAutoCheckpoint,
    
    showShareButton: !!projectId,
    showChatButton: !!projectId && collaborators.length > 1,
    showCollaboratorAvatars: !!projectId && activeCollaboratorCount > 0,
  };
}

/**
 * Collaboration toolbar button styles
 */
export const collabButtonStyles: Record<string, React.CSSProperties> = {
  collabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: 'rgba(94, 92, 230, 0.15)',
    border: '1px solid rgba(94, 92, 230, 0.3)',
    borderRadius: 6,
    color: '#5e5ce6',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  avatarStack: {
    display: 'flex',
    marginLeft: -4,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid var(--color-bg-elevated)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 600,
    color: '#fff',
    marginLeft: -6,
  },
  onlineIndicator: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#30d158',
    position: 'absolute',
    bottom: -1,
    right: -1,
    border: '1px solid var(--color-bg-elevated)',
  },
};

export default useCollaborationFeatures;
