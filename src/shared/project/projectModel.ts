// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Project-Centered model (GOAL-6D). A Project is the core unit: it bundles
 * references to notes/files/workflows/AI chats/screenshots/tasks/voice notes/
 * references — all connected, no folder hunting. Pure in-memory store with CRUD;
 * the renderer persists it. Testable.
 */

export type ProjectItemKind =
  | 'note' | 'file' | 'workflow' | 'aiChat'
  | 'screenshot' | 'task' | 'voiceNote' | 'reference';

export interface ProjectItem {
  kind: ProjectItemKind;
  ref: string;
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  items: ProjectItem[];
  createdAt: number;
}

export class ProjectStore {
  private projects = new Map<string, Project>();
  private now: () => number;
  private seq = 0;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  create(name: string): Project {
    const id = `proj_${++this.seq}`;
    const project: Project = { id, name, items: [], createdAt: this.now() };
    this.projects.set(id, project);
    return project;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  list(): Project[] {
    return [...this.projects.values()];
  }

  /** Add an item ref to a project (deduped by kind+ref). Returns false if no project. */
  addItem(projectId: string, kind: ProjectItemKind, ref: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    if (project.items.some((i) => i.kind === kind && i.ref === ref)) return true; // already linked
    project.items.push({ kind, ref, addedAt: this.now() });
    return true;
  }

  removeItem(projectId: string, kind: ProjectItemKind, ref: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const before = project.items.length;
    project.items = project.items.filter((i) => !(i.kind === kind && i.ref === ref));
    return project.items.length !== before;
  }

  /** All items of a project, optionally filtered by kind. */
  items(projectId: string, kind?: ProjectItemKind): ProjectItem[] {
    const project = this.projects.get(projectId);
    if (!project) return [];
    return kind ? project.items.filter((i) => i.kind === kind) : [...project.items];
  }

  delete(id: string): boolean {
    return this.projects.delete(id);
  }
}
