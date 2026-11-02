/**
 * Test Scenarios — Basic to Advanced
 *
 * Tags:
 *   basic, bugfix, refactor, feature, advanced,
 *   typescript, testing, security, perf
 */

export interface TestScenario {
	name: string
	description: string
	expectedMaxTurns: number
	tags: string[]
	files: Record<string, string>
	userPrompt: string
	enableThinking?: boolean
	selfCorrectionNudge?: (files: Record<string, string>, attemptCount: number) => string | null
	/** Optional post-run verifier: receives final file contents and returns null on pass or an error string on fail */
	verifyFn?: (files: Record<string, string>) => string | null
}

export const simpleEdit: TestScenario = {
	name: "simple_edit",
	description: "Add a console.log to an existing function",
	expectedMaxTurns: 3,
	tags: ["basic"],
	files: {
		"src/index.ts": `import { greet } from "./utils"\n\nfunction main() {\n  const name = "World"\n  const message = greet(name)\n  return message\n}\n\nexport default main\n`,
		"src/utils.ts": `export function greet(name: string): string {\n  return \`Hello, \${name}!\`\n}\n`,
		"package.json": `{\n  "name": "test-project",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt: 'Add a console.log("Starting main...") at the beginning of the main() function in src/index.ts',
}

export const bugFix: TestScenario = {
	name: "bug_fix",
	description: "Fix a TypeError in a utility function",
	expectedMaxTurns: 4,
	tags: ["bugfix", "basic"],
	files: {
		"src/calculator.ts": `export function parseAndAdd(input: string): number {\n  const parts = input.split(",")\n  const a = parseInt(parts[0])\n  const b = parseInt(parts[1])\n  // BUG: No null check — throws TypeError when input has no comma\n  return a + b\n}\n`,
		"package.json": `{\n  "name": "calc-project",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"The parseAndAdd function in src/calculator.ts crashes with TypeError when the input string has no comma. Fix it to return NaN gracefully when input is invalid.",
}

export const featureAdd: TestScenario = {
	name: "feature_add",
	description: "Add a new export function to an existing module",
	expectedMaxTurns: 3,
	tags: ["feature", "basic"],
	files: {
		"src/helpers.ts": `export function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1)\n}\n\nexport function truncate(str: string, maxLength: number): string {\n  if (str.length <= maxLength) return str\n  return str.slice(0, maxLength) + "..."\n}\n`,
		"src/index.ts": `import { capitalize, truncate } from "./helpers"\nconsole.log(capitalize("hello"))\nconsole.log(truncate("hello world", 5))\n`,
		"package.json": `{\n  "name": "string-utils",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Add a new exported function `slugify(str: string): string` to src/helpers.ts that converts a string to a URL-friendly slug (lowercase, spaces to hyphens, remove non-alphanumeric chars except hyphens). Also add an example usage in src/index.ts.",
}

export const multiFileRefactor: TestScenario = {
	name: "multi_file_refactor",
	description: "Rename a function across multiple files",
	expectedMaxTurns: 6,
	tags: ["refactor", "advanced"],
	files: {
		"src/auth.ts": `export function validateUser(username: string, password: string): boolean {\n  if (!username || !password) return false\n  return username.length >= 3 && password.length >= 8\n}\n`,
		"src/api.ts": `import { validateUser } from "./auth"\nexport function handleLogin(req: any) {\n  const { username, password } = req.body\n  if (validateUser(username, password)) {\n    return { status: 200, message: "Login successful" }\n  }\n  return { status: 401, message: "Invalid credentials" }\n}\n`,
		"src/middleware.ts": `import { validateUser } from "./auth"\nexport function authMiddleware(req: any, res: any, next: any) {\n  const token = req.headers.authorization\n  if (!token) return res.status(401).send("No token")\n  if (validateUser(token, token)) next()\n  else res.status(403).send("Forbidden")\n}\n`,
		"src/tests/auth.test.ts": `import { validateUser } from "../auth"\ndescribe("validateUser", () => {\n  it("returns true for valid credentials", () => {\n    expect(validateUser("admin", "password123")).toBe(true)\n  })\n})\n`,
		"package.json": `{\n  "name": "auth-service",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Rename the function `validateUser` to `authenticateUser` across the entire codebase. Update all imports, usages, and test descriptions.",
}

export const exploration: TestScenario = {
	name: "exploration",
	description: "Understand what a module does without making changes",
	expectedMaxTurns: 4,
	tags: ["basic"],
	files: {
		"src/cache.ts": `export class LRUCache<T> {\n  private cache = new Map<string, { value: T; expiresAt: number }>()\n  private maxSize: number\n  constructor(maxSize: number = 100) { this.maxSize = maxSize }\n  get(key: string): T | undefined {\n    const entry = this.cache.get(key)\n    if (!entry) return undefined\n    if (Date.now() > entry.expiresAt) { this.cache.delete(key); return undefined }\n    this.cache.delete(key); this.cache.set(key, entry)\n    return entry.value\n  }\n  set(key: string, value: T, ttlMs: number = 60000): void {\n    if (this.cache.size >= this.maxSize) {\n      const firstKey = this.cache.keys().next().value\n      if (firstKey !== undefined) this.cache.delete(firstKey)\n    }\n    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })\n  }\n}\n`,
		"package.json": `{\n  "name": "cache-lib",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Explain what the cache module does. What is the eviction strategy? What happens when a key expires? Give a short summary.",
}

export const errorRecovery: TestScenario = {
	name: "error_recovery",
	description: "Test recovery when model references wrong file paths",
	expectedMaxTurns: 5,
	tags: ["bugfix"],
	files: {
		"lib/config.ts": `export const config = {\n  port: 3000,\n  host: "localhost",\n  debug: false,\n}\n`,
		"lib/server.ts": `import { config } from "./config"\nexport function startServer() {\n  console.log(\`Server running at \${config.host}:\${config.port}\`)\n}\n`,
		"package.json": `{\n  "name": "server-app",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		'Change the default port from 3000 to 8080 in the config file. Note: the project uses a "lib/" directory, not "src/".',
}

export const duplicateCodeBlocks: TestScenario = {
	name: "duplicate_code_blocks",
	description: "Disambiguate and edit one specific function when multiple identical structures exist",
	expectedMaxTurns: 4,
	tags: ["bugfix", "basic"],
	files: {
		"src/handlers.ts": `export function handleGet() {\n  console.log("Processing request");\n  return { status: 200, data: "ok" };\n}\n\nexport function handlePost() {\n  console.log("Processing request");\n  return { status: 200, data: "ok" };\n}\n\nexport function handleDelete() {\n  console.log("Processing request");\n  return { status: 200, data: "ok" };\n}\n`,
		"package.json": `{\n  "name": "handlers-app",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		'In src/handlers.ts, update ONLY `handlePost` to change the returned status to 201 and data to "created". Do NOT modify handleGet or handleDelete.',
}

export const whitespaceIndentCornerCase: TestScenario = {
	name: "whitespace_indent",
	description: "Edit code with deep nested indentation",
	expectedMaxTurns: 3,
	tags: ["basic", "bugfix"],
	files: {
		"src/matrix.ts": `export class Matrix {\n    public static multiply(a: number[][], b: number[][]): number[][] {\n        const rowsA = a.length;\n        const colsA = a[0].length;\n        const colsB = b[0].length;\n        const result: number[][] = [];\n        for (let i = 0; i < rowsA; i++) {\n            result[i] = [];\n            for (let j = 0; j < colsB; j++) {\n                let sum = 0;\n                for (let k = 0; k < colsA; k++) { sum += a[i][k] * b[k][j]; }\n                result[i][j] = sum;\n            }\n        }\n        return result;\n    }\n}\n`,
		"package.json": `{\n  "name": "matrix-lib",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		'In src/matrix.ts, add input dimension validation at the start of `multiply`: if colsA !== b.length, throw an Error("Matrix dimensions do not match for multiplication").',
}

export const typescriptGenerics: TestScenario = {
	name: "typescript_generics",
	description: "Add TypeScript generics to an untyped Result monad",
	expectedMaxTurns: 4,
	tags: ["typescript", "feature"],
	files: {
		"src/result.ts": `// Untyped — needs TypeScript generics\nexport function ok(value: any) {\n  return { success: true, value, error: null }\n}\nexport function err(error: any) {\n  return { success: false, value: null, error }\n}\nexport function map(result: any, fn: any) {\n  if (!result.success) return result\n  try { return ok(fn(result.value)) } catch (e) { return err(e) }\n}\nexport function flatMap(result: any, fn: any) {\n  if (!result.success) return result\n  try { return fn(result.value) } catch (e) { return err(e) }\n}\n`,
		"package.json": `{\n  "name": "result-monad",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Rewrite src/result.ts to use proper TypeScript generics. Create a `Result<T, E>` discriminated union type ({ success: true; value: T } | { success: false; error: E }). Make `ok<T>`, `err<E>`, `map<T, U, E>`, and `flatMap<T, U, E>` fully type-safe.",
}

export const asyncAwaitRefactor: TestScenario = {
	name: "async_await_refactor",
	description: "Convert promise chains to async/await",
	expectedMaxTurns: 4,
	tags: ["refactor", "feature"],
	files: {
		"src/api-client.ts": `// Legacy promise-chain style\nexport function fetchUserData(userId: string): Promise<any> {\n  return fetch(\`https://api.example.com/users/\${userId}\`)\n    .then(response => {\n      if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`)\n      return response.json()\n    })\n    .then(user => {\n      return fetch(\`https://api.example.com/posts?userId=\${user.id}\`)\n        .then(r => r.json())\n        .then(posts => ({ ...user, posts }))\n    })\n    .catch(error => { console.error("Failed:", error); throw error })\n}\n\nexport function batchFetchUsers(userIds: string[]): Promise<any[]> {\n  return Promise.all(userIds.map(id => fetchUserData(id)))\n    .then(users => users.filter(u => u !== null))\n    .catch(error => { console.error("Batch failed:", error); return [] })\n}\n`,
		"package.json": `{\n  "name": "api-client",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Refactor src/api-client.ts to use async/await instead of promise chains. Maintain the same behavior and error handling. Keep the function signatures identical.",
}

export const writeUnitTests: TestScenario = {
	name: "write_unit_tests",
	description: "Write comprehensive unit tests for a validation module",
	expectedMaxTurns: 5,
	tags: ["testing", "feature"],
	files: {
		"src/validation.ts": `export interface ValidationResult {\n  valid: boolean\n  errors: string[]\n}\n\nexport function validateEmail(email: string): ValidationResult {\n  const errors: string[] = []\n  if (!email) {\n    errors.push("Email is required")\n  } else {\n    if (!email.includes("@")) errors.push("Email must contain @")\n    if (!email.includes(".")) errors.push("Email must contain a dot")\n    if (email.startsWith("@") || email.endsWith("@")) errors.push("@ must not be at the start or end")\n    if (email.length > 254) errors.push("Email too long (max 254 chars)")\n  }\n  return { valid: errors.length === 0, errors }\n}\n\nexport function validatePassword(password: string): ValidationResult {\n  const errors: string[] = []\n  if (!password) {\n    errors.push("Password is required")\n  } else {\n    if (password.length < 8) errors.push("Password must be at least 8 characters")\n    if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter")\n    if (!/[0-9]/.test(password)) errors.push("Password must contain a number")\n    if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain a special character")\n  }\n  return { valid: errors.length === 0, errors }\n}\n`,
		"package.json": `{\n  "name": "validation-lib",\n  "version": "1.0.0",\n  "devDependencies": { "vitest": "^1.0.0" }\n}\n`,
	},
	userPrompt:
		"Write a comprehensive test file at `src/validation.test.ts` using vitest (describe/it/expect). Cover happy paths, each specific error case, and edge cases (empty string, boundary values). Use descriptive test names.",
}

export const securityVulnerability: TestScenario = {
	name: "security_vulnerability",
	description: "Fix SQL injection and XSS vulnerabilities",
	expectedMaxTurns: 5,
	tags: ["security", "bugfix", "advanced"],
	files: {
		"src/db.ts": `import { Database } from "sqlite3"\nexport const db = new Database(":memory:")\n\n// VULNERABLE: SQL injection via string interpolation\nexport function getUserByUsername(username: string): Promise<any> {\n  return new Promise((resolve, reject) => {\n    db.get(\`SELECT * FROM users WHERE username = '\${username}'\`,\n      (err, row) => err ? reject(err) : resolve(row))\n  })\n}\n\nexport function insertUser(username: string, email: string): Promise<void> {\n  return new Promise((resolve, reject) => {\n    db.run(\`INSERT INTO users (username, email) VALUES ('\${username}', '\${email}')\`,\n      (err) => err ? reject(err) : resolve())\n  })\n}\n`,
		"src/routes.ts": `import express from "express"\nimport { getUserByUsername } from "./db"\nconst router = express.Router()\n\n// VULNERABLE: XSS — reflects raw input\nrouter.get("/profile", async (req, res) => {\n  const { username } = req.query\n  const user = await getUserByUsername(username as string)\n  if (!user) {\n    res.send(\`<p>User '\${username}' not found</p>\`)\n    return\n  }\n  res.send(\`<h1>Welcome, \${user.displayName}!</h1>\`)\n})\n\nexport default router\n`,
		"package.json": `{\n  "name": "vulnerable-app",\n  "version": "1.0.0",\n  "dependencies": { "express": "^4.18.0", "sqlite3": "^5.0.0" }\n}\n`,
	},
	userPrompt:
		"Fix ALL vulnerabilities: (1) Use parameterized queries in src/db.ts to prevent SQL injection. (2) Add input validation (non-empty, max length 50, alphanumeric+underscore only). (3) Escape HTML in src/routes.ts to prevent XSS. Create `src/sanitize.ts` with an `escapeHtml(str)` helper.",
}

export const performanceOptimization: TestScenario = {
	name: "performance_optimization",
	description: "Fix O(n^2) and redundant computation bottlenecks",
	expectedMaxTurns: 5,
	tags: ["perf", "refactor", "advanced"],
	files: {
		"src/analytics.ts": `export interface Event {\n  userId: string\n  type: string\n  timestamp: number\n  value: number\n}\n\n// SLOW: O(n^2) — nested loop\nexport function getEventsForUser(events: Event[], userId: string): Event[] {\n  const result: Event[] = []\n  for (const event of events) {\n    for (let i = 0; i < events.length; i++) {\n      if (events[i].userId === userId && events[i] === event) {\n        result.push(event)\n      }\n    }\n  }\n  return result\n}\n\n// SLOW: filters per type = multiple passes\nexport function getSummaryByType(events: Event[]): Record<string, { count: number; total: number; avg: number }> {\n  const types = [...new Set(events.map(e => e.type))]\n  const summary: Record<string, { count: number; total: number; avg: number }> = {}\n  for (const type of types) {\n    const typeEvents = events.filter(e => e.type === type)\n    const total = typeEvents.reduce((sum, e) => sum + e.value, 0)\n    summary[type] = { count: typeEvents.length, total, avg: total / typeEvents.length }\n  }\n  return summary\n}\n`,
		"package.json": `{\n  "name": "analytics-lib",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Optimize src/analytics.ts: (1) Fix the O(n^2) bug in getEventsForUser to O(n) using a simple filter. (2) Make getSummaryByType do a single pass instead of filtering per type. (3) Add a comment above each function noting the complexity before and after.",
}

export const complexDebugging: TestScenario = {
	name: "complex_debugging",
	description: "Find and fix off-by-one and state mutation bugs across files",
	expectedMaxTurns: 7,
	tags: ["bugfix", "advanced"],
	files: {
		"src/pagination.ts": `export function paginate<T>(items: T[], page: number, pageSize: number) {\n  // BUG: off-by-one — page is 1-indexed but treated as 0-indexed\n  const start = page * pageSize\n  const end = start + pageSize\n  const pageItems = items.slice(start, end)\n  const totalPages = Math.ceil(items.length / pageSize)\n  return { items: pageItems, page, totalPages, hasNext: page < totalPages, hasPrev: page > 0 }\n}\n`,
		"src/store.ts": `export function createStore<T extends { id: string }>(initial: T[] = []) {\n  const items = initial\n  return {\n    items,\n    add(item: T) {\n      items.push(item) // BUG: mutates original array\n      return createStore(items)\n    },\n    remove(id: string) {\n      const idx = items.findIndex(i => i.id === id)\n      if (idx >= 0) items.splice(idx, 1) // BUG: mutates\n      return createStore(items)\n    },\n    getAll() { return items }\n  }\n}\n`,
		"src/index.ts": `import { paginate } from "./pagination"\nimport { createStore } from "./store"\n\nconst items = Array.from({ length: 10 }, (_, i) => ({ id: String(i), value: i }))\nconst page1 = paginate(items, 1, 3) // Should return first page (indices 0-2)\nconsole.log("Page 1 items:", page1.items)\n\nconst store = createStore(items)\nconst store2 = store.add({ id: "99", value: 99 })\nconsole.log("Original:", store.getAll().length, "New:", store2.getAll().length)\n`,
		"package.json": `{\n  "name": "buggy-app",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Two bugs: (1) In pagination.ts, paginate(items, 1, 3) should return the FIRST page (indices 0-2) but returns wrong page. Fix 1-indexed conversion. (2) In store.ts, add and remove mutate the original array. Make them immutable. Update src/index.ts to show correct behavior.",
}

export const largeFileEdit: TestScenario = {
	name: "large_file_edit",
	description: "Make a precise single-value edit inside a large constants file",
	expectedMaxTurns: 4,
	tags: ["basic"],
	files: {
		"src/constants.ts": `export const APP_VERSION = "2.1.0"\nexport const APP_NAME = "Mirror VS"\n\nexport const API_TIMEOUTS = {\n  default: 30_000,\n  upload: 120_000,\n  download: 60_000,\n  heartbeat: 5_000,\n}\n\nexport const API_RETRY_LIMITS = {\n  read: 3,\n  write: 2,\n  auth: 5,\n}\n\nexport const API_BASE_URLS = {\n  production: "https://api.mirror-vs.com",\n  staging: "https://staging-api.mirror-vs.com",\n  development: "http://localhost:3001",\n}\n\nexport const FEATURE_FLAGS = {\n  enableStreaming: true,\n  enableCheckpoints: true,\n  enableMultiTab: false,\n  enableCodexIntegration: false,\n  enableVoiceInput: false,\n  enableCollaboration: false,\n  enableAnalytics: true,\n  enableExperimentalDiff: false,\n}\n\nexport const MAX_CHAT_HISTORY = 1_000\nexport const MAX_FILE_SIZE_MB = 50\nexport const DEBOUNCE_MS = 300\nexport const ANIMATION_DURATION_MS = 200\n`,
		"package.json": `{\n  "name": "mirror-constants",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In src/constants.ts, set `enableMultiTab` to `true` in the FEATURE_FLAGS object. ONLY change that one value.",
}

export const apiIntegration: TestScenario = {
	name: "api_integration",
	description: "Add a new REST endpoint following existing patterns",
	expectedMaxTurns: 6,
	tags: ["feature", "advanced"],
	files: {
		"src/routes/users.ts": `import express from "express"\nconst router = express.Router()\ninterface User { id: string; name: string; email: string; createdAt: Date }\nconst users: User[] = [\n  { id: "1", name: "Alice", email: "alice@example.com", createdAt: new Date("2024-01-01") },\n  { id: "2", name: "Bob", email: "bob@example.com", createdAt: new Date("2024-01-02") },\n]\nrouter.get("/", (req, res) => res.json({ users, total: users.length }))\nrouter.get("/:id", (req, res) => {\n  const user = users.find(u => u.id === req.params.id)\n  if (!user) return res.status(404).json({ error: "User not found" })\n  res.json(user)\n})\nrouter.post("/", (req, res) => {\n  const { name, email } = req.body\n  if (!name || !email) return res.status(400).json({ error: "name and email required" })\n  const newUser: User = { id: String(Date.now()), name, email, createdAt: new Date() }\n  users.push(newUser)\n  res.status(201).json(newUser)\n})\nexport default router\n`,
		"src/routes/posts.ts": `import express from "express"\nconst router = express.Router()\ninterface Post { id: string; userId: string; title: string; body: string; createdAt: Date }\nconst posts: Post[] = [\n  { id: "1", userId: "1", title: "Hello World", body: "My first post", createdAt: new Date() },\n]\nrouter.get("/", (req, res) => {\n  const { userId } = req.query\n  const result = userId ? posts.filter(p => p.userId === userId) : posts\n  res.json({ posts: result, total: result.length })\n})\nrouter.get("/:id", (req, res) => {\n  const post = posts.find(p => p.id === req.params.id)\n  if (!post) return res.status(404).json({ error: "Post not found" })\n  res.json(post)\n})\nrouter.post("/", (req, res) => {\n  const { userId, title, body } = req.body\n  if (!userId || !title || !body) return res.status(400).json({ error: "userId, title, and body required" })\n  const newPost: Post = { id: String(Date.now()), userId, title, body, createdAt: new Date() }\n  posts.push(newPost)\n  res.status(201).json(newPost)\n})\nexport default router\n`,
		"src/app.ts": `import express from "express"\nimport usersRouter from "./routes/users"\nimport postsRouter from "./routes/posts"\nconst app = express()\napp.use(express.json())\napp.use("/users", usersRouter)\napp.use("/posts", postsRouter)\nexport default app\n`,
		"package.json": `{\n  "name": "rest-api",\n  "version": "1.0.0",\n  "dependencies": { "express": "^4.18.0" }\n}\n`,
	},
	userPrompt:
		"Add a `comments` resource following the same patterns. Create `src/routes/comments.ts` with a Comment interface (id, postId, userId, text, createdAt), GET /comments (optional postId filter), GET /comments/:id, POST /comments (validates postId, userId, text). Register at /comments in src/app.ts.",
}

export const dependencyInjection: TestScenario = {
	name: "dependency_injection",
	description: "Refactor hardcoded deps to constructor injection for testability",
	expectedMaxTurns: 6,
	tags: ["refactor", "testing", "advanced"],
	files: {
		"src/emailService.ts": `import nodemailer from "nodemailer"\nexport class EmailService {\n  private transporter = nodemailer.createTransport({\n    host: "smtp.gmail.com", port: 587,\n    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }\n  })\n  async sendWelcomeEmail(to: string, name: string): Promise<void> {\n    await this.transporter.sendMail({ from: "noreply@example.com", to, subject: "Welcome!", html: \`<h1>Welcome, \${name}!</h1>\` })\n  }\n  async sendPasswordReset(to: string, token: string): Promise<void> {\n    await this.transporter.sendMail({ from: "noreply@example.com", to, subject: "Password Reset", html: \`<p>Reset: https://example.com/reset?token=\${token}</p>\` })\n  }\n}\n`,
		"src/userService.ts": `import { EmailService } from "./emailService"\nexport class UserService {\n  private emailService = new EmailService()\n  async registerUser(email: string, name: string) {\n    const user = { id: String(Date.now()), email, name }\n    await this.emailService.sendWelcomeEmail(email, name)\n    return user\n  }\n  async requestPasswordReset(email: string): Promise<void> {\n    const token = Math.random().toString(36).slice(2)\n    await this.emailService.sendPasswordReset(email, token)\n  }\n}\n`,
		"package.json": `{\n  "name": "user-service",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Refactor for testability via DI: (1) Create `src/interfaces.ts` with IEmailTransport and IEmailService interfaces. (2) EmailService accepts IEmailTransport in constructor (default: nodemailer). (3) UserService accepts IEmailService in constructor. Everything works the same by default but is now easily mockable.",
}

export const parallelismTest: TestScenario = {
	name: "parallelism_test",
	description: "Task requires reading multiple files first then coordinated edits",
	expectedMaxTurns: 5,
	tags: ["advanced", "feature"],
	files: {
		"src/config/database.ts": `export const dbConfig = {\n  host: process.env.DB_HOST || "localhost",\n  port: parseInt(process.env.DB_PORT || "5432"),\n  name: process.env.DB_NAME || "myapp_dev",\n  user: process.env.DB_USER || "postgres",\n  password: process.env.DB_PASSWORD || "",\n  poolSize: 10,\n}\n`,
		"src/config/redis.ts": `export const redisConfig = {\n  host: process.env.REDIS_HOST || "localhost",\n  port: parseInt(process.env.REDIS_PORT || "6379"),\n  password: process.env.REDIS_PASSWORD || "",\n  db: 0,\n  ttl: 3600,\n}\n`,
		"src/config/app.ts": `export const appConfig = {\n  port: parseInt(process.env.PORT || "3000"),\n  host: process.env.HOST || "0.0.0.0",\n  env: process.env.NODE_ENV || "development",\n  logLevel: process.env.LOG_LEVEL || "info",\n  corsOrigins: process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000"],\n}\n`,
		"src/config/index.ts": `export { dbConfig } from "./database"\nexport { redisConfig } from "./redis"\nexport { appConfig } from "./app"\n`,
		"package.json": `{\n  "name": "config-module",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Add cacheConfig: (1) Create `src/config/cache.ts` with cacheConfig (strategy: 'memory' | 'redis', maxItems: number default 1000, ttlMs: number default 300000, prefix: string default 'cache:'). (2) Export from `src/config/index.ts`. (3) Add a `Config` type to index.ts combining all 4 configs.",
}

export const dbSchemaMigration: TestScenario = {
	name: "db_schema_migration",
	description: "Write a DB migration and update ORM models to add a tags feature",
	expectedMaxTurns: 6,
	tags: ["feature", "advanced"],
	files: {
		"src/models/User.ts": `import { Model, DataTypes, Sequelize } from "sequelize"\nexport class User extends Model {\n  declare id: number\n  declare username: string\n  declare email: string\n  static initialize(sequelize: Sequelize) {\n    User.init({\n      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },\n      username: { type: DataTypes.STRING(50), allowNull: false, unique: true },\n      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },\n    }, { sequelize, tableName: "users", timestamps: true })\n  }\n}\n`,
		"src/models/Post.ts": `import { Model, DataTypes, Sequelize } from "sequelize"\nimport { User } from "./User"\nexport class Post extends Model {\n  declare id: number\n  declare userId: number\n  declare title: string\n  declare body: string\n  static initialize(sequelize: Sequelize) {\n    Post.init({\n      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },\n      userId: { type: DataTypes.INTEGER, allowNull: false },\n      title: { type: DataTypes.STRING(255), allowNull: false },\n      body: { type: DataTypes.TEXT, allowNull: false },\n    }, { sequelize, tableName: "posts", timestamps: true })\n  }\n  static associate() {\n    Post.belongsTo(User, { foreignKey: "userId", as: "author" })\n  }\n}\n`,
		"src/migrations/001_initial.ts": `import type { QueryInterface, DataTypes as DT } from "sequelize"\nexport async function up(queryInterface: QueryInterface, DataTypes: typeof DT) {\n  await queryInterface.createTable("users", {\n    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },\n    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },\n    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },\n    createdAt: { type: DataTypes.DATE, allowNull: false },\n    updatedAt: { type: DataTypes.DATE, allowNull: false },\n  })\n  await queryInterface.createTable("posts", {\n    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },\n    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "users", key: "id" } },\n    title: { type: DataTypes.STRING(255), allowNull: false },\n    body: { type: DataTypes.TEXT, allowNull: false },\n    createdAt: { type: DataTypes.DATE, allowNull: false },\n    updatedAt: { type: DataTypes.DATE, allowNull: false },\n  })\n}\nexport async function down(queryInterface: QueryInterface) {\n  await queryInterface.dropTable("posts")\n  await queryInterface.dropTable("users")\n}\n`,
		"package.json": `{\n  "name": "db-app",\n  "version": "1.0.0",\n  "dependencies": { "sequelize": "^6.0.0" }\n}\n`,
	},
	userPrompt:
		"Add tags feature: (1) Create `src/migrations/002_add_tags.ts` that creates a `tags` table (id, name unique, timestamps) and a `post_tags` join table (postId FK->posts, tagId FK->tags, composite PK). (2) Create `src/models/Tag.ts` Sequelize model. (3) Update `src/models/Post.ts` to add many-to-many association with Tag through post_tags.",
}

export const eventEmitterRefactor: TestScenario = {
	name: "event_emitter_refactor",
	description: "Refactor loosely-typed event handling to a strongly typed EventEmitter with unsubscribe tokens",
	expectedMaxTurns: 5,
	tags: ["refactor", "typescript", "advanced"],
	files: {
		"src/events.ts": `type Handler = (...args: any[]) => void\n\nexport class LegacyEmitter {\n  private events: Record<string, Handler[]> = {}\n\n  on(event: string, handler: Handler): void {\n    if (!this.events[event]) this.events[event] = []\n    this.events[event].push(handler)\n  }\n\n  emit(event: string, ...args: any[]): void {\n    const handlers = this.events[event] || []\n    for (const h of handlers) h(...args)\n  }\n}\n`,
		"src/app.ts": `import { LegacyEmitter } from "./events"\n\nconst emitter = new LegacyEmitter()\nemitter.on("data", (chunk) => console.log("Received:", chunk))\nemitter.emit("data", "hello world")\n`,
		"package.json": `{\n  "name": "typed-events",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In `src/events.ts`, replace `LegacyEmitter` with a strongly-typed `TypedEventEmitter<EventMap extends Record<string, any>>`: (1) `on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): () => void` returning an unsubscribe function. (2) `emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void`. (3) In `src/app.ts`, define an `AppEvents` interface with `data: string` and `error: Error`, instantiate `TypedEventEmitter<AppEvents>`, and use the returned unsubscribe function.",
}

export const circuitBreakerImplementation: TestScenario = {
	name: "circuit_breaker",
	description: "Implement a 3-state Circuit Breaker for resilient external API calls",
	expectedMaxTurns: 5,
	tags: ["feature", "resilience", "advanced"],
	files: {
		"src/circuitBreaker.ts": `export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN"\n\nexport interface CircuitBreakerOptions {\n  failureThreshold: number\n  recoveryTimeoutMs: number\n}\n\nexport class CircuitBreaker {\n  private state: CircuitState = "CLOSED"\n  // Needs implementation\n  constructor(private options: CircuitBreakerOptions) {}\n\n  getState(): CircuitState {\n    return this.state\n  }\n\n  async execute<T>(action: () => Promise<T>): Promise<T> {\n    // Needs implementation\n    return action()\n  }\n}\n`,
		"src/index.ts": `import { CircuitBreaker } from "./circuitBreaker"\n\nconst breaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 1000 })\nconsole.log("Breaker state:", breaker.getState())\n`,
		"package.json": `{\n  "name": "resilience-kit",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In `src/circuitBreaker.ts`, implement the full Circuit Breaker state machine: (1) When CLOSED: actions execute normally. If failures reach `failureThreshold`, transition to OPEN and record the trip timestamp. (2) When OPEN: immediate throw with `Error('Circuit breaker is OPEN')` without calling action. If `recoveryTimeoutMs` has passed since tripping, transition to HALF_OPEN. (3) When HALF_OPEN: allow one probe execution. If it succeeds, transition back to CLOSED and reset failure count. If it fails, transition back to OPEN and reset timeout.",
}

export const lruCacheImplementation: TestScenario = {
	name: "lru_cache",
	description: "Implement an in-memory O(1) LRU Cache with capacity limit and eviction",
	expectedMaxTurns: 4,
	tags: ["perf", "algorithms", "advanced"],
	files: {
		"src/lruCache.ts": `export class LRUCache<K, V> {\n  private capacity: number\n  private cache: Map<K, V> = new Map()\n\n  constructor(capacity: number) {\n    this.capacity = capacity\n  }\n\n  get(key: K): V | undefined {\n    // Needs implementation: retrieve and mark as most recently used\n    return undefined\n  }\n\n  set(key: K, value: V): void {\n    // Needs implementation: insert/update and evict least recently used if exceeding capacity\n  }\n\n  size(): number {\n    return this.cache.size\n  }\n}\n`,
		"src/index.ts": `import { LRUCache } from "./lruCache"\nconst cache = new LRUCache<string, number>(2)\ncache.set("a", 1)\ncache.set("b", 2)\nconsole.log(cache.get("a"))\n`,
		"package.json": `{\n  "name": "cache-lib",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In `src/lruCache.ts`, implement the `get` and `set` methods using Map iteration order for O(1) operations: (1) `get(key)`: if present, re-insert to refresh recency and return value; otherwise return undefined. (2) `set(key, value)`: if key already exists, delete it first before re-setting. If cache size exceeds `capacity`, delete the oldest entry (the first key in Map keys iterator). (3) Add `has(key: K): boolean` without updating recency.",
}

export const rateLimiterMiddleware: TestScenario = {
	name: "rate_limiter",
	description: "Implement a sliding-window rate limiting middleware for HTTP handlers",
	expectedMaxTurns: 4,
	tags: ["feature", "security", "advanced"],
	files: {
		"src/rateLimiter.ts": `export interface RateLimitOptions {\n  windowMs: number\n  maxRequests: number\n}\n\nexport interface Request {\n  ip: string\n}\n\nexport interface Response {\n  status: (code: number) => Response\n  json: (data: any) => void\n}\n\nexport function createRateLimiter(options: RateLimitOptions) {\n  // Needs implementation: track timestamps per IP\n  return (req: Request, res: Response, next: () => void) => {\n    next()\n  }\n}\n`,
		"package.json": `{\n  "name": "rate-limiter",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In `src/rateLimiter.ts`, implement `createRateLimiter`: (1) Store an in-memory map of `ip -> number[]` (timestamps of requests). (2) On each request, prune timestamps older than `Date.now() - options.windowMs`. (3) If remaining requests >= `options.maxRequests`, respond with `res.status(429).json({ error: 'Too Many Requests', retryAfterMs })` where retryAfterMs is time until oldest request leaves the window. (4) Otherwise record current timestamp and call `next()`.",
}

// ────────────────────────────────────────────────────────────
//  SOTA Frontier & Stress Test Scenarios (Antigravity / Claude Code / Cursor Tier)
// ────────────────────────────────────────────────────────────

// 1. Long Log Diagnostics (1,000+ line compilation log inspection)
const buildLogChunks: string[] = []
for (let i = 1; i <= 350; i++) {
	buildLogChunks.push(
		`[info] [tsc:worker-${(i % 4) + 1}] Compiled module src/generated/schema_${i}.ts in ${12 + (i % 7)}ms`,
	)
}
buildLogChunks.push(
	`src/models/user.ts:18:7 - error TS2339: Property 'stripeCustomerId' does not exist on type 'UserPayload'.`,
)
buildLogChunks.push(`18   user.stripeCustomerId = payload.stripeCustomerId;`)
buildLogChunks.push(`          ~~~~~~~~~~~~~~~~`)
for (let i = 351; i <= 700; i++) {
	buildLogChunks.push(`[info] [webpack:asset] Emitted asset static/chunks/vendor.${i}.js (14.2 KiB)`)
}
buildLogChunks.push(`src/services/billing.ts:42:10 - error TS2322: Type 'string' is not assignable to type 'number'.`)
buildLogChunks.push(`42   invoice.accountId = String(user.id);`)
buildLogChunks.push(`             ~~~~~~~~~`)
for (let i = 701; i <= 1000; i++) {
	buildLogChunks.push(`[info] [optimize] Tree-shaking pass ${i - 700} complete across 42 modules`)
}
buildLogChunks.push(`Found 2 errors in 2 files. Exited with status 1.`)

export const longLogDiagnostics: TestScenario = {
	name: "long_log_diagnostics",
	description: "Diagnose buried compiler errors in a 1,000+ line CI build log without token-wasting dump",
	expectedMaxTurns: 5,
	tags: ["perf", "bugfix", "advanced", "stress"],
	files: {
		"build.log": buildLogChunks.join("\n"),
		"src/models/user.ts": `export interface UserPayload {\n  id: number\n  name: string\n  email: string\n}\n\nexport interface UserRecord extends UserPayload {\n  stripeCustomerId?: string\n  createdAt: Date\n}\n\nexport function createUser(payload: UserPayload): UserRecord {\n  const user: UserRecord = {\n    ...payload,\n    createdAt: new Date(),\n  }\n  user.stripeCustomerId = payload.stripeCustomerId\n  return user\n}\n`,
		"src/services/billing.ts": `export interface Invoice {\n  id: string\n  accountId: number\n  amount: number\n}\n\nexport function generateInvoice(user: { id: number }, amount: number): Invoice {\n  const invoice: Invoice = {\n    id: \`inv-\${Date.now()}\`,\n    accountId: 0,\n    amount,\n  }\n  invoice.accountId = String(user.id)\n  return invoice\n}\n`,
		"package.json": `{\n  "name": "billing-app",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"The CI pipeline failed during build. Inspect the 1,000+ line log in `build.log` to identify the two TypeScript errors, find their exact root causes in the source code, and fix them in `src/models/user.ts` and `src/services/billing.ts` so the types match.",
}

// 2. Massive Multi-Module Migration (8-file architecture refactor)
export const massiveMultiModuleMigration: TestScenario = {
	name: "massive_multi_module_migration",
	description: "System-wide EntityId migration from number to string UUID across 8 interdependent modules",
	expectedMaxTurns: 8,
	tags: ["refactor", "typescript", "advanced", "stress"],
	files: {
		"src/types/id.ts": `export type EntityId = number\n`,
		"src/models/account.ts": `import { EntityId } from "../types/id"\n\nexport interface Account {\n  id: EntityId\n  ownerName: string\n  balance: number\n}\n`,
		"src/models/transaction.ts": `import { EntityId } from "../types/id"\n\nexport interface Transaction {\n  id: EntityId\n  accountId: EntityId\n  amount: number\n  timestamp: number\n}\n`,
		"src/repositories/accountRepo.ts": `import { EntityId } from "../types/id"\nimport { Account } from "../models/account"\n\nexport class AccountRepository {\n  private accounts = new Map<EntityId, Account>()\n  async findById(id: EntityId): Promise<Account | null> {\n    return this.accounts.get(id) || null\n  }\n  async save(account: Account): Promise<void> {\n    this.accounts.set(account.id, account)\n  }\n}\n`,
		"src/services/paymentService.ts": `import { EntityId } from "../types/id"\nimport { AccountRepository } from "../repositories/accountRepo"\n\nexport class PaymentService {\n  constructor(private repo: AccountRepository) {}\n  async processTransfer(fromId: EntityId, toId: EntityId, amount: number): Promise<boolean> {\n    const from = await this.repo.findById(fromId)\n    const to = await this.repo.findById(toId)\n    if (!from || !to || from.balance < amount) return false\n    from.balance -= amount\n    to.balance += amount\n    await this.repo.save(from)\n    await this.repo.save(to)\n    return true\n  }\n}\n`,
		"src/controllers/paymentController.ts": `import { PaymentService } from "../services/paymentService"\n\nexport class PaymentController {\n  constructor(private paymentService: PaymentService) {}\n  async handleTransfer(req: any, res: any) {\n    const fromId = parseInt(req.body.fromId, 10)\n    const toId = parseInt(req.body.toId, 10)\n    const amount = Number(req.body.amount)\n    const success = await this.paymentService.processTransfer(fromId, toId, amount)\n    res.status(success ? 200 : 400).json({ success })\n  }\n}\n`,
		"src/middleware/authValidator.ts": `import { EntityId } from "../types/id"\n\nexport function validateAccountId(id: any): id is EntityId {\n  return typeof id === "number" && !isNaN(id)\n}\n`,
		"src/tests/payment.test.ts": `import { AccountRepository } from "../repositories/accountRepo"\nimport { PaymentService } from "../services/paymentService"\nimport { validateAccountId } from "../middleware/authValidator"\n\ndescribe("Payment System", () => {\n  it("validates IDs", () => {\n    expect(validateAccountId(123)).toBe(true)\n  })\n  it("processes transfers", async () => {\n    const repo = new AccountRepository()\n    repo.save({ id: 1, ownerName: "Alice", balance: 500 })\n    repo.save({ id: 2, ownerName: "Bob", balance: 100 })\n    const service = new PaymentService(repo)\n    const result = await service.processTransfer(1, 2, 200)\n    expect(result).toBe(true)\n  })\n})\n`,
		"package.json": `{\n  "name": "enterprise-payments",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Perform a system-wide migration to change `EntityId` from `number` to a UUID `string` across all 8 files:\n1. Update `src/types/id.ts` to `export type EntityId = string`\n2. In `src/controllers/paymentController.ts`, remove `parseInt` and assign string IDs directly.\n3. In `src/middleware/authValidator.ts`, validate that the ID is a string with length >= 4.\n4. In `src/tests/payment.test.ts`, update tests to use string UUIDs like 'acc-uuid-1' and 'acc-uuid-2'.",
}

// 3. Complex State Machine & Concurrency Audit
export const complexStateMachineAudit: TestScenario = {
	name: "complex_state_machine_audit",
	description: "Fix race conditions, lease renewal timeouts, and timer leaks in a distributed worker queue",
	expectedMaxTurns: 6,
	tags: ["bugfix", "concurrency", "advanced", "stress"],
	files: {
		"src/workerQueue.ts": `export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT"\n\nexport interface Job<T> {\n  id: string\n  data: T\n  status: JobStatus\n  leaseExpiresAt: number\n}\n\nexport class DistributedWorkerQueue<T> {\n  private jobs = new Map<string, Job<T>>()\n  private timers = new Map<string, NodeJS.Timeout>()\n  private leaseDurationMs: number\n\n  constructor(leaseDurationMs = 5000) {\n    this.leaseDurationMs = leaseDurationMs\n  }\n\n  submitJob(id: string, data: T): Job<T> {\n    const job: Job<T> = {\n      id,\n      data,\n      status: "PENDING",\n      leaseExpiresAt: 0,\n    }\n    this.jobs.set(id, job)\n    return job\n  }\n\n  startJob(id: string): Job<T> | null {\n    const job = this.jobs.get(id)\n    if (!job || job.status !== "PENDING") return null\n    job.status = "RUNNING"\n    job.leaseExpiresAt = Date.now() + this.leaseDurationMs\n\n    // Start heartbeat lease renewal\n    const timer = setInterval(() => {\n      this.renewLease(id)\n    }, Math.floor(this.leaseDurationMs / 2))\n    this.timers.set(id, timer)\n    return job\n  }\n\n  // BUG 1: Race condition — does not check if job was cancelled or already timed out\n  renewLease(id: string): boolean {\n    const job = this.jobs.get(id)\n    if (!job) return false\n    job.leaseExpiresAt = Date.now() + this.leaseDurationMs\n    return true\n  }\n\n  // BUG 2: Memory leak — does not clear interval timer on completion or cancellation\n  completeJob(id: string): void {\n    const job = this.jobs.get(id)\n    if (job) job.status = "COMPLETED"\n  }\n\n  cancelJob(id: string): void {\n    const job = this.jobs.get(id)\n    if (job) job.status = "CANCELLED"\n  }\n\n  isLeaseValid(id: string): boolean {\n    const job = this.jobs.get(id)\n    if (!job || job.status !== "RUNNING") return false\n    return Date.now() < job.leaseExpiresAt\n  }\n}\n`,
		"package.json": `{\n  "name": "distributed-queue",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"In `src/workerQueue.ts`, audit and fix two critical concurrency defects:\n1. Concurrency Race in `renewLease`: Only renew if `job.status === 'RUNNING'` and `Date.now() < job.leaseExpiresAt`. If expired or in any other state, abort renewal, set status to 'TIMED_OUT' if not already cancelled/completed, clear the timer, and return false.\n2. Timer Leak in `completeJob` and `cancelJob`: Always clear the interval timer stored in `this.timers` and delete the key to prevent memory leaks.\n3. Add a helper `clearJobTimer(id: string): void`.",
}

// 4. Long Output Generator (Stress-testing token throughput and output consistency)
export const longOutputGenerator: TestScenario = {
	name: "long_output_generator",
	description: "Generate a full-coverage 15+ unit test suite for a protocol parser without truncation",
	expectedMaxTurns: 5,
	tags: ["testing", "feature", "advanced", "stress"],
	files: {
		"src/protocol.ts": `export enum MessageOpcode {\n  CONNECT = 0x01,\n  DISCONNECT = 0x02,\n  PING = 0x03,\n  PONG = 0x04,\n  DATA = 0x05,\n  ACK = 0x06,\n  NACK = 0x07,\n  ERROR = 0xff,\n}\n\nexport interface ProtocolMessage {\n  version: number\n  opcode: MessageOpcode\n  sequenceId: number\n  payload: Buffer\n}\n\nexport class ProtocolCodec {\n  public static readonly MAGIC_BYTE = 0xaa\n  public static readonly HEADER_SIZE = 8\n\n  public static encode(msg: ProtocolMessage): Buffer {\n    const payloadLen = msg.payload.length\n    const buf = Buffer.alloc(ProtocolCodec.HEADER_SIZE + payloadLen)\n    buf.writeUInt8(ProtocolCodec.MAGIC_BYTE, 0)\n    buf.writeUInt8(msg.version, 1)\n    buf.writeUInt8(msg.opcode, 2)\n    buf.writeUInt8(0, 3) // Reserved\n    buf.writeUInt32BE(msg.sequenceId, 4)\n    msg.payload.copy(buf, ProtocolCodec.HEADER_SIZE)\n    return buf\n  }\n\n  public static decode(buf: Buffer): ProtocolMessage {\n    if (buf.length < ProtocolCodec.HEADER_SIZE) {\n      throw new Error("Buffer too short for protocol header")\n    }\n    const magic = buf.readUInt8(0)\n    if (magic !== ProtocolCodec.MAGIC_BYTE) {\n      throw new Error(\`Invalid magic byte: \${magic.toString(16)}\`)\n    }\n    const version = buf.readUInt8(1)\n    const opcode = buf.readUInt8(2) as MessageOpcode\n    const sequenceId = buf.readUInt32BE(4)\n    const payload = buf.subarray(ProtocolCodec.HEADER_SIZE)\n    return { version, opcode, sequenceId, payload }\n  }\n}\n`,
		"package.json": `{\n  "name": "protocol-parser",\n  "version": "1.0.0",\n  "devDependencies": { "vitest": "^1.0.0" }\n}\n`,
	},
	userPrompt:
		"In `src/protocol.spec.ts`, write a comprehensive, exhaustive test suite using vitest covering:\n- All opcodes (CONNECT, DISCONNECT, PING, PONG, DATA, ACK, NACK, ERROR)\n- Encoding and decoding round-trips with empty, small, and 4KB binary payloads\n- Validation of Magic Byte and throwing on invalid magic byte\n- Buffer underflow checks (buffer length < 8)\n- SequenceId preservation across full 32-bit unsigned integer range (0 to 4294967295)\nInclude at least 10 discrete test cases with detailed assertions.",
}

// ────────────────────────────────────────────────────────────
//  NEW: Targeted Weakness Scenarios
// ────────────────────────────────────────────────────────────

/** W1: Scope creep — model must NOT touch file B even though it's related */
export const scopeCreepGuard: TestScenario = {
	name: "scope_creep_guard",
	description: "Model must edit only one specific file, not touch related files",
	expectedMaxTurns: 3,
	tags: ["basic", "instruction-following"],
	files: {
		"src/constants.ts": `export const MAX_RETRIES = 3\nexport const TIMEOUT_MS = 5000\nexport const BASE_URL = "https://api.example.com"\n`,
		"src/config.ts": `import { MAX_RETRIES, TIMEOUT_MS } from "./constants"\nexport const config = { retries: MAX_RETRIES, timeout: TIMEOUT_MS }\n`,
	},
	userPrompt:
		"In src/constants.ts ONLY, change TIMEOUT_MS from 5000 to 10000. Do NOT modify src/config.ts or any other file.",
	verifyFn: (files) => {
		const constants = files["src/constants.ts"] || ""
		const config = files["src/config.ts"] || ""
		if (!constants.includes("10000")) return "FAIL: TIMEOUT_MS not updated in src/constants.ts"
		if (
			config !==
			`import { MAX_RETRIES, TIMEOUT_MS } from "./constants"\nexport const config = { retries: MAX_RETRIES, timeout: TIMEOUT_MS }\n`
		) {
			return "FAIL: src/config.ts was incorrectly modified (scope creep)"
		}
		return null
	},
}

/** W2: Distraction resistance — long irrelevant file content, find and edit a small target */
export const distractionResistance: TestScenario = {
	name: "distraction_resistance",
	description: "Make a precise edit buried deep in a large file full of distracting constants",
	expectedMaxTurns: 3,
	tags: ["basic", "instruction-following"],
	files: {
		"src/settings.ts":
			[
				`export const SETTING_ALPHA = "alpha"`,
				`export const SETTING_BETA = "beta"`,
				`export const SETTING_GAMMA = "gamma"`,
				`export const SETTING_DELTA = "delta"`,
				`export const SETTING_EPSILON = "epsilon"`,
				`export const SETTING_ZETA = "zeta"`,
				`export const SETTING_ETA = "eta"`,
				`export const SETTING_THETA = "theta"`,
				`export const SETTING_IOTA = "iota"`,
				`export const SETTING_KAPPA = "kappa"`,
				`// TARGET BELOW — do not modify anything else`,
				`export const MAX_CONTEXT_WINDOW = 128_000`,
				`// END TARGET`,
				`export const SETTING_LAMBDA = "lambda"`,
				`export const SETTING_MU = "mu"`,
				`export const SETTING_NU = "nu"`,
				`export const SETTING_XI = "xi"`,
				`export const SETTING_OMICRON = "omicron"`,
				`export const SETTING_PI = "pi"`,
				`export const SETTING_RHO = "rho"`,
			].join("\n") + "\n",
	},
	userPrompt:
		"In src/settings.ts, change ONLY the value of MAX_CONTEXT_WINDOW from 128_000 to 200_000. Do not change anything else.",
	verifyFn: (files) => {
		const s = files["src/settings.ts"] || ""
		if (!s.includes("MAX_CONTEXT_WINDOW") || (!s.includes("200_000") && !s.includes("200000")))
			return "FAIL: MAX_CONTEXT_WINDOW not updated to 200000/200_000"
		if (s.includes("128_000") || s.includes("128000")) return "FAIL: Old value 128_000 still present"
		if (!s.includes('SETTING_ALPHA = "alpha"')) return "FAIL: Other settings were incorrectly modified"
		return null
	},
}

/** W3: No hallucinated imports — add a new function using ONLY built-in stdlib */
export const noHallucinatedImports: TestScenario = {
	name: "no_hallucinated_imports",
	description: "Add a utility function using only built-in Node.js crypto — no npm imports",
	expectedMaxTurns: 3,
	tags: ["feature", "instruction-following"],
	files: {
		"src/crypto-utils.ts": `// Utility functions using Node.js built-ins only\nimport { createHash } from "crypto"\n\nexport function sha256(input: string): string {\n  return createHash("sha256").update(input).digest("hex")\n}\n`,
		"package.json": `{\n  "name": "crypto-utils",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		"Add an exported function `md5(input: string): string` to src/crypto-utils.ts that returns the MD5 hex digest using Node.js built-in `crypto` module only. Do NOT install or import any npm packages.",
	verifyFn: (files) => {
		const src = files["src/crypto-utils.ts"] || ""
		if (!src.includes("md5")) return "FAIL: md5 function not added"
		if (!src.includes("createHash") || !src.includes("md5")) return "FAIL: not using createHash for md5"
		if (src.match(/import.*from ["'][^"']*(?:md5|hash\.js|spark-md5)/))
			return "FAIL: hallucinated npm import for md5"
		return null
	},
}

/** W4: Ordered multi-step — steps must be done in exact sequence to succeed */
export const orderedMultiStep: TestScenario = {
	name: "ordered_multi_step",
	description: "Multiple dependent edits that must be done in correct sequence",
	expectedMaxTurns: 5,
	tags: ["feature", "advanced"],
	files: {
		"src/pipeline.ts": `export type Stage = "fetch" | "parse" | "transform"\n\nconst STAGE_ORDER: Stage[] = ["fetch", "parse", "transform"]\n\nexport function runPipeline(stages: Stage[]): string[] {\n  return stages.map(s => \`Running: \${s}\`)\n}\n`,
	},
	userPrompt: `In src/pipeline.ts, make these changes in order:
1. Add "validate" as a new Stage type (between "transform" and the end of the union).
2. Add "validate" to STAGE_ORDER array after "transform".
3. Add a new exported function \`validateStages(stages: Stage[]): boolean\` that returns true if every element of stages is in STAGE_ORDER.`,
	verifyFn: (files) => {
		const src = files["src/pipeline.ts"] || ""
		if (!src.includes('"validate"') && !src.includes("'validate'")) return "FAIL: 'validate' Stage type not added"
		if (!src.includes("validateStages")) return "FAIL: validateStages function not added"
		if (!src.match(/STAGE_ORDER.*validate|validate.*STAGE_ORDER/s))
			return "FAIL: 'validate' not added to STAGE_ORDER"
		return null
	},
}

/** W5: Correct single-target edit in repeated structure */
export const singleTargetInRepeat: TestScenario = {
	name: "single_target_in_repeat",
	description: "Edit exactly one field of one specific object in an array of identical-looking objects",
	expectedMaxTurns: 3,
	tags: ["basic", "bugfix", "instruction-following"],
	files: {
		"src/routes.ts": `export const routes = [\n  { path: "/home", component: "Home", auth: false },\n  { path: "/dashboard", component: "Dashboard", auth: false },\n  { path: "/settings", component: "Settings", auth: false },\n  { path: "/profile", component: "Profile", auth: false },\n  { path: "/admin", component: "Admin", auth: false },\n]\n`,
	},
	userPrompt:
		'In src/routes.ts, set auth to true for ONLY the "/admin" route. All other routes must remain unchanged.',
	verifyFn: (files) => {
		const src = files["src/routes.ts"] || ""
		// admin should have auth: true
		if (!src.match(/\/admin.*auth:\s*true|auth:\s*true.*\/admin/))
			return "FAIL: /admin route does not have auth: true"
		// others should remain false
		const otherRoutes = ["/home", "/dashboard", "/settings", "/profile"]
		for (const r of otherRoutes) {
			// Check that the route entry still has auth: false
			const routeBlock = src.match(new RegExp(`\\{[^}]*"${r}"[^}]*\\}`))
			if (!routeBlock) return `FAIL: ${r} route is missing`
			if (!routeBlock[0].includes("false")) return `FAIL: ${r} route has wrong auth value`
		}
		return null
	},
}

/** W6: No over-deletion — add a method without removing existing ones */
export const noOverDeletion: TestScenario = {
	name: "no_over_deletion",
	description: "Add a new method to a class without deleting existing methods",
	expectedMaxTurns: 3,
	tags: ["feature", "basic"],
	files: {
		"src/stack.ts": `export class Stack<T> {\n  private items: T[] = []\n\n  push(item: T): void {\n    this.items.push(item)\n  }\n\n  pop(): T | undefined {\n    return this.items.pop()\n  }\n\n  peek(): T | undefined {\n    return this.items[this.items.length - 1]\n  }\n\n  size(): number {\n    return this.items.length\n  }\n}\n`,
	},
	userPrompt:
		"Add an `isEmpty(): boolean` method to the Stack class in src/stack.ts that returns true if the stack has no items. Keep all existing methods intact.",
	verifyFn: (files) => {
		const src = files["src/stack.ts"] || ""
		if (!src.includes("isEmpty")) return "FAIL: isEmpty method not added"
		if (!src.includes("push")) return "FAIL: push method was deleted (over-deletion)"
		if (!src.includes("pop")) return "FAIL: pop method was deleted (over-deletion)"
		if (!src.includes("peek")) return "FAIL: peek method was deleted (over-deletion)"
		if (!src.includes("size")) return "FAIL: size method was deleted (over-deletion)"
		return null
	},
}

/** W7: Enum exhaustiveness — update switch to handle all new enum values */
export const enumExhaustiveness: TestScenario = {
	name: "enum_exhaustiveness",
	description: "Extend an enum and make all switch statements exhaustive",
	expectedMaxTurns: 4,
	tags: ["typescript", "bugfix", "advanced"],
	files: {
		"src/status.ts": `export enum TaskStatus {\n  Pending = "pending",\n  Running = "running",\n  Done = "done",\n}\n\nexport function getStatusColor(status: TaskStatus): string {\n  switch (status) {\n    case TaskStatus.Pending: return "yellow"\n    case TaskStatus.Running: return "blue"\n    case TaskStatus.Done: return "green"\n  }\n}\n\nexport function getStatusLabel(status: TaskStatus): string {\n  switch (status) {\n    case TaskStatus.Pending: return "Pending"\n    case TaskStatus.Running: return "In Progress"\n    case TaskStatus.Done: return "Done"\n  }\n}\n`,
	},
	userPrompt: `In src/status.ts:
1. Add two new enum values: \`Failed = "failed"\` and \`Cancelled = "cancelled"\` to TaskStatus.
2. Update getStatusColor: Failed → "red", Cancelled → "gray".
3. Update getStatusLabel: Failed → "Failed", Cancelled → "Cancelled".
4. Add a default case to both switches that throws an Error("Unhandled status").`,
	verifyFn: (files) => {
		const src = files["src/status.ts"] || ""
		if (!src.includes("Failed")) return "FAIL: Failed enum value not added"
		if (!src.includes("Cancelled")) return "FAIL: Cancelled enum value not added"
		if (!src.includes('"red"') && !src.includes("'red'")) return "FAIL: red color for Failed not added"
		if (!src.includes('"gray"') && !src.includes("'gray'")) return "FAIL: gray color for Cancelled not added"
		if (!src.includes("Unhandled status")) return "FAIL: default throw for unhandled status not added"
		return null
	},
}

/** W8: JSON file edit — don't break JSON syntax */
export const jsonFileEdit: TestScenario = {
	name: "json_file_edit",
	description: "Add entries to a JSON file without breaking its syntax",
	expectedMaxTurns: 3,
	tags: ["basic", "feature"],
	files: {
		"tsconfig.json": `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "commonjs",\n    "strict": true,\n    "outDir": "./dist"\n  },\n  "include": ["src/**/*"],\n  "exclude": ["node_modules"]\n}\n`,
	},
	userPrompt:
		'In tsconfig.json, add `"sourceMap": true` and `"declaration": true` to compilerOptions. Keep all existing entries.',
	verifyFn: (files) => {
		const src = files["tsconfig.json"] || ""
		try {
			const parsed = JSON.parse(src)
			if (!parsed.compilerOptions?.sourceMap) return "FAIL: sourceMap not added"
			if (!parsed.compilerOptions?.declaration) return "FAIL: declaration not added"
			if (parsed.compilerOptions?.target !== "ES2020") return "FAIL: existing target was changed"
			if (!parsed.compilerOptions?.strict) return "FAIL: existing strict was removed"
		} catch (e: any) {
			return `FAIL: JSON syntax broken — ${e.message}`
		}
		return null
	},
}

// ────────────────────────────────────────────────────────────
//  Recommended Next Scenarios (🔴 High, 🟡 Med, 🟢 Low)
// ────────────────────────────────────────────────────────────

/** R1: apply_diff_fallback — Diff SEARCH block is slightly wrong, model must recover */
export const applyDiffFallback: TestScenario = {
	name: "apply_diff_fallback",
	description: "Recover gracefully when an apply_diff SEARCH block has minor mismatches",
	expectedMaxTurns: 4,
	tags: ["recommended", "bugfix", "error-recovery"],
	files: {
		"src/logger.ts": `export class Logger {\n  private prefix: string\n\n  constructor(prefix: string) {\n    this.prefix = prefix\n  }\n\n  // Standard log output format (v2)\n  log(message: string): void {\n    console.log(\`[\${this.prefix}] \${message}\`)\n  }\n}\n`,
	},
	userPrompt:
		"In `src/logger.ts`, update `log(message: string)` so it prefixes logs with an ISO timestamp like `[${new Date().toISOString()}] [${this.prefix}] ${message}`.\n\nTry applying this diff hunk if possible:\n<<<<<<< SEARCH\n  // Standard log output format\n  log(message: string): void {\n    console.log(`[${this.prefix}] ${message}`)\n  }\n=======\n  // Standard log output format (v2)\n  log(message: string): void {\n    console.log(`[${new Date().toISOString()}] [${this.prefix}] ${message}`)\n  }\n>>>>>>> REPLACE\n\nNote: The SEARCH block above has `// Standard log output format` but the file actually contains `// Standard log output format (v2)`. If apply_diff fails, inspect the error and recover by fixing the SEARCH block or using edit_file/write_to_file to apply the change.",
	verifyFn: (files) => {
		const content = files["src/logger.ts"] || ""
		if (!content.includes("toISOString()")) {
			return "FAIL: ISO timestamp was not added to logger.ts"
		}
		if (!content.includes("[${this.prefix}]")) {
			return "FAIL: Prefix formatting was lost or broken"
		}
		return null
	},
}

/** R2: ambiguous_filename — Two files named utils.ts in different dirs */
export const ambiguousFilename: TestScenario = {
	name: "ambiguous_filename",
	description: "Modify the correct utils.ts when multiple identically-named files exist across directories",
	expectedMaxTurns: 3,
	tags: ["recommended", "basic", "file-precision"],
	files: {
		"src/auth/utils.ts": `import crypto from "crypto"\n\nexport function hashToken(token: string): string {\n  // Insecure MD5 - needs upgrade\n  return crypto.createHash("md5").update(token).digest("hex")\n}\n`,
		"src/formatters/utils.ts": `export function formatDate(date: Date): string {\n  return date.toISOString().split("T")[0]\n}\n\nexport function formatCurrency(cents: number): string {\n  return \`$\${(cents / 100).toFixed(2)}\`\n}\n`,
		"package.json": `{\n  "name": "multi-utils",\n  "version": "1.0.0"\n}\n`,
	},
	userPrompt:
		'There are two files named `utils.ts` in different directories (`src/auth/utils.ts` and `src/formatters/utils.ts`).\nIn `src/auth/utils.ts`, update `hashToken` to use "sha256" instead of "md5".\nDO NOT modify `src/formatters/utils.ts` or any other file. Be exact with your file paths.',
	verifyFn: (files) => {
		const auth = files["src/auth/utils.ts"] || ""
		const formatters = files["src/formatters/utils.ts"] || ""

		if (!auth.includes("sha256")) return "FAIL: src/auth/utils.ts was not updated to sha256"
		if (auth.includes("md5")) return "FAIL: src/auth/utils.ts still contains md5"
		if (!formatters.includes("formatDate") || !formatters.includes("formatCurrency")) {
			return "FAIL: src/formatters/utils.ts was modified or deleted"
		}
		if (files["utils.ts"] || files["src/utils.ts"]) {
			return "FAIL: Created/edited wrong utils.ts location"
		}
		return null
	},
}

/** R3: thinking_mode_algorithm — Implement Dijkstra with thinking enabled */
export const thinkingModeAlgorithm: TestScenario = {
	name: "thinking_mode_algorithm",
	description: "Implement Dijkstra's shortest path algorithm with thinking mode enabled",
	expectedMaxTurns: 4,
	tags: ["recommended", "algorithms", "advanced", "thinking"],
	enableThinking: true,
	files: {
		"src/dijkstra.ts": `export interface Graph {\n  [node: string]: { [neighbor: string]: number }\n}\n\nexport interface DijkstraResult {\n  distances: Record<string, number>\n  previous: Record<string, string | null>\n  path: (target: string) => string[]\n}\n\n/**\n * Finds shortest paths from startNode to all other reachable nodes using Dijkstra's algorithm.\n * - Throw Error if any edge weight is negative.\n * - Handle disconnected nodes (distance = Infinity).\n * - Return path function: returns [] if unreachable, [startNode] if startNode === target.\n */\nexport function dijkstra(graph: Graph, startNode: string): DijkstraResult {\n  // TODO: implement Dijkstra algorithm\n  throw new Error("Not implemented")\n}\n`,
	},
	userPrompt:
		"Implement Dijkstra's shortest path algorithm in `src/dijkstra.ts`.\nRequirements:\n1. Throw an Error if any edge weight in the graph is negative.\n2. Initialize unvisited nodes with distance Infinity.\n3. Keep track of previous nodes to reconstruct paths.\n4. Implement `path(target: string)` returning:\n   - `[startNode]` if target === startNode\n   - `[]` if target is unreachable (distance Infinity or not in graph)\n   - The sequence of nodes from startNode to target along the shortest path\n5. Handle cycles and nodes with no outgoing edges cleanly.",
	verifyFn: (files) => {
		const code = files["src/dijkstra.ts"] || ""
		if (code.includes('throw new Error("Not implemented")')) {
			return "FAIL: dijkstra function still throws 'Not implemented'"
		}
		if (!code.includes("Infinity")) {
			return "FAIL: does not handle Infinity for unvisited/unreachable nodes"
		}
		if (!code.includes("negative") && !code.includes("< 0") && !code.includes("Error")) {
			return "FAIL: missing negative weight validation"
		}
		try {
			const jsCode = code
				.replace(/export\s+interface\s+[\s\S]*?}\n/g, "")
				.replace(/export\s+/g, "")
				.replace(/:\s*Graph\b/g, "")
				.replace(/:\s*string\b/g, "")
				.replace(/:\s*DijkstraResult\b/g, "")
				.replace(/:\s*number\b/g, "")
				.replace(/:\s*Record<[^>]+>/g, "")
				.replace(/:\s*boolean\b/g, "")
				.replace(/:\s*string\[\]\b/g, "")
			const fn = new Function(`${jsCode}; return dijkstra;`)()

			let threwOnNegative = false
			try {
				fn({ A: { B: -1 } }, "A")
			} catch {
				threwOnNegative = true
			}
			if (!threwOnNegative) return "FAIL: did not throw on negative edge weight"

			const graph = {
				A: { B: 4, C: 2 },
				B: { D: 3 },
				C: { B: 1, D: 5 },
				D: {},
			}
			const result = fn(graph, "A")
			if (result.distances["D"] !== 5) {
				return `FAIL: distance to D should be 5 (A->C->B->D), got ${result.distances["D"]}`
			}
			const p = result.path("D")
			if (p.join("->") !== "A->C->B->D") {
				return `FAIL: path to D should be A->C->B->D, got ${p.join("->")}`
			}
			if (result.path("A").join("") !== "A") {
				return `FAIL: path to startNode should be ['A'], got ${JSON.stringify(result.path("A"))}`
			}
		} catch (e: any) {
			if (!code.includes("distances") || !code.includes("previous")) {
				return `FAIL: missing distances or previous mapping: ${e.message}`
			}
		}
		return null
	},
}

/** R4: concurrent_edit_safety — Two requested edits that touch the same line */
export const concurrentEditSafety: TestScenario = {
	name: "concurrent_edit_safety",
	description: "Safely merge two requirements that touch the same function signature and return statement",
	expectedMaxTurns: 3,
	tags: ["recommended", "basic", "refactor"],
	files: {
		"src/pricing.ts": `export interface LineItem {\n  name: string\n  price: number\n  quantity: number\n}\n\n// Compute cart total\nexport function computeTotal(items: LineItem[]): number {\n  const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0)\n  return subtotal\n}\n`,
	},
	userPrompt:
		"In `src/pricing.ts`, update `computeTotal` to simultaneously apply two new calculations:\n1. Accept an optional `discountMultiplier: number = 1.0` (e.g. 0.9 for 10% off).\n2. Accept an optional `taxRate: number = 0.0` (e.g. 0.08 for 8% tax applied to discounted subtotal).\nUpdate the signature to:\n`export function computeTotal(items: LineItem[], discountMultiplier: number = 1.0, taxRate: number = 0.0): number`\nReturn the final calculated amount: `subtotal * discountMultiplier * (1 + taxRate)`.\nEnsure the existing `items.reduce` subtotal calculation is preserved.",
	verifyFn: (files) => {
		const code = files["src/pricing.ts"] || ""
		if (!code.includes("discountMultiplier") || !code.includes("taxRate")) {
			return "FAIL: Missing discountMultiplier or taxRate parameters"
		}
		if (!code.includes("1 + taxRate") && !code.includes("1+taxRate") && !code.includes("tax")) {
			return "FAIL: Formula subtotal * discountMultiplier * (1 + taxRate) not found"
		}
		if (!code.includes("items.reduce")) {
			return "FAIL: Existing items.reduce was lost"
		}
		return null
	},
}

/** R5: no_chatty_completion — Model must use attempt_completion, not just output text */
export const noChattyCompletion: TestScenario = {
	name: "no_chatty_completion",
	description: "Verify model invokes attempt_completion tool rather than outputting plain conversational text",
	expectedMaxTurns: 3,
	tags: ["recommended", "basic", "tool-discipline"],
	files: {
		"src/banner.ts": `export const BANNER_TEXT = "Welcome to v1.0"\nexport const IS_PROMO_ACTIVE = false\n`,
	},
	userPrompt:
		'Change `IS_PROMO_ACTIVE` to `true` in `src/banner.ts`.\nCRITICAL INSTRUCTION: Once you make the edit, you MUST invoke the `attempt_completion` tool with a summary.\nDO NOT simply output a chat message saying "I updated the file" or "Done" — you must invoke the `attempt_completion` tool.',
	verifyFn: (files) => {
		const code = files["src/banner.ts"] || ""
		if (!code.includes("IS_PROMO_ACTIVE = true")) {
			return "FAIL: IS_PROMO_ACTIVE was not set to true"
		}
		return null
	},
}

/** R6: self_correction — First edit is wrong (verifyFn fails), nudge to retry */
export const selfCorrection: TestScenario = {
	name: "self_correction",
	description: "First edit is wrong / fails verification, nudge to retry and recover",
	expectedMaxTurns: 5,
	tags: ["recommended", "recovery", "self-correction"],
	files: {
		"src/palindrome.ts": `/**\n * Checks if a string is a palindrome.\n * Must ignore case, spaces, and punctuation.\n * Example: "A man, a plan, a canal: Panama" => true\n */\nexport function isPalindrome(str: string): boolean {\n  // Incomplete initial implementation\n  return str.toLowerCase() === str.toLowerCase().split("").reverse().join("")\n}\n`,
	},
	userPrompt:
		"The `isPalindrome` function in `src/palindrome.ts` fails on sentences because it only lowercases but does not remove spaces and punctuation.\nFix it so that non-alphanumeric characters (spaces, commas, colons, etc.) are removed before comparing.",
	selfCorrectionNudge: (files, attemptCount) => {
		if (attemptCount === 1) {
			return "Test suite failed: `isPalindrome('No lemon, no melon')` returned false. Non-alphanumeric characters (spaces, punctuation) must be removed using regex like `/[^a-zA-Z0-9]/g` before reversing. Please fix `src/palindrome.ts` and call attempt_completion again."
		}
		return null
	},
	verifyFn: (files) => {
		const code = files["src/palindrome.ts"] || ""
		if (!code.includes("replace") && !code.includes("toLowerCase")) {
			return "FAIL: Input is not cleaned of non-alphanumeric chars or lowercased"
		}
		try {
			const clean = code
				.replace(/export\s+/g, "")
				.replace(/:\s*string/g, "")
				.replace(/:\s*boolean/g, "")
			const fn = new Function(`${clean}; return isPalindrome;`)()
			if (!fn("A man, a plan, a canal: Panama")) {
				return "FAIL: isPalindrome('A man, a plan, a canal: Panama') returned false"
			}
			if (fn("hello world")) {
				return "FAIL: isPalindrome('hello world') returned true"
			}
		} catch (e: any) {
			return `FAIL: Evaluation error: ${e.message}`
		}
		return null
	},
}

export const RECOMMENDED_SCENARIOS: TestScenario[] = [
	applyDiffFallback,
	ambiguousFilename,
	thinkingModeAlgorithm,
	concurrentEditSafety,
	noChattyCompletion,
	selfCorrection,
]

// ────────────────────────────────────────────────────────────
//  All Scenarios (basic → advanced)
// ────────────────────────────────────────────────────────────

export const ALL_SCENARIOS: TestScenario[] = [
	// Basic
	simpleEdit,
	bugFix,
	featureAdd,
	errorRecovery,
	duplicateCodeBlocks,
	whitespaceIndentCornerCase,
	// Moderate
	exploration,
	multiFileRefactor,
	typescriptGenerics,
	asyncAwaitRefactor,
	largeFileEdit,
	parallelismTest,
	// Advanced
	writeUnitTests,
	securityVulnerability,
	performanceOptimization,
	complexDebugging,
	apiIntegration,
	dependencyInjection,
	dbSchemaMigration,
	eventEmitterRefactor,
	circuitBreakerImplementation,
	lruCacheImplementation,
	rateLimiterMiddleware,
	// Frontier & Stress Tests (Antigravity / Claude Code / Codex / Cursor SOTA Tier)
	longLogDiagnostics,
	massiveMultiModuleMigration,
	complexStateMachineAudit,
	longOutputGenerator,
	// Targeted Weakness Probes
	scopeCreepGuard,
	distractionResistance,
	noHallucinatedImports,
	orderedMultiStep,
	singleTargetInRepeat,
	noOverDeletion,
	enumExhaustiveness,
	jsonFileEdit,
	// Next Recommended Scenarios
	applyDiffFallback,
	ambiguousFilename,
	thinkingModeAlgorithm,
	concurrentEditSafety,
	noChattyCompletion,
	selfCorrection,
]
