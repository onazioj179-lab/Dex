/**
 * Phase 15 — Menu / Toolbar Overflow Planner
 * ----------------------------------------------------------------------------
 * Pure layout solver that decides which toolbar items remain visible and which
 * collapse into a compact "more" overflow group. Honors per-item priority and
 * pinning so high-value controls (Save, Run, Share) never get hidden.
 */

export interface ToolbarItem {
    id: string;
    /** Pixel width when rendered in the current density. */
    width: number;
    /** Higher priority = stays visible longer. Default 0. */
    priority?: number;
    /** When true, never collapses into overflow. */
    pinned?: boolean;
}

export interface OverflowPlan {
    visibleIds: string[];
    overflowIds: string[];
    /** True iff at least one item went into the overflow bucket. */
    hasOverflow: boolean;
    /** Total width of visible items + the overflow chevron when present. */
    usedWidth: number;
}

export interface PlanOpts {
    /** Pixels reserved for the "more" chevron. */
    overflowWidth?: number;
    /** Spacing inserted between items. */
    gap?: number;
}

/**
 * Plan a toolbar layout. Greedy by priority then declaration order:
 * 1. All pinned items are always visible.
 * 2. Among the rest, items are kept in declaration order until budget is hit.
 * 3. When at least one item must overflow, the chevron itself is reserved.
 */
export function planToolbarOverflow(items: ToolbarItem[], availableWidth: number, opts: PlanOpts = {}): OverflowPlan {
    const overflowWidth = Math.max(0, opts.overflowWidth ?? 32);
    const gap = Math.max(0, opts.gap ?? 4);
    const budget = Math.max(0, availableWidth);

    // Validate item widths defensively; treat negatives/NaN as zero.
    const safe = items.map((it) => ({
        ...it,
        width: Number.isFinite(it.width) && it.width > 0 ? it.width : 0,
    }));

    const totalNoChevron = sumWidths(safe, gap);
    if (totalNoChevron <= budget) {
        return {
            visibleIds: safe.map((i) => i.id),
            overflowIds: [],
            hasOverflow: false,
            usedWidth: totalNoChevron,
        };
    }

    // We will overflow. Reserve room for the chevron.
    const effectiveBudget = Math.max(0, budget - overflowWidth - (safe.length > 0 ? gap : 0));
    const visible: ToolbarItem[] = [];
    const overflow: ToolbarItem[] = [];

    // Always include pinned items first (in original order).
    let used = 0;
    let count = 0;
    for (const it of safe) {
        if (!it.pinned) continue;
        const cost = it.width + (count > 0 ? gap : 0);
        used += cost;
        count++;
        visible.push(it);
    }
    if (used > effectiveBudget) {
        // Pinned alone overflow the budget — accept it; we never hide pinned.
    }

    // Sort remaining by descending priority, stable on original index.
    const remaining = safe
        .map((it, idx) => ({ it, idx }))
        .filter((e) => !e.it.pinned)
        .sort((a, b) => (b.it.priority ?? 0) - (a.it.priority ?? 0) || a.idx - b.idx);

    for (const { it } of remaining) {
        const cost = it.width + (count > 0 ? gap : 0);
        if (used + cost <= effectiveBudget) {
            used += cost;
            count++;
            visible.push(it);
        } else {
            overflow.push(it);
        }
    }

    // Restore original declaration order in the visible list for stable rendering.
    const order = new Map(safe.map((it, i) => [it.id, i] as const));
    visible.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    overflow.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return {
        visibleIds: visible.map((i) => i.id),
        overflowIds: overflow.map((i) => i.id),
        hasOverflow: overflow.length > 0,
        usedWidth: used + (overflow.length > 0 ? overflowWidth + gap : 0),
    };
}

function sumWidths(items: ToolbarItem[], gap: number): number {
    if (items.length === 0) return 0;
    let total = 0;
    for (let i = 0; i < items.length; i++) {
        total += items[i].width;
        if (i > 0) total += gap;
    }
    return total;
}
