import { describe, it, expect } from 'vitest';
import { parseSlashCommand, isKnownCommand } from '../../src/shared/uki/slashCommands';

describe('slash commands', () => {
  it('parses a command with args', () => {
    expect(parseSlashCommand('/open notes')).toEqual({
      isCommand: true, command: 'open', args: ['notes'], argString: 'notes',
    });
  });

  it('respects quoted arguments', () => {
    const p = parseSlashCommand('/search "my project" now');
    expect(p.command).toBe('search');
    expect(p.args).toEqual(['my project', 'now']);
  });

  it('handles a bare command', () => {
    expect(parseSlashCommand('/help')).toMatchObject({ command: 'help', args: [], argString: '' });
  });

  it('non-slash input is not a command', () => {
    expect(parseSlashCommand('hello there').isCommand).toBe(false);
  });

  it('matches a registry case-insensitively', () => {
    expect(isKnownCommand('Open', ['open', 'close'])).toBe(true);
    expect(isKnownCommand('zzz', ['open'])).toBe(false);
  });
});
