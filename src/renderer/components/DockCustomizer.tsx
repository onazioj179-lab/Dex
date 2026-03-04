/**
 * DEX Dock Customizer
 * Drag-and-drop dock reordering, custom sections, sizing, and position
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useMemo, memo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface DockItem {
  id: string;
  appId: string;
  label: string;
  order: number;
  visible: boolean;
  pinned: boolean;
}

export interface DockConfig {
  items: DockItem[];
  position: 'bottom' | 'left' | 'right';
  size: 'small' | 'medium' | 'large';
  autoHide: boolean;
  showLabels: boolean;
  showBadges: boolean;
  maxItems: number;
  separator: number[]; // indices where separators appear
}

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-dock-config';

const DEFAULT_DOCK_ITEMS: DockItem[] = [
  { id: 'd1', appId: 'home', label: 'Home', order: 0, visible: true, pinned: true },
  { id: 'd2', appId: 'notes', label: 'Notes', order: 1, visible: true, pinned: true },
  { id: 'd3', appId: 'tasks', label: 'Tasks', order: 2, visible: true, pinned: true },
  { id: 'd4', appId: 'calendar', label: 'Calendar', order: 3, visible: true, pinned: true },
  { id: 'd5', appId: 'browser', label: 'Browser', order: 4, visible: true, pinned: true },
  { id: 'd6', appId: 'terminal', label: 'Terminal', order: 5, visible: true, pinned: false },
  { id: 'd7', appId: 'code-editor', label: 'Code Editor', order: 6, visible: true, pinned: false },
  { id: 'd8', appId: 'music', label: 'Music', order: 7, visible: true, pinned: false },
  { id: 'd9', appId: 'weather', label: 'Weather', order: 8, visible: true, pinned: false },
  { id: 'd10', appId: 'calculator', label: 'Calculator', order: 9, visible: true, pinned: false },
  { id: 'd11', appId: 'files', label: 'Files', order: 10, visible: true, pinned: false },
  { id: 'd12', appId: 'settings', label: 'Settings', order: 11, visible: true, pinned: true },
  { id: 'd13', appId: 'video-editor', label: 'Video Editor', order: 12, visible: false, pinned: false },
  { id: 'd14', appId: 'kanban', label: 'Kanban', order: 13, visible: false, pinned: false },
  { id: 'd15', appId: 'messenger', label: 'Messenger', order: 14, visible: false, pinned: false },
  { id: 'd16', appId: 'photos', label: 'Photos', order: 15, visible: false, pinned: false },
  { id: 'd17', appId: 'pomodoro', label: 'Pomodoro', order: 16, visible: false, pinned: false },
  { id: 'd18', appId: 'snippets', label: 'Snippets', order: 17, visible: false, pinned: false },
  { id: 'd19', appId: 'bookmarks', label: 'Bookmarks', order: 18, visible: false, pinned: false },
  { id: 'd20', appId: 'habits', label: 'Habits', order: 19, visible: false, pinned: false },
  { id: 'd21', appId: 'markdown', label: 'Markdown', order: 20, visible: false, pinned: false },
  { id: 'd22', appId: 'backups', label: 'Backups', order: 21, visible: false, pinned: false },
  { id: 'd23', appId: 'system-info', label: 'System Info', order: 22, visible: false, pinned: false },
  { id: 'd24', appId: 'games', label: 'Games', order: 23, visible: false, pinned: false },
];

function loadConfig(): DockConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    items: DEFAULT_DOCK_ITEMS,
    position: 'bottom',
    size: 'medium',
    autoHide: false,
    showLabels: false,
    showBadges: true,
    maxItems: 12,
    separator: [5, 11],
  };
}

function saveConfig(config: DockConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
}

// ============================================================================
// HOOKS
// ============================================================================

export function useDockConfig() {
  const [config, setConfig] = useState<DockConfig>(loadConfig);
  const update = useCallback((partial: Partial<DockConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...partial };
      saveConfig(next);
      return next;
    });
  }, []);
  const updateItems = useCallback((items: DockItem[]) => {
    setConfig(prev => {
      const next = { ...prev, items };
      saveConfig(next);
      return next;
    });
  }, []);
  return { config, update, updateItems };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const DockCustomizer: React.FC = memo(() => {
  const { config, update, updateItems } = useDockConfig();
  const [dragId, setDragId] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => config.items.filter(i => i.visible).sort((a, b) => a.order - b.order),
    [config.items]
  );
  const hiddenItems = useMemo(
    () => config.items.filter(i => !i.visible).sort((a, b) => a.label.localeCompare(b.label)),
    [config.items]
  );

  const toggleVisible = useCallback((id: string) => {
    updateItems(config.items.map(i => {
      if (i.id !== id) return i;
      return { ...i, visible: !i.visible, order: i.visible ? 999 : visibleItems.length };
    }));
  }, [config.items, visibleItems.length, updateItems]);

  const togglePin = useCallback((id: string) => {
    updateItems(config.items.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
  }, [config.items, updateItems]);

  const moveItem = useCallback((id: string, dir: -1 | 1) => {
    const sorted = [...visibleItems];
    const idx = sorted.findIndex(i => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    updateItems(config.items.map(i => {
      const newOrder = sorted.findIndex(s => s.id === i.id);
      return newOrder >= 0 ? { ...i, order: newOrder } : i;
    }));
  }, [config.items, visibleItems, updateItems]);

  const resetToDefault = useCallback(() => {
    const defaultConfig: DockConfig = {
      items: DEFAULT_DOCK_ITEMS,
      position: 'bottom',
      size: 'medium',
      autoHide: false,
      showLabels: false,
      showBadges: true,
      maxItems: 12,
      separator: [5, 11],
    };
    update(defaultConfig);
  }, [update]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Dock Settings</h2>
        <button onClick={resetToDefault} style={styles.resetBtn}>Reset Default</button>
      </div>

      {/* Global settings */}
      <div style={styles.settingsGrid}>
        <div style={styles.settingItem}>
          <span style={styles.settingLabel}>Position</span>
          <select value={config.position} onChange={e => update({ position: e.target.value as any })} style={styles.select}>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div style={styles.settingItem}>
          <span style={styles.settingLabel}>Size</span>
          <select value={config.size} onChange={e => update({ size: e.target.value as any })} style={styles.select}>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
        <div style={styles.settingItem}>
          <span style={styles.settingLabel}>Max visible</span>
          <select value={config.maxItems} onChange={e => update({ maxItems: Number(e.target.value) })} style={styles.select}>
            {[6, 8, 10, 12, 14, 16].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={styles.toggleRow}>
        <ToggleOption label="Auto-hide dock" checked={config.autoHide} onChange={v => update({ autoHide: v })} />
        <ToggleOption label="Show labels" checked={config.showLabels} onChange={v => update({ showLabels: v })} />
        <ToggleOption label="Show badges" checked={config.showBadges} onChange={v => update({ showBadges: v })} />
      </div>

      {/* Visible items */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>In Dock ({visibleItems.length})</h3>
        <div style={styles.itemList}>
          {visibleItems.map((item, idx) => (
            <div key={item.id} style={styles.itemRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <div style={styles.dragHandle}>::</div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</span>
                {item.pinned && <span style={styles.pinBadge}>pinned</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} style={styles.moveBtn} aria-label="Move up">^</button>
                <button onClick={() => moveItem(item.id, 1)} disabled={idx === visibleItems.length - 1} style={styles.moveBtn} aria-label="Move down">v</button>
                <button onClick={() => togglePin(item.id)} style={{ ...styles.actionBtn, color: item.pinned ? '#3b82f6' : 'var(--color-text-muted)' }} aria-label="Toggle pin">
                  {item.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button onClick={() => toggleVisible(item.id)} style={{ ...styles.actionBtn, color: '#ef4444' }} aria-label="Remove from dock">Hide</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden items */}
      {hiddenItems.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Available ({hiddenItems.length})</h3>
          <div style={styles.itemList}>
            {hiddenItems.map(item => (
              <div key={item.id} style={{ ...styles.itemRow, opacity: 0.6 }}>
                <span style={{ fontSize: 12 }}>{item.label}</span>
                <button onClick={() => toggleVisible(item.id)} style={{ ...styles.actionBtn, color: '#10b981' }}>
                  Add to Dock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dock preview */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Preview</h3>
        <div style={styles.previewDock}>
          {visibleItems.slice(0, config.maxItems).map(item => (
            <div key={item.id} style={styles.previewItem} title={item.label}>
              <div style={styles.previewIcon}>{item.label.charAt(0)}</div>
              {config.showLabels && <div style={styles.previewLabel}>{item.label}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

DockCustomizer.displayName = 'DockCustomizer';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const ToggleOption: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={styles.toggleItem}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    <span style={{ fontSize: 12 }}>{label}</span>
  </label>
);

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto', gap: 14 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  resetBtn: { padding: '5px 12px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  settingsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 },
  settingItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  settingLabel: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' },
  select: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.04)', color: 'inherit', fontSize: 12, outline: 'none' },
  toggleRow: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  toggleItem: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  section: {},
  sectionTitle: { margin: '0 0 6px', fontSize: 13, fontWeight: 700 },
  itemList: { display: 'flex', flexDirection: 'column', gap: 3 },
  itemRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' },
  dragHandle: { fontSize: 12, color: 'var(--color-text-muted)', cursor: 'grab', userSelect: 'none' },
  pinBadge: { fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  moveBtn: { width: 20, height: 20, borderRadius: 4, border: '1px solid var(--color-border, rgba(255,255,255,0.06))', background: 'rgba(255,255,255,0.02)', color: 'inherit', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionBtn: { fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' },
  previewDock: { display: 'flex', gap: 4, padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border, rgba(255,255,255,0.06))', justifyContent: 'center', flexWrap: 'wrap' },
  previewItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  previewIcon: { width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 },
  previewLabel: { fontSize: 8, color: 'var(--color-text-muted)' },
};

export default DockCustomizer;
