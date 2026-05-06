// DexScript templates and default code.

export const STORAGE_KEY = 'dex-code-draft-v1';
export const FILE_KEY = 'dex-code-file-v1';

export const DEFAULT_CODE = `// DexScript — Code Editor
let name = "DEX"
print("Hello from " + name + "!")

for i in 1..3 {
  print("Count: " + i)
}
`;

export interface DexScriptTemplate {
  id: string;
  label: string;
  fileName: string;
  code: string;
}

export const TEMPLATES: DexScriptTemplate[] = [
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
