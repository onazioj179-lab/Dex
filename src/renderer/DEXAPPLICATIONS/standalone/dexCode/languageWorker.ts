import { createSyntaxService } from './syntaxService';
import type { CheckSyntax, SyntaxResult } from './languageProtocol';

const checkSyntax = createSyntaxService();
self.addEventListener('message', (event: MessageEvent<CheckSyntax>) => {
  const { request, extension, text } = event.data;
  let result: SyntaxResult;
  try {
    result = { request, problems: checkSyntax(extension, text) };
  } catch {
    result = { request, error: 'Syntax checking is unavailable for this file.' };
  }
  self.postMessage(result);
});
