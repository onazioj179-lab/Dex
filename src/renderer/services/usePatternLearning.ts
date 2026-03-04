/**
 * DEX Pattern Learning Hook
 * Local-only usage pattern learning - runs in background
 * No UI, no toggles - just works silently
 */

import { useCallback, useEffect, useRef } from 'react';

// ==================== TYPES ====================

interface Suggestion {
  type: 'app' | 'tool' | 'action' | 'file';
  target: string;
  reason: 'time_pattern' | 'sequence' | 'frequent' | 'context';
  confidence: number;
  context?: string;
}

interface FrequentItem {
  id: string;
  count: number;
}

// ==================== PATTERN LEARNING HOOK ====================

export const usePatternLearning = () => {
  const appOpenTime = useRef<Map<string, number>>(new Map());

  // Record app open
  const recordAppOpen = useCallback((appId: string, context?: string) => {
    appOpenTime.current.set(appId, Date.now());
    window.electron?.invoke('patterns:recordAppOpen', appId, context).catch(() => {});
  }, []);

  // Record app close (with duration)
  const recordAppClose = useCallback((appId: string) => {
    const openTime = appOpenTime.current.get(appId);
    const duration = openTime ? Date.now() - openTime : undefined;
    appOpenTime.current.delete(appId);
    window.electron?.invoke('patterns:recordAppClose', appId, duration).catch(() => {});
  }, []);

  // Record file open
  const recordFileOpen = useCallback((filePath: string, appId?: string) => {
    window.electron?.invoke('patterns:recordFileOpen', filePath, appId).catch(() => {});
  }, []);

  // Record tool use
  const recordToolUse = useCallback((toolId: string, appId?: string) => {
    window.electron?.invoke('patterns:recordToolUse', toolId, appId).catch(() => {});
  }, []);

  // Record generic action
  const recordAction = useCallback((actionId: string, context?: string) => {
    window.electron?.invoke('patterns:recordAction', actionId, context).catch(() => {});
  }, []);

  // Get suggestions
  const getSuggestions = useCallback(async (context?: {
    currentApp?: string;
    fileExtension?: string;
    limit?: number;
  }): Promise<Suggestion[]> => {
    try {
      return await window.electron?.invoke('patterns:getSuggestions', context) || [];
    } catch {
      return [];
    }
  }, []);

  // Get frequently used items
  const getFrequentItems = useCallback(async (
    type?: 'app' | 'tool' | 'file',
    limit = 10
  ): Promise<FrequentItem[]> => {
    try {
      return await window.electron?.invoke('patterns:getFrequent', type, limit) || [];
    } catch {
      return [];
    }
  }, []);

  // Get recent items
  const getRecentItems = useCallback(async (limit = 10): Promise<string[]> => {
    try {
      return await window.electron?.invoke('patterns:getRecent', limit) || [];
    } catch {
      return [];
    }
  }, []);

  return {
    recordAppOpen,
    recordAppClose,
    recordFileOpen,
    recordToolUse,
    recordAction,
    getSuggestions,
    getFrequentItems,
    getRecentItems,
  };
};

// ==================== AUTO-TRACKING HOOK ====================

// Automatically track app usage when component mounts/unmounts
export const useAppTracking = (appId: string) => {
  const { recordAppOpen, recordAppClose } = usePatternLearning();

  useEffect(() => {
    recordAppOpen(appId);
    return () => {
      recordAppClose(appId);
    };
  }, [appId, recordAppOpen, recordAppClose]);
};

// ==================== TOOL TRACKING HOOK ====================

// Track tool usage within an app (e.g., brush, crop, effects)
export const useToolTracking = (appId: string) => {
  const { recordToolUse } = usePatternLearning();
  const lastTool = useRef<string | null>(null);

  const trackTool = useCallback((toolId: string) => {
    recordToolUse(toolId, appId);
    
    // Record tool combinations if we have a previous tool
    if (lastTool.current && lastTool.current !== toolId) {
      window.electron?.invoke('patterns:recordToolCombo', lastTool.current, toolId, appId).catch(() => {});
    }
    lastTool.current = toolId;
  }, [recordToolUse, appId]);

  return { trackTool };
};

// ==================== FILE TRACKING HOOK ====================

// Track file operations (open, save, etc.)
export const useFileTracking = (appId: string) => {
  const { recordFileOpen, recordAction } = usePatternLearning();

  const trackFileOpen = useCallback((filePath: string) => {
    recordFileOpen(filePath, appId);
  }, [recordFileOpen, appId]);

  const trackFileSave = useCallback((filePath: string) => {
    recordAction(`file_save:${filePath}`, appId);
  }, [recordAction, appId]);

  return { trackFileOpen, trackFileSave };
};

// ==================== EXPORTS ====================

export type { Suggestion, FrequentItem };
