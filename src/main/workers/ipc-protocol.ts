// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX -- Shared IPC Protocol Types for Worker Threads
// ==========================================================================
// Strict schema for all inter-thread message passing.
// Imported by every worker and the main ThreadOrchestrator.
// ==========================================================================

export interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

export interface ThreadResponse {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
  error?: string;
}

export type ThreadName =
  | 'rewind-logger'
  | 'learning-engine'
  | 'analytics'
  | 'file-transfer'
  | 'database-write'
  | 'thumbnail'
  | 'task-queue'
  | 'security'
  | 'plugin-executor'
  | 'creative-processing';

export const MAX_IPC_MESSAGE_BYTES = 1_048_576; // 1 MB

export const THREAD_RATE_LIMITS: Record<ThreadName, number> = {
  'rewind-logger': 500,
  'learning-engine': 100,
  'analytics': 200,
  'file-transfer': 100,
  'database-write': 1000,
  'thumbnail': 50,
  'task-queue': 200,
  'security': 200,
  'plugin-executor': 300,
  'creative-processing': 100,  // Heavy compute tasks - limit to prevent overload
};

let _idCounter = 0;

export function createRequestId(): string {
  _idCounter = (_idCounter + 1) & 0x7fffffff;
  return `${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}

export function buildMessage(type: string, payload: any): ThreadMessage {
  return {
    type,
    payload,
    requestId: createRequestId(),
    timestamp: Date.now(),
  };
}

export function buildResponse(msg: ThreadMessage, payload: any, error?: string): ThreadResponse {
  return {
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  };
}

export function validateMessageSize(msg: ThreadMessage): boolean {
  try {
    const size = Buffer.byteLength(JSON.stringify(msg), 'utf8');
    return size <= MAX_IPC_MESSAGE_BYTES;
  } catch {
    return false;
  }
}
