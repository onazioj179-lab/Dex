// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Wave E pane: thin wrapper around the existing MemoryInspector to give it
 * the SettingsPaneShell chrome.
 */

// DEX v3.8.9 wave E - memory pane

import React from 'react';
import { SettingsPaneShell } from './SettingsPaneShell';
import { MemoryInspector } from '../uki/MemoryInspector';
import type { MemoryStore } from '../../../shared/uki/memory';

export interface MemoryPaneProps {
  store: MemoryStore;
  now?: number;
  onForget?: (id: string) => void;
  onExport?: (json: string) => void;
}

export function MemoryPane(props: MemoryPaneProps): React.JSX.Element {
  return (
    <SettingsPaneShell
      title="Memory"
      description="Long-term memories DEX retains for context. Forget anything you'd rather it didn't know."
      testId="settings-pane-memory"
    >
      <MemoryInspector store={props.store} now={props.now} onForget={props.onForget} onExport={props.onExport} />
    </SettingsPaneShell>
  );
}
