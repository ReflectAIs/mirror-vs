import { describe, it, expect } from "vitest"
import { batchConsecutive } from "@src/utils/batchConsecutive"
import type { MirrorMessage } from "@mirror-vs/types"

describe("Batch Operations - Search and Edit Grouping", () => {
	const editFileTools = new Set([
		"editedExistingFile",
		"appliedDiff",
		"newFileCreated",
		"insertContent",
		"searchAndReplace",
		"search_and_replace",
		"search_replace",
		"edit",
		"edit_file",
		"apply_patch",
		"apply_diff",
	])

	const isEditFileAsk = (msg: MirrorMessage): boolean => {
		if (msg.type !== "ask" || msg.ask !== "tool") return false
		try {
			const tool = JSON.parse(msg.text || "{}")
			return editFileTools.has(tool.tool) && !tool.batchDiffs
		} catch {
			return false
		}
	}

	const searchTools = new Set(["codebaseSearch", "searchFiles", "codebase_search", "search_files"])

	const isSearchAsk = (msg: MirrorMessage): boolean => {
		if (msg.type !== "ask" || msg.ask !== "tool") return false
		try {
			const tool = JSON.parse(msg.text || "{}")
			return searchTools.has(tool.tool) && !tool.batchSearches
		} catch {
			return false
		}
	}

	const synthesizeEditFileBatch = (batch: MirrorMessage[]): MirrorMessage => {
		const batchDiffs = batch.map((batchMsg, idx) => {
			try {
				const tool = JSON.parse(batchMsg.text || "{}")
				return {
					path: tool.path || "",
					changeCount: 1,
					key: `${tool.path || ""}-${idx}`,
					content: tool.content || tool.diff || "",
					diffStats: tool.diffStats,
				}
			} catch {
				return { path: "", changeCount: 0, key: `${idx}`, content: "" }
			}
		})

		let firstTool
		try {
			firstTool = JSON.parse(batch[0].text || "{}")
		} catch {
			return batch[0]
		}
		const allAnswered = batch.every((m) => m.isAnswered)
		return {
			...batch[batch.length - 1],
			ts: batch[0].ts,
			isAnswered: allAnswered,
			text: JSON.stringify({ ...firstTool, tool: "editedExistingFile", batchDiffs }),
		}
	}

	const synthesizeSearchBatch = (batch: MirrorMessage[]): MirrorMessage => {
		const batchSearches = batch.map((batchMsg, idx) => {
			try {
				const tool = JSON.parse(batchMsg.text || "{}")
				return {
					tool: tool.tool || "codebaseSearch",
					query: tool.query || tool.regex || "",
					regex: tool.regex || tool.query || "",
					path: tool.path || "",
					filePattern: tool.filePattern || "",
					isOutsideWorkspace: tool.isOutsideWorkspace || false,
					content: tool.content || "",
					key: `${tool.tool}-${tool.query || tool.regex || ""}-${tool.path || ""}-${idx}`,
				}
			} catch {
				return {
					tool: "codebaseSearch",
					query: "",
					regex: "",
					path: "",
					filePattern: "",
					isOutsideWorkspace: false,
					content: "",
					key: `search-${idx}`,
				}
			}
		})

		let firstTool
		try {
			firstTool = JSON.parse(batch[0].text || "{}")
		} catch {
			return batch[0]
		}
		const allAnswered = batch.every((m) => m.isAnswered)
		return {
			...batch[batch.length - 1],
			ts: batch[0].ts,
			isAnswered: allAnswered,
			text: JSON.stringify({ ...firstTool, batchSearches }),
		}
	}

	const createToolAsk = (
		toolPayload: Record<string, unknown>,
		ts = Date.now(),
		isAnswered = false,
	): MirrorMessage => ({
		type: "ask",
		ask: "tool",
		ts,
		partial: false,
		isAnswered,
		text: JSON.stringify(toolPayload),
	})

	it("groups consecutive search tool requests into a single batch message", () => {
		const messages: MirrorMessage[] = [
			createToolAsk({ tool: "codebaseSearch", query: "renderBatchSearch" }, 100),
			createToolAsk({ tool: "searchFiles", path: "src", regex: "BatchSearchDisplay" }, 200),
			createToolAsk({ tool: "codebaseSearch", query: "batchConsecutive" }, 300),
		]

		const result = batchConsecutive(messages, isSearchAsk, synthesizeSearchBatch)

		expect(result).toHaveLength(1)
		const parsed = JSON.parse(result[0].text || "{}")
		expect(parsed.batchSearches).toHaveLength(3)
		expect(parsed.batchSearches[0].query).toBe("renderBatchSearch")
		expect(parsed.batchSearches[1].regex).toBe("BatchSearchDisplay")
		expect(parsed.batchSearches[2].query).toBe("batchConsecutive")
		expect(result[0].ts).toBe(100)
	})

	it("does not group a single search operation", () => {
		const messages: MirrorMessage[] = [createToolAsk({ tool: "codebaseSearch", query: "singleQuery" }, 100)]

		const result = batchConsecutive(messages, isSearchAsk, synthesizeSearchBatch)

		expect(result).toHaveLength(1)
		const parsed = JSON.parse(result[0].text || "{}")
		expect(parsed.batchSearches).toBeUndefined()
		expect(parsed.query).toBe("singleQuery")
	})

	it("groups consecutive edits of different edit tool aliases", () => {
		const messages: MirrorMessage[] = [
			createToolAsk({ tool: "appliedDiff", path: "src/a.ts", diff: "-1\n+2" }, 100, true),
			createToolAsk({ tool: "newFileCreated", path: "src/b.ts", content: "new file" }, 200, true),
			createToolAsk({ tool: "searchAndReplace", path: "src/c.ts", diff: "-3\n+4" }, 300, false),
		]

		const result = batchConsecutive(messages, isEditFileAsk, synthesizeEditFileBatch)

		expect(result).toHaveLength(1)
		const parsed = JSON.parse(result[0].text || "{}")
		expect(parsed.batchDiffs).toHaveLength(3)
		expect(parsed.batchDiffs[0].path).toBe("src/a.ts")
		expect(parsed.batchDiffs[1].path).toBe("src/b.ts")
		expect(parsed.batchDiffs[2].path).toBe("src/c.ts")
		// isAnswered is false because 3rd edit was false
		expect(result[0].isAnswered).toBe(false)
		expect(result[0].ts).toBe(100)
	})

	it("sets isAnswered true when all edits in the batch are answered", () => {
		const messages: MirrorMessage[] = [
			createToolAsk({ tool: "appliedDiff", path: "src/a.ts", diff: "-1\n+2" }, 100, true),
			createToolAsk({ tool: "apply_patch", path: "src/b.ts", diff: "-3\n+4" }, 200, true),
		]

		const result = batchConsecutive(messages, isEditFileAsk, synthesizeEditFileBatch)

		expect(result).toHaveLength(1)
		expect(result[0].isAnswered).toBe(true)
	})

	it("keeps non-consecutive search and edit operations separate", () => {
		const messages: MirrorMessage[] = [
			createToolAsk({ tool: "codebaseSearch", query: "query1" }, 100),
			createToolAsk({ tool: "appliedDiff", path: "src/a.ts" }, 200),
			createToolAsk({ tool: "codebaseSearch", query: "query2" }, 300),
		]

		let result = batchConsecutive(messages, isEditFileAsk, synthesizeEditFileBatch)
		result = batchConsecutive(result, isSearchAsk, synthesizeSearchBatch)

		expect(result).toHaveLength(3)
	})
})
