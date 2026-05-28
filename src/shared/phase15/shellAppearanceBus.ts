// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Phase 15 — Shell Appearance Bus
 * ----------------------------------------------------------------------------
 * A single, side-effect-free state container for the shell-wide appearance
 * preferences the OS exposes (theme, transparency, motion, density, contrast).
 *
 * Surfaces (AppManager, FloatingWindow, Settings, lightweight utility apps)
 * subscribe and translate the resolved profile into CSS variables. Creative
 * apps may opt out of transparency/motion entirely while still consuming the
 * same theme + contrast tokens, satisfying the "creative apps maintain
 * optimized rendering" requirement.
 *
 * The bus is deliberately framework-free so it can be unit tested without a
 * DOM and reused from worker contexts (e.g. preview compositors).
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type DensityMode = 'compact' | 'regular' | 'comfortable';
export type ContrastMode = 'normal' | 'high';

export interface ShellAppearanceProfile {
    /** User-selected theme. `system` follows OS, resolved via [[resolveTheme]]. */
    theme: ThemeMode;
    /** Master switch for translucent shell surfaces (panels, menus, dock). */
    transparency: boolean;
    /** When true, transparency is allowed but heavily damped (a11y request). */
    reducedTransparency: boolean;
    /** When true, all non-essential motion is suppressed. */
    reducedMotion: boolean;
    /** UI compactness for menus, lists, toolbars. */
    density: DensityMode;
    /** Contrast preset; `high` boosts foreground tokens. */
    contrast: ContrastMode;
    /** Allow GPU-heavy blur tiers; users on integrated GPUs may turn off. */
    allowHeavyBlur: boolean;
}

export const DEFAULT_APPEARANCE: Readonly<ShellAppearanceProfile> = Object.freeze({
    theme: 'system',
    transparency: true,
    reducedTransparency: false,
    reducedMotion: false,
    density: 'regular',
    contrast: 'normal',
    allowHeavyBlur: true,
});

/** Clamp / coerce arbitrary input into a valid profile. */
export function normalizeAppearance(input: Partial<ShellAppearanceProfile> | null | undefined): ShellAppearanceProfile {
    const src = input ?? {};
    const theme: ThemeMode = src.theme === 'light' || src.theme === 'dark' || src.theme === 'system' ? src.theme : DEFAULT_APPEARANCE.theme;
    const density: DensityMode =
        src.density === 'compact' || src.density === 'regular' || src.density === 'comfortable' ? src.density : DEFAULT_APPEARANCE.density;
    const contrast: ContrastMode = src.contrast === 'high' ? 'high' : 'normal';
    return {
        theme,
        transparency: src.transparency !== false,
        reducedTransparency: !!src.reducedTransparency,
        reducedMotion: !!src.reducedMotion,
        density,
        contrast,
        allowHeavyBlur: src.allowHeavyBlur !== false,
    };
}

/** Resolve `system` theme against an OS hint (typically `prefers-color-scheme`). */
export function resolveTheme(profile: ShellAppearanceProfile, systemPrefersDark: boolean): ResolvedTheme {
    if (profile.theme === 'light') return 'light';
    if (profile.theme === 'dark') return 'dark';
    return systemPrefersDark ? 'dark' : 'light';
}

/**
 * The CSS variable surface contract. Renderers (or tests) can apply this map
 * however they want; the bus never touches the DOM itself.
 */
export interface AppearanceCssVars {
    '--dex-theme': ResolvedTheme;
    '--dex-transparency': '0' | '1';
    '--dex-blur-tier': 'off' | 'eco' | 'standard' | 'high';
    '--dex-motion': 'on' | 'off';
    '--dex-density': DensityMode;
    '--dex-contrast': ContrastMode;
}

/**
 * Compute the CSS variable map for a profile.
 *
 * Rules:
 * - `transparency=false` forces blur tier to `off` regardless of `allowHeavyBlur`.
 * - `reducedTransparency=true` caps blur tier at `eco`.
 * - `allowHeavyBlur=false` caps blur tier at `standard`.
 * - `reducedMotion=true` overrides density-driven motion choices.
 */
export function appearanceToCssVars(profile: ShellAppearanceProfile, systemPrefersDark: boolean): AppearanceCssVars {
    const theme = resolveTheme(profile, systemPrefersDark);
    let blur: AppearanceCssVars['--dex-blur-tier'];
    if (!profile.transparency) {
        blur = 'off';
    } else if (profile.reducedTransparency) {
        blur = 'eco';
    } else if (!profile.allowHeavyBlur) {
        blur = 'standard';
    } else {
        blur = 'high';
    }
    return {
        '--dex-theme': theme,
        '--dex-transparency': profile.transparency ? '1' : '0',
        '--dex-blur-tier': blur,
        '--dex-motion': profile.reducedMotion ? 'off' : 'on',
        '--dex-density': profile.density,
        '--dex-contrast': profile.contrast,
    };
}

/**
 * Whether a creative app should opt out of glass for its own canvas surfaces.
 * Creative canvases never want translucent backdrops on the work area itself,
 * but should still inherit theme + contrast tokens.
 */
export function shouldDisableCanvasGlass(profile: ShellAppearanceProfile): boolean {
    return !profile.transparency || profile.reducedTransparency || !profile.allowHeavyBlur;
}

type Listener = (profile: ShellAppearanceProfile) => void;

/**
 * Tiny pub/sub container so multiple surfaces can react to live changes
 * without pulling in zustand/react in shared code.
 */
export class ShellAppearanceBus {
    private profile: ShellAppearanceProfile;
    private readonly listeners = new Set<Listener>();

    constructor(initial?: Partial<ShellAppearanceProfile>) {
        this.profile = normalizeAppearance(initial);
    }

    get(): ShellAppearanceProfile {
        return this.profile;
    }

    set(patch: Partial<ShellAppearanceProfile>): ShellAppearanceProfile {
        const next = normalizeAppearance({ ...this.profile, ...patch });
        if (shallowEqualProfile(this.profile, next)) return this.profile;
        this.profile = next;
        for (const fn of this.listeners) {
            try {
                fn(next);
            } catch {
                /* listener errors are swallowed so one bad subscriber cannot break the shell */
            }
        }
        return next;
    }

    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    listenerCount(): number {
        return this.listeners.size;
    }
}

function shallowEqualProfile(a: ShellAppearanceProfile, b: ShellAppearanceProfile): boolean {
    return (
        a.theme === b.theme &&
        a.transparency === b.transparency &&
        a.reducedTransparency === b.reducedTransparency &&
        a.reducedMotion === b.reducedMotion &&
        a.density === b.density &&
        a.contrast === b.contrast &&
        a.allowHeavyBlur === b.allowHeavyBlur
    );
}
