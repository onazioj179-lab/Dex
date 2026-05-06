// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DTP Transfer Notification Service
 * Allows inner apps (Gallery, Notes, Audio, Files, etc.) to subscribe to
 * transfer completion events so they can refresh or offer to import new files.
 */

type TransferCompletePayload = {
  transferId: string;
  deviceName: string;
  files: { name: string; path: string; size: number; mimeType: string }[];
  totalBytes: number;
  direction: 'sent' | 'received';
};

type TransferListener = (payload: TransferCompletePayload) => void;

const listeners = new Set<TransferListener>();

export function onTransferComplete(callback: TransferListener): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

export function notifyTransferComplete(payload: TransferCompletePayload): void {
  for (const listener of listeners) {
    try { listener(payload); } catch { /* individual listener failure is non-fatal */ }
  }
}

// Initialize IPC listener (call once at app startup)
let initialized = false;
export function initTransferNotifications(): void {
  if (initialized) return;
  initialized = true;

  window.dex?.dtp?.onTransferComplete?.((info: any) => {
    if (info?.direction === 'received' || info?.files) {
      notifyTransferComplete({
        transferId: info.transferId || '',
        deviceName: info.deviceName || 'Unknown Device',
        files: info.files || [],
        totalBytes: info.totalBytes || 0,
        direction: info.direction || 'received',
      });
    }
  });
}

// Helper: filter received files by extension
export function filterByExtensions(
  files: TransferCompletePayload['files'],
  extensions: string[]
): TransferCompletePayload['files'] {
  const exts = new Set(extensions.map(e => e.toLowerCase()));
  return files.filter(f => {
    const dot = f.name.lastIndexOf('.');
    if (dot < 0) return false;
    return exts.has(f.name.substring(dot).toLowerCase());
  });
}

// Common extension groups
export const MEDIA_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.heic', '.heif', '.tiff', '.raw', '.cr2', '.nef'];
export const MEDIA_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.ts'];
export const MEDIA_AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma', '.opus', '.aiff'];
export const DOCUMENT_EXTENSIONS = ['.txt', '.md', '.pdf', '.doc', '.docx', '.rtf', '.html', '.htm', '.csv', '.json', '.xml'];
