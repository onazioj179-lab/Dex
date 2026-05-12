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
export * as ukiMemory from './memory';
export * as ukiContext from './context';
export * as ukiPermissions from './permissions';
export * as ukiIndex from './index_search';
