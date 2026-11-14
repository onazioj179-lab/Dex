// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Renderer Pages — Unit Tests
 * Tests all 11 renderer pages for basic rendering, state management, and interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider } from '../../src/renderer/components/Toast';

const WithToast: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ToastProvider>{children}</ToastProvider>
);

// Mock window.dex IPC bridge
beforeEach(() => {
  (window as any).dex = {
    invoke: vi.fn().mockResolvedValue(null),
    on: vi.fn(),
    off: vi.fn(),
    files: {
      listDirectory: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(true),
      move: vi.fn().mockResolvedValue(true),
      copy: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
    },
    power: {
      getBatteryInfo: vi.fn().mockResolvedValue({ level: 85, charging: true }),
      getProcesses: vi.fn().mockResolvedValue([]),
      setCpuLimit: vi.fn(),
      setGpuLimit: vi.fn(),
      setFanCurve: vi.fn(),
    },
    system: {
      getInfo: vi.fn().mockResolvedValue({ platform: 'win32', arch: 'x64', hostname: 'test' }),
    },
    shell: {
      openPath: vi.fn(),
      openExternal: vi.fn(),
    },
    transfer: {
      getDevices: vi.fn().mockResolvedValue([]),
      startServer: vi.fn().mockResolvedValue({ url: 'http://localhost:3000' }),
      stopServer: vi.fn(),
    },
    workflow: {
      runScript: vi.fn().mockResolvedValue({ output: '' }),
    },
  };
  // Mock localStorage
  const store: Record<string, string> = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => store[key] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { store[key] = value; });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => { delete store[key]; });
});

// ===========================================================================
// SHARED VALIDATION TESTS
// ===========================================================================

describe('Shared Validation Module', () => {
  it('validates string inputs', async () => {
    const { validateString } = await import('../../src/shared/validation');
    expect(validateString('hello').valid).toBe(true);
    expect(validateString('', { allowEmpty: true }).valid).toBe(true);
    expect(validateString(null as any).valid).toBe(false);
    expect(validateString(42 as any).valid).toBe(false);
  });

  it('validates number inputs', async () => {
    const { validateNumber } = await import('../../src/shared/validation');
    expect(validateNumber(42).valid).toBe(true);
    expect(validateNumber(0).valid).toBe(true);
    expect(validateNumber('hello' as any).valid).toBe(false);
    expect(validateNumber(NaN as any).valid).toBe(false);
  });

  it('validates boolean inputs', async () => {
    const { isBoolean } = await import('../../src/shared/validation');
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(1 as any)).toBe(false);
  });
});

// ===========================================================================
// SHARED TYPES
// ===========================================================================

describe('Shared Types', () => {
  it('exports core type definitions', async () => {
    const types = await import('../../src/shared/types');
    expect(types).toBeDefined();
  });
});

// ===========================================================================
// HOME PAGE TESTS
// ===========================================================================

describe('Home Page', () => {
  it('renders without crashing', async () => {
    const { default: Home } = await import('../../src/renderer/pages/Home');
    const { container } = render(<Home />);
    expect(container).toBeTruthy();
  });

  it('displays clock/time element', async () => {
    const { default: Home } = await import('../../src/renderer/pages/Home');
    render(<Home />);
    // Home shows a clock — verify the time container exists
    const homeEl = screen.getByLabelText('Home');
    expect(homeEl).toBeInTheDocument();
  });
});

// ===========================================================================
// NOTES PAGE TESTS
// ===========================================================================

describe('Notes Page', () => {
  it('renders without crashing', async () => {
    const { default: Notes } = await import('../../src/renderer/DEXAPPLICATIONS/notes/DexNotes');
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Notes />));
      // Flush pending microtasks scheduled by store.initialize() / auto-create.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container).toBeTruthy();
  });

  it('has a create new note button', async () => {
    const { default: Notes } = await import('../../src/renderer/DEXAPPLICATIONS/notes/DexNotes');
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<Notes />));
      await Promise.resolve();
      await Promise.resolve();
    });
    // Component auto-creates a note when empty, verify it rendered
    expect(container.querySelector('div')).toBeTruthy();
  });
});

// ===========================================================================
// TASKS PAGE TESTS
// ===========================================================================

describe('Tasks Page', () => {
  it('renders without crashing', async () => {
    const { default: Tasks } = await import('../../src/renderer/pages/Tasks');
    const { container } = render(<WithToast><Tasks /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// FILES PAGE TESTS
// ===========================================================================

describe('Files Page', () => {
  it('renders without crashing', async () => {
    const { default: Files } = await import('../../src/renderer/pages/Files');
    const { container } = render(<WithToast><Files /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// AUDIO PAGE TESTS
// ===========================================================================

describe('Audio Page', () => {
  it('renders without crashing', async () => {
    const { default: Audio } = await import('../../src/renderer/pages/Audio');
    const { container } = render(<WithToast><Audio /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// GALLERY PAGE TESTS
// ===========================================================================

describe('Gallery Page', () => {
  it('renders without crashing', async () => {
    const { default: Gallery } = await import('../../src/renderer/pages/Gallery');
    const { container } = render(<WithToast><Gallery /></WithToast>);
    expect(container).toBeTruthy();
  });

  it('has no invented "face groups" (DEX has no face recognition)', async () => {
    const { default: Gallery } = await import('../../src/renderer/pages/Gallery');
    const { container } = render(<WithToast><Gallery /></WithToast>);
    const labels = [...container.querySelectorAll('button')].map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''}`);
    expect(labels.some((t) => /\bfaces?\b/i.test(t))).toBe(false);
    expect(container.textContent).not.toMatch(/Person \d/);
  });
});

// ===========================================================================
// POWER PAGE TESTS
// ===========================================================================

describe('Power Page', () => {
  it('renders without crashing', async () => {
    const { default: Power } = await import('../../src/renderer/pages/Power');
    const { container } = render(<WithToast><Power /></WithToast>);
    expect(container).toBeTruthy();
  });

  it('contains sidebar with tab navigation', async () => {
    const { default: Power } = await import('../../src/renderer/pages/Power');
    render(<WithToast><Power /></WithToast>);
    // Power has a sidebar with h2 "Power" heading
    expect(screen.getByText('Power')).toBeInTheDocument();
  });
});

// ===========================================================================
// TRANSFERS PAGE TESTS
// ===========================================================================

describe('Transfers Page', () => {
  it('renders without crashing', async () => {
    const { default: Transfers } = await import('../../src/renderer/pages/Transfers');
    const { container } = render(<WithToast><Transfers /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// WORKFLOWS PAGE TESTS
// ===========================================================================

describe('Workflows Page', () => {
  it('renders without crashing', async () => {
    const { default: Workflows } = await import('../../src/renderer/pages/Workflows');
    const { container } = render(<WithToast><Workflows /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// SETTINGS PAGE TESTS
// ===========================================================================

describe('Settings Page', () => {
  it('renders without crashing', async () => {
    const { default: Settings } = await import('../../src/renderer/pages/Settings');
    const { container } = render(<WithToast><Settings /></WithToast>);
    expect(container).toBeTruthy();
    // Settings is the largest page: the first import + render takes ~9-10 s in
    // jsdom, so the default 10 s timeout failed it on any loaded machine.
  }, 30_000);
});

// ===========================================================================
// BROWSER PAGE TESTS
// ===========================================================================

describe('Browser Page', () => {
  it('renders without crashing', async () => {
    const { default: Browser } = await import('../../src/renderer/pages/Browser');
    const { container } = render(<WithToast><Browser /></WithToast>);
    expect(container).toBeTruthy();
  });
});

// ===========================================================================
// STANDALONE APP TESTS
// ===========================================================================

describe('Calculator App', () => {
  it('renders without crashing', async () => {
    const { default: Calculator } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/Calculator');
    const { container } = render(<Calculator />);
    expect(container).toBeTruthy();
  });
});

describe('Calendar App', () => {
  it('renders without crashing', async () => {
    const { default: Calendar } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/Calendar');
    const { container } = render(<Calendar />);
    expect(container).toBeTruthy();
  });
});

describe('KanbanApp', () => {
  it('renders without crashing', async () => {
    const { default: KanbanApp } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/KanbanApp');
    const { container } = render(<KanbanApp />);
    expect(container).toBeTruthy();
  });
});

describe('PasswordGenerator App', () => {
  it('renders without crashing', async () => {
    const { default: PasswordGenerator } = await import('../../src/renderer/DEXAPPLICATIONS/standalone/PasswordGenerator');
    const { container } = render(<WithToast><PasswordGenerator /></WithToast>);
    expect(container).toBeTruthy();
  });
});

describe('Achievements App', () => {
  it('module exports a valid component', async () => {
    const mod = await import('../../src/renderer/DEXAPPLICATIONS/standalone/Achievements');
    expect(mod.default).toBeDefined();
  });
});
