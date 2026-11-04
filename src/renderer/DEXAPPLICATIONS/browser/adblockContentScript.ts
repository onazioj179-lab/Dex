// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Browser — ad-block CONTENT SCRIPT generator.
 *
 * The <webview> exposes no request-interception API, so navigation-level
 * blocking (AdblockEngine in Browser.tsx) only stops top-level loads — actual
 * ads/trackers load as SUB-RESOURCES (scripts, images, iframes, fetch/XHR)
 * inside the page and were never blocked. This module builds a self-contained
 * JS string injected into every page on `dom-ready` via
 * `webview.executeJavaScript(...)`. Running in the guest page context it:
 *
 *   1. Overrides fetch + XMLHttpRequest.open to abort requests to blocked hosts.
 *   2. Runs a MutationObserver that strips <script>/<img>/<iframe> whose src is
 *      a blocked host as they are inserted.
 *   3. Overrides Image() and setAttribute('src') for early tracker pixels.
 *   4. Tallies blocks and reports them to the host via a console marker the
 *      Browser reads on the webview's `console-message` event.
 *
 * Everything is wrapped so a failure fails OPEN (page keeps working) and the
 * install is idempotent across in-page navigations.
 */

export interface AdblockScriptOptions {
  blockAds: boolean;
  blockTrackers: boolean;
}

/** Console marker the injected script logs; the host parses "<PREFIX><n>". */
export const ADBLOCK_CONSOLE_PREFIX = '__DEX_ADBLOCK__:';

/**
 * Build the injectable content script. `blockedDomains` is embedded as a Set;
 * the matcher mirrors AdblockEngine's label-boundary suffix logic. Returns an
 * empty string when both toggles are off (nothing to inject).
 */
export function buildAdblockScript(
  blockedDomains: readonly string[],
  opts: AdblockScriptOptions,
): string {
  if (!opts.blockAds && !opts.blockTrackers) return '';

  // Split host vs path entries; JSON-encode so a hostile entry can't break out.
  const hosts: string[] = [];
  const paths: string[] = [];
  for (const raw of blockedDomains) {
    const e = (raw || '').toLowerCase().trim();
    if (!e) continue;
    if (e.includes('/')) paths.push(e); else hosts.push(e);
  }
  const hostsJson = JSON.stringify(hosts);
  const pathsJson = JSON.stringify(paths);
  const patternsJson = JSON.stringify(opts.blockTrackers ? ['/beacon', 'track.php', '&_ga='] : []);
  const prefix = JSON.stringify(ADBLOCK_CONSOLE_PREFIX);

  return `(function(){
  try {
    if (window.__dexAdblockInstalled) return;
    window.__dexAdblockInstalled = true;
    var HOSTS = new Set(${hostsJson});
    var PATHS = ${pathsJson};
    var PATTERNS = ${patternsJson};
    var PREFIX = ${prefix};
    var blocked = 0, reportTimer = 0;
    function norm(h){ h = (h||'').toLowerCase(); if (h.indexOf('www.')===0) h = h.slice(4); return h.replace(/\\.$/,'').replace(/:\\d+$/,''); }
    function hostBlocked(host){
      var h = norm(host); if (!h) return false;
      if (HOSTS.has(h)) return true;
      var i = h.indexOf('.');
      while (i !== -1 && i+1 < h.length){ if (HOSTS.has(h.slice(i+1))) return true; i = h.indexOf('.', i+1); }
      return false;
    }
    function urlBlocked(u){
      if (!u) return false;
      try {
        var host = new URL(u, location.href).hostname;
        if (hostBlocked(host)) return true;
      } catch(e){ return false; }
      var lu = ('' + u).toLowerCase();
      for (var p=0; p<PATHS.length; p++){ if (lu.indexOf(PATHS[p]) !== -1) return true; }
      for (var q=0; q<PATTERNS.length; q++){ if (lu.indexOf(PATTERNS[q]) !== -1) return true; }
      return false;
    }
    function report(){
      if (reportTimer) return;
      reportTimer = setTimeout(function(){ reportTimer = 0; try { console.log(PREFIX + blocked); } catch(e){} try { (window.__dexOutbox = window.__dexOutbox || []).push({ t: 'adblock', n: blocked }); } catch(e){} }, 400);
    }
    function hit(){ blocked++; report(); }

    // --- fetch ---
    if (window.fetch){
      var _fetch = window.fetch;
      window.fetch = function(input, init){
        var u = (typeof input === 'string') ? input : (input && input.url);
        if (urlBlocked(u)){ hit(); return Promise.reject(new Error('Blocked by DEX ad-blocker')); }
        return _fetch.apply(this, arguments);
      };
    }
    // --- XHR ---
    if (window.XMLHttpRequest){
      var _open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(m, u){ if (urlBlocked(u)){ this.__dexBlocked = true; hit(); } return _open.apply(this, arguments); };
      var _send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(){ if (this.__dexBlocked) return; return _send.apply(this, arguments); };
    }
    // --- sendBeacon (analytics) ---
    if (navigator.sendBeacon){
      var _beacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function(u, data){ if (urlBlocked(u)){ hit(); return true; } return _beacon(u, data); };
    }
    // --- Image() pixels ---
    if (window.Image){
      var _Image = window.Image;
      window.Image = function(){ var img = new _Image(); try { Object.defineProperty(img, 'src', { set: function(v){ if (urlBlocked(v)){ hit(); return; } this.setAttribute('src', v); }, get: function(){ return this.getAttribute('src'); } }); } catch(e){} return img; };
    }
    // --- DOM insertion scrubbing ---
    function scrub(node){
      if (!node || node.nodeType !== 1) return;
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'img' || tag === 'iframe'){
        var src = node.getAttribute && node.getAttribute('src');
        if (src && urlBlocked(src)){ hit(); if (node.remove) node.remove(); else if (node.parentNode) node.parentNode.removeChild(node); }
      }
    }
    var mo = new MutationObserver(function(muts){ for (var i=0;i<muts.length;i++){ var an = muts[i].addedNodes; for (var j=0;j<an.length;j++) scrub(an[j]); } });
    function startObserver(){ try { mo.observe(document.documentElement || document, { childList: true, subtree: true }); } catch(e){} }
    if (document.documentElement) startObserver(); else document.addEventListener('DOMContentLoaded', startObserver);
  } catch(err){ /* fail open — never break the page */ }
})();`;
}
