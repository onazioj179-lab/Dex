// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
export interface TaskDiagnostic {
  path: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

export function plainTaskOutput(output: string): string {
  return output
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

export function taskDiagnostics(output: string): TaskDiagnostic[] {
  const diagnostics = new Map<string, TaskDiagnostic>();
  for (const text of output.split('\n')) {
    const match = text.trim().match(/^(.+?)\((\d+),(\d+)\)\s*:\s*(error|warning)\b(.*)$/i)
      ?? text.trim().match(/^(.+?):(\d+):(\d+)\s*:\s*(error|warning)\b(.*)$/i);
    if (!match) continue;
    const [, path, row, col, level, message] = match;
    const line = Number(row);
    const column = Number(col);
    if (path.length > 1024 || line < 1 || column < 1 || !Number.isSafeInteger(line) || !Number.isSafeInteger(column)) continue;
    const severity = level.toLowerCase() === 'warning' ? 'warning' : 'error';
    const diagnostic = { path, line, column, severity, message: message.trim().slice(0, 350) } as const;
    diagnostics.set(JSON.stringify(diagnostic), diagnostic);
    if (diagnostics.size >= 100) break;
  }
  return Array.from(diagnostics.values());
}
