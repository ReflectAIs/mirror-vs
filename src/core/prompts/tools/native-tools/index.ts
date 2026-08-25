import type OpenAI from "openai"
import accessMcpResource from "./access_mcp_resource"
import { apply_diff } from "./apply_diff"
import applyPatch from "./apply_patch"
import askFollowupQuestion from "./ask_followup_question"
import attemptCompletion from "./attempt_completion"
import browserClick from "./browser_click"
import browserEvaluateScript from "./browser_evaluate_script"
import browserNavigate from "./browser_navigate"
import browserScreenshot from "./browser_screenshot"
import browserScroll from "./browser_scroll"
import browserSelect from "./browser_select"
import browserType from "./browser_type"
import codebaseSearch from "./codebase_search"
import docsSearch from "./docs_search"
import editTool from "./edit"
import executeCommand from "./execute_command"
import { createGenerateImageTool } from "./generate_image"
import githubSearch from "./github_search"
import listFiles from "./list_files"
import newTask from "./new_task"
import packageSearch from "./package_search"
import readCommandOutput from "./read_command_output"
import { createReadFileTool, type ReadFileToolOptions } from "./read_file"
import readUrl from "./read_url"
import renderPreview from "./render_preview"
import runSlashCommand from "./run_slash_command"
import sshSession from "./ssh_session"
import sleep from "./sleep"
import skill from "./skill"
import searchReplace from "./search_replace"
import edit_file from "./edit_file"
import searchFiles from "./search_files"
import switchMode from "./switch_mode"
import updateTodoList from "./update_todo_list"
import webSearch from "./web_search"
import writeToFile from "./write_to_file"
import getWorkspaceFileTree from "./get_workspace_file_tree"
import getWorkspacePulse from "./get_workspace_pulse"
import getGitStatus from "./get_git_status"
import readSessionContext from "./read_session_context"
import searchMcpTools from "./searchMcpTools"
import activateMcpTool from "./activateMcpTool"

export { getMcpServerTools } from "./mcp_server"
export { convertOpenAIToolToAnthropic, convertOpenAIToolsToAnthropic } from "./converters"
export type { ReadFileToolOptions } from "./read_file"

/**
 * Options for customizing the native tools array.
 */
export interface NativeToolsOptions {
	/** Whether the model supports image processing (default: false) */
	supportsImages?: boolean
	/** Names of all available pipeline slugs (built-in + user-imported) for dynamic tool description */
	pipelineNames?: string[]
}

/**
 * Get native tools array, optionally customizing based on settings.
 *
 * @param options - Configuration options for the tools
 * @returns Array of native tool definitions
 */
export function getNativeTools(options: NativeToolsOptions = {}): OpenAI.Chat.ChatCompletionTool[] {
	const { supportsImages = false, pipelineNames } = options

	const readFileOptions: ReadFileToolOptions = {
		supportsImages,
	}

	return [
		accessMcpResource,
		apply_diff,
		applyPatch,
		askFollowupQuestion,
		attemptCompletion,
		browserClick,
		browserEvaluateScript,
		browserNavigate,
		browserScreenshot,
		browserScroll,
		browserSelect,
		browserType,
		codebaseSearch,
		docsSearch,
		executeCommand,
		createGenerateImageTool({ pipelineNames }),
		githubSearch,
		listFiles,
		newTask,
		packageSearch,
		readCommandOutput,
		createReadFileTool(readFileOptions),
		readUrl,
		renderPreview,
		sshSession,
		sleep,
		runSlashCommand,
		skill,
		searchReplace,
		edit_file,
		editTool,
		searchFiles,
		switchMode,
		updateTodoList,
		webSearch,
		writeToFile,
		getWorkspaceFileTree,
		getWorkspacePulse,
		getGitStatus,
		searchMcpTools,
		activateMcpTool,
		readSessionContext,
	] satisfies OpenAI.Chat.ChatCompletionTool[]
}

// Backward compatibility: export default tools with line ranges enabled
export const nativeTools = getNativeTools()
