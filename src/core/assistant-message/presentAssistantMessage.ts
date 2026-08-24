import { serializeError } from "serialize-error"
import { Anthropic } from "@anthropic-ai/sdk"

import { MirrorVSEventName, type ToolName, type MirrorAsk, type ToolProgressStatus } from "@mirror-vs/types"
import { customToolRegistry } from "@mirror-vs/core"

import { t } from "../../i18n"

import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import type { ToolParamName, ToolResponse, ToolUse, McpToolUse } from "../../shared/tools"
import { RECOVERY_STRATEGIES } from "../task/TaskMainLoop"

import { AskIgnoredError } from "../task/AskIgnoredError"
import { Task } from "../task/Task"

import { listFilesTool } from "../tools/ListFilesTool"
import { readFileTool } from "../tools/ReadFileTool"
import { readCommandOutputTool } from "../tools/ReadCommandOutputTool"
import { writeToFileTool } from "../tools/WriteToFileTool"
import { editTool } from "../tools/EditTool"
import { searchReplaceTool } from "../tools/SearchReplaceTool"
import { editFileTool } from "../tools/EditFileTool"
import { applyPatchTool } from "../tools/ApplyPatchTool"
import { searchFilesTool } from "../tools/SearchFilesTool"
import { executeCommandTool } from "../tools/ExecuteCommandTool"
import { sshSessionTool } from "../tools/SshSessionTool"
import { useMcpToolTool } from "../tools/UseMcpToolTool"
import { accessMcpResourceTool } from "../tools/accessMcpResourceTool"
import { askFollowupQuestionTool } from "../tools/AskFollowupQuestionTool"
import { switchModeTool } from "../tools/SwitchModeTool"
import { attemptCompletionTool, AttemptCompletionCallbacks } from "../tools/AttemptCompletionTool"
import { newTaskTool } from "../tools/NewTaskTool"
import { updateTodoListTool } from "../tools/UpdateTodoListTool"
import { runSlashCommandTool } from "../tools/RunSlashCommandTool"
import { skillTool } from "../tools/SkillTool"
import { generateImageTool } from "../tools/GenerateImageTool"
import { applyDiffTool as applyDiffToolClass } from "../tools/ApplyDiffTool"
import { getWorkspaceFileTreeTool } from "../tools/GetWorkspaceFileTreeTool"
import { getWorkspacePulseTool } from "../tools/GetWorkspacePulseTool"
import { getGitStatusTool } from "../tools/GetGitStatusTool"
import { readSessionContextTool } from "../tools/ReadSessionContextTool"
import { searchMcpToolsTool } from "../tools/SearchMcpToolsTool"
import { activateMcpToolTool } from "../tools/ActivateMcpToolTool"
import { isValidToolName, validateToolUse } from "../tools/validateToolUse"
import { codebaseSearchTool } from "../tools/CodebaseSearchTool"
import {
	browserNavigateTool,
	browserClickTool,
	browserTypeTool,
	browserScreenshotTool,
	browserScrollTool,
	browserSelectTool,
	browserEvaluateScriptTool,
	renderPreviewTool,
} from "../tools/BrowserTools"
import { webSearchTool } from "../tools/WebSearchTool"
import { gitHubSearchTool } from "../tools/GitHubSearchTool"
import { docsSearchTool } from "../tools/DocsSearchTool"
import { packageSearchTool } from "../tools/PackageSearchTool"
import { readUrlTool } from "../tools/ReadUrlTool"
import { sleepTool } from "../tools/SleepTool"
import { checkpointSave } from "../checkpoints"

import { formatResponse } from "../prompts/responses"
import { sanitizeToolUseId } from "../../utils/tool-id"

/**
 * Set of read-only tool names that are safe to execute in parallel.
 * These tools do not mutate state and can be run concurrently without
 * risk of data races or double-checkpoints.
 */
const READ_TOOLS = new Set([
	"read_file",
	"search_files",
	"list_files",
	"web_search",
	"github_search",
	"docs_search",
	"package_search",
	"codebase_search",
	"read_url",
	"sleep",
	"get_workspace_file_tree",
	"get_workspace_pulse",
	"get_git_status",
	"read_session_context",
	"read_command_output",
])

/**
 * Error thrown when a mixed read/write tool batch is attempted.
 * The orchestrator uses this to reject batches that cannot be safely
 * parallelised.
 */
class ToolCannonError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolCannonError"
	}
}

/**
 * Exponential backoff sleep helper.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Lookup map from tool name → tool handler instance for read-only tools.
 * Used by the parallel read batching path to dispatch tools without
 * the normal switch/case chain.
 */
const READ_TOOL_MAP: Record<string, { handle: (task: Task, block: any, callbacks: any) => Promise<void> }> = {
	read_file: readFileTool,
	search_files: searchFilesTool,
	list_files: listFilesTool,
	web_search: webSearchTool,
	github_search: gitHubSearchTool,
	docs_search: docsSearchTool,
	package_search: packageSearchTool,
	codebase_search: codebaseSearchTool,
	read_url: readUrlTool,
	get_workspace_file_tree: getWorkspaceFileTreeTool,
	get_workspace_pulse: getWorkspacePulseTool,
	get_git_status: getGitStatusTool,
	read_session_context: readSessionContextTool,
	read_command_output: readCommandOutputTool,
}

/**
 * Processes and presents assistant message content to the user interface.
 *
 * This function is the core message handling system that:
 * - Sequentially processes content blocks from the assistant's response.
 * - Displays text content to the user.
 * - Executes tool use requests with appropriate user approval.
 * - Manages the flow of conversation by determining when to proceed to the next content block.
 * - Coordinates file system checkpointing for modified files.
 * - Controls the conversation state to determine when to continue to the next request.
 *
 * The function uses a locking mechanism to prevent concurrent execution and handles
 * partial content blocks during streaming. It's designed to work with the streaming
 * API response pattern, where content arrives incrementally and needs to be processed
 * as it becomes available.
 */

export async function presentAssistantMessage(mirror: Task) {
	if (mirror.abort) {
		throw new Error(`[Task#presentAssistantMessage] task ${mirror.taskId}.${mirror.instanceId} aborted`)
	}

	if (mirror.presentAssistantMessageLocked) {
		mirror.presentAssistantMessageHasPendingUpdates = true
		return
	}

	mirror.presentAssistantMessageLocked = true
	mirror.presentAssistantMessageHasPendingUpdates = false

	if (mirror.currentStreamingContentIndex >= mirror.assistantMessageContent.length) {
		// This may happen if the last content block was completed before
		// streaming could finish. If streaming is finished, and we're out of
		// bounds then this means we already  presented/executed the last
		// content block and are ready to continue to next request.
		if (mirror.didCompleteReadingStream) {
			mirror.userMessageContentReady = true
		}

		mirror.presentAssistantMessageLocked = false
		return
	}

	let block: any
	try {
		// Performance optimization: Use shallow copy instead of deep clone.
		// The block is used read-only throughout this function - we never mutate its properties.
		// We only need to protect against the reference changing during streaming, not nested mutations.
		// This provides 80-90% reduction in cloning overhead (5-100ms saved per block).
		block = { ...mirror.assistantMessageContent[mirror.currentStreamingContentIndex] }
	} catch (error) {
		console.error(`ERROR cloning block:`, error)
		console.error(
			`Block content:`,
			JSON.stringify(mirror.assistantMessageContent[mirror.currentStreamingContentIndex], null, 2),
		)
		mirror.presentAssistantMessageLocked = false
		return
	}

	switch (block.type) {
		case "mcp_tool_use": {
			// Handle native MCP tool calls (from mcp_serverName_toolName dynamic tools)
			// These are converted to the same execution path as use_mcp_tool but preserve
			// their original name in API history
			const mcpBlock = block as McpToolUse

			if (mirror.didRejectTool) {
				// For native protocol, we must send a tool_result for every tool_use to avoid API errors
				const toolCallId = mcpBlock.id
				const errorMessage = !mcpBlock.partial
					? `Skipping MCP tool ${mcpBlock.name} due to user rejecting a previous tool.`
					: `MCP tool ${mcpBlock.name} was interrupted and not executed due to user rejecting a previous tool.`

				if (toolCallId) {
					mirror.pushToolResultToUserContent({
						type: "tool_result",
						tool_use_id: sanitizeToolUseId(toolCallId),
						content: errorMessage,
						is_error: true,
					})
				}
				break
			}

			// Track if we've already pushed a tool result
			let hasToolResult = false
			const toolCallId = mcpBlock.id

			// Store approval feedback to merge into tool result (GitHub #10465)
			let approvalFeedback: { text: string; images?: string[] } | undefined

			const pushToolResult = (content: ToolResponse, feedbackImages?: string[]) => {
				if (hasToolResult) {
					console.warn(
						`[presentAssistantMessage] Skipping duplicate tool_result for mcp_tool_use: ${toolCallId}`,
					)
					return
				}

				let resultContent: string
				let imageBlocks: Anthropic.ImageBlockParam[] = []

				if (typeof content === "string") {
					resultContent = content || "(tool did not return anything)"
				} else {
					const textBlocks = content.filter((item) => item.type === "text")
					imageBlocks = content.filter((item) => item.type === "image") as Anthropic.ImageBlockParam[]
					resultContent =
						textBlocks.map((item) => (item as Anthropic.TextBlockParam).text).join("\n") ||
						"(tool did not return anything)"
				}

				// Merge approval feedback into tool result (GitHub #10465)
				if (approvalFeedback) {
					const feedbackText = formatResponse.toolApprovedWithFeedback(approvalFeedback.text)
					resultContent = `${feedbackText}\n\n${resultContent}`

					// Add feedback images to the image blocks
					if (approvalFeedback.images) {
						const feedbackImageBlocks = formatResponse.imageBlocks(approvalFeedback.images)
						imageBlocks = [...feedbackImageBlocks, ...imageBlocks]
					}
				}

				if (toolCallId) {
					mirror.pushToolResultToUserContent({
						type: "tool_result",
						tool_use_id: sanitizeToolUseId(toolCallId),
						content: resultContent,
					})

					if (imageBlocks.length > 0) {
						mirror.userMessageContent.push(...imageBlocks)
					}
				}

				hasToolResult = true
			}

			const toolDescription = () => `[mcp_tool: ${mcpBlock.serverName}/${mcpBlock.toolName}]`

			const askApproval = async (
				type: MirrorAsk,
				partialMessage?: string,
				progressStatus?: ToolProgressStatus,
				isProtected?: boolean,
			) => {
				const { response, text, images } = await mirror.ask(
					type,
					partialMessage,
					false,
					progressStatus,
					isProtected || false,
				)

				if (response !== "yesButtonClicked") {
					if (text) {
						await mirror.say("user_feedback", text, images)
						pushToolResult(formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images))
					} else {
						pushToolResult(formatResponse.toolDenied())
					}
					mirror.didRejectTool = true
					return false
				}

				// Store approval feedback to be merged into tool result (GitHub #10465)
				// Don't push it as a separate tool_result here - that would create duplicates.
				// The tool will call pushToolResult, which will merge the feedback into the actual result.
				if (text) {
					await mirror.say("user_feedback", text, images)
					approvalFeedback = { text, images }
				}

				return true
			}

			const handleError = async (action: string, error: Error) => {
				// Silently ignore AskIgnoredError - this is an internal control flow
				// signal, not an actual error. It occurs when a newer ask supersedes an older one.
				if (error instanceof AskIgnoredError) {
					return
				}
				const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`
				await mirror.say(
					"error",
					`Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
				)
				pushToolResult(formatResponse.toolError(errorString))
			}

			if (!mcpBlock.partial) {
				mirror.recordToolUsage("use_mcp_tool")
			}

			// Resolve sanitized server name back to original server name
			// The serverName from parsing is sanitized (e.g., "my_server" from "my server")
			// We need the original name to find the actual MCP connection
			const mcpHub = mirror.providerRef.deref()?.getMcpHub()
			let resolvedServerName = mcpBlock.serverName
			if (mcpHub) {
				const originalName = mcpHub.findServerNameBySanitizedName(mcpBlock.serverName)
				if (originalName) {
					resolvedServerName = originalName
				}
			}

			// Execute the MCP tool using the same handler as use_mcp_tool
			// Create a synthetic ToolUse block that the useMcpToolTool can handle
			const syntheticToolUse: ToolUse<"use_mcp_tool"> = {
				type: "tool_use",
				id: mcpBlock.id,
				name: "use_mcp_tool",
				params: {
					server_name: resolvedServerName,
					tool_name: mcpBlock.toolName,
					arguments: JSON.stringify(mcpBlock.arguments),
				},
				partial: mcpBlock.partial,
				nativeArgs: {
					server_name: resolvedServerName,
					tool_name: mcpBlock.toolName,
					arguments: mcpBlock.arguments,
				},
			}

			await useMcpToolTool.handle(mirror, syntheticToolUse, {
				askApproval,
				handleError,
				pushToolResult,
			})
			break
		}
		case "text": {
			if (mirror.didRejectTool || mirror.didAlreadyUseTool) {
				break
			}

			let content = block.content

			if (content) {
				// Have to do this for partial and complete since sending
				// content in thinking tags to markdown renderer will
				// automatically be removed.
				// Strip any streamed <thinking> tags from text output.
				content = content.replace(/<thinking>\s?/g, "")
				content = content.replace(/\s?<\/thinking>/g, "")
			}

			await mirror.say("text", content, undefined, block.partial)
			break
		}
		case "tool_use": {
			// Native tool calling is the only supported tool calling mechanism.
			// A tool_use block without an id is invalid and cannot be executed.
			const toolCallId = (block as any).id as string | undefined
			if (!toolCallId) {
				const errorMessage =
					"Invalid tool call: missing tool_use.id. XML tool calls are no longer supported. Remove any XML tool markup (e.g. <read_file>...</read_file>) and use native tool calling instead."
				// Record a tool error for visibility. Use the reported tool name if present.
				try {
					if (
						typeof (mirror as any).recordToolError === "function" &&
						typeof (block as any).name === "string"
					) {
						;(mirror as any).recordToolError((block as any).name as ToolName, errorMessage)
					}
				} catch {
					// Best-effort only
				}
				mirror.consecutiveMistakeCount++
				await mirror.say("error", errorMessage)
				mirror.userMessageContent.push({ type: "text", text: errorMessage })
				mirror.didAlreadyUseTool = true
				break
			}

			// Fetch state early so it's available for toolDescription and validation
			const state = await mirror.providerRef.deref()?.getState()
			const { mode, customModes, experiments: stateExperiments, disabledTools } = state ?? {}

			const toolDescription = (): string => {
				switch (block.name) {
					case "execute_command":
						return `[${block.name} for '${block.params.command}']`
					case "read_file":
						// Prefer native typed args when available; fall back to legacy params
						// Check if nativeArgs exists (native protocol)
						if (block.nativeArgs) {
							return readFileTool.getReadFileToolDescription(block.name, block.nativeArgs)
						}
						return readFileTool.getReadFileToolDescription(block.name, block.params)
					case "write_to_file":
						return `[${block.name} for '${block.params.path}']`
					case "apply_diff":
						// Native-only: tool args are structured (no XML payloads).
						return block.params?.path ? `[${block.name} for '${block.params.path}']` : `[${block.name}]`
					case "search_files":
						return `[${block.name} for '${block.params.regex}'${
							block.params.file_pattern ? ` in '${block.params.file_pattern}'` : ""
						}]`
					case "edit":
					case "search_and_replace":
						return `[${block.name} for '${block.params.file_path}']`
					case "search_replace":
						return `[${block.name} for '${block.params.file_path}']`
					case "edit_file":
						return `[${block.name} for '${block.params.file_path}']`
					case "apply_patch":
						return `[${block.name}]`
					case "list_files":
						return `[${block.name} for '${block.params.path}']`
					case "use_mcp_tool":
						return `[${block.name} for '${block.params.server_name}']`
					case "access_mcp_resource":
						return `[${block.name} for '${block.params.server_name}']`
					case "ask_followup_question":
						return `[${block.name} for '${block.params.question}']`
					case "attempt_completion":
						return `[${block.name}]`
					case "switch_mode":
						return `[${block.name} to '${block.params.mode_slug}'${block.params.reason ? ` because: ${block.params.reason}` : ""}]`
					case "search_mcp_tools":
						return `[${block.name}${block.params?.query ? ` for '${block.params.query}'` : ""}]`
					case "activate_mcp_tool":
						return `[${block.name} for '${block.params?.tool_name}' on '${block.params?.server_name}']`
					case "codebase_search":
						return `[${block.name} for '${block.params.query}']`
					case "read_command_output":
						return `[${block.name} for '${block.params.artifact_id}']`
					case "update_todo_list":
						return `[${block.name}]`
					case "new_task": {
						const mode = block.params.mode ?? defaultModeSlug
						const message = block.params.message ?? "(no message)"
						const modeName = getModeBySlug(mode, customModes)?.name ?? mode
						return `[${block.name} in ${modeName} mode: '${message}']`
					}
					case "run_slash_command":
						return `[${block.name} for '${block.params.command}'${block.params.args ? ` with args: ${block.params.args}` : ""}]`
					case "skill":
						return `[${block.name} for '${block.params.skill}'${block.params.args ? ` with args: ${block.params.args}` : ""}]`
					case "generate_image":
						return `[${block.name} for '${block.params.path}']`
					case "get_workspace_file_tree":
						return `[${block.name}]`
					case "get_workspace_pulse":
						return `[${block.name}]`
					case "get_git_status":
						return `[${block.name}${block.nativeArgs?.maxFiles ? ` (max ${block.nativeArgs.maxFiles} files)` : ""}]`
					case "read_session_context":
						return `[${block.name}${block.nativeArgs?.scope ? ` (${block.nativeArgs.scope})` : ""}]`
					default:
						return `[${block.name}]`
				}
			}

			if (mirror.didRejectTool) {
				// Ignore any tool content after user has rejected tool once.
				// For native tool calling, we must send a tool_result for every tool_use to avoid API errors
				const errorMessage = !block.partial
					? `Skipping tool ${toolDescription()} due to user rejecting a previous tool.`
					: `Tool ${toolDescription()} was interrupted and not executed due to user rejecting a previous tool.`

				mirror.pushToolResultToUserContent({
					type: "tool_result",
					tool_use_id: sanitizeToolUseId(toolCallId),
					content: errorMessage,
					is_error: true,
				})

				break
			}

			// Track if we've already pushed a tool result for this tool call (native tool calling only)
			let hasToolResult = false

			// If this is a native tool call but the parser couldn't construct nativeArgs
			// (e.g., malformed/unfinished JSON in a streaming tool call), we must NOT attempt to
			// execute the tool. Instead, emit exactly one structured tool_result so the provider
			// receives a matching tool_result for the tool_use_id.
			//
			// This avoids executing an invalid tool_use block and prevents duplicate/fragmented
			// error reporting.
			if (!block.partial) {
				const customTool = stateExperiments?.customTools ? customToolRegistry.get(block.name) : undefined
				const isKnownTool = isValidToolName(String(block.name), stateExperiments)
				if (isKnownTool && !block.nativeArgs && !customTool) {
					const errorMessage =
						`Invalid tool call for '${block.name}': missing nativeArgs. ` +
						`This usually means the model streamed invalid or incomplete arguments and the call could not be finalized.`

					mirror.consecutiveMistakeCount++
					try {
						mirror.recordToolError(block.name as ToolName, errorMessage)
					} catch {
						// Best-effort only
					}

					// Push tool_result directly without setting didAlreadyUseTool so streaming can
					// continue gracefully.
					mirror.pushToolResultToUserContent({
						type: "tool_result",
						tool_use_id: sanitizeToolUseId(toolCallId),
						content: formatResponse.toolError(errorMessage),
						is_error: true,
					})

					break
				}
			}

			// Store approval feedback to merge into tool result (GitHub #10465)
			let approvalFeedback: { text: string; images?: string[] } | undefined

			const pushToolResult = (content: ToolResponse) => {
				// Native tool calling: only allow ONE tool_result per tool call
				if (hasToolResult) {
					console.warn(
						`[presentAssistantMessage] Skipping duplicate tool_result for tool_use_id: ${toolCallId}`,
					)
					return
				}

				let resultContent: string
				let imageBlocks: Anthropic.ImageBlockParam[] = []

				if (typeof content === "string") {
					resultContent = content || "(tool did not return anything)"
				} else {
					const textBlocks = content.filter((item) => item.type === "text")
					imageBlocks = content.filter((item) => item.type === "image") as Anthropic.ImageBlockParam[]
					resultContent =
						textBlocks.map((item) => (item as Anthropic.TextBlockParam).text).join("\n") ||
						"(tool did not return anything)"
				}

				// Merge approval feedback into tool result (GitHub #10465)
				if (approvalFeedback) {
					const feedbackText = formatResponse.toolApprovedWithFeedback(approvalFeedback.text)
					resultContent = `${feedbackText}\n\n${resultContent}`
					if (approvalFeedback.images) {
						const feedbackImageBlocks = formatResponse.imageBlocks(approvalFeedback.images)
						imageBlocks = [...feedbackImageBlocks, ...imageBlocks]
					}
				}

				mirror.pushToolResultToUserContent({
					type: "tool_result",
					tool_use_id: sanitizeToolUseId(toolCallId),
					content: resultContent,
				})

				if (imageBlocks.length > 0) {
					mirror.userMessageContent.push(...imageBlocks)
				}

				hasToolResult = true
			}

			const askApproval = async (
				type: MirrorAsk,
				partialMessage?: string,
				progressStatus?: ToolProgressStatus,
				isProtected?: boolean,
			) => {
				const { response, text, images } = await mirror.ask(
					type,
					partialMessage,
					false,
					progressStatus,
					isProtected || false,
				)

				if (response !== "yesButtonClicked") {
					// Handle both messageResponse and noButtonClicked with text.
					if (text) {
						await mirror.say("user_feedback", text, images)
						pushToolResult(formatResponse.toolResult(formatResponse.toolDeniedWithFeedback(text), images))
					} else {
						pushToolResult(formatResponse.toolDenied())
					}
					mirror.didRejectTool = true
					return false
				}

				// Store approval feedback to be merged into tool result (GitHub #10465)
				// Don't push it as a separate tool_result here - that would create duplicates.
				// The tool will call pushToolResult, which will merge the feedback into the actual result.
				if (text) {
					await mirror.say("user_feedback", text, images)
					approvalFeedback = { text, images }
				}

				return true
			}

			const askFinishSubTaskApproval = async () => {
				// Ask the user to approve this task has completed, and he has
				// reviewed it, and we can declare task is finished and return
				// control to the parent task to continue running the rest of
				// the sub-tasks.
				const toolMessage = JSON.stringify({ tool: "finishTask" })
				return await askApproval("tool", toolMessage)
			}

			const handleError = async (action: string, error: Error) => {
				// Silently ignore AskIgnoredError - this is an internal control flow
				// signal, not an actual error. It occurs when a newer ask supersedes an older one.
				if (error instanceof AskIgnoredError) {
					return
				}

				// ── Auto-Recovery: Check Struggle Ledger strategies ──────────
				// Attempt to recover from known mistake patterns before falling
				// through to the generic error path.
				const errorMsg = error.message ?? ""
				const toolArgs = {
					...(block.params ?? {}),
					...(block.nativeArgs ?? {}),
				}
				for (const [, strategy] of Object.entries(RECOVERY_STRATEGIES)) {
					if (strategy.pattern.test(errorMsg)) {
						try {
							const recovery = await strategy.action(
								errorMsg,
								block.name as string,
								toolArgs as Record<string, unknown>,
								mirror.struggleLedger,
							)

							if (recovery.type === "escalate") {
								// Hard-abort: double-failure of the same pattern.
								mirror.consecutiveMistakeCount++
								const recoveryError = `[Recovery Failed] ${recovery.message}`
								await mirror.say("error", recoveryError)
								pushToolResult(formatResponse.toolError(recoveryError))
								return
							}

							if (recovery.type === "retry") {
								// Successful auto-recovery: feed the corrected info back.
								mirror.struggleLedger.resolve("file_not_found")
								const recoveryMsg = `[Auto-Recovery] ${recovery.message}`
								// Log it so the model sees the correction
								await mirror.say("error", recoveryMsg)
								// Emit telemetry event — schema: z.tuple([z.string(), toolNamesSchema, z.string()])
								mirror.emit(
									MirrorVSEventName.TaskToolFailed,
									mirror.taskId,
									block.name as ToolName,
									recoveryMsg,
								)
								pushToolResult(recoveryMsg)
								return
							}
						} catch {
							// If recovery itself throws, fall through to generic error
						}
						break // Only try the first matching strategy
					}
				}
				// ── End Auto-Recovery ───────────────────────────────────────

				const errorString = `Error ${action}: ${JSON.stringify(serializeError(error))}`

				await mirror.say(
					"error",
					`Error ${action}:\n${error.message ?? JSON.stringify(serializeError(error), null, 2)}`,
				)

				pushToolResult(formatResponse.toolError(errorString))
			}

			if (!block.partial) {
				// Check if this is a custom tool - if so, record as "custom_tool" (like MCP tools)
				const isCustomTool = stateExperiments?.customTools && customToolRegistry.has(block.name)
				const recordName = isCustomTool ? "custom_tool" : block.name
				mirror.recordToolUsage(recordName)
			}

			// Validate tool use before execution - ONLY for complete (non-partial) blocks.
			// Validating partial blocks would cause validation errors to be thrown repeatedly
			// during streaming, pushing multiple tool_results for the same tool_use_id and
			// potentially causing the stream to appear frozen.
			if (!block.partial) {
				const modelInfo = mirror.api.getModel()
				// Resolve aliases in includedTools before validation
				// e.g., "edit_file" should resolve to "apply_diff"
				const rawIncludedTools = modelInfo?.info?.includedTools
				const { resolveToolAlias } = await import("../prompts/tools/filter-tools-for-mode")
				const includedTools = rawIncludedTools?.map((tool) => resolveToolAlias(tool))

				try {
					const toolRequirements =
						disabledTools?.reduce(
							(acc: Record<string, boolean>, tool: string) => {
								acc[tool] = false
								const resolvedToolName = resolveToolAlias(tool)
								acc[resolvedToolName] = false
								return acc
							},
							{} as Record<string, boolean>,
						) ?? {}

					validateToolUse(
						block.name as ToolName,
						mode ?? defaultModeSlug,
						customModes ?? [],
						toolRequirements,
						block.params,
						stateExperiments,
						includedTools,
					)
				} catch (error) {
					mirror.consecutiveMistakeCount++
					// For validation errors (unknown tool, tool not allowed for mode), we need to:
					// 1. Send a tool_result with the error (required for native tool calling)
					// 2. NOT set didAlreadyUseTool = true (the tool was never executed, just failed validation)
					// This prevents the stream from being interrupted with "Response interrupted by tool use result"
					// which would cause the extension to appear to hang
					const errorContent = formatResponse.toolError(error.message)
					// Push tool_result directly without setting didAlreadyUseTool
					mirror.pushToolResultToUserContent({
						type: "tool_result",
						tool_use_id: sanitizeToolUseId(toolCallId),
						content: typeof errorContent === "string" ? errorContent : "(validation error)",
						is_error: true,
					})

					break
				}
			}

			// Check for identical consecutive tool calls.
			if (!block.partial) {
				// Use the detector to check for repetition, passing the ToolUse
				// block directly.
				const repetitionCheck = mirror.toolRepetitionDetector.check(block)

				// If execution is not allowed, notify user and break.
				if (!repetitionCheck.allowExecution && repetitionCheck.askUser) {
					// Handle repetition similar to mistake_limit_reached pattern.
					const { response, text, images } = await mirror.ask(
						repetitionCheck.askUser.messageKey as MirrorAsk,
						repetitionCheck.askUser.messageDetail.replace("{toolName}", block.name),
					)

					if (response === "messageResponse") {
						// Add user feedback to userContent.
						mirror.userMessageContent.push(
							{
								type: "text" as const,
								text: `Tool repetition limit reached. User feedback: ${text}`,
							},
							...formatResponse.imageBlocks(images),
						)

						// Add user feedback to chat.
						await mirror.say("user_feedback", text, images)
					}

					// Return tool result message about the repetition
					pushToolResult(
						formatResponse.toolError(
							`Tool call repetition limit reached for ${block.name}. Please try a different approach.`,
						),
					)
					break
				}
			}

			// --- Parallel Read Batching ---
			// When the parallelToolReads experiment is enabled, scan ahead for
			// consecutive non-partial read-only tool blocks and execute them all
			// at once via Promise.all. This gives a 2-5x speedup on read-heavy
			// turns without risking data races (reads are idempotent).
			if (stateExperiments?.parallelToolReads && !block.partial && READ_TOOLS.has(block.name)) {
				await executeReadBatch(mirror, block, toolCallId, {
					pushToolResult,
					handleError,
					askApproval,
				})
				break
			}

			switch (block.name) {
				case "write_to_file":
					await checkpointSaveAndMark(mirror)
					await writeToFileTool.handle(mirror, block as ToolUse<"write_to_file">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "update_todo_list":
					await updateTodoListTool.handle(mirror, block as ToolUse<"update_todo_list">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "apply_diff":
					await checkpointSaveAndMark(mirror)
					await applyDiffToolClass.handle(mirror, block as ToolUse<"apply_diff">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "edit":
				case "search_and_replace":
					await checkpointSaveAndMark(mirror)
					await editTool.handle(mirror, block as ToolUse<"edit">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "search_replace":
					await checkpointSaveAndMark(mirror)
					await searchReplaceTool.handle(mirror, block as ToolUse<"search_replace">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "edit_file":
					await checkpointSaveAndMark(mirror)
					await editFileTool.handle(mirror, block as ToolUse<"edit_file">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "apply_patch":
					await checkpointSaveAndMark(mirror)
					await applyPatchTool.handle(mirror, block as ToolUse<"apply_patch">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					recordFileEdit(mirror, block)
					break
				case "read_file":
					// Type assertion is safe here because we're in the "read_file" case
					await readFileTool.handle(mirror, block as ToolUse<"read_file">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "list_files":
					await listFilesTool.handle(mirror, block as ToolUse<"list_files">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "codebase_search":
					await codebaseSearchTool.handle(mirror, block as ToolUse<"codebase_search">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "search_files":
					await searchFilesTool.handle(mirror, block as ToolUse<"search_files">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "execute_command":
					await executeCommandTool.handle(mirror, block as ToolUse<"execute_command">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "ssh_session":
					await sshSessionTool.handle(mirror, block as ToolUse<"ssh_session">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "sleep":
					await sleepTool.handle(mirror, block as ToolUse<"sleep">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "read_command_output":
					await readCommandOutputTool.handle(mirror, block as ToolUse<"read_command_output">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "use_mcp_tool":
					await useMcpToolTool.handle(mirror, block as ToolUse<"use_mcp_tool">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "access_mcp_resource":
					await accessMcpResourceTool.handle(mirror, block as ToolUse<"access_mcp_resource">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "ask_followup_question":
					await askFollowupQuestionTool.handle(mirror, block as ToolUse<"ask_followup_question">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "switch_mode":
					await switchModeTool.handle(mirror, block as ToolUse<"switch_mode">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "search_mcp_tools":
					await searchMcpToolsTool.handle(mirror, block as ToolUse<"search_mcp_tools">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "activate_mcp_tool":
					await activateMcpToolTool.handle(mirror, block as ToolUse<"activate_mcp_tool">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "new_task":
					await checkpointSaveAndMark(mirror)
					await newTaskTool.handle(mirror, block as ToolUse<"new_task">, {
						askApproval,
						handleError,
						pushToolResult,
						toolCallId: block.id,
					})
					break
				case "attempt_completion": {
					const completionCallbacks: AttemptCompletionCallbacks = {
						askApproval,
						handleError,
						pushToolResult,
						askFinishSubTaskApproval,
						toolDescription,
					}
					await attemptCompletionTool.handle(
						mirror,
						block as ToolUse<"attempt_completion">,
						completionCallbacks,
					)
					break
				}
				case "run_slash_command":
					await runSlashCommandTool.handle(mirror, block as ToolUse<"run_slash_command">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "skill":
					await skillTool.handle(mirror, block as ToolUse<"skill">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "generate_image":
					await checkpointSaveAndMark(mirror)
					await generateImageTool.handle(mirror, block as ToolUse<"generate_image">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_navigate":
					await browserNavigateTool.handle(mirror, block as ToolUse<"browser_navigate">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_click":
					await browserClickTool.handle(mirror, block as ToolUse<"browser_click">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_type":
					await browserTypeTool.handle(mirror, block as ToolUse<"browser_type">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_screenshot":
					await browserScreenshotTool.handle(mirror, block as ToolUse<"browser_screenshot">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_scroll":
					await browserScrollTool.handle(mirror, block as ToolUse<"browser_scroll">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_select":
					await browserSelectTool.handle(mirror, block as ToolUse<"browser_select">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "browser_evaluate_script":
					await browserEvaluateScriptTool.handle(mirror, block as ToolUse<"browser_evaluate_script">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "render_preview":
					await renderPreviewTool.handle(mirror, block as ToolUse<"render_preview">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "web_search":
					await webSearchTool.handle(mirror, block as ToolUse<"web_search">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "github_search":
					await gitHubSearchTool.handle(mirror, block as ToolUse<"github_search">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "docs_search":
					await docsSearchTool.handle(mirror, block as ToolUse<"docs_search">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "package_search":
					await packageSearchTool.handle(mirror, block as ToolUse<"package_search">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "read_url":
					await readUrlTool.handle(mirror, block as ToolUse<"read_url">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "get_workspace_file_tree":
					await getWorkspaceFileTreeTool.handle(mirror, block as ToolUse<"get_workspace_file_tree">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "get_workspace_pulse":
					await getWorkspacePulseTool.handle(mirror, block as ToolUse<"get_workspace_pulse">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "read_session_context":
					await readSessionContextTool.handle(mirror, block as ToolUse<"read_session_context">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				case "get_git_status":
					await getGitStatusTool.handle(mirror, block as ToolUse<"get_git_status">, {
						askApproval,
						handleError,
						pushToolResult,
					})
					break
				default: {
					// Handle unknown/invalid tool names OR custom tools
					// This is critical for native tool calling where every tool_use MUST have a tool_result

					// CRITICAL: Don't process partial blocks for unknown tools - just let them stream in.
					// If we try to show errors for partial blocks, we'd show the error on every streaming chunk,
					// creating a loop that appears to freeze the extension. Only handle complete blocks.
					if (block.partial) {
						break
					}

					const customTool = stateExperiments?.customTools ? customToolRegistry.get(block.name) : undefined

					if (customTool) {
						try {
							let customToolArgs

							if (customTool.parameters) {
								try {
									customToolArgs = customTool.parameters.parse(block.nativeArgs || block.params || {})
								} catch (parseParamsError) {
									const message = `Custom tool "${block.name}" argument validation failed: ${parseParamsError.message}`
									console.error(message)
									mirror.consecutiveMistakeCount++
									await mirror.say("error", message)
									pushToolResult(formatResponse.toolError(message))
									break
								}
							}

							const result = await customTool.execute(customToolArgs, {
								mode: mode ?? defaultModeSlug,
								task: mirror,
							})

							console.log(
								`${customTool.name}.execute(): ${JSON.stringify(customToolArgs)} -> ${JSON.stringify(result)}`,
							)

							pushToolResult(result)
							mirror.consecutiveMistakeCount = 0
						} catch (executionError: any) {
							mirror.consecutiveMistakeCount++
							// Record custom tool error with static name
							mirror.recordToolError("custom_tool", executionError.message)
							await handleError(`executing custom tool "${block.name}"`, executionError)
						}

						break
					}

					// Not a custom tool - handle as unknown tool error
					const errorMessage = `Unknown tool "${block.name}". This tool does not exist. Please use one of the available tools.`
					mirror.consecutiveMistakeCount++
					mirror.recordToolError(block.name as ToolName, errorMessage)
					await mirror.say("error", t("tools:unknownToolError", { toolName: block.name }))
					// Push tool_result directly WITHOUT setting didAlreadyUseTool
					// This prevents the stream from being interrupted with "Response interrupted by tool use result"
					mirror.pushToolResultToUserContent({
						type: "tool_result",
						tool_use_id: sanitizeToolUseId(toolCallId),
						content: formatResponse.toolError(errorMessage),
						is_error: true,
					})
					break
				}
			}

			break
		}
	}

	// Seeing out of bounds is fine, it means that the next too call is being
	// built up and ready to add to assistantMessageContent to present.
	// When you see the UI inactive during this, it means that a tool is
	// breaking without presenting any UI. For example the write_to_file tool
	// was breaking when relpath was undefined, and for invalid relpath it never
	// presented UI.
	// This needs to be placed here, if not then calling
	// mirror.presentAssistantMessage below would fail (sometimes) since it's
	// locked.
	mirror.presentAssistantMessageLocked = false

	// NOTE: When tool is rejected, iterator stream is interrupted and it waits
	// for `userMessageContentReady` to be true. Future calls to present will
	// skip execution since `didRejectTool` and iterate until `contentIndex` is
	// set to message length and it sets userMessageContentReady to true itself
	// (instead of preemptively doing it in iterator).
	if (!block.partial || mirror.didRejectTool || mirror.didAlreadyUseTool) {
		// Block is finished streaming and executing.
		if (mirror.currentStreamingContentIndex === mirror.assistantMessageContent.length - 1) {
			// It's okay that we increment if !didCompleteReadingStream, it'll
			// just return because out of bounds and as streaming continues it
			// will call `presentAssitantMessage` if a new block is ready. If
			// streaming is finished then we set `userMessageContentReady` to
			// true when out of bounds. This gracefully allows the stream to
			// continue on and all potential content blocks be presented.
			// Last block is complete and it is finished executing
			mirror.userMessageContentReady = true // Will allow `pWaitFor` to continue.
		}

		// Call next block if it exists (if not then read stream will call it
		// when it's ready).
		// Need to increment regardless, so when read stream calls this function
		// again it will be streaming the next block.
		mirror.currentStreamingContentIndex++

		if (mirror.currentStreamingContentIndex < mirror.assistantMessageContent.length) {
			// There are already more content blocks to stream, so we'll call
			// this function ourselves.
			presentAssistantMessage(mirror)
			return
		} else {
			// CRITICAL FIX: If we're out of bounds and the stream is complete, set userMessageContentReady
			// This handles the case where assistantMessageContent is empty or becomes empty after processing
			if (mirror.didCompleteReadingStream) {
				mirror.userMessageContentReady = true
			}
		}
	}

	// Block is partial, but the read stream may have finished.
	if (mirror.presentAssistantMessageHasPendingUpdates) {
		presentAssistantMessage(mirror)
	}
}

/**
 * Records a successful file edit in the local-only edit history.
 * Extracts path/diff/content/checkpointId from the tool block and
 * persists it to the task's fileEdits array. This data is NEVER sent
 * to the LLM — it's kept purely for frontend display and revert.
 *
 * Only records non-partial (fully streamed) blocks to avoid recording
 * partial/incomplete edits during streaming.
 */
function recordFileEdit(mirror: Task, block: any) {
	if (block.partial) return

	// Extract path (handles both "path" and "file_path" param keys)
	const path = block.params?.path ?? block.params?.file_path
	if (!path) return

	const diff = block.params?.diff ?? block.params?.patch ?? undefined
	const content = block.params?.content ?? undefined
	const timestamp = Date.now()
	const toolName = block.name as string

	// Get the most recent checkpoint ID from mirrorMessages
	let checkpointId: string | undefined
	for (let i = mirror.mirrorMessages.length - 1; i >= 0; i--) {
		const msg = mirror.mirrorMessages[i]
		if (msg.say === "checkpoint_saved" && msg.text) {
			checkpointId = msg.text
			break
		}
	}

	mirror.mirrorMessagesManager.addFileEdit({
		path,
		diff,
		content,
		timestamp,
		toolName,
		checkpointId,
	})
}

/**
 * save checkpoint and mark done in the current streaming task.
 * @param task The Task instance to checkpoint save and mark.
 * @returns
 */
async function checkpointSaveAndMark(task: Task) {
	if (task.currentStreamingDidCheckpoint) {
		return
	}
	try {
		await checkpointSave(task, true)
		task.currentStreamingDidCheckpoint = true
	} catch (error) {
		console.error(`[Task#presentAssistantMessage] Error saving checkpoint: ${error.message}`, error)
	}
}

/**
 * Batch-execute consecutive read-only tool blocks in parallel.
 *
 * Scans ahead from the current index in `assistantMessageContent`, collects
 * all non-partial read-only blocks, and dispatches them via `Promise.all`.
 * Implements exponential backoff (3 retries, BASE_DELAY=1000ms) for rate
 * limit errors (HTTP 429). Falls back to sequential execution if all retries
 * are exhausted.
 *
 * When the feature flag is disabled, this function is never called and the
 * normal switch/case path handles each block one-at-a-time.
 */
async function executeReadBatch(
	mirror: Task,
	_firstBlock: any,
	_firstToolCallId: string,
	callbacks: {
		pushToolResult: (content: ToolResponse) => void
		handleError: (action: string, error: Error) => Promise<void>
		askApproval: (
			type: MirrorAsk,
			partialMessage?: string,
			progressStatus?: ToolProgressStatus,
			isProtected?: boolean,
		) => Promise<boolean>
	},
) {
	const startIndex = mirror.currentStreamingContentIndex
	const content = mirror.assistantMessageContent

	// Collect consecutive non-partial read-only tool blocks.
	const readBlocks: Array<{ block: any; toolCallId: string }> = []
	for (let i = startIndex; i < content.length; i++) {
		const b = content[i]
		if (b.type !== "tool_use" || b.partial) break
		if (!READ_TOOLS.has(b.name as string)) break
		readBlocks.push({ block: b, toolCallId: (b as any).id as string })
	}

	// Safety: if no blocks were collected (should not happen since this is
	// called only when the current block is a read tool) fall through to
	// sequential single-tool execution via the normal switch/case dispatch.
	if (readBlocks.length === 0) {
		const tool = READ_TOOL_MAP[_firstBlock.name as string]
		if (tool) {
			await tool.handle(mirror, _firstBlock, {
				askApproval: callbacks.askApproval,
				handleError: callbacks.handleError,
				pushToolResult: callbacks.pushToolResult,
			})
		}
		return
	}

	const MAX_RETRIES = 3
	const BASE_DELAY = 1000 // 1 second

	// Helper: create a per-block pushToolResult closure so each parallel
	// execution can report its own result independently.
	const makePushToolResult = (toolCallId: string) => {
		let hasResult = false
		return (content: ToolResponse) => {
			if (hasResult) return
			hasResult = true

			let resultContent: string
			let imageBlocks: Anthropic.ImageBlockParam[] = []

			if (typeof content === "string") {
				resultContent = content || "(tool did not return anything)"
			} else {
				const textBlocks = content.filter((item) => item.type === "text")
				imageBlocks = content.filter((item) => item.type === "image") as Anthropic.ImageBlockParam[]
				resultContent =
					textBlocks.map((item) => (item as Anthropic.TextBlockParam).text).join("\n") ||
					"(tool did not return anything)"
			}

			mirror.pushToolResultToUserContent({
				type: "tool_result",
				tool_use_id: sanitizeToolUseId(toolCallId),
				content: resultContent,
			})

			if (imageBlocks.length > 0) {
				mirror.userMessageContent.push(...imageBlocks)
			}
		}
	}

	// Serialized askApproval lock to ensure interactive approval dialogs run sequentially
	let askLock: Promise<any> = Promise.resolve()
	const serializedAskApproval = (
		type: MirrorAsk,
		partialMessage?: string,
		progressStatus?: ToolProgressStatus,
		isProtected?: boolean,
	): Promise<boolean> => {
		const next = askLock.then(() => callbacks.askApproval(type, partialMessage, progressStatus, isProtected))
		askLock = next.catch(() => {})
		return next
	}

	// Attempt parallel execution with exponential backoff for rate limits.
	const attemptParallel = async (): Promise<void> => {
		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				await Promise.all(
					readBlocks.map(({ block, toolCallId }) => {
						const tool = READ_TOOL_MAP[block.name as string]
						if (!tool) {
							throw new ToolCannonError(`Unknown read tool: "${block.name}"`)
						}
						return tool.handle(mirror, block, {
							askApproval: serializedAskApproval,
							handleError: callbacks.handleError,
							pushToolResult: makePushToolResult(toolCallId),
						})
					}),
				)
				return // success
			} catch (error: any) {
				const isRateLimit =
					String(error).includes("429") ||
					error?.status === 429 ||
					String(error).toLowerCase().includes("rate limit")

				if (isRateLimit && attempt < MAX_RETRIES - 1) {
					const delay = BASE_DELAY * Math.pow(2, attempt)
					console.warn(
						`[presentAssistantMessage] Rate limited on parallel read batch (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`,
					)
					await sleep(delay)
					continue
				}
				throw error
			}
		}
	}

	try {
		await attemptParallel()
	} catch (error) {
		// Fall back to sequential execution for the entire batch.
		console.warn(`[presentAssistantMessage] Parallel read batch failed, falling back to sequential:`, error)
		for (const { block, toolCallId } of readBlocks) {
			const tool = READ_TOOL_MAP[block.name as string]
			if (tool) {
				await tool.handle(mirror, block, {
					askApproval: callbacks.askApproval,
					handleError: callbacks.handleError,
					pushToolResult: makePushToolResult(toolCallId),
				})
			}
		}
	}

	// Advance the streaming index past all processed blocks.
	// The main loop will increment by 1 on top of this, so we set it to
	// `startIndex + blocksProcessed - 1`.
	const blocksProcessed = readBlocks.length
	mirror.currentStreamingContentIndex = startIndex + blocksProcessed - 1

	// Record tool usage for each executed block.
	// Record tool usage for each executed block.
	// Use ToolName cast since we've already validated the block is in READ_TOOLS.
	for (const { block } of readBlocks) {
		mirror.recordToolUsage(block.name as ToolName)
	}
}
