// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * UKI foundation barrel — single import point.
 *
 *   import { buildSystemPrompt, getAppKnowledge, lookupWikipedia } from '../uki';
 */

export * from './identity';
export * from './knowledge';
export * from './schemas';
export * as ukiCache from './cache';
export * as ukiFreeApis from './freeApis';
export * as ukiAnswerEngine from './answerEngine';
export * as ukiMemory from './memory';
export * as ukiContext from './context';
export * as ukiOperator from './operator';
export * as ukiPermissions from './permissions';
export * as ukiIndex from './index_search';
