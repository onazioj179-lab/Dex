/**
 * WORKFLOWS - macOS Shortcuts Style Automation Builder
 * Visual automation workflow creator
 */

import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  steps: number;
  lastRun: Date | null;
}

interface ActionBlock {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const Icons = {
  play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  bolt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// SAMPLE DATA
// ═══════════════════════════════════════════════════════════════════════════
// DATA - Load from localStorage
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_BLOCKS: ActionBlock[] = [
  { id: 'a1', name: 'Get Files', category: 'Files', icon: 'F', description: 'Get files from a folder' },
  { id: 'a2', name: 'Copy File', category: 'Files', icon: 'C', description: 'Copy file to destination' },
  { id: 'a3', name: 'Move File', category: 'Files', icon: 'M', description: 'Move file to folder' },
  { id: 'a4', name: 'Create Note', category: 'Notes', icon: 'N', description: 'Create a new note' },
  { id: 'a5', name: 'Send Message', category: 'Communication', icon: 'S', description: 'Send a notification' },
  { id: 'a6', name: 'Wait', category: 'Control', icon: 'W', description: 'Wait for duration' },
  { id: 'a7', name: 'Run Script', category: 'Scripting', icon: 'R', description: 'Execute custom script' },
  { id: 'a8', name: 'Open App', category: 'Apps', icon: 'A', description: 'Launch an application' },
];

// Load/save workflows - IPC first, localStorage fallback
const loadWorkflows = async (): Promise<Workflow[]> => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.getAll) {
      const remote = await dex.workflows.getAll();
      if (Array.isArray(remote) && remote.length > 0) {
        return remote.map((w: any) => ({
          ...w,
          lastRun: w.lastRun ? new Date(w.lastRun) : null,
        }));
      }
    }
  } catch { /* IPC unavailable */ }
  // Fallback to localStorage
  try {
    const saved = localStorage.getItem('dex-workflows');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((w: any) => ({
        ...w,
        lastRun: w.lastRun ? new Date(w.lastRun) : null,
      }));
    }
  } catch { /* localStorage unavailable */ }
  return [];
};

const saveWorkflow = async (workflow: Workflow) => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.save) {
      await dex.workflows.save(workflow);
      return;
    }
  } catch { /* IPC unavailable */ }
  // Fallback: save all to localStorage
  try {
    const saved = localStorage.getItem('dex-workflows');
    const all: Workflow[] = saved ? JSON.parse(saved) : [];
    const idx = all.findIndex(w => w.id === workflow.id);
    if (idx >= 0) all[idx] = workflow; else all.unshift(workflow);
    localStorage.setItem('dex-workflows', JSON.stringify(all));
  } catch { /* ignore */ }
};

const deleteWorkflowIPC = async (id: string) => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.delete) {
      await dex.workflows.delete(id);
      return;
    }
  } catch { /* IPC unavailable */ }
  // Fallback: remove from localStorage
  try {
    const saved = localStorage.getItem('dex-workflows');
    if (saved) {
      const all: Workflow[] = JSON.parse(saved);
      localStorage.setItem('dex-workflows', JSON.stringify(all.filter(w => w.id !== id)));
    }
  } catch { /* ignore */ }
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const Workflows: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('workflows');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load workflows from IPC on mount
  useEffect(() => {
    let cancelled = false;
    loadWorkflows().then(loaded => {
      if (!cancelled) setWorkflows(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  const filteredWorkflows = useMemo(() => workflows.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description.toLowerCase().includes(searchQuery.toLowerCase())
  ), [workflows, searchQuery]);

  const runWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.map(w => 
      w.id === id ? { ...w, lastRun: new Date() } : w
    ));
    const dex = window.dex;
    if (dex?.workflows?.execute) {
      dex.workflows.execute(id).catch(() => { /* IPC unavailable */ });
    }
  }, []);

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    deleteWorkflowIPC(id);
    if (selectedWorkflow?.id === id) {
      setSelectedWorkflow(null);
    }
  }, [selectedWorkflow]);

  const createWorkflow = useCallback(() => {
    const newWorkflow: Workflow = {
      id: Date.now().toString(),
      name: 'New Workflow',
      description: 'Add a description...',
      icon: 'W',
      color: 'var(--color-accent)',
      steps: 0,
      lastRun: null,
    };
    setWorkflows(prev => [newWorkflow, ...prev]);
    setSelectedWorkflow(newWorkflow);
    setIsEditing(true);
    saveWorkflow(newWorkflow);
  }, []);

  const formatLastRun = (date: Date | null): string => {
    if (!date) return 'Never run';
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Shortcuts</span>
        </div>
        
        <div style={styles.sidebarContent}>
          <button
            aria-label="View all shortcuts"
            style={{
              ...styles.sidebarItem,
              background: !selectedWorkflow ? 'var(--color-accent-muted)' : 'transparent',
              color: !selectedWorkflow ? 'var(--color-accent)' : 'var(--color-text-primary)',
            }}
            onClick={() => setSelectedWorkflow(null)}
          >
            {Icons.grid}
            <span>All Shortcuts</span>
            <span style={styles.sidebarCount}>{workflows.length}</span>
          </button>
          
          <div style={styles.sectionLabel}>Categories</div>
          {['Files', 'Notes', 'Apps', 'Communication'].map(category => (
            <button key={category} aria-label={`Browse ${category} category`} style={styles.sidebarItem} onClick={() => setSelectedWorkflow(workflows.find(w => w.name.toLowerCase().includes(category.toLowerCase())) || null)}>
              {Icons.folder}
              <span>{category}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {!isEditing ? (
          <>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.headerLeft}>
                <h1 style={styles.title}>All Shortcuts</h1>
                <span style={styles.subtitle}>{workflows.length} shortcuts</span>
              </div>
              <div style={styles.headerRight}>
                <div style={styles.searchBox}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={styles.searchInput}
                  />
                </div>
                <button style={styles.createBtn} aria-label="Create new shortcut" onClick={createWorkflow}>
                  {Icons.plus}
                  <span>New Shortcut</span>
                </button>
              </div>
            </div>

            {/* Workflow Grid */}
            <div style={styles.workflowGrid}>
              {filteredWorkflows.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' as const }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <div style={{ fontSize: '18px', fontWeight: 600, marginTop: '16px', color: 'var(--color-text-primary)' }}>
                    {searchQuery ? 'No shortcuts found' : 'No shortcuts yet'}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    {searchQuery ? `No results for "${searchQuery}"` : 'Create your first shortcut to automate tasks'}
                  </div>
                  {!searchQuery && (
                    <button style={{ ...styles.createBtn, marginTop: '16px' }} onClick={createWorkflow}>
                      {Icons.plus}
                      <span>New Shortcut</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredWorkflows.map(workflow => (
                <div key={workflow.id} style={styles.workflowCard}>
                  <div style={styles.cardHeader}>
                    <div style={{...styles.cardIcon, background: `${workflow.color}20`}}>
                      <span style={{ fontSize: '24px' }}>{workflow.icon}</span>
                    </div>
                    <div style={styles.cardActions}>
                      <button
                        style={styles.cardActionBtn}
                        aria-label="Edit workflow"
                        onClick={() => {
                          setSelectedWorkflow(workflow);
                          setIsEditing(true);
                        }}
                      >
                        {Icons.edit}
                      </button>
                      <button
                        style={{...styles.cardActionBtn, color: 'var(--color-error)'}}
                        aria-label="Delete workflow"
                        onClick={() => deleteWorkflow(workflow.id)}
                      >
                        {Icons.trash}
                      </button>
                    </div>
                  </div>
                  
                  <h3 style={styles.cardTitle}>{workflow.name}</h3>
                  <p style={styles.cardDescription}>{workflow.description}</p>
                  
                  <div style={styles.cardFooter}>
                    <span style={styles.cardMeta}>
                      {workflow.steps} steps • {formatLastRun(workflow.lastRun)}
                    </span>
                    <button
                      style={{...styles.runBtn, background: `${workflow.color}22`, border: `1px solid ${workflow.color}40`, color: workflow.color}}
                      aria-label="Run workflow"
                      onClick={() => runWorkflow(workflow.id)}
                    >
                      {Icons.play}
                    </button>
                  </div>
                </div>
              ))
              )}
            </div>
          </>
        ) : (
          // Editor View
          <div style={styles.editor}>
            <div style={styles.editorHeader}>
              <button
                style={styles.backBtn}
                onClick={() => setIsEditing(false)}
                aria-label="Go back"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:4,verticalAlign:'middle'}}><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg> Back
              </button>
              <input
                type="text"
                value={selectedWorkflow?.name || ''}
                onChange={(e) => {
                  const newName = e.target.value;
                  setSelectedWorkflow(prev => prev ? { ...prev, name: newName } : prev);
                }}
                style={styles.workflowNameInput}
                placeholder="Workflow name"
              />
              <button style={styles.saveBtn} aria-label="Save workflow" onClick={() => { if (selectedWorkflow) setWorkflows(prev => prev.map(w => w.id === selectedWorkflow.id ? selectedWorkflow : w)); }}>Save</button>
            </div>
            
            <div style={styles.editorContent}>
              <div style={styles.editorMain}>
                <div style={styles.emptyEditor}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span style={{ fontSize: '16px', marginBottom: '8px', marginTop: '16px' }}>Add actions to your shortcut</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    Drag actions from the sidebar to build your workflow
                  </span>
                </div>
              </div>
              
              <div style={styles.actionLibrary}>
                <div style={styles.libraryHeader}>
                  <span style={styles.libraryTitle}>Actions</span>
                </div>
                <div style={styles.actionList}>
                  {ACTION_BLOCKS.map(action => (
                    <div key={action.id} style={styles.actionItem}>
                      <span style={styles.actionIcon}>{action.icon}</span>
                      <div style={styles.actionInfo}>
                        <span style={styles.actionName}>{action.name}</span>
                        <span style={styles.actionDesc}>{action.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '13px',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  
  // Sidebar
  sidebar: {
    width: '220px',
    background: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    height: '52px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sidebarContent: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    color: 'var(--color-text-primary)',
    transition: 'all 0.15s ease',
  },
  sidebarCount: {
    marginLeft: 'auto',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    padding: '16px 12px 8px',
    letterSpacing: '0.5px',
  },
  
  // Main
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  headerLeft: {},
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '8px',
    color: 'var(--color-text-muted)',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    width: '150px',
  },
  createBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-accent)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Workflow Grid
  workflowGrid: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
    alignContent: 'start',
  },
  workflowCard: {
    background: 'var(--color-bg-elevated)',
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: {
    display: 'flex',
    gap: '4px',
  },
  cardActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
  },
  cardDescription: {
    fontSize: '13px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: '12px',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  cardMeta: {
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  runBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  
  // Editor
  editor: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  editorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--color-border)',
  },
  backBtn: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-bg-hover)',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  workflowNameInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '16px',
    fontWeight: 600,
    outline: 'none',
  },
  saveBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'var(--color-success)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  editorContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  editorMain: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  emptyEditor: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
  },
  actionLibrary: {
    width: '280px',
    borderLeft: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-secondary)',
  },
  libraryHeader: {
    padding: '16px',
    borderBottom: '1px solid var(--color-border)',
  },
  libraryTitle: {
    fontSize: '14px',
    fontWeight: 600,
  },
  actionList: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  actionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'grab',
    marginBottom: '4px',
    background: 'var(--color-bg-elevated)',
  },
  actionIcon: {
    fontSize: '18px',
  },
  actionInfo: {
    flex: 1,
  },
  actionName: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '2px',
  },
  actionDesc: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
};

Workflows.displayName = 'Workflows';
export default memo(Workflows);

