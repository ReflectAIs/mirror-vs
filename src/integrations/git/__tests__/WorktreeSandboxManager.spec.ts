import { describe, it, expect, vi, beforeEach } from "vitest"
import * as path from "path"

vi.mock("child_process", () => ({
	exec: vi.fn((cmd, opts, cb) => {
		if (typeof opts === "function") {
			cb = opts
		}
		if (cmd.includes("rev-parse --is-inside-work-tree")) {
			cb(null, { stdout: "true\n" })
		} else if (cmd.includes("status --porcelain")) {
			cb(null, { stdout: " M src/index.ts\n?? newfile.ts\n" })
		} else if (cmd.includes("diff --stat")) {
			cb(null, { stdout: " 2 files changed, 10 insertions(+)\n" })
		} else {
			cb(null, { stdout: "success\n" })
		}
	}),
}))

vi.mock("fs", () => ({
	promises: {
		readFile: vi.fn().mockResolvedValue(""),
		writeFile: vi.fn().mockResolvedValue(undefined),
		mkdir: vi.fn().mockResolvedValue(undefined),
		rm: vi.fn().mockResolvedValue(undefined),
	},
}))

import { WorktreeSandboxManager } from "../WorktreeSandboxManager"

describe("WorktreeSandboxManager", () => {
	const workspacePath = "/mock/workspace"
	const taskId = "task-abc-123"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("identifies git repository correctly", async () => {
		const isGit = await WorktreeSandboxManager.isGitRepository(workspacePath)
		expect(isGit).toBe(true)
	})

	it("computes sandbox path and branch name accurately", () => {
		const expectedPath = path.join(workspacePath, ".mirror-vs", "worktrees", taskId)
		expect(WorktreeSandboxManager.getSandboxPath(workspacePath, taskId)).toBe(expectedPath)
		expect(WorktreeSandboxManager.getBranchName(taskId)).toBe("mirror-sandbox/task-abc-123")
	})

	it("creates a sandbox worktree", async () => {
		const sandbox = await WorktreeSandboxManager.createSandbox(workspacePath, taskId)
		const expectedPath = path.join(workspacePath, ".mirror-vs", "worktrees", taskId)
		expect(sandbox).toBe(expectedPath)
	})

	it("retrieves sandbox status and changed files", async () => {
		const sandboxPath = path.join(workspacePath, ".mirror-vs", "worktrees", taskId)
		const status = await WorktreeSandboxManager.getSandboxStatus(sandboxPath)
		expect(status.hasChanges).toBe(true)
		expect(status.changedFiles).toEqual(["src/index.ts", "newfile.ts"])
		expect(status.diffStat).toContain("2 files changed")
	})

	it("applies sandbox to workspace and cleans up", async () => {
		const result = await WorktreeSandboxManager.applySandboxToWorkspace(workspacePath, taskId)
		expect(result.success).toBe(true)
		expect(result.message).toContain("Successfully merged")
	})

	it("cleans up sandbox without throwing", async () => {
		await expect(WorktreeSandboxManager.cleanupSandbox(workspacePath, taskId)).resolves.not.toThrow()
	})
})
