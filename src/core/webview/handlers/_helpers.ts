import type { GlobalState, MirrorMessage, Command as SlashCommand } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import type { ApiMessage } from "../../task-persistence/apiMessages"
import { resolveImageMentions } from "../../mentions/resolveImageMentions"
import { defaultModeSlug } from "../../../shared/modes"

/**
 * Reads a global state value from the provider's ContextProxy.
 */
export function getGlobalState<K extends keyof GlobalState>(provider: MirrorProvider, key: K) {
	return provider.contextProxy.getValue(key)
}

/**
 * Writes a global state value via the provider's ContextProxy.
 */
export async function updateGlobalState<K extends keyof GlobalState>(
	provider: MirrorProvider,
	key: K,
	value: GlobalState[K],
) {
	await provider.contextProxy.setValue(key, value)
}

/**
 * Returns the current working directory, preferring the active task's cwd.
 */
export function getCurrentCwd(provider: MirrorProvider): string {
	return provider.getCurrentTask()?.cwd || provider.cwd
}

/**
 * Resolves the current mode slug from the active task or global state.
 */
export async function getCurrentMode(provider: MirrorProvider): Promise<string> {
	const currentTask = provider.getCurrentTask()

	if (currentTask) {
		try {
			return await currentTask.getTaskMode()
		} catch (error) {
			provider.log(
				`Error resolving current task mode for command discovery: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
		}
	}

	try {
		const state = await provider.getState()
		if (typeof state.mode === "string" && state.mode.length > 0) {
			return state.mode
		}
	} catch (error) {
		provider.log(
			`Error resolving global mode for command discovery: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}

	return defaultModeSlug
}

/**
 * Discovers available slash commands by merging file-based commands with skill-backed commands.
 */
export async function getDiscoveredCommands(provider: MirrorProvider): Promise<SlashCommand[]> {
	const { getCommands } = await import("../../../services/command/commands")
	const commands = await getCommands(getCurrentCwd(provider))

	const commandList: SlashCommand[] = commands.map((command) => ({
		name: command.name,
		source: command.source,
		filePath: command.filePath,
		description: command.description,
		argumentHint: command.argumentHint,
	}))

	const existingCommandNames = new Set(commandList.map((command) => command.name))
	const skillsManager = provider.getSkillsManager()

	if (!skillsManager) {
		return commandList
	}

	const currentMode = await getCurrentMode(provider)
	const availableSkills = skillsManager.getSkillsForMode(currentMode)

	for (const skill of availableSkills) {
		if (existingCommandNames.has(skill.name)) {
			continue
		}

		existingCommandNames.add(skill.name)
		commandList.push({
			name: skill.name,
			source: skill.source,
			filePath: skill.path,
			description: skill.description,
		})
	}

	return commandList
}

/**
 * Resolves image file mentions in incoming messages.
 * Matches read_file behavior: respects size limits and model capabilities.
 */
export async function resolveIncomingImages(provider: MirrorProvider, payload: { text?: string; images?: string[] }) {
	const text = payload.text ?? ""
	const images = payload.images
	const currentTask = provider.getCurrentTask()
	const state = await provider.getState()
	const resolved = await resolveImageMentions({
		text,
		images,
		cwd: getCurrentCwd(provider),
		mirrorIgnoreController: currentTask?.mirrorIgnoreController,
		maxImageFileSize: state.maxImageFileSize,
		maxTotalImageSize: state.maxTotalImageSize,
	})
	return resolved
}

/**
 * Shared utility to find message indices based on timestamp.
 * When multiple messages share the same timestamp (e.g., after condense),
 * this function prefers non-summary messages to ensure user operations
 * target the intended message rather than the summary.
 */
export function findMessageIndices(messageTs: number, currentMirror: any) {
	// Find the exact message by timestamp, not the first one after a cutoff
	const messageIndex = currentMirror.mirrorMessages.findIndex((msg: MirrorMessage) => msg.ts === messageTs)

	// Find all matching API messages by timestamp
	const allApiMatches = currentMirror.apiConversationHistory
		.map((msg: ApiMessage, idx: number) => ({ msg, idx }))
		.filter(({ msg }: { msg: ApiMessage }) => msg.ts === messageTs)

	// Prefer non-summary message if multiple matches exist (handles timestamp collision after condense)
	const preferred = allApiMatches.find(({ msg }: { msg: ApiMessage }) => !msg.isSummary) || allApiMatches[0]
	const apiConversationHistoryIndex = preferred?.idx ?? -1

	return { messageIndex, apiConversationHistoryIndex }
}

/**
 * Fallback: find first API history index at or after a timestamp.
 * Used when the exact user message isn't present in apiConversationHistory (e.g., after condense).
 */
export function findFirstApiIndexAtOrAfter(ts: number, currentMirror: any) {
	if (typeof ts !== "number") return -1
	return currentMirror.apiConversationHistory.findIndex(
		(msg: ApiMessage) => typeof msg?.ts === "number" && (msg.ts as number) >= ts,
	)
}
