// ═══════════════════════════════════════════════════════════════════════════
// DEX - Navigation Dock
// MINIMAL OS: Clean dock, no backdrop blur, pure black, accent blue only
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Icons - Clean 18px, minimal stroke
// ─────────────────────────────────────────────────────────────────────────────

const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  browser: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  ),
  files: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  apps: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  system: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Items - Simplified with Apps launcher
// ─────────────────────────────────────────────────────────────────────────────

interface SubPage {
  id: string;
  label: string;
  shortcut?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: JSX.Element;
  defaultPage: string;
  pages: string[];
  subPages: SubPage[];
  shortcut?: string;
}

// Cross-OS shortcut helper: Ctrl on Windows/Linux, Cmd on Mac
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const MOD = isMac ? '⌘' : 'Ctrl';

const NAV_ITEMS: NavItem[] = [
  { 
    id: 'home', 
    label: 'Home', 
    icon: Icons.home, 
    defaultPage: 'home',
    pages: ['home', 'dashboard'], 
    subPages: [
      { id: 'home', label: 'Home' },
    ],
    shortcut: `${MOD}+1`,
  },
  { 
    id: 'files', 
    label: 'Files', 
    icon: Icons.files, 
    defaultPage: 'files',
    pages: ['files', 'transfers'], 
    subPages: [
      { id: 'files', label: 'Files' },
      { id: 'transfers', label: 'Transfers' },
    ],
    shortcut: `${MOD}+2`,
  },
  { 
    id: 'browser', 
    label: 'Browser', 
    icon: Icons.browser, 
    defaultPage: 'browser',
    pages: ['browser', 'sessions'], 
    subPages: [
      { id: 'browser', label: 'Browser' },
      { id: 'sessions', label: 'Sessions' },
    ],
    shortcut: `${MOD}+3`,
  },
  { 
    id: 'apps', 
    label: 'Apps', 
    icon: Icons.apps, 
    defaultPage: 'apps',
    pages: ['apps'], 
    subPages: [
      { id: 'imosion', label: 'Imosion DAW', shortcut: 'Alt+I' },
      { id: 'videoeditor', label: 'VINX Video', shortcut: 'Alt+V' },
      { id: 'prism', label: 'PRISM Image', shortcut: 'Alt+P' },
      { id: 'flux', label: 'FLUX Motion', shortcut: 'Alt+F' },
      { id: 'forge', label: 'FORGE Encoder', shortcut: 'Alt+G' },
    ],
    shortcut: `${MOD}+4`,
  },
  { 
    id: 'system', 
    label: 'Settings', 
    icon: Icons.system, 
    defaultPage: 'settings',
    pages: ['settings', 'power', 'integrity', 'security'], 
    subPages: [
      { id: 'settings', label: 'Settings' },
      { id: 'power', label: 'Power' },
    ],
    shortcut: `${MOD}+5`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dock Item with Hover Menu
// ─────────────────────────────────────────────────────────────────────────────

interface DockItemProps {
  item: NavItem;
  isActive: boolean;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const DockItem: React.FC<DockItemProps> = ({ item, isActive, currentPage, onNavigate }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuTimeout, setMenuTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const handleMouseEnter = () => {
    if (menuTimeout) clearTimeout(menuTimeout);
    if (item.subPages.length > 1 || item.id === 'apps') {
      setShowMenu(true);
    }
  };
  
  const handleMouseLeave = () => {
    const timeout = setTimeout(() => setShowMenu(false), 150);
    setMenuTimeout(timeout);
  };
  
  const handleClick = () => {
    // For apps, show menu on click instead of navigating
    if (item.id === 'apps') {
      setShowMenu(prev => !prev);
    } else {
      onNavigate(item.defaultPage);
    }
  };
  
  return (
    <div 
      className="dock-item-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        className={`dock-item ${isActive ? 'active' : ''}`}
        aria-label={item.label}
        title={`${item.label} (${item.shortcut || ''})`}
      >
        <span className="dock-icon">{item.icon}</span>
      </button>
      
      {/* Hover menu for sub-pages */}
      {showMenu && item.subPages.length > 0 && (
        <div className="dock-menu">
          <div className="dock-menu-header">
            <span>{item.label}</span>
            {item.shortcut && <span className="dock-shortcut">{item.shortcut}</span>}
          </div>
          {item.subPages.map(sub => (
            <button
              key={sub.id}
              onClick={() => {
                onNavigate(sub.id);
                setShowMenu(false);
              }}
              className={`dock-menu-item ${currentPage === sub.id ? 'active' : ''}`}
            >
              <span>{sub.label}</span>
              {sub.shortcut && <span className="dock-menu-shortcut">{sub.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Dock Component
// ─────────────────────────────────────────────────────────────────────────────

interface BottomNavBarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentPage, onNavigate }) => {
  const getActiveNavItem = () => {
    for (const item of NAV_ITEMS) {
      if (item.pages.includes(currentPage)) return item.id;
    }
    // Check if current page is a DEX app
    const dexApps = ['imosion', 'videoeditor', 'prism', 'flux', 'forge'];
    if (dexApps.includes(currentPage)) return 'apps';
    return 'home';
  };

  const activeNavId = getActiveNavItem();

  // Global keyboard shortcuts for navigation (cross-OS compatible)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isModKey = e.ctrlKey || e.metaKey;
    
    // Ctrl/Cmd + 1-5 for main nav
    if (isModKey && !e.altKey && !e.shiftKey) {
      const navMap: Record<string, string> = {
        '1': 'home',
        '2': 'files', 
        '3': 'browser',
        '4': 'imosion', // Apps default to Imosion
        '5': 'settings',
      };
      if (navMap[e.key]) {
        e.preventDefault();
        onNavigate(navMap[e.key]);
      }
    }
    
    // Alt + key for DEX apps (works on all OS)
    if (e.altKey && !isModKey && !e.shiftKey) {
      const appMap: Record<string, string> = {
        'i': 'imosion',
        'v': 'videoeditor',
        'p': 'prism',
        'f': 'flux',
        'g': 'forge',
      };
      const key = e.key.toLowerCase();
      if (appMap[key]) {
        e.preventDefault();
        onNavigate(appMap[key]);
      }
    }
  }, [onNavigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <nav className="dock">
      <div className="dock-divider" />
      
      {NAV_ITEMS.map(item => (
        <DockItem
          key={item.id}
          item={item}
          isActive={activeNavId === item.id}
          currentPage={currentPage}
          onNavigate={onNavigate}
        />
      ))}

      <style>{`
        .dock {
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 2px;
          padding: 6px;
          background: rgba(30,30,30,0.78);
          backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          z-index: 1000;
        }
        
        .dock-item-wrapper {
          position: relative;
        }
        
        .dock-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.1);
          margin: 8px 4px;
        }
        
        .search-btn {
          color: rgba(255, 255, 255, 0.5);
        }
        
        .search-btn:hover {
          color: #0a84ff;
        }
        
        .dock-item {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: all 80ms ease;
        }
        
        .dock-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.8);
        }
        
        .dock-item.active {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        
        .dock-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        /* Hover menu - glass */
        .dock-menu {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          min-width: 120px;
          background: rgba(30,30,30,0.82);
          backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 8px;
          overflow: hidden;
          animation: menuSlide 100ms ease;
        }
        
        .dock-menu-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          font-size: 10px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.25);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .dock-shortcut {
          font-size: 10px;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.15);
        }
        
        .dock-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          background: transparent;
          border: none;
          text-align: left;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: background 80ms ease;
        }
        
        .dock-menu-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.9);
        }
        
        .dock-menu-item.active {
          color: #0a84ff;
        }
        
        .dock-menu-shortcut {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.25);
          font-family: system-ui, -apple-system, sans-serif;
        }
        
        @keyframes menuSlide {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </nav>
  );
};

export default BottomNavBar;
