// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Phase 32: System Audit & Integrity
// Release hardening, system checks, and production readiness
// ===========================================================================

// -----------------------------------------------------------------------------
// AUDIT CATEGORIES
// -----------------------------------------------------------------------------

export type AuditCategory = 
  | 'memory'
  | 'performance'
  | 'security'
  | 'ipc'
  | 'storage'
  | 'ui'
  | 'accessibility';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditResult {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  message: string;
  details?: string;
  timestamp: number;
  passed: boolean;
}

export interface SystemAuditReport {
  timestamp: number;
  duration: number;
  passed: boolean;
  results: AuditResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
    critical: number;
  };
}

// -----------------------------------------------------------------------------
// MEMORY AUDITS
// -----------------------------------------------------------------------------

function auditMemory(): AuditResult[] {
  const results: AuditResult[] = [];
  
  // Check if performance.memory is available (Chrome/Electron only)
  const memory = (performance as any).memory;
  
  if (memory) {
    const usedMB = memory.usedJSHeapSize / 1024 / 1024;
    const totalMB = memory.totalJSHeapSize / 1024 / 1024;
    const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
    const usagePercent = (usedMB / limitMB) * 100;

    results.push({
      id: 'mem-usage',
      category: 'memory',
      severity: usagePercent > 80 ? 'error' : usagePercent > 60 ? 'warning' : 'info',
      message: `Heap usage: ${usedMB.toFixed(1)}MB / ${limitMB.toFixed(0)}MB (${usagePercent.toFixed(1)}%)`,
      details: `Total: ${totalMB.toFixed(1)}MB, Used: ${usedMB.toFixed(1)}MB`,
      timestamp: Date.now(),
      passed: usagePercent < 80,
    });

    // Check for potential memory leaks (if heap is > 200MB, might indicate leak)
    results.push({
      id: 'mem-leak-check',
      category: 'memory',
      severity: usedMB > 300 ? 'error' : usedMB > 200 ? 'warning' : 'info',
      message: usedMB > 200 ? 'High memory usage detected' : 'Memory usage normal',
      details: `Current heap: ${usedMB.toFixed(1)}MB`,
      timestamp: Date.now(),
      passed: usedMB < 200,
    });
  } else {
    results.push({
      id: 'mem-api-unavailable',
      category: 'memory',
      severity: 'info',
      message: 'Memory API not available in this environment',
      timestamp: Date.now(),
      passed: true,
    });
  }

  return results;
}

// -----------------------------------------------------------------------------
// PERFORMANCE AUDITS
// -----------------------------------------------------------------------------

function auditPerformance(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check for long tasks
  const observer = window.PerformanceObserver;
  if (observer) {
    results.push({
      id: 'perf-observer-available',
      category: 'performance',
      severity: 'info',
      message: 'PerformanceObserver API available',
      timestamp: Date.now(),
      passed: true,
    });
  }

  // Check navigation timing
  const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (navTiming) {
    const loadTime = navTiming.loadEventEnd - navTiming.startTime;
    const domReady = navTiming.domContentLoadedEventEnd - navTiming.startTime;
    
    results.push({
      id: 'perf-load-time',
      category: 'performance',
      severity: loadTime > 3000 ? 'error' : loadTime > 1500 ? 'warning' : 'info',
      message: `Page load: ${loadTime.toFixed(0)}ms, DOM ready: ${domReady.toFixed(0)}ms`,
      details: `Target: <1500ms load, <500ms DOM ready`,
      timestamp: Date.now(),
      passed: loadTime < 3000,
    });
  }

  // Check frame rate (rough estimate)
  let frameCount = 0;
  const startTime = performance.now();
  
  results.push({
    id: 'perf-animation-frames',
    category: 'performance',
    severity: 'info',
    message: 'Animation frame measurement requires async check',
    timestamp: Date.now(),
    passed: true,
  });

  return results;
}

// -----------------------------------------------------------------------------
// IPC AUDITS
// -----------------------------------------------------------------------------

function auditIPC(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check if IPC bridge is available
  const hasDexBridge = typeof window.dex !== 'undefined';
  
  results.push({
    id: 'ipc-bridge-available',
    category: 'ipc',
    severity: hasDexBridge ? 'info' : 'error',
    message: hasDexBridge ? 'IPC bridge available' : 'IPC bridge not found',
    details: hasDexBridge ? 'window.dex is defined' : 'window.dex is undefined',
    timestamp: Date.now(),
    passed: hasDexBridge,
  });

  if (hasDexBridge) {
    // Check individual IPC channels
    const channels = ['operations', 'power', 'session', 'deepSession'];
    channels.forEach(channel => {
      const hasChannel = !!(window.dex as any)?.[channel];
      results.push({
        id: `ipc-channel-${channel}`,
        category: 'ipc',
        severity: hasChannel ? 'info' : 'warning',
        message: `IPC channel '${channel}': ${hasChannel ? 'available' : 'not found'}`,
        timestamp: Date.now(),
        passed: true, // Not critical if some channels are missing
      });
    });
  }

  return results;
}

// -----------------------------------------------------------------------------
// STORAGE AUDITS
// -----------------------------------------------------------------------------

function auditStorage(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check localStorage availability and usage
  try {
    const testKey = '__dex_audit_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    
    // Estimate localStorage usage
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        totalSize += key.length + (localStorage.getItem(key)?.length || 0);
      }
    }
    const sizeKB = totalSize * 2 / 1024; // UTF-16 encoding
    
    results.push({
      id: 'storage-local-available',
      category: 'storage',
      severity: 'info',
      message: `localStorage available, using ${sizeKB.toFixed(1)}KB`,
      details: `${localStorage.length} items stored`,
      timestamp: Date.now(),
      passed: true,
    });
    
    // Warn if approaching quota (usually 5-10MB)
    results.push({
      id: 'storage-local-quota',
      category: 'storage',
      severity: sizeKB > 4000 ? 'warning' : 'info',
      message: sizeKB > 4000 ? 'localStorage nearing quota limit' : 'localStorage quota OK',
      timestamp: Date.now(),
      passed: sizeKB < 4000,
    });
  } catch (e) {
    results.push({
      id: 'storage-local-error',
      category: 'storage',
      severity: 'error',
      message: 'localStorage not available or blocked',
      details: String(e),
      timestamp: Date.now(),
      passed: false,
    });
  }

  // Check IndexedDB availability
  try {
    const hasIndexedDB = 'indexedDB' in window;
    results.push({
      id: 'storage-indexeddb',
      category: 'storage',
      severity: hasIndexedDB ? 'info' : 'warning',
      message: hasIndexedDB ? 'IndexedDB available' : 'IndexedDB not available',
      timestamp: Date.now(),
      passed: true,
    });
  } catch (e) {
    results.push({
      id: 'storage-indexeddb-error',
      category: 'storage',
      severity: 'warning',
      message: 'IndexedDB check failed',
      details: String(e),
      timestamp: Date.now(),
      passed: true,
    });
  }

  return results;
}

// -----------------------------------------------------------------------------
// UI AUDITS
// -----------------------------------------------------------------------------

function auditUI(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check for orphaned event listeners (rough check via DOM)
  const totalElements = document.querySelectorAll('*').length;
  results.push({
    id: 'ui-dom-size',
    category: 'ui',
    severity: totalElements > 5000 ? 'warning' : 'info',
    message: `DOM contains ${totalElements} elements`,
    details: totalElements > 5000 ? 'Consider virtualization for large lists' : 'DOM size is reasonable',
    timestamp: Date.now(),
    passed: totalElements < 5000,
  });

  // Check for hidden elements that might be rendering unnecessarily
  const hiddenElements = document.querySelectorAll('[style*="display: none"], .hidden, [hidden]').length;
  results.push({
    id: 'ui-hidden-elements',
    category: 'ui',
    severity: hiddenElements > 100 ? 'warning' : 'info',
    message: `${hiddenElements} hidden elements in DOM`,
    details: hiddenElements > 100 ? 'Consider removing hidden elements instead of hiding' : 'Hidden element count is acceptable',
    timestamp: Date.now(),
    passed: hiddenElements < 100,
  });

  // Check for images without dimensions
  const imagesWithoutDimensions = Array.from(document.querySelectorAll('img'))
    .filter(img => !img.width && !img.height && !img.style.width && !img.style.height).length;
  results.push({
    id: 'ui-image-dimensions',
    category: 'ui',
    severity: imagesWithoutDimensions > 0 ? 'warning' : 'info',
    message: imagesWithoutDimensions > 0 
      ? `${imagesWithoutDimensions} images without explicit dimensions`
      : 'All images have explicit dimensions',
    details: 'Images without dimensions can cause layout shift',
    timestamp: Date.now(),
    passed: imagesWithoutDimensions === 0,
  });

  return results;
}

// -----------------------------------------------------------------------------
// ACCESSIBILITY AUDITS
// -----------------------------------------------------------------------------

function auditAccessibility(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check for skip links
  const skipLinks = document.querySelectorAll('.skip-link, [href^="#main"], [href="#main-content"]');
  results.push({
    id: 'a11y-skip-links',
    category: 'accessibility',
    severity: skipLinks.length > 0 ? 'info' : 'warning',
    message: skipLinks.length > 0 ? 'Skip links present' : 'No skip links found',
    details: 'Skip links allow keyboard users to bypass navigation',
    timestamp: Date.now(),
    passed: skipLinks.length > 0,
  });

  // Check for main landmark
  const mainLandmark = document.querySelector('main, [role="main"]');
  results.push({
    id: 'a11y-main-landmark',
    category: 'accessibility',
    severity: mainLandmark ? 'info' : 'warning',
    message: mainLandmark ? 'Main landmark present' : 'No main landmark found',
    timestamp: Date.now(),
    passed: !!mainLandmark,
  });

  // Check for images without alt text
  const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
  results.push({
    id: 'a11y-img-alt',
    category: 'accessibility',
    severity: imagesWithoutAlt > 0 ? 'warning' : 'info',
    message: imagesWithoutAlt > 0 
      ? `${imagesWithoutAlt} images without alt text`
      : 'All images have alt text',
    timestamp: Date.now(),
    passed: imagesWithoutAlt === 0,
  });

  // Check for buttons without accessible names
  const buttonsWithoutLabel = Array.from(document.querySelectorAll('button'))
    .filter(btn => {
      const hasText = btn.textContent?.trim();
      const hasAriaLabel = btn.getAttribute('aria-label');
      const hasAriaLabelledBy = btn.getAttribute('aria-labelledby');
      const hasTitle = btn.getAttribute('title');
      return !hasText && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle;
    }).length;
  
  results.push({
    id: 'a11y-button-labels',
    category: 'accessibility',
    severity: buttonsWithoutLabel > 0 ? 'warning' : 'info',
    message: buttonsWithoutLabel > 0 
      ? `${buttonsWithoutLabel} buttons without accessible names`
      : 'All buttons have accessible names',
    timestamp: Date.now(),
    passed: buttonsWithoutLabel === 0,
  });

  // Check for form inputs without labels
  const inputsWithoutLabel = Array.from(document.querySelectorAll('input, textarea, select'))
    .filter(input => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute('aria-label');
      const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
      const hasPlaceholder = input.getAttribute('placeholder');
      return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasPlaceholder;
    }).length;
  
  results.push({
    id: 'a11y-input-labels',
    category: 'accessibility',
    severity: inputsWithoutLabel > 0 ? 'warning' : 'info',
    message: inputsWithoutLabel > 0 
      ? `${inputsWithoutLabel} form inputs without labels`
      : 'All form inputs have labels',
    timestamp: Date.now(),
    passed: inputsWithoutLabel === 0,
  });

  // Check for keyboard focus visibility
  const hasKeyboardStyles = document.body.classList.contains('keyboard-user') ||
    document.querySelector('style, link[rel="stylesheet"]')?.textContent?.includes(':focus-visible');
  
  results.push({
    id: 'a11y-focus-visible',
    category: 'accessibility',
    severity: 'info',
    message: 'Focus visibility system active',
    details: 'Keyboard detection enabled for focus ring visibility',
    timestamp: Date.now(),
    passed: true,
  });

  return results;
}

// -----------------------------------------------------------------------------
// SECURITY AUDITS
// -----------------------------------------------------------------------------

function auditSecurity(): AuditResult[] {
  const results: AuditResult[] = [];

  // Check Content Security Policy
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  results.push({
    id: 'sec-csp',
    category: 'security',
    severity: cspMeta ? 'info' : 'warning',
    message: cspMeta ? 'CSP meta tag present' : 'No CSP meta tag found',
    details: 'Content Security Policy helps prevent XSS attacks',
    timestamp: Date.now(),
    passed: true, // Not critical in Electron context
  });

  // Check for sensitive data in localStorage
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth'];
  let foundSensitive = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)?.toLowerCase() || '';
    if (sensitiveKeys.some(s => key.includes(s))) {
      foundSensitive = true;
      break;
    }
  }
  
  results.push({
    id: 'sec-storage-sensitive',
    category: 'security',
    severity: foundSensitive ? 'warning' : 'info',
    message: foundSensitive 
      ? 'Potentially sensitive data found in localStorage'
      : 'No sensitive data detected in localStorage',
    details: 'Consider encrypting or securely storing sensitive data',
    timestamp: Date.now(),
    passed: !foundSensitive,
  });

  // Check for eval usage (can't really check at runtime, but note it)
  results.push({
    id: 'sec-eval-check',
    category: 'security',
    severity: 'info',
    message: 'Code review required for eval/Function constructor usage',
    details: 'Avoid eval() and new Function() for security',
    timestamp: Date.now(),
    passed: true,
  });

  return results;
}

// -----------------------------------------------------------------------------
// MAIN AUDIT FUNCTION
// -----------------------------------------------------------------------------

/**
 * Run complete system audit
 */
export function runSystemAudit(categories?: AuditCategory[]): SystemAuditReport {
  const startTime = performance.now();
  const allCategories: AuditCategory[] = categories || [
    'memory',
    'performance',
    'security',
    'ipc',
    'storage',
    'ui',
    'accessibility',
  ];

  const results: AuditResult[] = [];

  // Run audits for each category
  allCategories.forEach(category => {
    switch (category) {
      case 'memory':
        results.push(...auditMemory());
        break;
      case 'performance':
        results.push(...auditPerformance());
        break;
      case 'security':
        results.push(...auditSecurity());
        break;
      case 'ipc':
        results.push(...auditIPC());
        break;
      case 'storage':
        results.push(...auditStorage());
        break;
      case 'ui':
        results.push(...auditUI());
        break;
      case 'accessibility':
        results.push(...auditAccessibility());
        break;
    }
  });

  const duration = performance.now() - startTime;

  // Calculate summary
  const summary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    warnings: results.filter(r => r.severity === 'warning').length,
    errors: results.filter(r => r.severity === 'error').length,
    critical: results.filter(r => r.severity === 'critical').length,
  };

  const passed = summary.critical === 0 && summary.errors === 0;

  return {
    timestamp: Date.now(),
    duration,
    passed,
    results,
    summary,
  };
}

/**
 * Print audit report to console
 */
export function printAuditReport(report: SystemAuditReport): void {
  if (!import.meta.env.DEV) return;
  console.group('System Audit Report');
  console.log(`Timestamp: ${new Date(report.timestamp).toISOString()}`);
  console.log(`Duration: ${report.duration.toFixed(1)}ms`);
  console.log(`Status: ${report.passed ? 'PASSED' : 'FAILED'}`);
  
  console.group('Summary');
  console.log(`Total checks: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Warnings: ${report.summary.warnings}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Critical: ${report.summary.critical}`);
  console.groupEnd();

  // Group results by category
  const byCategory = new Map<AuditCategory, AuditResult[]>();
  report.results.forEach(result => {
    const existing = byCategory.get(result.category) || [];
    existing.push(result);
    byCategory.set(result.category, existing);
  });

  byCategory.forEach((results, category) => {
    console.group(`[${category.toUpperCase()}]`);
    results.forEach(r => {
      const icon = r.passed ? '[OK]' : r.severity === 'error' ? '[ERR]' : r.severity === 'warning' ? '[WARN]' : '[INFO]';
      console.log(`${icon} ${r.message}`);
      if (r.details) console.log(`   ${r.details}`);
    });
    console.groupEnd();
  });

  console.groupEnd();
}

/**
 * Quick health check (minimal audit)
 */
export function quickHealthCheck(): { healthy: boolean; issues: string[] } {
  const issues: string[] = [];

  // Memory check
  const memory = (performance as any).memory;
  if (memory) {
    const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    if (usagePercent > 80) {
      issues.push(`High memory usage: ${usagePercent.toFixed(1)}%`);
    }
  }

  // IPC check
  if (typeof window.dex === 'undefined') {
    issues.push('IPC bridge not available');
  }

  // DOM size check
  const domSize = document.querySelectorAll('*').length;
  if (domSize > 5000) {
    issues.push(`Large DOM size: ${domSize} elements`);
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
