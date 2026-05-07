// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Prompt template engine.
 *
 * `{{name}}` substitution. Missing variables raise an error so we never
 * ship a half-rendered prompt to the model. Variables are escaped to
 * avoid prompt-injection by way of nested braces.
 */

// DEX v3.8.9 - prompt templates

export interface PromptTemplate {
  id: string;
  body: string;
  required: string[];
}

export class PromptVariableMissingError extends Error {
  constructor(public readonly variable: string, public readonly templateId: string) {
    super(`Prompt variable "${variable}" missing in template "${templateId}"`);
    this.name = 'PromptVariableMissingError';
  }
}

export function renderPrompt(tmpl: PromptTemplate, vars: Record<string, string>): string {
  // Validate required keys first.
  for (const key of tmpl.required) {
    if (!(key in vars)) throw new PromptVariableMissingError(key, tmpl.id);
  }
  return tmpl.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, name: string) => {
    if (!(name in vars)) throw new PromptVariableMissingError(name, tmpl.id);
    return sanitiseVar(vars[name]);
  });
}

/** Trim and strip control chars; preserve newlines. */
function sanitiseVar(value: string): string {
  return (value ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');
}

/** Pre-baked safe templates used by the assistant. */
export const STANDARD_TEMPLATES: Record<string, PromptTemplate> = {
  summarise: {
    id: 'summarise',
    body: 'Summarise the following text in {{maxSentences}} sentences:\n\n{{text}}',
    required: ['maxSentences', 'text'],
  },
  rewrite_tone: {
    id: 'rewrite_tone',
    body: 'Rewrite this in a {{tone}} tone, preserving meaning:\n\n{{text}}',
    required: ['tone', 'text'],
  },
  bullet_points: {
    id: 'bullet_points',
    body: 'Convert this to {{count}} concise bullet points:\n\n{{text}}',
    required: ['count', 'text'],
  },
};
