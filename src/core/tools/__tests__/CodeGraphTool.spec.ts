import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("vscode", () => {
	return {
		SymbolKind: {
			File: 0,
			Module: 1,
			Namespace: 2,
			Package: 3,
			Class: 4,
			Method: 5,
			Property: 6,
			Field: 7,
			Constructor: 8,
			Enum: 9,
			Interface: 10,
			Function: 11,
			Variable: 12,
			Constant: 13,
			String: 14,
			Number: 15,
			Boolean: 16,
			Array: 17,
			Object: 18,
			Key: 19,
			Null: 20,
			EnumMember: 21,
			Struct: 22,
			Event: 23,
			Operator: 24,
			TypeParameter: 25,
		},
		Uri: {
			file: (p: string) => ({ fsPath: p, path: p }),
		},
		Position: class {
			constructor(
				public line: number,
				public character: number,
			) {}
		},
		Range: class {
			constructor(
				public start: { line: number; character: number },
				public end: { line: number; character: number },
			) {}
		},
		commands: {
			executeCommand: vi.fn(),
		},
	}
})

vi.mock("fs", () => ({
	promises: {
		readFile: vi.fn().mockResolvedValue("export function testSymbol() {}\n"),
	},
}))

import * as vscode from "vscode"
import { codeGraphTool } from "../CodeGraphTool"
import type { ToolCallbacks } from "../BaseTool"

describe("CodeGraphTool", () => {
	let mockPushToolResult: ReturnType<typeof vi.fn>
	let mockSay: ReturnType<typeof vi.fn>
	let callbacks: ToolCallbacks
	let mockTask: any

	beforeEach(() => {
		mockPushToolResult = vi.fn()
		mockSay = vi.fn().mockResolvedValue(undefined)
		callbacks = {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		}
		mockTask = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			say: mockSay,
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
		}
		vi.clearAllMocks()
	})

	it("has the correct tool name", () => {
		expect(codeGraphTool.name).toBe("code_graph")
	})

	it("fails if action is missing", async () => {
		await codeGraphTool.execute({} as any, mockTask, callbacks)
		expect(mockTask.recordToolError).toHaveBeenCalledWith("code_graph")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
	})

	it("executes workspace_symbols action", async () => {
		const mockSymbols = [
			{
				name: "UserService",
				kind: 4, // Class
				containerName: "AuthModule",
				location: {
					uri: { fsPath: "/test/workspace/src/auth/UserService.ts" },
					range: { start: { line: 12, character: 0 } },
				},
			},
		]
		vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockSymbols as any)

		await codeGraphTool.execute({ action: "workspace_symbols", query: "UserService" }, mockTask, callbacks)

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"vscode.executeWorkspaceSymbolProvider",
			"UserService",
		)
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("UserService"))
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("src/auth/UserService.ts:13"))
	})

	it("executes find_definitions action", async () => {
		const mockDefinitions = [
			{
				uri: { fsPath: "/test/workspace/src/models/User.ts" },
				range: {
					start: { line: 20, character: 4 },
					end: { line: 20, character: 12 },
				},
			},
		]
		vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockDefinitions as any)

		await codeGraphTool.execute(
			{
				action: "find_definitions",
				path: "src/auth/UserService.ts",
				line: 5,
				symbol: "User",
			},
			mockTask,
			callbacks,
		)

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"vscode.executeDefinitionProvider",
			expect.anything(),
			expect.anything(),
		)
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("src/models/User.ts:21"))
	})

	it("executes find_references action", async () => {
		const mockRefs = [
			{
				uri: { fsPath: "/test/workspace/src/routes/user.ts" },
				range: {
					start: { line: 40, character: 10 },
					end: { line: 40, character: 18 },
				},
			},
		]
		vi.mocked(vscode.commands.executeCommand).mockResolvedValue(mockRefs as any)

		await codeGraphTool.execute(
			{
				action: "find_references",
				path: "src/models/User.ts",
				line: 21,
				symbol: "User",
			},
			mockTask,
			callbacks,
		)

		expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
			"vscode.executeReferenceProvider",
			expect.anything(),
			expect.anything(),
		)
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("src/routes/user.ts:41:11"))
	})
})
