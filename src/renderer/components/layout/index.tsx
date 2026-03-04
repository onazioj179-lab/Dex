// ═══════════════════════════════════════════════════════════════════════════
// DEX - Layout Components Index
// HIERARCHY & PLACEMENT ENHANCEMENT: Complete layout system
// NOTE: Layout components are planned for future implementation
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';

// Type stubs for compatibility
export interface LayoutState {
  sidebarOpen: boolean;
  searchOpen: boolean;
  breakpoint: string;
}

export interface LayoutActions {
  toggleSidebar: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type PanelPriority = 'primary' | 'secondary';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  description?: string;
}

export type SearchResultType = 'file' | 'page' | 'action' | 'setting';
export type SearchScope = 'all' | 'files' | 'pages' | 'settings';

export interface PageAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface PageLayoutContextValue {
  title: string;
  actions: PageAction[];
}

export interface EmptyStateConfig {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: { label: string; onClick: () => void };
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
}

// Responsive layout hooks with real window size tracking
const getBreakpoint = (w: number): Breakpoint =>
  w < 480 ? 'xs' : w < 640 ? 'sm' : w < 1024 ? 'md' : w < 1280 ? 'lg' : 'xl';

export const useBreakpoint = (): Breakpoint => {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth));
  useEffect(() => {
    let rafId = 0;
    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => setBp(getBreakpoint(window.innerWidth)));
    };
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(rafId);
    };
  }, []);
  return bp;
};

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export const useLayout = () => {
  const bp = useBreakpoint();
  const [sidebarOpen, setSidebarOpen] = useState(bp !== 'xs' && bp !== 'sm');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    if (bp === 'xs' || bp === 'sm') setSidebarOpen(false);
  }, [bp]);
  return { sidebarOpen, searchOpen, breakpoint: bp, setSidebarOpen, setSearchOpen };
};

export const useSidebar = () => {
  const bp = useBreakpoint();
  const [isOpen, setIsOpen] = useState(bp !== 'xs' && bp !== 'sm');
  useEffect(() => {
    if (bp === 'xs' || bp === 'sm') setIsOpen(false);
    else setIsOpen(true);
  }, [bp]);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  return { isOpen, toggle };
};

export const useSearch = () => {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return { isOpen, open, close };
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const ContentWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => <div>{children}</div>;
export const ResponsiveGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div>{children}</div>;
export const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div>{children}</div>;

export const CollapsibleSidebar: React.FC<{ children: React.ReactNode }> = ({ children }) => <aside>{children}</aside>;
export const UniversalSearch: React.FC = () => null;
export const ContextualActions: React.FC = () => null;

export const PageLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const usePageLayout = () => ({ title: '', actions: [] as PageAction[] });

export const EmptyState: React.FC<EmptyStateConfig> = ({ title, description }) => (
  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
);
export const InlineHint: React.FC<{ children: React.ReactNode }> = ({ children }) => <span>{children}</span>;
export const FeatureBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => <div>{children}</div>;
export const ShortcutHint: React.FC<{ shortcut: string }> = ({ shortcut }) => <kbd>{shortcut}</kbd>;
export const DiscoveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const useDiscovery = () => ({ showHints: false });
export const emptyStateConfigs: Record<string, EmptyStateConfig> = {};

export const QuickActions: React.FC = () => null;
