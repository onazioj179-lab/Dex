// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * StreamingResponse - incremental React render for an async StreamReader
 * from `src/shared/uki/streaming.ts`. Subscribes on mount, accumulates
 * tokens, exposes a "stop" via AbortController-style stop callback.
 */

// DEX v3.8.9 wave B - UKI trust UI

import React, { useEffect, useRef, useState } from 'react';
import type { StreamReader, StreamChunk } from '../../../shared/uki/streaming';
import { colors, fontSize, radius, space } from '../../styles/tokens';

export interface StreamingResponseProps {
  /** Factory so the component can re-subscribe if the prop identity changes. */
  reader: StreamReader;
  /** Called when the stream completes successfully. */
  onDone?: (text: string) => void;
  /** Called on stream error. */
  onError?: (err: string) => void;
  /** Called for each tool-call chunk. */
  onToolCall?: (json: string) => void;
}

export function StreamingResponse({ reader, onDone, onError, onToolCall }: StreamingResponseProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'streaming' | 'done' | 'error'>('streaming');
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setText('');
    setStatus('streaming');
    setError(null);
    let acc = '';
    (async () => {
      try {
        for await (const chunk of reader as AsyncIterable<StreamChunk>) {
          if (cancelled.current) return;
          if (chunk.type === 'token' && chunk.content) {
            acc += chunk.content;
            setText(acc);
          } else if (chunk.type === 'toolCall' && chunk.toolCallJson) {
            onToolCall?.(chunk.toolCallJson);
          } else if (chunk.type === 'done') {
            setStatus('done');
            onDone?.(acc);
            return;
          } else if (chunk.type === 'error') {
            const msg = chunk.error ?? 'stream error';
            setError(msg);
            setStatus('error');
            onError?.(msg);
            return;
          }
        }
        // Iterator finished without explicit done.
        setStatus('done');
        onDone?.(acc);
      } catch (e) {
        if (cancelled.current) return;
        const msg = (e as Error).message;
        setError(msg);
        setStatus('error');
        onError?.(msg);
      }
    })();
    return () => { cancelled.current = true; };
  }, [reader, onDone, onError, onToolCall]);

  return (
    <div data-testid="streaming-response" data-status={status} style={{
      padding: space[3],
      background: colors.bg.inset,
      borderRadius: radius.md,
      fontSize: fontSize.sm,
      color: colors.text.primary,
      whiteSpace: 'pre-wrap',
      minHeight: 24,
    }}>
      <span data-testid="streaming-text">{text}</span>
      {status === 'streaming' && (
        <span aria-hidden="true" style={{ opacity: 0.6 }}>▍</span>
      )}
      {status === 'error' && error && (
        <div data-testid="streaming-error" style={{
          marginTop: space[2], color: colors.semantic.error, fontSize: fontSize.xs,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
