// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// One app made of former apps: a compact segmented bar at the top, each tab
// loaded on first visit and kept mounted after (switching back is instant and
// keeps its state). Opening an old app id lands on its tab (services/appTabs).
import React, { Suspense, useEffect, useState } from 'react';
import { SegmentedControl } from '../../components/controls/SegmentedControl';
import { APP_TAB_EVENT, storedAppTab, requestAppTab } from '../../services/appTabs';

export interface HostedTab { id: string; label: string; render: () => React.ReactNode }

export function TabbedAppHost({ appId, tabs, label }: { appId: string; tabs: HostedTab[]; label: string }) {
  const valid = (t: string | null) => (t && tabs.some((x) => x.id === t) ? t : tabs[0].id);
  const [tab, setTab] = useState(() => valid(storedAppTab(appId)));
  const [visited, setVisited] = useState(() => new Set([tab]));

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ appId: string; tab: string }>).detail;
      if (d?.appId === appId) setTab(valid(d.tab));
    };
    window.addEventListener(APP_TAB_EVENT, on);
    return () => window.removeEventListener(APP_TAB_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);
  useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))); }, [tab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
        <SegmentedControl
          aria-label={label}
          options={tabs.map((t) => ({ value: t.id, label: t.label }))}
          value={tab}
          onChange={(v) => requestAppTab(appId, v as string)}
        />
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tabs.filter((t) => visited.has(t.id)).map((t) => (
          <div key={t.id} role="tabpanel" aria-label={t.label} hidden={t.id !== tab}
            style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: t.id === tab ? 'block' : 'none' }}>
            <Suspense fallback={null}>{t.render()}</Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
