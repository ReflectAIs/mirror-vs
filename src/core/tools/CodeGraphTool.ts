import * as vscode from "vscode"
import * as path from "path"
import { promises as fs } from "fs"

import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { getReadablePath } from "../../utils/path"
import type { ToolUse } from "../../shared/tools"

export interface CodeGraphParams {
	action: "workspace_symbols" | "find_definitions" | "find_references"
	query?: string
	path?: string
	line?: number
	character?: number
	symbol?: string
}

function symbolKindToString(kind: vscode.SymbolKind): string {
	switch (kind) {
		case vscode.SymbolKind.File:
			return "File"
		case vscode.SymbolKind.Module:
			return "Module"
		case vscode.SymbolKind.Namespace:
			return "Namespace"
		case vscode.SymbolKind.Package:
			return "Package"
		case vscode.SymbolKind.Class:
			return "Class"
		case vscode.SymbolKind.Method:
			return "Method"
		case vscode.SymbolKind.Property:
			return "Property"
		case vscode.SymbolKind.Field:
			return "Field"
		case vscode.SymbolKind.Constructor:
			return "Constructor"
		case vscode.SymbolKind.Enum:
			return "Enum"
		case vscode.SymbolKind.Interface:
			return "Interface"
		case vscode.SymbolKind.Function:
			return "Function"
		case vscode.SymbolKind.Variable:
			return "Variable"
		case vscode.SymbolKind.Constant:
			return "Constant"
		case vscode.SymbolKind.String:
			return "String"
		case vscode.SymbolKind.Number:
			return "Number"
		case vscode.SymbolKind.Boolean:
			return "Boolean"
		case vscode.SymbolKind.Array:
			return "Array"
		case vscode.SymbolKind.Object:
			return "Object"
		case vscode.SymbolKind.Key:
			return "Key"
		case vscode.SymbolKind.Null:
			return "Null"
		case vscode.SymbolKind.EnumMember:
			return "EnumMember"
		case vscode.SymbolKind.Struct:
			return "Struct"
		case vscode.SymbolKind.Event:
			return "Event"
		case vscode.SymbolKind.Operator:
			return "Operator"
		case vscode.SymbolKind.TypeParameter:
			return "TypeParameter"
		default:
			return "Symbol"
	}
}

/**
 * Native tool for Language Server Protocol (LSP) code graph navigation.
 * Supports workspace symbol search, go-to-definition, and find references.
 */
export class CodeGraphTool extends BaseTool<"code_graph"> {
	readonly name = "code_graph" as const

	async execute(params: CodeGraphParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		const { action, query, path: relPath, line, character, symbol } = params

		try {
			if (!action) {
				task.consecutiveMistakeCount++
				task.recordToolError("code_graph")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("code_graph", "action"))
				return
			}

			task.consecutiveMistakeCount = 0

			switch (action) {
				case "workspace_symbols": {
					const searchQuery = query || symbol || ""
					if (!searchQuery) {
						task.consecutiveMistakeCount++
						task.recordToolError("code_graph")
						task.didToolFailInCurrentTurn = true
						pushToolResult(await task.sayAndCreateMissingParamError("code_graph", "query"))
						return
					}

					await task.say(
						"tool",
						JSON.stringify({
							tool: "code_graph",
							action: "workspace_symbols",
							query: searchQuery,
						}),
					)

					const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
						"vscode.executeWorkspaceSymbolProvider",
						searchQuery,
					)

					if (!symbols || symbols.length === 0) {
						pushToolResult(`No symbols found in workspace matching query "${searchQuery}".`)
						return
					}

					const maxResults = 35
					const truncated = symbols.slice(0, maxResults)
					const formatted = truncated
						.map((s) => {
							const rel = getReadablePath(task.cwd, s.location.uri.fsPath)
							const startLine = s.location.range.start.line + 1
							const kindStr = symbolKindToString(s.kind)
							const container = s.containerName ? ` (in ${s.containerName})` : ""
							return `- [${kindStr}] **${s.name}**${container} → \`${rel}:${startLine}\``
						})
						.join("\n")

					const countNotice =
						symbols.length > maxResults
							? `\n\n*(Showing top ${maxResults} of ${symbols.length} matching symbols)*`
							: ""

					pushToolResult(
						`Found ${symbols.length} symbol(s) matching "${searchQuery}":\n\n${formatted}${countNotice}`,
					)
					return
				}

				case "find_definitions": {
					if (!relPath) {
						// If path is omitted but symbol/query is given, fallback to workspace_symbols
						if (query || symbol) {
							const fallbackQuery = (symbol || query)!
							const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
								"vscode.executeWorkspaceSymbolProvider",
								fallbackQuery,
							)
							if (symbols && symbols.length > 0) {
								const formatted = symbols
									.slice(0, 20)
									.map((s) => {
										const rel = getReadablePath(task.cwd, s.location.uri.fsPath)
										const startLine = s.location.range.start.line + 1
										return `- **${s.name}** (${symbolKindToString(s.kind)}) in \`${rel}:${startLine}\``
									})
									.join("\n")
								pushToolResult(
									`Definition lookup for "${fallbackQuery}" (via workspace symbols):\n\n${formatted}`,
								)
								return
							}
						}
						task.consecutiveMistakeCount++
						task.recordToolError("code_graph")
						task.didToolFailInCurrentTurn = true
						pushToolResult(await task.sayAndCreateMissingParamError("code_graph", "path"))
						return
					}

					const fullPath = path.resolve(task.cwd, relPath)
					const fileUri = vscode.Uri.file(fullPath)

					let targetLine = typeof line === "number" ? Math.max(0, line - 1) : 0
					let targetChar = typeof character === "number" ? Math.max(0, character) : 0

					// If symbol is provided and character is not, find column offset in file
					if (symbol && character === undefined) {
						try {
							const fileContent = await fs.readFile(fullPath, "utf8")
							const lines = fileContent.split(/\r?\n/)
							if (typeof line === "number" && line - 1 < lines.length) {
								const lineText = lines[line - 1]
								const col = lineText.indexOf(symbol)
								if (col !== -1) {
									targetChar = col
								}
							} else {
								// Find the first line where symbol appears
								for (let i = 0; i < lines.length; i++) {
									const col = lines[i].indexOf(symbol)
									if (col !== -1) {
										targetLine = i
										targetChar = col
										break
									}
								}
							}
						} catch {
							// fallback to default targetLine/targetChar
						}
					}

					const position = new vscode.Position(targetLine, targetChar)

					await task.say(
						"tool",
						JSON.stringify({
							tool: "code_graph",
							action: "find_definitions",
							path: relPath,
							line: targetLine + 1,
							symbol,
						}),
					)

					const definitions = await vscode.commands.executeCommand<
						vscode.Location[] | vscode.Location | vscode.LocationLink[]
					>("vscode.executeDefinitionProvider", fileUri, position)

					if (!definitions) {
						pushToolResult(`No definition found for symbol at ${relPath}:${targetLine + 1}.`)
						return
					}

					const defArray: Array<{ uri: vscode.Uri; range: vscode.Range }> = Array.isArray(definitions)
						? definitions.map((d: any) => ({
								uri: d.targetUri || d.uri,
								range: d.targetRange || d.range,
							}))
						: [{ uri: (definitions as any).uri, range: (definitions as any).range }]

					if (defArray.length === 0 || !defArray[0].uri) {
						pushToolResult(`No definition found for symbol at ${relPath}:${targetLine + 1}.`)
						return
					}

					const results: string[] = []
					for (const def of defArray.slice(0, 10)) {
						const rel = getReadablePath(task.cwd, def.uri.fsPath)
						const defLine = def.range.start.line + 1
						let snippet = ""
						try {
							const content = await fs.readFile(def.uri.fsPath, "utf8")
							const lines = content.split(/\r?\n/)
							const start = Math.max(0, def.range.start.line - 1)
							const end = Math.min(lines.length, def.range.start.line + 4)
							snippet = lines
								.slice(start, end)
								.map((l, idx) => `  ${start + idx + 1} | ${l}`)
								.join("\n")
						} catch {
							// snippet optional
						}
						results.push(
							`- Defined in \`${rel}:${defLine}\`:\n\`\`\`\n${snippet || `Line ${defLine}`}\n\`\`\``,
						)
					}

					pushToolResult(`Found ${defArray.length} definition(s):\n\n${results.join("\n\n")}`)
					return
				}

				case "find_references": {
					if (!relPath) {
						task.consecutiveMistakeCount++
						task.recordToolError("code_graph")
						task.didToolFailInCurrentTurn = true
						pushToolResult(await task.sayAndCreateMissingParamError("code_graph", "path"))
						return
					}

					const fullPath = path.resolve(task.cwd, relPath)
					const fileUri = vscode.Uri.file(fullPath)

					let targetLine = typeof line === "number" ? Math.max(0, line - 1) : 0
					let targetChar = typeof character === "number" ? Math.max(0, character) : 0

					if (symbol && character === undefined) {
						try {
							const fileContent = await fs.readFile(fullPath, "utf8")
							const lines = fileContent.split(/\r?\n/)
							if (typeof line === "number" && line - 1 < lines.length) {
								const lineText = lines[line - 1]
								const col = lineText.indexOf(symbol)
								if (col !== -1) {
									targetChar = col
								}
							} else {
								for (let i = 0; i < lines.length; i++) {
									const col = lines[i].indexOf(symbol)
									if (col !== -1) {
										targetLine = i
										targetChar = col
										break
									}
								}
							}
						} catch {
							// fallback
						}
					}

					const position = new vscode.Position(targetLine, targetChar)

					await task.say(
						"tool",
						JSON.stringify({
							tool: "code_graph",
							action: "find_references",
							path: relPath,
							line: targetLine + 1,
							symbol,
						}),
					)

					const references = await vscode.commands.executeCommand<vscode.Location[]>(
						"vscode.executeReferenceProvider",
						fileUri,
						position,
					)

					if (!references || references.length === 0) {
						pushToolResult(`No references found for symbol at ${relPath}:${targetLine + 1}.`)
						return
					}

					const maxResults = 50
					const formatted = references
						.slice(0, maxResults)
						.map((ref) => {
							const rel = getReadablePath(task.cwd, ref.uri.fsPath)
							const refLine = ref.range.start.line + 1
							const refCol = ref.range.start.character + 1
							return `- \`${rel}:${refLine}:${refCol}\``
						})
						.join("\n")

					const countNotice =
						references.length > maxResults
							? `\n\n*(Showing top ${maxResults} of ${references.length} references)*`
							: ""

					pushToolResult(`Found ${references.length} reference(s):\n\n${formatted}${countNotice}`)
					return
				}

				default: {
					pushToolResult(
						`Unknown code_graph action: "${action}". Valid actions are: "workspace_symbols", "find_definitions", "find_references".`,
					)
					return
				}
			}
		} catch (error: any) {
			await handleError("code_graph", error)
			pushToolResult(formatResponse.toolError(error?.message || "LSP command execution failed"))
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"code_graph">): Promise<void> {
		// Partial streaming updates
	}
}

export const codeGraphTool = new CodeGraphTool()
