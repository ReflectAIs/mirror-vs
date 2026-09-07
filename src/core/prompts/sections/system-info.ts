import os from "os"
import osName from "os-name"

import { getShell } from "../../../utils/shell"

export function getSystemInfoSection(
	cwd: string,
	workspacePath?: string,
	sandboxPath?: string,
	sandboxBranch?: string,
): string {
	// Try to get detailed OS name, fall back to basic info if it fails
	let osInfo: string
	try {
		osInfo = osName()
	} catch (error) {
		// Fallback when os-name fails (e.g., PowerShell not available on Windows)
		const platform = os.platform()
		const release = os.release()
		osInfo = `${platform} ${release}`
	}

	let details = `====

SYSTEM INFORMATION

Operating System: ${osInfo}
Default Shell: ${getShell()}
Home Directory: ${os.homedir().toPosix()}`

	if (sandboxPath && workspacePath && sandboxPath !== workspacePath) {
		details += `
Main Repository (Primary Working Tree): ${workspacePath.toPosix()}
Current Sandbox Working Directory (Temporary Worktree): ${sandboxPath.toPosix()}
Sandbox Ephemeral Git Branch: ${sandboxBranch || "ephemeral sandbox branch"}

🛡️ ISOLATED GIT WORKTREE SANDBOX ACTIVE:
- You are operating inside an isolated temporary Git worktree (${sandboxPath.toPosix()}) on branch '${sandboxBranch}'.
- The user's MAIN REPOSITORY is at '${workspacePath.toPosix()}'.
- Do NOT output boilerplate notices about the isolated sandbox environment.
- All file reading, editing, building, linting, and testing MUST take place in your current sandbox working directory (${sandboxPath.toPosix()}).
- Merging to Main Repository:
  * If you are confident everything is tested, correct, and ready, you can merge your changes into the main repository using execute_command:
    git -C "${workspacePath.toPosix()}" merge --no-ff "${sandboxBranch}" -m "Merge sandboxed changes"
  * If you want user confirmation before merging, simply ask the user in your message whether they want you to merge the sandbox changes into their main repository.
  * When attempt_completion is approved by the user, any unmerged sandbox changes will also be automatically merged into the main repository.
- DO NOT run 'git push' from the temporary worktree branch to remote branches (such as origin/main or origin/master). Only push from the main repository once merged.`
	} else {
		details += `
Current Workspace Directory: ${cwd.toPosix()}

The Current Workspace Directory is the active VS Code project directory, and is therefore the default directory for all tool operations. New terminals will be created in the current workspace directory, however if you change directories in a terminal it will then have a different working directory; changing directories in a terminal does not modify the workspace directory, because you do not have access to change the workspace directory. When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory ('/test/path') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.`
	}

	return details
}
