/**
 * DEX Subtask Manager
 * Nested task support with progress tracking
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ==================== TYPES ====================

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface TaskWithSubtasks {
  id: string;
  title: string;
  subtasks: Subtask[];
  showSubtasks: boolean;
}

interface SubtaskListProps {
  taskId: string;
  subtasks: Subtask[];
  onAdd: (taskId: string, title: string) => void;
  onToggle: (taskId: string, subtaskId: string) => void;
  onDelete: (taskId: string, subtaskId: string) => void;
  onEdit: (taskId: string, subtaskId: string, title: string) => void;
  onReorder?: (taskId: string, subtasks: Subtask[]) => void;
}

interface SubtaskItemProps {
  subtask: Subtask;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (title: string) => void;
}

// ==================== ICONS ====================

const Icons = {
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
  add: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  edit: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  drag: <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>,
  chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
  chevronRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
};

// ==================== SUBTASK ITEM ====================

const SubtaskItem: React.FC<SubtaskItemProps> = ({ subtask, onToggle, onDelete, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(subtask.title);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue.trim()) {
      onEdit(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(subtask.title);
      setIsEditing(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      marginLeft: '24px',
      borderRadius: '6px',
      background: isHovered ? 'var(--color-bg-glass)' : 'transparent',
      transition: 'background 0.15s',
    },
    dragHandle: {
      cursor: 'grab',
      color: 'var(--color-text-muted)',
      opacity: isHovered ? 1 : 0,
      transition: 'opacity 0.15s',
    },
    checkbox: {
      width: '16px',
      height: '16px',
      border: `2px solid ${subtask.completed ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: '4px',
      background: subtask.completed ? 'var(--color-accent)' : 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      flexShrink: 0,
      transition: 'all 0.15s',
    },
    checkIcon: {
      color: '#fff',
      opacity: subtask.completed ? 1 : 0,
    },
    title: {
      flex: 1,
      fontSize: '13px',
      color: subtask.completed ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
      textDecoration: subtask.completed ? 'line-through' : 'none',
    },
    input: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      padding: 0,
    },
    actions: {
      display: 'flex',
      gap: '4px',
      opacity: isHovered ? 1 : 0,
      transition: 'opacity 0.15s',
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
  };

  return (
    <div 
      style={styles.container}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={styles.dragHandle}>{Icons.drag}</span>
      
      <div style={styles.checkbox} onClick={onToggle}>
        <span style={styles.checkIcon}>{Icons.check}</span>
      </div>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          style={styles.input}
        />
      ) : (
        <span 
          style={styles.title}
          onDoubleClick={() => setIsEditing(true)}
        >
          {subtask.title}
        </span>
      )}

      <div style={styles.actions}>
        <button 
          style={styles.actionBtn}
          onClick={() => setIsEditing(true)}
          title="Edit"
        >
          {Icons.edit}
        </button>
        <button 
          style={styles.actionBtn}
          onClick={onDelete}
          title="Delete"
        >
          {Icons.trash}
        </button>
      </div>
    </div>
  );
};

// ==================== SUBTASK LIST ====================

export const SubtaskList: React.FC<SubtaskListProps> = ({
  taskId,
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onEdit,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAdd = () => {
    if (newSubtask.trim()) {
      onAdd(taskId, newSubtask.trim());
      setNewSubtask('');
    }
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setNewSubtask('');
      setIsAdding(false);
    }
  };

  const completedCount = subtasks.filter(s => s.completed).length;
  const progress = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  const styles: Record<string, React.CSSProperties> = {
    container: {
      marginTop: '8px',
    },
    progressBar: {
      height: '3px',
      background: 'var(--color-bg-glass)',
      borderRadius: '2px',
      marginLeft: '24px',
      marginBottom: '8px',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      background: progress === 100 ? '#34c759' : 'var(--color-accent)',
      borderRadius: '2px',
      transition: 'width 0.3s',
    },
    list: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    addRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      marginLeft: '24px',
    },
    addBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      background: 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '4px',
      fontSize: '11px',
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
    },
    input: {
      flex: 1,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: '13px',
      color: 'var(--color-text-primary)',
      padding: '4px 8px',
    },
    counter: {
      fontSize: '10px',
      color: 'var(--color-text-muted)',
      marginLeft: '24px',
      marginTop: '4px',
    },
  };

  return (
    <div style={styles.container}>
      {subtasks.length > 0 && (
        <>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.counter}>
            {completedCount} of {subtasks.length} completed
          </span>
        </>
      )}

      <div style={styles.list}>
        {subtasks.map(subtask => (
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            onToggle={() => onToggle(taskId, subtask.id)}
            onDelete={() => onDelete(taskId, subtask.id)}
            onEdit={(title) => onEdit(taskId, subtask.id, title)}
          />
        ))}
      </div>

      <div style={styles.addRow}>
        {isAdding ? (
          <input
            ref={inputRef}
            type="text"
            value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={handleKeyDown}
            placeholder="Add subtask..."
            style={styles.input}
          />
        ) : (
          <button style={styles.addBtn} onClick={() => setIsAdding(true)}>
            {Icons.add}
            <span>Add subtask</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== SUBTASK TOGGLE BUTTON ====================

interface SubtaskToggleProps {
  isExpanded: boolean;
  subtaskCount: number;
  completedCount: number;
  onToggle: () => void;
}

export const SubtaskToggle: React.FC<SubtaskToggleProps> = ({
  isExpanded,
  subtaskCount,
  completedCount,
  onToggle,
}) => {
  if (subtaskCount === 0) return null;

  const allComplete = completedCount === subtaskCount;

  const styles: Record<string, React.CSSProperties> = {
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 6px',
      background: allComplete ? '#34c75920' : 'var(--color-bg-glass)',
      border: 'none',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 500,
      color: allComplete ? '#34c759' : 'var(--color-text-muted)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    icon: {
      transition: 'transform 0.2s',
      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
    },
  };

  return (
    <button style={styles.button} onClick={onToggle}>
      <span style={styles.icon}>{Icons.chevronDown}</span>
      <span>{completedCount}/{subtaskCount}</span>
    </button>
  );
};

// ==================== HOOK: useSubtasks ====================

export const useSubtasks = () => {
  const createSubtask = useCallback((title: string): Subtask => ({
    id: `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    completed: false,
    createdAt: Date.now(),
  }), []);

  const addSubtask = useCallback((subtasks: Subtask[], title: string): Subtask[] => {
    return [...subtasks, createSubtask(title)];
  }, [createSubtask]);

  const toggleSubtask = useCallback((subtasks: Subtask[], subtaskId: string): Subtask[] => {
    return subtasks.map(s => 
      s.id === subtaskId 
        ? { 
            ...s, 
            completed: !s.completed,
            completedAt: !s.completed ? Date.now() : undefined,
          }
        : s
    );
  }, []);

  const deleteSubtask = useCallback((subtasks: Subtask[], subtaskId: string): Subtask[] => {
    return subtasks.filter(s => s.id !== subtaskId);
  }, []);

  const editSubtask = useCallback((subtasks: Subtask[], subtaskId: string, title: string): Subtask[] => {
    return subtasks.map(s => 
      s.id === subtaskId ? { ...s, title } : s
    );
  }, []);

  const reorderSubtasks = useCallback((subtasks: Subtask[], fromIndex: number, toIndex: number): Subtask[] => {
    const result = [...subtasks];
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    return result;
  }, []);

  const getProgress = useCallback((subtasks: Subtask[]): { completed: number; total: number; percentage: number } => {
    const completed = subtasks.filter(s => s.completed).length;
    const total = subtasks.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }, []);

  return {
    createSubtask,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    editSubtask,
    reorderSubtasks,
    getProgress,
  };
};

export default SubtaskList;
