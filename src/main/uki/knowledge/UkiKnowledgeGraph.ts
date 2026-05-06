// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Knowledge Graph
// Semantic memory: tracks commands, preferences, usage patterns
// ===========================================================================

import Store from 'electron-store';
import type { UkiIntent, UkiResult } from '../UkiEngine';

export interface KnowledgeNode {
  id: string;
  type: 'app' | 'page' | 'file' | 'command' | 'preference' | 'tag';
  label: string;
  color: string;
  weight: number; // usage frequency
  lastUsed: number;
  metadata: Record<string, unknown>;
}

export interface KnowledgeEdge {
  source: string;
  target: string;
  relation: string; // 'opened-with' | 'controls' | 'related-to' | 'follows'
  weight: number;
}

interface KnowledgeData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

const MAX_NODES = 500;
const MAX_EDGES = 2000;

// App colors from APP_DEFINITIONS
const APP_COLORS: Record<string, string> = {
  home: '#0A84FF', files: '#64D2FF', notes: '#FFD60A', browser: '#30D158',
  settings: '#8E8E93', transfers: '#5E5CE6', tasks: '#FF9F0A', gallery: '#BF5AF2',
  audio: '#FF453A', workflows: '#64D2FF', calendar: '#FF9F0A', calculator: '#8E8E93',
  videoeditor: '#BF5AF2', imosion: '#FF6B35', prism: '#30D158', flux: '#64D2FF',
  forge: '#FFD60A', axl: '#0A84FF', rewind: '#0A84FF', nexus: '#0A84FF',
  kanban: '#5E5CE6', achievements: '#FFD60A',
};

class UkiKnowledgeGraphImpl {
  private static _instance: UkiKnowledgeGraphImpl;
  private store: Store<{ ukiKnowledge: KnowledgeData }>;
  private data: KnowledgeData;
  private nodeIndex = new Map<string, KnowledgeNode>();
  private edgeIndex = new Map<string, KnowledgeEdge>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.store = new Store<{ ukiKnowledge: KnowledgeData }>({
      name: 'uki-knowledge',
      defaults: { ukiKnowledge: { nodes: [], edges: [] } },
      encryptionKey: 'dex-uki-knowledge-v1',
    });
    this.data = this.store.get('ukiKnowledge', { nodes: [], edges: [] });
    this.rebuildIndexes();
  }

  static getInstance(): UkiKnowledgeGraphImpl {
    if (!UkiKnowledgeGraphImpl._instance) {
      UkiKnowledgeGraphImpl._instance = new UkiKnowledgeGraphImpl();
    }
    return UkiKnowledgeGraphImpl._instance;
  }

  async initialize(): Promise<void> {
    // Seed default app nodes if empty
    if (this.data.nodes.length === 0) {
      const appIds = Object.keys(APP_COLORS);
      for (const id of appIds) {
        this.data.nodes.push({
          id: `app:${id}`,
          type: 'app',
          label: id.charAt(0).toUpperCase() + id.slice(1),
          color: APP_COLORS[id] || '#8E8E93',
          weight: 0,
          lastUsed: 0,
          metadata: {},
        });
      }
      this.rebuildIndexes();
      this.schedulePersist();
    }
  }

  // -----------------------------------------------------------------------
  // Record interaction from pipeline
  // -----------------------------------------------------------------------

  recordInteraction(intent: UkiIntent, result: UkiResult): void {
    const now = Date.now();

    // Record command node
    const cmdId = `cmd:${intent.category}:${intent.action}`;
    this.upsertNode({
      id: cmdId,
      type: 'command',
      label: `${intent.action}`,
      color: '#4DD0E1',
      weight: 1,
      lastUsed: now,
      metadata: { category: intent.category },
    });

    // If intent targeted an app, boost that app node & create edge
    const appId = intent.entities.appId as string | undefined;
    if (appId) {
      const appNodeId = `app:${appId}`;
      this.boostNode(appNodeId, now);
      this.upsertEdge(cmdId, appNodeId, 'controls');
    }

    // If intent targeted a page, boost page node
    const pageId = intent.entities.pageId as string | undefined;
    if (pageId) {
      const pageNodeId = `page:${pageId}`;
      this.upsertNode({
        id: pageNodeId,
        type: 'page',
        label: pageId.charAt(0).toUpperCase() + pageId.slice(1),
        color: APP_COLORS[pageId] || '#64D2FF',
        weight: 1,
        lastUsed: now,
        metadata: {},
      });
      this.upsertEdge(cmdId, pageNodeId, 'navigates');
    }

    this.schedulePersist();
  }

  // -----------------------------------------------------------------------
  // Graph operations
  // -----------------------------------------------------------------------

  getNodes(): KnowledgeNode[] { return this.data.nodes; }
  getEdges(): KnowledgeEdge[] { return this.data.edges; }

  getSnapshot(): KnowledgeData {
    return { nodes: [...this.data.nodes], edges: [...this.data.edges] };
  }

  getTopNodes(n = 20): KnowledgeNode[] {
    return [...this.data.nodes].sort((a, b) => b.weight - a.weight).slice(0, n);
  }

  getRelated(nodeId: string): KnowledgeNode[] {
    const edgeTargets = new Set(
      this.data.edges
        .filter(e => e.source === nodeId || e.target === nodeId)
        .map(e => e.source === nodeId ? e.target : e.source),
    );
    return this.data.nodes.filter(n => edgeTargets.has(n.id));
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private rebuildIndexes(): void {
    this.nodeIndex.clear();
    this.edgeIndex.clear();
    for (const node of this.data.nodes) this.nodeIndex.set(node.id, node);
    for (const edge of this.data.edges) this.edgeIndex.set(this.edgeKey(edge.source, edge.target, edge.relation), edge);
  }

  private edgeKey(source: string, target: string, relation: string): string {
    return `${source}::${target}::${relation}`;
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 150);
  }

  private upsertNode(node: KnowledgeNode): void {
    const existing = this.nodeIndex.get(node.id);
    if (existing) {
      existing.weight += node.weight;
      existing.lastUsed = node.lastUsed;
    } else {
      if (this.data.nodes.length >= MAX_NODES) {
        // Evict lowest weight
        this.data.nodes.sort((a, b) => b.weight - a.weight);
        const evicted = this.data.nodes.pop();
        if (evicted) this.nodeIndex.delete(evicted.id);
      }
      this.data.nodes.push(node);
      this.nodeIndex.set(node.id, node);
    }
  }

  private boostNode(id: string, now: number): void {
    const node = this.nodeIndex.get(id);
    if (node) {
      node.weight++;
      node.lastUsed = now;
    }
  }

  private upsertEdge(source: string, target: string, relation: string): void {
    const key = this.edgeKey(source, target, relation);
    const existing = this.edgeIndex.get(key);
    if (existing) {
      existing.weight++;
    } else {
      if (this.data.edges.length >= MAX_EDGES) {
        this.data.edges.sort((a, b) => b.weight - a.weight);
        const evicted = this.data.edges.pop();
        if (evicted) this.edgeIndex.delete(this.edgeKey(evicted.source, evicted.target, evicted.relation));
      }
      const edge = { source, target, relation, weight: 1 };
      this.data.edges.push(edge);
      this.edgeIndex.set(key, edge);
    }
  }

  private persist(): void {
    try {
      this.store.set('ukiKnowledge', this.data);
    } catch { /* ignore */ }
  }
}

export const UkiKnowledgeGraph = UkiKnowledgeGraphImpl;
