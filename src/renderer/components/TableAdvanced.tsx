/**
 * DEX Table Enhancement Components
 * Advanced table features
 */

import React, { useState, useCallback, useMemo } from 'react';

// ==================== TYPES ====================

interface Column<T> {
  key: keyof T | string;
  title: string;
  width?: number | string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
}

interface TableRow {
  id: string | number;
  [key: string]: any;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface FilterConfig {
  key: string;
  value: string;
}

interface EnhancedTableProps<T extends TableRow> {
  data: T[];
  columns: Column<T>[];
  selectable?: boolean;
  selectedRows?: (string | number)[];
  onSelectRows?: (ids: (string | number)[]) => void;
  expandable?: boolean;
  expandedRowRender?: (row: T) => React.ReactNode;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  loading?: boolean;
  emptyText?: string;
  stickyHeader?: boolean;
  bordered?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  maxHeight?: number;
}

// ==================== ENHANCED TABLE ====================

export function EnhancedTable<T extends TableRow>({
  data,
  columns,
  selectable = false,
  selectedRows = [],
  onSelectRows,
  expandable = false,
  expandedRowRender,
  onSort,
  loading = false,
  emptyText = 'No data available',
  stickyHeader = false,
  bordered = false,
  striped = true,
  hoverable = true,
  compact = false,
  maxHeight,
}: EnhancedTableProps<T>) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());
  const [filters, setFilters] = useState<Record<string, string>>({});

  const handleSort = useCallback((key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig?.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    onSort?.(key, direction);
  }, [sortConfig, onSort]);

  const toggleSelectAll = useCallback(() => {
    if (selectedRows.length === data.length) {
      onSelectRows?.([]);
    } else {
      onSelectRows?.(data.map((row) => row.id));
    }
  }, [data, selectedRows, onSelectRows]);

  const toggleSelectRow = useCallback((id: string | number) => {
    if (selectedRows.includes(id)) {
      onSelectRows?.(selectedRows.filter((i) => i !== id));
    } else {
      onSelectRows?.([...selectedRows, id]);
    }
  }, [selectedRows, onSelectRows]);

  const toggleExpandRow = useCallback((id: string | number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        const cellValue = String(row[key] ?? '').toLowerCase();
        return cellValue.includes(value.toLowerCase());
      });
    });
  }, [data, filters]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: '100%',
      overflow: 'auto',
      maxHeight: maxHeight,
      border: bordered ? '1px solid var(--color-border)' : undefined,
      borderRadius: 8,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: compact ? 13 : 14,
    },
    thead: {
      position: stickyHeader ? 'sticky' : undefined,
      top: 0,
      background: 'var(--color-bg-secondary)',
      zIndex: 10,
    },
    th: {
      padding: compact ? '8px 12px' : '12px 16px',
      textAlign: 'left',
      fontWeight: 600,
      color: 'var(--color-text)',
      borderBottom: '2px solid var(--color-border)',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: compact ? '8px 12px' : '12px 16px',
      borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text)',
    },
    checkbox: {
      width: 16,
      height: 16,
      cursor: 'pointer',
    },
    sortButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '0 4px',
      color: 'var(--color-text-muted)',
    },
    expandButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 4,
      color: 'var(--color-text-muted)',
    },
    loading: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(var(--color-bg-rgb), 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: 'var(--color-text-muted)',
    },
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={styles.container as any}>
        <table style={styles.table}>
          <thead style={styles.thead as any}>
            <tr>
              {selectable && (
                <th style={{ ...styles.th, width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectedRows.length === data.length && data.length > 0}
                    onChange={toggleSelectAll}
                    style={styles.checkbox}
                  />
                </th>
              )}
              {expandable && <th style={{ ...styles.th, width: 40 }} />}
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  style={{
                    ...styles.th,
                    width: col.width,
                    textAlign: col.align,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{col.title}</span>
                    {col.sortable && (
                      <button
                        style={styles.sortButton}
                        onClick={() => handleSort(String(col.key))}
                      >
                        {sortConfig?.key === col.key ? (
                          sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down'
                        ) : '↕'}
                      </button>
                    )}
                    {col.filterable && (
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filters[String(col.key)] || ''}
                        onChange={(e) =>
                          setFilters((prev) => ({ ...prev, [String(col.key)]: e.target.value }))
                        }
                        style={{
                          width: 80,
                          padding: '2px 6px',
                          fontSize: 12,
                          border: '1px solid var(--color-border)',
                          borderRadius: 4,
                          background: 'var(--color-bg)',
                          color: 'var(--color-text)',
                        }}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)}
                  style={styles.empty as any}
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <React.Fragment key={row.id}>
                  <tr
                    style={{
                      background: striped && rowIndex % 2 === 1 
                        ? 'var(--color-bg-secondary)' 
                        : 'transparent',
                      cursor: hoverable ? 'pointer' : undefined,
                    }}
                  >
                    {selectable && (
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                          style={styles.checkbox}
                        />
                      </td>
                    )}
                    {expandable && (
                      <td style={styles.td}>
                        <button
                          style={styles.expandButton}
                          onClick={() => toggleExpandRow(row.id)}
                        >
                          {expandedRows.has(row.id) ? '▼' : '▶'}
                        </button>
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={String(col.key)}
                        style={{ ...styles.td, textAlign: col.align }}
                      >
                        {col.render
                          ? col.render(row[col.key as keyof T], row, rowIndex)
                          : row[col.key as keyof T]}
                      </td>
                    ))}
                  </tr>
                  {expandable && expandedRows.has(row.id) && expandedRowRender && (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        style={{
                          padding: 16,
                          background: 'var(--color-bg-secondary)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        {expandedRowRender(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      {loading && (
        <div style={styles.loading as any}>
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
}

// ==================== EDITABLE TABLE ====================

interface EditableColumn<T> extends Column<T> {
  editable?: boolean;
  inputType?: 'text' | 'number' | 'select' | 'date';
  options?: { value: string; label: string }[];
  validate?: (value: any) => boolean | string;
}

interface EditableTableProps<T extends TableRow> {
  data: T[];
  columns: EditableColumn<T>[];
  onCellChange: (rowId: string | number, key: string, value: any) => void;
  onRowAdd?: () => void;
  onRowDelete?: (rowId: string | number) => void;
}

export function EditableTable<T extends TableRow>({
  data,
  columns,
  onCellChange,
  onRowAdd,
  onRowDelete,
}: EditableTableProps<T>) {
  const [editingCell, setEditingCell] = useState<{ rowId: string | number; key: string } | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const startEditing = (rowId: string | number, key: string, value: any) => {
    setEditingCell({ rowId, key });
    setEditValue(value);
  };

  const saveEdit = () => {
    if (!editingCell) return;

    const column = columns.find((c) => c.key === editingCell.key);
    if (column?.validate) {
      const result = column.validate(editValue);
      if (typeof result === 'string') {
        setErrors({ [`${editingCell.rowId}-${editingCell.key}`]: result });
        return;
      }
      if (!result) {
        setErrors({ [`${editingCell.rowId}-${editingCell.key}`]: 'Invalid value' });
        return;
      }
    }

    setErrors({});
    onCellChange(editingCell.rowId, editingCell.key, editValue);
    setEditingCell(null);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setErrors({});
  };

  const renderEditableCell = (
    row: T,
    column: EditableColumn<T>,
    value: any
  ) => {
    const isEditing =
      editingCell?.rowId === row.id && editingCell?.key === column.key;
    const errorKey = `${String(row.id)}-${String(column.key)}`;

    if (!column.editable) {
      return column.render ? column.render(value, row, 0) : value;
    }

    if (isEditing) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {column.inputType === 'select' ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              autoFocus
              style={{
                padding: '4px 8px',
                border: errors[errorKey]
                  ? '1px solid var(--color-error)'
                  : '1px solid var(--color-accent)',
                borderRadius: 4,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            >
              {column.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={column.inputType || 'text'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              autoFocus
              style={{
                padding: '4px 8px',
                border: errors[errorKey]
                  ? '1px solid var(--color-error)'
                  : '1px solid var(--color-accent)',
                borderRadius: 4,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                width: '100%',
              }}
            />
          )}
          {errors[errorKey] && (
            <span style={{ fontSize: 11, color: 'var(--color-error)' }}>
              {errors[errorKey]}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        onClick={() => startEditing(row.id, String(column.key), value)}
        style={{ cursor: 'pointer', padding: '4px 0' }}
      >
        {column.render ? column.render(value, row, 0) : value || <span style={{ color: 'var(--color-text-muted)' }}>Click to edit</span>}
      </div>
    );
  };

  const styles: Record<string, React.CSSProperties> = {
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 14,
    },
    th: {
      padding: '12px 16px',
      textAlign: 'left',
      fontWeight: 600,
      color: 'var(--color-text)',
      borderBottom: '2px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
    },
    td: {
      padding: '8px 16px',
      borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text)',
    },
    actions: {
      display: 'flex',
      gap: 8,
    },
    button: {
      padding: '4px 8px',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 12,
    },
  };

  return (
    <div>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} style={styles.th}>
                {col.title}
              </th>
            ))}
            {onRowDelete && <th style={{ ...styles.th, width: 60 }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={String(col.key)} style={styles.td}>
                  {renderEditableCell(row, col, row[col.key as keyof T])}
                </td>
              ))}
              {onRowDelete && (
                <td style={styles.td}>
                  <button
                    onClick={() => onRowDelete(row.id)}
                    style={{
                      ...styles.button,
                      background: 'var(--color-error)',
                      color: 'white',
                    }}
                  >
                    trash
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {onRowAdd && (
        <button
          onClick={onRowAdd}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            border: '1px dashed var(--color-border)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          + Add Row
        </button>
      )}
    </div>
  );
}

// ==================== PIVOT TABLE ====================

interface PivotTableProps {
  data: Record<string, any>[];
  rows: string[];
  columns: string[];
  values: {
    field: string;
    aggregate: 'sum' | 'count' | 'avg' | 'min' | 'max';
    label?: string;
  }[];
}

export const PivotTable: React.FC<PivotTableProps> = ({
  data,
  rows,
  columns,
  values,
}) => {
  const pivotData = useMemo(() => {
    const result: Record<string, Record<string, Record<string, number[]>>> = {};

    data.forEach((item) => {
      const rowKey = rows.map((r) => item[r]).join('|');
      const colKey = columns.map((c) => item[c]).join('|');

      if (!result[rowKey]) result[rowKey] = {};
      if (!result[rowKey][colKey]) {
        result[rowKey][colKey] = {};
        values.forEach((v) => {
          result[rowKey][colKey][v.field] = [];
        });
      }

      values.forEach((v) => {
        const val = parseFloat(item[v.field]) || 0;
        result[rowKey][colKey][v.field].push(val);
      });
    });

    return result;
  }, [data, rows, columns, values]);

  const uniqueColumns = useMemo(() => {
    const cols = new Set<string>();
    Object.values(pivotData).forEach((row) => {
      Object.keys(row).forEach((col) => cols.add(col));
    });
    return Array.from(cols);
  }, [pivotData]);

  const aggregate = (nums: number[], type: string): number => {
    if (nums.length === 0) return 0;
    switch (type) {
      case 'sum':
        return nums.reduce((a, b) => a + b, 0);
      case 'count':
        return nums.length;
      case 'avg':
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      case 'min':
        return Math.min(...nums);
      case 'max':
        return Math.max(...nums);
      default:
        return 0;
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
    },
    th: {
      padding: '8px 12px',
      textAlign: 'center',
      fontWeight: 600,
      color: 'var(--color-text)',
      borderBottom: '2px solid var(--color-border)',
      background: 'var(--color-bg-secondary)',
    },
    td: {
      padding: '8px 12px',
      textAlign: 'right',
      borderBottom: '1px solid var(--color-border)',
      color: 'var(--color-text)',
    },
    rowHeader: {
      textAlign: 'left',
      fontWeight: 500,
    },
  };

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>{rows.join(' / ')}</th>
          {uniqueColumns.map((col) =>
            values.map((v) => (
              <th key={`${col}-${v.field}`} style={styles.th}>
                {col || '-'} ({v.label || v.field})
              </th>
            ))
          )}
        </tr>
      </thead>
      <tbody>
        {Object.entries(pivotData).map(([rowKey, colData]) => (
          <tr key={rowKey}>
            <td style={{ ...styles.td, ...styles.rowHeader }}>{rowKey || '-'}</td>
            {uniqueColumns.map((col) =>
              values.map((v) => (
                <td key={`${col}-${v.field}`} style={styles.td}>
                  {colData[col]
                    ? aggregate(colData[col][v.field], v.aggregate).toFixed(2)
                    : '-'}
                </td>
              ))
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default EnhancedTable;
