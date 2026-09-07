import * as path from "path"
import { promises as fs } from "fs"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export interface SandboxStatus {
	changedFiles: string[]
	diffStat: string
	hasChanges: boolean
}

/**
 * Manages isolated Git worktrees for safe, sandboxed task execution.
 *
 * Each sandboxed task runs inside an isolated working tree at:
 * `.mirror-vs/worktrees/<task-id>` on branch `mirror-sandbox/<task-id>`.
 *
 * The user's active editor files and unstaged working tree are kept completely isolated.
 */
export class WorktreeSandboxManager {
	/**
	 * Checks if the given directory is inside a Git repository.
	 */
	static async isGitRepository(dirPath: string): Promise<boolean> {
		try {
			const { stdout } = await execAsync("git rev-parse --is-inside-work-tree", { cwd: dirPath })
			return stdout.trim() === "true"
		} catch {
			return false
		}
	}

	/**
	 * Ensures that `.mirror-vs/worktrees` is listed in `.git/info/exclude`
	 * so worktree directories never appear in git status.
	 */
	static async ensureGitExclude(workspacePath: string): Promise<void> {
		try {
			const excludePath = path.join(workspacePath, ".git", "info", "exclude")
			let content = ""
			try {
				content = await fs.readFile(excludePath, "utf8")
			} catch {
				// file might not exist yet; ensure directory exists
				await fs.mkdir(path.dirname(excludePath), { recursive: true })
			}

			const patterns = [".mirror-vs", ".mirror-vs/worktrees"]
			let updated = content
			for (const pattern of patterns) {
				if (!updated.includes(pattern)) {
					const separator = updated.endsWith("\n") || updated.length === 0 ? "" : "\n"
					updated = `${updated}${separator}${pattern}\n`
				}
			}
			if (updated !== content) {
				await fs.writeFile(excludePath, updated, "utf8")
			}
		} catch {
			// Best-effort: ignore if .git directory is read-only or complex submodule
		}
	}

	/**
	 * Returns the path to the sandbox directory for a given task.
	 */
	static getSandboxPath(workspacePath: string, taskId: string): string {
		return path.join(workspacePath, ".mirror-vs", "worktrees", taskId)
	}

	/**
	 * Returns the branch name used for a sandboxed task.
	 */
	static getBranchName(taskId: string): string {
		// Clean task ID so it forms a valid git branch name
		const sanitizedId = taskId.replace(/[^a-zA-Z0-9_-]/g, "_")
		return `mirror-sandbox/${sanitizedId}`
	}

	/**
	 * Creates an isolated git worktree for a task.
	 *
	 * Returns the absolute path of the created sandbox, or null if the workspace
	 * is not a git repository.
	 */
	static async createSandbox(workspacePath: string, taskId: string): Promise<string | null> {
		const isGit = await this.isGitRepository(workspacePath)
		if (!isGit) {
			return null
		}

		const sandboxPath = this.getSandboxPath(workspacePath, taskId)
		const branchName = this.getBranchName(taskId)

		await this.ensureGitExclude(workspacePath)
		await fs.mkdir(path.dirname(sandboxPath), { recursive: true })

		// Clean up any stale worktree or branch for this task ID first
		await this.cleanupSandbox(workspacePath, taskId).catch(() => {})

		// Create the worktree on a new branch from HEAD
		try {
			await execAsync(`git worktree add -b "${branchName}" "${sandboxPath}" HEAD`, { cwd: workspacePath })
			return sandboxPath
		} catch (err: any) {
			console.error(`[WorktreeSandboxManager] Failed to create worktree: ${err?.message || err}`)
			return null
		}
	}

	/**
	 * Gets the current git status and diff statistics of the sandbox.
	 */
	static async getSandboxStatus(sandboxPath: string): Promise<SandboxStatus> {
		try {
			const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: sandboxPath })
			const lines = statusOut
				.split(/\r?\n/)
				.map((l) => l.trimEnd())
				.filter(Boolean)

			const changedFiles = lines.map((l) => l.replace(/^[ MADRCU?!]{1,2}\s+/, "").trim()).filter(Boolean)

			let diffStat = ""
			try {
				const { stdout: diffOut } = await execAsync("git diff --stat HEAD", { cwd: sandboxPath })
				diffStat = diffOut.trim()
			} catch {
				// diff might be empty
			}

			return {
				changedFiles,
				diffStat,
				hasChanges: changedFiles.length > 0,
			}
		} catch {
			return {
				changedFiles: [],
				diffStat: "",
				hasChanges: false,
			}
		}
	}

	/**
	 * Applies or merges changes from the sandbox back into the primary workspace.
	 */
	static async applySandboxToWorkspace(
		workspacePath: string,
		taskId: string,
	): Promise<{ success: boolean; message: string }> {
		const sandboxPath = this.getSandboxPath(workspacePath, taskId)
		const branchName = this.getBranchName(taskId)

		try {
			// In the sandbox, commit any remaining unstaged changes
			const status = await this.getSandboxStatus(sandboxPath)
			if (status.hasChanges) {
				await execAsync("git add -A", { cwd: sandboxPath })
				await execAsync('git commit -m "mirror-vs: sandboxed task changes"', { cwd: sandboxPath })
			}

			// In workspace, merge the branch
			const { stdout } = await execAsync(
				`git merge --no-ff "${branchName}" -m "Merge mirror-vs sandbox for task ${taskId}"`,
				{
					cwd: workspacePath,
				},
			)

			// Cleanup the worktree after successful merge
			await this.cleanupSandbox(workspacePath, taskId)

			return {
				success: true,
				message: `Successfully merged sandbox changes into workspace:\n${stdout}`,
			}
		} catch (err: any) {
			return {
				success: false,
				message: `Failed to merge sandbox changes: ${err?.message || err}`,
			}
		}
	}

	/**
	 * Removes the isolated git worktree and deletes its ephemeral branch.
	 */
	static async cleanupSandbox(workspacePath: string, taskId: string): Promise<void> {
		const sandboxPath = this.getSandboxPath(workspacePath, taskId)
		const branchName = this.getBranchName(taskId)

		try {
			// Force removal of worktree
			await execAsync(`git worktree remove --force "${sandboxPath}"`, { cwd: workspacePath }).catch(() => {})
			// Delete ephemeral branch
			await execAsync(`git branch -D "${branchName}"`, { cwd: workspacePath }).catch(() => {})
			// Remove directory if empty or remaining
			await fs.rm(sandboxPath, { recursive: true, force: true }).catch(() => {})
		} catch (err: any) {
			console.warn(`[WorktreeSandboxManager] Cleanup error for ${taskId}:`, err?.message || err)
		}
	}
}
