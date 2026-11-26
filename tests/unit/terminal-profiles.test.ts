// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  FONT_DEFAULT, FONT_MAX, FONT_MIN, clampFontSize, folderLabel, parsePaneProfiles, parseSettings,
  prunePaneProfiles, requestTerminalAt, shellBaseName, shellForNewTab, takeTerminalRequests, type ShellInfo,
} from '../../src/renderer/components/terminalProfiles';

const SHELLS: ShellInfo[] = [
  { id: 'pwsh', label: 'PowerShell 7', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', default: true },
  { id: 'cmd', label: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
];

describe('terminal profiles', () => {
  it('clamps the text size and falls back to the default on junk', () => {
    expect(clampFontSize(4)).toBe(FONT_MIN);
    expect(clampFontSize(99)).toBe(FONT_MAX);
    expect(clampFontSize(14.4)).toBe(14);
    expect(clampFontSize('big')).toBe(FONT_DEFAULT);
    expect(clampFontSize(NaN)).toBe(FONT_DEFAULT);
  });

  it('reads settings defensively', () => {
    expect(parseSettings(null)).toEqual({ fontSize: FONT_DEFAULT, defaultShell: null, scheme: 'dex' });
    expect(parseSettings('{not json')).toEqual({ fontSize: FONT_DEFAULT, defaultShell: null, scheme: 'dex' });
    expect(parseSettings(JSON.stringify({ fontSize: 400, defaultShell: 42 }))).toEqual({ fontSize: FONT_MAX, defaultShell: null, scheme: 'dex' });
    expect(parseSettings(JSON.stringify({ fontSize: 16, defaultShell: SHELLS[1].path }))).toEqual({ fontSize: 16, defaultShell: SHELLS[1].path, scheme: 'dex' });
  });

  it('keeps pane profiles only for panes that still exist', () => {
    const raw = JSON.stringify({ t1: { shell: 'a.exe', cwd: 'C:\\x' }, gone: { shell: 'b.exe' }, t2: { cwd: 7 }, t3: 'nope' });
    expect(parsePaneProfiles(raw, ['t1', 't2', 't3'])).toEqual({ t1: { shell: 'a.exe', cwd: 'C:\\x' } });
    expect(parsePaneProfiles('[[', ['t1'])).toEqual({});
  });

  it('prunes closed panes and returns the same object when nothing changed', () => {
    const p = { t1: { shell: 'a' }, p2: { cwd: 'b' } };
    expect(prunePaneProfiles(p, ['t1', 'p2', 't9'])).toBe(p);
    expect(prunePaneProfiles(p, ['t1'])).toEqual({ t1: { shell: 'a' } });
  });

  it('uses the saved default shell only while it is installed', () => {
    expect(shellForNewTab({ fontSize: 13, defaultShell: null }, SHELLS)).toBeUndefined();
    expect(shellForNewTab({ fontSize: 13, defaultShell: 'c:\\windows\\system32\\CMD.EXE' }, SHELLS)).toBe(SHELLS[1].path);
    expect(shellForNewTab({ fontSize: 13, defaultShell: 'C:\\gone\\fish.exe' }, SHELLS)).toBeUndefined();
  });

  it('labels shells and folders', () => {
    expect(shellBaseName('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('pwsh');
    expect(shellBaseName('/usr/bin/zsh')).toBe('zsh');
    expect(shellBaseName(undefined)).toBe('');
    expect(folderLabel('C:\\Users\\me\\project\\')).toBe('project');
    expect(folderLabel('/home/me/src')).toBe('src');
  });

  it('queues open-in-folder requests and hands each out once', () => {
    takeTerminalRequests();
    requestTerminalAt('  ');
    requestTerminalAt('C:\\work');
    requestTerminalAt('D:\\data');
    expect(takeTerminalRequests()).toEqual(['C:\\work', 'D:\\data']);
    expect(takeTerminalRequests()).toEqual([]);
  });
});
