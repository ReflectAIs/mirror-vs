import type { MirrorSayTool } from "@mirror-vs/types"

export function isWriteToolAction(tool: MirrorSayTool): boolean {
	return ["editedExistingFile", "appliedDiff", "newFileCreated", "generateImage"].includes(tool.tool)
}

export function isReadOnlyToolAction(tool: MirrorSayTool): boolean {
	return [
		"readFile",
		"listFiles",
		"listFilesTopLevel",
		"listFilesRecursive",
		"searchFiles",
		"codebaseSearch",
		"runSlashCommand",
	].includes(tool.tool)
}
