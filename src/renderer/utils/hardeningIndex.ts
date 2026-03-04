// ═══════════════════════════════════════════════════════════════════════════
// DEX - Phase 32: Final Hardening Index
// Central export for all release hardening utilities
// ═══════════════════════════════════════════════════════════════════════════

// System Audit
export {
  runSystemAudit,
  printAuditReport,
  quickHealthCheck,
  type AuditCategory,
  type AuditSeverity,
  type AuditResult,
  type SystemAuditReport,
} from './systemAudit';

// Crash Recovery
export {
  // State persistence
  saveState,
  loadState,
  clearState,
  
  // Crash handling
  markCrash,
  checkCrash,
  clearCrash,
  onCrashRecovery,
  attemptRecovery,
  
  // Integrity checking
  runIntegrityCheck,
  getLastIntegrityCheck,
  
  // Session management
  saveSession,
  loadSession,
  clearSession,
  
  // Global handlers
  installCrashHandlers,
  initCrashRecovery,
} from './crashRecovery';

// Release Validation
export {
  generateReleaseChecklist,
  printReleaseChecklist,
  generateReleaseCandidateInfo,
  printReleaseCandidateSummary,
  quickReleaseValidation,
  type ChecklistItem,
  type ReleaseChecklist,
  type ReleaseCandidateInfo,
} from './releaseValidation';

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

import { initCrashRecovery } from './crashRecovery';
import { quickHealthCheck } from './systemAudit';

let initialized = false;

/**
 * Initialize all hardening systems
 */
export function initHardeningSystems(): () => void {
  if (initialized) {
    return () => {};
  }

  const cleanups: Array<() => void> = [];

  // Initialize crash recovery
  cleanups.push(initCrashRecovery());

  // Run initial health check
  const health = quickHealthCheck();
  if (!health.healthy) {
    console.warn('[Hardening] Health check issues:', health.issues);
  }

  // Set up periodic health checks (every 5 minutes)
  const healthCheckInterval = setInterval(() => {
    const health = quickHealthCheck();
    if (!health.healthy) {
      console.warn('[Hardening] Periodic health check issues:', health.issues);
    }
  }, 5 * 60 * 1000);

  cleanups.push(() => clearInterval(healthCheckInterval));

  initialized = true;

  return () => {
    cleanups.forEach(cleanup => cleanup());
    initialized = false;
  };
}

/**
 * Run full release validation (for manual or CI use)
 */
export async function runFullReleaseValidation(version: string): Promise<{
  ready: boolean;
  summary: string;
}> {
  const { quickReleaseValidation, generateReleaseChecklist, printReleaseChecklist } = await import('./releaseValidation');
  const { runSystemAudit, printAuditReport } = await import('./systemAudit');

  // Run quick validation
  const quickResult = await quickReleaseValidation();
  
  // Generate full checklist
  const checklist = await generateReleaseChecklist(version);
  
  // Run full audit
  const audit = runSystemAudit();

  // Print reports
  printAuditReport(audit);
  printReleaseChecklist(checklist);

  const ready = quickResult.ready && audit.passed && checklist.passed;

  let summary = `Release v${version}: ${ready ? 'READY' : 'NOT READY'}\n`;
  summary += `- Audit: ${audit.passed ? 'PASSED' : 'FAILED'}\n`;
  summary += `- Checklist: ${checklist.requiredPassed}/${checklist.requiredTotal} required checks passed\n`;
  
  if (quickResult.blockers.length > 0) {
    summary += `- Blockers: ${quickResult.blockers.length}\n`;
    quickResult.blockers.forEach(b => { summary += `  - ${b}\n`; });
  }

  return { ready, summary };
}
