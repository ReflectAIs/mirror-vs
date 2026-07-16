import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateImageTool } from "../GenerateImageTool"
import { ToolUse } from "../../../shared/tools"
import { Task } from "../../task/Task"
import * as fs from "fs/promises"
import * as pathUtils from "../../../utils/pathUtils"
import * as fileUtils from "../../../utils/fs"
import { formatResponse } from "../../prompts/responses"
import { EXPERIMENT_IDS } from "../../../shared/experiments"
import { ImageProviderRegistry } from "../../../api/image/registry"
import { setActiveProviderSelector } from "../../../api/image/router"
import type { ImageProvider } from "../../../api/image/provider"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/pathUtils")
vi.mock("../../../utils/fs")
vi.mock("../../../utils/safeWriteJson")

describe("generateImageTool", () => {
	let mockMirror: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock Mirror instance
		mockMirror = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			recordToolUsage: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn().mockResolvedValue(undefined),
			mirrorIgnoreController: {
				validateAccess: vi.fn().mockReturnValue(true),
			},
			mirrorProtectedController: {
				isWriteProtected: vi.fn().mockReturnValue(false),
			},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						experiments: {
							[EXPERIMENT_IDS.TXT2IMG]: true,
						},
						openRouterImageApiKey: "test-api-key",
						openRouterImageGenerationSelectedModel: "google/gemini-2.5-flash-image",
					}),
					convertToWebviewUri: vi
						.fn()
						.mockImplementation((path) => `https://file+.vscode-resource.vscode-cdn.net${path}`),
				}),
			},
			fileContextTracker: {
				trackFileContext: vi.fn(),
			},
			didEditFile: false,
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()

		// Clear and re-register a mock image provider so
		// ImageProviderRouter.getActiveProvider() returns a real provider.
		// ImageProviderRegistry is a singleton — clear previous test registrations first.
		ImageProviderRegistry.clear()
		const mockGenerateImage = vi.fn().mockResolvedValue({
			success: true,
			imageData: "data:image/png;base64,fakebase64data",
		})
		const mockProvider: ImageProvider = {
			name: "openrouter",
			health: vi.fn().mockResolvedValue({ alive: true }),
			listModels: vi.fn().mockResolvedValue([]),
			generate: mockGenerateImage,
			edit: vi.fn(),
			inpaint: vi.fn(),
			outpaint: vi.fn(),
			upscale: vi.fn(),
			removeBackground: vi.fn(),
			interrupt: vi.fn(),
			getProgress: vi.fn().mockReturnValue({ status: "idle" }),
			getCapabilities: vi.fn().mockReturnValue({}),
		}
		ImageProviderRegistry.register("openrouter", mockProvider)
		setActiveProviderSelector(() => "openrouter")
		mockMirror._mockGenerateImage = mockGenerateImage

		// Mock file system operations
		vi.mocked(fileUtils.fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("fake-image-data"))
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(pathUtils.isPathOutsideWorkspace).mockReturnValue(false)
	})

	describe("partial block handling", () => {
		it("should return early when block is partial", async () => {
			const partialBlock: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				nativeArgs: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				partial: true,
			}

			await generateImageTool.handle(mockMirror as Task, partialBlock as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Should not process anything when partial
			expect(mockAskApproval).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalled()
			expect(mockMirror.say).not.toHaveBeenCalled()
		})

		it("should return early when block is partial even with image parameter", async () => {
			const partialBlock: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Upscale this image",
					path: "upscaled-image.png",
					image: "source-image.png",
				},
				nativeArgs: {
					prompt: "Upscale this image",
					path: "upscaled-image.png",
					image: "source-image.png",
				},
				partial: true,
			}

			await generateImageTool.handle(mockMirror as Task, partialBlock as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Should not process anything when partial
			expect(mockAskApproval).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalled()
			expect(mockMirror.say).not.toHaveBeenCalled()
			expect(fs.readFile).not.toHaveBeenCalled()
		})

		it("should process when block is not partial", async () => {
			const completeBlock: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				nativeArgs: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, completeBlock as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Should process the complete block
			expect(mockAskApproval).toHaveBeenCalled()
			expect(mockMirror._mockGenerateImage).toHaveBeenCalled()
			expect(mockPushToolResult).toHaveBeenCalled()
		})

		it("should add cache-busting parameter to image URI", async () => {
			const completeBlock: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				nativeArgs: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				partial: false,
			}

			// Mock convertToWebviewUri to return a test URI
			const mockWebviewUri = "https://file+.vscode-resource.vscode-cdn.net/test/workspace/test-image.png"
			mockMirror.providerRef.deref().convertToWebviewUri.mockReturnValue(mockWebviewUri)

			await generateImageTool.handle(mockMirror as Task, completeBlock as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Check that mirror.say was called with image data containing cache-busting parameter
			expect(mockMirror.say).toHaveBeenCalledWith("image", expect.stringMatching(/"imageUri":"[^"]+\?t=\d+"/))

			// Verify the imageUri contains the cache-busting parameter
			const sayCall = mockMirror.say.mock.calls.find((call: any[]) => call[0] === "image")
			if (sayCall) {
				const imageData = JSON.parse(sayCall[1])
				expect(imageData.imageUri).toMatch(/\?t=\d+$/)
				// Handle both Unix and Windows path separators
				const expectedPath =
					process.platform === "win32"
						? "\\test\\workspace\\test-image.png"
						: "/test/workspace/test-image.png"
				expect(imageData.imagePath).toBe(expectedPath)
			}
		})
	})

	describe("missing parameters", () => {
		it("should handle missing prompt parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					path: "test-image.png",
				},
				nativeArgs: {
					path: "test-image.png",
				} as any,
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockMirror.consecutiveMistakeCount).toBe(1)
			expect(mockMirror.recordToolError).toHaveBeenCalledWith("generate_image")
			expect(mockMirror.sayAndCreateMissingParamError).toHaveBeenCalledWith("generate_image", "prompt")
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should handle missing path parameter", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
				},
				nativeArgs: {
					prompt: "Generate a test image",
				} as any,
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockMirror.consecutiveMistakeCount).toBe(1)
			expect(mockMirror.recordToolError).toHaveBeenCalledWith("generate_image")
			expect(mockMirror.sayAndCreateMissingParamError).toHaveBeenCalledWith("generate_image", "path")
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})
	})

	describe("experiment validation", () => {
		it("should error when all 8 image pipeline experiments are disabled", async () => {
			// Disable ALL experiments
			mockMirror.providerRef.deref().getState.mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.TXT2IMG]: false,
					[EXPERIMENT_IDS.IMG2IMG]: false,
					[EXPERIMENT_IDS.INPAINT]: false,
					[EXPERIMENT_IDS.OUTPAINT]: false,
					[EXPERIMENT_IDS.UPSCALE]: false,
					[EXPERIMENT_IDS.REMOVE_BG]: false,
					[EXPERIMENT_IDS.TXT2AUDIO]: false,
					[EXPERIMENT_IDS.TXT2VIDEO]: false,
				},
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				nativeArgs: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockPushToolResult).toHaveBeenCalledWith(
				formatResponse.toolError(
					"Image generation is an experimental feature that must be enabled in settings. Please enable 'Image Generation' in the Experimental Settings section.",
				),
			)
		})

		it("should succeed when only TXT2IMG is enabled (default test setup)", async () => {
			// TXT2IMG is already enabled in beforeEach
			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				nativeArgs: {
					prompt: "Generate a test image",
					path: "test-image.png",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// The tool should proceed past experiment check
			expect(mockAskApproval).toHaveBeenCalled()
		})

		it("should succeed when only IMG2IMG is enabled (not just TXT2IMG)", async () => {
			// Enable only IMG2IMG, disable all others including TXT2IMG
			mockMirror.providerRef.deref().getState.mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.TXT2IMG]: false,
					[EXPERIMENT_IDS.IMG2IMG]: true,
					[EXPERIMENT_IDS.INPAINT]: false,
					[EXPERIMENT_IDS.OUTPAINT]: false,
					[EXPERIMENT_IDS.UPSCALE]: false,
					[EXPERIMENT_IDS.REMOVE_BG]: false,
					[EXPERIMENT_IDS.TXT2AUDIO]: false,
					[EXPERIMENT_IDS.TXT2VIDEO]: false,
				},
				openRouterImageApiKey: "test-api-key",
				openRouterImageGenerationSelectedModel: "google/gemini-2.5-flash-image",
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Edit an image",
					path: "edited-image.png",
					image: "source.png",
				},
				nativeArgs: {
					prompt: "Edit an image",
					path: "edited-image.png",
					image: "source.png",
				} as any,
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			// Should proceed past experiment check despite TXT2IMG being disabled
			expect(mockAskApproval).toHaveBeenCalled()
		})

		it("should succeed when only TXT2AUDIO is enabled", async () => {
			mockMirror.providerRef.deref().getState.mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.TXT2IMG]: false,
					[EXPERIMENT_IDS.IMG2IMG]: false,
					[EXPERIMENT_IDS.INPAINT]: false,
					[EXPERIMENT_IDS.OUTPAINT]: false,
					[EXPERIMENT_IDS.UPSCALE]: false,
					[EXPERIMENT_IDS.REMOVE_BG]: false,
					[EXPERIMENT_IDS.TXT2AUDIO]: true,
					[EXPERIMENT_IDS.TXT2VIDEO]: false,
				},
				openRouterImageApiKey: "test-api-key",
				openRouterImageGenerationSelectedModel: "google/gemini-2.5-flash-image",
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate audio of rain sounds",
					path: "audio/rain.wav",
				},
				nativeArgs: {
					prompt: "Generate audio of rain sounds",
					path: "audio/rain.wav",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAskApproval).toHaveBeenCalled()
		})

		it("should succeed when only TXT2VIDEO is enabled", async () => {
			mockMirror.providerRef.deref().getState.mockResolvedValue({
				experiments: {
					[EXPERIMENT_IDS.TXT2IMG]: false,
					[EXPERIMENT_IDS.IMG2IMG]: false,
					[EXPERIMENT_IDS.INPAINT]: false,
					[EXPERIMENT_IDS.OUTPAINT]: false,
					[EXPERIMENT_IDS.UPSCALE]: false,
					[EXPERIMENT_IDS.REMOVE_BG]: false,
					[EXPERIMENT_IDS.TXT2AUDIO]: false,
					[EXPERIMENT_IDS.TXT2VIDEO]: true,
				},
				openRouterImageApiKey: "test-api-key",
				openRouterImageGenerationSelectedModel: "google/gemini-2.5-flash-image",
			})

			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Generate a short video of a cat",
					path: "videos/cat.mp4",
				},
				nativeArgs: {
					prompt: "Generate a short video of a cat",
					path: "videos/cat.mp4",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockAskApproval).toHaveBeenCalled()
		})
	})

	describe("input image validation", () => {
		it("should handle non-existent input image", async () => {
			vi.mocked(fileUtils.fileExistsAtPath).mockResolvedValue(false)

			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Upscale this image",
					path: "upscaled.png",
					image: "non-existent.png",
				},
				nativeArgs: {
					prompt: "Upscale this image",
					path: "upscaled.png",
					image: "non-existent.png",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockMirror.say).toHaveBeenCalledWith("error", expect.stringContaining("Input image not found"))
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Input image not found"))
		})

		it("should handle unsupported image format", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "generate_image",
				params: {
					prompt: "Upscale this image",
					path: "upscaled.png",
					image: "test.bmp", // Unsupported format
				},
				nativeArgs: {
					prompt: "Upscale this image",
					path: "upscaled.png",
					image: "test.bmp",
				},
				partial: false,
			}

			await generateImageTool.handle(mockMirror as Task, block as ToolUse<"generate_image">, {
				askApproval: mockAskApproval,
				handleError: mockHandleError,
				pushToolResult: mockPushToolResult,
			})

			expect(mockMirror.say).toHaveBeenCalledWith("error", expect.stringContaining("Unsupported image format"))
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Unsupported image format"))
		})
	})
})
