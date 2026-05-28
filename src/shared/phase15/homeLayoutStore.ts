// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 15 — Home Layout Store
 * ----------------------------------------------------------------------------
 * Persistent, semantic-version-tolerant store for Home widget placement. The
 * shell can pin Spotlight modules, custom widgets, app shortcuts, or saved
 * searches at fractional coordinates so the layout survives resolution and
 * density changes.
 *
 * Pure data layer — serialization, normalization, snapshot/restore. No DOM,
 * no React. Designed to be backed by `localStorage`, IPC, or sync transport.
 */

export type WidgetKind = 'spotlight' | 'app' | 'workflow' | 'search' | 'custom';

export interface HomeWidget {
    id: string;
    kind: WidgetKind;
    /** Source identifier (e.g. spotlight module id, app id, search query id). */
    sourceId: string;
    /** Fractional grid coords in [0,1]. Renderer maps to current Home rect. */
    x: number;
    y: number;
    /** Fractional cell size in [0,1]. Min enforced at 0.05 to stay clickable. */
    w: number;
    h: number;
    /** Pinned widgets are not auto-tidied by reflow operations. */
    pinned: boolean;
    /** Higher = drawn later. Renderer may map to z-index buckets. */
    z: number;
}

export interface HomeLayoutSnapshot {
    version: 1;
    widgets: HomeWidget[];
    /** ms since epoch, for display + dedupe. */
    savedAt: number;
    /** Optional human label, e.g. "Focus", "Triage", "Studio". */
    label?: string;
}

const MIN_SIZE = 0.05;
const MAX_SIZE = 1;

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function clampSize(n: number): number {
    if (!Number.isFinite(n)) return MIN_SIZE;
    if (n < MIN_SIZE) return MIN_SIZE;
    if (n > MAX_SIZE) return MAX_SIZE;
    return n;
}

export function normalizeWidget(w: HomeWidget): HomeWidget {
    const x = clamp01(w.x);
    const y = clamp01(w.y);
    const wSize = clampSize(w.w);
    const hSize = clampSize(w.h);
    // Keep the widget fully inside the unit square.
    const fitX = Math.min(x, 1 - wSize);
    const fitY = Math.min(y, 1 - hSize);
    return {
        ...w,
        x: clamp01(fitX),
        y: clamp01(fitY),
        w: wSize,
        h: hSize,
        z: Number.isFinite(w.z) ? Math.trunc(w.z) : 0,
        pinned: !!w.pinned,
    };
}

export class HomeLayoutStore {
    private widgets: Map<string, HomeWidget> = new Map();
    private snapshots: HomeLayoutSnapshot[] = [];
    private readonly maxSnapshots: number;

    constructor(opts?: { maxSnapshots?: number }) {
        this.maxSnapshots = Math.max(1, Math.min(50, opts?.maxSnapshots ?? 10));
    }

    /** Add or replace a widget. Returns the normalized widget. */
    upsert(w: HomeWidget): HomeWidget {
        const norm = normalizeWidget(w);
        this.widgets.set(norm.id, norm);
        return norm;
    }

    remove(id: string): boolean {
        return this.widgets.delete(id);
    }

    get(id: string): HomeWidget | undefined {
        return this.widgets.get(id);
    }

    list(): HomeWidget[] {
        return Array.from(this.widgets.values()).sort((a, b) => a.z - b.z || a.id.localeCompare(b.id));
    }

    /** Replace all widgets (e.g. after restoring a snapshot or remote sync). */
    replaceAll(widgets: HomeWidget[]): void {
        this.widgets.clear();
        for (const w of widgets) this.widgets.set(w.id, normalizeWidget(w));
    }

    /** Save the current layout into the rolling snapshot buffer. */
    snapshot(label?: string, now: number = Date.now()): HomeLayoutSnapshot {
        const snap: HomeLayoutSnapshot = {
            version: 1,
            widgets: this.list(),
            savedAt: now,
            label,
        };
        this.snapshots.push(snap);
        while (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
        return snap;
    }

    snapshots_(): HomeLayoutSnapshot[] {
        return this.snapshots.slice();
    }

    /** Restore a snapshot by index (latest=last). Returns true on success. */
    restoreAt(index: number): boolean {
        const snap = this.snapshots[index];
        if (!snap) return false;
        this.replaceAll(snap.widgets);
        return true;
    }

    /** Toggle pin for a widget. Returns the new pinned state, or null if missing. */
    togglePin(id: string): boolean | null {
        const w = this.widgets.get(id);
        if (!w) return null;
        const next = { ...w, pinned: !w.pinned };
        this.widgets.set(id, next);
        return next.pinned;
    }

    /**
     * Tidy the layout: stack non-pinned widgets in row-major order on a
     * `cols`-column grid using uniform cell size. Pinned widgets are left
     * untouched. Useful for "auto-organize" actions.
     */
    tidy(cols: number = 6, rowHeight: number = 0.18): void {
        const c = Math.max(1, Math.min(12, Math.trunc(cols)));
        const cellW = 1 / c;
        let i = 0;
        const next = this.list().map((w) => {
            if (w.pinned) return w;
            const col = i % c;
            const row = Math.floor(i / c);
            i++;
            return normalizeWidget({
                ...w,
                x: col * cellW,
                y: row * rowHeight,
                w: cellW * 0.95,
                h: rowHeight * 0.9,
            });
        });
        this.replaceAll(next);
    }

    /** Serialize for persistence. */
    serialize(): string {
        return JSON.stringify({ version: 1, widgets: this.list(), snapshots: this.snapshots });
    }

    /** Hydrate from serialized state. Tolerant to missing/extra fields. */
    static deserialize(raw: string): HomeLayoutStore {
        const store = new HomeLayoutStore();
        try {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.widgets)) {
                store.replaceAll(parsed.widgets as HomeWidget[]);
            }
            if (parsed && Array.isArray(parsed.snapshots)) {
                for (const s of parsed.snapshots as HomeLayoutSnapshot[]) {
                    if (s && Array.isArray(s.widgets)) {
                        store.snapshots.push({
                            version: 1,
                            widgets: s.widgets.map(normalizeWidget),
                            savedAt: typeof s.savedAt === 'number' ? s.savedAt : Date.now(),
                            label: typeof s.label === 'string' ? s.label : undefined,
                        });
                    }
                }
                while (store.snapshots.length > store.maxSnapshots) store.snapshots.shift();
            }
        } catch {
            /* malformed input -> empty store, never throw at boot */
        }
        return store;
    }
}
