/**
 * DEX Tree View Component
 * Hierarchical tree navigation
 */

import React, { useState, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface TreeNode {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
  data?: any;
}

interface TreeViewProps {
  nodes: TreeNode[];
  selected?: string[];
  expanded?: string[];
  onSelect?: (nodeId: string, node: TreeNode) => void;
  onExpand?: (nodeIds: string[]) => void;
  multiSelect?: boolean;
  showLines?: boolean;
  showCheckboxes?: boolean;
  defaultExpandAll?: boolean;
  searchable?: boolean;
  draggable?: boolean;
  onDrop?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
}

interface TreeContextType {
  selected: string[];
  expanded: string[];
  showLines: boolean;
  showCheckboxes: boolean;
  multiSelect: boolean;
  draggable: boolean;
  onSelect: (nodeId: string, node: TreeNode) => void;
  onToggle: (nodeId: string) => void;
  onDrop?: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
}

// ==================== CONTEXT ====================

const TreeContext = createContext<TreeContextType | null>(null);

const useTree = () => {
  const context = useContext(TreeContext);
  if (!context) throw new Error('useTree must be used within TreeView');
  return context;
};

// ==================== TREE NODE COMPONENT ====================

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  searchQuery?: string;
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
  node,
  level,
  searchQuery = '',
}) => {
  const {
    selected,
    expanded,
    showLines,
    showCheckboxes,
    multiSelect,
    draggable,
    onSelect,
    onToggle,
    onDrop,
  } = useTree();

  const [dragOver, setDragOver] = useState<'before' | 'after' | 'inside' | null>(null);

  const isSelected = selected.includes(node.id);
  const isExpanded = expanded.includes(node.id);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.disabled) {
      onSelect(node.id, node);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle(node.id);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable) return;
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!draggable) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDragOver('before');
    } else if (y > height * 0.75) {
      setDragOver('after');
    } else {
      setDragOver('inside');
    }
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!draggable || !dragOver) return;
    e.preventDefault();
    e.stopPropagation();

    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId !== node.id && onDrop) {
      onDrop(draggedId, node.id, dragOver);
    }
    setDragOver(null);
  };

  // Filter based on search
  const matchesSearch = !searchQuery ||
    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (node.children?.some(child =>
      child.label.toLowerCase().includes(searchQuery.toLowerCase())
    ));

  if (!matchesSearch && !hasChildren) return null;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
    },
    row: {
      display: 'flex',
      alignItems: 'center',
      padding: '6px 8px',
      paddingLeft: 8 + level * 20,
      background: isSelected
        ? 'var(--color-accent-light, rgba(59, 130, 246, 0.1))'
        : dragOver === 'inside'
          ? 'var(--color-bg-tertiary)'
          : 'transparent',
      borderRadius: 6,
      cursor: node.disabled ? 'not-allowed' : 'pointer',
      opacity: node.disabled ? 0.5 : 1,
      transition: 'background 0.15s',
      borderTop: dragOver === 'before' ? '2px solid var(--color-accent)' : '2px solid transparent',
      borderBottom: dragOver === 'after' ? '2px solid var(--color-accent)' : '2px solid transparent',
    },
    toggle: {
      width: 20,
      height: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      color: 'var(--color-text-muted)',
      flexShrink: 0,
      transition: 'transform 0.15s',
      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
    },
    checkbox: {
      width: 16,
      height: 16,
      marginRight: 8,
      accentColor: 'var(--color-accent)',
    },
    icon: {
      marginRight: 8,
      fontSize: 16,
      flexShrink: 0,
    },
    label: {
      flex: 1,
      fontSize: 14,
      color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
      fontWeight: isSelected ? 500 : 400,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    children: {
      position: 'relative',
      marginLeft: showLines ? 20 : 0,
    },
    line: {
      position: 'absolute',
      left: level * 20 + 18,
      top: 0,
      bottom: 0,
      width: 1,
      background: 'var(--color-border)',
    },
  };

  return (
    <div style={styles.container as any}>
      <div
        style={styles.row}
        onClick={handleClick}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }
        }}
      >
        <span style={styles.toggle} onClick={handleToggle}>
          {hasChildren ? '▶' : ''}
        </span>

        {showCheckboxes && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            style={styles.checkbox}
          />
        )}

        {node.icon && <span style={styles.icon}>{node.icon}</span>}

        <span style={styles.label}>{node.label}</span>
      </div>

      {showLines && level > 0 && <div style={styles.line as any} />}

      {hasChildren && isExpanded && (
        <div style={styles.children as any}>
          {node.children!.map(child => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== TREE VIEW ====================

export const TreeView: React.FC<TreeViewProps> = ({
  nodes,
  selected: selectedProp = [],
  expanded: expandedProp,
  onSelect,
  onExpand,
  multiSelect = false,
  showLines = false,
  showCheckboxes = false,
  defaultExpandAll = false,
  searchable = false,
  draggable = false,
  onDrop,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const getAllNodeIds = useCallback((nodeList: TreeNode[]): string[] => {
    return nodeList.flatMap(node => [
      node.id,
      ...(node.children ? getAllNodeIds(node.children) : []),
    ]);
  }, []);

  const [internalSelected, setInternalSelected] = useState<string[]>(selectedProp);
  const [internalExpanded, setInternalExpanded] = useState<string[]>(
    expandedProp || (defaultExpandAll ? getAllNodeIds(nodes) : [])
  );

  const selected = selectedProp.length > 0 ? selectedProp : internalSelected;
  const expanded = expandedProp || internalExpanded;

  const handleSelect = useCallback((nodeId: string, node: TreeNode) => {
    if (multiSelect) {
      const newSelected = selected.includes(nodeId)
        ? selected.filter(id => id !== nodeId)
        : [...selected, nodeId];
      setInternalSelected(newSelected);
      onSelect?.(nodeId, node);
    } else {
      setInternalSelected([nodeId]);
      onSelect?.(nodeId, node);
    }
  }, [selected, multiSelect, onSelect]);

  const handleToggle = useCallback((nodeId: string) => {
    const newExpanded = expanded.includes(nodeId)
      ? expanded.filter(id => id !== nodeId)
      : [...expanded, nodeId];
    setInternalExpanded(newExpanded);
    onExpand?.(newExpanded);
  }, [expanded, onExpand]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    search: {
      padding: '8px 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text)',
      outline: 'none',
    },
    tree: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
  };

  const contextValue: TreeContextType = {
    selected,
    expanded,
    showLines,
    showCheckboxes,
    multiSelect,
    draggable,
    onSelect: handleSelect,
    onToggle: handleToggle,
    onDrop,
  };

  return (
    <TreeContext.Provider value={contextValue}>
      <div style={styles.container as any}>
        {searchable && (
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.search}
          />
        )}

        <div style={styles.tree as any}>
          {nodes.map(node => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              level={0}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      </div>
    </TreeContext.Provider>
  );
};

// ==================== FILE TREE ====================

interface FileNode extends TreeNode {
  type: 'file' | 'folder';
  size?: number;
  modified?: Date;
}

interface FileTreeProps {
  files: FileNode[];
  onSelect?: (file: FileNode) => void;
  onContextMenu?: (file: FileNode, e: React.MouseEvent) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  onSelect,
  onContextMenu,
}) => {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const getIcon = (node: FileNode) => {
    if (node.type === 'folder') {
      return expanded.includes(node.id) ? 'folder-open' : 'folder';
    }

    const ext = node.label.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'scroll';
      case 'ts':
      case 'tsx':
        return 'book';
      case 'css':
      case 'scss':
        return 'palette';
      case 'json':
        return 'clipboard';
      case 'md':
        return 'file-text';
      case 'png':
      case 'jpg':
      case 'gif':
        return 'image';
      case 'mp3':
      case 'wav':
        return 'music';
      case 'mp4':
      case 'mov':
        return 'film';
      default:
        return 'file';
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.label.localeCompare(b.label);
  });

  const nodesWithIcons: TreeNode[] = sortedFiles.map(file => ({
    ...file,
    icon: getIcon(file),
    children: file.children
      ? (file.children as FileNode[]).map(child => ({
        ...child,
        icon: getIcon(child),
      }))
      : undefined,
  }));

  const handleSelect = (nodeId: string, node: TreeNode) => {
    setSelected([nodeId]);
    const fileNode = files.find(f => f.id === nodeId) as FileNode;
    if (fileNode) {
      onSelect?.(fileNode);
    }
  };

  return (
    <TreeView
      nodes={nodesWithIcons}
      selected={selected}
      expanded={expanded}
      onSelect={handleSelect}
      onExpand={setExpanded}
      showLines
      searchable
    />
  );
};

// ==================== CATEGORY TREE ====================

interface CategoryNode extends TreeNode {
  count?: number;
  color?: string;
}

interface CategoryTreeProps {
  categories: CategoryNode[];
  onSelect?: (category: CategoryNode) => void;
}

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  categories,
  onSelect,
}) => {
  const [selected, setSelected] = useState<string[]>([]);

  const renderLabel = (node: CategoryNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      {node.color && (
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: node.color,
          }}
        />
      )}
      <span style={{ flex: 1 }}>{node.label}</span>
      {node.count !== undefined && (
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            background: 'var(--color-bg-tertiary)',
            padding: '2px 6px',
            borderRadius: 10,
          }}
        >
          {node.count}
        </span>
      )}
    </div>
  );

  const nodesWithLabels: TreeNode[] = categories.map(cat => ({
    ...cat,
    label: cat.label,
  }));

  return (
    <TreeView
      nodes={nodesWithLabels}
      selected={selected}
      onSelect={(id, node) => {
        setSelected([id]);
        const category = categories.find(c => c.id === id) as CategoryNode;
        if (category) {
          onSelect?.(category);
        }
      }}
      defaultExpandAll
    />
  );
};

export default TreeView;
