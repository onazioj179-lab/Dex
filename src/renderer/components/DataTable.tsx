/**
 * DEX Data Table
 * Advanced data table with sorting, filtering, pagination
 */

import React, { useState, useMemo, useCallback } from 'react';

// ==================== TYPES ====================

type SortDirection = 'asc' | 'desc' | null;

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number | string;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T, index: number) => React.ReactNode;
  sortFn?: (a: T, b: T) => number;
  filterFn?: (row: T, filterValue: string) => boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  pageSize?: number;
  pageSizeOptions?: number[];
  selectable?: boolean;
  multiSelect?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  stickyHeader?: boolean;
  striped?: boolean;
  bordered?: boolean;
  compact?: boolean;
  rowActions?: (row: T) => React.ReactNode;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  compact?: boolean;
}

// ==================== DATA TABLE ====================

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  selectable = false,
  multiSelect = true,
  onSelectionChange,
  onRowClick,
  onRowDoubleClick,
  searchable = false,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data available',
  loading = false,
  stickyHeader = false,
  striped = true,
  bordered = false,
  compact = false,
  rowActions,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedRows, setSelectedRows] = useState<Set<any>>(new Set());
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // Filter data
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(row =>
        columns.some(col => {
          const value = getNestedValue(row, col.key as string);
          return String(value).toLowerCase().includes(query);
        })
      );
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([key, filterValue]) => {
      if (filterValue) {
        const column = columns.find(c => c.key === key);
        result = result.filter(row => {
          if (column?.filterFn) {
            return column.filterFn(row, filterValue);
          }
          const value = getNestedValue(row, key);
          return String(value).toLowerCase().includes(filterValue.toLowerCase());
        });
      }
    });

    return result;
  }, [data, searchQuery, columnFilters, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredData;

    const column = columns.find(c => c.key === sortColumn);
    return [...filteredData].sort((a, b) => {
      if (column?.sortFn) {
        return sortDirection === 'asc' ? column.sortFn(a, b) : column.sortFn(b, a);
      }

      const aVal = getNestedValue(a, sortColumn);
      const bVal = getNestedValue(b, sortColumn);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection, columns]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // Handlers
  const handleSort = useCallback((columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === paginatedData.length) {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    } else {
      const newSelected = new Set(paginatedData.map(row => row[keyField]));
      setSelectedRows(newSelected);
      onSelectionChange?.(paginatedData);
    }
  }, [paginatedData, selectedRows, keyField, onSelectionChange]);

  const handleSelectRow = useCallback((row: T) => {
    const key = row[keyField];
    const newSelected = new Set(selectedRows);

    if (multiSelect) {
      if (newSelected.has(key)) {
        newSelected.delete(key);
      } else {
        newSelected.add(key);
      }
    } else {
      newSelected.clear();
      if (!selectedRows.has(key)) {
        newSelected.add(key);
      }
    }

    setSelectedRows(newSelected);
    const selectedData = data.filter(r => newSelected.has(r[keyField]));
    onSelectionChange?.(selectedData);
  }, [selectedRows, keyField, multiSelect, data, onSelectionChange]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  // Styles
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      width: '100%',
    },
    searchContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: {
      flex: 1,
      maxWidth: 300,
      padding: '8px 12px',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg-secondary)',
      color: 'var(--color-text)',
      fontSize: 14,
      outline: 'none',
    },
    tableWrapper: {
      overflow: 'auto',
      border: bordered ? '1px solid var(--color-border)' : 'none',
      borderRadius: 8,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: compact ? 13 : 14,
    },
    thead: {
      background: 'var(--color-bg-tertiary)',
      position: stickyHeader ? 'sticky' : 'relative',
      top: 0,
      zIndex: 1,
    },
    th: {
      padding: compact ? '8px 12px' : '12px 16px',
      textAlign: 'left',
      fontWeight: 600,
      color: 'var(--color-text)',
      borderBottom: '2px solid var(--color-border)',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    },
    thSortable: {
      cursor: 'pointer',
    },
    sortIcon: {
      marginLeft: 4,
      opacity: 0.5,
    },
    sortIconActive: {
      opacity: 1,
    },
    tr: {
      borderBottom: '1px solid var(--color-border)',
      transition: 'background 0.15s',
    },
    trHover: {
      background: 'var(--color-bg-hover)',
    },
    trSelected: {
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    trStriped: {
      background: 'var(--color-bg-secondary)',
    },
    td: {
      padding: compact ? '8px 12px' : '12px 16px',
      color: 'var(--color-text)',
      verticalAlign: 'middle',
    },
    checkbox: {
      width: 18,
      height: 18,
      cursor: 'pointer',
    },
    loading: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      color: 'var(--color-text-muted)',
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: 'var(--color-text-muted)',
    },
    actions: {
      display: 'flex',
      gap: 4,
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Search */}
      {searchable && (
        <div style={styles.searchContainer}>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={styles.searchInput}
          />
          {searchQuery && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              {filteredData.length} results
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              {selectable && (
                <th style={{ ...styles.th, width: 40 }}>
                  {multiSelect && (
                    <input
                      type="checkbox"
                      checked={paginatedData.length > 0 && selectedRows.size === paginatedData.length}
                      onChange={handleSelectAll}
                      style={styles.checkbox}
                    />
                  )}
                </th>
              )}
              {columns.map(column => (
                <th
                  key={String(column.key)}
                  style={{
                    ...styles.th,
                    ...(column.sortable ? styles.thSortable : {}),
                    width: column.width,
                    minWidth: column.minWidth,
                    maxWidth: column.maxWidth,
                    textAlign: column.align || 'left',
                  }}
                  onClick={() => column.sortable && handleSort(String(column.key))}
                >
                  {column.header}
                  {column.sortable && (
                    <span
                      style={{
                        ...styles.sortIcon,
                        ...(sortColumn === column.key ? styles.sortIconActive : {}),
                      }}
                    >
                      {sortColumn === column.key
                        ? sortDirection === 'asc'
                          ? ' arrow-up'
                          : ' arrow-down'
                        : ' ↕'}
                    </span>
                  )}
                </th>
              ))}
              {rowActions && <th style={{ ...styles.th, width: 100 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                  style={styles.empty}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const isSelected = selectedRows.has(row[keyField]);
                const isStriped = striped && index % 2 === 1;

                return (
                  <tr
                    key={String(row[keyField])}
                    style={{
                      ...styles.tr,
                      ...(isSelected ? styles.trSelected : {}),
                      ...(isStriped && !isSelected ? styles.trStriped : {}),
                    }}
                    onClick={() => onRowClick?.(row)}
                    onDoubleClick={() => onRowDoubleClick?.(row)}
                  >
                    {selectable && (
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(row)}
                          onClick={e => e.stopPropagation()}
                          style={styles.checkbox}
                        />
                      </td>
                    )}
                    {columns.map(column => {
                      const value = getNestedValue(row, String(column.key));
                      return (
                        <td
                          key={String(column.key)}
                          style={{
                            ...styles.td,
                            textAlign: column.align || 'left',
                          }}
                        >
                          {column.render
                            ? column.render(value, row, index)
                            : formatCellValue(value)}
                        </td>
                      );
                    })}
                    {rowActions && (
                      <td style={styles.td} onClick={e => e.stopPropagation()}>
                        <div style={styles.actions}>{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={sortedData.length}
          pageSizeOptions={pageSizeOptions}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          compact={compact}
        />
      )}
    </div>
  );
}

// ==================== PAGINATION ====================

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [10, 25, 50],
  onPageChange,
  onPageSizeChange,
  compact = false,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    info: {
      color: 'var(--color-text-muted)',
      fontSize: compact ? 12 : 13,
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    button: {
      padding: compact ? '4px 8px' : '6px 12px',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      background: 'var(--color-bg-secondary)',
      color: 'var(--color-text)',
      cursor: 'pointer',
      fontSize: compact ? 12 : 13,
      transition: 'background 0.15s',
    },
    buttonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    buttonActive: {
      background: 'var(--color-accent)',
      color: 'white',
      borderColor: 'var(--color-accent)',
    },
    select: {
      padding: '4px 8px',
      border: '1px solid var(--color-border)',
      borderRadius: 4,
      background: 'var(--color-bg-secondary)',
      color: 'var(--color-text)',
      fontSize: compact ? 12 : 13,
      cursor: 'pointer',
    },
  };

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const showAround = 1;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - showAround && i <= currentPage + showAround)
      ) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== 'ellipsis') {
        pages.push('ellipsis');
      }
    }

    return pages;
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        Showing {startItem}-{endItem} of {totalItems}
      </div>

      <div style={styles.controls}>
        {onPageSizeChange && (
          <select
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            style={styles.select}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        )}

        <button
          style={{
            ...styles.button,
            ...(currentPage === 1 ? styles.buttonDisabled : {}),
          }}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          arrow-left
        </button>

        {getPageNumbers().map((page, index) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} style={{ padding: '0 4px' }}>
              ...
            </span>
          ) : (
            <button
              key={page}
              style={{
                ...styles.button,
                ...(page === currentPage ? styles.buttonActive : {}),
              }}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          )
        )}

        <button
          style={{
            ...styles.button,
            ...(currentPage === totalPages ? styles.buttonDisabled : {}),
          }}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          arrow-right
        </button>
      </div>
    </div>
  );
};

// ==================== UTILITIES ====================

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

// ==================== HOOK: useDataTable ====================

export function useDataTable<T>(initialData: T[]) {
  const [data, setData] = useState(initialData);
  const [selectedRows, setSelectedRows] = useState<T[]>([]);

  const addRow = useCallback((row: T) => {
    setData(prev => [...prev, row]);
  }, []);

  const updateRow = useCallback((index: number, row: T) => {
    setData(prev => {
      const newData = [...prev];
      newData[index] = row;
      return newData;
    });
  }, []);

  const deleteRow = useCallback((index: number) => {
    setData(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRows([]);
  }, []);

  return {
    data,
    setData,
    selectedRows,
    setSelectedRows,
    addRow,
    updateRow,
    deleteRow,
    clearSelection,
  };
}

export default DataTable;
