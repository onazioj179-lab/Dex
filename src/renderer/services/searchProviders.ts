// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Concrete SearchProviders for the unified SearchOrchestrator.
 * -----------------------------------------------------------------------------
 * The orchestrator (shared/search/SearchOrchestrator.ts) is the facade; it only
 * does anything once providers are registered. This wires the obvious renderer
 * sources into it — apps, workflow templates, and the command registry — so one
 * query ("research", "prism", "new note") returns apps + workflows + commands
 * ranked together. Spotlight / the command palette can consume `createUnifiedSearch()`.
 */

import {
  SearchOrchestrator,
  type SearchProvider,
  type SearchResult,
  type SearchQuery,
} from '../../shared/search/SearchOrchestrator';
import { fuzzyMatch, searchCommands, type CommandRegistry } from '../../shared/commands/registry';
import { APP_DEFINITIONS } from '../store/runningApps';
import { WORKFLOW_TEMPLATES } from './workflowTemplates';
import { AssetLibrary } from './AssetLibrary';
import { createCalcProvider } from './calcProvider';

const HIDDEN_APP_IDS = new Set(['home']);

/** Apps from the canonical APP_DEFINITIONS registry. */
export function createAppSearchProvider(): SearchProvider {
  return {
    id: 'apps',
    kinds: ['app'],
    weight: 1.1, // nudge exact app launches above generic actions
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const q = query.text.trim();
      const out: SearchResult[] = [];
      for (const [id, def] of Object.entries(APP_DEFINITIONS) as [string, { name: string; icon?: string }][]) {
        if (HIDDEN_APP_IDS.has(id)) continue;
        const score = fuzzyMatch(`${def.name} ${id}`, q);
        if (score > 0) {
          out.push({
            id,
            title: def.name,
            subtitle: 'App',
            kind: 'app',
            source: 'apps',
            rawScore: score,
            score: 0,
            payload: { appId: id },
            iconHint: def.icon,
            producedAt: Date.now(),
          });
        }
      }
      return out.sort((a, b) => b.rawScore - a.rawScore).slice(0, query.limit ?? 10);
    },
  };
}

/** Workflow templates as launchable actions. */
export function createWorkflowSearchProvider(): SearchProvider {
  return {
    id: 'workflows',
    kinds: ['action'],
    weight: 1.0,
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const q = query.text.trim();
      const out: SearchResult[] = [];
      for (const t of WORKFLOW_TEMPLATES) {
        const hay = `${t.name} ${t.description} ${t.tags.join(' ')} workspace workflow`;
        const score = fuzzyMatch(hay, q);
        if (score > 0) {
          out.push({
            id: t.id,
            title: t.name,
            subtitle: 'Workflow',
            kind: 'action',
            source: 'workflows',
            rawScore: score,
            score: 0,
            payload: { workflowId: t.id },
            producedAt: Date.now(),
          });
        }
      }
      return out.sort((a, b) => b.rawScore - a.rawScore).slice(0, query.limit ?? 10);
    },
  };
}

/** Assets from the universal AssetLibrary (brushes, palettes, notes, files…). */
export function createAssetSearchProvider(): SearchProvider {
  return {
    id: 'assets',
    kinds: ['asset'],
    weight: 0.95,
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const matches = AssetLibrary.search(query.text, { limit: query.limit ?? 10 });
      return matches.map((a, i) => ({
        id: a.id,
        title: a.name,
        subtitle: a.kind,
        kind: 'asset' as const,
        source: 'assets',
        // AssetLibrary.search already ranks; preserve order as a descending score.
        rawScore: matches.length - i,
        score: 0,
        payload: { assetId: a.id, assetKind: a.kind },
        iconHint: a.thumbnail ? undefined : 'colorpicker',
        producedAt: Date.now(),
      }));
    },
  };
}

/** Commands from a (live) CommandRegistry. */
export function createCommandSearchProvider(getRegistry: () => CommandRegistry): SearchProvider {
  return {
    id: 'commands',
    kinds: ['command'],
    weight: 1.0,
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const results = searchCommands(getRegistry(), query.text, query.limit ?? 10);
      return results.map((r) => ({
        id: r.command.id,
        title: r.command.label,
        subtitle: r.command.group ?? 'Command',
        kind: 'command' as const,
        source: 'commands',
        rawScore: r.score,
        score: 0,
        payload: { commandId: r.command.id },
        producedAt: Date.now(),
      }));
    },
  };
}

export interface UnifiedSearchOptions {
  /** Optional live command registry to include command results. */
  commandRegistry?: () => CommandRegistry;
  /** Forwarded to the orchestrator. */
  maxResults?: number;
}

/**
 * Build a ready-to-use unified search over apps + workflows (+ commands when a
 * registry is supplied). One import for any surface that wants global search.
 */
export function createUnifiedSearch(opts: UnifiedSearchOptions = {}): SearchOrchestrator {
  const orch = new SearchOrchestrator({ maxResults: opts.maxResults });
  orch.register(createAppSearchProvider());
  orch.register(createWorkflowSearchProvider());
  orch.register(createAssetSearchProvider());
  orch.register(createCalcProvider());
  if (opts.commandRegistry) orch.register(createCommandSearchProvider(opts.commandRegistry));
  return orch;
}
