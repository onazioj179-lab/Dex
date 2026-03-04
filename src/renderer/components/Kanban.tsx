/**
 * DEX Kanban Board Component
 * Drag and drop task board
 */

import React, { useState, useCallback } from 'react';

// ==================== TYPES ====================

interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  labels?: { text: string; color: string }[];
  assignee?: { name: string; avatar?: string };
  dueDate?: Date;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  comments?: number;
  attachments?: number;
  checklist?: { total: number; completed: number };
}

interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  color?: string;
  limit?: number;
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onCardMove?: (cardId: string, fromColumn: string, toColumn: string, newIndex: number) => void;
  onCardClick?: (card: KanbanCard) => void;
  onAddCard?: (columnId: string) => void;
  onEditColumn?: (columnId: string) => void;
}

// ==================== KANBAN CARD COMPONENT ====================

interface KanbanCardComponentProps {
  card: KanbanCard;
  onClick?: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

const KanbanCardComponent: React.FC<KanbanCardComponentProps> = ({
  card,
  onClick,
  onDragStart,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const priorityColors = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#f97316',
    urgent: '#ef4444',
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: 'Overdue', color: '#ef4444' };
    if (diffDays === 0) return { text: 'Today', color: '#f59e0b' };
    if (diffDays === 1) return { text: 'Tomorrow', color: '#f59e0b' };
    if (diffDays <= 7) return { text: `${diffDays} days`, color: 'var(--color-text-muted)' };
    return { text: date.toLocaleDateString(), color: 'var(--color-text-muted)' };
  };

  const styles: Record<string, React.CSSProperties> = {
    card: {
      padding: 12,
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      cursor: 'pointer',
      opacity: isDragging ? 0.5 : 1,
      transition: 'box-shadow 0.15s, transform 0.15s',
    },
    labels: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 8,
    },
    label: {
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
    },
    title: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      marginBottom: card.description ? 4 : 0,
    },
    description: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
      marginBottom: 8,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    meta: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    priority: {
      width: 4,
      height: '100%',
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: '8px 0 0 8px',
    },
    assignee: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: 'var(--color-accent)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      overflow: 'hidden',
    },
    avatar: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    checklist: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: 'var(--color-text-muted)',
    },
    checklistComplete: {
      color: '#22c55e',
    },
  };

  const dateInfo = card.dueDate ? formatDate(card.dueDate) : null;
  const checklistComplete = card.checklist?.completed === card.checklist?.total;

  return (
    <div
      style={{ ...styles.card, position: 'relative' } as any}
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        onDragStart(e);
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {card.priority && (
        <div
          style={{
            ...styles.priority,
            background: priorityColors[card.priority],
          } as any}
        />
      )}

      {card.labels && card.labels.length > 0 && (
        <div style={styles.labels as any}>
          {card.labels.map((label, index) => (
            <span
              key={index}
              style={{
                ...styles.label,
                background: label.color + '20',
                color: label.color,
              }}
            >
              {label.text}
            </span>
          ))}
        </div>
      )}

      <div style={styles.title}>{card.title}</div>

      {card.description && (
        <div style={styles.description as any}>{card.description}</div>
      )}

      <div style={styles.footer}>
        <div style={styles.meta}>
          {dateInfo && (
            <span style={{ ...styles.metaItem, color: dateInfo.color }}>
              calendar {dateInfo.text}
            </span>
          )}

          {card.comments !== undefined && card.comments > 0 && (
            <span style={styles.metaItem}>
              message-circle {card.comments}
            </span>
          )}

          {card.attachments !== undefined && card.attachments > 0 && (
            <span style={styles.metaItem}>
              paperclip {card.attachments}
            </span>
          )}

          {card.checklist && (
            <span
              style={{
                ...styles.checklist,
                ...(checklistComplete ? styles.checklistComplete : {}),
              }}
            >
              check-square {card.checklist.completed}/{card.checklist.total}
            </span>
          )}
        </div>

        {card.assignee && (
          <div style={styles.assignee}>
            {card.assignee.avatar ? (
              <img src={card.assignee.avatar} alt={card.assignee.name} style={styles.avatar} />
            ) : (
              card.assignee.name.charAt(0).toUpperCase()
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== KANBAN COLUMN COMPONENT ====================

interface KanbanColumnComponentProps {
  column: KanbanColumn;
  onCardMove: (cardId: string, fromColumn: string, toColumn: string, newIndex: number) => void;
  onCardClick?: (card: KanbanCard) => void;
  onAddCard?: () => void;
  onEditColumn?: () => void;
}

const KanbanColumnComponent: React.FC<KanbanColumnComponentProps> = ({
  column,
  onCardMove,
  onCardClick,
  onAddCard,
  onEditColumn,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState(false);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);

  const isOverLimit = column.limit !== undefined && column.cards.length >= column.limit;

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(index);
    setDragOverColumn(true);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
    setDragOverColumn(false);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (data) {
      const { cardId, fromColumn } = JSON.parse(data);
      onCardMove(cardId, fromColumn, column.id, index);
    }
    setDragOverIndex(null);
    setDragOverColumn(false);
  };

  const handleColumnDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (data) {
      const { cardId, fromColumn } = JSON.parse(data);
      onCardMove(cardId, fromColumn, column.id, column.cards.length);
    }
    setDragOverColumn(false);
  };

  const styles: Record<string, React.CSSProperties> = {
    column: {
      width: 300,
      minWidth: 300,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border)',
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    colorDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: column.color || 'var(--color-text-muted)',
    },
    title: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    count: {
      padding: '2px 8px',
      background: 'var(--color-bg-tertiary)',
      borderRadius: 10,
      fontSize: 12,
      color: isOverLimit ? '#ef4444' : 'var(--color-text-muted)',
    },
    menuButton: {
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'none',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 14,
    },
    cards: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: 12,
      overflowY: 'auto',
      minHeight: 100,
      background: dragOverColumn ? 'var(--color-bg-tertiary)' : 'transparent',
      transition: 'background 0.15s',
    },
    dropZone: {
      height: 4,
      background: 'var(--color-accent)',
      borderRadius: 2,
      transition: 'height 0.15s',
    },
    addButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 12,
      background: 'none',
      border: 'none',
      borderTop: '1px solid var(--color-border)',
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      fontSize: 13,
      transition: 'background 0.15s',
    },
  };

  return (
    <div style={styles.column as any}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.colorDot} />
          <span style={styles.title}>{column.title}</span>
          <span style={styles.count}>
            {column.cards.length}
            {column.limit && `/${column.limit}`}
          </span>
        </div>
        {onEditColumn && (
          <button
            style={styles.menuButton}
            onClick={onEditColumn}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'none';
            }}
          >
            ⋮
          </button>
        )}
      </div>

      <div
        style={styles.cards as any}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverColumn(true);
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleColumnDrop}
      >
        {column.cards.map((card, index) => (
          <React.Fragment key={card.id}>
            {dragOverIndex === index && (
              <div style={styles.dropZone} />
            )}
            <div
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
            >
              <KanbanCardComponent
                card={card}
                onClick={() => onCardClick?.(card)}
                onDragStart={(e) => {
                  setDraggedCard(card.id);
                  e.dataTransfer.setData('application/json', JSON.stringify({
                    cardId: card.id,
                    fromColumn: column.id,
                  }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
              />
            </div>
          </React.Fragment>
        ))}
        {dragOverIndex === column.cards.length && (
          <div style={styles.dropZone} />
        )}
      </div>

      {onAddCard && (
        <button
          style={styles.addButton}
          onClick={onAddCard}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-tertiary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
        >
          + Add card
        </button>
      )}
    </div>
  );
};

// ==================== KANBAN BOARD ====================

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  columns: initialColumns,
  onCardMove,
  onCardClick,
  onAddCard,
  onEditColumn,
}) => {
  const [columns, setColumns] = useState(initialColumns);

  const handleCardMove = useCallback((
    cardId: string,
    fromColumnId: string,
    toColumnId: string,
    newIndex: number
  ) => {
    setColumns(prev => {
      const newColumns = [...prev];

      // Find the card and remove it from source column
      const fromColumn = newColumns.find(c => c.id === fromColumnId);
      const toColumn = newColumns.find(c => c.id === toColumnId);

      if (!fromColumn || !toColumn) return prev;

      const cardIndex = fromColumn.cards.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return prev;

      const [card] = fromColumn.cards.splice(cardIndex, 1);

      // Adjust index if moving within same column
      let adjustedIndex = newIndex;
      if (fromColumnId === toColumnId && cardIndex < newIndex) {
        adjustedIndex -= 1;
      }

      // Insert card at new position
      toColumn.cards.splice(adjustedIndex, 0, card);

      return newColumns;
    });

    onCardMove?.(cardId, fromColumnId, toColumnId, newIndex);
  }, [onCardMove]);

  const styles: Record<string, React.CSSProperties> = {
    board: {
      display: 'flex',
      gap: 16,
      padding: 16,
      overflowX: 'auto',
      minHeight: 400,
    },
  };

  return (
    <div style={styles.board}>
      {columns.map(column => (
        <KanbanColumnComponent
          key={column.id}
          column={column}
          onCardMove={handleCardMove}
          onCardClick={onCardClick}
          onAddCard={onAddCard ? () => onAddCard(column.id) : undefined}
          onEditColumn={onEditColumn ? () => onEditColumn(column.id) : undefined}
        />
      ))}
    </div>
  );
};

// ==================== SIMPLE KANBAN ====================

interface SimpleKanbanProps {
  items: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  statuses: string[];
  onStatusChange?: (itemId: string, newStatus: string) => void;
}

export const SimpleKanban: React.FC<SimpleKanbanProps> = ({
  items,
  statuses,
  onStatusChange,
}) => {
  const columns: KanbanColumn[] = statuses.map(status => ({
    id: status,
    title: status,
    cards: items
      .filter(item => item.status === status)
      .map(item => ({
        id: item.id,
        title: item.title,
      })),
  }));

  return (
    <KanbanBoard
      columns={columns}
      onCardMove={(cardId, fromColumn, toColumn) => {
        onStatusChange?.(cardId, toColumn);
      }}
    />
  );
};

export default KanbanBoard;
