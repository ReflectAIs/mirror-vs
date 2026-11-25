/**
 * List of directories that are typically large and should be ignored
 * when showing recursive file listings or scanning for code indexing.
 * This list is shared between list-files.ts and the codebase indexing scanner
 * to ensure consistent behavior across the application.
 */
export const DIRS_TO_IGNORE = [
	"node_modules",
	"__pycache__",
	"env",
	"venv",
	"target/dependency",
	"build/dependencies",
	"dist",
	"out",
	"bundle",
	"vendor",
	"tmp",
	"temp",
	"deps",
	"pkg",
	"Pods",
	".git",
	".*",
]

/**
 * Common project/configuration dot-directories that should NOT be blindly ignored
 * by codebase indexing, file watchers, or file listings even though they start with a dot.
 */
export const ALLOWED_DOT_DIRECTORIES = [
	".github",
	".vscode",
	".husky",
	".changeset",
	".storybook",
	".devcontainer",
	".gitlab",
	".circleci",
	".cargo",
	".config",
]
