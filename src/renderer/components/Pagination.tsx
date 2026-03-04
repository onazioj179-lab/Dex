/**
 * DEX Pagination Component
 * Page navigation with multiple styles
 */

import React, { useMemo, useCallback } from 'react';

// ==================== TYPES ====================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  boundaryCount?: number;
  showFirstLast?: boolean;
  showPrevNext?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'simple' | 'minimal';
  disabled?: boolean;
}

interface PageSizeSelectProps {
  value: number;
  options?: number[];
  onChange: (size: number) => void;
  label?: string;
  disabled?: boolean;
}

interface PaginationInfoProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  itemLabel?: string;
}

interface LoadMoreProps {
  onLoadMore: () => void;
  hasMore: boolean;
  loading?: boolean;
  loadedCount?: number;
  totalCount?: number;
}

interface InfinitePaginationProps {
  currentPage: number;
  hasMore: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  loading?: boolean;
}

// ==================== PAGINATION ====================

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  boundaryCount = 1,
  showFirstLast = true,
  showPrevNext = true,
  size = 'md',
  variant = 'default',
  disabled = false,
}) => {
  const sizeConfig = {
    sm: { height: 28, fontSize: 12, gap: 4 },
    md: { height: 36, fontSize: 14, gap: 6 },
    lg: { height: 44, fontSize: 16, gap: 8 },
  };

  const config = sizeConfig[size];

  // Generate page numbers to display
  const pageNumbers = useMemo(() => {
    const range = (start: number, end: number) => {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const totalNumbers = siblingCount * 2 + 3 + boundaryCount * 2;

    if (totalNumbers >= totalPages) {
      return range(1, totalPages);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, boundaryCount + 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages - boundaryCount);

    const showLeftEllipsis = leftSiblingIndex > boundaryCount + 2;
    const showRightEllipsis = rightSiblingIndex < totalPages - boundaryCount - 1;

    if (!showLeftEllipsis && showRightEllipsis) {
      const leftItemCount = siblingCount * 2 + boundaryCount + 2;
      return [
        ...range(1, leftItemCount),
        'ellipsis-right',
        ...range(totalPages - boundaryCount + 1, totalPages),
      ];
    }

    if (showLeftEllipsis && !showRightEllipsis) {
      const rightItemCount = siblingCount * 2 + boundaryCount + 2;
      return [
        ...range(1, boundaryCount),
        'ellipsis-left',
        ...range(totalPages - rightItemCount + 1, totalPages),
      ];
    }

    return [
      ...range(1, boundaryCount),
      'ellipsis-left',
      ...range(leftSiblingIndex, rightSiblingIndex),
      'ellipsis-right',
      ...range(totalPages - boundaryCount + 1, totalPages),
    ];
  }, [currentPage, totalPages, siblingCount, boundaryCount]);

  const handlePageChange = useCallback((page: number) => {
    if (disabled || page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  }, [disabled, totalPages, currentPage, onPageChange]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: config.gap,
      opacity: disabled ? 0.5 : 1,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: config.height,
      height: config.height,
      padding: '0 12px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: config.fontSize,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.15s',
    },
    buttonActive: {
      background: 'var(--color-accent)',
      borderColor: 'var(--color-accent)',
      color: '#fff',
    },
    buttonDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
    ellipsis: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: config.height,
      height: config.height,
      fontSize: config.fontSize,
      color: 'var(--color-text-muted)',
    },
    navButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: config.height,
      height: config.height,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: config.fontSize,
      color: 'var(--color-text)',
      cursor: disabled ? 'not-allowed' : 'pointer',
    },
  };

  if (variant === 'minimal') {
    return (
      <div style={styles.container}>
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === 1 ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={disabled || currentPage === 1}
        >
          arrow-left
        </button>
        <span style={{ fontSize: config.fontSize, color: 'var(--color-text)' }}>
          {currentPage} / {totalPages}
        </span>
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === totalPages ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={disabled || currentPage === totalPages}
        >
          arrow-right
        </button>
      </div>
    );
  }

  if (variant === 'simple') {
    return (
      <div style={styles.container}>
        <button
          style={{
            ...styles.button,
            ...(currentPage === 1 ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={disabled || currentPage === 1}
        >
          Previous
        </button>
        <button
          style={{
            ...styles.button,
            ...(currentPage === totalPages ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={disabled || currentPage === totalPages}
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {showFirstLast && (
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === 1 ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(1)}
          disabled={disabled || currentPage === 1}
          title="First page"
        >
          ⟨⟨
        </button>
      )}

      {showPrevNext && (
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === 1 ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={disabled || currentPage === 1}
          title="Previous page"
        >
          arrow-left
        </button>
      )}

      {pageNumbers.map((page, index) => {
        if (typeof page === 'string') {
          return (
            <span key={page} style={styles.ellipsis}>
              ...
            </span>
          );
        }

        return (
          <button
            key={page}
            style={{
              ...styles.button,
              ...(page === currentPage ? styles.buttonActive : {}),
            }}
            onClick={() => handlePageChange(page)}
            disabled={disabled}
          >
            {page}
          </button>
        );
      })}

      {showPrevNext && (
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === totalPages ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={disabled || currentPage === totalPages}
          title="Next page"
        >
          arrow-right
        </button>
      )}

      {showFirstLast && (
        <button
          style={{
            ...styles.navButton,
            ...(currentPage === totalPages ? styles.buttonDisabled : {}),
          }}
          onClick={() => handlePageChange(totalPages)}
          disabled={disabled || currentPage === totalPages}
          title="Last page"
        >
          ⟩⟩
        </button>
      )}
    </div>
  );
};

// ==================== PAGE SIZE SELECT ====================

export const PageSizeSelect: React.FC<PageSizeSelectProps> = ({
  value,
  options = [10, 25, 50, 100],
  onChange,
  label = 'Items per page',
  disabled = false,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
    },
    select: {
      padding: '6px 10px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      color: 'var(--color-text)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      outline: 'none',
    },
  };

  return (
    <div style={styles.container}>
      <span style={styles.label}>{label}:</span>
      <select
        style={styles.select}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
};

// ==================== PAGINATION INFO ====================

export const PaginationInfo: React.FC<PaginationInfoProps> = ({
  currentPage,
  pageSize,
  totalItems,
  itemLabel = 'items',
}) => {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      fontSize: 13,
      color: 'var(--color-text-secondary)',
    },
    numbers: {
      fontWeight: 500,
      color: 'var(--color-text)',
    },
  };

  return (
    <div style={styles.container}>
      Showing <span style={styles.numbers}>{start}</span> to{' '}
      <span style={styles.numbers}>{end}</span> of{' '}
      <span style={styles.numbers}>{totalItems}</span> {itemLabel}
    </div>
  );
};

// ==================== LOAD MORE ====================

export const LoadMore: React.FC<LoadMoreProps> = ({
  onLoadMore,
  hasMore,
  loading = false,
  loadedCount,
  totalCount,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: 20,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '12px 24px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: loading || !hasMore ? 'not-allowed' : 'pointer',
      opacity: loading ? 0.7 : 1,
      transition: 'all 0.15s',
    },
    info: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
    },
    spinner: {
      width: 16,
      height: 16,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-accent)',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    },
  };

  if (!hasMore) {
    return (
      <div style={styles.container}>
        <span style={styles.info}>
          {totalCount ? `All ${totalCount} items loaded` : 'No more items to load'}
        </span>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {loadedCount !== undefined && totalCount !== undefined && (
        <span style={styles.info}>
          Showing {loadedCount} of {totalCount}
        </span>
      )}
      <button
        style={styles.button}
        onClick={onLoadMore}
        disabled={loading}
      >
        {loading ? (
          <>
            <div style={styles.spinner} />
            Loading...
          </>
        ) : (
          'Load more'
        )}
      </button>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ==================== INFINITE PAGINATION ====================

export const InfinitePagination: React.FC<InfinitePaginationProps> = ({
  currentPage,
  hasMore,
  onNextPage,
  onPrevPage,
  loading = false,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 16px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    buttonDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    page: {
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
    },
    spinner: {
      width: 12,
      height: 12,
      border: '2px solid var(--color-border)',
      borderTopColor: 'var(--color-accent)',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={{
          ...styles.button,
          ...(currentPage === 1 || loading ? styles.buttonDisabled : {}),
        }}
        onClick={onPrevPage}
        disabled={currentPage === 1 || loading}
      >
        arrow-left Previous
      </button>
      
      <span style={styles.page}>
        {loading ? (
          <div style={styles.spinner} />
        ) : (
          `Page ${currentPage}`
        )}
      </span>
      
      <button
        style={{
          ...styles.button,
          ...(!hasMore || loading ? styles.buttonDisabled : {}),
        }}
        onClick={onNextPage}
        disabled={!hasMore || loading}
      >
        Next arrow-right
      </button>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ==================== CURSOR PAGINATION ====================

interface CursorPaginationProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  loading?: boolean;
}

export const CursorPagination: React.FC<CursorPaginationProps> = ({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  loading = false,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 8,
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 20px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    disabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    },
  };

  return (
    <div style={styles.container}>
      <button
        style={{ ...styles.button, ...(!hasPrev || loading ? styles.disabled : {}) }}
        onClick={onPrev}
        disabled={!hasPrev || loading}
      >
        arrow-left Newer
      </button>
      <button
        style={{ ...styles.button, ...(!hasNext || loading ? styles.disabled : {}) }}
        onClick={onNext}
        disabled={!hasNext || loading}
      >
        Older arrow-right
      </button>
    </div>
  );
};

// ==================== USE PAGINATION HOOK ====================

export const usePagination = (totalItems: number, itemsPerPage: number) => {
  const [currentPage, setCurrentPage] = React.useState(1);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  const firstPage = useCallback(() => {
    goToPage(1);
  }, [goToPage]);

  const lastPage = useCallback(() => {
    goToPage(totalPages);
  }, [goToPage, totalPages]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  return {
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};

export default Pagination;
