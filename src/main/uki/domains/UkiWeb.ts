// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - UKI Web Search Domain
// Handles web search queries -- opens browser or returns search results
// ===========================================================================

import { BrowserWindow, shell } from 'electron';
import type { UkiIntent, UkiResult } from '../UkiEngine';

// Search engine URL builder
function buildSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildDuckDuckGoUrl(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

export async function handle(intent: UkiIntent, win: BrowserWindow): Promise<UkiResult> {
  const query = (intent.entities?.query as string) || (intent.params?.query as string);
  if (!query || query.trim().length === 0) {
    return { success: false, response: "What would you like me to search for?" };
  }

  const action = intent.action || 'web-search';

  try {
    switch (action) {
      case 'web-search': {
        const searchUrl = buildSearchUrl(query);
        // Send search results to renderer for Nexus display
        win.webContents.send('uki:web-search-results', {
          query,
          url: searchUrl,
          timestamp: Date.now(),
        });
        // Also open in the internal browser app
        win.webContents.send('dex-spotlight-navigate', { appId: 'browser', url: searchUrl });
        return {
          success: true,
          response: `Searching the web for "${query}". Opening results now.`,
          data: { query, url: searchUrl, action: 'web-search' },
        };
      }

      case 'web-open': {
        // Open URL in system browser (validated)
        const url = (intent.entities?.url as string) || (intent.params?.url as string);
        if (url) {
          // Security: Only allow http/https protocols
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              return { success: false, response: `Cannot open URL with protocol: ${parsed.protocol}` };
            }
            await shell.openExternal(parsed.href);
            return { success: true, response: `Opening ${parsed.href}` };
          } catch {
            return { success: false, response: 'Invalid URL provided.' };
          }
        }
        return { success: false, response: "No URL provided." };
      }

      case 'web-define': {
        const defineUrl = `https://www.google.com/search?q=define+${encodeURIComponent(query)}`;
        win.webContents.send('uki:web-search-results', {
          query: `define ${query}`,
          url: defineUrl,
          timestamp: Date.now(),
        });
        win.webContents.send('dex-spotlight-navigate', { appId: 'browser', url: defineUrl });
        return {
          success: true,
          response: `Looking up the definition of "${query}".`,
          data: { query, url: defineUrl, action: 'web-define' },
        };
      }

      case 'web-news': {
        const newsUrl = `https://news.google.com/search?q=${encodeURIComponent(query)}`;
        win.webContents.send('uki:web-search-results', {
          query,
          url: newsUrl,
          timestamp: Date.now(),
        });
        return {
          success: true,
          response: `Searching news for "${query}".`,
          data: { query, url: newsUrl, action: 'web-news' },
        };
      }

      default:
        return { success: false, response: `Unknown web action: ${action}` };
    }
  } catch (error) {
    return { success: false, response: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}
