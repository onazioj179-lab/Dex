// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Contrast audit (run inside the DEX page: preview or CDP). Opens each app and
// checks every visible text element's WCAG contrast against its real
// background (alpha layers and ancestor opacity composited). Usage:
//   await window.__contrast.run(['files','notes',...]) -> { total, perApp, byColor, fails }

window.__contrast = (() => {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) {
      const cm = c && c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (cm) return [cm[1] * 255, cm[2] * 255, cm[3] * 255, cm[4] === undefined ? 1 : +cm[4]];
      return null;
    }
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
  };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || [0, 0, 0, 1];
    if (base[3] < 1) base = [0, 0, 0, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const audit = (root, app) => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const txt = t.textContent.trim();
      if (txt.length < 2) continue;
      const el = t.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[aria-hidden="true"], svg, canvas, script, style, option')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      let fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el);
      const op = opacityOf(el);
      fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const rr = ratio(fg, bg);
      const size = parseFloat(cs.fontSize); const bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const disabled = el.closest('button:disabled, [aria-disabled="true"], input:disabled');
      if (rr < need && !disabled) out.push({ app, text: txt.slice(0, 30), ratio: +rr.toFixed(2), fg: hex(fg), bg: hex(bg), raw: cs.color, size, inline: (el.getAttribute('style') || '').match(/color:\s*[^;]+/)?.[0] || '' });
    }
    // Icons (svg in buttons): stroke/fill colour vs background, >= 3:1 (WCAG 1.4.11).
    for (const svg of root.querySelectorAll('button svg, [role="button"] svg')) {
      const r = svg.getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > innerHeight) continue;
      const btn = svg.closest('button, [role="button"]');
      if (btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true')) continue;
      const cs = getComputedStyle(svg);
      const paint = [cs.stroke, cs.fill, cs.color].map(parse).find((c) => c && c[3] > 0 && !(c[0] === 0 && c[1] === 0 && c[2] === 0 && cs.fill === 'rgb(0, 0, 0)' && cs.stroke === 'none'));
      if (!paint) continue;
      const bg = bgOf(btn || svg.parentElement);
      const fg = over([paint[0], paint[1], paint[2], paint[3] * opacityOf(svg)], bg);
      const rr = ratio(fg, bg);
      if (rr < 3) out.push({ app, text: '[icon] ' + ((btn && (btn.getAttribute('aria-label') || btn.textContent.trim())) || '').slice(0, 26), ratio: +rr.toFixed(2), fg: hex(fg), bg: hex(bg), raw: 'icon ' + (cs.stroke !== 'none' ? cs.stroke : cs.color), size: 0, inline: '' });
    }
    return out;
  };
  const run = async (apps) => {
    const s = window.__dexRunningApps.getState();
    const res = { theme: document.documentElement.getAttribute('data-theme'), perApp: {}, fails: [] };
    for (const id of apps) {
      s.closeAllApps(); await new Promise((r) => setTimeout(r, 250));
      s.launchApp({ id, name: id, icon: id });
      await new Promise((r) => setTimeout(r, 1800));
      const root = document.querySelector(`[data-app-id="${id}"], [data-floating-window="${id}"]`);
      if (!root) { res.perApp[id] = 'no root'; continue; }
      const f = audit(root, id);
      res.perApp[id] = f.length;
      res.fails.push(...f);
    }
    s.closeAllApps(); await new Promise((r) => setTimeout(r, 300));
    const shell = audit(document.body, 'shell');
    res.perApp.shell = shell.length; res.fails.push(...shell);
    const byColor = {};
    for (const f of res.fails) { const k = f.raw; byColor[k] = byColor[k] || { n: 0, apps: new Set(), min: 99, ex: f.text, bg: f.bg }; byColor[k].n++; byColor[k].apps.add(f.app); byColor[k].min = Math.min(byColor[k].min, f.ratio); }
    res.byColor = Object.entries(byColor).sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, v]) => ({ color: k, n: v.n, min: v.min, apps: [...v.apps].slice(0, 8).join(','), ex: v.ex, bg: v.bg }));
    res.total = res.fails.length;
    return res;
  };
  return { run, audit };
})();
'ok'
