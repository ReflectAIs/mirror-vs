import * as path from "path"

import type { MockedFunction } from "vitest"

import { fileExistsAtPath, createDirectoriesForFile } from "../../../utils/fs"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { getReadablePath } from "../../../utils/path"
import { unescapeHtmlEntities } from "../../../utils/text-normalization"
import { everyLineHasLineNumbers, stripLineNumbers } from "../../../integrations/misc/extract-text"
import { ToolUse, ToolResponse } from "../../../shared/tools"
import { writeToFileTool } from "../WriteToFileTool"

vi.mock("path", async () => {
	const originalPath = await vi.importActual("path")
	return {
		...originalPath,
		resolve: vi.fn().mockImplementation((...args) => {
			// On Windows, use backslashes; on Unix, use forward slashes
			const separator = process.platform === "win32" ? "\\" : "/"
			return args.join(separator)
		}),
	}
})

vi.mock("delay", () => ({
	default: vi.fn(),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(false),
	createDirectoriesForFile: vi.fn().mockResolvedValue([]),
}))

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg) => `Error: ${msg}`),
		mirrorIgnoreError: vi.fn((path) => `Access denied: ${path}`),
		createPrettyPatch: vi.fn(() => "mock-diff"),
	},
}))

vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn().mockReturnValue(false),
}))

vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn().mockReturnValue("test/path.txt"),
}))

vi.mock("../../../utils/text-normalization", () => ({
	unescapeHtmlEntities: vi.fn().mockImplementation((content) => content),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	everyLineHasLineNumbers: vi.fn().mockReturnValue(false),
	stripLineNumbers: vi.fn().mockImplementation((content) => content),
	addLineNumbers: vi.fn().mockImplementation((content: string) =>
		content
			.split("\n")
			.map((line: string, i: number) => `${i + 1} | ${line}`)
			.join("\n"),
	),
}))

vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
	},
	env: {
		openExternal: vi.fn(),
	},
	Uri: {
		parse: vi.fn(),
	},
}))

vi.mock("../../ignore/MirrorIgnoreController", () => ({
	MirrorIgnoreController: class {
		initialize() {
			return Promise.resolve()
		}
		validateAccess() {
			return true
		}
	},
}))

describe("writeToFileTool", () => {
	// Test data
	const testFilePath = "test/file.txt"
	const absoluteFilePath = process.platform === "win32" ? "C:\\test\\file.txt" : "/test/file.txt"
	const testContent = "Line 1\nLine 2\nLine 3"
	const testContentWithMarkdown = "```javascript\nLine 1\nLine 2\n```"

	// Mocked functions with correct types
	const mockedFileExistsAtPath = fileExistsAtPath as MockedFunction<typeof fileExistsAtPath>
	const mockedCreateDirectoriesForFile = createDirectoriesForFile as MockedFunction<typeof createDirectoriesForFile>
	const mockedIsPathOutsideWorkspace = isPathOutsideWorkspace as MockedFunction<typeof isPathOutsideWorkspace>
	const mockedGetReadablePath = getReadablePath as MockedFunction<typeof getReadablePath>
	const mockedUnescapeHtmlEntities = unescapeHtmlEntities as MockedFunction<typeof unescapeHtmlEntities>
	const mockedEveryLineHasLineNumbers = everyLineHasLineNumbers as MockedFunction<typeof everyLineHasLineNumbers>
	const mockedStripLineNumbers = stripLineNumbers as MockedFunction<typeof stripLineNumbers>
	const mockedPathResolve = path.resolve as MockedFunction<typeof path.resolve>

	const mockMirror: any = {}
	let mockAskApproval: ReturnType<typeof vi.fn>
	let mockHandleError: ReturnType<typeof vi.fn>
	let mockPushToolResult: ReturnType<typeof vi.fn>
	let toolResult: ToolResponse | undefined

	beforeEach(() => {
		vi.clearAllMocks()
		writeToFileTool.resetPartialState()

		mockedPathResolve.mockReturnValue(absoluteFilePath)
		mockedFileExistsAtPath.mockResolvedValue(false)
		mockedIsPathOutsideWorkspace.mockReturnValue(false)
		mockedGetReadablePath.mockReturnValue("test/path.txt")
		mockedUnescapeHtmlEntities.mockImplementation((content) => content)
		mockedEveryLineHasLineNumbers.mockReturnValue(false)
		mockedStripLineNumbers.mockImplementation((content) => content)

		mockMirror.cwd = "/"
		mockMirror.consecutiveMistakeCount = 0
		mockMirror.didEditFile = false
		mockMirror.diffStrategy = undefined
		mockMirror.providerRef = {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue({
					diagnosticsEnabled: true,
					writeDelayMs: 1000,
				}),
			}),
		}
		mockMirror.mirrorIgnoreController = {
			validateAccess: vi.fn().mockReturnValue(true),
		}
		mockMirror.diffViewProvider = {
			editType: undefined,
			isEditing: false,
			originalContent: "",
			open: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			reset: vi.fn().mockResolvedValue(undefined),
			revertChanges: vi.fn().mockResolvedValue(undefined),
			saveChanges: vi.fn().mockResolvedValue({
				newProblemsMessage: "",
				userEdits: null,
				finalContent: "final content",
			}),
			scrollToFirstDiff: vi.fn(),
			updateDiagnosticSettings: vi.fn(),
			pushToolWriteResult: vi.fn().mockImplementation(async function (
				this: any,
				task: any,
				cwd: string,
				isNewFile: boolean,
			) {
				// Simulate the behavior of pushToolWriteResult
				if (this.userEdits) {
					await task.say(
						"user_feedback_diff",
						JSON.stringify({
							tool: isNewFile ? "newFileCreated" : "editedExistingFile",
							path: "test/path.txt",
							diff: this.userEdits,
						}),
					)
				}
				return "Tool result message"
			}),
		}
		mockMirror.api = {
			getModel: vi.fn().mockReturnValue({ id: "claude-3" }),
		}
		mockMirror.fileContextTracker = {
			trackFileContext: vi.fn().mockResolvedValue(undefined),
		}
		mockMirror.say = vi.fn().mockResolvedValue(undefined)
		mockMirror.ask = vi.fn().mockResolvedValue(undefined)
		mockMirror.recordToolError = vi.fn()
		mockMirror.sayAndCreateMissingParamError = vi.fn().mockResolvedValue("Missing param error")

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn().mockResolvedValue(undefined)

		toolResult = undefined
	})

	/**
	 * Helper function to execute the write file tool with different parameters
	 */
	async function executeWriteFileTool(
		params: Partial<ToolUse["params"]> = {},
		options: {
			fileExists?: boolean
			isPartial?: boolean
			accessAllowed?: boolean
		} = {},
	): Promise<ToolResponse | undefined> {
		// Configure mocks based on test scenario
		const fileExists = options.fileExists ?? false
		const isPartial = options.isPartial ?? false
		const accessAllowed = options.accessAllowed ?? true

		mockedFileExistsAtPath.mockResolvedValue(fileExists)
		mockMirror.mirrorIgnoreController.validateAccess.mockReturnValue(accessAllowed)

		// Create a tool use object
		const toolUse: ToolUse = {
			type: "tool_use",
			name: "write_to_file",
			params: {
				path: testFilePath,
				content: testContent,
				...params,
			},
			nativeArgs: {
				path: (params.path ?? testFilePath) as any,
				content: (params.content ?? testContent) as any,
			},
			partial: isPartial,
		}

		mockPushToolResult = vi.fn((result: ToolResponse) => {
			toolResult = result
		})

		await writeToFileTool.handle(mockMirror, toolUse as ToolUse<"write_to_file">, {
			askApproval: mockAskApproval,
			handleError: mockHandleError,
			pushToolResult: mockPushToolResult,
		})

		return toolResult
	}

	describe("access control", () => {
		it("validates and allows access when mirrorIgnoreController permits", async () => {
			await executeWriteFileTool({}, { accessAllowed: true })

			expect(mockMirror.mirrorIgnoreController.validateAccess).toHaveBeenCalledWith(testFilePath)
			expect(mockMirror.diffViewProvider.open).toHaveBeenCalledWith(testFilePath)
		})
	})

	describe("file existence detection", () => {
		it.skipIf(process.platform === "win32")("detects existing file and sets editType to modify", async () => {
			await executeWriteFileTool({}, { fileExists: true })

			expect(mockedFileExistsAtPath).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockMirror.diffViewProvider.editType).toBe("modify")
		})

		it.skipIf(process.platform === "win32")("detects new file and sets editType to create", async () => {
			await executeWriteFileTool({}, { fileExists: false })

			expect(mockedFileExistsAtPath).toHaveBeenCalledWith(absoluteFilePath)
			expect(mockMirror.diffViewProvider.editType).toBe("create")
		})

		it("uses cached editType without filesystem check", async () => {
			mockMirror.diffViewProvider.editType = "modify"

			await executeWriteFileTool({})

			expect(mockedFileExistsAtPath).not.toHaveBeenCalled()
		})
	})

	describe("directory creation for new files", () => {
		it.skipIf(process.platform === "win32")(
			"creates parent directories early when file does not exist (execute)",
			async () => {
				await executeWriteFileTool({}, { fileExists: false })

				expect(mockedCreateDirectoriesForFile).toHaveBeenCalledWith(absoluteFilePath)
			},
		)

		it.skipIf(process.platform === "win32")(
			"creates parent directories when path has stabilized (partial)",
			async () => {
				// First call - path not yet stabilized
				await executeWriteFileTool({}, { fileExists: false, isPartial: true })
				expect(mockedCreateDirectoriesForFile).not.toHaveBeenCalled()

				// Second call with same path - path is now stabilized
				await executeWriteFileTool({}, { fileExists: false, isPartial: true })
				expect(mockedCreateDirectoriesForFile).toHaveBeenCalledWith(absoluteFilePath)
			},
		)

		it("does not create directories when file exists", async () => {
			await executeWriteFileTool({}, { fileExists: true })

			expect(mockedCreateDirectoriesForFile).not.toHaveBeenCalled()
		})

		it("does not create directories when editType is cached as modify", async () => {
			mockMirror.diffViewProvider.editType = "modify"

			await executeWriteFileTool({})

			expect(mockedCreateDirectoriesForFile).not.toHaveBeenCalled()
		})

		it.skipIf(process.platform === "win32")("creates directories when editType is cached as create", async () => {
			mockMirror.diffViewProvider.editType = "create"

			await executeWriteFileTool({})

			expect(mockedCreateDirectoriesForFile).toHaveBeenCalledWith(absoluteFilePath)
		})
	})

	describe("content preprocessing", () => {
		it("removes markdown code block markers from content", async () => {
			await executeWriteFileTool({ content: testContentWithMarkdown })

			expect(mockMirror.diffViewProvider.update).toHaveBeenCalledWith("Line 1\nLine 2", true)
		})

		it("passes through empty content unchanged", async () => {
			await executeWriteFileTool({ content: "" })

			expect(mockMirror.diffViewProvider.update).toHaveBeenCalledWith("", true)
		})

		it("unescapes HTML entities for non-Claude models", async () => {
			mockMirror.api.getModel.mockReturnValue({ id: "gpt-4" })

			await executeWriteFileTool({ content: "&lt;test&gt;" })

			expect(mockedUnescapeHtmlEntities).toHaveBeenCalledWith("&lt;test&gt;")
		})

		it("skips HTML unescaping for Claude models", async () => {
			mockMirror.api.getModel.mockReturnValue({ id: "claude-3" })

			await executeWriteFileTool({ content: "&lt;test&gt;" })

			expect(mockedUnescapeHtmlEntities).not.toHaveBeenCalled()
		})

		it("strips line numbers from numbered content", async () => {
			const contentWithLineNumbers = "1 | line one\n2 | line two"
			mockedEveryLineHasLineNumbers.mockReturnValue(true)
			mockedStripLineNumbers.mockReturnValue("line one\nline two")

			await executeWriteFileTool({ content: contentWithLineNumbers })

			expect(mockedEveryLineHasLineNumbers).toHaveBeenCalledWith(contentWithLineNumbers)
			expect(mockedStripLineNumbers).toHaveBeenCalledWith(contentWithLineNumbers)
			expect(mockMirror.diffViewProvider.update).toHaveBeenCalledWith("line one\nline two", true)
		})
	})

	describe("file operations", () => {
		it("successfully creates new files with full workflow", async () => {
			await executeWriteFileTool({}, { fileExists: false })

			expect(mockMirror.consecutiveMistakeCount).toBe(0)
			expect(mockMirror.diffViewProvider.open).toHaveBeenCalledWith(testFilePath)
			expect(mockMirror.diffViewProvider.update).toHaveBeenCalledWith(testContent, true)
			expect(mockAskApproval).toHaveBeenCalled()
			expect(mockMirror.diffViewProvider.saveChanges).toHaveBeenCalled()
			expect(mockMirror.fileContextTracker.trackFileContext).toHaveBeenCalledWith(testFilePath, "mirror_edited")
			expect(mockMirror.didEditFile).toBe(true)
		})

		it("processes files outside workspace boundary", async () => {
			mockedIsPathOutsideWorkspace.mockReturnValue(true)

			await executeWriteFileTool({})

			expect(mockedIsPathOutsideWorkspace).toHaveBeenCalled()
		})

		it("processes files with large content", async () => {
			const largeContent = "Line\n".repeat(10000)
			await executeWriteFileTool({ content: largeContent })

			// Should process normally without issues
			expect(mockMirror.consecutiveMistakeCount).toBe(0)
		})
	})

	describe("partial block handling", () => {
		it("returns early when path is missing in partial block", async () => {
			await executeWriteFileTool({ path: undefined }, { isPartial: true })

			expect(mockMirror.diffViewProvider.open).not.toHaveBeenCalled()
		})

		it("returns early when content is undefined in partial block", async () => {
			await executeWriteFileTool({ content: undefined }, { isPartial: true })

			expect(mockMirror.diffViewProvider.open).not.toHaveBeenCalled()
		})

		it("streams content updates during partial execution after path stabilizes", async () => {
			// First call - path not yet stabilized, early return (no file operations)
			await executeWriteFileTool({}, { isPartial: true })
			expect(mockMirror.ask).not.toHaveBeenCalled()
			expect(mockMirror.diffViewProvider.open).not.toHaveBeenCalled()

			// Second call with same path - path is now stabilized, file operations proceed
			await executeWriteFileTool({}, { isPartial: true })
			expect(mockMirror.ask).toHaveBeenCalled()
			expect(mockMirror.diffViewProvider.open).toHaveBeenCalledWith(testFilePath)
			expect(mockMirror.diffViewProvider.update).toHaveBeenCalledWith(testContent, false)
		})
	})

	describe("user interaction", () => {
		it("reverts changes when user rejects approval", async () => {
			mockAskApproval.mockResolvedValue(false)

			await executeWriteFileTool({})

			expect(mockMirror.diffViewProvider.revertChanges).toHaveBeenCalled()
			expect(mockMirror.diffViewProvider.saveChanges).not.toHaveBeenCalled()
		})

		it("reports user edits with diff feedback", async () => {
			const userEditsValue = "- old line\n+ new line"
			mockMirror.diffViewProvider.saveChanges.mockResolvedValue({
				newProblemsMessage: " with warnings",
				userEdits: userEditsValue,
				finalContent: "modified content",
			})
			// Set the userEdits property on the diffViewProvider mock to simulate user edits
			mockMirror.diffViewProvider.userEdits = userEditsValue

			await executeWriteFileTool({}, { fileExists: true })

			expect(mockMirror.say).toHaveBeenCalledWith(
				"user_feedback_diff",
				expect.stringContaining("editedExistingFile"),
			)
		})
	})

	describe("error handling", () => {
		it("handles general file operation errors", async () => {
			mockMirror.diffViewProvider.open.mockRejectedValue(new Error("General error"))

			await executeWriteFileTool({})

			expect(mockHandleError).toHaveBeenCalledWith("writing file", expect.any(Error))
			expect(mockMirror.diffViewProvider.reset).toHaveBeenCalled()
		})

		it("handles partial streaming errors after path stabilizes", async () => {
			mockMirror.diffViewProvider.open.mockRejectedValue(new Error("Open failed"))

			// First call - path not yet stabilized, no error yet
			await executeWriteFileTool({}, { isPartial: true })
			expect(mockHandleError).not.toHaveBeenCalled()

			// Second call with same path - path is now stabilized, error occurs
			await executeWriteFileTool({}, { isPartial: true })
			expect(mockHandleError).toHaveBeenCalledWith("handling partial write_to_file", expect.any(Error))
		})
	})
})
