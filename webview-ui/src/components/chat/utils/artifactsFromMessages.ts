import type { MirrorMessage, MirrorSayTool } from "@mirror-vs/types"
import { safeJsonParse } from "@shared/core"

/**
 * A single artifact — a markdown file the model created (plan, walkthrough, implementation doc, etc.).
 */
export interface ArtifactEntry {
	/** Unique id for this artifact (based on timestamp + path). */
	id: string
	/** Display title (filename or descriptive label). */
	title: string
	/** File path of the markdown artifact. */
	path: string
	/** The markdown content. */
	body: string
	/** Timestamp of the originating message. */
	ts: number
}

/**
 * Extract markdown artifacts from the session's messages.
 *
 * "Artifacts" are **markdown files the model creates** to propose plans,
 * write walkthroughs, document implementation details, etc.
 *
 * This looks for:
 * - `newFileCreated` tool results where the path ends in `.md`
 * - `editedExistingFile` tool results where the path ends in `.md`
 * - `appliedDiff` tool results where the path ends in `.md`
 */
export function artifactsFromMessages(messages: MirrorMessage[] | undefined): ArtifactEntry[] {
	if (!messages?.length) return []

	const entries: ArtifactEntry[] = []
	const seenPaths = new Set<string>()

	for (const msg of messages) {
		if (msg.partial) continue

		// Tool payload can be in say "tool" or ask "tool"
		const isSayTool = msg.type === "say" && msg.say === "tool"
		const isAskTool = msg.type === "ask" && msg.ask === "tool"
		if ((!isSayTool && !isAskTool) || !msg.text) continue
		// Only include ask "tool" file edits that were approved
		if (isAskTool && msg.isAnswered === false) continue

		const tool = safeJsonParse<MirrorSayTool>(msg.text)
		if (!tool) continue

		const FILE_EDIT_TOOLS = new Set(["editedExistingFile", "appliedDiff", "newFileCreated"])
		if (!FILE_EDIT_TOOLS.has(tool.tool as string)) continue

		// Batch diffs
		if (tool.batchDiffs && Array.isArray(tool.batchDiffs)) {
			for (const file of tool.batchDiffs) {
				if (!file.path || !file.path.endsWith(".md")) continue
				const dedupKey = `${msg.ts}-${file.path}`
				if (seenPaths.has(dedupKey)) continue
				seenPaths.add(dedupKey)

				const content = file.content ?? file.diffs?.map((d) => d.content).join("\n") ?? ""
				if (!content) continue

				const toolLabel = tool.tool === "newFileCreated" ? "Created" : "Edited"
				entries.push({
					id: dedupKey,
					title: `${toolLabel}: ${file.path}`,
					path: file.path,
					body: content,
					ts: msg.ts,
				})
			}
			continue
		}

		// Single file — only markdown
		if (!tool.path || !tool.path.endsWith(".md")) continue

		const dedupKey = `${msg.ts}-${tool.path}`
		if (seenPaths.has(dedupKey)) continue
		seenPaths.add(dedupKey)

		const diff = tool.diff ?? tool.content ?? ""
		if (!diff) continue

		const toolLabel = tool.tool === "newFileCreated" ? "Created" : "Edited"
		entries.push({
			id: dedupKey,
			title: `${toolLabel}: ${tool.path}`,
			path: tool.path,
			body: diff,
			ts: msg.ts,
		})
	}

	return entries
}
