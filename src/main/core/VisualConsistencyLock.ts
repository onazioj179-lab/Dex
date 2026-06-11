// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Visual Consistency Lock
// Phase 69: Final Visual Audit
// Lock all visual behaviors - no future drift allowed
// ===========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

// ===========================================================================
// TYPES - LOCKED DESIGN TOKENS
// ===========================================================================

export interface DesignToken {
  name: string;
  value: string;
  category: TokenCategory;
  locked: boolean;
  description?: string;
}

export type TokenCategory = 
  | 'color'
  | 'spacing'
  | 'typography'
  | 'radius'
  | 'shadow'
  | 'animation'
  | 'z-index'
  | 'breakpoint';

export interface VisualRule {
  id: string;
  name: string;
  description: string;
  rule: string;
  enforced: boolean;
}

export interface ConsistencyViolation {
  rule: string;
  component: string;
  expected: string;
  actual: string;
  severity: 'warning' | 'error';
  timestamp: number;
}

// ===========================================================================
// LOCKED DESIGN TOKENS - Phase 69 Final Values
// ===========================================================================

const LOCKED_TOKENS: DesignToken[] = [
  // -- Colors --------------------------------------------------------------
  { name: '--bg-primary', value: '#0f0f0f', category: 'color', locked: true, description: 'Main background' },
  { name: '--bg-secondary', value: '#1a1a1a', category: 'color', locked: true, description: 'Card/panel background' },
  { name: '--bg-tertiary', value: '#252525', category: 'color', locked: true, description: 'Input/elevated background' },
  { name: '--bg-hover', value: '#2a2a2a', category: 'color', locked: true, description: 'Hover state background' },
  { name: '--border-subtle', value: 'rgba(255,255,255,0.06)', category: 'color', locked: true, description: 'Subtle borders' },
  { name: '--border-default', value: 'rgba(255,255,255,0.1)', category: 'color', locked: true, description: 'Default borders' },
  { name: '--text-primary', value: 'rgba(255,255,255,0.95)', category: 'color', locked: true, description: 'Primary text' },
  { name: '--text-secondary', value: 'rgba(255,255,255,0.6)', category: 'color', locked: true, description: 'Secondary text' },
  { name: '--text-tertiary', value: 'rgba(255,255,255,0.4)', category: 'color', locked: true, description: 'Muted text' },
  { name: '--accent-primary', value: '#3b82f6', category: 'color', locked: true, description: 'Primary accent (blue)' },
  { name: '--accent-success', value: '#22c55e', category: 'color', locked: true, description: 'Success green' },
  { name: '--accent-warning', value: '#eab308', category: 'color', locked: true, description: 'Warning yellow' },
  { name: '--accent-error', value: '#ef4444', category: 'color', locked: true, description: 'Error red' },

  // -- Spacing -------------------------------------------------------------
  { name: '--space-xs', value: '4px', category: 'spacing', locked: true, description: 'Extra small spacing' },
  { name: '--space-sm', value: '8px', category: 'spacing', locked: true, description: 'Small spacing' },
  { name: '--space-md', value: '12px', category: 'spacing', locked: true, description: 'Medium spacing' },
  { name: '--space-lg', value: '16px', category: 'spacing', locked: true, description: 'Large spacing' },
  { name: '--space-xl', value: '24px', category: 'spacing', locked: true, description: 'Extra large spacing' },
  { name: '--space-2xl', value: '32px', category: 'spacing', locked: true, description: '2X large spacing' },

  // -- Typography ----------------------------------------------------------
  { name: '--font-family', value: 'Inter, system-ui, sans-serif', category: 'typography', locked: true },
  { name: '--font-mono', value: 'JetBrains Mono, monospace', category: 'typography', locked: true },
  { name: '--font-size-xs', value: '11px', category: 'typography', locked: true },
  { name: '--font-size-sm', value: '12px', category: 'typography', locked: true },
  { name: '--font-size-base', value: '13px', category: 'typography', locked: true },
  { name: '--font-size-lg', value: '14px', category: 'typography', locked: true },
  { name: '--font-size-xl', value: '16px', category: 'typography', locked: true },
  { name: '--font-size-2xl', value: '20px', category: 'typography', locked: true },
  { name: '--font-weight-normal', value: '400', category: 'typography', locked: true },
  { name: '--font-weight-medium', value: '500', category: 'typography', locked: true },
  { name: '--font-weight-semibold', value: '600', category: 'typography', locked: true },
  { name: '--line-height-tight', value: '1.2', category: 'typography', locked: true },
  { name: '--line-height-normal', value: '1.5', category: 'typography', locked: true },
  { name: '--line-height-relaxed', value: '1.75', category: 'typography', locked: true },

  // -- Border Radius -------------------------------------------------------
  { name: '--radius-sm', value: '3px', category: 'radius', locked: true, description: 'Small radius' },
  { name: '--radius-md', value: '4px', category: 'radius', locked: true, description: 'Medium radius' },
  { name: '--radius-lg', value: '6px', category: 'radius', locked: true, description: 'Large radius' },
  { name: '--radius-xl', value: '8px', category: 'radius', locked: true, description: 'Extra large radius' },
  { name: '--radius-full', value: '9999px', category: 'radius', locked: true, description: 'Full/pill radius' },

  // -- Shadows -------------------------------------------------------------
  { name: '--shadow-sm', value: '0 1px 2px rgba(0,0,0,0.3)', category: 'shadow', locked: true },
  { name: '--shadow-md', value: '0 4px 6px rgba(0,0,0,0.4)', category: 'shadow', locked: true },
  { name: '--shadow-lg', value: '0 10px 15px rgba(0,0,0,0.5)', category: 'shadow', locked: true },
  { name: '--shadow-glow', value: '0 0 20px rgba(59,130,246,0.15)', category: 'shadow', locked: true },

  // -- Animations ----------------------------------------------------------
  { name: '--duration-fast', value: '100ms', category: 'animation', locked: true },
  { name: '--duration-normal', value: '200ms', category: 'animation', locked: true },
  { name: '--duration-slow', value: '300ms', category: 'animation', locked: true },
  { name: '--ease-default', value: 'cubic-bezier(0.4, 0, 0.2, 1)', category: 'animation', locked: true },
  { name: '--ease-in', value: 'cubic-bezier(0.4, 0, 1, 1)', category: 'animation', locked: true },
  { name: '--ease-out', value: 'cubic-bezier(0, 0, 0.2, 1)', category: 'animation', locked: true },

  // -- Z-Index -------------------------------------------------------------
  { name: '--z-dropdown', value: '100', category: 'z-index', locked: true },
  { name: '--z-sticky', value: '200', category: 'z-index', locked: true },
  { name: '--z-modal', value: '300', category: 'z-index', locked: true },
  { name: '--z-popover', value: '400', category: 'z-index', locked: true },
  { name: '--z-tooltip', value: '500', category: 'z-index', locked: true },
  { name: '--z-toast', value: '600', category: 'z-index', locked: true },

  // -- Breakpoints ---------------------------------------------------------
  { name: '--breakpoint-sm', value: '640px', category: 'breakpoint', locked: true },
  { name: '--breakpoint-md', value: '768px', category: 'breakpoint', locked: true },
  { name: '--breakpoint-lg', value: '1024px', category: 'breakpoint', locked: true },
  { name: '--breakpoint-xl', value: '1280px', category: 'breakpoint', locked: true }
];

// ===========================================================================
// LOCKED VISUAL RULES
// ===========================================================================

const LOCKED_RULES: VisualRule[] = [
  // -- Icon Rules ----------------------------------------------------------
  {
    id: 'icon-stroke',
    name: 'Icon Stroke Width',
    description: 'All icons must use 1.5px stroke width',
    rule: 'strokeWidth: 1.5',
    enforced: true
  },
  {
    id: 'icon-size-sidebar',
    name: 'Sidebar Icon Size',
    description: 'Sidebar icons are 18x18',
    rule: 'size: 18',
    enforced: true
  },
  {
    id: 'icon-size-action',
    name: 'Action Icon Size',
    description: 'Action/button icons are 16x16',
    rule: 'size: 16',
    enforced: true
  },

  // -- Button Rules --------------------------------------------------------
  {
    id: 'button-height-sm',
    name: 'Small Button Height',
    description: 'Small buttons are 28px tall',
    rule: 'height: 28px',
    enforced: true
  },
  {
    id: 'button-height-md',
    name: 'Medium Button Height',
    description: 'Medium buttons are 32px tall',
    rule: 'height: 32px',
    enforced: true
  },
  {
    id: 'button-height-lg',
    name: 'Large Button Height',
    description: 'Large buttons are 40px tall',
    rule: 'height: 40px',
    enforced: true
  },

  // -- Input Rules ---------------------------------------------------------
  {
    id: 'input-height',
    name: 'Input Height',
    description: 'Standard inputs are 36px tall',
    rule: 'height: 36px',
    enforced: true
  },
  {
    id: 'input-padding',
    name: 'Input Padding',
    description: 'Inputs have 12px horizontal padding',
    rule: 'padding-x: 12px',
    enforced: true
  },

  // -- Card Rules ----------------------------------------------------------
  {
    id: 'card-padding',
    name: 'Card Padding',
    description: 'Cards have 16px padding',
    rule: 'padding: 16px',
    enforced: true
  },
  {
    id: 'card-gap',
    name: 'Card Gap',
    description: 'Card grid has 12px gap',
    rule: 'gap: 12px',
    enforced: true
  },

  // -- Sidebar Rules -------------------------------------------------------
  {
    id: 'sidebar-width',
    name: 'Sidebar Width',
    description: 'Sidebar is 220px wide',
    rule: 'width: 220px',
    enforced: true
  },
  {
    id: 'sidebar-item-height',
    name: 'Sidebar Item Height',
    description: 'Sidebar items are 36px tall',
    rule: 'height: 36px',
    enforced: true
  },

  // -- Animation Rules -----------------------------------------------------
  {
    id: 'hover-transition',
    name: 'Hover Transition',
    description: 'Hover states use 150ms ease',
    rule: 'transition: 150ms ease',
    enforced: true
  },
  {
    id: 'no-bounce',
    name: 'No Bounce Animations',
    description: 'No bounce or spring animations',
    rule: 'ease: cubic-bezier',
    enforced: true
  },

  // -- Text Rules ----------------------------------------------------------
  {
    id: 'truncate-single',
    name: 'Single Line Truncation',
    description: 'Long text truncates with ellipsis',
    rule: 'overflow: ellipsis',
    enforced: true
  }
];

// ===========================================================================
// VISUAL CONSISTENCY LOCK CLASS
// ===========================================================================

class VisualConsistencyLockClass {
  private tokens: Map<string, DesignToken> = new Map();
  private rules: Map<string, VisualRule> = new Map();
  private violations: ConsistencyViolation[] = [];
  private lockEnabled = true;

  constructor() {
    this.initializeTokens();
    this.initializeRules();
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  private initializeTokens(): void {
    for (const token of LOCKED_TOKENS) {
      this.tokens.set(token.name, token);
    }
    log.info(`[VisualConsistency] Loaded ${this.tokens.size} design tokens`);
  }

  private initializeRules(): void {
    for (const rule of LOCKED_RULES) {
      this.rules.set(rule.id, rule);
    }
    log.info(`[VisualConsistency] Loaded ${this.rules.size} visual rules`);
  }

  private setupIPC(): void {
    // Get all tokens
    ipcMain.handle('visual:tokens', () => {
      return this.getAllTokens();
    });

    // Get token by name
    ipcMain.handle('visual:token', (_event, name: string) => {
      return this.getToken(name);
    });

    // Get tokens by category
    ipcMain.handle('visual:tokensByCategory', (_event, category: TokenCategory) => {
      return this.getTokensByCategory(category);
    });

    // Get all rules
    ipcMain.handle('visual:rules', () => {
      return this.getAllRules();
    });

    // Report violation
    ipcMain.handle('visual:reportViolation', (_event, violation: Omit<ConsistencyViolation, 'timestamp'>) => {
      return this.recordViolation(violation);
    });

    // Get violations
    ipcMain.handle('visual:violations', () => {
      return this.getViolations();
    });

    // Generate CSS variables
    ipcMain.handle('visual:generateCSS', () => {
      return this.generateCSS();
    });

    // Validate component
    ipcMain.handle('visual:validate', (_event, component: string, styles: Record<string, string>) => {
      return this.validateComponent(component, styles);
    });
  }

  // -------------------------------------------------------------------------
  // TOKEN ACCESS
  // -------------------------------------------------------------------------

  getToken(name: string): DesignToken | null {
    return this.tokens.get(name) || null;
  }

  getAllTokens(): DesignToken[] {
    return Array.from(this.tokens.values());
  }

  getTokensByCategory(category: TokenCategory): DesignToken[] {
    return Array.from(this.tokens.values()).filter(t => t.category === category);
  }

  getTokenValue(name: string): string | null {
    const token = this.tokens.get(name);
    return token?.value || null;
  }

  // -------------------------------------------------------------------------
  // RULE ACCESS
  // -------------------------------------------------------------------------

  getRule(id: string): VisualRule | null {
    return this.rules.get(id) || null;
  }

  getAllRules(): VisualRule[] {
    return Array.from(this.rules.values());
  }

  // -------------------------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------------------------

  validateComponent(component: string, styles: Record<string, string>): { valid: boolean; violations: string[] } {
    if (!this.lockEnabled) {
      return { valid: true, violations: [] };
    }

    const violations: string[] = [];

    // Check for hardcoded colors instead of tokens
    for (const [prop, value] of Object.entries(styles)) {
      if (prop.includes('color') || prop === 'background' || prop === 'borderColor') {
        if (value.startsWith('#') || value.startsWith('rgb')) {
          // Check if it matches a token
          const matchingToken = Array.from(this.tokens.values()).find(t => 
            t.category === 'color' && t.value === value
          );
          if (!matchingToken) {
            violations.push(`Hardcoded color value: ${prop}: ${value}`);
          }
        }
      }

      // Check for hardcoded spacing
      if (prop.includes('padding') || prop.includes('margin') || prop === 'gap') {
        if (/^\d+px$/.test(value)) {
          const px = parseInt(value);
          const validSpacings = [4, 8, 12, 16, 24, 32];
          if (!validSpacings.includes(px)) {
            violations.push(`Non-standard spacing: ${prop}: ${value}`);
          }
        }
      }

      // Check for hardcoded font sizes
      if (prop === 'fontSize') {
        if (/^\d+px$/.test(value)) {
          const px = parseInt(value);
          const validSizes = [11, 12, 13, 14, 16, 20];
          if (!validSizes.includes(px)) {
            violations.push(`Non-standard font size: ${value}`);
          }
        }
      }
    }

    if (violations.length > 0) {
      for (const v of violations) {
        this.recordViolation({
          rule: 'token-usage',
          component,
          expected: 'Use design tokens',
          actual: v,
          severity: 'warning'
        });
      }
    }

    return { valid: violations.length === 0, violations };
  }

  // -------------------------------------------------------------------------
  // VIOLATIONS
  // -------------------------------------------------------------------------

  recordViolation(violation: Omit<ConsistencyViolation, 'timestamp'>): void {
    const full: ConsistencyViolation = {
      ...violation,
      timestamp: Date.now()
    };

    this.violations.push(full);

    // Keep only last 100 violations
    if (this.violations.length > 100) {
      this.violations.shift();
    }

    log.warn(`[VisualConsistency] Violation: ${violation.rule} in ${violation.component}`);
  }

  getViolations(): ConsistencyViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  // -------------------------------------------------------------------------
  // CSS GENERATION
  // -------------------------------------------------------------------------

  generateCSS(): string {
    const lines: string[] = [
      '/* DEX Design Tokens - LOCKED Phase 69 */',
      '/* Do not modify these values directly */',
      ':root {'
    ];

    // Group by category
    const categories: TokenCategory[] = ['color', 'spacing', 'typography', 'radius', 'shadow', 'animation', 'z-index', 'breakpoint'];
    
    for (const category of categories) {
      const categoryTokens = this.getTokensByCategory(category);
      if (categoryTokens.length > 0) {
        lines.push(`  /* ${category.charAt(0).toUpperCase() + category.slice(1)} */`);
        for (const token of categoryTokens) {
          lines.push(`  ${token.name}: ${token.value};`);
        }
        lines.push('');
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // LOCK CONTROL
  // -------------------------------------------------------------------------

  enableLock(): void {
    this.lockEnabled = true;
    log.info('[VisualConsistency] Lock enabled');
  }

  disableLock(): void {
    this.lockEnabled = false;
    log.warn('[VisualConsistency] Lock disabled - visual consistency not enforced');
  }

  isLocked(): boolean {
    return this.lockEnabled;
  }

  // -------------------------------------------------------------------------
  // EXPORT
  // -------------------------------------------------------------------------

  exportTokensAsJSON(): string {
    const tokensByCategory: Record<string, Record<string, string>> = {};
    
    for (const token of this.tokens.values()) {
      if (!tokensByCategory[token.category]) {
        tokensByCategory[token.category] = {};
      }
      tokensByCategory[token.category][token.name] = token.value;
    }

    return JSON.stringify(tokensByCategory, null, 2);
  }

  exportTokensAsTailwind(): string {
    const config: Record<string, unknown> = {
      colors: {},
      spacing: {},
      fontSize: {},
      borderRadius: {},
      boxShadow: {},
      transitionDuration: {},
      zIndex: {}
    };

    for (const token of this.tokens.values()) {
      const name = token.name.replace(/^--/, '').replace(/-/g, '.');
      
      switch (token.category) {
        case 'color':
          (config.colors as Record<string, string>)[name] = token.value;
          break;
        case 'spacing':
          (config.spacing as Record<string, string>)[name] = token.value;
          break;
        case 'typography':
          if (token.name.includes('font-size')) {
            (config.fontSize as Record<string, string>)[name] = token.value;
          }
          break;
        case 'radius':
          (config.borderRadius as Record<string, string>)[name] = token.value;
          break;
        case 'shadow':
          (config.boxShadow as Record<string, string>)[name] = token.value;
          break;
        case 'animation':
          if (token.name.includes('duration')) {
            (config.transitionDuration as Record<string, string>)[name] = token.value;
          }
          break;
        case 'z-index':
          (config.zIndex as Record<string, string>)[name] = token.value;
          break;
      }
    }

    return JSON.stringify(config, null, 2);
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const VisualConsistencyLock = new VisualConsistencyLockClass();
export default VisualConsistencyLock;
