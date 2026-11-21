export type ScriptExtension = 'js' | 'jsx' | 'ts' | 'tsx' | 'mjs' | 'cjs' | 'mts' | 'cts';

export interface SyntaxProblem {
  line: number;
  column: number;
  code: number;
  message: string;
}

export interface CheckSyntax {
  request: number;
  extension: ScriptExtension;
  text: string;
}

export type SyntaxResult = { request: number } & ({ problems: SyntaxProblem[] } | { error: string });

export function scriptExtension(name: string): ScriptExtension | null {
  const dot = name.lastIndexOf('.');
  const ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx':
    case 'mjs': case 'cjs': case 'mts': case 'cts':
      return ext;
    default:
      return null;
  }
}
