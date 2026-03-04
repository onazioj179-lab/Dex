// ═══════════════════════════════════════════════════════════════════════════
// DEX - Ideas Controller
// Phase 7B: Creative Workspace (Draft Ideas, Projects)
// ═══════════════════════════════════════════════════════════════════════════

import { DataStore } from '../store/DataStore';
import { Logger } from '../utils/Logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IdeaStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type IdeaType = 'thought' | 'project' | 'concept' | 'experiment' | 'reference';

export interface Idea {
  id: string;
  title: string;
  content: string;
  type: IdeaType;
  status: IdeaStatus;
  tags: string[];
  attachments: string[]; // Media file IDs
  linkedNotes: string[]; // Note IDs
  linkedVoice: string[]; // Voice note IDs
  pinned: boolean;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IdeaFolder {
  id: string;
  name: string;
  color: string;
  ideaIds: string[];
  createdAt: number;
}

export interface IdeasStats {
  total: number;
  byStatus: Record<IdeaStatus, number>;
  byType: Record<IdeaType, number>;
  recentlyUpdated: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const DEFAULT_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#06b6d4', // Cyan
];

// ═══════════════════════════════════════════════════════════════════════════
// Ideas Controller
// ═══════════════════════════════════════════════════════════════════════════

export class IdeasController {
  private dataStore: DataStore;
  private logger: Logger;
  private ideas: Idea[] = [];
  private folders: IdeaFolder[] = [];
  private initialized: boolean = false;

  constructor(dataStore: DataStore, logger: Logger) {
    this.dataStore = dataStore;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load ideas
      const savedIdeas = await this.dataStore.get<Idea[]>('ideas');
      if (savedIdeas) {
        this.ideas = savedIdeas;
      }

      // Load folders
      const savedFolders = await this.dataStore.get<IdeaFolder[]>('ideaFolders');
      if (savedFolders) {
        this.folders = savedFolders;
      }

      this.initialized = true;
      this.logger.info('Ideas Controller initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Ideas Controller');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Idea CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async getAll(): Promise<Idea[]> {
    return this.ideas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getById(id: string): Promise<Idea | null> {
    return this.ideas.find(i => i.id === id) || null;
  }

  async create(data: Partial<Idea>): Promise<Idea> {
    const now = Date.now();
    const idea: Idea = {
      id: generateId(),
      title: data.title || 'Untitled Idea',
      content: data.content || '',
      type: data.type || 'thought',
      status: data.status || 'draft',
      tags: data.tags || [],
      attachments: data.attachments || [],
      linkedNotes: data.linkedNotes || [],
      linkedVoice: data.linkedVoice || [],
      pinned: data.pinned || false,
      color: data.color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
      createdAt: now,
      updatedAt: now,
    };

    this.ideas.push(idea);
    await this.saveData();

    this.logger.info(`Idea created: ${idea.title}`);
    return idea;
  }

  async update(id: string, updates: Partial<Idea>): Promise<Idea | null> {
    const index = this.ideas.findIndex(i => i.id === id);
    if (index === -1) return null;

    const idea = this.ideas[index];
    this.ideas[index] = {
      ...idea,
      ...updates,
      id: idea.id, // Prevent ID change
      createdAt: idea.createdAt, // Preserve creation time
      updatedAt: Date.now(),
    };

    await this.saveData();
    return this.ideas[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.ideas.findIndex(i => i.id === id);
    if (index === -1) return false;

    const idea = this.ideas[index];
    this.ideas.splice(index, 1);

    // Remove from folders
    for (const folder of this.folders) {
      folder.ideaIds = folder.ideaIds.filter(ideaId => ideaId !== id);
    }

    await this.saveData();
    this.logger.info(`Idea deleted: ${idea.title}`);
    return true;
  }

  async togglePin(id: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === id);
    if (!idea) return null;

    idea.pinned = !idea.pinned;
    idea.updatedAt = Date.now();
    await this.saveData();

    return idea;
  }

  async setStatus(id: string, status: IdeaStatus): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === id);
    if (!idea) return null;

    idea.status = status;
    idea.updatedAt = Date.now();
    await this.saveData();

    return idea;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Attachments & Links
  // ─────────────────────────────────────────────────────────────────────────

  async addAttachment(ideaId: string, mediaId: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    if (!idea.attachments.includes(mediaId)) {
      idea.attachments.push(mediaId);
      idea.updatedAt = Date.now();
      await this.saveData();
    }

    return idea;
  }

  async removeAttachment(ideaId: string, mediaId: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    idea.attachments = idea.attachments.filter(id => id !== mediaId);
    idea.updatedAt = Date.now();
    await this.saveData();

    return idea;
  }

  async linkNote(ideaId: string, noteId: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    if (!idea.linkedNotes.includes(noteId)) {
      idea.linkedNotes.push(noteId);
      idea.updatedAt = Date.now();
      await this.saveData();
    }

    return idea;
  }

  async linkVoice(ideaId: string, voiceId: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    if (!idea.linkedVoice.includes(voiceId)) {
      idea.linkedVoice.push(voiceId);
      idea.updatedAt = Date.now();
      await this.saveData();
    }

    return idea;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Folders
  // ─────────────────────────────────────────────────────────────────────────

  async getFolders(): Promise<IdeaFolder[]> {
    return this.folders;
  }

  async createFolder(name: string, color?: string): Promise<IdeaFolder> {
    const folder: IdeaFolder = {
      id: `folder-${Date.now()}`,
      name,
      color: color || DEFAULT_COLORS[this.folders.length % DEFAULT_COLORS.length],
      ideaIds: [],
      createdAt: Date.now(),
    };

    this.folders.push(folder);
    await this.saveData();

    return folder;
  }

  async deleteFolder(folderId: string): Promise<boolean> {
    const index = this.folders.findIndex(f => f.id === folderId);
    if (index === -1) return false;

    this.folders.splice(index, 1);
    await this.saveData();

    return true;
  }

  async addToFolder(folderId: string, ideaId: string): Promise<IdeaFolder | null> {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return null;

    if (!folder.ideaIds.includes(ideaId)) {
      folder.ideaIds.push(ideaId);
      await this.saveData();
    }

    return folder;
  }

  async removeFromFolder(folderId: string, ideaId: string): Promise<IdeaFolder | null> {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return null;

    folder.ideaIds = folder.ideaIds.filter(id => id !== ideaId);
    await this.saveData();

    return folder;
  }

  async getIdeasInFolder(folderId: string): Promise<Idea[]> {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return [];

    return this.ideas.filter(i => folder.ideaIds.includes(i.id));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Search & Filter
  // ─────────────────────────────────────────────────────────────────────────

  async search(query: string): Promise<Idea[]> {
    const queryLower = query.toLowerCase();
    return this.ideas.filter(idea =>
      idea.title.toLowerCase().includes(queryLower) ||
      idea.content.toLowerCase().includes(queryLower) ||
      idea.tags.some(t => t.toLowerCase().includes(queryLower))
    );
  }

  async getByStatus(status: IdeaStatus): Promise<Idea[]> {
    return this.ideas
      .filter(i => i.status === status)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getByType(type: IdeaType): Promise<Idea[]> {
    return this.ideas
      .filter(i => i.type === type)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getByTag(tag: string): Promise<Idea[]> {
    const tagLower = tag.toLowerCase();
    return this.ideas
      .filter(i => i.tags.some(t => t.toLowerCase() === tagLower))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getPinned(): Promise<Idea[]> {
    return this.ideas
      .filter(i => i.pinned)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getRecent(limit: number = 10): Promise<Idea[]> {
    return this.ideas
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  async getDrafts(): Promise<Idea[]> {
    return this.getByStatus('draft');
  }

  async getActive(): Promise<Idea[]> {
    return this.getByStatus('active');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────────────────────────────────

  getStats(): IdeasStats {
    const byStatus: Record<IdeaStatus, number> = {
      draft: 0,
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };

    const byType: Record<IdeaType, number> = {
      thought: 0,
      project: 0,
      concept: 0,
      experiment: 0,
      reference: 0,
    };

    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let recentlyUpdated = 0;

    for (const idea of this.ideas) {
      byStatus[idea.status]++;
      byType[idea.type]++;
      if (idea.updatedAt > weekAgo) {
        recentlyUpdated++;
      }
    }

    return {
      total: this.ideas.length,
      byStatus,
      byType,
      recentlyUpdated,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tags
  // ─────────────────────────────────────────────────────────────────────────

  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const idea of this.ideas) {
      for (const tag of idea.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }

  async addTag(ideaId: string, tag: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    if (!idea.tags.includes(tag)) {
      idea.tags.push(tag);
      idea.updatedAt = Date.now();
      await this.saveData();
    }

    return idea;
  }

  async removeTag(ideaId: string, tag: string): Promise<Idea | null> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return null;

    idea.tags = idea.tags.filter(t => t !== tag);
    idea.updatedAt = Date.now();
    await this.saveData();

    return idea;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data Management
  // ─────────────────────────────────────────────────────────────────────────

  private async saveData(): Promise<void> {
    await this.dataStore.set('ideas', this.ideas);
    await this.dataStore.set('ideaFolders', this.folders);
  }

  async archive(id: string): Promise<Idea | null> {
    return this.setStatus(id, 'archived');
  }

  async cleanupArchived(maxAgeDays: number = 90): Promise<number> {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const toDelete = this.ideas.filter(i => 
      i.status === 'archived' && i.updatedAt < cutoff
    );
    
    for (const idea of toDelete) {
      await this.delete(idea.id);
    }

    return toDelete.length;
  }
}
