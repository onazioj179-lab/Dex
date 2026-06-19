// =============================================================================
// DEX Platform - SSH Controller (Tier 5 / 42)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
//
// Manages SSH connection profiles and keys via the system OpenSSH tools.
// Scope of this slice: profile CRUD, key listing/generation (ssh-keygen), and
// building the connect command. A fully embedded interactive SSH *session*
// needs a PTY (node-pty); that is intentionally out of this slice -- the UI
// surfaces a copy-able connect command and hands off to a terminal instead.
// All handlers are defensive and never throw across IPC.
// =============================================================================

import { ipcMain, app } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

export interface SshProfile {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  keyPath?: string;
  lastConnected?: number;
}

function profilesPath(): string { return path.join(app.getPath('userData'), 'ssh-profiles.json'); }
function keysDir(): string { return path.join(app.getPath('userData'), 'ssh', 'keys'); }

function readProfiles(): SshProfile[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(profilesPath(), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeProfiles(list: SshProfile[]): boolean {
  try { fs.writeFileSync(profilesPath(), JSON.stringify(list, null, 2), 'utf8'); return true; }
  catch (e) { log.warn('[ssh] write profiles failed:', e); return false; }
}

function which(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 5000, windowsHide: true }, (err) => resolve(!err));
  });
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function ok(message = ''): { success: true; message: string } { return { success: true, message }; }
function fail(message: string): { success: false; message: string } { return { success: false, message }; }

let registered = false;

export function registerSshHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('ssh:check', async () => ({
    ssh: await which('ssh', ['-V']),
    keygen: await which('ssh-keygen', ['--help']).catch(() => false) || await which('ssh-keygen', ['-A']).catch(() => false),
  }));

  ipcMain.handle('ssh:listProfiles', async () => readProfiles());

  ipcMain.handle('ssh:saveProfile', async (_e, profile: Partial<SshProfile>) => {
    if (!profile || typeof profile.host !== 'string' || !profile.host.trim()) return fail('Host is required');
    if (typeof profile.user !== 'string' || !profile.user.trim()) return fail('User is required');
    const list = readProfiles();
    const port = Number(profile.port);
    const clean: SshProfile = {
      id: profile.id && typeof profile.id === 'string' ? profile.id : `ssh_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      name: (profile.name || `${profile.user}@${profile.host}`).slice(0, 120),
      host: profile.host.trim().slice(0, 255),
      user: profile.user.trim().slice(0, 120),
      port: Number.isFinite(port) && port > 0 && port < 65536 ? port : 22,
      keyPath: typeof profile.keyPath === 'string' ? profile.keyPath : undefined,
      lastConnected: profile.lastConnected,
    };
    const idx = list.findIndex(p => p.id === clean.id);
    if (idx >= 0) list[idx] = clean; else list.push(clean);
    return writeProfiles(list) ? { success: true, message: 'Saved', profile: clean } : fail('Could not persist');
  });

  ipcMain.handle('ssh:deleteProfile', async (_e, id: string) => {
    const list = readProfiles().filter(p => p.id !== id);
    return writeProfiles(list) ? ok('Removed') : fail('Could not persist');
  });

  // List public keys from ~/.ssh and the DEX-managed key dir.
  ipcMain.handle('ssh:listKeys', async () => {
    const dirs = [path.join(os.homedir(), '.ssh'), keysDir()];
    const keys: Array<{ path: string; type: string; fingerprint: string; comment: string }> = [];
    for (const dir of dirs) {
      let entries: string[] = [];
      try { entries = fs.readdirSync(dir).filter(f => f.endsWith('.pub')); } catch { continue; }
      for (const file of entries) {
        const full = path.join(dir, file);
        const info = await new Promise<{ type: string; fingerprint: string; comment: string }>((resolve) => {
          execFile('ssh-keygen', ['-lf', full], { timeout: 5000, windowsHide: true }, (err, stdout) => {
            if (err || !stdout) { resolve({ type: '', fingerprint: '', comment: '' }); return; }
            // "256 SHA256:xxxx comment (ED25519)"
            const parts = stdout.trim().split(' ');
            const fingerprint = parts[1] || '';
            const typeMatch = stdout.trim().match(/\(([^)]+)\)\s*$/);
            const comment = parts.slice(2, -1).join(' ');
            resolve({ type: typeMatch ? typeMatch[1] : '', fingerprint, comment });
          });
        });
        keys.push({ path: full, ...info });
      }
    }
    return keys;
  });

  ipcMain.handle('ssh:generateKey', async (_e, opts: { type?: string; name?: string; comment?: string }) => {
    const type = opts?.type === 'rsa' ? 'rsa' : 'ed25519';
    const name = (opts?.name || `dex_${type}`).trim();
    if (!SAFE_NAME.test(name)) return fail('Key name may only contain letters, digits, dot, dash, underscore');
    const comment = typeof opts?.comment === 'string' ? opts.comment.slice(0, 200) : `dex@${os.hostname()}`;
    try { fs.mkdirSync(keysDir(), { recursive: true }); } catch { /* ignore */ }
    const target = path.join(keysDir(), name);
    if (fs.existsSync(target) || fs.existsSync(`${target}.pub`)) return fail('A key with that name already exists');
    const args = ['-t', type, '-f', target, '-N', '', '-C', comment];
    if (type === 'rsa') args.push('-b', '4096');
    return await new Promise((resolve) => {
      execFile('ssh-keygen', args, { timeout: 30000, windowsHide: true }, (err, _out, stderr) => {
        if (err) { resolve(fail((stderr || (err as Error).message || '').trim() || 'ssh-keygen failed')); return; }
        resolve({ success: true, message: `Generated ${name}`, path: `${target}.pub` });
      });
    });
  });

  // Build (do not run) the connect command for a profile -- safe to copy / hand off.
  ipcMain.handle('ssh:connectCommand', async (_e, id: string) => {
    const profile = readProfiles().find(p => p.id === id);
    if (!profile) return { command: '', message: 'Profile not found' };
    const parts = ['ssh'];
    if (profile.keyPath) parts.push('-i', JSON.stringify(profile.keyPath));
    if (profile.port && profile.port !== 22) parts.push('-p', String(profile.port));
    parts.push(`${profile.user}@${profile.host}`);
    // stamp last-connected
    const list = readProfiles();
    const idx = list.findIndex(p => p.id === id);
    if (idx >= 0) { list[idx].lastConnected = Date.now(); writeProfiles(list); }
    return { command: parts.join(' '), message: '' };
  });

  log.info('[ssh] handlers registered');
}

export default registerSshHandlers;
