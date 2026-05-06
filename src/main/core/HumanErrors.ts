// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ===========================================================================
// DEX - Human Error Messages
// Phase 17: Final Lockdown & Long-Term Trust Foundation
// Clear, calm, actionable error messages for users
// ===========================================================================

// ===========================================================================
// TYPES
// ===========================================================================

export interface HumanError {
  title: string;
  message: string;
  action?: string;
  actionLabel?: string;
  recoverable: boolean;
  severity: 'info' | 'warning' | 'error';
}

type ErrorCode = string;

// ===========================================================================
// ERROR MESSAGE CATALOG - Human-readable, non-technical, calm
// ===========================================================================

const ERROR_MESSAGES: Record<ErrorCode, HumanError> = {
  // -------------------------------------------------------------------------
  // System Errors
  // -------------------------------------------------------------------------
  SYSTEM_MEMORY_PRESSURE: {
    title: 'Running low on memory',
    message: 'Your computer is running low on available memory. Dex will continue working, but some features may be slower.',
    action: 'Consider closing unused applications to free up memory.',
    recoverable: true,
    severity: 'warning',
  },

  SYSTEM_DISK_FULL: {
    title: 'Storage space is full',
    message: 'There isn\'t enough storage space to save your data. Please free up some space.',
    action: 'Open your file manager to remove unused files.',
    actionLabel: 'Open Files',
    recoverable: true,
    severity: 'error',
  },

  SYSTEM_PERMISSION_DENIED: {
    title: 'Permission needed',
    message: 'Dex needs permission to perform this action. You can grant it in Settings.',
    action: 'Go to Settings Security to manage permissions.',
    actionLabel: 'Open Settings',
    recoverable: true,
    severity: 'warning',
  },

  // -------------------------------------------------------------------------
  // Data Errors
  // -------------------------------------------------------------------------
  DATA_CORRUPTION: {
    title: 'Data needs repair',
    message: 'Some of your data couldn\'t be read properly. Dex will try to recover it automatically.',
    action: 'If problems persist, you can restore from a backup in Settings.',
    actionLabel: 'View Backups',
    recoverable: true,
    severity: 'warning',
  },

  DATA_LOAD_FAILED: {
    title: 'Couldn\'t load data',
    message: 'Dex couldn\'t access your saved data. This might be temporary.',
    action: 'Try restarting Dex. Your data should still be safe.',
    actionLabel: 'Restart Dex',
    recoverable: true,
    severity: 'error',
  },

  DATA_SAVE_FAILED: {
    title: 'Couldn\'t save changes',
    message: 'Your recent changes couldn\'t be saved. Don\'t worry, we\'ll keep trying.',
    action: 'Make sure you have enough storage space and try again.',
    recoverable: true,
    severity: 'warning',
  },

  DATA_VALIDATION_FAILED: {
    title: 'Invalid data',
    message: 'The data you entered doesn\'t look quite right. Please check and try again.',
    recoverable: true,
    severity: 'info',
  },

  // -------------------------------------------------------------------------
  // Operation Errors
  // -------------------------------------------------------------------------
  OPERATION_TIMEOUT: {
    title: 'Taking longer than expected',
    message: 'This operation is taking a while. It will continue in the background.',
    action: 'You can check the status in the activity panel.',
    recoverable: true,
    severity: 'info',
  },

  OPERATION_CANCELLED: {
    title: 'Operation cancelled',
    message: 'The operation was stopped. No changes were made.',
    recoverable: true,
    severity: 'info',
  },

  OPERATION_FAILED: {
    title: 'Something didn\'t work',
    message: 'This operation couldn\'t be completed. You can try again.',
    action: 'If this keeps happening, check your settings.',
    recoverable: true,
    severity: 'warning',
  },

  // -------------------------------------------------------------------------
  // Encryption Errors
  // -------------------------------------------------------------------------
  ENCRYPTION_INIT_FAILED: {
    title: 'Couldn\'t set up encryption',
    message: 'There was a problem setting up data protection. Your data is still safe, just not encrypted yet.',
    action: 'Try again from Settings Security.',
    actionLabel: 'Open Security',
    recoverable: true,
    severity: 'warning',
  },

  ENCRYPTION_UNLOCK_FAILED: {
    title: 'Couldn\'t unlock your data',
    message: 'The password or key didn\'t work. Please try again.',
    action: 'Make sure you\'re using the correct password.',
    recoverable: true,
    severity: 'warning',
  },

  ENCRYPTION_KEY_MISSING: {
    title: 'Encryption key not found',
    message: 'Dex can\'t find the key to unlock your encrypted data.',
    action: 'You may need to enter your password manually.',
    actionLabel: 'Enter Password',
    recoverable: true,
    severity: 'error',
  },

  // -------------------------------------------------------------------------
  // Action Errors
  // -------------------------------------------------------------------------
  ACTION_APP_NOT_FOUND: {
    title: 'Application not found',
    message: 'Dex couldn\'t find the application. It may have been moved or uninstalled.',
    action: 'Check the action settings and update the path if needed.',
    actionLabel: 'Edit Action',
    recoverable: true,
    severity: 'warning',
  },

  ACTION_PERMISSION_DENIED: {
    title: 'Permission needed for this action',
    message: 'This action requires a permission that\'s currently disabled.',
    action: 'Enable the required permission in Settings Security.',
    actionLabel: 'View Permissions',
    recoverable: true,
    severity: 'info',
  },

  // -------------------------------------------------------------------------
  // Python Errors
  // -------------------------------------------------------------------------
  PYTHON_EXECUTION_FAILED: {
    title: 'Script couldn\'t run',
    message: 'There was a problem running the automation script.',
    action: 'Check that Python is installed and the script is valid.',
    recoverable: true,
    severity: 'warning',
  },

  PYTHON_TIMEOUT: {
    title: 'Script took too long',
    message: 'The script was stopped because it was taking too long. This prevents freezing.',
    action: 'The script may need optimization, or you can increase the timeout.',
    recoverable: true,
    severity: 'info',
  },

  PYTHON_NOT_INSTALLED: {
    title: 'Python not available',
    message: 'Some features need Python to work, but it\'s not installed or not found.',
    action: 'Install Python to enable all automation features.',
    actionLabel: 'Learn More',
    recoverable: true,
    severity: 'info',
  },

  // -------------------------------------------------------------------------
  // Network Errors
  // -------------------------------------------------------------------------
  NETWORK_OFFLINE: {
    title: 'You\'re offline',
    message: 'Some features need an internet connection. They\'ll work again when you\'re back online.',
    recoverable: true,
    severity: 'info',
  },

  NETWORK_REQUEST_FAILED: {
    title: 'Connection problem',
    message: 'Couldn\'t reach the server. This might be temporary.',
    action: 'Check your internet connection and try again.',
    recoverable: true,
    severity: 'warning',
  },

  // -------------------------------------------------------------------------
  // Unknown
  // -------------------------------------------------------------------------
  UNKNOWN: {
    title: 'Something unexpected happened',
    message: 'Dex ran into an issue, but your data should be safe.',
    action: 'Try the operation again. If this keeps happening, restart Dex.',
    recoverable: true,
    severity: 'warning',
  },
};

// ===========================================================================
// HUMAN ERROR HELPER CLASS
// ===========================================================================

class HumanErrorsClass {
  /**
   * Get a human-friendly error message by code
   */
  get(code: string): HumanError {
    return ERROR_MESSAGES[code] ?? ERROR_MESSAGES['UNKNOWN'];
  }

  /**
   * Transform a technical error into a human-friendly one
   */
  fromError(error: Error | string, context?: string): HumanError {
    const message = typeof error === 'string' ? error : error.message;
    const lowered = message.toLowerCase();

    // Try to match known patterns
    if (lowered.includes('permission') || lowered.includes('access denied')) {
      return this.get('SYSTEM_PERMISSION_DENIED');
    }
    if (lowered.includes('disk full') || lowered.includes('no space')) {
      return this.get('SYSTEM_DISK_FULL');
    }
    if (lowered.includes('memory') || lowered.includes('heap')) {
      return this.get('SYSTEM_MEMORY_PRESSURE');
    }
    if (lowered.includes('timeout')) {
      return this.get('OPERATION_TIMEOUT');
    }
    if (lowered.includes('network') || lowered.includes('offline') || lowered.includes('connection')) {
      return this.get('NETWORK_OFFLINE');
    }
    if (lowered.includes('encrypt') || lowered.includes('decrypt')) {
      return this.get('ENCRYPTION_UNLOCK_FAILED');
    }
    if (lowered.includes('python')) {
      return this.get('PYTHON_EXECUTION_FAILED');
    }
    if (lowered.includes('not found') || lowered.includes('enoent')) {
      return this.get('ACTION_APP_NOT_FOUND');
    }
    if (lowered.includes('corrupt') || lowered.includes('invalid json')) {
      return this.get('DATA_CORRUPTION');
    }

    // Return generic with context
    const generic = { ...ERROR_MESSAGES['UNKNOWN'] };
    if (context) {
      generic.message = `${generic.message} (${context})`;
    }
    return generic;
  }

  /**
   * Format error for display in UI
   */
  format(humanError: HumanError): {
    title: string;
    body: string;
    type: 'info' | 'warning' | 'error';
    showAction: boolean;
    actionLabel?: string;
  } {
    let body = humanError.message;
    if (humanError.action) {
      body += `\n\n${humanError.action}`;
    }

    return {
      title: humanError.title,
      body,
      type: humanError.severity,
      showAction: !!humanError.actionLabel,
      actionLabel: humanError.actionLabel,
    };
  }

  /**
   * Get all error codes and their messages
   */
  getAllMessages(): Record<string, HumanError> {
    return { ...ERROR_MESSAGES };
  }

  /**
   * Create a custom human error
   */
  create(
    title: string,
    message: string,
    options?: {
      action?: string;
      actionLabel?: string;
      severity?: 'info' | 'warning' | 'error';
      recoverable?: boolean;
    }
  ): HumanError {
    return {
      title,
      message,
      action: options?.action,
      actionLabel: options?.actionLabel,
      severity: options?.severity ?? 'info',
      recoverable: options?.recoverable ?? true,
    };
  }
}

// Export singleton instance
export const humanErrors = new HumanErrorsClass();

// Export the HumanError type for use elsewhere
export type { HumanError as HumanErrorType };
