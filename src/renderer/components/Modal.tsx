/**
 * DEX Modal System
 * Reusable modal dialogs, alerts, and confirmations
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ==================== TYPES ====================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  showCloseButton?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  footer?: React.ReactNode;
}

interface AlertOptions {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  buttonText?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger';
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

interface ModalContextType {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

// ==================== ICONS ====================

const Icons = {
  close: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  info: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  success: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  warning: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  error: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
};

const TYPE_COLORS = {
  info: '#007aff',
  success: '#34c759',
  warning: '#ff9500',
  error: '#ff3b30',
  danger: '#ff3b30',
};

// ==================== MODAL COMPONENT ====================

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  showCloseButton = true,
  closeOnOverlay = true,
  closeOnEscape = true,
  footer,
}) => {
  // Handle escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeStyles = {
    small: { width: 360, maxHeight: '70vh' },
    medium: { width: 500, maxHeight: '80vh' },
    large: { width: 700, maxHeight: '85vh' },
    fullscreen: { width: '95vw', height: '95vh', maxHeight: '95vh' },
  };

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      animation: 'fadeIn 0.2s ease-out',
    },
    modal: {
      background: 'var(--color-bg-elevated)',
      borderRadius: 14,
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column',
      animation: 'scaleIn 0.2s ease-out',
      ...sizeStyles[size],
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid var(--color-border)',
    },
    title: {
      fontSize: 17,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    closeBtn: {
      width: 32,
      height: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      color: 'var(--color-text-muted)',
      transition: 'background 0.15s',
    },
    body: {
      flex: 1,
      padding: 20,
      overflowY: 'auto',
    },
    footer: {
      padding: '16px 20px',
      borderTop: '1px solid var(--color-border)',
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
    },
  };

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        style={styles.overlay}
        onClick={closeOnOverlay ? onClose : undefined}
      >
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          {(title || showCloseButton) && (
            <div style={styles.header}>
              <span style={styles.title}>{title}</span>
              {showCloseButton && (
                <button
                  style={styles.closeBtn}
                  onClick={onClose}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {Icons.close}
                </button>
              )}
            </div>
          )}
          <div style={styles.body}>{children}</div>
          {footer && <div style={styles.footer}>{footer}</div>}
        </div>
      </div>
    </>
  );
};

// ==================== ALERT DIALOG ====================

interface AlertDialogProps extends AlertOptions {
  isOpen: boolean;
  onClose: () => void;
}

const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  buttonText = 'OK',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '10px 0',
    },
    icon: {
      width: 56,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background: `${TYPE_COLORS[type]}15`,
      color: TYPE_COLORS[type],
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-secondary)',
      lineHeight: 1.5,
    },
    btn: {
      padding: '10px 24px',
      background: TYPE_COLORS[type],
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      showCloseButton={false}
      footer={
        <button style={styles.btn} onClick={onClose}>
          {buttonText}
        </button>
      }
    >
      <div style={styles.content}>
        <div style={styles.icon}>
          {Icons[type]}
        </div>
        <div style={styles.title}>{title}</div>
        <div style={styles.message}>{message}</div>
      </div>
    </Modal>
  );
};

// ==================== CONFIRM DIALOG ====================

interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'info',
}) => {
  const styles: Record<string, React.CSSProperties> = {
    content: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '10px 0',
    },
    icon: {
      width: 56,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background: `${TYPE_COLORS[type]}15`,
      color: TYPE_COLORS[type],
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-secondary)',
      lineHeight: 1.5,
    },
    cancelBtn: {
      padding: '10px 24px',
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
    },
    confirmBtn: {
      padding: '10px 24px',
      background: TYPE_COLORS[type],
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
  };

  const iconType = type === 'danger' ? 'error' : type === 'warning' ? 'warning' : 'info';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="small"
      showCloseButton={false}
      closeOnOverlay={false}
      footer={
        <>
          <button style={styles.cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
          <button style={styles.confirmBtn} onClick={onConfirm}>
            {confirmText}
          </button>
        </>
      }
    >
      <div style={styles.content}>
        <div style={styles.icon}>
          {Icons[iconType]}
        </div>
        <div style={styles.title}>{title}</div>
        <div style={styles.message}>{message}</div>
      </div>
    </Modal>
  );
};

// ==================== PROMPT DIALOG ====================

interface PromptDialogProps extends PromptOptions {
  isOpen: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  placeholder,
  defaultValue = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
}) => {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onConfirm(value);
  };

  const styles: Record<string, React.CSSProperties> = {
    content: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: 600,
      color: 'var(--color-text-primary)',
    },
    message: {
      fontSize: 14,
      color: 'var(--color-text-secondary)',
    },
    input: {
      padding: '12px 14px',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      fontSize: 14,
      color: 'var(--color-text-primary)',
      outline: 'none',
    },
    cancelBtn: {
      padding: '10px 24px',
      background: 'var(--color-bg-tertiary)',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--color-text-secondary)',
      cursor: 'pointer',
    },
    confirmBtn: {
      padding: '10px 24px',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 500,
      color: '#fff',
      cursor: 'pointer',
    },
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="small"
      showCloseButton={false}
      closeOnOverlay={false}
      footer={
        <>
          <button style={styles.cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
          <button style={styles.confirmBtn} onClick={() => handleSubmit()}>
            {confirmText}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={styles.content}>
        <div style={styles.title}>{title}</div>
        {message && <div style={styles.message}>{message}</div>}
        <input
          type="text"
          style={styles.input}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      </form>
    </Modal>
  );
};

// ==================== MODAL CONTEXT & PROVIDER ====================

const ModalContext = createContext<ModalContextType | null>(null);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalProviderProps {
  children: React.ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [alertState, setAlertState] = useState<{ options: AlertOptions; resolve: () => void } | null>(null);
  const [confirmState, setConfirmState] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const [promptState, setPromptState] = useState<{ options: PromptOptions; resolve: (value: string | null) => void } | null>(null);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    return new Promise(resolve => {
      setAlertState({ options, resolve });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise(resolve => {
      setPromptState({ options, resolve });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ alert, confirm, prompt }}>
      {children}

      {alertState && (
        <AlertDialog
          isOpen
          {...alertState.options}
          onClose={() => {
            alertState.resolve();
            setAlertState(null);
          }}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          isOpen
          {...confirmState.options}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        />
      )}

      {promptState && (
        <PromptDialog
          isOpen
          {...promptState.options}
          onConfirm={(value) => {
            promptState.resolve(value);
            setPromptState(null);
          }}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        />
      )}
    </ModalContext.Provider>
  );
};

export default Modal;
