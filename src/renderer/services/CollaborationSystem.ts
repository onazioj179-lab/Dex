// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Collaboration System
// Real-time collaboration, sharing, and access control for creative apps
// =============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type CollaboratorRole = 'viewer' | 'commenter' | 'editor' | 'owner';

export interface Collaborator {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: CollaboratorRole;
  isVisitor: boolean;
  joinedAt: number;
  lastActiveAt: number;
  expiresAt?: number; // For visitors (7 days)
  verificationPin?: string;
  isOnline: boolean;
  cursor?: { x: number; y: number; color: string };
}

export interface AccessRequest {
  id: string;
  projectId: string;
  requesterEmail: string;
  requesterName: string;
  requestedRole: CollaboratorRole;
  message?: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

export interface Checkpoint {
  id: string;
  projectId: string;
  creatorId: string;
  creatorName: string;
  name: string;
  description?: string;
  timestamp: number;
  thumbnail?: string;
  data: string; // Serialized project state
  autoSave: boolean;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system' | 'checkpoint' | 'access';
  replyTo?: string;
  reactions?: Record<string, string[]>; // emoji -> userIds
}

export interface SharedProject {
  id: string;
  name: string;
  appId: string; // vinx, imosion, prism, flux, forge, axl
  ownerId: string;
  ownerEmail: string;
  collaborators: Collaborator[];
  accessRequests: AccessRequest[];
  checkpoints: Checkpoint[];
  chatMessages: ChatMessage[];
  linkSharing: {
    enabled: boolean;
    accessLevel: 'view' | 'comment' | 'edit';
    link: string;
    password?: string;
  };
  visitorSharingEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
}

export interface CollaborationState {
  // Current user
  currentUser: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
  } | null;
  
  // Projects
  projects: Map<string, SharedProject>;
  activeProjectId: string | null;
  
  // UI State
  showShareDialog: boolean;
  showChatPanel: boolean;
  showCheckpointPanel: boolean;
  
  // Real-time
  connectedUsers: Map<string, Collaborator>;
  typingUsers: Set<string>;
  
  // Actions
  setCurrentUser: (user: CollaborationState['currentUser']) => void;
  createProject: (name: string, appId: string) => SharedProject;
  getProject: (id: string) => SharedProject | undefined;
  setActiveProject: (id: string | null) => void;
  
  // Sharing
  inviteCollaborator: (projectId: string, email: string, role: CollaboratorRole) => Promise<void>;
  removeCollaborator: (projectId: string, collaboratorId: string) => void;
  updateCollaboratorRole: (projectId: string, collaboratorId: string, role: CollaboratorRole) => void;
  
  // Visitor sharing
  createVisitorInvite: (projectId: string, email: string, role: CollaboratorRole) => { pin: string; link: string };
  verifyVisitorPin: (projectId: string, pin: string) => Collaborator | null;
  
  // Link sharing
  enableLinkSharing: (projectId: string, accessLevel: 'view' | 'comment' | 'edit') => string;
  disableLinkSharing: (projectId: string) => void;
  
  // Access requests
  requestAccess: (projectId: string, email: string, name: string, message?: string) => void;
  handleAccessRequest: (projectId: string, requestId: string, approve: boolean) => void;
  
  // Checkpoints
  createCheckpoint: (projectId: string, name: string, data: string, autoSave?: boolean) => Checkpoint;
  restoreCheckpoint: (projectId: string, checkpointId: string) => string | null;
  deleteCheckpoint: (projectId: string, checkpointId: string) => void;
  
  // Chat
  sendMessage: (projectId: string, content: string, replyTo?: string) => void;
  addReaction: (projectId: string, messageId: string, emoji: string) => void;
  
  // UI
  toggleShareDialog: () => void;
  toggleChatPanel: () => void;
  toggleCheckpointPanel: () => void;
  
  // Real-time presence
  updatePresence: (userId: string, cursor?: { x: number; y: number }) => void;
  setUserOnline: (userId: string, online: boolean) => void;
  setUserTyping: (userId: string, typing: boolean) => void;
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

import { generateId } from '../../shared/util/id';

const generatePin = () => Math.random().toString().slice(2, 8);

const generateShareLink = (projectId: string) => 
  `dex://collab/${projectId}/${Math.random().toString(36).slice(2, 10)}`;

const ROLE_PERMISSIONS: Record<CollaboratorRole, string[]> = {
  viewer: ['view', 'download'],
  commenter: ['view', 'download', 'comment', 'chat'],
  editor: ['view', 'download', 'comment', 'chat', 'edit', 'checkpoint'],
  owner: ['view', 'download', 'comment', 'chat', 'edit', 'checkpoint', 'share', 'delete', 'settings'],
};

export const hasPermission = (role: CollaboratorRole, permission: string): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

const COLLABORATOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

const getCollaboratorColor = (index: number) => 
  COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length];

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

export const useCollaborationStore = create<CollaborationState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      projects: new Map(),
      activeProjectId: null,
      showShareDialog: false,
      showChatPanel: false,
      showCheckpointPanel: false,
      connectedUsers: new Map(),
      typingUsers: new Set(),

      setCurrentUser: (user) => set({ currentUser: user }),

      createProject: (name, appId) => {
        const { currentUser, projects } = get();
        if (!currentUser) throw new Error('Not authenticated');

        const project: SharedProject = {
          id: generateId(),
          name,
          appId,
          ownerId: currentUser.id,
          ownerEmail: currentUser.email,
          collaborators: [{
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            avatar: currentUser.avatar,
            role: 'owner',
            isVisitor: false,
            joinedAt: Date.now(),
            lastActiveAt: Date.now(),
            isOnline: true,
          }],
          accessRequests: [],
          checkpoints: [],
          chatMessages: [],
          linkSharing: {
            enabled: false,
            accessLevel: 'view',
            link: '',
          },
          visitorSharingEnabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPublic: false,
        };

        const newProjects = new Map(projects);
        newProjects.set(project.id, project);
        set({ projects: newProjects });

        return project;
      },

      getProject: (id) => get().projects.get(id),

      setActiveProject: (id) => set({ activeProjectId: id }),

      inviteCollaborator: async (projectId, email, role) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return;

        // Check if already a collaborator
        if (project.collaborators.some(c => c.email === email)) {
          throw new Error('User is already a collaborator');
        }

        const newCollaborator: Collaborator = {
          id: generateId(),
          email,
          name: email.split('@')[0],
          role,
          isVisitor: false,
          joinedAt: Date.now(),
          lastActiveAt: Date.now(),
          isOnline: false,
        };

        const updatedProject = {
          ...project,
          collaborators: [...project.collaborators, newCollaborator],
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        // Add system message
        get().sendMessage(projectId, `${currentUser.name} invited ${email} as ${role}`);

        // Queue email invitation via main process IPC
        window.dex?.invoke?.('collaboration:send-invite', {
          type: 'collaboration_invite',
          to: email,
          projectName: project.name,
          inviterName: currentUser.name,
          role,
          projectId,
        }).catch(() => {
          // Email sending requires backend - invitation is still recorded locally
          console.info(`[Collaboration] Invite recorded for ${email} (email delivery requires backend)`);
        });
      },

      removeCollaborator: (projectId, collaboratorId) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return;

        const collaborator = project.collaborators.find(c => c.id === collaboratorId);
        if (!collaborator) return;

        const updatedProject = {
          ...project,
          collaborators: project.collaborators.filter(c => c.id !== collaboratorId),
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        get().sendMessage(projectId, `${currentUser.name} removed ${collaborator.name} from the project`);
      },

      updateCollaboratorRole: (projectId, collaboratorId, role) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return;

        const updatedProject = {
          ...project,
          collaborators: project.collaborators.map(c =>
            c.id === collaboratorId ? { ...c, role } : c
          ),
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });
      },

      createVisitorInvite: (projectId, email, role) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) throw new Error('Project not found');

        const pin = generatePin();
        const link = generateShareLink(projectId);

        const visitor: Collaborator = {
          id: generateId(),
          email,
          name: email.split('@')[0],
          role,
          isVisitor: true,
          joinedAt: Date.now(),
          lastActiveAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          verificationPin: pin,
          isOnline: false,
        };

        const updatedProject = {
          ...project,
          collaborators: [...project.collaborators, visitor],
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        return { pin, link };
      },

      verifyVisitorPin: (projectId, pin) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) return null;

        const visitor = project.collaborators.find(
          c => c.isVisitor && c.verificationPin === pin
        );

        if (!visitor) return null;

        // Check if expired
        if (visitor.expiresAt && visitor.expiresAt < Date.now()) {
          return null;
        }

        return visitor;
      },

      enableLinkSharing: (projectId, accessLevel) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) throw new Error('Project not found');

        const link = generateShareLink(projectId);

        const updatedProject = {
          ...project,
          linkSharing: {
            enabled: true,
            accessLevel,
            link,
          },
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        return link;
      },

      disableLinkSharing: (projectId) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) return;

        const updatedProject: SharedProject = {
          ...project,
          linkSharing: {
            enabled: false,
            accessLevel: 'view' as const,
            link: '',
          },
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });
      },

      requestAccess: (projectId, email, name, message) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) return;

        const request: AccessRequest = {
          id: generateId(),
          projectId,
          requesterEmail: email,
          requesterName: name,
          requestedRole: 'viewer',
          message,
          timestamp: Date.now(),
          status: 'pending',
        };

        const updatedProject = {
          ...project,
          accessRequests: [...project.accessRequests, request],
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        // Add system message
        get().sendMessage(projectId, `${name} requested access to this project`);
      },

      handleAccessRequest: (projectId, requestId, approve) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return;

        const request = project.accessRequests.find(r => r.id === requestId);
        if (!request) return;

        if (approve) {
          // Add as collaborator
          const newCollaborator: Collaborator = {
            id: generateId(),
            email: request.requesterEmail,
            name: request.requesterName,
            role: request.requestedRole,
            isVisitor: false,
            joinedAt: Date.now(),
            lastActiveAt: Date.now(),
            isOnline: false,
          };

          const updatedProject = {
            ...project,
            collaborators: [...project.collaborators, newCollaborator],
            accessRequests: project.accessRequests.map(r =>
              r.id === requestId ? { ...r, status: 'approved' as const } : r
            ),
            updatedAt: Date.now(),
          };

          const newProjects = new Map(projects);
          newProjects.set(projectId, updatedProject);
          set({ projects: newProjects });

          get().sendMessage(projectId, `${currentUser.name} approved ${request.requesterName}'s access request`);
        } else {
          const updatedProject = {
            ...project,
            accessRequests: project.accessRequests.map(r =>
              r.id === requestId ? { ...r, status: 'denied' as const } : r
            ),
            updatedAt: Date.now(),
          };

          const newProjects = new Map(projects);
          newProjects.set(projectId, updatedProject);
          set({ projects: newProjects });
        }
      },

      createCheckpoint: (projectId, name, data, autoSave = false) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) throw new Error('Invalid state');

        const checkpoint: Checkpoint = {
          id: generateId(),
          projectId,
          creatorId: currentUser.id,
          creatorName: currentUser.name,
          name,
          timestamp: Date.now(),
          data,
          autoSave,
        };

        const updatedProject = {
          ...project,
          checkpoints: [...project.checkpoints, checkpoint].slice(-50), // Keep last 50
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });

        if (!autoSave) {
          get().sendMessage(projectId, `${currentUser.name} created checkpoint: "${name}"`);
        }

        return checkpoint;
      },

      restoreCheckpoint: (projectId, checkpointId) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return null;

        const checkpoint = project.checkpoints.find(c => c.id === checkpointId);
        if (!checkpoint) return null;

        get().sendMessage(projectId, `${currentUser.name} restored checkpoint: "${checkpoint.name}"`);

        return checkpoint.data;
      },

      deleteCheckpoint: (projectId, checkpointId) => {
        const { projects } = get();
        const project = projects.get(projectId);
        if (!project) return;

        const updatedProject = {
          ...project,
          checkpoints: project.checkpoints.filter(c => c.id !== checkpointId),
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });
      },

      sendMessage: (projectId, content, replyTo) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project) return;

        const isSystem = !currentUser;
        const message: ChatMessage = {
          id: generateId(),
          projectId,
          senderId: currentUser?.id || 'system',
          senderName: currentUser?.name || 'System',
          senderAvatar: currentUser?.avatar,
          content,
          timestamp: Date.now(),
          type: isSystem ? 'system' : 'text',
          replyTo,
        };

        const updatedProject = {
          ...project,
          chatMessages: [...project.chatMessages, message].slice(-500), // Keep last 500
          updatedAt: Date.now(),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });
      },

      addReaction: (projectId, messageId, emoji) => {
        const { projects, currentUser } = get();
        const project = projects.get(projectId);
        if (!project || !currentUser) return;

        const updatedProject = {
          ...project,
          chatMessages: project.chatMessages.map(msg => {
            if (msg.id !== messageId) return msg;
            const reactions = { ...msg.reactions };
            if (!reactions[emoji]) reactions[emoji] = [];
            if (reactions[emoji].includes(currentUser.id)) {
              reactions[emoji] = reactions[emoji].filter(id => id !== currentUser.id);
            } else {
              reactions[emoji] = [...reactions[emoji], currentUser.id];
            }
            return { ...msg, reactions };
          }),
        };

        const newProjects = new Map(projects);
        newProjects.set(projectId, updatedProject);
        set({ projects: newProjects });
      },

      toggleShareDialog: () => set(s => ({ showShareDialog: !s.showShareDialog })),
      toggleChatPanel: () => set(s => ({ showChatPanel: !s.showChatPanel })),
      toggleCheckpointPanel: () => set(s => ({ showCheckpointPanel: !s.showCheckpointPanel })),

      updatePresence: (userId, cursor) => {
        const { connectedUsers } = get();
        const user = connectedUsers.get(userId);
        if (!user) return;

        const newConnectedUsers = new Map(connectedUsers);
        newConnectedUsers.set(userId, {
          ...user,
          lastActiveAt: Date.now(),
          cursor: cursor ? { ...cursor, color: user.cursor?.color || getCollaboratorColor(connectedUsers.size) } : undefined,
        });
        set({ connectedUsers: newConnectedUsers });
      },

      setUserOnline: (userId, online) => {
        const { connectedUsers, projects, activeProjectId } = get();
        
        if (online) {
          const project = activeProjectId ? projects.get(activeProjectId) : null;
          const collaborator = project?.collaborators.find(c => c.id === userId);
          if (collaborator) {
            const newConnectedUsers = new Map(connectedUsers);
            newConnectedUsers.set(userId, {
              ...collaborator,
              isOnline: true,
              cursor: { x: 0, y: 0, color: getCollaboratorColor(connectedUsers.size) },
            });
            set({ connectedUsers: newConnectedUsers });
          }
        } else {
          const newConnectedUsers = new Map(connectedUsers);
          newConnectedUsers.delete(userId);
          set({ connectedUsers: newConnectedUsers });
        }
      },

      setUserTyping: (userId, typing) => {
        const { typingUsers } = get();
        const newTypingUsers = new Set(typingUsers);
        if (typing) {
          newTypingUsers.add(userId);
        } else {
          newTypingUsers.delete(userId);
        }
        set({ typingUsers: newTypingUsers });
      },
    }),
    {
      name: 'dex-collaboration',
      partialize: (state) => ({
        currentUser: state.currentUser,
        projects: Array.from(state.projects.entries()),
      }),
      merge: (persisted: any, current) => ({
        ...current,
        currentUser: persisted?.currentUser || null,
        projects: new Map(persisted?.projects || []),
      }),
    }
  )
);

// ---------------------------------------------------------------------------
// HOOKS
// ---------------------------------------------------------------------------

export const useActiveProject = () => {
  const { activeProjectId, projects } = useCollaborationStore();
  return activeProjectId ? projects.get(activeProjectId) : null;
};

export const useCollaborators = (projectId?: string) => {
  const { activeProjectId, projects } = useCollaborationStore();
  const id = projectId || activeProjectId;
  const project = id ? projects.get(id) : null;
  return project?.collaborators || [];
};

export const useOnlineCollaborators = () => {
  return useCollaborationStore(s => Array.from(s.connectedUsers.values()));
};

export const useChatMessages = (projectId?: string) => {
  const { activeProjectId, projects } = useCollaborationStore();
  const id = projectId || activeProjectId;
  const project = id ? projects.get(id) : null;
  return project?.chatMessages || [];
};

export const useCheckpoints = (projectId?: string) => {
  const { activeProjectId, projects } = useCollaborationStore();
  const id = projectId || activeProjectId;
  const project = id ? projects.get(id) : null;
  return project?.checkpoints || [];
};

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

export default useCollaborationStore;
