/**
 * DEX Tab Groups
 * Chrome-style tab grouping for Browser
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  groupId?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabIds: string[];
}

interface TabGroupsProps {
  tabs: BrowserTab[];
  groups: TabGroup[];
  onGroupCreate: (name: string, color: string, tabIds: string[]) => void;
  onGroupUpdate: (groupId: string, updates: Partial<TabGroup>) => void;
  onGroupDelete: (groupId: string) => void;
  onTabMove: (tabId: string, groupId: string | null) => void;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

interface TabGroupHeaderProps {
  group: TabGroup;
  tabCount: number;
  onUpdate: (updates: Partial<TabGroup>) => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
}

// ==================== CONSTANTS ====================

const GROUP_COLORS = [
  { name: 'Blue', value: '#007aff' },
  { name: 'Purple', value: '#af52de' },
  { name: 'Pink', value: '#ff2d55' },
  { name: 'Red', value: '#ff3b30' },
  { name: 'Orange', value: '#ff9500' },
  { name: 'Yellow', value: '#ffcc00' },
  { name: 'Green', value: '#34c759' },
  { name: 'Teal', value: '#5ac8fa' },
  { name: 'Gray', value: '#8e8e93' },
];

// ==================== ICONS ====================

const Icons = {
  chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  chevronRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
  close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plus: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  edit: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  globe: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
};

// ==================== TAB GROUP HEADER ====================

const TabGroupHeader: React.FC<TabGroupHeaderProps> = ({
  group,
  tabCount,
  onUpdate,
  onDelete,
  onToggleCollapse,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(group.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim()) {
      onUpdate({ name: editValue.trim() });
    }
    setIsEditing(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 8px',
      background: `${group.color}15`,
      borderRadius: '6px 6px 0 0',
      borderBottom: `2px solid ${group.color}`,
      cursor: 'pointer',
    },
    indicator: {
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: group.color,
    },
    name: {
      flex: 1,
      fontSize: '12px',
      fontWeight: 600,
      color: group.color,
    },
    input: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '12px',
      fontWeight: 600,
      color: group.color,
      padding: 0,
    },
    count: {
      fontSize: '10px',
      color: 'var(--color-text-muted)',
      background: 'var(--color-bg-glass)',
      padding: '2px 6px',
      borderRadius: '4px',
    },
    chevron: {
      color: group.color,
      transition: 'transform 0.2s',
      transform: group.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
    },
    actions: {
      display: 'flex',
      gap: '2px',
    },
    actionBtn: {
      width: '20px',
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
    },
    colorPicker: {
      position: 'absolute',
      top: '100%',
      left: 0,
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
      padding: '8px',
      background: 'var(--color-bg-elevated)',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 100,
      width: '120px',
    },
    colorOption: {
      width: '24px',
      height: '24px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      transition: 'transform 0.15s',
    },
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={styles.container} onClick={onToggleCollapse}>
        <span style={styles.chevron}>{Icons.chevronDown}</span>
        <div style={styles.indicator} onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }} />
        
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onClick={e => e.stopPropagation()}
            style={styles.input}
          />
        ) : (
          <span 
            style={styles.name}
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          >
            {group.name}
          </span>
        )}

        <span style={styles.count}>{tabCount}</span>

        <div style={styles.actions} onClick={e => e.stopPropagation()}>
          <button 
            style={styles.actionBtn}
            onClick={() => setIsEditing(true)}
            title="Rename"
          >
            {Icons.edit}
          </button>
          <button 
            style={styles.actionBtn}
            onClick={onDelete}
            title="Ungroup"
          >
            {Icons.trash}
          </button>
        </div>
      </div>

      {showColorPicker && (
        <div style={styles.colorPicker} onClick={e => e.stopPropagation()}>
          {GROUP_COLORS.map(color => (
            <button
              key={color.value}
              style={{
                ...styles.colorOption,
                background: color.value,
                border: group.color === color.value ? '2px solid #fff' : 'none',
                boxShadow: group.color === color.value ? '0 0 0 2px ' + color.value : 'none',
              }}
              onClick={() => {
                onUpdate({ color: color.value });
                setShowColorPicker(false);
              }}
              title={color.name}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== TAB ITEM ====================

interface TabItemProps {
  tab: BrowserTab;
  groupColor?: string;
  onClick: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

const TabItem: React.FC<TabItemProps> = ({
  tab,
  groupColor,
  onClick,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      background: tab.isActive 
        ? 'var(--color-bg-elevated)' 
        : isHovered 
          ? 'var(--color-bg-glass)' 
          : 'transparent',
      borderRadius: '6px',
      cursor: 'pointer',
      borderLeft: groupColor ? `3px solid ${groupColor}` : 'none',
      transition: 'background 0.15s',
    },
    favicon: {
      width: '16px',
      height: '16px',
      borderRadius: '4px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-glass)',
      color: 'var(--color-text-muted)',
    },
    title: {
      flex: 1,
      fontSize: '12px',
      color: tab.isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    closeBtn: {
      width: '18px',
      height: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      opacity: isHovered ? 1 : 0,
      transition: 'opacity 0.15s',
    },
  };

  return (
    <div
      style={styles.container}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div style={styles.favicon}>
        {tab.favicon ? (
          <img src={tab.favicon} alt="" style={{ width: '100%', height: '100%' }} />
        ) : (
          Icons.globe
        )}
      </div>
      <span style={styles.title}>{tab.title || 'New Tab'}</span>
      <button 
        style={styles.closeBtn}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        {Icons.close}
      </button>
    </div>
  );
};

// ==================== TAB GROUPS COMPONENT ====================

export const TabGroups: React.FC<TabGroupsProps> = ({
  tabs,
  groups,
  onGroupCreate,
  onGroupUpdate,
  onGroupDelete,
  onTabMove,
  onTabClick,
  onTabClose,
}) => {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewGroup && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewGroup]);

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      const selectedTabs = tabs.filter(t => t.isActive).map(t => t.id);
      const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)].value;
      onGroupCreate(newGroupName.trim(), color, selectedTabs);
      setNewGroupName('');
      setShowNewGroup(false);
    }
  };

  const handleDragStart = (tabId: string) => (e: React.DragEvent) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnGroup = (groupId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedTabId) {
      onTabMove(draggedTabId, groupId);
      setDraggedTabId(null);
    }
  };

  const handleDropOutside = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedTabId) {
      onTabMove(draggedTabId, null);
      setDraggedTabId(null);
    }
  };

  // Get ungrouped tabs
  const groupedTabIds = new Set(groups.flatMap(g => g.tabIds));
  const ungroupedTabs = tabs.filter(t => !groupedTabIds.has(t.id));

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    group: {
      background: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      overflow: 'hidden',
    },
    groupTabs: {
      padding: '4px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    ungrouped: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    newGroupBtn: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '8px',
      background: 'var(--color-bg-glass)',
      border: '2px dashed var(--color-border)',
      borderRadius: '8px',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: '12px',
    },
    newGroupForm: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px',
      background: 'var(--color-bg-secondary)',
      borderRadius: '8px',
    },
    input: {
      flex: 1,
      padding: '6px 10px',
      background: 'var(--color-bg-glass)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      fontSize: '12px',
      color: 'var(--color-text-primary)',
      outline: 'none',
    },
    createBtn: {
      padding: '6px 12px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
  };

  return (
    <div style={styles.container} onDragOver={handleDragOver} onDrop={handleDropOutside}>
      {/* Tab Groups */}
      {groups.map(group => {
        const groupTabs = tabs.filter(t => group.tabIds.includes(t.id));
        return (
          <div key={group.id} style={styles.group}>
            <TabGroupHeader
              group={group}
              tabCount={groupTabs.length}
              onUpdate={(updates) => onGroupUpdate(group.id, updates)}
              onDelete={() => onGroupDelete(group.id)}
              onToggleCollapse={() => onGroupUpdate(group.id, { collapsed: !group.collapsed })}
            />
            {!group.collapsed && (
              <div 
                style={styles.groupTabs}
                onDragOver={handleDragOver}
                onDrop={handleDropOnGroup(group.id)}
              >
                {groupTabs.map(tab => (
                  <TabItem
                    key={tab.id}
                    tab={tab}
                    groupColor={group.color}
                    onClick={() => onTabClick(tab.id)}
                    onClose={() => onTabClose(tab.id)}
                    onDragStart={handleDragStart(tab.id)}
                    onDragOver={handleDragOver}
                    onDrop={handleDropOnGroup(group.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped Tabs */}
      {ungroupedTabs.length > 0 && (
        <div style={styles.ungrouped}>
          {ungroupedTabs.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              onClick={() => onTabClick(tab.id)}
              onClose={() => onTabClose(tab.id)}
              onDragStart={handleDragStart(tab.id)}
              onDragOver={handleDragOver}
              onDrop={handleDropOutside}
            />
          ))}
        </div>
      )}

      {/* New Group Button/Form */}
      {showNewGroup ? (
        <div style={styles.newGroupForm}>
          <input
            ref={inputRef}
            type="text"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateGroup();
              if (e.key === 'Escape') setShowNewGroup(false);
            }}
            placeholder="Group name..."
            style={styles.input}
          />
          <button style={styles.createBtn} onClick={handleCreateGroup}>
            Create
          </button>
        </div>
      ) : (
        <button style={styles.newGroupBtn} onClick={() => setShowNewGroup(true)}>
          {Icons.plus}
          <span>New Tab Group</span>
        </button>
      )}
    </div>
  );
};

// ==================== HOOK: useTabGroups ====================

export const useTabGroups = () => {
  const [groups, setGroups] = useState<TabGroup[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-tab-groups');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveGroups = useCallback((newGroups: TabGroup[]) => {
    setGroups(newGroups);
    try {
      localStorage.setItem('dex-browser-tab-groups', JSON.stringify(newGroups));
    } catch { /* tab state unavailable */ }
  }, []);

  const createGroup = useCallback((name: string, color: string, tabIds: string[]) => {
    const newGroup: TabGroup = {
      id: `group-${Date.now()}`,
      name,
      color,
      collapsed: false,
      tabIds,
    };
    saveGroups([...groups, newGroup]);
  }, [groups, saveGroups]);

  const updateGroup = useCallback((groupId: string, updates: Partial<TabGroup>) => {
    saveGroups(groups.map(g => g.id === groupId ? { ...g, ...updates } : g));
  }, [groups, saveGroups]);

  const deleteGroup = useCallback((groupId: string) => {
    saveGroups(groups.filter(g => g.id !== groupId));
  }, [groups, saveGroups]);

  const moveTabToGroup = useCallback((tabId: string, groupId: string | null) => {
    saveGroups(groups.map(g => ({
      ...g,
      tabIds: groupId === g.id
        ? [...g.tabIds.filter(id => id !== tabId), tabId]
        : g.tabIds.filter(id => id !== tabId),
    })));
  }, [groups, saveGroups]);

  return {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    moveTabToGroup,
  };
};

export default TabGroups;
