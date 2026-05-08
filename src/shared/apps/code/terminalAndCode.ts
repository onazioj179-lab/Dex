// =============================================================================
// DEX Platform — Track G3: Terminal/Code app planning model
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
/**
 * Pure model for the integrated Terminal + Code editor. Real PTY +
 * Monaco wiring lives in the renderer; this owns shell selection,
 * working-directory rules, LSP capability matrix, and command policy.
 */

export type Shell = 'pwsh' | 'cmd' | 'bash' | 'zsh' | 'fish';

export interface TerminalSession {
  id: string;
  shell: Shell;
  cwd: string;
  /** Environment overlay (merged on top of host env). */
  env: Record<string, string>;
  /** True when interactive prompt is showing. */
  idle: boolean;
  /** ms since session creation. */
  uptimeMs: number;
}

export function defaultShellForPlatform(platform: 'win' | 'mac' | 'linux'): Shell {
  if (platform === 'win') return 'pwsh';
  return 'zsh';
}

/**
 * Block dangerous one-liners by simple heuristic. Production policy is
 * stricter; this is the user-visible safety rail in the dev terminal.
 */
const DANGER = [
  /\brm\s+-rf\s+\//,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /:\(\)\{ ?:\|:& ?\};:/, // fork bomb
  /\bRemove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\\b/i,
];

export function isDangerousCommand(cmd: string): boolean {
  return DANGER.some(re => re.test(cmd));
}

export interface CodeFile {
  path: string;
  language: string;
  /** Open buffer dirty state. */
  dirty: boolean;
  /** Last save ms. */
  savedAtMs: number;
}

export type LspCapability =
  | 'hover' | 'completion' | 'definition' | 'references'
  | 'rename' | 'format' | 'diagnostics' | 'codeAction';

export interface LspServerSpec {
  language: string;
  command: string;
  capabilities: LspCapability[];
}

export const BUILTIN_LSPS: LspServerSpec[] = [
  { language: 'typescript', command: 'typescript-language-server', capabilities: ['hover', 'completion', 'definition', 'references', 'rename', 'format', 'diagnostics', 'codeAction'] },
  { language: 'rust', command: 'rust-analyzer', capabilities: ['hover', 'completion', 'definition', 'references', 'rename', 'format', 'diagnostics', 'codeAction'] },
  { language: 'python', command: 'pyright-langserver', capabilities: ['hover', 'completion', 'definition', 'references', 'diagnostics'] },
  { language: 'go', command: 'gopls', capabilities: ['hover', 'completion', 'definition', 'references', 'rename', 'format', 'diagnostics'] },
];

export function findLsp(language: string): LspServerSpec | null {
  return BUILTIN_LSPS.find(s => s.language === language) ?? null;
}

/** Detect language from file path. */
export function detectLanguage(path: string): string {
  const m = /\.([^.]+)$/.exec(path.toLowerCase());
  if (!m) return 'plaintext';
  switch (m[1]) {
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': return 'javascript';
    case 'rs': return 'rust';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'css': return 'css';
    case 'html': return 'html';
    case 'sh': return 'shell';
    case 'ps1': return 'powershell';
    default: return 'plaintext';
  }
}
