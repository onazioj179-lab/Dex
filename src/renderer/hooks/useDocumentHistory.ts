/**
 * DEX Platform
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Created by Onazi Treasure OJ <onazi75@gmail.com>
 * Licensed under the DEX Software License Agreement v1.0. See LICENSE.
 */
import { useCallback, useReducer } from 'react';

interface History<T> { past: T[]; present: T; future: T[]; grouping?: boolean; groupedEdit?: boolean }
type Action<T> = { type: 'edit'; value: React.SetStateAction<T> } | { type: 'undo' | 'redo' | 'begin' | 'end' };

export function documentHistoryReducer<T>(state: History<T>, action: Action<T>): History<T> {
  if (action.type === 'begin') return { ...state, grouping: true, groupedEdit: false };
  if (action.type === 'end') return { ...state, grouping: false, groupedEdit: false };
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  }
  if (!('value' in action)) return state;
  const next = typeof action.value === 'function' ? (action.value as (prev: T) => T)(state.present) : action.value;
  if (next === state.present) return state;
  return { past: state.grouping && state.groupedEdit ? state.past : [...state.past.slice(-39), state.present],
    present: next, future: [], grouping: state.grouping, groupedEdit: !!state.grouping };
}

export function useDocumentHistory<T>(initial: () => T) {
  const [history, dispatch] = useReducer(documentHistoryReducer<T>, undefined, () => ({ past: [], present: initial(), future: [] }));
  const setValue = useCallback((value: React.SetStateAction<T>) => dispatch({ type: 'edit', value }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const beginEdit = useCallback(() => dispatch({ type: 'begin' }), []);
  const endEdit = useCallback(() => dispatch({ type: 'end' }), []);
  return { value: history.present, setValue, undo, redo, beginEdit, endEdit, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
