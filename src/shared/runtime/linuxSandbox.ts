// =============================================================================
// DEX Platform — Security: Linux inner-app jail (bubblewrap policy)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Linux inner-app jail via unprivileged user-namespace isolation
 * (DEX_FEATURE_BACKLOG 03 · P1). Bubblewrap (the engine under Flatpak) does the
 * actual `unshare`/bind-mount work; DEX supplies the POLICY on top — i.e. exactly
 * which namespaces to unshare and which paths to expose, derived from an app's
 * declared `AppCapability[]`.
 *
 * This module is the pure argv BUILDER: given a sandbox spec it returns the
 * `bwrap` argument vector (everything before the `--` and the app command). The
 * Linux main-process driver prepends `bwrap` and appends the command + `execvp`s
 * it; keeping the argv construction here makes the default-deny policy testable
 * without a Linux host.
 *
 * Default posture is maximal isolation: `--unshare-all` then selectively re-share
 * the network only when the app declares it, a private `/tmp`, a read-only minimal
 * runtime, and per-app data dirs scoped by files.read / files.write.
 */

import type { AppCapability } from './appContainer';

export interface LinuxSandboxSpec {
  appId: string;
  capabilities: ReadonlyArray<AppCapability>;
  /** Per-app writable data directory on the host (bound rw when files.write). */
  dataDir: string;
  /** Per-app read-only resource directory (bound ro when files.read). */
  resourceDir?: string;
  /** Read-only system runtime roots to expose (default /usr, /bin, /lib*, /etc). */
  systemRoots?: string[];
  /** Pulse/Pipewire socket path for audio (bound when audio.in/out). */
  audioSocket?: string;
}

const DEFAULT_SYSTEM_ROOTS = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc'];

/**
 * Build the bubblewrap argv (without the leading `bwrap` or the trailing command).
 * Pure: same spec -> same args, so policy is asserted in tests.
 */
export function buildBwrapArgs(spec: LinuxSandboxSpec): string[] {
  const caps = new Set(spec.capabilities);
  const args: string[] = [];

  // Maximal isolation first; re-share only what is declared.
  args.push('--unshare-all');
  args.push('--die-with-parent');   // kill the jail if DEX dies
  args.push('--new-session');       // detach from the controlling TTY (anti-TIOCSTI)
  args.push('--clearenv');          // start from a clean environment

  // Network: only re-shared when the app declares network access. Without this the
  // app has NO network namespace at all (the strongest possible default-deny).
  if (caps.has('network') || caps.has('network.local')) {
    args.push('--share-net');
    // Resolver + CA bundle are needed for TLS once the net is shared.
    args.push('--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf');
    args.push('--ro-bind-try', '/etc/ssl', '/etc/ssl');
  }

  // Minimal read-only runtime so the app's binary can link + run.
  const roots = spec.systemRoots ?? DEFAULT_SYSTEM_ROOTS;
  for (const root of roots) {
    args.push('--ro-bind-try', root, root);
  }

  // Kernel pseudo-filesystems (proc/dev) — `--dev` mounts a minimal, safe /dev.
  args.push('--proc', '/proc');
  args.push('--dev', '/dev');
  // Private tmpfs for /tmp and the home — no host data leaks in.
  args.push('--tmpfs', '/tmp');
  args.push('--tmpfs', '/run');

  // Per-app data directories, scoped by capability. Read first, then write (rw
  // bind wins if both declared on the same dir).
  if (caps.has('files.read') && spec.resourceDir) {
    args.push('--ro-bind', spec.resourceDir, spec.resourceDir);
  }
  if (caps.has('files.write')) {
    args.push('--bind', spec.dataDir, spec.dataDir);
  } else {
    // Even without write, the app gets its data dir read-only so it can load state.
    args.push('--ro-bind-try', spec.dataDir, spec.dataDir);
  }

  // Audio: expose the Pulse/Pipewire socket only when declared.
  if ((caps.has('audio.out') || caps.has('audio.in')) && spec.audioSocket) {
    args.push('--ro-bind-try', spec.audioSocket, spec.audioSocket);
  }

  // GPU device nodes only when declared (DRI render nodes).
  if (caps.has('gpu') || caps.has('gpu.compute')) {
    args.push('--dev-bind-try', '/dev/dri', '/dev/dri');
  }

  // Drop every capability-bit and forbid acquiring new privileges.
  args.push('--cap-drop', 'ALL');
  args.push('--unshare-user');

  return args;
}

/**
 * Human-readable summary of what a sandbox exposes — for the install-time
 * permission prompt / audit log.
 */
export function describeSandbox(spec: LinuxSandboxSpec): string[] {
  const caps = new Set(spec.capabilities);
  const lines: string[] = [];
  lines.push(caps.has('network') || caps.has('network.local') ? 'Network: shared' : 'Network: isolated (no access)');
  lines.push(caps.has('files.write') ? `Files: read-write in ${spec.dataDir}` : 'Files: read-only data dir');
  lines.push(caps.has('gpu') || caps.has('gpu.compute') ? 'GPU: /dev/dri exposed' : 'GPU: none');
  lines.push(caps.has('audio.out') || caps.has('audio.in') ? 'Audio: socket exposed' : 'Audio: none');
  return lines;
}
