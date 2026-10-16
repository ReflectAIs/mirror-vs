/**
 * ToolRegistry - Platform-agnostic, browser-safe registry for managing and executing tools.
 *
 * Can be used in any JavaScript environment:
 * - Web applications (React, Vue, Next.js, Web Workers)
 * - Figma plugins (sandbox / quickjs)
 * - Node.js backends / Data Analytics pipelines
 * - Deno / Bun / Cloudflare Workers
 */

import type { OpenAI } from "openai"
import type { CustomToolDefinition, CustomToolParametersSchema, SerializedCustomToolDefinition } from "@mirror-vs/types"

import type { StoredCustomTool } from "./types.js"
import { serializeCustomTool } from "./serialize.js"
import { formatNative } from "./format-native.js"

export class ToolRegistry {
	protected tools = new Map<string, StoredCustomTool>()

	/**
	 * Create a new ToolRegistry, optionally pre-seeded with a list of tools.
	 */
	constructor(initialTools?: CustomToolDefinition[]) {
		if (initialTools) {
			this.registerAll(initialTools)
		}
	}

	/**
	 * Register a tool directly.
	 */
	register(definition: CustomToolDefinition, source?: string): void {
		const { name: id } = definition
		const validated = this.validate(id, definition)

		if (!validated) {
			throw new Error(`Invalid tool definition for '${id}'`)
		}

		const storedTool: StoredCustomTool = source ? { ...validated, source } : validated
		this.tools.set(id, storedTool)
	}

	/**
	 * Register an array of tools at once.
	 */
	registerAll(definitions: CustomToolDefinition[]): void {
		for (const def of definitions) {
			this.register(def)
		}
	}

	/**
	 * Unregister a tool by name.
	 */
	unregister(id: string): boolean {
		return this.tools.delete(id)
	}

	/**
	 * Get a tool by name.
	 */
	get(id: string): CustomToolDefinition | undefined {
		return this.tools.get(id)
	}

	/**
	 * Check if a tool exists.
	 */
	has(id: string): boolean {
		return this.tools.has(id)
	}

	/**
	 * Get all registered tool names.
	 */
	list(): string[] {
		return Array.from(this.tools.keys())
	}

	/**
	 * Get all registered tools.
	 */
	getAll(): CustomToolDefinition[] {
		return Array.from(this.tools.values())
	}

	/**
	 * Get all registered tools in serialized format (JSON Schema parameters).
	 */
	getAllSerialized(): SerializedCustomToolDefinition[] {
		return this.getAll().map(serializeCustomTool)
	}

	/**
	 * Format all registered tools for native OpenAI / compatible LLM function calling.
	 */
	formatNative(): OpenAI.Chat.ChatCompletionTool[] {
		return this.getAllSerialized().map(formatNative)
	}

	/**
	 * Execute a registered tool by name with arguments and context.
	 *
	 * @param name - The tool name
	 * @param args - Arguments object (will be parsed against Zod schema if available)
	 * @param context - Domain-specific execution context (e.g. database handle, Figma API, session state)
	 */
	async execute<TContext = unknown>(name: string, args: unknown, context?: TContext): Promise<string> {
		const tool = this.tools.get(name)

		if (!tool) {
			throw new Error(`Tool '${name}' not found in registry`)
		}

		let parsedArgs = args
		if (tool.parameters && typeof (tool.parameters as { parse?: (val: unknown) => unknown }).parse === "function") {
			try {
				parsedArgs = (tool.parameters as { parse: (val: unknown) => unknown }).parse(args ?? {})
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				throw new Error(`Validation failed for tool '${name}': ${message}`)
			}
		}

		const result = await tool.execute(parsedArgs, context as never)
		return typeof result === "string" ? result : JSON.stringify(result)
	}

	/**
	 * Get the number of registered tools.
	 */
	get size(): number {
		return this.tools.size
	}

	/**
	 * Clear all registered tools.
	 */
	clear(): void {
		this.tools.clear()
	}

	/**
	 * Check if a value is a Zod schema by looking for the _def property.
	 */
	protected isParametersSchema(value: unknown): value is CustomToolParametersSchema {
		return (
			value !== null &&
			typeof value === "object" &&
			"_def" in value &&
			typeof (value as Record<string, unknown>)._def === "object"
		)
	}

	/**
	 * Validate a tool definition and return a typed result.
	 * Returns null for non-tool exports, throws for invalid tools.
	 */
	protected validate(exportName: string, value: unknown): CustomToolDefinition | null {
		// Quick pre-check to filter out non-objects.
		if (!value || typeof value !== "object") {
			return null
		}

		// Check if it looks like a tool (has execute function).
		if (!("execute" in value) || typeof (value as Record<string, unknown>).execute !== "function") {
			return null
		}

		const obj = value as Record<string, unknown>
		const errors: string[] = []

		// Validate name.
		if (typeof obj.name !== "string") {
			errors.push("name: Expected string")
		} else if (obj.name.length === 0) {
			errors.push("name: Tool must have a non-empty name")
		}

		// Validate description.
		if (typeof obj.description !== "string") {
			errors.push("description: Expected string")
		} else if (obj.description.length === 0) {
			errors.push("description: Tool must have a non-empty description")
		}

		// Validate parameters (optional).
		if (obj.parameters !== undefined && !this.isParametersSchema(obj.parameters)) {
			errors.push("parameters: parameters must be a Zod schema")
		}

		if (errors.length > 0) {
			throw new Error(`Invalid tool definition for '${exportName}': ${errors.join(", ")}`)
		}

		return value as CustomToolDefinition
	}
}

/**
 * Factory function to create a new ToolRegistry.
 */
export function createToolRegistry(initialTools?: CustomToolDefinition[]): ToolRegistry {
	return new ToolRegistry(initialTools)
}
