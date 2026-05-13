// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Case conversion helpers: kebab, camel, snake, pascal, title.
 * Operate on ASCII-leaning strings; non-letter/digit chars become separators.
 */

function splitWords(input: string): string[] {
  const replaced = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return replaced
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

export function kebabCase(input: string): string {
  return splitWords(input).join('-');
}

export function snakeCase(input: string): string {
  return splitWords(input).join('_');
}

export function camelCase(input: string): string {
  const words = splitWords(input);
  if (words.length === 0) return '';
  return words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

export function pascalCase(input: string): string {
  return splitWords(input).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

export function titleCase(input: string): string {
  return splitWords(input).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function constantCase(input: string): string {
  return splitWords(input).join('_').toUpperCase();
}
