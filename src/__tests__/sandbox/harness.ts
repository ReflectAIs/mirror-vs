/**
 * Sandbox Test Harness
 *
 * Sends real prompts to an OpenAI-compatible API (DeepSeek V4 Flash),
 * processes tool calls in a sandboxed filesystem, and captures full
 * conversation traces for performance analysis.
 */
import OpenAI from "openai"
import { executeTool, type ToolInvocation, type SandboxProject } from "./mock-tools"

// ────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────

export interface HarnessConfig {
	apiKey: string
	baseUrl: string
	model: string
	maxTurns: number
	temperature?: number
}

export interface TurnTrace {
	turnIndex: number
	requestTimestamp: number
	responseTimestamp: number
	latencyMs: number
	timeToFirstTokenMs: number
	inputTokens: number
	outputTokens: number
	totalTokens: number
	assistantText: string
	reasoningText: string
	toolCalls: ToolInvocation[]
	isCompletion: boolean
}

export interface ConversationTrace {
	scenarioName: string
	config: HarnessConfig
	systemPrompt: string
	turns: TurnTrace[]
	totalLatencyMs: number
	totalInputTokens: number
	totalOutputTokens: number
	totalToolCalls: number
	completed: boolean
	error?: string
}

// ────────────────────────────────────────────────────────────
//  Tool Definitions (subset for sandbox testing)
// ────────────────────────────────────────────────────────────

const SANDBOX_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
	{
		type: "function",
		function: {
			name: "read_file",
			description: "Read the contents of a file at the specified path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to the project root." },
					start_line: { type: "number", description: "Start line (1-indexed)." },
					end_line: { type: "number", description: "End line (1-indexed, inclusive)." },
				},
				required: ["path"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "write_to_file",
			description: "Create or overwrite a file with the given content.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to the project root." },
					content: { type: "string", description: "Complete file contents to write." },
				},
				required: ["path", "content"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "apply_diff",
			description: "Apply a diff to an existing file using SEARCH/REPLACE blocks.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "File path relative to the project root." },
					diff: {
						type: "string",
						description: "Diff with <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks.",
					},
				},
				required: ["path", "diff"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "search_files",
			description: "Search for a regex pattern across project files.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory to search in." },
					regex: { type: "string", description: "Regex pattern to search for." },
					file_pattern: { type: "string", description: "Glob pattern to filter files." },
				},
				required: ["path", "regex"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "list_files",
			description: "List files and directories at the specified path.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "Directory path relative to project root." },
					recursive: { type: "boolean", description: "Whether to list recursively." },
				},
				required: ["path"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "execute_command",
			description: "Execute a shell command.",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string", description: "The command to execute." },
				},
				required: ["command"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "attempt_completion",
			description: "Signal that the task is complete. Call this when you have finished the user's request.",
			parameters: {
				type: "object",
				properties: {
					result: { type: "string", description: "Summary of what was accomplished." },
				},
				required: ["result"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "ask_followup_question",
			description: "Ask the user a question for clarification.",
			parameters: {
				type: "object",
				properties: {
					question: { type: "string", description: "The question to ask." },
				},
				required: ["question"],
			},
		},
	},
]

// ────────────────────────────────────────────────────────────
//  System Prompt (condensed version of the real extension prompt)
// ────────────────────────────────────────────────────────────

function buildSystemPrompt(projectRoot: string, fileList: string[], fileContents: Record<string, string>): string {
	const fileSection = fileList
		.map((f) => "### " + f + "\n```\n" + (fileContents[f] ?? "(content unavailable)") + "\n```")
		.join("\n\n")

	return `You are Mirror, an expert software engineer assistant operating in an agentic coding loop.

## Tool Selection
- Read unknown/new files: \`read_file\` | Search: \`search_files\` | List dir: \`list_files\`
- Edit existing file: \`apply_diff\` or \`edit_file\` | Create new file: \`write_to_file\` | Shell: \`execute_command\`
- Done: \`attempt_completion\`

## Batching
- Batch multiple read_file/search_files calls in ONE turn when you need several files simultaneously.
- Write tools must be sequential (one per turn).
- attempt_completion must never be batched.

## Efficiency Rules — CRITICAL
- ALL workspace file contents are provided in the "Workspace Files" section below. DO NOT call read_file on any file already listed there — the content shown is authoritative and current.
- Only call read_file for files NOT listed below, or files you created/modified mid-task.
- After a successful write_to_file, apply_diff, or edit_file — do NOT re-read to verify. Trust the tool success response.
- If a tool fails twice with the same approach, change strategy immediately.
- Be concise. Do not engage in conversation. Never start with "Great", "Sure", "Okay", "Certainly".

## Objective
1. Read the task requirements carefully.
2. Make all required changes using tools.
3. Call attempt_completion when FULLY done.

## Project Root
${projectRoot}
(All file paths are relative to the project root.)

## Workspace Files
${fileSection}`
}

// ────────────────────────────────────────────────────────────
//  Harness
// ────────────────────────────────────────────────────────────

export class SandboxHarness {
	private client: OpenAI
	private config: HarnessConfig

	constructor(config: HarnessConfig) {
		this.config = config
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseUrl,
		})
	}

	async runScenario(scenarioName: string, userPrompt: string, project: SandboxProject): Promise<ConversationTrace> {
		const fileList = Object.keys(project.files)
		const systemPrompt = buildSystemPrompt(project.rootDir, fileList, project.files)

		const trace: ConversationTrace = {
			scenarioName,
			config: { ...this.config, apiKey: "***" },
			systemPrompt,
			turns: [],
			totalLatencyMs: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalToolCalls: 0,
			completed: false,
		}

		const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		]

		const scenarioStart = performance.now()

		try {
			for (let turn = 0; turn < this.config.maxTurns; turn++) {
				const turnResult = await this.executeTurn(turn, messages, project)
				trace.turns.push(turnResult)
				trace.totalInputTokens += turnResult.inputTokens
				trace.totalOutputTokens += turnResult.outputTokens
				trace.totalToolCalls += turnResult.toolCalls.length

				if (turnResult.isCompletion) {
					trace.completed = true
					break
				}

				// If no tool calls and text only, push a nudge
				if (turnResult.toolCalls.length === 0 && turnResult.assistantText) {
					messages.push({ role: "assistant", content: turnResult.assistantText })
					messages.push({
						role: "user",
						content:
							"You haven't used any tools yet. Please proceed with the task using the available tools, or call attempt_completion if you're done.",
					})
				}
			}

			if (!trace.completed && trace.turns.length >= this.config.maxTurns) {
				trace.error = `Hit max turns limit (${this.config.maxTurns})`
			}
		} catch (e: any) {
			trace.error = e.message
		}

		trace.totalLatencyMs = performance.now() - scenarioStart
		return trace
	}

	private async executeTurn(
		turnIndex: number,
		messages: OpenAI.Chat.ChatCompletionMessageParam[],
		project: SandboxProject,
	): Promise<TurnTrace> {
		const requestTimestamp = Date.now()
		const requestStart = performance.now()

		const response = await this.client.chat.completions.create({
			model: this.config.model,
			messages,
			tools: SANDBOX_TOOLS,
			temperature: this.config.temperature ?? 0,
			max_tokens: 8192,
		})

		const responseTimestamp = Date.now()
		const latencyMs = performance.now() - requestStart

		const choice = response.choices[0]
		const message = choice.message
		const usage = response.usage

		const assistantText = message.content || ""
		const reasoningText = (message as any).reasoning_content || ""

		// Add assistant message to conversation
		messages.push(message as any)

		const toolCalls: ToolInvocation[] = []
		let isCompletion = false

		if (message.tool_calls && message.tool_calls.length > 0) {
			for (const tc of message.tool_calls as any[]) {
				const toolName = tc.function?.name || ""
				let toolArgs: Record<string, unknown> = {}

				try {
					toolArgs = JSON.parse(tc.function?.arguments || "{}")
				} catch {
					toolArgs = { _raw: tc.function?.arguments }
				}

				// Execute the tool
				const { result, invocation } = executeTool(toolName, toolArgs, project)
				toolCalls.push(invocation)

				// Add tool result to messages
				messages.push({
					role: "tool",
					tool_call_id: tc.id,
					content: result,
				})

				if (toolName === "attempt_completion") {
					isCompletion = true
				}
			}
		}

		// Check for stop_reason completion
		if (choice.finish_reason === "stop" && !message.tool_calls?.length) {
			// Model finished without tool calls — might be done or stuck
		}

		return {
			turnIndex,
			requestTimestamp,
			responseTimestamp,
			latencyMs,
			timeToFirstTokenMs: latencyMs, // Non-streaming, so same as total
			inputTokens: usage?.prompt_tokens ?? 0,
			outputTokens: usage?.completion_tokens ?? 0,
			totalTokens: usage?.total_tokens ?? 0,
			assistantText,
			reasoningText,
			toolCalls,
			isCompletion,
		}
	}
}
