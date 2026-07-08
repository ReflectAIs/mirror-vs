/**
 * Worktree Handlers
 *
 * VSCode-specific handlers that bridge webview messages to the core worktree services.
 * These handlers handle VSCode-specific logic like opening folders and managing state.
 */

import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"

import type {
	WorktreeResult,
	BranchInfo,
	WorktreeIncludeStatus,
	WorktreeListResponse,
	WorktreeDefaultsResponse,
	CreateWorktreeOptions,
} from "@mirror-vs/types"
import { worktreeService, worktreeIncludeService, type CopyProgressCallback } from "@mirror-vs/core"

import type { MirrorProvider } from "../MirrorProvider"

/**
 * Generate a random alphanumeric suffix for branch/folder names.
 */
function generateRandomSuffix(length = 5): string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	let result = ""

	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}

	return result
}

async function isWorkspaceSubfolder(cwd: string): Promise<boolean> {
	const gitRoot = await worktreeService.getGitMirrortPath(cwd)

	if (!gitRoot) {
		return false
	}

	// Normalize paths for comparison.
	const normalizedCwd = path.normalize(cwd)
	const normalizedGitRoot = path.normalize(gitRoot)

	// If cwd is deeper than git root, it's a subfolder.
	return normalizedCwd !== normalizedGitRoot && normalizedCwd.startsWith(normalizedGitRoot)
}

export async function handleListWorktrees(provider: MirrorProvider): Promise<WorktreeListResponse> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	const isMultiRoot = workspaceFolders ? workspaceFolders.length > 1 : false

	if (!workspaceFolders || workspaceFolders.length === 0) {
		return {
			worktrees: [],
			isGitRepo: false,
			isMultiRoot: false,
			isSubfolder: false,
			gitRootPath: "",
			error: "No workspace folder open",
		}
	}

	// Multi-root workspaces not supported for worktrees.
	if (isMultiRoot) {
		return {
			worktrees: [],
			isGitRepo: false,
			isMultiRoot: true,
			isSubfolder: false,
			gitRootPath: "",
			error: "Worktrees are not supported in multi-root workspaces",
		}
	}

	const cwd = provider.cwd
	const isGitRepo = await worktreeService.checkGitRepo(cwd)

	if (!isGitRepo) {
		return {
			worktrees: [],
			isGitRepo: false,
			isMultiRoot: false,
			isSubfolder: false,
			gitRootPath: "",
			error: "Not a git repository",
		}
	}

	const isSubfolder = await isWorkspaceSubfolder(cwd)
	const gitRootPath = (await worktreeService.getGitMirrortPath(cwd)) || ""

	if (isSubfolder) {
		return {
			worktrees: [],
			isGitRepo: true,
			isMultiRoot: false,
			isSubfolder: true,
			gitRootPath,
			error: "Worktrees are not supported when workspace is a subfolder of a git repository",
		}
	}

	try {
		const worktrees = await worktreeService.listWorktrees(cwd)

		return {
			worktrees,
			isGitRepo: true,
			isMultiRoot: false,
			isSubfolder: false,
			gitRootPath,
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)

		return {
			worktrees: [],
			isGitRepo: true,
			isMultiRoot: false,
			isSubfolder: false,
			gitRootPath,
			error: `Failed to list worktrees: ${errorMessage}`,
		}
	}
}

export async function handleCreateWorktree(
	provider: MirrorProvider,
	options: CreateWorktreeOptions,
	progressCallback?: CopyProgressCallback,
): Promise<WorktreeResult> {
	const cwd = provider.cwd

	const result = await worktreeService.createWorktree(cwd, options)

	return result
}

export async function handleDeleteWorktree(provider: MirrorProvider, branch: string, force = false): Promise<WorktreeResult> {
	const cwd = provider.cwd
	const result = await worktreeService.deleteWorktree(cwd, branch, force)

	return result
}

export async function handleSwitchWorktree(
	provider: MirrorProvider,
	branch: string,
	forceReload: boolean = false,
): Promise<WorktreeResult> {
	const cwd = provider.cwd
	const worktrees = await worktreeService.listWorktrees(cwd)
	const target = worktrees.find((w) => w.branch === branch)

	if (!target) {
		return { success: false, message: `Worktree for branch '${branch}' not found` }
	}

	await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(target.path), { forceNewWindow: false })

	return { success: true, message: `Switched to worktree at ${target.path}` }
}

export async function handleGetAvailableBranches(provider: MirrorProvider): Promise<BranchInfo> {
	const cwd = provider.cwd
	const branches = await worktreeService.getAvailableBranches(cwd)

	return branches
}

export async function handleGetWorktreeDefaults(provider: MirrorProvider): Promise<WorktreeDefaultsResponse> {
	const cwd = provider.cwd
	const suggestedBranch = `feature/${generateRandomSuffix()}`
	const gitRoot = await worktreeService.getGitMirrortPath(cwd)

	if (!gitRoot) {
		return {
			suggestedBranch,
			suggestedPath: "",
			error: "Could not determine git root path",
		}
	}

	const suggestedPath = path.join(path.dirname(gitRoot), suggestedBranch)

	return { suggestedBranch, suggestedPath }
}

export async function handleGetWorktreeIncludeStatus(provider: MirrorProvider): Promise<WorktreeIncludeStatus> {
	const cwd = provider.cwd
	const status = await worktreeIncludeService.getStatus(cwd)

	return status
}

export async function handleCheckBranchWorktreeInclude(
	provider: MirrorProvider,
	branchName: string,
): Promise<boolean> {
	const cwd = provider.cwd
	const result = await worktreeIncludeService.branchHasWorktreeInclude(cwd, branchName)

	return result
}

export async function handleCreateWorktreeInclude(
	provider: MirrorProvider,
	content: string,
): Promise<WorktreeResult> {
	const cwd = provider.cwd

	try {
		await worktreeIncludeService.createWorktreeInclude(cwd, content)
		return { success: true, message: "Worktree include file created" }
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		return { success: false, message: `Failed to create worktree include: ${errorMessage}` }
	}
}

export async function handleCheckoutBranch(provider: MirrorProvider, branch: string): Promise<WorktreeResult> {
	const cwd = provider.cwd

	try {
		await worktreeService.checkoutBranch(cwd, branch)
		return { success: true, message: `Checked out branch '${branch}'` }
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		return { success: false, message: `Failed to checkout branch '${branch}': ${errorMessage}` }
	}
}
