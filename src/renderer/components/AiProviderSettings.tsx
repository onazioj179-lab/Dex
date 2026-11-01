// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * AI Providers settings panel. Connects UKI to an LLM provider by managing
 * API keys (stored locally via the keystore). This is the UI half of the
 * AI-provider framework — once a key is saved here, `orchestrator.chat()` can
 * route to that provider. Self-contained so the Settings page only needs a
 * one-line mount.
 */

import React, { useState } from 'react';
import { allProviders, allModels, findModel, getProvider } from '../uki/providers/registry';
import { getApiKey, setApiKey, removeApiKey, configuredProviders } from '../uki/keystore';
import {
  getPreferredModel, setPreferredModel, getRoutingGoal, setRoutingGoal,
  getProcessingMode, setProcessingMode, getManualModel, setManualModel,
  getReasoningPreference, setReasoningPreference,
} from '../uki/providers/modelPrefs';
import { routeConfiguredModels, applyProcessingMode } from '../uki/providers/connect';
import {
  PROCESSING_MODES, processingModeLabel, processingModeHint, REASONING_PREFERENCES,
  type ProcessingMode, type ReasoningPreference,
} from '../../shared/uki/assistantPolicy';
import { ROUTING_GOALS, routingGoalLabel, type RoutingGoal } from '../../shared/uki/smartRouter';
import { getCapabilities } from '../services/platform';

/** Human label for the shell + backend coverage (the dual-shell "blend"). */
function shellLabel(): string {
  const c = getCapabilities();
  if (c.shell === 'electron') return 'Electron · full backend';
  if (c.shell === 'tauri') return `Tauri (lite) · ${c.nativeSubsystems.length} native subsystems`;
  return 'Web preview · local-only';
}

const GOAL_HINTS: Record<RoutingGoal, string> = {
  auto: 'Picks the best model per task automatically.',
  cheapest: 'Prefers the lowest-cost model.',
  fastest: 'Prefers the lowest-latency model.',
  smartest: 'Prefers the most capable model.',
  offline: 'Uses only on-device (Ollama) models.',
};

const REASONING_LABEL: Record<ReasoningPreference, string> = {
  auto: 'Automatic', fast: 'Fast', balanced: 'Balanced', deep: 'Deep',
};
const REASONING_HINT: Record<ReasoningPreference, string> = {
  auto: 'Fast for quick commands, Deep for engineering, research and planning, Balanced otherwise.',
  fast: 'Up to 2 tool steps, short answers.',
  balanced: 'Up to 5 tool steps.',
  deep: 'Up to 10 tool steps and longer answers (uses more of your provider quota).',
};

const selectStyle: React.CSSProperties = {
  height: 28, padding: '0 var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 12,
  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border-control)',
};

const AiProviderSettings: React.FC = () => {
  const providers = allProviders();
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of providers) init[p.id] = getApiKey(p.id) ?? '';
    return init;
  });
  const [models, setModels] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of providers) init[p.id] = getPreferredModel(p.id) ?? p.listModels()[0]?.id ?? '';
    return init;
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [goal, setGoal] = useState<RoutingGoal>(() => getRoutingGoal());
  const [mode, setMode] = useState<ProcessingMode>(() => getProcessingMode());
  const [manualModel, setManual] = useState<string>(() => getManualModel() ?? '');
  const [reasoning, setReasoning] = useState<ReasoningPreference>(() => getReasoningPreference());

  const chooseModel = (id: string, modelId: string) => {
    setModels((m) => ({ ...m, [id]: modelId }));
    setPreferredModel(id, modelId);
  };

  const chooseGoal = (g: RoutingGoal) => {
    setGoal(g);
    setRoutingGoal(g);
  };

  const connected = (id: string) => (getApiKey(id)?.length ?? 0) > 0;

  const save = (id: string) => {
    setApiKey(id, keys[id]);
    setSavedAt(id);
    setTimeout(() => setSavedAt((s) => (s === id ? null : s)), 1500);
  };

  const clear = (id: string) => {
    removeApiKey(id);
    setKeys((k) => ({ ...k, [id]: '' }));
    setSavedAt(null);
  };

  // What the Smart Router will pick for a typical short prompt right now (reads
  // the live keystore + goal). Recomputed each render — save/remove/goal-change
  // all trigger a re-render.
  const hasAnyKey = configuredProviders().length > 0;
  const routedTopId = applyProcessingMode(routeConfiguredModels(mode === 'local-only' ? 'offline' : goal, ''), mode, manualModel || null)[0] ?? null;
  const routedTop = routedTopId ? findModel(routedTopId) : null;
  const routedProviderLabel = routedTop ? getProvider(routedTop.provider)?.label : null;

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>
        AI Providers
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)', lineHeight: 1.5 }}>
        Connect a provider to power UKI. Keys are stored locally on this device (obfuscated; the
        packaged app uses the OS keychain). Ollama runs locally and needs no key.
      </p>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '-6px 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />
        Running on {shellLabel()}
      </div>

      <div
        data-testid="active-model-banner"
        style={{
          padding: '10px 14px', marginBottom: 'var(--space-3)', borderRadius: 10, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          background: routedTop ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : 'var(--pg-surface)',
          border: `1px solid ${routedTop ? 'var(--color-success)' : 'var(--pg-border)'}`,
          color: 'var(--color-text-primary)',
        }}
      >
        {routedTop ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
            <span>
              UKI · <strong>{routingGoalLabel(goal)}</strong> routing —{' '}
              {goal === 'auto' ? 'prefers' : 'will use'} <strong>{routedTop.label}</strong> · {routedProviderLabel}
            </span>
          </>
        ) : hasAnyKey && goal === 'offline' ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>
            Offline routing selected, but no on-device (Ollama) model is available. Start Ollama or pick another routing mode.
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)' }}>
            No AI provider connected — paste a key below to enable AI replies. (Structured commands still work without a key.)
          </span>
        )}
      </div>

      <div
        style={{
          padding: '10px 14px', marginBottom: 'var(--space-3)', borderRadius: 'var(--radius-md)',
          background: 'var(--pg-surface)', border: '1px solid var(--pg-border)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="processing-mode" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 120 }}>
            Processing
          </label>
          <select
            id="processing-mode"
            value={mode}
            onChange={(e) => { const m = e.target.value as ProcessingMode; setMode(m); setProcessingMode(m); }}
            style={selectStyle}
          >
            {PROCESSING_MODES.map((m) => <option key={m} value={m}>{processingModeLabel(m)}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>{processingModeHint(mode)}</span>
        {mode === 'manual' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label htmlFor="manual-model" style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 120 }}>Model</label>
            <select
              id="manual-model"
              value={manualModel}
              onChange={(e) => { setManual(e.target.value); setManualModel(e.target.value); }}
              style={selectStyle}
            >
              <option value="">Choose a model</option>
              {allModels().map((m) => (
                <option key={m.id} value={m.id}>{m.label} · {getProvider(m.provider)?.label ?? m.provider}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="reasoning-pref" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 120 }}>
            Reasoning effort
          </label>
          <select
            id="reasoning-pref"
            value={reasoning}
            onChange={(e) => { const r = e.target.value as ReasoningPreference; setReasoning(r); setReasoningPreference(r); }}
            style={selectStyle}
          >
            {REASONING_PREFERENCES.map((r) => <option key={r} value={r}>{REASONING_LABEL[r]}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.45 }}>{REASONING_HINT[reasoning]}</span>
      </div>

      <div
        style={{
          padding: '10px 14px', marginBottom: 'var(--space-4)', borderRadius: 10,
          background: 'var(--pg-surface)', border: '1px solid var(--pg-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}
      >
        <label htmlFor="routing-goal" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Routing
        </label>
        <select
          id="routing-goal"
          value={goal}
          onChange={(e) => chooseGoal(e.target.value as RoutingGoal)}
          aria-label="Smart Router goal"
          style={{
            height: 28, padding: '0 var(--space-2)', borderRadius: 6, fontSize: 12,
            background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          {ROUTING_GOALS.map((g) => (
            <option key={g} value={g}>{routingGoalLabel(g)}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{GOAL_HINTS[goal]}</span>
      </div>

      {providers.map((p) => (
        <div
          key={p.id}
          style={{
            padding: 14, marginBottom: 10, borderRadius: 10,
            background: 'var(--pg-surface)', border: '1px solid var(--pg-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.label}</span>
            {connected(p.id) && (
              <span style={{ fontSize: 11, color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)' }} /> Connected
              </span>
            )}
            {!p.requiresKey && (
              <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>local · no key</span>
            )}
          </div>

          {p.requiresKey && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-2)' }}>
              <input
                type="password"
                value={keys[p.id] ?? ''}
                onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                placeholder={`${p.label} API key`}
                aria-label={`${p.label} API key`}
                style={{
                  flex: 1, height: 32, padding: '0 10px', borderRadius: 6, fontSize: 13,
                  background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              />
              <button
                onClick={() => save(p.id)}
                style={{
                  height: 32, padding: '0 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: 'var(--color-accent)', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                {savedAt === p.id ? 'Saved' : 'Save'}
              </button>
              {connected(p.id) && (
                <button
                  onClick={() => clear(p.id)}
                  style={{
                    height: 32, padding: '0 var(--space-3)', borderRadius: 6, fontSize: 13,
                    background: 'transparent', color: 'var(--color-error)',
                    border: '1px solid var(--color-border)', cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }} htmlFor={`model-${p.id}`}>
              Model
            </label>
            <select
              id={`model-${p.id}`}
              value={models[p.id] ?? ''}
              onChange={(e) => chooseModel(p.id, e.target.value)}
              aria-label={`${p.label} model`}
              style={{
                height: 28, padding: '0 var(--space-2)', borderRadius: 6, fontSize: 12,
                background: 'var(--color-bg-base)', color: 'var(--color-text-primary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {p.listModels().map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AiProviderSettings;
