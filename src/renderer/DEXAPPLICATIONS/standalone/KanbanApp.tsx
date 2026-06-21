/**
 * DEX Kanban Board Application
 * Full-featured project management with drag-and-drop columns
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */
import React, { useState, useCallback, useEffect, useRef, memo } from 'react';

// -- Types --------------------------------------------------------------

interface KanbanCard {
  id: string;
  title: string;
  description: string;
  labels: { text: string; color: string }[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: number;
  dueDate?: string;
  checklist: { text: string; done: boolean }[];
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  limit?: number;
}

interface KanbanBoard {
  id: string;
  name: string;
  columns: KanbanColumn[];
  createdAt: number;
}

// -- Persistence --------------------------------------------------------

const STORAGE_KEY = 'dex-kanban-boards';

function loadBoards(): KanbanBoard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('[DEX]', e); }
  return [createDefaultBoard()];
}

async function loadBoardsAsync(): Promise<KanbanBoard[] | null> {
  try {
    if ((window as any).electron?.invoke) {
      const stored = await (window as any).electron.invoke('capability:storage:get', STORAGE_KEY);
      if (stored && Array.isArray(stored)) return stored;
    }
  } catch (e) { console.warn('[DEX]', e); }
  return null;
}

function saveBoards(boards: KanbanBoard[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(boards)); } catch (e) { console.warn('[DEX]', e); }
  (async () => {
    try {
      if ((window as any).electron?.invoke) {
        await (window as any).electron.invoke('capability:storage:set', STORAGE_KEY, boards);
      }
    } catch (e) { console.warn('[DEX]', e); }
  })();
}

function createDefaultBoard(): KanbanBoard {
  return {
    id: `board-${Date.now()}`,
    name: 'My Project',
    createdAt: Date.now(),
    columns: [
      { id: 'backlog', title: 'Backlog', color: '#6b7280', cards: [] },
      { id: 'todo', title: 'To Do', color: 'var(--color-accent)', cards: [] },
      { id: 'in-progress', title: 'In Progress', color: 'var(--color-warning)', cards: [] },
      { id: 'review', title: 'Review', color: '#bf5af2', cards: [] },
      { id: 'done', title: 'Done', color: '#22c55e', cards: [] },
    ],
  };
}

function generateId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// -- Icons --------------------------------------------------------------

const Icons = {
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  board: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>,
  flag: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
};

// -- Priority colors ----------------------------------------------------

const PRIORITY_CONFIG = {
  low: { color: '#22c55e', label: 'Low' },
  medium: { color: 'var(--color-warning)', label: 'Medium' },
  high: { color: '#ff6723', label: 'High' },
  urgent: { color: 'var(--color-error)', label: 'Urgent' },
};

const LABEL_COLORS = ['var(--color-error)', '#ff6723', 'var(--color-warning)', '#22c55e', '#64d2ff', 'var(--color-accent)', '#bf5af2', '#ff375f'];

// -- Card detail modal --------------------------------------------------

const CardDetail: React.FC<{
  card: KanbanCard;
  onSave: (card: KanbanCard) => void;
  onDelete: () => void;
  onClose: () => void;
}> = memo(({ card, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [priority, setPriority] = useState(card.priority);
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [labels, setLabels] = useState(card.labels);
  const [checklist, setChecklist] = useState(card.checklist);
  const [newLabel, setNewLabel] = useState('');
  const [newCheckItem, setNewCheckItem] = useState('');
  const [labelColor, setLabelColor] = useState(LABEL_COLORS[0]);

  // Close on Escape (the overlay already closes on click-outside).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    onSave({ ...card, title: title.trim() || 'Untitled', description, priority, dueDate: dueDate || undefined, labels, checklist });
  };

  const addLabel = () => {
    if (newLabel.trim()) {
      setLabels([...labels, { text: newLabel.trim(), color: labelColor }]);
      setNewLabel('');
    }
  };

  const addCheckItem = () => {
    if (newCheckItem.trim()) {
      setChecklist([...checklist, { text: newCheckItem.trim(), done: false }]);
      setNewCheckItem('');
    }
  };

  const toggleCheckItem = (idx: number) => {
    setChecklist(checklist.map((c, i) => i === idx ? { ...c, done: !c.done } : c));
  };

  return (
    <div style={modalStyles.overlay} onMouseDown={onClose}>
      <div style={modalStyles.modal} onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Edit card">
        <div style={modalStyles.header}>
          <h3 style={modalStyles.headerTitle}>Edit Card</h3>
          <button className="kanban-icon-btn" style={modalStyles.closeBtn} onClick={onClose} aria-label="Close">{Icons.x}</button>
        </div>

        <div style={modalStyles.body}>
          <label style={modalStyles.label}>Title</label>
          <input style={modalStyles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Card title" />

          <label style={modalStyles.label}>Description</label>
          <textarea style={{ ...modalStyles.input, minHeight: 80, resize: 'vertical' as const }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description..." />

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <div style={{ flex: 1 }}>
              <label style={modalStyles.label}>Priority</label>
              <select style={modalStyles.select} value={priority} onChange={e => setPriority(e.target.value as KanbanCard['priority'])}>
                {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={modalStyles.label}>Due Date</label>
              <input style={modalStyles.input} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          <label style={modalStyles.label}>Labels</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-2)' }}>
            {labels.map((l, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px var(--space-2)', borderRadius: 3, fontSize: 11, fontWeight: 600, background: `${l.color}20`, color: l.color }}>
                {l.text}
                <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} onClick={() => setLabels(labels.filter((_, j) => j !== i))} aria-label={`Remove label ${l.text}`}>{Icons.x}</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...modalStyles.input, flex: 1 }} value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="New label" onKeyDown={e => e.key === 'Enter' && addLabel()} />
            <div style={{ display: 'flex', gap: 2 }}>
              {LABEL_COLORS.map(c => (
                <button key={c} onClick={() => setLabelColor(c)} aria-label={`Select label color ${c}`} style={{ width: 20, height: 20, borderRadius: 3, border: labelColor === c ? '2px solid #fff' : '1px solid transparent', background: c, cursor: 'pointer' }} />
              ))}
            </div>
            <button className="kanban-btn" style={modalStyles.addBtn} onClick={addLabel} aria-label="Add label">Add</button>
          </div>

          <label style={modalStyles.label}>Checklist</label>
          {checklist.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
              <input type="checkbox" checked={item.done} onChange={() => toggleCheckItem(i)} />
              <span style={{ fontSize: 13, textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.5 : 1 }}>{item.text}</span>
              <button style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: 2 }} onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} aria-label={`Remove checklist item ${item.text}`}>{Icons.x}</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...modalStyles.input, flex: 1 }} value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} placeholder="New checklist item" onKeyDown={e => e.key === 'Enter' && addCheckItem()} />
            <button className="kanban-btn" style={modalStyles.addBtn} onClick={addCheckItem} aria-label="Add checklist item">Add</button>
          </div>
        </div>

        <div style={modalStyles.footer}>
          <button className="kanban-btn" style={modalStyles.deleteBtn} onClick={onDelete} aria-label="Delete card">Delete Card</button>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="kanban-btn" style={modalStyles.cancelBtn} onClick={onClose} aria-label="Cancel">Cancel</button>
            <button className="kanban-btn" style={modalStyles.saveBtn} onClick={handleSave} aria-label="Save card">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
});

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-max)' },
  modal: { width: 'min(520px, 92vw)', maxHeight: '85vh', background: 'var(--color-bg-elevated, #1e1e1e)', borderRadius: 10, border: '1px solid var(--color-border, var(--color-border))', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border, var(--color-border-subtle))' },
  headerTitle: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 4 },
  body: { padding: 'var(--space-4) var(--space-5)', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: 'var(--color-text-muted, #999)', marginBottom: -4 },
  input: { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border, var(--color-border))', background: 'var(--color-bg-surface-solid, #0e0e0e)', color: 'var(--color-text-primary, #fafafa)', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  select: { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border, var(--color-border))', background: 'var(--color-bg-surface-solid, #0e0e0e)', color: 'var(--color-text-primary, #fafafa)', fontSize: 13, outline: 'none' },
  addBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-5)', borderTop: '1px solid var(--color-border, var(--color-border-subtle))' },
  deleteBtn: { padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: 'none', background: 'rgba(255,59,48,0.1)', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { padding: 'var(--space-2) var(--space-4)', borderRadius: 6, border: '1px solid var(--color-border, var(--color-border))', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { padding: 'var(--space-2) var(--space-5)', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};

// -- Main app -----------------------------------------------------------

const KanbanApp: React.FC = () => {
  const [boards, setBoards] = useState<KanbanBoard[]>(loadBoards);
  const [activeBoardIdx, setActiveBoardIdx] = useState(0);
  const [editingCard, setEditingCard] = useState<{ colId: string; cardIdx: number } | null>(null);
  const [addingToCol, setAddingToCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newColTitle, setNewColTitle] = useState('');
  const [showNewCol, setShowNewCol] = useState(false);
  const [dragCard, setDragCard] = useState<{ colId: string; cardIdx: number } | null>(null);
  const newCardRef = useRef<HTMLInputElement>(null);
  const newColRef = useRef<HTMLInputElement>(null);

  const board = boards[activeBoardIdx] || boards[0];

  // Load from backend on mount (async, overrides localStorage if available)
  useEffect(() => {
    loadBoardsAsync().then(stored => { if (stored) setBoards(stored); });
  }, []);

  // Auto-save
  useEffect(() => { saveBoards(boards); }, [boards]);

  // Focus helpers
  useEffect(() => { if (addingToCol) newCardRef.current?.focus(); }, [addingToCol]);
  useEffect(() => { if (showNewCol) newColRef.current?.focus(); }, [showNewCol]);

  const updateBoard = useCallback((fn: (b: KanbanBoard) => KanbanBoard) => {
    setBoards(prev => prev.map((b, i) => i === activeBoardIdx ? fn(b) : b));
  }, [activeBoardIdx]);

  // Card CRUD
  const addCard = useCallback((colId: string) => {
    if (!newCardTitle.trim()) return;
    // Enforce the column's WIP limit (the `limit` field existed but was never
    // checked). Blocking over-limit adds is the core Kanban discipline.
    const col = boards[activeBoardIdx]?.columns.find(c => c.id === colId);
    if (col?.limit && col.cards.length >= col.limit) {
      window.dispatchEvent(new CustomEvent('dex-toast', { detail: { type: 'warning', message: `WIP limit reached: max ${col.limit} cards in "${col.title}"` } }));
      return;
    }
    updateBoard(b => ({
      ...b,
      columns: b.columns.map(c => c.id === colId ? {
        ...c,
        cards: [...c.cards, { id: generateId(), title: newCardTitle.trim(), description: '', labels: [], priority: 'medium' as const, createdAt: Date.now(), checklist: [] }],
      } : c),
    }));
    setNewCardTitle('');
    setAddingToCol(null);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'kanbanCardsCreated', amount: 1 } }));
  }, [newCardTitle, updateBoard, boards, activeBoardIdx]);

  const saveCard = useCallback((colId: string, cardIdx: number, card: KanbanCard) => {
    updateBoard(b => ({
      ...b,
      columns: b.columns.map(c => c.id === colId ? {
        ...c,
        cards: c.cards.map((cd, i) => i === cardIdx ? card : cd),
      } : c),
    }));
    setEditingCard(null);
  }, [updateBoard]);

  const deleteCard = useCallback((colId: string, cardIdx: number) => {
    // Send card to recycle bin before removing
    const col = board.columns.find(c => c.id === colId);
    const card = col?.cards[cardIdx];
    if (card) {
      try {
        (window as any).dex?.invoke?.('recycle-bin:delete', 'kanban', 'card', card.title || 'Untitled Card',
          JSON.stringify({ id: card.id, title: card.title, description: card.description, labels: card.labels, priority: card.priority, checklist: card.checklist, columnId: colId }),
          board.name || 'Kanban');
      } catch { /* best effort */ }
    }
    updateBoard(b => ({
      ...b,
      columns: b.columns.map(c => c.id === colId ? {
        ...c,
        cards: c.cards.filter((_, i) => i !== cardIdx),
      } : c),
    }));
    setEditingCard(null);
  }, [updateBoard, board]);

  // Column CRUD
  const addColumn = useCallback(() => {
    if (!newColTitle.trim()) return;
    const colors = ['#6b7280', 'var(--color-accent)', 'var(--color-warning)', '#bf5af2', '#22c55e', 'var(--color-error)', '#64d2ff'];
    updateBoard(b => ({
      ...b,
      columns: [...b.columns, { id: `col-${Date.now()}`, title: newColTitle.trim(), color: colors[b.columns.length % colors.length], cards: [] }],
    }));
    setNewColTitle('');
    setShowNewCol(false);
  }, [newColTitle, updateBoard]);

  const deleteColumn = useCallback((colId: string) => {
    const col = board.columns.find(c => c.id === colId);
    if (col && col.cards.length > 0) {
      // Send all cards to recycle bin
      for (const card of col.cards) {
        try {
          (window as any).dex?.invoke?.('recycle-bin:delete', 'kanban', 'card', card.title || 'Untitled Card',
            JSON.stringify({ id: card.id, title: card.title, description: card.description, labels: card.labels, priority: card.priority, checklist: card.checklist, columnId: colId }),
            board.name || 'Kanban');
        } catch { /* best effort */ }
      }
    }
    updateBoard(b => ({ ...b, columns: b.columns.filter(c => c.id !== colId) }));
  }, [updateBoard, board]);

  // Drag & Drop
  const handleDragStart = useCallback((colId: string, cardIdx: number) => {
    setDragCard({ colId, cardIdx });
  }, []);

  const handleDrop = useCallback((targetColId: string, targetIdx: number) => {
    if (!dragCard) return;
    updateBoard(b => {
      const cols = b.columns.map(c => ({ ...c, cards: [...c.cards] }));
      const srcCol = cols.find(c => c.id === dragCard.colId);
      const dstCol = cols.find(c => c.id === targetColId);
      if (!srcCol || !dstCol) return b;
      const [card] = srcCol.cards.splice(dragCard.cardIdx, 1);
      if (!card) return b;
      dstCol.cards.splice(targetIdx, 0, card);
      return { ...b, columns: cols };
    });
    setDragCard(null);
  }, [dragCard, updateBoard]);

  // Board management
  const addBoard = useCallback(() => {
    const newBoard = createDefaultBoard();
    newBoard.name = `Board ${boards.length + 1}`;
    newBoard.columns = [
      { id: 'todo', title: 'To Do', color: 'var(--color-accent)', cards: [] },
      { id: 'in-progress', title: 'In Progress', color: 'var(--color-warning)', cards: [] },
      { id: 'done', title: 'Done', color: '#22c55e', cards: [] },
    ];
    setBoards(prev => [...prev, newBoard]);
    setActiveBoardIdx(boards.length);
  }, [boards.length]);

  const editingCardData = editingCard
    ? board.columns.find(c => c.id === editingCard.colId)?.cards[editingCard.cardIdx]
    : null;

  const totalCards = board.columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards = board.columns.find(c => c.title.toLowerCase().includes('done'))?.cards.length || 0;

  return (
    <div style={styles.container}>
      <style>{`
        .kanban-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.2); transform: translateY(-1px); border-color: var(--color-border) !important; }
        .kanban-card:active { transform: scale(0.99); }
        .kanban-btn:hover { filter: brightness(1.15); }
        .kanban-btn:active { transform: scale(0.97); }
        .kanban-tab:hover { background: var(--color-bg-hover) !important; color: var(--color-text-primary) !important; }
        .kanban-add-card:hover { background: var(--color-border-subtle) !important; color: var(--color-text-secondary) !important; }
        .kanban-add-col:hover { border-color: var(--color-text-tertiary) !important; background: var(--color-border-subtle) !important; }
        .kanban-icon-btn:hover { color: var(--color-text-primary) !important; opacity: 1 !important; }
      `}</style>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <div style={styles.boardIcon}>{Icons.board}</div>
          <div>
            <h1 style={styles.boardTitle}>{board.name}</h1>
            <span style={styles.boardMeta}>{board.columns.length} columns, {totalCards} cards</span>
          </div>
        </div>
        <div style={styles.topRight}>
          {doneCards > 0 && (
            <div style={styles.progressChip}>
              {Icons.check}
              <span>{doneCards}/{totalCards} done</span>
            </div>
          )}
          <div style={styles.boardTabs}>
            {boards.map((b, i) => (
              <button key={b.id} className="kanban-tab" onClick={() => setActiveBoardIdx(i)} aria-label={`Switch to ${b.name}`} style={{ ...styles.boardTab, ...(i === activeBoardIdx ? styles.boardTabActive : {}) }}>
                {b.name}
              </button>
            ))}
            <button className="kanban-icon-btn" style={styles.boardTabAdd} onClick={addBoard} aria-label="Add board">{Icons.plus}</button>
          </div>

        </div>
      </div>

      {/* Board */}
      <div style={styles.board}>
        {board.columns.map(col => (
          <div key={col.id} style={styles.column}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(col.id, col.cards.length)}
          >
            <div style={styles.colHeader}>
              <div style={{ ...styles.colDot, background: col.color }} />
              <span style={styles.colTitle}>{col.title}</span>
              <span style={styles.colCount}>{col.cards.length}{col.limit ? `/${col.limit}` : ''}</span>
              <button style={styles.colDeleteBtn} className="kanban-icon-btn" onClick={() => deleteColumn(col.id)} aria-label={`Delete ${col.title} column`}>{Icons.x}</button>
            </div>

            <div style={styles.cardList}>
              {col.cards.length === 0 && addingToCol !== col.id && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-5) var(--space-3)', color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'center', opacity: 0.6 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: 6, opacity: 0.4 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  No cards yet
                </div>
              )}
              {col.cards.map((card, ci) => (
                <div
                  key={card.id}
                  className="kanban-card"
                  style={styles.card}
                  draggable
                  onDragStart={() => handleDragStart(col.id, ci)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.stopPropagation(); handleDrop(col.id, ci); }}
                  onClick={() => setEditingCard({ colId: col.id, cardIdx: ci })}
                  role="button"
                  tabIndex={0}
                  aria-label={`Card: ${card.title}`}
                  onKeyDown={e => e.key === 'Enter' && setEditingCard({ colId: col.id, cardIdx: ci })}
                >
                  {card.labels.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {card.labels.map((l, li) => (
                        <span key={li} style={{ padding: '1px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600, background: `${l.color}20`, color: l.color }}>{l.text}</span>
                      ))}
                    </div>
                  )}
                  <div style={styles.cardTitle}>{card.title}</div>
                  {card.description && <div style={styles.cardDesc}>{card.description.slice(0, 80)}{card.description.length > 80 ? '...' : ''}</div>}
                  <div style={styles.cardFooter}>
                    <span style={{ ...styles.priorityBadge, color: PRIORITY_CONFIG[card.priority].color }}>
                      {Icons.flag} {PRIORITY_CONFIG[card.priority].label}
                    </span>
                    {card.checklist.length > 0 && (
                      <span style={styles.checkCount}>{Icons.check} {card.checklist.filter(c => c.done).length}/{card.checklist.length}</span>
                    )}
                    {card.dueDate && <span style={styles.dueBadge}>{card.dueDate}</span>}
                  </div>
                </div>
              ))}

              {addingToCol === col.id ? (
                <div style={styles.addCardForm}>
                  <input
                    ref={newCardRef}
                    style={styles.addCardInput}
                    value={newCardTitle}
                    onChange={e => setNewCardTitle(e.target.value)}
                    placeholder="Card title..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') addCard(col.id);
                      if (e.key === 'Escape') setAddingToCol(null);
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="kanban-btn" style={styles.addCardSubmit} onClick={() => addCard(col.id)} aria-label="Add card">Add</button>
                    <button className="kanban-btn" style={styles.addCardCancel} onClick={() => setAddingToCol(null)} aria-label="Cancel adding card">Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="kanban-add-card" style={styles.addCardBtn} onClick={() => { setAddingToCol(col.id); setNewCardTitle(''); }} aria-label={`Add card to ${col.title}`}>
                  {Icons.plus} Add card
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add column */}
        {showNewCol ? (
          <div style={{ ...styles.column, minWidth: 240 }}>
            <input
              ref={newColRef}
              style={styles.addCardInput}
              value={newColTitle}
              onChange={e => setNewColTitle(e.target.value)}
              placeholder="Column title..."
              onKeyDown={e => {
                if (e.key === 'Enter') addColumn();
                if (e.key === 'Escape') setShowNewCol(false);
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-2)' }}>
              <button className="kanban-btn" style={styles.addCardSubmit} onClick={addColumn} aria-label="Add column">Add Column</button>
              <button className="kanban-btn" style={styles.addCardCancel} onClick={() => setShowNewCol(false)} aria-label="Cancel adding column">Cancel</button>
            </div>
          </div>
        ) : (
          <button className="kanban-add-col" style={styles.addColBtn} onClick={() => { setShowNewCol(true); setNewColTitle(''); }} aria-label="Add column">
            {Icons.plus} Add column
          </button>
        )}
      </div>

      {/* Card Detail Modal */}
      {editingCard && editingCardData && (
        <CardDetail
          card={editingCardData}
          onSave={card => saveCard(editingCard.colId, editingCard.cardIdx, card)}
          onDelete={() => deleteCard(editingCard.colId, editingCard.cardIdx)}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
};

// -- Styles -------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base, #0e0e0e)', overflow: 'hidden' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', flexShrink: 0, background: 'var(--color-bg-surface-solid, #1C1C1E)' },
  topLeft: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  topRight: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)' },
  boardIcon: { width: 36, height: 36, borderRadius: 8, background: 'var(--color-accent-soft, rgba(99,102,241,0.12))', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  boardTitle: { fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.3px' },
  boardMeta: { fontSize: 11, color: 'var(--color-text-muted, #666)', fontWeight: 500 },
  progressChip: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px var(--space-3)', borderRadius: 6, background: 'rgba(48,209,88,0.1)', color: 'var(--color-success)', fontSize: 12, fontWeight: 600 },
  boardTabs: { display: 'flex', alignItems: 'center', gap: 2, background: 'var(--color-border-subtle)', borderRadius: 6, padding: 2 },
  boardTab: { padding: '6px 14px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' },
  boardTabActive: { background: 'var(--color-bg-elevated, #2c2c2e)', color: 'var(--color-text-primary, #fafafa)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' },
  boardTabAdd: { width: 28, height: 28, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  board: { flex: 1, display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', overflowX: 'auto', overflowY: 'hidden', alignItems: 'flex-start' },
  column: { minWidth: 300, maxWidth: 340, background: 'var(--color-border-subtle)', borderRadius: 10, border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', maxHeight: '100%', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
  colHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '14px var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-border-subtle)', borderRadius: '10px 10px 0 0' },
  colDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  colTitle: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', flex: 1 },
  colCount: { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 },
  colDeleteBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 2, opacity: 0.4 },
  cardList: { flex: 1, padding: 'var(--space-2) var(--space-2)', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  card: { padding: 14, background: 'var(--color-bg-surface-solid, #141414)', borderRadius: 8, border: '1px solid var(--color-border-subtle)', cursor: 'pointer', transition: 'box-shadow 0.15s ease, transform 0.15s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
  cardTitle: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  cardDesc: { fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 },
  cardFooter: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' },
  priorityBadge: { display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600 },
  checkCount: { display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 },
  dueBadge: { fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600 },
  addCardBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%', justifyContent: 'flex-start', transition: 'all 0.15s ease' },
  addCardForm: { padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  addCardInput: { width: '100%', padding: 'var(--space-2) var(--space-3)', borderRadius: 6, border: '1px solid var(--color-border, var(--color-border))', background: 'var(--color-bg-surface-solid, #0e0e0e)', color: 'var(--color-text-primary, #fafafa)', fontSize: 13, outline: 'none' },
  addCardSubmit: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  addCardCancel: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  addColBtn: { minWidth: 240, height: 44, borderRadius: 10, border: '1px dashed var(--color-border, var(--color-border))', background: 'transparent', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s ease' },
};

KanbanApp.displayName = 'KanbanApp';
export default memo(KanbanApp);
