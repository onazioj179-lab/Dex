/**
 * DEX Workspace Panel
 * Manages workspace layouts, presets, and project organization
 */
import React, { useState, useCallback, useEffect, memo } from 'react';

// ==================== TYPES ====================
export interface WorkspaceLayout {
  id: string;
  name: string;
  panels: PanelConfig[];
  isDefault?: boolean;
}

export interface PanelConfig {
  id: string;
  type: string;
  position: 'left' | 'right' | 'top' | 'bottom' | 'center';
  width?: number;
  height?: number;
  isVisible: boolean;
  isCollapsed?: boolean;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  description: string;
  layout: WorkspaceLayout;
  category: 'audio' | 'video' | 'image' | 'general';
}

// ==================== PRESETS ====================
export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'audio-default',
    name: 'Audio Production',
    description: 'Optimized for music production',
    category: 'audio',
    layout: {
      id: 'audio-default-layout',
      name: 'Audio Production',
      panels: [
        { id: 'browser', type: 'browser', position: 'left', width: 250, isVisible: true },
        { id: 'mixer', type: 'mixer', position: 'bottom', height: 200, isVisible: true },
        { id: 'timeline', type: 'timeline', position: 'center', isVisible: true },
        { id: 'inspector', type: 'inspector', position: 'right', width: 300, isVisible: true },
      ],
      isDefault: true,
    },
  },
  {
    id: 'video-editing',
    name: 'Video Editing',
    description: 'Layout for video editing workflow',
    category: 'video',
    layout: {
      id: 'video-editing-layout',
      name: 'Video Editing',
      panels: [
        { id: 'media', type: 'media-browser', position: 'left', width: 300, isVisible: true },
        { id: 'preview', type: 'preview', position: 'center', isVisible: true },
        { id: 'timeline', type: 'timeline', position: 'bottom', height: 250, isVisible: true },
        { id: 'effects', type: 'effects', position: 'right', width: 280, isVisible: true },
      ],
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean workspace with essential panels only',
    category: 'general',
    layout: {
      id: 'minimal-layout',
      name: 'Minimal',
      panels: [
        { id: 'main', type: 'main', position: 'center', isVisible: true },
        { id: 'toolbar', type: 'toolbar', position: 'top', height: 40, isVisible: true },
      ],
    },
  },
  {
    id: 'dual-monitor',
    name: 'Dual Monitor',
    description: 'Optimized for dual screen setup',
    category: 'general',
    layout: {
      id: 'dual-monitor-layout',
      name: 'Dual Monitor',
      panels: [
        { id: 'browser', type: 'browser', position: 'left', width: 300, isVisible: true },
        { id: 'main', type: 'main', position: 'center', isVisible: true },
        { id: 'inspector', type: 'inspector', position: 'right', width: 350, isVisible: true },
        { id: 'mixer', type: 'mixer', position: 'bottom', height: 180, isVisible: true },
      ],
    },
  },
  {
    id: 'photo-editing',
    name: 'Photo Editing',
    description: 'Layout for image editing',
    category: 'image',
    layout: {
      id: 'photo-editing-layout',
      name: 'Photo Editing',
      panels: [
        { id: 'layers', type: 'layers', position: 'right', width: 250, isVisible: true },
        { id: 'tools', type: 'tools', position: 'left', width: 60, isVisible: true },
        { id: 'canvas', type: 'canvas', position: 'center', isVisible: true },
        { id: 'properties', type: 'properties', position: 'right', width: 280, isVisible: true, isCollapsed: true },
      ],
    },
  },
];

// ==================== STORAGE ====================
const WORKSPACE_KEY = 'dex-workspace-layouts';
const CURRENT_LAYOUT_KEY = 'dex-current-layout';

export const saveWorkspaceLayouts = (layouts: WorkspaceLayout[]): void => {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(layouts));
  } catch { /* workspace state unavailable */ }
};

export const getWorkspaceLayouts = (): WorkspaceLayout[] => {
  try {
    const saved = localStorage.getItem(WORKSPACE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* workspace state unavailable */ }
  return WORKSPACE_PRESETS.map(p => p.layout);
};

export const saveCurrentLayout = (layoutId: string): void => {
  try {
    localStorage.setItem(CURRENT_LAYOUT_KEY, layoutId);
  } catch { /* workspace state unavailable */ }
};

export const getCurrentLayoutId = (): string => {
  try {
    return localStorage.getItem(CURRENT_LAYOUT_KEY) || 'audio-default-layout';
  } catch {
    return 'audio-default-layout';
  }
};

// ==================== HOOKS ====================
export const useWorkspace = () => {
  const [layouts, setLayouts] = useState<WorkspaceLayout[]>([]);
  const [currentLayoutId, setCurrentLayoutId] = useState<string>('');
  
  useEffect(() => {
    setLayouts(getWorkspaceLayouts());
    setCurrentLayoutId(getCurrentLayoutId());
  }, []);
  
  const switchLayout = useCallback((layoutId: string) => {
    setCurrentLayoutId(layoutId);
    saveCurrentLayout(layoutId);
  }, []);
  
  const saveLayout = useCallback((layout: WorkspaceLayout) => {
    setLayouts(prev => {
      const existing = prev.findIndex(l => l.id === layout.id);
      const updated = existing >= 0
        ? prev.map(l => l.id === layout.id ? layout : l)
        : [...prev, layout];
      saveWorkspaceLayouts(updated);
      return updated;
    });
  }, []);
  
  const deleteLayout = useCallback((layoutId: string) => {
    setLayouts(prev => {
      const updated = prev.filter(l => l.id !== layoutId);
      saveWorkspaceLayouts(updated);
      return updated;
    });
  }, []);
  
  const currentLayout = layouts.find(l => l.id === currentLayoutId) || layouts[0];
  
  return {
    layouts,
    currentLayout,
    currentLayoutId,
    switchLayout,
    saveLayout,
    deleteLayout,
  };
};

// ==================== COMPONENTS ====================
interface WorkspaceSelectorProps {
  currentLayoutId: string;
  onSelect: (layoutId: string) => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = memo(({ currentLayoutId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const layouts = getWorkspaceLayouts();
  
  return (
    <div style={styles.selector}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={styles.selectorBtn}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
        </svg>
        <span>Workspace</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points={isOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
        </svg>
      </button>
      
      {isOpen && (
        <div style={styles.dropdown}>
          {WORKSPACE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => { onSelect(preset.layout.id); setIsOpen(false); }}
              style={{
                ...styles.dropdownItem,
                background: currentLayoutId === preset.layout.id ? 'var(--color-accent, #007aff)' : 'transparent',
              }}
            >
              <span>{preset.name}</span>
              <span style={styles.categoryBadge}>{preset.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

WorkspaceSelector.displayName = 'WorkspaceSelector';

interface SaveWorkspaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

export const SaveWorkspaceDialog: React.FC<SaveWorkspaceDialogProps> = memo(({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
      setName('');
      onClose();
    }
  };
  
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <h3 style={styles.dialogTitle}>Save Workspace</h3>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Workspace name..."
          autoFocus
          style={styles.input}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />
        <div style={styles.dialogButtons}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} style={styles.saveBtn}>Save</button>
        </div>
      </div>
    </div>
  );
});

SaveWorkspaceDialog.displayName = 'SaveWorkspaceDialog';

// ==================== STYLES ====================
const styles: Record<string, React.CSSProperties> = {
  selector: {
    position: 'relative',
  },
  selectorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: 'none',
    borderRadius: 6,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    cursor: 'pointer',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 200,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    zIndex: 1000,
  },
  dropdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    color: 'var(--color-text-primary, #fff)',
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
  },
  categoryBadge: {
    fontSize: 10,
    opacity: 0.6,
    textTransform: 'uppercase',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  dialog: {
    width: 360,
    padding: 24,
    background: 'var(--color-bg-elevated, #2a2a2a)',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  dialogTitle: {
    margin: '0 0 16px 0',
    fontSize: 18,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 6,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 14,
    outline: 'none',
  },
  dialogButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  cancelBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid var(--color-border, rgba(255,255,255,0.2))',
    borderRadius: 6,
    color: 'var(--color-text-primary, #fff)',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px',
    background: 'var(--color-accent, #007aff)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
  },
};

export default WorkspaceSelector;
