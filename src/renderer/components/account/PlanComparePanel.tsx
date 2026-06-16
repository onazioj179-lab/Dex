// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PlanComparePanel -- side-by-side plan grid driven entirely by
 * `src/shared/license/{pricing,proPerks}.ts`. Renders one column per plan
 * with checkmark / dash inline SVG icons (NO emojis) and a single
 * "Choose plan" Button per column. Receives an optional `onChoose` so the
 * host (Settings, Onboarding, billing surface) can route the click into a
 * real billing flow.
 */

// DEX v3.8.9 follow-up - plan compare UI

import React, { useMemo, useState } from 'react';
import { Button } from '../../ui/Button';
import { space, radius, fontSize, fontWeight } from '../../styles/tokens';
import { PLANS, formatPrice, type Plan, type PlanId, type BillingPeriod } from '../../../shared/license/pricing';
import { PRO_PERKS, type ProPerk } from '../../../shared/license/proPerks';

const PLAN_RANK: Record<PlanId, number> = {
  'free-viewer': 0,
  personal: 1,
  family: 1,
  pro: 2,
  studio: 3,
};

function planHasPerk(planId: PlanId, perk: ProPerk): boolean {
  return PLAN_RANK[planId] >= PLAN_RANK[perk.minPlan];
}

const Check = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-label="included" role="img">
    <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Dash = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-label="not included" role="img">
    <path d="M3.5 8H12.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

export interface PlanComparePanelProps {
  /** Currently signed-in plan, used to mark the active column. */
  currentPlan?: PlanId;
  /**
   * Receives the chosen plan id when a column is selected. Receives the
   * billing period and (for Studio) the requested seat count.
   */
  onChoose?: (planId: PlanId, period: BillingPeriod, seats: number) => void;
  /** Optional close handler, renders a Close button when provided. */
  onClose?: () => void;
  /** Initial billing period toggle. */
  initialPeriod?: BillingPeriod;
  /** Initial Studio seat count. Defaults to 2 (the Studio minimum). */
  initialStudioSeats?: number;
}

export function PlanComparePanel({ currentPlan, onChoose, onClose, initialPeriod = 'monthly', initialStudioSeats = 2 }: PlanComparePanelProps) {
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);
  const [studioSeats, setStudioSeats] = useState<number>(() => {
    const n = Math.floor(initialStudioSeats);
    if (!Number.isFinite(n) || n < 2) return 2;
    if (n > 500) return 500;
    return n;
  });

  // Group perks by category for readable rows.
  const groupedPerks = useMemo(() => {
    const groups = new Map<ProPerk['category'], ProPerk[]>();
    for (const p of PRO_PERKS) {
      const arr = groups.get(p.category) ?? [];
      arr.push(p);
      groups.set(p.category, arr);
    }
    return Array.from(groups.entries());
  }, []);

  return (
    <div style={panelStyle} data-testid="plan-compare-panel">
      <div style={headerRow}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>Compare plans</h2>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Button
            variant={period === 'monthly' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setPeriod('monthly')}
          >Monthly</Button>
          <Button
            variant={period === 'yearly' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setPeriod('yearly')}
          >Yearly</Button>
          {onClose && <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>}
        </div>
      </div>

      <div style={gridStyle} role="table" aria-label="Plan comparison">
        <div style={{ ...headerCell, gridColumn: 1 }} role="columnheader" aria-label="Feature" />
        {PLANS.map((p) => (
          <PlanHeaderCell
            key={p.id}
            plan={p}
            period={period}
            isCurrent={p.id === currentPlan}
            studioSeats={studioSeats}
            onStudioSeatsChange={setStudioSeats}
            onChoose={onChoose}
          />
        ))}

        {groupedPerks.map(([category, perks]) => (
          <React.Fragment key={category}>
            <div style={{ ...categoryRow, gridColumn: `1 / span ${PLANS.length + 1}` }} role="rowheader">
              {prettyCategory(category)}
            </div>
            {perks.map((perk) => (
              <React.Fragment key={perk.gate}>
                <div style={featureCell} role="rowheader" title={perk.blurb}>
                  {perk.headline}
                </div>
                {PLANS.map((plan) => (
                  <div key={plan.id} style={{ ...valueCell, color: planHasPerk(plan.id, perk) ? 'var(--color-accent, #4A9EFF)' : 'var(--color-text-tertiary, rgba(255,255,255,0.4))' }} role="cell">
                    {planHasPerk(plan.id, perk) ? <Check /> : <Dash />}
                  </div>
                ))}
              </React.Fragment>
            ))}
          </React.Fragment>
        ))}
      </div>

      <p style={footnote}>
        Prices in USD. Yearly billing is discounted; the savings are shown beneath the price.
        You can switch or cancel any time. Free Viewer never expires.
      </p>
    </div>
  );
}

function PlanHeaderCell({ plan, period, isCurrent, studioSeats, onStudioSeatsChange, onChoose }: {
  plan: Plan;
  period: BillingPeriod;
  isCurrent: boolean;
  studioSeats: number;
  onStudioSeatsChange: (n: number) => void;
  onChoose?: (planId: PlanId, period: BillingPeriod, seats: number) => void;
}) {
  const price = plan.prices[period];
  const monthly = plan.prices.monthly?.cents ?? 0;
  const yearly = plan.prices.yearly?.cents ?? 0;
  const savings = period === 'yearly' && monthly > 0 && yearly > 0
    ? Math.max(0, monthly * 12 - yearly)
    : 0;
  const isStudio = plan.id === 'studio';
  const seatsForChoice = isStudio ? Math.max(1, studioSeats) : 1;
  const totalCents = isStudio && price ? price.cents * seatsForChoice : (price?.cents ?? 0);
  return (
    <div style={planHeader} role="columnheader" aria-label={plan.name}>
      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>{plan.name}</div>
      <div style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary)' }}>{plan.tagline}</div>
      <div style={{ marginTop: space[2], fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>
        {price ? formatPrice(price.cents) : '—'}
        <span style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary)', fontWeight: fontWeight.normal }}>
          {isStudio ? ' / seat' : ''} / {period === 'monthly' ? 'mo' : 'yr'}
        </span>
      </div>
      {savings > 0 && (
        <div style={{ fontSize: fontSize.xs, color: 'var(--color-success, #4ADE80)' }}>
          Save {formatPrice(savings)} per year
        </div>
      )}
      {isStudio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], marginTop: space[1] }}>
          <label
            htmlFor="dex-studio-seats"
            style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary)' }}
          >
            Seats (2 minimum)
          </label>
          <input
            id="dex-studio-seats"
            type="number"
            min={2}
            max={500}
            step={1}
            value={studioSeats}
            aria-label="Studio seats"
            onChange={(e) => {
              const raw = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(raw)) { onStudioSeatsChange(2); return; }
              if (raw < 2) { onStudioSeatsChange(2); return; }
              if (raw > 500) { onStudioSeatsChange(500); return; }
              onStudioSeatsChange(raw);
            }}
            style={{
              width: '100%',
              padding: '4px var(--space-2)',
              fontSize: fontSize.sm,
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-inset, #101012)',
              border: '1px solid var(--color-border, rgba(255,255,255,0.14))',
              borderRadius: radius.md,
            }}
          />
          {price && (
            <div style={{ fontSize: fontSize.xs, color: 'var(--color-text-secondary)' }}>
              Total: <strong style={{ color: 'var(--color-text-primary)' }}>{formatPrice(totalCents)}</strong> / {period === 'monthly' ? 'mo' : 'yr'}
            </div>
          )}
        </div>
      )}
      <Button
        variant={isCurrent ? 'secondary' : (plan.id === 'pro' ? 'primary' : 'secondary')}
        size="sm"
        disabled={isCurrent}
        onClick={() => onChoose?.(plan.id, period, seatsForChoice)}
        fullWidth
      >
        {isCurrent ? 'Current plan' : `Choose ${plan.name}`}
      </Button>
    </div>
  );
}

function prettyCategory(c: ProPerk['category']): string {
  switch (c) {
    case 'creativity':    return 'Creativity';
    case 'collaboration': return 'Collaboration';
    case 'security':      return 'Security';
    case 'support':       return 'Support';
    case 'power':         return 'Power';
    case 'storage':       return 'Storage';
  }
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-bg-elevated, #1A1A1E)',
  border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderRadius: radius.lg,
  padding: space[5],
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
};
const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] };
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `minmax(180px, 2fr) repeat(${PLANS.length}, minmax(140px, 1fr))`,
  gap: 0,
  borderTop: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderLeft: '1px solid var(--color-border, rgba(255,255,255,0.08))',
};
const headerCell: React.CSSProperties = {
  padding: space[3],
  borderRight: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
};
const planHeader: React.CSSProperties = {
  ...headerCell,
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
};
const categoryRow: React.CSSProperties = {
  padding: `${space[2]}px ${space[3]}px`,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  color: 'var(--color-text-secondary)',
  background: 'var(--color-bg-inset, #101012)',
  borderRight: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
};
const featureCell: React.CSSProperties = {
  padding: space[3],
  fontSize: fontSize.sm,
  color: 'var(--color-text-primary)',
  borderRight: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
};
const valueCell: React.CSSProperties = {
  padding: space[3],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRight: '1px solid var(--color-border, rgba(255,255,255,0.08))',
  borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.08))',
};
const footnote: React.CSSProperties = {
  margin: 0,
  fontSize: fontSize.xs,
  color: 'var(--color-text-tertiary, rgba(255,255,255,0.55))',
};
