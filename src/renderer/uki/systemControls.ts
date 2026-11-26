// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// UKI's hands on privacy, network mode and backups. Works on this computer, with
// no AI provider, so it also works offline. Only whole commands match: "how do I
// back up?" stays a question.
//
// `opensAccess` marks commands that give something more reach (a permission on,
// the network back). Callers must get a yes for those; the rest only restrict or
// protect and run at once.

import {
  usePermissionStore, ALL_PERMISSIONS, PERMISSION_LABELS, type PermissionId,
} from '../store/permissionStore';
import { useNetworkStore, NETWORK_MODE_LABELS, type NetworkMode } from '../store/networkStore';
import { useCaptureStore } from '../services/permissionGate';
import { syncInterfaceState } from '../services/dataBackup';

export type SystemControl =
  | { op: 'permission'; id: PermissionId; on: boolean }
  | { op: 'revokeAll' }
  | { op: 'network'; mode: NetworkMode }
  | { op: 'backup' }
  | { op: 'status' };

const DEVICES: [RegExp, PermissionId][] = [
  [/^(?:mic|microphone)$/, 'microphone'],
  [/^(?:camera|webcam)$/, 'camera'],
  [/^(?:location|gps)$/, 'gps'],
  [/^(?:screen recording|screen capture|screen sharing)$/, 'screen_recording'],
];
const DEVICE = '(mic|microphone|camera|webcam|location|gps|screen recording|screen capture|screen sharing)';

export function parseSystemControl(text: string): SystemControl | null {
  const t = text.toLowerCase().trim()
    .replace(/^(?:hey |ok |okay )?uki[,:]?\s+/, '')
    .replace(/^(?:please |can you |could you )+/, '')
    .replace(/(?:\s+please)?[.!?]*$/, '');

  let m = new RegExp(`^(?:turn|switch) (on|off) (?:the |my )?${DEVICE}(?: access)?$`).exec(t);
  const verb = m ? null : new RegExp(`^(enable|allow|disable|block) (?:the |my )?${DEVICE}(?: access)?$`).exec(t);
  m = m ?? verb;
  if (m) {
    const on = m[1] === 'on' || m[1] === 'enable' || m[1] === 'allow';
    const found = DEVICES.find(([re]) => re.test(m![2]));
    if (found) return { op: 'permission', id: found[1], on };
  }
  if (/^(?:revoke|turn off|disable) (?:all )?(?:the )?permissions$|^privacy lockdown$/.test(t)) return { op: 'revokeAll' };

  m = /^(?:go|take dex|switch(?: dex)?(?: to)?|set (?:the )?network(?: mode)? to) (offline|online|local[- ]only|full network)(?: mode)?$/.exec(t);
  if (m) {
    const mode: NetworkMode = m[1] === 'offline' ? 'disabled' : m[1].startsWith('local') ? 'local-only' : 'full';
    return { op: 'network', mode };
  }
  if (/^(?:back ?up(?: (?:dex|everything|my (?:data|settings|stuff)))?(?: now)?|(?:make|create|take) (?:a )?backup(?: now)?)$/.test(t)) return { op: 'backup' };
  if (/^(?:privacy status|network status|what(?:'s| is) using (?:my |the )?(?:camera|mic|microphone))$/.test(t)) return { op: 'status' };
  return null;
}

export function opensAccess(c: SystemControl): boolean {
  return (c.op === 'permission' && c.on) || (c.op === 'network' && c.mode === 'full');
}

export function describeSystemControl(c: SystemControl): string {
  switch (c.op) {
    case 'permission': return `Turn ${c.on ? 'on' : 'off'} ${PERMISSION_LABELS[c.id].toLowerCase()} access`;
    case 'revokeAll': return 'Turn all permissions off';
    case 'network': return `Set network to ${NETWORK_MODE_LABELS[c.mode]}`;
    case 'backup': return 'Back up DEX now';
    case 'status': return 'Show privacy status';
  }
}

function statusLine(): string {
  const { permissions } = usePermissionStore.getState();
  const live = useCaptureStore.getState().live;
  const on = ALL_PERMISSIONS.filter((id) => permissions[id].enabled).map((id) => PERMISSION_LABELS[id]);
  const inUse = ALL_PERMISSIONS.filter((id) => live[id]).map((id) => PERMISSION_LABELS[id]);
  return [
    `Network: ${NETWORK_MODE_LABELS[useNetworkStore.getState().mode]}.`,
    on.length ? `Allowed: ${on.join(', ')}.` : 'No permissions are on.',
    inUse.length ? `In use right now: ${inUse.join(', ')}.` : 'Nothing is capturing right now.',
  ].join(' ');
}

export async function runSystemControl(c: SystemControl): Promise<string> {
  switch (c.op) {
    case 'permission': {
      usePermissionStore.getState().setPermission(c.id, c.on);
      return `${PERMISSION_LABELS[c.id]} access is ${c.on ? 'on' : 'off'}.`;
    }
    case 'revokeAll':
      usePermissionStore.getState().revokeAll();
      return 'All permissions are off, and any capture has stopped.';
    case 'network': {
      await useNetworkStore.getState().setMode(c.mode);
      const now = useNetworkStore.getState().mode;
      return now === c.mode ? `Network is now ${NETWORK_MODE_LABELS[now]}.` : 'I could not change the network mode.';
    }
    case 'backup': {
      const invoke = (window as unknown as { dex?: { invoke?: (ch: string, ...a: unknown[]) => Promise<unknown> } }).dex?.invoke;
      if (!invoke) return 'Backups are made in the DEX desktop app.';
      const complete = await syncInterfaceState();
      const res = await invoke('backup:create', 'manual', 'Backed up by UKI').catch(() => null) as { id?: string; error?: string } | null;
      if (!res?.id) return `The backup failed${res?.error ? `: ${res.error}` : ''}.`;
      return complete
        ? 'Backup made. You can restore it in Settings › Storage & Data.'
        : 'Backup made, but the latest settings could not be added.';
    }
    case 'status':
      return statusLine();
  }
}
