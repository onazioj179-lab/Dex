// Global type declarations for the Dex API exposed via preload

export {};

// Electron webview element type declarations
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        allowpopups?: string;
        preload?: string;
        partition?: string;
        webpreferences?: string;
        httpreferrer?: string;
        useragent?: string;
        disablewebsecurity?: string;
        nodeintegration?: string;
        nodeintegrationinsubframes?: string;
        plugins?: string;
        disableblinkfeatures?: string;
        enableblinkfeatures?: string;
      }, HTMLElement>;
    }
  }
}

declare global {
  interface Window {
    dex: {
      // Generic invoke for dynamic IPC calls
      invoke: (channel: string, ...args: any[]) => Promise<any>;

      // Platform information
      platform: {
        isMac: boolean;
        isWindows: boolean;
        isLinux: boolean;
        os: string;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      actions: {
        execute: (action: any) => Promise<any>;
        getAll: () => Promise<any[]>;
        save: (action: any) => Promise<any>;
        delete: (actionId: string) => Promise<void>;
        getRunningApps: () => Promise<any[]>;
        closeApp: (pid: number) => Promise<void>;
      };
      modes: {
        getAll: () => Promise<any[]>;
        getActive: () => Promise<any | null>;
        activate: (modeId: string) => Promise<void>;
        deactivate: () => Promise<void>;
        save: (mode: any) => Promise<any>;
        delete: (modeId: string) => Promise<void>;
      };
      rules: {
        getAll: () => Promise<any[]>;
        save: (rule: any) => Promise<any>;
        delete: (ruleId: string) => Promise<void>;
        toggle: (ruleId: string, enabled: boolean) => Promise<void>;
      };
      system: {
        getStatus: () => Promise<any>;
        getProcesses: () => Promise<any[]>;
      };
      logs: {
        get: (limit?: number) => Promise<any[]>;
        clear: () => Promise<void>;
      };
      permissions: {
        getAll: () => Promise<any>;
        grant: (permission: string) => Promise<void>;
        revoke: (permission: string) => Promise<void>;
      };
      emergency: {
        stop: () => Promise<void>;
        resume: () => Promise<void>;
      };
      shell: {
        openPath: (path: string) => Promise<string>;
        openExternal: (url: string) => Promise<void>;
      };
      power: {
        getStats: () => Promise<any>;
        setProfile: (profile: string) => Promise<any>;
        freeMemory: () => Promise<any>;
        closeProcess: (pid: number, force: boolean) => Promise<any>;
      };
      sessions: {
        getCurrent: () => Promise<any>;
        start: (name: string) => Promise<any>;
        end: (id: string) => Promise<void>;
        getTimers: () => Promise<any[]>;
        createTimer: (timer: any) => Promise<any>;
        startTimer: (timerId: string) => Promise<void>;
        pauseTimer: (timerId: string) => Promise<void>;
        stopTimer: (timerId: string) => Promise<void>;
        deleteTimer: (timerId: string) => Promise<void>;
        getNotes: () => Promise<any[]>;
        addNote: (note: any) => Promise<any>;
        updateNote: (noteId: string, update: any) => Promise<any>;
        deleteNote: (noteId: string) => Promise<void>;
        getRunningTasks: () => Promise<any[]>;
        stopTask: (taskId: string) => Promise<void>;
      };
      workflows: {
        getAll: () => Promise<any[]>;
        getTemplates: () => Promise<any[]>;
        save: (workflow: any) => Promise<any>;
        delete: (workflowId: string) => Promise<void>;
        duplicate: (workflowId: string) => Promise<any>;
        togglePin: (workflowId: string) => Promise<void>;
        execute: (workflowId: string) => Promise<any>;
      };
      operations: {
        execute: (operationId: string) => Promise<any>;
        getLogs: (limit?: number) => Promise<any[]>;
      };
      data: {
        export: () => Promise<{ success: boolean; path?: string; error?: string }>;
        import: () => Promise<{ success: boolean; imported?: string[]; error?: string }>;
        reset: () => Promise<{ success: boolean; error?: string }>;
        stats: () => Promise<{
          notes: number;
          tasks: number;
          workflows: number;
          operations: number;
          actions: number;
          rules: number;
          timers: number;
          totalSize: number;
        }>;
        exportCollection: (collection: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      };
      watchdog: {
        health: () => Promise<{
          healthy: boolean;
          lastCheck: number;
          memoryUsage: number;
          cpuUsage: number;
          uptime: number;
          errors: string[];
          warnings: string[];
        }>;
        check: () => Promise<any>;
        diagnostics: () => Promise<any>;
        clearErrors: () => Promise<{ success: boolean }>;
      };
      // Authentication
      auth: {
        getState: () => Promise<any>;
        getConfig: () => Promise<any>;
        biometricsAvailable: () => Promise<boolean>;
        authenticatePassword: (password: string) => Promise<{ success: boolean; error?: string; token?: string }>;
        authenticatePin: (pin: string) => Promise<{ success: boolean; error?: string; token?: string }>;
        authenticateBiometric: () => Promise<{ success: boolean; error?: string; token?: string }>;
        setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
        setPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
        enableBiometric: () => Promise<{ success: boolean; error?: string }>;
        updateConfig: (updates: any) => Promise<{ success: boolean }>;
        lock: () => Promise<void>;
        clearCredentials: (currentPassword?: string) => Promise<{ success: boolean; error?: string }>;
        verifySession: (token: string) => Promise<boolean>;
        getLockoutStatus: () => Promise<{ isLockedOut: boolean; remainingMinutes: number; attemptsRemaining: number }>;
        onStateChange: (callback: (state: any) => void) => void;
      };
      // Secure Vault - Password Manager & Authenticator
      vault: {
        getState: () => Promise<any>;
        exists: () => Promise<boolean>;
        create: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
        unlock: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
        lock: () => Promise<void>;
        changeMasterPassword: (current: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
        getCredentials: () => Promise<any[]>;
        getCredential: (id: string) => Promise<any | null>;
        addCredential: (credential: any) => Promise<any>;
        updateCredential: (id: string, updates: any) => Promise<boolean>;
        deleteCredential: (id: string) => Promise<boolean>;
        searchCredentials: (query: string) => Promise<any[]>;
        getAuthenticators: () => Promise<any[]>;
        addAuthenticator: (entry: any) => Promise<any>;
        updateAuthenticator: (id: string, updates: any) => Promise<boolean>;
        deleteAuthenticator: (id: string) => Promise<boolean>;
        generateTOTP: (id: string) => Promise<{ code: string; remainingSeconds: number } | null>;
        parseOTPUri: (uri: string) => Promise<any>;
        getSettings: () => Promise<any>;
        updateSettings: (updates: any) => Promise<boolean>;
        generatePassword: (options?: any) => Promise<string>;
        auditPasswords: () => Promise<any>;
        copyToClipboard: (text: string, autoClear?: number) => Promise<void>;
        getCategories: () => Promise<any[]>;
        addCategory: (category: any) => Promise<any>;
        export: (password: string) => Promise<string | null>;
        import: (data: string, password: string) => Promise<{ success: boolean; error?: string }>;
        onStateChange: (callback: (state: any) => void) => void;
      };
      // Phase 12: System Map
      systemMap: {
        get: () => Promise<any>;
        getHealth: () => Promise<any>;
        getConnections: () => Promise<any[]>;
        getStorage: () => Promise<any[]>;
        getSessions: () => Promise<any[]>;
        refresh: () => Promise<any>;
        evaluateTransferCapacity: () => Promise<any>;
      };
      // Phase 12: Transfers
      transfer: {
        localCopy: (request: any) => Promise<any>;
        send: (request: any) => Promise<any>;
        getActiveTransfers: () => Promise<any[]>;
        pause: (id: string) => Promise<any>;
        resume: (id: string) => Promise<any>;
        cancel: (id: string) => Promise<any>;
        getConfig: () => Promise<any>;
        setConfig: (config: any) => Promise<any>;
        selectFiles: () => Promise<any>;
        getPermissions: () => Promise<any[]>;
        grantPermission: (perm: any) => Promise<any>;
        revokePermission: (id: string) => Promise<any>;
      };
      // Phase 12: Connection
      connection: {
        getNetworkInfo: () => Promise<any>;
        getPermissions: () => Promise<any>;
        setPermissions: (perms: any) => Promise<any>;
        setNetworkingEnabled: (enabled: boolean) => Promise<any>;
        getChannels: () => Promise<any[]>;
        openChannel: (config: any) => Promise<any>;
        closeChannel: (id: string) => Promise<any>;
        isTypeAllowed: (type: string) => Promise<boolean>;
        testConnection: (host: string, port: number) => Promise<any>;
        getLocalIPs: () => Promise<string[]>;
      };
      // Phase 12: Device
      device: {
        getThisDevice: () => Promise<any>;
        setName: (name: string) => Promise<any>;
        getAll: () => Promise<any[]>;
        getTrusted: () => Promise<any[]>;
        getOnline: () => Promise<any[]>;
        isDiscoveryEnabled: () => Promise<boolean>;
        setDiscoveryEnabled: (enabled: boolean) => Promise<any>;
        addManual: (ip: string, port: number) => Promise<any>;
        remove: (deviceId: string) => Promise<any>;
        setTrusted: (deviceId: string, trusted: boolean) => Promise<any>;
        initiatePairing: (deviceId: string) => Promise<any>;
        acceptPairing: (pairingId: string) => Promise<any>;
        rejectPairing: (pairingId: string) => Promise<any>;
        getSessions: () => Promise<any[]>;
        endSession: (sessionId: string) => Promise<any>;
      };
      // Phase 14: Deep Session Flow
      deepSession: {
        // Session lifecycle
        start: () => Promise<any>;
        restore: () => Promise<any>;
        end: () => Promise<any>;
        get: () => Promise<any>;
        // Page context preservation
        saveContext: (pageId: string, context: any) => Promise<any>;
        getContext: (pageId: string) => Promise<any>;
        navigate: (pageId: string) => Promise<any>;
        getNavigationHistory: () => Promise<string[]>;
        // Draft management
        saveDraft: (pageId: string, content: any) => Promise<any>;
        getDraft: (pageId: string) => Promise<any>;
        getDrafts: () => Promise<any>;
        discardDraft: (pageId: string) => Promise<any>;
        // Pinned notes
        pinNote: (noteId: string) => Promise<any>;
        unpinNote: (noteId: string) => Promise<any>;
        getPinnedNotes: () => Promise<string[]>;
        // Split view
        setSplitView: (config: any) => Promise<any>;
        getSplitView: () => Promise<any>;
        // Activity & preferences
        recordActivity: () => Promise<any>;
        getPreferences: () => Promise<any>;
        setPreferences: (prefs: any) => Promise<any>;
      };
      // Phase 16: Encryption
      encryption: {
        getStatus: () => Promise<{
          available: boolean;
          enabled: boolean;
          locked: boolean;
          keySource: 'password' | 'system' | null;
          lastKeyRotation: number | null;
          isUnlocked?: boolean;
          itemCount?: number;
          algorithm?: string;
          lastBackup?: number | null;
          health?: string;
        }>;
        getConfig: () => Promise<any>;
        updateConfig: (updates: any) => Promise<any>;
        initWithPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
        initWithSystemKey: () => Promise<{ success: boolean; error?: string }>;
        unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
        lock: () => Promise<{ success: boolean }>;
        disable: () => Promise<{ success: boolean; error?: string }>;
        listItems: () => Promise<any[]>;
        createItem: (item: any) => Promise<any>;
      };
      // Phase 17: Trust & Transparency
      trust: {
        getStatus: () => Promise<any>;
        getFullReport: () => Promise<any>;
        getPermissions: () => Promise<any>;
        grantPermission: (permission: string) => Promise<boolean>;
        revokePermission: (permission: string) => Promise<boolean>;
        enableRestrictedMode: (allowedPermissions?: string[]) => Promise<boolean>;
        disableRestrictedMode: () => Promise<boolean>;
        runSecurityAudit: () => Promise<any>;
        getAuditLog: (count?: number, category?: string) => Promise<any[]>;
        verifyIntegrity: () => Promise<any[]>;
        getPerformance: () => Promise<any>;
        getDataLocations: () => Promise<any>;
        getHumanError: (code: string) => Promise<any>;
        getArchitecture: () => Promise<any>;
      };
      // Phase 18: Data Export & User Ownership
      export: {
        data: (options: any) => Promise<any>;
        dataToPath: (path: string, options: any) => Promise<any>;
        import: () => Promise<any>;
        importFromPath: (path: string) => Promise<any>;
        getSummary: () => Promise<any>;
        getLocations: () => Promise<any>;
        openDataFolder: () => Promise<boolean>;
      };
      // Phase 24: Health Monitoring & Diagnostics
      health: {
        check: () => Promise<any>;
        getStatus: () => Promise<any>;
        getLogs: (options?: { level?: string; source?: string; since?: number; limit?: number }) => Promise<any[]>;
        clearLogs: () => Promise<{ success: boolean }>;
        exportLogs: () => Promise<string>;
        setDiagnosticsEnabled: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean }>;
        isDiagnosticsEnabled: () => Promise<boolean>;
        getVerification: () => Promise<any>;
      };
      // AI Agent System
      agent: {
        processMessage: (message: string) => Promise<any>;
        getHistory: (limit?: number) => Promise<any>;
        clearHistory: () => Promise<void>;
        getTools: () => Promise<any[]>;
        learnPreference: (key: string, value: any) => Promise<void>;
      };
      homeAutomation: {
        getDevices: () => Promise<any[]>;
        discoverDevices: (timeout?: number) => Promise<any[]>;
        controlDevice: (deviceId: string, command: any) => Promise<any>;
        getScenes: () => Promise<any[]>;
        activateScene: (sceneId: string) => Promise<any>;
        getRoutines: () => Promise<any[]>;
        runRoutine: (routineId: string) => Promise<any>;
        getSecurityMode: () => Promise<string>;
        setSecurityMode: (mode: string) => Promise<void>;
      };
      computerTasks: {
        getEmailAccounts: () => Promise<any[]>;
        syncEmails: (accountId?: string) => Promise<any[]>;
        sendEmail: (email: any) => Promise<any>;
        getCalendarEvents: (start?: number, end?: number) => Promise<any[]>;
        createCalendarEvent: (event: any) => Promise<any>;
        getInstalledApps: () => Promise<any[]>;
        launchApp: (appPath: string, args?: string[]) => Promise<any>;
        getDailySummary: () => Promise<any>;
      };
      privacy: {
        getConfig: () => Promise<any>;
        updateConfig: (updates: any) => Promise<any>;
        setMode: (mode: string) => Promise<void>;
        getPermissions: () => Promise<any[]>;
        grantPermission: (id: string, expiry?: number) => Promise<boolean>;
        revokePermission: (id: string) => Promise<boolean>;
        getAccessLog: (options?: any) => Promise<any[]>;
        exportData: () => Promise<any>;
        deleteAllData: () => Promise<any>;
        generateReport: (period?: any) => Promise<any>;
      };
      // ULTRA-LOW RESOURCE MODE: Resource Governor API
      resource: {
        getSnapshot: () => Promise<any>;
        getPressure: () => Promise<string>;
        getThrottleLevel: () => Promise<string>;
        getBudgets: () => Promise<any[]>;
        recordActivity: () => void;
        getGPUState: () => Promise<any>;
        shouldRender: () => Promise<boolean>;
        reportRenderStart: () => void;
        reportRenderEnd: () => void;
      };
      // 120Hz RENDER GOVERNOR: High-refresh rate support
      render: {
        getConfig: () => Promise<any>;
        getSnapshot: () => Promise<any>;
        reportFrameMetrics: (metrics: any) => void;
        reportStateChange: (state: string) => void;
        reportInputEvent: () => void;
      };
      // MOTION DISCIPLINE: Animation control
      motion: {
        getConfig: () => Promise<any>;
        getState: () => Promise<any>;
        requestAnimation: (request: any) => Promise<any>;
        reportPrefersReduced: (prefers: boolean) => void;
        reportAnimationStart: () => void;
        reportAnimationEnd: () => void;
      };
      // INPUT LATENCY: Zero-latency input mode
      input: {
        getSnapshot: () => Promise<any>;
        getTargets: () => Promise<any>;
        shouldDefer: () => Promise<boolean>;
        reportEvent: (event: any) => void;
        reportLatency: (measurement: any) => void;
      };
      // SESSION STABILITY: Long-session support
      stability: {
        getMetrics: () => Promise<any>;
        getSnapshot: () => Promise<any>;
        getUptime: () => Promise<any>;
        compact: () => Promise<any>;
        reportIdle: () => void;
        reportFrameTime: (frameTime: number) => void;
        reportLatency: (latency: number) => void;
      };
      // PERFORMANCE ENFORCER: Guarantees enforcement
      enforce: {
        getSnapshot: () => Promise<any>;
        getGuarantees: () => Promise<any>;
        getBaseline: () => Promise<any>;
        check: () => Promise<any>;
        reportMetrics: (metrics: any) => void;
      };
      // UNIVERSAL SEARCH: Global search across Dex and computer files
      search: {
        query: (query: string, options?: {
          scopes?: ('dex' | 'computer')[];
          limit?: number;
          types?: string[];
        }) => Promise<Array<{
          id: string;
          title: string;
          type: string;
          scope: 'dex' | 'computer';
          subtitle?: string;
          preview?: string;
          path?: string;
          category?: string;
          score?: number;
          timestamp?: number;
          action?: any;
          icon?: string;
        }> & {
          results?: Array<any>;
          total?: number;
          scopes?: ('dex' | 'computer')[];
        }>;
        getStats: () => Promise<{
          dex: { indexed: number; types: string[] };
          computer: { indexed: number; scopes: string[] };
        }>;
        rebuild: () => Promise<{ success: boolean }>;
      };
      // FILE SEARCH: Computer file indexing scopes
      fileSearch: {
        getScopes: () => Promise<Array<{
          path: string;
          name: string;
          fileCount: number;
          indexed: boolean;
          lastIndexed?: number;
        }>>;
        addScope: (folderPath?: string) => Promise<{
          success: boolean;
          scope?: { path: string; name: string };
          error?: string;
        }>;
        removeScope: (scopePath: string) => Promise<{ success: boolean }>;
        search: (query: string, options?: {
          scopes?: string[];
          limit?: number;
        }) => Promise<Array<{
          path: string;
          name: string;
          type: string;
          size: number;
          modified: number;
          score: number;
        }>>;
        reindex: (scopePath?: string) => Promise<{ success: boolean }>;
      };
      // FILE MANAGEMENT: Phase 19
      files: {
        addScope: (folderPath: string, options?: any) => Promise<boolean>;
        addScopeWithDialog: () => Promise<string | null>;
        removeScope: (folderPath: string) => Promise<boolean>;
        getScopes: () => Promise<any[]>;
        isInScope: (targetPath: string) => Promise<boolean>;
        list: (dirPath: string, sort?: any) => Promise<any[] | null>;
        rename: (oldPath: string, newName: string) => Promise<any>;
        move: (sourcePaths: string | string[], targetDir: string) => Promise<any>;
        copy: (sourcePaths: string | string[], targetDir?: string) => Promise<any>;
        delete: (filePath: string | string[]) => Promise<any>;
        previewBatchRename: (files: string[], rules: any[]) => Promise<any[]>;
        executeBatchRename: (files: string[], rules: any[]) => Promise<any[]>;
        organizeByType: (dirPath: string) => Promise<any[]>;
        undo: () => Promise<any | null>;
        getHistory: () => Promise<any[]>;
        clearHistory: () => Promise<boolean>;
        getRecent: () => Promise<any[]>;
        selectFolder: () => Promise<{ files: any[] } | null>;
        compress: (files: string[], outputPath: string) => Promise<any>;
        openWith: (filePath: string, appPath?: string) => Promise<any>;
        archive: (files: string | string[], outputPath?: string, format?: string) => Promise<any>;
      };
      // ACTIVITY & NOTIFICATIONS: Phase 63
      activity: {
        getAll: () => Promise<any[]>;
        getRecent: () => Promise<any[]>;
        markRead: (id: string) => Promise<boolean>;
        markAllRead: () => Promise<boolean>;
        clearAll: () => Promise<boolean>;
        onNew: (callback: (...args: any[]) => void) => void;
        offNew: (callback: (...args: any[]) => void) => void;
      };
      // CLIPBOARD HISTORY: OS-level clipboard management
      clipboard: {
        getHistory: (filter?: any) => Promise<any[]>;
        get: (id: string) => Promise<any | null>;
        paste: (id: string) => Promise<boolean>;
        pin: (id: string, pinned: boolean) => Promise<boolean>;
        favorite: (id: string, favorite: boolean) => Promise<boolean>;
        tag: (id: string, tags: string[]) => Promise<boolean>;
        delete: (id: string) => Promise<boolean>;
        clear: (keepPinned?: boolean) => Promise<{ deleted: number }>;
        search: (query: string) => Promise<any[]>;
        stats: () => Promise<any>;
        getConfig: () => Promise<any>;
        setConfig: (config: any) => Promise<any>;
        pause: () => Promise<{ success: boolean }>;
        resume: () => Promise<{ success: boolean }>;
        capture: () => Promise<any>;
      };
      // VOICE NOTES: Local voice recording & storage
      voiceNotes: {
        getAll: () => Promise<any[]>;
        getById: (id: string) => Promise<any | null>;
        save: (audioData: ArrayBuffer, metadata: any) => Promise<any>;
        update: (id: string, updates: any) => Promise<any>;
        delete: (id: string) => Promise<boolean>;
        togglePin: (id: string) => Promise<boolean>;
        getPath: (id: string) => Promise<string | null>;
        search: (query: string) => Promise<any[]>;
        getRecent: (limit?: number) => Promise<any[]>;
        getPinned: () => Promise<any[]>;
        getStats: () => Promise<{ count: number; totalDuration: number; totalSize: number }>;
        getSettings: () => Promise<any>;
        updateSettings: (settings: any) => Promise<any>;
      };
      // PROJECTS: Phase 63
      projects: {
        getAll: () => Promise<any[]>;
        create: (project: any) => Promise<any>;
        update: (projectId: string, updates: any) => Promise<boolean>;
        delete: (projectId: string) => Promise<boolean>;
        setActive: (projectId: string | null) => Promise<boolean>;
        getActive: () => Promise<any | null>;
        linkItems: (projectId: string, items: any[]) => Promise<boolean>;
      };
      // Settings API
      settings: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        getAll: () => Promise<Record<string, any>>;
        reset: (key?: string) => Promise<void>;
        getExpert: () => Promise<any>;
        setExpert: (config: any) => Promise<void>;
      };
      // Session API (for override store)
      session: {
        start: (config: any) => Promise<any>;
        end: () => Promise<void>;
        get: () => Promise<any>;
        save: (data?: any) => Promise<any>;
        clear: () => Promise<void>;
      };
      // Dialogs API
      dialogs: {
        confirm: (messageOrOptions: string | { title?: string; message?: string; type?: string }, options?: any) => Promise<boolean>;
        prompt: (message: string | { title?: string; message?: string; defaultValue?: string }, defaultValue?: string) => Promise<string | null>;
        showMessage: (message: string | { title?: string; message?: string; type?: string }, type?: 'info' | 'warning' | 'error') => Promise<void>;
        showSaveDialog: (options?: any) => Promise<string | null>;
        showOpenDialog: (options?: any) => Promise<string[] | null>;
        selectFolder: () => Promise<string | string[] | null>;
        select: (options?: any) => Promise<any>;
        tagPicker: (options?: any) => Promise<string[] | null>;
        imageResize: (options?: any) => Promise<any>;
        audioTrim: (options?: any) => Promise<any>;
        projectPicker: () => Promise<any>;
        saveFile: (options?: any) => Promise<string | null>;
      };
      // Tags API
      tags: {
        getAll: () => Promise<string[]>;
        add: (itemId: string | string[], tags: string[]) => Promise<boolean>;
        remove: (itemId: string | string[], tag: string) => Promise<boolean>;
        search: (tag: string) => Promise<any[]>;
        getSuggested: () => Promise<string[]>;
      };
      // Favorites API
      favorites: {
        getAll: () => Promise<any[]>;
        add: (item: any) => Promise<boolean>;
        remove: (itemId: string) => Promise<boolean>;
        toggle: (itemId: string | string[]) => Promise<boolean>;
      };
      // Media API
      media: {
        getPlaying: () => Promise<any | null>;
        play: () => Promise<void>;
        pause: () => Promise<void>;
        next: () => Promise<void>;
        previous: () => Promise<void>;
        setVolume: (volume: number) => Promise<void>;
        getVolume: () => Promise<number>;
        getQueue: () => Promise<any[]>;
        addToQueue: (item: any) => Promise<void>;
        removeFromQueue: (itemId: string) => Promise<void>;
        convert: (inputPath: string | string[], outputFormat: string, options?: any) => Promise<any>;
        getMetadata: (filePath: string) => Promise<any>;
        extractAudio: (videoPath: string, outputPath: string) => Promise<any>;
        mergeAudio: (files: string[], outputPath: string) => Promise<any>;
        trimAudio: (inputPath: string, start: number, end: number, outputPath: string) => Promise<any>;
        resize: (inputPath: string | string[], size: any, outputPath?: string) => Promise<any>;
        setWallpaper: (imagePath: string) => Promise<boolean>;
        trim: (mediaPath: string, range?: any) => Promise<any>;
      };
      // Timeline API
      timeline: {
        getEvents: (options?: { projectId?: string; timeRange?: any; limit?: number; start?: number; end?: number }) => Promise<any[]>;
        addEvent: (event: any) => Promise<any>;
        updateEvent: (eventId: string, updates: any) => Promise<any>;
        deleteEvent: (eventId: string) => Promise<boolean>;
        getByDate: (date: string) => Promise<any[]>;
      };
      // Voice API
      voice: {
        isSupported: () => Promise<boolean>;
        isListening: () => Promise<boolean>;
        startListening: () => Promise<void>;
        stopListening: () => Promise<void>;
        getConfig: () => Promise<any>;
        setConfig: (config: any) => Promise<any>;
        updateConfig: (config: any) => Promise<any>;
        getCommands: () => Promise<any[]>;
        addCommand: (command: any) => Promise<any>;
        removeCommand: (commandId: string) => Promise<boolean>;
        speak: (text: string, options?: any) => Promise<void>;
        cancelSpeech: () => Promise<void>;
        getState: () => Promise<any>;
        getMicrophoneStatus: () => Promise<any>;
        disable: () => Promise<void>;
        enable: () => Promise<void>;
        cancelCommand: () => Promise<void>;
        requestMicrophonePermission: () => Promise<boolean>;
      };
      // Automations API
      automations: {
        getAll: () => Promise<any[]>;
        getById: (id: string) => Promise<any | null>;
        get: (id: string) => Promise<any | null>;
        create: (automation: any) => Promise<any>;
        update: (id: string, updates: any) => Promise<any>;
        save: (automation: any) => Promise<any>;
        delete: (id: string) => Promise<boolean>;
        execute: (id: string) => Promise<any>;
        stop: (id: string) => Promise<void>;
        cancel: (id: string) => Promise<void>;
        pause: (id: string) => Promise<void>;
        resume: (id: string) => Promise<void>;
        duplicate: (id: string) => Promise<any>;
        getExecutionState: (id: string) => Promise<any | null>;
      };
      // Gallery API
      gallery: {
        getItems: (options?: any) => Promise<any[]>;
        getById: (id: string) => Promise<any | null>;
        addTag: (itemId: string | string[], tag: string) => Promise<boolean>;
        removeTag: (itemId: string | string[], tag: string) => Promise<boolean>;
        setFavorite: (itemId: string | string[], favorite: boolean) => Promise<boolean>;
        delete: (itemId: string | string[]) => Promise<boolean>;
        getCollections: () => Promise<any[]>;
        addToCollection: (itemId: string | string[], collectionId: string) => Promise<boolean>;
        getFolders: (parentFolder?: string | null) => Promise<any[]>;
      };
      // Code API
      code: {
        getProjects: () => Promise<any[]>;
        openProject: (path: string) => Promise<any>;
        getRecentFiles: () => Promise<any[]>;
        openFile: (path: string) => Promise<any>;
        saveFile: (pathOrFile: string | any, content?: string) => Promise<boolean>;
        runScript: (scriptPath: string, args?: string[]) => Promise<any>;
        getLanguages: () => Promise<string[]>;
        getFiles: (path: string) => Promise<any[]>;
        readFile: (path: string) => Promise<string>;
      };
      // Scripting API
      scripting: {
        getAll: () => Promise<any[]>;
        getScripts: () => Promise<any[]>;
        getById: (id: string) => Promise<any | null>;
        create: (script: any) => Promise<any>;
        createScript: (script: any) => Promise<any>;
        update: (id: string, updates: any) => Promise<any>;
        updateScript: (id: string, updates: any) => Promise<any>;
        delete: (id: string) => Promise<boolean>;
        deleteScript: (id: string) => Promise<boolean>;
        execute: (id: string, args?: any) => Promise<any>;
        stop: (id: string) => Promise<void>;
        getTemplates: () => Promise<any[]>;
      };
      // File Intelligence API
      fileIntel: {
        analyze: (filePath: string) => Promise<any>;
        getInsights: (filePath: string) => Promise<any>;
        getDuplicates: (scopePath?: string) => Promise<any[]>;
        getLargeFiles: (minSize?: number) => Promise<any[]>;
        getOldFiles: (days?: number) => Promise<any[]>;
        suggestOrganization: (dirPath: string) => Promise<any>;
        getStats: () => Promise<any>;
        scan: (dirPath: string) => Promise<any>;
        cancelScan: () => Promise<void>;
        getScanProgress: () => Promise<any>;
        createSmartFolder: (config: any) => Promise<any>;
        getSmartFolders: () => Promise<any[]>;
        updateSmartFolder: (id: string, updates: any) => Promise<any>;
        deleteSmartFolder: (id: string) => Promise<boolean>;
        authorizePath: (path?: string) => Promise<{ success: boolean; path?: string }>;
        getAuthorizedPaths: () => Promise<string[]>;
        revokePath: (path: string) => Promise<void>;
        scanDirectory: (path: string, options?: any) => Promise<any>;
        getAllFiles: () => Promise<any[]>;
        getStatistics: () => Promise<any>;
        groupByType: () => Promise<any>;
        groupByDate: (period?: string) => Promise<any>;
        getSuggestions: () => Promise<any[]>;
        openFile: (path: string) => Promise<boolean>;
        revealInExplorer: (path: string) => Promise<boolean>;
        searchFiles: (query: string) => Promise<any[]>;
      };
      // Security Core API
      securityCore: {
        getStatus: () => Promise<any>;
        runAudit: () => Promise<any>;
        runSecurityCheck: () => Promise<any>;
        getThreats: () => Promise<any[]>;
        dismissThreat: (threatId: string) => Promise<boolean>;
        acknowledgeThreats: (threatIds: string[]) => Promise<boolean>;
        setConfig: (config: any) => Promise<void>;
        updateConfig: (config: any) => Promise<void>;
        getConfig: () => Promise<any>;
      };
      // Secure Keys API
      secureKeys: {
        getAll: () => Promise<any[]>;
        listKeys: () => Promise<any[]>;
        get: (keyId: string) => Promise<any | null>;
        store: (key: any) => Promise<any>;
        update: (keyId: string, updates: any) => Promise<any>;
        delete: (keyId: string) => Promise<boolean>;
        deleteKey: (keyId: string) => Promise<boolean>;
        generate: (options?: any) => Promise<any>;
        generateKey: (name?: string, purpose?: string) => Promise<any>;
        export: (keyId: string, format: string) => Promise<any>;
        isLocked: () => Promise<boolean>;
        lock: () => Promise<void>;
        unlock: (password: string) => Promise<boolean>;
      };
      // Secure Transfer API
      secureTransfer: {
        getStatus: () => Promise<any>;
        initiate: (filePath: string, destinationPath?: string, encrypt?: boolean) => Promise<any>;
        accept: (transferId: string) => Promise<any>;
        approveTransfer: (transferId: string) => Promise<any>;
        reject: (transferId: string) => Promise<boolean>;
        rejectTransfer: (transferId: string) => Promise<boolean>;
        getHistory: () => Promise<any[]>;
        getTransfers: () => Promise<any[]>;
        getActiveTransfers: () => Promise<any[]>;
        setConfig: (config: any) => Promise<void>;
        getConfig: () => Promise<any>;
        selectAndInitiate: () => Promise<any>;
      };
      // Network Hygiene API
      networkHygiene: {
        getStatus: () => Promise<any>;
        scan: () => Promise<any>;
        getConnections: () => Promise<any[]>;
        getConnectivity: () => Promise<any>;
        blockConnection: (connectionId: string) => Promise<boolean>;
        unblockConnection: (connectionId: string) => Promise<boolean>;
        getBlocklist: () => Promise<any[]>;
      };
      // Override API
      override: {
        getActive: () => Promise<any | null>;
        activate: (overrideId: string) => Promise<any>;
        deactivate: () => Promise<void>;
        getAll: () => Promise<any[]>;
        create: (override: any) => Promise<any>;
        delete: (overrideId: string) => Promise<boolean>;
        execute: (action: string, reason?: string) => Promise<any>;
      };
      // Preferences API
      preferences: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        getAll: () => Promise<Record<string, any>>;
      };
      // HTTP Transfer API
      httpTransfer: {
        start: () => Promise<{ success: boolean; url?: string }>;
        stop: () => Promise<void>;
        info: () => Promise<{ isRunning: boolean; url?: string; sharedFiles: any[] }>;
        pickAndShare: () => Promise<void>;
        acceptUpload: (uploadId: string, accept: boolean) => Promise<void>;
      };
      // Updates
      updates: {
        check: () => Promise<any>;
        download: () => Promise<any>;
        install: () => Promise<any>;
        skip: (version: string) => Promise<any>;
        remindLater: (hours?: number) => Promise<any>;
        getInfo: () => Promise<any>;
        getPreferences: () => Promise<any>;
        setPreferences: (prefs: any) => Promise<any>;
        openReleaseNotes: () => Promise<any>;
        getChangelog: () => Promise<any>;
        getReleaseNotesForVersion: (version: string) => Promise<{ version: string; notes: string }>;
        onInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => void;
        offInstalled: (callback: (payload: { version: string; backupPath?: string | null; timestamp: number }) => void) => void;
        getConfig: () => Promise<any>;
        listBackups: () => Promise<any[]>;
        rollback: (backupId: string) => Promise<any>;
        deleteBackup: (backupId: string) => Promise<any>;
        getUpdateHistory: () => Promise<any[]>;
      };
      // DEX Rewind - Activity Logger
      rewind: {
        getTimeline: (dateStr?: string, filterType?: string) => Promise<any>;
        search: (query: string, daysBack?: number) => Promise<any>;
        getSettings: () => Promise<any>;
        updateSettings: (updates: any) => Promise<any>;
        toggleRecording: () => Promise<any>;
        deleteAllData: () => Promise<any>;
        getStorageInfo: () => Promise<any>;
        isRecording: () => Promise<boolean>;
        getDaySummary: (dateStr?: string) => Promise<any>;
        getScreenshots: (dateStr?: string) => Promise<any>;
        getScreenshotData: (filepath: string) => Promise<any>;
        getScreenshotStorageInfo: () => Promise<any>;
        openScreenshotsFolder: () => Promise<any>;
        captureScreenshotNow: () => Promise<any>;
        getSmartSummary: (dateStr?: string) => Promise<any>;
        generateSummaryNow: (dateStr?: string) => Promise<any>;
        getWeekSummaries: () => Promise<any>;
        exportSummary: (dateStr?: string) => Promise<any>;
        getAIStatus: () => Promise<any>;
        getUsername: () => Promise<string>;
        getAppVersion: () => Promise<string>;
        getLearningStatus: () => Promise<any>;
        getLearnedPatterns: () => Promise<any>;
        getPredictedNextApp: () => Promise<any>;
        getPeakWindow: () => Promise<any>;
        isInPeakWindow: () => Promise<boolean>;
        getSuggestedDistractions: () => Promise<any>;
        recordSearchClick: (query: string, entryId: string) => Promise<any>;
        getSecurityStatus: () => Promise<any>;
        runIntegrityCheck: () => Promise<any>;
        getAuditLog: (limit?: number) => Promise<any>;
        isSessionLocked: () => Promise<boolean>;
        unlockSession: () => Promise<any>;
        getBridgeStatus: () => Promise<any>;
        isDndActive: () => Promise<boolean>;
        getBackendStatus: () => Promise<any>;
        getCrashRecoveryStatus: () => Promise<any>;
        restoreCrashedSession: () => Promise<any>;
        dismissCrashRecovery: () => Promise<any>;
        getBackupSettings: () => Promise<any>;
        setBackupSchedule: (schedule: any) => Promise<any>;
        setBackupFolder: (folder: string) => Promise<any>;
        runBackupNow: () => Promise<any>;
        pickBackupFolder: () => Promise<any>;
        restoreBackupFromPicker: () => Promise<any>;
        getWorkspaceProfiles: () => Promise<any>;
        getActiveWorkspaceProfile: () => Promise<any>;
        saveWorkspaceProfile: (profile: any) => Promise<any>;
        deleteWorkspaceProfile: (profileId: string) => Promise<any>;
        getOnboardingState: () => Promise<any>;
        skipOnboarding: () => Promise<any>;
        completeOnboarding: (payload: any) => Promise<any>;
        setFocusSessionState: (state: any) => Promise<any>;
        getFocusSessionState: () => Promise<any>;
        startFocusSession: (goalText: string) => Promise<any>;
        endFocusSession: () => Promise<any>;
        getFocusSessions: () => Promise<any>;
        getAnalyticsSnapshot: () => Promise<any>;
        recomputeAnalyticsNow: () => Promise<any>;
        getPlugins: () => Promise<any>;
        setPluginEnabled: (id: string, enabled: boolean) => Promise<any>;
        reloadPlugins: () => Promise<any>;
        openPluginsFolder: () => Promise<any>;
        getPluginCommands: () => Promise<any>;
        runPluginCommand: (pluginId: string, name: string, payload?: any) => Promise<any>;
        getTodayLogs: () => Promise<any>;
        openLogsFolder: () => Promise<any>;
        onBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => void;
        offBackgroundError: (callback: (payload: { message: string; timestamp: number }) => void) => void;
      };
      // Generic invoke for backward compatibility
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => void;
      off: (channel: string, callback: (...args: any[]) => void) => void;
      // Direct execute for quick actions widget
      execute: (actionType: string, target?: string, params?: any) => Promise<any>;
    };
    // File System Access API
    showDirectoryPicker?: (options?: any) => Promise<any>;

    // Updates API
    // Legacy API compatibility
    api?: {
      send: (channel: string, ...args: any[]) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => void;
      off: (channel: string, callback: (...args: any[]) => void) => void;
      tabs?: {
        detach: (tabId: string, tab?: any, bounds?: any) => Promise<any>;
        attach: (tabId: string, windowId: string) => Promise<any>;
      };
    };
    
    // Legacy electron API for backward compatibility
    electron?: {
      invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>;
      on?: (channel: string, callback: (...args: any[]) => void) => void;
      off?: (channel: string, callback: (...args: any[]) => void) => void;
      ipcRenderer?: {
        send: (channel: string, ...args: any[]) => void;
        sendSync: (channel: string, ...args: any[]) => any;
        invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>;
        on: (channel: string, callback: (...args: any[]) => void) => void;
        off: (channel: string, callback: (...args: any[]) => void) => void;
      };
      shell?: {
        openPath: (path: string) => Promise<string>;
        openExternal: (url: string) => Promise<void>;
      };
      media?: {
        getMediaFiles?: (type: string) => Promise<any[]>;
        [key: string]: any;
      };
    };

    // Legacy electronAPI for backward compatibility
    electronAPI?: {
      onAppEvent?: (callback: (event: string, data: unknown) => void) => void;
      [key: string]: any;
    };

    // Process info
    process?: {
      versions: Record<string, string>;
      platform: string;
      arch: string;
    };

    // DEX critical events registry
    __DEX_CRITICAL_EVENTS__?: any[];
  }
}
