import type { OpenAI } from "openai"
import type { CustomToolDefinition } from "@mirror-vs/types"
import type { ToolRegistry } from "../custom-tools/tool-registry.js"

export interface AgentLlmConfig {
	/** OpenAI API key or compatible provider key */
	apiKey?: string
	/** Model identifier (e.g. 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'deepseek-chat') */
	model?: string
	/** Base URL for OpenAI-compatible APIs (Ollama, Groq, DeepSeek, OpenRouter, vLLM, local server) */
	baseURL?: string
	/** Custom fetch implementation (for Cloudflare Workers, Figma, or custom proxies) */
	fetch?: typeof fetch
	/** Pre-instantiated OpenAI client instance */
	client?: OpenAI
	/** Additional parameters passed to chat completion calls */
	defaultParams?: Partial<OpenAI.Chat.ChatCompletionCreateParams>
}

export interface AgentStep {
	stepIndex: number
	role: "assistant" | "tool"
	text?: string
	toolCalls?: Array<{
		id: string
		name: string
		arguments: Record<string, unknown>
	}>
	toolResults?: Array<{
		toolCallId: string
		name: string
		result: string
	}>
}

export interface AgentRunOptions<TContext = unknown> {
	/** Context passed to tool executions for this run (e.g. database handle, Figma API object) */
	context?: TContext
	/** Max tool execution loops before terminating (defaults to agent's maxSteps) */
	maxSteps?: number
	/** Sampling temperature for the model */
	temperature?: number
}

export interface AgentRunResult {
	/** Final text answer produced by the agent */
	text: string
	/** Complete message history including system, user, assistant, and tool messages */
	messages: OpenAI.Chat.ChatCompletionMessageParam[]
	/** Chronological log of steps and tool calls performed */
	steps: AgentStep[]
	/** Number of steps executed */
	stepCount: number
}

export interface AgentStreamChunk {
	type: "text_delta" | "tool_call" | "tool_result" | "step" | "finish"
	delta?: string
	toolName?: string
	toolArgs?: Record<string, unknown>
	toolResult?: string
	step?: AgentStep
	result?: AgentRunResult
}

export interface AgentOptions<TContext = unknown> {
	/**
	 * Pluggable tools to provide to the agent.
	 * Can be an array of `defineTool(...)` definitions or an existing `ToolRegistry`.
	 * When provided, NO default tools are included.
	 */
	tools?: CustomToolDefinition[] | ToolRegistry

	/**
	 * System instructions for the agent's persona and domain.
	 */
	systemPrompt?: string

	/**
	 * LLM provider configuration.
	 */
	llm?: AgentLlmConfig

	/**
	 * Default context passed to tool execution handlers (e.g. database handle, Figma API object).
	 */
	context?: TContext

	/**
	 * Maximum tool loop iterations (default 10).
	 */
	maxSteps?: number

	/**
	 * Callback fired whenever a tool is about to be executed.
	 */
	onToolCall?: (toolName: string, args: Record<string, unknown>) => void

	/**
	 * Callback fired when a tool execution completes.
	 */
	onToolResult?: (toolName: string, result: string) => void

	/**
	 * Callback fired when an assistant step finishes.
	 */
	onStep?: (step: AgentStep) => void
}
