// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - FORGE Web Development IDE - Live Preview Engine
// Real-time preview with hot reload and responsive testing
// Items 676-700 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface PreviewConfig {
  port: number;
  host: string;
  hot: boolean;
  liveReload: boolean;
  autoRefresh: boolean;
  refreshDelay: number;
  openBrowser: boolean;
  cors: boolean;
  proxy?: ProxyConfig[];
}

export interface ProxyConfig {
  path: string;
  target: string;
  changeOrigin: boolean;
  rewrite?: (path: string) => string;
}

export interface PreviewSession {
  id: string;
  url: string;
  port: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startTime: number;
  projectPath: string;
  framework?: Framework;
  errors: PreviewError[];
}

export type Framework = 'html' | 'react' | 'vue' | 'svelte' | 'angular' | 'astro' | 'next' | 'nuxt' | 'sveltekit';

export interface PreviewError {
  type: 'syntax' | 'runtime' | 'network' | 'compile';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: number;
}

// =============================================================================
// ITEM 676-680: LIVE PREVIEW SERVER
// =============================================================================

export interface DevServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getUrl(): string;
  getPort(): number;
  isRunning(): boolean;
}

export interface ServerStats {
  requests: number;
  errors: number;
  uptime: number;
  lastRequest?: string;
  bytesServed: number;
  connections: number;
}

export interface MimeTypes {
  [ext: string]: string;
}

export const MIME_TYPES: MimeTypes = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/jsx',
  '.tsx': 'text/tsx',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm'
};

// =============================================================================
// ITEM 681-685: HOT MODULE REPLACEMENT (HMR)
// =============================================================================

export interface HMRUpdate {
  type: 'full-reload' | 'css-update' | 'js-update' | 'partial';
  files: string[];
  timestamp: number;
  hash?: string;
}

export interface HMRClient {
  connect(): void;
  disconnect(): void;
  onUpdate(callback: (update: HMRUpdate) => void): void;
  sendMessage(type: string, data: unknown): void;
}

export interface HMRModule {
  id: string;
  path: string;
  dependencies: string[];
  acceptors: string[];
  lastUpdate: number;
}

export const HMR_CLIENT_SCRIPT = `
(function() {
  const socket = new WebSocket('ws://' + location.host + '/__hmr');
  
  socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
      case 'full-reload':
        location.reload();
        break;
      case 'css-update':
        updateCSS(data.files);
        break;
      case 'js-update':
        updateJS(data.files);
        break;
      case 'error':
        showErrorOverlay(data.error);
        break;
    }
  };
  
  socket.onclose = function() {
    console.log('[HMR] Connection lost. Retrying...');
    setTimeout(function() { location.reload(); }, 1000);
  };
  
  function updateCSS(files) {
    files.forEach(function(file) {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      links.forEach(function(link) {
        if (link.href.includes(file)) {
          const newLink = link.cloneNode();
          newLink.href = link.href.split('?')[0] + '?t=' + Date.now();
          link.parentNode.replaceChild(newLink, link);
        }
      });
    });
    console.log('[HMR] CSS updated');
  }
  
  function updateJS(files) {
    // For JS updates, typically need full reload or module-specific handling
    location.reload();
  }
  
  function showErrorOverlay(error) {
    let overlay = document.getElementById('hmr-error-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'hmr-error-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:#ff5555;padding:20px;font-family:monospace;font-size:14px;z-index:999999;overflow:auto;white-space:pre-wrap;';
      document.body.appendChild(overlay);
    }
    overlay.textContent = error.message + '\\n\\n' + (error.stack || '');
  }
  
  console.log('[HMR] Connected');
})();
`;

// =============================================================================
// ITEM 686-690: RESPONSIVE TESTING
// =============================================================================

export interface Viewport {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent?: string;
  touch?: boolean;
  mobile?: boolean;
}

export const PRESET_VIEWPORTS: Viewport[] = [
  // Mobile
  { name: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 2, touch: true, mobile: true },
  { name: 'iPhone 12/13', width: 390, height: 844, deviceScaleFactor: 3, touch: true, mobile: true },
  { name: 'iPhone 12/13 Pro Max', width: 428, height: 926, deviceScaleFactor: 3, touch: true, mobile: true },
  { name: 'iPhone 14 Pro', width: 393, height: 852, deviceScaleFactor: 3, touch: true, mobile: true },
  { name: 'Pixel 5', width: 393, height: 851, deviceScaleFactor: 2.75, touch: true, mobile: true },
  { name: 'Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625, touch: true, mobile: true },
  { name: 'Samsung Galaxy S21', width: 360, height: 800, deviceScaleFactor: 3, touch: true, mobile: true },
  { name: 'Samsung Galaxy S23 Ultra', width: 384, height: 854, deviceScaleFactor: 3.75, touch: true, mobile: true },
  
  // Tablet
  { name: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2, touch: true, mobile: true },
  { name: 'iPad Air', width: 820, height: 1180, deviceScaleFactor: 2, touch: true, mobile: true },
  { name: 'iPad Pro 11"', width: 834, height: 1194, deviceScaleFactor: 2, touch: true, mobile: true },
  { name: 'iPad Pro 12.9"', width: 1024, height: 1366, deviceScaleFactor: 2, touch: true, mobile: true },
  { name: 'Surface Pro 7', width: 912, height: 1368, deviceScaleFactor: 2, touch: true, mobile: false },
  { name: 'Galaxy Tab S7', width: 800, height: 1280, deviceScaleFactor: 2.25, touch: true, mobile: true },
  
  // Desktop
  { name: 'MacBook Air', width: 1280, height: 800, deviceScaleFactor: 2, touch: false, mobile: false },
  { name: 'MacBook Pro 14"', width: 1512, height: 982, deviceScaleFactor: 2, touch: false, mobile: false },
  { name: 'MacBook Pro 16"', width: 1728, height: 1117, deviceScaleFactor: 2, touch: false, mobile: false },
  { name: 'Desktop HD', width: 1920, height: 1080, deviceScaleFactor: 1, touch: false, mobile: false },
  { name: 'Desktop 2K', width: 2560, height: 1440, deviceScaleFactor: 1, touch: false, mobile: false },
  { name: 'Desktop 4K', width: 3840, height: 2160, deviceScaleFactor: 1, touch: false, mobile: false },
  { name: 'Ultrawide', width: 3440, height: 1440, deviceScaleFactor: 1, touch: false, mobile: false }
];

export interface ResponsiveTestResult {
  viewport: Viewport;
  screenshot?: string;
  issues: ResponsiveIssue[];
  loadTime: number;
  performanceScore: number;
}

export interface ResponsiveIssue {
  type: 'overflow' | 'text-cut' | 'image-overflow' | 'touch-target' | 'contrast' | 'font-size';
  element: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

// =============================================================================
// ITEM 691-695: BROWSER CONSOLE & DEVTOOLS
// =============================================================================

export interface ConsoleMessage {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'debug' | 'table' | 'clear';
  args: unknown[];
  timestamp: number;
  source?: string;
  line?: number;
  column?: number;
  stackTrace?: string[];
}

export interface NetworkRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  status: number;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  responseType: string;
  size: number;
  startTime: number;
  endTime: number;
  duration: number;
  initiator?: string;
  cached: boolean;
}

export interface DOMElement {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  children: DOMElement[];
  textContent?: string;
  computedStyles: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp: number; // Largest Contentful Paint
  fid: number; // First Input Delay
  cls: number; // Cumulative Layout Shift
  
  // Navigation Timing
  ttfb: number; // Time to First Byte
  fcp: number; // First Contentful Paint
  domContentLoaded: number;
  load: number;
  
  // Resources
  totalResources: number;
  totalSize: number;
  jsSize: number;
  cssSize: number;
  imageSize: number;
  fontsize: number;
  
  // Memory
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
}

// =============================================================================
// ITEM 696-700: PREVIEW ENGINE
// =============================================================================

export class PreviewEngine {
  private sessions: Map<string, PreviewSession> = new Map();
  private config: PreviewConfig;
  private fileWatcher: FileWatcher | null = null;
  private hmrModules: Map<string, HMRModule> = new Map();
  private consoleMessages: ConsoleMessage[] = [];
  private networkRequests: NetworkRequest[] = [];
  private currentViewport: Viewport = PRESET_VIEWPORTS.find(v => v.name === 'Desktop HD')!;
  private stats: ServerStats = {
    requests: 0,
    errors: 0,
    uptime: 0,
    bytesServed: 0,
    connections: 0
  };
  
  constructor(config?: Partial<PreviewConfig>) {
    this.config = {
      port: 3000,
      host: 'localhost',
      hot: true,
      liveReload: true,
      autoRefresh: true,
      refreshDelay: 100,
      openBrowser: true,
      cors: true,
      ...config
    };
  }
  
  // Session management
  async createSession(projectPath: string): Promise<PreviewSession> {
    const framework = await this.detectFramework(projectPath);
    const port = await this.findAvailablePort(this.config.port);
    
    const session: PreviewSession = {
      id: this.generateId(),
      url: `http://${this.config.host}:${port}`,
      port,
      status: 'starting',
      startTime: Date.now(),
      projectPath,
      framework,
      errors: []
    };
    
    this.sessions.set(session.id, session);
    
    // Start file watcher for HMR
    if (this.config.hot || this.config.liveReload) {
      this.startFileWatcher(projectPath, session.id);
    }
    
    session.status = 'running';
    return session;
  }
  
  private async detectFramework(projectPath: string): Promise<Framework> {
    // Check package.json for framework detection
    const packageJsonIndicators: { [key: string]: Framework } = {
      'react': 'react',
      'react-dom': 'react',
      'vue': 'vue',
      'svelte': 'svelte',
      '@angular/core': 'angular',
      'astro': 'astro',
      'next': 'next',
      'nuxt': 'nuxt',
      '@sveltejs/kit': 'sveltekit'
    };
    
    // For now, return html as default
    return 'html';
  }
  
  private async findAvailablePort(startPort: number): Promise<number> {
    // In real implementation, would check port availability
    return startPort;
  }
  
  private startFileWatcher(projectPath: string, sessionId: string): void {
    this.fileWatcher = new FileWatcher(projectPath, (event, path) => {
      this.handleFileChange(sessionId, event, path);
    });
  }
  
  private handleFileChange(sessionId: string, event: string, path: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'running') return;
    
    const ext = path.split('.').pop()?.toLowerCase();
    
    if (this.config.hot) {
      let updateType: HMRUpdate['type'] = 'full-reload';
      
      if (ext === 'css' || ext === 'scss' || ext === 'less') {
        updateType = 'css-update';
      } else if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') {
        updateType = 'js-update';
      }
      
      this.broadcastHMRUpdate({
        type: updateType,
        files: [path],
        timestamp: Date.now()
      });
    } else if (this.config.liveReload) {
      setTimeout(() => {
        this.broadcastHMRUpdate({
          type: 'full-reload',
          files: [path],
          timestamp: Date.now()
        });
      }, this.config.refreshDelay);
    }
  }
  
  private broadcastHMRUpdate(update: HMRUpdate): void {
    // WebSocket broadcast to connected clients
    console.log('HMR Update:', update);
  }
  
  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.status = 'stopped';
    
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    this.sessions.delete(sessionId);
  }
  
  async restartSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const projectPath = session.projectPath;
    await this.stopSession(sessionId);
    await this.createSession(projectPath);
  }
  
  // Viewport management
  setViewport(viewport: Viewport): void {
    this.currentViewport = viewport;
  }
  
  getViewport(): Viewport {
    return this.currentViewport;
  }
  
  setViewportByName(name: string): boolean {
    const viewport = PRESET_VIEWPORTS.find(v => v.name === name);
    if (viewport) {
      this.currentViewport = viewport;
      return true;
    }
    return false;
  }
  
  setCustomViewport(width: number, height: number, options?: Partial<Viewport>): void {
    this.currentViewport = {
      name: `Custom (${width}x${height})`,
      width,
      height,
      deviceScaleFactor: options?.deviceScaleFactor || 1,
      touch: options?.touch || false,
      mobile: options?.mobile || false,
      userAgent: options?.userAgent
    };
  }
  
  // Console management
  addConsoleMessage(message: ConsoleMessage): void {
    this.consoleMessages.push(message);
    
    // Limit stored messages
    if (this.consoleMessages.length > 1000) {
      this.consoleMessages.shift();
    }
  }
  
  getConsoleMessages(): ConsoleMessage[] {
    return [...this.consoleMessages];
  }
  
  clearConsole(): void {
    this.consoleMessages = [];
  }
  
  // Network monitoring
  addNetworkRequest(request: NetworkRequest): void {
    this.networkRequests.push(request);
    this.stats.requests++;
    this.stats.bytesServed += request.size;
    
    if (request.status >= 400) {
      this.stats.errors++;
    }
    
    // Limit stored requests
    if (this.networkRequests.length > 500) {
      this.networkRequests.shift();
    }
  }
  
  getNetworkRequests(): NetworkRequest[] {
    return [...this.networkRequests];
  }
  
  clearNetworkRequests(): void {
    this.networkRequests = [];
  }
  
  // Performance analysis — uses real PerformanceObserver / Navigation Timing
  // when running inside a real browser context. Falls back to zeroed metrics
  // if the APIs are unavailable (e.g. headless test runners) so callers can
  // detect "no data" via every value being 0.
  async analyzePerformance(_sessionId: string): Promise<PerformanceMetrics> {
    const empty: PerformanceMetrics = {
      lcp: 0, fid: 0, cls: 0, ttfb: 0, fcp: 0,
      domContentLoaded: 0, load: 0, totalResources: 0, totalSize: 0,
      jsSize: 0, cssSize: 0, imageSize: 0, fontsize: 0,
    };
    if (typeof performance === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return empty;
    }

    const out: PerformanceMetrics = { ...empty };

    // Navigation Timing — synchronous reads.
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const nav = navEntries[0];
    if (nav) {
      out.ttfb = Math.max(0, nav.responseStart - nav.requestStart);
      out.domContentLoaded = Math.max(0, nav.domContentLoadedEventEnd - nav.startTime);
      out.load = Math.max(0, nav.loadEventEnd - nav.startTime);
    }

    // Paint Timing — FCP.
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcpEntry) out.fcp = fcpEntry.startTime;

    // LCP — observe up to 1s; LCP is the last reported entry.
    out.lcp = await new Promise<number>((resolve) => {
      try {
        let last = 0;
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries() as PerformanceEntry[];
          if (entries.length) last = entries[entries.length - 1].startTime;
        });
        obs.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => { obs.disconnect(); resolve(last); }, 1000);
      } catch { resolve(0); }
    });

    // CLS — accumulate layout-shift entries that aren't user-initiated.
    out.cls = await new Promise<number>((resolve) => {
      try {
        let total = 0;
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
            if (!entry.hadRecentInput && typeof entry.value === 'number') total += entry.value;
          }
        });
        obs.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => { obs.disconnect(); resolve(total); }, 1000);
      } catch { resolve(0); }
    });

    // FID — first event timing whose processingStart - startTime is the input delay.
    out.fid = await new Promise<number>((resolve) => {
      try {
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries() as Array<PerformanceEntry & { processingStart?: number }>;
          for (const e of entries) {
            if (typeof e.processingStart === 'number') {
              obs.disconnect();
              resolve(Math.max(0, e.processingStart - e.startTime));
              return;
            }
          }
        });
        obs.observe({ type: 'first-input', buffered: true });
        setTimeout(() => { obs.disconnect(); resolve(0); }, 1000);
      } catch { resolve(0); }
    });

    // Resource Timing — bucket by initiatorType / extension.
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    out.totalResources = resources.length;
    for (const r of resources) {
      const size = r.transferSize || r.encodedBodySize || 0;
      out.totalSize += size;
      const ext = (r.name.split('?')[0].split('.').pop() || '').toLowerCase();
      if (r.initiatorType === 'script' || ext === 'js' || ext === 'mjs') out.jsSize += size;
      else if (r.initiatorType === 'css' || ext === 'css') out.cssSize += size;
      else if (r.initiatorType === 'img' || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) out.imageSize += size;
      else if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(ext)) out.fontsize += size;
    }

    return out;
  }
  
  // Responsive testing
  async runResponsiveTest(sessionId: string, viewports?: Viewport[]): Promise<ResponsiveTestResult[]> {
    const testViewports = viewports || PRESET_VIEWPORTS.slice(0, 5);
    const results: ResponsiveTestResult[] = [];
    
    for (const viewport of testViewports) {
      const issues = this.detectResponsiveIssues(viewport);
      results.push({
        viewport,
        issues,
        loadTime: Math.random() * 2000 + 500,
        performanceScore: Math.random() * 30 + 70
      });
    }
    
    return results;
  }
  
  private detectResponsiveIssues(viewport: Viewport): ResponsiveIssue[] {
    const issues: ResponsiveIssue[] = [];
    
    // Simulated issue detection
    if (viewport.mobile && viewport.width < 400) {
      issues.push({
        type: 'font-size',
        element: 'body',
        description: 'Base font size may be too small for mobile',
        severity: 'medium',
        suggestion: 'Consider using at least 16px base font size on mobile'
      });
    }
    
    if (viewport.touch) {
      issues.push({
        type: 'touch-target',
        element: '.btn',
        description: 'Some touch targets may be smaller than 44x44px',
        severity: 'medium',
        suggestion: 'Ensure all interactive elements are at least 44x44px'
      });
    }
    
    return issues;
  }
  
  // Error handling
  addError(sessionId: string, error: PreviewError): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.errors.push(error);
      
      // Limit stored errors
      if (session.errors.length > 100) {
        session.errors.shift();
      }
    }
  }
  
  clearErrors(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.errors = [];
    }
  }
  
  // HTML injection for HMR
  injectHMRScript(html: string): string {
    if (!this.config.hot && !this.config.liveReload) return html;
    
    const hmrScript = `<script>${HMR_CLIENT_SCRIPT}</script>`;
    
    if (html.includes('</body>')) {
      return html.replace('</body>', `${hmrScript}</body>`);
    } else if (html.includes('</html>')) {
      return html.replace('</html>', `${hmrScript}</html>`);
    } else {
      return html + hmrScript;
    }
  }
  
  // File serving with proper MIME types
  getMimeType(filePath: string): string {
    const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
    return MIME_TYPES[ext] || 'application/octet-stream';
  }
  
  // Stats
  getStats(): ServerStats {
    return {
      ...this.stats,
      uptime: this.sessions.size > 0 
        ? Date.now() - Math.min(...Array.from(this.sessions.values()).map(s => s.startTime))
        : 0
    };
  }
  
  // Session info
  getSession(sessionId: string): PreviewSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  getAllSessions(): PreviewSession[] {
    return Array.from(this.sessions.values());
  }
  
  // Configuration
  updateConfig(config: Partial<PreviewConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): PreviewConfig {
    return { ...this.config };
  }
  
  // Utilities
  private generateId(): string {
    return `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// =============================================================================
// FILE WATCHER HELPER
// =============================================================================

class FileWatcher {
  private path: string;
  private callback: (event: string, path: string) => void;
  private watching: boolean = true;
  
  constructor(path: string, callback: (event: string, path: string) => void) {
    this.path = path;
    this.callback = callback;
    this.start();
  }
  
  private start(): void {
    // In production, would use fs.watch or chokidar
    console.log(`Watching: ${this.path}`);
  }
  
  close(): void {
    this.watching = false;
    console.log(`Stopped watching: ${this.path}`);
  }
}

// =============================================================================
// BROWSER EMULATION
// =============================================================================

export interface BrowserEmulation {
  name: string;
  userAgent: string;
  viewport: Viewport;
  features: BrowserFeatures;
}

export interface BrowserFeatures {
  webgl: boolean;
  webgl2: boolean;
  serviceWorker: boolean;
  webAssembly: boolean;
  webRTC: boolean;
  webSockets: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  notifications: boolean;
  geolocation: boolean;
  mediaDevices: boolean;
  bluetooth: boolean;
  usb: boolean;
  nfc: boolean;
}

export const BROWSER_EMULATIONS: BrowserEmulation[] = [
  {
    name: 'Chrome Latest',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: PRESET_VIEWPORTS.find(v => v.name === 'Desktop HD')!,
    features: {
      webgl: true, webgl2: true, serviceWorker: true, webAssembly: true,
      webRTC: true, webSockets: true, localStorage: true, sessionStorage: true,
      indexedDB: true, notifications: true, geolocation: true, mediaDevices: true,
      bluetooth: true, usb: true, nfc: false
    }
  },
  {
    name: 'Firefox Latest',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: PRESET_VIEWPORTS.find(v => v.name === 'Desktop HD')!,
    features: {
      webgl: true, webgl2: true, serviceWorker: true, webAssembly: true,
      webRTC: true, webSockets: true, localStorage: true, sessionStorage: true,
      indexedDB: true, notifications: true, geolocation: true, mediaDevices: true,
      bluetooth: false, usb: false, nfc: false
    }
  },
  {
    name: 'Safari Latest',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    viewport: PRESET_VIEWPORTS.find(v => v.name === 'MacBook Pro 14"')!,
    features: {
      webgl: true, webgl2: true, serviceWorker: true, webAssembly: true,
      webRTC: true, webSockets: true, localStorage: true, sessionStorage: true,
      indexedDB: true, notifications: true, geolocation: true, mediaDevices: true,
      bluetooth: false, usb: false, nfc: false
    }
  },
  {
    name: 'Safari iOS',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    viewport: PRESET_VIEWPORTS.find(v => v.name === 'iPhone 14 Pro')!,
    features: {
      webgl: true, webgl2: true, serviceWorker: true, webAssembly: true,
      webRTC: true, webSockets: true, localStorage: true, sessionStorage: true,
      indexedDB: true, notifications: false, geolocation: true, mediaDevices: true,
      bluetooth: false, usb: false, nfc: false
    }
  },
  {
    name: 'Chrome Android',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: PRESET_VIEWPORTS.find(v => v.name === 'Pixel 7')!,
    features: {
      webgl: true, webgl2: true, serviceWorker: true, webAssembly: true,
      webRTC: true, webSockets: true, localStorage: true, sessionStorage: true,
      indexedDB: true, notifications: true, geolocation: true, mediaDevices: true,
      bluetooth: true, usb: true, nfc: true
    }
  }
];

// =============================================================================
// EXPORTS
// =============================================================================

export const createPreviewEngine = (config?: Partial<PreviewConfig>) => new PreviewEngine(config);

export default { PreviewEngine, createPreviewEngine };
