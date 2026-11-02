// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Design Tokens Panel (Right Panel tab)
// ═══════════════════════════════════════════════════════════════════════════
// Reusable named design tokens — COLOR tokens (name + hex) and NUMBER tokens
// (name + value, e.g. spacing/radius). Add, edit, delete, and one-click apply:
// a color token recolors the selected part; a number token copies to clipboard.
// Persisted to localStorage under `dex-axl-design-tokens`, corrupt-safe.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Material } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useViewportStore } from '../stores/viewportStore';
import { useUIStore } from '../stores/uiStore';

// ─── Token model ────────────────────────────────────────────────────────────
type TokenKind = 'color' | 'number';

interface ColorToken {
  id: string;
  kind: 'color';
  name: string;
  value: string; // hex, e.g. #4a90d9
}

interface NumberToken {
  id: string;
  kind: 'number';
  name: string;
  value: number; // e.g. spacing / radius
}

type DesignToken = ColorToken | NumberToken;

const STORAGE_KEY = 'dex-axl-design-tokens';

// Locally-scoped id generator — mirrors the `axl-` prefix used by utils/math
// genId without coupling this additive panel to that module.
function tokenId(): string {
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTokens(): DesignToken[] {
  return [
    { id: tokenId(), kind: 'color', name: 'Primary', value: '#4a90d9' },
    { id: tokenId(), kind: 'color', name: 'Surface', value: '#1e1e22' },
    { id: tokenId(), kind: 'number', name: 'Spacing / S', value: 4 },
    { id: tokenId(), kind: 'number', name: 'Spacing / M', value: 8 },
    { id: tokenId(), kind: 'number', name: 'Radius', value: 4 },
  ];
}

// Corrupt-safe load — any parse error or shape mismatch falls back to defaults.
function loadTokens(): DesignToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTokens();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultTokens();
    const clean = parsed.filter((t: unknown): t is DesignToken => {
      if (!t || typeof t !== 'object') return false;
      const tok = t as Record<string, unknown>;
      if (typeof tok.id !== 'string' || typeof tok.name !== 'string') return false;
      if (tok.kind === 'color') return typeof tok.value === 'string';
      if (tok.kind === 'number') return typeof tok.value === 'number' && Number.isFinite(tok.value);
      return false;
    });
    return clean.length > 0 ? clean : defaultTokens();
  } catch {
    return defaultTokens();
  }
}

function saveTokens(tokens: DesignToken[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Storage may be unavailable (private mode / quota) — fail silently, the
    // in-memory token set still works for this session.
  }
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function normalizeHex(input: string): string | null {
  const v = input.trim();
  if (HEX_RE.test(v)) return v.toLowerCase();
  if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return `#${v.toLowerCase()}`;
  return null;
}

const DesignTokensPanel: React.FC = () => {
  const { project, setPartMaterial } = useProjectStore();
  const { selectedPartId } = useViewportStore();
  const { showToast } = useUIStore();

  const selectedPart = project.assembly.parts.find(p => p.id === selectedPartId) || null;

  const [tokens, setTokens] = useState<DesignToken[]>(() => loadTokens());
  const [newKind, setNewKind] = useState<TokenKind>('color');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#4a90d9');
  const [newNumber, setNewNumber] = useState('8');

  // Persist whenever the token set changes. Skip the very first run so we don't
  // immediately rewrite a freshly-loaded (possibly seeded) set.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    saveTokens(tokens);
  }, [tokens]);

  const addToken = useCallback(() => {
    const name = newName.trim() || (newKind === 'color' ? 'Color' : 'Value');
    if (newKind === 'color') {
      const hex = normalizeHex(newColor);
      if (!hex) { showToast('Enter a valid hex color (e.g. #4a90d9)'); return; }
      setTokens(prev => [...prev, { id: tokenId(), kind: 'color', name, value: hex }]);
    } else {
      const num = Number(newNumber);
      if (!Number.isFinite(num)) { showToast('Enter a valid number'); return; }
      setTokens(prev => [...prev, { id: tokenId(), kind: 'number', name, value: num }]);
    }
    setNewName('');
    showToast(`Token "${name}" added`);
  }, [newKind, newName, newColor, newNumber, showToast]);

  const updateColorValue = useCallback((id: string, raw: string) => {
    const hex = normalizeHex(raw) ?? raw; // keep partial input live; validated on apply
    setTokens(prev => prev.map(t => t.id === id && t.kind === 'color' ? { ...t, value: hex } : t));
  }, []);

  const updateNumberValue = useCallback((id: string, raw: string) => {
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    setTokens(prev => prev.map(t => t.id === id && t.kind === 'number' ? { ...t, value: num } : t));
  }, []);

  const renameToken = useCallback((id: string, name: string) => {
    setTokens(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }, []);

  const deleteToken = useCallback((id: string) => {
    setTokens(prev => prev.filter(t => t.id !== id));
  }, []);

  // Copy a value to the clipboard (best effort — clipboard may be blocked).
  const copyValue = useCallback((value: string) => {
    try {
      navigator.clipboard?.writeText(value);
      showToast(`Copied "${value}"`);
    } catch {
      showToast(`Value: ${value}`);
    }
  }, [showToast]);

  // Apply a color token to the selected part. We reuse the existing
  // setPartMaterial action (which sets both material.color and part.color) with
  // a synthetic material that carries the part's current properties but the
  // token's color — no new store action, no behavior change for materials.
  const applyColor = useCallback((tok: ColorToken) => {
    const hex = normalizeHex(tok.value);
    if (!hex) { showToast('Token has an invalid hex color'); return; }
    if (!selectedPart) { copyValue(hex); return; }
    const recolored: Material = { ...selectedPart.material, color: hex };
    setPartMaterial(selectedPart.id, recolored);
    showToast(`Applied "${tok.name}" to ${selectedPart.name}`);
  }, [selectedPart, setPartMaterial, copyValue, showToast]);

  const colorTokens = tokens.filter((t): t is ColorToken => t.kind === 'color');
  const numberTokens = tokens.filter((t): t is NumberToken => t.kind === 'number');

  // ─── Shared inline styles (flat surfaces, hairline borders, DEX accent) ──
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4, letterSpacing: '0.5px' };
  const inputStyle: React.CSSProperties = { background: 'var(--color-bg-hover)', border: '1px solid var(--color-border-subtle)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: 10, padding: '4px 6px', outline: 'none', minWidth: 0 };
  const iconBtn: React.CSSProperties = { fontSize: 9, padding: '3px 8px', background: 'var(--color-border-subtle)', border: '1px solid var(--color-bg-hover)', borderRadius: 9999, color: 'var(--color-text-secondary)', cursor: 'pointer' };

  const renderColorRow = (tok: ColorToken) => {
    const swatch = normalizeHex(tok.value) ?? '#000000';
    return (
      <div key={tok.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 4 }}>
        <input
          type="color"
          value={swatch}
          onChange={e => updateColorValue(tok.id, e.target.value)}
          aria-label={`${tok.name} color`}
          style={{ width: 18, height: 18, padding: 0, border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
        />
        <input
          value={tok.name}
          onChange={e => renameToken(tok.id, e.target.value)}
          aria-label="Token name"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          value={tok.value}
          onChange={e => updateColorValue(tok.id, e.target.value)}
          aria-label="Token hex"
          style={{ ...inputStyle, width: 64, fontVariantNumeric: 'tabular-nums' }}
        />
        <button onClick={() => applyColor(tok)}
          style={{ ...iconBtn, color: 'var(--color-accent)', borderColor: 'var(--color-accent-muted)', background: 'var(--color-accent-light)' }}>
          {selectedPart ? 'Apply' : 'Copy'}
        </button>
        <button onClick={() => deleteToken(tok.id)} aria-label="Delete token"
          style={{ ...iconBtn, color: 'var(--color-error)' }}>&times;</button>
      </div>
    );
  };

  const renderNumberRow = (tok: NumberToken) => (
    <div key={tok.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px var(--space-2)', background: 'var(--color-border-subtle)', borderRadius: 4 }}>
      <input
        value={tok.name}
        onChange={e => renameToken(tok.id, e.target.value)}
        aria-label="Token name"
        style={{ ...inputStyle, flex: 1 }}
      />
      <input
        type="number"
        value={tok.value}
        onChange={e => updateNumberValue(tok.id, e.target.value)}
        aria-label="Token value"
        style={{ ...inputStyle, width: 64, fontVariantNumeric: 'tabular-nums' }}
      />
      <button onClick={() => copyValue(String(tok.value))}
        style={{ ...iconBtn, color: 'var(--color-accent)', borderColor: 'var(--color-accent-muted)', background: 'var(--color-accent-light)' }}>
        Copy
      </button>
      <button onClick={() => deleteToken(tok.id)} aria-label="Delete token"
        style={{ ...iconBtn, color: 'var(--color-error)' }}>&times;</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* ─── Add new token ─────────────────────────────────────────────── */}
      <div style={labelStyle}>ADD TOKEN</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['color', 'number'] as TokenKind[]).map(kind => (
          <button key={kind} onClick={() => setNewKind(kind)}
            style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', padding: '4px 0', borderRadius: 9999, cursor: 'pointer',
              color: newKind === kind ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background: newKind === kind ? 'var(--color-accent-light)' : 'transparent',
              border: newKind === kind ? '1px solid var(--color-accent-muted)' : '1px solid var(--color-border-subtle)' }}>
            {kind.toUpperCase()}
          </button>
        ))}
      </div>
      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Token name" aria-label="New token name" style={inputStyle} />
      {newKind === 'color' ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="color" value={normalizeHex(newColor) ?? '#4a90d9'} onChange={e => setNewColor(e.target.value)} aria-label="New token color"
            style={{ width: 28, height: 26, padding: 0, border: '1px solid var(--color-border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
          <input value={newColor} onChange={e => setNewColor(e.target.value)} placeholder="#4a90d9" aria-label="New token hex" style={{ ...inputStyle, flex: 1, fontVariantNumeric: 'tabular-nums' }} />
        </div>
      ) : (
        <input type="number" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Value" aria-label="New token value" style={inputStyle} />
      )}
      <button onClick={addToken}
        style={{ padding: '6px var(--space-3)', fontSize: 10, fontWeight: 600, background: 'var(--color-accent-light)', color: 'var(--color-accent)', border: '1px solid var(--color-accent-muted)', borderRadius: 9999, cursor: 'pointer', boxShadow: 'none' }}>
        Add Token
      </button>

      {/* ─── Color tokens ──────────────────────────────────────────────── */}
      <div style={{ ...labelStyle, marginTop: 'var(--space-2)' }}>COLOR TOKENS</div>
      {colorTokens.length === 0
        ? <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>No color tokens</div>
        : colorTokens.map(renderColorRow)}

      {/* ─── Number tokens ─────────────────────────────────────────────── */}
      <div style={{ ...labelStyle, marginTop: 'var(--space-2)' }}>NUMBER TOKENS</div>
      {numberTokens.length === 0
        ? <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>No number tokens</div>
        : numberTokens.map(renderNumberRow)}

      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.4 }}>
        {selectedPart
          ? `Apply recolors "${selectedPart.name}". Number tokens copy to clipboard.`
          : 'Select a part to apply color tokens. With no selection, Apply copies the hex.'}
      </div>
    </div>
  );
};

export default DesignTokensPanel;
