// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.6.0 - FORGE Web Development IDE - Code Editor Engine
// Professional code editing with IntelliSense and multi-cursor
// Items 651-675 of the 1000-item improvement plan
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface EditorDocument {
  id: string;
  uri: string;
  filename: string;
  language: Language;
  content: string;
  version: number;
  isDirty: boolean;
  encoding: 'utf-8' | 'utf-16' | 'ascii' | 'iso-8859-1';
  lineEnding: 'lf' | 'crlf';
  created: number;
  modified: number;
}

export type Language = 
  | 'html' | 'css' | 'scss' | 'less' | 'javascript' | 'typescript' 
  | 'jsx' | 'tsx' | 'json' | 'xml' | 'yaml' | 'markdown'
  | 'python' | 'rust' | 'go' | 'c' | 'cpp' | 'java' | 'csharp'
  | 'php' | 'ruby' | 'swift' | 'kotlin' | 'sql' | 'graphql'
  | 'vue' | 'svelte' | 'astro' | 'plaintext';

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Selection {
  anchor: Position;
  active: Position;
  isReversed: boolean;
}

export interface Cursor {
  id: string;
  position: Position;
  selection?: Selection;
}

export interface EditorState {
  documentId: string;
  cursors: Cursor[];
  scrollTop: number;
  scrollLeft: number;
  foldedRanges: Range[];
  breakpoints: number[];
  bookmarks: number[];
}

// =============================================================================
// ITEM 651-655: SYNTAX HIGHLIGHTING
// =============================================================================

export interface Token {
  type: TokenType;
  value: string;
  start: Position;
  end: Position;
  scope?: string;
}

export type TokenType = 
  | 'keyword' | 'identifier' | 'string' | 'number' | 'regexp'
  | 'operator' | 'punctuation' | 'comment' | 'type' | 'function'
  | 'variable' | 'constant' | 'tag' | 'attribute' | 'property'
  | 'class' | 'interface' | 'enum' | 'decorator' | 'whitespace';

export interface SyntaxTheme {
  name: string;
  type: 'dark' | 'light';
  colors: Record<TokenType, string>;
  background: string;
  foreground: string;
  selection: string;
  lineNumber: string;
  lineNumberActive: string;
  cursor: string;
  matchingBracket: string;
  currentLine: string;
}

export const DEFAULT_DARK_THEME: SyntaxTheme = {
  name: 'DEX Dark',
  type: 'dark',
  colors: {
    keyword: '#c586c0',
    identifier: '#9cdcfe',
    string: '#ce9178',
    number: '#b5cea8',
    regexp: '#d16969',
    operator: '#d4d4d4',
    punctuation: '#d4d4d4',
    comment: '#6a9955',
    type: '#4ec9b0',
    function: '#dcdcaa',
    variable: '#9cdcfe',
    constant: '#4fc1ff',
    tag: '#569cd6',
    attribute: '#9cdcfe',
    property: '#9cdcfe',
    class: '#4ec9b0',
    interface: '#4ec9b0',
    enum: '#4ec9b0',
    decorator: '#dcdcaa',
    whitespace: '#3b3b3b'
  },
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  selection: '#264f78',
  lineNumber: '#858585',
  lineNumberActive: '#c6c6c6',
  cursor: '#aeafad',
  matchingBracket: '#0d6637',
  currentLine: '#282828'
};

// Language grammar rules
export interface GrammarRule {
  pattern: RegExp;
  tokenType: TokenType;
  scope?: string;
}

export const LANGUAGE_GRAMMARS: Record<string, GrammarRule[]> = {
  javascript: [
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|void|in|of|class|extends|super|import|export|default|from|as|async|await|yield|static|get|set)\b/g, tokenType: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, tokenType: 'constant' },
    { pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, tokenType: 'string' },
    { pattern: /\/\/.*$/gm, tokenType: 'comment' },
    { pattern: /\/\*[\s\S]*?\*\//g, tokenType: 'comment' },
    { pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, tokenType: 'number' },
    { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, tokenType: 'class' },
    { pattern: /\b([a-z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, tokenType: 'function' },
    { pattern: /[+\-*/%=<>!&|^~?:]+/g, tokenType: 'operator' },
    { pattern: /[{}()\[\];,.]/g, tokenType: 'punctuation' }
  ],
  typescript: [
    { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|delete|typeof|instanceof|void|in|of|class|extends|super|import|export|default|from|as|async|await|yield|static|get|set|type|interface|enum|namespace|module|declare|abstract|implements|private|protected|public|readonly|keyof|infer|never|unknown|any)\b/g, tokenType: 'keyword' },
    { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, tokenType: 'constant' },
    { pattern: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, tokenType: 'string' },
    { pattern: /\/\/.*$/gm, tokenType: 'comment' },
    { pattern: /\/\*[\s\S]*?\*\//g, tokenType: 'comment' },
    { pattern: /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, tokenType: 'number' },
    { pattern: /@[a-zA-Z_$][a-zA-Z0-9_$]*/g, tokenType: 'decorator' },
    { pattern: /\b([A-Z][a-zA-Z0-9]*)\b/g, tokenType: 'type' },
    { pattern: /\b([a-z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, tokenType: 'function' },
    { pattern: /[+\-*/%=<>!&|^~?:]+/g, tokenType: 'operator' },
    { pattern: /[{}()\[\];,.]/g, tokenType: 'punctuation' }
  ],
  html: [
    { pattern: /<!--[\s\S]*?-->/g, tokenType: 'comment' },
    { pattern: /<\/?[a-zA-Z][a-zA-Z0-9-]*/g, tokenType: 'tag' },
    { pattern: /\b[a-zA-Z-]+(?==)/g, tokenType: 'attribute' },
    { pattern: /"[^"]*"|'[^']*'/g, tokenType: 'string' },
    { pattern: /[<>=\/]/g, tokenType: 'punctuation' }
  ],
  css: [
    { pattern: /\/\*[\s\S]*?\*\//g, tokenType: 'comment' },
    { pattern: /@[a-zA-Z-]+/g, tokenType: 'keyword' },
    { pattern: /[.#][a-zA-Z_-][a-zA-Z0-9_-]*/g, tokenType: 'class' },
    { pattern: /[a-zA-Z-]+(?=\s*:)/g, tokenType: 'property' },
    { pattern: /#[0-9a-fA-F]{3,8}\b/g, tokenType: 'constant' },
    { pattern: /\b\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?\b/g, tokenType: 'number' },
    { pattern: /"[^"]*"|'[^']*'/g, tokenType: 'string' },
    { pattern: /[{}:;,()]/g, tokenType: 'punctuation' }
  ],
  json: [
    { pattern: /"(?:[^"\\]|\\.)*"\s*(?=:)/g, tokenType: 'property' },
    { pattern: /"(?:[^"\\]|\\.)*"/g, tokenType: 'string' },
    { pattern: /\b(true|false|null)\b/g, tokenType: 'constant' },
    { pattern: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/g, tokenType: 'number' },
    { pattern: /[{}\[\]:,]/g, tokenType: 'punctuation' }
  ]
};

// =============================================================================
// ITEM 656-660: CODE COMPLETION (INTELLISENSE)
// =============================================================================

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText: string;
  insertTextRules?: InsertTextRule;
  sortText?: string;
  filterText?: string;
  range?: Range;
  additionalTextEdits?: TextEdit[];
  commitCharacters?: string[];
}

export type CompletionKind = 
  | 'text' | 'method' | 'function' | 'constructor' | 'field'
  | 'variable' | 'class' | 'interface' | 'module' | 'property'
  | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet'
  | 'color' | 'file' | 'reference' | 'folder' | 'enumMember'
  | 'constant' | 'struct' | 'event' | 'operator' | 'typeParameter';

export type InsertTextRule = 'insertAsSnippet' | 'keepWhitespace';

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface CompletionContext {
  triggerKind: 'invoke' | 'triggerCharacter' | 'triggerForIncomplete';
  triggerCharacter?: string;
}

// Built-in completions
export const HTML_TAGS: CompletionItem[] = [
  { label: 'div', kind: 'snippet', insertText: '<div>$1</div>', detail: 'HTML div element' },
  { label: 'span', kind: 'snippet', insertText: '<span>$1</span>', detail: 'HTML span element' },
  { label: 'p', kind: 'snippet', insertText: '<p>$1</p>', detail: 'HTML paragraph' },
  { label: 'a', kind: 'snippet', insertText: '<a href="$1">$2</a>', detail: 'HTML anchor' },
  { label: 'img', kind: 'snippet', insertText: '<img src="$1" alt="$2" />', detail: 'HTML image' },
  { label: 'button', kind: 'snippet', insertText: '<button type="$1">$2</button>', detail: 'HTML button' },
  { label: 'input', kind: 'snippet', insertText: '<input type="$1" name="$2" />', detail: 'HTML input' },
  { label: 'form', kind: 'snippet', insertText: '<form action="$1" method="$2">\n\t$3\n</form>', detail: 'HTML form' },
  { label: 'ul', kind: 'snippet', insertText: '<ul>\n\t<li>$1</li>\n</ul>', detail: 'Unordered list' },
  { label: 'ol', kind: 'snippet', insertText: '<ol>\n\t<li>$1</li>\n</ol>', detail: 'Ordered list' },
  { label: 'table', kind: 'snippet', insertText: '<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>$1</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>$2</td>\n\t\t</tr>\n\t</tbody>\n</table>', detail: 'HTML table' },
  { label: 'section', kind: 'snippet', insertText: '<section>\n\t$1\n</section>', detail: 'HTML section' },
  { label: 'article', kind: 'snippet', insertText: '<article>\n\t$1\n</article>', detail: 'HTML article' },
  { label: 'header', kind: 'snippet', insertText: '<header>\n\t$1\n</header>', detail: 'HTML header' },
  { label: 'footer', kind: 'snippet', insertText: '<footer>\n\t$1\n</footer>', detail: 'HTML footer' },
  { label: 'nav', kind: 'snippet', insertText: '<nav>\n\t$1\n</nav>', detail: 'HTML nav' },
  { label: 'main', kind: 'snippet', insertText: '<main>\n\t$1\n</main>', detail: 'HTML main' },
  { label: 'aside', kind: 'snippet', insertText: '<aside>\n\t$1\n</aside>', detail: 'HTML aside' }
];

export const CSS_PROPERTIES: CompletionItem[] = [
  { label: 'display', kind: 'property', insertText: 'display: $1;', detail: 'CSS display property' },
  { label: 'flex', kind: 'property', insertText: 'flex: $1;', detail: 'CSS flex shorthand' },
  { label: 'grid', kind: 'property', insertText: 'display: grid;\ngrid-template-columns: $1;', detail: 'CSS grid layout' },
  { label: 'position', kind: 'property', insertText: 'position: $1;', detail: 'CSS position property' },
  { label: 'margin', kind: 'property', insertText: 'margin: $1;', detail: 'CSS margin property' },
  { label: 'padding', kind: 'property', insertText: 'padding: $1;', detail: 'CSS padding property' },
  { label: 'width', kind: 'property', insertText: 'width: $1;', detail: 'CSS width property' },
  { label: 'height', kind: 'property', insertText: 'height: $1;', detail: 'CSS height property' },
  { label: 'background', kind: 'property', insertText: 'background: $1;', detail: 'CSS background shorthand' },
  { label: 'color', kind: 'property', insertText: 'color: $1;', detail: 'CSS color property' },
  { label: 'font-size', kind: 'property', insertText: 'font-size: $1;', detail: 'CSS font-size property' },
  { label: 'font-family', kind: 'property', insertText: 'font-family: $1;', detail: 'CSS font-family property' },
  { label: 'border', kind: 'property', insertText: 'border: $1px solid $2;', detail: 'CSS border shorthand' },
  { label: 'border-radius', kind: 'property', insertText: 'border-radius: $1;', detail: 'CSS border-radius' },
  { label: 'box-shadow', kind: 'property', insertText: 'box-shadow: $1px $2px $3px $4;', detail: 'CSS box-shadow' },
  { label: 'transition', kind: 'property', insertText: 'transition: $1 ${2:0.3s} ${3:ease};', detail: 'CSS transition' },
  { label: 'transform', kind: 'property', insertText: 'transform: $1;', detail: 'CSS transform property' },
  { label: 'animation', kind: 'property', insertText: 'animation: $1 ${2:1s} ${3:ease} ${4:infinite};', detail: 'CSS animation' },
  { label: 'z-index', kind: 'property', insertText: 'z-index: $1;', detail: 'CSS z-index property' },
  { label: 'overflow', kind: 'property', insertText: 'overflow: $1;', detail: 'CSS overflow property' }
];

export const JS_SNIPPETS: CompletionItem[] = [
  { label: 'log', kind: 'snippet', insertText: 'console.log($1);', detail: 'Console log' },
  { label: 'func', kind: 'snippet', insertText: 'function ${1:name}(${2:params}) {\n\t$3\n}', detail: 'Function declaration' },
  { label: 'arrow', kind: 'snippet', insertText: 'const ${1:name} = (${2:params}) => {\n\t$3\n};', detail: 'Arrow function' },
  { label: 'async', kind: 'snippet', insertText: 'async function ${1:name}(${2:params}) {\n\t$3\n}', detail: 'Async function' },
  { label: 'class', kind: 'snippet', insertText: 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$3\n\t}\n}', detail: 'Class declaration' },
  { label: 'if', kind: 'snippet', insertText: 'if (${1:condition}) {\n\t$2\n}', detail: 'If statement' },
  { label: 'ifelse', kind: 'snippet', insertText: 'if (${1:condition}) {\n\t$2\n} else {\n\t$3\n}', detail: 'If-else statement' },
  { label: 'for', kind: 'snippet', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n\t$3\n}', detail: 'For loop' },
  { label: 'foreach', kind: 'snippet', insertText: '${1:array}.forEach((${2:item}) => {\n\t$3\n});', detail: 'ForEach loop' },
  { label: 'map', kind: 'snippet', insertText: '${1:array}.map((${2:item}) => {\n\t$3\n});', detail: 'Array map' },
  { label: 'filter', kind: 'snippet', insertText: '${1:array}.filter((${2:item}) => ${3:condition});', detail: 'Array filter' },
  { label: 'reduce', kind: 'snippet', insertText: '${1:array}.reduce((${2:acc}, ${3:item}) => {\n\t$4\n}, ${5:initial});', detail: 'Array reduce' },
  { label: 'try', kind: 'snippet', insertText: 'try {\n\t$1\n} catch (${2:error}) {\n\t$3\n}', detail: 'Try-catch block' },
  { label: 'promise', kind: 'snippet', insertText: 'new Promise((resolve, reject) => {\n\t$1\n});', detail: 'Promise' },
  { label: 'fetch', kind: 'snippet', insertText: 'fetch(\'${1:url}\')\n\t.then(response => response.json())\n\t.then(data => {\n\t\t$2\n\t})\n\t.catch(error => console.error(error));', detail: 'Fetch API' },
  { label: 'import', kind: 'snippet', insertText: 'import { $2 } from \'${1:module}\';', detail: 'ES6 import' },
  { label: 'export', kind: 'snippet', insertText: 'export const ${1:name} = $2;', detail: 'ES6 export' },
  { label: 'exportdefault', kind: 'snippet', insertText: 'export default ${1:name};', detail: 'ES6 default export' }
];

export const REACT_SNIPPETS: CompletionItem[] = [
  { label: 'rfc', kind: 'snippet', insertText: 'import React from \'react\';\n\nconst ${1:Component} = () => {\n\treturn (\n\t\t<div>\n\t\t\t$2\n\t\t</div>\n\t);\n};\n\nexport default ${1:Component};', detail: 'React Functional Component' },
  { label: 'useState', kind: 'snippet', insertText: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initial});', detail: 'React useState hook' },
  { label: 'useEffect', kind: 'snippet', insertText: 'useEffect(() => {\n\t$1\n\treturn () => {\n\t\t$2\n\t};\n}, [${3:deps}]);', detail: 'React useEffect hook' },
  { label: 'useRef', kind: 'snippet', insertText: 'const ${1:ref} = useRef(${2:null});', detail: 'React useRef hook' },
  { label: 'useMemo', kind: 'snippet', insertText: 'const ${1:memoized} = useMemo(() => {\n\treturn $2;\n}, [${3:deps}]);', detail: 'React useMemo hook' },
  { label: 'useCallback', kind: 'snippet', insertText: 'const ${1:callback} = useCallback(() => {\n\t$2\n}, [${3:deps}]);', detail: 'React useCallback hook' },
  { label: 'useContext', kind: 'snippet', insertText: 'const ${1:value} = useContext(${2:Context});', detail: 'React useContext hook' },
  { label: 'useReducer', kind: 'snippet', insertText: 'const [${1:state}, dispatch] = useReducer(${2:reducer}, ${3:initialState});', detail: 'React useReducer hook' }
];

// =============================================================================
// ITEM 661-665: MULTI-CURSOR & EDITING
// =============================================================================

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  range: Range;
  text: string;
  cursorId?: string;
}

export interface UndoRedoStack {
  undoStack: EditOperation[][];
  redoStack: EditOperation[][];
  maxSize: number;
}

export class EditorEngine {
  private documents: Map<string, EditorDocument> = new Map();
  private states: Map<string, EditorState> = new Map();
  private undoStacks: Map<string, UndoRedoStack> = new Map();
  private theme: SyntaxTheme = DEFAULT_DARK_THEME;
  
  // Document management
  createDocument(uri: string, content: string = '', language?: Language): EditorDocument {
    const filename = uri.split('/').pop() || 'untitled';
    const detectedLanguage = language || this.detectLanguage(filename);
    
    const doc: EditorDocument = {
      id: this.generateId(),
      uri,
      filename,
      language: detectedLanguage,
      content,
      version: 1,
      isDirty: false,
      encoding: 'utf-8',
      lineEnding: 'lf',
      created: Date.now(),
      modified: Date.now()
    };
    
    this.documents.set(doc.id, doc);
    this.initializeState(doc.id);
    this.initializeUndoStack(doc.id);
    
    return doc;
  }
  
  private detectLanguage(filename: string): Language {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, Language> = {
      'html': 'html', 'htm': 'html',
      'css': 'css', 'scss': 'scss', 'less': 'less',
      'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
      'ts': 'typescript', 'mts': 'typescript', 'cts': 'typescript',
      'jsx': 'jsx', 'tsx': 'tsx',
      'json': 'json', 'jsonc': 'json',
      'xml': 'xml', 'svg': 'xml',
      'yaml': 'yaml', 'yml': 'yaml',
      'md': 'markdown', 'markdown': 'markdown',
      'py': 'python', 'pyw': 'python',
      'rs': 'rust',
      'go': 'go',
      'c': 'c', 'h': 'c',
      'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'hpp': 'cpp',
      'java': 'java',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin', 'kts': 'kotlin',
      'sql': 'sql',
      'graphql': 'graphql', 'gql': 'graphql',
      'vue': 'vue',
      'svelte': 'svelte',
      'astro': 'astro'
    };
    
    return languageMap[ext || ''] || 'plaintext';
  }
  
  private initializeState(docId: string): void {
    this.states.set(docId, {
      documentId: docId,
      cursors: [{ id: 'primary', position: { line: 0, column: 0 } }],
      scrollTop: 0,
      scrollLeft: 0,
      foldedRanges: [],
      breakpoints: [],
      bookmarks: []
    });
  }
  
  private initializeUndoStack(docId: string): void {
    this.undoStacks.set(docId, {
      undoStack: [],
      redoStack: [],
      maxSize: 1000
    });
  }
  
  // Multi-cursor operations
  addCursor(docId: string, position: Position): Cursor {
    const state = this.states.get(docId);
    if (!state) throw new Error('Document not found');
    
    const cursor: Cursor = {
      id: this.generateId(),
      position
    };
    
    state.cursors.push(cursor);
    return cursor;
  }
  
  removeCursor(docId: string, cursorId: string): void {
    const state = this.states.get(docId);
    if (!state) return;
    
    state.cursors = state.cursors.filter(c => c.id !== cursorId);
    
    // Always keep at least one cursor
    if (state.cursors.length === 0) {
      state.cursors.push({ id: 'primary', position: { line: 0, column: 0 } });
    }
  }
  
  addCursorsToAllOccurrences(docId: string, searchText: string): void {
    const doc = this.documents.get(docId);
    const state = this.states.get(docId);
    if (!doc || !state) return;
    
    const lines = doc.content.split('\n');
    state.cursors = [];
    
    for (let line = 0; line < lines.length; line++) {
      let column = 0;
      while ((column = lines[line].indexOf(searchText, column)) !== -1) {
        state.cursors.push({
          id: this.generateId(),
          position: { line, column },
          selection: {
            anchor: { line, column },
            active: { line, column: column + searchText.length },
            isReversed: false
          }
        });
        column += searchText.length;
      }
    }
    
    if (state.cursors.length === 0) {
      state.cursors.push({ id: 'primary', position: { line: 0, column: 0 } });
    }
  }
  
  // Text editing
  insert(docId: string, text: string): void {
    const doc = this.documents.get(docId);
    const state = this.states.get(docId);
    if (!doc || !state) return;
    
    const operations: EditOperation[] = [];
    
    // Sort cursors from bottom to top to avoid position shifts
    const sortedCursors = [...state.cursors].sort((a, b) => {
      if (a.position.line !== b.position.line) {
        return b.position.line - a.position.line;
      }
      return b.position.column - a.position.column;
    });
    
    for (const cursor of sortedCursors) {
      const range: Range = cursor.selection 
        ? { start: cursor.selection.anchor, end: cursor.selection.active }
        : { start: cursor.position, end: cursor.position };
      
      operations.push({
        type: cursor.selection ? 'replace' : 'insert',
        range,
        text,
        cursorId: cursor.id
      });
    }
    
    this.applyOperations(docId, operations);
    this.pushUndo(docId, operations);
  }
  
  delete(docId: string, direction: 'forward' | 'backward'): void {
    const doc = this.documents.get(docId);
    const state = this.states.get(docId);
    if (!doc || !state) return;
    
    const operations: EditOperation[] = [];
    
    for (const cursor of state.cursors) {
      let range: Range;
      
      if (cursor.selection) {
        range = { start: cursor.selection.anchor, end: cursor.selection.active };
      } else {
        const pos = cursor.position;
        if (direction === 'backward') {
          if (pos.column > 0) {
            range = { start: { line: pos.line, column: pos.column - 1 }, end: pos };
          } else if (pos.line > 0) {
            const prevLineLength = doc.content.split('\n')[pos.line - 1].length;
            range = { start: { line: pos.line - 1, column: prevLineLength }, end: pos };
          } else {
            continue;
          }
        } else {
          const lines = doc.content.split('\n');
          const lineLength = lines[pos.line].length;
          if (pos.column < lineLength) {
            range = { start: pos, end: { line: pos.line, column: pos.column + 1 } };
          } else if (pos.line < lines.length - 1) {
            range = { start: pos, end: { line: pos.line + 1, column: 0 } };
          } else {
            continue;
          }
        }
      }
      
      operations.push({ type: 'delete', range, text: '', cursorId: cursor.id });
    }
    
    this.applyOperations(docId, operations);
    this.pushUndo(docId, operations);
  }
  
  private applyOperations(docId: string, operations: EditOperation[]): void {
    const doc = this.documents.get(docId);
    const state = this.states.get(docId);
    if (!doc || !state) return;
    
    let content = doc.content;
    const lines = content.split('\n');
    
    for (const op of operations) {
      const startOffset = this.positionToOffset(lines, op.range.start);
      const endOffset = this.positionToOffset(lines, op.range.end);
      
      content = content.slice(0, startOffset) + op.text + content.slice(endOffset);
      
      // Update cursor position
      if (op.cursorId) {
        const cursor = state.cursors.find(c => c.id === op.cursorId);
        if (cursor) {
          const newOffset = startOffset + op.text.length;
          cursor.position = this.offsetToPosition(content.split('\n'), newOffset);
          cursor.selection = undefined;
        }
      }
    }
    
    doc.content = content;
    doc.version++;
    doc.isDirty = true;
    doc.modified = Date.now();
  }
  
  private positionToOffset(lines: string[], pos: Position): number {
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    return offset + Math.min(pos.column, lines[pos.line]?.length || 0);
  }
  
  private offsetToPosition(lines: string[], offset: number): Position {
    let remaining = offset;
    for (let line = 0; line < lines.length; line++) {
      if (remaining <= lines[line].length) {
        return { line, column: remaining };
      }
      remaining -= lines[line].length + 1;
    }
    return { line: lines.length - 1, column: lines[lines.length - 1]?.length || 0 };
  }
  
  // Undo/Redo
  private pushUndo(docId: string, operations: EditOperation[]): void {
    const stack = this.undoStacks.get(docId);
    if (!stack) return;
    
    stack.undoStack.push(operations);
    stack.redoStack = [];
    
    if (stack.undoStack.length > stack.maxSize) {
      stack.undoStack.shift();
    }
  }
  
  undo(docId: string): void {
    const stack = this.undoStacks.get(docId);
    if (!stack || stack.undoStack.length === 0) return;
    
    const operations = stack.undoStack.pop()!;
    stack.redoStack.push(operations);
    
    // Reverse operations would be applied here
  }
  
  redo(docId: string): void {
    const stack = this.undoStacks.get(docId);
    if (!stack || stack.redoStack.length === 0) return;
    
    const operations = stack.redoStack.pop()!;
    stack.undoStack.push(operations);
    
    this.applyOperations(docId, operations);
  }
  
  // =============================================================================
  // ITEM 666-670: CODE FOLDING & NAVIGATION
  // =============================================================================
  
  getFoldingRanges(docId: string): Range[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const ranges: Range[] = [];
    const lines = doc.content.split('\n');
    const stack: { line: number; indent: number }[] = [];
    
    // Brace-based folding
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      
      for (let j = 0; j < openBraces; j++) {
        stack.push({ line: i, indent: 0 });
      }
      
      for (let j = 0; j < closeBraces && stack.length > 0; j++) {
        const start = stack.pop()!;
        if (i > start.line) {
          ranges.push({
            start: { line: start.line, column: lines[start.line].length },
            end: { line: i, column: lines[i].length }
          });
        }
      }
    }
    
    return ranges;
  }
  
  toggleFold(docId: string, line: number): void {
    const state = this.states.get(docId);
    if (!state) return;
    
    const foldingRanges = this.getFoldingRanges(docId);
    const rangeAtLine = foldingRanges.find(r => r.start.line === line);
    
    if (!rangeAtLine) return;
    
    const isFolded = state.foldedRanges.some(
      r => r.start.line === rangeAtLine.start.line
    );
    
    if (isFolded) {
      state.foldedRanges = state.foldedRanges.filter(
        r => r.start.line !== rangeAtLine.start.line
      );
    } else {
      state.foldedRanges.push(rangeAtLine);
    }
  }
  
  foldAll(docId: string): void {
    const state = this.states.get(docId);
    if (!state) return;
    
    state.foldedRanges = this.getFoldingRanges(docId);
  }
  
  unfoldAll(docId: string): void {
    const state = this.states.get(docId);
    if (!state) return;
    
    state.foldedRanges = [];
  }
  
  // Symbol navigation
  getSymbols(docId: string): Symbol[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const symbols: Symbol[] = [];
    const lines = doc.content.split('\n');
    
    // Regex patterns for common symbols
    const patterns: { pattern: RegExp; kind: string }[] = [
      { pattern: /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*(?:async\s*)?\(|=\s*function|\()/g, kind: 'function' },
      { pattern: /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, kind: 'class' },
      { pattern: /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, kind: 'interface' },
      { pattern: /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, kind: 'type' },
      { pattern: /enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, kind: 'enum' }
    ];
    
    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, kind } of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(lines[i])) !== null) {
          symbols.push({
            name: match[1],
            kind,
            position: { line: i, column: match.index },
            range: {
              start: { line: i, column: 0 },
              end: { line: i, column: lines[i].length }
            }
          });
        }
      }
    }
    
    return symbols;
  }
  
  goToDefinition(docId: string, position: Position): Position | null {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    
    const word = this.getWordAtPosition(docId, position);
    if (!word) return null;
    
    const symbols = this.getSymbols(docId);
    const symbol = symbols.find(s => s.name === word);
    
    return symbol?.position || null;
  }
  
  private getWordAtPosition(docId: string, position: Position): string | null {
    const doc = this.documents.get(docId);
    if (!doc) return null;
    
    const lines = doc.content.split('\n');
    if (position.line >= lines.length) return null;
    
    const line = lines[position.line];
    const wordPattern = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;
    let match;
    
    while ((match = wordPattern.exec(line)) !== null) {
      if (match.index <= position.column && 
          match.index + match[0].length >= position.column) {
        return match[0];
      }
    }
    
    return null;
  }
  
  // =============================================================================
  // ITEM 671-675: FORMATTING & LINTING
  // =============================================================================
  
  format(docId: string): void {
    const doc = this.documents.get(docId);
    if (!doc) return;
    
    let formatted: string;
    
    switch (doc.language) {
      case 'json':
        formatted = this.formatJSON(doc.content);
        break;
      case 'html':
      case 'xml':
        formatted = this.formatHTML(doc.content);
        break;
      case 'css':
      case 'scss':
      case 'less':
        formatted = this.formatCSS(doc.content);
        break;
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        formatted = this.formatJS(doc.content);
        break;
      default:
        formatted = doc.content;
    }
    
    doc.content = formatted;
    doc.version++;
    doc.isDirty = true;
    doc.modified = Date.now();
  }
  
  private formatJSON(content: string): string {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
  
  private formatHTML(content: string): string {
    let result = '';
    let indent = 0;
    const indentStr = '  ';
    
    const tokens = content.match(/<[^>]+>|[^<]+/g) || [];
    
    for (const token of tokens) {
      if (token.startsWith('</')) {
        indent--;
        result += indentStr.repeat(Math.max(0, indent)) + token.trim() + '\n';
      } else if (token.startsWith('<') && !token.endsWith('/>') && !token.startsWith('<!')) {
        result += indentStr.repeat(indent) + token.trim() + '\n';
        if (!token.match(/<(br|hr|img|input|link|meta|area|base|col|embed|param|source|track|wbr)/i)) {
          indent++;
        }
      } else if (token.trim()) {
        result += indentStr.repeat(indent) + token.trim() + '\n';
      }
    }
    
    return result.trim();
  }
  
  private formatCSS(content: string): string {
    let result = '';
    let indent = 0;
    const indentStr = '  ';
    
    content = content.replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{') {
        result += ' {\n';
        indent++;
      } else if (char === '}') {
        indent--;
        result += indentStr.repeat(Math.max(0, indent)) + '}\n';
      } else if (char === ';') {
        result += ';\n' + indentStr.repeat(indent);
      } else if (char === ':' && content[i + 1] !== ':') {
        result += ': ';
        while (content[i + 1] === ' ') i++;
      } else {
        result += char;
      }
    }
    
    return result.trim();
  }
  
  private formatJS(content: string): string {
    // Basic JS formatting - in production would use Prettier
    let result = '';
    let indent = 0;
    const indentStr = '  ';
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const prevChar = content[i - 1];
      
      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        result += char;
        continue;
      }
      
      if (inString) {
        result += char;
        continue;
      }
      
      if (char === '{' || char === '[') {
        result += char + '\n' + indentStr.repeat(++indent);
      } else if (char === '}' || char === ']') {
        result += '\n' + indentStr.repeat(--indent) + char;
      } else if (char === ';') {
        result += ';\n' + indentStr.repeat(indent);
      } else if (char === ',') {
        result += ',\n' + indentStr.repeat(indent);
      } else if (char === '\n' || char === '\r') {
        // Skip
      } else {
        result += char;
      }
    }
    
    return result;
  }
  
  // Linting
  lint(docId: string): Diagnostic[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const diagnostics: Diagnostic[] = [];
    const lines = doc.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for console.log
      if (line.includes('console.log')) {
        diagnostics.push({
          range: { start: { line: i, column: line.indexOf('console.log') }, end: { line: i, column: line.indexOf('console.log') + 11 } },
          severity: 'warning',
          message: 'Unexpected console statement',
          source: 'eslint'
        });
      }
      
      // Check for trailing whitespace
      if (line.endsWith(' ') || line.endsWith('\t')) {
        diagnostics.push({
          range: { start: { line: i, column: line.trimEnd().length }, end: { line: i, column: line.length } },
          severity: 'info',
          message: 'Trailing whitespace',
          source: 'whitespace'
        });
      }
      
      // Check for very long lines
      if (line.length > 120) {
        diagnostics.push({
          range: { start: { line: i, column: 120 }, end: { line: i, column: line.length } },
          severity: 'info',
          message: 'Line exceeds 120 characters',
          source: 'max-len'
        });
      }
    }
    
    return diagnostics;
  }
  
  // Tokenize for syntax highlighting
  tokenize(docId: string): Token[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const grammar = LANGUAGE_GRAMMARS[doc.language] || LANGUAGE_GRAMMARS['javascript'];
    const tokens: Token[] = [];
    const lines = doc.content.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineTokens: { start: number; end: number; type: TokenType }[] = [];
      
      for (const rule of grammar) {
        rule.pattern.lastIndex = 0;
        let match;
        while ((match = rule.pattern.exec(line)) !== null) {
          lineTokens.push({
            start: match.index,
            end: match.index + match[0].length,
            type: rule.tokenType
          });
        }
      }
      
      // Sort and deduplicate
      lineTokens.sort((a, b) => a.start - b.start);
      
      for (const t of lineTokens) {
        tokens.push({
          type: t.type,
          value: line.slice(t.start, t.end),
          start: { line: lineNum, column: t.start },
          end: { line: lineNum, column: t.end }
        });
      }
    }
    
    return tokens;
  }
  
  // Get completions
  getCompletions(docId: string, position: Position): CompletionItem[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];
    
    const lines = doc.content.split('\n');
    const line = lines[position.line] || '';
    const textBefore = line.slice(0, position.column);
    
    let completions: CompletionItem[] = [];
    
    switch (doc.language) {
      case 'html':
        if (textBefore.match(/<[a-z]*$/i)) {
          completions = HTML_TAGS;
        }
        break;
      case 'css':
      case 'scss':
      case 'less':
        completions = CSS_PROPERTIES;
        break;
      case 'javascript':
      case 'typescript':
        completions = JS_SNIPPETS;
        break;
      case 'jsx':
      case 'tsx':
        completions = [...JS_SNIPPETS, ...REACT_SNIPPETS];
        break;
    }
    
    // Filter based on typed text
    const wordMatch = textBefore.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/);
    if (wordMatch) {
      const prefix = wordMatch[0].toLowerCase();
      completions = completions.filter(c => 
        c.label.toLowerCase().startsWith(prefix) ||
        c.label.toLowerCase().includes(prefix)
      );
    }
    
    return completions;
  }
  
  // Utilities
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  
  getDocument(docId: string): EditorDocument | undefined {
    return this.documents.get(docId);
  }
  
  getState(docId: string): EditorState | undefined {
    return this.states.get(docId);
  }
  
  setTheme(theme: SyntaxTheme): void {
    this.theme = theme;
  }
  
  getTheme(): SyntaxTheme {
    return this.theme;
  }
}

// =============================================================================
// ADDITIONAL TYPES
// =============================================================================

export interface Symbol {
  name: string;
  kind: string;
  position: Position;
  range: Range;
  children?: Symbol[];
}

export interface Diagnostic {
  range: Range;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source: string;
  code?: string | number;
  relatedInformation?: { location: Range; message: string }[];
}

// =============================================================================
// EXPORTS
// =============================================================================

export const createEditorEngine = () => new EditorEngine();

export default { EditorEngine, createEditorEngine };
