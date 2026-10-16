import OpenAI from "openai"
import type { CustomToolDefinition } from "@mirror-vs/types"

import { ToolRegistry } from "../custom-tools/tool-registry.js"
import type { AgentOptions, AgentRunOptions, AgentRunResult, AgentStep, AgentStreamChunk } from "./types.js"

export class MirrorAgent<TContext = unknown> {
	public readonly registry: ToolRegistry
	private systemPrompt: string
	private client: OpenAI
	private model: string
	private defaultContext?: TContext
	private maxSteps: number
	private defaultParams?: Partial<OpenAI.Chat.ChatCompletionCreateParams>

	private onToolCall?: (name: string, args: Record<string, unknown>) => void
	private onToolResult?: (name: string, result: string) => void
	private onStep?: (step: AgentStep) => void

	constructor(options: AgentOptions<TContext> = {}) {
		if (options.tools instanceof ToolRegistry) {
			this.registry = options.tools
		} else {
			this.registry = new ToolRegistry(options.tools ?? [])
		}

		this.systemPrompt = options.systemPrompt ?? "You are a helpful AI assistant."
		this.defaultContext = options.context
		this.maxSteps = options.maxSteps ?? 10
		this.model = options.llm?.model ?? "gpt-4o"
		this.defaultParams = options.llm?.defaultParams

		this.onToolCall = options.onToolCall
		this.onToolResult = options.onToolResult
		this.onStep = options.onStep

		if (options.llm?.client) {
			this.client = options.llm.client
		} else {
			const apiKey =
				options.llm?.apiKey ??
				(typeof process !== "undefined" && process?.env?.OPENAI_API_KEY ? process.env.OPENAI_API_KEY : "")

			this.client = new OpenAI({
				apiKey: apiKey || "dummy-key-for-local-proxy",
				baseURL: options.llm?.baseURL,
				fetch: options.llm?.fetch,
				dangerouslyAllowBrowser: true, // Enables running in browser apps and Figma plugin sandboxes
			})
		}
	}

	/**
	 * Register an additional tool.
	 */
	addTool(tool: CustomToolDefinition): void {
		this.registry.register(tool)
	}

	/**
	 * Register multiple tools.
	 */
	addTools(tools: CustomToolDefinition[]): void {
		this.registry.registerAll(tools)
	}

	/**
	 * Replace the entire toolset with a new set of tools.
	 */
	setTools(tools: CustomToolDefinition[]): void {
		this.registry.clear()
		this.registry.registerAll(tools)
	}

	/**
	 * Update the system instructions.
	 */
	setSystemPrompt(prompt: string): void {
		this.systemPrompt = prompt
	}

	/**
	 * Get all currently registered tools.
	 */
	getTools(): CustomToolDefinition[] {
		return this.registry.getAll()
	}

	/**
	 * Run the agent autonomously with a prompt or conversational messages.
	 */
	async run(
		input: string | OpenAI.Chat.ChatCompletionMessageParam[],
		runOptions?: AgentRunOptions<TContext>,
	): Promise<AgentRunResult> {
		const context = (runOptions?.context ?? this.defaultContext) as TContext
		const maxSteps = runOptions?.maxSteps ?? this.maxSteps

		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

		if (this.systemPrompt) {
			messages.push({ role: "system", content: this.systemPrompt })
		}

		if (typeof input === "string") {
			messages.push({ role: "user", content: input })
		} else {
			messages.push(...input)
		}

		const steps: AgentStep[] = []
		let stepCount = 0
		let finalText = ""

		while (stepCount < maxSteps) {
			stepCount++

			const nativeTools = this.registry.formatNative()
			const toolsParam = nativeTools.length > 0 ? nativeTools : undefined

			const completion = (await this.client.chat.completions.create({
				model: this.model,
				messages: [...messages],
				tools: toolsParam,
				temperature: runOptions?.temperature,
				...this.defaultParams,
				stream: false,
			})) as OpenAI.Chat.ChatCompletion

			const choice = completion.choices[0]
			if (!choice?.message) {
				break
			}

			const assistantMsg = choice.message
			messages.push(assistantMsg)

			const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0

			const currentStep: AgentStep = {
				stepIndex: stepCount,
				role: "assistant",
				text: assistantMsg.content ?? undefined,
			}

			if (hasToolCalls && assistantMsg.tool_calls) {
				currentStep.toolCalls = assistantMsg.tool_calls.map((tc) => {
					let parsedArgs: Record<string, unknown> = {}
					const func = "function" in tc ? tc.function : undefined
					const rawArgs = func?.arguments || "{}"
					try {
						parsedArgs = JSON.parse(rawArgs)
					} catch {
						parsedArgs = { raw: rawArgs }
					}
					return {
						id: tc.id,
						name: func?.name ?? "",
						arguments: parsedArgs,
					}
				})
			}

			steps.push(currentStep)
			this.onStep?.(currentStep)

			if (!hasToolCalls || !assistantMsg.tool_calls) {
				finalText = assistantMsg.content || ""
				break
			}

			// Execute tool calls sequentially
			const toolResults: Array<{ toolCallId: string; name: string; result: string }> = []

			for (const call of assistantMsg.tool_calls) {
				const func = "function" in call ? call.function : undefined
				const toolName = func?.name ?? ""
				let parsedArgs: Record<string, unknown> = {}
				const rawArgs = func?.arguments || "{}"
				try {
					parsedArgs = JSON.parse(rawArgs)
				} catch {
					parsedArgs = { raw: rawArgs }
				}

				this.onToolCall?.(toolName, parsedArgs)

				let output: string
				try {
					output = await this.registry.execute(toolName, parsedArgs, context)
				} catch (err) {
					output = `Error executing tool '${toolName}': ${err instanceof Error ? err.message : String(err)}`
				}

				this.onToolResult?.(toolName, output)

				toolResults.push({
					toolCallId: call.id,
					name: toolName,
					result: output,
				})

				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: output,
				})
			}

			const toolStep: AgentStep = {
				stepIndex: stepCount,
				role: "tool",
				toolResults,
			}
			steps.push(toolStep)
			this.onStep?.(toolStep)
		}

		return {
			text: finalText,
			messages,
			steps,
			stepCount,
		}
	}

	/**
	 * Stream agent execution, yielding text tokens and tool execution events in real-time.
	 */
	async *stream(
		input: string | OpenAI.Chat.ChatCompletionMessageParam[],
		runOptions?: AgentRunOptions<TContext>,
	): AsyncIterable<AgentStreamChunk> {
		const context = (runOptions?.context ?? this.defaultContext) as TContext
		const maxSteps = runOptions?.maxSteps ?? this.maxSteps

		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

		if (this.systemPrompt) {
			messages.push({ role: "system", content: this.systemPrompt })
		}

		if (typeof input === "string") {
			messages.push({ role: "user", content: input })
		} else {
			messages.push(...input)
		}

		const steps: AgentStep[] = []
		let stepCount = 0
		let finalText = ""

		while (stepCount < maxSteps) {
			stepCount++

			const nativeTools = this.registry.formatNative()
			const toolsParam = nativeTools.length > 0 ? nativeTools : undefined

			const stream = (await this.client.chat.completions.create({
				model: this.model,
				messages: [...messages],
				tools: toolsParam,
				stream: true,
				temperature: runOptions?.temperature,
				...this.defaultParams,
			})) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>

			let accumulatedText = ""
			const accumulatedToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta
				if (!delta) {
					continue
				}

				if (delta.content) {
					accumulatedText += delta.content
					yield { type: "text_delta", delta: delta.content }
				}

				if (delta.tool_calls) {
					for (const tc of delta.tool_calls) {
						const index = tc.index ?? 0
						const existing = accumulatedToolCalls.get(index) ?? { id: "", name: "", arguments: "" }
						if (tc.id) {
							existing.id = tc.id
						}
						if (tc.function?.name) {
							existing.name += tc.function.name
						}
						if (tc.function?.arguments) {
							existing.arguments += tc.function.arguments
						}
						accumulatedToolCalls.set(index, existing)
					}
				}
			}

			const toolCallsList = Array.from(accumulatedToolCalls.values()).filter((tc) => tc.name.length > 0)
			const hasToolCalls = toolCallsList.length > 0

			const assistantMsg: OpenAI.Chat.ChatCompletionMessageParam = {
				role: "assistant",
				content: accumulatedText || null,
				...(hasToolCalls
					? {
							tool_calls: toolCallsList.map((tc) => ({
								id: tc.id,
								type: "function" as const,
								function: {
									name: tc.name,
									arguments: tc.arguments,
								},
							})),
						}
					: {}),
			}
			messages.push(assistantMsg)

			const currentStep: AgentStep = {
				stepIndex: stepCount,
				role: "assistant",
				text: accumulatedText || undefined,
			}

			if (hasToolCalls) {
				currentStep.toolCalls = toolCallsList.map((tc) => {
					let parsedArgs: Record<string, unknown> = {}
					try {
						parsedArgs = JSON.parse(tc.arguments || "{}")
					} catch {
						parsedArgs = { raw: tc.arguments }
					}
					return {
						id: tc.id,
						name: tc.name,
						arguments: parsedArgs,
					}
				})
			}

			steps.push(currentStep)
			yield { type: "step", step: currentStep }
			this.onStep?.(currentStep)

			if (!hasToolCalls) {
				finalText = accumulatedText
				break
			}

			// Execute tool calls
			const toolResults: Array<{ toolCallId: string; name: string; result: string }> = []

			for (const call of toolCallsList) {
				let parsedArgs: Record<string, unknown> = {}
				try {
					parsedArgs = JSON.parse(call.arguments || "{}")
				} catch {
					parsedArgs = { raw: call.arguments }
				}

				yield { type: "tool_call", toolName: call.name, toolArgs: parsedArgs }
				this.onToolCall?.(call.name, parsedArgs)

				let output: string
				try {
					output = await this.registry.execute(call.name, parsedArgs, context)
				} catch (err) {
					output = `Error executing tool '${call.name}': ${err instanceof Error ? err.message : String(err)}`
				}

				yield { type: "tool_result", toolName: call.name, toolResult: output }
				this.onToolResult?.(call.name, output)

				toolResults.push({
					toolCallId: call.id,
					name: call.name,
					result: output,
				})

				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: output,
				})
			}

			const toolStep: AgentStep = {
				stepIndex: stepCount,
				role: "tool",
				toolResults,
			}
			steps.push(toolStep)
			yield { type: "step", step: toolStep }
			this.onStep?.(toolStep)
		}

		yield {
			type: "finish",
			result: {
				text: finalText,
				messages,
				steps,
				stepCount,
			},
		}
	}
}

/**
 * Create a new MirrorAgent with custom swappable tools.
 */
export function createMirrorAgent<TContext = unknown>(options?: AgentOptions<TContext>): MirrorAgent<TContext> {
	return new MirrorAgent<TContext>(options)
}
