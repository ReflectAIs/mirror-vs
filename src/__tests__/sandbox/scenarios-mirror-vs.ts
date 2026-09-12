/**
 * Real Mirror-VS Project Scenarios
 *
 * These scenarios use ACTUAL code from the mirror-vs codebase.
 * They test model performance on real production TypeScript/React code,
 * matching the complexity and patterns developers face in large projects.
 *
 * Tags: mirror-vs, real-project, plus standard tags
 */

import type { TestScenario } from "./scenarios"

// ────────────────────────────────────────────────────────────
// Scenario R1: Add maxFiles cap to GetGitStatusTool
// Real file: src/core/tools/GetGitStatusTool.ts
// ────────────────────────────────────────────────────────────

export const mirrorAddParamValidation: TestScenario = {
	name: "mirror_add_param_validation",
	description: "Add input validation to a real Mirror-VS tool class",
	expectedMaxTurns: 3,
	tags: ["basic", "feature", "mirror-vs"],
	files: {
		"src/core/tools/GetGitStatusTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams {
	maxFiles?: number
}

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		try {
			const maxFiles = params.maxFiles ?? 50
			const gitStatus = await getGitStatus(task.cwd, Math.min(maxFiles, 200))

			if (!gitStatus) {
				pushToolResult("No git status available (not a git repository or no changes detected).")
				return
			}

			pushToolResult(gitStatus)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(\`Failed to retrieve git status: \${message}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {
		// No partial handling needed — just let it stream in
	}
}

export const getGitStatusTool = new GetGitStatusTool()
`,
	},
	userPrompt:
		"In src/core/tools/GetGitStatusTool.ts, add validation to the execute method: if `params.maxFiles` is provided but is less than 1, call `pushToolResult` with an error message 'maxFiles must be at least 1' and return early. Keep all existing logic intact.",
}

// ────────────────────────────────────────────────────────────
// Scenario R2: Fix ToolRepetitionDetector edge case
// Real file: src/core/tools/ToolRepetitionDetector.ts
// ────────────────────────────────────────────────────────────

export const mirrorFixRepetitionDetector: TestScenario = {
	name: "mirror_fix_repetition_detector",
	description: "Fix an edge case bug in the real ToolRepetitionDetector class",
	expectedMaxTurns: 4,
	tags: ["bugfix", "mirror-vs"],
	files: {
		"src/core/tools/ToolRepetitionDetector.ts": `import stringify from "safe-stable-stringify"
import { ToolUse } from "../../shared/tools"
import { t } from "../../i18n"

const POLLING_AND_WAIT_COMMANDS = new Set([
	"sleep", "echo", "printf", "cat", "ps", "wait", "true",
	"false", "clear", "test", "[", "tail", "head", "grep",
	"which", "where", "pwd", "date", "read_command_output",
])

export class ToolRepetitionDetector {
	private previousToolCallJson: string | null = null
	private consecutiveIdenticalToolCallCount: number = 0
	private readonly consecutiveIdenticalToolCallLimit: number

	constructor(limit: number = 3) {
		this.consecutiveIdenticalToolCallLimit = limit
	}

	private previousBaseCommand: string | null = null
	private consecutiveBaseCommandCount: number = 0

	public check(currentToolCallBlock: ToolUse): {
		allowExecution: boolean
		askUser?: { messageKey: string; messageDetail: string }
	} {
		const currentToolCallJson = this.serializeToolUse(currentToolCallBlock)

		if (this.previousToolCallJson === currentToolCallJson) {
			this.consecutiveIdenticalToolCallCount++
		} else {
			this.consecutiveIdenticalToolCallCount = 0
			this.previousToolCallJson = currentToolCallJson
		}

		let isPollingOrWaitCommand = false

		if (currentToolCallBlock.name === "execute_command") {
			const rawCommand =
				(currentToolCallBlock.params as any)?.command || (currentToolCallBlock.nativeArgs as any)?.command || ""
			const baseCommand = typeof rawCommand === "string" ? rawCommand.trim().split(/\s+/)[0]?.toLowerCase() : ""

			isPollingOrWaitCommand = baseCommand ? POLLING_AND_WAIT_COMMANDS.has(baseCommand) : false

			if (baseCommand && !isPollingOrWaitCommand) {
				if (baseCommand === this.previousBaseCommand) {
					this.consecutiveBaseCommandCount++
				} else {
					this.consecutiveBaseCommandCount = 0
					this.previousBaseCommand = baseCommand
				}
			} else {
				this.consecutiveBaseCommandCount = 0
				this.previousBaseCommand = null
			}
		} else {
			this.consecutiveBaseCommandCount = 0
			this.previousBaseCommand = null
		}

		const effectiveIdenticalLimit = isPollingOrWaitCommand
			? Math.max(this.consecutiveIdenticalToolCallLimit, 20)
			: this.consecutiveIdenticalToolCallLimit

		const reachedIdenticalLimit =
			effectiveIdenticalLimit > 0 && this.consecutiveIdenticalToolCallCount >= effectiveIdenticalLimit

		const reachedCliLoopLimit =
			this.consecutiveIdenticalToolCallLimit > 0 &&
			this.consecutiveBaseCommandCount >= Math.max(this.consecutiveIdenticalToolCallLimit + 2, 5)

		if (reachedIdenticalLimit || reachedCliLoopLimit) {
			const stuckCommand = this.previousBaseCommand || "command"

			this.consecutiveIdenticalToolCallCount = 0
			this.previousToolCallJson = null
			this.consecutiveBaseCommandCount = 0
			this.previousBaseCommand = null

			const loopDetail = reachedCliLoopLimit
				? \`Repeated CLI execution loop detected for '\${stuckCommand}'.\`
				: t("tools:toolRepetitionLimitReached", { toolName: currentToolCallBlock.name })

			return {
				allowExecution: false,
				askUser: { messageKey: "mistake_limit_reached", messageDetail: loopDetail },
			}
		}

		return { allowExecution: true }
	}

	private serializeToolUse(toolUse: ToolUse): string {
		const toolObject: Record<string, any> = {
			name: toolUse.name,
			params: toolUse.params,
		}

		if (toolUse.nativeArgs && Object.keys(toolUse.nativeArgs).length > 0) {
			toolObject.nativeArgs = toolUse.nativeArgs
		}

		return stringify(toolObject)
	}
}
`,
	},
	userPrompt: `There is a bug in ToolRepetitionDetector: when the \`limit\` constructor argument is 0 (meaning unlimited), the check() method still resets \`consecutiveIdenticalToolCallCount\` to 0 in the else branch when a new (different) tool call arrives. This is correct behavior. But there is also a bug: when \`consecutiveIdenticalToolCallCount\` is incremented, the FIRST increment brings it from 0 to 1 — but the \`reachedIdenticalLimit\` check uses \`>= effectiveIdenticalLimit\`. This means with limit=3, you reach the limit on the 3rd IDENTICAL call (count becomes 2, not 3). Fix: the count should start at 1 on the first identical call, not 0. That means the first time we see a match, we should set it to 1, not increment from 0. Alternatively, change the reset to set it to 1 when a new different tool call is seen (so 0 = no previous, 1 = exactly 1 occurrence). Make the fix and add a comment explaining the counting logic.`,
}

// ────────────────────────────────────────────────────────────
// Scenario R3: Extract getFileIcon into shared utility
// Real files: webview-ui FileOperationItem.tsx
// ────────────────────────────────────────────────────────────

export const mirrorExtractSharedUtil: TestScenario = {
	name: "mirror_extract_shared_util",
	description: "Extract a utility function from a real React component into a shared module",
	expectedMaxTurns: 4,
	tags: ["refactor", "mirror-vs"],
	files: {
		"webview-ui/src/components/chat/FileOperationItem.tsx": `import React, { memo } from "react"
import { Atom, Code2, FileCode, FileText, FileJson } from "lucide-react"
import { vscode } from "@src/utils/vscode"
import { cn } from "@src/lib/utils"

interface FileOperationItemProps {
	verb?: string
	filePath: string
	lineRange?: string
	startLine?: number
	diffStats?: { added: number; removed: number }
	onClick?: () => void
	className?: string
}

export function getFileIcon(filePath: string) {
	const ext = filePath.split(".").pop()?.toLowerCase() || ""
	if (ext === "tsx" || ext === "jsx") {
		return <Atom className="size-3.5 text-cyan-400 shrink-0" />
	}
	if (ext === "ts" || ext === "js") {
		return <Code2 className="size-3.5 text-amber-300/90 shrink-0" />
	}
	if (ext === "json") {
		return <FileJson className="size-3.5 text-amber-400/90 shrink-0" />
	}
	if (ext === "css" || ext === "scss" || ext === "html") {
		return <FileCode className="size-3.5 text-blue-400/90 shrink-0" />
	}
	return <FileText className="size-3.5 text-vscode-descriptionForeground shrink-0" />
}

export const FileOperationItem = memo(
	({ verb = "Analyzed", filePath, diffStats, onClick, className }: FileOperationItemProps) => {
		const ext = filePath.split(".").pop()?.toLowerCase() || ""
		const fileName = filePath.split("/").pop() || filePath

		const handleClick = () => {
			if (onClick) { onClick(); return }
			if (filePath) {
				vscode.postMessage({ type: "openFile", text: filePath })
			}
		}

		return (
			<div
				onClick={handleClick}
				className={cn(
					"flex items-center gap-2 py-0.5 px-1.5 rounded hover:bg-vscode-list-hoverBackground/40 cursor-pointer text-xs group transition-colors select-none min-w-0 max-w-full overflow-hidden",
					className,
				)}
				title={filePath}>
				<span className="text-vscode-descriptionForeground/70 text-[11px] font-normal w-14 shrink-0 truncate">
					{verb}
				</span>
				{getFileIcon(filePath)}
				<span className="font-semibold text-vscode-foreground text-[11.5px] truncate min-w-0 flex-1">
					{fileName}
				</span>
				{diffStats && (diffStats.added > 0 || diffStats.removed > 0) && (
					<span className="text-[10px] font-mono shrink-0 ml-auto flex items-center gap-1.5 font-medium">
						{diffStats.added > 0 && <span className="text-vscode-charts-green">+{diffStats.added}</span>}
						{diffStats.removed > 0 && <span className="text-vscode-charts-red">-{diffStats.removed}</span>}
					</span>
				)}
			</div>
		)
	},
)

FileOperationItem.displayName = "FileOperationItem"
`,
		"webview-ui/src/components/chat/CodebaseSearchResult.tsx": `import React, { memo } from "react"
import { getFileIcon } from "./FileOperationItem"
import { cn } from "@src/lib/utils"

interface CodebaseSearchResultProps {
	filePath: string
	snippet?: string
	className?: string
}

export const CodebaseSearchResult = memo(({ filePath, snippet, className }: CodebaseSearchResultProps) => {
	const fileName = filePath.split("/").pop() || filePath
	return (
		<div className={cn("flex flex-col gap-1 py-1 px-1.5 text-xs min-w-0", className)}>
			<div className="flex items-center gap-1.5">
				{getFileIcon(filePath)}
				<span className="font-medium text-vscode-foreground truncate">{fileName}</span>
				<span className="text-vscode-descriptionForeground/60 truncate text-[11px]">{filePath}</span>
			</div>
			{snippet && <pre className="text-[11px] text-vscode-descriptionForeground whitespace-pre-wrap">{snippet}</pre>}
		</div>
	)
})

CodebaseSearchResult.displayName = "CodebaseSearchResult"
`,
	},
	userPrompt:
		"Refactor the code: move `getFileIcon` out of FileOperationItem.tsx and into a new shared file at `webview-ui/src/components/chat/utils/fileIcons.tsx`. Update both FileOperationItem.tsx and CodebaseSearchResult.tsx to import `getFileIcon` from that new shared location instead. The function signature and implementation must remain identical.",
}

// ────────────────────────────────────────────────────────────
// Scenario R4: Add a new tool following BaseTool pattern
// Real pattern from mirror-vs codebase
// ────────────────────────────────────────────────────────────

export const mirrorAddNewTool: TestScenario = {
	name: "mirror_add_new_tool",
	description: "Add a new GetWorkspaceFileCountTool following the exact BaseTool pattern",
	expectedMaxTurns: 4,
	tags: ["feature", "mirror-vs", "advanced"],
	files: {
		"src/core/tools/BaseTool.ts": `import type { ToolName } from "@mirror-vs/types"
import { Task } from "../task/Task"
import type { ToolUse, HandleError, PushToolResult, AskApproval, NativeToolArgs } from "../../shared/tools"

export interface ToolCallbacks {
	askApproval: AskApproval
	handleError: HandleError
	pushToolResult: PushToolResult
	toolCallId?: string
}

type ToolParams<TName extends ToolName> = TName extends keyof NativeToolArgs ? NativeToolArgs[TName] : any

export abstract class BaseTool<TName extends ToolName> {
	abstract readonly name: TName
	protected lastSeenPartialPath: string | undefined = undefined

	abstract execute(params: ToolParams<TName>, task: Task, callbacks: ToolCallbacks): Promise<void>

	async handlePartial(task: Task, block: ToolUse<TName>): Promise<void> {
		// Default: no-op
	}

	protected hasPathStabilized(currentPath: string | undefined): boolean {
		if (currentPath === this.lastSeenPartialPath) return true
		this.lastSeenPartialPath = currentPath
		return false
	}
}
`,
		"src/core/tools/GetGitStatusTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams {
	maxFiles?: number
}

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		try {
			const maxFiles = params.maxFiles ?? 50
			const gitStatus = await getGitStatus(task.cwd, Math.min(maxFiles, 200))
			if (!gitStatus) {
				pushToolResult("No git status available.")
				return
			}
			pushToolResult(gitStatus)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(\`Failed to retrieve git status: \${message}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {}
}

export const getGitStatusTool = new GetGitStatusTool()
`,
		"src/core/tools/GetWorkspacePulseTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { buildWorkspacePulse } from "../environment/workspacePulse"

interface GetWorkspacePulseParams {}

export class GetWorkspacePulseTool extends BaseTool<"get_workspace_pulse"> {
	readonly name = "get_workspace_pulse" as const

	async execute(params: GetWorkspacePulseParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		try {
			const provider = task.providerRef.deref()
			const state = provider ? await provider.getState() : undefined
			const currentMode = state?.mode ?? "code"
			const pulse = await buildWorkspacePulse(task, currentMode)
			pushToolResult(pulse || "No workspace pulse data available.")
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(\`Failed to retrieve workspace pulse: \${message}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_workspace_pulse">): Promise<void> {}
}

export const getWorkspacePulseTool = new GetWorkspacePulseTool()
`,
	},
	userPrompt: `Create a new tool file at \`src/core/tools/GetWorkspaceFileCountTool.ts\` following the EXACT same pattern as GetGitStatusTool.ts and GetWorkspacePulseTool.ts. The tool should:
- Extend BaseTool<"get_workspace_file_count">
- Have a \`readonly name = "get_workspace_file_count" as const\`  
- Accept params: \`{ extensions?: string[] }\` (optional array of file extensions to filter, e.g. [".ts", ".tsx"])
- In execute: use \`require("fs")\` and \`require("path")\` to recursively count files in \`task.cwd\`, skipping node_modules and .git directories
- If \`extensions\` is provided, only count files with matching extensions
- pushToolResult a string like: "File count: 42 (filtered by: .ts, .tsx)" or "File count: 156 (all files)"
- Have a no-op handlePartial override
- Export a singleton \`getWorkspaceFileCountTool\``,
}

// ────────────────────────────────────────────────────────────
// Scenario R5: Add keyboard shortcut to FloatingChatHud
// Real file: webview-ui/src/components/chat/FloatingChatHud.tsx
// ────────────────────────────────────────────────────────────

export const mirrorAddKeyboardShortcut: TestScenario = {
	name: "mirror_add_keyboard_shortcut",
	description: "Add keyboard shortcut handler to a real React memo component",
	expectedMaxTurns: 4,
	tags: ["feature", "mirror-vs"],
	files: {
		"webview-ui/src/components/chat/FloatingChatHud.tsx": `import React, { memo, useEffect, useState } from "react"
import { ChevronDown, History } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MirrorMessage } from "@mirror-vs/types"

interface FloatingChatHudProps {
	show: boolean
	isStreaming?: boolean
	lastMessage?: MirrorMessage
	hasLatestCheckpoint?: boolean
	onScrollToBottom: () => void
	onScrollToCheckpoint?: () => void
}

export const FloatingChatHud = memo(
	({
		show,
		isStreaming = false,
		lastMessage,
		hasLatestCheckpoint = false,
		onScrollToBottom,
		onScrollToCheckpoint,
	}: FloatingChatHudProps) => {
		const [seconds, setSeconds] = useState(1)

		const isReasoning = isStreaming && lastMessage?.say === "reasoning" && !lastMessage?.duration

		useEffect(() => {
			if (!isReasoning) {
				setSeconds(1)
				return
			}
			const timer = setInterval(() => {
				setSeconds((s) => s + 1)
			}, 1000)
			return () => clearInterval(timer)
		}, [isReasoning])

		if (!show) {
			return null
		}

		return (
			<div className="absolute bottom-2 left-0 right-0 flex items-center justify-center pointer-events-none z-20 px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
				<div className="flex items-center gap-1.5 pointer-events-auto shadow-lg shadow-black/20">
					<button
						onClick={onScrollToBottom}
						className={cn(
							"h-6.5 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors duration-150",
							"bg-vscode-editor-background hover:bg-vscode-sideBar-background text-vscode-foreground",
							"border border-vscode-panel-border/80 shadow-sm",
						)}
						title="Jump to latest message">
						{isReasoning ? (
							<>
								<span className="size-1.5 rounded-full bg-vscode-focusBorder animate-pulse shrink-0" />
								<span className="text-vscode-foreground font-medium">Thinking · {seconds}s</span>
							</>
						) : isStreaming ? (
							<>
								<span className="size-1.5 rounded-full bg-vscode-focusBorder animate-pulse shrink-0" />
								<span className="text-vscode-foreground font-medium">Working...</span>
							</>
						) : (
							<span className="text-vscode-descriptionForeground hover:text-vscode-foreground">
								Jump to bottom
							</span>
						)}
						<ChevronDown className="size-3 text-vscode-descriptionForeground shrink-0" />
					</button>

					{hasLatestCheckpoint && onScrollToCheckpoint && (
						<button
							onClick={onScrollToCheckpoint}
							className={cn(
								"h-6.5 px-2 rounded-md flex items-center gap-1 text-xs font-medium cursor-pointer transition-colors duration-150",
								"bg-vscode-editor-background hover:bg-vscode-sideBar-background text-vscode-descriptionForeground hover:text-vscode-foreground",
								"border border-vscode-panel-border/80 shadow-sm",
							)}
							title="Scroll to latest checkpoint">
							<History className="size-3 shrink-0" />
							<span>Checkpoint</span>
						</button>
					)}
				</div>
			</div>
		)
	},
)

FloatingChatHud.displayName = "FloatingChatHud"
export default FloatingChatHud
`,
	},
	userPrompt: `Add a keyboard shortcut to FloatingChatHud.tsx: when the HUD is shown (\`show\` is true), pressing \`Escape\` or \`End\` should call \`onScrollToBottom\`. Add a useEffect that attaches a keydown listener to \`window\` when \`show\` is true, and cleans it up when \`show\` becomes false or the component unmounts. The handler should only fire if the key is "Escape" or "End". Do NOT modify the JSX or other existing logic.`,
}

// ────────────────────────────────────────────────────────────
// Scenario R6: Multi-file — Add JSDoc to BaseTool and subclasses
// Real pattern from the project
// ────────────────────────────────────────────────────────────

export const mirrorAddJsDoc: TestScenario = {
	name: "mirror_add_jsdoc",
	description: "Add JSDoc comments to real BaseTool class and two concrete implementations",
	expectedMaxTurns: 5,
	tags: ["refactor", "mirror-vs"],
	files: {
		"src/core/tools/BaseTool.ts": `import type { ToolName } from "@mirror-vs/types"
import { Task } from "../task/Task"
import type { ToolUse, HandleError, PushToolResult, AskApproval, NativeToolArgs } from "../../shared/tools"

export interface ToolCallbacks {
	askApproval: AskApproval
	handleError: HandleError
	pushToolResult: PushToolResult
	toolCallId?: string
}

type ToolParams<TName extends ToolName> = TName extends keyof NativeToolArgs ? NativeToolArgs[TName] : any

export abstract class BaseTool<TName extends ToolName> {
	abstract readonly name: TName
	protected lastSeenPartialPath: string | undefined = undefined

	abstract execute(params: ToolParams<TName>, task: Task, callbacks: ToolCallbacks): Promise<void>

	async handlePartial(task: Task, block: ToolUse<TName>): Promise<void> {}

	protected hasPathStabilized(currentPath: string | undefined): boolean {
		if (currentPath === this.lastSeenPartialPath) return true
		this.lastSeenPartialPath = currentPath
		return false
	}
}
`,
		"src/core/tools/GetGitStatusTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams {
	maxFiles?: number
}

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		try {
			const maxFiles = params.maxFiles ?? 50
			const gitStatus = await getGitStatus(task.cwd, Math.min(maxFiles, 200))
			if (!gitStatus) {
				pushToolResult("No git status available.")
				return
			}
			pushToolResult(gitStatus)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(\`Failed to retrieve git status: \${message}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {}
}

export const getGitStatusTool = new GetGitStatusTool()
`,
		"src/core/tools/AskFollowupQuestionTool.ts": `import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface Suggestion {
	text: string
	mode?: string
}

interface AskFollowupQuestionParams {
	question: string
	follow_up: Suggestion[]
}

export class AskFollowupQuestionTool extends BaseTool<"ask_followup_question"> {
	readonly name = "ask_followup_question" as const

	async execute(params: AskFollowupQuestionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { question, follow_up } = params
		const { handleError, pushToolResult } = callbacks

		const recordMissingParamError = async (paramName: string): Promise<void> => {
			task.consecutiveMistakeCount++
			task.recordToolError("ask_followup_question")
			task.didToolFailInCurrentTurn = true
			pushToolResult(await task.sayAndCreateMissingParamError("ask_followup_question", paramName))
		}

		try {
			if (!question) {
				await recordMissingParamError("question")
				return
			}
			if (!follow_up || !Array.isArray(follow_up)) {
				await recordMissingParamError("follow_up")
				return
			}

			const follow_up_json = {
				question,
				suggest: follow_up.map((s) => ({ answer: s.text, mode: s.mode })),
			}

			task.consecutiveMistakeCount = 0
			const { text, images } = await task.ask("followup", JSON.stringify(follow_up_json), false)
			await task.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(\`<user_message>\n\${text}\n</user_message>\`, images))
		} catch (error) {
			await handleError("asking question", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"ask_followup_question">): Promise<void> {
		const question: string | undefined = block.nativeArgs?.question ?? block.params.question
		await task.ask("followup", question ?? "", block.partial).catch(() => {})
	}
}

export const askFollowupQuestionTool = new AskFollowupQuestionTool()
`,
	},
	userPrompt: `Add JSDoc comments to all three files:
1. In BaseTool.ts: add a JSDoc block above the class and above each method (execute, handlePartial, hasPathStabilized) explaining what they do.
2. In GetGitStatusTool.ts: add JSDoc above the class and the execute method explaining it retrieves git status and the maxFiles param.
3. In AskFollowupQuestionTool.ts: add JSDoc above the class explaining its purpose, and above execute explaining the question/follow_up params and error handling.
Use proper /** */ JSDoc format. Do NOT change any functional code — only add documentation.`,
}

// ────────────────────────────────────────────────────────────
// Scenario R7: Fix ToolDisclosure controlled/uncontrolled bug
// Real file: webview-ui/src/components/chat/ToolDisclosure.tsx
// ────────────────────────────────────────────────────────────

export const mirrorFixControlledComponent: TestScenario = {
	name: "mirror_fix_controlled_component",
	description: "Fix a React controlled/uncontrolled component inconsistency in a real component",
	expectedMaxTurns: 4,
	tags: ["bugfix", "mirror-vs"],
	files: {
		"webview-ui/src/components/chat/ToolDisclosure.tsx": `import React, { memo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@src/lib/utils"

interface ToolDisclosureProps {
	title: React.ReactNode
	children: React.ReactNode
	defaultExpanded?: boolean
	isExpanded?: boolean
	onToggle?: () => void
	onRowClick?: () => void
	status?: React.ReactNode
	className?: string
	contentClassName?: string
}

export const ToolDisclosure = memo(
	({
		title,
		children,
		defaultExpanded = false,
		isExpanded: controlledExpanded,
		onToggle,
		onRowClick,
		status,
		className,
		contentClassName,
	}: ToolDisclosureProps) => {
		const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
		const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

		const handleToggle = (e?: React.MouseEvent) => {
			e?.stopPropagation()
			if (onToggle) {
				onToggle()
			} else {
				setInternalExpanded((prev) => !prev)
			}
		}

		const handleRowClick = (e: React.MouseEvent) => {
			if (onRowClick) {
				onRowClick()
			} else {
				handleToggle(e)
			}
		}

		// BUG: when switching from uncontrolled to controlled mode (isExpanded prop added later),
		// the internal state is stale. Also: when defaultExpanded changes after mount, it's ignored.

		return (
			<div className={cn("my-1 select-none min-w-0 max-w-full", className)}>
				<div
					onClick={handleRowClick}
					className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-vscode-list-hoverBackground/30 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground cursor-pointer transition-colors group min-w-0 max-w-full overflow-hidden">
					<span
						className="font-normal flex items-center gap-1.5 min-w-0 flex-1 truncate"
						title={typeof title === "string" ? title : undefined}>
						{title}
					</span>
					<button
						type="button"
						onClick={handleToggle}
						className="p-0.5 rounded hover:bg-vscode-toolbar-hoverBackground/60 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors shrink-0 flex items-center justify-center cursor-pointer"
						title={isExpanded ? "Collapse" : "Expand preview"}>
						<ChevronDown
							className={cn(
								"size-3.5 text-vscode-descriptionForeground/70 group-hover:text-vscode-foreground transition-transform duration-150 shrink-0",
								isExpanded ? "rotate-0" : "-rotate-90",
							)}
						/>
					</button>
					{status && <div className="ml-auto text-[11px] shrink-0 font-normal pl-1">{status}</div>}
				</div>
				{isExpanded && (
					<div
						className={cn(
							"pl-2 pt-0.5 pb-1 flex flex-col gap-0.5 min-w-0 max-w-full overflow-hidden",
							contentClassName,
						)}>
						{children}
					</div>
				)}
			</div>
		)
	},
)

ToolDisclosure.displayName = "ToolDisclosure"
`,
	},
	userPrompt: `Fix the controlled/uncontrolled inconsistency in ToolDisclosure.tsx:

**Bug 1:** When the component is used in controlled mode (\`isExpanded\` prop is provided) AND \`onToggle\` is NOT provided, clicking the toggle button calls \`setInternalExpanded\` — but since the component is controlled, this internal state change has no visible effect and the component appears frozen. Fix: in handleToggle, only call \`setInternalExpanded\` if the component is in uncontrolled mode (i.e., \`controlledExpanded === undefined\`).

**Bug 2:** There's currently no way to know from outside whether the component is expanded when in uncontrolled mode. Add an optional \`onExpandedChange?: (expanded: boolean) => void\` prop that gets called whenever the internal expanded state changes (only in uncontrolled mode).

Add \`onExpandedChange\` to the interface and call it appropriately. Do not change the JSX structure or any existing logic beyond the two fixes.`,
}

// ────────────────────────────────────────────────────────────
// Scenario R8: Large real-project multi-file refactor
// Rename a type across real mirror-vs-like files
// ────────────────────────────────────────────────────────────

export const mirrorRenameAcrossFiles: TestScenario = {
	name: "mirror_rename_across_files",
	description: "Rename ToolCallbacks interface to ToolExecutionCallbacks across multiple real-pattern files",
	expectedMaxTurns: 6,
	tags: ["refactor", "advanced", "mirror-vs"],
	files: {
		"src/core/tools/BaseTool.ts": `import type { ToolName } from "@mirror-vs/types"
import { Task } from "../task/Task"
import type { ToolUse, HandleError, PushToolResult, AskApproval, NativeToolArgs } from "../../shared/tools"

export interface ToolCallbacks {
	askApproval: AskApproval
	handleError: HandleError
	pushToolResult: PushToolResult
	toolCallId?: string
}

type ToolParams<TName extends ToolName> = TName extends keyof NativeToolArgs ? NativeToolArgs[TName] : any

export abstract class BaseTool<TName extends ToolName> {
	abstract readonly name: TName
	protected lastSeenPartialPath: string | undefined = undefined

	abstract execute(params: ToolParams<TName>, task: Task, callbacks: ToolCallbacks): Promise<void>

	async handlePartial(task: Task, block: ToolUse<TName>): Promise<void> {}

	protected hasPathStabilized(currentPath: string | undefined): boolean {
		if (currentPath === this.lastSeenPartialPath) return true
		this.lastSeenPartialPath = currentPath
		return false
	}
}
`,
		"src/core/tools/GetGitStatusTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams { maxFiles?: number }

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		try {
			const gitStatus = await getGitStatus(task.cwd, params.maxFiles ?? 50)
			pushToolResult(gitStatus ?? "No git status available.")
		} catch (e) {
			pushToolResult(\`Failed: \${e instanceof Error ? e.message : String(e)}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {}
}
export const getGitStatusTool = new GetGitStatusTool()
`,
		"src/core/tools/GetWorkspacePulseTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { buildWorkspacePulse } from "../environment/workspacePulse"

export class GetWorkspacePulseTool extends BaseTool<"get_workspace_pulse"> {
	readonly name = "get_workspace_pulse" as const

	async execute(params: {}, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		try {
			const provider = task.providerRef.deref()
			const state = provider ? await provider.getState() : undefined
			const pulse = await buildWorkspacePulse(task, state?.mode ?? "code")
			pushToolResult(pulse || "No pulse data.")
		} catch (e) {
			pushToolResult(\`Failed: \${e instanceof Error ? e.message : String(e)}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_workspace_pulse">): Promise<void> {}
}
export const getWorkspacePulseTool = new GetWorkspacePulseTool()
`,
		"src/core/tools/AskFollowupQuestionTool.ts": `import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface AskFollowupQuestionParams {
	question: string
	follow_up: { text: string; mode?: string }[]
}

export class AskFollowupQuestionTool extends BaseTool<"ask_followup_question"> {
	readonly name = "ask_followup_question" as const

	async execute(params: AskFollowupQuestionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks
		try {
			if (!params.question) {
				pushToolResult("Error: question param required")
				return
			}
			const { text, images } = await task.ask("followup", JSON.stringify({
				question: params.question,
				suggest: params.follow_up.map((s) => ({ answer: s.text, mode: s.mode })),
			}), false)
			await task.say("user_feedback", text ?? "", images)
			pushToolResult(formatResponse.toolResult(\`<user_message>\n\${text}\n</user_message>\`, images))
		} catch (error) {
			await handleError("asking question", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"ask_followup_question">): Promise<void> {
		const question = block.nativeArgs?.question ?? block.params.question
		await task.ask("followup", question ?? "", block.partial).catch(() => {})
	}
}
export const askFollowupQuestionTool = new AskFollowupQuestionTool()
`,
	},
	userPrompt:
		"Rename the exported interface `ToolCallbacks` to `ToolExecutionCallbacks` across all 4 files. Update: the interface declaration in BaseTool.ts, all imports of `ToolCallbacks` in the three tool files, and all usages of the type name in method signatures. Do not change any other code.",
}

// ────────────────────────────────────────────────────────────
// Scenario R9: Add retry logic to a real error-prone pattern
// ────────────────────────────────────────────────────────────

export const mirrorAddRetryLogic: TestScenario = {
	name: "mirror_add_retry_logic",
	description: "Add exponential backoff retry to a real-world tool execute pattern",
	expectedMaxTurns: 4,
	tags: ["feature", "advanced", "mirror-vs"],
	files: {
		"src/core/tools/GetGitStatusTool.ts": `import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams {
	maxFiles?: number
	retries?: number
}

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		// No retry logic yet — if getGitStatus throws, we just fail immediately
		try {
			const maxFiles = params.maxFiles ?? 50
			const gitStatus = await getGitStatus(task.cwd, Math.min(maxFiles, 200))
			if (!gitStatus) {
				pushToolResult("No git status available (not a git repository or no changes detected).")
				return
			}
			pushToolResult(gitStatus)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(\`Failed to retrieve git status: \${message}\`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {}
}

export const getGitStatusTool = new GetGitStatusTool()
`,
		"src/utils/retry.ts": `/**
 * Retry utilities — placeholder file, needs implementation
 */

export interface RetryOptions {
	maxAttempts: number
	baseDelayMs: number
	maxDelayMs: number
}
`,
	},
	userPrompt: `Implement retry with exponential backoff:

1. In \`src/utils/retry.ts\`: implement a \`withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>\` function that:
   - Tries calling \`fn()\` up to \`maxAttempts\` times
   - On failure, waits \`baseDelayMs * 2^attempt\` ms before retrying (capped at \`maxDelayMs\`)
   - Throws the last error if all attempts fail
   - Uses \`setTimeout\` wrapped in a Promise for the delay

2. In \`src/core/tools/GetGitStatusTool.ts\`: import \`withRetry\` from \`../../utils/retry\` and use it to wrap the \`getGitStatus\` call. Use the \`params.retries\` value (default 2) as \`maxAttempts\`, with \`baseDelayMs: 200\` and \`maxDelayMs: 2000\`. Keep all existing error handling.`,
}

// ────────────────────────────────────────────────────────────
// All mirror-vs scenarios
// ────────────────────────────────────────────────────────────

export const MIRROR_VS_SCENARIOS: TestScenario[] = [
	mirrorAddParamValidation,
	mirrorFixRepetitionDetector,
	mirrorExtractSharedUtil,
	mirrorAddNewTool,
	mirrorAddKeyboardShortcut,
	mirrorAddJsDoc,
	mirrorFixControlledComponent,
	mirrorRenameAcrossFiles,
	mirrorAddRetryLogic,
]
