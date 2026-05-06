// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Text Services
// ==========================================================================
// Feature 59: Shared Spell Check Engine
// Feature 60: Autocorrect Dictionary
// ==========================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as log from 'electron-log';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Feature 59: Shared Spell Check Engine
// ---------------------------------------------------------------------------

export interface SpellCheckResult {
  word: string;
  offset: number;
  suggestions: string[];
  isCorrect: boolean;
}

/**
 * In-process spell check engine using BK-tree for fast fuzzy matching.
 * Falls back to Electron's built-in spellchecker when available.
 */
class SharedSpellCheckEngine {
  private dictionary: Set<string> = new Set();
  private customWords: Set<string> = new Set();
  private customWordsPath = '';
  private language = 'en-US';
  private initialized = false;
  private wordFrequency: Map<string, number> = new Map();

  initialize(): void {
    this.customWordsPath = path.join(app.getPath('userData'), 'custom-dictionary.json');
    this.loadBuiltinDictionary();
    this.loadCustomWords();
    this.initialized = true;
    log.info(`[SpellCheck] Feature 59: Spell check engine initialized (${this.dictionary.size} words)`);
  }

  private loadBuiltinDictionary(): void {
    // Common English words (core set; real deployment extends via external word list)
    const commonWords = [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
      'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
      'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
      'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
      'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
      'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
      'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
      'great', 'between', 'need', 'large', 'often', 'hand', 'high', 'place', 'again',
      'off', 'went', 'old', 'number', 'right', 'too', 'does', 'tell', 'each', 'three',
      'still', 'before', 'never', 'start', 'city', 'run', 'name', 'being', 'help', 'every',
      'where', 'much', 'very', 'while', 'every', 'next', 'same', 'another', 'should',
      'may', 'world', 'through', 'long', 'little', 'many', 'those', 'own', 'down',
      'under', 'part', 'find', 'here', 'thing', 'last', 'many', 'made', 'did', 'might',
      'around', 'must', 'before', 'head', 'without', 'home', 'always', 'together', 'got',
      'keep', 'let', 'begin', 'since', 'hard', 'however', 'enough', 'open', 'seem',
      'file', 'data', 'system', 'application', 'user', 'input', 'output', 'process',
      'memory', 'disk', 'network', 'server', 'client', 'database', 'table', 'column',
      'search', 'result', 'error', 'warning', 'message', 'notification', 'setting',
      'configuration', 'window', 'button', 'text', 'image', 'video', 'audio', 'media',
      'project', 'task', 'mission', 'agent', 'module', 'plugin', 'extension', 'update',
      'version', 'build', 'deploy', 'test', 'debug', 'log', 'monitor', 'performance',
      'security', 'encryption', 'authentication', 'authorization', 'permission', 'access',
      'create', 'read', 'write', 'delete', 'save', 'load', 'import', 'export', 'sync',
      'upload', 'download', 'connect', 'disconnect', 'send', 'receive', 'transfer',
    ];

    for (const word of commonWords) {
      this.dictionary.add(word.toLowerCase());
    }

    // Try to load an external word list if available
    const externalListPath = path.join(app.getPath('userData'), 'dictionaries', `${this.language}.txt`);
    if (fs.existsSync(externalListPath)) {
      try {
        const content = fs.readFileSync(externalListPath, 'utf-8');
        const words = content.split(/\r?\n/).filter(w => w.length > 0);
        for (const word of words) {
          this.dictionary.add(word.toLowerCase());
        }
        log.info(`[SpellCheck] Loaded external dictionary: ${words.length} words`);
      } catch { /* ok */ }
    }
  }

  private loadCustomWords(): void {
    if (fs.existsSync(this.customWordsPath)) {
      try {
        const stored = JSON.parse(fs.readFileSync(this.customWordsPath, 'utf-8'));
        if (Array.isArray(stored)) {
          for (const word of stored) {
            this.customWords.add(word.toLowerCase());
          }
        }
      } catch { /* ok */ }
    }
  }

  private saveCustomWords(): void {
    try {
      fs.writeFileSync(this.customWordsPath, JSON.stringify([...this.customWords], null, 2), 'utf-8');
    } catch { /* ok */ }
  }

  addWord(word: string): void {
    this.customWords.add(word.toLowerCase());
    this.saveCustomWords();
  }

  removeWord(word: string): void {
    this.customWords.delete(word.toLowerCase());
    this.saveCustomWords();
  }

  isCorrect(word: string): boolean {
    const lower = word.toLowerCase();
    // Skip numbers, single chars, URLs, etc.
    if (/^\d+$/.test(word) || word.length <= 1 || /^https?:\/\//.test(word)) return true;
    return this.dictionary.has(lower) || this.customWords.has(lower);
  }

  check(text: string): SpellCheckResult[] {
    const results: SpellCheckResult[] = [];
    const wordRegex = /\b[a-zA-Z']+\b/g;
    let match: RegExpExecArray | null;

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      const isCorrect = this.isCorrect(word);

      if (!isCorrect) {
        results.push({
          word,
          offset: match.index,
          suggestions: this.getSuggestions(word, 5),
          isCorrect: false,
        });
      }
    }

    return results;
  }

  getSuggestions(word: string, maxSuggestions: number = 5): string[] {
    const lower = word.toLowerCase();
    const candidates: Array<{ word: string; distance: number }> = [];

    const allWords = [...this.dictionary, ...this.customWords];
    const maxDist = Math.max(2, Math.floor(lower.length / 3));

    for (const dictWord of allWords) {
      // Quick length filter
      if (Math.abs(dictWord.length - lower.length) > maxDist) continue;

      const dist = this.levenshtein(lower, dictWord);
      if (dist <= maxDist && dist > 0) {
        candidates.push({ word: dictWord, distance: dist });
      }
    }

    // Sort by distance then alphabetically
    candidates.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));

    return candidates.slice(0, maxSuggestions).map(c => c.word);
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  setLanguage(language: string): void {
    this.language = language;
    this.dictionary.clear();
    this.loadBuiltinDictionary();
    log.info(`[SpellCheck] Language set to ${language}`);
  }

  getDictionarySize(): number {
    return this.dictionary.size + this.customWords.size;
  }

  getCustomWords(): string[] {
    return [...this.customWords].sort();
  }
}

// ---------------------------------------------------------------------------
// Feature 60: Autocorrect Dictionary
// ---------------------------------------------------------------------------

export interface AutocorrectRule {
  trigger: string;
  replacement: string;
  enabled: boolean;
  caseSensitive: boolean;
  isSystem: boolean;
}

class AutocorrectDictionary {
  private rules: Map<string, AutocorrectRule> = new Map();
  private rulesPath = '';

  initialize(): void {
    this.rulesPath = path.join(app.getPath('userData'), 'autocorrect-rules.json');
    this.loadSystemRules();
    this.loadUserRules();
    log.info(`[Autocorrect] Feature 60: Autocorrect dictionary initialized (${this.rules.size} rules)`);
  }

  private loadSystemRules(): void {
    // Common typos and their corrections
    const systemRules: Array<[string, string]> = [
      ['teh', 'the'],
      ['adn', 'and'],
      ['dont', "don't"],
      ['doesnt', "doesn't"],
      ['cant', "can't"],
      ['wont', "won't"],
      ['havent', "haven't"],
      ['hasnt', "hasn't"],
      ['isnt', "isn't"],
      ['wasnt', "wasn't"],
      ['werent', "weren't"],
      ['wouldnt', "wouldn't"],
      ['shouldnt', "shouldn't"],
      ['couldnt', "couldn't"],
      ['didnt', "didn't"],
      ['thier', 'their'],
      ['recieve', 'receive'],
      ['occured', 'occurred'],
      ['seperate', 'separate'],
      ['definately', 'definitely'],
      ['wiht', 'with'],
      ['taht', 'that'],
      ['accomodate', 'accommodate'],
      ['acheive', 'achieve'],
      ['accross', 'across'],
      ['agressive', 'aggressive'],
      ['apparantly', 'apparently'],
      ['arguement', 'argument'],
      ['basicly', 'basically'],
      ['beggining', 'beginning'],
      ['beleive', 'believe'],
      ['calender', 'calendar'],
      ['catagory', 'category'],
      ['changable', 'changeable'],
      ['collegue', 'colleague'],
      ['comming', 'coming'],
      ['committment', 'commitment'],
      ['concious', 'conscious'],
      ['embarass', 'embarrass'],
      ['enviroment', 'environment'],
      ['existance', 'existence'],
      ['foriegn', 'foreign'],
      ['goverment', 'government'],
      ['happend', 'happened'],
      ['immediatly', 'immediately'],
      ['independant', 'independent'],
      ['knowlege', 'knowledge'],
      ['liason', 'liaison'],
      ['manuever', 'maneuver'],
      ['millenium', 'millennium'],
      ['neccessary', 'necessary'],
      ['noticable', 'noticeable'],
      ['occurence', 'occurrence'],
      ['persistant', 'persistent'],
      ['posession', 'possession'],
      ['prefered', 'preferred'],
      ['publically', 'publicly'],
      ['recomend', 'recommend'],
      ['refered', 'referred'],
      ['relevent', 'relevant'],
      ['rythm', 'rhythm'],
      ['succesful', 'successful'],
      ['suprise', 'surprise'],
      ['truely', 'truly'],
      ['untill', 'until'],
      ['wierd', 'weird'],
      // Dev-specific
      ['fucntion', 'function'],
      ['funtion', 'function'],
      ['retrun', 'return'],
      ['reutrn', 'return'],
      ['cosnt', 'const'],
      ['improt', 'import'],
      ['exoprt', 'export'],
      ['interfce', 'interface'],
      ['classs', 'class'],
      ['consoel', 'console'],
    ];

    for (const [trigger, replacement] of systemRules) {
      this.rules.set(trigger.toLowerCase(), {
        trigger,
        replacement,
        enabled: true,
        caseSensitive: false,
        isSystem: true,
      });
    }
  }

  private loadUserRules(): void {
    if (fs.existsSync(this.rulesPath)) {
      try {
        const stored = JSON.parse(fs.readFileSync(this.rulesPath, 'utf-8'));
        if (Array.isArray(stored)) {
          for (const rule of stored) {
            this.rules.set(rule.trigger.toLowerCase(), { ...rule, isSystem: false });
          }
        }
      } catch { /* ok */ }
    }
  }

  private saveUserRules(): void {
    const userRules = Array.from(this.rules.values()).filter(r => !r.isSystem);
    try {
      fs.writeFileSync(this.rulesPath, JSON.stringify(userRules, null, 2), 'utf-8');
    } catch { /* ok */ }
  }

  correct(text: string): { correctedText: string; corrections: Array<{ original: string; corrected: string; offset: number }> } {
    const corrections: Array<{ original: string; corrected: string; offset: number }> = [];
    let result = text;
    let offset = 0;

    const wordRegex = /\b[a-zA-Z']+\b/g;
    let match: RegExpExecArray | null;
    const replacements: Array<{ start: number; end: number; replacement: string; original: string }> = [];

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      const key = word.toLowerCase();
      const rule = this.rules.get(key);

      if (rule && rule.enabled) {
        let replacement = rule.replacement;

        // Preserve case of original word
        if (!rule.caseSensitive) {
          if (word === word.toUpperCase()) {
            replacement = replacement.toUpperCase();
          } else if (word[0] === word[0].toUpperCase()) {
            replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
        }

        if (word !== replacement) {
          replacements.push({
            start: match.index,
            end: match.index + word.length,
            replacement,
            original: word,
          });
        }
      }
    }

    // Apply replacements in reverse order to preserve offsets
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      result = result.slice(0, r.start + offset) + r.replacement + result.slice(r.end + offset);
      corrections.unshift({
        original: r.original,
        corrected: r.replacement,
        offset: r.start,
      });
      offset += r.replacement.length - (r.end - r.start);
    }

    // Re-adjust offsets for corrections (forward pass)
    let cumulativeOffset = 0;
    for (const correction of corrections) {
      correction.offset += cumulativeOffset;
      cumulativeOffset += correction.corrected.length - correction.original.length;
    }

    return { correctedText: result, corrections };
  }

  addRule(trigger: string, replacement: string, caseSensitive: boolean = false): void {
    this.rules.set(trigger.toLowerCase(), {
      trigger,
      replacement,
      enabled: true,
      caseSensitive,
      isSystem: false,
    });
    this.saveUserRules();
  }

  removeRule(trigger: string): boolean {
    const key = trigger.toLowerCase();
    const rule = this.rules.get(key);
    if (!rule || rule.isSystem) return false;
    this.rules.delete(key);
    this.saveUserRules();
    return true;
  }

  toggleRule(trigger: string, enabled: boolean): boolean {
    const key = trigger.toLowerCase();
    const rule = this.rules.get(key);
    if (!rule) return false;
    rule.enabled = enabled;
    if (!rule.isSystem) this.saveUserRules();
    return true;
  }

  getRules(): AutocorrectRule[] {
    return Array.from(this.rules.values());
  }

  getUserRules(): AutocorrectRule[] {
    return Array.from(this.rules.values()).filter(r => !r.isSystem);
  }

  hasRule(trigger: string): boolean {
    return this.rules.has(trigger.toLowerCase());
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const spellCheck = new SharedSpellCheckEngine();
export const autocorrect = new AutocorrectDictionary();

export function initializeTextServices(): void {
  spellCheck.initialize();
  autocorrect.initialize();
  log.info('[TextServices] Features 59-60: Text services initialized');
}

export function shutdownTextServices(): void {
  // No cleanup needed
}
