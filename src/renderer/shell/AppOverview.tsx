// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import React, { useEffect, useId, useRef, useState } from 'react';
import DexIcon from '../components/DexIcon';
import { DexSearchInput } from '../styles/components';
import { IconButton } from '../ui/Button';
import { Modal } from '../ui/Modal';
import './AppOverview.css';

export interface OverviewApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  minimized?: boolean;
}

interface AppOverviewProps {
  visible: boolean;
  apps: OverviewApp[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  onCloseApp: (id: string) => void;
  onDismiss: () => void;
}

export function AppOverview({ visible, apps, activeAppId, onSelectApp, onCloseApp, onDismiss }: AppOverviewProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const query = search.trim().toLocaleLowerCase();
  const filtered = apps.filter(app => app.name.toLocaleLowerCase().includes(query));

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const select = (id: string) => {
    onSelectApp(id);
    onDismiss();
  };

  const closeApp = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const row = event.currentTarget.closest('li');
    const next = row?.nextElementSibling?.querySelector<HTMLButtonElement>('button')
      ?? row?.previousElementSibling?.querySelector<HTMLButtonElement>('button')
      ?? searchRef.current;
    next?.focus();
    onCloseApp(id);
  };

  return (
    <Modal open={visible} onClose={onDismiss} ariaLabel="Open apps" size="xl" zIndexOverride="var(--z-max)"
      panelStyle={{ width: 'min(100%, 980px)', maxHeight: 'min(100%, 760px)' }}
      bodyStyle={{ padding: 0, display: 'flex', overflow: 'hidden' }}
      testIdPrefix="app-overview">
      <section className="dex-overview" aria-labelledby={headingId}>
        <header className="dex-overview-header">
          <h2 id={headingId}>Open apps</h2>
          <DexSearchInput ref={searchRef} fullWidth size="sm" value={search}
            aria-label="Filter open apps" placeholder="Filter open apps"
            onChange={event => setSearch(event.target.value)}
            onClear={() => { setSearch(''); searchRef.current?.focus(); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || !filtered.length) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                select(filtered[0].id);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
              }
            }}
            style={{ borderRadius: 'var(--dex-radius-md)' }} />
          <IconButton variant="ghost" size="sm" ariaLabel="Close app overview"
            icon={<DexIcon name="close" size={16} />} onClick={onDismiss} />
        </header>
        {filtered.length ? (
          <ul className="dex-overview-grid" ref={listRef}>
            {filtered.map(app => {
              const current = app.id === activeAppId && !app.minimized;
              const status = current ? 'Active window' : app.minimized ? 'Minimized' : null;
              return (
                <li key={app.id} className="dex-overview-card" data-current={current || undefined}>
                  <button className="dex-overview-app" type="button" aria-current={current || undefined}
                    aria-label={(app.minimized ? 'Restore ' : 'Switch to ') + app.name}
                    aria-description={status || undefined} title={app.name} onClick={() => select(app.id)}>
                    <span className="dex-overview-icon" style={{ '--app-tint': app.color } as React.CSSProperties}>
                      <DexIcon name={app.icon} size={19} />
                    </span>
                    <span className="dex-overview-label">
                      <span className="dex-overview-name">{app.name}</span>
                      {status && <span className="dex-overview-status">{status}</span>}
                    </span>
                  </button>
                  {app.id !== 'home' && (
                    <div className="dex-overview-close">
                      <IconButton variant="ghost" size="xs" ariaLabel={'Close ' + app.name}
                        icon={<DexIcon name="close" size={14} />} onClick={event => closeApp(event, app.id)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dex-overview-empty" role="status">{query ? 'No matching apps' : 'No open apps'}</p>
        )}
      </section>
    </Modal>
  );
}
