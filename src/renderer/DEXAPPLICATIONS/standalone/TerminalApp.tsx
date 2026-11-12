// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Terminal as its own app: the same tabbed, split-pane ConPTY terminal DexCode
 * embeds, given the whole window. Closing the last session leaves an empty
 * state with a button to start a new one (the window stays open).
 */
import React, { useEffect, useState } from 'react';
import { TerminalTabs } from '../../components/TerminalTabs';
import { OPEN_EVENT } from '../../components/terminalProfiles';

const TerminalApp: React.FC = () => {
  const [gen, setGen] = useState(0);
  const [open, setOpen] = useState(true);
  // "Open in Terminal" while every session is closed: start again so the
  // remounted tabs pick the waiting request up.
  useEffect(() => {
    if (open) return;
    const reopen = () => { setGen((g) => g + 1); setOpen(true); };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, [open]);
  if (!open) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#0a0a0a', color: 'var(--color-text-secondary, #b8b8bd)', fontSize: 12 }}>
        <span>All sessions are closed.</span>
        <button type="button" onClick={() => { setGen((g) => g + 1); setOpen(true); }}
          style={{ height: 26, padding: '0 12px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#e0e0e0', cursor: 'pointer' }}>
          New session
        </button>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', background: '#0a0a0a' }}>
      <TerminalTabs key={gen} acceptOpenRequests onClose={() => setOpen(false)} />
    </div>
  );
};

export default TerminalApp;
