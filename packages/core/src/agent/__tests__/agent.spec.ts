import { describe, it, expect, vi } from "vitest"
import type OpenAI from "openai"
import { parametersSchema as z, defineTool } from "@mirror-vs/types"
import { MirrorAgent, createMirrorAgent } from "../agent.js"

describe("MirrorAgent (Pluggable Domain Agent)", () => {
	it("should run successfully and return direct text response when no tools called", async () => {
		const mockCreate = vi.fn().mockResolvedValue({
			choices: [
				{
					message: {
						role: "assistant",
						content: "Here is your data analytics summary.",
					},
				},
			],
		})

		const mockClient = {
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		} as unknown as OpenAI

		const agent = createMirrorAgent({
			systemPrompt: "You are a data analytics expert.",
			llm: {
				client: mockClient,
				model: "gpt-4o",
			},
		})

		const result = await agent.run("Summarize Q3 revenue")

		expect(result.text).toBe("Here is your data analytics summary.")
		expect(result.stepCount).toBe(1)
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "gpt-4o",
				messages: [
					{ role: "system", content: "You are a data analytics expert." },
					{ role: "user", content: "Summarize Q3 revenue" },
				],
			}),
		)
	})

	it("should autonomously call custom tools and return final response", async () => {
		const executeSqlMock = vi.fn().mockResolvedValue(JSON.stringify([{ total_sales: 150000 }]))

		const sqlTool = defineTool({
			name: "run_sql",
			description: "Run SQL query on analytics warehouse",
			parameters: z.object({
				query: z.string(),
			}),
			execute: executeSqlMock,
		})

		// First call requests tool call; second call synthesizes answer
		const mockCreate = vi
			.fn()
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: "assistant",
							tool_calls: [
								{
									id: "call_abc123",
									type: "function",
									function: {
										name: "run_sql",
										arguments: JSON.stringify({ query: "SELECT SUM(amount) FROM sales;" }),
									},
								},
							],
						},
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: "assistant",
							content: "Total sales are $150,000.",
						},
					},
				],
			})

		const mockClient = {
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		} as unknown as OpenAI

		const onToolCall = vi.fn()
		const onToolResult = vi.fn()

		const agent = new MirrorAgent({
			tools: [sqlTool],
			llm: { client: mockClient },
			onToolCall,
			onToolResult,
		})

		const result = await agent.run("What are the total sales?")

		expect(executeSqlMock).toHaveBeenCalledWith({ query: "SELECT SUM(amount) FROM sales;" }, expect.anything())
		expect(onToolCall).toHaveBeenCalledWith("run_sql", { query: "SELECT SUM(amount) FROM sales;" })
		expect(onToolResult).toHaveBeenCalledWith("run_sql", JSON.stringify([{ total_sales: 150000 }]))
		expect(result.text).toBe("Total sales are $150,000.")
		expect(result.stepCount).toBe(2)

		// Check conversation history was correctly preserved: system, user, assistant (tool_calls), tool result, assistant (final)
		expect(result.messages).toHaveLength(5)
	})

	it("should pass custom context to tool execute in domain environments (Figma / Webapp)", async () => {
		interface FigmaPluginContext {
			figmaNodeCount: number
		}

		const figmaContext: FigmaPluginContext = { figmaNodeCount: 42 }

		const countTool = defineTool<Record<string, unknown>, FigmaPluginContext>({
			name: "get_node_count",
			description: "Get current Figma nodes count",
			async execute(_args, ctx) {
				return `Current nodes: ${ctx.figmaNodeCount}`
			},
		})

		const mockCreate = vi
			.fn()
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: "assistant",
							tool_calls: [
								{
									id: "call_figma_1",
									type: "function",
									function: {
										name: "get_node_count",
										arguments: "{}",
									},
								},
							],
						},
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: "assistant",
							content: "You currently have 42 nodes.",
						},
					},
				],
			})

		const mockClient = {
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		} as unknown as OpenAI

		const agent = createMirrorAgent<FigmaPluginContext>({
			tools: [countTool],
			context: figmaContext,
			llm: { client: mockClient },
		})

		const result = await agent.run("How many nodes do I have?")
		expect(result.text).toBe("You currently have 42 nodes.")
	})

	it("should allow dynamic tool swapping with setTools and addTool", () => {
		const agent = createMirrorAgent()
		expect(agent.getTools()).toHaveLength(0)

		const toolA = defineTool({
			name: "tool_a",
			description: "Tool A",
			async execute() {
				return "A"
			},
		})
		const toolB = defineTool({
			name: "tool_b",
			description: "Tool B",
			async execute() {
				return "B"
			},
		})

		agent.addTool(toolA)
		expect(agent.getTools()).toHaveLength(1)
		expect(agent.getTools()[0]?.name).toBe("tool_a")

		agent.setTools([toolB])
		expect(agent.getTools()).toHaveLength(1)
		expect(agent.getTools()[0]?.name).toBe("tool_b")
	})

	it("should stream agent execution chunks", async () => {
		async function* fakeStream() {
			yield { choices: [{ delta: { content: "Analyzing" } }] }
			yield { choices: [{ delta: { content: "..." } }] }
		}

		const mockCreate = vi.fn().mockResolvedValue(fakeStream())
		const mockClient = {
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		} as unknown as OpenAI

		const agent = createMirrorAgent({
			llm: { client: mockClient },
		})

		const chunks: string[] = []
		for await (const chunk of agent.stream("Start")) {
			if (chunk.type === "text_delta" && chunk.delta) {
				chunks.push(chunk.delta)
			}
		}

		expect(chunks).toEqual(["Analyzing", "..."])
	})
})
