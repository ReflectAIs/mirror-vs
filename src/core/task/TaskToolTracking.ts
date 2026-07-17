import { Anthropic } from "@anthropic-ai/sdk"

import { type ToolName, type TokenUsage, type MirrorMessage, MirrorVSEventName } from "@mirror-vs/types"

import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { Task } from "./Task"

/**
 * Manages tool usage metrics for a Task — tracking tool attempts,
 * failures, token usage, and tool result queuing.
 *
 * Extracted from Task.ts to reduce its size and isolate concerns.
 */
export class TaskToolTracking {
	constructor(private readonly task: Task) {}

	// ──────────────────────────────────────────────────────────────
	//  Metrics
	// ──────────────────────────────────────────────────────────────

	/**
	 * Combines API requests and command sequences in the message list
	 * for cleaner display and accurate token/metrics calculation.
	 *
	 * @param messages - The mirror messages to combine
	 * @returns The combined messages
	 */
	public combineMessages(messages: MirrorMessage[]) {
		return combineApiRequests(combineCommandSequences(messages))
	}

	/**
	 * Calculates the current token usage from the task's mirror messages.
	 * Excludes the first message (system prompt) for accurate token counting.
	 *
	 * @returns The current token usage
	 */
	public getTokenUsage(): TokenUsage {
		return getApiMetrics(this.combineMessages(this.task.mirrorMessages.slice(1)))
	}

	/**
	 * Records a successful tool usage attempt.
	 * Increments the attempt counter for the given tool.
	 *
	 * @param toolName - The name of the tool that was used
	 */
	public recordToolUsage(toolName: ToolName) {
		if (!this.task.toolUsage[toolName]) {
			this.task.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}

		this.task.toolUsage[toolName].attempts++
	}

	/**
	 * Records a tool error/failure.
	 * Increments the failure counter for the given tool and emits an event
	 * if an error message is provided.
	 *
	 * @param toolName - The name of the tool that failed
	 * @param error - Optional error message to emit with the failure event
	 */
	public recordToolError(toolName: ToolName, error?: string) {
		if (!this.task.toolUsage[toolName]) {
			this.task.toolUsage[toolName] = { attempts: 0, failures: 0 }
		}

		this.task.toolUsage[toolName].failures++

		if (error) {
			this.task.emit(MirrorVSEventName.TaskToolFailed, this.task.taskId, toolName, error)
		}
	}

	/**
	 * Push a tool_result block to userMessageContent, preventing duplicates.
	 * Duplicate tool_use_ids cause API errors.
	 *
	 * @param toolResult - The tool_result block to add
	 * @returns true if added, false if duplicate was skipped
	 */
	public pushToolResultToUserContent(toolResult: Anthropic.ToolResultBlockParam): boolean {
		const existingResult = this.task.userMessageContent.find(
			(block): block is Anthropic.ToolResultBlockParam =>
				block.type === "tool_result" && block.tool_use_id === toolResult.tool_use_id,
		)
		if (existingResult) {
			console.warn(
				`[TaskToolTracking#pushToolResultToUserContent] Skipping duplicate tool_result for tool_use_id: ${toolResult.tool_use_id}`,
			)
			return false
		}
		this.task.userMessageContent.push(toolResult)
		return true
	}
}
