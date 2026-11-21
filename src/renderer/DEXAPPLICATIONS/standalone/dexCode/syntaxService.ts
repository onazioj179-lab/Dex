import ts from 'typescript';
import type { ScriptExtension, SyntaxProblem } from './languageProtocol';

const MAX_PROBLEMS = 100;

export function createSyntaxService() {
  let fileName = '/active.ts';
  let version = 0;
  let snapshot = ts.ScriptSnapshot.fromString('');
  const settings: ts.CompilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.ESNext,
    noLib: true,
    noResolve: true,
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => settings,
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => String(version),
    getScriptSnapshot: name => name === fileName ? snapshot : undefined,
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: () => '',
    fileExists: name => name === fileName,
    readFile: () => undefined,
  };
  const service = ts.createLanguageService(host);

  return (extension: ScriptExtension, text: string): SyntaxProblem[] => {
    fileName = `/active.${extension}`;
    version++;
    snapshot = ts.ScriptSnapshot.fromString(text);
    return service.getSyntacticDiagnostics(fileName).slice(0, MAX_PROBLEMS).map(problem => {
      const location = problem.file?.getLineAndCharacterOfPosition(problem.start ?? 0);
      return {
        line: (location?.line ?? 0) + 1,
        column: (location?.character ?? 0) + 1,
        code: problem.code,
        message: ts.flattenDiagnosticMessageText(problem.messageText, '\n'),
      };
    });
  };
}
