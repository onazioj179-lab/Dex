// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: trash bin viewer with restore/purge, and a per-file
 * version history viewer with rollback.
 */

// DEX v3.8.9 wave E - trash + versions pane

import React from 'react';
import { Button } from '../../ui/Button';
import { colors, fontSize, fontWeight, space } from '../../styles/tokens';
import { SettingsPaneShell, settingsRowStyle, settingsListStyle, formatBytes, formatRelative } from './SettingsPaneShell';
import { trashSize, type TrashEntry, type TrashState } from '../../../shared/cloud/trashBin';
import { currentVersion, type VersionedFile } from '../../../shared/cloud/versioning';

export interface TrashAndVersionsPaneProps {
  trash: TrashState;
  versions?: VersionedFile;
  now?: number;
  onRestore?: (id: string) => void;
  onPurge?: (id: string) => void;
  onEmptyTrash?: () => void;
  onRollback?: (versionId: string) => void;
}

export function TrashAndVersionsPane(props: TrashAndVersionsPaneProps): React.JSX.Element {
  const { trash, versions, now, onRestore, onPurge, onEmptyTrash, onRollback } = props;
  const sortedTrash = [...trash.entries].sort((a, b) => b.deletedAt - a.deletedAt);
  const current = versions ? currentVersion(versions) : undefined;

  return (
    <SettingsPaneShell
      title="Trash + Versions"
      description={`${trash.entries.length} items in trash · ${formatBytes(trashSize(trash))}. Auto-purge after ${trash.ttlDays} days.`}
      testId="settings-pane-trash"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="danger"
          size="sm"
          disabled={trash.entries.length === 0}
          onClick={() => onEmptyTrash?.()}
          data-testid="trash-empty-all"
        >
          Empty trash
        </Button>
      </div>
      <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="trash-list">
        {sortedTrash.length === 0 ? (
          <li style={{ color: colors.text.tertiary, fontSize: fontSize.sm }} data-testid="trash-empty">
            Trash is empty.
          </li>
        ) : null}
        {sortedTrash.map((e: TrashEntry) => (
          <li key={e.id} style={settingsRowStyle} data-testid={`trash-row-${e.id}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
              <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text.primary }}>
                {e.originalPath}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                {formatBytes(e.bytes)} · deleted {formatRelative(e.deletedAt, now)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button variant="subtle" size="sm" onClick={() => onRestore?.(e.id)} data-testid={`trash-restore-${e.id}`}>Restore</Button>
              <Button variant="danger" size="sm" onClick={() => onPurge?.(e.id)} data-testid={`trash-purge-${e.id}`}>Purge</Button>
            </div>
          </li>
        ))}
      </ul>
      {versions ? (
        <div data-testid="versions-section">
          <h3 style={{ margin: 0, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text.primary }}>
            Version history · {versions.fileId}
          </h3>
          <ul style={{ ...settingsListStyle, listStyle: 'none', margin: 0, padding: 0 }} data-testid="versions-list">
            {versions.versions.length === 0 ? (
              <li style={{ color: colors.text.tertiary, fontSize: fontSize.sm }} data-testid="versions-empty">No versions yet.</li>
            ) : null}
            {[...versions.versions].sort((a, b) => b.createdAt - a.createdAt).map((v) => (
              <li key={v.versionId} style={settingsRowStyle} data-testid={`versions-row-${v.versionId}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
                  <span style={{ fontSize: fontSize.sm, color: colors.text.primary }}>
                    {v.versionId.slice(0, 12)}
                    {current?.versionId === v.versionId ? <span data-testid={`versions-current-${v.versionId}`} style={{ marginLeft: space[2], fontSize: fontSize.xs, color: colors.accent.default }}>current</span> : null}
                  </span>
                  <span style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    {formatBytes(v.bytes)}{v.authorId ? ` · ${v.authorId}` : ''} · {formatRelative(v.createdAt, now)}
                    {v.comment ? ` · ${v.comment}` : ''}
                  </span>
                </div>
                {current?.versionId !== v.versionId ? (
                  <Button variant="subtle" size="sm" onClick={() => onRollback?.(v.versionId)} data-testid={`versions-rollback-${v.versionId}`}>
                    Rollback
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SettingsPaneShell>
  );
}
