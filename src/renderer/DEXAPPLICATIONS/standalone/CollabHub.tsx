// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - Collab Hub
// Unified collaboration center for all DEX creative apps
// Access from anywhere, dock integration, pro features
// =============================================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  useCollaborationStore, 
  SharedProject,
  Checkpoint,
  hasPermission,
} from '../../services/CollaborationSystem';
import ShareDialog from '../../components/ShareDialog';
import ChatPanel from '../../components/ChatPanel';

// ---------------------------------------------------------------------------
// STYLES
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(180deg, var(--color-bg-elevated, #1a1a1c) 0%, var(--color-bg-base, #0d0d0f) 100%)',
    color: 'var(--color-text-primary, #fff)',
    fontFamily: 'var(--dex-font-ui)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.02))',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(94,92,230,0.3)',
  },
  title: {
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    margin: 0,
    background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
    marginTop: 2,
  },
  headerActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  actionBtn: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 13,
    fontWeight: 500,
    background: 'var(--color-bg-hover, rgba(255,255,255,0.08))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
    borderRadius: 8,
    color: 'var(--color-text-primary, #fff)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s ease',
  },
  actionBtnPrimary: {
    background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)',
    border: 'none',
    boxShadow: '0 4px 16px rgba(10,132,255,0.3)',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: 'var(--space-3) var(--space-6)',
    borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.04))',
  },
  tab: {
    padding: '10px var(--space-5)',
    fontSize: 13,
    fontWeight: 500,
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  tabActive: {
    background: 'var(--color-bg-hover, rgba(255,255,255,0.08))',
    color: 'var(--color-text-primary, #fff)',
  },
  tabBadge: {
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 700,
    background: 'var(--color-accent)',
    color: 'var(--color-accent-text, #fff)',
    borderRadius: 4,
    minWidth: 18,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-6)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 'var(--space-4)',
  },
  card: {
    background: 'var(--color-bg-elevated, linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
    borderRadius: 12,
    padding: 'var(--space-5)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  cardMenu: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--color-text-muted, #636366)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    opacity: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  cardCollaborators: {
    display: 'flex',
    alignItems: 'center',
  },
  cardAvatar: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    marginLeft: -8,
    border: '2px solid var(--color-bg-base, #1a1a1c)',
  },
  cardAvatarMore: {
    background: 'var(--color-bg-active, rgba(255,255,255,0.1))',
    fontSize: 9,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
  },
  cardAppBadge: {
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  cardActions: {
    display: 'flex',
    gap: 6,
  },
  cardActionBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    textAlign: 'center',
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 14,
    background: 'linear-gradient(135deg, rgba(94,92,230,0.15), rgba(191,90,242,0.1))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-5)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 'var(--space-2)',
  },
  checkpointList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  checkpointItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px var(--space-4)',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.04))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  checkpointIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #30d158, #34c759)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkpointInfo: {
    flex: 1,
  },
  checkpointName: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--color-text-primary, #fff)',
    marginBottom: 2,
  },
  checkpointMeta: {
    fontSize: 12,
    color: 'var(--color-text-tertiary, #8e8e93)',
  },
  checkpointActions: {
    display: 'flex',
    gap: 6,
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px var(--space-4)',
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
    borderRadius: 10,
    marginBottom: 'var(--space-5)',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary, #fff)',
    fontSize: 14,
  },
  filterChips: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-5)',
  },
  filterChip: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    background: 'var(--color-bg-hover, rgba(255,255,255,0.06))',
    border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.1))',
    borderRadius: 14,
    color: 'var(--color-text-tertiary, #8e8e93)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  filterChipActive: {
    background: 'var(--color-accent-soft, rgba(10,132,255,0.15))',
    borderColor: 'var(--color-accent-muted, rgba(10,132,255,0.3))',
    color: 'var(--color-accent-text, #0a84ff)',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 'var(--space-3) var(--space-5)',
    margin: '0 var(--space-6) var(--space-4)',
    background: 'linear-gradient(135deg, rgba(255,69,58,0.15), rgba(255,69,58,0.08))',
    border: '1px solid var(--color-error-muted, rgba(255,69,58,0.3))',
    borderRadius: 10,
    fontSize: 13,
    color: 'var(--color-error, #ff453a)',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--color-bg-inset, rgba(0,0,0,0.5))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
};

// App colors and icons
const APP_THEMES: Record<string, { bg: string; color: string; icon: string }> = {
  vinx: { bg: 'linear-gradient(135deg, #ff6b6b, #ee5a5a)', color: '#ff6b6b', icon: 'V' },
  imosion: { bg: 'linear-gradient(135deg, #845ef7, #7048e8)', color: '#845ef7', icon: 'I' },
  prism: { bg: 'linear-gradient(135deg, #22b8cf, #15aabf)', color: '#22b8cf', icon: 'P' },
  flux: { bg: 'linear-gradient(135deg, #ff922b, #fd7e14)', color: '#ff922b', icon: 'F' },
  forge: { bg: 'linear-gradient(135deg, #51cf66, #40c057)', color: '#51cf66', icon: 'G' },
  axl: { bg: 'linear-gradient(135deg, #339af0, #228be6)', color: '#339af0', icon: 'A' },
};

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

type TabId = 'projects' | 'shared' | 'checkpoints' | 'activity';

const CollabHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('projects');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [showShare, setShowShare] = useState<string | null>(null);
  const [showChat, setShowChat] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    currentUser,
    projects,
    setCurrentUser,
    createProject,
    setActiveProject,
    toggleChatPanel,
    handleAccessRequest,
  } = useCollaborationStore();

  // Initialize demo user if not set
  useEffect(() => {
    if (!currentUser) {
      setCurrentUser({
        id: 'user-1',
        email: 'creator@dex.app',
        name: 'DEX User',
      });
    }
  }, [currentUser, setCurrentUser]);

  const projectList = useMemo(() => {
    const list = Array.from(projects.values());
    let filtered = list;

    // Filter by tab
    if (activeTab === 'shared') {
      filtered = filtered.filter(p => p.collaborators.length > 1);
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.appId.toLowerCase().includes(q)
      );
    }

    // Filter by app
    if (filter) {
      filtered = filtered.filter(p => p.appId === filter);
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects, activeTab, search, filter]);

  const allCheckpoints = useMemo(() => {
    const checkpoints: (Checkpoint & { projectName: string })[] = [];
    projects.forEach(p => {
      p.checkpoints.forEach(c => {
        checkpoints.push({ ...c, projectName: p.name });
      });
    });
    return checkpoints.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }, [projects]);

  const pendingRequests = useMemo(() => {
    let count = 0;
    projects.forEach(p => {
      count += p.accessRequests.filter(r => r.status === 'pending').length;
    });
    return count;
  }, [projects]);

  // Activity feed - combines access requests, checkpoints, and system messages
  type ActivityItem = {
    id: string;
    type: 'access_request' | 'checkpoint' | 'invite' | 'project_created';
    projectId: string;
    projectName: string;
    timestamp: number;
    title: string;
    description: string;
    icon: string;
    iconBg: string;
    actionable?: boolean;
    requestId?: string;
    status?: 'pending' | 'approved' | 'denied';
  };

  const activityFeed = useMemo(() => {
    const items: ActivityItem[] = [];

    projects.forEach(p => {
      // Add access requests
      p.accessRequests.forEach(req => {
        items.push({
          id: `req-${req.id}`,
          type: 'access_request',
          projectId: p.id,
          projectName: p.name,
          timestamp: req.timestamp,
          title: req.status === 'pending' 
            ? `${req.requesterName} requested access`
            : req.status === 'approved'
            ? `${req.requesterName} was granted access`
            : `${req.requesterName}'s request was denied`,
          description: req.message || `Requested ${req.requestedRole} access to ${p.name}`,
          icon: req.status === 'pending' ? '!' : req.status === 'approved' ? 'OK' : 'NO',
          iconBg: req.status === 'pending' 
            ? 'linear-gradient(135deg, #ff9f0a, #ff6b00)'
            : req.status === 'approved'
            ? 'linear-gradient(135deg, #30d158, #28a745)'
            : 'linear-gradient(135deg, #ff453a, #dc3545)',
          actionable: req.status === 'pending',
          requestId: req.id,
          status: req.status,
        });
      });

      // Add recent checkpoints
      p.checkpoints.slice(-5).forEach(cp => {
        items.push({
          id: `cp-${cp.id}`,
          type: 'checkpoint',
          projectId: p.id,
          projectName: p.name,
          timestamp: cp.timestamp,
          title: cp.autoSave ? 'Auto-saved checkpoint' : `Checkpoint: ${cp.name}`,
          description: `${cp.creatorName} saved a checkpoint on ${p.name}`,
          icon: 'SAVE',
          iconBg: 'linear-gradient(135deg, #30d158, #34c759)',
        });
      });

      // Add collaborator joins (recent 7 days)
      const recentJoins = p.collaborators.filter(
        c => c.joinedAt > Date.now() - 7 * 24 * 60 * 60 * 1000 && c.role !== 'owner'
      );
      recentJoins.forEach(c => {
        items.push({
          id: `join-${c.id}`,
          type: 'invite',
          projectId: p.id,
          projectName: p.name,
          timestamp: c.joinedAt,
          title: `${c.name} joined`,
          description: `Joined ${p.name} as ${c.role}${c.isVisitor ? ' (visitor)' : ''}`,
          icon: 'USER',
          iconBg: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
        });
      });
    });

    // Sort by timestamp descending
    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }, [projects]);

  const handleApproveRequest = useCallback((projectId: string, requestId: string, approve: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      handleAccessRequest(projectId, requestId, approve);
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { 
          type: 'success', 
          message: approve ? 'Access granted' : 'Request denied'
        }
      }));
    } catch (err: any) {
      console.error('[CollabHub] access request failed:', err);
      setError('Could not update the access request. Please try again.');
      window.dispatchEvent(new CustomEvent('dex-toast', {
        detail: { type: 'error', message: 'Could not update the access request. Please try again.' }
      }));
    } finally {
      setIsLoading(false);
    }
  }, [handleAccessRequest]);

  const handleCreateProject = useCallback(() => {
    const name = prompt('Project name:');
    if (!name) return;
    
    const appId = prompt('App (vinx, imosion, prism, flux, forge, axl):') || 'prism';
    const project = createProject(name, appId);
    setActiveProject(project.id);
    
    window.dispatchEvent(new CustomEvent('dex-toast', {
      detail: { type: 'success', message: `Created "${name}"` }
    }));
  }, [createProject, setActiveProject]);

  const handleOpenProject = useCallback((project: SharedProject) => {
    setActiveProject(project.id);
    // Launch the app
    window.dispatchEvent(new CustomEvent('dex-launch-app', {
      detail: { appId: project.appId }
    }));
  }, [setActiveProject]);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
              <path d="M2 12h20"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.title}>Collab Hub</h1>
            <div style={styles.subtitle}>Real-time collaboration for creative projects</div>
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.actionBtn}
            onClick={() => setShowChat(projectList[0]?.id || null)}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.08))'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Chat
          </button>
          <button
            style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }}
            onClick={handleCreateProject}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {([
          { id: 'projects' as const, label: 'My Projects', icon: 'PRJ', badge: 0 },
          { id: 'shared' as const, label: 'Shared with Me', icon: 'TEAM', badge: 0 },
          { id: 'checkpoints' as const, label: 'Checkpoints', icon: 'SAVE', badge: 0 },
          { id: 'activity' as const, label: 'Activity', icon: 'LOG', badge: pendingRequests },
        ]).map(tab => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.badge > 0 && (
              <span style={styles.tabBadge}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Error Banner */}
        {error && (
          <div style={styles.errorBanner as React.CSSProperties}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ flex: 1 }}>{error}</span>
            <button 
              onClick={() => setError(null)}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: 'var(--color-error, #ff453a)',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Search */}
        {activeTab !== 'checkpoints' && activeTab !== 'activity' && (
          <>
            <div style={styles.searchBar}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                style={styles.searchInput}
                placeholder="Search projects..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div style={styles.filterChips}>
              {['All', 'vinx', 'imosion', 'prism', 'flux', 'forge', 'axl'].map(f => (
                <button
                  key={f}
                  style={{
                    ...styles.filterChip,
                    ...((filter === f || (f === 'All' && !filter)) ? styles.filterChipActive : {}),
                  }}
                  onClick={() => setFilter(f === 'All' ? null : f)}
                >
                  {f === 'All' ? 'All' : `${APP_THEMES[f]?.icon || ''} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Projects Grid */}
        {(activeTab === 'projects' || activeTab === 'shared') && (
          projectList.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5e5ce6" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style={styles.emptyTitle}>No projects yet</div>
              <button
                style={{ ...styles.actionBtn, ...styles.actionBtnPrimary, marginTop: 'var(--space-6)' }}
                onClick={handleCreateProject}
              >
                Create Project
              </button>
            </div>
          ) : (
            <div style={styles.grid}>
              {projectList.map(project => {
                const theme = APP_THEMES[project.appId] || APP_THEMES.prism;
                const collaborators = project.collaborators.slice(0, 4);
                const moreCount = project.collaborators.length - 4;

                return (
                  <div
                    key={project.id}
                    style={styles.card}
                    onClick={() => handleOpenProject(project)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border, rgba(255,255,255,0.15))';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      const menuBtn = e.currentTarget.querySelector('[data-menu-btn]') as HTMLElement;
                      if (menuBtn) menuBtn.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--color-border-subtle, rgba(255,255,255,0.08))';
                      e.currentTarget.style.transform = 'translateY(0)';
                      const menuBtn = e.currentTarget.querySelector('[data-menu-btn]') as HTMLElement;
                      if (menuBtn) menuBtn.style.opacity = '0';
                    }}
                  >
                    <div style={styles.cardHeader}>
                      <div style={{ ...styles.cardIcon, background: theme.bg }}>
                        {theme.icon}
                      </div>
                      <button
                        data-menu-btn
                        style={styles.cardMenu}
                        onClick={e => { e.stopPropagation(); setShowShare(project.id); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                        </svg>
                      </button>
                    </div>

                    <div style={styles.cardTitle}>{project.name}</div>
                    <div style={styles.cardMeta}>
                      <span>Updated {formatTime(project.updatedAt)}</span>
                      <span>•</span>
                      <span>{project.checkpoints.length} checkpoints</span>
                    </div>

                    <div style={styles.cardCollaborators}>
                      {collaborators.map((c, i) => (
                        <div
                          key={c.id}
                          style={{
                            ...styles.cardAvatar,
                            marginLeft: i === 0 ? 0 : -8,
                            zIndex: 10 - i,
                          }}
                          title={c.name}
                        >
                          {c.name[0].toUpperCase()}
                        </div>
                      ))}
                      {moreCount > 0 && (
                        <div style={{ ...styles.cardAvatar, ...styles.cardAvatarMore, zIndex: 5 }}>
                          +{moreCount}
                        </div>
                      )}
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={{ ...styles.cardAppBadge, background: `${theme.color}20`, color: theme.color }}>
                        {project.appId}
                      </span>
                      <div style={styles.cardActions}>
                        <button
                          style={styles.cardActionBtn}
                          onClick={e => { e.stopPropagation(); setShowShare(project.id); }}
                          title="Share"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; e.currentTarget.style.color = 'var(--color-text-primary, #fff)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; e.currentTarget.style.color = 'var(--color-text-tertiary, #8e8e93)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                          </svg>
                        </button>
                        <button
                          style={styles.cardActionBtn}
                          onClick={e => { e.stopPropagation(); setShowChat(project.id); }}
                          title="Chat"
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.12))'; e.currentTarget.style.color = 'var(--color-text-primary, #fff)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; e.currentTarget.style.color = 'var(--color-text-tertiary, #8e8e93)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Checkpoints */}
        {activeTab === 'checkpoints' && (
          allCheckpoints.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="1.5">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
              </div>
              <div style={styles.emptyTitle}>No checkpoints yet</div>
            </div>
          ) : (
            <div style={styles.checkpointList}>
              {allCheckpoints.map(cp => (
                <div
                  key={cp.id}
                  style={styles.checkpointItem}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-active, rgba(255,255,255,0.08))'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.04))'; }}
                >
                  <div style={styles.checkpointIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    </svg>
                  </div>
                  <div style={styles.checkpointInfo}>
                    <div style={styles.checkpointName}>{cp.name}</div>
                    <div style={styles.checkpointMeta}>
                      {cp.projectName} • {formatTime(cp.timestamp)} • by {cp.creatorName}
                      {cp.autoSave && <span style={{ marginLeft: 'var(--space-2)', opacity: 0.6 }}>Auto-saved</span>}
                    </div>
                  </div>
                  <div style={styles.checkpointActions}>
                    <button
                      style={styles.cardActionBtn}
                      title="Restore"
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-success-muted, rgba(48,209,88,0.2))'; e.currentTarget.style.color = 'var(--color-success, #30d158)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-hover, rgba(255,255,255,0.06))'; e.currentTarget.style.color = 'var(--color-text-tertiary, #8e8e93)'; }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Activity */}
        {activeTab === 'activity' && (
          activityFeed.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ff9f0a" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div style={styles.emptyTitle}>No activity yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {activityFeed.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '14px var(--space-4)',
                    background: item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.1), rgba(255,159,10,0.05))'
                      : 'var(--color-bg-hover, rgba(255,255,255,0.04))',
                    border: item.actionable
                      ? '1px solid var(--color-warning-muted, rgba(255,159,10,0.2))'
                      : '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                    borderRadius: 10,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.15), rgba(255,159,10,0.08))'
                      : 'var(--color-bg-active, rgba(255,255,255,0.08))';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = item.actionable
                      ? 'linear-gradient(135deg, rgba(255,159,10,0.1), rgba(255,159,10,0.05))'
                      : 'var(--color-bg-hover, rgba(255,255,255,0.04))';
                  }}
                >
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: item.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontSize: 14, 
                      fontWeight: 500,
                      color: 'var(--color-text-primary, #fff)',
                      marginBottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}>
                      {item.title}
                      {item.status && item.status !== 'pending' && (
                        <span style={{
                          padding: '2px 6px',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 3,
                          background: item.status === 'approved'
                            ? 'var(--color-success-muted, rgba(48,209,88,0.15))'
                            : 'var(--color-error-muted, rgba(255,69,58,0.15))',
                          color: item.status === 'approved' ? 'var(--color-success, #30d158)' : 'var(--color-error, #ff453a)',
                        }}>
                          {item.status}
                        </span>
                      )}
                    </div>
                    <div style={{ 
                      fontSize: 12, 
                      color: 'var(--color-text-tertiary, #8e8e93)',
                      marginBottom: item.actionable ? 10 : 0,
                    }}>
                      {item.description}
                    </div>
                    {item.actionable && item.requestId && (
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          style={{
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--color-success, #30d158)',
                            color: 'var(--color-accent-text, #fff)',
                            border: 'none',
                            borderRadius: 6,
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => handleApproveRequest(item.projectId, item.requestId!, true)}
                          disabled={isLoading}
                          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                        >
                          Approve
                        </button>
                        <button
                          style={{
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'transparent',
                            color: 'var(--color-error, #ff453a)',
                            border: '1px solid var(--color-error-muted, rgba(255,69,58,0.3))',
                            borderRadius: 6,
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => handleApproveRequest(item.projectId, item.requestId!, false)}
                          disabled={isLoading}
                          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ 
                    fontSize: 11,
                    color: 'var(--color-text-tertiary, #636366)',
                    flexShrink: 0,
                  }}>
                    {formatTime(item.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Share Dialog */}
      {showShare && (
        <ShareDialog
          projectId={showShare}
          projectName={projects.get(showShare)?.name || 'Project'}
          onClose={() => setShowShare(null)}
        />
      )}

      {/* Chat Panel */}
      {showChat && (
        <ChatPanel
          projectId={showChat}
          onClose={() => setShowChat(null)}
        />
      )}
    </div>
  );
};

export default CollabHub;
