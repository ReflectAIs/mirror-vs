import fs from "fs/promises"
import os from "os"
import path from "path"

// ── Config file location ────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), ".mirror-vs")
const CONFIG_FILE = path.join(CONFIG_DIR, "cli-config.json")

export interface CliConfig {
	provider?: string
	apiKey?: string
	model?: string
}

// ── Read / write helpers ────────────────────────────────────────────────────

async function readConfig(): Promise<CliConfig> {
	try {
		const raw = await fs.readFile(CONFIG_FILE, "utf8")
		return JSON.parse(raw) as CliConfig
	} catch {
		return {}
	}
}

async function writeConfig(config: CliConfig): Promise<void> {
	await fs.mkdir(CONFIG_DIR, { recursive: true })
	await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf8")
}

// ── Public helpers used by run.ts / index.ts ────────────────────────────────

/**
 * Read a single config value by key.
 * Returns undefined if the config file does not exist or the key is unset.
 */
export async function getCliConfigValue<K extends keyof CliConfig>(key: K): Promise<CliConfig[K]> {
	const config = await readConfig()
	return config[key]
}

/**
 * Read the full persisted CLI config.
 */
export async function getCliConfig(): Promise<CliConfig> {
	return readConfig()
}

// ── CLI sub-command handlers ────────────────────────────────────────────────

type SetSubcommand = "provider" | "api-key" | "model"

/**
 * `mirror config get` — print all persisted config values.
 * The API key is shown redacted for security.
 */
export async function configGet(): Promise<void> {
	const config = await readConfig()

	if (Object.keys(config).length === 0) {
		process.stdout.write("No config saved. Use `mirror config set <key> <value>` to configure.\n")
		process.stdout.write(`Config file: ${CONFIG_FILE}\n`)
		return
	}

	process.stdout.write(`Config file: ${CONFIG_FILE}\n\n`)

	if (config.provider) {
		process.stdout.write(`provider:  ${config.provider}\n`)
	}
	if (config.apiKey) {
		const k = config.apiKey
		const redacted = k.length > 8 ? `${k.slice(0, 4)}${"*".repeat(k.length - 8)}${k.slice(-4)}` : "****"
		process.stdout.write(`api-key:   ${redacted}\n`)
	}
	if (config.model) {
		process.stdout.write(`model:     ${config.model}\n`)
	}
}

/**
 * `mirror config set <provider|api-key|model> <value>`
 */
export async function configSet(subcommand: string, value: string): Promise<void> {
	const validKeys: SetSubcommand[] = ["provider", "api-key", "model"]
	if (!validKeys.includes(subcommand as SetSubcommand)) {
		throw new Error(`Unknown config key: "${subcommand}". Valid keys: ${validKeys.join(", ")}`)
	}

	if (!value || !value.trim()) {
		throw new Error(`Value cannot be empty.`)
	}

	const config = await readConfig()

	switch (subcommand as SetSubcommand) {
		case "provider":
			config.provider = value.trim()
			break
		case "api-key":
			config.apiKey = value.trim()
			break
		case "model":
			config.model = value.trim()
			break
	}

	await writeConfig(config)
	process.stdout.write(`✓ Saved ${subcommand} to ${CONFIG_FILE}\n`)
}

/**
 * `mirror config reset` — delete all persisted config.
 */
export async function configReset(): Promise<void> {
	try {
		await fs.unlink(CONFIG_FILE)
		process.stdout.write(`✓ Config reset. File removed: ${CONFIG_FILE}\n`)
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			process.stdout.write(`No config file found at ${CONFIG_FILE}\n`)
		} else {
			throw error
		}
	}
}
