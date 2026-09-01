/**
 * Test Scenarios
 *
 * Each scenario defines a project structure and user prompt
 * that exercises different model behaviors.
 */

export interface TestScenario {
	name: string
	description: string
	expectedMaxTurns: number // Ideal max turns for this task
	files: Record<string, string>
	userPrompt: string
}

// ────────────────────────────────────────────────────────────
//  Scenario 1: Simple File Edit
// ────────────────────────────────────────────────────────────

export const simpleEdit: TestScenario = {
	name: "simple_edit",
	description: "Add a console.log to an existing function",
	expectedMaxTurns: 3,
	files: {
		"src/index.ts": `import { greet } from "./utils"

function main() {
  const name = "World"
  const message = greet(name)
  return message
}

export default main
`,
		"src/utils.ts": `export function greet(name: string): string {
  return \`Hello, \${name}!\`
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}
`,
		"package.json": `{
  "name": "test-project",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "start": "ts-node src/index.ts",
    "test": "vitest"
  }
}
`,
	},
	userPrompt: 'Add a console.log("Starting main...") at the beginning of the main() function in src/index.ts',
}

// ────────────────────────────────────────────────────────────
//  Scenario 2: Bug Fix
// ────────────────────────────────────────────────────────────

export const bugFix: TestScenario = {
	name: "bug_fix",
	description: "Fix a TypeError in a utility function",
	expectedMaxTurns: 4,
	files: {
		"src/calculator.ts": `export function add(a: number, b: number): number {
  return a + b
}

export function divide(a: number, b: number): number {
  return a / b
}

export function parseAndAdd(input: string): number {
  const parts = input.split(",")
  const a = parseInt(parts[0])
  const b = parseInt(parts[1])
  // BUG: No null check — throws TypeError when input has no comma
  return a + b
}
`,
		"src/index.ts": `import { parseAndAdd } from "./calculator"

const result = parseAndAdd("42")
console.log(result)
`,
		"package.json": `{
  "name": "calc-project",
  "version": "1.0.0",
  "main": "src/index.ts"
}
`,
	},
	userPrompt:
		"The parseAndAdd function in src/calculator.ts crashes with TypeError when the input string has no comma. Fix it to return NaN gracefully when input is invalid.",
}

// ────────────────────────────────────────────────────────────
//  Scenario 3: Feature Addition
// ────────────────────────────────────────────────────────────

export const featureAdd: TestScenario = {
	name: "feature_add",
	description: "Add a new export function to an existing module",
	expectedMaxTurns: 3,
	files: {
		"src/helpers.ts": `export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + "..."
}
`,
		"src/index.ts": `import { capitalize, truncate } from "./helpers"

console.log(capitalize("hello"))
console.log(truncate("hello world", 5))
`,
		"package.json": `{
  "name": "string-utils",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		"Add a new exported function `slugify(str: string): string` to src/helpers.ts that converts a string to a URL-friendly slug (lowercase, spaces to hyphens, remove non-alphanumeric chars except hyphens). Also add an example usage in src/index.ts.",
}

// ────────────────────────────────────────────────────────────
//  Scenario 4: Multi-file Refactor
// ────────────────────────────────────────────────────────────

export const multiFileRefactor: TestScenario = {
	name: "multi_file_refactor",
	description: "Rename a function across multiple files",
	expectedMaxTurns: 6,
	files: {
		"src/auth.ts": `export function validateUser(username: string, password: string): boolean {
  if (!username || !password) return false
  return username.length >= 3 && password.length >= 8
}
`,
		"src/api.ts": `import { validateUser } from "./auth"

export function handleLogin(req: any) {
  const { username, password } = req.body
  if (validateUser(username, password)) {
    return { status: 200, message: "Login successful" }
  }
  return { status: 401, message: "Invalid credentials" }
}
`,
		"src/middleware.ts": `import { validateUser } from "./auth"

export function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).send("No token")
  }
  // Simplified: validate from decoded token
  if (validateUser(token, token)) {
    next()
  } else {
    res.status(403).send("Forbidden")
  }
}
`,
		"src/tests/auth.test.ts": `import { validateUser } from "../auth"

describe("validateUser", () => {
  it("should return true for valid credentials", () => {
    expect(validateUser("admin", "password123")).toBe(true)
  })

  it("should return false for empty username", () => {
    expect(validateUser("", "password123")).toBe(false)
  })
})
`,
		"package.json": `{
  "name": "auth-service",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		"Rename the function `validateUser` to `authenticateUser` across the entire codebase. Update all imports, usages, and test descriptions.",
}

// ────────────────────────────────────────────────────────────
//  Scenario 5: Exploration (Read-Only Understanding)
// ────────────────────────────────────────────────────────────

export const exploration: TestScenario = {
	name: "exploration",
	description: "Understand what a module does without making changes",
	expectedMaxTurns: 4,
	files: {
		"src/cache.ts": `interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }
    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs: number = 60000): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest (first entry)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
`,
		"src/index.ts": `import { LRUCache } from "./cache"

const cache = new LRUCache<string>(50)
cache.set("user:1", "Alice", 30000)
console.log(cache.get("user:1"))
`,
		"package.json": `{
  "name": "cache-lib",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		"Explain what the cache module does. What is the eviction strategy? What happens when a key expires? Give me a short summary.",
}

// ────────────────────────────────────────────────────────────
//  Scenario 6: Error Recovery
// ────────────────────────────────────────────────────────────

export const errorRecovery: TestScenario = {
	name: "error_recovery",
	description: "Test recovery when model references wrong file paths",
	expectedMaxTurns: 5,
	files: {
		"lib/config.ts": `export const config = {
  port: 3000,
  host: "localhost",
  debug: false,
}
`,
		"lib/server.ts": `import { config } from "./config"

export function startServer() {
  console.log(\`Server running at \${config.host}:\${config.port}\`)
}
`,
		"package.json": `{
  "name": "server-app",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		'Change the default port from 3000 to 8080 in the config file. Note: the project structure uses a "lib/" directory, not "src/".',
}

// ────────────────────────────────────────────────────────────
//  Scenario 7: Duplicate / Similar Code Blocks Disambiguation
// ────────────────────────────────────────────────────────────

export const duplicateCodeBlocks: TestScenario = {
	name: "duplicate_code_blocks",
	description: "Disambiguate and edit one specific function when multiple identical structures exist",
	expectedMaxTurns: 4,
	files: {
		"src/handlers.ts": `export function handleGet() {
  console.log("Processing request");
  return { status: 200, data: "ok" };
}

export function handlePost() {
  console.log("Processing request");
  return { status: 200, data: "ok" };
}

export function handleDelete() {
  console.log("Processing request");
  return { status: 200, data: "ok" };
}
`,
		"package.json": `{
  "name": "handlers-app",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		'In src/handlers.ts, update ONLY `handlePost` to change the returned status to 201 and data to "created". Do NOT modify handleGet or handleDelete.',
}

// ────────────────────────────────────────────────────────────
//  Scenario 8: Whitespace & Deep Indentation Corner Case
// ────────────────────────────────────────────────────────────

export const whitespaceIndentCornerCase: TestScenario = {
	name: "whitespace_indent",
	description: "Edit code with deep nested indentation and varied whitespace",
	expectedMaxTurns: 3,
	files: {
		"src/matrix.ts": `export class Matrix {
    public static multiply(a: number[][], b: number[][]): number[][] {
        const rowsA = a.length;
        const colsA = a[0].length;
        const colsB = b[0].length;
        const result: number[][] = [];

        for (let i = 0; i < rowsA; i++) {
            result[i] = [];
            for (let j = 0; j < colsB; j++) {
                let sum = 0;
                for (let k = 0; k < colsA; k++) {
                    sum += a[i][k] * b[k][j];
                }
                result[i][j] = sum;
            }
        }
        return result;
    }
}
`,
		"package.json": `{
  "name": "matrix-lib",
  "version": "1.0.0"
}
`,
	},
	userPrompt:
		'In src/matrix.ts, add input dimension validation at the start of `multiply`: if `colsA !== b.length`, throw an Error("Matrix dimensions do not match for multiplication").',
}

// ────────────────────────────────────────────────────────────
//  All Scenarios
// ────────────────────────────────────────────────────────────

export const ALL_SCENARIOS: TestScenario[] = [
	simpleEdit,
	bugFix,
	featureAdd,
	multiFileRefactor,
	exploration,
	errorRecovery,
	duplicateCodeBlocks,
	whitespaceIndentCornerCase,
]
