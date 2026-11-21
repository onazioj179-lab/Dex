import { useRef, type KeyboardEvent } from 'react';
import DexIcon from '../../../components/DexIcon';
import { editorTabIsDirty, type EditorSession, type EditorTab } from './editorSession';
import './editorTabs.css';

type Props = {
  session: EditorSession;
  panelId: string;
  onSelect: (tab: EditorTab) => void;
  onClose: (id: string) => void;
  onNew: () => void;
};

export function editorTabElementId(panelId: string, tabId: string) {
  return `${panelId}-${tabId}`;
}

export function EditorTabs({ session, panelId, onSelect, onClose, onNew }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const { tabs, activeId } = session;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destinations: Record<string, number | undefined> = {
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = destinations[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(tabs[next]);
    strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <div className="dex-editor-tabs-bar">
    <div ref={strip} className="dex-editor-tabs" role="tablist" aria-label="Open files">
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        const dirty = editorTabIsDirty(tab);
        return <div className="dex-editor-tab" data-active={active} key={tab.id} role="presentation">
          <button
            type="button"
            id={editorTabElementId(panelId, tab.id)}
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            aria-label={dirty ? `${tab.name}, unsaved changes` : tab.name}
            tabIndex={active ? 0 : -1}
            title={tab.path || tab.name}
            onClick={() => onSelect(tab)}
            onKeyDown={event => moveFocus(event, index)}
          >
            <span className="dex-editor-tab-name">{tab.name}</span>
            {dirty && <span className="dex-editor-tab-dirty" aria-hidden="true" />}
          </button>
          <button type="button" className="dex-editor-tab-close" onClick={() => onClose(tab.id)} aria-label={`Close ${tab.name}`}>
            <DexIcon name="close" size={12} />
          </button>
        </div>;
      })}
    </div>
    <button type="button" className="dex-editor-tab-add" onClick={onNew} aria-label="New editor tab" title="New File (Ctrl+N)">
      <DexIcon name="plus" size={14} />
    </button>
  </div>;
}
