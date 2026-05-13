/**
 * Phase 15 — Workspace Snapshot
 * ----------------------------------------------------------------------------
 * Captures and restores a workspace's window placement, focus, and active
 * app set so a user can save layouts ("Studio", "Triage", "Compose") and
 * jump between them, and so the shell can recover gracefully after a crash.
 *
 * Pure data: no DOM, no IPC. Renderers translate window IDs back into live
 * windows via their own registry.
 */

export interface WindowPlacement {
    id: string;
    appId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
    maximized: boolean;
    z: number;
}

export interface WorkspaceSnapshot {
    version: 1;
    label: string;
    createdAt: number;
    focusedId: string | null;
    windows: WindowPlacement[];
}

export interface SnapshotStoreOpts {
    /** Maximum named snapshots retained. */
    maxNamed?: number;
    /** Maximum auto-recovery snapshots retained. */
    maxAuto?: number;
}

function clonePlacement(w: WindowPlacement): WindowPlacement {
    return {
        id: w.id,
        appId: w.appId,
        x: Number.isFinite(w.x) ? w.x : 0,
        y: Number.isFinite(w.y) ? w.y : 0,
        width: Number.isFinite(w.width) && w.width > 0 ? w.width : 0,
        height: Number.isFinite(w.height) && w.height > 0 ? w.height : 0,
        minimized: !!w.minimized,
        maximized: !!w.maximized,
        z: Number.isFinite(w.z) ? Math.trunc(w.z) : 0,
    };
}

export class WorkspaceSnapshotStore {
    private named: Map<string, WorkspaceSnapshot> = new Map();
    private auto: WorkspaceSnapshot[] = [];
    private readonly maxNamed: number;
    private readonly maxAuto: number;

    constructor(opts?: SnapshotStoreOpts) {
        this.maxNamed = Math.max(1, Math.min(50, opts?.maxNamed ?? 20));
        this.maxAuto = Math.max(1, Math.min(20, opts?.maxAuto ?? 5));
    }

    capture(label: string, windows: WindowPlacement[], focusedId: string | null, now: number = Date.now()): WorkspaceSnapshot {
        const snap: WorkspaceSnapshot = {
            version: 1,
            label,
            createdAt: now,
            focusedId,
            windows: windows.map(clonePlacement),
        };
        return snap;
    }

    saveNamed(snap: WorkspaceSnapshot): void {
        this.named.set(snap.label, snap);
        // Evict oldest if over cap.
        if (this.named.size > this.maxNamed) {
            const oldest = Array.from(this.named.values()).sort((a, b) => a.createdAt - b.createdAt)[0];
            if (oldest) this.named.delete(oldest.label);
        }
    }

    saveAuto(snap: WorkspaceSnapshot): void {
        this.auto.push(snap);
        while (this.auto.length > this.maxAuto) this.auto.shift();
    }

    listNamed(): WorkspaceSnapshot[] {
        return Array.from(this.named.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    listAuto(): WorkspaceSnapshot[] {
        return this.auto.slice();
    }

    getNamed(label: string): WorkspaceSnapshot | undefined {
        return this.named.get(label);
    }

    deleteNamed(label: string): boolean {
        return this.named.delete(label);
    }

    /** Most recent auto snapshot, used for crash recovery prompts. */
    latestAuto(): WorkspaceSnapshot | undefined {
        return this.auto[this.auto.length - 1];
    }

    serialize(): string {
        return JSON.stringify({
            version: 1,
            named: this.listNamed(),
            auto: this.auto,
        });
    }

    static deserialize(raw: string, opts?: SnapshotStoreOpts): WorkspaceSnapshotStore {
        const store = new WorkspaceSnapshotStore(opts);
        try {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.named)) {
                for (const s of parsed.named as WorkspaceSnapshot[]) {
                    if (s && typeof s.label === 'string' && Array.isArray(s.windows)) {
                        store.saveNamed({
                            version: 1,
                            label: s.label,
                            createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
                            focusedId: typeof s.focusedId === 'string' ? s.focusedId : null,
                            windows: s.windows.map(clonePlacement),
                        });
                    }
                }
            }
            if (parsed && Array.isArray(parsed.auto)) {
                for (const s of parsed.auto as WorkspaceSnapshot[]) {
                    if (s && Array.isArray(s.windows)) {
                        store.saveAuto({
                            version: 1,
                            label: typeof s.label === 'string' ? s.label : 'auto',
                            createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
                            focusedId: typeof s.focusedId === 'string' ? s.focusedId : null,
                            windows: s.windows.map(clonePlacement),
                        });
                    }
                }
            }
        } catch {
            /* ignore malformed input */
        }
        return store;
    }
}

/**
 * Diff two snapshots — useful for "Restore changed N windows" UX so the user
 * is informed what restoration will do before they commit.
 */
export interface SnapshotDiff {
    added: string[];
    removed: string[];
    moved: string[];
    resized: string[];
    focusChanged: boolean;
}

export function diffSnapshots(prev: WorkspaceSnapshot, next: WorkspaceSnapshot): SnapshotDiff {
    const prevById = new Map(prev.windows.map((w) => [w.id, w] as const));
    const nextById = new Map(next.windows.map((w) => [w.id, w] as const));
    const added: string[] = [];
    const removed: string[] = [];
    const moved: string[] = [];
    const resized: string[] = [];
    for (const [id, n] of nextById) {
        const p = prevById.get(id);
        if (!p) {
            added.push(id);
            continue;
        }
        if (p.x !== n.x || p.y !== n.y) moved.push(id);
        if (p.width !== n.width || p.height !== n.height) resized.push(id);
    }
    for (const id of prevById.keys()) {
        if (!nextById.has(id)) removed.push(id);
    }
    return {
        added,
        removed,
        moved,
        resized,
        focusChanged: prev.focusedId !== next.focusedId,
    };
}
