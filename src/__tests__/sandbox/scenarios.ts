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
]
