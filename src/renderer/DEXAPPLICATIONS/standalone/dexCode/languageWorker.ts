// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
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
