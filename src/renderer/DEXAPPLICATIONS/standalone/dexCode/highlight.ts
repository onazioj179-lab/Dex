// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DexScript syntax highlighter — returns HTML safe for innerHTML.

export function highlightDexScript(code: string): string {
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments first so we don't tokenize inside them.
  html = html.replace(/(\/\/.*)/g, '<span class="dex-syn-comment">$1</span>');

  // Strings
  html = html.replace(/(&quot;|")((?:[^"\\]|\\.)*)(&quot;|")/g, '<span class="dex-syn-string">"$2"</span>');
  html = html.replace(/(')((?:[^'\\]|\\.)*?)(')/g, '<span class="dex-syn-string">\'$2\'</span>');

  // Numbers
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="dex-syn-number">$1</span>');

  // Keywords
  html = html.replace(
    /\b(let|const|fn|return|if|elif|else|for|in|while|break|continue|true|false|null|try|catch|throw)\b/g,
    '<span class="dex-syn-keyword">$1</span>'
  );

  // Built-ins
  html = html.replace(
    /\b(print|math|time|json|sys|type)\b/g,
    '<span class="dex-syn-builtin">$1</span>'
  );

  // Method calls
  html = html.replace(/\.(\w+)\s*\(/g, '.<span class="dex-syn-builtin">$1</span>(');

  // Function definitions
  html = html.replace(
    /(<span class="dex-syn-keyword">fn<\/span>\s+)(\w+)/g,
    '$1<span class="dex-syn-function">$2</span>'
  );

  // Arrow + range operators
  html = html.replace(/=&gt;/g, '<span class="dex-syn-keyword">=&gt;</span>');
  html = html.replace(/(\.\.\.|\.\.)/g, '<span class="dex-syn-operator">$1</span>');

  return html;
}
