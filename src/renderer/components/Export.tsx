/**
 * DEX Export Component
 * Export data to various formats
 */

import React, { useState, useCallback } from 'react';
import DOMPurify from 'dompurify';

// ==================== TYPES ====================

type ExportFormat = 'json' | 'csv' | 'txt' | 'xml' | 'html' | 'markdown' | 'md' | 'pdf';

interface ExportButtonProps {
  data: any;
  filename?: string;
  format?: ExportFormat;
  onExport?: (format: ExportFormat) => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

interface ExportMenuProps {
  data: any;
  filename?: string;
  formats?: ExportFormat[];
  onExport?: (format: ExportFormat) => void;
}

interface DataExporterProps {
  data: any[];
  columns?: { key: string; label: string }[];
  filename?: string;
  title?: string;
  formats?: ExportFormat[];
  onExportStart?: (format: ExportFormat) => void;
  onExportComplete?: (format: ExportFormat) => void;
  onExportError?: (error: Error) => void;
}

interface PrintButtonProps {
  content: React.RefObject<HTMLElement>;
  title?: string;
  styles?: string;
  onPrint?: () => void;
}

// ==================== UTILITIES ====================

const formatLabels: Record<ExportFormat, string> = {
  json: 'JSON',
  csv: 'CSV',
  txt: 'Text',
  xml: 'XML',
  html: 'HTML',
  markdown: 'Markdown',
  md: 'Markdown',
  pdf: 'PDF',
};

const formatIcons: Record<ExportFormat, string> = {
  json: '{ }',
  csv: 'bar-chart',
  txt: 'file',
  xml: '< >',
  html: 'globe',
  markdown: 'file-text',
  md: 'file-text',
  pdf: 'book',
};

const convertToCSV = (data: any[], columns?: { key: string; label: string }[]): string => {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const headers = columns
    ? columns.map(c => c.label)
    : Object.keys(data[0]);

  const keys = columns
    ? columns.map(c => c.key)
    : Object.keys(data[0]);

  const rows = data.map(item =>
    keys.map(key => {
      const value = item[key];
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma or newline
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
};

const convertToXML = (data: any[], rootName = 'data', itemName = 'item'): string => {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const objectToXml = (obj: any, indent = '  '): string => {
    return Object.entries(obj).map(([key, value]) => {
      if (value === null || value === undefined) {
        return `${indent}<${key}/>`;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        return `${indent}<${key}>\n${objectToXml(value, indent + '  ')}\n${indent}</${key}>`;
      }
      return `${indent}<${key}>${escapeXml(String(value))}</${key}>`;
    }).join('\n');
  };

  const items = data.map(item => 
    `  <${itemName}>\n${objectToXml(item, '    ')}\n  </${itemName}>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n${items}\n</${rootName}>`;
};

const convertToMarkdown = (data: any[], columns?: { key: string; label: string }[]): string => {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const headers = columns
    ? columns.map(c => c.label)
    : Object.keys(data[0]);

  const keys = columns
    ? columns.map(c => c.key)
    : Object.keys(data[0]);

  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = data.map(item =>
    `| ${keys.map(key => String(item[key] ?? '')).join(' | ')} |`
  ).join('\n');

  return `${headerRow}\n${separatorRow}\n${dataRows}`;
};

const convertToHTML = (data: any[], columns?: { key: string; label: string }[], title = 'Export'): string => {
  if (!Array.isArray(data) || data.length === 0) {
    return '<html><body><p>No data</p></body></html>';
  }

  const headers = columns
    ? columns.map(c => c.label)
    : Object.keys(data[0]);

  const keys = columns
    ? columns.map(c => c.key)
    : Object.keys(data[0]);

  const tableRows = data.map(item =>
    `    <tr>${keys.map(key => `<td>${item[key] ?? ''}</td>`).join('')}</tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <table>
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
</body>
</html>`;
};

const downloadFile = (content: string, filename: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getMimeType = (format: ExportFormat): string => {
  switch (format) {
    case 'json': return 'application/json';
    case 'csv': return 'text/csv';
    case 'txt': return 'text/plain';
    case 'xml': return 'application/xml';
    case 'html': return 'text/html';
    case 'markdown':
    case 'md': return 'text/markdown';
    case 'pdf': return 'application/pdf';
    default: return 'text/plain';
  }
};

// ==================== EXPORT BUTTON ====================

export const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  filename = 'export',
  format = 'json',
  onExport,
  children,
  disabled = false,
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (disabled || exporting) return;

    setExporting(true);
    try {
      let content: string;
      let ext: string = format;

      switch (format) {
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'csv':
          content = Array.isArray(data) ? convertToCSV(data) : convertToCSV([data]);
          break;
        case 'txt':
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          break;
        case 'xml':
          content = Array.isArray(data) ? convertToXML(data) : convertToXML([data]);
          break;
        case 'html':
          content = Array.isArray(data) ? convertToHTML(data) : convertToHTML([data]);
          break;
        case 'markdown':
          content = Array.isArray(data) ? convertToMarkdown(data) : convertToMarkdown([data]);
          ext = 'md';
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      downloadFile(content, `${filename}.${ext}`, getMimeType(format));
      onExport?.(format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all 0.15s',
    },
  };

  return (
    <button style={styles.button} onClick={handleExport} disabled={disabled}>
      {exporting ? (
        'Exporting...'
      ) : children ? (
        children
      ) : (
        <>
          <span>arrow-down</span>
          Export {formatLabels[format]}
        </>
      )}
    </button>
  );
};

// ==================== EXPORT MENU ====================

export const ExportMenu: React.FC<ExportMenuProps> = ({
  data,
  filename = 'export',
  formats = ['json', 'csv', 'txt'],
  onExport,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      let content: string;
      let ext: string = format;

      switch (format) {
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'csv':
          content = Array.isArray(data) ? convertToCSV(data) : convertToCSV([data]);
          break;
        case 'txt':
          content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
          break;
        case 'xml':
          content = Array.isArray(data) ? convertToXML(data) : convertToXML([data]);
          break;
        case 'html':
          content = Array.isArray(data) ? convertToHTML(data) : convertToHTML([data]);
          break;
        case 'markdown':
          content = Array.isArray(data) ? convertToMarkdown(data) : convertToMarkdown([data]);
          ext = 'md';
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      downloadFile(content, `${filename}.${ext}`, getMimeType(format));
      onExport?.(format);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(null);
      setIsOpen(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      display: 'inline-block',
    },
    button: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    menu: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 4,
      minWidth: 160,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      zIndex: 1000,
    },
    menuItem: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 12px',
      background: 'none',
      border: 'none',
      borderRadius: 4,
      width: '100%',
      fontSize: 14,
      color: 'var(--color-text)',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'background 0.15s',
    },
    menuIcon: {
      fontSize: 14,
      width: 24,
      textAlign: 'center',
    },
  };

  return (
    <div style={styles.container}>
      <button style={styles.button} onClick={() => setIsOpen(!isOpen)}>
        <span>arrow-down</span>
        Export
        <span style={{ fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div style={styles.menu}>
          {formats.map(format => (
            <button
              key={format}
              style={styles.menuItem}
              onClick={() => handleExport(format)}
              disabled={exporting === format}
            >
              <span style={styles.menuIcon as any}>{formatIcons[format]}</span>
              {exporting === format ? 'Exporting...' : formatLabels[format]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== DATA EXPORTER ====================

export const DataExporter: React.FC<DataExporterProps> = ({
  data,
  columns,
  filename = 'export',
  title = 'Export Data',
  formats = ['json', 'csv', 'xml', 'markdown'],
  onExportStart,
  onExportComplete,
  onExportError,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<string>('');

  const generatePreview = useCallback((format: ExportFormat) => {
    try {
      const sampleData = data.slice(0, 3);
      let content: string;

      switch (format) {
        case 'json':
          content = JSON.stringify(sampleData, null, 2);
          break;
        case 'csv':
          content = convertToCSV(sampleData, columns);
          break;
        case 'xml':
          content = convertToXML(sampleData);
          break;
        case 'markdown':
          content = convertToMarkdown(sampleData, columns);
          break;
        case 'html':
          content = '<Preview not available for HTML>';
          break;
        default:
          content = JSON.stringify(sampleData, null, 2);
      }

      setPreview(content.slice(0, 500) + (content.length > 500 ? '\n...' : ''));
    } catch (error) {
      setPreview('Preview not available');
    }
  }, [data, columns]);

  React.useEffect(() => {
    generatePreview(selectedFormat);
  }, [selectedFormat, generatePreview]);

  const handleExport = async () => {
    setExporting(true);
    onExportStart?.(selectedFormat);

    try {
      let content: string;
      let ext: string = selectedFormat;

      switch (selectedFormat) {
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'csv':
          content = convertToCSV(data, columns);
          break;
        case 'xml':
          content = convertToXML(data);
          break;
        case 'html':
          content = convertToHTML(data, columns, title);
          break;
        case 'markdown':
          content = convertToMarkdown(data, columns);
          ext = 'md';
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      downloadFile(content, `${filename}.${ext}`, getMimeType(selectedFormat));
      onExportComplete?.(selectedFormat);
    } catch (error) {
      onExportError?.(error as Error);
    } finally {
      setExporting(false);
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: 20,
      background: 'var(--color-bg-secondary)',
      borderRadius: 12,
      border: '1px solid var(--color-border)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    info: {
      fontSize: 12,
      color: 'var(--color-text-muted)',
    },
    formats: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
    },
    formatButton: {
      padding: '8px 16px',
      background: 'var(--color-bg-tertiary)',
      border: '2px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--color-text)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    formatButtonSelected: {
      borderColor: 'var(--color-accent)',
      background: 'rgba(var(--color-accent-rgb), 0.1)',
    },
    preview: {
      padding: 12,
      background: 'var(--color-bg-tertiary)',
      borderRadius: 8,
      fontFamily: 'monospace',
      fontSize: 11,
      color: 'var(--color-text-secondary)',
      whiteSpace: 'pre-wrap',
      overflow: 'auto',
      maxHeight: 200,
    },
    previewLabel: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--color-text-muted)',
      marginBottom: 8,
    },
    exportButton: {
      padding: '12px 24px',
      background: 'var(--color-accent)',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      cursor: exporting ? 'not-allowed' : 'pointer',
      opacity: exporting ? 0.7 : 1,
      alignSelf: 'flex-end',
      transition: 'all 0.15s',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>{title}</h3>
        <span style={styles.info}>{data.length} items</span>
      </div>

      <div>
        <div style={styles.previewLabel}>Select format:</div>
        <div style={styles.formats}>
          {formats.map(format => (
            <button
              key={format}
              style={{
                ...styles.formatButton,
                ...(selectedFormat === format ? styles.formatButtonSelected : {}),
              }}
              onClick={() => setSelectedFormat(format)}
            >
              {formatIcons[format]} {formatLabels[format]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={styles.previewLabel}>Preview:</div>
        <div style={styles.preview}>{preview}</div>
      </div>

      <button style={styles.exportButton} onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting...' : `Export as ${formatLabels[selectedFormat]}`}
      </button>
    </div>
  );
};

// ==================== PRINT BUTTON ====================

export const PrintButton: React.FC<PrintButtonProps> = ({
  content,
  title = 'Print',
  styles: customStyles = '',
  onPrint,
}) => {
  const handlePrint = () => {
    const element = content.current;
    if (!element) return;

    const printWindow = window.open('', '', 'width=800,height=600,noopener');
    if (!printWindow) return;

    const sanitizedContent = DOMPurify.sanitize(element.innerHTML);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${DOMPurify.sanitize(title)}</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 20px; }
          @media print {
            body { padding: 0; }
          }
          ${customStyles}
        </style>
      </head>
      <body>
        ${sanitizedContent}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      onPrint?.();
    }, 250);
  };

  const buttonStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    fontSize: 14,
    color: 'var(--color-text)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  return (
    <button style={buttonStyles} onClick={handlePrint}>
      printer Print
    </button>
  );
};

// ==================== USE EXPORT HOOK ====================

export const useExport = () => {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportData = useCallback(async (
    data: any,
    options: {
      format?: ExportFormat;
      filename?: string;
      columns?: { key: string; label: string }[];
    } = {}
  ) => {
    const { format = 'json', filename = 'export', columns } = options;

    setExporting(true);
    setError(null);

    try {
      let content: string;
      let ext: string = format;

      switch (format) {
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'csv':
          content = Array.isArray(data) ? convertToCSV(data, columns) : convertToCSV([data], columns);
          break;
        case 'xml':
          content = Array.isArray(data) ? convertToXML(data) : convertToXML([data]);
          break;
        case 'html':
          content = Array.isArray(data) ? convertToHTML(data, columns) : convertToHTML([data], columns);
          break;
        case 'markdown':
          content = Array.isArray(data) ? convertToMarkdown(data, columns) : convertToMarkdown([data], columns);
          ext = 'md';
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      downloadFile(content, `${filename}.${ext}`, getMimeType(format));
      return true;
    } catch (err) {
      setError(err as Error);
      return false;
    } finally {
      setExporting(false);
    }
  }, []);

  return {
    exportData,
    exporting,
    error,
  };
};

export default ExportButton;
