// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - NOTES App - Organization Engine
// Notebooks, tags, search, and linking
// Items 776-800 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// ITEM 776-780: NOTEBOOKS & FOLDERS
// =============================================================================

export interface Notebook {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  parentId?: string;
  noteCount: number;
  isDefault: boolean;
  isLocked: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  notebookId: string;
  children: (Folder | string)[];
  isExpanded: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface NotebookSettings {
  defaultNotebook: string;
  sortBy: 'title' | 'created' | 'modified' | 'accessed';
  sortDirection: 'asc' | 'desc';
  showSubfolders: boolean;
  showNotePreview: boolean;
  previewLines: number;
  gridColumns: number;
}

// =============================================================================
// ITEM 781-785: TAGS & LABELS
// =============================================================================

export interface Tag {
  id: string;
  name: string;
  color: string;
  noteCount: number;
  parentId?: string;
  children?: Tag[];
  createdAt: number;
}

export interface TagGroup {
  id: string;
  name: string;
  tags: Tag[];
  isExclusive: boolean;
}

export interface SmartTag {
  id: string;
  name: string;
  icon: string;
  query: SearchQuery;
  noteCount: number;
  isSystem: boolean;
}

export const SYSTEM_SMART_TAGS: SmartTag[] = [
  { id: 'recent', name: 'Recent', icon: 'clock', query: { sortBy: 'accessed', limit: 50 }, noteCount: 0, isSystem: true },
  { id: 'favorites', name: 'Favorites', icon: 'star', query: { pinned: true }, noteCount: 0, isSystem: true },
  { id: 'today', name: 'Today', icon: 'calendar', query: { modifiedAfter: Date.now() - 86400000 }, noteCount: 0, isSystem: true },
  { id: 'this-week', name: 'This Week', icon: 'calendar', query: { modifiedAfter: Date.now() - 604800000 }, noteCount: 0, isSystem: true },
  { id: 'shared', name: 'Shared', icon: 'users', query: { hasCollaborators: true }, noteCount: 0, isSystem: true },
  { id: 'attachments', name: 'Attachments', icon: 'paperclip', query: { hasAttachments: true }, noteCount: 0, isSystem: true },
  { id: 'images', name: 'Images', icon: 'image', query: { hasImages: true }, noteCount: 0, isSystem: true },
  { id: 'tasks', name: 'Tasks', icon: 'check-square', query: { hasTasks: true }, noteCount: 0, isSystem: true },
  { id: 'untagged', name: 'Untagged', icon: 'tag', query: { tags: [] }, noteCount: 0, isSystem: true },
  { id: 'trash', name: 'Trash', icon: 'trash', query: { trashed: true }, noteCount: 0, isSystem: true }
];

// =============================================================================
// ITEM 786-790: SEARCH & FILTER
// =============================================================================

export interface SearchQuery {
  text?: string;
  title?: string;
  content?: string;
  tags?: string[];
  notebookId?: string;
  folderId?: string;
  pinned?: boolean;
  locked?: boolean;
  trashed?: boolean;
  archived?: boolean;
  hasCollaborators?: boolean;
  hasAttachments?: boolean;
  hasImages?: boolean;
  hasTasks?: boolean;
  hasLinks?: boolean;
  createdAfter?: number;
  createdBefore?: number;
  modifiedAfter?: number;
  modifiedBefore?: number;
  sortBy?: 'title' | 'created' | 'modified' | 'accessed' | 'relevance';
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  noteId: string;
  title: string;
  snippet: string;
  highlights: Highlight[];
  score: number;
  matchedFields: string[];
}

export interface Highlight {
  field: 'title' | 'content' | 'tags';
  text: string;
  start: number;
  end: number;
}

export interface SearchIndex {
  noteId: string;
  titleTokens: string[];
  contentTokens: string[];
  tags: string[];
  tf: Map<string, number>;
  lastIndexed: number;
}

// =============================================================================
// ITEM 791-795: NOTE LINKS & BACKLINKS
// =============================================================================

export interface NoteLink {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  blockId?: string;
  anchor?: string;
  label?: string;
  createdAt: number;
}

export interface Backlink {
  noteId: string;
  noteTitle: string;
  blockId: string;
  context: string;
  createdAt: number;
}

export interface WikiLink {
  raw: string;
  noteTitle: string;
  anchor?: string;
  alias?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'note' | 'tag' | 'notebook';
  size: number;
  color: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'link' | 'tag' | 'folder';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// =============================================================================
// ITEM 796-800: ORGANIZATION ENGINE
// =============================================================================

export class OrganizationEngine {
  private notebooks: Map<string, Notebook> = new Map();
  private folders: Map<string, Folder> = new Map();
  private tags: Map<string, Tag> = new Map();
  private tagGroups: Map<string, TagGroup> = new Map();
  private smartTags: Map<string, SmartTag> = new Map();
  private links: Map<string, NoteLink> = new Map();
  private searchIndex: Map<string, SearchIndex> = new Map();
  private settings: NotebookSettings;
  private listeners: Map<string, Set<(event: OrganizationEvent) => void>> = new Map();
  
  constructor(settings?: Partial<NotebookSettings>) {
    this.settings = {
      defaultNotebook: '',
      sortBy: 'modified',
      sortDirection: 'desc',
      showSubfolders: true,
      showNotePreview: true,
      previewLines: 3,
      gridColumns: 3,
      ...settings
    };
    
    // Initialize system smart tags
    for (const tag of SYSTEM_SMART_TAGS) {
      this.smartTags.set(tag.id, { ...tag });
    }
    
    // Create default notebook
    this.createNotebook('My Notes', { isDefault: true });
  }
  
  // Notebook management
  createNotebook(name: string, options?: Partial<Notebook>): Notebook {
    const notebook: Notebook = {
      id: this.generateId('nb'),
      name,
      description: '',
      color: this.getRandomColor(),
      icon: 'book',
      noteCount: 0,
      isDefault: false,
      isLocked: false,
      sortOrder: this.notebooks.size,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...options
    };
    
    this.notebooks.set(notebook.id, notebook);
    
    if (notebook.isDefault) {
      this.settings.defaultNotebook = notebook.id;
    }
    
    this.emit('notebook-created', { notebook });
    return notebook;
  }
  
  updateNotebook(notebookId: string, updates: Partial<Notebook>): Notebook | null {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) return null;
    
    Object.assign(notebook, updates, { updatedAt: Date.now() });
    this.emit('notebook-updated', { notebook });
    return notebook;
  }
  
  deleteNotebook(notebookId: string, moveNotesTo?: string): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook || notebook.isDefault) return;
    
    this.notebooks.delete(notebookId);
    
    // Delete associated folders
    for (const [id, folder] of this.folders) {
      if (folder.notebookId === notebookId) {
        this.folders.delete(id);
      }
    }
    
    this.emit('notebook-deleted', { notebookId, moveNotesTo });
  }
  
  getNotebooks(): Notebook[] {
    return Array.from(this.notebooks.values())
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  
  getNotebook(notebookId: string): Notebook | undefined {
    return this.notebooks.get(notebookId);
  }
  
  // Folder management
  createFolder(notebookId: string, name: string, parentId?: string): Folder {
    const folder: Folder = {
      id: this.generateId('folder'),
      name,
      notebookId,
      parentId,
      children: [],
      isExpanded: true,
      sortOrder: 0,
      createdAt: Date.now()
    };
    
    this.folders.set(folder.id, folder);
    
    if (parentId) {
      const parent = this.folders.get(parentId);
      if (parent) {
        parent.children.push(folder.id);
      }
    }
    
    this.emit('folder-created', { folder });
    return folder;
  }
  
  updateFolder(folderId: string, updates: Partial<Folder>): Folder | null {
    const folder = this.folders.get(folderId);
    if (!folder) return null;
    
    Object.assign(folder, updates);
    this.emit('folder-updated', { folder });
    return folder;
  }
  
  deleteFolder(folderId: string, moveNotesTo?: string): void {
    const folder = this.folders.get(folderId);
    if (!folder) return;
    
    // Recursively delete subfolders
    for (const childId of folder.children) {
      if (typeof childId === 'string' && this.folders.has(childId)) {
        this.deleteFolder(childId, moveNotesTo);
      }
    }
    
    // Remove from parent
    if (folder.parentId) {
      const parent = this.folders.get(folder.parentId);
      if (parent) {
        parent.children = parent.children.filter(c => c !== folderId);
      }
    }
    
    this.folders.delete(folderId);
    this.emit('folder-deleted', { folderId, moveNotesTo });
  }
  
  getFolders(notebookId: string): Folder[] {
    return Array.from(this.folders.values())
      .filter(f => f.notebookId === notebookId && !f.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  
  getFolderTree(notebookId: string): Folder[] {
    const rootFolders = this.getFolders(notebookId);
    
    const buildTree = (folders: Folder[]): Folder[] => {
      return folders.map(folder => ({
        ...folder,
        children: folder.children
          .filter(c => typeof c === 'string')
          .map(id => this.folders.get(id as string))
          .filter((f): f is Folder => f !== undefined)
      }));
    };
    
    return buildTree(rootFolders);
  }
  
  // Tag management
  createTag(name: string, options?: Partial<Tag>): Tag {
    const existing = Array.from(this.tags.values()).find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    
    const tag: Tag = {
      id: this.generateId('tag'),
      name,
      color: this.getRandomColor(),
      noteCount: 0,
      createdAt: Date.now(),
      ...options
    };
    
    this.tags.set(tag.id, tag);
    this.emit('tag-created', { tag });
    return tag;
  }
  
  updateTag(tagId: string, updates: Partial<Tag>): Tag | null {
    const tag = this.tags.get(tagId);
    if (!tag) return null;
    
    Object.assign(tag, updates);
    this.emit('tag-updated', { tag });
    return tag;
  }
  
  deleteTag(tagId: string): void {
    const tag = this.tags.get(tagId);
    if (!tag) return;
    
    this.tags.delete(tagId);
    this.emit('tag-deleted', { tagId });
  }
  
  mergeTags(sourceTagId: string, targetTagId: string): void {
    const source = this.tags.get(sourceTagId);
    const target = this.tags.get(targetTagId);
    if (!source || !target) return;
    
    target.noteCount += source.noteCount;
    this.tags.delete(sourceTagId);
    
    this.emit('tags-merged', { sourceTagId, targetTagId });
  }
  
  getTags(): Tag[] {
    return Array.from(this.tags.values())
      .sort((a, b) => b.noteCount - a.noteCount);
  }
  
  getTag(tagId: string): Tag | undefined {
    return this.tags.get(tagId);
  }
  
  getTagByName(name: string): Tag | undefined {
    return Array.from(this.tags.values())
      .find(t => t.name.toLowerCase() === name.toLowerCase());
  }
  
  // Tag groups
  createTagGroup(name: string, tagIds: string[], isExclusive: boolean = false): TagGroup {
    const group: TagGroup = {
      id: this.generateId('tg'),
      name,
      tags: tagIds.map(id => this.tags.get(id)).filter((t): t is Tag => t !== undefined),
      isExclusive
    };
    
    this.tagGroups.set(group.id, group);
    this.emit('tag-group-created', { group });
    return group;
  }
  
  getTagGroups(): TagGroup[] {
    return Array.from(this.tagGroups.values());
  }
  
  // Smart tags
  createSmartTag(name: string, query: SearchQuery, icon: string = 'tag'): SmartTag {
    const smartTag: SmartTag = {
      id: this.generateId('st'),
      name,
      icon,
      query,
      noteCount: 0,
      isSystem: false
    };
    
    this.smartTags.set(smartTag.id, smartTag);
    this.emit('smart-tag-created', { smartTag });
    return smartTag;
  }
  
  getSmartTags(): SmartTag[] {
    return Array.from(this.smartTags.values());
  }
  
  // Search
  search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    
    for (const [noteId, index] of this.searchIndex) {
      let score = 0;
      const highlights: Highlight[] = [];
      const matchedFields: string[] = [];
      
      // Text search
      if (query.text) {
        const terms = this.tokenize(query.text);
        
        for (const term of terms) {
          // Title match (higher weight)
          if (index.titleTokens.some(t => t.includes(term))) {
            score += 10;
            matchedFields.push('title');
          }
          
          // Content match
          if (index.contentTokens.some(t => t.includes(term))) {
            score += 5 * (index.tf.get(term) || 1);
            matchedFields.push('content');
          }
          
          // Tag match
          if (index.tags.some(t => t.toLowerCase().includes(term))) {
            score += 3;
            matchedFields.push('tags');
          }
        }
      }
      
      // Tag filter
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(t => 
          index.tags.some(it => it.toLowerCase() === t.toLowerCase())
        );
        if (!hasAllTags) continue;
      }
      
      if (score > 0 || !query.text) {
        results.push({
          noteId,
          title: index.titleTokens.join(' '),
          snippet: index.contentTokens.slice(0, 50).join(' '),
          highlights,
          score,
          matchedFields: [...new Set(matchedFields)]
        });
      }
    }
    
    // Sort results
    const sortBy = query.sortBy || 'relevance';
    results.sort((a, b) => {
      if (sortBy === 'relevance') {
        return b.score - a.score;
      }
      return 0;
    });
    
    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    
    return results.slice(offset, offset + limit);
  }
  
  indexNote(noteId: string, title: string, content: string, tags: string[]): void {
    const titleTokens = this.tokenize(title);
    const contentTokens = this.tokenize(content);
    
    // Calculate term frequency
    const tf = new Map<string, number>();
    for (const token of contentTokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    
    const index: SearchIndex = {
      noteId,
      titleTokens,
      contentTokens,
      tags,
      tf,
      lastIndexed: Date.now()
    };
    
    this.searchIndex.set(noteId, index);
  }
  
  removeFromIndex(noteId: string): void {
    this.searchIndex.delete(noteId);
  }
  
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }
  
  // Links
  createLink(sourceNoteId: string, targetNoteId: string, options?: Partial<NoteLink>): NoteLink {
    const link: NoteLink = {
      id: this.generateId('link'),
      sourceNoteId,
      targetNoteId,
      createdAt: Date.now(),
      ...options
    };
    
    this.links.set(link.id, link);
    this.emit('link-created', { link });
    return link;
  }
  
  deleteLink(linkId: string): void {
    this.links.delete(linkId);
    this.emit('link-deleted', { linkId });
  }
  
  getOutgoingLinks(noteId: string): NoteLink[] {
    return Array.from(this.links.values())
      .filter(l => l.sourceNoteId === noteId);
  }
  
  getBacklinks(noteId: string): Backlink[] {
    return Array.from(this.links.values())
      .filter(l => l.targetNoteId === noteId)
      .map(l => ({
        noteId: l.sourceNoteId,
        noteTitle: '',
        blockId: l.blockId || '',
        context: '',
        createdAt: l.createdAt
      }));
  }
  
  parseWikiLinks(text: string): WikiLink[] {
    const links: WikiLink[] = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const [raw, link, alias] = match;
      const [noteTitle, anchor] = link.split('#');
      
      links.push({
        raw,
        noteTitle: noteTitle.trim(),
        anchor: anchor?.trim(),
        alias: alias?.trim()
      });
    }
    
    return links;
  }
  
  // Knowledge graph
  generateGraph(noteIds?: string[]): GraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeSet = new Set<string>();
    
    const addNode = (id: string, label: string, type: GraphNode['type'], size: number = 1) => {
      if (!nodeSet.has(id)) {
        nodeSet.add(id);
        nodes.push({
          id,
          label,
          type,
          size,
          color: type === 'note' ? '#4A90D9' : type === 'tag' ? '#50C878' : '#9B59B6'
        });
      }
    };
    
    // Add note nodes and link edges
    for (const link of this.links.values()) {
      if (!noteIds || noteIds.includes(link.sourceNoteId) || noteIds.includes(link.targetNoteId)) {
        addNode(link.sourceNoteId, '', 'note');
        addNode(link.targetNoteId, '', 'note');
        
        edges.push({
          source: link.sourceNoteId,
          target: link.targetNoteId,
          weight: 1,
          type: 'link'
        });
      }
    }
    
    // Add tag nodes and edges
    for (const [noteId, index] of this.searchIndex) {
      if (!noteIds || noteIds.includes(noteId)) {
        addNode(noteId, index.titleTokens.join(' '), 'note');
        
        for (const tagName of index.tags) {
          const tagId = `tag-${tagName}`;
          addNode(tagId, tagName, 'tag', 0.5);
          
          edges.push({
            source: noteId,
            target: tagId,
            weight: 0.5,
            type: 'tag'
          });
        }
      }
    }
    
    return { nodes, edges };
  }
  
  // Settings
  getSettings(): NotebookSettings {
    return { ...this.settings };
  }
  
  updateSettings(settings: Partial<NotebookSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.emit('settings-updated', { settings: this.settings });
  }
  
  // Event handling
  on(event: string, callback: (event: OrganizationEvent) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }
  
  off(event: string, callback: (event: OrganizationEvent) => void): void {
    this.listeners.get(event)?.delete(callback);
  }
  
  private emit(event: string, data: Record<string, unknown>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const orgEvent: OrganizationEvent = { type: event, data, timestamp: Date.now() };
      listeners.forEach(callback => callback(orgEvent));
    }
  }
  
  // Utilities
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  private getRandomColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface OrganizationEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createOrganizationEngine = (settings?: Partial<NotebookSettings>) => 
  new OrganizationEngine(settings);

export default { OrganizationEngine, createOrganizationEngine };
