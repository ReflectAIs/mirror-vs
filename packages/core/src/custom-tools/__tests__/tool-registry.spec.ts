import { describe, it, expect, vi } from "vitest"
import type { OpenAI } from "openai"
import { parametersSchema as z } from "@mirror-vs/types"
import { ToolRegistry, createToolRegistry } from "../tool-registry.js"
import { defineTool } from "@mirror-vs/types"

describe("ToolRegistry (Universal / In-Memory)", () => {
	it("should register and retrieve tools", () => {
		const registry = new ToolRegistry()
		const testTool = defineTool({
			name: "calculate_metric",
			description: "Calculate metric for data analytics",
			parameters: z.object({
				metricName: z.string(),
				multiplier: z.number().default(1),
			}),
			async execute({ metricName, multiplier }) {
				return `Metric ${metricName} = ${100 * multiplier}`
			},
		})

		registry.register(testTool)

		expect(registry.has("calculate_metric")).toBe(true)
		expect(registry.get("calculate_metric")?.name).toBe("calculate_metric")
		expect(registry.list()).toEqual(["calculate_metric"])
		expect(registry.size).toBe(1)
	})

	it("should accept initial tools array in constructor and factory", () => {
		const tool1 = defineTool({
			name: "query_sql",
			description: "Run SQL query",
			async execute() {
				return "[]"
			},
		})
		const tool2 = defineTool({
			name: "render_chart",
			description: "Render chart",
			async execute() {
				return "chart:ok"
			},
		})

		const registry = createToolRegistry([tool1, tool2])
		expect(registry.size).toBe(2)
		expect(registry.list()).toEqual(["query_sql", "render_chart"])
	})

	it("should execute tools and pass custom context", async () => {
		interface FigmaContext {
			figma: {
				createRectangle: () => { id: string; width: number; height: number }
			}
		}

		const mockCreateRectangle = vi.fn().mockReturnValue({ id: "rect_123", width: 100, height: 50 })
		const context: FigmaContext = {
			figma: {
				createRectangle: mockCreateRectangle,
			},
		}

		const figmaTool = defineTool<{ type: "RECTANGLE" }, FigmaContext>({
			name: "create_node",
			description: "Create a node in Figma",
			parameters: z.object({
				type: z.literal("RECTANGLE"),
			}),
			async execute({ type }, ctx) {
				const node = ctx.figma.createRectangle()
				return `Created ${type} with id ${node.id}`
			},
		})

		const registry = new ToolRegistry([figmaTool])
		const result = await registry.execute("create_node", { type: "RECTANGLE" }, context)

		expect(result).toBe("Created RECTANGLE with id rect_123")
		expect(mockCreateRectangle).toHaveBeenCalledOnce()
	})

	it("should validate Zod arguments and throw descriptive error on invalid inputs", async () => {
		const tool = defineTool({
			name: "analytics_filter",
			description: "Filter data",
			parameters: z.object({
				column: z.string(),
				threshold: z.number(),
			}),
			async execute({ column, threshold }) {
				return `Filtered ${column} > ${threshold}`
			},
		})

		const registry = new ToolRegistry([tool])

		await expect(
			registry.execute("analytics_filter", { column: "revenue", threshold: "not-a-number" }),
		).rejects.toThrow("Validation failed for tool 'analytics_filter'")
	})

	it("should format tools into native OpenAI function definitions", () => {
		const tool = defineTool({
			name: "web_search",
			description: "Search web",
			parameters: z.object({
				query: z.string().describe("Search query"),
			}),
			async execute() {
				return ""
			},
		})

		const registry = new ToolRegistry([tool])
		const native = registry.formatNative()

		expect(native).toHaveLength(1)
		expect(native[0]?.type).toBe("function")
		const funcTool = native[0] as OpenAI.Chat.ChatCompletionFunctionTool
		expect(funcTool?.function.name).toBe("web_search")
		expect(funcTool?.function.parameters?.properties).toHaveProperty("query")
	})

	it("should unregister and clear tools cleanly", () => {
		const tool = defineTool({
			name: "temp_tool",
			description: "temp",
			async execute() {
				return "ok"
			},
		})
		const registry = new ToolRegistry([tool])
		expect(registry.has("temp_tool")).toBe(true)

		registry.unregister("temp_tool")
		expect(registry.has("temp_tool")).toBe(false)
		expect(registry.size).toBe(0)

		registry.register(tool)
		registry.clear()
		expect(registry.size).toBe(0)
	})
})
