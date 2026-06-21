// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AskUkiContextMenu - the "right-click anything and ask UKI" affordance.
 *
 * Mounted once in the shell. The global context-menu handler in App.tsx is the
 * single authority on right-clicks (it suppresses the native menu and defers to
 * any component that opened its own). When a right-click lands on plain
 * non-editable content with a text selection and no component claimed it, that
 * handler dispatches `dex:ask-uki-selection` with the selected text and cursor
 * position. This component renders a small DEX menu there:
 *   - "Ask UKI about ..."  -> dispatches `uki:ask`, opening UKI seeded with the
 *                             selection (one more path to the assistant).
 *   - "Copy"               -> copies the selection (the native menu is gone).
 */
import React, { useEffect, useState } from 'react';
import ContextMenu, { type ContextMenuItem, type ContextMenuPosition } from './ContextMenu';

interface SelectionMenu {
  items: ContextMenuItem[];
  position: ContextMenuPosition;
}

const AskUkiContextMenu: React.FC = () => {
  const [menu, setMenu] = useState<SelectionMenu | null>(null);

  useEffect(() => {
    const onSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text?: string; x?: number; y?: number } | undefined;
      const text = (detail?.text ?? '').toString().trim();
      if (!text) return;
      const snippet = text.length > 32 ? `${text.slice(0, 32).trim()}…` : text;
      setMenu({
        position: { x: detail?.x ?? 0, y: detail?.y ?? 0 },
        items: [
          {
            id: 'uki-ask',
            label: `Ask UKI about "${snippet}"`,
            onClick: () => {
              try {
                window.dispatchEvent(new CustomEvent('uki:ask', { detail: { text } }));
              } catch { /* event constructor unavailable -- non-fatal */ }
            },
          },
          {
            id: 'uki-copy',
            label: 'Copy',
            onClick: () => {
              try {
                const clip = navigator.clipboard;
                if (clip?.writeText) clip.writeText(text).catch(() => { /* denied / insecure context */ });
              } catch { /* clipboard unavailable -- non-fatal */ }
            },
          },
        ],
      });
    };

    window.addEventListener('dex:ask-uki-selection', onSelection as EventListener);
    return () => window.removeEventListener('dex:ask-uki-selection', onSelection as EventListener);
  }, []);

  if (!menu) return null;
  return <ContextMenu items={menu.items} position={menu.position} onClose={() => setMenu(null)} />;
};

export default AskUkiContextMenu;
