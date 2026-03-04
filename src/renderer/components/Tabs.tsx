/**
 * DEX Tabs Component
 * Tab navigation and content switching
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  closable?: boolean;
  badge?: string | number;
  content?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  onClose?: (tabId: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  variant?: 'default' | 'pills' | 'underline' | 'enclosed';
  size?: 'small' | 'medium' | 'large';
  orientation?: 'horizontal' | 'vertical';
  fullWidth?: boolean;
  scrollable?: boolean;
  draggable?: boolean;
  addButton?: boolean;
  onAdd?: () => void;
}

interface TabPanelProps {
  children: React.ReactNode;
  tabId: string;
  activeTab: string;
  keepMounted?: boolean;
}

// ==================== TABS ====================

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab: controlledActive,
  defaultTab,
  onChange,
  onClose,
  onReorder,
  variant = 'default',
  size = 'medium',
  orientation = 'horizontal',
  fullWidth = false,
  scrollable = false,
  draggable = false,
  addButton = false,
  onAdd,
}) => {
  const [internalActive, setInternalActive] = useState(defaultTab || tabs[0]?.id);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState({ left: false, right: false });

  const activeTab = controlledActive ?? internalActive;

  // Check scroll overflow
  useEffect(() => {
    if (!scrollable) return;

    const checkScroll = () => {
      const el = tabListRef.current;
      if (!el) return;

      setShowScrollButtons({
        left: el.scrollLeft > 0,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      });
    };

    const el = tabListRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }

    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [scrollable, tabs]);

  const handleTabClick = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab?.disabled) return;

    setInternalActive(tabId);
    onChange?.(tabId);
  }, [tabs, onChange]);

  const handleClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onClose?.(tabId);

    // If closing active tab, switch to adjacent
    if (tabId === activeTab) {
      const index = tabs.findIndex(t => t.id === tabId);
      const newActive = tabs[index + 1]?.id || tabs[index - 1]?.id;
      if (newActive) {
        setInternalActive(newActive);
        onChange?.(newActive);
      }
    }
  }, [tabs, activeTab, onClose, onChange]);

  const handleDragStart = useCallback((tabId: string) => {
    if (!draggable) return;
    setDraggedTab(tabId);
  }, [draggable]);

  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== tabId) {
      setDragOverTab(tabId);
    }
  }, [draggedTab]);

  const handleDrop = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (!draggedTab || draggedTab === tabId) return;

    const fromIndex = tabs.findIndex(t => t.id === draggedTab);
    const toIndex = tabs.findIndex(t => t.id === tabId);

    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder?.(fromIndex, toIndex);
    }

    setDraggedTab(null);
    setDragOverTab(null);
  }, [draggedTab, tabs, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null);
    setDragOverTab(null);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = tabListRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.5;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  // Size config
  const sizeConfig = {
    small: { padding: '6px 12px', fontSize: 12, iconSize: 14 },
    medium: { padding: '8px 16px', fontSize: 14, iconSize: 16 },
    large: { padding: '12px 24px', fontSize: 16, iconSize: 20 },
  };

  const config = sizeConfig[size];

  // Styles
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: orientation === 'vertical' ? 'row' : 'column',
      width: '100%',
    },
    tabListWrapper: {
      display: 'flex',
      alignItems: 'center',
      position: 'relative',
      ...(orientation === 'vertical' && {
        flexDirection: 'column',
        minWidth: 160,
        borderRight: '1px solid var(--color-border)',
      }),
    },
    tabList: {
      display: 'flex',
      flexDirection: orientation === 'vertical' ? 'column' : 'row',
      gap: variant === 'pills' ? 8 : 0,
      ...(orientation === 'horizontal' && {
        borderBottom: variant !== 'pills' ? '1px solid var(--color-border)' : 'none',
      }),
      ...(scrollable && {
        overflow: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }),
      ...(fullWidth && { width: '100%' }),
    },
    tab: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: config.padding,
      fontSize: config.fontSize,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
      position: 'relative',
      ...(fullWidth && { flex: 1, justifyContent: 'center' }),
    },
    tabActive: {
      color: 'var(--color-accent)',
    },
    tabDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    tabDragOver: {
      background: 'var(--color-bg-hover)',
    },
    underline: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      background: 'var(--color-accent)',
    },
    pill: {
      background: 'var(--color-accent)',
      color: 'white',
      borderRadius: 6,
    },
    enclosed: {
      border: '1px solid var(--color-border)',
      borderBottom: 'none',
      borderRadius: '6px 6px 0 0',
      marginBottom: -1,
      background: 'var(--color-bg-secondary)',
    },
    enclosedActive: {
      background: 'var(--color-bg-primary)',
      borderBottomColor: 'var(--color-bg-primary)',
    },
    closeButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16,
      height: 16,
      marginLeft: 4,
      padding: 0,
      background: 'transparent',
      border: 'none',
      borderRadius: 3,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      fontSize: 14,
      lineHeight: 1,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      padding: '0 6px',
      fontSize: 11,
      fontWeight: 600,
      background: 'var(--color-accent)',
      color: 'white',
      borderRadius: 9,
    },
    scrollButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text)',
      flexShrink: 0,
    },
    addButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      background: 'transparent',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 18,
      marginLeft: 4,
    },
    content: {
      flex: 1,
      padding: 16,
    },
  };

  const getTabStyle = (tab: Tab, isActive: boolean) => {
    let style = { ...styles.tab };

    if (isActive) {
      style = { ...style, ...styles.tabActive };

      if (variant === 'pills') {
        style = { ...style, ...styles.pill };
      } else if (variant === 'enclosed') {
        style = { ...style, ...styles.enclosed, ...styles.enclosedActive };
      }
    } else if (variant === 'enclosed') {
      style = { ...style, ...styles.enclosed };
    }

    if (tab.disabled) {
      style = { ...style, ...styles.tabDisabled };
    }

    if (dragOverTab === tab.id) {
      style = { ...style, ...styles.tabDragOver };
    }

    return style;
  };

  const activeTabContent = tabs.find(t => t.id === activeTab)?.content;

  return (
    <div style={styles.container}>
      <div style={styles.tabListWrapper}>
        {scrollable && showScrollButtons.left && (
          <button style={styles.scrollButton} onClick={() => scroll('left')}>
            ◀
          </button>
        )}

        <div ref={tabListRef} style={styles.tabList} role="tablist">
          {tabs.map(tab => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-disabled={tab.disabled}
                style={getTabStyle(tab, isActive)}
                onClick={() => handleTabClick(tab.id)}
                draggable={draggable && !tab.disabled}
                onDragStart={() => handleDragStart(tab.id)}
                onDragOver={e => handleDragOver(e, tab.id)}
                onDrop={e => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
              >
                {tab.icon && <span style={{ fontSize: config.iconSize }}>{tab.icon}</span>}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span style={styles.badge}>{tab.badge}</span>
                )}
                {tab.closable && (
                  <button
                    style={styles.closeButton}
                    onClick={e => handleClose(e, tab.id)}
                    title="Close tab"
                  >
                    ×
                  </button>
                )}
                {variant === 'underline' && isActive && (
                  <div style={styles.underline} />
                )}
              </button>
            );
          })}

          {addButton && (
            <button style={styles.addButton} onClick={onAdd} title="Add tab">
              +
            </button>
          )}
        </div>

        {scrollable && showScrollButtons.right && (
          <button style={styles.scrollButton} onClick={() => scroll('right')}>
            ▶
          </button>
        )}
      </div>

      {activeTabContent && <div style={styles.content}>{activeTabContent}</div>}
    </div>
  );
};

// ==================== TAB PANEL ====================

export const TabPanel: React.FC<TabPanelProps> = ({
  children,
  tabId,
  activeTab,
  keepMounted = false,
}) => {
  const isActive = tabId === activeTab;

  if (!keepMounted && !isActive) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      hidden={!isActive}
      style={{ display: isActive ? 'block' : 'none' }}
    >
      {children}
    </div>
  );
};

// ==================== HOOK: useTabs ====================

export const useTabs = (initialTabs: Tab[], defaultActive?: string) => {
  const [tabs, setTabs] = useState(initialTabs);
  const [activeTab, setActiveTab] = useState(defaultActive || initialTabs[0]?.id);

  const addTab = useCallback((tab: Tab, activate = true) => {
    setTabs(prev => {
      if (prev.some(t => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    if (activate) setActiveTab(tab.id);
  }, []);

  const removeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const index = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.filter(t => t.id !== tabId);

      // Switch to adjacent tab if removing active
      if (tabId === activeTab && newTabs.length > 0) {
        const newActive = prev[index + 1]?.id || prev[index - 1]?.id || newTabs[0]?.id;
        setActiveTab(newActive);
      }

      return newTabs;
    });
  }, [activeTab]);

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setTabs(prev =>
      prev.map(t => (t.id === tabId ? { ...t, ...updates } : t))
    );
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTab('');
  }, []);

  const closeOtherTabs = useCallback((keepTabId: string) => {
    setTabs(prev => prev.filter(t => t.id === keepTabId || !t.closable));
    setActiveTab(keepTabId);
  }, []);

  return {
    tabs,
    activeTab,
    setActiveTab,
    addTab,
    removeTab,
    updateTab,
    reorderTabs,
    closeAllTabs,
    closeOtherTabs,
  };
};

export default Tabs;
