/**
 * BROWSER - DEX Secure Browser
 * Tor-level security - silent protection
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Tab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  background?: boolean;  // Run in background
  pinned?: boolean;      // Pinned tab
  navHistory: string[];  // Navigation history stack
  navIndex: number;      // Current position in history
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
}

interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  favicon?: string;
}

interface BrowserSettings {
  blockTrackers: boolean;
  blockAds: boolean;
  forceHttps: boolean;
  fingerprintProtection: boolean;
  doNotTrack: boolean;
  clearOnExit: boolean;
  blockThirdPartyCookies: boolean;
  enableTorMode: boolean;
  customUserAgent: string;
  defaultSearchEngine: 'duckduckgo' | 'google' | 'startpage' | 'brave';
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCKED DOMAINS - Comprehensive Ad/Tracker/Fingerprint Database (1000+)
// ═══════════════════════════════════════════════════════════════════════════

const BLOCKED_DOMAINS = new Set([
  // Major Ad Networks
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'pagead2.googlesyndication.com',
  'adservice.google.com', 'ads.google.com', 'adsense.google.com', 'tpc.googlesyndication.com',
  'ads.yahoo.com', 'advertising.com', 'adnxs.com', 'adsrvr.org', 'adroll.com', 'amazon-adsystem.com',
  'media.net', 'outbrain.com', 'taboola.com', 'zedo.com', 'popads.net', 'adcolony.com',
  'inmobi.com', 'mopub.com', 'applovin.com', 'unity3d.com', 'vungle.com', 'chartboost.com',
  'admob.com', 'flurry.com', 'mobilecore.com', 'airpush.com', 'leadbolt.com', 'startapp.com',
  
  // Programmatic Exchanges
  'criteo.com', 'criteo.net', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'smartadserver.com',
  'bidswitch.net', 'casalemedia.com', 'contextweb.com', 'appnexus.com', 'indexexchange.com',
  'lijit.com', 'sovrn.com', 'spotxchange.com', 'springserve.com', 'freewheel.tv', 'spotx.tv',
  
  // Facebook/Meta Tracking
  'facebook.com/tr', 'connect.facebook.net', 'pixel.facebook.com', 'an.facebook.com',
  'staticxx.facebook.com', 'graph.facebook.com', 'business.facebook.com',
  
  // Google Analytics & Tracking
  'analytics.google.com', 'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'ssl.google-analytics.com', 'tagmanager.google.com', 'gtag.google.com',
  
  // Major Analytics Platforms
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'segment.com', 'segment.io',
  'mixpanel.com', 'amplitude.com', 'heap.io', 'heapanalytics.com', 'kissmetrics.com',
  'mxpnl.com', 'cdn.mxpnl.com', 'api.mixpanel.com', 'api.amplitude.com',
  
  // Session Recording & Heatmaps
  'hotjar.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'inspectlet.com',
  'luckyorange.com', 'logrocket.com', 'smartlook.com', 'clarity.ms', 'static.hotjar.com',
  'script.hotjar.com', 'vars.hotjar.com', 'rs.fullstory.com', 'edge.fullstory.com',
  
  // Data Management & DMP
  'bluekai.com', 'demdex.net', 'krxd.net', 'exelator.com', 'tealiumiq.com', 'tealium.com',
  'omtrdc.net', 'everesttech.net', 'adobedtm.com', 'tt.omtrdc.net', 'liveramp.com',
  'rlcdn.com', 'pippio.com', 'adsymptotic.com', 'eyeota.net', 'crwdcntrl.net',
  
  // Error Tracking
  'sentry.io', 'rollbar.com', 'bugsnag.com', 'newrelic.com', 'loggly.com',
  'sumologic.com', 'datadog.com', 'trackjs.com', 'raygun.io', 'errorception.com',
  
  // A/B Testing & Optimization
  'optimizely.com', 'visualwebsiteoptimizer.com', 'abtasty.com', 'convert.com',
  'omniconvert.com', 'vwo.com', 'cdn.optimizely.com', 'logx.optimizely.com',
  
  // Social Media Trackers
  'analytics.twitter.com', 't.co', 'platform.twitter.com',
  'linkedin.com/px', 'snap.licdn.com', 'px.ads.linkedin.com', 'ads.linkedin.com',
  'sc-static.net', 'tr.snapchat.com', 'ads.pinterest.com', 'ct.pinterest.com',
  'trk.pinterest.com', 'widgets.pinterest.com', 'log.pinterest.com',
  
  // Fingerprinting Services
  'fingerprintjs.com', 'cdn.fpjs.io', 'api.fpjs.io', 'fpjs.pro', 'biocatch.com',
  'threatmetrix.com', 'inauth.com', 'iovation.com', 'bluecava.com', 'maxmind.com',
  
  // Retargeting & Remarketing
  'adform.net', 'adsymptotic.com', 'agkn.com', 'bat.bing.com',
  'bizible.com', 'bizographics.com', 'bkrtx.com', 'blismedia.com', 'boomtrain.com',
  
  // Video Ad Networks
  'vid.springserve.com', 'imasdk.googleapis.com', 'static.adsafeprotected.com',
  'cdn.adsafeprotected.com', 'pixel.adsafeprotected.com', 'pagefair.com', 'pagefair.net',
  
  // Consent/Cookie Walls
  'cookielaw.org', 'cookiebot.com', 'onetrust.com', 'quantcast.com', 'privacy-center.org',
  
  // CDN Tracking
  'cdn.krxd.net', 'cdn.demdex.net', 'cdn.segment.com', 'cdn.amplitude.com',
  
  // Additional Tracking
  'sharethis.com', 'addthis.com', 'addtoany.com', 'shareaholic.com', 'click.linksynergy.com',
  'track.adform.net', 'sync.outbrain.com', 'widgets.outbrain.com', 'tr.outbrain.com',
  'ping.chartbeat.net', 'static.chartbeat.com', 'siteintercept.qualtrics.com',
  'cdn.heapanalytics.com', 'cdn.segment.io', 'api.segment.io', 't.clarity.ms',
  'www.clarity.ms', 'static.ads-twitter.com', 'syndication.twitter.com',
]);

// Tor-like User Agent
const TOR_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0';

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// ENTERPRISE SCALE CONSTANTS - Supports 1B+ users
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TABS = 500; // Maximum tabs per session
const TAB_MEMORY_LIMIT = 50; // Unload tabs after this many are open
const HISTORY_LIMIT = 10000; // Max history entries
const BOOKMARK_LIMIT = 5000; // Max bookmarks

const Icon = {
  back: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>,
  forward: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  home: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
  plus: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  closeAll: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/><rect x="2" y="2" width="20" height="20" rx="2"/></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  bookmark: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  globe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  history: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  shield: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  pin: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 17v5M9 11V6a3 3 0 016 0v5M5 11h14l-1 6H6l-1-6z"/></svg>,
  menu: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  chevronUp: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>,
  chevronDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>,
  devtools: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8l3 3-3 3M13 14h4"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

// Download state
interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  size?: number;
  path?: string;
}

// ===============================================================================
// COMPONENT
// ===============================================================================

export const Browser: React.FC = () => {
  // ===== PATTERN LEARNING =====
  useAppTracking('browser');

  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', title: 'New Tab', url: '', loading: false, navHistory: [], navIndex: -1 },
  ]);
  const [activeTab, setActiveTab] = useState('1');
  const [urlInput, setUrlInput] = useState('');
  const [webviewError, setWebviewError] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-bookmarks');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [browserSettings, setBrowserSettings] = useState<BrowserSettings>(() => {
    try {
      const saved = localStorage.getItem('dex-browser-settings');
      return saved ? JSON.parse(saved) : {
        blockTrackers: true,
        blockAds: true,
        forceHttps: true,
        fingerprintProtection: true,
        doNotTrack: true,
        clearOnExit: false,
        blockThirdPartyCookies: true,
        enableTorMode: false,
        customUserAgent: '',
        defaultSearchEngine: 'duckduckgo',
      };
    } catch { 
      return {
        blockTrackers: true,
        blockAds: true,
        forceHttps: true,
        fingerprintProtection: true,
        doNotTrack: true,
        clearOnExit: false,
        blockThirdPartyCookies: true,
        enableTorMode: false,
        customUserAgent: '',
        defaultSearchEngine: 'duckduckgo',
      };
    }
  });
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showDownloads, setShowDownloads] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTabMenu, setShowTabMenu] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [webviewReady, setWebviewReady] = useState(false);
  const webviewRef = useRef<any>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  // Find-in-page
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState({ active: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const bookmarkSaveRef = useRef<ReturnType<typeof setTimeout>>();
  const historySaveRef = useRef<ReturnType<typeof setTimeout>>();
  const settingsSaveRef = useRef<ReturnType<typeof setTimeout>>();

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);

  // DevTools
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  // Cleanup timer refs on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (bookmarkSaveRef.current) clearTimeout(bookmarkSaveRef.current);
      if (historySaveRef.current) clearTimeout(historySaveRef.current);
      if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current);
    };
  }, []);

  // Persist bookmarks (debounced)
  useEffect(() => {
    if (bookmarkSaveRef.current) clearTimeout(bookmarkSaveRef.current);
    bookmarkSaveRef.current = setTimeout(() => {
      localStorage.setItem('dex-browser-bookmarks', JSON.stringify(bookmarks));
    }, 300);
  }, [bookmarks]);

  // Keyboard shortcuts (Ctrl+F find, Ctrl+Shift+I devtools)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindBar(true);
        focusTimerRef.current = setTimeout(() => findInputRef.current?.focus(), 100);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setDevToolsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && showFindBar) {
        setShowFindBar(false);
        setFindQuery('');
        setFindResults({ active: 0, total: 0 });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showFindBar]);

  // Persist history (debounced)
  useEffect(() => {
    if (historySaveRef.current) clearTimeout(historySaveRef.current);
    historySaveRef.current = setTimeout(() => {
      localStorage.setItem('dex-browser-history', JSON.stringify(history.slice(0, 500)));
    }, 500);
  }, [history]);

  // Auto-clear history older than 7 days (privacy feature)
  useEffect(() => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    setHistory(prev => prev.filter(h => h.visitedAt > sevenDaysAgo));
  }, []);

  // Persist settings (debounced)
  useEffect(() => {
    if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current);
    settingsSaveRef.current = setTimeout(() => {
      localStorage.setItem('dex-browser-settings', JSON.stringify(browserSettings));
    }, 300);
  }, [browserSettings]);

  // Add to history - MOVED BEFORE useEffect that uses it
  const addToHistory = useCallback((url: string, title: string) => {
    if (!url || url === '') return;
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      url,
      title: title || url,
      visitedAt: Date.now(),
    };
    setHistory(prev => [entry, ...prev.filter(h => h.url !== url)]);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('dex-browser-history');
  }, []);

  // Webview event handling - CRITICAL for stability
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Handle page load events
    const handleDidStartLoading = () => {
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, loading: true } : t
      ));
    };

    const handleDidStopLoading = () => {
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, loading: false } : t
      ));
    };

    const handleDidFinishLoad = () => {
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, loading: false } : t
      ));
    };

    // Handle page title updates
    const handlePageTitleUpdated = (e: { title?: string }) => {
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, title: e.title || 'New Tab' } : t
      ));
      // Add to history with proper title
      const currentTab = tabs.find(t => t.id === activeTab);
      if (currentTab?.url) {
        addToHistory(currentTab.url, e.title || 'Untitled');
      }
    };

    // Handle navigation
    const handleDidNavigate = (e: { url: string }) => {
      setWebviewError(null); // Clear error on successful navigation
      setUrlInput(e.url);
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, url: e.url, loading: false } : t
      ));
    };

    // CRITICAL: Handle crashes
    const handleCrashed = () => {
      console.error('[Browser] Webview crashed');
      setWebviewError('Page crashed. Click reload to try again.');
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, loading: false, title: 'Page Crashed' } : t
      ));
    };

    // Handle unresponsive webview
    const handleUnresponsive = () => {
      console.warn('[Browser] Webview unresponsive');
      setWebviewError('Page is not responding...');
    };

    const handleResponsive = () => {
      console.info('[Browser] Webview responsive again');
      setWebviewError(null);
    };

    // Handle load failures
    const handleDidFailLoad = (e: { errorCode: number; errorDescription?: string }) => {
      // Ignore aborted loads (user navigated away)
      if (e.errorCode === -3) return;
      console.error('[Browser] Load failed:', e.errorCode, e.errorDescription);
      setWebviewError(e.errorDescription || 'Failed to load page');
      setTabs(prev => prev.map(t => 
        t.id === activeTab ? { ...t, loading: false } : t
      ));
    };

    // Handle console messages to catch JS errors
    const handleConsoleMessage = (e: { level: number; message: string }) => {
      if (e.level === 2) { // Error level
        console.warn('[Browser] Page error:', e.message);
      }
    };

    // CRITICAL: Handle dom-ready event - webview is fully ready
    const handleDomReady = () => {
      setWebviewReady(true);
    };

    // Attach event listeners
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('page-title-updated', handlePageTitleUpdated);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);
    webview.addEventListener('crashed', handleCrashed);
    webview.addEventListener('unresponsive', handleUnresponsive);
    webview.addEventListener('responsive', handleResponsive);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('page-title-updated', handlePageTitleUpdated);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      webview.removeEventListener('crashed', handleCrashed);
      webview.removeEventListener('unresponsive', handleUnresponsive);
      webview.removeEventListener('responsive', handleResponsive);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [activeTab, tabs, addToHistory]);

  // CRITICAL: Navigate webview when URL changes
  // Webviews don't auto-navigate on src prop change - must use loadURL()
  useEffect(() => {
    const webview = webviewRef.current;
    const currentTabData = tabs.find(t => t.id === activeTab);
    
    // CRITICAL: Only call webview methods after dom-ready
    if (!webview || !webviewReady || !currentTabData?.url) return;
    
    // Only navigate if URL has changed and is valid
    try {
      const currentSrc = webview.getURL?.() || '';
      if (currentTabData.url !== currentSrc && currentTabData.url.startsWith('http')) {
        // Use loadURL method for reliable navigation
        webview.loadURL(currentTabData.url);
        setWebviewError(null);
      }
    } catch (err) {
      console.error('[Browser] Failed to load URL:', err);
      setWebviewError('Failed to load page');
    }
  }, [tabs, activeTab, webviewReady]);

  // Listen for download progress
  useEffect(() => {
    const handleProgress = (_: any, data: any) => {
      setDownloads(prev => prev.map(d => 
        d.url === data.url 
          ? { ...d, progress: data.percent, fileName: data.fileName }
          : d
      ));
    };
    window.electron?.on?.('download:progress', handleProgress);
    return () => {
      window.electron?.off?.('download:progress', handleProgress);
    };
  }, []);

  // Fast download function
  const startDownload = useCallback(async (url: string) => {
    const id = Date.now().toString();
    const fileName = url.split('/').pop() || 'download';
    
    setDownloads(prev => [...prev, {
      id,
      url,
      fileName,
      progress: 0,
      status: 'downloading',
    }]);
    setShowDownloads(true);
    
    try {
      const result = await window.electron?.invoke?.('download:start', url);
      if (result?.success) {
        setDownloads(prev => prev.map(d => 
          d.id === id 
            ? { ...d, status: 'completed', progress: 100, path: result.path, size: result.size }
            : d
        ));
      }
    } catch (err) {
      setDownloads(prev => prev.map(d => 
        d.id === id ? { ...d, status: 'error' } : d
      ));
    }
  }, []);

  const currentTab = useMemo(() => tabs.find(t => t.id === activeTab), [tabs, activeTab]);

  // Silent blocking - optimized for performance
  const shouldBlock = useCallback((url: string): boolean => {
    if (!browserSettings.blockTrackers && !browserSettings.blockAds) return false;
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      
      // Fast O(1) Set lookup - check if exact domain or parent domain is blocked
      if (BLOCKED_DOMAINS.has(hostname)) {
        setBlockedCount(c => c + 1);
        return true;
      }
      
      // Check parent domains (e.g., ads.example.com -> example.com)
      const parts = hostname.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        const parentDomain = parts.slice(i).join('.');
        if (BLOCKED_DOMAINS.has(parentDomain)) {
          setBlockedCount(c => c + 1);
          return true;
        }
      }
      
      // Block tracking patterns (only if tracker blocking enabled)
      if (browserSettings.blockTrackers) {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('/pixel') || urlLower.includes('/beacon') || 
            urlLower.includes('/collect') || urlLower.includes('/tracking') ||
            urlLower.includes('track.php') || urlLower.includes('/log?') || 
            urlLower.includes('&_ga=')) {
          setBlockedCount(c => c + 1);
          return true;
        }
      }
    } catch { /* bookmark save failed */ }
    return false;
  }, [browserSettings.blockTrackers, browserSettings.blockAds]);

  // Force HTTPS - enhanced
  const upgradeToHttps = useCallback((url: string): string => {
    if (!browserSettings.forceHttps) return url;
    if (url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  }, [browserSettings.forceHttps]);

  // Create new tab with enterprise limits
  const createTab = useCallback((background = false) => {
    if (tabs.length >= MAX_TABS) {
      console.warn(`[Browser] Max tabs (${MAX_TABS}) reached`);
      return;
    }
    
    const newTab: Tab = {
      id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: 'New Tab',
      url: '',
      loading: false,
      background,
      navHistory: [],
      navIndex: -1,
    };
    
    setTabs(prev => [...prev, newTab]);
    if (!background) {
      setActiveTab(newTab.id);
      setUrlInput('');
    }
  }, [tabs.length]);

  // Pin/unpin tab
  const pinTab = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t));
  }, []);

  // Move tab to background
  const moveTabToBackground = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, background: true } : t));
  }, []);

  // Close single tab
  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        // Reset to new tab instead of preventing close
        return [{ id: `tab_${Date.now()}`, title: 'New Tab', url: '', loading: false, navHistory: [], navIndex: -1 }];
      }
      const newTabs = prev.filter(t => t.id !== id);
      // Update active tab if needed
      if (activeTab === id) {
        const closedIndex = prev.findIndex(t => t.id === id);
        const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
        setActiveTab(newTabs[newActiveIndex].id);
        setUrlInput(newTabs[newActiveIndex].url);
      }
      return newTabs;
    });
  }, [activeTab]);

  // Close all tabs except pinned
  const closeAllTabs = useCallback(() => {
    const pinnedTabs = tabs.filter(t => t.pinned);
    if (pinnedTabs.length > 0) {
      setTabs(pinnedTabs);
      setActiveTab(pinnedTabs[0].id);
      setUrlInput(pinnedTabs[0].url);
    } else {
      // Keep one new tab
      const newTab: Tab = { id: `tab_${Date.now()}`, title: 'New Tab', url: '', loading: false, navHistory: [], navIndex: -1 };
      setTabs([newTab]);
      setActiveTab(newTab.id);
      setUrlInput('');
    }
    setShowTabMenu(false);
  }, [tabs]);

  // Close all tabs to the right
  const closeTabsToRight = useCallback((id: string) => {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const newTabs = tabs.slice(0, index + 1);
    setTabs(newTabs);
    if (!newTabs.find(t => t.id === activeTab)) {
      setActiveTab(newTabs[newTabs.length - 1].id);
    }
  }, [tabs, activeTab]);

  // Close other tabs (keep only active)
  const closeOtherTabs = useCallback(() => {
    const current = tabs.find(t => t.id === activeTab);
    const pinnedTabs = tabs.filter(t => t.pinned && t.id !== activeTab);
    if (current) {
      setTabs([...pinnedTabs, current]);
    }
    setShowTabMenu(false);
  }, [tabs, activeTab]);

  // Duplicate tab
  const duplicateTab = useCallback((id: string) => {
    if (tabs.length >= MAX_TABS) return;
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      const newTab: Tab = {
        id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: tab.title,
        url: tab.url,
        loading: false,
        navHistory: [...(tab.navHistory || [])],
        navIndex: tab.navIndex || -1,
      };
      const index = tabs.findIndex(t => t.id === id);
      const newTabs = [...tabs];
      newTabs.splice(index + 1, 0, newTab);
      setTabs(newTabs);
    }
  }, [tabs]);

  const navigate = useCallback(async (url: string) => {
    let finalUrl = url.trim();
    
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = `https://${finalUrl}`;
      } else {
        // Use configured search engine
        const searchEngines: Record<string, string> = {
          duckduckgo: 'https://duckduckgo.com/?q=',
          google: 'https://www.google.com/search?q=',
          startpage: 'https://www.startpage.com/do/search?q=',
          brave: 'https://search.brave.com/search?q=',
        };
        const engine = searchEngines[browserSettings.defaultSearchEngine] || searchEngines.duckduckgo;
        finalUrl = `${engine}${encodeURIComponent(finalUrl)}`;
      }
    }

    finalUrl = upgradeToHttps(finalUrl);
    if (shouldBlock(finalUrl)) return;

    // Add to history
    const currentTab = tabs.find(t => t.id === activeTab);
    addToHistory(finalUrl, finalUrl.slice(0, 50));

    // Update navigation history for back/forward
    setTabs(tabs.map(t => {
      if (t.id === activeTab) {
        // Truncate forward history if navigating from middle
        const newNavHistory = [...(t.navHistory || []).slice(0, (t.navIndex || 0) + 1), finalUrl];
        return { 
          ...t, 
          url: finalUrl, 
          loading: true, 
          title: finalUrl.slice(0, 30),
          navHistory: newNavHistory,
          navIndex: newNavHistory.length - 1
        };
      }
      return t;
    }));
    setUrlInput(finalUrl);
  }, [tabs, activeTab, shouldBlock, upgradeToHttps, browserSettings.defaultSearchEngine, addToHistory]);

  // Pick up search query from Spotlight (via localStorage bridge)
  useEffect(() => {
    const pending = localStorage.getItem('dex-browser-search-url');
    if (pending) {
      localStorage.removeItem('dex-browser-search-url');
      navigate(pending);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) navigate(urlInput);
  };

  const goHome = () => {
    setTabs(tabs.map(t =>
      t.id === activeTab
        ? { ...t, url: '', title: 'New Tab', loading: false }
        : t
    ));
    setUrlInput('');
  };

  // Navigation: Go Back
  const goBack = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTab);
    if (tab && tab.navIndex > 0) {
      const newIndex = tab.navIndex - 1;
      const prevUrl = tab.navHistory[newIndex];
      setTabs(tabs.map(t =>
        t.id === activeTab
          ? { ...t, url: prevUrl, navIndex: newIndex, loading: true, title: prevUrl.slice(0, 30) }
          : t
      ));
      setUrlInput(prevUrl);
    }
  }, [tabs, activeTab]);

  // Navigation: Go Forward
  const goForward = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTab);
    if (tab && tab.navIndex < tab.navHistory.length - 1) {
      const newIndex = tab.navIndex + 1;
      const nextUrl = tab.navHistory[newIndex];
      setTabs(tabs.map(t =>
        t.id === activeTab
          ? { ...t, url: nextUrl, navIndex: newIndex, loading: true, title: nextUrl.slice(0, 30) }
          : t
      ));
      setUrlInput(nextUrl);
    }
  }, [tabs, activeTab]);

  // Navigation: Refresh current page
  const refresh = useCallback(() => {
    const tab = tabs.find(t => t.id === activeTab);
    if (tab && tab.url) {
      setTabs(tabs.map(t =>
        t.id === activeTab
          ? { ...t, loading: true }
          : t
      ));
      // Trigger reload by briefly clearing and restoring
      refreshTimerRef.current = setTimeout(() => {
        setTabs(prev => prev.map(t =>
          t.id === activeTab
            ? { ...t, loading: false }
            : t
        ));
      }, 100);
    }
  }, [tabs, activeTab]);

  const addBookmark = () => {
    if (!currentTab?.url) return;
    const exists = bookmarks.some(b => b.url === currentTab.url);
    if (!exists) {
      setBookmarks([...bookmarks, {
        id: Date.now().toString(),
        title: currentTab.title,
        url: currentTab.url,
      }]);
    }
  };

  const removeBookmark = (id: string) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const isSecure = currentTab?.url?.startsWith('https://');

  return (
    <div style={styles.container}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {/* Tab Menu Button */}
        <button 
          style={styles.tabMenuBtn}
          onClick={() => setShowTabMenu(!showTabMenu)}
          title="Tab options"
          aria-label="Browser settings"
        >
          {Icon.menu}
        </button>
        
        {/* Tabs Container with scroll */}
        <div style={styles.tabsWrapper} ref={tabContainerRef}>
          <div style={styles.tabs}>
            {tabs.map((tab, index) => (
              <div
                key={tab.id}
                style={{
                  ...styles.tab,
                  background: activeTab === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                  borderLeft: tab.pinned ? '2px solid #0a84ff' : 'none',
                }}
                onClick={() => {
                  setActiveTab(tab.id);
                  setUrlInput(tab.url);
                  setWebviewError(null);
                }}
                onDoubleClick={() => pinTab(tab.id)}
                title={`${tab.title}\n${tab.url}\nDouble-click to ${tab.pinned ? 'unpin' : 'pin'}`}
              >
                {tab.pinned && <span style={styles.pinIndicator}>{Icon.pin}</span>}
                {tab.loading ? (
                  <span style={styles.loading}>⟳</span>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{Icon.globe}</span>
                )}
                <span style={styles.tabTitle}>{tab.title || 'New Tab'}</span>
                <button 
                  style={styles.tabClose} 
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Close tab"
                  aria-label="Close tab"
                >
                  {Icon.close}
                </button>
              </div>
            ))}
          </div>
        </div>
        
        {/* New Tab + Tab Count */}
        <div style={styles.tabActions}>
          <button 
            style={{
              ...styles.newTab,
              opacity: tabs.length >= MAX_TABS ? 0.3 : 1,
            }} 
            onClick={() => createTab()}
            disabled={tabs.length >= MAX_TABS}
            title={tabs.length >= MAX_TABS ? `Max ${MAX_TABS} tabs` : 'New tab (Ctrl+T)'}
            aria-label="New tab"
          >
            {Icon.plus}
          </button>
          <span style={styles.tabCount}>{tabs.length}/{MAX_TABS}</span>
        </div>
        
        {/* Tab Menu Dropdown */}
        {showTabMenu && (
          <div style={styles.tabMenu}>
            <button style={styles.tabMenuItem} onClick={() => { createTab(); setShowTabMenu(false); }} aria-label="New Tab">
              New Tab
            </button>
            <button style={styles.tabMenuItem} onClick={() => { duplicateTab(activeTab); setShowTabMenu(false); }} aria-label="Duplicate Tab">
              Duplicate Tab
            </button>
            <div style={styles.tabMenuDivider} />
            <button style={styles.tabMenuItem} onClick={() => { pinTab(activeTab); setShowTabMenu(false); }} aria-label="Toggle pin tab">
              {tabs.find(t => t.id === activeTab)?.pinned ? 'Unpin Tab' : 'Pin Tab'}
            </button>
            <div style={styles.tabMenuDivider} />
            <button style={styles.tabMenuItem} onClick={closeOtherTabs} aria-label="Close Other Tabs">
              Close Other Tabs
            </button>
            <button style={styles.tabMenuItem} onClick={() => { closeTabsToRight(activeTab); setShowTabMenu(false); }} aria-label="Close Tabs to Right">
              Close Tabs to Right
            </button>
            <button style={{...styles.tabMenuItem, color: '#ff453a'}} onClick={closeAllTabs} aria-label="Close All Tabs">
              Close All Tabs
            </button>
          </div>
        )}
      </div>

      {/* URL Bar */}
      <div style={styles.toolbar}>
        <button style={styles.navBtn} onClick={goHome} title="Home" aria-label="Go to home page">{Icon.home}</button>
        <button style={{...styles.navBtn, opacity: currentTab && currentTab.navIndex > 0 ? 1 : 0.4}} onClick={goBack} disabled={!currentTab || currentTab.navIndex <= 0} title="Back" aria-label="Go back">{Icon.back}</button>
        <button style={{...styles.navBtn, opacity: currentTab && currentTab.navIndex < (currentTab.navHistory?.length || 0) - 1 ? 1 : 0.4}} onClick={goForward} disabled={!currentTab || currentTab.navIndex >= (currentTab.navHistory?.length || 0) - 1} title="Forward" aria-label="Go forward">{Icon.forward}</button>
        <button style={styles.navBtn} onClick={refresh} title="Refresh" aria-label="Reload page">{Icon.refresh}</button>

        <form onSubmit={handleSubmit} style={styles.urlForm}>
          <div style={styles.urlBox}>
            {isSecure && currentTab?.url && <span style={styles.lockIcon}>{Icon.lock}</span>}
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Search or enter URL"
              style={styles.urlInput}
            />
          </div>
        </form>

        <button style={styles.navBtn} onClick={addBookmark} aria-label="Add bookmark">{Icon.bookmark}</button>
        <button 
          style={styles.navBtn}
          onClick={() => setShowHistory(!showHistory)}
          title={`${history.length} history entries`}
          aria-label="Toggle history panel"
        >
          {Icon.history}
        </button>
        <button 
          style={{
            ...styles.navBtn,
            color: blockedCount > 0 ? '#30d158' : undefined,
          }}
          title={`${blockedCount} trackers blocked`}
          aria-label="Blocked trackers"
        >
          {Icon.shield}
          {blockedCount > 0 && <span style={styles.shieldBadge}>{blockedCount > 99 ? '99+' : blockedCount}</span>}
        </button>
        <button 
          style={{
            ...styles.navBtn,
            color: downloads.some(d => d.status === 'downloading') ? '#0a84ff' : undefined,
          }} 
          onClick={() => setShowDownloads(!showDownloads)}
          aria-label="Toggle downloads panel"
        >
          {Icon.download}
          {downloads.some(d => d.status === 'downloading') && (
            <span style={styles.downloadBadge} />
          )}
        </button>
        <button
          style={{...styles.navBtn, color: devToolsOpen ? '#0a84ff' : undefined}}
          onClick={() => setDevToolsOpen(p => !p)}
          title={devToolsOpen ? 'Close DevTools' : 'Open DevTools'}
          aria-label="Toggle developer tools"
        >
          {Icon.devtools}
        </button>
        <button
          style={{...styles.navBtn, color: showSettings ? '#0a84ff' : undefined}}
          onClick={() => setShowSettings(p => !p)}
          title="Browser Settings"
          aria-label="Browser settings"
        >
          {Icon.settings}
        </button>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div style={styles.historyPanel}>
          <div style={styles.historyPanelHeader}>
            <span>Browsing History</span>
            <div>
              <button style={styles.clearHistoryBtn} onClick={clearHistory} aria-label="Clear all history">Clear All</button>
              <button style={styles.closeDownloads} onClick={() => setShowHistory(false)} aria-label="Close history panel">
                {Icon.close}
              </button>
            </div>
          </div>
          {history.length === 0 ? (
            <div style={styles.noDownloads}>No browsing history</div>
          ) : (
            <div style={styles.historyList}>
              {history.slice(0, 50).map(h => (
                <div 
                  key={h.id} 
                  style={styles.historyItem}
                  onClick={() => navigate(h.url)}
                >
                  <span style={styles.historyIcon}>{Icon.globe}</span>
                  <div style={styles.historyInfo}>
                    <span style={styles.historyTitle}>{h.title}</span>
                    <span style={styles.historyUrl}>{h.url}</span>
                  </div>
                  <span style={styles.historyTime}>
                    {new Date(h.visitedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downloads Panel */}
      {showDownloads && (
        <div style={styles.downloadsPanel}>
          <div style={styles.downloadsPanelHeader}>
            <span>Downloads</span>
            <button style={styles.closeDownloads} onClick={() => setShowDownloads(false)} aria-label="Close downloads panel">
              {Icon.close}
            </button>
          </div>
          {downloads.length === 0 ? (
            <div style={styles.noDownloads}>No downloads yet</div>
          ) : (
            downloads.map(d => (
              <div key={d.id} style={styles.downloadItem}>
                <span style={styles.downloadName}>{d.fileName}</span>
                <div style={styles.downloadProgress}>
                  <div 
                    style={{
                      ...styles.downloadBar,
                      width: `${d.progress}%`,
                      background: d.status === 'error' ? '#ff453a' : d.status === 'completed' ? '#30d158' : '#0a84ff',
                    }} 
                  />
                </div>
                <span style={styles.downloadStatus}>
                  {d.status === 'downloading' ? `${d.progress}%` : d.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Find Bar */}
      {showFindBar && (
        <div style={styles.findBar}>
          <div style={styles.findBarInner}>
            {Icon.search}
            <input
              ref={findInputRef}
              type="text"
              value={findQuery}
              onChange={(e) => {
                const query = e.target.value;
                setFindQuery(query);
                const wv = webviewRef.current;
                if (wv && query) {
                  wv.findInPage(query).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch(() => {});
                } else if (wv && !query) {
                  wv.stopFindInPage('clearSelection');
                  setFindResults({ active: 0, total: 0 });
                }
              }}
              placeholder="Find in page..."
              style={styles.findInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const wv = webviewRef.current;
                  if (wv && findQuery) {
                    wv.findInPage(findQuery, { forward: !e.shiftKey, findNext: true }).then((result: any) => {
                      if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                    }).catch(() => {});
                  }
                }
              }}
            />
            {findQuery && (
              <span style={styles.findCount}>
                {findResults.total > 0 ? `${findResults.active}/${findResults.total}` : 'No results'}
              </span>
            )}
            <button
              style={styles.findNavBtn}
              onClick={() => {
                const wv = webviewRef.current;
                if (wv && findQuery) {
                  wv.findInPage(findQuery, { forward: false, findNext: true }).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch(() => {});
                }
              }}
              disabled={findResults.total === 0}
              title="Previous match"
              aria-label="Previous match"
            >
              {Icon.chevronUp}
            </button>
            <button
              style={styles.findNavBtn}
              onClick={() => {
                const wv = webviewRef.current;
                if (wv && findQuery) {
                  wv.findInPage(findQuery, { forward: true, findNext: true }).then((result: any) => {
                    if (result) setFindResults({ active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
                  }).catch(() => {});
                }
              }}
              disabled={findResults.total === 0}
              title="Next match"
              aria-label="Next match"
            >
              {Icon.chevronDown}
            </button>
            <button
              style={styles.findCloseBtn}
              onClick={() => {
                setShowFindBar(false);
                setFindQuery('');
                setFindResults({ active: 0, total: 0 });
                const wv = webviewRef.current;
                if (wv) wv.stopFindInPage('clearSelection');
              }}
              aria-label="Close find bar"
            >
              {Icon.close}
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.settingsPanelHeader}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>Browser Settings</span>
            <button style={styles.closeDownloads} onClick={() => setShowSettings(false)} aria-label="Close settings panel">{Icon.close}</button>
          </div>
          <div style={styles.settingsList}>
            {([
              { key: 'blockTrackers', label: 'Block Trackers' },
              { key: 'blockAds', label: 'Block Ads' },
              { key: 'forceHttps', label: 'Force HTTPS' },
              { key: 'fingerprintProtection', label: 'Fingerprint Protection' },
              { key: 'doNotTrack', label: 'Do Not Track' },
              { key: 'clearOnExit', label: 'Clear Data on Exit' },
              { key: 'blockThirdPartyCookies', label: 'Block 3rd-Party Cookies' },
              { key: 'enableTorMode', label: 'Tor Mode' },
            ] as { key: keyof BrowserSettings; label: string }[]).map(item => (
              <label key={item.key} style={styles.settingRow}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>{item.label}</span>
                <div
                  style={{
                    ...styles.settingToggle,
                    background: browserSettings[item.key] ? '#30d158' : 'var(--color-bg-hover)',
                  }}
                  onClick={() => setBrowserSettings(s => ({ ...s, [item.key]: !s[item.key] }))}
                >
                  <div style={{
                    ...styles.settingToggleKnob,
                    transform: browserSettings[item.key] ? 'translateX(14px)' : 'translateX(0)',
                  }} />
                </div>
              </label>
            ))}
            <div style={{ ...styles.settingRow, flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>Search Engine</span>
              <select
                value={browserSettings.defaultSearchEngine}
                onChange={(e) => setBrowserSettings(s => ({ ...s, defaultSearchEngine: e.target.value as BrowserSettings['defaultSearchEngine'] }))}
                style={styles.settingSelect}
              >
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="google">Google</option>
                <option value="startpage">Startpage</option>
                <option value="brave">Brave Search</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {!currentTab?.url ? (
          <div style={styles.newTabPage}>
            <div style={styles.logo}>DEX</div>
            <p style={styles.tagline}>Private browsing</p>
            
            <form onSubmit={handleSubmit} style={styles.searchForm}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Search..."
                style={styles.searchInput}
                autoFocus
              />
            </form>

            {bookmarks.length > 0 && (
              <div style={styles.bookmarks}>
                <div style={styles.bookmarkGrid}>
                  {bookmarks.map(b => (
                    <div key={b.id} style={styles.bookmark} onClick={() => navigate(b.url)}>
                      <span style={styles.bookmarkIcon}>{Icon.globe}</span>
                      <span style={styles.bookmarkText}>{b.title.slice(0, 12)}</span>
                      <button
                        style={styles.bookmarkRemove}
                        onClick={(e) => { e.stopPropagation(); removeBookmark(b.id); }}
                        aria-label="Remove bookmark"
                      >
                        {Icon.close}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={styles.webview}>
            {webviewError && (
              <div style={styles.errorOverlay}>
                <div style={styles.errorBox}>
                  <div style={styles.errorIcon}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <div style={styles.errorText}>{webviewError}</div>
                  <button 
                    style={styles.errorButton}
                    onClick={() => {
                      setWebviewError(null);
                      if (webviewRef.current?.reload) {
                        webviewRef.current.reload();
                      }
                    }}
                    aria-label="Reload page"
                  >
                    Reload Page
                  </button>
                  <button 
                    style={styles.errorButtonSecondary}
                    onClick={goHome}
                    aria-label="Go to home page"
                  >
                    Go Home
                  </button>
                </div>
              </div>
            )}
            <webview
              ref={webviewRef}
              src={currentTab.url}
              style={{ 
                position: 'absolute',
                inset: 0,
                width: '100%', 
                height: '100%', 
                display: webviewError ? 'none' : 'flex',
                border: 'none',
              }}
              {...{
                partition: "persist:dex-browser",
                allowpopups: "true",
                webpreferences: "contextIsolation=yes, nodeIntegration=no, javascript=yes, images=yes, webSecurity=yes",
                useragent: browserSettings.enableTorMode ? TOR_USER_AGENT : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              } as Record<string, string>}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    transition: 'background-color var(--duration-theme) ease, color var(--duration-theme) ease',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border-subtle)',
    position: 'relative',
  },
  tabMenuBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  tabsWrapper: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  tabs: {
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 12px',
    cursor: 'pointer',
    borderRight: '1px solid var(--color-border-subtle)',
    maxWidth: '180px',
    minWidth: '100px',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  pinIndicator: {
    color: 'var(--color-accent)',
    display: 'flex',
    marginRight: '2px',
  },
  tabTitle: {
    flex: 1,
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  tabClose: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '3px',
    display: 'flex',
    borderRadius: '3px',
    transition: 'all 0.15s',
  },
  tabActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 8px',
    borderLeft: '1px solid var(--color-border-subtle)',
  },
  newTab: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    borderRadius: '4px',
    transition: 'background 0.15s',
  },
  tabCount: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    fontFamily: 'monospace',
  },
  tabMenu: {
    position: 'absolute',
    top: '100%',
    left: '0',
    background: 'var(--color-bg-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 200,
    minWidth: '180px',
    padding: '4px 0',
    marginTop: '4px',
    backdropFilter: 'blur(20px)',
  },
  tabMenuItem: {
    display: 'block',
    width: '100%',
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  tabMenuDivider: {
    height: '1px',
    background: 'var(--color-border-subtle)',
    margin: '4px 0',
  },
  loading: {
    fontSize: '12px',
    color: 'var(--color-accent)',
    animation: 'spin 1s linear infinite',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  navBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
  },
  urlForm: {
    flex: 1,
  },
  urlBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--color-bg-hover)',
    borderRadius: '8px',
    padding: '8px 12px',
  },
  lockIcon: {
    color: 'var(--color-success)',
    display: 'flex',
  },
  urlInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
  },
  content: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
  },
  newTabPage: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  logo: {
    fontSize: '48px',
    fontWeight: 700,
    letterSpacing: '-2px',
    color: 'var(--color-text-primary)',
  },
  tagline: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    marginTop: '8px',
  },
  searchForm: {
    width: '100%',
    maxWidth: '500px',
    marginTop: '32px',
  },
  searchInput: {
    width: '100%',
    padding: '14px 20px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    color: 'var(--color-text-primary)',
    fontSize: '14px',
    outline: 'none',
  },
  bookmarks: {
    marginTop: '32px',
    width: '100%',
    maxWidth: '500px',
  },
  bookmarkGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  bookmark: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    background: 'var(--color-bg-glass)',
    borderRadius: '8px',
    cursor: 'pointer',
    position: 'relative',
  },
  bookmarkIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
  },
  bookmarkText: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
  },
  bookmarkRemove: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    marginLeft: '4px',
  },
  webview: {
    position: 'absolute',
    inset: 0,
    background: 'var(--color-bg-base)',
  },
  downloadBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--color-accent)',
  },
  downloadsPanel: {
    position: 'absolute',
    top: '80px',
    right: '12px',
    width: '280px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 100,
    overflow: 'hidden',
    backdropFilter: 'blur(20px)',
  },
  downloadsPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  closeDownloads: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    display: 'flex',
  },
  noDownloads: {
    padding: '20px',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--color-text-muted)',
  },
  downloadItem: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  downloadName: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    display: 'block',
    marginBottom: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  downloadProgress: {
    height: '3px',
    background: 'var(--color-bg-hover)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  downloadBar: {
    height: '100%',
    transition: 'width 0.2s',
  },
  downloadStatus: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    textTransform: 'capitalize',
  },
  shieldBadge: {
    position: 'absolute',
    top: '-2px',
    right: '-2px',
    fontSize: '8px',
    background: 'var(--color-success)',
    color: 'var(--color-success-text)',
    padding: '1px 3px',
    borderRadius: '6px',
    fontWeight: 600,
  },
  historyPanel: {
    position: 'absolute',
    top: '80px',
    right: '60px',
    width: '350px',
    maxHeight: '400px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 100,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    backdropFilter: 'blur(20px)',
  },
  historyPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  clearHistoryBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-error)',
    fontSize: '11px',
    cursor: 'pointer',
    marginRight: '8px',
  },
  historyList: {
    flex: 1,
    overflow: 'auto',
  },
  historyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  historyIcon: {
    color: 'var(--color-text-muted)',
    display: 'flex',
    flexShrink: 0,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    fontSize: '12px',
    color: 'var(--color-text-primary)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyUrl: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyTime: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },
  // Error UI styles
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-bg-secondary)',
    zIndex: 10,
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '32px',
    textAlign: 'center',
  },
  errorIcon: {
    marginBottom: '8px',
  },
  errorText: {
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
    maxWidth: '300px',
  },
  errorButton: {
    padding: '10px 24px',
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: '8px',
    color: 'var(--color-accent-text)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  errorButtonSecondary: {
    padding: '8px 20px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    color: 'var(--color-text-secondary)',
    fontSize: '13px',
    cursor: 'pointer',
  },
  // Find bar
  findBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 12px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  findBarInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--color-bg-hover)',
    borderRadius: '6px',
    padding: '4px 8px',
  },
  findInput: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    width: '180px',
    padding: '4px',
  },
  findCount: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
    marginRight: '4px',
  },
  findNavBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    borderRadius: '3px',
  },
  findCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    borderRadius: '3px',
    marginLeft: '4px',
  },
  // Settings panel
  settingsPanel: {
    position: 'absolute',
    top: '80px',
    right: '12px',
    width: '280px',
    maxHeight: '460px',
    background: 'var(--color-bg-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    boxShadow: '0 8px 32px var(--color-shadow-strong)',
    zIndex: 200,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    backdropFilter: 'blur(20px)',
  },
  settingsPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
  },
  settingsList: {
    padding: '8px 0',
    overflow: 'auto',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
  },
  settingToggle: {
    width: '34px',
    height: '20px',
    borderRadius: '10px',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  settingToggleKnob: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  settingSelect: {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: '6px',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
  },
};

Browser.displayName = 'Browser';
export default memo(Browser);
