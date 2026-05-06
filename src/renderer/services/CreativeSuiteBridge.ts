// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX Creative Suite Bridge
 * Cross-app communication for Imosion, Vinx, Flux, Prism, Forge.
 * Enables: send-to-app, shared asset clipboard, export-to workflow.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreativeAppId = 'imosion' | 'videoeditor' | 'flux' | 'prism' | 'forge' | 'axl' | 'notes' | 'rewind';

export type SourceAppId = CreativeAppId | 'gallery' | 'audio' | 'files';

export type AssetKind = 'audio' | 'video' | 'image' | 'project' | 'preset' | 'clip' | 'model' | 'drawing' | 'document';

export interface SharedAsset {
  id?: string;
  kind: AssetKind;
  name: string;
  sourceApp: SourceAppId;
  /** File path, data URL, or serialized data */
  data: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

export interface SendToRequest {
  id: string;
  asset: SharedAsset;
  targetApp: CreativeAppId;
  timestamp: number;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface DeliveryRecord {
  requestId: string;
  status: DeliveryStatus;
  error?: string;
  timestamp: number;
}

// ─── Compatibility matrix ─────────────────────────────────────────────────────

const ACCEPTS: Record<CreativeAppId, AssetKind[]> = {
  imosion:     ['audio', 'preset'],
  videoeditor: ['video', 'audio', 'image', 'clip'],
  flux:        ['image', 'video', 'preset'],
  prism:       ['image'],
  forge:       ['video', 'audio', 'image', 'model'],
  axl:         ['model', 'image', 'drawing'],
  notes:       ['document', 'image'],
  rewind:      ['video', 'image'],
};

const PENDING_STORAGE_KEY = 'dex-creative-pending';

function persistPending(requests: SendToRequest[]) {
  try { localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(requests)); } catch { /* storage full */ }
}

function loadPending(): SendToRequest[] {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    const all: SendToRequest[] = JSON.parse(raw);
    // Expire requests older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = all.filter(r => r.timestamp > cutoff).map(r => ({
      ...r,
      id: r.id || `req-${r.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    if (fresh.length !== all.length) persistPending(fresh);
    return fresh;
  } catch { return []; }
}

export function canSendTo(kind: AssetKind, target: CreativeAppId): boolean {
  return ACCEPTS[target]?.includes(kind) ?? false;
}

export function getTargetApps(kind: AssetKind): CreativeAppId[] {
  return (Object.keys(ACCEPTS) as CreativeAppId[]).filter(app => ACCEPTS[app].includes(kind));
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CreativeSuiteState {
  /** Shared clipboard for creative assets */
  clipboard: SharedAsset[];
  /** Pending "send-to" requests waiting for the target app to pick up */
  pendingRequests: SendToRequest[];
  /** History of transfers */
  history: { asset: string; from: SourceAppId; to: CreativeAppId; time: number }[];
  /** Delivery status tracking */
  deliveries: DeliveryRecord[];

  // Actions
  copyAsset: (asset: SharedAsset) => void;
  pasteAsset: (kind?: AssetKind) => SharedAsset | null;
  sendToApp: (asset: SharedAsset, target: CreativeAppId) => boolean;
  consumeRequest: (targetApp: CreativeAppId) => SendToRequest | null;
  acknowledgeDelivery: (requestId: string) => void;
  reportDeliveryError: (requestId: string, error: string) => void;
  getDeliveryStatus: (requestId: string) => DeliveryRecord | undefined;
  clearClipboard: () => void;
}

export const useCreativeSuite = create<CreativeSuiteState>((set, get) => ({
  clipboard: [],
  pendingRequests: loadPending(),
  history: [],
  deliveries: [],

  copyAsset: (asset) => {
    set(s => ({
      clipboard: [asset, ...s.clipboard.slice(0, 19)],
    }));
  },

  pasteAsset: (kind) => {
    const { clipboard } = get();
    if (kind) return clipboard.find(a => a.kind === kind) ?? null;
    return clipboard[0] ?? null;
  },

  sendToApp: (asset, target) => {
    if (!canSendTo(asset.kind, target)) {
      console.warn(`[CreativeSuiteBridge] Cannot send ${asset.kind} to ${target}`);
      return false;
    }
    // Guard: prevent oversized data from blowing localStorage (4MB limit)
    const dataSize = asset.data?.length ?? 0;
    if (dataSize > 4 * 1024 * 1024) {
      console.warn(`[CreativeSuiteBridge] Asset data too large (${(dataSize / 1024 / 1024).toFixed(1)}MB) — use file path instead`);
      return false;
    }
    // Guard: deduplicate — skip if same asset was sent to same target within 2s
    const now = Date.now();
    const isDuplicate = get().pendingRequests.some(
      r => r.targetApp === target && r.asset.name === asset.name && r.asset.kind === asset.kind && now - r.timestamp < 2000
    );
    if (isDuplicate) {
      console.warn(`[CreativeSuiteBridge] Duplicate send suppressed: ${asset.name} → ${target}`);
      return false;
    }
    try {
      const requestId = `req-${now}-${Math.random().toString(36).slice(2, 8)}`;
      const newRequest: SendToRequest = { id: requestId, asset, targetApp: target, timestamp: now };
      const newRequests = [...get().pendingRequests, newRequest];
      set(s => ({
        pendingRequests: newRequests,
        history: [{ asset: asset.name, from: asset.sourceApp, to: target, time: now }, ...s.history.slice(0, 49)],
        deliveries: [...s.deliveries.slice(-49), { requestId, status: 'pending' as DeliveryStatus, timestamp: now }],
      }));
      persistPending(newRequests);
      window.dispatchEvent(new CustomEvent('dex-creative-send', {
        detail: { asset, targetApp: target, requestId },
      }));
      return true;
    } catch (err) {
      console.error('[CreativeSuiteBridge] sendToApp failed:', err);
      return false;
    }
  },

  consumeRequest: (targetApp) => {
    const { pendingRequests } = get();
    const req = pendingRequests.find(r => r.targetApp === targetApp);
    if (!req) return null;
    const remaining = pendingRequests.filter(r => r !== req);
    set({ pendingRequests: remaining });
    persistPending(remaining);
    return req;
  },

  clearClipboard: () => set({ clipboard: [] }),

  acknowledgeDelivery: (requestId) => {
    set(s => ({
      deliveries: s.deliveries.map(d => d.requestId === requestId ? { ...d, status: 'delivered' as DeliveryStatus } : d),
    }));
    window.dispatchEvent(new CustomEvent('dex-creative-ack', { detail: { requestId, status: 'delivered' } }));
  },

  reportDeliveryError: (requestId, error) => {
    set(s => ({
      deliveries: s.deliveries.map(d => d.requestId === requestId ? { ...d, status: 'failed' as DeliveryStatus, error } : d),
    }));
    window.dispatchEvent(new CustomEvent('dex-creative-ack', { detail: { requestId, status: 'failed', error } }));
  },

  getDeliveryStatus: (requestId) => {
    return get().deliveries.find(d => d.requestId === requestId);
  },
}));

// ─── Hook: listen for incoming assets in a creative app ───────────────────────

import { useEffect, useCallback } from 'react';

function validateAsset(asset: SharedAsset, appId: CreativeAppId): string | null {
  if (!asset.name) return 'Asset has no name';
  if (!asset.data && !asset.metadata) return 'Asset has no data';
  if (!canSendTo(asset.kind, appId)) return `${appId} cannot accept ${asset.kind} assets`;
  return null;
}

function deliverAsset(
  req: SendToRequest,
  appId: CreativeAppId,
  onReceive: (asset: SharedAsset) => void,
  acknowledgeDelivery: (id: string) => void,
  reportDeliveryError: (id: string, error: string) => void,
) {
  const validationError = validateAsset(req.asset, appId);
  if (validationError) {
    reportDeliveryError(req.id, validationError);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Rejected "${req.asset.name}": ${validationError}` } }));
    return;
  }
  try {
    onReceive(req.asset);
    acknowledgeDelivery(req.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Import failed';
    reportDeliveryError(req.id, msg);
    window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'error', message: `Failed to import "${req.asset.name}" into ${appId}: ${msg}` } }));
  }
}

export function useCreativeInbox(appId: CreativeAppId, onReceive: (asset: SharedAsset) => void) {
  const consumeRequest = useCreativeSuite(s => s.consumeRequest);
  const acknowledgeDelivery = useCreativeSuite(s => s.acknowledgeDelivery);
  const reportDeliveryError = useCreativeSuite(s => s.reportDeliveryError);

  const handleIncoming = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.targetApp === appId) {
      const req = consumeRequest(appId);
      if (req) deliverAsset(req, appId, onReceive, acknowledgeDelivery, reportDeliveryError);
    }
  }, [appId, onReceive, consumeRequest, acknowledgeDelivery, reportDeliveryError]);

  useEffect(() => {
    const req = consumeRequest(appId);
    if (req) deliverAsset(req, appId, onReceive, acknowledgeDelivery, reportDeliveryError);

    window.addEventListener('dex-creative-send', handleIncoming);
    return () => window.removeEventListener('dex-creative-send', handleIncoming);
  }, [appId, handleIncoming, consumeRequest, onReceive, acknowledgeDelivery, reportDeliveryError]);
}

// ─── Utility: generate unique asset ID ────────────────────────────────────────

let _assetCounter = 0;
export function createAssetId(): string {
  return `asset-${Date.now()}-${++_assetCounter}`;
}

// ─── Utility: send asset back to its source app ───────────────────────────────

export function sendBackToSource(
  originalAsset: SharedAsset,
  replyData: { name: string; data: string; kind?: AssetKind; mimeType?: string; metadata?: Record<string, unknown> },
  fromApp: CreativeAppId,
): boolean {
  const target = originalAsset.sourceApp;
  // Can only reply to creative apps (not 'gallery', 'audio', 'files')
  const creativeApps: CreativeAppId[] = ['imosion', 'videoeditor', 'flux', 'prism', 'forge', 'axl', 'notes', 'rewind'];
  if (!creativeApps.includes(target as CreativeAppId)) return false;
  const replyAsset: SharedAsset = {
    id: createAssetId(),
    kind: replyData.kind || originalAsset.kind,
    name: replyData.name,
    sourceApp: fromApp,
    data: replyData.data,
    mimeType: replyData.mimeType || originalAsset.mimeType,
    metadata: { ...replyData.metadata, inReplyTo: originalAsset.id },
    createdAt: Date.now(),
  };
  return useCreativeSuite.getState().sendToApp(replyAsset, target as CreativeAppId);
}
