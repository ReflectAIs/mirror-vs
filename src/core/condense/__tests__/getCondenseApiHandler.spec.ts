import { describe, it, expect, vi, beforeEach } from "vitest"
import { getCondenseApiHandler } from "../getCondenseApiHandler"
import * as apiModule from "../../../api"

vi.mock("../../../api", async (importOriginal) => {
	const actual = await importOriginal<typeof apiModule>()
	return {
		...actual,
		buildApiHandler: vi.fn(),
	}
})

describe("getCondenseApiHandler", () => {
	let mockTask: any
	let mockPrimaryApi: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockPrimaryApi = {
			getModel: vi.fn().mockReturnValue({ id: "claude-3-7-sonnet-20250219" }),
		}
		mockTask = {
			api: mockPrimaryApi,
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						apiConfiguration: {
							apiProvider: "anthropic",
							anthropicApiKey: "test-key",
						},
					}),
				}),
			},
		}
	})

	it("returns task.api when no compression provider or model is configured", async () => {
		const state = {
			apiConfiguration: { apiProvider: "anthropic" },
		}
		const handler = await getCondenseApiHandler(mockTask, state)
		expect(handler).toBe(mockPrimaryApi)
		expect(apiModule.buildApiHandler).not.toHaveBeenCalled()
	})

	it("returns task.api when compression provider is 'same' and model is empty or identical to primary", async () => {
		const state = {
			condenseProvider: "same",
			condenseModelId: "claude-3-7-sonnet-20250219",
			apiConfiguration: { apiProvider: "anthropic" },
		}
		const handler = await getCondenseApiHandler(mockTask, state)
		expect(handler).toBe(mockPrimaryApi)
		expect(apiModule.buildApiHandler).not.toHaveBeenCalled()
	})

	it("builds a dedicated handler when compression model is different on the same provider", async () => {
		const mockCondenseHandler = { getModel: () => ({ id: "claude-3-5-haiku-20241022" }) }
		vi.mocked(apiModule.buildApiHandler).mockReturnValue(mockCondenseHandler as any)

		const state = {
			condenseProvider: "same",
			condenseModelId: "claude-3-5-haiku-20241022",
			apiConfiguration: { apiProvider: "anthropic", anthropicApiKey: "key" },
		}
		const handler = await getCondenseApiHandler(mockTask, state)
		expect(handler).toBe(mockCondenseHandler)
		expect(apiModule.buildApiHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				apiProvider: "anthropic",
				apiModelId: "claude-3-5-haiku-20241022",
			}),
		)
	})

	it("builds a dedicated handler when a different compression provider is selected", async () => {
		const mockRelaceHandler = { getModel: () => ({ id: "deepseek-ai/DeepSeek-V4.1-Flash" }) }
		vi.mocked(apiModule.buildApiHandler).mockReturnValue(mockRelaceHandler as any)

		const state = {
			condenseProvider: "relace",
			condenseModelId: "deepseek-ai/DeepSeek-V4.1-Flash",
			apiConfiguration: {
				apiProvider: "anthropic",
				anthropicApiKey: "ant-key",
				relaceApiKey: "rlc-key",
			},
		}
		const handler = await getCondenseApiHandler(mockTask, state)
		expect(handler).toBe(mockRelaceHandler)
		expect(apiModule.buildApiHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				apiProvider: "relace",
				apiModelId: "deepseek-ai/DeepSeek-V4.1-Flash",
				relaceModelId: "deepseek-ai/DeepSeek-V4.1-Flash",
				relaceApiKey: "rlc-key",
			}),
		)
	})

	it("gracefully falls back to task.api if buildApiHandler throws an error", async () => {
		vi.mocked(apiModule.buildApiHandler).mockImplementation(() => {
			throw new Error("Missing credentials for provider")
		})

		const state = {
			condenseProvider: "relace",
			condenseModelId: "deepseek-ai/DeepSeek-V4.1-Flash",
			apiConfiguration: { apiProvider: "anthropic" },
		}
		const handler = await getCondenseApiHandler(mockTask, state)
		expect(handler).toBe(mockPrimaryApi)
	})
})
