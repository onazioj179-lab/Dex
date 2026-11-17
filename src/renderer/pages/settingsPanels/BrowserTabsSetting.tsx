// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Settings › Performance › Browser tabs. Read by pages/Browser.tsx
// ('browser.liveTabs'): how many background tabs keep a live page.

import React from 'react';
import { Select } from '../../components/Select';
import { useDexSetting, writeDexSetting } from '../../hooks/useDexSetting';
import { liveTabBudget } from '../../services/browser/tabResidency';
import { getStoredTier } from '../../services/TierManager';

const CHOICES = [0, 2, 5, 8, 12, 20];

export const BrowserTabsSetting: React.FC = () => {
  const value = useDexSetting<'auto' | number>('browser.liveTabs', 'auto');
  const auto = liveTabBudget(getStoredTier());
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', padding: '10px 0' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Awake background tabs</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 420 }}>
          Browser tabs beyond this sleep and load again when you select them. Tabs playing sound, tabs with
          edited fields and tabs set to Keep awake never sleep. Fewer awake tabs use less memory.
        </div>
      </div>
      <Select
        size="sm"
        options={[
          { value: 'auto', label: `Automatic (${auto})` },
          ...CHOICES.map((n) => ({ value: String(n), label: n === 0 ? 'Only the open tab' : String(n) })),
        ]}
        value={value === 'auto' ? 'auto' : String(value)}
        onChange={(v) => writeDexSetting('browser.liveTabs', v === 'auto' ? 'auto' : Number(v))}
      />
    </div>
  );
};
