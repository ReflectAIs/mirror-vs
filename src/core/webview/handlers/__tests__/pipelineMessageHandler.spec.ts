/**
 * Tests for pipelineMessageHandler — webview message handler functions.
 */
import { PipelineRegistry } from "../../../../api/image/pipeline-registry"

// We test the handler functions directly (unit tests), so we mock the provider
// and PipelineRegistry.

const { mockPostMessage, mockLog, mockGetCurrentTask } = vi.hoisted(() => ({
	mockPostMessage: vi.fn(),
	mockLog: vi.fn(),
	mockGetCurrentTask: vi.fn(),
}))

// ---- Mock MirrorProvider ----
vi.mock("../../MirrorProvider", () => {
	// We need a class reference but our tests construct partial instances manually
	return {
		MirrorProvider: class {},
	}
})

// ---- Mock PipelineRegistry ----
vi.mock("../../../../api/image/pipeline-registry", () => ({
	PipelineRegistry: {
		isInitialized: vi.fn(),
		initialize: vi.fn(),
		restorePersistedDefaults: vi.fn(),
		listAll: vi.fn(),
		resolve: vi.fn(),
		importPipeline: vi.fn(),
		deletePipeline: vi.fn(),
		setUserDefault: vi.fn(),
		getUserDefault: vi.fn(),
		hidePipeline: vi.fn(),
		unhidePipeline: vi.fn(),
		isHidden: vi.fn(),
		getHiddenPipelines: vi.fn(),
	},
}))

// ---- Mock _helpers ----
vi.mock("../_helpers", () => ({
	getCurrentCwd: vi.fn(() => "/test/cwd"),
}))

import type { MirrorProvider } from "../../MirrorProvider"
import {
	handleRequestPipelines,
	handleImportPipeline,
	handleDeletePipeline,
	handleSetDefaultPipeline,
	handleHidePipeline,
	handleUnhidePipeline,
} from "../pipelineMessageHandler"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProvider(): MirrorProvider {
	return {
		postMessageToWebview: mockPostMessage,
		log: mockLog,
		getCurrentTask: mockGetCurrentTask.mockReturnValue({ cwd: "/test/cwd" }),
		contextProxy: {
			getValues: vi.fn(() => ({
				comfyuiDefaultPipelines: {},
				hiddenPipelines: [],
			})),
			setValue: vi.fn(),
		},
	} as unknown as MirrorProvider
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pipelineMessageHandler", () => {
	let provider: MirrorProvider

	beforeEach(() => {
		provider = createMockProvider()
		vi.clearAllMocks()
	})

	// ------------------------------------------------------------------
	// handleRequestPipelines
	// ------------------------------------------------------------------
	describe("handleRequestPipelines", () => {
		it("sends pipeline list to webview", async () => {
			;(PipelineRegistry.isInitialized as any).mockReturnValue(true)
			;(PipelineRegistry.listAll as any).mockReturnValue([
				{
					slug: "a",
					name: "A",
					description: "",
					type: "generate",
					tags: ["fast"],
					source: "builtin",
					isDefault: true,
				},
				{
					slug: "b",
					name: "B",
					description: "",
					type: "upscale",
					tags: [],
					source: "global",
					isDefault: false,
				},
			])

			await handleRequestPipelines(provider)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "pipelines",
					pipelines: expect.arrayContaining([
						expect.objectContaining({ slug: "a", name: "A" }),
						expect.objectContaining({ slug: "b", name: "B" }),
					]),
				}),
			)
		})

		it("initializes registry if not yet initialized", async () => {
			;(PipelineRegistry.isInitialized as any).mockReturnValue(false)
			;(PipelineRegistry.initialize as any).mockResolvedValue(undefined)
			;(PipelineRegistry.listAll as any).mockReturnValue([])

			await handleRequestPipelines(provider)

			expect(PipelineRegistry.initialize).toHaveBeenCalledWith("/test/cwd")
		})

		it("sends error message on failure", async () => {
			;(PipelineRegistry.isInitialized as any).mockReturnValue(true)
			;(PipelineRegistry.listAll as any).mockImplementation(() => {
				throw new Error("boom")
			})

			await handleRequestPipelines(provider)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "pipelines",
					pipelines: [],
					error: "boom",
				}),
			)
		})
	})

	// ------------------------------------------------------------------
	// handleImportPipeline
	// ------------------------------------------------------------------
	describe("handleImportPipeline", () => {
		it("returns error when no JSON content provided", async () => {
			await handleImportPipeline(provider, { type: "importPipeline", text: undefined } as any)
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "importPipelineResult", success: false }),
			)
		})

		it("imports a pipeline and returns success", async () => {
			;(PipelineRegistry.isInitialized as any).mockReturnValue(true)
			;(PipelineRegistry.importPipeline as any).mockResolvedValue("my-pipe")
			;(PipelineRegistry.listAll as any).mockReturnValue([
				{
					slug: "my-pipe",
					name: "My Pipe",
					description: "",
					type: "generate",
					tags: [],
					source: "project",
					isDefault: false,
				},
			])

			await handleImportPipeline(provider, { type: "importPipeline", text: '{"nodes":[]}' } as any)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "importPipelineResult", success: true, slug: "my-pipe" }),
			)
			// Should also refresh the pipeline list
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "pipelines" }))
		})

		it("returns error on import failure", async () => {
			;(PipelineRegistry.isInitialized as any).mockReturnValue(true)
			;(PipelineRegistry.importPipeline as any).mockRejectedValue(new Error("invalid"))

			await handleImportPipeline(provider, { type: "importPipeline", text: "bad" } as any)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "importPipelineResult", success: false, error: "invalid" }),
			)
		})
	})

	// ------------------------------------------------------------------
	// handleDeletePipeline
	// ------------------------------------------------------------------
	describe("handleDeletePipeline", () => {
		it("returns error when no slug provided", async () => {
			await handleDeletePipeline(provider, { type: "deletePipeline", text: undefined } as any)
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "deletePipelineResult", success: false }),
			)
		})

		it("deletes a pipeline and returns success", async () => {
			;(PipelineRegistry.deletePipeline as any).mockResolvedValue(undefined)
			;(PipelineRegistry.listAll as any).mockReturnValue([])

			await handleDeletePipeline(provider, { type: "deletePipeline", text: "to-delete" } as any)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "deletePipelineResult", success: true, slug: "to-delete" }),
			)
			// Should refresh pipelines
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "pipelines" }))
		})

		it("returns error on delete failure", async () => {
			;(PipelineRegistry.deletePipeline as any).mockRejectedValue(new Error("not found"))
			;(PipelineRegistry.isInitialized as any).mockReturnValue(true)

			await handleDeletePipeline(provider, { type: "deletePipeline", text: "nope" } as any)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "deletePipelineResult", success: false, error: "not found" }),
			)
		})
	})

	// ------------------------------------------------------------------
	// handleSetDefaultPipeline
	// ------------------------------------------------------------------
	describe("handleSetDefaultPipeline", () => {
		it("returns error when no slug provided", async () => {
			await handleSetDefaultPipeline(provider, { type: "setDefaultPipeline", text: undefined } as any)
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "setDefaultPipelineResult", success: false }),
			)
		})

		it("sets the default and returns success", async () => {
			;(PipelineRegistry.resolve as any).mockReturnValue({ type: "generate", slug: "flash" })
			;(PipelineRegistry.setUserDefault as any).mockReturnValue(undefined)
			;(PipelineRegistry.listAll as any).mockReturnValue([
				{
					slug: "flash",
					name: "Flash",
					description: "",
					type: "generate",
					tags: [],
					source: "builtin",
					isDefault: true,
				},
			])

			await handleSetDefaultPipeline(provider, { type: "setDefaultPipeline", text: "flash" } as any)

			expect(PipelineRegistry.setUserDefault).toHaveBeenCalledWith("generate", "flash")
			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "setDefaultPipelineResult",
					success: true,
					slug: "flash",
					pipelineType: "generate",
				}),
			)
			// Should refresh pipelines
			expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "pipelines" }))
		})

		it("returns error on resolve failure", async () => {
			;(PipelineRegistry.resolve as any).mockImplementation(() => {
				throw new Error("not found")
			})

			await handleSetDefaultPipeline(provider, { type: "setDefaultPipeline", text: "nope" } as any)

			expect(mockPostMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: "setDefaultPipelineResult", success: false, error: "not found" }),
			)
		})

		// ------------------------------------------------------------------
		// handleHidePipeline
		// ------------------------------------------------------------------
		describe("handleHidePipeline", () => {
			it("returns error when no slug provided", async () => {
				await handleHidePipeline(provider, { type: "hidePipeline", text: undefined } as any)
				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "hidePipelineResult", success: false }),
				)
			})

			it("hides a pipeline and persists to global state", async () => {
				;(PipelineRegistry.hidePipeline as any).mockReturnValue(undefined)
				;(PipelineRegistry.listAll as any).mockReturnValue([])

				await handleHidePipeline(provider, { type: "hidePipeline", text: "txt2img" } as any)

				expect(PipelineRegistry.hidePipeline).toHaveBeenCalledWith("txt2img")
				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "hidePipelineResult", success: true, slug: "txt2img" }),
				)
				// Should refresh pipelines
				expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "pipelines" }))
			})

			it("returns error on hide failure", async () => {
				;(PipelineRegistry.hidePipeline as any).mockImplementation(() => {
					throw new Error("not found")
				})

				await handleHidePipeline(provider, { type: "hidePipeline", text: "nope" } as any)

				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "hidePipelineResult", success: false, error: "not found" }),
				)
			})
		})

		// ------------------------------------------------------------------
		// handleUnhidePipeline
		// ------------------------------------------------------------------
		describe("handleUnhidePipeline", () => {
			it("returns error when no slug provided", async () => {
				await handleUnhidePipeline(provider, { type: "unhidePipeline", text: undefined } as any)
				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "unhidePipelineResult", success: false }),
				)
			})

			it("unhides a pipeline and persists to global state", async () => {
				;(PipelineRegistry.unhidePipeline as any).mockReturnValue(undefined)
				;(PipelineRegistry.listAll as any).mockReturnValue([])

				await handleUnhidePipeline(provider, { type: "unhidePipeline", text: "txt2img" } as any)

				expect(PipelineRegistry.unhidePipeline).toHaveBeenCalledWith("txt2img")
				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "unhidePipelineResult", success: true, slug: "txt2img" }),
				)
				// Should refresh pipelines
				expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "pipelines" }))
			})

			it("returns error on unhide failure", async () => {
				;(PipelineRegistry.unhidePipeline as any).mockImplementation(() => {
					throw new Error("not hidden")
				})

				await handleUnhidePipeline(provider, { type: "unhidePipeline", text: "nope" } as any)

				expect(mockPostMessage).toHaveBeenCalledWith(
					expect.objectContaining({ type: "unhidePipelineResult", success: false, error: "not hidden" }),
				)
			})
		})
	})
})
