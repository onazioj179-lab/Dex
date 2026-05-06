// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useState, useCallback, DragEvent } from 'react';

export interface FileDropResult {
  name: string;
  path: string;
  type: string;
  size: number;
}

export function useFileDrop(acceptTypes: string[], onFiles: (files: FileDropResult[]) => void) {
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const accepted = files.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return acceptTypes.some(t => t === ext || t === f.type || f.type.startsWith(t.replace('*', '')));
    });
    if (accepted.length > 0) {
      onFiles(accepted.map(f => ({
        name: f.name,
        path: (f as any).path || f.name,
        type: f.type,
        size: f.size,
      })));
    }
  }, [acceptTypes, onFiles]);

  const dropProps = { onDragOver, onDragLeave, onDrop };
  const dropOverlayStyle: React.CSSProperties | null = isDragOver ? {
    position: 'absolute', inset: 0, zIndex: 9999,
    background: 'rgba(10,132,255,0.15)',
    border: '2px dashed rgba(10,132,255,0.6)',
    borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  } : null;

  return { isDragOver, dropProps, dropOverlayStyle };
}
