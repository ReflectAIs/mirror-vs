import stringify from "safe-stable-stringify"
import { ToolUse } from "../../shared/tools"
import { t } from "../../i18n"

const POLLING_AND_WAIT_COMMANDS = new Set([
	"sleep",
	"echo",
	"printf",
	"cat",
	"ps",
	"wait",
	"true",
	"false",
	"clear",
	"test",
	"[",
	"tail",
	"head",
	"grep",
	"which",
	"where",
	"pwd",
	"date",
	"read_command_output",
])

/**
 * Class for detecting consecutive identical tool calls
 * to prevent the AI from getting stuck in a loop.
 */
export class ToolRepetitionDetector {
	private previousToolCallJson: string | null = null
	private consecutiveIdenticalToolCallCount: number = 0
	private readonly consecutiveIdenticalToolCallLimit: number

	/**
	 * Creates a new ToolRepetitionDetector
	 * @param limit The maximum number of identical consecutive tool calls allowed
	 */
	constructor(limit: number = 3) {
		this.consecutiveIdenticalToolCallLimit = limit
	}

	private previousBaseCommand: string | null = null
	private consecutiveBaseCommandCount: number = 0

	/**
	 * Checks if the current tool call is identical to the previous one
	 * and determines if execution should be allowed
	 *
	 * @param currentToolCallBlock ToolUse object representing the current tool call
	 * @returns Object indicating if execution is allowed and a message to show if not
	 */
	public check(currentToolCallBlock: ToolUse): {
		allowExecution: boolean
		askUser?: {
			messageKey: string
			messageDetail: string
		}
	} {
		// Serialize the block to a canonical JSON string for comparison
		const currentToolCallJson = this.serializeToolUse(currentToolCallBlock)

		// Compare with previous tool call
		if (this.previousToolCallJson === currentToolCallJson) {
			this.consecutiveIdenticalToolCallCount++
		} else {
			this.consecutiveIdenticalToolCallCount = 0 // Reset to 0 for a new tool
			this.previousToolCallJson = currentToolCallJson
		}

		let isPollingOrWaitCommand = false

		// Also check repeated CLI command execution (e.g., repeating firebase/npm/docker commands)
		if (currentToolCallBlock.name === "execute_command") {
			const rawCommand =
				(currentToolCallBlock.params as any)?.command || (currentToolCallBlock.nativeArgs as any)?.command || ""
			const baseCommand = typeof rawCommand === "string" ? rawCommand.trim().split(/\s+/)[0]?.toLowerCase() : ""

			isPollingOrWaitCommand = baseCommand ? POLLING_AND_WAIT_COMMANDS.has(baseCommand) : false

			// Ignore benign polling, waiting, or status output utilities
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

		// Check if limit is reached (0 means unlimited)
		// For polling/wait commands (e.g. sleep 2, echo waiting), use a higher limit (20) to avoid false-positive stuck detection
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

			// Reset counters to allow recovery if user guides the AI past this point
			this.consecutiveIdenticalToolCallCount = 0
			this.previousToolCallJson = null
			this.consecutiveBaseCommandCount = 0
			this.previousBaseCommand = null

			const loopDetail = reachedCliLoopLimit
				? `Repeated CLI execution loop detected for '${stuckCommand}'. If the command requires non-interactive flags (e.g., '--non-interactive' for Firebase), browser authentication, or is stuck waiting for input, please guide the model or provide the required input.`
				: t("tools:toolRepetitionLimitReached", { toolName: currentToolCallBlock.name })

			// Return result indicating execution should not be allowed
			return {
				allowExecution: false,
				askUser: {
					messageKey: "mistake_limit_reached",
					messageDetail: loopDetail,
				},
			}
		}

		// Execution is allowed
		return { allowExecution: true }
	}

	/**
	 * Serializes a ToolUse object into a canonical JSON string for comparison
	 *
	 * @param toolUse The ToolUse object to serialize
	 * @returns JSON string representation of the tool use with sorted parameter keys
	 */
	private serializeToolUse(toolUse: ToolUse): string {
		const toolObject: Record<string, any> = {
			name: toolUse.name,
			params: toolUse.params,
		}

		// Only include nativeArgs if it has content
		if (toolUse.nativeArgs && Object.keys(toolUse.nativeArgs).length > 0) {
			toolObject.nativeArgs = toolUse.nativeArgs
		}

		return stringify(toolObject)
	}
}
