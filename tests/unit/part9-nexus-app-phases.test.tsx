import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { appLifecycle } from '../../src/renderer/services/AppLifecycle';
import { useRunningApps } from '../../src/renderer/store/runningApps';
import TaskManager from '../../src/renderer/pages/TaskManager';

describe('AppLifecycle observers', () => {
  it('reports which apps handle phases and notifies global observers', () => {
    expect(appLifecycle.handles('phase-test-a')).toBe(false);
    const off = appLifecycle.subscribe('phase-test-a', () => {});
    expect(appLifecycle.handles('phase-test-a')).toBe(true);
    const seen: string[] = [];
    const offAll = appLifecycle.subscribeAll((id, p) => seen.push(`${id}:${p}`));
    appLifecycle.setPhase('phase-test-a', 'suspended');
    appLifecycle.setPhase('phase-test-a', 'suspended'); // no change, no event
    expect(seen).toEqual(['phase-test-a:suspended']);
    off(); offAll();
    expect(appLifecycle.handles('phase-test-a')).toBe(false);
  });
});

describe('Nexus / Task Manager: open apps show real phases', () => {
  it('no fake governance select; Suspend/Resume only for apps that handle it', () => {
    const offPrism = appLifecycle.subscribe('prism', () => {});
    appLifecycle.setPhase('prism', 'background');
    appLifecycle.setPhase('calculator', 'background');
    useRunningApps.setState({
      currentAppId: 'taskmanager',
      runningApps: [
        { id: 'prism', name: 'Prism', icon: 'prism', color: '#0A84FF', launchedAt: Date.now(), lastActiveAt: Date.now(), isMinimized: false },
        { id: 'calculator', name: 'Calculator', icon: 'calculator', color: '#0A84FF', launchedAt: Date.now(), lastActiveAt: Date.now(), isMinimized: false },
      ],
    });
    try {
      render(<TaskManager />);
      expect(screen.queryByLabelText(/Set governance/)).toBeNull();
      expect(screen.queryByRole('button', { name: /Suspend Calculator/ })).toBeNull();
      const suspend = screen.getByRole('button', { name: /Suspend Prism/i });
      act(() => { fireEvent.click(suspend); });
      expect(appLifecycle.getPhase('prism')).toBe('suspended');
      const resume = screen.getByRole('button', { name: /Resume Prism/i });
      act(() => { fireEvent.click(resume); });
      expect(appLifecycle.getPhase('prism')).toBe('background');
    } finally {
      offPrism();
    }
  });
});
