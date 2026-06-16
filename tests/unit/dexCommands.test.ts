// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { describe, it, expect } from 'vitest';
import {
  crossPlatform,
  resolveShortcut,
  buildDexCommands,
  appCommandsFrom,
  toCommandRegistry,
  matchTerminalCommand,
  findByUtterance,
  suggestDexCommands,
  didYouMean,
  CORE_DEX_COMMANDS,
  type AppDefLike,
} from '../../src/shared/commands/dexCommands';
import { searchCommands } from '../../src/shared/commands/registry';

const APPS: Record<string, AppDefLike> = {
  notes: { name: 'Notes', shortcut: 'Ctrl+4', category: 'productivity' },
  calculator: { name: 'Calculator', shortcut: 'Alt+C', category: 'utility' },
  videoeditor: { name: 'VINX', shortcut: 'Alt+V', category: 'creative', description: 'video editor' },
};

describe('crossPlatform', () => {
  it('derives both desktop forms from a Ctrl shortcut', () => {
    expect(crossPlatform('Ctrl+1')).toEqual({ win: 'Ctrl+1', mac: 'Cmd+1' });
  });
  it('maps Alt to Option for macOS', () => {
    expect(crossPlatform('Alt+C')).toEqual({ win: 'Alt+C', mac: 'Option+C' });
  });
  it('normalizes a Cmd shortcut to Ctrl on Windows', () => {
    expect(crossPlatform('Cmd+Shift+P')).toEqual({ win: 'Ctrl+Shift+P', mac: 'Cmd+Shift+P' });
  });
  it('returns undefined when unbound', () => {
    expect(crossPlatform(undefined)).toBeUndefined();
  });
});

describe('app command derivation', () => {
  it('derives one launch command per app, no duplicate app list', () => {
    const cmds = appCommandsFrom(APPS);
    expect(cmds).toHaveLength(3);
    const notes = cmds.find((c) => c.appId === 'notes')!;
    expect(notes.id).toBe('app.notes');
    expect(notes.label).toBe('Open Notes');
    expect(notes.terminal).toBe('notes');
    expect(notes.shortcut).toEqual({ win: 'Ctrl+4', mac: 'Cmd+4' });
  });
  it('routes creative apps into the Creative group', () => {
    const vinx = appCommandsFrom(APPS).find((c) => c.appId === 'videoeditor')!;
    expect(vinx.group).toBe('Creative');
    expect(vinx.terminal).toBe('vinx'); // from name, not id
  });
});

describe('buildDexCommands', () => {
  const cmds = buildDexCommands(APPS);
  it('combines core + app commands', () => {
    expect(cmds.length).toBe(CORE_DEX_COMMANDS.length + 3);
  });
  it('has globally-unique ids', () => {
    const ids = cmds.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('has unique terminal aliases (no command shadows another)', () => {
    const aliases = cmds.map((c) => c.terminal);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe('matchTerminalCommand', () => {
  const cmds = buildDexCommands(APPS);
  it('matches a bare app alias', () => {
    expect(matchTerminalCommand(cmds, 'notes')?.command.id).toBe('app.notes');
  });
  it('matches with the optional dex prefix + captures args', () => {
    const m = matchTerminalCommand(cmds, 'dex notes new title here');
    expect(m?.command.id).toBe('app.notes');
    expect(m?.args).toEqual(['new', 'title', 'here']);
  });
  it('matches a core action alias', () => {
    expect(matchTerminalCommand(cmds, 'dex left')?.command.id).toBe('window.tileLeft');
    expect(matchTerminalCommand(cmds, 'search')?.command.id).toBe('system.spotlight');
  });
  it('matches by appId too', () => {
    expect(matchTerminalCommand(cmds, 'dex videoeditor')?.command.id).toBe('app.videoeditor');
  });
  it('returns null for unknown / empty', () => {
    expect(matchTerminalCommand(cmds, 'dex bogus')).toBeNull();
    expect(matchTerminalCommand(cmds, 'dex')).toBeNull();
    expect(matchTerminalCommand(cmds, '')).toBeNull();
  });
});

describe('resolveShortcut', () => {
  const cmds = buildDexCommands(APPS);
  it('picks the platform-correct form', () => {
    const notes = cmds.find((c) => c.id === 'app.notes')!;
    expect(resolveShortcut(notes, false)).toBe('Ctrl+4');
    expect(resolveShortcut(notes, true)).toBe('Cmd+4');
  });
});

describe('registry adapter', () => {
  it('feeds the existing searchCommands without a parallel registry', () => {
    const reg = toCommandRegistry(buildDexCommands(APPS));
    const hits = searchCommands(reg, 'notes', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.command.id === 'app.notes')).toBe(true);
  });
});

describe('findByUtterance (UKI)', () => {
  const cmds = buildDexCommands(APPS);
  it('maps a natural phrase to an app launch', () => {
    expect(findByUtterance(cmds, 'open notes')?.id).toBe('app.notes');
  });
  it('maps a natural phrase to a window action', () => {
    expect(findByUtterance(cmds, 'split screen')?.id).toBe('window.split');
  });
  it('returns null for noise', () => {
    expect(findByUtterance(cmds, 'asdfqwer')).toBeNull();
  });
  // Intent tolerance -- the point of the fuzzy resolver.
  it('tolerates a typo', () => {
    expect(findByUtterance(cmds, 'noets')?.id).toBe('app.notes');
  });
  it('tolerates a partial word', () => {
    expect(findByUtterance(cmds, 'calc')?.id).toBe('app.calculator');
  });
  it('tolerates reordering + filler ("broken sentence")', () => {
    expect(findByUtterance(cmds, 'can you open notes for me')?.id).toBe('app.notes');
  });
});

describe('suggestDexCommands (terminal autocomplete)', () => {
  const cmds = buildDexCommands(APPS);
  it('lists the catalog head for an empty query', () => {
    expect(suggestDexCommands(cmds, '', 5)).toHaveLength(5);
  });
  it('ranks the matching command first for a partial alias', () => {
    expect(suggestDexCommands(cmds, 'calc')[0]?.command.id).toBe('app.calculator');
  });
  it('still suggests despite a typo', () => {
    expect(suggestDexCommands(cmds, 'noets').some((m) => m.command.id === 'app.notes')).toBe(true);
  });
  it('suggests nothing for noise', () => {
    expect(suggestDexCommands(cmds, 'asdfqwer')).toHaveLength(0);
  });
});

describe('didYouMean (terminal "dex <typo>")', () => {
  const cmds = buildDexCommands(APPS);
  it('recovers a clear typo', () => {
    expect(didYouMean(cmds, 'noets')?.id).toBe('app.notes');
  });
  it('declines a low-confidence guess', () => {
    expect(didYouMean(cmds, 'asdfqwer')).toBeNull();
  });
});
