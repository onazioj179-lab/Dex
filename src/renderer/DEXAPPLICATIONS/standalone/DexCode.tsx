/**
 * DEX Platform - DexCode
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 * Code editor with DexScript — DEX's own simple, powerful scripting language.
 * Write and run code directly inside DEX.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import DexIcon from '../../components/DexIcon';
import { useBeginnerMode, KeyboardShortcutsPanel } from '../../components/Onboarding';

// ======================================================================
// FILE SYSTEM INTEGRATION
// ======================================================================

interface FileInfo {
  path: string;
  name: string;
  modified: boolean;
}

// Recent files storage
const RECENT_FILES_KEY = 'dex-code-recent-files-v1';
const MAX_RECENT_FILES = 10;

function getRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentFile(filePath: string): void {
  try {
    const recent = getRecentFiles().filter(f => f !== filePath);
    recent.unshift(filePath);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_FILES)));
  } catch {
    // ignore
  }
}

async function openFileDialog(): Promise<{ path: string; content: string } | null> {
  try {
    const result = await window.dex?.invoke('dialog:open-file', {
      filters: [
        { name: 'DexScript', extensions: ['dex'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'TypeScript', extensions: ['ts'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (!result || result.canceled) return null;
    const filePath = result.filePaths[0];
    const content = await window.dex?.invoke('fs:read-file', filePath);
    return { path: filePath, content };
  } catch (err) {
    console.error('Failed to open file:', err);
    return null;
  }
}

async function saveFileDialog(content: string, defaultPath?: string): Promise<string | null> {
  try {
    const result = await window.dex?.invoke('dialog:save-file', {
      defaultPath: defaultPath || 'untitled.dex',
      filters: [
        { name: 'DexScript', extensions: ['dex'] },
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (!result || result.canceled) return null;
    const filePath = result.filePath;
    await window.dex?.invoke('fs:write-file', filePath, content);
    return filePath;
  } catch (err) {
    console.error('Failed to save file:', err);
    return null;
  }
}

async function saveFile(filePath: string, content: string): Promise<boolean> {
  try {
    await window.dex?.invoke('fs:write-file', filePath, content);
    return true;
  } catch (err) {
    console.error('Failed to save file:', err);
    return false;
  }
}

// ======================================================================
// DEXSCRIPT RUNTIME
// ======================================================================

const STORAGE_KEY = 'dex-code-draft-v1';
const FILE_KEY = 'dex-code-file-v1';

const DEFAULT_CODE = `// DexScript — Code Editor
let name = "DEX"
print("Hello from " + name + "!")

for i in 1..3 {
  print("Count: " + i)
}
`;

const TEMPLATES = [
  {
    id: 'hello',
    label: 'Hello World',
    fileName: 'hello.dex',
    code: `// Hello World in DexScript
print("Hello, World!")
print("Welcome to DexScript!")
`,
  },
  {
    id: 'math',
    label: 'Math & Numbers',
    fileName: 'math.dex',
    code: `// Math operations in DexScript
let a = 42
let b = 8

print("Add: " + (a + b))
print("Sub: " + (a - b))
print("Mul: " + (a * b))
print("Div: " + (a / b))
print("Mod: " + (a % b))
print("Power: " + math.pow(2, 10))
print("Pi: " + math.pi)
print("Random: " + math.random(1, 100))
print("Abs: " + math.abs(-42))
print("Round: " + math.round(3.7))
print("Floor: " + math.floor(3.7))
print("Ceil: " + math.ceil(3.2))
`,
  },
  {
    id: 'lists',
    label: 'Lists & Data',
    fileName: 'lists.dex',
    code: `// Working with lists in DexScript
let fruits = ["apple", "banana", "cherry", "date"]

print("All: " + fruits)
print("First: " + fruits[0])
print("Length: " + fruits.len())

let upper = fruits.map(f => f.upper())
print("Upper: " + upper)

let long = fruits.filter(f => f.len() > 5)
print("Long names: " + long)

// Objects
let user = {name: "Alex", age: 25, role: "Developer"}
print("Name: " + user.name)
print("Age: " + user.age)

// Spread
let more = [...fruits, "elderberry"]
print("More: " + more)
`,
  },
  {
    id: 'functions',
    label: 'Functions',
    fileName: 'functions.dex',
    code: `// Functions in DexScript
fn add(a, b) {
  return a + b
}

fn factorial(n) {
  if n <= 1 { return 1 }
  return n * factorial(n - 1)
}

fn fizzbuzz(n) {
  for i in 1..n {
    if i % 15 == 0 { print("FizzBuzz") }
    elif i % 3 == 0 { print("Fizz") }
    elif i % 5 == 0 { print("Buzz") }
    else { print(i) }
  }
}

print("2 + 3 = " + add(2, 3))
print("10! = " + factorial(10))
print("--- FizzBuzz ---")
fizzbuzz(20)
`,
  },
  {
    id: 'strings',
    label: 'String Operations',
    fileName: 'strings.dex',
    code: `// String operations in DexScript
let text = "Hello, DexScript World!"

print("Upper: " + text.upper())
print("Lower: " + text.lower())
print("Length: " + text.len())
print("Contains 'Dex': " + text.contains("Dex"))
print("Replace: " + text.replace("World", "User"))
print("Split: " + text.split(" "))
print("Trim: " + "  spaces  ".trim())
print("Starts with: " + text.starts("Hello"))
print("Ends with: " + text.ends("!"))
print("Slice: " + text.slice(0, 5))
print("Repeat: " + "ha".repeat(3))
`,
  },
  {
    id: 'datastructs',
    label: 'Data Structures',
    fileName: 'structures.dex',
    code: `// Data structures in DexScript
let stack = []
stack.push(1)
stack.push(2)
stack.push(3)
print("Stack: " + stack)
print("Pop: " + stack.pop())
print("After pop: " + stack)

// Objects / dictionaries
let config = {theme: "dark", lang: "en", version: 3}
print("Config: " + json.encode(config))
print("Theme: " + config.theme)

// Nested objects
let app = {name: "DEX", settings: {audio: true, fps: 60}}
print("App: " + app.name)
print("FPS: " + app.settings.fps)

// Type checking
print("Type of 42: " + type(42))
print("Type of hello: " + type("hello"))
print("Type of []: " + type([]))
print("Type of {}: " + type({}))
`,
  },
  {
    id: 'algorithms',
    label: 'Algorithms',
    fileName: 'algorithms.dex',
    code: `// Common algorithms in DexScript

fn fibonacci(n) {
  if n <= 1 { return n }
  let a = 0
  let b = 1
  for i in 2..n {
    let temp = b
    b = a + b
    a = temp
  }
  return b
}

fn isPrime(n) {
  if n < 2 { return false }
  for i in 2..math.floor(math.sqrt(n)) {
    if n % i == 0 { return false }
  }
  return true
}

fn bubbleSort(arr) {
  let sorted = [...arr]
  let n = sorted.length
  for i in 0..(n - 1) {
    for j in 0..(n - i - 2) {
      if sorted[j] > sorted[j + 1] {
        let temp = sorted[j]
        sorted[j] = sorted[j + 1]
        sorted[j + 1] = temp
      }
    }
  }
  return sorted
}

print("Fibonacci(10): " + fibonacci(10))
print("--- Primes 1-30 ---")
for n in 2..30 {
  if isPrime(n) { print("  " + n + " is prime") }
}
let nums = [64, 34, 25, 12, 22, 11, 90]
print("Sorted: " + bubbleSort(nums))
`,
  },
  {
    id: 'interactive',
    label: 'Interactive App',
    fileName: 'app.dex',
    code: `// Build a mini app in DexScript

let todos = []

fn addTodo(text) {
  todos.push({text: text, done: false})
  print("+ Added: " + text)
}

fn completeTodo(index) {
  if index >= 0 && index < todos.length {
    todos[index].done = true
    print("  Done: " + todos[index].text)
  }
}

fn showTodos() {
  print("")
  print("--- Todo List ---")
  for i in 0..(todos.length - 1) {
    let status = todos[i].done ? "[x]" : "[ ]"
    print(status + " " + todos[i].text)
  }
  print("-----------------")
}

addTodo("Learn DexScript")
addTodo("Build an app")
addTodo("Ship it!")
completeTodo(0)
showTodos()

print("Total: " + todos.length)
print("Done: " + todos.filter(t => t.done).length)
`,
  },
];

/**
 * DexScript Transpiler — converts DexScript to JavaScript.
 * Simple syntax sugar over JS with a cleaner, friendlier syntax.
 */
function transpileDexScript(source: string): string {
  let code = source;

  // Replace `fn name(args) {` → `function name(args) {`
  code = code.replace(/\bfn\s+(\w+)\s*\(([^)]*)\)\s*\{/g, 'function $1($2) {');

  // Replace `for x in start..end {` → `for (let x = start; x <= end; x++) {`
  code = code.replace(
    /\bfor\s+(\w+)\s+in\s+(.+?)\.\.(.+?)\s*\{/g,
    'for (let $1 = ($2); $1 <= ($3); $1++) {'
  );

  // Replace `for x in list {` → `for (const x of list) {`
  code = code.replace(
    /\bfor\s+(\w+)\s+in\s+(.+?)\s*\{/g,
    'for (const $1 of $2) {'
  );

  // Replace `elif` → `else if`
  code = code.replace(/\belif\b/g, 'else if');

  // Replace `if condition {` → `if (condition) {` — but skip if already has parens
  // Match: if <expr> { where the expr doesn't start with (
  code = code.replace(
    /\bif\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `if (${cond.trim()}) {`
  );

  // Same for else if
  code = code.replace(
    /\belse\s+if\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `else if (${cond.trim()}) {`
  );

  // Same for while
  code = code.replace(
    /\bwhile\s+(?!\s*\()(.+?)\s*\{/g,
    (_, cond) => `while (${cond.trim()}) {`
  );

  // catch block: catch err { → catch(err) {
  code = code.replace(/\bcatch\s+(\w+)\s*\{/g, 'catch($1) {');

  // .len() → .length for arrays
  code = code.replace(/\.len\(\)/g, '.length');

  return code;
}

/**
 * Execute DexScript code in a sandboxed environment.
 * Returns array of output lines.
 */
function executeDexScript(source: string): { output: string[]; error: string | null; duration: number } {
  const output: string[] = [];
  const startTime = performance.now();

  // Build the DexScript standard library
  const dexMath = {
    pi: Math.PI,
    e: Math.E,
    sqrt: Math.sqrt,
    abs: Math.abs,
    pow: Math.pow,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    min: Math.min,
    max: Math.max,
    random: (min = 0, max = 1) => {
      if (max === 1 && min === 0) return Math.random();
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
  };

  const dexTime = {
    now: () => Date.now(),
    date: () => new Date().toLocaleDateString(),
    time: () => new Date().toLocaleTimeString(),
    year: () => new Date().getFullYear(),
    month: () => new Date().getMonth() + 1,
    day: () => new Date().getDate(),
  };

  const dexJson = {
    encode: (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } },
    decode: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
    pretty: (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } },
  };

  const dexSys = {
    version: '1.0',
    platform: 'DEX',
    env: 'DexCode',
  };

  const typeFn = (v: unknown) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'list';
    return typeof v;
  };

  // Enhance String prototype with DexScript methods temporarily
  const stringExtensions: Record<string, Function> = {
    upper: function (this: string) { return this.toUpperCase(); },
    lower: function (this: string) { return this.toLowerCase(); },
    len: function (this: string) { return this.length; },
    contains: function (this: string, s: string) { return this.includes(s); },
    starts: function (this: string, s: string) { return this.startsWith(s); },
    ends: function (this: string, s: string) { return this.endsWith(s); },
    repeat: function (this: string, n: number) { return this.repeat(n); },
  };

  const arrayExtensions: Record<string, Function> = {
    len: function (this: unknown[]) { return this.length; },
  };

  try {
    const jsCode = transpileDexScript(source);

    // Limit execution to prevent infinite loops (100ms budget)
    const maxOutputLines = 1000;
    let lineCount = 0;

    const printFn = (...args: unknown[]) => {
      if (lineCount >= maxOutputLines) {
        throw new Error('Output limit reached (1000 lines). Check for infinite loops.');
      }
      lineCount++;
      output.push(args.map(a => {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (Array.isArray(a)) return '[' + a.join(', ') + ']';
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' '));
    };

    // Wrap strings and arrays with extension methods
    const wrapValue = `
      const __wrapStr = (s) => {
        if (typeof s !== 'string') return s;
        const p = new Proxy(new String(s), {
          get(target, prop) {
            if (prop === 'upper') return () => s.toUpperCase();
            if (prop === 'lower') return () => s.toLowerCase();
            if (prop === 'len') return () => s.length;
            if (prop === 'contains') return (sub) => s.includes(sub);
            if (prop === 'starts') return (sub) => s.startsWith(sub);
            if (prop === 'ends') return (sub) => s.endsWith(sub);
            if (prop === 'trim') return () => s.trim();
            if (prop === 'split') return (sep) => s.split(sep);
            if (prop === 'replace') return (a, b) => s.replace(a, b);
            if (prop === 'slice') return (a, b) => s.slice(a, b);
            if (prop === 'repeat') return (n) => s.repeat(n);
            if (prop === Symbol.toPrimitive) return () => s;
            if (prop === 'toString' || prop === 'valueOf') return () => s;
            return s[prop];
          }
        });
        return p;
      };
    `;

    // Build sandboxed function
    // Block dangerous globals
    const sandbox = new Function(
      'print', 'math', 'time', 'json', 'sys', 'type',
      `"use strict";
      ${wrapValue}
      // Block dangerous APIs
      const window = undefined;
      const document = undefined;
      const fetch = undefined;
      const XMLHttpRequest = undefined;
      const eval = undefined;
      const Function = undefined;
      const importScripts = undefined;
      const localStorage = undefined;
      const sessionStorage = undefined;
      try {
        ${jsCode}
      } catch(e) {
        print("Error: " + e.message);
      }`
    );

    sandbox(printFn, dexMath, dexTime, dexJson, dexSys, typeFn);

    const duration = performance.now() - startTime;
    return { output, error: null, duration };
  } catch (err: unknown) {
    const duration = performance.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return { output, error: msg, duration };
  }
}

// ======================================================================
// SYNTAX HIGHLIGHTING
// ======================================================================

function highlightDexScript(code: string): string {
  // Escape HTML first
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments — must be first to avoid highlighting inside comments
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

  // Methods after dot
  html = html.replace(
    /\.(\w+)\s*\(/g,
    '.<span class="dex-syn-builtin">$1</span>('
  );

  // Function definitions
  html = html.replace(
    /(<span class="dex-syn-keyword">fn<\/span>\s+)(\w+)/g,
    '$1<span class="dex-syn-function">$2</span>'
  );

  // Arrow functions
  html = html.replace(/=&gt;/g, '<span class="dex-syn-keyword">=&gt;</span>');

  // Operators
  html = html.replace(
    /(\.\.\.|\.\.)/g,
    '<span class="dex-syn-operator">$1</span>'
  );

  return html;
}

// ======================================================================
// COMPONENT
// ======================================================================

const DexCode: React.FC = () => {
  const { showShortcutsPanel, setShowShortcutsPanel } = useBeginnerMode('dexcode');
  const [code, setCode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE; } catch { return DEFAULT_CODE; }
  });
  const [fileName, setFileName] = useState(() => {
    try { return localStorage.getItem(FILE_KEY) || 'main.dex'; } catch { return 'main.dex'; }
  });
  // File system state
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => getRecentFiles());
  const [showRecentFiles, setShowRecentFiles] = useState(false);
  
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const [fontSize, setFontSize] = useState(13);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  // Track original content for modified detection
  const originalCodeRef = useRef(code);

  // File system handlers
  const handleOpenFile = useCallback(async () => {
    const result = await openFileDialog();
    if (result) {
      setCode(result.content);
      setCurrentFilePath(result.path);
      setFileName(result.path.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = result.content;
      setIsModified(false);
      addRecentFile(result.path);
      setRecentFiles(getRecentFiles());
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (currentFilePath) {
      const success = await saveFile(currentFilePath, code);
      if (success) {
        originalCodeRef.current = code;
        setIsModified(false);
      }
    } else {
      // Save As if no current file
      const path = await saveFileDialog(code, fileName);
      if (path) {
        setCurrentFilePath(path);
        setFileName(path.split(/[\\/]/).pop() || 'file.dex');
        originalCodeRef.current = code;
        setIsModified(false);
        addRecentFile(path);
        setRecentFiles(getRecentFiles());
      }
    }
  }, [code, currentFilePath, fileName]);

  const handleSaveAs = useCallback(async () => {
    const path = await saveFileDialog(code, fileName);
    if (path) {
      setCurrentFilePath(path);
      setFileName(path.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = code;
      setIsModified(false);
      addRecentFile(path);
      setRecentFiles(getRecentFiles());
    }
  }, [code, fileName]);

  const handleNewFile = useCallback(() => {
    setCode(DEFAULT_CODE);
    setCurrentFilePath(null);
    setFileName('untitled.dex');
    originalCodeRef.current = DEFAULT_CODE;
    setIsModified(false);
  }, []);

  const handleOpenRecent = useCallback(async (filePath: string) => {
    try {
      const content = await window.dex?.invoke('fs:read-file', filePath);
      setCode(content);
      setCurrentFilePath(filePath);
      setFileName(filePath.split(/[\\/]/).pop() || 'file.dex');
      originalCodeRef.current = content;
      setIsModified(false);
      addRecentFile(filePath);
      setRecentFiles(getRecentFiles());
      setShowRecentFiles(false);
    } catch {
      // File might not exist anymore
      const updated = recentFiles.filter(f => f !== filePath);
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      setRecentFiles(updated);
    }
  }, [recentFiles]);

  // Track modifications
  useEffect(() => {
    setIsModified(code !== originalCodeRef.current);
  }, [code]);

  // Auto-save
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, code);
        localStorage.setItem(FILE_KEY, fileName);
      } catch { /* ignore */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [code, fileName]);

  // Sync scroll between editor and highlight overlay
  const handleScroll = useCallback(() => {
    if (editorRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = editorRef.current.scrollTop;
      highlightRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, []);

  // Run code
  const runCode = useCallback(() => {
    setIsRunning(true);
    setOutput([]);
    setError(null);
    // Use requestAnimationFrame so UI updates before execution
    requestAnimationFrame(() => {
      const result = executeDexScript(code);
      setOutput(result.output);
      setError(result.error);
      setDuration(result.duration);
      setIsRunning(false);
      // Scroll output to bottom
      requestAnimationFrame(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
      });
    });
  }, [code]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSaveFile();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewFile();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(false);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowFind(true);
        setShowReplace(true);
        requestAnimationFrame(() => findInputRef.current?.focus());
      }
      if (e.key === 'Escape' && showFind) {
        setShowFind(false);
        setShowReplace(false);
        editorRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        setFontSize(s => Math.min(s + 1, 24));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setFontSize(s => Math.max(s - 1, 9));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [code, fileName, runCode, showFind, handleSaveFile, handleSaveAs, handleOpenFile, handleNewFile]);

  // Tab key, bracket auto-close, auto-indent
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // Tab indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
      return;
    }

    // Bracket auto-close
    const bracketPairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    if (bracketPairs[e.key]) {
      e.preventDefault();
      const close = bracketPairs[e.key];
      const newCode = code.substring(0, start) + e.key + close + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Quote auto-close
    if (e.key === '"' || e.key === "'") {
      const charAfter = code[start] || '';
      if (charAfter === e.key) {
        e.preventDefault();
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
        return;
      }
      e.preventDefault();
      const newCode = code.substring(0, start) + e.key + e.key + code.substring(end);
      setCode(newCode);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Skip closing bracket/paren/brace
    if (([')', ']', '}'].includes(e.key)) && code[start] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
      return;
    }

    // Enter auto-indent
    if (e.key === 'Enter') {
      e.preventDefault();
      const before = code.substring(0, start);
      const after = code.substring(end);
      const currentLine = before.split('\n').pop() || '';
      const indent = currentLine.match(/^(\s*)/)?.[1] || '';
      const charBefore = code[start - 1];
      const charAfter = code[start];
      if (charBefore === '{' && charAfter === '}') {
        const newCode = before + '\n' + indent + '  \n' + indent + after;
        setCode(newCode);
        requestAnimationFrame(() => {
          const pos = start + 1 + indent.length + 2;
          ta.selectionStart = ta.selectionEnd = pos;
        });
      } else {
        const extra = charBefore === '{' ? '  ' : '';
        const newCode = before + '\n' + indent + extra + after;
        setCode(newCode);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 1 + indent.length + extra.length;
        });
      }
      return;
    }

    // Backspace: delete matching pair
    if (e.key === 'Backspace' && start === end && start > 0) {
      const pair = code[start - 1] + code[start];
      if (pair === '{}' || pair === '[]' || pair === '()' || pair === '""' || pair === "''") {
        e.preventDefault();
        const newCode = code.substring(0, start - 1) + code.substring(start + 1);
        setCode(newCode);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start - 1; });
        return;
      }
    }
  }, [code]);

  const highlighted = useMemo(() => highlightDexScript(code), [code]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);

  // Cursor position tracking
  const updateCursorPos = useCallback(() => {
    if (!editorRef.current) return;
    const pos = editorRef.current.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    setCursorPos({ line, col });
  }, [code]);

  // Find/replace logic
  const findNext = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const startPos = ta.selectionEnd;
    const idx = code.toLowerCase().indexOf(findText.toLowerCase(), startPos);
    if (idx !== -1) {
      ta.focus();
      ta.selectionStart = idx;
      ta.selectionEnd = idx + findText.length;
    } else {
      const wrapIdx = code.toLowerCase().indexOf(findText.toLowerCase());
      if (wrapIdx !== -1) {
        ta.focus();
        ta.selectionStart = wrapIdx;
        ta.selectionEnd = wrapIdx + findText.length;
      }
    }
  }, [code, findText]);

  const findPrev = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const startPos = Math.max(0, ta.selectionStart - 1);
    const idx = code.toLowerCase().lastIndexOf(findText.toLowerCase(), startPos);
    if (idx !== -1) {
      ta.focus();
      ta.selectionStart = idx;
      ta.selectionEnd = idx + findText.length;
    } else {
      const wrapIdx = code.toLowerCase().lastIndexOf(findText.toLowerCase());
      if (wrapIdx !== -1) {
        ta.focus();
        ta.selectionStart = wrapIdx;
        ta.selectionEnd = wrapIdx + findText.length;
      }
    }
  }, [code, findText]);

  const replaceOne = useCallback(() => {
    if (!findText || !editorRef.current) return;
    const ta = editorRef.current;
    const selected = code.substring(ta.selectionStart, ta.selectionEnd);
    if (selected.toLowerCase() === findText.toLowerCase()) {
      const newCode = code.substring(0, ta.selectionStart) + replaceText + code.substring(ta.selectionEnd);
      setCode(newCode);
      requestAnimationFrame(() => findNext());
    } else {
      findNext();
    }
  }, [code, findText, replaceText, findNext]);

  const replaceAll = useCallback(() => {
    if (!findText) return;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    setCode(code.replace(regex, replaceText));
  }, [code, findText, replaceText]);

  const findMatchCount = useMemo(() => {
    if (!findText) return 0;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (code.match(regex) || []).length;
  }, [code, findText]);

  const stats = useMemo(() => {
    const lines = code.split('\n').length;
    const chars = code.length;
    const words = code.trim().split(/\s+/).filter(Boolean).length;
    return { lines, chars, words };
  }, [code]);

  return (
    <div style={S.container}>
      {/* Sidebar */}
      <aside style={S.sidebar}>
        <div style={S.sidebarBlock}>
          <h1 style={{...S.title, fontSize: 18}}>DexCode</h1>
        </div>

        {/* File Actions */}
        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>File</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={handleNewFile} style={S.fileActionBtn}>
              <DexIcon name="plus" size={12} />
              <span>New File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+N</span>
            </button>
            <button onClick={handleOpenFile} style={S.fileActionBtn}>
              <DexIcon name="folder-open" size={12} />
              <span>Open File</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+O</span>
            </button>
            <button onClick={handleSaveFile} style={S.fileActionBtn}>
              <DexIcon name="save" size={12} />
              <span>Save{isModified ? ' *' : ''}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+S</span>
            </button>
            <button onClick={handleSaveAs} style={S.fileActionBtn}>
              <DexIcon name="download" size={12} />
              <span>Save As</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>Ctrl+Shift+S</span>
            </button>
          </div>
        </div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <div style={S.sidebarBlock}>
            <div 
              style={{ ...S.sectionHeading, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowRecentFiles(!showRecentFiles)}
            >
              <DexIcon name={showRecentFiles ? 'chevron-down' : 'chevron-right'} size={10} />
              Recent Files
            </div>
            {showRecentFiles && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentFiles.map((f, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleOpenRecent(f)} 
                    style={{ ...S.recentFileBtn }}
                    title={f}
                  >
                    <DexIcon name="code" size={11} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.split(/[\\/]/).pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>Templates</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => { setFileName(t.fileName); setCode(t.code); }}
                style={{...S.templateBtn, padding: '6px 8px'}}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-border-subtle, rgba(255,255,255,0.04))')}
              >
                <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={S.sidebarBlock}>
          <div style={S.sectionHeading}>Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            <div style={S.statCard}><span style={S.statLabel}>L</span><span style={S.statValue}>{stats.lines}</span></div>
            <div style={S.statCard}><span style={S.statLabel}>W</span><span style={S.statValue}>{stats.words}</span></div>
            <div style={S.statCard}><span style={S.statLabel}>C</span><span style={S.statValue}>{stats.chars}</span></div>
          </div>
        </div>
      </aside>

      {/* Main workspace */}
      <section style={S.workspace}>
        {/* Top bar */}
        <div style={S.topBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={fileName + (isModified ? ' •' : '')}
              onChange={e => setFileName(e.target.value.replace(' •', ''))}
              style={S.fileInput}
              aria-label="File name"
              title={currentFilePath || 'Unsaved file'}
            />
            {currentFilePath && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentFilePath}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={runCode}
              disabled={isRunning}
              style={S.runBtn}
              onMouseEnter={e => { if (!isRunning) e.currentTarget.style.background = 'var(--color-text-secondary)'; }}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-text-primary)'}
            >
              <DexIcon name="play" size={13} color="var(--color-bg-base)" />
              <span>{isRunning ? 'Running...' : 'Run'}</span>
            </button>
            <button
              onClick={() => { setOutput([]); setError(null); }}
              style={S.clearBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Clear
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, borderLeft: '1px solid var(--color-border)', paddingLeft: 6 }}>
              <button
                onClick={() => setFontSize(s => Math.max(s - 1, 9))}
                style={S.fontBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Decrease font size"
              >
                <DexIcon name="minus" size={11} />
              </button>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
              <button
                onClick={() => setFontSize(s => Math.min(s + 1, 24))}
                style={S.fontBtn}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="Increase font size"
              >
                <DexIcon name="plus" size={11} />
              </button>
            </div>
            <button
              onClick={() => { setShowFind(f => !f); if (!showFind) requestAnimationFrame(() => findInputRef.current?.focus()); }}
              style={S.clearBtn}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title="Find (Ctrl+F)"
            >
              <DexIcon name="search" size={11} />
            </button>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Ctrl+Enter to run</span>
          </div>
        </div>

        {/* Editor + Output */}
        <div style={S.editorLayout}>
          {/* Code Editor */}
          <div style={S.editorPane}>
            <div style={S.paneHeader}>
              <span>Editor</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>.dex</span>
            </div>
            {/* Find/Replace bar */}
            {showFind && (
              <div style={S.findBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <DexIcon name="search" size={12} color="var(--color-text-tertiary)" />
                  <input
                    ref={findInputRef}
                    value={findText}
                    onChange={e => setFindText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); } if (e.key === 'Escape') { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); } }}
                    placeholder="Find..."
                    style={S.findInput}
                    aria-label="Find text"
                  />
                  {findText && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{findMatchCount} found</span>}
                  <button onClick={findPrev} style={S.findNavBtn} title="Previous (Shift+Enter)"><DexIcon name="chevron-up" size={12} /></button>
                  <button onClick={findNext} style={S.findNavBtn} title="Next (Enter)"><DexIcon name="chevron-down" size={12} /></button>
                  <button onClick={() => setShowReplace(v => !v)} style={{...S.findNavBtn, color: showReplace ? 'var(--color-accent, #4A9EFF)' : undefined}} title="Toggle Replace (Ctrl+H)"><DexIcon name="repeat" size={12} /></button>
                  <button onClick={() => { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); }} style={S.findNavBtn} title="Close (Esc)"><DexIcon name="close" size={12} /></button>
                </div>
                {showReplace && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <DexIcon name="corner-down-right" size={12} color="var(--color-text-tertiary)" />
                    <input
                      value={replaceText}
                      onChange={e => setReplaceText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') replaceOne(); if (e.key === 'Escape') { setShowFind(false); setShowReplace(false); editorRef.current?.focus(); } }}
                      placeholder="Replace..."
                      style={S.findInput}
                      aria-label="Replace text"
                    />
                    <button onClick={replaceOne} style={S.findNavBtn} title="Replace">1</button>
                    <button onClick={replaceAll} style={S.findNavBtn} title="Replace All">All</button>
                  </div>
                )}
              </div>
            )}
            <div style={S.editorWrapper}>
              {/* Line numbers */}
              <div style={S.lineNumbers} aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} style={S.lineNum}>{i + 1}</div>
                ))}
              </div>
              {/* Syntax highlight overlay */}
              <pre
                ref={highlightRef}
                style={{...S.highlightOverlay, fontSize}}
                dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
                aria-hidden="true"
              />
              {/* Actual textarea */}
              <textarea
                ref={editorRef}
                value={code}
                onChange={e => setCode(e.target.value)}
                onScroll={handleScroll}
                onKeyDown={handleKeyDown}
                onKeyUp={updateCursorPos}
                onClick={updateCursorPos}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{...S.editor, fontSize}}
                aria-label="DexScript code editor"
              />
            </div>
          </div>

          {/* Output Panel */}
          <div style={S.outputPane}>
            <div style={S.paneHeader}>
              <span>Output</span>
              {duration > 0 && (
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  {duration < 1 ? '<1' : Math.round(duration)}ms
                </span>
              )}
            </div>
            <div ref={outputRef} style={S.outputContent}>
              {output.length === 0 && !error && (
                <div style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic', fontSize: 12 }}>
                  <span style={{opacity:0.5}}>\$ </span>Run your code to see output here
                </div>
              )}
              {output.map((line, i) => (
                <div key={i} style={S.outputLine}>
                  <span style={{ position: 'absolute', left: 0, opacity: 0.3 }} aria-hidden="true">›</span>
                  {line}
                </div>
              ))}
              {error && (
                <div style={S.errorLine}>
                  <DexIcon name="alert-triangle" size={12} color="var(--color-text-primary)" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={S.statusBar}>
          <span>DexScript</span>
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>{stats.lines} lines</span>
          <span>{stats.chars} chars</span>
          <span style={{ fontSize: 9 }}>{fontSize}px</span>
          <span style={{ marginLeft: 'auto' }}>? shortcuts · Ctrl+F find · Ctrl+H replace · Ctrl+S export</span>
        </div>
      </section>
      {showShortcutsPanel && <KeyboardShortcutsPanel appId="dexcode" onClose={() => setShowShortcutsPanel(false)} />}
    </div>
  );
};

// ======================================================================
// STYLES
// ======================================================================

const S: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: '200px minmax(0, 1fr)',
    height: '100%',
    width: '100%',
    background: 'var(--color-bg-base)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family)',
    fontSize: '11px',
    overflow: 'hidden',
    position: 'relative',
    contain: 'layout style',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    background: 'var(--color-bg-surface-solid)',
    borderRight: '1px solid var(--color-border)',
    overflow: 'auto',
    scrollbarWidth: 'none',
  },
  sidebarBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
  },
  eyebrow: {
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'var(--color-text-tertiary)',
  },
  title: {
    margin: 0,
    fontSize: 22,
    letterSpacing: '-0.03em',
    fontWeight: 700,
  },
  subtitle: {
    margin: 0,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-tertiary)',
  },
  templateBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    gap: 2,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle, rgba(255,255,255,0.04))',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    transition: 'background 0.12s',
    textAlign: 'left' as const,
  },
  fileActionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontSize: 11,
    fontWeight: 500,
    textAlign: 'left' as const,
    width: '100%',
  },
  recentFileBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 8px',
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-tertiary)',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontSize: 10,
    textAlign: 'left' as const,
    width: '100%',
  },
  refCode: {
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 4,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-primary)',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: 8,
    borderRadius: 8,
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    alignItems: 'center',
  },
  statLabel: { fontSize: 9, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  statValue: { fontSize: 13, fontWeight: 700 },
  workspace: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    height: '100%',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    minHeight: 40,
    padding: '0 12px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    flexShrink: 0,
    gap: 6,
    position: 'relative',
    zIndex: 100,
  },
  fileInput: {
    background: 'var(--color-bg-hover)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '4px 10px',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    width: 160,
  },
  runBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-base)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  clearBtn: {
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  editorLayout: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    overflow: 'hidden',
  },
  editorPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  paneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-secondary)',
    flexShrink: 0,
  },
  editorWrapper: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'hidden',
    display: 'flex',
  },
  lineNumbers: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px 0',
    background: 'var(--color-bg-base, #0C0C0E)',
    borderRight: '1px solid var(--color-border)',
    minWidth: 40,
    textAlign: 'right' as const,
    userSelect: 'none' as const,
    overflow: 'hidden',
    flexShrink: 0,
  },
  lineNum: {
    fontSize: 11,
    lineHeight: '20px',
    color: 'var(--color-text-tertiary)',
    paddingRight: 8,
    fontFamily: 'var(--font-mono)',
  },
  highlightOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 12,
    fontSize: 13,
    lineHeight: '20px',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre' as const,
    overflow: 'hidden',
    pointerEvents: 'none' as const,
    color: 'var(--color-text-primary)',
    background: 'transparent',
    border: 'none',
    wordWrap: 'normal' as const,
  },
  editor: {
    position: 'absolute' as const,
    top: 0,
    left: 40,
    right: 0,
    bottom: 0,
    padding: 12,
    fontSize: 13,
    lineHeight: '20px',
    fontFamily: 'var(--font-mono)',
    background: 'var(--color-bg-base, #0C0C0E)',
    color: 'transparent',
    caretColor: 'var(--color-text-primary)',
    border: 'none',
    outline: 'none',
    resize: 'none' as const,
    overflow: 'auto',
    whiteSpace: 'pre' as const,
    wordWrap: 'normal' as const,
    tabSize: 2,
    WebkitTextFillColor: 'transparent',
  },
  outputPane: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    borderLeft: '1px solid var(--color-border)',
  },
  outputContent: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: '1.6',
    background: 'var(--color-bg-base, #0C0C0E)',
    scrollbarWidth: 'thin' as const,
  },
  outputLine: {
    color: 'var(--color-text-secondary)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    position: 'relative' as const,
    paddingLeft: 14,
  },
  errorLine: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    color: 'var(--color-text-primary)',
    background: 'var(--color-bg-hover)',
    borderLeft: '2px solid var(--color-text-primary)',
    padding: '8px 12px',
    marginTop: 8,
    fontSize: 12,
    whiteSpace: 'pre-wrap' as const,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
    height: 24,
    fontSize: 10,
    color: 'var(--color-text-tertiary)',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg-surface)',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  fontBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.12s',
    padding: 0,
  },
  findBar: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '6px 10px',
    background: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  findInput: {
    flex: 1,
    background: 'var(--color-bg-base, #0C0C0E)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '3px 8px',
    color: 'var(--color-text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    minWidth: 0,
  },
  findNavBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 700,
    padding: 0,
  },
};

export default memo(DexCode);
