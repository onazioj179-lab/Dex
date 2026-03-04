/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEX — App State Machine
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Real, deterministic state management for sub-apps.
 * Every state transition is explicit, logged, and reversible.
 * 
 * States are REAL:
 * - No fake spinners
 * - Loading reflects real system work
 * - Errors reflect real failures
 * - Offline is explicit and honest
 * 
 * State transitions are DETERMINISTIC:
 * - Clear transition rules
 * - No implicit state changes
 * - All transitions logged
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';
import { useSystemEvents, useNetworkService } from './SystemServices';

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** All possible app states */
export type AppStateType =
  | 'initial'           // App not yet started
  | 'loading'           // Real loading in progress
  | 'loaded'            // Data loaded, ready to render
  | 'active'            // Fully operational
  | 'background'        // Running but not focused
  | 'suspended'         // Memory preserved, no activity
  | 'error'             // Recoverable error state
  | 'permission-denied' // Missing required permission
  | 'offline'           // Network required but unavailable
  | 'empty'             // No data to display
  | 'terminated';       // App closed

/** State context - additional data associated with state */
export interface StateContext {
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    retryable: boolean;
  };
  loading?: {
    operation: string;
    progress?: number;
    startedAt: number;
  };
  permission?: {
    required: string;
    reason: string;
  };
  offline?: {
    lastOnlineAt: number;
    requiredForFeature?: string;
  };
}

/** State machine configuration */
export interface StateMachineConfig {
  instanceId: string;
  appId: string;
  initialState: AppStateType;
  requiresNetwork: boolean;
  onStateChange?: (from: AppStateType, to: AppStateType, context: StateContext) => void;
}

/** State transition */
export interface StateTransition {
  id: string;
  instanceId: string;
  from: AppStateType;
  to: AppStateType;
  context: StateContext;
  timestamp: number;
  trigger: string;
}

/** Valid state transitions */
const VALID_TRANSITIONS: Record<AppStateType, AppStateType[]> = {
  initial: ['loading', 'error', 'offline'],
  loading: ['loaded', 'error', 'offline', 'permission-denied'],
  loaded: ['active', 'error', 'empty'],
  active: ['background', 'suspended', 'loading', 'error', 'offline', 'terminated'],
  background: ['active', 'suspended', 'terminated'],
  suspended: ['background', 'active', 'terminated'],
  error: ['loading', 'active', 'terminated'],
  'permission-denied': ['loading', 'active', 'terminated'],
  offline: ['loading', 'active', 'terminated'],
  empty: ['loading', 'active', 'terminated'],
  terminated: [], // Terminal state
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE MACHINE STORE
// ═══════════════════════════════════════════════════════════════════════════

interface AppStateMachineState {
  // Per-instance state machines
  machines: Map<string, {
    state: AppStateType;
    context: StateContext;
    config: StateMachineConfig;
    history: StateTransition[];
  }>;
  
  // Global transitions log
  allTransitions: StateTransition[];
  
  // Actions
  createMachine: (config: StateMachineConfig) => void;
  destroyMachine: (instanceId: string) => void;
  
  transition: (
    instanceId: string, 
    to: AppStateType, 
    context?: StateContext,
    trigger?: string
  ) => boolean;
  
  // State checks
  getState: (instanceId: string) => AppStateType | undefined;
  getContext: (instanceId: string) => StateContext | undefined;
  canTransition: (instanceId: string, to: AppStateType) => boolean;
  
  // Loading helpers
  startLoading: (instanceId: string, operation: string) => void;
  finishLoading: (instanceId: string) => void;
  setLoadingProgress: (instanceId: string, progress: number) => void;
  
  // Error helpers
  setError: (instanceId: string, error: StateContext['error']) => void;
  clearError: (instanceId: string) => void;
  
  // Network helpers
  checkOnlineStatus: (instanceId: string) => void;
  
  // History
  getHistory: (instanceId: string, limit?: number) => StateTransition[];
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useAppStateMachine = create<AppStateMachineState>((set, get) => ({
  machines: new Map(),
  allTransitions: [],

  createMachine: (config) => {
    const machine = {
      state: config.initialState,
      context: {},
      config,
      history: [],
    };

    set(state => {
      const newMachines = new Map(state.machines);
      newMachines.set(config.instanceId, machine);
      return { machines: newMachines };
    });

    // Check network if required
    if (config.requiresNetwork && !useNetworkService.getState().isOnline) {
      get().transition(config.instanceId, 'offline', {
        offline: {
          lastOnlineAt: Date.now(),
          requiredForFeature: 'core functionality',
        },
      }, 'network_check');
    }
  },

  destroyMachine: (instanceId) => {
    set(state => {
      const newMachines = new Map(state.machines);
      newMachines.delete(instanceId);
      return { machines: newMachines };
    });
  },

  transition: (instanceId, to, context = {}, trigger = 'manual') => {
    const state = get();
    const machine = state.machines.get(instanceId);
    if (!machine) return false;

    const from = machine.state;

    // Check if transition is valid
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      // Invalid transition silently ignored - use canTransition() to check first
      return false;
    }

    // Create transition record
    const transition: StateTransition = {
      id: generateId(),
      instanceId,
      from,
      to,
      context,
      timestamp: Date.now(),
      trigger,
    };

    // Update machine
    machine.state = to;
    machine.context = { ...machine.context, ...context };
    machine.history.push(transition);

    // Keep history bounded
    if (machine.history.length > 100) {
      machine.history = machine.history.slice(-50);
    }

    set(state => {
      const newMachines = new Map(state.machines);
      newMachines.set(instanceId, { ...machine });
      return {
        machines: newMachines,
        allTransitions: [...state.allTransitions.slice(-499), transition],
      };
    });

    // Notify config callback
    machine.config.onStateChange?.(from, to, context);

    // Emit system event for significant transitions
    if (['error', 'offline', 'permission-denied', 'terminated'].includes(to)) {
      useSystemEvents.getState().emit({
        type: to === 'error' ? 'error' : 'app_close',
        appId: machine.config.appId,
        instanceId,
        data: { from, to, context },
        severity: to === 'error' ? 'error' : 'info',
      });
    }

    return true;
  },

  getState: (instanceId) => {
    return get().machines.get(instanceId)?.state;
  },

  getContext: (instanceId) => {
    return get().machines.get(instanceId)?.context;
  },

  canTransition: (instanceId, to) => {
    const machine = get().machines.get(instanceId);
    if (!machine) return false;
    return VALID_TRANSITIONS[machine.state]?.includes(to) ?? false;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Loading Helpers
  // ─────────────────────────────────────────────────────────────────────────

  startLoading: (instanceId, operation) => {
    get().transition(instanceId, 'loading', {
      loading: {
        operation,
        progress: 0,
        startedAt: Date.now(),
      },
    }, 'start_loading');
  },

  finishLoading: (instanceId) => {
    const machine = get().machines.get(instanceId);
    if (!machine || machine.state !== 'loading') return;

    get().transition(instanceId, 'loaded', {
      loading: undefined,
    }, 'finish_loading');
  },

  setLoadingProgress: (instanceId, progress) => {
    set(state => {
      const machine = state.machines.get(instanceId);
      if (!machine || machine.state !== 'loading') return state;

      const newMachines = new Map(state.machines);
      newMachines.set(instanceId, {
        ...machine,
        context: {
          ...machine.context,
          loading: {
            ...machine.context.loading!,
            progress,
          },
        },
      });
      return { machines: newMachines };
    });
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Error Helpers
  // ─────────────────────────────────────────────────────────────────────────

  setError: (instanceId, error) => {
    get().transition(instanceId, 'error', {
      error,
      loading: undefined,
    }, 'set_error');
  },

  clearError: (instanceId) => {
    const machine = get().machines.get(instanceId);
    if (!machine || machine.state !== 'error') return;

    // Attempt to recover to active or loading
    const canGoActive = VALID_TRANSITIONS['error'].includes('active');
    get().transition(
      instanceId, 
      canGoActive ? 'active' : 'loading',
      { error: undefined },
      'clear_error'
    );
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Network Helpers
  // ─────────────────────────────────────────────────────────────────────────

  checkOnlineStatus: (instanceId) => {
    const machine = get().machines.get(instanceId);
    if (!machine) return;

    const isOnline = useNetworkService.getState().isOnline;

    if (!isOnline && machine.config.requiresNetwork) {
      if (machine.state !== 'offline') {
        get().transition(instanceId, 'offline', {
          offline: {
            lastOnlineAt: Date.now(),
            requiredForFeature: 'core functionality',
          },
        }, 'network_offline');
      }
    } else if (machine.state === 'offline' && isOnline) {
      get().transition(instanceId, 'loading', {
        offline: undefined,
      }, 'network_online');
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // History
  // ─────────────────────────────────────────────────────────────────────────

  getHistory: (instanceId, limit = 50) => {
    const machine = get().machines.get(instanceId);
    return machine?.history.slice(-limit) ?? [];
  },
}));

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS FOR APPS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for apps to manage their state machine
 */
export const useAppState = (instanceId: string) => {
  const state = useAppStateMachine(s => s.getState(instanceId));
  const context = useAppStateMachine(s => s.getContext(instanceId));
  const { 
    transition, 
    startLoading, 
    finishLoading, 
    setLoadingProgress,
    setError,
    clearError,
  } = useAppStateMachine.getState();

  return {
    state: state ?? 'initial',
    context: context ?? {},
    isLoading: state === 'loading',
    isActive: state === 'active',
    isError: state === 'error',
    isOffline: state === 'offline',
    isEmpty: state === 'empty',
    
    // Actions
    transition: (to: AppStateType, ctx?: StateContext, trigger?: string) => 
      transition(instanceId, to, ctx, trigger),
    startLoading: (operation: string) => startLoading(instanceId, operation),
    finishLoading: () => finishLoading(instanceId),
    setLoadingProgress: (progress: number) => setLoadingProgress(instanceId, progress),
    setError: (error: StateContext['error']) => setError(instanceId, error),
    clearError: () => clearError(instanceId),
    
    // Computed
    loadingProgress: context?.loading?.progress,
    loadingOperation: context?.loading?.operation,
    errorMessage: context?.error?.message,
    errorCode: context?.error?.code,
    canRetry: context?.error?.retryable ?? false,
  };
};

/**
 * Hook for network-aware apps
 */
export const useNetworkAwareState = (instanceId: string) => {
  const appState = useAppState(instanceId);
  const isOnline = useNetworkService(s => s.isOnline);
  const { checkOnlineStatus } = useAppStateMachine.getState();

  // Check online status when it changes
  React.useEffect(() => {
    checkOnlineStatus(instanceId);
  }, [isOnline, instanceId, checkOnlineStatus]);

  return {
    ...appState,
    isOnline,
  };
};

// Need React for the hook
import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// STATE-BASED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface StateRendererProps {
  instanceId: string;
  appColor: string;
  children: React.ReactNode;
  onRetry?: () => void;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  offlineComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
}

/**
 * Renders children only when app is active, shows appropriate UI for other states
 */
export const StateRenderer: React.FC<StateRendererProps> = ({
  instanceId,
  appColor,
  children,
  onRetry,
  loadingComponent,
  errorComponent,
  offlineComponent,
  emptyComponent,
}) => {
  const { state, context, clearError } = useAppState(instanceId);

  switch (state) {
    case 'loading':
      return loadingComponent ? (
        <>{loadingComponent}</>
      ) : (
        <DefaultLoadingUI 
          operation={context.loading?.operation}
          progress={context.loading?.progress}
          color={appColor}
        />
      );

    case 'error':
      return errorComponent ? (
        <>{errorComponent}</>
      ) : (
        <DefaultErrorUI
          error={context.error}
          color={appColor}
          onRetry={() => {
            clearError();
            onRetry?.();
          }}
        />
      );

    case 'offline':
      return offlineComponent ? (
        <>{offlineComponent}</>
      ) : (
        <DefaultOfflineUI />
      );

    case 'empty':
      return emptyComponent ? (
        <>{emptyComponent}</>
      ) : (
        <DefaultEmptyUI color={appColor} />
      );

    case 'active':
    case 'loaded':
    case 'background':
      return <>{children}</>;

    default:
      return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Default UI Components
// ─────────────────────────────────────────────────────────────────────────────

const DefaultLoadingUI: React.FC<{
  operation?: string;
  progress?: number;
  color: string;
}> = ({ operation, progress, color }) => (
  <div style={uiStyles.container}>
    <div style={{ ...uiStyles.spinner, borderTopColor: color }} />
    {operation && <p style={uiStyles.text}>{operation}</p>}
    {progress !== undefined && (
      <div style={uiStyles.progressBar}>
        <div style={{ ...uiStyles.progressFill, width: `${progress}%`, background: color }} />
      </div>
    )}
  </div>
);

const DefaultErrorUI: React.FC<{
  error?: StateContext['error'];
  color: string;
  onRetry?: () => void;
}> = ({ error, color, onRetry }) => (
  <div style={uiStyles.container}>
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <h3 style={uiStyles.title}>{error?.message || 'Something went wrong'}</h3>
    {error?.retryable && onRetry && (
      <button style={{ ...uiStyles.button, background: `${color}22`, border: `1px solid ${color}40`, color: color, backdropFilter: 'blur(8px)' }} onClick={onRetry}>
        Try Again
      </button>
    )}
  </div>
);

const DefaultOfflineUI: React.FC = () => (
  <div style={uiStyles.container}>
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="1.5">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
      <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0122.58 9" />
      <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
      <path d="M8.53 16.11a6 6 0 016.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
    <h3 style={uiStyles.title}>You're Offline</h3>
    <p style={uiStyles.text}>Check your internet connection and try again.</p>
  </div>
);

const DefaultEmptyUI: React.FC<{ color: string }> = ({ color }) => (
  <div style={uiStyles.container}>
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
    <h3 style={uiStyles.title}>No Data</h3>
    <p style={uiStyles.text}>There's nothing here yet.</p>
  </div>
);

const uiStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 24,
    textAlign: 'center',
    gap: 12,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '2px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
    borderTopColor: '#007aff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text-primary, #1d1d1f)',
    margin: 0,
  },
  text: {
    fontSize: 13,
    color: 'var(--color-text-tertiary, #6e6e73)',
    margin: 0,
    maxWidth: 240,
  },
  progressBar: {
    width: 200,
    height: 4,
    background: 'var(--color-border-subtle, rgba(0,0,0,0.1))',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  button: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-inverse)',
    cursor: 'pointer',
    marginTop: 8,
  },
};
