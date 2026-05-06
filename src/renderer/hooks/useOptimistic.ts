// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - Optimistic UI Hooks
// Phase C: Optimistic UI (Items 101-120)
// Update UI immediately, sync in background, revert only on failure
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useOptimistic - Update UI immediately, sync in background
 * 
 * Pattern: Show success state before server confirms, revert only on actual failure
 * Used by: iOS, Figma, Linear, Superhuman
 */

// ---------------------------------------------------------------------------
// 101-110. Optimistic State Hook
// ---------------------------------------------------------------------------

interface OptimisticState<T> {
  data: T;
  isPending: boolean;
  error: Error | null;
  isStale: boolean;
}

interface OptimisticOptions<T> {
  /** Function to sync with server/storage */
  sync?: (newValue: T) => Promise<T>;
  /** Called on sync error */
  onError?: (error: Error, rollback: () => void) => void;
  /** Called on sync success */
  onSuccess?: (result: T) => void;
  /** Debounce sync calls (ms) */
  debounce?: number;
  /** Show pending state after delay (ms) */
  pendingDelay?: number;
}

export function useOptimistic<T>(
  initialValue: T,
  options: OptimisticOptions<T> = {}
): [
  OptimisticState<T>,
  (newValue: T | ((prev: T) => T)) => void,
  { reset: () => void; retry: () => void }
] {
  const { sync, onError, onSuccess, debounce = 0, pendingDelay = 100 } = options;

  const [state, setState] = useState<OptimisticState<T>>({
    data: initialValue,
    isPending: false,
    error: null,
    isStale: false,
  });

  const previousValue = useRef<T>(initialValue);
  const syncTimeout = useRef<number | null>(null);
  const pendingTimeout = useRef<number | null>(null);
  const syncInProgress = useRef(false);
  const latestValue = useRef<T>(initialValue);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
      if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
    };
  }, []);

  const update = useCallback((newValue: T | ((prev: T) => T)) => {
    const resolvedValue = typeof newValue === 'function' 
      ? (newValue as (prev: T) => T)(state.data)
      : newValue;

    // Save previous value for rollback
    previousValue.current = state.data;
    latestValue.current = resolvedValue;

    // Update UI immediately (optimistic)
    setState(prev => ({
      ...prev,
      data: resolvedValue,
      error: null,
      isStale: true,
    }));

    // Clear any pending sync
    if (syncTimeout.current) {
      clearTimeout(syncTimeout.current);
    }

    // Show pending indicator after delay (avoid flash for fast syncs)
    if (pendingTimeout.current) {
      clearTimeout(pendingTimeout.current);
    }
    
    pendingTimeout.current = window.setTimeout(() => {
      if (syncInProgress.current) {
        setState(prev => ({ ...prev, isPending: true }));
      }
    }, pendingDelay);

    // Sync to server/storage with optional debounce
    if (sync) {
      syncTimeout.current = window.setTimeout(async () => {
        syncInProgress.current = true;

        try {
          const result = await sync(latestValue.current);
          
          // Only update if this is still the latest value
          if (latestValue.current === resolvedValue) {
            setState(prev => ({
              ...prev,
              data: result,
              isPending: false,
              isStale: false,
            }));
            onSuccess?.(result);
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          
          // Provide rollback function
          const rollback = () => {
            setState(prev => ({
              ...prev,
              data: previousValue.current,
              isPending: false,
              error: null,
              isStale: false,
            }));
          };

          setState(prev => ({
            ...prev,
            isPending: false,
            error: err,
          }));

          if (onError) {
            onError(err, rollback);
          } else {
            // Auto rollback if no error handler
            rollback();
          }
        } finally {
          syncInProgress.current = false;
          if (pendingTimeout.current) {
            clearTimeout(pendingTimeout.current);
          }
        }
      }, debounce);
    }
  }, [state.data, sync, onError, onSuccess, debounce, pendingDelay]);

  const reset = useCallback(() => {
    setState({
      data: initialValue,
      isPending: false,
      error: null,
      isStale: false,
    });
    previousValue.current = initialValue;
    latestValue.current = initialValue;
  }, [initialValue]);

  const retry = useCallback(() => {
    if (sync && state.error) {
      update(state.data);
    }
  }, [sync, state.error, state.data, update]);

  return [state, update, { reset, retry }];
}

// ---------------------------------------------------------------------------
// 111-115. Optimistic Toggle Hook
// ---------------------------------------------------------------------------

export function useOptimisticToggle(
  initialValue: boolean,
  sync?: (value: boolean) => Promise<boolean>
): [boolean, () => void, boolean] {
  const [state, update] = useOptimistic(initialValue, { sync });
  
  const toggle = useCallback(() => {
    update(prev => !prev);
  }, [update]);

  return [state.data, toggle, state.isPending];
}

// ---------------------------------------------------------------------------
// 116-120. Optimistic List Hook
// ---------------------------------------------------------------------------

interface OptimisticListOptions<T> {
  getId: (item: T) => string | number;
  sync?: {
    add?: (item: T) => Promise<T>;
    remove?: (id: string | number) => Promise<void>;
    update?: (item: T) => Promise<T>;
    reorder?: (items: T[]) => Promise<T[]>;
  };
}

export function useOptimisticList<T>(
  initialItems: T[],
  options: OptimisticListOptions<T>
): {
  items: T[];
  add: (item: T) => void;
  remove: (id: string | number) => void;
  update: (id: string | number, changes: Partial<T>) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  isPending: boolean;
} {
  const { getId, sync } = options;
  const [items, setItems] = useState(initialItems);
  const [isPending, setIsPending] = useState(false);

  const add = useCallback((item: T) => {
    // Optimistic add
    setItems(prev => [...prev, item]);

    // Sync in background
    if (sync?.add) {
      setIsPending(true);
      sync.add(item)
        .then(result => {
          setItems(prev => prev.map(i => getId(i) === getId(item) ? result : i));
        })
        .catch(() => {
          // Rollback
          setItems(prev => prev.filter(i => getId(i) !== getId(item)));
        })
        .finally(() => setIsPending(false));
    }
  }, [getId, sync]);

  const remove = useCallback((id: string | number) => {
    // Save for rollback
    const removedItem = items.find(i => getId(i) === id);
    const originalIndex = items.findIndex(i => getId(i) === id);

    // Optimistic remove
    setItems(prev => prev.filter(i => getId(i) !== id));

    // Sync in background
    if (sync?.remove && removedItem) {
      setIsPending(true);
      sync.remove(id)
        .catch(() => {
          // Rollback
          setItems(prev => {
            const newItems = [...prev];
            newItems.splice(originalIndex, 0, removedItem);
            return newItems;
          });
        })
        .finally(() => setIsPending(false));
    }
  }, [items, getId, sync]);

  const update = useCallback((id: string | number, changes: Partial<T>) => {
    // Save original for rollback
    const original = items.find(i => getId(i) === id);

    // Optimistic update
    setItems(prev => prev.map(i => 
      getId(i) === id ? { ...i, ...changes } : i
    ));

    // Sync in background
    if (sync?.update && original) {
      const updated = { ...original, ...changes };
      setIsPending(true);
      sync.update(updated)
        .then(result => {
          setItems(prev => prev.map(i => getId(i) === id ? result : i));
        })
        .catch(() => {
          // Rollback
          setItems(prev => prev.map(i => getId(i) === id ? original : i));
        })
        .finally(() => setIsPending(false));
    }
  }, [items, getId, sync]);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    // Save original for rollback
    const original = [...items];

    // Optimistic reorder
    setItems(prev => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });

    // Sync in background
    if (sync?.reorder) {
      const newItems = [...items];
      const [removed] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, removed);
      
      setIsPending(true);
      sync.reorder(newItems)
        .catch(() => {
          // Rollback
          setItems(original);
        })
        .finally(() => setIsPending(false));
    }
  }, [items, sync]);

  return { items, add, remove, update, reorder, isPending };
}

// ---------------------------------------------------------------------------
// Export all hooks
// ---------------------------------------------------------------------------

export default useOptimistic;
