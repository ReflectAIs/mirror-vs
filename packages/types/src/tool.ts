import { z } from "zod"

/**
 * ToolGroup
 */

export const toolGroups = ["read", "edit", "command", "mcp", "modes", "browser"] as const

export const toolGroupsSchema = z.enum(toolGroups)

/**
 * Tool groups that have been removed but may still exist in user config files.
 * Used by schema preprocessing to silently strip these before validation,
 * preventing errors for users with older configs.
 */
export const deprecatedToolGroups: readonly string[] = ["deprecated-group"]

export type ToolGroup = z.infer<typeof toolGroupsSchema>

/**
 * ToolName
 */

export const toolNames = [
	"execute_command",
	"read_file",
	"read_command_output",
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"search_files",
	"list_files",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"codebase_search",
	"update_todo_list",
	"run_slash_command",
	"skill",
	"generate_image",
	"web_search",
	"custom_tool",
	"browser_navigate",
	"browser_click",
	"browser_type",
	"browser_screenshot",
	"browser_scroll",
	"browser_select",
	"browser_evaluate_script",
	"render_preview",
	// Research / specialized search tools
	"github_search",
	"docs_search",
	"package_search",
	"read_url",
	"ssh_session",
	"sleep",
	// On-demand context retrieval tools (cost optimization - reduces inline context size)
	"get_workspace_file_tree",
	"get_workspace_pulse",
	"get_git_status",
	"search_mcp_tools",
	"activate_mcp_tool",
	// Session shared context (intersession context sharing)
	"read_session_context",
] as const

export const toolNamesSchema = z.enum(toolNames)

export type ToolName = z.infer<typeof toolNamesSchema>

/**
 * ToolUsage
 */

export const toolUsageSchema = z.record(
	toolNamesSchema,
	z.object({
		attempts: z.number(),
		failures: z.number(),
	}),
)

export type ToolUsage = z.infer<typeof toolUsageSchema>
