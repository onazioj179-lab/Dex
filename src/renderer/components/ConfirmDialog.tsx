/**
 * DEX Confirmation Dialog Components
 * Confirmation and alert dialogs
 */

import React, { useState, useCallback, createContext, useContext } from 'react';
import { InfoIcon } from '../utils/icons';

// ==================== TYPES ====================

type DialogVariant = 'default' | 'danger' | 'warning' | 'success' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  showCancel?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

interface AlertDialogProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  buttonText?: string;
  variant?: DialogVariant;
  onClose: () => void;
  icon?: React.ReactNode;
}

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
  inputType?: 'text' | 'password' | 'email' | 'number';
  validation?: (value: string) => string | null;
}

interface DeleteConfirmProps {
  isOpen: boolean;
  itemName: string;
  itemType?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  requireTyping?: boolean;
}

// ==================== DIALOG CONTEXT ====================

interface DialogContextValue {
  confirm: (options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>) => Promise<boolean>;
  alert: (options: Omit<AlertDialogProps, 'isOpen' | 'onClose'>) => Promise<void>;
  prompt: (options: Omit<PromptDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export const useDialog = (): DialogContextValue => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

// ==================== HELPERS ====================

const getVariantColor = (variant: DialogVariant): string => {
  switch (variant) {
    case 'danger': return '#f44336';
    case 'warning': return '#ff9800';
    case 'success': return '#4caf50';
    case 'info': return '#2196f3';
    default: return 'var(--color-accent)';
  }
};

const getVariantIcon = (variant: DialogVariant): React.ReactNode => {
  switch (variant) {
    case 'danger': return 'alert-triangle';
    case 'warning': return 'zap';
    case 'success': return 'check-circle';
    case 'info': return <InfoIcon size={16} />;
    default: return 'message-circle';
  }
};

// ==================== CONFIRM DIALOG ====================

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  showCancel = true,
  loading = false,
  icon,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const color = getVariantColor(variant);

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      animation: 'fadeIn 0.15s ease',
    },
    dialog: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 400,
      width: '90%',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      animation: 'slideUp 0.2s ease',
    },
    icon: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 1.5,
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
    },
    button: {
      padding: '10px 24px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      minWidth: 100,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon as any}>
          {icon || getVariantIcon(variant)}
        </div>
        <h3 style={styles.title as any}>{title}</h3>
        <div style={styles.message as any}>{message}</div>
        <div style={styles.actions}>
          {showCancel && (
            <button
              style={{
                ...styles.button,
                background: 'var(--color-bg-tertiary)',
                color: 'var(--color-text)',
              }}
              onClick={onCancel}
              disabled={isLoading || loading}
            >
              {cancelText}
            </button>
          )}
          <button
            style={{
              ...styles.button,
              background: color,
              color: 'white',
              opacity: isLoading || loading ? 0.7 : 1,
            }}
            onClick={handleConfirm}
            disabled={isLoading || loading}
          >
            {isLoading || loading ? 'Loading...' : confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ==================== ALERT DIALOG ====================

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  title,
  message,
  buttonText = 'OK',
  variant = 'default',
  onClose,
  icon,
}) => {
  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    },
    dialog: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 400,
      width: '90%',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    },
    icon: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 1.5,
    },
    button: {
      display: 'block',
      width: '100%',
      padding: '12px 24px',
      border: 'none',
      borderRadius: 6,
      background: getVariantColor(variant),
      color: 'white',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon as any}>
          {icon || getVariantIcon(variant)}
        </div>
        <h3 style={styles.title as any}>{title}</h3>
        <div style={styles.message as any}>{message}</div>
        <button style={styles.button} onClick={onClose}>
          {buttonText}
        </button>
      </div>
    </div>
  );
};

// ==================== PROMPT DIALOG ====================

export const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Submit',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  inputType = 'text',
  validation,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (validation) {
      const validationError = validation(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsLoading(true);
    try {
      await onConfirm(value);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    },
    dialog: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 400,
      width: '90%',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 16,
    },
    input: {
      width: '100%',
      padding: '12px 14px',
      border: error ? '1px solid #f44336' : '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
      marginBottom: error ? 8 : 24,
    },
    error: {
      fontSize: 12,
      color: '#f44336',
      marginBottom: 16,
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: 'flex-end',
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        {message && <p style={styles.message}>{message}</p>}
        <input
          type={inputType}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          style={styles.input}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
        />
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.actions}>
          <button
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            style={{
              ...styles.button,
              background: 'var(--color-accent)',
              color: 'white',
            }}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== DELETE CONFIRM ====================

export const DeleteConfirm: React.FC<DeleteConfirmProps> = ({
  isOpen,
  itemName,
  itemType = 'item',
  onConfirm,
  onCancel,
  requireTyping = false,
}) => {
  const [typedName, setTypedName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const canConfirm = !requireTyping || typedName === itemName;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    },
    dialog: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 450,
      width: '90%',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    },
    icon: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 16,
      textAlign: 'center',
      lineHeight: 1.5,
    },
    itemName: {
      fontWeight: 600,
      color: 'var(--color-text)',
    },
    warning: {
      padding: 12,
      background: '#f4433610',
      borderRadius: 6,
      marginBottom: 16,
      fontSize: 13,
      color: '#f44336',
      textAlign: 'center',
    },
    typeSection: {
      marginBottom: 24,
    },
    typeLabel: {
      fontSize: 13,
      color: 'var(--color-text-muted)',
      marginBottom: 8,
    },
    input: {
      width: '100%',
      padding: '12px 14px',
      border: '1px solid var(--color-border)',
      borderRadius: 6,
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontSize: 14,
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
    },
    button: {
      padding: '10px 24px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      minWidth: 100,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon as any}>trash</div>
        <h3 style={styles.title as any}>Delete {itemType}?</h3>
        <p style={styles.message as any}>
          Are you sure you want to delete{' '}
          <span style={styles.itemName}>"{itemName}"</span>?
        </p>
        <div style={styles.warning as any}>
          This action cannot be undone.
        </div>
        {requireTyping && (
          <div style={styles.typeSection}>
            <div style={styles.typeLabel}>
              Type <strong>{itemName}</strong> to confirm:
            </div>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={itemName}
              style={styles.input}
              autoFocus
            />
          </div>
        )}
        <div style={styles.actions}>
          <button
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.button,
              background: canConfirm ? '#f44336' : '#ccc',
              color: 'white',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== UNSAVED CHANGES DIALOG ====================

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onSave,
  onDiscard,
  onCancel,
}) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    },
    dialog: {
      background: 'var(--color-bg)',
      borderRadius: 12,
      padding: 24,
      maxWidth: 400,
      width: '90%',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
    },
    icon: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text)',
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 1.5,
    },
    actions: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
    },
    button: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon as any}>save</div>
        <h3 style={styles.title as any}>Unsaved Changes</h3>
        <p style={styles.message as any}>
          You have unsaved changes. Do you want to save them before leaving?
        </p>
        <div style={styles.actions}>
          <button
            style={{
              ...styles.button,
              background: 'transparent',
              color: '#f44336',
              border: '1px solid #f44336',
            }}
            onClick={onDiscard}
            disabled={isSaving}
          >
            Discard
          </button>
          <button
            style={{
              ...styles.button,
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.button,
              background: 'var(--color-accent)',
              color: 'white',
            }}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== DIALOG PROVIDER ====================

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    options: { title: '', message: '' },
    resolve: null,
  });

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    options: Omit<AlertDialogProps, 'isOpen' | 'onClose'>;
    resolve: (() => void) | null;
  }>({
    isOpen: false,
    options: { title: '', message: '' },
    resolve: null,
  });

  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    options: Omit<PromptDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>;
    resolve: ((value: string | null) => void) | null;
  }>({
    isOpen: false,
    options: { title: '' },
    resolve: null,
  });

  const confirm = useCallback(
    (options: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmState({ isOpen: true, options, resolve });
      });
    },
    []
  );

  const alert = useCallback(
    (options: Omit<AlertDialogProps, 'isOpen' | 'onClose'>): Promise<void> => {
      return new Promise((resolve) => {
        setAlertState({ isOpen: true, options, resolve });
      });
    },
    []
  );

  const prompt = useCallback(
    (options: Omit<PromptDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>): Promise<string | null> => {
      return new Promise((resolve) => {
        setPromptState({ isOpen: true, options, resolve });
      });
    },
    []
  );

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        {...confirmState.options}
        onConfirm={() => {
          confirmState.resolve?.(true);
          setConfirmState((s) => ({ ...s, isOpen: false }));
        }}
        onCancel={() => {
          confirmState.resolve?.(false);
          setConfirmState((s) => ({ ...s, isOpen: false }));
        }}
      />
      <AlertDialog
        isOpen={alertState.isOpen}
        {...alertState.options}
        onClose={() => {
          alertState.resolve?.();
          setAlertState((s) => ({ ...s, isOpen: false }));
        }}
      />
      <PromptDialog
        isOpen={promptState.isOpen}
        {...promptState.options}
        onConfirm={(value) => {
          promptState.resolve?.(value);
          setPromptState((s) => ({ ...s, isOpen: false }));
        }}
        onCancel={() => {
          promptState.resolve?.(null);
          setPromptState((s) => ({ ...s, isOpen: false }));
        }}
      />
    </DialogContext.Provider>
  );
};

export default ConfirmDialog;
